import { afterEach, expect, test } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  addItem,
  type AddItemDependencies,
  type AddItemInput,
} from '@/application/item/add-item';
import type { DayPeriod } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day, Trip } from '@/domain/trip/types';
import { createItemTransactionRunner } from '@/infrastructure/database/item-transaction';
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

const timestamp = '2026-09-11T12:00:00.000Z';
const trip: Trip = {
  id: 'trip-1',
  title: 'Hokkaido',
  startDate: '2026-12-30',
  endDate: '2026-12-31',
  mapRegion: 'global',
  note: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const day: Day = {
  id: 'day-1',
  tripId: trip.id,
  date: trip.startDate,
  dayIndex: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const input: AddItemInput = {
  tripId: trip.id,
  dayId: day.id,
  title: '  Airport train  ',
  type: 'transport',
  timeMode: 'exact',
  startDateTime: '2026-12-30T09:15',
  endDateTime: '2026-12-30T10:00',
  isFixed: true,
  note: 'Reserved seat',
  payload: {
    kind: 'transport',
    mode: 'train',
    serviceNumber: 'AP-1',
  },
};

let connection: NodeSqliteConnection | undefined;
let temporaryDirectory: string | undefined;

afterEach(() => {
  connection?.close();
  connection = undefined;
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

async function createRealDependencies(
  id = 'item-1',
  databasePath?: string,
): Promise<AddItemDependencies> {
  connection = new NodeSqliteConnection(databasePath);
  const runtime = createDatabaseRuntime(async () => connection!, {
    initializeConnection: runMigrations,
  });
  await runtime.runInExclusiveTransaction(async (database) => {
    await new SqliteTripRepository(database).insert(trip);
    await new SqliteDayRepository(database).insertMany([day]);
  });

  return {
    createId: () => id,
    now: () => timestamp,
    runInTransaction: createItemTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };
}

test('rejects invalid input before starting persistence', async () => {
  const invalidInputs: AddItemInput[] = [
    { ...input, title: '  ' },
    {
      ...input,
      timeMode: 'none',
      startDateTime: '2026-12-30T09:15',
      endDateTime: null,
    },
    {
      ...input,
      timeMode: 'period',
      startDateTime: null,
      endDateTime: null,
      period: null,
    },
    {
      ...input,
      startDateTime: '2026-02-29T09:15',
    },
      {
        ...input,
        type: 'custom',
        payload: { kind: 'transport' },
      },
      {
        ...input,
        type: 'custom',
        payload: { kind: 'custom' } as unknown as AddItemInput['payload'],
      },
      {
        ...input,
        type: 'custom',
        payload: { kind: 'custom', label: 'x'.repeat(21) },
      },
      {
        ...input,
        type: 'custom',
        payload: { kind: 'custom', label: 'valid', extra: true } as unknown as AddItemInput['payload'],
      },
      {
        ...input,
        type: 'food',
        payload: { kind: 'custom', label: 'Custom stop' } as unknown as AddItemInput['payload'],
      },
      {
        ...input,
        type: 'hotel',
        payload: { kind: 'transport' },
      },
      {
        ...input,
        type: 'transport',
        payload: { kind: 'hotel' },
      },
  ];

  for (const invalidInput of invalidInputs) {
    let transactionCalls = 0;

    await expect(
      addItem(invalidInput, {
        createId: () => 'unused',
        now: () => timestamp,
        runInTransaction: async () => {
          transactionCalls += 1;
          throw new Error('Persistence should not start');
        },
      }),
    ).rejects.toThrow();
    expect(transactionCalls).toBe(0);
  }
});

test('appends a canonical exact-time Item to its Day', async () => {
  const dependencies = await createRealDependencies();

  const result = await addItem(input, dependencies);

  expect(result).toEqual({
    data: {
      id: 'item-1',
      tripId: trip.id,
      dayId: day.id,
      placeId: null,
      title: 'Airport train',
      type: 'transport',
      sortOrder: 0,
      timeMode: 'exact',
      startDateTime: '2026-12-30T09:15',
      endDateTime: '2026-12-30T10:00',
      period: null,
      isFixed: true,
      note: 'Reserved seat',
      payload: input.payload,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    affectedEntityIds: ['item-1'],
    validationIssues: [],
  });

  expect(
    await new SqliteItemRepository(connection!).listByDayId(day.id),
  ).toEqual([result.data]);
});

test('new Items reject an out-of-scope Place and accept a matching global Place', async () => {
  const dependencies = await createRealDependencies();
  const foreignPlace: Place = {
    id: 'place-amap',
    name: 'AMap source Place',
    coordinate: { latitude: 39.9, longitude: 116.4, system: 'gcj02' },
    address: null,
    provider: 'amap',
    providerPlaceId: 'amap-id',
    metadata: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const globalPlace: Place = {
    ...foreignPlace,
    id: 'place-google',
    name: 'Google source Place',
    coordinate: { latitude: 35.6, longitude: 139.7, system: 'wgs84' },
    provider: 'google',
    providerPlaceId: 'google-id',
  };
  const places = new SqlitePlaceRepository(connection!);
  await places.insert(foreignPlace);
  await places.insert(globalPlace);

  await expect(addItem({ ...input, placeId: foreignPlace.id }, dependencies))
    .rejects.toThrow('provider amap does not match Trip map region global');
  expect(connection!.database.prepare('SELECT COUNT(*) AS count FROM items').get())
    .toEqual({ count: 0 });

  const result = await addItem({ ...input, placeId: globalPlace.id }, dependencies);
  expect(result.data.placeId).toBe(globalPlace.id);
});

test('persists an arrival-only exact Item without manufacturing departure', async () => {
  const dependencies = await createRealDependencies();
  const result = await addItem({
    ...input,
    startDateTime: null,
    endDateTime: '2026-12-30T19:20',
  }, dependencies);

  expect(result.data).toMatchObject({
    timeMode: 'exact',
    startDateTime: null,
    endDateTime: '2026-12-30T19:20',
  });
  expect(await new SqliteItemRepository(connection!).getById(result.data.id))
    .toEqual(result.data);
});

test('orders Day and Unscheduled collections independently with defaults', async () => {
  const dependencies = await createRealDependencies('item-day');
  await addItem(
    {
      tripId: trip.id,
      dayId: day.id,
      title: 'Day item',
      type: 'custom',
    },
    dependencies,
  );

  const firstUnscheduled = await addItem(
    {
      tripId: trip.id,
      dayId: null,
      title: 'First unscheduled',
      type: 'custom',
    },
    { ...dependencies, createId: () => 'item-unscheduled-1' },
  );
  const secondUnscheduled = await addItem(
    {
      tripId: trip.id,
      dayId: null,
      title: 'Second unscheduled',
      type: 'food',
      timeMode: 'period',
      period: 'night',
    },
    { ...dependencies, createId: () => 'item-unscheduled-2' },
  );

  expect(firstUnscheduled.data.sortOrder).toBe(0);
  expect(firstUnscheduled.data).toMatchObject({
    timeMode: 'none',
    startDateTime: null,
    endDateTime: null,
    period: null,
    isFixed: false,
    note: null,
    payload: null,
  });
  expect(secondUnscheduled.data.sortOrder).toBe(0);
  const unscheduled = await new SqliteItemRepository(connection!).listUnscheduledByTripId(trip.id);
  expect(unscheduled.map(({ title, sortOrder }) => [title, sortOrder])).toEqual([
    ['Second unscheduled', 0],
    ['First unscheduled', 1],
  ]);
});

test('creates a timed Item at its canonical place in persisted Day order', async () => {
  const dependencies = await createRealDependencies('item-first-period');
  const create = (id: string, input: Omit<AddItemInput, 'tripId' | 'dayId'>) =>
    addItem({ tripId: trip.id, dayId: day.id, ...input }, {
      ...dependencies,
      createId: () => id,
    });

  await create('morning-period', {
    title: 'Morning notes', type: 'custom', timeMode: 'period', period: 'morning',
  });
  await create('afternoon', {
    title: 'Afternoon', type: 'custom', timeMode: 'exact',
    startDateTime: '2026-12-30T15:00',
  });
  const morning = await create('morning-exact', {
    title: 'Morning exact', type: 'custom', timeMode: 'exact',
    startDateTime: '2026-12-30T09:00',
  });
  await create('untimed', { title: 'No time', type: 'custom' });
  const tiedMorning = await create('morning-tie', {
    title: 'Same time later', type: 'custom', timeMode: 'exact',
    startDateTime: '2026-12-30T09:00',
  });

  expect(morning.data.sortOrder).toBe(0);
  expect(tiedMorning.data.sortOrder).toBe(1);
  const ordered = await new SqliteItemRepository(connection!).listByDayId(day.id);
  expect(ordered.map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
    ['morning-exact', 0],
    ['morning-tie', 1],
    ['morning-period', 2],
    ['afternoon', 3],
    ['untimed', 4],
  ]);
});

test('persists exact-time order across all approved period boundaries in SQLite', async () => {
  const dependencies = await createRealDependencies('unused');
  const create = (id: string, time: string) =>
    addItem({
      tripId: trip.id,
      dayId: day.id,
      title: id,
      type: 'custom',
      timeMode: 'exact',
      startDateTime: `2026-12-30T${time}`,
    }, { ...dependencies, createId: () => id });
  const createPeriod = (id: string, period: DayPeriod) =>
    addItem({
      tripId: trip.id,
      dayId: day.id,
      title: id,
      type: 'custom',
      timeMode: 'period',
      period,
    }, { ...dependencies, createId: () => id });

  for (const [id, time] of [
    ['afternoon-last', '17:59'],
    ['night-early', '04:59'],
    ['afternoon-first', '14:00'],
    ['noon-first', '11:00'],
    ['morning-last', '10:59'],
    ['night-first', '18:00'],
    ['morning-first', '05:00'],
    ['noon-last', '13:59'],
  ]) {
    await create(id, time);
  }
  await createPeriod('noon-period-first', 'noon');
  await createPeriod('noon-period-second', 'noon');

  const persisted = await new SqliteItemRepository(connection!).listByDayId(day.id);

  expect(persisted.map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
    ['morning-first', 0],
    ['morning-last', 1],
    ['noon-first', 2],
    ['noon-last', 3],
    ['noon-period-first', 4],
    ['noon-period-second', 5],
    ['afternoon-first', 6],
    ['afternoon-last', 7],
    ['night-early', 8],
    ['night-first', 9],
  ]);
});

test('normalizes and preserves a custom Item payload across SQLite reopen', async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'travel-add-item-'));
  const databasePath = join(temporaryDirectory, 'travel.sqlite');
  const dependencies = await createRealDependencies('item-custom', databasePath);

  const result = await addItem({
    tripId: trip.id,
    dayId: day.id,
    title: 'Tea stop',
    type: 'custom',
    payload: { kind: 'custom', label: '  Tea ceremony  ' },
  }, dependencies);
  const blankLabelResult = await addItem({
    tripId: trip.id,
    dayId: day.id,
    title: 'Unlabeled custom stop',
    type: 'custom',
    payload: { kind: 'custom', label: ' \t ' },
  }, { ...dependencies, createId: () => 'item-custom-blank' });

  expect(result.data.payload).toEqual({ kind: 'custom', label: 'Tea ceremony' });
  expect(blankLabelResult.data.payload).toBeNull();
  connection!.close();
  connection = new NodeSqliteConnection(databasePath);
  await runMigrations(connection);

  expect(await new SqliteItemRepository(connection).getById('item-custom'))
    .toEqual(result.data);
  expect(await new SqliteItemRepository(connection).getById('item-custom-blank'))
    .toEqual(blankLabelResult.data);
});

test('rejects a missing Trip or a Day owned by another Trip without writes', async () => {
  const dependencies = await createRealDependencies();

  await expect(
    addItem({ ...input, tripId: 'missing-trip' }, dependencies),
  ).rejects.toThrow('Trip not found: missing-trip');

  const otherTrip: Trip = { ...trip, id: 'trip-2' };
  await new SqliteTripRepository(connection!).insert(otherTrip);
  await expect(
    addItem({ ...input, tripId: otherTrip.id }, dependencies),
  ).rejects.toThrow('Item Day must belong to the same Trip');

  expect(
    connection!.database.prepare('SELECT COUNT(*) AS count FROM items').get(),
  ).toEqual({ count: 0 });
});

test('rolls back an Item insert when the semantic transaction fails', async () => {
  const dependencies = await createRealDependencies();
  const runtime = createDatabaseRuntime(async () => connection!);

  await expect(
    addItem(input, {
      ...dependencies,
      runInTransaction: (task) =>
        runtime.runInExclusiveTransaction(async (database) => {
          const items = new SqliteItemRepository(database);

          return task({
            days: new SqliteDayRepository(database),
            places: new SqlitePlaceRepository(database),
            trips: new SqliteTripRepository(database),
            items: {
              listByDayId: (dayId) => items.listByDayId(dayId),
              listUnscheduledByTripId: (tripId) =>
                items.listUnscheduledByTripId(tripId),
              updateMany: (changed) => items.updateMany(changed),
              insert: async (item) => {
                await items.insert(item);
                throw new Error('forced Item insert failure');
              },
            },
          });
        }),
    }),
  ).rejects.toThrow('forced Item insert failure');

  expect(
    connection!.database.prepare('SELECT COUNT(*) AS count FROM items').get(),
  ).toEqual({ count: 0 });
});
