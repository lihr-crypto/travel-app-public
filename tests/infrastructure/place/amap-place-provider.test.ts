import { expect, jest, test } from '@jest/globals';

import {
  AmapPlaceProvider,
  type AmapSearchNativeClient,
} from '@/infrastructure/place/amap-place-provider';

function client(
  results:
    | Awaited<ReturnType<AmapSearchNativeClient['search']>>
    | Awaited<ReturnType<AmapSearchNativeClient['search']>>['results'],
  reGeocode: Awaited<ReturnType<AmapSearchNativeClient['reverseGeocode']>> = null,
  tips: Awaited<ReturnType<AmapSearchNativeClient['inputTips']>> = [],
): AmapSearchNativeClient {
  return {
    search: jest.fn(async () => Array.isArray(results)
      ? { results, count: results.length, suggestions: [] }
      : results),
    inputTips: jest.fn(async () => tips),
    reverseGeocode: jest.fn(async () => reGeocode),
  };
}

test('maps AMap POIs into provider-neutral GCJ-02 search results in order', async () => {
  const native = client({ results: [
    {
      uid: ' B000SAMP01 ',
      name: ' 颐和园 ',
      address: ' 新建宫门路19号 ',
      latitude: 39.999676,
      longitude: 116.275118,
      province: '北京市',
      city: '北京市',
      district: '海淀区',
      type: '风景名胜',
      typeCode: '110200',
    },
    {
      name: '无供应商 ID 的地点',
      latitude: 39.99,
      longitude: 116.28,
    },
  ], count: 2, suggestions: [] });
  const provider = new AmapPlaceProvider(native);

  await expect(provider.search({
    keyword: ' 颐和园 ',
    center: { latitude: 39.99, longitude: 116.28, system: 'gcj02' },
    region: { countryCode: 'cn', city: ' 北京 ' },
    limit: 30,
  })).resolves.toEqual({ results: [
    {
      name: '颐和园',
      address: '新建宫门路19号',
      coordinate: { latitude: 39.999676, longitude: 116.275118, system: 'gcj02' },
      provider: 'amap',
      providerPlaceId: 'B000SAMP01',
      regionLabel: '海淀区',
      metadata: {
        province: '北京市', city: '北京市', district: '海淀区',
        type: '风景名胜', typeCode: '110200',
      },
    },
  ], nextCursor: null, suggestions: [] });
  expect(native.search).toHaveBeenCalledWith({
    keyword: '颐和园',
    city: '北京',
    center: { latitude: 39.99, longitude: 116.28 },
    limit: 25,
    page: 1,
  });
});

test.each([
  [{ keyword: '   ' }, 'invalid_query'],
  [{ keyword: '颐和园', limit: 0 }, 'invalid_query'],
  [{ keyword: '颐和园', region: { countryCode: 'US' } }, 'invalid_query'],
  [{
    keyword: '颐和园',
    center: { latitude: 39.99, longitude: 116.28, system: 'wgs84' as const },
  }, 'invalid_query'],
])('rejects invalid AMap query %# before invoking native code', async (query, code) => {
  const native = client([]);
  const provider = new AmapPlaceProvider(native);
  await expect(provider.search(query)).rejects.toMatchObject({ code });
  expect(native.search).not.toHaveBeenCalled();
});

test('drops AMap tips without a real POI identity and valid coordinate', async () => {
  const provider = new AmapPlaceProvider(client(
    { results: [], count: 0, suggestions: ['中国传媒大学'] },
    null,
    [
      { uid: 'bus-line', name: '公交线路', latitude: undefined, longitude: undefined },
      { uid: 'bad-poi', name: '坏坐标', latitude: Number.NaN, longitude: 116.28 },
      { name: '品牌词', latitude: undefined, longitude: undefined },
    ],
  ));
  await expect(provider.search({ keyword: '学校' })).resolves.toEqual({
    results: [], nextCursor: null, suggestions: ['中国传媒大学'],
  });
});

test('maps native configuration and provider failures into stable errors', async () => {
  const native: AmapSearchNativeClient = {
    search: jest.fn(async () => {
      throw Object.assign(new Error('native detail'), {
        code: 'ERR_AMAP_NOT_CONFIGURED',
      });
    }),
    inputTips: jest.fn(async () => []),
    reverseGeocode: jest.fn(async () => null),
  };
  const provider = new AmapPlaceProvider(native);

  await expect(provider.search({ keyword: '颐和园' })).rejects.toEqual(
    expect.objectContaining({
      name: 'PlaceProviderError',
      provider: 'amap',
      code: 'not_configured',
    }),
  );
});

test('maps an AMap re-geocode answer into provider-native enrichment', async () => {
  const native = client([], {
    formattedAddress: ' 北京市海淀区新建宫门路19号 ',
    province: '北京市',
    city: '北京市',
    district: '海淀区',
    township: '海淀镇',
    neighborhood: '颐和园',
    building: '佛香阁',
    adcode: '110108',
    poiName: ' 颐和园 ',
    poiUid: ' B000SAMP01 ',
    poiType: '风景名胜',
  });
  const provider = new AmapPlaceProvider(native);

  await expect(provider.reverseGeocode({
    coordinate: { latitude: 39.999676, longitude: 116.275118, system: 'gcj02' },
    radiusMeters: 5000,
  })).resolves.toEqual({
    provider: 'amap',
    coordinate: { latitude: 39.999676, longitude: 116.275118, system: 'gcj02' },
    name: '颐和园',
    address: '北京市海淀区新建宫门路19号',
    regionLabel: '海淀区',
    providerPlaceId: 'B000SAMP01',
    metadata: {
      province: '北京市',
      city: '北京市',
      district: '海淀区',
      township: '海淀镇',
      neighborhood: '颐和园',
      building: '佛香阁',
      adcode: '110108',
      poiType: '风景名胜',
    },
  });
  expect(native.reverseGeocode).toHaveBeenCalledWith({
    latitude: 39.999676,
    longitude: 116.275118,
    radius: 3000,
  });
});

test('a provider answer without an address or place name is an invalid response', async () => {
  const provider = new AmapPlaceProvider(client([], { adcode: '110108' }));

  await expect(provider.reverseGeocode({
    coordinate: { latitude: 39.99, longitude: 116.28, system: 'gcj02' },
  })).rejects.toMatchObject({ provider: 'amap', code: 'invalid_response' });
});

test('an empty provider answer stays null instead of inventing a label', async () => {
  const native = client([], null);
  const provider = new AmapPlaceProvider(native);

  await expect(provider.reverseGeocode({
    coordinate: { latitude: 39.99, longitude: 116.28, system: 'gcj02' },
  })).resolves.toBeNull();
  expect(native.reverseGeocode).toHaveBeenCalledWith({
    latitude: 39.99,
    longitude: 116.28,
    radius: 1000,
  });
});

test.each([
  [{
    coordinate: { latitude: 39.99, longitude: 116.28, system: 'wgs84' as const },
  }],
  [{
    coordinate: { latitude: 39.99, longitude: 116.28, system: 'gcj02' as const },
    radiusMeters: 0,
  }],
])('rejects an invalid AMap reverse-geocode query %# before native code', async (query) => {
  const native = client([]);
  const provider = new AmapPlaceProvider(native);

  await expect(provider.reverseGeocode(query)).rejects.toMatchObject({
    provider: 'amap',
    code: 'invalid_query',
  });
  expect(native.reverseGeocode).not.toHaveBeenCalled();
});

test('maps a failing AMap re-geocode call into a stable error', async () => {
  const native: AmapSearchNativeClient = {
    search: jest.fn(async () => ({ results: [], count: 0, suggestions: [] })),
    inputTips: jest.fn(async () => []),
    reverseGeocode: jest.fn(async () => {
      throw Object.assign(new Error('native detail'), {
        code: 'ERR_AMAP_INVALID_QUERY',
      });
    }),
  };
  const provider = new AmapPlaceProvider(native);

  await expect(provider.reverseGeocode({
    coordinate: { latitude: 39.99, longitude: 116.28, system: 'gcj02' },
  })).rejects.toMatchObject({ provider: 'amap', code: 'invalid_query' });
});

test('uses Input Tips on the first page and carries the same query into AMap paging', async () => {
  const first = {
    uid: 'tip-id', name: '中国传媒大学', latitude: 39.91, longitude: 116.56,
  };
  const second = {
    uid: 'page-id', name: '中国传媒大学北门', latitude: 39.92, longitude: 116.57,
  };
  const native = client(
    { results: [second], count: 10, suggestions: [] },
    null,
    [first],
  );
  const provider = new AmapPlaceProvider(native);
  const initial = await provider.search({ keyword: '中国传媒大学', limit: 10 });
  expect(initial.results.map(({ providerPlaceId }) => providerPlaceId))
    .toEqual(['tip-id', 'page-id']);
  expect(initial.nextCursor).toMatch(/^amap:2:/);
  expect(native.inputTips).toHaveBeenCalledWith(expect.objectContaining({
    keyword: '中国传媒大学', page: 1, limit: 10,
  }));

  (native.search as jest.MockedFunction<AmapSearchNativeClient['search']>).mockResolvedValueOnce({
    results: [{ ...second, uid: 'page-2-id', name: '中国传媒大学东门' }],
    count: 1,
    suggestions: [],
  });
  const next = await provider.search({
    keyword: '中国传媒大学', limit: 10, cursor: initial.nextCursor!,
  });
  expect(native.search).toHaveBeenLastCalledWith(expect.objectContaining({
    keyword: '中国传媒大学', page: 2, limit: 10,
  }));
  expect(native.inputTips).toHaveBeenCalledTimes(1);
  expect(next.results[0].providerPlaceId).toBe('page-2-id');
  expect(next.nextCursor).toBeNull();

  await expect(provider.search({
    keyword: '天安门', limit: 10, cursor: initial.nextCursor!,
  })).rejects.toMatchObject({ provider: 'amap', code: 'invalid_query' });
  expect(native.search).toHaveBeenCalledTimes(2);
});
