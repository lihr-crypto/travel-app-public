import { expect, test } from '@jest/globals';

import { assertCoordinate, assertCoordinateSystem } from '@/domain';

const wgs84 = { latitude: 35.6895, longitude: 139.6917, system: 'wgs84' as const };
const gcj02 = { latitude: 39.9087, longitude: 116.3975, system: 'gcj02' as const };

test('accepts provider-native coordinates with explicit CRS and valid bounds', () => {
  expect(() => assertCoordinate(wgs84)).not.toThrow();
  expect(() => assertCoordinate(gcj02)).not.toThrow();
  expect(() =>
    assertCoordinate({ latitude: -90, longitude: 180, system: 'wgs84' }),
  ).not.toThrow();
});

test.each([
  null,
  { latitude: 0, longitude: 0 },
  { latitude: 0, longitude: 0, system: 'bd09' },
  { latitude: 91, longitude: 0, system: 'wgs84' },
  { latitude: 0, longitude: -181, system: 'gcj02' },
  { latitude: NaN, longitude: 0, system: 'wgs84' },
  { latitude: 0, longitude: Infinity, system: 'gcj02' },
  { latitude: '39.9', longitude: 116.3, system: 'gcj02' },
])('rejects untagged, unsupported or invalid coordinate %#', (value) => {
  expect(() => assertCoordinate(value)).toThrow('Invalid Coordinate');
});

test('requires the native CRS at a provider boundary without conversion', () => {
  expect(() => assertCoordinateSystem(wgs84, 'wgs84')).not.toThrow();
  expect(() => assertCoordinateSystem(gcj02, 'gcj02')).not.toThrow();
  expect(() => assertCoordinateSystem(gcj02, 'wgs84')).toThrow(
    'Coordinate system gcj02 does not match wgs84',
  );
  expect(gcj02).toEqual({ latitude: 39.9087, longitude: 116.3975, system: 'gcj02' });
});
