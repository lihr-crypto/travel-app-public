import { afterEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { addItem } from '@/application/item/add-item';
import { moveItemToDay } from '@/application/item/move-item-to-day';
import { moveItemToUnscheduled } from '@/application/item/move-item-to-unscheduled';
import { reorderItem } from '@/application/item/reorder-item';
import { changeTripDateRange } from '@/application/trip/change-trip-date-range';
import { createTrip } from '@/application/trip/create-trip';
import type { Item } from '@/domain/item/types';
import { createItemTransactionRunner, createMoveItemToDayTransactionRunner, createMoveItemToUnscheduledTransactionRunner, createReorderItemTransactionRunner } from '@/infrastructure/database/item-transaction';
import { runMigrations } from '@/infrastructure/database/migrations';
import { createDatabaseRuntime, type DatabaseBindParams, type DatabaseConnection, type DatabaseExecutor } from '@/infrastructure/database/runtime';
import { SqliteDayRepository } from '@/infrastructure/database/sqlite/day-repository';
import { SqliteItemRepository } from '@/infrastructure/database/sqlite/item-repository';
import { SqliteTripRepository } from '@/infrastructure/database/sqlite/trip-repository';
import { createTripDateRangeTransactionRunner } from '@/infrastructure/database/trip-date-range-transaction';
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
  close() { this.database.close(); }
}

const timestamp = '2026-09-12T00:00:00.000Z';
const directories: string[] = [];
const connections: NodeSqliteConnection[] = [];

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function databasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'travel-app-m3-'));
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

async function snapshot(runtime: ReturnType<typeof createDatabaseRuntime>) {
  return runtime.runInReadContext(async (database) => {
    const trips = new SqliteTripRepository(database);
    const days = await new SqliteDayRepository(database).listByTripId('trip-1');
    const items = new SqliteItemRepository(database);
    const byDay = await Promise.all(days.map(async (day) => ({
      day,
      items: await items.listByDayId(day.id),
    })));
    return {
      trip: await trips.getById('trip-1'),
      byDay,
      unscheduled: await items.listUnscheduledByTripId('trip-1'),
    };
  });
}

function assertConsecutiveOrder(items: readonly Item[]) {
  expect(items.map(({ sortOrder }) => sortOrder)).toEqual(
    items.map((_, index) => index),
  );
}

test('a cross-command itinerary remains lossless and ordered after SQLite reopen', async () => {
  const path = databasePath();
  const first = open(path);
  const ids = sequence(['trip-1', 'day-1', 'day-2', 'day-3', 'a', 'b', 'c', 'd', 'u']);
  await createTrip({
    title: 'M3 Regression', startDate: '2026-09-19', endDate: '2026-09-21', mapRegion: 'global',
  }, {
    createId: ids, now: () => timestamp,
    runInTransaction: createTripDayTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  const add = (input: Parameters<typeof addItem>[0]) => addItem(input, {
    createId: ids, now: () => timestamp,
    runInTransaction: createItemTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  const base = { tripId: 'trip-1', type: 'custom' as const };
  await add({ ...base, dayId: 'day-1', title: 'A', timeMode: 'exact', startDateTime: '2026-09-19T23:00', endDateTime: '2026-09-20T01:00' });
  await add({ ...base, dayId: 'day-1', title: 'B' });
  await add({ ...base, dayId: 'day-2', title: 'C' });
  await add({ ...base, dayId: 'day-3', title: 'D', timeMode: 'exact', startDateTime: '2026-09-21T19:00', endDateTime: '2026-09-22T08:30' });
  await add({ ...base, dayId: null, title: 'U' });

  await reorderItem({ itemId: 'b', position: { type: 'start' } }, {
    now: () => timestamp,
    runInTransaction: createReorderItemTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  await moveItemToDay({ itemId: 'a', targetDayId: 'day-2', position: { type: 'start' } }, {
    now: () => timestamp,
    runInTransaction: createMoveItemToDayTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  await moveItemToUnscheduled({ itemId: 'c' }, {
    now: () => timestamp,
    runInTransaction: createMoveItemToUnscheduledTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  await moveItemToDay({ itemId: 'c', targetDayId: 'day-3', position: { type: 'start' } }, {
    now: () => timestamp,
    runInTransaction: createMoveItemToDayTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  const rangeResult = await changeTripDateRange({
    tripId: 'trip-1', startDate: '2026-09-19', endDate: '2026-09-20', strategy: 'keepCalendarDates',
  }, {
    createId: ids, now: () => timestamp,
    runInTransaction: createTripDateRangeTransactionRunner(first.runtime.runInExclusiveTransaction),
  });
  expect(rangeResult.validationIssues).toEqual([
    expect.objectContaining({ itemId: 'd', type: 'ITEM_OUTSIDE_TRIP_RANGE', severity: 'warning' }),
  ]);

  first.connection.close();
  connections.splice(connections.indexOf(first.connection), 1);
  const second = open(path);
  const saved = await snapshot(second.runtime);
  expect(saved.trip).toMatchObject({ startDate: '2026-09-19', endDate: '2026-09-20' });
  expect(saved.byDay.map(({ day }) => [day.id, day.date])).toEqual([
    ['day-1', '2026-09-19'], ['day-2', '2026-09-20'],
  ]);
  expect(saved.byDay[0].items.map(({ id }) => id)).toEqual(['b']);
  expect(saved.byDay[1].items.map(({ id }) => id)).toEqual(['a']);
  expect(saved.unscheduled.map(({ id }) => id)).toEqual(['u', 'c', 'd']);
  expect(saved.byDay[1].items[0]).toMatchObject({
    startDateTime: '2026-09-19T23:00', endDateTime: '2026-09-20T01:00',
  });
  expect(saved.unscheduled[2]).toMatchObject({
    startDateTime: '2026-09-21T19:00', endDateTime: '2026-09-22T08:30',
  });
  for (const { items } of saved.byDay) assertConsecutiveOrder(items);
  assertConsecutiveOrder(saved.unscheduled);
  const allIds = [...saved.byDay.flatMap(({ items }) => items), ...saved.unscheduled].map(({ id }) => id);
  expect([...allIds].sort()).toEqual(['a', 'b', 'c', 'd', 'u']);
  expect(second.connection.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

test('same-length strategies produce distinct dated-Item outcomes', async () => {
  for (const strategy of ['shiftItems', 'keepCalendarDates'] as const) {
    const harness = open(databasePath());
    const ids = sequence(['trip-1', 'day-1', 'day-2', 'day-3', 'item-1', 'day-new']);
    await createTrip({
      title: strategy, startDate: '2026-09-19', endDate: '2026-09-21', mapRegion: 'global',
    }, {
      createId: ids, now: () => timestamp,
      runInTransaction: createTripDayTransactionRunner(harness.runtime.runInExclusiveTransaction),
    });
    await addItem({
      tripId: 'trip-1', dayId: 'day-1', title: 'Cross midnight', type: 'custom',
      timeMode: 'exact', startDateTime: '2026-09-19T23:00', endDateTime: '2026-09-20T01:00',
    }, {
      createId: ids, now: () => timestamp,
      runInTransaction: createItemTransactionRunner(harness.runtime.runInExclusiveTransaction),
    });
    const result = await changeTripDateRange({
      tripId: 'trip-1', startDate: '2026-09-20', endDate: '2026-09-22', strategy,
    }, {
      createId: ids, now: () => timestamp,
      runInTransaction: createTripDateRangeTransactionRunner(harness.runtime.runInExclusiveTransaction),
    });
    const saved = await snapshot(harness.runtime);
    const item = saved.byDay.flatMap(({ items }) => items).concat(saved.unscheduled)[0];
    expect(item.id).toBe('item-1');
    if (strategy === 'shiftItems') {
      expect(saved.byDay.map(({ day }) => day.id)).toEqual(['day-1', 'day-2', 'day-3']);
      expect(item).toMatchObject({ dayId: 'day-1', startDateTime: '2026-09-20T23:00', endDateTime: '2026-09-21T01:00' });
      expect(result.validationIssues).toEqual([]);
    } else {
      expect(saved.byDay.map(({ day }) => day.id)).toEqual(['day-2', 'day-3', 'day-new']);
      expect(item).toMatchObject({ dayId: null, startDateTime: '2026-09-19T23:00', endDateTime: '2026-09-20T01:00' });
      expect(result.validationIssues).toEqual([expect.objectContaining({ itemId: 'item-1', type: 'ITEM_OUTSIDE_TRIP_RANGE' })]);
    }
    expect(harness.connection.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  }
});
