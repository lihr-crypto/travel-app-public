import { expect, test } from '@jest/globals';

import type { Coordinate, EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day, Trip } from '@/domain/trip/types';
import { buildHomeMapProjection, type HomeTripData } from '@/application/projections/home-map';
import type { MapPlace } from '@/application/projections/map-place';

const today = '2026-10-12';
const timestamp = '2026-10-12T00:00:00.000Z';

/** Real provider-native values, as M10-T0 fixtures: AMap/GCJ-02 and Google/WGS84. */
const tiananmen: Coordinate = { latitude: 39.90923, longitude: 116.397428, system: 'gcj02' };
const forbiddenCity: Coordinate = { latitude: 39.916345, longitude: 116.397155, system: 'gcj02' };
const tokyo: Coordinate = { latitude: 35.6812, longitude: 139.7671, system: 'wgs84' };
const beijingWgs84: Coordinate = { latitude: 39.9042, longitude: 116.4074, system: 'wgs84' };

function trip(id: string, startDate: string, endDate: string, region: Trip['mapRegion'] = 'china_mainland'): Trip {
  return {
    id,
    title: `Trip ${id}`,
    startDate,
    endDate,
    mapRegion: region,
    note: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function day(id: string, tripId: string, date: string, dayIndex: number): Day {
  return { id, tripId, date, dayIndex, createdAt: timestamp, updatedAt: timestamp };
}

function item(
  id: string,
  tripId: string,
  dayId: EntityId | null,
  placeId: EntityId | null,
  sortOrder: number,
): Item {
  return {
    id,
    tripId,
    dayId,
    placeId,
    type: 'sightseeing',
    title: id,
    sortOrder,
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

function place(id: string, name: string, coordinate: Coordinate): Place {
  return {
    id,
    name,
    coordinate,
    address: null,
    provider: null,
    providerPlaceId: null,
    metadata: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function entry(
  tripValue: Trip,
  days: Day[],
  items: Item[],
  places: Place[],
): HomeTripData {
  return {
    trip: tripValue,
    days,
    items,
    placesById: Object.fromEntries(places.map((value) => [value.id, value])),
  };
}

test('M10-T1: one marker per Trip, labelled by its anchor Place', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(
        trip('china', '2026-12-01', '2026-12-05'),
        [day('china-d1', 'china', '2026-12-01', 1)],
        [item('china-i1', 'china', 'china-d1', 'p-tiananmen', 0)],
        [place('p-tiananmen', '天安门', tiananmen)],
      ),
      entry(
        trip('japan', '2026-08-01', '2026-08-08', 'global'),
        [day('japan-d1', 'japan', '2026-08-01', 1)],
        [item('japan-i1', 'japan', 'japan-d1', 'p-tokyo', 0)],
        [place('p-tokyo', '東京駅', tokyo)],
      ),
    ],
  }, { today });

  expect(projection.markers).toHaveLength(2);
  // Ordered by Trip startDate, so the list and the map agree.
  expect(projection.markers.map(({ tripId }) => tripId)).toEqual(['japan', 'china']);
  expect(projection.markers.map(({ id }) => id)).toEqual(['japan', 'china']);
  expect(projection.markers[1]).toMatchObject({
    id: 'china',
    tripId: 'china',
    tripTitle: 'Trip china',
    label: '天安门',
  });
  // The marker ID is the Trip identity, so a tap selects a Trip — never an Item.
  expect(new Set(projection.markers.map(({ id }) => id)).size).toBe(2);
});

test('Home can draw an explicit Apple WGS84 binding in China without changing the source Place', () => {
  const appleCoordinate: Coordinate = {
    latitude: 39.9042,
    longitude: 116.4074,
    system: 'wgs84',
  };
  const sourcePlace = {
    ...place('legacy-place', 'Old Beijing Place', tiananmen),
    provider: 'amap',
  };
  const source = entry(
    trip('global', '2026-12-01', '2026-12-05', 'global'),
    [day('global-d1', 'global', '2026-12-01', 1)],
    [item('global-i1', 'global', 'global-d1', 'legacy-place', 0)],
    [sourcePlace],
  );
  source.mapPlacesById = {
    'legacy-place': {
      ...source.placesById['legacy-place'],
      displayCoordinate: appleCoordinate,
      displayName: 'Old Beijing Place',
    },
  };

  const projection = buildHomeMapProjection({ trips: [source] }, { today, appleCoordinates: true });

  expect(projection.markers).toMatchObject([
    { coordinate: appleCoordinate, label: 'Old Beijing Place', tripId: 'global' },
  ]);
  expect(projection.plan).toMatchObject({ displayCrsPolicy: 'apple_wgs84', withheld: [] });
  expect(source.placesById['legacy-place'].coordinate).toEqual(tiananmen);
  expect(source.items[0].placeId).toBe('legacy-place');
});

test('Home today markers and camera use projected AMap coordinates while card labels stay canonical', () => {
  const activeTrip = trip('active', '2026-10-10', '2026-10-14');
  const todayDay = day('active-today', activeTrip.id, today, 3);
  const rawOne = { ...place('place-one', 'Old Site One', tiananmen), provider: 'amap' };
  const rawTwo = { ...place('place-two', 'Old Site Two', forbiddenCity), provider: 'amap' };
  const displayOne: MapPlace = {
    ...rawOne,
    displayCoordinate: { latitude: 39.9042, longitude: 116.4074, system: 'wgs84' },
    displayName: 'Apple SDK One',
  };
  const displayTwo: MapPlace = {
    ...rawTwo,
    displayCoordinate: { latitude: 39.9111, longitude: 116.4011, system: 'wgs84' },
    displayName: 'Apple SDK Two',
  };
  const active = entry(
    activeTrip,
    [todayDay],
    [
      item('today-one', activeTrip.id, todayDay.id, rawOne.id, 0),
      item('today-two', activeTrip.id, todayDay.id, rawTwo.id, 1),
    ],
    [rawOne, rawTwo],
  );
  active.mapPlacesById = { [rawOne.id]: displayOne, [rawTwo.id]: displayTwo };

  const projection = buildHomeMapProjection({ trips: [active] }, { today, appleCoordinates: true });

  expect(projection.markers.map(({ coordinate, label }) => ({ coordinate, label }))).toEqual([
    { coordinate: displayOne.displayCoordinate, label: 'Apple SDK One' },
  ]);
  expect(projection.cameraRequest?.coordinates).toEqual([
    displayOne.displayCoordinate,
    displayTwo.displayCoordinate,
  ]);
  expect(projection.plan.drawable).toEqual([displayOne.displayCoordinate]);
  expect(projection.activeTrip).toMatchObject({
    fromLabel: 'Old Site One',
    toLabel: 'Old Site Two',
  });
});

test('an explicit unresolved map binding omits the footprint but preserves the Trip list and count', () => {
  const source = entry(
    trip('legacy', '2026-12-01', '2026-12-05'),
    [day('legacy-d1', 'legacy', '2026-12-01', 1)],
    [item('legacy-i1', 'legacy', 'legacy-d1', 'legacy-place', 0)],
    [place('legacy-place', 'Unresolved Place', tiananmen)],
  );
  source.mapPlacesById = {};

  const projection = buildHomeMapProjection({ trips: [source] }, { today, appleCoordinates: true });

  expect(projection.markers).toEqual([]);
  expect(projection.cameraRequest).toBeNull();
  expect(projection.unplacedTripIds).toEqual(['legacy']);
  expect(projection.visibleTrips).toMatchObject([
    { tripId: 'legacy', title: 'Trip legacy', placeCount: 1 },
  ]);
});

test('M10-T1: the anchor is the earliest scheduled Place-bearing Item in itinerary order', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(
        trip('china', '2026-12-01', '2026-12-05'),
        [
          day('china-d2', 'china', '2026-12-02', 2),
          day('china-d1', 'china', '2026-12-01', 1),
        ],
        [
          // Day 2 sorts before Day 1 by sortOrder, but the Day date decides.
          item('china-i-d2', 'china', 'china-d2', 'p-forbidden', 0),
          // A Place-less Item is skipped even though it sorts first.
          item('china-i-placeless', 'china', 'china-d1', null, 0),
          item('china-i-d1', 'china', 'china-d1', 'p-tiananmen', 1),
        ],
        [
          place('p-tiananmen', '天安门', tiananmen),
          place('p-forbidden', '故宫', forbiddenCity),
        ],
      ),
    ],
  }, { today });

  expect(projection.markers[0].label).toBe('天安门');
  expect(projection.markers[0].coordinate).toBe(tiananmen);
});

test('M10-T1: a Trip whose Places are all Unscheduled still has a footprint', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(
        trip('china', '2026-12-01', '2026-12-05'),
        [day('china-d1', 'china', '2026-12-01', 1)],
        [item('china-u1', 'china', null, 'p-tiananmen', 0)],
        [place('p-tiananmen', '天安门', tiananmen)],
      ),
    ],
  }, { today });

  expect(projection.markers.map(({ label }) => label)).toEqual(['天安门']);
  expect(projection.unplacedTripIds).toHaveLength(0);
});

test('M10-T1: lifecycle drives visual weight, and an active Trip is not "planned"', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(trip('planned', '2026-12-01', '2026-12-05'), [day('d-p', 'planned', '2026-12-01', 1)],
        [item('i-p', 'planned', 'd-p', 'p-a', 0)], [place('p-a', 'A', tiananmen)]),
      entry(trip('active', '2026-10-10', '2026-10-14'), [day('d-a', 'active', '2026-10-10', 1)],
        [item('i-a', 'active', 'd-a', 'p-b', 0)], [place('p-b', 'B', forbiddenCity)]),
      entry(trip('done', '2026-08-01', '2026-08-08'), [day('d-c', 'done', '2026-08-01', 1)],
        [item('i-c', 'done', 'd-c', 'p-c', 0)], [place('p-c', 'C', tiananmen)]),
    ],
  }, { today });

  const byTrip = new Map(projection.markers.map((marker) => [marker.tripId, marker]));
  expect(byTrip.get('planned')).toMatchObject({ lifecycle: 'planned', weight: 'weak' });
  expect(byTrip.get('done')).toMatchObject({ lifecycle: 'completed', weight: 'normal' });
  expect(byTrip.get('active')).toMatchObject({ lifecycle: 'active', weight: 'emphasized' });
  // Stage-03 §3.5: state is weight, not a new marker shape.
  expect(projection.markers.every(({ variant }) => variant === 'normal')).toBe(true);

  // Stage-03 §3.3: 全部 includes the active Trip; 计划中 must not.

  const plannedOnly = buildHomeMapProjection({
    trips: [
      entry(trip('planned', '2026-12-01', '2026-12-05'), [day('d-p', 'planned', '2026-12-01', 1)],
        [item('i-p', 'planned', 'd-p', 'p-a', 0)], [place('p-a', 'A', tiananmen)]),
      entry(trip('active', '2026-10-10', '2026-10-14'), [day('d-a', 'active', '2026-10-10', 1)],
        [item('i-a', 'active', 'd-a', 'p-b', 0)], [place('p-b', 'B', forbiddenCity)]),
    ],
  }, { today, filter: 'planned' });
  expect(plannedOnly.markers.map(({ tripId }) => tripId)).toEqual(['planned']);
  expect(plannedOnly.filteredOutTripIds).toEqual(['active']);
});

test('M10-T1: the M10-T0 CRS plan is consumed — a mismatched anchor is withheld, not moved', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(trip('global', '2026-12-01', '2026-12-05', 'global'),
        [day('d-g', 'global', '2026-12-01', 1)],
        [item('i-g', 'global', 'd-g', 'p-bj', 0)],
        [place('p-bj', '北京', beijingWgs84)]),
      entry(trip('japan', '2026-12-01', '2026-12-05', 'global'),
        [day('d-j', 'japan', '2026-12-01', 1)],
        [item('i-j', 'japan', 'd-j', 'p-tokyo', 0)],
        [place('p-tokyo', '東京駅', tokyo)]),
    ],
  }, { today });

  // Both Trips start the same date, so the tie breaks on id: `global` first,
  // and only `japan` survives the plan.
  expect(projection.markers.map(({ tripId }) => tripId)).toEqual(['japan']);
  expect(projection.withheldTripIds).toEqual(['global']);
  // A withheld anchor is a CRS refusal, not a missing Place — the two are not
  // conflated, so the list can explain the difference.
  expect(projection.unplacedTripIds).toHaveLength(0);
  expect(projection.plan.withheld[0]).toMatchObject({
    reason: 'crs_region_mismatch',
    tripId: 'global',
  });
  // Drawable coordinates are the very objects that went in.
  expect(projection.markers[0].coordinate).toBe(tokyo);
});

test('M10-T1: a Trip with no saved Place is reported, never silently absent', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(trip('empty', '2026-12-01', '2026-12-05'), [day('d-e', 'empty', '2026-12-01', 1)],
        [item('i-e', 'empty', 'd-e', null, 0)], []),
    ],
  }, { today });

  expect(projection.markers).toHaveLength(0);
  expect(projection.unplacedTripIds).toEqual(['empty']);
  expect(projection.withheldTripIds).toHaveLength(0);
  expect(projection.cameraRequest).toBeNull();
});

test('M10-T1: the filter is applied before the CRS plan', () => {
  const projection = buildHomeMapProjection({
    trips: [
      // Completed *and* a CRS mismatch: the filter is what excludes it.
      entry(trip('done-global', '2026-08-01', '2026-08-08', 'global'),
        [day('d-dg', 'done-global', '2026-08-01', 1)],
        [item('i-dg', 'done-global', 'd-dg', 'p-bj', 0)],
        [place('p-bj', '北京', beijingWgs84)]),
    ],
  }, { today, filter: 'planned' });

  expect(projection.filteredOutTripIds).toEqual(['done-global']);
  expect(projection.withheldTripIds).toHaveLength(0);
  expect(projection.plan.withheld).toHaveLength(0);
});

test('M10-T1: the camera opens on the nearest planned Trip, not the whole footprint', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(trip('china', '2026-12-01', '2026-12-05'), [day('d-c', 'china', '2026-12-01', 1)],
        [item('i-c', 'china', 'd-c', 'p-a', 0)], [place('p-a', 'A', tiananmen)]),
      entry(trip('japan', '2026-12-02', '2026-12-06', 'global'), [day('d-j', 'japan', '2026-12-02', 1)],
        [item('i-j', 'japan', 'd-j', 'p-b', 0)], [place('p-b', 'B', tokyo)]),
    ],
  }, { today });

  // UX-B: the focus is the nearest planned Trip, so the map opens on it rather
  // than fitting both anchors; the coordinate is still passed through untouched.
  expect(projection.focusedTripId).toBe('china');
  expect(projection.cameraRequest?.coordinates).toEqual([tiananmen]);
  expect(projection.cameraRequest?.coordinates[0]).toBe(tiananmen);
});

test('M10-T1: the selected Trip is marked selected without becoming a new shape', () => {
  const projection = buildHomeMapProjection({
      trips: [
        entry(trip('china', '2026-12-01', '2026-12-05'), [day('d-c', 'china', '2026-12-01', 1)],
          [item('i-c', 'china', 'd-c', 'p-a', 0)], [place('p-a', 'A', tiananmen)]),
      ],
    }, { today, filter: 'all', selectedTripId: 'china' });

  expect(projection.markers[0]).toMatchObject({ variant: 'selected', weight: 'weak' });
});

test('M10-T1: cross-Trip contamination fails closed', () => {
  const foreignDay = day('d-foreign', 'other-trip', '2026-12-01', 1);
  expect(() =>
    buildHomeMapProjection({
      trips: [entry(trip('china', '2026-12-01', '2026-12-05'), [foreignDay], [], [])],
    }, { today }),
  ).toThrow(RangeError);

  const foreignItem = item('i-foreign', 'other-trip', null, null, 0);
  expect(() =>
    buildHomeMapProjection({
      trips: [entry(trip('china', '2026-12-01', '2026-12-05'), [], [foreignItem], [])],
    }, { today }),
  ).toThrow(RangeError);
});

test('M10-T1: duplicate Trip ids are rejected rather than double-plotted', () => {
  const value = entry(trip('china', '2026-12-01', '2026-12-05'), [], [], []);
  expect(() => buildHomeMapProjection({ trips: [value, value] }, { today })).toThrow(RangeError);
});

test('M10-T1: an empty Home is a valid projection', () => {
  const projection = buildHomeMapProjection({ trips: [] }, { today });
  expect(projection.markers).toHaveLength(0);
  expect(projection.cameraRequest).toBeNull();
});

test('M10-T5: the active Trip reports today\'s Day and that Day\'s first and last Places', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(
        trip('active', '2026-10-10', '2026-10-14'),
        [
          day('d-1', 'active', '2026-10-10', 1),
          day('d-3', 'active', '2026-10-12', 3),
        ],
        [
          item('i-1', 'active', 'd-1', 'p-a', 0),
          item('i-2', 'active', 'd-3', 'p-beishan', 0),
          item('i-3', 'active', 'd-3', 'p-nanwan', 1),
          // A Place-less Item between them must not become an endpoint.
          item('i-4', 'active', 'd-3', null, 2),
        ],
        [
          place('p-a', '东城', tiananmen),
          place('p-beishan', '北山', forbiddenCity),
          place('p-nanwan', '南湾', tiananmen),
        ],
      ),
    ],
  }, { today });

  expect(projection.activeTrip).toEqual({
    dayId: 'd-3',
    dayIndex: 3,
    fromLabel: '北山',
    toLabel: '南湾',
    tripId: 'active',
    tripTitle: 'Trip active',
  });
});

test('M10-T5: a Day with one Place names it alone, and a Day with none names no endpoint', () => {
  const single = buildHomeMapProjection({
    trips: [entry(
      trip('active', '2026-10-10', '2026-10-14'),
      [day('d-3', 'active', '2026-10-12', 3)],
      [item('i-1', 'active', 'd-3', 'p-beishan', 0)],
      [place('p-beishan', '北山', tiananmen)],
    )],
  }, { today });
  // One Place is not a journey, so the card must not invent a second endpoint.
  expect(single.activeTrip).toMatchObject({ fromLabel: '北山', toLabel: null });

  const none = buildHomeMapProjection({
    trips: [entry(
      trip('active', '2026-10-10', '2026-10-14'),
      [day('d-3', 'active', '2026-10-12', 3)],
      [item('i-1', 'active', 'd-3', null, 0)],
      [],
    )],
  }, { today });
  expect(none.activeTrip).toMatchObject({ fromLabel: null, toLabel: null });
});

test('M10-T5: no active Trip yields no card, and today outside the Trip does too', () => {
  const planned = buildHomeMapProjection({
    trips: [entry(trip('later', '2026-12-01', '2026-12-05'), [], [], [])],
  }, { today });
  expect(planned.activeTrip).toBeNull();

  const completed = buildHomeMapProjection({
    trips: [entry(trip('done', '2026-08-01', '2026-08-05'), [], [], [])],
  }, { today });
  expect(completed.activeTrip).toBeNull();

  // An active Trip whose Day list does not cover today cannot offer a Day.
  const missingDay = buildHomeMapProjection({
    trips: [entry(
      trip('active', '2026-10-10', '2026-10-14'),
      [day('d-1', 'active', '2026-10-10', 1)],
      [],
      [],
    )],
  }, { today });
  expect(missingDay.activeTrip).toBeNull();
});

test('M10-T5: the Active Trip Card is not a filter result', () => {
  const trips = [
    entry(
      trip('active', '2026-10-10', '2026-10-14'),
      [day('d-3', 'active', '2026-10-12', 3)],
      [item('i-1', 'active', 'd-3', 'p-a', 0)],
      [place('p-a', '北山', tiananmen)],
    ),
  ];

  // Stage-03 §3.3: 全部 keeps it visible, and §3.4 surfaces the card separately —
  // so filtering the map to 已完成 must not remove the card.
  const completedOnly = buildHomeMapProjection({ trips }, { filter: 'completed', today });
  expect(completedOnly.markers).toHaveLength(0);
  expect(completedOnly.activeTrip).toMatchObject({ tripId: 'active' });
});

test('UX-B: 全部 opens on the ongoing Trip\'s current Day Places, in itinerary order', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(
        trip('active', '2026-10-10', '2026-10-14'),
        [
          day('d-1', 'active', '2026-10-10', 1),
          day('d-3', 'active', '2026-10-12', 3),
        ],
        [
          item('i-1', 'active', 'd-1', 'p-beishan', 0),
          item('i-2', 'active', 'd-3', 'p-beishan', 0),
          item('i-3', 'active', 'd-3', 'p-nanwan', 1),
          // A later Item sharing the same Place must not double the camera span.
          item('i-4', 'active', 'd-3', 'p-beishan', 2),
        ],
        [
          place('p-beishan', '北山', forbiddenCity),
          place('p-nanwan', '南湾', tiananmen),
        ],
      ),
    ],
  }, { today });

  expect(projection.focusedTripId).toBe('active');
  expect(projection.cameraRequest?.coordinates).toEqual([forbiddenCity, tiananmen]);
});

test('UX-B: a current Day without Places falls back to the Trip anchor', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(
        trip('active', '2026-10-10', '2026-10-14'),
        [
          day('d-1', 'active', '2026-10-10', 1),
          day('d-3', 'active', '2026-10-12', 3),
        ],
        [
          item('i-1', 'active', 'd-1', 'p-beishan', 0),
          // Today's Day only has a Place-less Item.
          item('i-2', 'active', 'd-3', null, 0),
        ],
        [place('p-beishan', '北山', forbiddenCity)],
      ),
    ],
  }, { today });

  expect(projection.focusedTripId).toBe('active');
  expect(projection.cameraRequest?.coordinates).toEqual([forbiddenCity]);
});

test('UX-B: a current-Day Place the CRS plan refuses never steers the camera', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(
        trip('active-global', '2026-10-10', '2026-10-14', 'global'),
        [day('d-3', 'active-global', '2026-10-12', 3)],
        [item('i-1', 'active-global', 'd-3', 'p-bj', 0)],
        // Stored WGS84 inside mainland China: the M10-T0 plan refuses it.
        [place('p-bj', '北京', beijingWgs84)],
      ),
      entry(
        trip('planned', '2026-12-01', '2026-12-05'),
        [day('d-p', 'planned', '2026-12-01', 1)],
        [item('i-p', 'planned', 'd-p', 'p-a', 0)],
        [place('p-a', 'A', tiananmen)],
      ),
    ],
  }, { today });

  expect(projection.focusedTripId).toBe('planned');
  expect(projection.cameraRequest?.coordinates).toEqual([tiananmen]);
});

test('UX-B: with no ongoing Trip, 全部 opens on the nearest planned one', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(trip('far', '2026-12-10', '2026-12-15'), [day('d-f', 'far', '2026-12-10', 1)],
        [item('i-f', 'far', 'd-f', 'p-far', 0)], [place('p-far', 'FAR', tokyo)]),
      entry(trip('near', '2026-12-01', '2026-12-03'), [day('d-n', 'near', '2026-12-01', 1)],
        [item('i-n', 'near', 'd-n', 'p-near', 0)], [place('p-near', 'NEAR', tiananmen)]),
    ],
  }, { today });

  expect(projection.focusedTripId).toBe('near');
  expect(projection.cameraRequest?.coordinates).toEqual([tiananmen]);
});

test('UX-B: with nothing planned, 全部 opens on the most recently finished Trip', () => {
  // `later` started earlier but finished later — "most recent" is the endDate.
  const projection = buildHomeMapProjection({
    trips: [
      entry(trip('earlier-end', '2026-08-01', '2026-08-05'), [day('d-e', 'earlier-end', '2026-08-01', 1)],
        [item('i-e', 'earlier-end', 'd-e', 'p-e', 0)], [place('p-e', 'E', tiananmen)]),
      entry(trip('later-end', '2026-07-01', '2026-08-20'), [day('d-l', 'later-end', '2026-07-01', 1)],
        [item('i-l', 'later-end', 'd-l', 'p-l', 0)], [place('p-l', 'L', forbiddenCity)]),
    ],
  }, { today });

  expect(projection.focusedTripId).toBe('later-end');
  expect(projection.cameraRequest?.coordinates).toEqual([forbiddenCity]);
});

test('UX-B: 计划中 opens on the nearest planned Trip and never on an active one', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(trip('active', '2026-10-10', '2026-10-14'), [day('d-a', 'active', '2026-10-10', 1)],
        [item('i-a', 'active', 'd-a', 'p-a', 0)], [place('p-a', 'A', forbiddenCity)]),
      entry(trip('near', '2026-12-01', '2026-12-03'), [day('d-n', 'near', '2026-12-01', 1)],
        [item('i-n', 'near', 'd-n', 'p-near', 0)], [place('p-near', 'NEAR', tiananmen)]),
      entry(trip('far', '2026-12-10', '2026-12-15'), [day('d-f', 'far', '2026-12-10', 1)],
        [item('i-f', 'far', 'd-f', 'p-far', 0)], [place('p-far', 'FAR', tokyo)]),
    ],
  }, { today, filter: 'planned' });

  expect(projection.focusedTripId).toBe('near');
  expect(projection.cameraRequest?.coordinates).toEqual([tiananmen]);
});

test('UX-B: 已完成 opens on the most recently finished Trip', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(trip('active', '2026-10-10', '2026-10-14'), [day('d-a', 'active', '2026-10-10', 1)],
        [item('i-a', 'active', 'd-a', 'p-a', 0)], [place('p-a', 'A', forbiddenCity)]),
      entry(trip('older', '2026-08-01', '2026-08-05'), [day('d-o', 'older', '2026-08-01', 1)],
        [item('i-o', 'older', 'd-o', 'p-o', 0)], [place('p-o', 'O', tiananmen)]),
    ],
  }, { today, filter: 'completed' });

  expect(projection.focusedTripId).toBe('older');
  expect(projection.cameraRequest?.coordinates).toEqual([tiananmen]);
});

test('UX-B: an unplaced ongoing Trip does not take the camera from a placed one', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(trip('active-empty', '2026-10-10', '2026-10-14'), [day('d-a', 'active-empty', '2026-10-10', 1)],
        [item('i-a', 'active-empty', 'd-a', null, 0)], []),
      entry(trip('planned', '2026-12-01', '2026-12-05'), [day('d-p', 'planned', '2026-12-01', 1)],
        [item('i-p', 'planned', 'd-p', 'p-a', 0)], [place('p-a', 'A', tiananmen)]),
    ],
  }, { today });

  expect(projection.focusedTripId).toBe('planned');
  expect(projection.cameraRequest?.coordinates).toEqual([tiananmen]);
});

test('UX-B: a Home with nothing focusable reports no focus and no camera', () => {
  const projection = buildHomeMapProjection({
    trips: [
      entry(trip('empty', '2026-12-01', '2026-12-05'), [day('d-e', 'empty', '2026-12-01', 1)],
        [item('i-e', 'empty', 'd-e', null, 0)], []),
    ],
  }, { today });

  expect(projection.focusedTripId).toBeNull();
  expect(projection.cameraRequest).toBeNull();
});

/* ---- Year filter and recap ------------------------------------------------ */

/** A single-day Trip with one Place, so year tests can focus on the dates. */
function yearTrip(
  id: string,
  startDate: string,
  endDate: string,
  coordinate: Coordinate,
  overrides: { placeOverrides?: Partial<Place>; itemCount?: number } = {},
): HomeTripData {
  const dayId = `${id}-d1`;
  const placeId = `${id}-p`;
  const itemCount = overrides.itemCount ?? 1;
  return entry(
    trip(id, startDate, endDate),
    [day(dayId, id, startDate, 1)],
    Array.from({ length: itemCount }, (_, index) => item(`${id}-i${index}`, id, dayId, placeId, index)),
    [{ ...place(placeId, id, coordinate), ...overrides.placeOverrides }],
  );
}

/*
 * Home withholds a WGS84 point that falls inside the (deliberately wide) mainland-China
 * GCJ-02 box, which reaches 137.83°E and so covers Osaka. The 2025 Trip uses a WGS84
 * point clearly outside it, so it stays drawable and can take the camera.
 */
const sapporo: Coordinate = { latitude: 43.0618, longitude: 141.3545, system: 'wgs84' };

const yearData = {
  trips: [
    yearTrip('t2024', '2024-03-01', '2024-03-05', forbiddenCity),
    yearTrip('t2025', '2025-05-01', '2025-05-04', sapporo),
    yearTrip('t2026-done', '2026-08-01', '2026-08-03', tokyo),
    // Active on `today` (2026-10-12): its Day for today carries a Place.
    yearTrip('t2026-active', '2026-10-12', '2026-10-14', tiananmen),
    yearTrip('t2027', '2027-02-01', '2027-02-04', tokyo),
  ],
};

test('Home year: lists years newest first and keeps the full set when no year is chosen', () => {
  const projection = buildHomeMapProjection(yearData, { today });

  expect(projection.availableYears).toEqual([2027, 2026, 2025, 2024]);
  expect(projection.year).toBeNull();
  expect(projection.visibleTrips).toHaveLength(5);
});

test('Home year: a chosen year narrows the list, the markers and the filtered-out set together', () => {
  const projection = buildHomeMapProjection(yearData, { today, year: 2026 });

  expect(projection.year).toBe(2026);
  expect(projection.visibleTrips.map(({ tripId }) => tripId).sort())
    .toEqual(['t2026-active', 't2026-done']);
  expect(projection.markers.map(({ tripId }) => tripId).sort())
    .toEqual(['t2026-active', 't2026-done']);
  expect([...projection.filteredOutTripIds].sort()).toEqual(['t2024', 't2025', 't2027']);
  // The year row still offers every year, so the user can move between them.
  expect(projection.availableYears).toEqual([2027, 2026, 2025, 2024]);
});

test('Home year: a Trip that crosses New Year belongs to the year it starts in', () => {
  const crossing = yearTrip('nye', '2025-12-30', '2026-01-02', tokyo);
  const projection2025 = buildHomeMapProjection({ trips: [crossing, ...yearData.trips] }, { today, year: 2025 });
  const projection2026 = buildHomeMapProjection({ trips: [crossing, ...yearData.trips] }, { today, year: 2026 });

  expect(projection2025.visibleTrips.map(({ tripId }) => tripId)).toContain('nye');
  expect(projection2026.visibleTrips.map(({ tripId }) => tripId)).not.toContain('nye');
});

test('Home year: the years on offer come from the lifecycle filter, so no chip leads to an empty list', () => {
  const planned = buildHomeMapProjection(yearData, { today, filter: 'planned' });
  const completed = buildHomeMapProjection(yearData, { today, filter: 'completed' });

  expect(planned.availableYears).toEqual([2027]);
  expect(completed.availableYears).toEqual([2026, 2025, 2024]);
  // An active Trip is only under 全部.
  expect(completed.visibleTrips.map(({ tripId }) => tripId)).not.toContain('t2026-active');
});

test('Home year: a year the filter cannot offer is ignored, and a single year is no filter at all', () => {
  const unknown = buildHomeMapProjection(yearData, { today, year: 1999 });
  expect(unknown.year).toBeNull();
  expect(unknown.visibleTrips).toHaveLength(5);

  // Under 计划中 there is only 2027, so a stale 2025 must not hide the list.
  const stale = buildHomeMapProjection(yearData, { today, filter: 'planned', year: 2025 });
  expect(stale.year).toBeNull();
  expect(stale.visibleTrips.map(({ tripId }) => tripId)).toEqual(['t2027']);

  // One year means the control is hidden, so even a valid request must not stick.
  const single = buildHomeMapProjection(yearData, { today, filter: 'planned', year: 2027 });
  expect(single.year).toBeNull();
  expect(single.visibleTrips.map(({ tripId }) => tripId)).toEqual(['t2027']);
});

test('Home year: the camera follows a Trip inside the year, never an active Trip the year hides', () => {
  const unfiltered = buildHomeMapProjection(yearData, { today });
  expect(unfiltered.focusedTripId).toBe('t2026-active');

  const inPast = buildHomeMapProjection(yearData, { today, year: 2025 });
  expect(inPast.focusedTripId).toBe('t2025');
  expect(inPast.cameraRequest?.coordinates).toEqual([sapporo]);

  // The Active Trip Card is not a filter result, so the year leaves it alone.
  expect(unfiltered.activeTrip?.tripId).toBe('t2026-active');
  expect(inPast.activeTrip?.tripId).toBe('t2026-active');
});

test('Home recap: covers exactly the visible Trips and follows both filters', () => {
  const all = buildHomeMapProjection(yearData, { today });
  expect(all.recap).toEqual({ dayCount: 5, placeCount: 5, tripCount: 5 });

  const year2026 = buildHomeMapProjection(yearData, { today, year: 2026 });
  expect(year2026.recap).toEqual({ dayCount: 2, placeCount: 2, tripCount: 2 });

  const completed2026 = buildHomeMapProjection(yearData, { today, filter: 'completed', year: 2026 });
  expect(completed2026.recap).toEqual({ dayCount: 1, placeCount: 1, tripCount: 1 });

  const nothing = buildHomeMapProjection({ trips: [] }, { today });
  expect(nothing.recap).toEqual({ dayCount: 0, placeCount: 0, tripCount: 0 });
});

test('Home recap: a single Trip shows the same place count as its row, even with a repeated POI', () => {
  const poi = { provider: 'amap', providerPlaceId: 'B000A8UIN8' };
  const twoRows = entry(
    trip('repeat', '2026-08-01', '2026-08-02'),
    [day('r-d1', 'repeat', '2026-08-01', 1)],
    [item('r-i1', 'repeat', 'r-d1', 'r-p1', 0), item('r-i2', 'repeat', 'r-d1', 'r-p2', 1)],
    // The same airport saved on arrival and again on departure.
    [{ ...place('r-p1', '首都机场', tiananmen), ...poi }, { ...place('r-p2', '首都机场', tiananmen), ...poi }],
  );
  const projection = buildHomeMapProjection({ trips: [twoRows] }, { today });

  expect(projection.visibleTrips[0].placeCount).toBe(1);
  expect(projection.recap.placeCount).toBe(projection.visibleTrips[0].placeCount);
});

test('Home recap: a POI saved on two Trips is one place in the total', () => {
  const poi = { provider: 'amap', providerPlaceId: 'B000A8UIN8' };
  const projection = buildHomeMapProjection({
    trips: [
      yearTrip('a', '2026-06-01', '2026-06-02', tiananmen, { placeOverrides: poi }),
      yearTrip('b', '2026-07-01', '2026-07-02', tiananmen, { placeOverrides: poi }),
    ],
  }, { today });

  expect(projection.visibleTrips.map(({ placeCount }) => placeCount)).toEqual([1, 1]);
  expect(projection.recap.placeCount).toBe(1);
  expect(projection.recap.tripCount).toBe(2);
});
