import type { MapMarkerModel } from './map-models';

export interface MarkerProjectionSnapshot {
  requestKey: string;
  /** Native AMap emission order; Google guards its asynchronous calls locally. */
  revision?: number;
  width: number;
  height: number;
  points: readonly { id: string; x: number; y: number }[];
}

export interface DisplayMarkerGroup {
  marker: MapMarkerModel;
  members: readonly MapMarkerModel[];
}

/** Camera projection identity excludes labels/selection, which do not move a point. */
export function markerProjectionKey(markers: readonly MapMarkerModel[]): string {
  return JSON.stringify([...markers].sort((a, b) => a.id.localeCompare(b.id)).map(m => [
    m.id, m.coordinate.system, m.coordinate.latitude, m.coordinate.longitude,
  ]));
}

function locationIds(members: readonly MapMarkerModel[]) {
  return [...new Set(members.flatMap(m => m.placeIds ?? [m.id]))].sort();
}

function displayGroup(members: readonly MapMarkerModel[], representative: MapMarkerModel): DisplayMarkerGroup {
  const places = locationIds(members);
  const aggregate = places.length > 1;
  const selected = members.some(m => m.variant === 'selected');
  return {
    members,
    marker: {
      ...representative,
      id: members.length > 1 ? `overview-proximity:${members.map(m => m.id).sort().join('|')}` : representative.id,
      variant: selected ? 'selected' : aggregate ? 'cluster' : 'normal',
      ordinal: undefined,
      clusterCount: aggregate ? places.length : undefined,
      placeIds: places,
      sourceItemIds: [...new Set(members.flatMap(m => m.sourceItemIds ?? [m.id]))],
      label: aggregate ? `${places.length} 个地点` : representative.label,
    },
  };
}

/**
 * Display-only density groups. Native projections handle pitch, bearing and CRS.
 * The badge anchors to the saved point nearest the screen centroid, so no new
 * geographic coordinate is invented or persisted. Order is deterministic.
 */
export function buildMarkerClusters(
  markers: readonly MapMarkerModel[],
  projection: MarkerProjectionSnapshot | null,
  minimumGap = 6,
): DisplayMarkerGroup[] {
  const fallback = () => markers.map(m => displayGroup([m], m));
  if (!projection || projection.requestKey !== markerProjectionKey(markers)
    || !Number.isFinite(projection.width + projection.height)
    || projection.width <= 0 || projection.height <= 0) return fallback();
  const points = new Map(projection.points.filter(p => Number.isFinite(p.x + p.y)).map(p => [p.id, p]));
  if (points.size !== markers.length || markers.some(m => !points.has(m.id))) return fallback();
  const groups = [...markers].sort((a, b) => a.id.localeCompare(b.id)).map(m => [m]);
  const representative = (members: readonly MapMarkerModel[]) => {
    const x = members.reduce((sum, m) => sum + points.get(m.id)!.x, 0) / members.length;
    const y = members.reduce((sum, m) => sum + points.get(m.id)!.y, 0) / members.length;
    return members.reduce((nearest, m) => {
      const a = points.get(nearest.id)!, b = points.get(m.id)!;
      return Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? m : nearest;
    });
  };
  const displayBounds = (members: readonly MapMarkerModel[]) => {
    const point = points.get(representative(members).id)!;
    const selected = members.some(m => m.variant === 'selected');
    const badge = locationIds(members).length > 1;
    // Includes the transparent hit frame. A pin's frame is above its tip,
    // whereas a quantity badge is centred on the geographic point.
    const width = badge ? (selected ? 52 : 48) : (selected ? 50 : 44);
    const height = badge ? width : (selected ? 56 : 48);
    const anchorY = badge ? height / 2 : (selected ? 50 : 42);
    return { left: point.x - width / 2, right: point.x + width / 2,
      top: point.y - anchorY, bottom: point.y - anchorY + height };
  };
  // Merge until the actual rendered badge anchors have a minimum visible gap.
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i += 1) {
      const a = displayBounds(groups[i]);
      for (let j = i + 1; j < groups.length; j += 1) {
        const b = displayBounds(groups[j]);
        if (a.left < b.right + minimumGap && b.left < a.right + minimumGap
          && a.top < b.bottom + minimumGap && b.top < a.bottom + minimumGap) {
          groups[i] = [...groups[i], ...groups[j]];
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return groups.map(members => displayGroup(members, representative(members)));
}
