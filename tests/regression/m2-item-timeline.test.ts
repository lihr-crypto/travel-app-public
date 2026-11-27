import { afterEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  addItem,
  type AddItemDependencies,
} from '@/application/item/add-item';
import {
  updateItemDetails,
  type UpdateItemDetailsDependencies,
} from '@/application/item/update-item-details';
import { buildTimelineProjection } from '@/application/projections/timeline';
import { getDayView } from '@/application/queries/day-view';
import { createItemTransactionRunner } from '@/infrastructure/database/item-transaction';
import { createDayViewQuerySource } from '@/infrastructure/database/day-view-query-source';
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
import { createTripDayTransactionRunner } from '@/infrastructure/database/trip-day-transaction';
import { createTrip } from '@/application/trip/create-trip';
import { createUpdateItemDetailsTransactionRunner } from '@/infrastructure/database/item-transaction';

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

const createdAt = '2026-09-11T12:00:00.000Z';
const updatedAt = '2026-09-11T13:00:00.000Z';
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
  const directory = mkdtempSync(join(tmpdir(), 'travel-app-m2-'));
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

function openHarness(databasePath: string) {
  const connection = new NodeSqliteConnection(databasePath);
  connections.push(connection);
  const runtime = createDatabaseRuntime(async () => connection, {
    initializeConnection: runMigrations,
  });

  return {
    connection,
    runtime,
    source: createDayViewQuerySource(runtime.runInReadContext),
  };
}

test('reopening SQLite preserves Item IDs, order, edits and Timeline output', async () => {
  const databasePath = createDatabasePath();
  const firstLaunch = openHarness(databasePath);
  const createdTrip = await createTrip(
    {
      title: 'Persistent M2 Trip',
      startDate: '2026-12-30',
      endDate: '2026-12-31',
      mapRegion: 'global',
    },
    {
      createId: idSequence(['trip-1', 'day-1', 'day-2']),
      now: () => createdAt,
      runInTransaction: createTripDayTransactionRunner(
        firstLaunch.runtime.runInExclusiveTransaction,
      ),
    },
  );
  const addDependencies: AddItemDependencies = {
    createId: idSequence(['item-1', 'item-2', 'item-unscheduled']),
    now: () => createdAt,
    runInTransaction: createItemTransactionRunner(
      firstLaunch.runtime.runInExclusiveTransaction,
    ),
  };
  const first = await addItem(
    {
      tripId: createdTrip.data.id,
      dayId: 'day-1',
      title: 'Breakfast',
      type: 'food',
      timeMode: 'period',
      period: 'morning',
    },
    addDependencies,
  );
  const second = await addItem(
    {
      tripId: createdTrip.data.id,
      dayId: 'day-1',
      title: 'Train',
      type: 'transport',
      timeMode: 'exact',
      startDateTime: '2026-12-30T09:15',
      endDateTime: '2026-12-30T10:00',
      payload: { kind: 'transport', serviceNumber: 'AP-1' },
    },
    addDependencies,
  );
  await addItem(
    {
      tripId: createdTrip.data.id,
      dayId: null,
      title: 'Maybe visit',
      type: 'custom',
    },
    addDependencies,
  );
  const updateDependencies: UpdateItemDetailsDependencies = {
    now: () => updatedAt,
    runInTransaction: createUpdateItemDetailsTransactionRunner(
      firstLaunch.runtime.runInExclusiveTransaction,
    ),
  };
  await updateItemDetails(
    {
      itemId: second.data.id,
      isFixed: true,
      note: 'Reserved seat',
    },
    updateDependencies,
  );

  const beforeRestart = await getDayView(firstLaunch.source, 'day-1');
  expect(buildTimelineProjection(beforeRestart).items.map(({ id }) => id)).toEqual([
    second.data.id,
    first.data.id,
  ]);
  firstLaunch.connection.close();

  const secondLaunch = openHarness(databasePath);
  const afterRestart = await getDayView(secondLaunch.source, 'day-1');
  const timeline = buildTimelineProjection(afterRestart);

  expect(afterRestart.trip.id).toBe(createdTrip.data.id);
  expect(afterRestart.items.map(({ id, sortOrder }) => ({ id, sortOrder }))).toEqual([
    { id: 'item-2', sortOrder: 0 },
    { id: 'item-1', sortOrder: 1 },
  ]);
  expect(afterRestart.items[0]).toMatchObject({
    timeMode: 'exact',
    startDateTime: '2026-12-30T09:15',
    endDateTime: '2026-12-30T10:00',
    isFixed: true,
    note: 'Reserved seat',
    payload: { kind: 'transport', serviceNumber: 'AP-1' },
    updatedAt,
  });
  expect(timeline.items.map(({ id }) => id)).toEqual(['item-2', 'item-1']);
  await secondLaunch.runtime.runInReadContext(async (database) => {
    expect(
      await new SqliteItemRepository(database).listUnscheduledByTripId('trip-1'),
    ).toEqual([
      expect.objectContaining({ id: 'item-unscheduled', sortOrder: 0 }),
    ]);
  });
});

test('failed ownership and detail mutations leave persisted Item state unchanged', async () => {
  const harness = openHarness(createDatabasePath());
  await harness.runtime.runInExclusiveTransaction(async (database) => {
    const trips = new SqliteTripRepository(database);
    const days = new SqliteDayRepository(database);
    await trips.insert({
      id: 'trip-1',
      title: 'Trip 1',
      startDate: '2026-12-30',
      endDate: '2026-12-30',
      mapRegion: 'global',
      note: null,
      createdAt,
      updatedAt: createdAt,
    });
    await trips.insert({
      id: 'trip-2',
      title: 'Trip 2',
      startDate: '2026-12-30',
      endDate: '2026-12-30',
      mapRegion: 'global',
      note: null,
      createdAt,
      updatedAt: createdAt,
    });
    await days.insertMany([
      {
        id: 'day-1',
        tripId: 'trip-1',
        date: '2026-12-30',
        dayIndex: 1,
        createdAt,
        updatedAt: createdAt,
      },
    ]);
  });
  const addDependencies: AddItemDependencies = {
    createId: idSequence(['item-1', 'unused-item']),
    now: () => createdAt,
    runInTransaction: createItemTransactionRunner(
      harness.runtime.runInExclusiveTransaction,
    ),
  };
  const created = await addItem(
    {
      tripId: 'trip-1',
      dayId: 'day-1',
      title: 'Original',
      type: 'custom',
    },
    addDependencies,
  );

  await expect(
    addItem(
      {
        tripId: 'trip-2',
        dayId: 'day-1',
        title: 'Wrong owner',
        type: 'custom',
      },
      addDependencies,
    ),
  ).rejects.toThrow('Item Day must belong to the same Trip');
  await expect(
    updateItemDetails(
      {
        itemId: created.data.id,
        timeMode: 'exact',
      },
      {
        now: () => updatedAt,
        runInTransaction: createUpdateItemDetailsTransactionRunner(
          harness.runtime.runInExclusiveTransaction,
        ),
      },
    ),
  ).rejects.toThrow('Item timeMode exact requires startDateTime or endDateTime and no period');

  const persisted = await harness.runtime.runInReadContext((database) =>
    new SqliteItemRepository(database).getById(created.data.id),
  );
  expect(persisted).toEqual(created.data);
  expect(
    harness.connection.database.prepare('SELECT COUNT(*) AS count FROM items').get(),
  ).toEqual({ count: 1 });
});
