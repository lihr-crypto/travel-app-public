import { afterEach, expect, test } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';

import {
  createTrip,
  type CreateTripDependencies,
  type CreateTripInput,
} from '@/application/trip/create-trip';
import { runMigrations } from '@/infrastructure/database/migrations';
import {
  createDatabaseRuntime,
  type DatabaseBindParams,
  type DatabaseConnection,
  type DatabaseExecutor,
} from '@/infrastructure/database/runtime';
import { SqliteDayRepository } from '@/infrastructure/database/sqlite/day-repository';
import { SqliteTripRepository } from '@/infrastructure/database/sqlite/trip-repository';
import { createTripDayTransactionRunner } from '@/infrastructure/database/trip-day-transaction';

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

const input: CreateTripInput = {
  title: '  Hokkaido  ',
  startDate: '2026-12-31',
  endDate: '2027-01-02',
  mapRegion: 'global',
  note: 'Winter trip',
};

const timestamp = '2026-09-11T12:00:00.000Z';
let connection: NodeSqliteConnection | undefined;

afterEach(() => {
  connection?.close();
  connection = undefined;
});

function sequenceIdGenerator() {
  const ids = ['trip-1', 'day-1', 'day-2', 'day-3'];
  return () => {
    const id = ids.shift();

    if (!id) {
      throw new Error('Test ID sequence exhausted');
    }

    return id;
  };
}

async function createRealDependencies(): Promise<CreateTripDependencies> {
  connection = new NodeSqliteConnection();
  const runtime = createDatabaseRuntime(async () => connection!, {
    initializeConnection: runMigrations,
  });

  return {
    createId: sequenceIdGenerator(),
    now: () => timestamp,
    runInTransaction: createTripDayTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };
}

test('rejects a blank title before starting persistence', async () => {
  let transactionCalls = 0;
  const runInTransaction: CreateTripDependencies['runInTransaction'] = async () => {
    transactionCalls += 1;
    throw new Error('Persistence should not start');
  };

  await expect(
    createTrip(
      { ...input, title: ' \n\t ' },
      {
        createId: sequenceIdGenerator(),
        now: () => timestamp,
        runInTransaction,
      },
    ),
  ).rejects.toThrow('Trip title must not be empty');

  expect(transactionCalls).toBe(0);
});

test('rejects an invalid date range before starting persistence', async () => {
  let transactionCalls = 0;
  const runInTransaction: CreateTripDependencies['runInTransaction'] = async () => {
    transactionCalls += 1;
    throw new Error('Persistence should not start');
  };

  await expect(
    createTrip(
      { ...input, startDate: '2027-01-02', endDate: '2026-12-31' },
      {
        createId: sequenceIdGenerator(),
        now: () => timestamp,
        runInTransaction,
      },
    ),
  ).rejects.toThrow('Trip endDate must be on or after startDate');

  expect(transactionCalls).toBe(0);
});

test('keeps the legacy global default when an older caller omits mapRegion', async () => {
  const legacyInput: CreateTripInput = {
    title: input.title,
    startDate: input.startDate,
    endDate: input.endDate,
    note: input.note,
  };
  const result = await createTrip(legacyInput, await createRealDependencies());
  const trips = new SqliteTripRepository(connection!);

  expect(result.data.mapRegion).toBe('global');
  expect(await trips.getById(result.data.id)).toMatchObject({ mapRegion: 'global' });
});

test('atomically persists a Trip and all inclusive Days', async () => {
  const dependencies = await createRealDependencies();

  const result = await createTrip(input, dependencies);

  const trips = new SqliteTripRepository(connection!);
  const days = new SqliteDayRepository(connection!);
  expect(await trips.getById('trip-1')).toEqual(result.data);
  expect(await days.listByTripId('trip-1')).toEqual([
    {
      id: 'day-1',
      tripId: 'trip-1',
      date: '2026-12-31',
      dayIndex: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'day-2',
      tripId: 'trip-1',
      date: '2027-01-01',
      dayIndex: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'day-3',
      tripId: 'trip-1',
      date: '2027-01-02',
      dayIndex: 3,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  expect(result).toEqual({
    data: {
      id: 'trip-1',
      title: 'Hokkaido',
      startDate: input.startDate,
      endDate: input.endDate,
      mapRegion: input.mapRegion,
      note: input.note,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    affectedEntityIds: ['trip-1', 'day-1', 'day-2', 'day-3'],
    validationIssues: [],
  });
});

test('rolls back the Trip when Day insertion fails', async () => {
  connection = new NodeSqliteConnection();
  const runtime = createDatabaseRuntime(async () => connection!, {
    initializeConnection: runMigrations,
  });
  const runInTransaction: CreateTripDependencies['runInTransaction'] = (task) =>
    runtime.runInExclusiveTransaction(async (database) => {
      const trips = new SqliteTripRepository(database);
      const days = new SqliteDayRepository(database);

      return task({
        trips,
        days: {
          insertMany: async (derivedDays) => {
            await days.insertMany(derivedDays.slice(0, 1));
            throw new Error('forced Day insert failure');
          },
        },
      });
    });

  await expect(
    createTrip(input, {
      createId: sequenceIdGenerator(),
      now: () => timestamp,
      runInTransaction,
    }),
  ).rejects.toThrow('forced Day insert failure');

  expect(
    connection.database.prepare('SELECT COUNT(*) AS count FROM trips').get(),
  ).toEqual({ count: 0 });
  expect(
    connection.database.prepare('SELECT COUNT(*) AS count FROM days').get(),
  ).toEqual({ count: 0 });
});
