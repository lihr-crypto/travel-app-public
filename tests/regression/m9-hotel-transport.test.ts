import { afterEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { addItem } from '@/application/item/add-item';
import { updateItemDetails } from '@/application/item/update-item-details';
import { createTrip } from '@/application/trip/create-trip';
import {
  hotelContextForDay,
  hotelContextsByDayId,
} from '@/application/projections/hotel-context';
import { validateTrip } from '@/application/trip/validate-trip';
import {
  createItemTransactionRunner,
  createUpdateItemDetailsTransactionRunner,
} from '@/infrastructure/database/item-transaction';
import { runMigrations } from '@/infrastructure/database/migrations';
import { createDatabaseRuntime, type DatabaseBindParams, type DatabaseConnection, type DatabaseExecutor } from '@/infrastructure/database/runtime';
import { SqliteDayRepository } from '@/infrastructure/database/sqlite/day-repository';
import { SqliteItemRepository } from '@/infrastructure/database/sqlite/item-repository';
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
    if (this.database.isOpen) this.database.close();
  }
}

const createdAt = '2026-03-24T00:00:00.000Z';
const directories: string[] = [];
const connections: NodeSqliteConnection[] = [];

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function databasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'travel-app-m9-'));
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

test('Hotel and Transport Items persist, validate and project without any Leg state', async () => {
  const path = databasePath();
  const first = open(path);
  const ids = [
    'trip-1', 'day-1', 'day-2', 'day-3', 'day-4',
    'hotel-1', 'transport-1', 'sight-1',
  ];
  await createTrip({
    title: 'M9 Regression', startDate: '2026-03-10', endDate: '2026-03-13', mapRegion: 'china_mainland',
  }, {
    createId: sequence(ids), now: () => createdAt,
    runInTransaction: createTripDayTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  const add = (input: Parameters<typeof addItem>[0]) => addItem(input, {
    createId: sequence(ids), now: () => createdAt,
    runInTransaction: createItemTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  await add({
    tripId: 'trip-1', dayId: 'day-2', type: 'hotel', title: '北山酒店',
    timeMode: 'exact', startDateTime: '2026-03-11T19:00', endDateTime: '2026-03-13T08:30',
    payload: { kind: 'hotel' },
  });
  await add({
    tripId: 'trip-1', dayId: 'day-1', type: 'transport', title: 'K101 次列车',
    timeMode: 'exact', startDateTime: '2026-03-10T18:00', endDateTime: '2026-03-11T06:40',
    payload: { kind: 'transport', mode: 'train', origin: '北京', destination: '东城', serviceNumber: 'K101' },
  });
  await add({
    tripId: 'trip-1', dayId: 'day-3', type: 'sightseeing', title: '西谷湿地', timeMode: 'none',
  });

  // The hotel stay spans day-2 → day-4, so day-3 and day-4 carry context cards
  // while the check-in day shows nothing.
  const days = await first.runtime.runInReadContext(async (database) =>
    new SqliteDayRepository(database).listByTripId('trip-1'),
  );
  const items = await first.runtime.runInReadContext(async (database) => {
    const repository = new SqliteItemRepository(database);
    return (await Promise.all(
      days.map((day) => repository.listByDayId(day.id)),
    )).flat();
  });
  expect(hotelContextForDay(days[2], days, items)).toEqual({
    kind: 'stay', title: '北山酒店',
  });
  expect(hotelContextForDay(days[3], days, items)).toEqual({
    kind: 'checkout', title: '北山酒店', checkOutTime: '08:30',
  });
  expect(hotelContextForDay(days[0], days, items)).toBeNull();
  first.connection.close();

  // Reopen: payloads, canonical times and the projection all round-trip.
  const second = open(path);
  await second.runtime.runInReadContext(async (database) => {
    const repository = new SqliteItemRepository(database);
    const hotel = await repository.getById('hotel-1');
    expect(hotel).toMatchObject({
      type: 'hotel',
      payload: { kind: 'hotel' },
      startDateTime: '2026-03-11T19:00',
      endDateTime: '2026-03-13T08:30',
    });
    const transport = await repository.getById('transport-1');
    expect(transport?.payload).toEqual({
      kind: 'transport', mode: 'train', origin: '北京', destination: '东城', serviceNumber: 'K101',
    });

    const reopenedDays = await new SqliteDayRepository(database).listByTripId('trip-1');
    const allItems = (await Promise.all(
      reopenedDays.map((day) => repository.listByDayId(day.id)),
    )).flat();
    const contexts = hotelContextsByDayId(reopenedDays, allItems);
    expect(contexts.get('day-3')).toEqual({ kind: 'stay', title: '北山酒店' });
    expect(contexts.get('day-4')).toEqual({
      kind: 'checkout', title: '北山酒店', checkOutTime: '08:30',
    });
    expect(validateTrip({
      trip: {
        id: 'trip-1', title: 'M9 Regression', startDate: '2026-03-10', endDate: '2026-03-13',
        mapRegion: 'china_mainland', note: null, createdAt, updatedAt: createdAt,
      },
      items: allItems,
    })).toEqual([]);
  });

  // An offline edit of the transport payload round-trips too.
  const edit = (input: Parameters<typeof updateItemDetails>[0]) => updateItemDetails(input, {
    now: () => createdAt,
    runInTransaction: createUpdateItemDetailsTransactionRunner(second.runtime.runInExclusiveTransaction),
  });
  await edit({ itemId: 'transport-1', payload: { kind: 'transport', mode: 'train', origin: '北京', destination: '东城', serviceNumber: 'K1011' } });
  await second.runtime.runInReadContext(async (database) => {
    expect((await new SqliteItemRepository(database).getById('transport-1'))?.payload)
      .toEqual({ kind: 'transport', mode: 'train', origin: '北京', destination: '东城', serviceNumber: 'K1011' });
    // T6: ordinary adjacency stays Item order — no Leg entity anywhere.
    expect(await database.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'legs';", [],
    )).toEqual([]);
  });
  await second.runtime.runInReadContext(async (database) => {
    expect(await database.getAllAsync('PRAGMA foreign_key_check;', [])).toEqual([]);
  });
  second.connection.close();
});

test('an inverted hotel stay surfaces the dedicated validation issue', async () => {
  const path = databasePath();
  const first = open(path);
  const ids = ['trip-1', 'day-1', 'day-2', 'hotel-1'];
  await createTrip({
    title: 'M9 Inverted', startDate: '2026-03-10', endDate: '2026-03-11', mapRegion: 'china_mainland',
  }, {
    createId: sequence(ids), now: () => createdAt,
    runInTransaction: createTripDayTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  const add = (input: Parameters<typeof addItem>[0]) => addItem(input, {
    createId: sequence(ids), now: () => createdAt,
    runInTransaction: createItemTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  await add({
    tripId: 'trip-1', dayId: 'day-1', type: 'hotel', title: '北山酒店',
    timeMode: 'exact', startDateTime: '2026-03-11T19:00', endDateTime: '2026-03-10T08:30',
    payload: { kind: 'hotel' },
  });

  await first.runtime.runInReadContext(async (database) => {
    const days = await new SqliteDayRepository(database).listByTripId('trip-1');
    const allItems = (await Promise.all(
      days.map((day) => new SqliteItemRepository(database).listByDayId(day.id)),
    )).flat();
    expect(validateTrip({
      trip: { id: 'trip-1', title: 'M9 Inverted', startDate: '2026-03-10', endDate: '2026-03-11', mapRegion: 'china_mainland', note: null, createdAt, updatedAt: createdAt },
      items: allItems,
    }).map(({ type }) => type)).toEqual(['HOTEL_CHECKOUT_BEFORE_CHECKIN']);
  });
  first.connection.close();
});
