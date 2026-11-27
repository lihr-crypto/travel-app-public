import { expect, test } from '@jest/globals';

import { buildDayMapProjection } from '@/application/projections/day-map';
import { buildDayViewData } from '@/application/queries/day-view';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { MapPlace } from '@/application/projections/map-place';
import type { Day, Trip } from '@/domain/trip/types';
import { assertMapRendererInput } from '@/infrastructure/map/map-renderer';

const timestamp = '2026-09-13T00:00:00.000Z';
const trip: Trip = {
  id: 'trip-1', title: 'Trip', startDate: '2026-10-01', endDate: '2026-10-02',
  mapRegion: 'global', note: null, createdAt: timestamp, updatedAt: timestamp,
};
const day: Day = {
  id: 'day-1', tripId: trip.id, date: trip.startDate, dayIndex: 1,
  createdAt: timestamp, updatedAt: timestamp,
};
const station: Place = {
  id: 'place-station', name: 'Station',
  coordinate: { latitude: 35.68, longitude: 139.76, system: 'wgs84' },
  address: null, provider: null, providerPlaceId: null, metadata: null,
  createdAt: timestamp, updatedAt: timestamp,
};
const museum: Place = {
  ...station,
  id: 'place-museum', name: 'Museum',
  coordinate: { latitude: 35.70, longitude: 139.78, system: 'wgs84' },
};

function item(id: string, sortOrder: number, placeId: string | null = null): Item {
  return {
    id, tripId: trip.id, dayId: day.id, placeId,
    type: 'custom', title: id, sortOrder, timeMode: 'none',
    startDateTime: null, endDateTime: null, period: null,
    isFixed: false, note: null, payload: null,
    createdAt: timestamp, updatedAt: timestamp,
  };
}

test('filters current-Day Place-bearing occurrences and numbers them without gaps', () => {
  const data = buildDayViewData({
    trip, day,
    items: [
      item('museum', 4, museum.id),
      item('no-place', 0),
      item('station-return', 3, station.id),
      { ...item('other-day', 2, museum.id), dayId: 'day-2' },
      item('station-first', 1, station.id),
    ],
    placesById: { [station.id]: station, [museum.id]: museum },
  });

  const result = buildDayMapProjection(data, 'station-return');
  expect(result.dayId).toBe(day.id);
  expect(result.markers.map(({ id, ordinal, variant }) => ({ id, ordinal, variant })))
    .toEqual([
      { id: 'station-first', ordinal: 1, variant: 'normal' },
      { id: 'station-return', ordinal: 2, variant: 'selected' },
      { id: 'museum', ordinal: 3, variant: 'normal' },
    ]);
  expect(result.markers[0].coordinate).toBe(station.coordinate);
  expect(result.markers[1].coordinate).toBe(station.coordinate);
  expect(result.cameraRequest).toEqual({
    coordinates: [station.coordinate, museum.coordinate],
  });
  expect(() => assertMapRendererInput({
    system: 'wgs84', markers: result.markers, cameraRequest: result.cameraRequest,
  })).not.toThrow();
});

test('empty or Place-less Day has no markers or camera request', () => {
  const data = buildDayViewData({ trip, day, items: [item('no-place', 0)] });
  expect(buildDayMapProjection(data, 'no-place')).toEqual({
    dayId: day.id, markers: [], cameraRequest: null,
  });
});

test('explicit Apple map snapshots replace coordinates and leave no ordinal gaps for missing bindings', () => {
  const sourceTrip = { ...trip, mapRegion: 'china_mainland' as const };
  const data = buildDayViewData({
    trip: sourceTrip,
    day,
    items: [
      item('missing-binding', 0, museum.id),
      item('mapped-station', 1, station.id),
    ],
    placesById: { [station.id]: station, [museum.id]: museum },
  });
  const sourceStation: Place = {
    ...station,
    coordinate: { latitude: 35.6812, longitude: 139.7671, system: 'gcj02' },
    provider: 'amap',
  };
  const appleStation: MapPlace = {
    ...sourceStation,
    id: 'apple-station-map-place',
    name: 'Apple SDK station result',
    displayName: 'Station original label',
    displayCoordinate: { latitude: 35.681, longitude: 139.767, system: 'wgs84' },
    providerPlaceId: 'apple-station',
  };
  const mappedData = { ...data, mapPlacesById: { [station.id]: appleStation } };

  const result = buildDayMapProjection(mappedData, 'mapped-station');
  expect(result.markers).toEqual([{
    id: 'mapped-station',
    coordinate: appleStation.displayCoordinate,
    ordinal: 1,
    label: 'Station original label',
    variant: 'selected',
  }]);
  expect(result.cameraRequest?.coordinates).toEqual([appleStation.displayCoordinate]);
  expect(() => assertMapRendererInput({
    system: 'wgs84', markers: result.markers, cameraRequest: result.cameraRequest,
  })).not.toThrow();
  expect(mappedData.items).toHaveLength(2);
  expect(mappedData.placesById).toBe(data.placesById);
  expect(mappedData.placesById[station.id]).toBe(station);
  expect(mappedData.mapPlacesById[station.id].coordinate).toEqual(sourceStation.coordinate);
});

test('rejects missing Place, wrong CRS, and cross-Trip Item ownership', () => {
  const withPlace = item('station', 0, station.id);
  expect(() => buildDayMapProjection(buildDayViewData({
    trip, day, items: [withPlace], placesById: {},
  }))).toThrow('Day Map Place not found for Item: station');

  expect(() => buildDayMapProjection(buildDayViewData({
    trip, day, items: [withPlace],
    placesById: { [station.id]: { ...station, provider: 'google', coordinate: {
      ...station.coordinate, system: 'gcj02',
    } } },
  }))).toThrow('Coordinate system gcj02 does not match wgs84');

  expect(() => buildDayMapProjection(buildDayViewData({
    trip, day, items: [{ ...withPlace, tripId: 'other-trip' }],
    placesById: { [station.id]: station },
  }))).toThrow('Day Map Item belongs to another Trip: station');
});
