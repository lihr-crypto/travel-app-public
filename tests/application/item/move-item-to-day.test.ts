import { afterEach, expect, test } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';

import {
  moveItemToDay,
  type MoveItemToDayDependencies,
} from '@/application/item/move-item-to-day';
import {
  moveItemToUnscheduled,
  type MoveItemToUnscheduledDependencies,
} from '@/application/item/move-item-to-unscheduled';
import {
  reorderItem,
  type ReorderItemDependencies,
} from '@/application/item/reorder-item';
import type { Item } from '@/domain/item/types';
import type { Day, Trip } from '@/domain/trip/types';
import {
  createMoveItemToDayTransactionRunner,
  createMoveItemToUnscheduledTransactionRunner,
  createReorderItemTransactionRunner,
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
const movedAt = '2026-09-12T09:00:00.000Z';
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

let connection: NodeSqliteConnection | undefined;
let runtime: ReturnType<typeof createDatabaseRuntime>;
let dependencies: MoveItemToDayDependencies;

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
    now: () => movedAt,
    runInTransaction: createMoveItemToDayTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };
}

async function itemIds(dayId: string) {
  return runtime.runInReadContext(async (database) =>
    (await new SqliteItemRepository(database).listByDayId(dayId)).map(
      ({ id, sortOrder }) => ({ id, sortOrder }),
    ),
  );
}

test('moves an Item before a target Item and reindexes both Days', async () => {
  await setup([
    item('source-0', days[0].id, 0),
    item('moving', days[0].id, 1),
    item('source-2', days[0].id, 2),
    item('target-0', days[1].id, 0),
    item('target-1', days[1].id, 1),
  ]);

  const result = await moveItemToDay(
    {
      itemId: 'moving',
      targetDayId: days[1].id,
      position: { type: 'before', itemId: 'target-1' },
    },
    dependencies,
  );

  expect(await itemIds(days[0].id)).toEqual([
    { id: 'source-0', sortOrder: 0 },
    { id: 'source-2', sortOrder: 1 },
  ]);
  expect(await itemIds(days[1].id)).toEqual([
    { id: 'target-0', sortOrder: 0 },
    { id: 'moving', sortOrder: 1 },
    { id: 'target-1', sortOrder: 2 },
  ]);
  expect(result.data).toMatchObject({
    id: 'moving',
    dayId: days[1].id,
    sortOrder: 1,
    startDateTime: '2026-12-30T09:00',
    endDateTime: '2026-12-30T10:00',
    isFixed: true,
    note: 'Preserve me',
    updatedAt: movedAt,
  });
  expect(result.affectedEntityIds).toEqual([
    'source-2',
    'moving',
    'target-1',
  ]);
});

test('moves an Unscheduled Item to the target Day end and reindexes Unscheduled', async () => {
  await setup([
    item('unscheduled-0', null, 0),
    item('moving', null, 1),
    item('unscheduled-2', null, 2),
    item('target-0', days[1].id, 0),
  ]);

  const result = await moveItemToDay(
    { itemId: 'moving', targetDayId: days[1].id },
    dependencies,
  );

  expect(await itemIds(days[1].id)).toEqual([
    { id: 'target-0', sortOrder: 0 },
    { id: 'moving', sortOrder: 1 },
  ]);
  await runtime.runInReadContext(async (database) => {
    expect(
      (
        await new SqliteItemRepository(database).listUnscheduledByTripId(
          trip.id,
        )
      ).map(({ id, sortOrder }) => ({ id, sortOrder })),
    ).toEqual([
      { id: 'unscheduled-0', sortOrder: 0 },
      { id: 'unscheduled-2', sortOrder: 1 },
    ]);
  });
  expect(result.data).toMatchObject({ dayId: days[1].id, sortOrder: 1 });
});

test('rejects invalid target ownership, same-Day moves and missing anchors', async () => {
  await setup([
    item('moving', days[0].id, 0),
    item('target-0', days[1].id, 0),
  ]);
  const otherTrip: Trip = { ...trip, id: 'trip-2' };
  const otherDay: Day = { ...days[0], id: 'other-day', tripId: otherTrip.id };
  await runtime.runInExclusiveTransaction(async (database) => {
    await new SqliteTripRepository(database).insert(otherTrip);
    await new SqliteDayRepository(database).insertMany([otherDay]);
  });

  await expect(
    moveItemToDay(
      { itemId: 'moving', targetDayId: otherDay.id },
      dependencies,
    ),
  ).rejects.toThrow('Target Day must belong to the Item Trip');
  await expect(
    moveItemToDay(
      { itemId: 'moving', targetDayId: days[0].id },
      dependencies,
    ),
  ).rejects.toThrow('Item already belongs to the target Day');
  await expect(
    moveItemToDay(
      {
        itemId: 'moving',
        targetDayId: days[1].id,
        position: { type: 'after', itemId: 'missing' },
      },
      dependencies,
    ),
  ).rejects.toThrow('Target position Item not found: missing');

  expect(await itemIds(days[0].id)).toEqual([
    { id: 'moving', sortOrder: 0 },
  ]);
  expect(await itemIds(days[1].id)).toEqual([
    { id: 'target-0', sortOrder: 0 },
  ]);
});

test('rolls back all reindex writes when a later update fails', async () => {
  await setup([
    item('moving', days[0].id, 0),
    item('source-1', days[0].id, 1),
    item('target-0', days[1].id, 0),
  ]);
  const failingDependencies: MoveItemToDayDependencies = {
    now: () => movedAt,
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
            updateMany: async (updates) => {
              await repository.update(updates[0]);
              throw new Error('forced reindex failure');
            },
          },
        });
      }),
  };

  await expect(
    moveItemToDay(
      { itemId: 'moving', targetDayId: days[1].id },
      failingDependencies,
    ),
  ).rejects.toThrow('forced reindex failure');

  expect(await itemIds(days[0].id)).toEqual([
    { id: 'moving', sortOrder: 0 },
    { id: 'source-1', sortOrder: 1 },
  ]);
  expect(await itemIds(days[1].id)).toEqual([
    { id: 'target-0', sortOrder: 0 },
  ]);
});

test('moves a Day Item into Unscheduled at a relative position', async () => {
  await setup([
    item('source-0', days[0].id, 0),
    item('moving', days[0].id, 1),
    item('source-2', days[0].id, 2),
    item('unscheduled-0', null, 0),
    item('unscheduled-1', null, 1),
  ]);
  const unscheduledDependencies: MoveItemToUnscheduledDependencies = {
    now: () => movedAt,
    runInTransaction: createMoveItemToUnscheduledTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };

  const result = await moveItemToUnscheduled(
    {
      itemId: 'moving',
      position: { type: 'before', itemId: 'unscheduled-1' },
    },
    unscheduledDependencies,
  );

  expect(await itemIds(days[0].id)).toEqual([
    { id: 'source-0', sortOrder: 0 },
    { id: 'source-2', sortOrder: 1 },
  ]);
  await runtime.runInReadContext(async (database) => {
    expect(
      (
        await new SqliteItemRepository(database).listUnscheduledByTripId(
          trip.id,
        )
      ).map(({ id, sortOrder }) => ({ id, sortOrder })),
    ).toEqual([
      { id: 'unscheduled-0', sortOrder: 0 },
      { id: 'moving', sortOrder: 1 },
      { id: 'unscheduled-1', sortOrder: 2 },
    ]);
  });
  expect(result.data).toMatchObject({
    id: 'moving',
    dayId: null,
    sortOrder: 1,
    startDateTime: '2026-12-30T09:00',
    endDateTime: '2026-12-30T10:00',
    isFixed: true,
    note: 'Preserve me',
    updatedAt: movedAt,
  });
  expect(result.affectedEntityIds).toEqual([
    'source-2',
    'moving',
    'unscheduled-1',
  ]);
});

test('rejects an already Unscheduled Item and a missing Unscheduled anchor', async () => {
  await setup([
    item('moving', days[0].id, 0),
    item('unscheduled-0', null, 0),
  ]);
  const unscheduledDependencies: MoveItemToUnscheduledDependencies = {
    now: () => movedAt,
    runInTransaction: createMoveItemToUnscheduledTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };

  await expect(
    moveItemToUnscheduled(
      { itemId: 'unscheduled-0' },
      unscheduledDependencies,
    ),
  ).rejects.toThrow('Item is already Unscheduled');
  await expect(
    moveItemToUnscheduled(
      {
        itemId: 'moving',
        position: { type: 'after', itemId: 'missing' },
      },
      unscheduledDependencies,
    ),
  ).rejects.toThrow('Target position Item not found: missing');
  expect(await itemIds(days[0].id)).toEqual([
    { id: 'moving', sortOrder: 0 },
  ]);
});

test('rolls back a partial move into Unscheduled', async () => {
  await setup([
    item('moving', days[0].id, 0),
    item('source-1', days[0].id, 1),
    item('unscheduled-0', null, 0),
  ]);
  const failingDependencies: MoveItemToUnscheduledDependencies = {
    now: () => movedAt,
    runInTransaction: (task) =>
      runtime.runInExclusiveTransaction(async (database) => {
        const repository = new SqliteItemRepository(database);
        return task({
          items: {
            getById: (id) => repository.getById(id),
            listByDayId: (dayId) => repository.listByDayId(dayId),
            listUnscheduledByTripId: (tripId) =>
              repository.listUnscheduledByTripId(tripId),
            updateMany: async (updates) => {
              await repository.update(updates[0]);
              throw new Error('forced Unscheduled reindex failure');
            },
          },
        });
      }),
  };

  await expect(
    moveItemToUnscheduled({ itemId: 'moving' }, failingDependencies),
  ).rejects.toThrow('forced Unscheduled reindex failure');

  expect(await itemIds(days[0].id)).toEqual([
    { id: 'moving', sortOrder: 0 },
    { id: 'source-1', sortOrder: 1 },
  ]);
  await runtime.runInReadContext(async (database) => {
    expect(
      (
        await new SqliteItemRepository(database).listUnscheduledByTripId(
          trip.id,
        )
      ).map(({ id, sortOrder }) => ({ id, sortOrder })),
    ).toEqual([{ id: 'unscheduled-0', sortOrder: 0 }]);
  });
});

test('reorders a Day Item after a relative anchor without changing ownership', async () => {
  await setup([
    item('item-0', days[0].id, 0),
    item('moving', days[0].id, 1),
    item('item-2', days[0].id, 2),
  ]);
  const reorderDependencies: ReorderItemDependencies = {
    now: () => movedAt,
    runInTransaction: createReorderItemTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };

  const result = await reorderItem(
    {
      itemId: 'moving',
      position: { type: 'after', itemId: 'item-2' },
    },
    reorderDependencies,
  );

  expect(await itemIds(days[0].id)).toEqual([
    { id: 'item-0', sortOrder: 0 },
    { id: 'item-2', sortOrder: 1 },
    { id: 'moving', sortOrder: 2 },
  ]);
  expect(result.data).toMatchObject({
    id: 'moving',
    tripId: trip.id,
    dayId: days[0].id,
    sortOrder: 2,
    updatedAt: movedAt,
  });
  expect(result.affectedEntityIds).toEqual(['item-2', 'moving']);
});

test('reorders the Unscheduled collection using the same command', async () => {
  await setup([
    item('unscheduled-0', null, 0),
    item('unscheduled-1', null, 1),
    item('moving', null, 2),
  ]);
  const reorderDependencies: ReorderItemDependencies = {
    now: () => movedAt,
    runInTransaction: createReorderItemTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };

  const result = await reorderItem(
    { itemId: 'moving', position: { type: 'start' } },
    reorderDependencies,
  );

  await runtime.runInReadContext(async (database) => {
    expect(
      (
        await new SqliteItemRepository(database).listUnscheduledByTripId(
          trip.id,
        )
      ).map(({ id, dayId, sortOrder }) => ({ id, dayId, sortOrder })),
    ).toEqual([
      { id: 'moving', dayId: null, sortOrder: 0 },
      { id: 'unscheduled-0', dayId: null, sortOrder: 1 },
      { id: 'unscheduled-1', dayId: null, sortOrder: 2 },
    ]);
  });
  expect(result.affectedEntityIds).toEqual([
    'moving',
    'unscheduled-0',
    'unscheduled-1',
  ]);
});

test('treats an unchanged relative order as a no-write success', async () => {
  await setup([
    item('item-0', days[0].id, 0),
    item('moving', days[0].id, 1),
  ]);
  const reorderDependencies: ReorderItemDependencies = {
    now: () => movedAt,
    runInTransaction: createReorderItemTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };

  const result = await reorderItem(
    {
      itemId: 'moving',
      position: { type: 'after', itemId: 'item-0' },
    },
    reorderDependencies,
  );

  expect(result.affectedEntityIds).toEqual([]);
  expect(result.data.updatedAt).toBe(createdAt);
  expect(await itemIds(days[0].id)).toEqual([
    { id: 'item-0', sortOrder: 0 },
    { id: 'moving', sortOrder: 1 },
  ]);
});

test('rejects self-relative and cross-collection reorder anchors', async () => {
  await setup([
    item('moving', days[0].id, 0),
    item('other-day', days[1].id, 0),
  ]);
  const reorderDependencies: ReorderItemDependencies = {
    now: () => movedAt,
    runInTransaction: createReorderItemTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };

  await expect(
    reorderItem(
      {
        itemId: 'moving',
        position: { type: 'before', itemId: 'moving' },
      },
      reorderDependencies,
    ),
  ).rejects.toThrow('Item cannot be positioned relative to itself');
  await expect(
    reorderItem(
      {
        itemId: 'moving',
        position: { type: 'before', itemId: 'other-day' },
      },
      reorderDependencies,
    ),
  ).rejects.toThrow('Target position Item not found: other-day');

  expect(await itemIds(days[0].id)).toEqual([
    { id: 'moving', sortOrder: 0 },
  ]);
});

test('rolls back a partial same-collection reorder', async () => {
  await setup([
    item('moving', days[0].id, 0),
    item('item-1', days[0].id, 1),
    item('item-2', days[0].id, 2),
  ]);
  const failingDependencies: ReorderItemDependencies = {
    now: () => movedAt,
    runInTransaction: (task) =>
      runtime.runInExclusiveTransaction(async (database) => {
        const repository = new SqliteItemRepository(database);
        return task({
          items: {
            getById: (id) => repository.getById(id),
            listByDayId: (dayId) => repository.listByDayId(dayId),
            listUnscheduledByTripId: (tripId) =>
              repository.listUnscheduledByTripId(tripId),
            updateMany: async (updates) => {
              await repository.update(updates[0]);
              throw new Error('forced reorder failure');
            },
          },
        });
      }),
  };

  await expect(
    reorderItem(
      { itemId: 'moving', position: { type: 'end' } },
      failingDependencies,
    ),
  ).rejects.toThrow('forced reorder failure');

  expect(await itemIds(days[0].id)).toEqual([
    { id: 'moving', sortOrder: 0 },
    { id: 'item-1', sortOrder: 1 },
    { id: 'item-2', sortOrder: 2 },
  ]);
});
