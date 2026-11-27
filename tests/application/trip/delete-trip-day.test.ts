import { afterEach, expect, test } from '@jest/globals';

import { deleteTripDay } from '@/application/trip/delete-trip-day';
import type { TripDayStructureDependencies } from '@/application/trip/trip-day-structure';
import type { Item } from '@/domain/item/types';
import type { Day, Trip } from '@/domain/trip/types';
import type { DatabaseRuntime } from '@/infrastructure/database/runtime';
import { SqliteDayRepository } from '@/infrastructure/database/sqlite/day-repository';
import { SqliteItemRepository } from '@/infrastructure/database/sqlite/item-repository';
import { SqliteTripRepository } from '@/infrastructure/database/sqlite/trip-repository';
import { createTripDayStructureTransactionRunner } from '@/infrastructure/database/trip-day-structure-transaction';
import {
  createNodeSqliteRuntime,
  NodeSqliteConnection,
} from '../../helpers/node-sqlite';

const createdAt = '2026-09-11T12:00:00.000Z';
const changedAt = '2026-09-12T12:00:00.000Z';
const trip: Trip = {
  id: 'trip-1',
  title: 'Trip',
  startDate: '2026-09-18',
  endDate: '2026-09-22',
  mapRegion: 'global',
  note: null,
  createdAt,
  updatedAt: createdAt,
};
const dayDates = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22'];
const days: Day[] = dayDates.map((date, index) => ({
  id: `day-${index + 1}`,
  tripId: trip.id,
  date,
  dayIndex: index + 1,
  createdAt,
  updatedAt: createdAt,
}));

function item(
  id: string,
  dayId: string | null,
  sortOrder: number,
  overrides: Partial<Item> = {},
): Item {
  return {
    id,
    tripId: trip.id,
    dayId,
    placeId: null,
    type: 'custom',
    title: id,
    sortOrder,
    timeMode: 'none',
    startDateTime: null,
    endDateTime: null,
    period: null,
    isFixed: false,
    note: null,
    payload: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

let connection: NodeSqliteConnection | undefined;
let runtime: DatabaseRuntime;

afterEach(() => {
  connection?.close();
  connection = undefined;
});

async function setup(seedItems: Item[], seedTrip: Trip = trip, seedDays: Day[] = days) {
  connection = new NodeSqliteConnection();
  runtime = createNodeSqliteRuntime(connection);
  await runtime.runInExclusiveTransaction(async (database) => {
    await new SqliteTripRepository(database).insert(seedTrip);
    await new SqliteDayRepository(database).insertMany(seedDays);
    const repository = new SqliteItemRepository(database);
    for (const value of seedItems) {
      await repository.insert(value);
    }
  });
}

function dependencies(): TripDayStructureDependencies {
  return {
    createId: () => 'unused',
    now: () => changedAt,
    runInTransaction: createTripDayStructureTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };
}

async function readState() {
  return runtime.runInReadContext(async (database) => {
    const dayRepository = new SqliteDayRepository(database);
    const itemRepository = new SqliteItemRepository(database);
    const persistedDays = await dayRepository.listByTripId(trip.id);
    const scheduled = await Promise.all(
      persistedDays.map((day) => itemRepository.listByDayId(day.id)),
    );
    return {
      trip: await new SqliteTripRepository(database).getById(trip.id),
      days: persistedDays,
      items: scheduled.flat(),
      unscheduled: await itemRepository.listUnscheduledByTripId(trip.id),
    };
  });
}

test('deleting a middle Day pulls later Days forward and moves its Items to Unscheduled', async () => {
  await setup([
    item('doomed-a', 'day-3', 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-20T09:00',
    }),
    item('doomed-b', 'day-3', 1, { timeMode: 'period', period: 'afternoon' }),
    item('existing-unscheduled', null, 0),
    item('later', 'day-4', 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-21T08:00',
      endDateTime: '2026-09-21T18:00',
    }),
    item('earlier', 'day-2', 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-19T08:00',
    }),
  ]);

  const result = await deleteTripDay(
    { tripId: trip.id, dayId: 'day-3' },
    dependencies(),
  );
  const state = await readState();

  expect(state.days.map(({ id, date, dayIndex }) => ({ id, date, dayIndex }))).toEqual([
    { id: 'day-1', date: '2026-09-18', dayIndex: 1 },
    { id: 'day-2', date: '2026-09-19', dayIndex: 2 },
    { id: 'day-4', date: '2026-09-20', dayIndex: 3 },
    { id: 'day-5', date: '2026-09-21', dayIndex: 4 },
  ]);
  // Nothing is deleted: the removed Day's Items keep their own datetimes and
  // join the end of Unscheduled.
  expect(state.unscheduled.map(({ id, dayId, sortOrder }) => ({ id, dayId, sortOrder })))
    .toEqual([
      { id: 'existing-unscheduled', dayId: null, sortOrder: 0 },
      { id: 'doomed-a', dayId: null, sortOrder: 1 },
      { id: 'doomed-b', dayId: null, sortOrder: 2 },
    ]);
  expect(state.unscheduled[1]).toMatchObject({
    startDateTime: '2026-09-20T09:00',
    updatedAt: changedAt,
  });
  expect(state.items.find(({ id }) => id === 'later')).toMatchObject({
    dayId: 'day-4',
    startDateTime: '2026-09-20T08:00',
    endDateTime: '2026-09-20T18:00',
    updatedAt: changedAt,
  });
  // Days before the deleted one are untouched.
  expect(state.items.find(({ id }) => id === 'earlier')).toMatchObject({
    dayId: 'day-2',
    startDateTime: '2026-09-19T08:00',
    updatedAt: createdAt,
  });
  expect(state.trip).toMatchObject({ endDate: '2026-09-21', updatedAt: changedAt });
  expect(result.data).toEqual({ unscheduledItemCount: 2, tripEndDate: '2026-09-21' });
});

test('deleting the last Day only shortens the trip', async () => {
  await setup([item('last', 'day-5', 0)]);

  const result = await deleteTripDay(
    { tripId: trip.id, dayId: 'day-5' },
    dependencies(),
  );
  const state = await readState();

  expect(state.days.map(({ id, date }) => ({ id, date }))).toEqual([
    { id: 'day-1', date: '2026-09-18' },
    { id: 'day-2', date: '2026-09-19' },
    { id: 'day-3', date: '2026-09-20' },
    { id: 'day-4', date: '2026-09-21' },
  ]);
  expect(state.trip).toMatchObject({ endDate: '2026-09-21' });
  expect(result.data).toEqual({ unscheduledItemCount: 1, tripEndDate: '2026-09-21' });
});

test('deleting an empty Day reports no affected Items', async () => {
  await setup([]);

  const result = await deleteTripDay(
    { tripId: trip.id, dayId: 'day-2' },
    dependencies(),
  );

  expect(result.data).toEqual({ unscheduledItemCount: 0, tripEndDate: '2026-09-21' });
  expect((await readState()).days.map(({ id }) => id)).toEqual([
    'day-1',
    'day-3',
    'day-4',
    'day-5',
  ]);
});

test('refuses to leave a Trip with no Days and rejects an unknown Day', async () => {
  const singleDay: Day[] = [days[0]];
  const singleTrip: Trip = { ...trip, endDate: '2026-09-18' };
  await setup([], singleTrip, singleDay);

  await expect(
    deleteTripDay({ tripId: trip.id, dayId: 'day-1' }, dependencies()),
  ).rejects.toThrow('A Trip must keep at least one Day');
  await expect(
    deleteTripDay({ tripId: trip.id, dayId: 'missing' }, dependencies()),
  ).rejects.toThrow('Day not found in Trip: missing');

  const state = await readState();
  expect(state.days).toEqual(singleDay);
  expect(state.trip).toEqual(singleTrip);
});

test('rolls back Days, Items and the Trip when a write fails midway', async () => {
  await setup([
    item('doomed', 'day-3', 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-20T09:00',
    }),
    item('later', 'day-4', 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-21T08:00',
    }),
  ]);
  const failingDependencies: TripDayStructureDependencies = {
    createId: () => 'unused',
    now: () => changedAt,
    runInTransaction: (task) =>
      runtime.runInExclusiveTransaction(async (database) => {
        const trips = new SqliteTripRepository(database);
        return task({
          days: new SqliteDayRepository(database),
          items: new SqliteItemRepository(database),
          trips: {
            getById: (id) => trips.getById(id),
            update: async () => {
              throw new Error('forced Trip update failure');
            },
          },
        });
      }),
  };

  await expect(
    deleteTripDay({ tripId: trip.id, dayId: 'day-3' }, failingDependencies),
  ).rejects.toThrow('forced Trip update failure');

  const state = await readState();
  expect(state.trip).toEqual(trip);
  expect(state.days).toEqual(days);
  expect(state.items).toEqual([
    expect.objectContaining({ id: 'doomed', dayId: 'day-3', updatedAt: createdAt }),
    expect.objectContaining({ id: 'later', dayId: 'day-4', updatedAt: createdAt }),
  ]);
  expect(state.unscheduled).toEqual([]);
});
