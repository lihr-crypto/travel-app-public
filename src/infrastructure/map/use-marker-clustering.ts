import { useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react';
import type { MapMarkerModel } from './map-models';
import { buildMarkerClusters, markerProjectionKey, type MarkerProjectionSnapshot } from './marker-clustering';

export function useMarkerClustering(markers: readonly MapMarkerModel[], enabled = false) {
  const projectionRequestKey = markerProjectionKey(markers);
  const currentKey = useRef(projectionRequestKey);
  useLayoutEffect(() => { currentKey.current = projectionRequestKey; }, [projectionRequestKey]);
  const [projection, setProjection] = useState<MarkerProjectionSnapshot | null>(null);
  const updateProjection = useCallback((next: MarkerProjectionSnapshot) => {
    if (next.requestKey !== currentKey.current) return;
    setProjection(previous => {
      if (previous?.requestKey === next.requestKey && previous.revision !== undefined
        && next.revision !== undefined && next.revision < previous.revision) return previous;
      return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
    });
  }, []);
  const groups = useMemo(() => enabled
    ? buildMarkerClusters(markers, projection)
    : markers.map(marker => ({ marker, members: [marker] })), [markers, enabled, projection]);
  return { projectionRequestKey, groups, updateProjection };
}
