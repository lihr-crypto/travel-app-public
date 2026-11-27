import { expect, test } from '@jest/globals';

import { chooseLegacyAppleMatch } from '@/application/place/legacy-apple-match';
import type { Place } from '@/domain/place/types';
import type { PlaceSearchResult } from '@/infrastructure/place/place-provider';

const timestamp = '2026-10-08T00:00:00.000Z';
const beijingGcj = { latitude: 40.08, longitude: 116.584, system: 'gcj02' as const };
const beijingApple = { latitude: 40.082, longitude: 116.585, system: 'wgs84' as const };

function source(overrides: Partial<Place> = {}): Place {
  return {
    id: 'legacy-place',
    name: '北京首都国际机场',
    coordinate: beijingGcj,
    address: null,
    provider: 'amap',
    providerPlaceId: 'legacy-provider-id',
    metadata: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function appleResult(overrides: Partial<PlaceSearchResult> = {}): PlaceSearchResult {
  return {
    name: '北京首都机场',
    address: '北京',
    coordinate: beijingApple,
    provider: 'apple',
    providerPlaceId: 'apple-place-1',
    regionLabel: '北京',
    metadata: null,
    ...overrides,
  };
}

test('matches a nearby Apple WGS84 result to a legacy Beijing GCJ-02 Place without changing either', () => {
  const coordinate = { ...beijingApple };
  const candidate = appleResult({ coordinate });
  const legacy = source({ coordinate: beijingGcj });

  expect(chooseLegacyAppleMatch(legacy, [candidate])).toBe(candidate);
  expect(legacy.coordinate).toBe(beijingGcj);
  expect(candidate.coordinate).toBe(coordinate);
  expect(candidate.coordinate).toEqual({
    latitude: 40.082,
    longitude: 116.585,
    system: 'wgs84',
  });
});

test('normalizes multilingual airport suffixes while retaining useful Narita text', () => {
  const legacy = source({
    name: '成田國．際 空港',
    coordinate: { latitude: 35.772, longitude: 140.392, system: 'wgs84' },
  });
  const candidate = appleResult({
    name: '成田国际机场',
    coordinate: { latitude: 35.773, longitude: 140.393, system: 'wgs84' },
  });
  expect(chooseLegacyAppleMatch(legacy, [candidate])).toBe(candidate);

  const englishSource = source({
    name: 'Ｎａｒｉｔａ　International Airport',
    coordinate: { latitude: 35.772, longitude: 140.392, system: 'wgs84' },
  });
  const englishCandidate = appleResult({
    name: 'Narita Airport',
    coordinate: { latitude: 35.773, longitude: 140.393, system: 'wgs84' },
  });
  expect(chooseLegacyAppleMatch(englishSource, [englishCandidate])).toBe(englishCandidate);
});

test('requires exact normalized names and never chooses a nearby different-name result', () => {
  const legacy = source({ name: '东京站' });
  const nearbyButDifferent = appleResult({
    name: '东京站西口',
    coordinate: { ...beijingApple, latitude: beijingGcj.latitude, longitude: beijingGcj.longitude },
  });
  expect(chooseLegacyAppleMatch(legacy, [nearbyButDifferent])).toBeNull();
});

test('ignores exact-name results outside the 2 km candidate radius', () => {
  const legacy = source({
    name: 'Narita International Airport',
    coordinate: { latitude: 0, longitude: 0, system: 'gcj02' },
  });
  const farResult = appleResult({
    name: 'Narita Airport',
    coordinate: { latitude: 0, longitude: 0.0181, system: 'wgs84' },
  });
  const nearResult = appleResult({
    name: 'Narita Airport',
    coordinate: { latitude: 0, longitude: 0.0179, system: 'wgs84' },
  });

  expect(chooseLegacyAppleMatch(legacy, [farResult])).toBeNull();
  expect(chooseLegacyAppleMatch(legacy, [farResult, nearResult])).toBe(nearResult);
});

test('deduplicates repeated provider IDs and repeated name-coordinate identities', () => {
  const first = appleResult();
  const duplicateProviderId = appleResult({
    coordinate: { latitude: 40.081, longitude: 116.5845, system: 'wgs84' },
  });
  expect(chooseLegacyAppleMatch(source(), [first, duplicateProviderId])).toBe(first);

  const duplicateNameCoordinate = appleResult({ providerPlaceId: 'different-id' });
  expect(chooseLegacyAppleMatch(source(), [first, duplicateNameCoordinate])).toBe(first);

  const bridgeByProviderId = appleResult({
    coordinate: { latitude: 40.081, longitude: 116.5845, system: 'wgs84' },
  });
  const bridgeByCoordinate = appleResult({
    providerPlaceId: 'third-id',
    coordinate: bridgeByProviderId.coordinate,
  });
  expect(chooseLegacyAppleMatch(source(), [
    first,
    bridgeByProviderId,
    bridgeByCoordinate,
  ])).toBe(first);
});

test('returns null when multiple distinct nearby branches have the same normalized name', () => {
  const branchOne = appleResult({ providerPlaceId: 'branch-1' });
  const branchTwo = appleResult({
    providerPlaceId: 'branch-2',
    coordinate: { latitude: 40.084, longitude: 116.587, system: 'wgs84' },
  });
  expect(chooseLegacyAppleMatch(source(), [branchOne, branchTwo])).toBeNull();
});

test('accepts only Apple results with valid WGS84 coordinates', () => {
  const wrongProvider = appleResult({ provider: 'google' });
  const foreignCrs = appleResult({
    coordinate: { ...beijingApple, system: 'gcj02' },
  });
  const invalidCoordinate = appleResult({
    coordinate: { latitude: 91, longitude: 116.5, system: 'wgs84' },
  });
  const missingSystem = appleResult({
    coordinate: { latitude: 40.082, longitude: 116.585 } as never,
  });

  expect(chooseLegacyAppleMatch(source(), [
    wrongProvider,
    foreignCrs,
    invalidCoordinate,
    missingSystem,
  ])).toBeNull();
  expect(chooseLegacyAppleMatch(source({
    coordinate: { latitude: 91, longitude: 116.5, system: 'gcj02' },
  }), [appleResult()])).toBeNull();
});

test('requires meaningful name evidence and does not bind a coordinate-only original', () => {
  const coordinateOnly = source({ name: '40.0800, 116.5840' });
  const sameCoordinateDifferentName = appleResult({
    name: '北京首都机场',
    coordinate: { latitude: beijingGcj.latitude, longitude: beijingGcj.longitude, system: 'wgs84' },
  });
  expect(chooseLegacyAppleMatch(coordinateOnly, [sameCoordinateDifferentName])).toBeNull();

  const genericOriginal = source({ name: 'International Airport' });
  const genericCandidate = appleResult({ name: 'Airport' });
  expect(chooseLegacyAppleMatch(genericOriginal, [genericCandidate])).toBeNull();

  const terminalOnlyOriginal = source({ name: 'International Airport Terminal 1' });
  expect(chooseLegacyAppleMatch(terminalOnlyOriginal, [
    appleResult({ name: 'Terminal 1' }),
  ])).toBeNull();

  const coordinateLabel = '40.0800, 116.5840';
  expect(chooseLegacyAppleMatch(source({ name: coordinateLabel }), [
    appleResult({ name: coordinateLabel }),
  ])).toBeNull();
});
