import { expect, test } from '@jest/globals';
import type { Place } from '@/domain/place/types';
import { regionalTripMapPlaces } from '@/application/projections/regional-trip-places';
const stamp = '2026-10-08T00:00:00Z';
const mainland: Place = { id: 'amap', name: '示例酒店', provider: 'amap', providerPlaceId: 'a',
  coordinate: { latitude: 39.9, longitude: 116.4, system: 'gcj02' }, address: null,
  metadata: null, createdAt: stamp, updatedAt: stamp };
const foreign: Place = { ...mainland, id: 'google', name: '示例庭园', provider: 'google',
  coordinate: { latitude: 35.6851763, longitude: 139.7100517, system: 'wgs84' } };

test('fixed-region map keeps its native names/points and does not alter legacy opposite-region Places', () => {
  const raw = { [mainland.id]: mainland, [foreign.id]: foreign };
  const saved = JSON.stringify(raw);
  expect(regionalTripMapPlaces({ mapRegion: 'china_mainland' }, raw)).toEqual({ amap: mainland });
  expect(regionalTripMapPlaces({ mapRegion: 'global' }, raw)).toEqual({ google: foreign });
  expect(JSON.stringify(raw)).toBe(saved);
});
