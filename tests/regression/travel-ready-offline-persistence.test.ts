import { afterEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { addItem } from '@/application/item/add-item';
import { updateItemDetails } from '@/application/item/update-item-details';
import { confirmPlaceSearchResult } from '@/application/place/confirm-place-search-result';
import { buildTimelineProjection } from '@/application/projections/timeline';
import { createDayViewQuerySource } from '@/infrastructure/database/day-view-query-source';
import {
  createItemTransactionRunner,
  createUpdateItemDetailsTransactionRunner,
} from '@/infrastructure/database/item-transaction';
import { runMigrations } from '@/infrastructure/database/migrations';
import { createConfirmPlaceSearchResultTransactionRunner } from '@/infrastructure/database/place-item-transaction';
import {
  createDatabaseRuntime,
  type DatabaseBindParams,
  type DatabaseConnection,
  type DatabaseExecutor,
} from '@/infrastructure/database/runtime';
import { SqlitePlaceRepository } from '@/infrastructure/database/sqlite/place-repository';
import { SqliteTripRepository } from '@/infrastructure/database/sqlite/trip-repository';
import { createTripDayTransactionRunner } from '@/infrastructure/database/trip-day-transaction';
import { createTripOverviewQuerySource } from '@/infrastructure/database/trip-overview-query-source';
import { createTrip } from '@/application/trip/create-trip';

function nodeParams(params: DatabaseBindParams) {
  return params.map((value) => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  });
}

class NodeSqliteConnection implements DatabaseConnection {
  readonly database: DatabaseSync;
  private closed = false;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
  }

  async execAsync(source: string) { this.database.exec(source); }
  async runAsync(source: string, params: DatabaseBindParams = []) {
    const result = this.database.prepare(source).run(...nodeParams(params));
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }
  async getFirstAsync<T>(source: string, params: DatabaseBindParams = []): Promise<T | null> {
    return (this.database.prepare(source).get(...nodeParams(params)) as T | undefined) ?? null;
  }
  async getAllAsync<T>(source: string, params: DatabaseBindParams = []): Promise<T[]> {
    return this.database.prepare(source).all(...nodeParams(params)) as T[];
  }
  async withExclusiveTransactionAsync(task: (transaction: DatabaseExecutor) => Promise<void>) {
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

const directories: string[] = [];
const connections: NodeSqliteConnection[] = [];
const createdAt = '2026-09-15T04:00:00.000Z';
const editedAt = '2026-09-15T05:00:00.000Z';

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createPath() {
  const directory = mkdtempSync(join(tmpdir(), 'travel-ready-offline-'));
  directories.push(directory);
  return join(directory, 'travel-app.db');
}

function open(path: string) {
  const connection = new NodeSqliteConnection(path);
  connections.push(connection);
  const runtime = createDatabaseRuntime(async () => connection, {
    initializeConnection: runMigrations,
  });
  return {
    connection,
    daySource: createDayViewQuerySource(runtime.runInReadContext),
    overviewSource: createTripOverviewQuerySource(runtime.runInReadContext),
    runtime,
  };
}

function close(connection: NodeSqliteConnection) {
  connection.close();
  connections.splice(connections.indexOf(connection), 1);
}

test('saved itinerary and Place remain readable and editable across offline reopen cycles', async () => {
  const path = createPath();
  const firstLaunch = open(path);
  await firstLaunch.runtime.initialize();

  const createdTrip = await createTrip({
    title: 'Offline Sydney',
    startDate: '2026-09-20',
    endDate: '2026-09-20',
    mapRegion: 'global',
  }, {
    createId: (() => {
      const ids = ['trip-offline', 'day-offline'];
      return () => ids.shift()!;
    })(),
    now: () => createdAt,
    runInTransaction: createTripDayTransactionRunner(
      firstLaunch.runtime.runInExclusiveTransaction,
    ),
  });

  await confirmPlaceSearchResult({
    tripId: createdTrip.data.id,
    dayId: 'day-offline',
    result: {
      name: 'Sydney Opera House',
      address: 'Bennelong Point, Sydney NSW 2000',
      coordinate: { latitude: -33.856784, longitude: 151.215297, system: 'wgs84' },
      provider: 'google',
      providerPlaceId: 'google-opera-house',
      regionLabel: 'Sydney NSW',
      metadata: { types: ['tourist_attraction'] },
    },
  }, {
    createPlaceId: () => 'place-offline',
    createItemId: () => 'item-place',
    now: () => createdAt,
    runInTransaction: createConfirmPlaceSearchResultTransactionRunner(
      firstLaunch.runtime.runInExclusiveTransaction,
    ),
  });
  await addItem({
    tripId: createdTrip.data.id,
    dayId: 'day-offline',
    title: 'Offline note',
    type: 'custom',
  }, {
    createId: () => 'item-local',
    now: () => createdAt,
    runInTransaction: createItemTransactionRunner(
      firstLaunch.runtime.runInExclusiveTransaction,
    ),
  });
  close(firstLaunch.connection);

  // No PlaceProvider, map renderer, network client, or SDK initialization is
  // supplied to this launch: local reads and edits must stand on SQLite alone.
  const offlineLaunch = open(path);
  await offlineLaunch.runtime.initialize();
  const beforeEdit = await offlineLaunch.daySource.getDayView('day-offline');
  expect(beforeEdit.trip.mapRegion).toBe('global');
  expect(beforeEdit.items.map(({ id, sortOrder }) => ({ id, sortOrder }))).toEqual([
    { id: 'item-place', sortOrder: 0 },
    { id: 'item-local', sortOrder: 1 },
  ]);
  expect(beforeEdit.placesById['place-offline']).toMatchObject({
    name: 'Sydney Opera House',
    provider: 'google',
    providerPlaceId: 'google-opera-house',
    coordinate: { latitude: -33.856784, longitude: 151.215297, system: 'wgs84' },
  });
  expect(buildTimelineProjection(beforeEdit).items.map(({ title }) => title)).toEqual([
    'Sydney Opera House',
    'Offline note',
  ]);

  await updateItemDetails({
    itemId: 'item-place',
    period: 'afternoon',
    timeMode: 'period',
    note: 'Readable and editable without provider network',
  }, {
    now: () => editedAt,
    runInTransaction: createUpdateItemDetailsTransactionRunner(
      offlineLaunch.runtime.runInExclusiveTransaction,
    ),
  });
  close(offlineLaunch.connection);

  const relaunched = open(path);
  await relaunched.runtime.initialize();
  const afterEdit = await relaunched.daySource.getDayView('day-offline');
  const overview = await relaunched.overviewSource.getTripOverview('trip-offline');
  expect(afterEdit.items[0]).toMatchObject({
    id: 'item-place',
    note: 'Readable and editable without provider network',
    period: 'afternoon',
    sortOrder: 0,
    timeMode: 'period',
    updatedAt: editedAt,
  });
  expect(afterEdit.items[1]).toMatchObject({ id: 'item-local', sortOrder: 1 });
  expect(overview.placesById['place-offline']).toEqual(
    await new SqlitePlaceRepository(relaunched.connection).getById('place-offline'),
  );
  expect(await new SqliteTripRepository(relaunched.connection).getById('trip-offline'))
    .toMatchObject({ mapRegion: 'global' });
  expect(relaunched.connection.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
