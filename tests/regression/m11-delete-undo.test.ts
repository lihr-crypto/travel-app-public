import { afterEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { addItem } from '@/application/item/add-item';
import { deleteItem } from '@/application/item/delete-item';
import { moveItemToDay } from '@/application/item/move-item-to-day';
import { reorderItem } from '@/application/item/reorder-item';
import { restoreDeletedItem } from '@/application/item/restore-deleted-item';
import { createTrip } from '@/application/trip/create-trip';
import { deleteTripDay } from '@/application/trip/delete-trip-day';
import type { Item } from '@/domain/item/types';
import {
  createDeleteItemTransactionRunner,
  createItemTransactionRunner,
  createMoveItemToDayTransactionRunner,
  createReorderItemTransactionRunner,
  createRestoreDeletedItemTransactionRunner,
} from '@/infrastructure/database/item-transaction';
import { runMigrations } from '@/infrastructure/database/migrations';
import { createDatabaseRuntime, type DatabaseBindParams, type DatabaseConnection, type DatabaseExecutor } from '@/infrastructure/database/runtime';
import { SqliteDayRepository } from '@/infrastructure/database/sqlite/day-repository';
import { SqliteItemRepository } from '@/infrastructure/database/sqlite/item-repository';
import { SqlitePlaceRepository } from '@/infrastructure/database/sqlite/place-repository';
import { SqliteTripRepository } from '@/infrastructure/database/sqlite/trip-repository';
import { createTripDayTransactionRunner } from '@/infrastructure/database/trip-day-transaction';
import { createTripDayStructureTransactionRunner } from '@/infrastructure/database/trip-day-structure-transaction';

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
    /* Tests close and reopen the same file mid-flow; afterEach closes again. */
    if (this.database.isOpen) this.database.close();
  }
}

const createdAt = '2026-03-08T00:00:00.000Z';
const undoAt = '2026-03-24T12:00:00.000Z';
const directories: string[] = [];
const connections: NodeSqliteConnection[] = [];

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function databasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'travel-app-m11-'));
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

function itemCommands(runtime: ReturnType<typeof createDatabaseRuntime>, ids: string[]) {
  return {
    add: (input: Parameters<typeof addItem>[0]) => addItem(input, {
      createId: sequence(ids), now: () => createdAt,
      runInTransaction: createItemTransactionRunner(runtime.runInExclusiveTransaction),
    }),
    deleteItem: (itemId: string) => deleteItem({ itemId }, {
      now: () => undoAt,
      runInTransaction: createDeleteItemTransactionRunner(runtime.runInExclusiveTransaction),
    }),
    restore: (snapshot: Parameters<typeof restoreDeletedItem>[0]['snapshot']) =>
      restoreDeletedItem({ snapshot }, {
        now: () => undoAt,
        runInTransaction: createRestoreDeletedItemTransactionRunner(runtime.runInExclusiveTransaction),
      }),
  };
}

async function dayOrder(runtime: ReturnType<typeof createDatabaseRuntime>, dayId: string) {
  return runtime.runInReadContext(async (database) =>
    (await new SqliteItemRepository(database).listByDayId(dayId)).map(({ id }) => id),
  );
}

async function assertForeignKeysClean(runtime: ReturnType<typeof createDatabaseRuntime>) {
  await runtime.runInReadContext(async (database) => {
    expect(await database.getAllAsync('PRAGMA foreign_key_check;', [])).toEqual([]);
  });
}

test('a delete survives reopen, restores exactly, and survives another reopen', async () => {
  const path = databasePath();
  const first = open(path);
  const ids = ['trip-1', 'day-1', 'day-2', 'a', 'b', 'c'];
  await createTrip({
    title: 'M11 Regression', startDate: '2026-03-10', endDate: '2026-03-11', mapRegion: 'global',
  }, {
    createId: sequence(ids), now: () => createdAt,
    runInTransaction: createTripDayTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  const firstCommands = itemCommands(first.runtime, ids);
  await firstCommands.add({ tripId: 'trip-1', dayId: 'day-1', type: 'custom', title: 'A', timeMode: 'none' });
  await firstCommands.add({ tripId: 'trip-1', dayId: 'day-1', type: 'custom', title: 'B', timeMode: 'none' });
  await firstCommands.add({ tripId: 'trip-1', dayId: 'day-1', type: 'custom', title: 'C', timeMode: 'none' });

  const deleted = await firstCommands.deleteItem('b');
  expect(deleted.data.previousItemId).toBe('a');
  expect(deleted.data.nextItemId).toBe('c');
  first.connection.close();

  // The delete is durable: after a full reopen the Item stays gone and the
  // order stays contiguous.
  const second = open(path);
  expect(await dayOrder(second.runtime, 'day-1')).toEqual(['a', 'c']);
  const secondCommands = itemCommands(second.runtime, []);
  const restored = await secondCommands.restore(deleted.data);
  expect(restored.data).toMatchObject({ id: 'b', dayId: 'day-1', sortOrder: 1, createdAt });
  second.connection.close();

  // The restore is durable too, with the Item's original identity intact.
  const third = open(path);
  expect(await dayOrder(third.runtime, 'day-1')).toEqual(['a', 'b', 'c']);
  await third.runtime.runInReadContext(async (database) => {
    const b = await new SqliteItemRepository(database).getById('b');
    expect(b).toMatchObject({ id: 'b', title: 'B', createdAt, updatedAt: undoAt });
  });
  await assertForeignKeysClean(third.runtime);
  third.connection.close();
});

test('restore after an interleaved reorder lands by its surviving anchor', async () => {
  const path = databasePath();
  const first = open(path);
  const ids = ['trip-1', 'day-1', 'a', 'b', 'c', 'd'];
  await createTrip({
    title: 'M11 Interleave', startDate: '2026-03-10', endDate: '2026-03-10', mapRegion: 'global',
  }, {
    createId: sequence(ids), now: () => createdAt,
    runInTransaction: createTripDayTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  const commands = itemCommands(first.runtime, ids);
  for (const title of ['A', 'B', 'C', 'D']) {
    await commands.add({ tripId: 'trip-1', dayId: 'day-1', type: 'custom', title, timeMode: 'none' });
  }

  const deleted = await commands.deleteItem('b');
  await reorderItem({ itemId: 'd', position: { type: 'start' } }, {
    now: () => createdAt,
    runInTransaction: createReorderItemTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  expect(await dayOrder(first.runtime, 'day-1')).toEqual(['d', 'a', 'c']);

  // B's previous anchor A still exists, so B lands right after it even though
  // the collection has been re-ordered since the delete.
  await commands.restore(deleted.data);
  expect(await dayOrder(first.runtime, 'day-1')).toEqual(['d', 'a', 'b', 'c']);
  first.connection.close();
});

test('restoring after the Day was deleted fails closed and changes nothing', async () => {
  const path = databasePath();
  const first = open(path);
  const ids = ['trip-1', 'day-1', 'day-2', 'a', 'b'];
  await createTrip({
    title: 'M11 Deleted Day', startDate: '2026-03-10', endDate: '2026-03-11', mapRegion: 'global',
  }, {
    createId: sequence(ids), now: () => createdAt,
    runInTransaction: createTripDayTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  const commands = itemCommands(first.runtime, ids);
  await commands.add({ tripId: 'trip-1', dayId: 'day-1', type: 'custom', title: 'A', timeMode: 'none' });
  await commands.add({ tripId: 'trip-1', dayId: 'day-1', type: 'custom', title: 'B', timeMode: 'none' });

  const deleted = await commands.deleteItem('b');
  await deleteTripDay({ tripId: 'trip-1', dayId: 'day-1' }, {
    createId: () => {
      throw new Error('deleteTripDay must not create ids');
    },
    now: () => createdAt,
    runInTransaction: createTripDayStructureTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  // A survived as an Unscheduled Item; the Day row is gone.
  await first.runtime.runInReadContext(async (database) => {
    expect(await new SqliteDayRepository(database).getById('day-1')).toBeNull();
  });

  await expect(commands.restore(deleted.data)).rejects.toThrow(
    'Target Day no longer exists: day-1',
  );
  await first.runtime.runInReadContext(async (database) => {
    const items = new SqliteItemRepository(database);
    expect(await items.getById('b')).toBeNull();
    expect((await items.listUnscheduledByTripId('trip-1')).map(({ id }) => id))
      .toEqual(['a']);
  });
  await assertForeignKeysClean(first.runtime);
  first.connection.close();
});

test('a Place-linked Item survives delete, reopen and restore with its Place', async () => {
  const path = databasePath();
  const first = open(path);
  const ids = ['trip-1', 'day-1', 'a'];
  await createTrip({
    title: 'M11 Place', startDate: '2026-03-10', endDate: '2026-03-10', mapRegion: 'china_mainland',
  }, {
    createId: sequence(ids), now: () => createdAt,
    runInTransaction: createTripDayTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  const add = itemCommands(first.runtime, ids).add;
  await first.runtime.runInExclusiveTransaction(async (database) => {
    await new SqlitePlaceRepository(database).insert({
      id: 'place-1',
      name: '林间镇',
      coordinate: { latitude: 41.2872, longitude: 106.9953, system: 'gcj02' },
      address: null,
      provider: 'amap',
      providerPlaceId: 'B000SAMP01',
      metadata: null,
      createdAt,
      updatedAt: createdAt,
    });
  });
  await add({
    tripId: 'trip-1', dayId: 'day-1', type: 'sightseeing', title: '林间镇',
    placeId: 'place-1', timeMode: 'none',
  });

  const commands = itemCommands(first.runtime, ids);
  const deleted = await commands.deleteItem('a');
  first.connection.close();

  const second = open(path);
  await second.runtime.runInReadContext(async (database) => {
    // The Place snapshot survives the delete: it is not part of the snapshot
    // and never cascades.
    expect(await new SqlitePlaceRepository(database).getById('place-1'))
      .toMatchObject({ id: 'place-1', name: '林间镇' });
    expect(await new SqliteItemRepository(database).getById('a')).toBeNull();
  });
  await itemCommands(second.runtime, []).restore(deleted.data);
  await second.runtime.runInReadContext(async (database) => {
    expect(await new SqliteItemRepository(database).getById('a'))
      .toMatchObject({ id: 'a', placeId: 'place-1' });
  });
  await assertForeignKeysClean(second.runtime);
  second.connection.close();
});
