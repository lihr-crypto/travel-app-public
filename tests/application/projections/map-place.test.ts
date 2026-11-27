import { expect, test } from '@jest/globals';

import type { Coordinate } from '@/domain/common/types';
import type { Place } from '@/domain/place/types';
import {
  getMapPlaceCoordinate,
  getMapPlaceName,
  projectAmapPlaceForMap,
  projectSavedWgs84PlaceForMap,
} from '@/application/projections/map-place';

const timestamp = '2026-10-08T00:00:00.000Z';
const amapCoordinate: Coordinate = {
  latitude: 35.779996,
  longitude: 112.63472,
  system: 'gcj02',
};
const appleCoordinate: Coordinate = {
  latitude: 35.7801,
  longitude: 112.635,
  system: 'wgs84',
};

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: 'place-amap',
    name: '  示例路64号  ',
    coordinate: amapCoordinate,
    address: '示例路64号',
    provider: 'amap',
    providerPlaceId: 'amap-id',
    metadata: { district: '示例省示例市示例区' },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

test('projects a separate WGS84 map coordinate and preserves the canonical AMap Place', () => {
  const source = place();
  const projected = projectAmapPlaceForMap(source, appleCoordinate);

  expect(projected).toEqual({ ...source, displayCoordinate: appleCoordinate });
  expect(projected.id).toBe(source.id);
  expect(projected.provider).toBe('amap');
  expect(projected.coordinate).toBe(amapCoordinate);
  expect(source).toEqual(place());
  expect(source.coordinate).toEqual(amapCoordinate);
  expect(source).not.toHaveProperty('displayCoordinate');
});

test('uses the display coordinate for the map and raw AMap coordinates when no projection exists', () => {
  const source = place();
  const projected = projectAmapPlaceForMap(source, appleCoordinate);

  expect(getMapPlaceCoordinate(projected)).toEqual(appleCoordinate);
  expect(getMapPlaceCoordinate(source)).toEqual(amapCoordinate);
});

test('preserves the original AMap name and trims only the map-facing label', () => {
  const source = place();
  const projected = projectAmapPlaceForMap(source, appleCoordinate);

  expect(getMapPlaceName(source)).toBe('示例路64号');
  expect(getMapPlaceName(projected)).toBe('示例路64号');
  expect(source.name).toBe('  示例路64号  ');
});

test('an Apple snapshot can override its displayed name without changing the snapshot', () => {
  const applePlace = place({
    id: 'apple-place',
    name: 'Sample Apple Search Name',
    coordinate: appleCoordinate,
    provider: 'apple',
    providerPlaceId: 'apple-id',
  });
  const mapPlace = { ...applePlace, displayName: '  示例路64号  ' };

  expect(getMapPlaceName(mapPlace)).toBe('示例路64号');
  expect(applePlace.name).toBe('Sample Apple Search Name');
  expect(getMapPlaceCoordinate(applePlace)).toEqual(appleCoordinate);
});

test('rejects non-AMap sources and invalid source or display coordinate systems', () => {
  expect(() => projectAmapPlaceForMap(place({ provider: 'google' }), appleCoordinate))
    .toThrow('Only an AMap Place can receive a display coordinate');
  expect(() => projectAmapPlaceForMap(
    place({ coordinate: { ...amapCoordinate, system: 'wgs84' } }),
    appleCoordinate,
  )).toThrow(/does not match gcj02/);
  expect(() => projectAmapPlaceForMap(
    place(),
    { ...appleCoordinate, system: 'gcj02' },
  )).toThrow(/does not match wgs84/);
  expect(() => getMapPlaceCoordinate({
    ...place(),
    provider: 'google',
    coordinate: appleCoordinate,
    displayCoordinate: appleCoordinate,
  })).toThrow('A display coordinate can only project an AMap Place');
});

test('keeps a saved Google Sample Garden Place and its WGS84 coordinate unchanged', () => {
  const source = place({
    id: 'google-sample-garden',
    name: '示例庭园',
    address: '東京都示例区区内藤町11',
    coordinate: { latitude: 35.6852, longitude: 139.7100, system: 'wgs84' },
    provider: 'google',
    providerPlaceId: 'google-sample-id',
  });

  const projected = projectSavedWgs84PlaceForMap(source);

  expect(projected).toBe(source);
  expect(projected).toEqual(source);
  expect(getMapPlaceCoordinate(projected)).toBe(source.coordinate);
  expect(getMapPlaceName(projected)).toBe('示例庭园');
  expect(projected).not.toHaveProperty('displayCoordinate');
  expect(projected).not.toHaveProperty('displayName');
});

test('keeps a saved Google English name such as Shinagawa Station verbatim', () => {
  const source = place({
    id: 'google-shinagawa',
    name: 'Shinagawa Station',
    coordinate: { latitude: 35.6285, longitude: 139.7387, system: 'wgs84' },
    provider: 'google',
    providerPlaceId: 'google-shinagawa-id',
  });

  const projected = projectSavedWgs84PlaceForMap(source);

  expect(projected).toBe(source);
  expect(projected.name).toBe('Shinagawa Station');
  expect(projected.provider).toBe('google');
});

test('does not substitute a same-name Apple building for the saved Google Place', () => {
  const saved = place({
    id: 'saved-google-place',
    name: '示例庭园',
    coordinate: { latitude: 35.6852, longitude: 139.7100, system: 'wgs84' },
    provider: 'google',
    providerPlaceId: 'google-sample-id',
  });
  const sameNameAppleBuilding = place({
    id: 'apple-same-name-building',
    name: '示例庭园',
    coordinate: { latitude: 35.6854, longitude: 139.7102, system: 'wgs84' },
    provider: 'apple',
    providerPlaceId: 'apple-building-id',
  });

  const projected = projectSavedWgs84PlaceForMap(saved);

  expect(projected).toBe(saved);
  expect(projected.id).toBe('saved-google-place');
  expect(projected.providerPlaceId).toBe('google-sample-id');
  expect(projected.id).not.toBe(sameNameAppleBuilding.id);
  expect(projected.coordinate).toBe(saved.coordinate);
});

test('rejects AMap and non-WGS84 data from the saved WGS84 projection', () => {
  expect(() => projectSavedWgs84PlaceForMap(place())).toThrow(
    'Only a saved Google or Apple Place can use this map projection',
  );
  expect(() => projectSavedWgs84PlaceForMap(place({
    provider: 'google',
    coordinate: amapCoordinate,
  }))).toThrow(/does not match wgs84/);
  expect(() => projectSavedWgs84PlaceForMap(place({
    provider: 'apple',
    coordinate: amapCoordinate,
  }))).toThrow(/does not match wgs84/);
  expect(() => projectSavedWgs84PlaceForMap(place({
    provider: 'unknown',
    coordinate: appleCoordinate,
  }))).toThrow('Only a saved Google or Apple Place can use this map projection');
});
