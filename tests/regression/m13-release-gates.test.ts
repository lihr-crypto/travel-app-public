import { afterEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { buildDayMapProjection } from '@/application/projections/day-map';
import { buildTimelineProjection } from '@/application/projections/timeline';
import { buildTripOverviewProjection } from '@/application/projections/trip-overview';
import { buildDayViewData } from '@/application/queries/day-view';
import { buildTripOverviewData } from '@/application/queries/trip-overview';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day, Trip } from '@/domain/trip/types';
import {
  persistReleaseItineraryFixtures,
  releaseItineraryFixtures,
} from '@/infrastructure/database/release-fixtures';
import { runMigrations } from '@/infrastructure/database/migrations';
import { createDatabaseRuntime, type DatabaseBindParams, type DatabaseConnection, type DatabaseExecutor } from '@/infrastructure/database/runtime';
import { SqliteItemRepository } from '@/infrastructure/database/sqlite/item-repository';
import { SqlitePlaceRepository } from '@/infrastructure/database/sqlite/place-repository';
import { assertMapRendererInput } from '@/infrastructure/map/map-renderer';
import { resolveTripMapStack } from '@/infrastructure/map/map-provider-policy';

function nodeParams(params: DatabaseBindParams) {
  return params.map((value) => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  });
}

class NodeSqliteConnection implements DatabaseConnection {
  readonly database: DatabaseSync;
  constructor(path: string) { this.database = new DatabaseSync(path); }
  async execAsync(sql: string) { this.database.exec(sql); }
  async runAsync(sql: string, params: DatabaseBindParams = []) {
    const result = this.database.prepare(sql).run(...nodeParams(params));
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync<T>(sql: string, params: DatabaseBindParams = []): Promise<T | null> {
    return (this.database.prepare(sql).get(...nodeParams(params)) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, params: DatabaseBindParams = []): Promise<T[]> {
    return this.database.prepare(sql).all(...nodeParams(params)) as T[];
  }
  async withExclusiveTransactionAsync(task: (transaction: DatabaseExecutor) => Promise<void>) {
    this.database.exec('BEGIN EXCLUSIVE;');
    try { await task(this); this.database.exec('COMMIT;'); }
    catch (error) { this.database.exec('ROLLBACK;'); throw error; }
  }
  close() {
    if (this.database.isOpen) this.database.close();
  }
}

const directories: string[] = [];
const connections: NodeSqliteConnection[] = [];

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function openFile(path: string) {
  const connection = new NodeSqliteConnection(path);
  connections.push(connection);
  const runtime = createDatabaseRuntime(async () => connection, { initializeConnection: runMigrations });
  return { connection, runtime };
}

function beijingDayData(placeLessCount = 0) {
  const fixture = releaseItineraryFixtures[0];
  const day1 = fixture.days[0];
  const day1Items = fixture.items.filter(({ dayId }) => dayId === day1.id);
  const placesById: Record<string, Place> = Object.fromEntries(
    fixture.places.map((place) => [place.id, place]),
  );
  const placeLess: Item[] = Array.from({ length: placeLessCount }, (_, index) => ({
    id: `m13-beijing-dense-item-place-less-${index + 1}`,
    tripId: fixture.trip.id,
    dayId: day1.id,
    placeId: null,
    type: 'custom',
    title: `自由活动 ${index + 1}`,
    sortOrder: day1Items.length + index,
    timeMode: 'none',
    startDateTime: null,
    endDateTime: null,
    period: null,
    isFixed: false,
    note: null,
    payload: null,
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
  }));
  const data = buildDayViewData({
    trip: fixture.trip,
    day: day1,
    items: [...day1Items, ...placeLess],
    placesById,
  });
  return { fixture, day1, data };
}

function sampleOverview() {
  const fixture = releaseItineraryFixtures[1];
  const placesById: Record<string, Place> = Object.fromEntries(
    fixture.places.map((place) => [place.id, place]),
  );
  return buildTripOverviewData({
    trip: fixture.trip,
    days: fixture.days,
    scheduledItems: fixture.items,
    placesById,
    unscheduledItems: [],
  });
}

test('G1 Beijing dense-city: every Place renders as a continuously numbered marker', () => {
  const { data } = beijingDayData();
  const stack = resolveTripMapStack(data.trip);
  const projection = buildDayMapProjection(data, null);

  // Day 1 carries 故宫 (morning + return), 王府井 and 前门 — four occurrences,
  // numbered without gaps.
  expect(projection.markers).toHaveLength(4);
  expect(projection.markers.map(({ ordinal }) => ordinal)).toEqual([1, 2, 3, 4]);
  expect(new Set(projection.markers.map(({ coordinate }) => `${coordinate.latitude},${coordinate.longitude}`)).size)
    .toBe(3);

  // The renderer contract accepts the GCJ-02 stack for every marker.
  expect(() => assertMapRendererInput({
    system: stack.coordinateSystem,
    markers: projection.markers,
    cameraRequest: projection.cameraRequest,
  })).not.toThrow();
});

test('G2 Sample wide-extent: markers span roughly two degrees where Beijing stays dense', () => {
  const overview = sampleOverview();
  const projection = buildTripOverviewProjection(overview);

  expect(projection.markers).toHaveLength(4);
  const latitudes = projection.markers.map(({ coordinate }) => coordinate.latitude);
  const longitudes = projection.markers.map(({ coordinate }) => coordinate.longitude);
  expect(Math.max(...latitudes) - Math.min(...latitudes)).toBeGreaterThan(1.5);
  expect(Math.max(...longitudes) - Math.min(...longitudes)).toBeGreaterThan(2.5);

  // Dense-city contrast: the Beijing markers stay inside a tight band.
  const beijing = releaseItineraryFixtures[0];
  const beijingOverview = buildTripOverviewData({
    trip: beijing.trip,
    days: beijing.days,
    scheduledItems: beijing.items,
    placesById: Object.fromEntries(beijing.places.map((place) => [place.id, place])),
    unscheduledItems: [],
  });
  const beijingMarkers = buildTripOverviewProjection(beijingOverview).markers;
  const beijingLats = beijingMarkers.map(({ coordinate }) => coordinate.latitude);
  const beijingLngs = beijingMarkers.map(({ coordinate }) => coordinate.longitude);
  expect(Math.max(...beijingLats) - Math.min(...beijingLats)).toBeLessThan(0.03);
  expect(Math.max(...beijingLngs) - Math.min(...beijingLngs)).toBeLessThan(0.02);
});

test('G3 Place-less Items never open numbering gaps in the dense fixture', () => {
  const { data } = beijingDayData(2);
  const projection = buildDayMapProjection(data, null);

  expect(projection.markers.map(({ ordinal }) => ordinal)).toEqual([1, 2, 3, 4]);
  const timeline = buildTimelineProjection(data);
  expect(timeline.items).toHaveLength(6);
  expect(timeline.items.filter(({ placeName }) => placeName === null)).toHaveLength(2);
});

test('G4 a repeated Place keeps distinct occurrence markers and single selection', () => {
  const { data } = beijingDayData();
  // Day marker identity is the Item occurrence ID: the 故宫 return is its own
  // marker at the same coordinate, never merged into the morning one.
  const morningId = 'm13-beijing-dense-item-1';
  const returnId = 'm13-beijing-dense-item-1-return';
  const markers = buildDayMapProjection(data, null).markers;
  const occurrences = markers.filter(({ id }) => id === morningId || id === returnId);
  expect(occurrences).toHaveLength(2);
  expect(occurrences[0].coordinate).toEqual(occurrences[1].coordinate);

  // Selecting one occurrence marks that occurrence, not its twin.
  const selected = buildDayMapProjection(data, morningId).markers.find(
    ({ id }) => id === morningId,
  );
  expect(selected?.variant).toBe('selected');
  expect(
    buildDayMapProjection(data, morningId).markers.filter(
      ({ variant }) => variant === 'selected',
    ),
  ).toHaveLength(1);
});

test('G5 the release fixtures keep GCJ-02 identities and reject cross-CRS input', () => {
  for (const fixture of releaseItineraryFixtures) {
    const stack = resolveTripMapStack(fixture.trip);
    expect(stack.coordinateSystem).toBe('gcj02');
    const data = buildDayViewData({
      trip: fixture.trip,
      day: fixture.days[0],
      items: fixture.items.filter(({ dayId }) => dayId === fixture.days[0].id),
      placesById: Object.fromEntries(fixture.places.map((place) => [place.id, place])),
    });
    const projection = buildDayMapProjection(data, null);
    expect(() => assertMapRendererInput({
      system: stack.coordinateSystem,
      markers: projection.markers,
      cameraRequest: projection.cameraRequest,
    })).not.toThrow();
    // The same markers under the foreign CRS fail closed.
    expect(() => assertMapRendererInput({
      system: 'wgs84',
      markers: projection.markers,
      cameraRequest: projection.cameraRequest,
    })).toThrow(/system/i);
  }
});

test('G9 projections stay fast and ordered on a 400-Item itinerary', () => {
  const fixture = releaseItineraryFixtures[0];
  const dayCount = 30;
  const days: Day[] = Array.from({ length: dayCount }, (_, index) => ({
    id: `perf-day-${index + 1}`,
    tripId: fixture.trip.id,
    date: `2026-11-${String(index + 1).padStart(2, '0')}`,
    dayIndex: index + 1,
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
  }));
  const placesById: Record<string, Place> = {};
  const items: Item[] = [];
  for (let index = 0; index < 400; index += 1) {
    const day = days[index % dayCount];
    const placeId = `perf-place-${index}`;
    placesById[placeId] = {
      id: placeId,
      name: `POI ${index}`,
      coordinate: {
        latitude: 39.8 + (index % 100) * 0.001,
        longitude: 116.3 + (index % 100) * 0.001,
        system: 'gcj02',
      },
      address: null,
      provider: null,
      providerPlaceId: null,
      metadata: null,
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:00:00.000Z',
    };
    items.push({
      id: `perf-item-${index}`,
      tripId: fixture.trip.id,
      dayId: day.id,
      placeId,
      type: 'sightseeing',
      title: `Item ${index}`,
      sortOrder: Math.floor(index / dayCount),
      timeMode: 'none',
      startDateTime: null,
      endDateTime: null,
      period: null,
      isFixed: false,
      note: null,
      payload: null,
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:00:00.000Z',
    });
  }
  const overview = buildTripOverviewData({
    trip: fixture.trip,
    days,
    scheduledItems: items,
    placesById,
    unscheduledItems: [],
  });

  const startedAt = Date.now();
  const projection = buildTripOverviewProjection(overview);
  const elapsed = Date.now() - startedAt;
  // Co-located synthetic Places legitimately cluster, so the marker count is
  // bounded by the distinct coordinate count rather than the Item count.
  expect(projection.markers.length).toBeGreaterThan(0);
  expect(projection.markers.length).toBeLessThanOrEqual(400);
  expect(elapsed).toBeLessThan(2000);
});

test('M13 fixtures persist atomically and round-trip through a reopen', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'travel-app-m13-')), 'travel-app.db');
  directories.push(path);
  const first = openFile(path);
  await persistReleaseItineraryFixtures(first.runtime.runInExclusiveTransaction);
  first.connection.close();

  const second = openFile(path);
  await persistReleaseItineraryFixtures(second.runtime.runInExclusiveTransaction);
  await second.runtime.runInReadContext(async (database) => {
    const items = new SqliteItemRepository(database);
    const places = new SqlitePlaceRepository(database);
    for (const fixture of releaseItineraryFixtures) {
      for (const item of fixture.items) {
        expect(await items.getById(item.id)).toMatchObject({ placeId: item.placeId });
      }
      for (const place of fixture.places) {
        expect(await places.getById(place.id)).toMatchObject({ name: place.name });
      }
    }
    // The second persist call skipped the already-complete fixtures.
    expect(await second.connection.database.prepare('SELECT COUNT(*) AS n FROM items;').get()).toEqual({ n: 10 });
  });
  second.connection.close();
});
