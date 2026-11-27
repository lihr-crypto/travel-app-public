import { expect, test } from '@jest/globals';
import type { MapMarkerModel } from '@/infrastructure/map/map-models';
import { buildMarkerClusters, markerProjectionKey, type MarkerProjectionSnapshot } from '@/infrastructure/map/marker-clustering';

const markers: MapMarkerModel[] = [0, 1, 2].map(index => ({
  id: `item-${index}`, coordinate: { latitude: 39 + index * 0.1, longitude: 116, system: 'gcj02' },
  variant: 'normal', label: `地点${index}`, placeIds: [`place-${index}`], sourceItemIds: [`item-${index}`],
}));
function snapshot(input: readonly MapMarkerModel[], xs: number[]): MarkerProjectionSnapshot {
  return { requestKey: markerProjectionKey(input), width: 400, height: 800,
    points: input.map((m, index) => ({ id: m.id, x: xs[index], y: 100 })) };
}

test('nearby native screen points aggregate, zoomed points split, with every original member retained', () => {
  const originals = JSON.stringify(markers);
  const groups = buildMarkerClusters(markers, snapshot(markers, [100, 130, 300]));
  expect(groups).toHaveLength(2);
  const aggregate = groups.find(group => group.marker.clusterCount === 2)!;
  expect(aggregate.members.map(m => m.id)).toEqual(['item-0', 'item-1']);
  expect(aggregate.marker.sourceItemIds).toEqual(['item-0', 'item-1']);
  expect(aggregate.members.some(m => m.coordinate === aggregate.marker.coordinate)).toBe(true);
  expect(groups.flatMap(group => group.members.map(m => m.id)).sort()).toEqual(markers.map(m => m.id));
  const expanded = buildMarkerClusters(markers, snapshot(markers, [50, 180, 300]));
  expect(expanded).toHaveLength(3);
  expect(expanded.every(group => group.marker.clusterCount === undefined)).toBe(true);
  expect(JSON.stringify(markers)).toBe(originals);
});

test('quantity counts distinct Places, preserving repeated visits without a misleading number-one badge', () => {
  const repeated = { ...markers[0], id: 'another-visit', sourceItemIds: ['another-visit'] };
  const samePlace = [markers[0], repeated];
  const onlyPlace = buildMarkerClusters(samePlace, snapshot(samePlace, [100, 100]))[0];
  expect(onlyPlace.marker.variant).toBe('normal');
  expect(onlyPlace.marker.clusterCount).toBeUndefined();
  expect([...(onlyPlace.marker.sourceItemIds ?? [])].sort()).toEqual(['another-visit', 'item-0']);
  const twoPlaces = [markers[0], repeated, markers[1]];
  const group = buildMarkerClusters(twoPlaces, snapshot(twoPlaces, [100, 100, 110]))[0];
  expect(group.marker.clusterCount).toBe(2);
  expect(group.marker.sourceItemIds).toHaveLength(3);
});

test('same-coordinate snapshots count locations rather than visits and retain selected emphasis', () => {
  const existing: MapMarkerModel = { ...markers[0], variant: 'selected',
    placeIds: ['place-0', 'place-1'], sourceItemIds: ['visit-1', 'visit-2', 'visit-3'] };
  const group = buildMarkerClusters([existing], snapshot([existing], [100]))[0];
  expect(group.marker.clusterCount).toBe(2);
  expect(group.marker.variant).toBe('selected');
  expect(group.marker.coordinate).toBe(existing.coordinate);
});

test('a lower pointed pin cannot overlap an upper numeric badge despite separated geographic anchors', () => {
  const projection = snapshot(markers, [100, 110, 100]);
  const groups = buildMarkerClusters(markers, { ...projection,
    points: projection.points.map((point, index) => ({ ...point, y: index === 2 ? 164 : 100 })) });
  // The lower pin's transparent frame starts at y122 while the upper badge
  // ends at y124; screen rectangles overlap even though anchors are 64pt apart.
  expect(groups).toHaveLength(1);
  expect(groups[0].marker.clusterCount).toBe(3);
});

test('grouping is deterministic and stale/missing/invalid projections fall back without dropping locations', () => {
  const projection = snapshot(markers, [100, 130, 300]);
  expect(buildMarkerClusters([...markers].reverse(), projection))
    .toEqual(buildMarkerClusters(markers, projection));
  for (const bad of [
    { ...projection, requestKey: 'old-trip' },
    { ...projection, points: projection.points.slice(0, 1) },
    { ...projection, points: projection.points.map(p => ({ ...p, x: NaN })) },
    { ...projection, width: 0 },
  ]) {
    const fallback = buildMarkerClusters(markers, bad);
    expect(fallback).toHaveLength(3);
    expect(fallback.map(group => group.marker.id)).toEqual(markers.map(m => m.id));
  }
});
