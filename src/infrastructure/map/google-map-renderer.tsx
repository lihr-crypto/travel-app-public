import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type Details,
  type Region,
} from 'react-native-maps';

import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type { Coordinate } from '@/domain/common/types';
import { focusCenterWithinPadding } from './map-camera';
import type { MarkerProjectionSnapshot } from './marker-clustering';
import { getMapPinGeometry, MapPin } from './map-pin';
import {
  assertMapRendererInput,
  type MapRendererProps,
} from './map-renderer';
import { useMarkerClustering } from './use-marker-clustering';

function nativeCoordinate(coordinate: Coordinate) {
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };
}

function initialRegion(props: MapRendererProps): Region {
  const coordinate =
    props.cameraRequest?.coordinates[0]
      ?? props.markers.find(({ variant }) => variant !== 'unscheduled')?.coordinate;
  return {
    latitude: coordinate?.latitude ?? 0,
    longitude: coordinate?.longitude ?? 0,
    latitudeDelta: coordinate ? 0.04 : 120,
    longitudeDelta: coordinate ? 0.04 : 120,
  };
}

/** Google iOS adapter. Native key/config and device gates are owned by M4-T7/T9. */
export function GoogleMapRenderer(props: MapRendererProps) {
  assertMapRendererInput(props);
  if (props.system !== 'wgs84') {
    throw new RangeError('GoogleMapRenderer requires wgs84 coordinates');
  }

  const { projectionRequestKey, groups, updateProjection } = useMarkerClustering(
    props.markers,
    props.clusterMarkers === true,
  );
  const mapRef = useRef<MapView>(null);
  const appliedCameraKey = useRef<string | null>(null);
  const awaitingCameraKey = useRef<string | null>(null);
  const regionRef = useRef<Region>(initialRegion(props));
  const markerSourceRef = useRef(props.markers);
  const viewportHeightRef = useRef(0);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [projectionEpoch, setProjectionEpoch] = useState(0);
  const projectionRevisionRef = useRef(0);
  const projectionSourceKeyRef = useRef(projectionRequestKey);
  const userGestureActiveRef = useRef(false);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    projectionSourceKeyRef.current = projectionRequestKey;
    projectionRevisionRef.current += 1;
    return () => {
      projectionRevisionRef.current += 1;
    };
  }, [projectionRequestKey]);

  useLayoutEffect(() => {
    markerSourceRef.current = props.markers;
  }, [props.markers]);

  useEffect(() => {
    const request = props.cameraRequest;
    if (!ready || !mapRef.current) return;
    if (!request) {
      appliedCameraKey.current = null;
      awaitingCameraKey.current = null;
      return;
    }

    const key = JSON.stringify(request);
    if (key === appliedCameraKey.current) return;
    appliedCameraKey.current = key;
    awaitingCameraKey.current = key;

    const coordinates = request.coordinates.map(nativeCoordinate);
    if (coordinates.length === 1) {
      // A focused Place belongs in the middle of the band the Bottom Sheet leaves
      // visible, not in the middle of the whole view (see `map-camera.ts`).
      const center = focusCenterWithinPadding({
        coordinate: request.coordinates[0],
        latitudeDelta: regionRef.current.latitudeDelta,
        padding: request.padding,
        viewportHeight: viewportHeightRef.current,
      });
      if (request.animated === false) {
        const map = mapRef.current;
        void map.getCamera().then((camera) => {
          if (appliedCameraKey.current === key && mapRef.current === map) {
            map.setCamera({ ...camera, center: nativeCoordinate(center) });
          }
        }).catch(() => {
          // setCamera merges omitted fields on the native map implementation;
          // keep the latest request without falling back to animation.
          if (appliedCameraKey.current === key && mapRef.current === map) {
            map.setCamera({ center: nativeCoordinate(center) } as Parameters<typeof map.setCamera>[0]);
          }
        });
      } else if (center.latitude === request.coordinates[0].latitude) {
        mapRef.current.animateCamera({ center: coordinates[0] }, { duration: 250 });
      } else {
        mapRef.current.animateToRegion({
          ...nativeCoordinate(center),
          latitudeDelta: regionRef.current.latitudeDelta,
          longitudeDelta: regionRef.current.longitudeDelta,
        }, 250);
      }
    } else {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: request.padding ?? { top: 0, right: 0, bottom: 0, left: 0 },
        animated: request.animated !== false,
      });
    }
  }, [ready, props.cameraRequest]);

  useEffect(() => {
    const revision = ++projectionRevisionRef.current;
    const requestKey = projectionRequestKey;
    const map = mapRef.current;
    if (!props.clusterMarkers || !ready || !map) return;

    const { width, height } = viewportSize;
    const invalidSnapshot: MarkerProjectionSnapshot = {
      requestKey,
      revision,
      width: 0,
      height: 0,
      points: [],
    };
    const isCurrentProjection = () =>
      revision === projectionRevisionRef.current
      && projectionSourceKeyRef.current === requestKey
      && mapRef.current === map;
    const markers = markerSourceRef.current;
    if (markers.length === 0) {
      updateProjection({ requestKey, revision, width, height, points: [] });
      return;
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      if (isCurrentProjection()) updateProjection(invalidSnapshot);
      return;
    }

    void Promise.all(markers.map(async (marker) =>
      map.pointForCoordinate(nativeCoordinate(marker.coordinate))))
      .then((projectedPoints) => {
        if (!isCurrentProjection()) return;
        if (
          projectedPoints.length !== markers.length
          || projectedPoints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
        ) {
          updateProjection(invalidSnapshot);
          return;
        }
        updateProjection({
          requestKey,
          revision,
          width,
          height,
          points: markers.map((marker, index) => ({
            id: marker.id,
            x: projectedPoints[index].x,
            y: projectedPoints[index].y,
          })),
        });
      })
      .catch(() => {
        if (isCurrentProjection()) updateProjection(invalidSnapshot);
      });
  }, [
    props.clusterMarkers,
    ready,
    viewportSize,
    projectionEpoch,
    projectionRequestKey,
    updateProjection,
  ]);

  function handleMapPress(coordinate: { latitude: number; longitude: number }) {
    const tagged: Coordinate = { ...coordinate, system: 'wgs84' };
    assertCoordinateSystem(tagged, 'wgs84');
    props.onMapPress?.(tagged);
  }

  function notifyUserMapInteraction() {
    if (userGestureActiveRef.current) return;
    userGestureActiveRef.current = true;
    props.onMapInteraction?.();
  }

  function handleRegionChange(region: Region, details?: Details) {
    if (details?.isGesture) notifyUserMapInteraction();
    regionRef.current = region;
    if (props.clusterMarkers) setProjectionEpoch((epoch) => epoch + 1);
    const center: Coordinate = {
      latitude: region.latitude,
      longitude: region.longitude,
      system: 'wgs84',
    };
    assertCoordinateSystem(center, 'wgs84');
    props.onViewportChange?.({
      center,
      latitudeDelta: region.latitudeDelta,
      longitudeDelta: region.longitudeDelta,
    });
    const requestKey = awaitingCameraKey.current;
    if (requestKey !== null) {
      awaitingCameraKey.current = null;
      props.onCameraSettled?.({
        requestKey,
        center,
        latitudeDelta: region.latitudeDelta,
        longitudeDelta: region.longitudeDelta,
      });
    }
    userGestureActiveRef.current = false;
  }

  function handleRegionChangeStart(_region: Region, details?: Details) {
    if (details?.isGesture) notifyUserMapInteraction();
    if (props.clusterMarkers) projectionRevisionRef.current += 1;
  }

  return (
    <MapView
      ref={mapRef}
      testID="google-map-renderer"
      style={styles.map}
      provider={PROVIDER_GOOGLE}
      initialRegion={initialRegion(props)}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        viewportHeightRef.current = height;
        setViewportSize((previous) => previous.width === width && previous.height === height
          ? previous
          : { width, height });
      }}
      onMapReady={() => setReady(true)}
      onPress={(event) => handleMapPress(event.nativeEvent.coordinate)}
      onRegionChangeStart={handleRegionChangeStart}
      onRegionChangeComplete={handleRegionChange}
    >
      {groups.map(({ marker, members }) => (
        <Marker
          key={marker.id}
          identifier={marker.id}
          testID={`map-marker-${marker.id}`}
          coordinate={nativeCoordinate(marker.coordinate)}
          title={marker.label}
          onPress={() => {
            if (marker.clusterCount !== undefined || members.length > 1) {
              props.onClusterPress?.(members);
            } else {
              props.onMarkerPress?.(members[0]?.id ?? marker.id);
            }
          }}
          anchor={marker.clusterCount !== undefined
            ? { x: 0.5, y: 0.5 }
            : getMapPinGeometry(marker.variant === 'selected').googleAnchor}
          zIndex={marker.variant === 'selected' ? 1000 : 0}
        >
          <MapPin
            testID={`map-pin-${marker.id}`}
            variant={marker.variant}
            ordinal={marker.ordinal}
            clusterCount={marker.clusterCount}
          />
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
