import { expect, jest, test } from '@jest/globals';

import { AmapPlaceProvider } from '@/infrastructure/place/amap-place-provider';
import { GooglePlaceProvider } from '@/infrastructure/place/google-place-provider';

test('both native adapters map mocked search results to the same neutral contract', async () => {
  const amap = new AmapPlaceProvider({
    search: jest.fn(async () => ({ results: [{
      uid: 'amap-id', name: '颐和园', address: '新建宫门路19号',
      latitude: 39.999676, longitude: 116.275118,
    }], count: 1, suggestions: [] })),
    inputTips: jest.fn(async () => []),
    reverseGeocode: jest.fn(async () => null),
  });
  const google = new GooglePlaceProvider({
    search: jest.fn(async () => ({ results: [{
      placeId: 'google-id', name: 'Sydney Opera House',
      address: 'Bennelong Point', latitude: -33.856784, longitude: 151.215297,
      types: ['tourist_attraction'],
    }], nextCursor: null, suggestions: [] })),
    reverseGeocode: jest.fn(async () => null),
  });

  const [{ results: amapResults }, { results: googleResults }] = await Promise.all([
    amap.search({ keyword: '颐和园' }), google.search({ keyword: 'Opera House' }),
  ]);
  const [amapResult] = amapResults;
  const [googleResult] = googleResults;

  expect(amapResult).toMatchObject({
    provider: 'amap', providerPlaceId: 'amap-id',
    coordinate: { system: 'gcj02' },
  });
  expect(googleResult).toMatchObject({
    provider: 'google', providerPlaceId: 'google-id',
    coordinate: { system: 'wgs84' },
  });
  for (const result of [amapResult, googleResult]) {
    expect(result).toEqual(expect.objectContaining({
      name: expect.any(String),
      address: expect.any(String),
      coordinate: expect.objectContaining({
        latitude: expect.any(Number), longitude: expect.any(Number),
      }),
    }));
  }
});

test('both mocked native reverse-geocoders preserve provider and native CRS', async () => {
  const amap = new AmapPlaceProvider({
    search: jest.fn(async () => ({ results: [], count: 0, suggestions: [] })),
    inputTips: jest.fn(async () => []),
    reverseGeocode: jest.fn(async () => ({
      formattedAddress: '北京市海淀区新建宫门路19号', poiName: '颐和园',
    })),
  });
  const google = new GooglePlaceProvider({
    search: jest.fn(async () => ({ results: [], nextCursor: null, suggestions: [] })),
    reverseGeocode: jest.fn(async () => ({
      formattedAddress: 'Bennelong Point, Sydney NSW 2000', locality: 'Sydney',
    })),
  });

  await expect(amap.reverseGeocode!({
    coordinate: { latitude: 39.999676, longitude: 116.275118, system: 'gcj02' },
  })).resolves.toMatchObject({ provider: 'amap', coordinate: { system: 'gcj02' } });
  await expect(google.reverseGeocode!({
    coordinate: { latitude: -33.856784, longitude: 151.215297, system: 'wgs84' },
  })).resolves.toMatchObject({ provider: 'google', coordinate: { system: 'wgs84' } });
});
