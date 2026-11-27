import { afterEach, expect, test } from '@jest/globals';

import { insertTripDay } from '@/application/trip/insert-trip-day';
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

async function setup(seedItems: Item[]) {
  connection = new NodeSqliteConnection();
  runtime = createNodeSqliteRuntime(connection);
  await runtime.runInExclusiveTransaction(async (database) => {
    await new SqliteTripRepository(database).insert(trip);
    await new SqliteDayRepository(database).insertMany(days);
    const repository = new SqliteItemRepository(database);
    for (const value of seedItems) {
      await repository.insert(value);
    }
  });
}

function dependencies(newIds: string[] = ['day-new']): TripDayStructureDependencies {
  return {
    createId: () => {
      const id = newIds.shift();
      if (!id) throw new Error('Test ID sequence exhausted');
      return id;
    },
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

test('inserting after a Day moves later Days, their exact Item times and the end date', async () => {
  await setup([
    item('early', 'day-1', 0),
    item('anchor', 'day-3', 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-20T09:00',
    }),
    item('later', 'day-4', 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-21T08:00',
      endDateTime: '2026-09-21T18:00',
    }),
    item('unscheduled', null, 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-18T07:00',
    }),
  ]);

  const result = await insertTripDay(
    { tripId: trip.id, dayId: 'day-3', position: 'after' },
    dependencies(),
  );
  const state = await readState();

  expect(state.days.map(({ id, date, dayIndex }) => ({ id, date, dayIndex }))).toEqual([
    { id: 'day-1', date: '2026-09-18', dayIndex: 1 },
    { id: 'day-2', date: '2026-09-19', dayIndex: 2 },
    { id: 'day-3', date: '2026-09-20', dayIndex: 3 },
    { id: 'day-new', date: '2026-09-21', dayIndex: 4 },
    { id: 'day-4', date: '2026-09-22', dayIndex: 5 },
    { id: 'day-5', date: '2026-09-23', dayIndex: 6 },
  ]);
  // The new Day is empty and the Days before the insertion point do not move.
  expect(state.items.find(({ id }) => id === 'early')).toMatchObject({
    dayId: 'day-1',
    updatedAt: createdAt,
  });
  expect(state.items.find(({ id }) => id === 'anchor')).toMatchObject({
    dayId: 'day-3',
    startDateTime: '2026-09-20T09:00',
    updatedAt: createdAt,
  });
  // The Item stays on its own Day; that Day is what moved.
  expect(state.items.find(({ id }) => id === 'later')).toMatchObject({
    dayId: 'day-4',
    startDateTime: '2026-09-22T08:00',
    endDateTime: '2026-09-22T18:00',
    updatedAt: changedAt,
  });
  expect(state.unscheduled[0]).toMatchObject({
    id: 'unscheduled',
    startDateTime: '2026-09-18T07:00',
    updatedAt: createdAt,
  });
  expect(state.trip).toMatchObject({ endDate: '2026-09-23', updatedAt: changedAt });
  expect(result.data).toEqual({
    day: expect.objectContaining({ id: 'day-new', date: '2026-09-21', dayIndex: 4 }),
    tripEndDate: '2026-09-23',
  });
});

test('inserting before the first Day adds a Day at the start and moves the whole trip', async () => {
  await setup([
    item('first', 'day-1', 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-18T06:00',
    }),
  ]);

  await insertTripDay(
    { tripId: trip.id, dayId: 'day-1', position: 'before' },
    dependencies(),
  );
  const state = await readState();

  expect(state.days.map(({ id, date, dayIndex }) => ({ id, date, dayIndex }))).toEqual([
    { id: 'day-new', date: '2026-09-18', dayIndex: 1 },
    { id: 'day-1', date: '2026-09-19', dayIndex: 2 },
    { id: 'day-2', date: '2026-09-20', dayIndex: 3 },
    { id: 'day-3', date: '2026-09-21', dayIndex: 4 },
    { id: 'day-4', date: '2026-09-22', dayIndex: 5 },
    { id: 'day-5', date: '2026-09-23', dayIndex: 6 },
  ]);
  expect(state.items.find(({ id }) => id === 'first')).toMatchObject({
    dayId: 'day-1',
    startDateTime: '2026-09-19T06:00',
  });
  expect(state.trip).toMatchObject({
    startDate: '2026-09-18',
    endDate: '2026-09-23',
  });
});

test('inserting after the last Day only appends one Day', async () => {
  await setup([]);

  await insertTripDay(
    { tripId: trip.id, dayId: 'day-5', position: 'after' },
    dependencies(),
  );
  const state = await readState();

  expect(state.days.map(({ id, date }) => ({ id, date }))).toEqual([
    { id: 'day-1', date: '2026-09-18' },
    { id: 'day-2', date: '2026-09-19' },
    { id: 'day-3', date: '2026-09-20' },
    { id: 'day-4', date: '2026-09-21' },
    { id: 'day-5', date: '2026-09-22' },
    { id: 'day-new', date: '2026-09-23' },
  ]);
  expect(state.trip).toMatchObject({ endDate: '2026-09-23' });
});

test('rejects an unknown Day and an invalid position without writing', async () => {
  await setup([]);
  let transactionCalls = 0;

  await expect(
    insertTripDay(
      { tripId: trip.id, dayId: 'day-3', position: 'sideways' as 'before' },
      {
        createId: () => 'unused',
        now: () => changedAt,
        runInTransaction: async () => {
          transactionCalls += 1;
          throw new Error('Persistence should not start');
        },
      },
    ),
  ).rejects.toThrow('Invalid Trip Day insertion position: sideways');
  expect(transactionCalls).toBe(0);

  await expect(
    insertTripDay(
      { tripId: trip.id, dayId: 'missing', position: 'after' },
      dependencies(),
    ),
  ).rejects.toThrow('Day not found in Trip: missing');
  expect(await readState()).toMatchObject({ trip, days });
});

test('rolls back the Day spine and Item times when the Trip write fails', async () => {
  await setup([
    item('later', 'day-4', 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-21T08:00',
    }),
  ]);
  const failingDependencies: TripDayStructureDependencies = {
    createId: () => 'day-new',
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
    insertTripDay(
      { tripId: trip.id, dayId: 'day-3', position: 'after' },
      failingDependencies,
    ),
  ).rejects.toThrow('forced Trip update failure');

  const state = await readState();
  expect(state.trip).toEqual(trip);
  expect(state.days).toEqual(days);
  expect(state.items).toEqual([
    expect.objectContaining({
      id: 'later',
      dayId: 'day-4',
      startDateTime: '2026-09-21T08:00',
      updatedAt: createdAt,
    }),
  ]);
});
