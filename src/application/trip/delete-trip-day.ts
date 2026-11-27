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

export interface DeleteTripDayInput {
  tripId: EntityId;
  dayId: EntityId;
}

export interface DeleteTripDayResult {
  /** Items that left the deleted Day for Unscheduled; never deleted. */
  unscheduledItemCount: number;
  tripEndDate: TravelDate;
}

export type DeleteTripDayCommand = (
  input: DeleteTripDayInput,
) => Promise<CommandResult<DeleteTripDayResult>>;

/**
 * Removes one Day from the Trip spine.
 *
 * A Trip never has a hole in the middle, so this is "drop a day here and pull
 * everything after it forward": the later Days each move one calendar day
 * earlier and one index earlier, and the exact Item times inside them move too.
 * The deleted Day's own Items are *not* deleted — they become Unscheduled.
 */
export async function deleteTripDay(
  input: DeleteTripDayInput,
  dependencies: TripDayStructureDependencies,
): Promise<CommandResult<DeleteTripDayResult>> {
  return dependencies.runInTransaction(async (context) => {
    const snapshot = await loadTripDayStructure(input.tripId, context);
    const { trip, days } = snapshot;
    const targetIndex = days.findIndex(({ id }) => id === input.dayId);

    if (targetIndex < 0) {
      throw new RangeError(`Day not found in Trip: ${input.dayId}`);
    }

    if (days.length <= 1) {
      throw new RangeError('A Trip must keep at least one Day');
    }

    const targetDay = days[targetIndex];
    const timestamp = dependencies.now();
    const orphanedItems = snapshot.itemsByDayId.get(targetDay.id) ?? [];
    const unscheduledUpdates = orphanedItems.map((item, index) => ({
      ...item,
      dayId: null,
      sortOrder: snapshot.unscheduledItems.length + index,
      updatedAt: timestamp,
    }));
    const shiftedDays: Day[] = days.slice(targetIndex + 1).map((day) => ({
      ...day,
      date: shiftTravelDate(day.date, -1),
      dayIndex: day.dayIndex - 1,
      updatedAt: timestamp,
    }));
    const shiftedItemUpdates = days
      .slice(targetIndex + 1)
      .flatMap((day) => snapshot.itemsByDayId.get(day.id) ?? [])
      .flatMap((item) => shiftItemByOneDay(item, timestamp));
    const updatedTrip = {
      ...trip,
      endDate: shiftTravelDate(trip.endDate, -1),
      updatedAt: timestamp,
    };
    const shiftedById = new Map(shiftedItemUpdates.map((item) => [item.id, item]));
    const finalScheduledItems = scheduledItemsOf(snapshot)
      .filter((item) => item.dayId !== targetDay.id)
      .map((item) => shiftedById.get(item.id) ?? item);

    await context.items.updateMany([...unscheduledUpdates, ...shiftedItemUpdates]);
    /*
     * The deleted row must go first: the Day behind it moves onto the freed date
     * and index, and `UNIQUE (trip_id, date)` would reject that while the
     * original row is still there.
     */
    await context.days.deleteMany([targetDay.id]);
    await context.days.updateMany(shiftedDays);
    await context.trips.update(updatedTrip);

    return {
      data: {
        unscheduledItemCount: orphanedItems.length,
        tripEndDate: updatedTrip.endDate,
      },
      affectedEntityIds: [
        trip.id,
        targetDay.id,
        ...shiftedDays.map(({ id }) => id),
        ...unscheduledUpdates.map(({ id }) => id),
        ...shiftedItemUpdates.map(({ id }) => id),
      ],
      validationIssues: itemOutsideTripRangeIssues(updatedTrip, [
        ...finalScheduledItems,
        ...snapshot.unscheduledItems,
        ...unscheduledUpdates,
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
          : shiftTravelLocalDateTime(item.startDateTime, -1),
      endDateTime:
        item.endDateTime === null
          ? null
          : shiftTravelLocalDateTime(item.endDateTime, -1),
      updatedAt: timestamp,
    },
  ];
}
