import { useMemo } from 'react';
import ExpoAmapMapView from '../../../modules/expo-amap-map/src/ExpoAmapMapView';
import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type { Coordinate } from '@/domain/common/types';
import { assertMapRendererInput, type MapRendererProps } from './map-renderer';
import { useMarkerClustering } from './use-marker-clustering';

/** GCJ-02 adapter for the local Expo view; SDK configuration is owned by M4-T7. */
export function AmapMapRenderer(props: MapRendererProps) {
  assertMapRendererInput(props);
  if (props.system !== 'gcj02') {
    throw new RangeError('AmapMapRenderer requires gcj02 coordinates');
  }

  const { groups, projectionRequestKey, updateProjection } = useMarkerClustering(props.markers, props.clusterMarkers);
  const markerProjectionRequest = useMemo(() => props.clusterMarkers ? {
    requestKey: projectionRequestKey,
    markers: JSON.parse(projectionRequestKey).map(([id, , latitude, longitude]: [string, string, number, number]) => ({
      id, coordinate: { latitude, longitude },
    })),
  } : null, [props.clusterMarkers, projectionRequestKey]);
  const markers = groups.map(({ marker }) => ({
    id: marker.id,
    coordinate: {
      latitude: marker.coordinate.latitude,
      longitude: marker.coordinate.longitude,
    },
    ordinal: marker.ordinal,
    label: marker.label,
    variant: marker.variant,
    sourceItemIds: marker.sourceItemIds,
    ...(marker.clusterCount === undefined ? {} : { clusterCount: marker.clusterCount }),
  }));
  const cameraRequest = props.cameraRequest
    ? {
        coordinates: props.cameraRequest.coordinates.map((coordinate) => ({
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
        })),
        padding: props.cameraRequest.padding,
        ...(props.cameraRequest.animated === undefined ? {} : { animated: props.cameraRequest.animated }),
        requestKey: JSON.stringify(props.cameraRequest),
      }
    : null;

  function tag(coordinate: { latitude: number; longitude: number }): Coordinate {
    const tagged: Coordinate = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      system: 'gcj02',
    };
    assertCoordinateSystem(tagged, 'gcj02');
    return tagged;
  }

  return (
    <ExpoAmapMapView
      testID="amap-map-renderer"
      style={{ flex: 1 }}
      markers={markers}
      cameraRequest={cameraRequest}
      markerProjectionRequest={markerProjectionRequest}
      onMarkerProjection={(event) => updateProjection(event.nativeEvent)}
      onMarkerPress={(event) => {
        const group = groups.find(candidate => candidate.marker.id === event.nativeEvent.id);
        if (group && (group.marker.clusterCount !== undefined || group.members.length > 1)) {
          props.onClusterPress?.(group.members);
        } else props.onMarkerPress?.(event.nativeEvent.id);
      }}
      onMapPress={(event) => props.onMapPress?.(tag(event.nativeEvent))}
      onViewportChange={(event) => {
        if (event.nativeEvent.userActionRequestKey) props.onMapInteraction?.();
        props.onViewportChange?.({
          center: tag(event.nativeEvent),
          latitudeDelta: event.nativeEvent.latitudeDelta,
          longitudeDelta: event.nativeEvent.longitudeDelta,
        });
      }}
      onCameraSettled={(event) => {
        const center = tag(event.nativeEvent);
        props.onCameraSettled?.({
          requestKey: event.nativeEvent.requestKey,
          center,
          latitudeDelta: event.nativeEvent.latitudeDelta,
          longitudeDelta: event.nativeEvent.longitudeDelta,
          visibleMapRect: event.nativeEvent.visibleMapRect,
          targetProjections: event.nativeEvent.targetProjections.map((projection) => ({
            index: projection.index,
            targetCoordinate: tag(projection.targetCoordinate),
            screenPoint: projection.screenPoint,
            insideVisibleMapRect: projection.insideVisibleMapRect,
          })),
        });
      }}
    />
  );
}
