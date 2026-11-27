import { assertCoordinate } from '@/domain/common/coordinate';
import type { Coordinate, CoordinateSystem, EntityId } from '@/domain/common/types';

/**
 * M10-T0 — the Home Footprint Map's renderer and mixed-CRS display contract.
 *
 * Home is the only surface that is *cross-Trip*, so it is the only one that can
 * hold both stored coordinate families at once: a `china_mainland` Trip's Places
 * are GCJ-02 (AMap) and a `global` Trip's are WGS84 (Google). The Trip surfaces
 * never face this — `resolveTripMapStack()` binds one renderer to one Trip's
 * region, and both renderer adapters throw on a CRS mismatch rather than
 * converting.
 *
 * The chosen renderer is Apple MapKit (`react-native-maps` `PROVIDER_DEFAULT`),
 * because its map data is **region-native**: GCJ-02 inside mainland China and
 * WGS84 everywhere else. That is exactly the convention this app stores
 * coordinates in, so a single Home renderer plots both families with **no
 * conversion at all** — which is what keeps the architecture red line
 * ("never rewrite persisted provider-native coordinates") trivially true.
 *
 * The rejected alternatives are recorded in DEVELOPMENT_STATUS.md (M10-T0): AMap
 * alone cannot render overseas without its paid "世界地图服务" premium
 * application, and Google alone is unreachable from mainland China networks.
 */

export type HomeMapRenderer = 'apple';

/** The single renderer every M10 task is built on. */
export const HOME_MAP_RENDERER: HomeMapRenderer = 'apple';

/**
 * The display CRS is whatever the map data at the coordinate's own location
 * uses, so a stored coordinate is drawn exactly as stored. Anything else would
 * need a GCJ-02 conversion path this app deliberately does not have.
 */
export type HomeDisplayCrsPolicy = 'region_native';

export const HOME_DISPLAY_CRS_POLICY: HomeDisplayCrsPolicy = 'region_native';

/**
 * The bounds inside which the Home renderer's map data is GCJ-02.
 *
 * This is the conservative box used by the public GCJ-02 offset algorithm, and
 * it is deliberately *wider* than the mainland coastline: it over-includes
 * marginal and offshore areas rather than risk declaring a mainland coordinate
 * as WGS84. Over-inclusion can only withhold a marker (the fail-closed
 * direction); under-inclusion would draw one in the wrong place.
 */
export const MAINLAND_CHINA_BOUNDS = Object.freeze({
  maxLatitude: 55.8271,
  maxLongitude: 137.8347,
  minLatitude: 0.8293,
  minLongitude: 72.004,
});

export function isWithinMainlandChinaBounds(
  coordinate: Pick<Coordinate, 'latitude' | 'longitude'>,
): boolean {
  return (
    coordinate.latitude >= MAINLAND_CHINA_BOUNDS.minLatitude
    && coordinate.latitude <= MAINLAND_CHINA_BOUNDS.maxLatitude
    && coordinate.longitude >= MAINLAND_CHINA_BOUNDS.minLongitude
    && coordinate.longitude <= MAINLAND_CHINA_BOUNDS.maxLongitude
  );
}

/** The CRS the Home renderer's map data uses at this coordinate's location. */
export function displayCrsAt(
  coordinate: Pick<Coordinate, 'latitude' | 'longitude'>,
): CoordinateSystem {
  return isWithinMainlandChinaBounds(coordinate) ? 'gcj02' : 'wgs84';
}

/**
 * Alignment a Home marker must achieve to be worth drawing. A pin is a point
 * claim, so 25 m is already generous at Footprint zoom levels.
 */
export const HOME_ALIGNMENT_TOLERANCE_METERS = 25;

/**
 * Magnitude of the GCJ-02/WGS84 divergence inside mainland China — roughly
 * 300–700 m depending on location. It is an order of magnitude above the
 * tolerance above, which is why a CRS/region mismatch is never drawn: there is
 * no zoom level at which a half-kilometre error reads as the right place.
 */
export const GCJ02_DIVERGENCE_METERS = 500;

export function isWithinAlignmentTolerance(divergenceMeters: number): boolean {
  return divergenceMeters <= HOME_ALIGNMENT_TOLERANCE_METERS;
}

export interface HomeCoordinateInput {
  tripId: EntityId;
  coordinate: Coordinate;
}

export type HomeWithheldReason = 'crs_region_mismatch';

export interface WithheldHomeCoordinate {
  tripId: EntityId;
  coordinate: Coordinate;
  reason: HomeWithheldReason;
  /** Why it could not be drawn, in metres, for the status record. */
  divergenceMeters: number;
}

export interface HomeMarkerPlan {
  renderer: HomeMapRenderer;
  displayCrsPolicy: HomeDisplayCrsPolicy;
  /** Plot these exactly as stored — no CRS conversion is applied. */
  drawable: readonly Coordinate[];
  /** Refused markers, reported rather than dropped silently. */
  withheld: readonly WithheldHomeCoordinate[];
  /**
   * Trips that lost at least one marker. They must still appear in the
   * 我的旅行 list: a marker that cannot be placed truthfully is not a reason to
   * lose the Trip.
   */
  tripsWithheld: readonly EntityId[];
}

/**
 * Classify one stored coordinate against the Home display contract.
 *
 * A coordinate is drawable exactly when its stored CRS equals the CRS of the
 * map data at its own location. Since `Trip.mapRegion` is immutable after
 * creation, the mismatch is reachable only one way: a `global` Trip holding a
 * Place that Google Places returned inside mainland China (stored WGS84, drawn
 * over GCJ-02 map data).
 */
export function classifyHomeCoordinate(
  tripId: EntityId,
  coordinate: Coordinate,
): WithheldHomeCoordinate | null {
  assertCoordinate(coordinate);
  const expected = displayCrsAt(coordinate);
  if (coordinate.system === expected) return null;
  return {
    coordinate,
    divergenceMeters: GCJ02_DIVERGENCE_METERS,
    reason: 'crs_region_mismatch',
    tripId,
  };
}

export function planHomeMarkers(
  inputs: readonly HomeCoordinateInput[],
): HomeMarkerPlan {
  const drawable: Coordinate[] = [];
  const withheld: WithheldHomeCoordinate[] = [];
  const tripsWithheld = new Set<EntityId>();

  for (const { tripId, coordinate } of inputs) {
    const refusal = classifyHomeCoordinate(tripId, coordinate);
    if (refusal === null) {
      drawable.push(coordinate);
      continue;
    }
    withheld.push(refusal);
    tripsWithheld.add(tripId);
  }

  return {
    displayCrsPolicy: HOME_DISPLAY_CRS_POLICY,
    drawable,
    renderer: HOME_MAP_RENDERER,
    tripsWithheld: [...tripsWithheld],
    withheld,
  };
}
