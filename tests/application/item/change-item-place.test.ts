import { afterEach, expect, test } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';

import {
  changeItemPlace,
  type ChangeItemPlaceDependencies,
} from '@/application/item/change-item-place';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day, Trip } from '@/domain/trip/types';
import { createChangeItemPlaceTransactionRunner } from '@/infrastructure/database/item-transaction';
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
import type {
  PlaceSearchResult,
  ReverseGeocodeResult,
} from '@/infrastructure/place/place-provider';

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

const mainlandTrip: Trip = {
  id: 'trip-cn',
  title: 'Beijing',
  startDate: '2026-03-22',
  endDate: '2026-03-23',
  mapRegion: 'china_mainland',
  note: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const globalTrip: Trip = {
  ...mainlandTrip,
  id: 'trip-au',
  title: 'Sydney',
  mapRegion: 'global',
};

const day: Day = {
  id: 'day-1',
  tripId: mainlandTrip.id,
  date: mainlandTrip.startDate,
  dayIndex: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const oldCoordinate = {
  latitude: 39.9087,
  longitude: 116.3975,
  system: 'gcj02' as const,
};

const oldPlace: Place = {
  id: 'place-old',
  name: '天安门',
  coordinate: oldCoordinate,
  address: '北京市东城区',
  provider: 'amap',
  providerPlaceId: 'B000A8UIN8',
  metadata: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

/** Carries every field that must survive a Place change untouched. */
const item: Item = {
  id: 'item-1',
  tripId: mainlandTrip.id,
  dayId: day.id,
  placeId: oldPlace.id,
  type: 'sightseeing',
  title: '看升旗',
  sortOrder: 0,
  timeMode: 'exact',
  startDateTime: '2026-03-22T05:30',
  endDateTime: '2026-03-22T07:00',
  period: null,
  isFixed: true,
  note: '带身份证',
  payload: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

/** A second Item whose ordering must not move when the first one changes Place. */
const peerItem: Item = {
  ...item,
  id: 'item-2',
  placeId: null,
  title: '早餐',
  sortOrder: 1,
  timeMode: 'period',
  startDateTime: null,
  endDateTime: null,
  period: 'morning',
  isFixed: false,
  note: null,
};

const picked = {
  latitude: 39.999676,
  longitude: 116.275118,
  system: 'gcj02' as const,
};

const enrichment: ReverseGeocodeResult = {
  provider: 'amap',
  coordinate: picked,
  name: ' 颐和园 ',
  address: ' 北京市海淀区新建宫门路19号 ',
  regionLabel: '海淀区',
  providerPlaceId: ' B000SAMP01 ',
  metadata: { township: '海淀镇' },
};

const searchResult: PlaceSearchResult = {
  name: ' 故宫博物院 ',
  address: ' 北京市东城区景山前街4号 ',
  coordinate: { latitude: 39.916345, longitude: 116.397155, system: 'gcj02' },
  provider: 'amap',
  providerPlaceId: ' B000A8UIN8 ',
  regionLabel: '东城区',
  metadata: { city: '北京' },
};

let connection: NodeSqliteConnection | undefined;

afterEach(() => {
  connection?.close();
  connection = undefined;
});

async function setup(trips: Trip[] = [mainlandTrip]) {
  connection = new NodeSqliteConnection();
  const runtime = createDatabaseRuntime(async () => connection!, {
    initializeConnection: runMigrations,
  });
  await runtime.runInExclusiveTransaction(async (database) => {
    const tripRepository = new SqliteTripRepository(database);
    for (const value of trips) {
      await tripRepository.insert(value);
    }
    await new SqliteDayRepository(database).insertMany([day]);
    await new SqlitePlaceRepository(database).insert(oldPlace);
    const items = new SqliteItemRepository(database);
    await items.insert(item);
    await items.insert(peerItem);
  });
  return runtime;
}

function dependencies(
  runtime: Awaited<ReturnType<typeof setup>>,
  placeId = 'place-new',
): ChangeItemPlaceDependencies {
  return {
    createPlaceId: () => placeId,
    now: () => '2026-03-07T09:00:00.000Z',
    runInTransaction: createChangeItemPlaceTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };
}

function countRows(table: 'places' | 'items') {
  return connection!.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
}

function readItem(id = item.id) {
  return connection!.database
    .prepare('SELECT * FROM items WHERE id = ?')
    .get(id) as Record<string, unknown>;
}

test('repoints the Item at a new search-result Place and leaves every other field alone', async () => {
  const runtime = await setup();
  const result = await changeItemPlace({
    itemId: item.id,
    target: { kind: 'search', result: searchResult },
  }, dependencies(runtime));

  expect(result.data.place).toMatchObject({
    id: 'place-new',
    name: '故宫博物院',
    address: '北京市东城区景山前街4号',
    provider: 'amap',
    providerPlaceId: 'B000A8UIN8',
    metadata: { city: '北京' },
  });
  expect(result.data.item).toEqual({
    ...item,
    placeId: 'place-new',
    updatedAt: '2026-03-07T09:00:00.000Z',
  });
  expect(result.affectedEntityIds).toEqual(['item-1', 'place-new']);
});

test('repoints the Item at a Map Picker coordinate and validates it against the Trip CRS', async () => {
  const runtime = await setup();
  const result = await changeItemPlace({
    itemId: item.id,
    target: { kind: 'map-picker', coordinate: picked, enrichment },
  }, dependencies(runtime));

  expect(result.data.place).toMatchObject({
    id: 'place-new',
    name: '颐和园',
    address: '北京市海淀区新建宫门路19号',
    provider: 'amap',
    coordinate: picked,
  });
  expect(result.data.item.placeId).toBe('place-new');
  expect(await new SqliteItemRepository(connection!).getById(item.id))
    .toEqual(result.data.item);
});

test('clears the Place association without inserting any Place row', async () => {
  const runtime = await setup();
  const before = countRows('places');
  const result = await changeItemPlace({
    itemId: item.id,
    target: { kind: 'none' },
  }, dependencies(runtime));

  expect(result.data.place).toBeNull();
  expect(result.data.item.placeId).toBeNull();
  expect(result.affectedEntityIds).toEqual(['item-1']);
  expect(countRows('places')).toEqual(before);
  expect(readItem().place_id).toBeNull();
});

test('a Place change never reorders the Day or touches peer Items', async () => {
  const runtime = await setup();
  const peerBefore = readItem(peerItem.id);

  await changeItemPlace({
    itemId: item.id,
    target: { kind: 'search', result: searchResult },
  }, dependencies(runtime));

  // The Item keeps its exact-time ordering even though its Place moved.
  expect(readItem().sort_order).toBe(0);
  expect(readItem(peerItem.id)).toEqual(peerBefore);
});

test('derives the provider from the Item own Trip, not from the caller', async () => {
  const runtime = await setup([mainlandTrip, globalTrip]);
  const sydneyItem: Item = {
    ...item,
    id: 'item-au',
    tripId: globalTrip.id,
    placeId: null,
  };
  await new SqliteItemRepository(connection!).insert(sydneyItem);

  const sydney: PlaceSearchResult = {
    name: 'Sydney Opera House',
    address: 'Bennelong Point',
    coordinate: { latitude: -33.856784, longitude: 151.215297, system: 'wgs84' },
    provider: 'google',
    providerPlaceId: 'ChIJ3S-JXmauEmsRUcIaWtf4MzE',
    regionLabel: 'NSW',
    metadata: null,
  };
  const result = await changeItemPlace({
    itemId: sydneyItem.id,
    target: { kind: 'search', result: sydney },
  }, dependencies(runtime, 'place-au'));

  expect(result.data.place).toMatchObject({ provider: 'google', coordinate: sydney.coordinate });
});

test('rejects a provider/CRS mismatch and keeps the old Place', async () => {
  const runtime = await setup();
  const before = countRows('places');

  await expect(changeItemPlace({
    itemId: item.id,
    target: {
      kind: 'search',
      result: {
        ...searchResult,
        provider: 'google',
        coordinate: searchResult.coordinate,
      },
    },
  }, dependencies(runtime))).rejects.toThrow('does not match wgs84');

  expect(countRows('places')).toEqual(before);
  expect(readItem().place_id).toBe(oldPlace.id);
});

test('rejects Google and Apple replacement Places outside the mainland Trip scope', async () => {
  const runtime = await setup();
  const before = countRows('places');
  const google: PlaceSearchResult = {
    ...searchResult,
    provider: 'google',
    coordinate: { latitude: 39.916345, longitude: 116.397155, system: 'wgs84' },
  };
  const apple: PlaceSearchResult = { ...google, provider: 'apple' };

  await expect(changeItemPlace({
    itemId: item.id,
    target: { kind: 'search', result: google },
  }, dependencies(runtime))).rejects.toThrow('provider google does not match Trip map region china_mainland');
  await expect(changeItemPlace({
    itemId: item.id,
    target: { kind: 'search', result: apple },
  }, dependencies(runtime))).rejects.toThrow('provider apple does not match Trip map region china_mainland');
  await expect(changeItemPlace({
    itemId: item.id,
    target: {
      kind: 'map-picker',
      coordinate: { latitude: -33.856784, longitude: 151.215297, system: 'wgs84' },
    },
  }, dependencies(runtime))).rejects.toThrow('does not match gcj02');

  expect(countRows('places')).toEqual(before);
  expect(readItem().place_id).toBe(oldPlace.id);
});

test('rejects an enrichment that does not describe the picked coordinate', async () => {
  const runtime = await setup();
  const before = countRows('places');

  await expect(changeItemPlace({
    itemId: item.id,
    target: {
      kind: 'map-picker',
      coordinate: picked,
      enrichment: {
        ...enrichment,
        coordinate: { latitude: 40.001, longitude: 116.281, system: 'gcj02' },
      },
    },
  }, dependencies(runtime))).rejects.toThrow('must describe the picked coordinate');

  await expect(changeItemPlace({
    itemId: item.id,
    target: { kind: 'map-picker', coordinate: { ...picked, system: 'invalid-crs' as 'wgs84' } },
  }, dependencies(runtime))).rejects.toThrow();

  expect(countRows('places')).toEqual(before);
  expect(readItem().place_id).toBe(oldPlace.id);
});

test('rejects an unknown Item without writing anything', async () => {
  const runtime = await setup();
  const before = countRows('places');

  await expect(changeItemPlace({
    itemId: 'item-missing',
    target: { kind: 'search', result: searchResult },
  }, dependencies(runtime))).rejects.toThrow('Item not found');

  expect(countRows('places')).toEqual(before);
});

test('rolls the new Place back when the Item update fails', async () => {
  const runtime = await setup();
  const before = countRows('places');
  const deps = dependencies(runtime);
  deps.runInTransaction = (task) => runtime.runInExclusiveTransaction(async (database) => {
    const items = new SqliteItemRepository(database);
    return task({
      items: {
        getById: (id) => items.getById(id),
        update: async () => { throw new Error('forced Item update failure'); },
      },
      places: new SqlitePlaceRepository(database),
      trips: new SqliteTripRepository(database),
    });
  });

  await expect(changeItemPlace({
    itemId: item.id,
    target: { kind: 'search', result: searchResult },
  }, deps)).rejects.toThrow('forced Item update failure');

  expect(countRows('places')).toEqual(before);
  expect(readItem().place_id).toBe(oldPlace.id);
});
