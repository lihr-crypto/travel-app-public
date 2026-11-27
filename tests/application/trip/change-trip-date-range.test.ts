import { afterEach, expect, test } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';

import {
  changeTripDateRange,
  type ChangeTripDateRangeDependencies,
} from '@/application/trip/change-trip-date-range';
import type { Item } from '@/domain/item/types';
import type { Day, Trip } from '@/domain/trip/types';
import { runMigrations } from '@/infrastructure/database/migrations';
import {
  createDatabaseRuntime,
  type DatabaseBindParams,
  type DatabaseConnection,
  type DatabaseExecutor,
} from '@/infrastructure/database/runtime';
import { SqliteDayRepository } from '@/infrastructure/database/sqlite/day-repository';
import { SqliteItemRepository } from '@/infrastructure/database/sqlite/item-repository';
import { SqliteTripRepository } from '@/infrastructure/database/sqlite/trip-repository';
import { createTripDateRangeTransactionRunner } from '@/infrastructure/database/trip-date-range-transaction';

function nodeParams(params: DatabaseBindParams) {
  return params.map((value) => {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  });
}

class NodeSqliteConnection implements DatabaseConnection {
  readonly database = new DatabaseSync(':memory:');

  async execAsync(source: string) {
    this.database.exec(source);
  }

  async runAsync(source: string, params: DatabaseBindParams = []) {
    const result = this.database.prepare(source).run(...nodeParams(params));
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(
    source: string,
    params: DatabaseBindParams = [],
  ): Promise<T | null> {
    return (
      (this.database.prepare(source).get(...nodeParams(params)) as T | undefined) ??
      null
    );
  }

  async getAllAsync<T>(
    source: string,
    params: DatabaseBindParams = [],
  ): Promise<T[]> {
    return this.database.prepare(source).all(...nodeParams(params)) as T[];
  }

  async withExclusiveTransactionAsync(
    task: (transaction: DatabaseExecutor) => Promise<void>,
  ) {
    this.database.exec('BEGIN EXCLUSIVE;');
    try {
      await task(this);
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

const createdAt = '2026-09-11T12:00:00.000Z';
const changedAt = '2026-09-12T12:00:00.000Z';
const trip: Trip = {
  id: 'trip-1',
  title: 'Trip',
  startDate: '2026-09-19',
  endDate: '2026-09-21',
  mapRegion: 'global',
  note: null,
  createdAt,
  updatedAt: createdAt,
};
const days: Day[] = [
  {
    id: 'day-1',
    tripId: trip.id,
    date: '2026-09-19',
    dayIndex: 1,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: 'day-2',
    tripId: trip.id,
    date: '2026-09-20',
    dayIndex: 2,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: 'day-3',
    tripId: trip.id,
    date: '2026-09-21',
    dayIndex: 3,
    createdAt,
    updatedAt: createdAt,
  },
];

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
let runtime: ReturnType<typeof createDatabaseRuntime>;

afterEach(() => {
  connection?.close();
  connection = undefined;
});

async function setup(seedItems: Item[]) {
  connection = new NodeSqliteConnection();
  runtime = createDatabaseRuntime(async () => connection!, {
    initializeConnection: runMigrations,
  });
  await runtime.runInExclusiveTransaction(async (database) => {
    await new SqliteTripRepository(database).insert(trip);
    await new SqliteDayRepository(database).insertMany(days);
    const repository = new SqliteItemRepository(database);
    for (const value of seedItems) {
      await repository.insert(value);
    }
  });
}

function dependencies(newIds: string[] = []): ChangeTripDateRangeDependencies {
  return {
    createId: () => {
      const id = newIds.shift();
      if (!id) {
        throw new Error('Test ID sequence exhausted');
      }
      return id;
    },
    now: () => changedAt,
    runInTransaction: createTripDateRangeTransactionRunner(
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

test('shiftItems preserves Day IDs and shifts scheduled exact intervals', async () => {
  await setup([
    item('exact', 'day-1', 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-19T23:00',
      endDateTime: '2026-09-20T01:00',
    }),
    item('period', 'day-2', 0, {
      timeMode: 'period',
      period: 'afternoon',
    }),
    item('unscheduled', null, 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-21T09:00',
    }),
  ]);

  const result = await changeTripDateRange(
    {
      tripId: trip.id,
      startDate: '2026-09-20',
      endDate: '2026-09-22',
      strategy: 'shiftItems',
    },
    dependencies(),
  );
  const state = await readState();

  expect(state.days.map(({ id, date, dayIndex }) => ({ id, date, dayIndex }))).toEqual([
    { id: 'day-1', date: '2026-09-20', dayIndex: 1 },
    { id: 'day-2', date: '2026-09-21', dayIndex: 2 },
    { id: 'day-3', date: '2026-09-22', dayIndex: 3 },
  ]);
  expect(state.items.find(({ id }) => id === 'exact')).toMatchObject({
    dayId: 'day-1',
    startDateTime: '2026-09-20T23:00',
    endDateTime: '2026-09-21T01:00',
    updatedAt: changedAt,
  });
  expect(state.items.find(({ id }) => id === 'period')).toMatchObject({
    dayId: 'day-2',
    period: 'afternoon',
    updatedAt: createdAt,
  });
  expect(state.unscheduled[0]).toMatchObject({
    id: 'unscheduled',
    startDateTime: '2026-09-21T09:00',
    updatedAt: createdAt,
  });
  expect(state.trip).toMatchObject({
    startDate: '2026-09-20',
    endDate: '2026-09-22',
    updatedAt: changedAt,
  });
  expect(result.validationIssues).toEqual([]);
});

test('keepCalendarDates reuses overlapping Day IDs and moves removed Items to Unscheduled', async () => {
  await setup([
    item('removed', 'day-1', 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-19T09:00',
    }),
    item('retained', 'day-2', 0),
    item('existing-unscheduled', null, 0),
  ]);

  const result = await changeTripDateRange(
    {
      tripId: trip.id,
      startDate: '2026-09-20',
      endDate: '2026-09-22',
      strategy: 'keepCalendarDates',
    },
    dependencies(['day-4']),
  );
  const state = await readState();

  expect(state.days.map(({ id, date, dayIndex }) => ({ id, date, dayIndex }))).toEqual([
    { id: 'day-2', date: '2026-09-20', dayIndex: 1 },
    { id: 'day-3', date: '2026-09-21', dayIndex: 2 },
    { id: 'day-4', date: '2026-09-22', dayIndex: 3 },
  ]);
  expect(state.items).toEqual([
    expect.objectContaining({ id: 'retained', dayId: 'day-2', sortOrder: 0 }),
  ]);
  expect(state.unscheduled).toEqual([
    expect.objectContaining({ id: 'existing-unscheduled', sortOrder: 0 }),
    expect.objectContaining({
      id: 'removed',
      dayId: null,
      sortOrder: 1,
      startDateTime: '2026-09-19T09:00',
    }),
  ]);
  expect(result.validationIssues).toEqual([
    expect.objectContaining({
      itemId: 'removed',
      type: 'ITEM_OUTSIDE_TRIP_RANGE',
      severity: 'warning',
    }),
  ]);
});

test('shortening never deletes Items or truncates a retained cross-day interval', async () => {
  await setup([
    item('hotel', 'day-2', 0, {
      type: 'hotel',
      timeMode: 'exact',
      startDateTime: '2026-09-20T19:00',
      endDateTime: '2026-09-22T08:30',
      payload: { kind: 'hotel' },
    }),
    item('removed-day-item', 'day-3', 0),
  ]);

  const result = await changeTripDateRange(
    {
      tripId: trip.id,
      startDate: '2026-09-19',
      endDate: '2026-09-20',
      strategy: 'keepCalendarDates',
    },
    dependencies(),
  );
  const state = await readState();

  expect(state.days.map(({ id }) => id)).toEqual(['day-1', 'day-2']);
  expect([...state.items, ...state.unscheduled]).toHaveLength(2);
  expect(state.items[0]).toMatchObject({
    id: 'hotel',
    dayId: 'day-2',
    startDateTime: '2026-09-20T19:00',
    endDateTime: '2026-09-22T08:30',
  });
  expect(state.unscheduled[0]).toMatchObject({
    id: 'removed-day-item',
    dayId: null,
  });
  expect(result.validationIssues).toEqual([
    expect.objectContaining({
      itemId: 'hotel',
      type: 'ITEM_OUTSIDE_TRIP_RANGE',
    }),
  ]);
});

test('extending creates only new Days and preserves existing Day IDs', async () => {
  await setup([]);

  await changeTripDateRange(
    {
      tripId: trip.id,
      startDate: '2026-09-18',
      endDate: '2026-09-22',
      strategy: 'keepCalendarDates',
    },
    dependencies(['day-new-start', 'day-new-end']),
  );
  const state = await readState();

  expect(state.days.map(({ id, date }) => ({ id, date }))).toEqual([
    { id: 'day-new-start', date: '2026-09-18' },
    { id: 'day-1', date: '2026-09-19' },
    { id: 'day-2', date: '2026-09-20' },
    { id: 'day-3', date: '2026-09-21' },
    { id: 'day-new-end', date: '2026-09-22' },
  ]);
});

test('rejects invalid ranges and non-equal shift lengths without writes', async () => {
  await setup([]);
  let transactionCalls = 0;

  await expect(
    changeTripDateRange(
      {
        tripId: trip.id,
        startDate: '2026-09-22',
        endDate: '2026-09-20',
        strategy: 'keepCalendarDates',
      },
      {
        createId: () => 'unused',
        now: () => changedAt,
        runInTransaction: async () => {
          transactionCalls += 1;
          throw new Error('Persistence should not start');
        },
      },
    ),
  ).rejects.toThrow('Trip endDate must be on or after startDate');
  expect(transactionCalls).toBe(0);

  await expect(
    changeTripDateRange(
      {
        tripId: trip.id,
        startDate: '2026-09-19',
        endDate: '2026-09-22',
        strategy: 'shiftItems',
      },
      dependencies(),
    ),
  ).rejects.toThrow('shiftItems requires an unchanged Trip length');
  expect(await readState()).toMatchObject({ trip, days });
});

test('rolls back Item, Day and Trip changes when the final write fails', async () => {
  await setup([
    item('removed', 'day-1', 0, {
      timeMode: 'exact',
      startDateTime: '2026-09-19T09:00',
    }),
  ]);
  const failingDependencies: ChangeTripDateRangeDependencies = {
    createId: () => 'day-4',
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
    changeTripDateRange(
      {
        tripId: trip.id,
        startDate: '2026-09-20',
        endDate: '2026-09-22',
        strategy: 'keepCalendarDates',
      },
      failingDependencies,
    ),
  ).rejects.toThrow('forced Trip update failure');

  const state = await readState();
  expect(state.trip).toEqual(trip);
  expect(state.days).toEqual(days);
  expect(state.items).toEqual([
    expect.objectContaining({ id: 'removed', dayId: 'day-1' }),
  ]);
  expect(state.unscheduled).toEqual([]);
});
