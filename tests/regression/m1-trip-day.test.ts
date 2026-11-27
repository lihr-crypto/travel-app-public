import { afterEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  getTripDays,
  getTrips,
} from '@/application/queries/trip-queries';
import {
  createTrip,
  type CreateTripDependencies,
  type CreateTripInput,
} from '@/application/trip/create-trip';
import { deriveTripLifecycle } from '@/domain/trip/lifecycle';
import { runMigrations } from '@/infrastructure/database/migrations';
import {
  createDatabaseRuntime,
  type DatabaseBindParams,
  type DatabaseConnection,
  type DatabaseExecutor,
} from '@/infrastructure/database/runtime';
import { createTripQuerySource } from '@/infrastructure/database/trip-query-source';
import { createTripDayTransactionRunner } from '@/infrastructure/database/trip-day-transaction';
import { SqliteDayRepository } from '@/infrastructure/database/sqlite/day-repository';
import { SqliteTripRepository } from '@/infrastructure/database/sqlite/trip-repository';

function nodeParams(params: DatabaseBindParams) {
  return params.map((value) => {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  });
}

class NodeSqliteConnection implements DatabaseConnection {
  readonly database: DatabaseSync;
  private closed = false;

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath);
  }

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
    if (!this.closed) {
      this.database.close();
      this.closed = true;
    }
  }
}

const timestamp = '2026-09-11T12:00:00.000Z';
const connections: NodeSqliteConnection[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const connection of connections.splice(0)) {
    connection.close();
  }

  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'travel-app-m1-'));
  temporaryDirectories.push(directory);
  return join(directory, 'travel-app.db');
}

function idSequence(ids: string[]) {
  return () => {
    const id = ids.shift();

    if (!id) {
      throw new Error('Test ID sequence exhausted');
    }

    return id;
  };
}

function openHarness(databasePath: string, ids: string[]) {
  const connection = new NodeSqliteConnection(databasePath);
  connections.push(connection);
  const runtime = createDatabaseRuntime(async () => connection, {
    initializeConnection: runMigrations,
  });
  const source = createTripQuerySource(runtime.runInReadContext);
  const dependencies: CreateTripDependencies = {
    createId: idSequence(ids),
    now: () => timestamp,
    runInTransaction: createTripDayTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };

  return {
    connection,
    create: (input: CreateTripInput) => createTrip(input, dependencies),
    runtime,
    source,
  };
}

test('creates one-day and multi-day Trips with inclusive persisted Days', async () => {
  const harness = openHarness(createDatabasePath(), [
    'trip-one',
    'day-one',
    'trip-multi',
    'day-multi-1',
    'day-multi-2',
    'day-multi-3',
  ]);

  const oneDay = await harness.create({
    title: 'One day',
    startDate: '2026-09-19',
    endDate: '2026-09-19',
    mapRegion: 'china_mainland',
  });
  const multiDay = await harness.create({
    title: 'Three days',
    startDate: '2026-12-31',
    endDate: '2027-01-02',
    mapRegion: 'global',
  });

  expect(await getTrips(harness.source)).toEqual([multiDay.data, oneDay.data]);
  expect(await getTripDays(harness.source, oneDay.data.id)).toEqual([
    expect.objectContaining({
      id: 'day-one',
      date: '2026-09-19',
      dayIndex: 1,
    }),
  ]);
  expect(await getTripDays(harness.source, multiDay.data.id)).toEqual([
    expect.objectContaining({
      id: 'day-multi-1',
      date: '2026-12-31',
      dayIndex: 1,
    }),
    expect.objectContaining({
      id: 'day-multi-2',
      date: '2027-01-01',
      dayIndex: 2,
    }),
    expect.objectContaining({
      id: 'day-multi-3',
      date: '2027-01-02',
      dayIndex: 3,
    }),
  ]);
});

test('rejects an invalid date range without making a Trip queryable', async () => {
  const harness = openHarness(createDatabasePath(), ['unused']);

  await expect(
    harness.create({
      title: 'Invalid range',
      startDate: '2026-09-21',
      endDate: '2026-09-19',
      mapRegion: 'global',
    }),
  ).rejects.toThrow('Trip endDate must be on or after startDate');

  expect(await getTrips(harness.source)).toEqual([]);
});

test('rolls back the Trip and partial Days when Day insertion fails', async () => {
  const harness = openHarness(createDatabasePath(), []);
  const dependencies: CreateTripDependencies = {
    createId: idSequence(['trip-rollback', 'day-rollback-1', 'day-rollback-2']),
    now: () => timestamp,
    runInTransaction: (task) =>
      harness.runtime.runInExclusiveTransaction(async (database) => {
        const days = new SqliteDayRepository(database);

        return task({
          trips: new SqliteTripRepository(database),
          days: {
            insertMany: async (derivedDays) => {
              await days.insertMany(derivedDays.slice(0, 1));
              throw new Error('forced Day failure');
            },
          },
        });
      }),
  };

  await expect(
    createTrip(
      {
        title: 'Rollback',
        startDate: '2026-09-19',
        endDate: '2026-09-20',
        mapRegion: 'china_mainland',
      },
      dependencies,
    ),
  ).rejects.toThrow('forced Day failure');

  expect(await getTrips(harness.source)).toEqual([]);
  expect(await getTripDays(harness.source, 'trip-rollback')).toEqual([]);
});

test('reopening the database preserves the same Trip and Day IDs', async () => {
  const databasePath = createDatabasePath();
  const firstLaunch = openHarness(databasePath, [
    'trip-reopen',
    'day-reopen-1',
    'day-reopen-2',
    'day-reopen-3',
  ]);
  const created = await firstLaunch.create({
    title: 'Persistent Trip',
    startDate: '2026-09-19',
    endDate: '2026-09-21',
    mapRegion: 'china_mainland',
  });
  const firstDayIds = (
    await getTripDays(firstLaunch.source, created.data.id)
  ).map((day) => day.id);

  firstLaunch.connection.close();

  const secondLaunch = openHarness(databasePath, []);
  const reopenedTrips = await getTrips(secondLaunch.source);
  const reopenedDayIds = (
    await getTripDays(secondLaunch.source, created.data.id)
  ).map((day) => day.id);

  expect(reopenedTrips).toEqual([created.data]);
  expect(firstDayIds).toEqual([
    'day-reopen-1',
    'day-reopen-2',
    'day-reopen-3',
  ]);
  expect(reopenedDayIds).toEqual(firstDayIds);
});

test('derives lifecycle correctly around both Trip date boundaries', () => {
  const trip = {
    startDate: '2026-09-19',
    endDate: '2026-09-21',
  };

  expect(deriveTripLifecycle(trip, '2026-09-18')).toBe('planned');
  expect(deriveTripLifecycle(trip, '2026-09-19')).toBe('active');
  expect(deriveTripLifecycle(trip, '2026-09-21')).toBe('active');
  expect(deriveTripLifecycle(trip, '2026-09-22')).toBe('completed');
});

test('keeps the original Days when either Trip Day uniqueness constraint fails', async () => {
  const harness = openHarness(createDatabasePath(), ['trip-unique', 'day-original']);
  const created = await harness.create({
    title: 'Unique Days',
    startDate: '2026-09-19',
    endDate: '2026-09-19',
    mapRegion: 'global',
  });

  await expect(
    harness.runtime.runInExclusiveTransaction((database) =>
      new SqliteDayRepository(database).insertMany([
        {
          id: 'day-duplicate-date',
          tripId: created.data.id,
          date: '2026-09-19',
          dayIndex: 2,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]),
    ),
  ).rejects.toThrow();

  await expect(
    harness.runtime.runInExclusiveTransaction((database) =>
      new SqliteDayRepository(database).insertMany([
        {
          id: 'day-duplicate-index',
          tripId: created.data.id,
          date: '2026-09-20',
          dayIndex: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]),
    ),
  ).rejects.toThrow();

  expect(await getTripDays(harness.source, created.data.id)).toEqual([
    expect.objectContaining({
      id: 'day-original',
      date: '2026-09-19',
      dayIndex: 1,
    }),
  ]);
});
