import type {
  Coordinate,
  EntityId,
} from '@/domain/common/types';

/** Neutral visual marker; a Day marker's ID is its Item occurrence ID. */
export interface MapMarkerModel {
  id: EntityId;
  coordinate: Coordinate;
  ordinal?: number;
  label?: string;
  variant: 'normal' | 'selected' | 'unscheduled' | 'cluster';
  sourceItemIds?: readonly EntityId[];
  /** Overview-only source Place identities; repeats count as one location. */
  placeIds?: readonly EntityId[];
  /** A viewport aggregate's distinct-location count, rendered as a round badge. */
  clusterCount?: number;
}

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** One coordinate focuses; multiple coordinates fit the visible camera. */
export interface MapCameraRequest {
  coordinates: readonly Coordinate[];
  padding?: MapPadding;
  /** False applies a new viewport directly; omitted preserves animated behavior. */
  animated?: boolean;
  /** Distinguishes repeated one-shot requests for the same coordinates. */
  requestId?: number;
  /** Forces a camera request when changing scope to a Day with identical Places. */
  scopeKey?: string;
}

export interface MapViewport {
  center: Coordinate;
  latitudeDelta: number;
  longitudeDelta: number;
}
