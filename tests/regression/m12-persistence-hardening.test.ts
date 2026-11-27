import { afterEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { addItem } from '@/application/item/add-item';
import { deleteItem } from '@/application/item/delete-item';
import { moveItemToDay } from '@/application/item/move-item-to-day';
import { moveItemToUnscheduled } from '@/application/item/move-item-to-unscheduled';
import { reorderItem } from '@/application/item/reorder-item';
import { restoreDeletedItem } from '@/application/item/restore-deleted-item';
import { updateItemDetails } from '@/application/item/update-item-details';
import { createTrip } from '@/application/trip/create-trip';
import {
  createDeleteItemTransactionRunner,
  createItemTransactionRunner,
  createMoveItemToDayTransactionRunner,
  createMoveItemToUnscheduledTransactionRunner,
  createReorderItemTransactionRunner,
  createRestoreDeletedItemTransactionRunner,
  createUpdateItemDetailsTransactionRunner,
} from '@/infrastructure/database/item-transaction';
import { runMigrations } from '@/infrastructure/database/migrations';
import { createDatabaseRuntime, type DatabaseBindParams, type DatabaseConnection, type DatabaseExecutor } from '@/infrastructure/database/runtime';
import { resolveTripMapStack } from '@/infrastructure/map/map-provider-policy';
import { SqliteDayRepository } from '@/infrastructure/database/sqlite/day-repository';
import { SqliteItemRepository } from '@/infrastructure/database/sqlite/item-repository';
import { SqlitePlaceRepository } from '@/infrastructure/database/sqlite/place-repository';
import { SqliteTripRepository } from '@/infrastructure/database/sqlite/trip-repository';
import { createTripDayTransactionRunner } from '@/infrastructure/database/trip-day-transaction';

function nodeParams(params: DatabaseBindParams) {
  return params.map((value) => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  });
}

class NodeSqliteConnection implements DatabaseConnection {
  readonly database: DatabaseSync;
  constructor(path: string) { this.database = new DatabaseSync(path); }
  async execAsync(sql: string) { this.database.exec(sql); }
  async runAsync(sql: string, params: DatabaseBindParams = []) {
    const result = this.database.prepare(sql).run(...nodeParams(params));
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync<T>(sql: string, params: DatabaseBindParams = []): Promise<T | null> {
    return (this.database.prepare(sql).get(...nodeParams(params)) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, params: DatabaseBindParams = []): Promise<T[]> {
    return this.database.prepare(sql).all(...nodeParams(params)) as T[];
  }
  async withExclusiveTransactionAsync(task: (transaction: DatabaseExecutor) => Promise<void>) {
    this.database.exec('BEGIN EXCLUSIVE;');
    try { await task(this); this.database.exec('COMMIT;'); }
    catch (error) { this.database.exec('ROLLBACK;'); throw error; }
  }
  close() {
    /* Kill/restart tests leave connections intentionally abandoned. */
    if (this.database.isOpen) this.database.close();
  }
}

const createdAt = '2026-03-09T00:00:00.000Z';
const editedAt = '2026-03-24T14:00:00.000Z';
const directories: string[] = [];
const connections: NodeSqliteConnection[] = [];

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function databasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'travel-app-m12-'));
  directories.push(directory);
  return join(directory, 'travel-app.db');
}

function open(path: string) {
  const connection = new NodeSqliteConnection(path);
  connections.push(connection);
  const runtime = createDatabaseRuntime(async () => connection, { initializeConnection: runMigrations });
  return { connection, runtime };
}

function sequence(ids: string[]) {
  return () => {
    const id = ids.shift();
    if (!id) throw new Error('Test ID sequence exhausted');
    return id;
  };
}

interface ItemCommandDeps {
  now: () => string;
  runInTransaction: <T>(task: (context: never) => Promise<T>) => Promise<T>;
}

/** Rebuilds per-call command dependencies against the given runtime. */
function commands(runtime: ReturnType<typeof createDatabaseRuntime>, ids: string[]) {
  const now = () => createdAt;
  return {
    createTrip: (input: Parameters<typeof createTrip>[0]) => createTrip(input, {
      createId: sequence(ids),
      now,
      runInTransaction: createTripDayTransactionRunner(runtime.runInExclusiveTransaction),
    }),
    add: (input: Parameters<typeof addItem>[0]) => addItem(input, {
      createId: sequence(ids),
      now,
      runInTransaction: createItemTransactionRunner(runtime.runInExclusiveTransaction),
    }),
    moveItemToDay: (input: Parameters<typeof moveItemToDay>[0]) => moveItemToDay(input, {
      now, runInTransaction: createMoveItemToDayTransactionRunner(runtime.runInExclusiveTransaction),
    }),
    moveItemToUnscheduled: (input: Parameters<typeof moveItemToUnscheduled>[0]) =>
      moveItemToUnscheduled(input, {
        now, runInTransaction: createMoveItemToUnscheduledTransactionRunner(runtime.runInExclusiveTransaction),
      }),
    reorderItem: (input: Parameters<typeof reorderItem>[0]) => reorderItem(input, {
      now, runInTransaction: createReorderItemTransactionRunner(runtime.runInExclusiveTransaction),
    }),
    deleteItem: (input: Parameters<typeof deleteItem>[0]) => deleteItem(input, {
      now, runInTransaction: createDeleteItemTransactionRunner(runtime.runInExclusiveTransaction),
    }),
    restore: (snapshot: Parameters<typeof restoreDeletedItem>[0]['snapshot']) =>
      restoreDeletedItem({ snapshot }, {
        now, runInTransaction: createRestoreDeletedItemTransactionRunner(runtime.runInExclusiveTransaction),
      }),
    updateItemDetails: (input: Parameters<typeof updateItemDetails>[0]) => updateItemDetails(input, {
      now, runInTransaction: createUpdateItemDetailsTransactionRunner(runtime.runInExclusiveTransaction),
    }),
  };
}

async function dayOrder(runtime: ReturnType<typeof createDatabaseRuntime>, dayId: string) {
  return runtime.runInReadContext(async (database) =>
    (await new SqliteItemRepository(database).listByDayId(dayId)).map(({ id }) => id),
  );
}

async function unscheduledOrder(runtime: ReturnType<typeof createDatabaseRuntime>) {
  return runtime.runInReadContext(async (database) =>
    (await new SqliteItemRepository(database).listUnscheduledByTripId('trip-1')).map(({ id }) => id),
  );
}

async function assertForeignKeysClean(runtime: ReturnType<typeof createDatabaseRuntime>) {
  await runtime.runInReadContext(async (database) => {
    expect(await database.getAllAsync('PRAGMA foreign_key_check;', [])).toEqual([]);
  });
}

async function dumpItinerary(runtime: ReturnType<typeof createDatabaseRuntime>) {
  return runtime.runInReadContext(async (database) => ({
    items: await database.getAllAsync('SELECT * FROM items ORDER BY id;', []),
    places: await database.getAllAsync('SELECT * FROM places ORDER BY id;', []),
  }));
}

test('M12-T1: state survives an abandoned process and repeated restarts', async () => {
  const path = databasePath();
  // A killed process never gets to close its connection: write and abandon.
  const killed = open(path);
  const seed = commands(killed.runtime, ['trip-1', 'day-1', 'day-2', 'a', 'b']);
  await seed.createTrip({ title: 'M12', startDate: '2026-03-10', endDate: '2026-03-11', mapRegion: 'china_mainland' });
  await killed.runtime.runInExclusiveTransaction(async (database) => {
    await new SqlitePlaceRepository(database).insert({
      id: 'place-1',
      name: '林间镇',
      coordinate: { latitude: 41.2872, longitude: 106.9953, system: 'gcj02' },
      address: null,
      provider: 'amap',
      providerPlaceId: 'B000SAMP01',
      metadata: { typeCode: '110200' },
      createdAt,
      updatedAt: createdAt,
    });
  });
  await seed.add({ tripId: 'trip-1', dayId: 'day-1', type: 'sightseeing', title: '林间镇', placeId: 'place-1', timeMode: 'none' });
  await seed.add({ tripId: 'trip-1', dayId: 'day-2', type: 'custom', title: 'B', timeMode: 'none' });

  // First restart: a fresh process opens the same file while the abandoned
  // connection still holds it.
  const second = open(path);
  await second.runtime.runInReadContext(async (database) => {
    expect((await database.getAllAsync<{ version: number }>(
      'SELECT version FROM schema_migrations ORDER BY version;', [],
    )).map(({ version }) => version)).toEqual([1, 2, 3, 4]);
    expect(await database.getAllAsync('SELECT * FROM trip_imports;', [])).toEqual([]);
    expect(await new SqliteTripRepository(database).getById('trip-1')).toMatchObject({ title: 'M12' });
    expect(await dayOrder(second.runtime, 'day-1')).toEqual(['a']);
    expect(await new SqlitePlaceRepository(database).getById('place-1')).toMatchObject({ name: '林间镇' });
  });
  second.connection.close();

  // Second restart: still complete, migrations still recorded exactly once.
  const third = open(path);
  await third.runtime.runInReadContext(async (database) => {
    expect((await database.getAllAsync<{ version: number }>(
      'SELECT version FROM schema_migrations ORDER BY version;', [],
    )).map(({ version }) => version)).toEqual([1, 2, 3, 4]);
    expect(await dayOrder(third.runtime, 'day-2')).toEqual(['b']);
  });
  await assertForeignKeysClean(third.runtime);
  third.connection.close();
});

test('M12-T2: the whole edit battery works offline on an existing itinerary', async () => {
  const path = databasePath();
  const first = open(path);
  const seed = commands(first.runtime, ['trip-1', 'day-1', 'day-2', 'a', 'b', 'c', 'u']);
  await seed.createTrip({ title: 'M12 Offline', startDate: '2026-03-10', endDate: '2026-03-11', mapRegion: 'global' });
  for (const [id, dayId] of [['a', 'day-1'], ['b', 'day-1'], ['c', 'day-2']] as const) {
    await seed.add({ tripId: 'trip-1', dayId, type: 'custom', title: id, timeMode: 'none' });
  }
  await seed.add({ tripId: 'trip-1', dayId: null, type: 'custom', title: 'U', timeMode: 'none' });
  first.connection.close();

  // Offline restart: no provider, no network — repository reads and the
  // command battery are the entire surface.
  const second = open(path);
  const battery = commands(second.runtime, []);
  await battery.updateItemDetails({ itemId: 'a', title: '改过的 A', note: '离线编辑' });
  await battery.moveItemToDay({ itemId: 'c', targetDayId: 'day-1', position: { type: 'end' } });
  await battery.reorderItem({ itemId: 'a', position: { type: 'start' } });
  await battery.moveItemToUnscheduled({ itemId: 'b' });
  const deleted = await battery.deleteItem({ itemId: 'u' });
  await battery.restore(deleted.data);
  second.connection.close();

  const third = open(path);
  // u restores before its surviving next anchor b, which was appended after
  // the delete.
  expect(await unscheduledOrder(third.runtime)).toEqual(['u', 'b']);
  await third.runtime.runInReadContext(async (database) => {
    expect(await new SqliteItemRepository(database).getById('a'))
      .toMatchObject({ title: '改过的 A', note: '离线编辑' });
  });
  await assertForeignKeysClean(third.runtime);
  third.connection.close();
});

test('M12-T3: ordering is exact and contiguous after structural commands and a reopen', async () => {
  const path = databasePath();
  const first = open(path);
  const seed = commands(first.runtime, ['trip-1', 'day-1', 'day-2', 'a', 'b', 'c', 'd', 'u']);
  await seed.createTrip({ title: 'M12 Order', startDate: '2026-03-10', endDate: '2026-03-11', mapRegion: 'global' });
  for (const [id, dayId] of [['a', 'day-1'], ['b', 'day-1'], ['c', 'day-1'], ['d', 'day-2']] as const) {
    await seed.add({ tripId: 'trip-1', dayId, type: 'custom', title: id, timeMode: 'none' });
  }
  await seed.add({ tripId: 'trip-1', dayId: null, type: 'custom', title: 'U', timeMode: 'none' });

  await seed.moveItemToUnscheduled({ itemId: 'c' });
  await seed.moveItemToDay({ itemId: 'u', targetDayId: 'day-1', position: { type: 'before', itemId: 'a' } });
  const deleted = await seed.deleteItem({ itemId: 'b' });
  await seed.reorderItem({ itemId: 'a', position: { type: 'end' } });
  await seed.restore(deleted.data);
  first.connection.close();

  const second = open(path);
  await second.runtime.runInReadContext(async (database) => {
    const items = new SqliteItemRepository(database);
    for (const dayId of ['day-1', 'day-2']) {
      const list = await items.listByDayId(dayId);
      expect(list.map(({ sortOrder }) => sortOrder)).toEqual(list.map((_, index) => index));
    }
    const unscheduled = await items.listUnscheduledByTripId('trip-1');
    expect(unscheduled.map(({ sortOrder }) => sortOrder)).toEqual(unscheduled.map((_, index) => index));
    expect(await items.listByDayId('day-1')).toEqual([
      expect.objectContaining({ id: 'u', sortOrder: 0 }),
      expect.objectContaining({ id: 'a', sortOrder: 1 }),
      expect.objectContaining({ id: 'b', sortOrder: 2 }),
    ]);
    expect(await items.listUnscheduledByTripId('trip-1')).toEqual([
      expect.objectContaining({ id: 'c', sortOrder: 0 }),
    ]);
  });
  await assertForeignKeysClean(second.runtime);
  second.connection.close();
});

test('M12-T4: Places round-trip bit-identical for both CRS and orphans survive', async () => {
  const path = databasePath();
  const first = open(path);
  const seed = commands(first.runtime, ['trip-1', 'day-1', 'a']);
  await seed.createTrip({ title: 'M12 Places', startDate: '2026-03-10', endDate: '2026-03-10', mapRegion: 'china_mainland' });
  await first.runtime.runInExclusiveTransaction(async (database) => {
    const places = new SqlitePlaceRepository(database);
    await places.insert({
      id: 'place-gcj',
      name: '林间镇',
      coordinate: { latitude: 41.2872, longitude: 106.9953, system: 'gcj02' },
      address: '示例自治区示例市',
      provider: 'amap',
      providerPlaceId: 'B000SAMP01',
      metadata: { typeCode: '110200' },
      createdAt,
      updatedAt: createdAt,
    });
    await places.insert({
      id: 'place-wgs',
      name: 'Sydney Opera House',
      coordinate: { latitude: -33.8568, longitude: 151.2153, system: 'wgs84' },
      address: null,
      provider: 'google',
      providerPlaceId: 'ChIJs3yH6E60EmsRMbmNTMsT8s0',
      metadata: null,
      createdAt,
      updatedAt: createdAt,
    });
  });
  await seed.add({ tripId: 'trip-1', dayId: 'day-1', type: 'sightseeing', title: '林间镇', placeId: 'place-gcj', timeMode: 'none' });
  first.connection.close();

  const second = open(path);
  await second.runtime.runInReadContext(async (database) => {
    const places = new SqlitePlaceRepository(database);
    const gcj = await places.getById('place-gcj');
    const wgs = await places.getById('place-wgs');
    expect(gcj?.coordinate).toEqual({ latitude: 41.2872, longitude: 106.9953, system: 'gcj02' });
    expect(wgs?.coordinate).toEqual({ latitude: -33.8568, longitude: 151.2153, system: 'wgs84' });
    expect(gcj?.metadata).toEqual({ typeCode: '110200' });
  });
  // Deleting the only linked Item leaves both Place snapshots untouched.
  const battery = commands(second.runtime, []);
  await battery.deleteItem({ itemId: 'a' });
  await second.runtime.runInReadContext(async (database) => {
    expect(await new SqlitePlaceRepository(database).getById('place-gcj')).not.toBeNull();
    expect(await new SqlitePlaceRepository(database).getById('place-wgs')).not.toBeNull();
  });
  await assertForeignKeysClean(second.runtime);
  second.connection.close();
});

test('M12-T5: mapRegion drives the persisted stack after restart and rejects corruption', async () => {
  const path = databasePath();
  const first = open(path);
  const seed = commands(first.runtime, ['trip-c', 'day-c', 'trip-g', 'day-g']);
  await seed.createTrip({ title: 'Mainland', startDate: '2026-03-10', endDate: '2026-03-10', mapRegion: 'china_mainland' });
  await seed.createTrip({ title: 'Global', startDate: '2026-03-10', endDate: '2026-03-10', mapRegion: 'global' });
  first.connection.close();

  const second = open(path);
  await second.runtime.runInReadContext(async (database) => {
    const trips = new SqliteTripRepository(database);
    expect(resolveTripMapStack((await trips.getById('trip-c'))!)).toMatchObject({
      renderer: 'amap', coordinateSystem: 'gcj02',
    });
    expect(resolveTripMapStack((await trips.getById('trip-g'))!)).toMatchObject({
      renderer: 'google', coordinateSystem: 'wgs84',
    });
  });
  // The CHECK constraint fails closed before any renderer could see garbage.
  await expect(second.runtime.runInExclusiveTransaction(async (database) => {
    await database.runAsync(
      'UPDATE trips SET map_region = ? WHERE id = ?;', ['europe', 'trip-g'],
    );
  })).rejects.toThrow();
  await second.runtime.runInReadContext(async (database) => {
    expect(await new SqliteTripRepository(database).getById('trip-g'))
      .toMatchObject({ mapRegion: 'global' });
  });
  second.connection.close();
});

test('M12-T6: the declared FK actions behave exactly as Migration 001 writes them', async () => {
  const path = databasePath();
  const first = open(path);
  const seed = commands(first.runtime, ['trip-1', 'day-1', 'day-2', 'a', 'b', 'c']);
  await seed.createTrip({ title: 'M12 FK', startDate: '2026-03-10', endDate: '2026-03-11', mapRegion: 'global' });
  await first.runtime.runInExclusiveTransaction(async (database) => {
    const places = new SqlitePlaceRepository(database);
    await places.insert({
      id: 'place-1',
      name: 'Place',
      coordinate: { latitude: 1, longitude: 2, system: 'wgs84' },
      address: null,
      provider: 'google',
      providerPlaceId: null,
      metadata: null,
      createdAt,
      updatedAt: createdAt,
    });
    await places.insert({
      id: 'place-2',
      name: 'Surviving Place',
      coordinate: { latitude: 3, longitude: 4, system: 'wgs84' },
      address: null,
      provider: 'google',
      providerPlaceId: null,
      metadata: null,
      createdAt,
      updatedAt: createdAt,
    });
  });
  await seed.add({ tripId: 'trip-1', dayId: 'day-1', type: 'custom', title: 'A', placeId: 'place-1', timeMode: 'none' });
  await seed.add({ tripId: 'trip-1', dayId: 'day-2', type: 'custom', title: 'B', placeId: 'place-2', timeMode: 'none' });
  await seed.add({ tripId: 'trip-1', dayId: null, type: 'custom', title: 'C', timeMode: 'none' });

  // Deleting a Place SET NULLs the referencing Items; the Items survive.
  // (Raw SQL on purpose: this tests the schema action, not a repository.)
  await first.runtime.runInExclusiveTransaction(async (database) => {
    await database.runAsync('DELETE FROM places WHERE id = ?;', ['place-1']);
  });
  await first.runtime.runInReadContext(async (database) => {
    expect(await new SqliteItemRepository(database).getById('a'))
      .toMatchObject({ placeId: null, dayId: 'day-1' });
  });

  // Deleting a Day SET NULLs its Items, which become Unscheduled.
  await first.runtime.runInExclusiveTransaction(async (database) => {
    await new SqliteDayRepository(database).deleteMany(['day-2']);
  });
  await first.runtime.runInReadContext(async (database) => {
    expect(await new SqliteItemRepository(database).getById('b'))
      .toMatchObject({ dayId: null });
  });

  // Deleting a Trip cascades its Days and Items; Places are not cascaded.
  await first.runtime.runInExclusiveTransaction(async (database) => {
    await new SqliteTripRepository(database).delete('trip-1');
  });
  await first.runtime.runInReadContext(async (database) => {
    expect(await new SqliteTripRepository(database).getById('trip-1')).toBeNull();
    expect(await new SqliteDayRepository(database).listByTripId('trip-1')).toEqual([]);
    expect(await database.getAllAsync('SELECT id FROM items;', [])).toEqual([]);
    // Places are not part of the Trip cascade: the snapshot library survives.
    expect(await new SqlitePlaceRepository(database).getById('place-2')).not.toBeNull();
  });
  await assertForeignKeysClean(first.runtime);
  first.connection.close();
});

test('M12-T7: a forced late-write failure leaves the database byte-identical', async () => {
  const path = databasePath();
  const first = open(path);
  const seed = commands(first.runtime, ['trip-1', 'day-1', 'day-2', 'a', 'b', 'c', 'd', 'e', 'f']);
  await seed.createTrip({ title: 'M12 Rollback', startDate: '2026-03-10', endDate: '2026-03-11', mapRegion: 'global' });
  for (const [id, dayId] of [['a', 'day-1'], ['b', 'day-1'], ['c', 'day-1'], ['d', 'day-2']] as const) {
    await seed.add({ tripId: 'trip-1', dayId, type: 'custom', title: id, timeMode: 'none' });
  }
  await seed.add({ tripId: 'trip-1', dayId: null, type: 'custom', title: 'E', timeMode: 'none' });
  await seed.add({ tripId: 'trip-1', dayId: null, type: 'custom', title: 'F', timeMode: 'none' });
  const snapshot = (await seed.deleteItem({ itemId: 'e' })).data;
  const baseline = await dumpItinerary(first.runtime);

  /** Rebuilds the command's own dependencies with a poisoned `updateMany`. */
  const failing = <T,>(
    run: (deps: { now: () => string; runInTransaction: <U>(task: (context: never) => Promise<U>) => Promise<U> }) => Promise<T>,
  ) =>
    run({
      now: () => editedAt,
      runInTransaction: async <U,>(task: (context: never) => Promise<U>) =>
        first.runtime.runInExclusiveTransaction(async (database) => {
          const repository = new SqliteItemRepository(database);
          const poisoned = {
            getById: (id: string) => repository.getById(id),
            listByDayId: (dayId: string) => repository.listByDayId(dayId),
            listUnscheduledByTripId: (tripId: string) => repository.listUnscheduledByTripId(tripId),
            insert: (value: Parameters<typeof repository.insert>[0]) => repository.insert(value),
            update: (value: Parameters<typeof repository.update>[0]) => repository.update(value),
            delete: (id: string) => repository.delete(id),
            updateMany: async (updates: readonly Parameters<typeof repository.update>[0][]) => {
              await repository.update(updates[0]);
              throw new Error('forced late-write failure');
            },
          };
          return task({
            items: poisoned,
            days: new SqliteDayRepository(database),
          } as never);
        }),
    });

  const cases = [
    { name: 'moveItemToDay', run: () => failing((deps) => moveItemToDay({ itemId: 'b', targetDayId: 'day-2' }, deps as never)) },
    { name: 'moveItemToUnscheduled', run: () => failing((deps) => moveItemToUnscheduled({ itemId: 'a' }, deps as never)) },
    { name: 'reorderItem', run: () => failing((deps) => reorderItem({ itemId: 'c', position: { type: 'start' } }, deps as never)) },
    { name: 'deleteItem', run: () => failing((deps) => deleteItem({ itemId: 'b' }, deps as never)) },
    { name: 'restoreDeletedItem', run: () => failing((deps) => restoreDeletedItem({ snapshot }, deps as never)) },
  ];
  for (const { name, run } of cases) {
    await expect(run()).rejects.toThrow('forced late-write failure');
    const after = await dumpItinerary(first.runtime);
    expect(after).toEqual(baseline);
  }
  await assertForeignKeysClean(first.runtime);
  first.connection.close();
});
