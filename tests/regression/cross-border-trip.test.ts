import { expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqlitePlaceRepository } from '@/infrastructure/database/sqlite/place-repository';
import { SqliteItemRepository } from '@/infrastructure/database/sqlite/item-repository';
import { regionalTripMapPlaces } from '@/application/projections/regional-trip-places';
import { createTrip } from '@/application/trip/create-trip';
import { confirmPlaceSearchResult } from '@/application/place/confirm-place-search-result';
import { buildTripOverviewProjection } from '@/application/projections/trip-overview';
import { createTripDayTransactionRunner } from '@/infrastructure/database/trip-day-transaction';
import { createConfirmPlaceSearchResultTransactionRunner } from '@/infrastructure/database/place-item-transaction';
import { createTripOverviewQuerySource } from '@/infrastructure/database/trip-overview-query-source';
import { NodeSqliteConnection, createNodeSqliteRuntime } from '../helpers/node-sqlite';

test('new source mixing is rejected while existing legacy mixed Items survive reopen unchanged', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'travel-cross-border-'));
  const file = join(directory, 'trip.sqlite');
  let connection = new NodeSqliteConnection(file);
  try {
    const runtime = createNodeSqliteRuntime(connection);
    let sequence = 0;
    const id = () => `entity-${++sequence}`;
    const now = () => '2026-10-08T00:00:00.000Z';
    const created = await createTrip({
      title: '北京与东京', mapRegion: 'china_mainland', startDate: '2026-10-09', endDate: '2026-10-09',
    }, { createId: id, now, runInTransaction: createTripDayTransactionRunner(runtime.runInExclusiveTransaction) });
    const source = createTripOverviewQuerySource(runtime.runInReadContext);
    const initial = await source.getTripOverview(created.data.id);
    const dependencies = {
      createPlaceId: id, createItemId: id, now,
      runInTransaction: createConfirmPlaceSearchResultTransactionRunner(runtime.runInExclusiveTransaction),
    };
    const mainland = await confirmPlaceSearchResult({
      tripId: created.data.id, dayId: initial.days[0].id,
      result: {
        name: '北京', address: null, regionLabel: '北京', provider: 'amap', providerPlaceId: 'beijing',
        coordinate: { latitude: 39.9042, longitude: 116.4074, system: 'gcj02' }, metadata: null,
      },
      draft: {
        title: '抵达北京', type: 'transport', timeMode: 'exact', startDateTime: null,
        endDateTime: '2026-10-09T08:00', period: null, note: null, payload: { kind: 'transport' },
      },
    }, dependencies);
    const overseasResult = {
      name: '东京', address: null, regionLabel: '东京', provider: 'google' as const, providerPlaceId: 'tokyo',
      coordinate: { latitude: 35.6762, longitude: 139.6503, system: 'wgs84' as const }, metadata: null,
    };
    await expect(confirmPlaceSearchResult({ tripId: created.data.id, dayId: initial.days[0].id,
      result: overseasResult }, dependencies)).rejects.toThrow('does not match Trip map region');
    // Fixture an old version's already-persisted mixed Item, without using a new write command.
    const oldForeignPlace = { ...overseasResult, id: id(), createdAt: now(), updatedAt: now() };
    const oldForeignItem = { ...mainland.data.item, id: id(), placeId: oldForeignPlace.id,
      title: '东京', sortOrder: 1, timeMode: 'none' as const, endDateTime: null, payload: null };
    await runtime.runInExclusiveTransaction(async (database) => {
      await new SqlitePlaceRepository(database).insert(oldForeignPlace);
      await new SqliteItemRepository(database).insert(oldForeignItem);
    });
    connection.close();
    connection = new NodeSqliteConnection(file);
    const reopenedRuntime = createNodeSqliteRuntime(connection);
    const reopened = await createTripOverviewQuerySource(reopenedRuntime.runInReadContext)
      .getTripOverview(created.data.id);
    expect(reopened.scheduledItems.map(({ id: itemId }) => itemId)).toEqual([
      mainland.data.item.id, oldForeignItem.id,
    ]);
    expect(reopened.scheduledItems[0]).toMatchObject({ startDateTime: null, endDateTime: '2026-10-09T08:00' });
    expect(reopened.placesById[mainland.data.place.id].coordinate).toEqual(mainland.data.place.coordinate);
    expect(reopened.placesById[oldForeignPlace.id].coordinate).toEqual(oldForeignPlace.coordinate);
    expect(buildTripOverviewProjection({ ...reopened, mapPlacesById: regionalTripMapPlaces(reopened.trip, reopened.placesById) }).markers).toHaveLength(1);
    expect(reopened.scheduledItems).toHaveLength(2);
    expect(connection.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
