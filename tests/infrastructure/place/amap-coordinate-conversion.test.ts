import { beforeEach, expect, jest, test } from '@jest/globals';
import type { Coordinate } from '@/domain/common/types';

import { convertAmapCoordinatesToWgs84 } from '../../../modules/expo-amap-search/src/ExpoAmapSearchModule';

jest.mock('expo', () => ({ requireNativeModule: jest.fn() }));

type NativeCoordinate = { latitude: number; longitude: number };
const convertNative = jest.fn<(coordinates: NativeCoordinate[]) => Promise<NativeCoordinate[]>>();
const expo = jest.requireMock('expo') as {
  requireNativeModule: jest.Mock<(moduleName: string) => unknown>;
};
const native = { convertCoordinatesToWgs84Async: convertNative };

beforeEach(() => {
  convertNative.mockReset().mockResolvedValue([]);
  expo.requireNativeModule.mockReset().mockReturnValue(native);
});

test('converts a batch in order and tags only the returned display coordinates as WGS84', async () => {
  const original: Coordinate[] = [
    { latitude: 35.76, longitude: 112.64, system: 'gcj02' },
    { latitude: 39.99, longitude: 116.28, system: 'gcj02' },
  ];
  const originalSnapshot = JSON.stringify(original);
  convertNative.mockResolvedValue([
    { latitude: 35.757, longitude: 112.634 },
    { latitude: 39.987, longitude: 116.274 },
  ]);

  await expect(convertAmapCoordinatesToWgs84(original)).resolves.toEqual([
    { latitude: 35.757, longitude: 112.634, system: 'wgs84' },
    { latitude: 39.987, longitude: 116.274, system: 'wgs84' },
  ]);
  expect(expo.requireNativeModule).toHaveBeenCalledWith('ExpoAmapSearch');
  expect(convertNative).toHaveBeenCalledWith([
    { latitude: 35.76, longitude: 112.64 },
    { latitude: 39.99, longitude: 116.28 },
  ]);
  expect(JSON.stringify(original)).toBe(originalSnapshot);
});

test.each([
  [{ latitude: 39.9, longitude: 116.4, system: 'wgs84' as const }],
  [{ latitude: Number.NaN, longitude: 116.4, system: 'gcj02' as const }],
  [{ latitude: 91, longitude: 116.4, system: 'gcj02' as const }],
  [{ latitude: 39.9, longitude: 181, system: 'gcj02' as const }],
])('rejects invalid or non-GCJ-02 inputs before crossing the native boundary', async (coordinate) => {
  await expect(convertAmapCoordinatesToWgs84([coordinate]))
    .rejects.toThrow('finite, valid GCJ-02');
  expect(expo.requireNativeModule).not.toHaveBeenCalled();
  expect(convertNative).not.toHaveBeenCalled();
});

test('rejects a native result whose count does not match the input batch', async () => {
  convertNative.mockResolvedValue([{ latitude: 39.9, longitude: 116.3 }]);
  await expect(convertAmapCoordinatesToWgs84([
    { latitude: 39.9, longitude: 116.4, system: 'gcj02' },
    { latitude: 40, longitude: 116.5, system: 'gcj02' },
  ])).rejects.toThrow('mismatched result count');
});

test('rejects invalid native coordinates instead of tagging them WGS84', async () => {
  convertNative.mockResolvedValue([
    { latitude: Number.NaN, longitude: 116.3 },
  ]);
  await expect(convertAmapCoordinatesToWgs84([
    { latitude: 39.9, longitude: 116.4, system: 'gcj02' },
  ])).rejects.toThrow('invalid display coordinate at index 0');
});

test('returns an empty batch without touching the native module', async () => {
  await expect(convertAmapCoordinatesToWgs84([])).resolves.toEqual([]);
  expect(expo.requireNativeModule).not.toHaveBeenCalled();
});
