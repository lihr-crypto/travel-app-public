import type { Coordinate, EntityId } from '@/domain/common/types';
import type { HomeMarkerModel, HomeTripMarker } from './home-markers';

/**
 * M10-T2b — Home cluster grouping.
 *
 * Stage-01 §3.1 is explicit that clustering is **zoom-dependent**: at low zoom
 * the map shows region groups with a Trip count (`示例地区 ● 1`, `北京 ● 3`), and
 * as the map is zoomed in those groups split back into individual Trips. So the
 * visible span is an input, not a constant — a fixed radius would either merge
 * distinct cities at world zoom or refuse to merge anything at city zoom.
 *
 * Stage-02 §3.2 fixes the count: "Marker 数字表示关联 Trip 数量，而不是 Place
 * 数量". §3.3 and Stage-03 §3.6 fix the display aggregation: "数据不合并，地图显示
 * 可以聚合" — a cluster is a display arrangement, never a merge. The member Trip
 * ids travel with the cluster so the preview card can list them.
 */

export interface HomeClusterMarker extends HomeMarkerModel {
  variant: 'cluster';
  /** Always present: a cluster is labelled by the shared location (Stage-03 §3.6). */
  label: string;
  /**
   * The Trips this cluster stands for. Authoritative; `sourceItemIds` is the
   * same array because the shared marker model needs it for the count badge.
   */
  clusterTripIds: readonly EntityId[];
}

export interface HomeClusterOptions {
  /** The visible latitude span. The radius scales with it, so zooming in splits. */
  latitudeDelta: number;
  /** Reference viewport height used to turn the pixel radius into a span fraction. */
  viewportHeightPx?: number;
  /** Markers closer than this on screen belong to the same group. */
  clusterPixelRadius?: number;
}

/** Roughly 40 pt apart — close enough that two badges would overlap. */
export const HOME_CLUSTER_PIXEL_RADIUS = 40;
/** Reference viewport height for the span fraction; the Home map is full-bleed. */
export const HOME_CLUSTER_VIEWPORT_HEIGHT_PX = 700;

const METERS_PER_DEGREE_LATITUDE = 111_320;

/**
 * Separation in metres, by the equirectangular approximation scaled at the
 * first coordinate's latitude. Exact enough for a display grouping — the whole
 * point is that the two markers are *close*, and the error only grows over
 * distances far larger than any cluster radius.
 */
function separationMeters(left: Coordinate, right: Coordinate): number {
  const meanLatitudeRadians = (left.latitude * Math.PI) / 180;
  const deltaY = (right.latitude - left.latitude) * METERS_PER_DEGREE_LATITUDE;
  const deltaX =
    (right.longitude - left.longitude)
    * METERS_PER_DEGREE_LATITUDE
    * Math.cos(meanLatitudeRadians);
  return Math.hypot(deltaX, deltaY);
}

/** The on-screen cluster radius expressed as a real distance at this zoom. */
export function clusterRadiusMeters(options: HomeClusterOptions): number {
  const viewportHeightPx = options.viewportHeightPx ?? HOME_CLUSTER_VIEWPORT_HEIGHT_PX;
  const pixelRadius = options.clusterPixelRadius ?? HOME_CLUSTER_PIXEL_RADIUS;
  if (!Number.isFinite(options.latitudeDelta) || options.latitudeDelta <= 0) {
    throw new RangeError('Home cluster needs a positive visible latitude span');
  }
  if (!Number.isFinite(viewportHeightPx) || viewportHeightPx <= 0) {
    throw new RangeError('Home cluster needs a positive viewport height');
  }
  return (pixelRadius / viewportHeightPx) * options.latitudeDelta * METERS_PER_DEGREE_LATITUDE;
}

function centroid(coordinates: readonly Coordinate[]): Coordinate {
  const sum = coordinates.reduce(
    (total, coordinate) => ({
      latitude: total.latitude + coordinate.latitude,
      longitude: total.longitude + coordinate.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: sum.latitude / coordinates.length,
    longitude: sum.longitude / coordinates.length,
    // Every member shares one stored system (enforced below), and a group this
    // small cannot straddle the CRS boundary, so the centroid inherits it.
    system: coordinates[0].system,
  };
}

/**
 * Group Trip markers into display clusters at the given zoom.
 *
 * A group is seeded by its first marker in input order — which
 * `buildHomeMapProjection` already sorted by Trip start date, so the outcome is
 * deterministic — and a later marker joins the first group it is close enough
 * to. Groups of one stay plain Trip markers: a single Trip is not a cluster.
 *
 * **Markers of different coordinate systems never group.** Merging them would
 * put a GCJ-02 and a WGS84 anchor under one badge whose centroid can only be
 * tagged one way, and the Apple adapter would then refuse to draw it.
 */
export function clusterHomeMarkers(
  markers: readonly HomeTripMarker[],
  options: HomeClusterOptions,
): readonly HomeMarkerModel[] {
  const radius = clusterRadiusMeters(options);
  const groups: { seed: HomeTripMarker; members: HomeTripMarker[] }[] = [];

  for (const marker of markers) {
    const group = groups.find(({ seed, members }) =>
      seed.coordinate.system === marker.coordinate.system
      && members.every((member) =>
        separationMeters(member.coordinate, marker.coordinate) <= radius,
      ),
    );
    if (group) {
      group.members.push(marker);
    } else {
      groups.push({ members: [marker], seed: marker });
    }
  }

  return groups.map(({ seed, members }): HomeTripMarker | HomeClusterMarker => {
    if (members.length === 1) return seed;

    const tripIds = members.map(({ tripId }) => tripId);
    return {
      id: `home-cluster:${[...tripIds].sort().join(':')}`,
      coordinate: centroid(members.map(({ coordinate }) => coordinate)),
      // Stage-02 §3.2 / Stage-03 §3.6: the count is Trips, and the label names
      // the shared location. The seed is the earliest Trip in the group.
      label: `${seed.label} · ${members.length} 次旅行`,
      variant: 'cluster',
      weight: 'normal',
      clusterTripIds: tripIds,
      // The same array, not a copy, so the two can never drift.
      sourceItemIds: tripIds,
    };
  });
}
