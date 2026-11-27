import { beforeEach, expect, jest, test } from '@jest/globals';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { act, create } from 'react-test-renderer';

import { GoogleMapRenderer } from '@/infrastructure/map/google-map-renderer';
import type { MapRendererProps } from '@/infrastructure/map/map-renderer';

jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const animateCamera = jest.fn();
  const animateToRegion = jest.fn();
  const fitToCoordinates = jest.fn();
  const setCamera = jest.fn();
  const getCamera = jest.fn(async () => ({
    center: { latitude: 0, longitude: 0 },
    heading: 12,
    pitch: 3,
    zoom: 8,
  }));
  const pointForCoordinate = jest.fn(async (coordinate: { latitude: number; longitude: number }) => ({
    x: coordinate.longitude,
    y: coordinate.latitude,
  }));
  const mapInstance = {
    animateCamera,
    animateToRegion,
    fitToCoordinates,
    setCamera,
    getCamera,
    pointForCoordinate,
  };
  const MapView = React.forwardRef(
    function MockMapView(props: { children?: ReactNode; [key: string]: unknown }, ref) {
      React.useImperativeHandle(ref, () => mapInstance);
      return React.createElement('MockMapView', props, props.children);
    },
  );
  const Marker = (props: { children?: ReactNode; [key: string]: unknown }) =>
    React.createElement('MockMarker', props, props.children);
  return {
    __esModule: true,
    default: MapView,
    Marker,
    PROVIDER_GOOGLE: 'google',
    __mock: {
      animateCamera,
      animateToRegion,
      fitToCoordinates,
      setCamera,
      getCamera,
      pointForCoordinate,
    },
  };
});

const nativeCalls = jest.requireMock('react-native-maps') as {
  __mock: {
    animateCamera: ReturnType<typeof jest.fn>;
    animateToRegion: ReturnType<typeof jest.fn>;
    fitToCoordinates: ReturnType<typeof jest.fn>;
    setCamera: ReturnType<typeof jest.fn>;
    getCamera: ReturnType<typeof jest.fn>;
    pointForCoordinate: ReturnType<typeof jest.fn>;
  };
};
const wgs84 = { latitude: -33.8683, longitude: 151.2086, system: 'wgs84' as const };
const second = { latitude: -37.8136, longitude: 144.9631, system: 'wgs84' as const };

beforeEach(() => {
  nativeCalls.__mock.pointForCoordinate.mockClear();
  nativeCalls.__mock.pointForCoordinate.mockImplementation(async (coordinate: {
    latitude: number;
    longitude: number;
  }) => ({ x: coordinate.longitude, y: coordinate.latitude }));
});

function props(overrides: Partial<MapRendererProps> = {}): MapRendererProps {
  return {
    system: 'wgs84',
    markers: [{
      id: 'item-1',
      coordinate: wgs84,
      ordinal: 1,
      label: 'Sydney',
      variant: 'normal',
    }],
    ...overrides,
  };
}

function marker(
  id: string,
  coordinate: typeof wgs84,
  placeId = id,
): MapRendererProps['markers'][number] {
  return {
    id,
    coordinate,
    ordinal: 1,
    label: id,
    variant: 'normal',
    placeIds: [placeId],
    sourceItemIds: [`${id}-occurrence-1`, `${id}-occurrence-2`],
  };
}

function renderedMarkerTestIds(renderer: ReturnType<typeof create>) {
  return [...new Set(renderer.root.findAll((node) =>
    typeof node.props.testID === 'string' && node.props.testID.startsWith('map-marker-'),
  ).map((node) => node.props.testID as string))].sort();
}

async function flushProjection() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test('uses Google provider, renders occurrence markers, and tags map events WGS84', () => {
  const onMarkerPress = jest.fn();
  const onMapPress = jest.fn();
  const onViewportChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<GoogleMapRenderer {...props({
      onMarkerPress,
      onMapPress,
      onViewportChange,
    })} />);
  });

  const map = renderer.root.findByProps({ testID: 'google-map-renderer' });
  const marker = renderer.root.findByProps({ testID: 'map-marker-item-1' });
  expect(map.props.provider).toBe('google');
  expect(marker.props.identifier).toBe('item-1');
  expect(marker.props.coordinate).toEqual({ latitude: wgs84.latitude, longitude: wgs84.longitude });
  expect(marker.props.anchor).toEqual({ x: 0.5, y: 0.875 });
  expect(marker.props.zIndex).toBe(0);
  expect(JSON.stringify(renderer.toJSON())).toContain('1');
  expect(nativeCalls.__mock.pointForCoordinate).not.toHaveBeenCalled();

  act(() => {
    marker.props.onPress();
    map.props.onPress({ nativeEvent: { coordinate: { latitude: 1, longitude: 2 } } });
    map.props.onRegionChangeComplete({
      latitude: 3,
      longitude: 4,
      latitudeDelta: 0.1,
      longitudeDelta: 0.2,
    });
  });
  expect(onMarkerPress).toHaveBeenCalledWith('item-1');
  expect(onMapPress).toHaveBeenCalledWith({ latitude: 1, longitude: 2, system: 'wgs84' });
  expect(onViewportChange).toHaveBeenCalledWith({
    center: { latitude: 3, longitude: 4, system: 'wgs84' },
    latitudeDelta: 0.1,
    longitudeDelta: 0.2,
  });

  act(() => renderer.update(<GoogleMapRenderer {...props({
    markers: [{
      id: 'item-1',
      coordinate: wgs84,
      ordinal: 1,
      label: 'Sydney',
      variant: 'selected',
    }],
    onMarkerPress,
    onMapPress,
    onViewportChange,
  })} />));
  const selectedMarker = renderer.root.findByProps({ testID: 'map-marker-item-1' });
  expect(selectedMarker.props.coordinate)
    .toEqual({ latitude: wgs84.latitude, longitude: wgs84.longitude });
  expect(selectedMarker.props.anchor).toEqual({ x: 0.5, y: 50 / 56 });
  expect(selectedMarker.props.zIndex).toBe(1000);
  act(() => renderer.unmount());
});

test('uses native screen points to badge close locations and forwards all source members', async () => {
  const markers = [
    { ...marker('item-a', wgs84, 'place-a'), variant: 'selected' as const },
    marker('item-b', second, 'place-b'),
  ];
  nativeCalls.__mock.pointForCoordinate.mockImplementation(async (coordinate: {
    latitude: number;
    longitude: number;
  }) => coordinate.latitude === wgs84.latitude
    ? { x: 100, y: 100 }
    : { x: 118, y: 108 });
  const onClusterPress = jest.fn();
  const onMarkerPress = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<GoogleMapRenderer {...props({
      markers,
      clusterMarkers: true,
      onClusterPress,
      onMarkerPress,
    })} />);
  });

  const map = renderer.root.findByProps({ testID: 'google-map-renderer' });
  await act(async () => {
    map.props.onLayout({ nativeEvent: { layout: { width: 400, height: 800 } } });
    map.props.onMapReady();
    await flushProjection();
  });
  await act(async () => { await flushProjection(); });

  expect(nativeCalls.__mock.pointForCoordinate).toHaveBeenNthCalledWith(1, {
    latitude: wgs84.latitude,
    longitude: wgs84.longitude,
  });
  expect(nativeCalls.__mock.pointForCoordinate).toHaveBeenNthCalledWith(2, {
    latitude: second.latitude,
    longitude: second.longitude,
  });
  expect(nativeCalls.__mock.pointForCoordinate).toHaveBeenCalledTimes(2);
  expect(renderedMarkerTestIds(renderer)).toEqual([
    'map-marker-overview-proximity:item-a|item-b',
  ]);
  const badgeMarker = renderer.root.findByProps({
    testID: 'map-marker-overview-proximity:item-a|item-b',
  });
  expect(badgeMarker.props.coordinate).toEqual({
    latitude: wgs84.latitude,
    longitude: wgs84.longitude,
  });
  expect(badgeMarker.props.anchor).toEqual({ x: 0.5, y: 0.5 });
  expect(badgeMarker.props.zIndex).toBe(1000);
  expect(renderer.root.findByProps({
    testID: 'map-pin-overview-proximity:item-a|item-b-count',
  }).props.children).toBe('2');
  expect(renderer.root.find((node) =>
    node.type === View && node.props.testID === 'map-pin-overview-proximity:item-a|item-b',
  ).props.style).toMatchObject({ width: 52, height: 52 });
  act(() => badgeMarker.props.onPress());
  expect(onClusterPress).toHaveBeenCalledWith(markers);
  expect(onMarkerPress).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('keeps original pins and singleton presses when native projection fails', async () => {
  const markers = [marker('item-a', wgs84), marker('item-b', second)];
  nativeCalls.__mock.pointForCoordinate.mockRejectedValue(new Error('projection unavailable'));
  const onClusterPress = jest.fn();
  const onMarkerPress = jest.fn();
  const clusterProps = props({ markers, clusterMarkers: true, onClusterPress, onMarkerPress });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<GoogleMapRenderer {...clusterProps} />);
  });
  const map = renderer.root.findByProps({ testID: 'google-map-renderer' });
  await act(async () => {
    map.props.onLayout({ nativeEvent: { layout: { width: 400, height: 800 } } });
    map.props.onMapReady();
    await flushProjection();
  });

  expect(renderedMarkerTestIds(renderer)).toEqual([
    'map-marker-item-a',
    'map-marker-item-b',
  ]);
  act(() => {
    renderer.root.findByProps({ testID: 'map-marker-item-a' }).props.onPress();
    renderer.root.findByProps({ testID: 'map-marker-item-b' }).props.onPress();
  });
  expect(onMarkerPress.mock.calls).toEqual([['item-a'], ['item-b']]);
  expect(onClusterPress).not.toHaveBeenCalled();

  act(() => renderer.update(<GoogleMapRenderer {...clusterProps} />));
  expect(nativeCalls.__mock.pointForCoordinate).toHaveBeenCalledTimes(2);
  act(() => renderer.unmount());
});

test('reprojects after a viewport change and splits a formerly close pair', async () => {
  const markers = [marker('item-a', wgs84), marker('item-b', second)];
  let deferViewportProjection = false;
  const deferredPoints: ((point: { x: number; y: number }) => void)[] = [];
  let closeTogether = true;
  nativeCalls.__mock.pointForCoordinate.mockImplementation((coordinate: {
    latitude: number;
    longitude: number;
  }) => {
    if (deferViewportProjection) {
      return new Promise((resolve) => deferredPoints.push(resolve));
    }
    return Promise.resolve(coordinate.latitude === wgs84.latitude
      ? { x: 100, y: 100 }
      : { x: closeTogether ? 118 : 220, y: 100 });
  });
  const onMapInteraction = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<GoogleMapRenderer {...props({
      markers,
      clusterMarkers: true,
      onMapInteraction,
    })} />);
  });
  let map = renderer.root.findByProps({ testID: 'google-map-renderer' });
  await act(async () => {
    map.props.onLayout({ nativeEvent: { layout: { width: 400, height: 800 } } });
    map.props.onMapReady();
    await flushProjection();
  });
  expect(renderedMarkerTestIds(renderer)).toHaveLength(1);

  closeTogether = false;
  deferViewportProjection = true;
  map = renderer.root.findByProps({ testID: 'google-map-renderer' });
  const region = {
    latitude: -35,
    longitude: 148,
    latitudeDelta: 0.2,
    longitudeDelta: 0.2,
  };
  act(() => map.props.onRegionChangeStart(region, { isGesture: true }));
  expect(renderedMarkerTestIds(renderer)).toHaveLength(1);
  act(() => map.props.onRegionChangeComplete(region, { isGesture: true }));
  expect(deferredPoints).toHaveLength(2);
  expect(renderedMarkerTestIds(renderer)).toHaveLength(1);
  expect(onMapInteraction).toHaveBeenCalledTimes(1);
  await act(async () => {
    deferredPoints[0]({ x: 100, y: 100 });
    deferredPoints[1]({ x: 220, y: 100 });
    await flushProjection();
  });
  expect(nativeCalls.__mock.pointForCoordinate).toHaveBeenCalledTimes(4);
  expect(renderedMarkerTestIds(renderer)).toEqual([
    'map-marker-item-a',
    'map-marker-item-b',
  ]);
  act(() => renderer.unmount());
});

test('ignores stale screen projections after source and viewport changes', async () => {
  const firstSource = [marker('item-a', wgs84), marker('item-b', second)];
  const secondSource = [marker('next-a', wgs84), marker('next-b', second)];
  const pending: {
    resolve: (point: { x: number; y: number }) => void;
    reject: (reason?: unknown) => void;
  }[] = [];
  nativeCalls.__mock.pointForCoordinate.mockImplementation(() => new Promise((resolve, reject) => {
    pending.push({ resolve, reject });
  }));

  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<GoogleMapRenderer {...props({
      markers: firstSource,
      clusterMarkers: true,
    })} />);
  });
  let map = renderer.root.findByProps({ testID: 'google-map-renderer' });
  await act(async () => {
    map.props.onLayout({ nativeEvent: { layout: { width: 400, height: 800 } } });
    map.props.onMapReady();
    await flushProjection();
  });
  expect(pending).toHaveLength(2);

  await act(async () => {
    renderer.update(<GoogleMapRenderer {...props({
      markers: secondSource,
      clusterMarkers: true,
    })} />);
    await flushProjection();
  });
  expect(pending).toHaveLength(4);

  map = renderer.root.findByProps({ testID: 'google-map-renderer' });
  const region = {
    latitude: -35,
    longitude: 148,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  };
  await act(async () => {
    map.props.onRegionChangeStart(region, { isGesture: true });
    map.props.onRegionChangeComplete(region);
    await flushProjection();
  });
  expect(pending).toHaveLength(6);

  await act(async () => {
    pending[4].resolve({ x: 100, y: 100 });
    pending[5].resolve({ x: 220, y: 100 });
    await flushProjection();
  });
  expect(renderedMarkerTestIds(renderer)).toEqual([
    'map-marker-next-a',
    'map-marker-next-b',
  ]);

  await act(async () => {
    pending[2].reject(new Error('old viewport projection failed'));
    pending[3].reject(new Error('old viewport projection failed'));
    pending[0].reject(new Error('old source projection failed'));
    pending[1].reject(new Error('old source projection failed'));
    await flushProjection();
  });
  expect(renderedMarkerTestIds(renderer)).toEqual([
    'map-marker-next-a',
    'map-marker-next-b',
  ]);
  act(() => renderer.unmount());
});

test('reports only real user map gestures, never programmatic camera movement', () => {
  const onMapInteraction = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<GoogleMapRenderer {...props({ onMapInteraction })} />);
  });
  const map = renderer.root.findByProps({ testID: 'google-map-renderer' });
  const region = {
    latitude: -35,
    longitude: 148,
    latitudeDelta: 0.2,
    longitudeDelta: 0.2,
  };

  act(() => {
    map.props.onRegionChangeStart(region, { isGesture: false });
    map.props.onRegionChangeComplete(region, { isGesture: false });
  });
  expect(onMapInteraction).not.toHaveBeenCalled();

  act(() => {
    map.props.onRegionChangeStart(region, { isGesture: true });
    map.props.onRegionChangeStart(region, { isGesture: true });
  });
  expect(onMapInteraction).toHaveBeenCalledTimes(1);
  act(() => map.props.onRegionChangeComplete(region, { isGesture: true }));

  act(() => {
    map.props.onRegionChangeStart(region, { isGesture: true });
    map.props.onRegionChangeComplete(region, { isGesture: true });
  });
  expect(onMapInteraction).toHaveBeenCalledTimes(2);
  act(() => renderer.unmount());
});

test('does not use Unscheduled markers as the Overview map’s initial camera target', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<GoogleMapRenderer {...props({
      markers: [{
        id: 'unscheduled-1',
        coordinate: second,
        label: 'Unscheduled place',
        variant: 'unscheduled',
      }],
    })} />);
  });

  expect(renderer.root.findByProps({ testID: 'google-map-renderer' }).props.initialRegion)
    .toEqual({ latitude: 0, longitude: 0, latitudeDelta: 120, longitudeDelta: 120 });
  act(() => renderer.unmount());
});

test('applies a camera request after map readiness and deduplicates unchanged requests', () => {
  nativeCalls.__mock.animateCamera.mockClear();
  nativeCalls.__mock.fitToCoordinates.mockClear();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<GoogleMapRenderer {...props({
      cameraRequest: { coordinates: [wgs84] },
    })} />);
  });
  expect(nativeCalls.__mock.animateCamera).not.toHaveBeenCalled();

  act(() => renderer.root.findByProps({ testID: 'google-map-renderer' }).props.onMapReady());
  expect(nativeCalls.__mock.animateCamera).toHaveBeenCalledWith(
    { center: { latitude: wgs84.latitude, longitude: wgs84.longitude } },
    { duration: 250 },
  );
  act(() => renderer.update(<GoogleMapRenderer {...props({
    cameraRequest: { coordinates: [wgs84] },
  })} />));
  expect(nativeCalls.__mock.animateCamera).toHaveBeenCalledTimes(1);

  act(() => renderer.update(<GoogleMapRenderer {...props({
    cameraRequest: { coordinates: [wgs84], requestId: 1 },
  })} />));
  expect(nativeCalls.__mock.animateCamera).toHaveBeenCalledTimes(2);

  act(() => renderer.update(<GoogleMapRenderer {...props({
    cameraRequest: {
      coordinates: [wgs84, second],
      padding: { top: 4, right: 3, bottom: 2, left: 1 },
    },
  })} />));
  expect(nativeCalls.__mock.fitToCoordinates).toHaveBeenCalledWith(
    [
      { latitude: wgs84.latitude, longitude: wgs84.longitude },
      { latitude: second.latitude, longitude: second.longitude },
    ],
    { edgePadding: { top: 4, right: 3, bottom: 2, left: 1 }, animated: true },
  );
  act(() => renderer.unmount());
});

test('keeps a single-coordinate focus inside the sheet padding', () => {
  nativeCalls.__mock.animateCamera.mockClear();
  nativeCalls.__mock.animateToRegion.mockClear();
  const padding = { top: 0, right: 0, bottom: 400, left: 0 };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<GoogleMapRenderer {...props({
      cameraRequest: { coordinates: [wgs84], padding, requestId: 7 },
    })} />);
  });

  const map = renderer.root.findByProps({ testID: 'google-map-renderer' });
  act(() => map.props.onLayout({ nativeEvent: { layout: { height: 800 } } }));
  act(() => map.props.onRegionChangeComplete({
    latitude: wgs84.latitude,
    longitude: wgs84.longitude,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  }));
  act(() => map.props.onMapReady());

  // The sheet hides the bottom half, so the focus has to sit 0.02° north of the
  // geometric centre for the Place to appear in the middle of the visible band.
  expect(nativeCalls.__mock.animateCamera).not.toHaveBeenCalled();
  expect(nativeCalls.__mock.animateToRegion).toHaveBeenCalledTimes(1);
  const [region, duration] = nativeCalls.__mock.animateToRegion.mock.calls[0] as [
    { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
    number,
  ];
  expect(region.latitude).toBeCloseTo(wgs84.latitude - 0.02, 10);
  expect(region.longitude).toBe(wgs84.longitude);
  expect(region.latitudeDelta).toBe(0.08);
  expect(region.longitudeDelta).toBe(0.08);
  expect(duration).toBe(250);
  act(() => renderer.unmount());
});

test('applies an unanimated single padded focus with setCamera and keeps the existing zoom', async () => {
  nativeCalls.__mock.animateCamera.mockClear();
  nativeCalls.__mock.animateToRegion.mockClear();
  nativeCalls.__mock.setCamera.mockClear();
  const padding = { top: 0, right: 0, bottom: 400, left: 0 };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<GoogleMapRenderer {...props({
      cameraRequest: { coordinates: [wgs84], padding, animated: false },
    })} />);
  });
  const map = renderer.root.findByProps({ testID: 'google-map-renderer' });
  act(() => map.props.onLayout({ nativeEvent: { layout: { height: 800 } } }));
  act(() => map.props.onRegionChangeComplete({
    latitude: wgs84.latitude,
    longitude: wgs84.longitude,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  }));
  await act(async () => {
    map.props.onMapReady();
    await Promise.resolve();
  });

  expect(nativeCalls.__mock.setCamera).toHaveBeenCalledWith({
    center: { latitude: wgs84.latitude - 0.02, longitude: wgs84.longitude },
    heading: 12,
    pitch: 3,
    zoom: 8,
  });
  expect(nativeCalls.__mock.animateCamera).not.toHaveBeenCalled();
  expect(nativeCalls.__mock.animateToRegion).not.toHaveBeenCalled();

  act(() => renderer.update(<GoogleMapRenderer {...props({
    cameraRequest: { coordinates: [wgs84, second], animated: false },
  })} />));
  expect(nativeCalls.__mock.fitToCoordinates).toHaveBeenLastCalledWith(
    [
      { latitude: wgs84.latitude, longitude: wgs84.longitude },
      { latitude: second.latitude, longitude: second.longitude },
    ],
    { edgePadding: { top: 0, right: 0, bottom: 0, left: 0 }, animated: false },
  );
  act(() => renderer.unmount());
});

test('uses partial setCamera without animation when getCamera rejects', async () => {
  nativeCalls.__mock.getCamera.mockRejectedValueOnce(new Error('camera read failed'));
  nativeCalls.__mock.animateCamera.mockClear();
  nativeCalls.__mock.animateToRegion.mockClear();
  nativeCalls.__mock.setCamera.mockClear();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<GoogleMapRenderer {...props({
      cameraRequest: { coordinates: [wgs84], animated: false },
    })} />);
  });
  const map = renderer.root.findByProps({ testID: 'google-map-renderer' });
  await act(async () => {
    map.props.onMapReady();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(nativeCalls.__mock.setCamera).toHaveBeenCalledWith({
    center: { latitude: wgs84.latitude, longitude: wgs84.longitude },
  });
  expect(nativeCalls.__mock.animateCamera).not.toHaveBeenCalled();
  expect(nativeCalls.__mock.animateToRegion).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('falls back to the plain centre while the map geometry is unknown', () => {
  nativeCalls.__mock.animateCamera.mockClear();
  nativeCalls.__mock.animateToRegion.mockClear();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<GoogleMapRenderer {...props({
      cameraRequest: {
        coordinates: [wgs84],
        padding: { top: 0, right: 0, bottom: 400, left: 0 },
      },
    })} />);
  });

  act(() => renderer.root.findByProps({ testID: 'google-map-renderer' }).props.onMapReady());

  expect(nativeCalls.__mock.animateToRegion).not.toHaveBeenCalled();
  expect(nativeCalls.__mock.animateCamera).toHaveBeenCalledWith(
    { center: { latitude: wgs84.latitude, longitude: wgs84.longitude } },
    { duration: 250 },
  );
  act(() => renderer.unmount());
});

test('rejects non-WGS84 data before passing it to Google native map', () => {
  expect(() => GoogleMapRenderer(props({ system: 'gcj02' })))
    .toThrow('Coordinate system wgs84 does not match gcj02');
});

test('a manual pan is not reclaimed by the old request, and the next Day request still applies', () => {
  nativeCalls.__mock.animateCamera.mockClear();
  let renderer!: ReturnType<typeof create>;
  const dayOne = { coordinates: [wgs84], requestId: 1, scopeKey: 'day-1' };
  act(() => {
    renderer = create(<GoogleMapRenderer {...props({ cameraRequest: dayOne })} />);
  });
  act(() => renderer.root.findByProps({ testID: 'google-map-renderer' }).props.onMapReady());
  expect(nativeCalls.__mock.animateCamera).toHaveBeenCalledTimes(1);

  // The user pans the same map somewhere else.
  act(() => {
    renderer.root.findByProps({ testID: 'google-map-renderer' }).props.onRegionChangeComplete({
      latitude: 10,
      longitude: 20,
      latitudeDelta: 0.5,
      longitudeDelta: 0.5,
    });
  });

  // Re-rendering the identical request must not pull the map back.
  act(() => {
    renderer.update(<GoogleMapRenderer {...props({ cameraRequest: { ...dayOne } })} />);
  });
  expect(nativeCalls.__mock.animateCamera).toHaveBeenCalledTimes(1);

  // A new Day request carries a new key and is applied to the same map.
  act(() => {
    renderer.update(<GoogleMapRenderer
      {...props({ cameraRequest: { coordinates: [wgs84], requestId: 2, scopeKey: 'day-2' } })}
    />);
  });
  expect(nativeCalls.__mock.animateCamera).toHaveBeenCalledTimes(2);

  act(() => renderer.unmount());
});
