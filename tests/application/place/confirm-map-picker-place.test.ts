import { afterEach, expect, test } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';

import {
  confirmMapPickerPlace,
  resolveCoordinatePlaceName,
  type ConfirmMapPickerPlaceDependencies,
} from '@/application/place/confirm-map-picker-place';
import type { Coordinate } from '@/domain/common/types';
import type { Day, Trip } from '@/domain/trip/types';
import { createConfirmMapPickerPlaceTransactionRunner } from '@/infrastructure/database/place-item-transaction';
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
import type { ReverseGeocodeResult } from '@/infrastructure/place/place-provider';

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
  startDate: '2026-10-01',
  endDate: '2026-10-02',
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

const picked: Coordinate = {
  latitude: 39.999676,
  longitude: 116.275118,
  system: 'gcj02',
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
    for (const trip of trips) {
      await tripRepository.insert(trip);
    }
    await new SqliteDayRepository(database).insertMany([day]);
  });
  return runtime;
}

function dependencies(
  runtime: Awaited<ReturnType<typeof setup>>,
  placeId = 'place-1',
  itemId = 'item-1',
): ConfirmMapPickerPlaceDependencies {
  return {
    createPlaceId: () => placeId,
    createItemId: () => itemId,
    now: () => timestamp,
    runInTransaction: createConfirmMapPickerPlaceTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };
}

function countRows(table: 'places' | 'items') {
  return connection!.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
}

test('resolves a deterministic coordinate label that never claims a place name', () => {
  expect(resolveCoordinatePlaceName(null, picked)).toBe('39.99968, 116.27512');
  expect(resolveCoordinatePlaceName(undefined, picked)).toBe('39.99968, 116.27512');
  expect(resolveCoordinatePlaceName({ ...enrichment, name: '  ' }, picked))
    .toBe('北京市海淀区新建宫门路19号');
  expect(resolveCoordinatePlaceName(
    { ...enrichment, name: null, address: null },
    picked,
  )).toBe('39.99968, 116.27512');
});

test('persists a coordinate-only Place and Item when the provider had no answer', async () => {
  const runtime = await setup();
  const commandResult = await confirmMapPickerPlace({
    tripId: mainlandTrip.id,
    dayId: day.id,
    coordinate: picked,
    enrichment: null,
  }, dependencies(runtime));

  expect(commandResult.data.place).toMatchObject({
    id: 'place-1',
    name: '39.99968, 116.27512',
    coordinate: picked,
    address: null,
    provider: 'amap',
    providerPlaceId: null,
    metadata: null,
  });
  expect(commandResult.data.item).toMatchObject({
    id: 'item-1',
    dayId: day.id,
    placeId: 'place-1',
    title: '39.99968, 116.27512',
    type: 'custom',
    sortOrder: 0,
  });
  expect(await new SqlitePlaceRepository(connection!).getById('place-1'))
    .toEqual(commandResult.data.place);
});

test('persists the edited Item Draft beside a Map Picker Place in one transaction', async () => {
  const runtime = await setup();
  const commandResult = await confirmMapPickerPlace({
    tripId: mainlandTrip.id,
    dayId: day.id,
    coordinate: picked,
    enrichment,
    draft: {
      title: 'Booked garden visit',
      type: 'sightseeing',
      timeMode: 'exact',
      startDateTime: '2026-10-01T10:30',
      endDateTime: '2026-10-01T12:00',
      period: null,
      note: 'Bring tickets',
    },
  }, dependencies(runtime));

  expect(commandResult.data.item).toMatchObject({
    title: 'Booked garden visit',
    timeMode: 'exact',
    startDateTime: '2026-10-01T10:30',
    endDateTime: '2026-10-01T12:00',
    // `ItemDraft` no longer carries `isFixed`, so a new Item always starts false.
    isFixed: false,
    note: 'Bring tickets',
    placeId: commandResult.data.place.id,
  });
  expect(await new SqliteItemRepository(connection!).getById(commandResult.data.item.id))
    .toEqual(commandResult.data.item);
});

test('attaches a matching enrichment as the saved Place name and address', async () => {
  const runtime = await setup();
  const commandResult = await confirmMapPickerPlace({
    tripId: mainlandTrip.id,
    dayId: day.id,
    coordinate: picked,
    enrichment,
    itemType: 'sightseeing',
  }, dependencies(runtime));

  expect(commandResult.data.place).toMatchObject({
    name: '颐和园',
    address: '北京市海淀区新建宫门路19号',
    provider: 'amap',
    providerPlaceId: 'B000SAMP01',
    metadata: { township: '海淀镇' },
  });
  expect(commandResult.data.item).toMatchObject({
    title: '颐和园',
    type: 'sightseeing',
  });
});

test('falls back to the enrichment address when the provider reported no name', async () => {
  const runtime = await setup();
  const commandResult = await confirmMapPickerPlace({
    tripId: mainlandTrip.id,
    dayId: day.id,
    coordinate: picked,
    enrichment: { ...enrichment, name: null, providerPlaceId: null },
  }, dependencies(runtime));

  expect(commandResult.data.place.name).toBe('北京市海淀区新建宫门路19号');
});

test('rejects a map pick with an unknown CRS without writes', async () => {
  const runtime = await setup();
  await expect(confirmMapPickerPlace({
    tripId: mainlandTrip.id,
    dayId: day.id,
    coordinate: { ...picked, system: 'bad-crs' as 'wgs84' },
  }, dependencies(runtime))).rejects.toThrow();

  expect(countRows('places')).toEqual({ count: 0 });
  expect(countRows('items')).toEqual({ count: 0 });
});

test('rejects a stale or foreign enrichment without writes', async () => {
  const runtime = await setup();
  await expect(confirmMapPickerPlace({
    tripId: mainlandTrip.id,
    dayId: day.id,
    coordinate: picked,
    enrichment: {
      ...enrichment,
      coordinate: { latitude: 40.001, longitude: 116.281, system: 'gcj02' },
    },
  }, dependencies(runtime))).rejects.toThrow('must describe the picked coordinate');

  await expect(confirmMapPickerPlace({
    tripId: mainlandTrip.id,
    dayId: day.id,
    coordinate: picked,
    enrichment: {
      ...enrichment,
      provider: 'google',
      coordinate: { ...picked, system: 'wgs84' },
    },
  }, dependencies(runtime))).rejects.toThrow('enrichment provider must match');

  expect(countRows('places')).toEqual({ count: 0 });
  expect(countRows('items')).toEqual({ count: 0 });
});

test('derives the provider from the Trip region instead of the caller', async () => {
  const runtime = await setup([mainlandTrip, globalTrip]);
  const sydney: Coordinate = {
    latitude: -33.856784,
    longitude: 151.215297,
    system: 'wgs84',
  };
  const commandResult = await confirmMapPickerPlace({
    tripId: globalTrip.id,
    dayId: null,
    coordinate: sydney,
  }, dependencies(runtime, 'place-au', 'item-au'));

  expect(commandResult.data.place).toMatchObject({
    provider: 'google',
    coordinate: sydney,
    name: '-33.85678, 151.21530',
  });
  expect(commandResult.data.item.dayId).toBeNull();
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

  await expect(confirmMapPickerPlace({
    tripId: mainlandTrip.id,
    dayId: day.id,
    coordinate: picked,
  }, deps)).rejects.toThrow('forced Item failure');

  expect(countRows('places')).toEqual({ count: 0 });
  expect(countRows('items')).toEqual({ count: 0 });
});

test('rejects an Apple or foreign-CRS map pick in a mainland Trip without writes', async () => {
  const runtime = await setup();
  const coordinate: Coordinate = { latitude: 31.7273, longitude: 118.8627, system: 'wgs84' };
  await expect(confirmMapPickerPlace({
    tripId: mainlandTrip.id,
    dayId: day.id,
    coordinate,
    provider: 'apple',
    enrichment: null,
  }, dependencies(runtime))).rejects.toThrow('does not match Trip map region china_mainland');
  // An omitted provider follows the Trip's AMap/GCJ-02 policy, not the
  // coordinate system carried by an arbitrary foreign map.
  await expect(confirmMapPickerPlace({
    tripId: mainlandTrip.id,
    dayId: day.id,
    coordinate,
  }, dependencies(runtime))).rejects.toThrow('does not match gcj02');
  expect(countRows('places')).toEqual({ count: 0 });
  expect(countRows('items')).toEqual({ count: 0 });
});
