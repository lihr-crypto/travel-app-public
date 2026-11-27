import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, {
  Marker,
  PROVIDER_DEFAULT,
  type Region,
} from 'react-native-maps';

import { assertCoordinate, assertCoordinateSystem } from '@/domain/common/coordinate';
import type { Coordinate, EntityId } from '@/domain/common/types';
import type { HomeMarkerModel } from '@/application/projections/home-markers';
import { markerColors } from '@/theme/tokens';
import { displayCrsAt } from './home-map-policy';
import { focusCenterWithinPadding } from './map-camera';
import type { MapCameraRequest, MapViewport } from './map-models';

/**
 * M10-T0/T2 — the Apple MapKit Home renderer.
 *
 * This adapter deliberately does **not** implement `MapRendererProps`. That seam
 * carries one `system` for the whole marker set and `assertMapRendererInput`
 * enforces it per marker, which is right for the single-Trip Day and Overview
 * surfaces and impossible for the cross-Trip Home, where both stored CRS
 * families coexist by construction.
 *
 * Instead the CRS authority is the M10-T0 rule: the map data at a coordinate's
 * own location decides its system (`displayCrsAt`). That single rule replaces
 * the single-`system` prop for markers, for a map press, and for the reported
 * viewport centre alike, so nothing in this file ever converts a coordinate.
 */

export interface AppleMapRendererProps {
  /** One marker per Trip (or per cluster), from `buildHomeMapProjection`. */
  markers: readonly HomeMarkerModel[];
  cameraRequest?: MapCameraRequest | null;
  onMarkerPress?: (markerId: EntityId) => void;
  onMapPress?: (coordinate: Coordinate) => void;
  onViewportChange?: (viewport: MapViewport) => void;
  /**
   * UX-C: shows the blue user-location dot. Only meaningful for the empty
   * Footprint, where there is nothing else to centre the map on.
   */
  showsUserLocation?: boolean;
  /**
   * UX-C: on the first location fix, centre the camera on the user once.
   * Later fixes never steal the camera back.
   */
  followUserLocationOnce?: boolean;
  /** Treat every supplied Home coordinate as a native Apple Maps WGS84 value. */
  appleCoordinates?: boolean;
}

/** The Home analogue of `assertMapRendererInput`, with per-coordinate CRS. */
export function assertAppleMapMarkers(
  markers: readonly HomeMarkerModel[],
  appleCoordinates = false,
): void {
  const markerIds = new Set<EntityId>();
  for (const marker of markers) {
    if (!marker.id.trim() || markerIds.has(marker.id)) {
      throw new RangeError(`Invalid or duplicate Home marker ID: ${marker.id}`);
    }
    markerIds.add(marker.id);
    assertCoordinate(marker.coordinate);

    if (appleCoordinates) {
      assertCoordinateSystem(marker.coordinate, 'wgs84');
      continue;
    }

    // A coordinate is drawable only when its stored CRS matches the map data at
    // its own location; anything else would be drawn ~500 m off (see M10-T0).
    const expected = displayCrsAt(marker.coordinate);
    if (marker.coordinate.system !== expected) {
      throw new RangeError(
        `Home marker ${marker.id} stores ${marker.coordinate.system} where the map data is ${expected}`,
      );
    }
  }
}

function nativeCoordinate(coordinate: Coordinate) {
  return { latitude: coordinate.latitude, longitude: coordinate.longitude };
}

/** Stage-03 §3.5: one marker family, state carried by visual weight. */
const weightStyles = StyleSheet.create({
  weak: { backgroundColor: markerColors.normal, opacity: 0.55 },
  normal: { backgroundColor: markerColors.normal },
  emphasized: {
    backgroundColor: markerColors.selected,
    borderColor: '#fff',
    borderWidth: 3,
  },
});

function markerText(marker: HomeMarkerModel) {
  if (marker.variant === 'cluster') {
    const count = marker.sourceItemIds?.length ?? 1;
    return count > 99 ? '99+' : String(count);
  }
  return '•';
}

function initialRegion(props: AppleMapRendererProps): Region {
  const coordinate =
    props.cameraRequest?.coordinates[0]
    ?? props.markers[0]?.coordinate;
  return {
    latitude: coordinate?.latitude ?? 0,
    longitude: coordinate?.longitude ?? 0,
    latitudeDelta: coordinate ? 0.04 : 120,
    longitudeDelta: coordinate ? 0.04 : 120,
  };
}

export function AppleMapRenderer(props: AppleMapRendererProps) {
  assertAppleMapMarkers(props.markers, props.appleCoordinates);

  const mapRef = useRef<MapView>(null);
  const appliedCameraKey = useRef<string | null>(null);
  const regionRef = useRef<Region>(initialRegion(props));
  const viewportHeightRef = useRef(0);
  const followedUserRef = useRef(false);
  const [ready, setReady] = useState(false);

  /*
   * UX-C: centre on the user once, on the first fix. Empty Footprints have no
   * markers to fit, so the user's own position is the only meaningful subject.
   */
  const handleUserLocationChange = useCallback((event: {
    nativeEvent: { coordinate?: { latitude: number; longitude: number } };
  }) => {
    const coordinate = event.nativeEvent.coordinate;
    if (
      !props.followUserLocationOnce
      || followedUserRef.current
      || !coordinate
      || !mapRef.current
    ) {
      return;
    }
    followedUserRef.current = true;
    mapRef.current.setCamera(
      { center: { latitude: coordinate.latitude, longitude: coordinate.longitude } },
    );
  }, [props.followUserLocationOnce]);

  useEffect(() => {
    const request = props.cameraRequest;
    if (!ready || !mapRef.current) return;
    if (!request) {
      appliedCameraKey.current = null;
      return;
    }

    const key = JSON.stringify(request);
    if (key === appliedCameraKey.current) return;
    appliedCameraKey.current = key;

    const coordinates = request.coordinates.map(nativeCoordinate);
    const animated = request.animated ?? true;
    if (coordinates.length === 1) {
      // Home also has a Bottom Sheet, so a single focused marker belongs in the
      // middle of the band the sheet leaves visible — same helper, same reason.
      const center = focusCenterWithinPadding({
        coordinate: request.coordinates[0],
        latitudeDelta: regionRef.current.latitudeDelta,
        padding: request.padding,
        viewportHeight: viewportHeightRef.current,
      });
      if (!animated) {
        mapRef.current.setCamera({ center: nativeCoordinate(center) });
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
        animated,
      });
    }
  }, [ready, props.cameraRequest]);

  /** A pressed point takes the CRS of the map data under it, not a fixed one. */
  function tag(coordinate: { latitude: number; longitude: number }): Coordinate {
    const system = props.appleCoordinates ? 'wgs84' : displayCrsAt(coordinate);
    // Built field by field, never spread: a region also carries its deltas, and
    // letting those leak into a Coordinate would corrupt every downstream read.
    const tagged: Coordinate = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      system,
    };
    assertCoordinate(tagged);
    return tagged;
  }

  return (
    <MapView
      ref={mapRef}
      testID="apple-map-renderer"
      style={styles.map}
      provider={PROVIDER_DEFAULT}
      initialRegion={initialRegion(props)}
      onUserLocationChange={handleUserLocationChange}
      showsUserLocation={props.showsUserLocation ?? false}
      onLayout={(event) => {
        viewportHeightRef.current = event.nativeEvent.layout.height;
      }}
      onMapReady={() => setReady(true)}
      onPress={(event) => props.onMapPress?.(tag(event.nativeEvent.coordinate))}
      onRegionChangeComplete={(region) => {
        regionRef.current = region;
        props.onViewportChange?.({
          center: tag(region),
          latitudeDelta: region.latitudeDelta,
          longitudeDelta: region.longitudeDelta,
        });
      }}
    >
      {props.markers.map((marker) => (
        <Marker
          key={marker.id}
          identifier={marker.id}
          testID={`map-marker-${marker.id}`}
          coordinate={nativeCoordinate(marker.coordinate)}
          title={marker.label}
          onPress={() => props.onMarkerPress?.(marker.id)}
        >
          <View
            style={[
              styles.marker,
              weightStyles[marker.weight],
              marker.variant === 'cluster' ? styles.cluster : null,
            ]}
          >
            <Text style={styles.markerText}>{markerText(marker)}</Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  marker: {
    alignItems: 'center',
    borderColor: '#fff',
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    justifyContent: 'center',
    minWidth: 30,
    paddingHorizontal: 5,
  },
  cluster: { borderRadius: 16, height: 32, minWidth: 32 },
  markerText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
