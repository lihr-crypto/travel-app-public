import { afterEach, expect, test } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';

import {
  deleteItem,
  type DeleteItemDependencies,
} from '@/application/item/delete-item';
import {
  restoreDeletedItem,
  type RestoreDeletedItemDependencies,
} from '@/application/item/restore-deleted-item';
import type { DeletedItemSnapshot } from '@/application/item/deleted-item-snapshot';
import type { Item } from '@/domain/item/types';
import type { Day, Trip } from '@/domain/trip/types';
import {
  createDeleteItemTransactionRunner,
  createRestoreDeletedItemTransactionRunner,
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
const restoredAt = '2026-10-03T11:00:00.000Z';
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
const days: Day[] = [
  {
    id: 'day-1',
    tripId: trip.id,
    date: '2026-12-30',
    dayIndex: 1,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: 'day-2',
    tripId: trip.id,
    date: '2026-12-31',
    dayIndex: 2,
    createdAt,
    updatedAt: createdAt,
  },
];

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

function snapshotOf(
  deleted: Item,
  previousItemId: string | null,
  nextItemId: string | null,
): DeletedItemSnapshot {
  return { item: deleted, previousItemId, nextItemId };
}

let connection: NodeSqliteConnection | undefined;
let runtime: ReturnType<typeof createDatabaseRuntime>;
let dependencies: RestoreDeletedItemDependencies;
let deleteDependencies: DeleteItemDependencies;

afterEach(() => {
  connection?.close();
  connection = undefined;
});

async function setup(items: Item[]) {
  connection = new NodeSqliteConnection();
  runtime = createDatabaseRuntime(async () => connection!, {
    initializeConnection: runMigrations,
  });
  await runtime.runInExclusiveTransaction(async (database) => {
    await new SqliteTripRepository(database).insert(trip);
    await new SqliteDayRepository(database).insertMany(days);
    const repository = new SqliteItemRepository(database);
    for (const value of items) {
      await repository.insert(value);
    }
  });
  dependencies = {
    now: () => restoredAt,
    runInTransaction: createRestoreDeletedItemTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };
  deleteDependencies = {
    now: () => restoredAt,
    runInTransaction: createDeleteItemTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };
}

async function dayItemIds(dayId: string) {
  return runtime.runInReadContext(async (database) =>
    (await new SqliteItemRepository(database).listByDayId(dayId)).map(
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

test('restores a deleted Item between both surviving neighbours', async () => {
  const middle = item('middle', days[0].id, 1);
  await setup([
    item('item-0', days[0].id, 0),
    middle,
    item('item-2', days[0].id, 2),
  ]);
  const snapshot = (await deleteItem({ itemId: 'middle' }, deleteDependencies))
    .data;

  const result = await restoreDeletedItem({ snapshot }, dependencies);

  expect(result.data).toMatchObject({
    id: 'middle',
    dayId: days[0].id,
    sortOrder: 1,
    note: 'Preserve me',
    createdAt,
    updatedAt: restoredAt,
  });
  expect(await dayItemIds(days[0].id)).toEqual([
    { id: 'item-0', sortOrder: 0 },
    { id: 'middle', sortOrder: 1 },
    { id: 'item-2', sortOrder: 2 },
  ]);
  expect(result.affectedEntityIds).toEqual(['middle', 'item-2']);
  expect(result.validationIssues).toEqual([]);
});

test('degrades gracefully when snapshot neighbours no longer survive', async () => {
  await setup([
    item('item-0', days[0].id, 0),
    item('middle', days[0].id, 1),
    item('item-2', days[0].id, 2),
  ]);
  const snapshot = (await deleteItem({ itemId: 'middle' }, deleteDependencies))
    .data;

  // Only the previous anchor survives.
  await runtime.runInExclusiveTransaction(async (database) => {
    await new SqliteItemRepository(database).delete('item-2');
  });
  const afterPrev = await restoreDeletedItem({ snapshot }, dependencies);
  expect(await dayItemIds(days[0].id)).toEqual([
    { id: 'item-0', sortOrder: 0 },
    { id: 'middle', sortOrder: 1 },
  ]);
  expect(afterPrev.data.sortOrder).toBe(1);

  // Only the next anchor survives.
  await runtime.runInExclusiveTransaction(async (database) => {
    const repository = new SqliteItemRepository(database);
    await repository.delete('middle');
    await repository.delete('item-0');
    await repository.insert(item('item-2', days[0].id, 0));
  });
  const afterNext = await restoreDeletedItem({ snapshot }, dependencies);
  expect(await dayItemIds(days[0].id)).toEqual([
    { id: 'middle', sortOrder: 0 },
    { id: 'item-2', sortOrder: 1 },
  ]);
  expect(afterNext.data.sortOrder).toBe(0);

  // Neither anchor survives: append at the end after unrelated Items.
  await runtime.runInExclusiveTransaction(async (database) => {
    const repository = new SqliteItemRepository(database);
    await repository.delete('middle');
    await repository.delete('item-2');
    await repository.insert(item('unrelated', days[0].id, 0));
  });
  const afterNeither = await restoreDeletedItem({ snapshot }, dependencies);
  expect(await dayItemIds(days[0].id)).toEqual([
    { id: 'unrelated', sortOrder: 0 },
    { id: 'middle', sortOrder: 1 },
  ]);
  expect(afterNeither.data.sortOrder).toBe(1);
});

test('restores an Unscheduled Item into the Unscheduled collection', async () => {
  await setup([
    item('unscheduled-0', null, 0),
    item('middle', null, 1),
    item('unscheduled-2', null, 2),
  ]);
  const snapshot = (await deleteItem({ itemId: 'middle' }, deleteDependencies))
    .data;

  await restoreDeletedItem({ snapshot }, dependencies);

  expect(await unscheduledItemIds()).toEqual([
    { id: 'unscheduled-0', sortOrder: 0 },
    { id: 'middle', sortOrder: 1 },
    { id: 'unscheduled-2', sortOrder: 2 },
  ]);
});

test('ignores a previous anchor that moved to another Day since the delete', async () => {
  const moved = item('item-0', days[0].id, 0);
  const middle = item('middle', days[0].id, 1);
  await setup([
    moved,
    middle,
    item('item-2', days[0].id, 2),
  ]);
  const snapshot = (await deleteItem({ itemId: 'middle' }, deleteDependencies))
    .data;

  await runtime.runInExclusiveTransaction(async (database) => {
    await new SqliteItemRepository(database).update({
      ...moved,
      dayId: days[1].id,
      sortOrder: 0,
    });
  });

  const result = await restoreDeletedItem({ snapshot }, dependencies);

  expect(result.data.sortOrder).toBe(0);
  expect(await dayItemIds(days[0].id)).toEqual([
    { id: 'middle', sortOrder: 0 },
    { id: 'item-2', sortOrder: 1 },
  ]);
  expect(await dayItemIds(days[1].id)).toEqual([{ id: 'item-0', sortOrder: 0 }]);
});

test('restores into an existing but empty Day', async () => {
  await setup([]);
  const snapshot = snapshotOf(item('restored', days[0].id, 0), null, null);

  const result = await restoreDeletedItem({ snapshot }, dependencies);

  expect(result.data.sortOrder).toBe(0);
  expect(await dayItemIds(days[0].id)).toEqual([
    { id: 'restored', sortOrder: 0 },
  ]);
});

test('fails closed on a duplicate Item id, a deleted Day and a foreign Day', async () => {
  await setup([
    item('item-0', days[0].id, 0),
    item('middle', days[0].id, 1),
    item('item-2', days[0].id, 2),
  ]);
  const snapshot = (await deleteItem({ itemId: 'middle' }, deleteDependencies))
    .data;

  await restoreDeletedItem({ snapshot }, dependencies);
  await expect(
    restoreDeletedItem({ snapshot }, dependencies),
  ).rejects.toThrow('Item already exists: middle');
  expect(await dayItemIds(days[0].id)).toEqual([
    { id: 'item-0', sortOrder: 0 },
    { id: 'middle', sortOrder: 1 },
    { id: 'item-2', sortOrder: 2 },
  ]);

  const deletedDaySnapshot = snapshotOf(
    item('elsewhere', 'missing-day', 0),
    null,
    null,
  );
  await expect(
    restoreDeletedItem({ snapshot: deletedDaySnapshot }, dependencies),
  ).rejects.toThrow('Target Day no longer exists: missing-day');

  const foreignSnapshot = snapshotOf(
    { ...item('foreign', days[1].id, 0), tripId: 'other-trip' },
    null,
    null,
  );
  await expect(
    restoreDeletedItem({ snapshot: foreignSnapshot }, dependencies),
  ).rejects.toThrow('Target Day must belong to the restored Item Trip');
});

test('rolls back the restore when the reindex write fails', async () => {
  await setup([
    item('item-0', days[0].id, 0),
    item('item-2', days[0].id, 1),
  ]);
  const snapshot = snapshotOf(item('middle', days[0].id, 1), 'item-0', 'item-2');
  const failingDependencies: RestoreDeletedItemDependencies = {
    now: () => restoredAt,
    runInTransaction: (task) =>
      runtime.runInExclusiveTransaction(async (database) => {
        const repository = new SqliteItemRepository(database);
        return task({
          days: new SqliteDayRepository(database),
          items: {
            getById: (id) => repository.getById(id),
            listByDayId: (dayId) => repository.listByDayId(dayId),
            listUnscheduledByTripId: (tripId) =>
              repository.listUnscheduledByTripId(tripId),
            insert: (value) => repository.insert(value),
            updateMany: async (updates) => {
              await repository.update(updates[0]);
              throw new Error('forced reindex failure');
            },
          },
        });
      }),
  };

  await expect(
    restoreDeletedItem({ snapshot }, failingDependencies),
  ).rejects.toThrow('forced reindex failure');

  expect(await dayItemIds(days[0].id)).toEqual([
    { id: 'item-0', sortOrder: 0 },
    { id: 'item-2', sortOrder: 1 },
  ]);
});
