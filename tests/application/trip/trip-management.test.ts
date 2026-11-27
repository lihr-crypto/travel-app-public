import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Day, Trip } from '@/domain/trip/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import { deleteTrip } from '@/application/trip/delete-trip';
import { renameTrip } from '@/application/trip/rename-trip';
import { SqliteDayRepository } from '@/infrastructure/database/sqlite/day-repository';
import { SqliteItemRepository } from '@/infrastructure/database/sqlite/item-repository';
import { SqlitePlaceRepository } from '@/infrastructure/database/sqlite/place-repository';
import { SqliteTripRepository } from '@/infrastructure/database/sqlite/trip-repository';
import {
  createDeleteTripTransactionRunner,
  createRenameTripTransactionRunner,
} from '@/infrastructure/database/trip-transaction';
import { createNodeSqliteRuntime, NodeSqliteConnection } from '../../helpers/node-sqlite';

const timestamp = '2026-10-08T00:00:00.000Z';

const firstTrip: Trip = {
  id: 'trip-delete',
  title: '  Original title  ',
  startDate: '2026-12-01',
  endDate: '2026-12-02',
  mapRegion: 'global',
  note: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const secondTrip: Trip = {
  ...firstTrip,
  id: 'trip-keep',
  title: 'Keep this Trip',
};

const firstDays: Day[] = [
  {
    id: 'day-delete-1',
    tripId: firstTrip.id,
    date: '2026-12-01',
    dayIndex: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'day-delete-2',
    tripId: firstTrip.id,
    date: '2026-12-02',
    dayIndex: 2,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

const secondDay: Day = {
  ...firstDays[0],
  id: 'day-keep-1',
  tripId: secondTrip.id,
};

const sharedPlace: Place = {
  id: 'place-shared',
  name: 'Shared snapshot',
  coordinate: { latitude: 35.6812, longitude: 139.7671, system: 'wgs84' },
  address: 'Tokyo',
  provider: 'google',
  providerPlaceId: 'google-shared',
  metadata: { source: 'test' },
  createdAt: timestamp,
  updatedAt: timestamp,
};

function item(id: string, tripId: string, dayId: string | null): Item {
  return {
    id,
    tripId,
    dayId,
    placeId: sharedPlace.id,
    type: 'sightseeing',
    title: id,
    sortOrder: 0,
    timeMode: 'none',
    startDateTime: null,
    endDateTime: null,
    period: null,
    isFixed: false,
    note: null,
    payload: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

let connection: NodeSqliteConnection | undefined;
let temporaryDirectory: string | undefined;

beforeEach(async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'travel-app-trip-management-'));
  connection = new NodeSqliteConnection(join(temporaryDirectory, 'travel-app.db'));
  await createNodeSqliteRuntime(connection!).initialize();
});

afterEach(() => {
  connection?.close();
  connection = undefined;
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { force: true, recursive: true });
    temporaryDirectory = undefined;
  }
});

async function seedGraph() {
  if (!connection) throw new Error('SQLite test connection is not open');
  const trips = new SqliteTripRepository(connection!);
  const days = new SqliteDayRepository(connection);
  const items = new SqliteItemRepository(connection);
  const places = new SqlitePlaceRepository(connection);

  await trips.insert(firstTrip);
  await trips.insert(secondTrip);
  await days.insertMany([...firstDays, secondDay]);
  await places.insert(sharedPlace);
  await items.insert(item('item-scheduled-delete', firstTrip.id, firstDays[0].id));
  await items.insert(item('item-unscheduled-delete', firstTrip.id, null));
  await items.insert(item('item-keep', secondTrip.id, secondDay.id));

  return { days, items, places, trips };
}

test('renameTrip trims the title and commits the complete Trip update atomically', async () => {
  const { trips } = await seedGraph();
  const runtime = createNodeSqliteRuntime(connection!);
  const result = await renameTrip(
    { tripId: firstTrip.id, title: '  Renamed Trip  ' },
    {
      now: () => '2026-10-09T00:00:00.000Z',
      runInTransaction: createRenameTripTransactionRunner(runtime.runInExclusiveTransaction),
    },
  );

  expect(result.data).toEqual({
    ...firstTrip,
    title: 'Renamed Trip',
    updatedAt: '2026-10-09T00:00:00.000Z',
  });
  expect(await trips.getById(firstTrip.id)).toEqual(result.data);
  expect(await trips.getById(secondTrip.id)).toEqual(secondTrip);
});

test('renameTrip rolls back when the SQLite update fails', async () => {
  await seedGraph();
  if (!connection) throw new Error('SQLite test connection is not open');
  connection.database.exec(`
    CREATE TRIGGER fail_trip_rename
    BEFORE UPDATE OF title ON trips
    WHEN NEW.title = 'trigger failure'
    BEGIN SELECT RAISE(ABORT, 'rename trigger failure'); END;
  `);
  const runtime = createNodeSqliteRuntime(connection!);

  await expect(renameTrip(
    { tripId: firstTrip.id, title: 'trigger failure' },
    {
      now: () => '2026-10-09T00:00:00.000Z',
      runInTransaction: createRenameTripTransactionRunner(runtime.runInExclusiveTransaction),
    },
  )).rejects.toThrow('rename trigger failure');

  expect(await new SqliteTripRepository(connection!).getById(firstTrip.id)).toEqual(firstTrip);
});

test('deleteTrip cascades Days and scheduled/Unscheduled Items but keeps shared Place snapshots and other Trips', async () => {
  const { days, items, places, trips } = await seedGraph();
  if (!connection) throw new Error('SQLite test connection is not open');
  const runtime = createNodeSqliteRuntime(connection!);
  const result = await deleteTrip(
    { tripId: firstTrip.id },
    {
      runInTransaction: createDeleteTripTransactionRunner(runtime.runInExclusiveTransaction),
    },
  );

  expect(result).toEqual({
    data: undefined,
    affectedEntityIds: [firstTrip.id],
    validationIssues: [],
  });
  expect(await trips.getById(firstTrip.id)).toBeNull();
  expect(await days.listByTripId(firstTrip.id)).toEqual([]);
  expect(await items.listUnscheduledByTripId(firstTrip.id)).toEqual([]);
  expect(await places.getById(sharedPlace.id)).toEqual(sharedPlace);
  expect(await trips.getById(secondTrip.id)).toEqual(secondTrip);
  expect(await days.listByTripId(secondTrip.id)).toEqual([secondDay]);
  expect(await items.listByDayId(secondDay.id)).toEqual([item('item-keep', secondTrip.id, secondDay.id)]);
});
