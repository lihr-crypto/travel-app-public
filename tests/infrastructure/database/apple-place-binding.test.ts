import { afterEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bindApplePlace,
  type BindApplePlaceDependencies,
} from '@/application/place/bind-apple-place';
import type { Place } from '@/domain/place/types';
import type { PlaceSearchResult } from '@/infrastructure/place/place-provider';
import { createApplePlaceBindingSource } from '@/infrastructure/database/apple-place-binding-source';
import { createApplePlaceBindingTransactionRunner } from '@/infrastructure/database/apple-place-binding-transaction';
import { SqliteApplePlaceBindingRepository } from '@/infrastructure/database/sqlite/apple-place-binding-repository';
import { SqlitePlaceRepository } from '@/infrastructure/database/sqlite/place-repository';
import { createNodeSqliteRuntime, NodeSqliteConnection } from '../../helpers/node-sqlite';

const timestamp = '2026-03-29T01:02:03.000Z';
const originalPlace: Place = {
  id: 'source-place',
  name: '故宫博物院',
  coordinate: { latitude: 39.9163, longitude: 116.3972, system: 'gcj02' },
  address: '北京市东城区景山前街4号',
  provider: 'amap',
  providerPlaceId: 'amap-source-1',
  metadata: { category: 'museum', nested: { order: 1 } },
  createdAt: '2026-03-22T00:00:00.000Z',
  updatedAt: '2026-03-23T00:00:00.000Z',
};
const appleResult = {
  name: 'The Palace Museum',
  address: '4 Jingshan Front St, Dongcheng, Beijing',
  coordinate: { latitude: 39.9163, longitude: 116.3972, system: 'wgs84' },
  provider: 'apple',
  providerPlaceId: 'apple-place-1',
  regionLabel: 'Dongcheng District',
  metadata: { category: 'museum', source: 'MapKit' },
} as unknown as PlaceSearchResult;

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

async function setup() {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'travel-apple-binding-'));
  connection = new NodeSqliteConnection(join(temporaryDirectory, 'travel.sqlite'));
  const runtime = createNodeSqliteRuntime(connection);
  await runtime.initialize();

  await runtime.runInExclusiveTransaction(async (database) => {
    await database.runAsync(
      `INSERT INTO trips (
         id, title, start_date, end_date, map_region, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      ['trip-1', 'Beijing visit', '2026-03-29', '2026-03-30', 'china_mainland', timestamp, timestamp],
    );
    await database.runAsync(
      `INSERT INTO days (
         id, trip_id, date, day_index, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?);`,
      ['day-1', 'trip-1', '2026-03-29', 1, timestamp, timestamp],
    );
    await database.runAsync(
      `INSERT INTO places (
         id, name, latitude, longitude, coordinate_system, address, provider,
         provider_place_id, metadata_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        originalPlace.id,
        originalPlace.name,
        originalPlace.coordinate.latitude,
        originalPlace.coordinate.longitude,
        originalPlace.coordinate.system,
        originalPlace.address,
        originalPlace.provider,
        originalPlace.providerPlaceId,
        JSON.stringify(originalPlace.metadata),
        originalPlace.createdAt,
        originalPlace.updatedAt,
      ],
    );
    await database.runAsync(
      `INSERT INTO items (
         id, trip_id, day_id, place_id, type, title, sort_order, time_mode,
         start_datetime, end_datetime, period, is_fixed, note, payload_json,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        'item-1', 'trip-1', 'day-1', originalPlace.id, 'food', 'Lunch at the museum',
        7, 'exact', '2026-03-29T12:15', '2026-03-29T13:00', null, true,
        'Keep the original plan', '{"kind":"custom","label":"Lunch"}', timestamp, timestamp,
      ],
    );
  });

  return runtime;
}

function dependencies(
  runtime: Awaited<ReturnType<typeof setup>>,
  ...placeIds: string[]
): BindApplePlaceDependencies {
  let nextId = 0;
  return {
    createPlaceId: () => placeIds[nextId++] ?? `unexpected-${nextId}`,
    now: () => timestamp,
    runInTransaction: createApplePlaceBindingTransactionRunner(
      runtime.runInExclusiveTransaction,
    ),
  };
}

function readSourcePlaceRow() {
  return connection!.database.prepare('SELECT * FROM places WHERE id = ?').get(originalPlace.id);
}

function readItemRow() {
  return connection!.database.prepare('SELECT * FROM items WHERE id = ?').get('item-1');
}

test('binds an Apple snapshot without changing original Place or Item rows and survives reopen', async () => {
  const runtime = await setup();
  const sourceBefore = readSourcePlaceRow();
  const itemBefore = readItemRow();

  const first = await bindApplePlace(
    { sourcePlaceId: originalPlace.id, result: appleResult },
    dependencies(runtime, 'apple-snapshot-1', 'unused-snapshot'),
  );
  expect(first.data).toMatchObject({
    id: 'apple-snapshot-1',
    name: 'The Palace Museum',
    provider: 'apple',
    providerPlaceId: 'apple-place-1',
    coordinate: appleResult.coordinate,
  });
  expect(readSourcePlaceRow()).toEqual(sourceBefore);
  expect(readItemRow()).toEqual(itemBefore);

  const repeated = await bindApplePlace(
    { sourcePlaceId: originalPlace.id, result: appleResult },
    dependencies(runtime, 'unused-snapshot'),
  );
  expect(repeated.data.id).toBe(first.data.id);
  expect(connection!.database.prepare('SELECT COUNT(*) AS count FROM places').get())
    .toEqual({ count: 2 });

  const source = createApplePlaceBindingSource(runtime.runInReadContext);
  expect(await source.getBindings([originalPlace.id, originalPlace.id])).toEqual({
    [originalPlace.id]: first.data,
  });
  expect(await source.getBindings([])).toEqual({});
  expect(connection!.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

  connection!.close();
  connection = new NodeSqliteConnection(join(temporaryDirectory!, 'travel.sqlite'));
  const reopenedRuntime = createNodeSqliteRuntime(connection);
  await reopenedRuntime.initialize();
  const reopenedSource = createApplePlaceBindingSource(reopenedRuntime.runInReadContext);
  expect(await reopenedSource.getBindings([originalPlace.id])).toEqual({
    [originalPlace.id]: first.data,
  });
  expect(connection.database.prepare('SELECT * FROM places WHERE id = ?').get(originalPlace.id))
    .toEqual(sourceBefore);
  expect(connection.database.prepare('SELECT * FROM items WHERE id = ?').get('item-1'))
    .toEqual(itemBefore);
  expect(connection.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

test('a confirmed replacement upserts only the binding and retains prior Place data', async () => {
  const runtime = await setup();
  const sourceBefore = readSourcePlaceRow();
  const itemBefore = readItemRow();
  const first = await bindApplePlace(
    { sourcePlaceId: originalPlace.id, result: appleResult },
    dependencies(runtime, 'apple-snapshot-1'),
  );
  const replacementResult = {
    ...appleResult,
    name: 'The Palace Museum (Apple Maps)',
    providerPlaceId: 'apple-place-2',
  } as PlaceSearchResult;
  const replacement = await bindApplePlace(
    { sourcePlaceId: originalPlace.id, result: replacementResult },
    dependencies(runtime, 'apple-snapshot-2'),
  );

  expect(replacement.data.id).toBe('apple-snapshot-2');
  expect(connection!.database.prepare('SELECT COUNT(*) AS count FROM places').get())
    .toEqual({ count: 3 });
  const source = createApplePlaceBindingSource(runtime.runInReadContext);
  expect((await source.getBindings([originalPlace.id]))[originalPlace.id])
    .toEqual(replacement.data);
  expect(await new SqlitePlaceRepository(connection!).getById(first.data.id))
    .toEqual(first.data);
  expect(readSourcePlaceRow()).toEqual(sourceBefore);
  expect(readItemRow()).toEqual(itemBefore);
  expect(connection!.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

test('rolls back a newly inserted Apple snapshot when binding persistence fails', async () => {
  const runtime = await setup();
  const sourceBefore = readSourcePlaceRow();
  const itemBefore = readItemRow();
  connection!.database.exec(`
    CREATE TRIGGER fail_apple_binding
    BEFORE INSERT ON apple_place_bindings
    BEGIN
      SELECT RAISE(ABORT, 'forced binding failure');
    END;
  `);

  await expect(bindApplePlace(
    { sourcePlaceId: originalPlace.id, result: appleResult },
    dependencies(runtime, 'apple-snapshot-rollback'),
  )).rejects.toThrow('forced binding failure');

  expect(connection!.database.prepare('SELECT COUNT(*) AS count FROM places').get())
    .toEqual({ count: 1 });
  expect(connection!.database.prepare('SELECT COUNT(*) AS count FROM apple_place_bindings').get())
    .toEqual({ count: 0 });
  expect(readSourcePlaceRow()).toEqual(sourceBefore);
  expect(readItemRow()).toEqual(itemBefore);
  expect(connection!.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

test('rejects invalid Apple snapshots, missing sources, and broken binding references', async () => {
  const runtime = await setup();
  await expect(bindApplePlace(
    {
      sourcePlaceId: originalPlace.id,
      result: { ...appleResult, provider: 'google' } as PlaceSearchResult,
    },
    dependencies(runtime, 'unused'),
  )).rejects.toThrow('provider must be apple');
  await expect(bindApplePlace(
    {
      sourcePlaceId: originalPlace.id,
      result: {
        ...appleResult,
        coordinate: { latitude: 91, longitude: 0, system: 'wgs84' },
      } as PlaceSearchResult,
    },
    dependencies(runtime, 'unused'),
  )).rejects.toThrow('Invalid Coordinate');
  await expect(bindApplePlace(
    { sourcePlaceId: 'missing-source', result: appleResult },
    dependencies(runtime, 'unused'),
  )).rejects.toThrow('Source Place not found');
  expect(connection!.database.prepare('SELECT COUNT(*) AS count FROM places').get())
    .toEqual({ count: 1 });

  const brokenBinding = new SqliteApplePlaceBindingRepository(connection!);
  await expect(runtime.runInExclusiveTransaction(() => brokenBinding.upsert({
    sourcePlaceId: 'missing-source',
    applePlaceId: 'missing-apple-place',
    createdAt: timestamp,
  }))).rejects.toThrow();
  await expect(runtime.runInExclusiveTransaction(() => brokenBinding.upsert({
    sourcePlaceId: originalPlace.id,
    applePlaceId: 'missing-apple-place',
    createdAt: timestamp,
  }))).rejects.toThrow();
});

test('binding reads fail closed when a referenced Apple snapshot is missing', async () => {
  const runtime = await setup();
  const bound = await bindApplePlace(
    { sourcePlaceId: originalPlace.id, result: appleResult },
    dependencies(runtime, 'apple-snapshot-1'),
  );
  connection!.database.exec('PRAGMA foreign_keys = OFF;');
  connection!.database.prepare('DELETE FROM places WHERE id = ?').run(bound.data.id);
  connection!.database.exec('PRAGMA foreign_keys = ON;');

  const source = createApplePlaceBindingSource(runtime.runInReadContext);
  await expect(source.getBindings([originalPlace.id]))
    .rejects.toThrow('Apple Place binding target not found');
});
