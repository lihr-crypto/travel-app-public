import type {
  EntityId,
  IsoTimestamp,
  TravelDate,
} from '@/domain/common/types';
import { shiftTravelLocalDateTime } from '@/domain/item/time';
import type { Item } from '@/domain/item/types';
import {
  deriveInclusiveTravelDateRange,
  differenceInTravelDays,
} from '@/domain/trip/date-range';
import type { Day, Trip } from '@/domain/trip/types';
import type { DayRepository } from '@/repositories/day-repository';
import type { ItemRepository } from '@/repositories/item-repository';
import type { TripRepository } from '@/repositories/trip-repository';
import type { CommandResult } from '../command-result';
import { itemOutsideTripRangeIssues } from './item-range-issues';

export type ChangeTripDateRangeStrategy =
  | 'shiftItems'
  | 'keepCalendarDates';

export interface ChangeTripDateRangeInput {
  tripId: EntityId;
  startDate: TravelDate;
  endDate: TravelDate;
  strategy: ChangeTripDateRangeStrategy;
}

export type ChangeTripDateRangeCommand = (
  input: ChangeTripDateRangeInput,
) => Promise<CommandResult<void>>;

export interface ChangeTripDateRangeTransactionContext {
  trips: Pick<TripRepository, 'getById' | 'update'>;
  days: Pick<
    DayRepository,
    'listByTripId' | 'insertMany' | 'updateMany' | 'deleteMany'
  >;
  items: Pick<
    ItemRepository,
    'listByDayId' | 'listUnscheduledByTripId' | 'updateMany'
  >;
}

export type RunChangeTripDateRangeTransaction = <T>(
  task: (context: ChangeTripDateRangeTransactionContext) => Promise<T>,
) => Promise<T>;

export interface ChangeTripDateRangeDependencies {
  createId(): EntityId;
  now(): IsoTimestamp;
  runInTransaction: RunChangeTripDateRangeTransaction;
}

interface ReconciliationPlan {
  daysToDelete: Day[];
  daysToInsert: Day[];
  daysToUpdate: Day[];
  itemsToUpdate: Item[];
  finalItems: Item[];
}

function shiftPlan(
  trip: Trip,
  oldDays: readonly Day[],
  scheduledItems: readonly Item[],
  unscheduledItems: readonly Item[],
  newDates: readonly { date: TravelDate; dayIndex: number }[],
  timestamp: IsoTimestamp,
): ReconciliationPlan {
  if (oldDays.length !== newDates.length) {
    throw new RangeError('shiftItems requires an unchanged Trip length');
  }

  const dayDelta = differenceInTravelDays(trip.startDate, newDates[0].date);
  const daysToUpdate = oldDays.map((day, index) => ({
    ...day,
    date: newDates[index].date,
    dayIndex: newDates[index].dayIndex,
    updatedAt: timestamp,
  }));
  const itemsToUpdate = scheduledItems.flatMap((item) => {
    if (item.timeMode !== 'exact') {
      return [];
    }

    return [
      {
        ...item,
        startDateTime:
          item.startDateTime === null
            ? null
            : shiftTravelLocalDateTime(item.startDateTime, dayDelta),
        endDateTime:
          item.endDateTime === null
            ? null
            : shiftTravelLocalDateTime(item.endDateTime, dayDelta),
        updatedAt: timestamp,
      },
    ];
  });
  const shiftedById = new Map(itemsToUpdate.map((item) => [item.id, item]));

  return {
    daysToDelete: [],
    daysToInsert: [],
    daysToUpdate,
    itemsToUpdate,
    finalItems: [
      ...scheduledItems.map((item) => shiftedById.get(item.id) ?? item),
      ...unscheduledItems,
    ],
  };
}

function keepCalendarDatesPlan(
  oldDays: readonly Day[],
  itemsByDayId: ReadonlyMap<EntityId, readonly Item[]>,
  unscheduledItems: readonly Item[],
  newDates: readonly { date: TravelDate; dayIndex: number }[],
  timestamp: IsoTimestamp,
  createId: () => EntityId,
  tripId: EntityId,
): ReconciliationPlan {
  const oldDayByDate = new Map(oldDays.map((day) => [day.date, day]));
  const newDateSet = new Set(newDates.map(({ date }) => date));
  const daysToDelete = oldDays.filter((day) => !newDateSet.has(day.date));
  const daysToUpdate: Day[] = [];
  const daysToInsert: Day[] = [];

  for (const value of newDates) {
    const existing = oldDayByDate.get(value.date);
    if (existing) {
      if (existing.dayIndex !== value.dayIndex) {
        daysToUpdate.push({
          ...existing,
          dayIndex: value.dayIndex,
          updatedAt: timestamp,
        });
      }
    } else {
      daysToInsert.push({
        id: createId(),
        tripId,
        date: value.date,
        dayIndex: value.dayIndex,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  const removedItems = daysToDelete.flatMap(
    (day) => itemsByDayId.get(day.id) ?? [],
  );
  const itemsToUpdate = removedItems.map((item, index) => ({
    ...item,
    dayId: null,
    sortOrder: unscheduledItems.length + index,
    updatedAt: timestamp,
  }));
  const retainedItems = oldDays
    .filter((day) => newDateSet.has(day.date))
    .flatMap((day) => itemsByDayId.get(day.id) ?? []);

  return {
    daysToDelete,
    daysToInsert,
    daysToUpdate,
    itemsToUpdate,
    finalItems: [...retainedItems, ...unscheduledItems, ...itemsToUpdate],
  };
}

export async function changeTripDateRange(
  input: ChangeTripDateRangeInput,
  dependencies: ChangeTripDateRangeDependencies,
): Promise<CommandResult<void>> {
  const newDates = deriveInclusiveTravelDateRange(
    input.startDate,
    input.endDate,
  );

  if (
    input.strategy !== 'shiftItems' &&
    input.strategy !== 'keepCalendarDates'
  ) {
    throw new RangeError(`Invalid Trip date-range strategy: ${input.strategy}`);
  }

  return dependencies.runInTransaction(async ({ trips, days, items }) => {
    const trip = await trips.getById(input.tripId);

    if (!trip) {
      throw new RangeError(`Trip not found: ${input.tripId}`);
    }

    const oldDays = await days.listByTripId(trip.id);
    const itemsByDayId = new Map<EntityId, Item[]>();
    for (const day of oldDays) {
      itemsByDayId.set(day.id, await items.listByDayId(day.id));
    }
    const scheduledItems = oldDays.flatMap(
      (day) => itemsByDayId.get(day.id) ?? [],
    );
    const unscheduledItems = await items.listUnscheduledByTripId(trip.id);

    if (trip.startDate === input.startDate && trip.endDate === input.endDate) {
      return {
        data: undefined,
        affectedEntityIds: [],
        validationIssues: itemOutsideTripRangeIssues(trip, [
          ...scheduledItems,
          ...unscheduledItems,
        ]),
      };
    }

    const timestamp = dependencies.now();
    const plan =
      input.strategy === 'shiftItems'
        ? shiftPlan(
            trip,
            oldDays,
            scheduledItems,
            unscheduledItems,
            newDates,
            timestamp,
          )
        : keepCalendarDatesPlan(
            oldDays,
            itemsByDayId,
            unscheduledItems,
            newDates,
            timestamp,
            dependencies.createId,
            trip.id,
          );
    const updatedTrip: Trip = {
      ...trip,
      startDate: input.startDate,
      endDate: input.endDate,
      updatedAt: timestamp,
    };

    await items.updateMany(plan.itemsToUpdate);
    await days.deleteMany(plan.daysToDelete.map(({ id }) => id));
    await days.updateMany(plan.daysToUpdate);
    await days.insertMany(plan.daysToInsert);
    await trips.update(updatedTrip);

    return {
      data: undefined,
      affectedEntityIds: [
        trip.id,
        ...plan.daysToDelete.map(({ id }) => id),
        ...plan.daysToUpdate.map(({ id }) => id),
        ...plan.daysToInsert.map(({ id }) => id),
        ...plan.itemsToUpdate.map(({ id }) => id),
      ],
      validationIssues: itemOutsideTripRangeIssues(
        updatedTrip,
        plan.finalItems,
      ),
    };
  });
}
