import { expect, jest, test } from '@jest/globals';

import {
  GooglePlaceProvider,
  type GooglePlacesNativeClient,
} from '@/infrastructure/place/google-place-provider';
import type { ReverseGeocodeResult } from '@/infrastructure/place/place-provider';
import type {
  NativeGooglePlacesSearchQuery,
  NativeGooglePlacesSearchPage,
  NativeGooglePlacesSearchResult,
  NativeGoogleReverseGeocodeResult,
} from '../../../modules/expo-google-places/src/ExpoGooglePlacesModule';

function client(
  results: NativeGooglePlacesSearchPage | NativeGooglePlacesSearchResult[],
  reverseGeocode: NativeGoogleReverseGeocodeResult | null = null,
): GooglePlacesNativeClient {
  return {
    search: jest.fn(async () => Array.isArray(results)
      ? { results, nextCursor: null, suggestions: [] }
      : results),
    reverseGeocode: jest.fn(async () => reverseGeocode),
  };
}

test('maps Google details into provider-neutral WGS84 search results in order', async () => {
  const native = client([
    {
      placeId: ' ChIJN1t_tDeuEmsRUsoyG83frY4 ',
      name: ' Sydney Opera House ',
      address: ' Bennelong Point, Sydney NSW 2000 ',
      latitude: -33.8567844,
      longitude: 151.2152967,
      regionLabel: ' Sydney NSW, Australia ',
      types: ['tourist_attraction', ' point_of_interest ', ''],
      attributions: [{ text: '© Example provider', url: 'https://example.com/source' }],
    },
  ]);
  const provider = new GooglePlaceProvider(native);

  await expect(provider.search({
    keyword: ' Opera House ',
    center: { latitude: -33.86, longitude: 151.21, system: 'wgs84' },
    region: { countryCode: 'au', city: ' Sydney ' },
    limit: 20,
  })).resolves.toEqual({ results: [{
    name: 'Sydney Opera House',
    address: 'Bennelong Point, Sydney NSW 2000',
    coordinate: {
      latitude: -33.8567844, longitude: 151.2152967, system: 'wgs84',
    },
    provider: 'google',
    providerPlaceId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    regionLabel: 'Sydney NSW, Australia',
    metadata: {
      types: ['tourist_attraction', 'point_of_interest'],
      attributions: [{ text: '© Example provider', url: 'https://example.com/source' }],
    },
  }], nextCursor: null, suggestions: [] });
  expect(native.search).toHaveBeenCalledWith({
    keyword: 'Opera House',
    city: 'Sydney',
    countryCode: 'AU',
    center: { latitude: -33.86, longitude: 151.21 },
    limit: 20,
  });
});

test.each([
  [{ keyword: '   ' }, 'invalid_query'],
  [{ keyword: 'Opera', limit: 0 }, 'invalid_query'],
  [{ keyword: 'Opera', region: { countryCode: 'AUS' } }, 'invalid_query'],
  [{ keyword: 'Opera', region: { countryCode: 'CN' } }, 'invalid_query'],
  [{
    keyword: 'Opera',
    center: { latitude: -33.86, longitude: 151.21, system: 'gcj02' as const },
  }, 'invalid_query'],
])('rejects invalid Google query %# before invoking native code', async (query, code) => {
  const native = client([]);
  const provider = new GooglePlaceProvider(native);
  await expect(provider.search(query)).rejects.toMatchObject({ code });
  expect(native.search).not.toHaveBeenCalled();
});

test.each([
  [{ name: '', placeId: 'id', latitude: 0, longitude: 0, types: [] }],
  [{ name: 'name', placeId: '', latitude: 0, longitude: 0, types: [] }],
  [{ name: 'name', placeId: 'id', latitude: 91, longitude: 0, types: [] }],
])('fails closed for malformed Google result %#', async (result) => {
  const provider = new GooglePlaceProvider(client([result]));
  await expect(provider.search({ keyword: 'name' })).rejects.toMatchObject({
    provider: 'google',
    code: 'invalid_response',
  });
});

test('maps native configuration failures into stable errors', async () => {
  const native: GooglePlacesNativeClient = {
    search: jest.fn(async () => {
      throw Object.assign(new Error('native detail'), {
        code: 'ERR_GOOGLE_PLACES_NOT_CONFIGURED',
      });
    }),
    reverseGeocode: jest.fn(async () => null),
  };
  await expect(
    new GooglePlaceProvider(native).search({ keyword: 'Opera' }),
  ).rejects.toMatchObject({
    name: 'PlaceProviderError', provider: 'google', code: 'not_configured',
  });
});

test('carries the official Text Search continuation token through the neutral page contract', async () => {
  const firstResult = {
    placeId: 'place-1', name: 'Museum One', latitude: 40.1, longitude: -73.9, types: [],
  };
  const secondResult = {
    placeId: 'place-2', name: 'Museum Two', latitude: 40.2, longitude: -73.8, types: [],
  };
  const pages: NativeGooglePlacesSearchPage[] = [
    { results: [firstResult], nextCursor: 'google-page-2', suggestions: [] },
    { results: [secondResult], nextCursor: null, suggestions: [] },
  ];
  const nativeSearch = jest.fn(async (_query: NativeGooglePlacesSearchQuery) => pages.shift()!);
  const provider = new GooglePlaceProvider({
    search: nativeSearch,
    reverseGeocode: jest.fn(async () => null),
  });

  const first = await provider.search({ keyword: 'Museum' });
  expect(first.results[0].providerPlaceId).toBe('place-1');
  expect(first.nextCursor).toBe('google-page-2');
  const second = await provider.search({ keyword: 'Museum', cursor: first.nextCursor! });
  expect(second.results[0].providerPlaceId).toBe('place-2');
  expect(second.nextCursor).toBeNull();
  expect(nativeSearch).toHaveBeenNthCalledWith(2, expect.objectContaining({
    keyword: 'Museum', cursor: 'google-page-2', limit: 10,
  }));
});

test('maps Google Maps reverse geocoding into WGS84 enrichment', async () => {
  const native = client([], {
    formattedAddress: ' Bennelong Point, Sydney NSW 2000, Australia ',
    thoroughfare: ' Bennelong Point ',
    locality: ' Sydney ',
    subLocality: ' Sydney Opera House ',
    administrativeArea: ' NSW ',
    postalCode: ' 2000 ',
    country: ' Australia ',
  });
  const provider = new GooglePlaceProvider(native);
  const coordinate = { latitude: -33.85678, longitude: 151.2153, system: 'wgs84' as const };

  await expect(provider.reverseGeocode({ coordinate })).resolves.toEqual({
    provider: 'google',
    coordinate,
    name: null,
    address: 'Bennelong Point, Sydney NSW 2000, Australia',
    regionLabel: 'Sydney Opera House',
    providerPlaceId: null,
    metadata: {
      thoroughfare: 'Bennelong Point',
      locality: 'Sydney',
      subLocality: 'Sydney Opera House',
      administrativeArea: 'NSW',
      postalCode: '2000',
      country: 'Australia',
    },
  } satisfies ReverseGeocodeResult);
  expect(native.reverseGeocode).toHaveBeenCalledWith({
    latitude: -33.85678,
    longitude: 151.2153,
  });
});

test('returns null when Google Maps has no reverse-geocode result', async () => {
  const coordinate = { latitude: 0, longitude: 0, system: 'wgs84' as const };
  await expect(new GooglePlaceProvider(client([])).reverseGeocode({ coordinate }))
    .resolves.toBeNull();
});

test.each([
  [{ coordinate: { latitude: 39.9, longitude: 116.3, system: 'gcj02' as const } }],
  [{
    coordinate: { latitude: -33.8, longitude: 151.2, system: 'wgs84' as const },
    radiusMeters: 0,
  }],
])('rejects invalid Google reverse-geocode input %# before native code', async (query) => {
  const native = client([]);
  await expect(new GooglePlaceProvider(native).reverseGeocode(query))
    .rejects.toMatchObject({ provider: 'google', code: 'invalid_query' });
  expect(native.reverseGeocode).not.toHaveBeenCalled();
});

test('fails closed for an empty Google reverse-geocode response', async () => {
  const coordinate = { latitude: -33.8, longitude: 151.2, system: 'wgs84' as const };
  await expect(new GooglePlaceProvider(client([], {})).reverseGeocode({ coordinate }))
    .rejects.toMatchObject({ provider: 'google', code: 'invalid_response' });
});
