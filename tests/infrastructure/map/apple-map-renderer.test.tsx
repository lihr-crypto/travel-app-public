import { beforeEach, expect, jest, test } from '@jest/globals';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';

import type { HomeTripMarker } from '@/application/projections/home-map';
import {
  AppleMapRenderer,
  assertAppleMapMarkers,
  type AppleMapRendererProps,
} from '@/infrastructure/map/apple-map-renderer';

jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const animateCamera = jest.fn();
  const animateToRegion = jest.fn();
  const fitToCoordinates = jest.fn();
  const setCamera = jest.fn();
  const MapView = React.forwardRef(
    (props: { children?: ReactNode; [key: string]: unknown }, ref) => {
      React.useImperativeHandle(ref, () => ({ animateCamera, animateToRegion, fitToCoordinates, setCamera }));
      return React.createElement('MockMapView', props, props.children);
    },
  );
  MapView.displayName = 'MockMapView';
  const Marker = (props: { children?: ReactNode; [key: string]: unknown }) =>
    React.createElement('MockMarker', props, props.children);
  return {
    __esModule: true,
    default: MapView,
    Marker,
    PROVIDER_DEFAULT: 'default',
    PROVIDER_GOOGLE: 'google',
    __mock: { animateCamera, animateToRegion, fitToCoordinates, setCamera },
  };
});

const nativeCalls = jest.requireMock('react-native-maps') as {
  __mock: {
    animateCamera: ReturnType<typeof jest.fn>;
    animateToRegion: ReturnType<typeof jest.fn>;
    fitToCoordinates: ReturnType<typeof jest.fn>;
    setCamera: ReturnType<typeof jest.fn>;
  };
};

/** M10-T0 fixtures: AMap/GCJ-02 inside China, Google/WGS84 outside it. */
const tiananmen = { latitude: 39.90923, longitude: 116.397428, system: 'gcj02' as const };
const tokyo = { latitude: 35.6812, longitude: 139.7671, system: 'wgs84' as const };
const beijingWgs84 = { latitude: 39.9042, longitude: 116.4074, system: 'wgs84' as const };

function marker(overrides: Partial<HomeTripMarker> = {}): HomeTripMarker {
  return {
    id: 'trip-china',
    coordinate: tiananmen,
    label: '天安门',
    lifecycle: 'planned',
    tripId: 'trip-china',
    tripTitle: 'Trip china',
    variant: 'normal',
    weight: 'weak',
    ...overrides,
  };
}

function props(overrides: Partial<AppleMapRendererProps> = {}): AppleMapRendererProps {
  return { markers: [marker()], ...overrides };
}

function markerStyle(renderer: ReturnType<typeof create>, id: string) {
  return StyleSheet.flatten(
    renderer.root.findByProps({ testID: `map-marker-${id}` }).props.children.props.style,
  ) as { backgroundColor?: string; opacity?: number; borderWidth?: number };
}

beforeEach(() => {
  nativeCalls.__mock.animateCamera.mockClear();
  nativeCalls.__mock.animateToRegion.mockClear();
  nativeCalls.__mock.fitToCoordinates.mockClear();
  nativeCalls.__mock.setCamera.mockClear();
});

test('M10-T2: renders Apple MapKit and one marker per Trip', () => {
  const onMarkerPress = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AppleMapRenderer {...props({ onMarkerPress })} />);
  });

  const map = renderer.root.findByProps({ testID: 'apple-map-renderer' });
  // The Apple provider, not Google and not AMap.
  expect(map.props.provider).toBe('default');
  // There is deliberately no single `system` prop: that is the whole reason
  // this adapter does not implement MapRendererProps.
  expect(map.props.system).toBeUndefined();

  const rendered = renderer.root.findByProps({ testID: 'map-marker-trip-china' });
  expect(rendered.props.identifier).toBe('trip-china');
  expect(rendered.props.title).toBe('天安门');

  act(() => rendered.props.onPress());
  expect(onMarkerPress).toHaveBeenCalledWith('trip-china');
  act(() => renderer.unmount());
});

test('M10-T2: both stored CRS families render in one map', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AppleMapRenderer {...props({
      markers: [
        marker(),
        marker({ id: 'trip-japan', coordinate: tokyo, label: '東京駅', tripId: 'trip-japan' }),
      ],
    })} />);
  });

  expect(renderer.root.findByProps({ testID: 'map-marker-trip-china' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'map-marker-trip-japan' })).toBeDefined();
  act(() => renderer.unmount());
});

test('M10-T2: a marker whose stored CRS contradicts its location is refused at the boundary', () => {
  // The M10-T0 mismatch case: a global Trip holding a mainland place.
  expect(() => assertAppleMapMarkers([marker({ coordinate: beijingWgs84 })])).toThrow(
    /stores wgs84 where the map data is gcj02/,
  );
  /*
   * The component asserts before it touches a single hook, so calling it
   * directly is the synchronous form of the same check. `create()` cannot be
   * used here: React defers the render, so the throw surfaces inside whichever
   * test happens to run next.
   */
  expect(() => AppleMapRenderer(props({ markers: [marker({ coordinate: beijingWgs84 })] })))
    .toThrow(RangeError);
});

test('Home Apple coordinates accept WGS84 in mainland China and keep callback CRS WGS84', () => {
  const chinaApple = marker({ coordinate: beijingWgs84 });
  expect(() => assertAppleMapMarkers([chinaApple], true)).not.toThrow();
  expect(() => assertAppleMapMarkers([chinaApple])).toThrow(/stores wgs84 where the map data is gcj02/);

  const onMapPress = jest.fn();
  const onViewportChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AppleMapRenderer {...props({
      appleCoordinates: true,
      markers: [chinaApple],
      onMapPress,
      onViewportChange,
    })} />);
  });
  const map = renderer.root.findByProps({ testID: 'apple-map-renderer' });

  act(() => map.props.onPress({
    nativeEvent: { coordinate: { latitude: 39.9042, longitude: 116.4074 } },
  }));
  expect(onMapPress).toHaveBeenCalledWith({ ...beijingWgs84 });

  act(() => map.props.onRegionChangeComplete({
    latitude: 39.9042,
    longitude: 116.4074,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  }));
  expect(onViewportChange).toHaveBeenCalledWith(expect.objectContaining({ center: beijingWgs84 }));
  act(() => renderer.unmount());
});

test('M10-T2: duplicate and malformed markers fail closed', () => {
  expect(() => assertAppleMapMarkers([marker(), marker()])).toThrow(/duplicate/i);
  expect(() => assertAppleMapMarkers([marker({ id: '  ' })])).toThrow(RangeError);
  expect(() => assertAppleMapMarkers([
    marker({ coordinate: { latitude: 999, longitude: 0, system: 'gcj02' } }),
  ])).toThrow(RangeError);
  expect(() => assertAppleMapMarkers([])).not.toThrow();
});

test('M10-T2: a map press is tagged by the CRS of the map data under it', () => {
  const onMapPress = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AppleMapRenderer {...props({ onMapPress })} />);
  });
  const map = renderer.root.findByProps({ testID: 'apple-map-renderer' });

  act(() => map.props.onPress({ nativeEvent: { coordinate: { latitude: 39.9, longitude: 116.4 } } }));
  expect(onMapPress).toHaveBeenLastCalledWith({ latitude: 39.9, longitude: 116.4, system: 'gcj02' });

  act(() => map.props.onPress({ nativeEvent: { coordinate: { latitude: 35.68, longitude: 139.76 } } }));
  expect(onMapPress).toHaveBeenLastCalledWith({ latitude: 35.68, longitude: 139.76, system: 'wgs84' });
  act(() => renderer.unmount());
});

test('M10-T2: the reported viewport centre is tagged the same way', () => {
  const onViewportChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AppleMapRenderer {...props({ onViewportChange })} />);
  });
  const map = renderer.root.findByProps({ testID: 'apple-map-renderer' });

  act(() => map.props.onRegionChangeComplete({
    latitude: 35.68,
    longitude: 139.76,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  }));
  expect(onViewportChange).toHaveBeenCalledWith({
    center: { latitude: 35.68, longitude: 139.76, system: 'wgs84' },
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  });
  act(() => renderer.unmount());
});

test('M10-T2: lifecycle weight reaches the marker, planned lighter and active emphasised', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AppleMapRenderer {...props({
      markers: [
        marker({ id: 'planned', tripId: 'planned', weight: 'weak', lifecycle: 'planned' }),
        marker({ id: 'done', tripId: 'done', weight: 'normal', lifecycle: 'completed' }),
        marker({ id: 'active', tripId: 'active', weight: 'emphasized', lifecycle: 'active' }),
      ],
    })} />);
  });

  expect(markerStyle(renderer, 'planned').opacity).toBe(0.55);
  expect(markerStyle(renderer, 'done').opacity).toBeUndefined();
  expect(markerStyle(renderer, 'active').borderWidth).toBe(3);
  act(() => renderer.unmount());
});

test('M10-T2: a cluster shows its count, capped at 99+', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AppleMapRenderer {...props({
      markers: [
        marker({ id: 'cluster-3', variant: 'cluster', sourceItemIds: ['a', 'b', 'c'] }),
        marker({ id: 'cluster-many', variant: 'cluster', sourceItemIds: Array.from({ length: 120 }, (_, i) => `t${i}`) }),
      ],
    })} />);
  });

  const textOf = (id: string) =>
    renderer.root.findByProps({ testID: `map-marker-${id}` }).props.children.props.children.props.children;
  expect(textOf('cluster-3')).toBe('3');
  expect(textOf('cluster-many')).toBe('99+');
  act(() => renderer.unmount());
});

test('M10-T2: the camera fits every Trip and honours a single-coordinate request', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AppleMapRenderer {...props({
      cameraRequest: { coordinates: [tiananmen, tokyo] },
      markers: [marker(), marker({ id: 'trip-japan', coordinate: tokyo, tripId: 'trip-japan' })],
    })} />);
  });
  const map = renderer.root.findByProps({ testID: 'apple-map-renderer' });

  act(() => map.props.onMapReady());
  expect(nativeCalls.__mock.fitToCoordinates).toHaveBeenCalledTimes(1);
  expect(nativeCalls.__mock.fitToCoordinates.mock.calls[0][0]).toEqual([
    { latitude: tiananmen.latitude, longitude: tiananmen.longitude },
    { latitude: tokyo.latitude, longitude: tokyo.longitude },
  ]);

  // Re-applying the same request must not re-animate.
  act(() => map.props.onMapReady());
  expect(nativeCalls.__mock.fitToCoordinates).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('Home refresh requests switch distant bounds and single targets without animation', () => {
  let renderer!: ReturnType<typeof create>;
  const two = props({
    markers: [marker(), marker({ id: 'japan', tripId: 'japan', coordinate: tokyo })],
    cameraRequest: { coordinates: [tiananmen, tokyo], animated: false, scopeKey: 'home:all' },
  });
  act(() => { renderer = create(<AppleMapRenderer {...two} />); });
  act(() => renderer.root.findByProps({ testID: 'apple-map-renderer' }).props.onMapReady());
  expect(nativeCalls.__mock.fitToCoordinates).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ animated: false }));
  act(() => renderer.update(<AppleMapRenderer {...props({
    markers: [marker({ coordinate: tokyo })],
    cameraRequest: { coordinates: [tokyo], animated: false, scopeKey: 'home:completed' },
  })} />));
  expect(nativeCalls.__mock.setCamera).toHaveBeenLastCalledWith({ center: { latitude: tokyo.latitude, longitude: tokyo.longitude } });
  act(() => renderer.update(<AppleMapRenderer {...two} />));
  expect(nativeCalls.__mock.fitToCoordinates).toHaveBeenCalledTimes(2);
  expect(nativeCalls.__mock.animateCamera).not.toHaveBeenCalled();
  expect(nativeCalls.__mock.animateToRegion).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('one-shot Home location focus sets the view directly rather than flying across regions', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(<AppleMapRenderer markers={[]} followUserLocationOnce showsUserLocation />); });
  const map = renderer.root.findByProps({ testID: 'apple-map-renderer' });
  act(() => {
    map.props.onMapReady();
    map.props.onUserLocationChange({ nativeEvent: { coordinate: { latitude: tokyo.latitude, longitude: tokyo.longitude } } });
    map.props.onUserLocationChange({ nativeEvent: { coordinate: { latitude: tiananmen.latitude, longitude: tiananmen.longitude } } });
  });
  expect(nativeCalls.__mock.setCamera).toHaveBeenCalledTimes(1);
  expect(nativeCalls.__mock.animateCamera).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});
