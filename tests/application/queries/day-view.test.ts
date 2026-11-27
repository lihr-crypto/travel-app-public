import { expect, jest, test } from '@jest/globals';

import {
  buildDayViewData,
  getDayView,
  getDayViewData,
  type DayViewQuerySource,
} from '@/application/queries/day-view';
import { dayKeys } from '@/application/queries/query-keys';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day, Trip } from '@/domain/trip/types';

const timestamp = '2026-09-11T12:00:00.000Z';
const trip: Trip = {
  id: 'trip-1',
  title: 'Hokkaido',
  startDate: '2026-12-30',
  endDate: '2026-12-31',
  mapRegion: 'global',
  note: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const day: Day = {
  id: 'day-1',
  tripId: trip.id,
  date: trip.startDate,
  dayIndex: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function item(id: string, sortOrder: number): Item {
  return {
    id,
    tripId: trip.id,
    dayId: day.id,
    placeId: null,
    type: 'custom',
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

test('buildDayViewData keeps all Items and orders them by canonical sortOrder', () => {
  const second = item('item-2', 2);
  const first = item('item-1', 1);
  const data = buildDayViewData({ trip, day, items: [second, first] });

  expect(data).toEqual({
    trip,
    day,
    items: [first, second],
    placesById: {},
  });
});

test('buildDayViewData preserves supplied Place snapshots without mutating input', () => {
  const items = [item('item-2', 2), item('item-1', 1)];
  const place = {
    id: 'place-1',
    name: 'Station',
    coordinate: { latitude: 43, longitude: 141, system: 'wgs84' as const },
    address: null,
    provider: null,
    providerPlaceId: null,
    metadata: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const data = buildDayViewData({
    trip,
    day,
    items,
    placesById: { [place.id]: place },
  });

  expect(data.placesById).toEqual({ [place.id]: place });
  expect(items.map(({ id }) => id)).toEqual(['item-2', 'item-1']);
});

test('getDayViewData loads Trip, Day and complete ordered Items through repositories', async () => {
  const context = {
    trips: { getById: jest.fn(async () => trip) },
    days: { getById: jest.fn(async () => day) },
    items: {
      listByDayId: jest.fn(async () => [item('item-2', 2), item('item-1', 1)]),
    },
    places: { getById: jest.fn(async () => null) },
  };

  await expect(getDayViewData(day.id, context)).resolves.toEqual({
    trip,
    day,
    items: [item('item-1', 1), item('item-2', 2)],
    placesById: {},
  });
  expect(context.trips.getById).toHaveBeenCalledWith(trip.id);
  expect(context.items.listByDayId).toHaveBeenCalledWith(day.id);
});

test('getDayViewData loads each referenced saved Place once', async () => {
  const place: Place = {
    id: 'place-1',
    name: 'Station',
    coordinate: { latitude: 43, longitude: 141, system: 'wgs84' },
    address: null,
    provider: null,
    providerPlaceId: null,
    metadata: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const getById = jest.fn(async () => place);
  const data = await getDayViewData(day.id, {
    days: { getById: async () => day },
    trips: { getById: async () => trip },
    items: { listByDayId: async () => [
      { ...item('item-1', 0), placeId: place.id },
      { ...item('item-2', 1), placeId: place.id },
      item('item-3', 2),
    ] },
    places: { getById },
  });

  expect(data.placesById).toEqual({ [place.id]: place });
  expect(getById).toHaveBeenCalledTimes(1);
  expect(getById).toHaveBeenCalledWith(place.id);
});

test('getDayViewData rejects a dangling non-null Place reference', async () => {
  await expect(getDayViewData(day.id, {
    days: { getById: async () => day },
    trips: { getById: async () => trip },
    items: { listByDayId: async () => [{ ...item('item-1', 0), placeId: 'missing' }] },
    places: { getById: async () => null },
  })).rejects.toThrow('Place not found: missing');
});

test('getDayViewData fails clearly for missing Day or Trip', async () => {
  await expect(
    getDayViewData('missing-day', {
      days: { getById: async () => null },
      trips: { getById: jest.fn(async () => trip) },
      items: { listByDayId: jest.fn(async () => []) },
      places: { getById: jest.fn(async () => null) },
    }),
  ).rejects.toThrow('Day not found: missing-day');

  await expect(
    getDayViewData(day.id, {
      days: { getById: async () => day },
      trips: { getById: async () => null },
      items: { listByDayId: jest.fn(async () => []) },
      places: { getById: jest.fn(async () => null) },
    }),
  ).rejects.toThrow('Trip not found: trip-1');
});

test('Day View query source and key use one day-scoped read model', async () => {
  const source: DayViewQuerySource = {
    getDayView: jest.fn(async () => buildDayViewData({ trip, day, items: [] })),
  };

  await expect(getDayView(source, day.id)).resolves.toMatchObject({
    trip,
    day,
  });
  expect(source.getDayView).toHaveBeenCalledWith(day.id);
  expect(dayKeys.view(day.id)).toEqual(['days', day.id, 'view']);
});
