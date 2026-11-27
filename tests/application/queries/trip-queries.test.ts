import { afterEach, expect, jest, test } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';

import {
  getTrip,
  getTripDays,
  getTrips,
  invalidateCreatedTripQueries,
  type TripQuerySource,
} from '@/application/queries/trip-queries';
import { homeKeys, tripKeys } from '@/application/queries/query-keys';

const source: TripQuerySource = {
  getTrips: jest.fn(async () => []),
  getTrip: jest.fn(async () => null),
  getTripDays: jest.fn(async () => []),
};

let queryClient: QueryClient | undefined;

afterEach(() => {
  queryClient?.clear();
  queryClient = undefined;
  jest.clearAllMocks();
});

test('query functions delegate reads to the application data source', async () => {
  await expect(getTrips(source)).resolves.toEqual([]);
  await expect(getTrip(source, 'trip-1')).resolves.toBeNull();
  await expect(getTripDays(source, 'trip-1')).resolves.toEqual([]);

  expect(source.getTrips).toHaveBeenCalledTimes(1);
  expect(source.getTrip).toHaveBeenCalledWith('trip-1');
  expect(source.getTripDays).toHaveBeenCalledWith('trip-1');
});

test('query keys represent the Trip read models', () => {
  expect(tripKeys.all).toEqual(['trips']);
  expect(tripKeys.detail('trip-1')).toEqual(['trips', 'trip-1']);
  expect(tripKeys.days('trip-1')).toEqual(['trips', 'trip-1', 'days']);
});

test('Trip creation invalidates list, detail, Day and Footprint queries', async () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(tripKeys.all, []);
  queryClient.setQueryData(tripKeys.detail('trip-1'), null);
  queryClient.setQueryData(tripKeys.days('trip-1'), []);
  queryClient.setQueryData(homeKeys.map, { trips: [] });

  await invalidateCreatedTripQueries(queryClient, 'trip-1');

  expect(queryClient.getQueryState(tripKeys.all)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(tripKeys.detail('trip-1'))?.isInvalidated).toBe(
    true,
  );
  expect(queryClient.getQueryState(tripKeys.days('trip-1'))?.isInvalidated).toBe(
    true,
  );
  // Home is cross-Trip: a new Trip changes the Footprint even though neither the
  // map nor the list is keyed by the new Trip's id.
  expect(queryClient.getQueryState(homeKeys.map)?.isInvalidated).toBe(true);
});
