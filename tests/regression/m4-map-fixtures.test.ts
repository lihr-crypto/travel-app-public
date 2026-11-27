import { afterEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { buildDayMapProjection } from '@/application/projections/day-map';
import { createDayViewQuerySource } from '@/infrastructure/database/day-view-query-source';
import {
  m4MapFixtures,
  persistM4MapFixtures,
  readM4MapFixtures,
} from '@/infrastructure/database/m4-map-fixtures';
import { runMigrations } from '@/infrastructure/database/migrations';
import {
  createDatabaseRuntime,
  type DatabaseBindParams,
  type DatabaseConnection,
  type DatabaseExecutor,
} from '@/infrastructure/database/runtime';
import { SqliteDayRepository } from '@/infrastructure/database/sqlite/day-repository';
import { SqliteItemRepository } from '@/infrastructure/database/sqlite/item-repository';
import { SqlitePlaceRepository } from '@/infrastructure/database/sqlite/place-repository';
import { SqliteTripRepository } from '@/infrastructure/database/sqlite/trip-repository';
import { loadTripMapStack } from '@/infrastructure/map/map-provider-policy';

function nodeParams(params: DatabaseBindParams) {
  return params.map((value) => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  });
}

class NodeSqliteConnection implements DatabaseConnection {
  readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
  }

  async execAsync(source: string) {
    this.database.exec(source);
  }

  async runAsync(source: string, params: DatabaseBindParams) {
    const result = this.database.prepare(source).run(...nodeParams(params));
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(source: string, params: DatabaseBindParams): Promise<T | null> {
    return (this.database.prepare(source).get(...nodeParams(params)) as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, params: DatabaseBindParams): Promise<T[]> {
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
    this.database.close();
  }
}

const connections: NodeSqliteConnection[] = [];
const directories: string[] = [];

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function databasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'travel-app-m4-'));
  directories.push(directory);
  return join(directory, 'fixtures.db');
}

function open(path: string) {
  const connection = new NodeSqliteConnection(path);
  connections.push(connection);
  const runtime = createDatabaseRuntime(async () => connection, {
    initializeConnection: runMigrations,
  });
  return { connection, runtime };
}

test('persists two CRS-correct Trip → Day → Place → Item fixture chains across restart', async () => {
  const path = databasePath();
  const first = open(path);
  await first.runtime.initialize();
  await persistM4MapFixtures(first.runtime.runInExclusiveTransaction);
  await persistM4MapFixtures(first.runtime.runInExclusiveTransaction);
  first.connection.close();
  connections.splice(connections.indexOf(first.connection), 1);

  const reopened = open(path);
  await reopened.runtime.initialize();
  const trips = new SqliteTripRepository(reopened.connection);
  const days = new SqliteDayRepository(reopened.connection);
  const places = new SqlitePlaceRepository(reopened.connection);
  const items = new SqliteItemRepository(reopened.connection);
  const dayViewSource = createDayViewQuerySource(reopened.runtime.runInReadContext);
  const persistedFixtures = await readM4MapFixtures(reopened.runtime.runInReadContext);
  expect(persistedFixtures).toHaveLength(2);

  for (const [index, fixture] of m4MapFixtures.entries()) {
    expect(await trips.getById(fixture.trip.id)).toEqual(fixture.trip);
    const stack = await loadTripMapStack(fixture.trip.id, trips);
    expect(stack.mapRegion).toBe(fixture.trip.mapRegion);
    expect(stack.coordinateSystem).toBe(fixture.place.coordinate.system);
    expect(stack.renderer).toBe(fixture.trip.mapRegion === 'china_mainland' ? 'amap' : 'google');
    expect(await days.getById(fixture.day.id)).toEqual(fixture.day);
    expect(await places.getById(fixture.place.id)).toEqual(fixture.place);
    expect(await items.getById(fixture.item.id)).toEqual(fixture.item);
    expect(persistedFixtures[index]).toEqual({ ...fixture, stack });
    const dayView = await dayViewSource.getDayView(fixture.day.id);
    expect(dayView.placesById[fixture.place.id]).toEqual(fixture.place);
    const map = buildDayMapProjection(dayView);
    expect(map.markers).toEqual([{
      id: fixture.item.id,
      coordinate: fixture.place.coordinate,
      ordinal: 1,
      label: fixture.place.name,
      variant: 'normal',
    }]);
    expect(map.cameraRequest).toEqual({ coordinates: [fixture.place.coordinate] });
  }
  expect(reopened.connection.database.prepare('SELECT COUNT(*) AS count FROM places').get())
    .toEqual({ count: 2 });
  expect(reopened.connection.database.prepare('PRAGMA foreign_key_check').all())
    .toEqual([]);
});

test('failure inserting the second fixture rolls back the first complete chain', async () => {
  const harness = open(databasePath());
  await harness.runtime.initialize();
  harness.connection.database.exec(`
    CREATE TRIGGER reject_mainland_fixture BEFORE INSERT ON items
    WHEN NEW.id = 'm4-fixture-mainland-item'
    BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;
  `);

  await expect(
    persistM4MapFixtures(harness.runtime.runInExclusiveTransaction),
  ).rejects.toThrow('fixture failure');

  for (const table of ['trips', 'days', 'places', 'items']) {
    expect(harness.connection.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get())
      .toEqual({ count: 0 });
  }
});

test('does not silently accept a modified persisted fixture', async () => {
  const harness = open(databasePath());
  await harness.runtime.initialize();
  await persistM4MapFixtures(harness.runtime.runInExclusiveTransaction);
  harness.connection.database.prepare('UPDATE places SET longitude = ? WHERE id = ?')
    .run(151.0, 'm4-fixture-global-place');

  await expect(
    persistM4MapFixtures(harness.runtime.runInExclusiveTransaction),
  ).rejects.toThrow('M4 fixture collision: m4-fixture-global-trip');
  expect(harness.connection.database.prepare('SELECT longitude FROM places WHERE id = ?')
    .get('m4-fixture-global-place')).toEqual({ longitude: 151 });
});
