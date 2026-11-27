import { expect, test } from '@jest/globals';

import type { HomeTripMarker } from '@/application/projections/home-markers';
import {
  clusterHomeMarkers,
  clusterRadiusMeters,
  HOME_CLUSTER_PIXEL_RADIUS,
  HOME_CLUSTER_VIEWPORT_HEIGHT_PX,
  type HomeClusterMarker,
} from '@/application/projections/home-clusters';

/** Real provider-native values, as elsewhere: AMap/GCJ-02 and Google/WGS84. */
const tiananmen = { latitude: 39.90923, longitude: 116.397428, system: 'gcj02' as const };
const forbiddenCity = { latitude: 39.916345, longitude: 116.397155, system: 'gcj02' as const };
const tianjin = { latitude: 39.0842, longitude: 117.2009, system: 'gcj02' as const };
const shanghai = { latitude: 31.2304, longitude: 121.4737, system: 'gcj02' as const };
const tokyo = { latitude: 35.6812, longitude: 139.7671, system: 'wgs84' as const };

function tripMarker(
  tripId: string,
  coordinate: HomeTripMarker['coordinate'],
  label: string,
  startOrder: number,
): HomeTripMarker {
  return {
    id: tripId,
    coordinate,
    label,
    lifecycle: 'completed',
    tripId,
    tripTitle: `Trip ${tripId}`,
    variant: 'normal',
    weight: 'normal',
    sourceItemIds: [startOrder.toString()],
  };
}

const isCluster = (marker: { variant: string }): marker is HomeClusterMarker =>
  marker.variant === 'cluster';

test('M10-T2b: the visible span decides grouping, so zooming in splits a cluster', () => {
  const markers = [
    tripMarker('a', tiananmen, '天安门', 1),
    tripMarker('b', forbiddenCity, '故宫', 2),
  ];

  // A city-level span keeps the two ~800 m apart markers separate...
  const tight = clusterHomeMarkers(markers, { latitudeDelta: 0.04 });
  expect(tight).toHaveLength(2);
  expect(tight.every((marker) => !isCluster(marker))).toBe(true);

  // ...and widening the span groups them, which is Stage-01 §3.1's rule.
  const wide = clusterHomeMarkers(markers, { latitudeDelta: 0.2 });
  expect(wide).toHaveLength(1);
  expect(isCluster(wide[0])).toBe(true);
});

test('M10-T2b: a world span still separates distinct cities', () => {
  const clustered = clusterHomeMarkers(
    [
      tripMarker('bj', tiananmen, '天安门', 1),
      tripMarker('tj', tianjin, '天津之眼', 2),
      tripMarker('sh', shanghai, '外滩', 3),
    ],
    { latitudeDelta: 120 },
  );

  // 北京↔天津 (~110 km) groups; 上海 (~1070 km) does not.
  const clusters = clustered.filter(isCluster);
  expect(clusters).toHaveLength(1);
  expect(clusters[0].clusterTripIds).toEqual(['bj', 'tj']);
  expect(clustered.filter((marker) => !isCluster(marker))).toHaveLength(1);
});

test('M10-T2b: the count is Trips, and the label names the shared location', () => {
  const clustered = clusterHomeMarkers(
    [
      tripMarker('bj-2026', tiananmen, '天安门', 1),
      tripMarker('bj-2027', forbiddenCity, '故宫', 2),
    ],
    { latitudeDelta: 0.2 },
  );

  const cluster = clustered[0];
  expect(isCluster(cluster)).toBe(true);
  if (!isCluster(cluster)) return;
  expect(cluster.label).toBe('天安门 · 2 次旅行');
  expect(cluster.clusterTripIds).toEqual(['bj-2026', 'bj-2027']);
  // Stage-02 §3.2: the badge counts Trips, not Places.
  expect(cluster.sourceItemIds).toBe(cluster.clusterTripIds);
  expect(cluster.weight).toBe('normal');
});

test('M10-T2b: a single Trip is never a cluster', () => {
  const single = tripMarker('a', tiananmen, '天安门', 1);
  const alone = clusterHomeMarkers([single], { latitudeDelta: 120 });
  expect(alone).toHaveLength(1);
  expect(alone[0].variant).toBe('normal');
  // Passed through untouched rather than rebuilt into a cluster of one.
  expect(alone[0]).toBe(single);
});

test('M10-T2b: co-located markers of different coordinate systems never merge', () => {
  // Identical position, different stored family — the one shape that would make
  // a single badge undrawable, because its centroid could only be tagged one way.
  const samePlace = { latitude: 39.90923, longitude: 116.397428 };
  const clustered = clusterHomeMarkers(
    [
      tripMarker('china', { ...samePlace, system: 'gcj02' }, '天安门', 1),
      tripMarker('global', { ...samePlace, system: 'wgs84' }, '天安门', 2),
    ],
    { latitudeDelta: 120 },
  );

  expect(clustered).toHaveLength(2);
  expect(clustered.every((marker) => !isCluster(marker))).toBe(true);
  expect(clustered.map(({ coordinate }) => coordinate.system)).toEqual(['gcj02', 'wgs84']);
});

test('M10-T2b: the cluster sits at its members centroid and inherits their system', () => {
  const clustered = clusterHomeMarkers(
    [
      tripMarker('a', tiananmen, '天安门', 1),
      tripMarker('b', forbiddenCity, '故宫', 2),
    ],
    { latitudeDelta: 0.2 },
  );
  const cluster = clustered[0];
  if (!isCluster(cluster)) throw new Error('expected a cluster');

  expect(cluster.coordinate.latitude).toBeCloseTo(
    (tiananmen.latitude + forbiddenCity.latitude) / 2,
    10,
  );
  expect(cluster.coordinate.longitude).toBeCloseTo(
    (tiananmen.longitude + forbiddenCity.longitude) / 2,
    10,
  );
  expect(cluster.coordinate.system).toBe('gcj02');
});

test('M10-T2b: the cluster id is order-independent, so a re-render cannot rename it', () => {
  const forward = clusterHomeMarkers(
    [tripMarker('a', tiananmen, '天安门', 1), tripMarker('b', forbiddenCity, '故宫', 2)],
    { latitudeDelta: 0.2 },
  )[0];
  const backward = clusterHomeMarkers(
    [tripMarker('b', forbiddenCity, '故宫', 1), tripMarker('a', tiananmen, '天安门', 2)],
    { latitudeDelta: 0.2 },
  )[0];

  expect(forward.id).toBe('home-cluster:a:b');
  expect(backward.id).toBe(forward.id);
  // The seed is the earliest Trip in the group, so the label follows input order.
  expect(backward.label).toBe('故宫 · 2 次旅行');
});

test('M10-T2b: every member Trip is carried, and none is dropped', () => {
  const clustered = clusterHomeMarkers(
    [
      tripMarker('a', tiananmen, '天安门', 1),
      tripMarker('b', forbiddenCity, '故宫', 2),
      tripMarker('c', tianjin, '天津之眼', 3),
    ],
    { latitudeDelta: 120 },
  );
  const cluster = clustered[0];
  if (!isCluster(cluster)) throw new Error('expected a cluster');

  expect([...cluster.clusterTripIds].sort()).toEqual(['a', 'b', 'c']);
  // 数据不合并: the members are still three Trips, not one.
  expect(new Set(cluster.clusterTripIds).size).toBe(3);
});

test('M10-T2b: the radius scales with the span, and a bad span fails closed', () => {
  const tight = clusterRadiusMeters({ latitudeDelta: 0.1 });
  const wide = clusterRadiusMeters({ latitudeDelta: 1 });
  expect(wide).toBeCloseTo(tight * 10, 6);
  expect(clusterRadiusMeters({
    latitudeDelta: 0.1,
    clusterPixelRadius: HOME_CLUSTER_PIXEL_RADIUS * 2,
  })).toBeCloseTo(tight * 2, 6);
  expect(clusterRadiusMeters({
    latitudeDelta: 0.1,
    viewportHeightPx: HOME_CLUSTER_VIEWPORT_HEIGHT_PX * 2,
  })).toBeCloseTo(tight / 2, 6);

  expect(() => clusterRadiusMeters({ latitudeDelta: 0 })).toThrow(RangeError);
  expect(() => clusterRadiusMeters({ latitudeDelta: Number.NaN })).toThrow(RangeError);
  expect(() => clusterRadiusMeters({ latitudeDelta: 0.1, viewportHeightPx: 0 })).toThrow(RangeError);
});

test('M10-T2b: an empty Home produces no markers', () => {
  expect(clusterHomeMarkers([], { latitudeDelta: 120 })).toHaveLength(0);
});
