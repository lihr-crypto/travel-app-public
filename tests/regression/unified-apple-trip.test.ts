import { expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTrip } from '@/application/trip/create-trip';
import { SqlitePlaceRepository } from '@/infrastructure/database/sqlite/place-repository';
import { SqliteItemRepository } from '@/infrastructure/database/sqlite/item-repository';
import { bindApplePlace } from '@/application/place/bind-apple-place';
import { buildDayMapProjection } from '@/application/projections/day-map';
import { buildTripOverviewProjection } from '@/application/projections/trip-overview';
import { createTripDayTransactionRunner } from '@/infrastructure/database/trip-day-transaction';
import { createApplePlaceBindingTransactionRunner } from '@/infrastructure/database/apple-place-binding-transaction';
import { createApplePlaceBindingSource } from '@/infrastructure/database/apple-place-binding-source';
import { createTripOverviewQuerySource } from '@/infrastructure/database/trip-overview-query-source';
import { createDayViewQuerySource } from '@/infrastructure/database/day-view-query-source';
import { NodeSqliteConnection, createNodeSqliteRuntime } from '../helpers/node-sqlite';

test('legacy mixed-source itinerary reopens unchanged while Apple bindings feed every Day and Overview pin', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'travel-apple-unified-'));
  const file = join(directory, 'trip.sqlite');
  let connection = new NodeSqliteConnection(file);
  try {
    const runtime = createNodeSqliteRuntime(connection);
    let sequence = 0;
    const id = () => `entity-${++sequence}`;
    const now = () => '2026-10-08T00:00:00.000Z';
    const trip = (await createTrip({ mapRegion: 'china_mainland', title: '南京与成田', startDate: '2026-10-09', endDate: '2026-10-09' },
      { createId: id, now, runInTransaction: createTripDayTransactionRunner(runtime.runInExclusiveTransaction) })).data;
    const overviewSource = createTripOverviewQuerySource(runtime.runInReadContext);
    const day = (await overviewSource.getTripOverview(trip.id)).days[0];
    const sources = [
      { name: '南京禄口国际机场', provider: 'amap' as const, coordinate: { latitude: 31.731634, longitude: 118.871181, system: 'gcj02' as const } },
      { name: '成田国际机场', provider: 'google' as const, coordinate: { latitude: 35.770178, longitude: 140.3843215, system: 'wgs84' as const } },
    ];
    const originalPlaces = [];
    for (const [index, source] of sources.entries()) {
      // Historical mixed snapshots are fixtures, not permitted new cross-region writes.
      const place = { ...source, id: id(), address: null, providerPlaceId: source.provider,
        metadata: null, createdAt: now(), updatedAt: now() };
      const item = { id: id(), tripId: trip.id, dayId: day.id, placeId: place.id,
        type: 'transport' as const, title: source.name, sortOrder: index, timeMode: 'exact' as const,
        startDateTime: null, endDateTime: '2026-10-09T08:00', period: null, isFixed: false,
        note: '保留', payload: { kind: 'transport' as const }, createdAt: now(), updatedAt: now() };
      await runtime.runInExclusiveTransaction(async (database) => {
        await new SqlitePlaceRepository(database).insert(place);
        await new SqliteItemRepository(database).insert(item);
      });
      originalPlaces.push(place);
    }
    const original = await overviewSource.getTripOverview(trip.id);
    for (const [index, place] of originalPlaces.entries()) {
      await bindApplePlace({ sourcePlaceId: place.id, result: {
        name: place.name, provider: 'apple', providerPlaceId: `apple-${index}`, address: 'Apple address', regionLabel: null,
        coordinate: index === 0 ? { latitude: 31.7326203, longitude: 118.8715982, system: 'wgs84' }
          : { latitude: 35.7632517, longitude: 140.3829322, system: 'wgs84' }, metadata: null,
      } }, { createPlaceId: id, now, runInTransaction: createApplePlaceBindingTransactionRunner(runtime.runInExclusiveTransaction) });
    }
    connection.close();
    connection = new NodeSqliteConnection(file);
    const reopenedRuntime = createNodeSqliteRuntime(connection);
    const reopened = await createTripOverviewQuerySource(reopenedRuntime.runInReadContext).getTripOverview(trip.id);
    expect(reopened).toEqual(original);
    const mapping = await createApplePlaceBindingSource(reopenedRuntime.runInReadContext).getBindings(originalPlaces.map((p) => p.id));
    const overview = buildTripOverviewProjection({ ...reopened, mapPlacesById: mapping });
    expect(overview.markers).toHaveLength(2);
    expect(overview.markers.every((m) => m.coordinate.system === 'wgs84')).toBe(true);
    const dayData = await createDayViewQuerySource(reopenedRuntime.runInReadContext).getDayView(day.id);
    const projection = buildDayMapProjection({ ...dayData, mapPlacesById: mapping });
    expect(projection.markers.map((m) => m.id)).toEqual(original.scheduledItems.map((item) => item.id));
    expect(projection.markers.map((m) => m.ordinal)).toEqual([1, 2]);
    expect(connection.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
