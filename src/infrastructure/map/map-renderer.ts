import type { ReactElement } from 'react';

import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type { Coordinate, CoordinateSystem, EntityId } from '@/domain/common/types';
import type {
  MapCameraRequest,
  MapMarkerModel,
  MapViewport,
} from './map-models';

/** Shared seam for the Google and AMap iOS renderer adapters. */
export interface MapRendererProps {
  system: CoordinateSystem;
  markers: readonly MapMarkerModel[];
  cameraRequest?: MapCameraRequest | null;
  onMarkerPress?: (markerId: EntityId) => void;
  /** Overview-only density presentation, based on native projected screen points. */
  clusterMarkers?: boolean;
  onClusterPress?: (members: readonly MapMarkerModel[]) => void;
  onMapPress?: (coordinate: Coordinate) => void;
  onViewportChange?: (viewport: MapViewport) => void;
  /** A user starts touching the map; automatic background fits should yield. */
  onMapInteraction?: () => void;
  /** Screen-space evidence captured by a native renderer after camera settlement. */
  onCameraSettled?: (event: MapViewport & {
    requestKey: string;
    visibleMapRect?: { x: number; y: number; width: number; height: number };
    targetProjections?: readonly {
      index: number;
      targetCoordinate: Coordinate;
      screenPoint: { x: number; y: number };
      insideVisibleMapRect: boolean;
    }[];
  }) => void;
}

export type MapRenderer = (props: MapRendererProps) => ReactElement | null;

/** Call before handing neutral primitives to a native map adapter. */
export function assertMapRendererInput(
  input: Pick<MapRendererProps, 'system' | 'markers' | 'cameraRequest'>,
): void {
  if (input.system !== 'wgs84' && input.system !== 'gcj02') {
    throw new RangeError(`Invalid renderer coordinate system: ${input.system}`);
  }

  const markerIds = new Set<EntityId>();
  for (const marker of input.markers) {
    if (!marker.id.trim() || markerIds.has(marker.id)) {
      throw new RangeError(`Invalid or duplicate marker ID: ${marker.id}`);
    }
    markerIds.add(marker.id);
    assertCoordinateSystem(marker.coordinate, input.system);

    if (
      marker.ordinal !== undefined &&
      (!Number.isInteger(marker.ordinal) || marker.ordinal < 1)
    ) {
      throw new RangeError(`Invalid marker ordinal: ${marker.id}`);
    }
    if (marker.clusterCount !== undefined
      && (!Number.isSafeInteger(marker.clusterCount) || marker.clusterCount < 1)) {
      throw new RangeError(`Invalid marker cluster count: ${marker.id}`);
    }
  }

  const camera = input.cameraRequest;
  if (camera === null || camera === undefined) return;
  if (camera.animated !== undefined && typeof camera.animated !== 'boolean') {
    throw new RangeError('Invalid camera animation flag');
  }
  if (
    camera.requestId !== undefined &&
    (!Number.isSafeInteger(camera.requestId) || camera.requestId < 1)
  ) {
    throw new RangeError('Invalid camera request ID');
  }
  if (camera.coordinates.length === 0) {
    throw new RangeError('Camera request needs at least one coordinate');
  }
  for (const coordinate of camera.coordinates) {
    assertCoordinateSystem(coordinate, input.system);
  }
  if (
    camera.padding &&
    Object.values(camera.padding).some(
      (value) => !Number.isFinite(value) || value < 0,
    )
  ) {
    throw new RangeError('Invalid camera padding');
  }
}
