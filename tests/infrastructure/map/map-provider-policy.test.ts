import { expect, test } from '@jest/globals';

import {
  loadTripMapStack,
  resolveTripMapStack,
} from '@/infrastructure/map/map-provider-policy';

test('resolves each persisted Trip region to one renderer/provider/CRS stack', () => {
  expect(resolveTripMapStack({ mapRegion: 'china_mainland' })).toEqual({
    mapRegion: 'china_mainland',
    renderer: 'amap',
    placeProvider: 'amap',
    coordinateSystem: 'gcj02',
  });
  expect(resolveTripMapStack({ mapRegion: 'global' })).toEqual({
    mapRegion: 'global',
    renderer: 'google',
    placeProvider: 'google',
    coordinateSystem: 'wgs84',
  });
});

test('session choice ignores phone location and viewport changes', () => {
  const trip = {
    mapRegion: 'china_mainland' as const,
    phoneLocation: 'outside-mainland',
    viewport: 'outside-mainland',
  };
  const stack = resolveTripMapStack(trip);
  trip.phoneLocation = 'inside-mainland';
  trip.viewport = 'inside-mainland';

  expect(resolveTripMapStack(trip)).toBe(stack);
  expect(Object.isFrozen(stack)).toBe(true);
  expect(stack.renderer).toBe('amap');
});

test('fails closed for missing Trips or invalid persisted region values', async () => {
  await expect(loadTripMapStack('missing', { getById: async () => null }))
    .rejects.toThrow('Trip not found: missing');
  expect(() => resolveTripMapStack({
    mapRegion: 'unknown' as 'global',
  })).toThrow('Invalid persisted Trip mapRegion: unknown');
});
