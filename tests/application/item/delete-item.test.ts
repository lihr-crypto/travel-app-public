import { afterEach, expect, test } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';

import {
  deleteItem,
  type DeleteItemDependencies,
} from '@/application/item/delete-item';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day, Trip } from '@/domain/trip/types';
import {
  createDeleteItemTransactionRunner,
} from '@/infrastructure/database/item-transaction';
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
      (this.database.prepare(source).get(...nodeParams(params)) as
        | T
        | undefined) ?? null
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
const deletedAt = '2026-10-03T10:00:00.000Z';
const trip: Trip = {
  id: 'trip-1',
  title: 'Trip',
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
  date: '2026-12-30',
  dayIndex: 1,
  createdAt,
  updatedAt: createdAt,
};

function item(id: string, dayId: string | null, sortOrder: number): Item {
  return {
    id,
    tripId: trip.id,
    dayId,
    placeId: null,
    type: 'custom',
    title: id,
    sortOrder,
    timeMode: 'exact',
    startDateTime: '2026-12-30T09:00',
    endDateTime: '2026-12-30T10:00',
    period: null,
    isFixed: true,
    note: 'Preserve me',
    payload: null,
    createdAt,
    updatedAt: createdAt,
  };
}

const place: Place = {
  id: 'place-1',
  name: '颐和园',
  coordinate: { latitude: 39.999676, longitude: 116.275118, system: 'gcj02' },
  address: '新建宫门路19号',
  provider: 'amap',
  providerPlaceId: 'B000SAMP01',
  metadata: { typeCode: '110200' },
  createdAt,
  updatedAt: createdAt,
};

let connection: NodeSqliteConnection | undefined;
let runtime: ReturnType<typeof createDatabaseRuntime>;
let dependencies: DeleteItemDependencies;

afterEach(() => {
  connection?.close();
  connection = undefined;
});

async function setup(items: Item[], withPlace = false) {
  connection = new NodeSqliteConnection();
  runtime = createDatabaseRuntime(async () => connection!, {
    initializeConnection: runMigrations,
  });
  await runtime.runInExclusiveTransaction(async (database) => {
    await new SqliteTripRepository(database).insert(trip);
    await new SqliteDayRepository(database).insertMany([day]);

    if (withPlace) {
      await new SqlitePlaceRepository(database).insert(place);
    }

    const repository = new SqliteItemRepository(database);
    for (const value of items) {
      await repository.insert(value);
    }
  });
  dependencies = {
    now: () => deletedAt,
    runInTransaction: createDeleteItemTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };
}

async function dayItemIds() {
  return runtime.runInReadContext(async (database) =>
    (await new SqliteItemRepository(database).listByDayId(day.id)).map(
      ({ id, sortOrder }) => ({ id, sortOrder }),
    ),
  );
}

async function unscheduledItemIds() {
  return runtime.runInReadContext(async (database) =>
    (await new SqliteItemRepository(database).listUnscheduledByTripId(trip.id)).map(
      ({ id, sortOrder }) => ({ id, sortOrder }),
    ),
  );
}

test('deletes a middle Day Item, reindexes the survivors and captures both neighbours', async () => {
  await setup([
    item('item-0', day.id, 0),
    item('deleted', day.id, 1),
    item('item-2', day.id, 2),
  ]);

  const result = await deleteItem({ itemId: 'deleted' }, dependencies);

  expect(result.data.item).toMatchObject({
    id: 'deleted',
    tripId: trip.id,
    dayId: day.id,
    note: 'Preserve me',
  });
  expect(result.data.previousItemId).toBe('item-0');
  expect(result.data.nextItemId).toBe('item-2');
  expect(Object.keys(result.data).sort()).toEqual([
    'item',
    'nextItemId',
    'previousItemId',
  ]);
  expect(await dayItemIds()).toEqual([
    { id: 'item-0', sortOrder: 0 },
    { id: 'item-2', sortOrder: 1 },
  ]);
  expect(result.affectedEntityIds).toEqual(['deleted', 'item-2']);
  expect(result.validationIssues).toEqual([]);
});

test('captures null neighbour edges at the collection boundaries', async () => {
  await setup([
    item('first', day.id, 0),
    item('second', day.id, 1),
  ]);

  const firstResult = await deleteItem({ itemId: 'first' }, dependencies);

  expect(firstResult.data.previousItemId).toBeNull();
  expect(firstResult.data.nextItemId).toBe('second');

  await setup([
    item('second', day.id, 0),
    item('last', day.id, 1),
  ]);

  const lastResult = await deleteItem({ itemId: 'last' }, dependencies);

  expect(lastResult.data.previousItemId).toBe('second');
  expect(lastResult.data.nextItemId).toBeNull();
});

test('deletes an Unscheduled Item from the Trip Unscheduled collection', async () => {
  await setup([
    item('unscheduled-0', null, 0),
    item('deleted', null, 1),
    item('unscheduled-2', null, 2),
  ]);

  const result = await deleteItem({ itemId: 'deleted' }, dependencies);

  expect(result.data.item).toMatchObject({ id: 'deleted', dayId: null });
  expect(result.data.previousItemId).toBe('unscheduled-0');
  expect(result.data.nextItemId).toBe('unscheduled-2');
  expect(await unscheduledItemIds()).toEqual([
    { id: 'unscheduled-0', sortOrder: 0 },
    { id: 'unscheduled-2', sortOrder: 1 },
  ]);
  expect(result.affectedEntityIds).toEqual(['deleted', 'unscheduled-2']);
});

test('rejects a missing Item without writing anything', async () => {
  await setup([item('item-0', day.id, 0)]);

  await expect(
    deleteItem({ itemId: 'missing' }, dependencies),
  ).rejects.toThrow('Item not found: missing');

  expect(await dayItemIds()).toEqual([{ id: 'item-0', sortOrder: 0 }]);
});

test('rolls back the delete when the reindex write fails', async () => {
  await setup([
    item('deleted', day.id, 0),
    item('item-1', day.id, 1),
  ]);
  const failingDependencies: DeleteItemDependencies = {
    now: () => deletedAt,
    runInTransaction: (task) =>
      runtime.runInExclusiveTransaction(async (database) => {
        const repository = new SqliteItemRepository(database);
        return task({
          items: {
            getById: (id) => repository.getById(id),
            listByDayId: (dayId) => repository.listByDayId(dayId),
            listUnscheduledByTripId: (tripId) =>
              repository.listUnscheduledByTripId(tripId),
            delete: (id) => repository.delete(id),
            updateMany: async (updates) => {
              await repository.update(updates[0]);
              throw new Error('forced reindex failure');
            },
          },
        });
      }),
  };

  await expect(
    deleteItem({ itemId: 'deleted' }, failingDependencies),
  ).rejects.toThrow('forced reindex failure');

  expect(await dayItemIds()).toEqual([
    { id: 'deleted', sortOrder: 0 },
    { id: 'item-1', sortOrder: 1 },
  ]);
});

test('keeps the referenced Place row and snapshots no Place data beyond the Item', async () => {
  const placedItem: Item = {
    ...item('placed', day.id, 0),
    placeId: place.id,
    type: 'sightseeing',
  };
  await setup([placedItem, item('item-1', day.id, 1)], true);

  const result = await deleteItem({ itemId: 'placed' }, dependencies);

  expect(result.data.item.placeId).toBe(place.id);
  await runtime.runInReadContext(async (database) => {
    expect(await new SqlitePlaceRepository(database).getById(place.id))
      .toMatchObject({ id: place.id, name: '颐和园' });
    expect(
      await database.getAllAsync('PRAGMA foreign_key_check;', []),
    ).toEqual([]);
  });
  expect(await dayItemIds()).toEqual([{ id: 'item-1', sortOrder: 0 }]);
});
