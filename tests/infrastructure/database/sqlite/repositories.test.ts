import { afterEach, expect, test } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';

import type { Day, Trip } from '@/domain/trip/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import { runMigrations } from '@/infrastructure/database/migrations';
import type {
  DatabaseBindParams,
  DatabaseConnection,
  DatabaseExecutor,
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

  constructor() {
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

const trip: Trip = {
  id: 'trip-1',
  title: 'Hokkaido',
  startDate: '2026-12-30',
  endDate: '2027-01-02',
  mapRegion: 'global',
  note: null,
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: '2026-09-11T00:00:00.000Z',
};

const days: Day[] = [
  {
    id: 'day-1',
    tripId: trip.id,
    date: '2026-12-30',
    dayIndex: 1,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  },
  {
    id: 'day-2',
    tripId: trip.id,
    date: '2026-12-31',
    dayIndex: 2,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  },
];

let connection: NodeSqliteConnection | undefined;

afterEach(() => {
  connection?.close();
  connection = undefined;
});

async function createRepositories() {
  connection = new NodeSqliteConnection();
  await runMigrations(connection);

  return {
    days: new SqliteDayRepository(connection),
    items: new SqliteItemRepository(connection),
    places: new SqlitePlaceRepository(connection),
    trips: new SqliteTripRepository(connection),
  };
}

test('Place snapshots preserve native CRS, provider fields, and metadata', async () => {
  const repositories = await createRepositories();
  const globalPlace: Place = {
    id: 'place-global',
    name: 'Tokyo Station',
    coordinate: { latitude: 35.6812, longitude: 139.7671, system: 'wgs84' },
    address: 'Tokyo',
    provider: 'google',
    providerPlaceId: 'google-1',
    metadata: { source: 'fixture', floor: 1 },
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
  const mainlandPlace: Place = {
    ...globalPlace,
    id: 'place-mainland',
    name: '北京站',
    coordinate: { latitude: 39.9024, longitude: 116.4271, system: 'gcj02' },
    address: null,
    provider: null,
    providerPlaceId: null,
    metadata: null,
  };

  await repositories.places.insert(globalPlace);
  await repositories.places.insert(mainlandPlace);

  expect(await repositories.places.getById(globalPlace.id)).toEqual(globalPlace);
  expect(await repositories.places.getById(mainlandPlace.id)).toEqual(mainlandPlace);
  expect(await repositories.places.getById('missing')).toBeNull();
  expect(connection?.database.prepare('SELECT coordinate_system FROM places WHERE id = ?')
    .get(mainlandPlace.id)).toEqual({ coordinate_system: 'gcj02' });
});

test('Place repository reads a batch by id, de-duplicated and empty-safe', async () => {
  const repositories = await createRepositories();
  const makePlace = (id: string, name: string): Place => ({
    id,
    name,
    coordinate: { latitude: 39.90923, longitude: 116.397428, system: 'gcj02' },
    address: null,
    provider: 'amap',
    providerPlaceId: null,
    metadata: null,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  });
  const first = makePlace('place-1', '天安门');
  const second = makePlace('place-2', '故宫');
  await repositories.places.insert(first);
  await repositories.places.insert(second);

  // A repeated id is one row, not two, and the order of the input does not
  // constrain the result.
  expect(await repositories.places.listByIds(['place-2', 'place-1', 'place-2']))
    .toEqual(expect.arrayContaining([first, second]));
  expect(await repositories.places.listByIds(['place-2', 'place-1', 'place-2']))
    .toHaveLength(2);
  // Unknown ids are simply absent; the caller decides whether that is corruption.
  expect(await repositories.places.listByIds(['place-1', 'missing'])).toEqual([first]);
  // An empty batch must not emit an invalid `IN ()`.
  expect(await repositories.places.listByIds([])).toEqual([]);
});

test('Place repository rejects invalid coordinates before persistence and on read', async () => {
  const repositories = await createRepositories();
  const place: Place = {
    id: 'place-invalid',
    name: 'Invalid',
    coordinate: { latitude: 91, longitude: 0, system: 'wgs84' },
    address: null,
    provider: null,
    providerPlaceId: null,
    metadata: null,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };

  await expect(repositories.places.insert(place)).rejects.toThrow('Invalid Coordinate');
  expect(await repositories.places.getById(place.id)).toBeNull();

  connection?.database.prepare(`
    INSERT INTO places (
      id, name, latitude, longitude, coordinate_system, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('bad-crs', 'Bad CRS', 39.9, 116.4, 'bd09', trip.createdAt, trip.updatedAt);

  await expect(repositories.places.getById('bad-crs')).rejects.toThrow('Invalid Coordinate');
});

test('Trip repository maps insert, read, list, update, and delete', async () => {
  const repositories = await createRepositories();

  await repositories.trips.insert(trip);

  expect(await repositories.trips.getById(trip.id)).toEqual(trip);
  expect(await repositories.trips.list()).toEqual([trip]);

  const updatedTrip: Trip = {
    ...trip,
    title: 'Winter Hokkaido',
    mapRegion: 'china_mainland',
    note: 'Snow trip',
    updatedAt: '2026-09-12T00:00:00.000Z',
  };
  await repositories.trips.update(updatedTrip);

  expect(await repositories.trips.getById(trip.id)).toEqual(updatedTrip);

  await repositories.trips.delete(trip.id);

  expect(await repositories.trips.getById(trip.id)).toBeNull();
});

test('Item repository maps canonical fields and lists a Day in sort order', async () => {
  const repositories = await createRepositories();
  await repositories.trips.insert(trip);
  await repositories.days.insertMany(days);

  const laterItem: Item = {
    id: 'item-b',
    tripId: trip.id,
    dayId: days[0].id,
    placeId: null,
    type: 'transport',
    title: 'Airport train',
    sortOrder: 20,
    timeMode: 'exact',
    startDateTime: '2026-12-30T09:15',
    endDateTime: '2026-12-30T10:00',
    period: null,
    isFixed: true,
    note: 'Reserved seat',
    payload: {
      kind: 'transport',
      mode: 'train',
      serviceNumber: 'AP-1',
      origin: 'Airport',
      destination: 'City',
    },
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
  const earlierItem: Item = {
    ...laterItem,
    id: 'item-a',
    title: 'Breakfast',
    type: 'food',
    sortOrder: 10,
    timeMode: 'period',
    startDateTime: null,
    endDateTime: null,
    period: 'morning',
    isFixed: false,
    note: null,
    payload: null,
  };

  await repositories.items.insert(laterItem);
  await repositories.items.insert(earlierItem);

  expect(await repositories.items.getById(laterItem.id)).toEqual(laterItem);
  expect(await repositories.items.listByDayId(days[0].id)).toEqual([
    earlierItem,
    laterItem,
  ]);
  expect(await repositories.items.listByDayId(days[1].id)).toEqual([]);
});

test('Item repository lists only Unscheduled Items for the requested Trip', async () => {
  const repositories = await createRepositories();
  await repositories.trips.insert(trip);
  await repositories.days.insertMany(days);

  const unscheduled: Item = {
    id: 'item-unscheduled',
    tripId: trip.id,
    dayId: null,
    placeId: null,
    type: 'hotel',
    title: 'Hotel',
    sortOrder: 5,
    timeMode: 'none',
    startDateTime: null,
    endDateTime: null,
    period: null,
    isFixed: false,
    note: null,
    payload: { kind: 'hotel' },
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
  const scheduled: Item = {
    ...unscheduled,
    id: 'item-scheduled',
    dayId: days[0].id,
    sortOrder: 1,
  };

  await repositories.items.insert(scheduled);
  await repositories.items.insert(unscheduled);

  expect(
    await repositories.items.listUnscheduledByTripId(trip.id),
  ).toEqual([unscheduled]);
});

test('Item repository updates nullable, time, payload, and boolean fields', async () => {
  const repositories = await createRepositories();
  await repositories.trips.insert(trip);
  await repositories.days.insertMany(days);

  const item: Item = {
    id: 'item-1',
    tripId: trip.id,
    dayId: null,
    placeId: null,
    type: 'custom',
    title: 'Draft',
    sortOrder: 10,
    timeMode: 'none',
    startDateTime: null,
    endDateTime: null,
    period: null,
    isFixed: false,
    note: null,
    payload: null,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
  await repositories.items.insert(item);

  const updatedItem: Item = {
    ...item,
    dayId: days[1].id,
    title: 'Confirmed',
    sortOrder: 2,
    timeMode: 'exact',
    startDateTime: '2026-12-31T18:00',
    endDateTime: null,
    isFixed: true,
    note: 'Meet at the entrance',
    updatedAt: '2026-09-12T00:00:00.000Z',
  };
  await repositories.items.update(updatedItem);

  expect(await repositories.items.getById(item.id)).toEqual(updatedItem);
  expect(
    connection!.database
      .prepare('SELECT is_fixed FROM items WHERE id = ?')
      .get(item.id),
  ).toEqual({ is_fixed: 1 });
});

test('Item repository normalizes custom payloads and validates SQLite reads and writes', async () => {
  const repositories = await createRepositories();
  await repositories.trips.insert(trip);
  await repositories.days.insertMany(days);

  const customItem: Item = {
    id: 'item-custom',
    tripId: trip.id,
    dayId: days[0].id,
    placeId: null,
    type: 'custom',
    title: 'Ramen stop',
    sortOrder: 0,
    timeMode: 'none',
    startDateTime: null,
    endDateTime: null,
    period: null,
    isFixed: false,
    note: null,
    payload: { kind: 'custom', label: '  Ramen  ' },
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };

  await repositories.items.insert(customItem);

  expect(await repositories.items.getById(customItem.id)).toEqual({
    ...customItem,
    payload: { kind: 'custom', label: 'Ramen' },
  });

  await expect(repositories.items.insert({
    ...customItem,
    id: 'item-custom-overlong',
    payload: { kind: 'custom', label: 'x'.repeat(21) },
  })).rejects.toThrow('Custom Item label must not exceed 20 characters');
  expect(await repositories.items.getById('item-custom-overlong')).toBeNull();

  connection!.database.prepare(`
    INSERT INTO items (
      id, trip_id, day_id, type, title, sort_order, time_mode, payload_json,
      is_fixed, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'item-custom-corrupt', trip.id, days[0].id, 'custom', 'Corrupt', 1,
    'none', JSON.stringify({ kind: 'custom' }), 0,
    trip.createdAt, trip.updatedAt,
  );

  await expect(repositories.items.getById('item-custom-corrupt'))
    .rejects.toThrow('Invalid custom Item payload');

  connection!.database.prepare(`
    INSERT INTO items (
      id, trip_id, day_id, type, title, sort_order, time_mode, payload_json,
      is_fixed, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'item-custom-wrong-type', trip.id, days[0].id, 'food', 'Wrong type', 2,
    'none', JSON.stringify({ kind: 'custom', label: 'Gift shop' }), 0,
    trip.createdAt, trip.updatedAt,
  );

  await expect(repositories.items.getById('item-custom-wrong-type'))
    .rejects.toThrow('Item payload does not match type: food');
});

test('Day repository maps insertMany, read, and ordered list', async () => {
  const repositories = await createRepositories();
  await repositories.trips.insert(trip);

  await repositories.days.insertMany([...days].reverse());

  expect(await repositories.days.getById('day-1')).toEqual(days[0]);
  expect(await repositories.days.listByTripId(trip.id)).toEqual(days);
});

test('Day repository exposes the unique Trip date constraint', async () => {
  const repositories = await createRepositories();
  await repositories.trips.insert(trip);
  await repositories.days.insertMany([days[0]]);

  await expect(
    repositories.days.insertMany([
      { ...days[1], id: 'duplicate-date', date: days[0].date },
    ]),
  ).rejects.toThrow();
});

test('Day repository exposes the unique Trip dayIndex constraint', async () => {
  const repositories = await createRepositories();
  await repositories.trips.insert(trip);
  await repositories.days.insertMany([days[0]]);

  await expect(
    repositories.days.insertMany([
      { ...days[1], id: 'duplicate-index', dayIndex: days[0].dayIndex },
    ]),
  ).rejects.toThrow();
});
