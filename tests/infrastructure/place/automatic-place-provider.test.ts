import { expect, jest, test } from '@jest/globals';

import {
  resolveAutomaticPlaceProviderSession,
  type PlaceProviderSessionDependencies,
} from '@/infrastructure/place/place-provider-session';
import {
  AutomaticPlaceProviderError,
} from '@/infrastructure/place/automatic-place-provider';
import type {
  PlaceProvider,
  PlaceSearchPage,
  PlaceSearchQuery,
  PlaceSearchResult,
  ReverseGeocodeQuery,
  ReverseGeocodeResult,
} from '@/infrastructure/place/place-provider';

const amapResult: PlaceSearchResult = {
  name: '颐和园',
  address: '北京市海淀区',
  coordinate: { latitude: 39.999676, longitude: 116.275118, system: 'gcj02' },
  provider: 'amap',
  providerPlaceId: 'amap-yiheyuan',
  regionLabel: '北京',
  metadata: { province: '北京', attribution: 'AMap' },
};

const googleResult: PlaceSearchResult = {
  name: 'Sydney Opera House',
  address: 'Bennelong Point',
  coordinate: { latitude: -33.856784, longitude: 151.215297, system: 'wgs84' },
  provider: 'google',
  providerPlaceId: 'google-opera',
  regionLabel: 'Sydney',
  metadata: { attributions: [{ text: 'Google Maps' }] },
};

function provider(
  search: PlaceProvider['search'],
  reverseGeocode?: PlaceProvider['reverseGeocode'],
): PlaceProvider {
  return reverseGeocode === undefined ? { search } : { search, reverseGeocode };
}

function dependencies(
  amap: PlaceProvider,
  google: PlaceProvider,
  options: { amapReady?: boolean; googleReady?: boolean } = {},
): PlaceProviderSessionDependencies {
  return {
    amapProvider: amap,
    googleProvider: google,
    isAmapReady: jest.fn(() => options.amapReady ?? true),
    initializeGoogle: jest.fn(async () => options.googleReady ?? true),
  };
}

function page(results: PlaceSearchResult[], nextCursor: string | null = null): PlaceSearchPage {
  return { results, nextCursor, suggestions: ['suggestion'] };
}

test('creates a mixed session without probing readiness and combines native results', async () => {
  const amapSearch = jest.fn(async () => page([amapResult]));
  const googleSearch = jest.fn(async () => page([googleResult]));
  const deps = dependencies(provider(amapSearch), provider(googleSearch));

  const session = await resolveAutomaticPlaceProviderSession(
    { mapRegion: 'china_mainland' },
    deps,
  );

  expect(session).toMatchObject({
    mapRegion: 'china_mainland',
    providerId: 'amap',
    coordinateSystem: 'gcj02',
    automatic: true,
  });
  expect(deps.isAmapReady).not.toHaveBeenCalled();
  expect(deps.initializeGoogle).not.toHaveBeenCalled();

  const pageResult = await session.provider.search({
    keyword: 'opera',
    center: amapResult.coordinate,
  });

  expect(pageResult.results).toEqual([amapResult, googleResult]);
  expect(pageResult.suggestions).toEqual(['suggestion']);
  expect(amapSearch).toHaveBeenCalledWith({ keyword: 'opera', center: amapResult.coordinate });
  // A WGS84 provider never receives a GCJ-02 center, and no conversion is attempted.
  expect(googleSearch).toHaveBeenCalledWith({ keyword: 'opera' });
  expect(pageResult.results.map(({ provider, coordinate }) => [provider, coordinate.system]))
    .toEqual([['amap', 'gcj02'], ['google', 'wgs84']]);
  expect(pageResult.results[0].metadata).toEqual(amapResult.metadata);
  expect(pageResult.results[1].metadata).toEqual(googleResult.metadata);
});

test('uses the WGS84 center only for Google in a global default-context session', async () => {
  const amapSearch = jest.fn(async () => page([amapResult]));
  const googleSearch = jest.fn(async () => page([googleResult]));
  const deps = dependencies(provider(amapSearch), provider(googleSearch));
  const session = await resolveAutomaticPlaceProviderSession({ mapRegion: 'global' }, deps);

  expect(session).toMatchObject({
    mapRegion: 'global',
    providerId: 'google',
    coordinateSystem: 'wgs84',
    automatic: true,
  });
  await session.provider.search({ keyword: 'opera', center: googleResult.coordinate });
  expect(amapSearch).toHaveBeenCalledWith({ keyword: 'opera' });
  expect(googleSearch).toHaveBeenCalledWith({ keyword: 'opera', center: googleResult.coordinate });
});

test('keeps the successful provider when the other provider fails', async () => {
  const amapSearch = jest.fn(async () => { throw new Error('AMap offline'); });
  const googleSearch = jest.fn(async () => page([googleResult]));
  const deps = dependencies(provider(amapSearch), provider(googleSearch));
  const session = await resolveAutomaticPlaceProviderSession({ mapRegion: 'global' }, deps);

  await expect(session.provider.search({ keyword: 'opera' })).resolves.toMatchObject({
    results: [googleResult],
    nextCursor: null,
  });
});

test('rejects with actionable diagnostics when both providers fail', async () => {
  const amapSearch = jest.fn(async () => { throw new Error('AMap offline'); });
  const googleSearch = jest.fn(async () => { throw new Error('Google offline'); });
  const deps = dependencies(provider(amapSearch), provider(googleSearch));
  const session = await resolveAutomaticPlaceProviderSession({ mapRegion: 'global' }, deps);

  await expect(session.provider.search({ keyword: 'opera' })).rejects.toEqual(
    expect.objectContaining({
      name: 'AutomaticPlaceProviderError',
      code: 'provider_error',
      message: expect.stringContaining('AMap offline'),
    }),
  );
  await expect(session.provider.search({ keyword: 'opera' })).rejects.toThrow('Google offline');
});

test('does not call an unready provider and reports when none can answer', async () => {
  const amapSearch = jest.fn(async () => page([amapResult]));
  const googleSearch = jest.fn(async () => page([googleResult]));
  const deps = dependencies(provider(amapSearch), provider(googleSearch), {
    amapReady: false,
    googleReady: false,
  });
  const session = await resolveAutomaticPlaceProviderSession({ mapRegion: 'china_mainland' }, deps);

  expect(deps.isAmapReady).not.toHaveBeenCalled();
  expect(deps.initializeGoogle).not.toHaveBeenCalled();
  await expect(session.provider.search({ keyword: 'anything' })).rejects.toMatchObject({
    name: 'AutomaticPlaceProviderError',
    code: 'provider_not_ready',
  });
  expect(amapSearch).not.toHaveBeenCalled();
  expect(googleSearch).not.toHaveBeenCalled();
});

test('multiplexes provider cursors and rejects a stale keyword', async () => {
  const amapSearch = jest.fn<(query: PlaceSearchQuery) => Promise<PlaceSearchPage>>()
    .mockResolvedValueOnce(page([amapResult], 'amap-native-page-2'))
    .mockResolvedValueOnce(page([{ ...amapResult, name: '颐和园东门' }], null));
  const googleSearch = jest.fn<(query: PlaceSearchQuery) => Promise<PlaceSearchPage>>()
    .mockResolvedValueOnce(page([googleResult], 'google-native-page-2'))
    .mockResolvedValueOnce(page([{ ...googleResult, name: 'Opera House Forecourt' }], null));
  const deps = dependencies(provider(amapSearch), provider(googleSearch));
  const session = await resolveAutomaticPlaceProviderSession({ mapRegion: 'china_mainland' }, deps);
  const center = amapResult.coordinate;

  const first = await session.provider.search({ keyword: 'landmark', center });
  expect(first.nextCursor).toEqual(expect.stringMatching(/^automatic:v1:/));
  const callsAfterFirstPage = [amapSearch.mock.calls.length, googleSearch.mock.calls.length];

  await expect(session.provider.search({
    keyword: 'different',
    center,
    cursor: first.nextCursor!,
  })).rejects.toMatchObject({
    name: 'AutomaticPlaceProviderError',
    code: 'invalid_query',
  });
  expect([amapSearch.mock.calls.length, googleSearch.mock.calls.length])
    .toEqual(callsAfterFirstPage);

  const second = await session.provider.search({
    keyword: 'landmark',
    center,
    cursor: first.nextCursor!,
  });
  expect(second.nextCursor).toBeNull();
  expect(amapSearch).toHaveBeenLastCalledWith({
    keyword: 'landmark',
    center,
    cursor: 'amap-native-page-2',
  });
  expect(googleSearch).toHaveBeenLastCalledWith({
    keyword: 'landmark',
    cursor: 'google-native-page-2',
  });
});

test('a temporary paging failure preserves that source cursor for a later retry', async () => {
  const deps = dependencies(provider(async () => page([])), provider(async () => page([])));
  deps.amapProvider.search = jest.fn<PlaceProvider['search']>()
    .mockResolvedValueOnce(page([amapResult], 'amap-next'))
    .mockRejectedValueOnce(new Error('temporary AMap failure'))
    .mockResolvedValueOnce(page([amapResult]));
  deps.googleProvider.search = jest.fn<PlaceProvider['search']>()
    .mockResolvedValueOnce(page([googleResult], 'google-next'))
    .mockResolvedValueOnce(page([googleResult]));
  const session = await resolveAutomaticPlaceProviderSession({ mapRegion: 'global' }, deps);
  const first = await session.provider.search({ keyword: 'museum' });
  const second = await session.provider.search({ keyword: 'museum', cursor: first.nextCursor! });
  expect(second.unavailableProviders).toEqual(['amap']);
  expect(second.nextCursor).not.toBeNull();
  const third = await session.provider.search({ keyword: 'museum', cursor: second.nextCursor! });
  expect(deps.amapProvider.search).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'amap-next' }));
  expect(deps.googleProvider.search).toHaveBeenCalledTimes(2);
  expect(third.nextCursor).toBeNull();
});

test('reverse geocoding dispatches by coordinate system and preserves native CRS', async () => {
  const amapReverse = jest.fn(async (query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult> => ({
    provider: 'amap', coordinate: query.coordinate, name: '颐和园', address: '北京',
    regionLabel: '北京', providerPlaceId: 'amap-id', metadata: { source: 'amap' },
  }));
  const googleReverse = jest.fn(async (query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult> => ({
    provider: 'google', coordinate: query.coordinate, name: 'Opera House', address: 'Sydney',
    regionLabel: 'Sydney', providerPlaceId: 'google-id', metadata: { source: 'google' },
  }));
  const deps = dependencies(
    provider(jest.fn(async () => page([])), amapReverse),
    provider(jest.fn(async () => page([])), googleReverse),
  );
  const session = await resolveAutomaticPlaceProviderSession({ mapRegion: 'global' }, deps);
  const gcj02 = { latitude: 39.9, longitude: 116.3, system: 'gcj02' as const };
  const wgs84 = { latitude: -33.8, longitude: 151.2, system: 'wgs84' as const };

  await expect(session.provider.reverseGeocode!({ coordinate: gcj02 })).resolves.toEqual(
    expect.objectContaining({ provider: 'amap', coordinate: gcj02 }),
  );
  await expect(session.provider.reverseGeocode!({ coordinate: wgs84 })).resolves.toEqual(
    expect.objectContaining({ provider: 'google', coordinate: wgs84 }),
  );
  expect(amapReverse).toHaveBeenCalledTimes(1);
  expect(googleReverse).toHaveBeenCalledTimes(1);
});

test('keeps reverse geocoding from invoking an unready AMap provider', async () => {
  const amapReverse = jest.fn(async () => null);
  const googleReverse = jest.fn(async () => null);
  const deps = dependencies(
    provider(jest.fn(async () => page([])), amapReverse),
    provider(jest.fn(async () => page([])), googleReverse),
    { amapReady: false },
  );
  const session = await resolveAutomaticPlaceProviderSession({ mapRegion: 'china_mainland' }, deps);

  await expect(session.provider.reverseGeocode!({
    coordinate: { latitude: 39.9, longitude: 116.3, system: 'gcj02' },
  })).rejects.toMatchObject({ code: 'provider_not_ready' });
  expect(amapReverse).not.toHaveBeenCalled();
});

test('exports a typed automatic error for invalid continuation input', () => {
  expect(new AutomaticPlaceProviderError('invalid_query', 'retry')).toBeInstanceOf(Error);
});
