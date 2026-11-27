import type { StyleProp, ViewStyle } from 'react-native';

export interface NativeCoordinate {
  latitude: number;
  longitude: number;
}

export interface NativePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface NativeScreenAnchor {
  x: number;
  y: number;
}

export interface NativeVisibleMapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativeTargetProjection {
  index: number;
  targetCoordinate: NativeCoordinate;
  screenPoint: { x: number; y: number };
  insideVisibleMapRect: boolean;
}

export interface NativeMarker {
  id: string;
  coordinate: NativeCoordinate;
  ordinal?: number;
  label?: string;
  variant: 'normal' | 'selected' | 'unscheduled' | 'cluster';
  sourceItemIds?: readonly string[];
  clusterCount?: number;
}

export interface NativeMarkerProjectionRequest {
  requestKey: string;
  markers: readonly { id: string; coordinate: NativeCoordinate }[];
}

export interface NativeCameraRequest {
  coordinates: readonly NativeCoordinate[];
  padding?: NativePadding;
  requestKey: string;
  animated?: boolean;
  screenAnchor?: NativeScreenAnchor;
}

export interface ExpoAmapMapViewProps {
  style?: StyleProp<ViewStyle>;
  testID?: string;
  markers: readonly NativeMarker[];
  cameraRequest: NativeCameraRequest | null;
  markerProjectionRequest?: NativeMarkerProjectionRequest | null;
  onMarkerProjection?: (event: { nativeEvent: {
    requestKey: string;
    revision?: number;
    width: number;
    height: number;
    points: readonly { id: string; x: number; y: number }[];
  } }) => void;
  onMarkerPress?: (event: { nativeEvent: { id: string } }) => void;
  onMapPress?: (event: { nativeEvent: NativeCoordinate }) => void;
  onViewportChange?: (event: {
    nativeEvent: NativeCoordinate & {
      latitudeDelta: number;
      longitudeDelta: number;
      userActionRequestKey?: string;
    };
  }) => void;
  onCameraSettled?: (event: {
    nativeEvent: NativeCoordinate & {
      requestKey: string;
      latitudeDelta: number;
      longitudeDelta: number;
      visibleMapRect: NativeVisibleMapRect;
      targetProjections: readonly NativeTargetProjection[];
    };
  }) => void;
}
