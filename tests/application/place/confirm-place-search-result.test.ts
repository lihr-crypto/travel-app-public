import { afterEach, expect, test } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';

import {
  confirmPlaceSearchResult,
  type ConfirmPlaceSearchResultDependencies,
} from '@/application/place/confirm-place-search-result';
import type { Day, Trip } from '@/domain/trip/types';
import { createConfirmPlaceSearchResultTransactionRunner } from '@/infrastructure/database/place-item-transaction';
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
import type { PlaceSearchResult } from '@/infrastructure/place/place-provider';

function nodeParams(params: DatabaseBindParams) {
  return params.map((value) => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  });
}

class NodeSqliteConnection implements DatabaseConnection {
  readonly database = new DatabaseSync(':memory:');
  async execAsync(source: string) { this.database.exec(source); }
  async runAsync(source: string, params: DatabaseBindParams = []) {
    const result = this.database.prepare(source).run(...nodeParams(params));
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync<T>(source: string, params: DatabaseBindParams = []): Promise<T | null> {
    return (this.database.prepare(source).get(...nodeParams(params)) as T | undefined) ?? null;
  }
  async getAllAsync<T>(source: string, params: DatabaseBindParams = []): Promise<T[]> {
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
  close() { this.database.close(); }
}

const timestamp = '2026-09-14T08:00:00.000Z';
const trip: Trip = {
  id: 'trip-cn',
  title: 'Beijing',
  startDate: '2026-10-01',
  endDate: '2026-10-02',
  mapRegion: 'china_mainland',
  note: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const globalTrip: Trip = {
  ...trip,
  id: 'trip-global',
  title: 'Sydney',
  mapRegion: 'global',
};
const day: Day = {
  id: 'day-1',
  tripId: trip.id,
  date: trip.startDate,
  dayIndex: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const result: PlaceSearchResult = {
  name: ' 颐和园 ',
  address: ' 新建宫门路19号 ',
  coordinate: { latitude: 39.999676, longitude: 116.275118, system: 'gcj02' },
  provider: 'amap',
  providerPlaceId: ' B000SAMP01 ',
  regionLabel: '海淀区',
  metadata: { typeCode: '110200' },
};

let connection: NodeSqliteConnection | undefined;

afterEach(() => {
  connection?.close();
  connection = undefined;
});

async function setup(trips: Trip[] = [trip]) {
  connection = new NodeSqliteConnection();
  const runtime = createDatabaseRuntime(async () => connection!, {
    initializeConnection: runMigrations,
  });
  await runtime.runInExclusiveTransaction(async (database) => {
    const tripRepository = new SqliteTripRepository(database);
    for (const value of trips) await tripRepository.insert(value);
    await new SqliteDayRepository(database).insertMany([day]);
  });
  return runtime;
}

function dependencies(
  runtime: Awaited<ReturnType<typeof setup>>,
  placeId = 'place-1',
  itemId = 'item-1',
): ConfirmPlaceSearchResultDependencies {
  return {
    createPlaceId: () => placeId,
    createItemId: () => itemId,
    now: () => timestamp,
    runInTransaction: createConfirmPlaceSearchResultTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };
}

test('atomically persists a provider-native Place snapshot and linked Item', async () => {
  const runtime = await setup();
  const commandResult = await confirmPlaceSearchResult({
    tripId: trip.id,
    dayId: day.id,
    result,
  }, dependencies(runtime));

  expect(commandResult.data.place).toMatchObject({
    id: 'place-1',
    name: '颐和园',
    address: '新建宫门路19号',
    provider: 'amap',
    providerPlaceId: 'B000SAMP01',
    coordinate: result.coordinate,
  });
  expect(commandResult.data.item).toMatchObject({
    id: 'item-1',
    tripId: trip.id,
    dayId: day.id,
    placeId: 'place-1',
    title: '颐和园',
    type: 'custom',
    sortOrder: 0,
  });
  expect(commandResult.affectedEntityIds).toEqual(['place-1', 'item-1']);
  expect(await new SqlitePlaceRepository(connection!).getById('place-1'))
    .toEqual(commandResult.data.place);
  expect(await new SqliteItemRepository(connection!).getById('item-1'))
    .toEqual(commandResult.data.item);
});

test('persists the edited Item Draft beside a searched Place in the same transaction', async () => {
  const runtime = await setup();
  const commandResult = await confirmPlaceSearchResult({
    tripId: trip.id,
    dayId: day.id,
    result,
    draft: {
      title: 'Dinner near the garden',
      type: 'food',
      timeMode: 'period',
      startDateTime: null,
      endDateTime: null,
      period: 'night',
      note: 'Reserve a table',
    },
  }, dependencies(runtime));

  expect(commandResult.data.item).toMatchObject({
    title: 'Dinner near the garden',
    type: 'food',
    timeMode: 'period',
    period: 'night',
    // `ItemDraft` no longer carries `isFixed`, so a new Item always starts false.
    isFixed: false,
    note: 'Reserve a table',
    placeId: commandResult.data.place.id,
  });
  expect(await new SqliteItemRepository(connection!).getById(commandResult.data.item.id))
    .toEqual(commandResult.data.item);
});

test('does not merge independent confirmations by provider Place ID', async () => {
  const runtime = await setup();
  await confirmPlaceSearchResult({ tripId: trip.id, dayId: day.id, result }, dependencies(runtime));
  await confirmPlaceSearchResult(
    { tripId: trip.id, dayId: day.id, result },
    dependencies(runtime, 'place-2', 'item-2'),
  );

  expect(connection!.database.prepare('SELECT COUNT(*) AS count FROM places').get())
    .toEqual({ count: 2 });
  expect((await new SqliteItemRepository(connection!).listByDayId(day.id)).map(({ placeId }) => placeId))
    .toEqual(['place-1', 'place-2']);
});

test('rejects provider or CRS mismatches without writes', async () => {
  const runtime = await setup();
  await expect(confirmPlaceSearchResult({
    tripId: trip.id,
    dayId: day.id,
    result: { ...result, provider: 'google' },
  }, dependencies(runtime))).rejects.toThrow('does not match wgs84');
  await expect(confirmPlaceSearchResult({
    tripId: trip.id,
    dayId: day.id,
    result: { ...result, coordinate: { ...result.coordinate, system: 'wgs84' } },
  }, dependencies(runtime))).rejects.toThrow('does not match gcj02');
  expect(connection!.database.prepare('SELECT COUNT(*) AS count FROM places').get())
    .toEqual({ count: 0 });
  expect(connection!.database.prepare('SELECT COUNT(*) AS count FROM items').get())
    .toEqual({ count: 0 });
});

test('rejects Apple and overseas snapshots in a mainland Trip without writes', async () => {
  const runtime = await setup();
  const apple: PlaceSearchResult = {
    ...result,
    provider: 'apple',
    coordinate: { latitude: 39.999676, longitude: 116.275118, system: 'wgs84' },
  };
  const google: PlaceSearchResult = {
    ...apple,
    provider: 'google',
  };

  await expect(confirmPlaceSearchResult({
    tripId: trip.id, dayId: day.id, result: apple,
  }, dependencies(runtime))).rejects.toThrow('provider apple does not match Trip map region china_mainland');
  await expect(confirmPlaceSearchResult({
    tripId: trip.id, dayId: day.id, result: google,
  }, dependencies(runtime))).rejects.toThrow('provider google does not match Trip map region china_mainland');
  expect(connection!.database.prepare('SELECT COUNT(*) AS count FROM places').get())
    .toEqual({ count: 0 });
  expect(connection!.database.prepare('SELECT COUNT(*) AS count FROM items').get())
    .toEqual({ count: 0 });
});

test('continues to accept the matching Google source for a global Trip', async () => {
  const runtime = await setup([trip, globalTrip]);
  const sydney: PlaceSearchResult = {
    name: 'Sydney Opera House',
    address: 'Bennelong Point',
    coordinate: { latitude: -33.856784, longitude: 151.215297, system: 'wgs84' },
    provider: 'google',
    providerPlaceId: 'google-sydney',
    regionLabel: 'NSW',
    metadata: null,
  };

  const result = await confirmPlaceSearchResult({
    tripId: globalTrip.id,
    dayId: null,
    result: sydney,
  }, dependencies(runtime, 'place-sydney', 'item-sydney'));

  expect(result.data.place).toMatchObject({ provider: 'google', coordinate: sydney.coordinate });
  expect(result.data.item.dayId).toBeNull();
});

test('rolls back the Place when the Item insert fails', async () => {
  const runtime = await setup();
  const deps = dependencies(runtime);
  deps.runInTransaction = (task) => runtime.runInExclusiveTransaction(async (database) => {
    const items = new SqliteItemRepository(database);
    return task({
      days: new SqliteDayRepository(database),
      places: new SqlitePlaceRepository(database),
      trips: new SqliteTripRepository(database),
      items: {
        listByDayId: (id) => items.listByDayId(id),
        listUnscheduledByTripId: (id) => items.listUnscheduledByTripId(id),
        updateMany: (changed) => items.updateMany(changed),
        insert: async (item) => {
          await items.insert(item);
          throw new Error('forced Item failure');
        },
      },
    });
  });

  await expect(confirmPlaceSearchResult({
    tripId: trip.id,
    dayId: day.id,
    result,
  }, deps)).rejects.toThrow('forced Item failure');
  expect(connection!.database.prepare('SELECT COUNT(*) AS count FROM places').get())
    .toEqual({ count: 0 });
  expect(connection!.database.prepare('SELECT COUNT(*) AS count FROM items').get())
    .toEqual({ count: 0 });
});
