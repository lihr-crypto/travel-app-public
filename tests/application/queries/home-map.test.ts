import { expect, jest, test } from '@jest/globals';

import { getHomeMapData } from '@/application/queries/home-map';
import type { Coordinate, EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day, Trip } from '@/domain/trip/types';

const timestamp = '2026-10-03T00:00:00.000Z';
const tiananmen: Coordinate = { latitude: 39.90923, longitude: 116.397428, system: 'gcj02' };
const tokyo: Coordinate = { latitude: 35.6812, longitude: 139.7671, system: 'wgs84' };

function trip(id: string, region: Trip['mapRegion']): Trip {
  return {
    id,
    title: `Trip ${id}`,
    startDate: '2026-12-01',
    endDate: '2026-12-03',
    mapRegion: region,
    note: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function day(id: string, tripId: string, dayIndex: number): Day {
  return {
    id,
    tripId,
    date: `2026-12-0${dayIndex}`,
    dayIndex,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function item(id: string, tripId: string, dayId: EntityId | null, placeId: EntityId | null): Item {
  return {
    id,
    tripId,
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

/** A fake read layer, so the test states the query shape rather than the SQL. */
function repositories(options: {
  trips: Trip[];
  daysByTrip?: Record<EntityId, Day[]>;
  itemsByDay?: Record<EntityId, Item[]>;
  unscheduledByTrip?: Record<EntityId, Item[]>;
  places?: Place[];
}) {
  const listByIds = jest.fn(async (ids: readonly EntityId[]) =>
    (options.places ?? []).filter(({ id }) => ids.includes(id)),
  );
  return {
    calls: { listByIds },
    repositories: {
      days: {
        listByTripId: async (tripId: EntityId) => options.daysByTrip?.[tripId] ?? [],
      },
      items: {
        listByDayId: async (dayId: EntityId) => options.itemsByDay?.[dayId] ?? [],
        listUnscheduledByTripId: async (tripId: EntityId) =>
          options.unscheduledByTrip?.[tripId] ?? [],
      },
      places: { listByIds },
      trips: { list: async () => options.trips },
    },
  };
}

test('M10-T3: every Trip is loaded with its Days and its scheduled and Unscheduled Items', async () => {
  const { repositories: source } = repositories({
    daysByTrip: {
      china: [day('china-d1', 'china', 1)],
      japan: [day('japan-d1', 'japan', 1)],
    },
    itemsByDay: {
      'china-d1': [item('china-i1', 'china', 'china-d1', 'p-tiananmen')],
      'japan-d1': [item('japan-i1', 'japan', 'japan-d1', 'p-tokyo')],
    },
    places: [place('p-tiananmen', '天安门', tiananmen), place('p-tokyo', '東京駅', tokyo)],
    trips: [trip('china', 'china_mainland'), trip('japan', 'global')],
    unscheduledByTrip: { china: [item('china-u1', 'china', null, null)] },
  });

  const data = await getHomeMapData(source);

  expect(data.trips.map(({ trip: value }) => value.id)).toEqual(['china', 'japan']);
  expect(data.trips[0].days.map(({ id }) => id)).toEqual(['china-d1']);
  // Scheduled and Unscheduled both reach the projection; the projection is what
  // decides that Unscheduled is only an anchor fallback.
  expect(data.trips[0].items.map(({ id }) => id)).toEqual(['china-i1', 'china-u1']);
  expect(data.trips[1].items.map(({ id }) => id)).toEqual(['japan-i1']);
});

test('M10-T3: Places are read in one bulk call, with the referenced ids de-duplicated', async () => {
  const { calls, repositories: source } = repositories({
    daysByTrip: { china: [day('china-d1', 'china', 1)] },
    itemsByDay: {
      'china-d1': [
        item('a', 'china', 'china-d1', 'p-tiananmen'),
        // The same Place visited twice must not be requested twice.
        item('b', 'china', 'china-d1', 'p-tiananmen'),
        item('c', 'china', 'china-d1', 'p-forbidden'),
        item('d', 'china', 'china-d1', null),
      ],
    },
    places: [
      place('p-tiananmen', '天安门', tiananmen),
      place('p-forbidden', '故宫', tiananmen),
    ],
    trips: [trip('china', 'china_mainland')],
  });

  await getHomeMapData(source);

  // One round trip for the whole cross-Trip surface, not one per Place.
  expect(calls.listByIds).toHaveBeenCalledTimes(1);
  expect([...calls.listByIds.mock.calls[0][0]].sort()).toEqual(['p-forbidden', 'p-tiananmen']);
});

test('M10-T3: a Trip with no Places still appears, with an empty lookup', async () => {
  const { repositories: source } = repositories({
    daysByTrip: { empty: [day('empty-d1', 'empty', 1)] },
    itemsByDay: { 'empty-d1': [item('e', 'empty', 'empty-d1', null)] },
    trips: [trip('empty', 'global')],
  });

  const data = await getHomeMapData(source);

  expect(data.trips).toHaveLength(1);
  expect(data.trips[0].placesById).toEqual({});
});

test('M10-T3: each Trip can only see the Places its own Items reference', async () => {
  const { repositories: source } = repositories({
    daysByTrip: { china: [day('china-d1', 'china', 1)], japan: [day('japan-d1', 'japan', 1)] },
    itemsByDay: {
      'china-d1': [item('china-i1', 'china', 'china-d1', 'p-tiananmen')],
      'japan-d1': [item('japan-i1', 'japan', 'japan-d1', 'p-tokyo')],
    },
    places: [place('p-tiananmen', '天安门', tiananmen), place('p-tokyo', '東京駅', tokyo)],
    trips: [trip('china', 'china_mainland'), trip('japan', 'global')],
  });

  const data = await getHomeMapData(source);

  expect(Object.keys(data.trips[0].placesById)).toEqual(['p-tiananmen']);
  expect(Object.keys(data.trips[1].placesById)).toEqual(['p-tokyo']);
});

test('M10-T3: a dangling Place reference fails closed instead of drawing nothing', async () => {
  const { repositories: source } = repositories({
    daysByTrip: { china: [day('china-d1', 'china', 1)] },
    itemsByDay: { 'china-d1': [item('china-i1', 'china', 'china-d1', 'p-missing')] },
    trips: [trip('china', 'china_mainland')],
  });

  await expect(getHomeMapData(source)).rejects.toThrow(
    'Home Place not found for Item: china-i1',
  );
});

test('M10-T3: an empty database is a valid read', async () => {
  const { calls, repositories: source } = repositories({ trips: [] });

  const data = await getHomeMapData(source);

  expect(data.trips).toEqual([]);
  expect(calls.listByIds).toHaveBeenCalledWith([]);
});
