import { afterEach, expect, test } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  updateItemDetails,
  type UpdateItemDetailsDependencies,
  type UpdateItemDetailsInput,
} from '@/application/item/update-item-details';
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
import { SqlitePlaceRepository } from '@/infrastructure/database/sqlite/place-repository';
import { SqliteTripRepository } from '@/infrastructure/database/sqlite/trip-repository';
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

  constructor(filename = ':memory:') {
    this.database = new DatabaseSync(filename);
    this.database.exec('PRAGMA foreign_keys = ON;');
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
    this.database.close();
  }
}

const createdAt = '2026-09-11T12:00:00.000Z';
const updatedAt = '2026-09-11T13:00:00.000Z';
const trip: Trip = {
  id: 'trip-1',
  title: 'Hokkaido',
  startDate: '2026-12-30',
  endDate: '2026-12-31',
  mapRegion: 'global',
  note: null,
  createdAt,
  updatedAt: createdAt,
};
const day: Day = {
  id: 'day-1',
  tripId: trip.id,
  date: trip.startDate,
  dayIndex: 1,
  createdAt,
  updatedAt: createdAt,
};
const originalItem: Item = {
  id: 'item-1',
  tripId: trip.id,
  dayId: day.id,
  placeId: null,
  type: 'custom',
  title: 'Draft',
  sortOrder: 7,
  timeMode: 'none',
  startDateTime: null,
  endDateTime: null,
  period: null,
  isFixed: false,
  note: null,
  payload: null,
  createdAt,
  updatedAt: createdAt,
};

let connection: NodeSqliteConnection | undefined;
let temporaryDirectory: string | undefined;
let dependencies: UpdateItemDetailsDependencies;

afterEach(() => {
  connection?.close();
  connection = undefined;
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

async function setup(databasePath?: string) {
  connection = new NodeSqliteConnection(databasePath);
  const runtime = createDatabaseRuntime(async () => connection!, {
    initializeConnection: runMigrations,
  });
  await runtime.runInExclusiveTransaction(async (database) => {
    await new SqliteTripRepository(database).insert(trip);
    await new SqliteDayRepository(database).insertMany([day]);
    await new SqliteItemRepository(database).insert(originalItem);
  });
  dependencies = {
    now: () => updatedAt,
    runInTransaction: createUpdateItemDetailsTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };
}

test('updates allowed details while preserving structural fields', async () => {
  await setup();
  const input = {
    itemId: originalItem.id,
    title: '  Dinner train  ',
    type: 'transport',
    timeMode: 'exact',
    startDateTime: '2026-12-30T18:00',
    endDateTime: '2026-12-30T19:00',
    period: null,
    isFixed: true,
    note: 'Reserved',
    payload: { kind: 'transport', serviceNumber: 'AP-2' },
    tripId: 'malicious-trip',
    dayId: null,
    sortOrder: 999,
  } as UpdateItemDetailsInput & {
    tripId: string;
    dayId: null;
    sortOrder: number;
  };

  const result = await updateItemDetails(input, dependencies);

  expect(result.data).toMatchObject({
    id: originalItem.id,
    tripId: originalItem.tripId,
    dayId: originalItem.dayId,
    sortOrder: 0,
    title: 'Dinner train',
    type: 'transport',
    timeMode: 'exact',
    startDateTime: '2026-12-30T18:00',
    endDateTime: '2026-12-30T19:00',
    isFixed: true,
    note: 'Reserved',
    payload: { kind: 'transport', serviceNumber: 'AP-2' },
    createdAt,
    updatedAt,
  });
  expect(result.affectedEntityIds).toEqual([originalItem.id]);
  expect(
    await new SqliteItemRepository(connection!).getById(originalItem.id),
  ).toEqual(result.data);
});

const editorPickedResult = {
  name: '新地点', address: '新地址', regionLabel: null, provider: 'google' as const, providerPlaceId: 'new-google-id',
  coordinate: { latitude: 35.68, longitude: 139.76, system: 'wgs84' as const }, metadata: null,
};

test('editor Place selection and arrival-only fields commit in one exclusive transaction', async () => {
  await setup();
  const saved = await updateItemDetails({ itemId: originalItem.id, title: '到达', note: '草稿备注',
    timeMode: 'exact', startDateTime: null, endDateTime: '2026-12-30T09:35', period: null,
    placeTarget: { kind: 'search', result: editorPickedResult } }, { ...dependencies, createPlaceId: () => 'editor-place' });
  expect(saved.data).toMatchObject({ placeId: 'editor-place', dayId: originalItem.dayId, tripId: trip.id,
    title: '到达', note: '草稿备注', startDateTime: null, endDateTime: '2026-12-30T09:35' });
  expect(await new SqlitePlaceRepository(connection!).getById('editor-place')).toMatchObject({
    name: editorPickedResult.name, address: editorPickedResult.address, coordinate: editorPickedResult.coordinate,
  });
  expect(saved.affectedEntityIds).toContain('editor-place');
});

test('invalid editor time rolls back the new Place snapshot and its association together', async () => {
  await setup();
  await expect(updateItemDetails({ itemId: originalItem.id, title: '不能提交',
    timeMode: 'exact', startDateTime: '2026-12-30T99:00', endDateTime: '2026-12-30T17:00', period: null,
    placeTarget: { kind: 'search', result: editorPickedResult } }, { ...dependencies, createPlaceId: () => 'editor-place' })).rejects.toThrow();
  expect(await new SqlitePlaceRepository(connection!).getById('editor-place')).toBeNull();
  expect(await new SqliteItemRepository(connection!).getById(originalItem.id)).toEqual(originalItem);
});

test('changing only Place with identical time fields preserves the existing manual sort order', async () => {
  await setup();
  const result = await updateItemDetails({ itemId: originalItem.id, timeMode: originalItem.timeMode,
    startDateTime: originalItem.startDateTime, endDateTime: originalItem.endDateTime, period: originalItem.period,
    placeTarget: { kind: 'search', result: editorPickedResult } }, { ...dependencies, createPlaceId: () => 'editor-place' });
  expect(result.data.sortOrder).toBe(originalItem.sortOrder);
});

test('editor source mismatch is rejected without committing other draft fields', async () => {
  await setup();
  await expect(updateItemDetails({ itemId: originalItem.id, title: '不能提交',
    placeTarget: { kind: 'search', result: { ...editorPickedResult, provider: 'amap',
      coordinate: { latitude: 39.9, longitude: 116.4, system: 'gcj02' } } } },
  { ...dependencies, createPlaceId: () => 'editor-place' })).rejects.toThrow();
  expect(await new SqlitePlaceRepository(connection!).getById('editor-place')).toBeNull();
  expect(await new SqliteItemRepository(connection!).getById(originalItem.id)).toEqual(originalItem);
});

test('clearing departure preserves an existing arrival endpoint', async () => {
  await setup();
  await updateItemDetails({
    itemId: originalItem.id,
    timeMode: 'exact',
    startDateTime: '2026-12-30T18:00',
    endDateTime: '2026-12-30T19:20',
  }, dependencies);

  const result = await updateItemDetails({
    itemId: originalItem.id,
    startDateTime: null,
  }, dependencies);

  expect(result.data).toMatchObject({
    timeMode: 'exact',
    startDateTime: null,
    endDateTime: '2026-12-30T19:20',
  });
  expect(await new SqliteItemRepository(connection!).getById(originalItem.id))
    .toEqual(result.data);
});

test('normalizes and preserves an updated custom payload across SQLite reopen', async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'travel-update-item-'));
  const databasePath = join(temporaryDirectory, 'travel.sqlite');
  await setup(databasePath);

  const result = await updateItemDetails({
    itemId: originalItem.id,
    payload: { kind: 'custom', label: '  Noodle shop  ' },
  }, dependencies);

  expect(result.data.payload).toEqual({ kind: 'custom', label: 'Noodle shop' });
  connection!.close();
  connection = new NodeSqliteConnection(databasePath);
  await runMigrations(connection);

  expect(await new SqliteItemRepository(connection).getById(originalItem.id))
    .toEqual(result.data);
});

test('changing an Item to an ordinary type clears its previous special payload', async () => {
  await setup();
  const hotel: Item = { ...originalItem, type: 'hotel', payload: { kind: 'hotel' } };
  await new SqliteItemRepository(connection!).update(hotel);

  const result = await updateItemDetails({
    itemId: originalItem.id,
    type: 'food',
  }, dependencies);

  expect(result.data.type).toBe('food');
  expect(result.data.payload).toBeNull();
  expect(await new SqliteItemRepository(connection!).getById(originalItem.id))
    .toEqual(result.data);
});

test('partial update preserves every omitted detail', async () => {
  await setup();

  const result = await updateItemDetails(
    { itemId: originalItem.id, note: 'Only this changed' },
    dependencies,
  );

  expect(result.data).toEqual({
    ...originalItem,
    note: 'Only this changed',
    updatedAt,
  });
});

test('editing an Item time reorders persisted peers and rewrites continuous sortOrder', async () => {
  await setup();
  const items = new SqliteItemRepository(connection!);
  await items.insert({
    ...originalItem,
    id: 'item-afternoon',
    title: 'Afternoon',
    sortOrder: 0,
    timeMode: 'exact',
    startDateTime: '2026-12-30T15:00',
  });
  await items.insert({
    ...originalItem,
    id: 'item-untimed',
    title: 'Untimed peer',
    sortOrder: 1,
  });

  const result = await updateItemDetails({
    itemId: originalItem.id,
    timeMode: 'exact',
    startDateTime: '2026-12-30T09:30',
  }, dependencies);
  const ordered = await items.listByDayId(day.id);

  expect(ordered.map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
    [originalItem.id, 0],
    ['item-afternoon', 1],
    ['item-untimed', 2],
  ]);
  expect(result.data.sortOrder).toBe(0);
  expect(result.affectedEntityIds).toEqual(expect.arrayContaining([
    originalItem.id, 'item-afternoon', 'item-untimed',
  ]));
});

test('time updates persist noon bucket order with stable ties and mixed time modes', async () => {
  await setup();
  const items = new SqliteItemRepository(connection!);
  const makePeriodPeer = (id: string, sortOrder: number, period: 'morning' | 'noon'): Item => ({
    ...originalItem,
    id,
    title: id,
    sortOrder,
    timeMode: 'period',
    startDateTime: null,
    endDateTime: null,
    period,
  });
  const makeExactPeer = (id: string, sortOrder: number, time: string): Item => ({
    ...originalItem,
    id,
    title: id,
    sortOrder,
    timeMode: 'exact',
    startDateTime: `2026-12-30T${time}`,
    endDateTime: null,
    period: null,
  });

  await items.insert(makePeriodPeer('noon-period-first', 0, 'noon'));
  await items.insert(makeExactPeer('noon-exact-first', 1, '11:00'));
  await items.insert(makeExactPeer('afternoon-exact', 2, '14:00'));
  await items.insert(makePeriodPeer('morning-period', 3, 'morning'));
  await items.insert(makePeriodPeer('noon-period-second', 4, 'noon'));
  await items.insert(makeExactPeer('noon-exact-second', 5, '11:00'));

  await updateItemDetails({
    itemId: originalItem.id,
    timeMode: 'exact',
    startDateTime: '2026-12-30T11:00',
  }, dependencies);

  const ordered = await items.listByDayId(day.id);
  expect(ordered.map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
    ['morning-period', 0],
    ['noon-exact-first', 1],
    ['noon-exact-second', 2],
    [originalItem.id, 3],
    ['noon-period-first', 4],
    ['noon-period-second', 5],
    ['afternoon-exact', 6],
  ]);
});

test('rejects a blank title before starting persistence', async () => {
  let transactionCalls = 0;

  await expect(
    updateItemDetails(
      { itemId: originalItem.id, title: ' \n ' },
      {
        now: () => updatedAt,
        runInTransaction: async () => {
          transactionCalls += 1;
          throw new Error('Persistence should not start');
        },
      },
    ),
  ).rejects.toThrow('Item title must not be empty');
  expect(transactionCalls).toBe(0);
});

test('rejects missing Items and inconsistent merged details without writes', async () => {
  await setup();
  const repository = new SqliteItemRepository(connection!);

  await expect(
    updateItemDetails({ itemId: 'missing' }, dependencies),
  ).rejects.toThrow('Item not found: missing');
  await expect(
    updateItemDetails(
      { itemId: originalItem.id, timeMode: 'exact' },
      dependencies,
    ),
  ).rejects.toThrow(
    'Item timeMode exact requires startDateTime or endDateTime and no period',
  );
  await expect(
    updateItemDetails(
      {
        itemId: originalItem.id,
        type: 'food',
        payload: { kind: 'hotel' },
      },
      dependencies,
    ),
  ).rejects.toThrow('Item payload does not match type: food');
  await expect(
    updateItemDetails(
      {
        itemId: originalItem.id,
        payload: { kind: 'custom', label: 'x'.repeat(21) },
      },
      dependencies,
    ),
  ).rejects.toThrow('Custom Item label must not exceed 20 characters');
  await expect(
    updateItemDetails(
      {
        itemId: originalItem.id,
        payload: { kind: 'custom' } as unknown as UpdateItemDetailsInput['payload'],
      },
      dependencies,
    ),
  ).rejects.toThrow('Invalid custom Item payload');
  await expect(
    updateItemDetails(
      {
        itemId: originalItem.id,
        type: 'hotel',
        payload: { kind: 'transport' },
      },
      dependencies,
    ),
  ).rejects.toThrow('Item payload does not match type: hotel');

  expect(await repository.getById(originalItem.id)).toEqual(originalItem);
});

test('rolls back a persisted update when the semantic transaction fails', async () => {
  await setup();
  const runtime = createDatabaseRuntime(async () => connection!);

  await expect(
    updateItemDetails(
      { itemId: originalItem.id, title: 'Should roll back' },
      {
        now: () => updatedAt,
        runInTransaction: (task) =>
          runtime.runInExclusiveTransaction(async (database) => {
            const items = new SqliteItemRepository(database);

            return task({
              items: {
                getById: (id) => items.getById(id),
                listByDayId: (id) => items.listByDayId(id),
                listUnscheduledByTripId: (id) => items.listUnscheduledByTripId(id),
                updateMany: (changed) => items.updateMany(changed),
                update: async (item) => {
                  await items.update(item);
                  throw new Error('forced Item update failure');
                },
              },
            });
          }),
      },
    ),
  ).rejects.toThrow('forced Item update failure');

  expect(
    await new SqliteItemRepository(connection!).getById(originalItem.id),
  ).toEqual(originalItem);
});

test('rolls back both a time edit and peer reindexing when the exclusive transaction fails', async () => {
  await setup();
  const items = new SqliteItemRepository(connection!);
  const afternoon: Item = {
    ...originalItem,
    id: 'item-afternoon',
    title: 'Afternoon',
    sortOrder: 0,
    timeMode: 'exact',
    startDateTime: '2026-12-30T15:00',
  };
  const untimed: Item = {
    ...originalItem,
    id: 'item-untimed',
    title: 'Untimed peer',
    sortOrder: 1,
  };
  await items.insert(afternoon);
  await items.insert(untimed);
  const before = await items.listByDayId(day.id);
  const runtime = createDatabaseRuntime(async () => connection!);

  await expect(updateItemDetails(
    { itemId: originalItem.id, timeMode: 'exact', startDateTime: '2026-12-30T09:30' },
    {
      now: () => updatedAt,
      runInTransaction: (task) => runtime.runInExclusiveTransaction(async (database) => {
        const repository = new SqliteItemRepository(database);
        return task({
          items: {
            getById: (id) => repository.getById(id),
            listByDayId: (id) => repository.listByDayId(id),
            listUnscheduledByTripId: (id) => repository.listUnscheduledByTripId(id),
            update: (item) => repository.update(item),
            updateMany: async (changed) => {
              await repository.updateMany(changed);
              throw new Error('forced peer reindex failure');
            },
          },
        });
      }),
    },
  )).rejects.toThrow('forced peer reindex failure');

  expect(await items.listByDayId(day.id)).toEqual(before);
});
