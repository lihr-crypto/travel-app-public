import { expect, test } from '@jest/globals';

import type { Coordinate } from '@/domain/common/types';
import {
  classifyHomeCoordinate,
  displayCrsAt,
  GCJ02_DIVERGENCE_METERS,
  HOME_ALIGNMENT_TOLERANCE_METERS,
  HOME_DISPLAY_CRS_POLICY,
  HOME_MAP_RENDERER,
  isWithinAlignmentTolerance,
  isWithinMainlandChinaBounds,
  planHomeMarkers,
} from '@/infrastructure/map/home-map-policy';

/**
 * M10-T0 fixtures are the repository's own real provider-native values, not
 * invented ones: the M4 map fixtures carry one Google/WGS84 and one AMap/GCJ-02
 * coordinate, and the mismatch case uses the coordinate family a `global` Trip
 * would hold for a mainland place.
 */
const sydneyWgs84: Coordinate = { latitude: -33.8683, longitude: 151.2086, system: 'wgs84' };
const tiananmenGcj02: Coordinate = { latitude: 39.90923, longitude: 116.397428, system: 'gcj02' };
const beijingWgs84: Coordinate = { latitude: 39.9042, longitude: 116.4074, system: 'wgs84' };
const tokyoWgs84: Coordinate = { latitude: 35.6812, longitude: 139.7671, system: 'wgs84' };

test('M10-T0: Home is locked to one renderer with a region-native display CRS', () => {
  expect(HOME_MAP_RENDERER).toBe('apple');
  expect(HOME_DISPLAY_CRS_POLICY).toBe('region_native');
});

test('M10-T0: the display CRS follows the coordinate location, not the device or Trip', () => {
  // Inside mainland China the Home renderer's map data is GCJ-02.
  expect(displayCrsAt(tiananmenGcj02)).toBe('gcj02');
  // Everywhere else it is WGS84 — including a WGS84 coordinate that happens to
  // sit inside China, which is exactly what makes the mismatch detectable.
  expect(displayCrsAt(sydneyWgs84)).toBe('wgs84');
  expect(displayCrsAt(tokyoWgs84)).toBe('wgs84');
  expect(displayCrsAt(beijingWgs84)).toBe('gcj02');
});

test('M10-T0: the mainland bounds over-include rather than under-include', () => {
  expect(isWithinMainlandChinaBounds(tiananmenGcj02)).toBe(true);
  expect(isWithinMainlandChinaBounds({ latitude: 55.8271, longitude: 137.8347 })).toBe(true);
  // Just outside each edge, and a southern-hemisphere coordinate.
  expect(isWithinMainlandChinaBounds({ latitude: 55.8272, longitude: 116 })).toBe(false);
  expect(isWithinMainlandChinaBounds({ latitude: 39, longitude: 137.8348 })).toBe(false);
  expect(isWithinMainlandChinaBounds({ latitude: 0.8292, longitude: 116 })).toBe(false);
  expect(isWithinMainlandChinaBounds(sydneyWgs84)).toBe(false);
});

test('M10-T0: mixed CRS families are plotted unchanged — no conversion is applied', () => {
  const plan = planHomeMarkers([
    { tripId: 'trip-china', coordinate: tiananmenGcj02 },
    { tripId: 'trip-global', coordinate: sydneyWgs84 },
    { tripId: 'trip-global', coordinate: tokyoWgs84 },
  ]);

  // Same objects, same systems, same order: the strongest form of "identity
  // conversion" is that nothing was rebuilt.
  expect(plan.drawable).toEqual([tiananmenGcj02, sydneyWgs84, tokyoWgs84]);
  expect(plan.drawable[0]).toBe(tiananmenGcj02);
  expect(plan.drawable[0].system).toBe('gcj02');
  expect(plan.drawable[1].system).toBe('wgs84');
  expect(plan.withheld).toHaveLength(0);
  expect(plan.tripsWithheld).toHaveLength(0);
});

test('M10-T0: a global Trip holding a mainland place is withheld, not drawn half a kilometre off', () => {
  const refusal = classifyHomeCoordinate('trip-global', beijingWgs84);
  expect(refusal).not.toBeNull();
  expect(refusal?.reason).toBe('crs_region_mismatch');
  expect(refusal?.tripId).toBe('trip-global');
  expect(refusal?.coordinate).toBe(beijingWgs84);
  // The divergence is an order of magnitude beyond the tolerance, so it can
  // never be drawn at any zoom.
  expect(refusal?.divergenceMeters).toBe(GCJ02_DIVERGENCE_METERS);
  expect(isWithinAlignmentTolerance(refusal!.divergenceMeters)).toBe(false);
  expect(HOME_ALIGNMENT_TOLERANCE_METERS).toBeLessThan(GCJ02_DIVERGENCE_METERS);
});

test('M10-T0: a mismatched marker does not take its Trip, or its siblings, off Home', () => {
  const plan = planHomeMarkers([
    { tripId: 'trip-global', coordinate: beijingWgs84 },
    { tripId: 'trip-global', coordinate: tokyoWgs84 },
    { tripId: 'trip-china', coordinate: tiananmenGcj02 },
  ]);

  expect(plan.drawable).toEqual([tokyoWgs84, tiananmenGcj02]);
  expect(plan.withheld.map(({ tripId }) => tripId)).toEqual(['trip-global']);
  // The Trip is named so the list can still show it; only the marker is refused.
  expect(plan.tripsWithheld).toEqual(['trip-global']);
});

test('M10-T0: a Trip that loses several markers is reported once', () => {
  const plan = planHomeMarkers([
    { tripId: 'trip-global', coordinate: beijingWgs84 },
    { tripId: 'trip-global', coordinate: { ...beijingWgs84, latitude: 31.2304, longitude: 121.4737 } },
  ]);
  expect(plan.withheld).toHaveLength(2);
  expect(plan.tripsWithheld).toEqual(['trip-global']);
  expect(plan.drawable).toHaveLength(0);
});

test('M10-T0: an empty Home is a valid plan', () => {
  const plan = planHomeMarkers([]);
  expect(plan.drawable).toHaveLength(0);
  expect(plan.withheld).toHaveLength(0);
  expect(plan.tripsWithheld).toHaveLength(0);
  expect(plan.renderer).toBe('apple');
});

test('M10-T0: an invalid coordinate fails closed instead of being plotted', () => {
  expect(() =>
    planHomeMarkers([
      { tripId: 'trip-global', coordinate: { latitude: 999, longitude: 0, system: 'wgs84' } },
    ]),
  ).toThrow(RangeError);
});
