import { expect, test } from '@jest/globals';

import { focusCenterWithinPadding } from '@/infrastructure/map/map-camera';

const sydney = { latitude: -33.8683, longitude: 151.2086, system: 'wgs84' as const };
const sheetPadding = { top: 0, right: 0, bottom: 400, left: 0 };

test('moves a single-coordinate focus to the centre of the visible map band', () => {
  // 800 pt tall view, 0.08° vertical span, sheet covering the bottom half: the
  // visible band runs from 0 to 400 pt, so its centre sits 200 pt above the
  // geometric centre and the camera has to move 200/800 × 0.08° south.
  const shifted = focusCenterWithinPadding({
    coordinate: sydney,
    latitudeDelta: 0.08,
    padding: sheetPadding,
    viewportHeight: 800,
  });

  expect(shifted.latitude).toBeCloseTo(-33.8883, 10);
  expect(shifted.longitude).toBe(151.2086);
  expect(shifted.system).toBe('wgs84');
});

test('keeps the plain centre whenever the padding shift cannot be resolved', () => {
  const base = { coordinate: sydney, latitudeDelta: 0.08, viewportHeight: 800 };

  // No padding at all, and symmetric padding, both leave the geometric centre.
  expect(focusCenterWithinPadding(base)).toEqual(sydney);
  expect(focusCenterWithinPadding({
    ...base,
    padding: { top: 20, right: 0, bottom: 20, left: 0 },
  })).toEqual(sydney);
  // Geometry that is not measurable yet must not move the camera.
  expect(focusCenterWithinPadding({ ...base, padding: sheetPadding, viewportHeight: 0 }))
    .toEqual(sydney);
  expect(focusCenterWithinPadding({ ...base, latitudeDelta: 0, padding: sheetPadding }))
    .toEqual(sydney);
});

test('clamps a shifted centre inside the Mercator latitude range', () => {
  const south = { latitude: -84.999, longitude: 12, system: 'wgs84' as const };
  const shifted = focusCenterWithinPadding({
    coordinate: south,
    latitudeDelta: 80,
    padding: { top: 0, right: 0, bottom: 800, left: 0 },
    viewportHeight: 800,
  });

  expect(shifted.latitude).toBe(-85);
  expect(shifted.longitude).toBe(12);
});
