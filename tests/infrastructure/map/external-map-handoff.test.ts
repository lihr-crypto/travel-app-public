import { expect, jest, test } from '@jest/globals';
import { Linking } from 'react-native';

import type { Place } from '@/domain/place/types';
import {
  buildAmapAppUrl,
  buildExternalMapUrl,
  openPlaceInExternalMap,
  resolveExternalMapTarget,
} from '@/infrastructure/map/external-map-handoff';

const timestamp = '2026-09-14T00:00:00.000Z';

const mainlandPlace: Place = {
  id: 'place-mainland',
  name: '天安门 广场',
  coordinate: { latitude: 39.908722, longitude: 116.397499, system: 'gcj02' },
  address: null,
  provider: 'amap',
  providerPlaceId: 'B000A83M61',
  metadata: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const globalPlace: Place = {
  id: 'place-global',
  name: 'Sydney Opera House',
  coordinate: { latitude: -33.856784, longitude: 151.215297, system: 'wgs84' },
  address: null,
  provider: 'google',
  providerPlaceId: 'ChIJ3S-JXmauEmsRUcIaWtf4MzE',
  metadata: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

test('an Apple Place opens Apple Maps even in a legacy mainland Trip', async () => {
  const place = { ...globalPlace, provider: 'apple' };
  const openUrl = jest.fn(async (_url: string) => true);
  const canOpenUrl = jest.fn(async (_url: string) => true);
  const result = await openPlaceInExternalMap({ place, trip: { mapRegion: 'china_mainland' }, openUrl, canOpenUrl });
  expect(result).toEqual({ app: 'apple', url: 'https://maps.apple.com/?ll=-33.856784,151.215297&q=Sydney%20Opera%20House' });
  expect(openUrl).toHaveBeenCalledWith(result.url);
  expect(canOpenUrl).not.toHaveBeenCalled();
  expect(() => resolveExternalMapTarget({ mapRegion: 'global' }, mainlandPlace.coordinate, 'apple')).toThrow('does not match wgs84');
});

test('a mainland Trip hands the Place to AMap and keeps GCJ-02 provider-native', () => {
  const target = resolveExternalMapTarget({ mapRegion: 'china_mainland' });
  expect(target).toEqual({ app: 'amap', coordinateSystem: 'gcj02' });

  const url = buildExternalMapUrl(mainlandPlace, target);
  expect(url.startsWith('https://uri.amap.com/marker?')).toBe(true);
  expect(url).toContain('position=116.397499,39.908722');
  expect(url).toContain('coordinate=gaode');
  expect(url).toContain('callnative=1');
  expect(url).toContain(`name=${encodeURIComponent(mainlandPlace.name)}`);
});

test('builds AMap’s native iOS URI with the saved GCJ-02 coordinate', () => {
  const target = resolveExternalMapTarget({ mapRegion: 'china_mainland' });
  expect(buildAmapAppUrl(mainlandPlace, target)).toBe(
    'iosamap://viewMap?sourceApplication=travel-app'
      + '&poiname=%E5%A4%A9%E5%AE%89%E9%97%A8%20%E5%B9%BF%E5%9C%BA'
      + '&lat=39.908722&lon=116.397499&dev=0',
  );
});

test('a global Trip hands the Place to Google Maps as latitude,longitude', () => {
  const target = resolveExternalMapTarget({ mapRegion: 'global' });
  expect(target).toEqual({ app: 'google', coordinateSystem: 'wgs84' });
  expect(buildExternalMapUrl(globalPlace, target)).toBe(
    'https://www.google.com/maps/search/?api=1&query=-33.856784%2C151.215297',
  );
});

test('a Place from the other provider fails closed instead of being converted', () => {
  const mainland = resolveExternalMapTarget({ mapRegion: 'china_mainland' });
  const global = resolveExternalMapTarget({ mapRegion: 'global' });

  expect(() => buildExternalMapUrl(globalPlace, mainland))
    .toThrow('Coordinate system wgs84 does not match gcj02');
  expect(() => buildExternalMapUrl(mainlandPlace, global))
    .toThrow('Coordinate system gcj02 does not match wgs84');
});

test('an invalid persisted mapRegion is rejected before any URL exists', () => {
  expect(() => resolveExternalMapTarget({ mapRegion: 'europe' as never }))
    .toThrow('Invalid persisted Trip mapRegion: europe');
});

test('the handoff awaits the injected opener and reports the provider it used', async () => {
  const openUrl = jest.fn(async (_url: string) => true);
  const handoff = await openPlaceInExternalMap({
    place: globalPlace,
    trip: { mapRegion: 'global' },
    openUrl,
  });

  expect(openUrl).toHaveBeenCalledWith(
    'https://www.google.com/maps/search/?api=1&query=-33.856784%2C151.215297',
  );
  expect(handoff.app).toBe('google');
  expect(handoff.url).toBe(openUrl.mock.calls[0][0]);
});

test('the default opener goes through the platform URL handler', async () => {
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const canOpenUrl = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
  await openPlaceInExternalMap({
    place: mainlandPlace,
    trip: { mapRegion: 'china_mainland' },
  });

  expect(openUrl).toHaveBeenCalledTimes(1);
  expect(String(openUrl.mock.calls[0][0])).toContain('uri.amap.com/marker');
  canOpenUrl.mockRestore();
  openUrl.mockRestore();
});

test('opens the installed AMap app first and returns the native URI', async () => {
  const canOpenUrl = jest.fn(async () => true);
  const openUrl = jest.fn(async () => true);
  const handoff = await openPlaceInExternalMap({
    place: mainlandPlace,
    trip: { mapRegion: 'china_mainland' },
    canOpenUrl,
    openUrl,
  });

  expect(canOpenUrl).toHaveBeenCalledWith(expect.stringMatching(/^iosamap:\/\//));
  expect(openUrl).toHaveBeenCalledWith(expect.stringMatching(/^iosamap:\/\/viewMap/));
  expect(handoff.url).toMatch(/^iosamap:\/\/viewMap/);
});

test('falls back to the AMap web marker when the app is unavailable', async () => {
  const canOpenUrl = jest.fn(async () => false);
  const openUrl = jest.fn(async () => true);
  const handoff = await openPlaceInExternalMap({
    place: mainlandPlace,
    trip: { mapRegion: 'china_mainland' },
    canOpenUrl,
    openUrl,
  });

  expect(openUrl).toHaveBeenCalledTimes(1);
  expect(openUrl).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/uri\.amap\.com/));
  expect(handoff.url).toMatch(/^https:\/\/uri\.amap\.com/);
});

test('falls back to the AMap web marker if opening the app URI fails', async () => {
  const canOpenUrl = jest.fn(async () => true);
  const openUrl = jest.fn<(url: string) => Promise<unknown>>()
    .mockImplementationOnce(async () => { throw new Error('AMap URI rejected'); })
    .mockImplementationOnce(async () => true);

  const handoff = await openPlaceInExternalMap({
    place: mainlandPlace,
    trip: { mapRegion: 'china_mainland' },
    canOpenUrl,
    openUrl,
  });

  expect(openUrl).toHaveBeenCalledTimes(2);
  expect(handoff.url).toMatch(/^https:\/\/uri\.amap\.com/);
});

test('a rejected opener propagates so the caller can surface the failure', async () => {
  const openUrl = jest.fn(async (_url: string) => {
    throw new Error('无法打开高德地图');
  });

  await expect(openPlaceInExternalMap({
    place: mainlandPlace,
    trip: { mapRegion: 'china_mainland' },
    openUrl,
  })).rejects.toThrow('无法打开高德地图');
});
