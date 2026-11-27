import { expect, jest, test } from '@jest/globals';

import {
  getTripOverviewData,
  type TripOverviewReadContext,
} from '@/application/queries/trip-overview';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day, Trip } from '@/domain/trip/types';

const timestamp = '2026-09-14T00:00:00.000Z';
const trip: Trip = {
  id: 'trip-1', title: '北京', startDate: '2026-09-20', endDate: '2026-09-21',
  mapRegion: 'china_mainland', note: null, createdAt: timestamp, updatedAt: timestamp,
};
const days: Day[] = [
  { id: 'day-2', tripId: trip.id, date: '2026-09-21', dayIndex: 2, createdAt: timestamp, updatedAt: timestamp },
  { id: 'day-1', tripId: trip.id, date: '2026-09-20', dayIndex: 1, createdAt: timestamp, updatedAt: timestamp },
];
function item(id: string, dayId: string | null, placeId: string | null, sortOrder: number): Item {
  return {
    id, tripId: trip.id, dayId, placeId, type: 'sightseeing', title: id,
    sortOrder, timeMode: 'none', startDateTime: null, endDateTime: null,
    period: null, isFixed: false, note: null, payload: null,
    createdAt: timestamp, updatedAt: timestamp,
  };
}
const place: Place = {
  id: 'place-1', name: '天安门',
  coordinate: { latitude: 39.909187, longitude: 116.397451, system: 'gcj02' },
  address: null, provider: 'amap', providerPlaceId: 'amap-1', metadata: null,
  createdAt: timestamp, updatedAt: timestamp,
};

function context(overrides: Partial<TripOverviewReadContext> = {}): TripOverviewReadContext {
  return {
    trips: { getById: jest.fn(async () => trip) },
    days: { listByTripId: jest.fn(async () => days) },
    items: {
      listByDayId: jest.fn(async (dayId) => dayId === 'day-1'
        ? [item('scheduled-2', dayId, null, 1), item('scheduled-1', dayId, 'place-1', 0)]
        : []),
      listUnscheduledByTripId: jest.fn(async () => [item('unscheduled-1', null, 'place-1', 0)]),
    },
    places: { getById: jest.fn(async (id) => id === place.id ? place : null) },
    ...overrides,
  };
}

test('builds one ordered Trip-wide read model and deduplicates Place reads', async () => {
  const readContext = context();
  const result = await getTripOverviewData(trip.id, readContext);

  expect(result.days.map(({ id }) => id)).toEqual(['day-1', 'day-2']);
  expect(result.scheduledItems.map(({ id }) => id)).toEqual(['scheduled-1', 'scheduled-2']);
  expect(result.unscheduledItems.map(({ id }) => id)).toEqual(['unscheduled-1']);
  expect(result.placesById).toEqual({ [place.id]: place });
  expect(readContext.places.getById).toHaveBeenCalledTimes(1);
});

test('fails closed for missing Trips, dangling Places and invalid ownership', async () => {
  await expect(getTripOverviewData('missing', context({
    trips: { getById: jest.fn(async () => null) },
  }))).rejects.toThrow('Trip not found: missing');

  await expect(getTripOverviewData(trip.id, context({
    places: { getById: jest.fn(async () => null) },
  }))).rejects.toThrow('Place not found: place-1');

  await expect(getTripOverviewData(trip.id, context({
    days: { listByTripId: jest.fn(async () => [{ ...days[0], tripId: 'other-trip' }]) },
    items: {
      listByDayId: jest.fn(async () => []),
      listUnscheduledByTripId: jest.fn(async () => []),
    },
  }))).rejects.toThrow('Trip Overview Day belongs to another Trip');
});
