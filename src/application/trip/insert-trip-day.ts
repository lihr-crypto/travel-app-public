import type { EntityId, IsoTimestamp, TravelDate } from '@/domain/common/types';
import { shiftTravelLocalDateTime } from '@/domain/item/time';
import type { Item } from '@/domain/item/types';
import { shiftTravelDate } from '@/domain/trip/date-range';
import type { Day } from '@/domain/trip/types';
import type { CommandResult } from '../command-result';
import { itemOutsideTripRangeIssues } from './item-range-issues';
import {
  loadTripDayStructure,
  scheduledItemsOf,
  type TripDayStructureDependencies,
} from './trip-day-structure';

export type InsertTripDayPosition = 'before' | 'after';

export interface InsertTripDayInput {
  tripId: EntityId;
  /** Anchor Day. The new empty Day lands immediately before or after it. */
  dayId: EntityId;
  position: InsertTripDayPosition;
}

export interface InsertTripDayResult {
  day: Day;
  tripEndDate: TravelDate;
}

export type InsertTripDayCommand = (
  input: InsertTripDayInput,
) => Promise<CommandResult<InsertTripDayResult>>;

/**
 * Inserts one empty Day into the Trip spine.
 *
 * A Trip is `startDate ↓ contiguous Day[] ↓ endDate`, so this is not "add a date
 * to a list": every Day at or after the insertion point moves one calendar day
 * later and one index later, the exact Item times inside those Days move with
 * them, and the Trip ends one day later. Nothing is deleted and no Item changes
 * its Day — an Item that was on 3/12 is still on the Day that is now 3/13.
 */
export async function insertTripDay(
  input: InsertTripDayInput,
  dependencies: TripDayStructureDependencies,
): Promise<CommandResult<InsertTripDayResult>> {
  if (input.position !== 'before' && input.position !== 'after') {
    throw new RangeError(`Invalid Trip Day insertion position: ${input.position}`);
  }

  return dependencies.runInTransaction(async (context) => {
    const snapshot = await loadTripDayStructure(input.tripId, context);
    const { trip, days } = snapshot;
    const anchorIndex = days.findIndex(({ id }) => id === input.dayId);

    if (anchorIndex < 0) {
      throw new RangeError(`Day not found in Trip: ${input.dayId}`);
    }

    const insertIndex = input.position === 'before' ? anchorIndex : anchorIndex + 1;
    const timestamp = dependencies.now();
    const shiftedDays: Day[] = days.slice(insertIndex).map((day) => ({
      ...day,
      date: shiftTravelDate(day.date, 1),
      dayIndex: day.dayIndex + 1,
      updatedAt: timestamp,
    }));
    const shiftedItemUpdates = days
      .slice(insertIndex)
      .flatMap((day) => snapshot.itemsByDayId.get(day.id) ?? [])
      .flatMap((item) => shiftItemByOneDay(item, timestamp));
    const newDay: Day = {
      id: dependencies.createId(),
      tripId: trip.id,
      date: shiftTravelDate(days[anchorIndex].date, input.position === 'before' ? 0 : 1),
      dayIndex: insertIndex + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const updatedTrip = {
      ...trip,
      endDate: shiftTravelDate(trip.endDate, 1),
      updatedAt: timestamp,
    };
    const shiftedById = new Map(shiftedItemUpdates.map((item) => [item.id, item]));
    const finalScheduledItems = scheduledItemsOf(snapshot).map(
      (item) => shiftedById.get(item.id) ?? item,
    );

    await context.items.updateMany(shiftedItemUpdates);
    /*
     * The Day rows move first: `updateMany` stages every row onto a temporary
     * date/index before writing the final ones, so the new Day can only take its
     * date after that staging has finished.
     */
    await context.days.updateMany(shiftedDays);
    await context.days.insertMany([newDay]);
    await context.trips.update(updatedTrip);

    return {
      data: { day: newDay, tripEndDate: updatedTrip.endDate },
      affectedEntityIds: [
        trip.id,
        newDay.id,
        ...shiftedDays.map(({ id }) => id),
        ...shiftedItemUpdates.map(({ id }) => id),
      ],
      validationIssues: itemOutsideTripRangeIssues(updatedTrip, [
        ...finalScheduledItems,
        ...snapshot.unscheduledItems,
      ]),
    };
  });
}

function shiftItemByOneDay(item: Item, timestamp: IsoTimestamp): Item[] {
  if (item.timeMode !== 'exact') {
    return [];
  }

  return [
    {
      ...item,
      startDateTime:
        item.startDateTime === null
          ? null
          : shiftTravelLocalDateTime(item.startDateTime, 1),
      endDateTime:
        item.endDateTime === null
          ? null
          : shiftTravelLocalDateTime(item.endDateTime, 1),
      updatedAt: timestamp,
    },
  ];
}
