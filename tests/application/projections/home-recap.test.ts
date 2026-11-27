import { expect, test } from '@jest/globals';

import type { Coordinate } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day } from '@/domain/trip/types';
import {
  buildHomeRecap,
  distinctPlaceKeys,
  placeIdentityKey,
  type HomeRecapTrip,
} from '@/application/projections/home-recap';

const timestamp = '2026-10-03T00:00:00.000Z';
const beijing: Coordinate = { latitude: 39.90923, longitude: 116.397428, system: 'gcj02' };

function place(id: string, name: string, overrides: Partial<Place> = {}): Place {
  return {
    id,
    name,
    coordinate: beijing,
    address: null,
    provider: null,
    providerPlaceId: null,
    metadata: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function item(id: string, placeId: string | null, dayId: string | null = 'd1'): Item {
  return {
    id,
    tripId: 't',
    dayId,
    placeId,
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

function day(id: string, date: string, dayIndex = 1): Day {
  return { id, tripId: 't', date, dayIndex, createdAt: timestamp, updatedAt: timestamp };
}

function tripOf(days: Day[], items: Item[], places: Place[]): HomeRecapTrip {
  return {
    days,
    items,
    placesById: Object.fromEntries(places.map((value) => [value.id, value])),
  };
}

test('a provider POI is identified by provider and provider id, whatever its row or name', () => {
  const first = place('p1', '天安门', { provider: 'amap', providerPlaceId: 'B000A8UIN8' });
  const second = place('p2', 'Tiananmen Square', { provider: 'amap', providerPlaceId: 'B000A8UIN8' });
  const otherProvider = place('p3', '天安门', { provider: 'google', providerPlaceId: 'B000A8UIN8' });

  expect(placeIdentityKey('p1', first)).toBe(placeIdentityKey('p2', second));
  expect(placeIdentityKey('p1', first)).not.toBe(placeIdentityKey('p3', otherProvider));
});

test('a hand-placed pin is told apart by CRS, coordinate to 4 decimals, and name', () => {
  const pin = place('p1', '  Cafe ');
  const sameSpot = place('p2', 'cafe', { coordinate: { ...beijing, latitude: beijing.latitude + 0.00001 } });
  const farAway = place('p3', 'cafe', { coordinate: { ...beijing, latitude: beijing.latitude + 0.01 } });
  const otherCrs = place('p4', 'cafe', { coordinate: { ...beijing, system: 'wgs84' } });
  const renamed = place('p5', 'Bar');

  expect(placeIdentityKey('p1', pin)).toBe(placeIdentityKey('p2', sameSpot));
  expect(placeIdentityKey('p1', pin)).not.toBe(placeIdentityKey('p3', farAway));
  expect(placeIdentityKey('p1', pin)).not.toBe(placeIdentityKey('p4', otherCrs));
  expect(placeIdentityKey('p1', pin)).not.toBe(placeIdentityKey('p5', renamed));
});

test('a placeId with no Place row keeps its own id, so the old distinct-id count is preserved', () => {
  expect(placeIdentityKey('ghost-1', undefined)).toBe('id:ghost-1');
  expect(placeIdentityKey('ghost-1', undefined)).not.toBe(placeIdentityKey('ghost-2', undefined));

  const keys = distinctPlaceKeys(tripOf(
    [day('d1', '2026-08-01')],
    [item('i1', 'ghost-1'), item('i2', 'ghost-1'), item('i3', 'ghost-2')],
    [],
  ));
  expect(keys.size).toBe(2);
});

test('the same POI saved twice in one Trip counts once; Unscheduled and Place-less Items are handled', () => {
  const trip = tripOf(
    [day('d1', '2026-08-01')],
    [
      item('i1', 'p1'),
      item('i2', 'p2'),
      item('i3', 'p3', null),
      item('i4', null),
    ],
    [
      place('p1', '虹口', { provider: 'amap', providerPlaceId: 'X' }),
      place('p2', '虹口', { provider: 'amap', providerPlaceId: 'X' }),
      place('p3', '外滩', { provider: 'amap', providerPlaceId: 'Y' }),
    ],
  );

  // p1/p2 are one POI, p3 is Unscheduled but still part of the footprint.
  expect(distinctPlaceKeys(trip).size).toBe(2);
});

test('recap sums Trips, unions calendar dates, and dedupes Places across Trips', () => {
  const poi = { provider: 'google', providerPlaceId: 'ChIJ-shared' };
  const first = tripOf(
    [day('a1', '2026-08-01', 1), day('a2', '2026-08-02', 2)],
    [item('i1', 'pa'), item('i2', 'pb')],
    [place('pa', '東京駅', poi), place('pb', '浅草')],
  );
  const overlapping = tripOf(
    // 08-02 is in both Trips: it is one calendar day.
    [day('b1', '2026-08-02', 1), day('b2', '2026-08-03', 2)],
    [item('i3', 'pc')],
    [place('pc', 'Tokyo Station', poi)],
  );

  expect(buildHomeRecap([first, overlapping])).toEqual({
    dayCount: 3,
    placeCount: 2,
    tripCount: 2,
  });
});

test('a single Trip reproduces its own day and place counts', () => {
  const trip = tripOf(
    [day('d1', '2026-08-01', 1), day('d2', '2026-08-02', 2)],
    [item('i1', 'p1'), item('i2', 'p2', 'd2')],
    [place('p1', 'A', { provider: 'amap', providerPlaceId: '1' }), place('p2', 'B')],
  );

  expect(buildHomeRecap([trip])).toEqual({ dayCount: 2, placeCount: 2, tripCount: 1 });
});

test('no Trips is an all-zero recap', () => {
  expect(buildHomeRecap([])).toEqual({ dayCount: 0, placeCount: 0, tripCount: 0 });
});
