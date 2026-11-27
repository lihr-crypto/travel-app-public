import { expect, jest, test } from '@jest/globals';

import {
  resolvePlaceProviderSession,
  resolveApplePlaceProviderSession,
  type PlaceProviderSessionDependencies,
} from '@/infrastructure/place/place-provider-session';
import type { PlaceProvider } from '@/infrastructure/place/place-provider';

const amapProvider: PlaceProvider = { search: jest.fn(async () => ({ results: [], nextCursor: null })) };
const googleProvider: PlaceProvider = { search: jest.fn(async () => ({ results: [], nextCursor: null })) };

test.each(['china_mainland', 'global'] as const)('production Apple session is unified for legacy %s Trips', async (mapRegion) => {
  const initialize = jest.fn(async () => true);
  const provider: PlaceProvider = { search: jest.fn(async () => ({ results: [], nextCursor: null })) };
  expect(await resolveApplePlaceProviderSession({ mapRegion }, { initialize, provider }))
    .toEqual({ mapRegion: 'global', providerId: 'apple', coordinateSystem: 'wgs84', provider });
  expect(initialize).toHaveBeenCalledTimes(1);
});

test('an unavailable Apple native module reports a recoverable readiness error', async () => {
  await expect(resolveApplePlaceProviderSession({ mapRegion: 'global' }, {
    initialize: async () => false, provider: googleProvider,
  })).rejects.toMatchObject({ code: 'provider_not_ready', providerId: 'apple' });
});

function dependencies(input?: {
  amapReady?: boolean;
  googleReady?: boolean;
}): PlaceProviderSessionDependencies {
  return {
    amapProvider,
    googleProvider,
    isAmapReady: jest.fn(() => input?.amapReady ?? true),
    initializeGoogle: jest.fn(async () => input?.googleReady ?? true),
  };
}

test('resolves mainland Trips to the ready AMap GCJ-02 provider only', async () => {
  const deps = dependencies();
  const session = await resolvePlaceProviderSession(
    { mapRegion: 'china_mainland' },
    deps,
  );

  expect(session).toEqual({
    mapRegion: 'china_mainland',
    providerId: 'amap',
    coordinateSystem: 'gcj02',
    provider: amapProvider,
  });
  expect(deps.isAmapReady).toHaveBeenCalledTimes(1);
  expect(deps.initializeGoogle).not.toHaveBeenCalled();
  expect(Object.isFrozen(session)).toBe(true);
});

test('resolves global Trips to the initialized Google WGS84 provider only', async () => {
  const deps = dependencies();
  const session = await resolvePlaceProviderSession({ mapRegion: 'global' }, deps);

  expect(session).toEqual({
    mapRegion: 'global',
    providerId: 'google',
    coordinateSystem: 'wgs84',
    provider: googleProvider,
  });
  expect(deps.initializeGoogle).toHaveBeenCalledTimes(1);
  expect(deps.isAmapReady).not.toHaveBeenCalled();
});

test.each([
  ['china_mainland' as const, { amapReady: false }, 'amap'],
  ['global' as const, { googleReady: false }, 'google'],
])('fails closed when %s native provider is not ready', async (
  mapRegion,
  readiness,
  providerId,
) => {
  await expect(
    resolvePlaceProviderSession({ mapRegion }, dependencies(readiness)),
  ).rejects.toEqual(expect.objectContaining({
    name: 'PlaceProviderSessionError',
    code: 'provider_not_ready',
    providerId,
  }));
});

test('phone location and viewport cannot alter the persisted session choice', async () => {
  const trip = {
    mapRegion: 'global' as const,
    phoneLocation: 'china_mainland',
    viewportRegion: 'china_mainland',
  };
  const deps = dependencies();
  const first = await resolvePlaceProviderSession(trip, deps);
  trip.phoneLocation = 'global';
  trip.viewportRegion = 'global';
  const second = await resolvePlaceProviderSession(trip, deps);

  expect(first.providerId).toBe('google');
  expect(second.providerId).toBe('google');
  expect(first.coordinateSystem).toBe('wgs84');
  expect(second.coordinateSystem).toBe('wgs84');
});
