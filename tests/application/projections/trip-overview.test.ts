import { expect, test } from '@jest/globals';

import { buildTripOverviewProjection } from '@/application/projections/trip-overview';
import type { TripOverviewData } from '@/application/queries/trip-overview';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { MapPlace } from '@/application/projections/map-place';

const timestamp = '2026-09-14T00:00:00.000Z';
function item(
  id: string,
  dayId: string | null,
  placeId: string | null,
  title: string,
  sortOrder: number,
): Item {
  return {
    id, tripId: 'trip-1', dayId, placeId, title, sortOrder, type: 'sightseeing',
    timeMode: 'none', startDateTime: null, endDateTime: null, period: null,
    isFixed: false, note: null, payload: null, createdAt: timestamp, updatedAt: timestamp,
  };
}
function place(id: string, name: string, latitude: number, longitude: number): Place {
  return {
    id, name, coordinate: { latitude, longitude, system: 'gcj02' }, address: null,
    provider: 'amap', providerPlaceId: id, metadata: null,
    createdAt: timestamp, updatedAt: timestamp,
  };
}

const overview: TripOverviewData = {
  trip: {
    id: 'trip-1', title: '北京', startDate: '2026-09-20', endDate: '2026-09-21',
    mapRegion: 'china_mainland', note: null, createdAt: timestamp, updatedAt: timestamp,
  },
  days: [
    { id: 'day-1', tripId: 'trip-1', date: '2026-09-20', dayIndex: 1, createdAt: timestamp, updatedAt: timestamp },
    { id: 'day-2', tripId: 'trip-1', date: '2026-09-21', dayIndex: 2, createdAt: timestamp, updatedAt: timestamp },
  ],
  scheduledItems: [
    item('item-1', 'day-1', 'place-a', '天安门', 0),
    item('item-no-place', 'day-1', null, '整理照片', 1),
    item('item-2', 'day-1', 'place-b', '故宫', 2),
    item('item-3', 'day-2', 'place-a', '再访天安门', 0),
  ],
  placesById: {
    'place-a': place('place-a', '天安门', 39.909187, 116.397451),
    // A separate persisted snapshot at the same point also aggregates visually.
    'place-b': place('place-b', '故宫', 39.909187, 116.397451),
  },
  unscheduledItems: [
    item('unscheduled-place', null, 'place-b', '候选地点', 0),
    item('unscheduled-note', null, null, '备忘', 1),
  ],
};

test('projects Trip-wide scheduled Places without Day anchors, ordinals or routes', () => {
  const projection = buildTripOverviewProjection(overview, '2026-09-19');

  expect(projection.markers).toHaveLength(1);
  expect(projection.unscheduledMarkers).toHaveLength(1);
  expect(projection.unscheduledMarkers[0]).toMatchObject({
    id: 'unscheduled-place', variant: 'unscheduled',
  });
  expect(projection.markers[0]).toMatchObject({
    variant: 'cluster',
    sourceItemIds: ['item-1', 'item-2', 'item-3'],
  });
  expect(projection.markers[0].ordinal).toBeUndefined();
  expect(projection.cameraRequest?.coordinates).toHaveLength(1);
  expect(projection.cameraDayId).toBe('day-1');
  expect(projection.cameraScope).toBe('day');
  expect(projection).not.toHaveProperty('routes');
  expect(projection).not.toHaveProperty('polylines');
  expect(projection.unscheduledItemCount).toBe(2);
  expect(projection.unscheduledPlaceCount).toBe(1);
});

test('planned trips default to the first Day with a saved Place', () => {
  const tripOverview: TripOverviewData = {
    ...overview,
    days: [
      overview.days[0],
      overview.days[1],
      { ...overview.days[1], id: 'day-3', dayIndex: 3, date: '2026-09-22' },
    ],
    scheduledItems: [
      item('day-2-note', 'day-2', null, '自由活动', 0),
      item('day-3-place', 'day-3', 'place-c', '远处目的地', 0),
    ],
    placesById: {
      ...overview.placesById,
      'place-c': place('place-c', '远处目的地', 40.1, 116.8),
    },
  };

  const projection = buildTripOverviewProjection(tripOverview, '2026-09-19');
  expect(projection.cameraDayId).toBe('day-3');
  expect(projection.cameraScope).toBe('day');
  expect(projection.cameraRequest?.coordinates).toEqual([
    tripOverview.placesById['place-c'].coordinate,
  ]);
  // The display stays Trip-wide while only the initial camera targets Day 3.
  expect(projection.markers).toHaveLength(1);
});

test('active trips default to today and skip empty Days to the nearest future destination', () => {
  const tripOverview: TripOverviewData = {
    ...overview,
    scheduledItems: [
      item('day-1-note', 'day-1', null, '早餐', 0),
      item('day-2-place', 'day-2', 'place-c', '当天之后的目的地', 0),
    ],
    placesById: {
      ...overview.placesById,
      'place-c': place('place-c', '当天之后的目的地', 40.1, 116.8),
    },
  };

  const projection = buildTripOverviewProjection(tripOverview, '2026-09-20');
  expect(projection.cameraDayId).toBe('day-2');
  expect(projection.cameraRequest?.coordinates).toEqual([
    tripOverview.placesById['place-c'].coordinate,
  ]);

  const onToday = buildTripOverviewProjection(tripOverview, '2026-09-21');
  expect(onToday.cameraDayId).toBe('day-2');
  expect(onToday.cameraRequest?.coordinates).toEqual([
    tripOverview.placesById['place-c'].coordinate,
  ]);
});

test('completed trips fit the saved Trip-wide Places and ignore Unscheduled coordinates', () => {
  const tripOverview: TripOverviewData = {
    ...overview,
    scheduledItems: [
      item('day-1-place', 'day-1', 'place-a', '天安门', 0),
      item('day-2-place', 'day-2', 'place-c', '悉尼歌剧院', 0),
    ],
    placesById: {
      ...overview.placesById,
      'place-c': place('place-c', '悉尼歌剧院', -33.8568, 151.2153),
    },
    unscheduledItems: [
      item('unscheduled-far', null, 'place-d', '远方候选', 0),
    ],
  };
  tripOverview.placesById['place-d'] = place('place-d', '远方候选', 10, 10);

  const projection = buildTripOverviewProjection(tripOverview, '2026-09-22');
  expect(projection.cameraDayId).toBeNull();
  expect(projection.cameraScope).toBe('trip');
  expect(projection.cameraRequest?.coordinates).toEqual([
    tripOverview.placesById['place-a'].coordinate,
    tripOverview.placesById['place-c'].coordinate,
  ]);
});

test('derives ordered Day summaries from complete Items, including Place-less Items', () => {
  const projection = buildTripOverviewProjection(overview);

  expect(projection.days).toEqual([
    expect.objectContaining({
      day: expect.objectContaining({ id: 'day-1' }),
      itemCount: 3,
      previewTitles: ['天安门', '整理照片'],
      remainingItemCount: 1,
    }),
    expect.objectContaining({
      day: expect.objectContaining({ id: 'day-2' }),
      itemCount: 1,
      previewTitles: ['再访天安门'],
      remainingItemCount: 0,
    }),
  ]);
});

test('uses explicit Apple snapshots for markers and camera without changing canonical counts', () => {
  const coordinate = { latitude: 39.9044, longitude: 116.3975, system: 'wgs84' as const };
  const appleA: MapPlace = {
    ...overview.placesById['place-a'],
    id: 'apple-place-a',
    name: 'Apple SDK 天安门',
    displayName: '天安门原名',
    displayCoordinate: coordinate,
    providerPlaceId: 'apple-a',
  };
  const appleB: MapPlace = {
    ...overview.placesById['place-b'],
    id: 'apple-place-b',
    name: 'Apple SDK 故宫',
    displayName: '故宫原名',
    displayCoordinate: { ...coordinate },
    providerPlaceId: 'apple-b',
  };
  const mappedOverview: TripOverviewData = {
    ...overview,
    trip: { ...overview.trip, mapRegion: 'china_mainland' },
    mapPlacesById: { 'place-a': appleA, 'place-b': appleB },
  };

  const projection = buildTripOverviewProjection(mappedOverview, '2026-09-19');
  expect(projection.markers).toHaveLength(1);
  expect(projection.markers[0]).toMatchObject({
    variant: 'cluster',
    sourceItemIds: ['item-1', 'item-2', 'item-3'],
    coordinate,
    label: '2个地点 · 3次',
  });
  expect(projection.cameraRequest?.coordinates).toEqual([coordinate]);
  expect(projection.days[0].itemCount).toBe(3);
  expect(projection.unscheduledPlaceCount).toBe(1);
  expect(mappedOverview.placesById).toBe(overview.placesById);
  expect(mappedOverview.placesById['place-a']).toBe(overview.placesById['place-a']);
});

test('omits explicitly unmapped pins while keeping source Timeline and Unscheduled counts', () => {
  const appleA: MapPlace = {
    ...overview.placesById['place-a'],
    id: 'apple-place-a',
    name: 'Apple SDK 天安门',
    displayName: '天安门原名',
    displayCoordinate: { latitude: 39.9044, longitude: 116.3975, system: 'wgs84' },
    providerPlaceId: 'apple-a',
  };
  const mappedOverview: TripOverviewData = {
    ...overview,
    mapPlacesById: { 'place-a': appleA },
  };

  const projection = buildTripOverviewProjection(mappedOverview, '2026-09-19');
  expect(projection.markers).toHaveLength(1);
  expect(projection.markers[0]).toMatchObject({
    id: 'overview-cluster:item-1:item-3',
    sourceItemIds: ['item-1', 'item-3'],
    coordinate: appleA.displayCoordinate,
  });
  expect(projection.unscheduledMarkers).toEqual([]);
  expect(projection.unscheduledItemCount).toBe(2);
  expect(projection.unscheduledPlaceCount).toBe(1);
  expect(projection.days[0].itemCount).toBe(3);
  expect(projection.days[0].previewTitles).toEqual(['天安门', '整理照片']);
});

test('uses the MapPlace display name for an unclustered map marker', () => {
  const applePlace: MapPlace = {
    ...overview.placesById['place-a'],
    id: 'apple-place-a',
    name: 'Apple SDK Place Name',
    displayName: 'Original AMap Name',
    displayCoordinate: { latitude: 39.9044, longitude: 116.3975, system: 'wgs84' },
  };
  const data: TripOverviewData = {
    ...overview,
    scheduledItems: [item('item-map-place', 'day-1', 'place-a', 'Timeline title', 0)],
    mapPlacesById: { 'place-a': applePlace },
  };

  const projection = buildTripOverviewProjection(data, '2026-09-19');
  expect(projection.markers[0]).toMatchObject({
    label: 'Original AMap Name',
    coordinate: applePlace.displayCoordinate,
  });
  expect(data.placesById['place-a'].name).toBe('天安门');
});

test('fails closed when a scheduled Place uses the other provider CRS', () => {
  expect(() => buildTripOverviewProjection({
    ...overview,
    placesById: {
      ...overview.placesById,
      'place-a': {
        ...overview.placesById['place-a'],
        coordinate: { latitude: 39.9, longitude: 116.4, system: 'wgs84' },
      },
    },
  })).toThrow('Coordinate system wgs84 does not match gcj02');
});

test('fails closed when projection input crosses Trip ownership boundaries', () => {
  expect(() => buildTripOverviewProjection({
    ...overview,
    scheduledItems: [{ ...overview.scheduledItems[0], dayId: 'missing-day' }],
  })).toThrow('Trip Overview scheduled Item has invalid ownership: item-1');

  expect(() => buildTripOverviewProjection({
    ...overview,
    unscheduledItems: [{ ...overview.unscheduledItems[0], tripId: 'other-trip' }],
  })).toThrow('Trip Overview Unscheduled Item has invalid ownership: unscheduled-place');
});
