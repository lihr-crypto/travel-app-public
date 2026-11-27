import { expect, jest, test } from '@jest/globals';

import {
  ApplePlaceProvider,
  type ApplePlacesNativeClient,
} from '@/infrastructure/place/apple-place-provider';
import type {
  NativeApplePlaceResult,
  NativeAppleReverseGeocodeResult,
} from '../../../modules/expo-apple-places/src/ExpoApplePlacesModule';

function nativeClient(
  results: NativeApplePlaceResult[] = [],
  reverse: NativeAppleReverseGeocodeResult | null = null,
): ApplePlacesNativeClient {
  return {
    search: jest.fn(async () => ({ results, nextCursor: null, suggestions: [] })),
    reverseGeocode: jest.fn(async () => reverse),
  };
}

test('maps Apple MapKit results into provider-neutral WGS84 places without changing coordinates', async () => {
  const native = nativeClient([{
    providerPlaceId: '  apple-map-id  ',
    name: '  京都鉄道博物館 ',
    address: ' 京都市下京区観喜寺町 ',
    latitude: 34.9875,
    longitude: 135.7463,
    regionLabel: ' 京都市 ',
    types: ['museum'],
    countryCode: 'JP',
  }]);
  const provider = new ApplePlaceProvider(native);

  await expect(provider.search({
    keyword: ' 铁道博物馆 ',
    center: { latitude: 34.9, longitude: 135.7, system: 'wgs84' },
    region: { city: ' 京都 ' },
    limit: 40,
  })).resolves.toEqual({
    results: [{
      name: '京都鉄道博物館',
      address: '京都市下京区観喜寺町',
      coordinate: { latitude: 34.9875, longitude: 135.7463, system: 'wgs84' },
      provider: 'apple',
      providerPlaceId: 'apple-map-id',
      regionLabel: '京都市',
      metadata: { types: ['museum'], countryCode: 'JP' },
    }],
    nextCursor: null,
    suggestions: [],
  });
  expect(native.search).toHaveBeenCalledWith({
    keyword: '铁道博物馆, 京都',
    center: { latitude: 34.9, longitude: 135.7 },
    limit: 25,
  });
});

test('leaves an uncentered global query unbounded and keeps explicit airport terms intact', async () => {
  const native = nativeClient([]);
  const provider = new ApplePlaceProvider(native);

  await expect(provider.search({ keyword: '  Narita International Airport  ' })).resolves.toEqual({
    results: [],
    nextCursor: null,
    suggestions: [],
  });
  expect(native.search).toHaveBeenCalledWith({
    keyword: 'Narita International Airport',
    center: undefined,
    limit: 10,
  });
});

test('rejects Apple cursors because MapKit does not provide pagination', async () => {
  const native = nativeClient([]);
  const provider = new ApplePlaceProvider(native);

  await expect(provider.search({ keyword: 'museum', cursor: 'apple:page-2' }))
    .rejects.toMatchObject({ provider: 'apple', code: 'invalid_query' });
  expect(native.search).not.toHaveBeenCalled();
});

test('rejects a GCJ-02 center before calling native MapKit', async () => {
  const native = nativeClient([]);
  const provider = new ApplePlaceProvider(native);

  await expect(provider.search({
    keyword: 'museum',
    center: { latitude: 39.9, longitude: 116.4, system: 'gcj02' },
  })).rejects.toMatchObject({ provider: 'apple', code: 'invalid_query' });
  expect(native.search).not.toHaveBeenCalled();
});

test('drops native results with invalid coordinates or empty names', async () => {
  const native = nativeClient([
    {
      providerPlaceId: null,
      name: '坏坐标',
      address: null,
      latitude: Number.NaN,
      longitude: 135.7,
      regionLabel: null,
    },
    {
      providerPlaceId: null,
      name: '  ',
      address: 'address only',
      latitude: 34.9,
      longitude: 135.7,
      regionLabel: null,
    },
  ]);
  const provider = new ApplePlaceProvider(native);
  await expect(provider.search({ keyword: 'museum' })).resolves.toMatchObject({ results: [] });
});

test('maps Apple reverse geocoding while echoing the picked WGS84 coordinate exactly', async () => {
  const native = nativeClient([], {
    providerPlaceId: 'apple-map-id',
    name: '  京都駅 ',
    formattedAddress: ' 京都府京都市下京区東塩小路町 ',
    regionLabel: ' 日本 ',
    countryCode: 'JP',
  });
  const provider = new ApplePlaceProvider(native);
  const coordinate = { latitude: 34.9858, longitude: 135.7588, system: 'wgs84' as const };

  await expect(provider.reverseGeocode({ coordinate })).resolves.toEqual({
    provider: 'apple',
    coordinate,
    name: '京都駅',
    address: '京都府京都市下京区東塩小路町',
    regionLabel: '日本',
    providerPlaceId: 'apple-map-id',
    metadata: { countryCode: 'JP' },
  });
  expect(native.reverseGeocode).toHaveBeenCalledWith({
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  });
});

test('an Apple reverse-geocode miss remains null', async () => {
  const native = nativeClient([], null);
  const provider = new ApplePlaceProvider(native);

  await expect(provider.reverseGeocode({
    coordinate: { latitude: 34.9858, longitude: 135.7588, system: 'wgs84' },
  })).resolves.toBeNull();
});

test('rejects reverse-geocode coordinates from a different coordinate system', async () => {
  const native = nativeClient([]);
  const provider = new ApplePlaceProvider(native);

  await expect(provider.reverseGeocode({
    coordinate: { latitude: 39.9, longitude: 116.4, system: 'gcj02' },
  })).rejects.toMatchObject({ provider: 'apple', code: 'invalid_query' });
  expect(native.reverseGeocode).not.toHaveBeenCalled();
});

test('maps native Apple query errors to the shared provider error contract', async () => {
  const native: ApplePlacesNativeClient = {
    search: jest.fn(async () => {
      throw Object.assign(new Error('invalid native request'), {
        code: 'ERR_APPLE_PLACES_INVALID_QUERY',
      });
    }),
    reverseGeocode: jest.fn(async () => null),
  };
  const provider = new ApplePlaceProvider(native);

  await expect(provider.search({ keyword: 'museum' })).rejects.toMatchObject({
    name: 'PlaceProviderError',
    provider: 'apple',
    code: 'invalid_query',
  });
});

test('preserves a typed MapKit throttle rather than treating it as an empty search', async () => {
  const native = nativeClient();
  native.search = jest.fn(async () => {
    throw Object.assign(new Error('MapKit throttled'), { code: 'ERR_APPLE_PLACES_THROTTLED' });
  });
  await expect(new ApplePlaceProvider(native).search({ keyword: '示例历史文化街区' }))
    .rejects.toMatchObject({ provider: 'apple', code: 'rate_limited' });
});

test('keeps an address alternative already containing its region without duplicating the city', async () => {
  const native = nativeClient();
  await new ApplePlaceProvider(native).search({ keyword: '示例省示例市示例区 示例路64号',
    region: { city: '示例省示例市示例区' } });
  expect(native.search).toHaveBeenCalledWith({ keyword: '示例省示例市示例区 示例路64号',
    limit: 10, center: undefined });
});
