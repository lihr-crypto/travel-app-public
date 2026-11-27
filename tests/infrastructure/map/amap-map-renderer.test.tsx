import { expect, jest, test } from '@jest/globals';
import type { ComponentType, ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import { AmapMapRenderer } from '@/infrastructure/map/amap-map-renderer';
import type { MapRendererProps } from '@/infrastructure/map/map-renderer';
import { markerProjectionKey } from '@/infrastructure/map/marker-clustering';
import type {
  ExpoAmapMapViewProps,
  NativeCameraRequest,
} from '../../../modules/expo-amap-map/src/ExpoAmapMap.types';
import {
  computeVisibleMapGeometry,
  isCameraRequestSuppressedAfterUserAction,
} from '../../../modules/expo-amap-map/src/camera-geometry';

jest.mock('../../../modules/expo-amap-map/src/ExpoAmapMapView', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: (props: { children?: ReactNode; [key: string]: unknown }) =>
      React.createElement('MockAmapView', props, props.children),
  };
});

jest.mock('expo', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const MockNativeAmapMapView = (props: Record<string, unknown>) =>
    React.createElement('MockNativeAmapMapView', props);
  MockNativeAmapMapView.displayName = 'MockNativeAmapMapView';
  return {
    requireNativeView: jest.fn(() => MockNativeAmapMapView),
    MockNativeAmapMapView,
  };
});

const gcj02 = { latitude: 39.90923, longitude: 116.397428, system: 'gcj02' as const };
const second = { latitude: 39.97959, longitude: 116.352792, system: 'gcj02' as const };

test('native screen projections drive quantity badges, split on zoom and reject stale source/viewport events', () => {
  const sourceMarkers: MapRendererProps['markers'] = [
    { id: 'poi-a', coordinate: gcj02, variant: 'normal', placeIds: ['place-a'], sourceItemIds: ['visit-a'] },
    { id: 'poi-b', coordinate: second, variant: 'normal', placeIds: ['place-b'], sourceItemIds: ['visit-b'] },
  ];
  const onClusterPress = jest.fn();
  const onMarkerPress = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(<AmapMapRenderer system="gcj02" markers={sourceMarkers}
    clusterMarkers onClusterPress={onClusterPress} onMarkerPress={onMarkerPress} />); });
  const native = () => renderer.root.findByProps({ testID: 'amap-map-renderer' });
  const key = markerProjectionKey(sourceMarkers);
  expect(native().props.markerProjectionRequest).toEqual({ requestKey: key, markers: [
    { id: 'poi-a', coordinate: { latitude: gcj02.latitude, longitude: gcj02.longitude } },
    { id: 'poi-b', coordinate: { latitude: second.latitude, longitude: second.longitude } },
  ] });
  const project = (revision: number, separation: number, requestKey = key) => act(() => {
    native().props.onMarkerProjection({ nativeEvent: { requestKey, revision, width: 400, height: 800,
      points: [{ id: 'poi-a', x: 100, y: 100 }, { id: 'poi-b', x: 100 + separation, y: 100 }] } });
  });
  project(1, 20);
  expect(native().props.markers).toHaveLength(1);
  expect(native().props.markers[0].clusterCount).toBe(2);
  act(() => native().props.onMarkerPress({ nativeEvent: { id: native().props.markers[0].id } }));
  expect(onClusterPress).toHaveBeenCalledWith(sourceMarkers);
  expect(onMarkerPress).not.toHaveBeenCalled();
  project(2, 180);
  expect(native().props.markers).toHaveLength(2);
  project(1, 20); // older AMap viewport emission arrives late
  project(3, 20, 'old-source');
  expect(native().props.markers).toHaveLength(2);
  act(() => native().props.onMarkerPress({ nativeEvent: { id: 'poi-b' } }));
  expect(onMarkerPress).toHaveBeenCalledWith('poi-b');
  act(() => renderer.unmount());
});

test('forwards an explicit instant-camera flag while preserving source marker coordinates', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(<AmapMapRenderer system="gcj02"
    markers={[{ id: 'item-pin', coordinate: gcj02, ordinal: 1, variant: 'normal' }]}
    cameraRequest={{ coordinates: [gcj02], animated: false }} />); });
  const native = renderer.root.findByProps({ testID: 'amap-map-renderer' });
  expect(native.props.cameraRequest.animated).toBe(false);
  expect(native.props.markers[0]).toEqual(expect.objectContaining({
    id: 'item-pin', ordinal: 1,
    coordinate: { latitude: gcj02.latitude, longitude: gcj02.longitude },
  }));
  act(() => renderer.unmount());
});

test('converts sheet padding into a normalized visible-map center anchor', () => {
  expect(computeVisibleMapGeometry(
    { top: 20, right: 10, bottom: 220, left: 30 },
    { width: 800, height: 600 },
  )).toEqual({
    visibleRect: { x: 30, y: 20, width: 760, height: 360 },
    screenAnchor: { x: 0.5125, y: 1 / 3 },
  });
});

test('keeps the screen-center anchor with no sheet and rejects invalid geometry', () => {
  expect(computeVisibleMapGeometry(undefined, { width: 320, height: 640 }))
    .toEqual({
      visibleRect: { x: 0, y: 0, width: 320, height: 640 },
      screenAnchor: { x: 0.5, y: 0.5 },
    });
  expect(computeVisibleMapGeometry(
    { top: 0, right: 0, bottom: 640, left: 0 },
    { width: 320, height: 640 },
  )).toBeNull();
  expect(computeVisibleMapGeometry(
    { top: 0, right: 0, bottom: Number.NaN, left: 0 },
    { width: 320, height: 640 },
  )).toBeNull();
});

test('suppresses a stale request after user movement but permits a new Day key', () => {
  expect(isCameraRequestSuppressedAfterUserAction('day-1-request', 'day-1-request'))
    .toBe(true);
  expect(isCameraRequestSuppressedAfterUserAction('day-2-request', 'day-1-request'))
    .toBe(false);
  expect(isCameraRequestSuppressedAfterUserAction('day-1-request', null))
    .toBe(false);
});

test('mounted Expo wrapper suppresses a user-moved request and allows new or unpadded requests', () => {
  type MountedNativeViewProps = ExpoAmapMapViewProps & {
    onLayout: (event: {
      nativeEvent: { layout: { width: number; height: number } };
    }) => void;
  };
  const NativeComponent = (jest.requireMock('expo') as {
    MockNativeAmapMapView: ComponentType<MountedNativeViewProps>;
  }).MockNativeAmapMapView;
  const ExpoAmapMapView = jest.requireActual<{
    default: ComponentType<ExpoAmapMapViewProps>;
  }>('../../../modules/expo-amap-map/src/ExpoAmapMapView').default;
  const focusRequest: NativeCameraRequest = {
    coordinates: [{ latitude: gcj02.latitude, longitude: gcj02.longitude }],
    padding: { top: 0, right: 0, bottom: 240, left: 0 },
    requestKey: 'day-1-request',
  };
  const onViewportChange = jest.fn();
  const view = (cameraRequest: NativeCameraRequest | null) => (
    <ExpoAmapMapView
      cameraRequest={cameraRequest}
      markers={[]}
      onViewportChange={onViewportChange}
      testID="mounted-native-map"
    />
  );

  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(view(focusRequest));
  });
  const native = () => renderer.root.findByType(NativeComponent);
  expect(native().props.onLayout).toEqual(expect.any(Function));
  expect(native().props.cameraRequest).toBeNull();

  act(() => native().props.onLayout({
    nativeEvent: { layout: { width: 400, height: 800 } },
  }));
  expect(native().props.cameraRequest).toEqual({
    ...focusRequest,
    screenAnchor: { x: 0.5, y: 0.35 },
  });

  const userViewport = {
    nativeEvent: {
      latitude: 39.91,
      longitude: 116.4,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
      userActionRequestKey: focusRequest.requestKey,
    },
  };
  act(() => native().props.onViewportChange(userViewport));
  expect(onViewportChange).toHaveBeenCalledWith(userViewport);
  expect(native().props.cameraRequest).toBeNull();

  act(() => renderer.update(view(focusRequest)));
  expect(native().props.cameraRequest).toBeNull();

  const nextDayRequest: NativeCameraRequest = {
    ...focusRequest,
    padding: { top: 0, right: 0, bottom: 160, left: 0 },
    requestKey: 'day-2-request',
  };
  act(() => renderer.update(view(nextDayRequest)));
  expect(native().props.cameraRequest).toEqual({
    ...nextDayRequest,
    screenAnchor: { x: 0.5, y: 0.4 },
  });

  const pickerRequest: NativeCameraRequest = {
    coordinates: focusRequest.coordinates,
    requestKey: 'map-picker-request',
  };
  act(() => renderer.update(view(pickerRequest)));
  expect(native().props.cameraRequest).toEqual({
    ...pickerRequest,
    screenAnchor: { x: 0.5, y: 0.5 },
  });

  act(() => renderer.update(view(null)));
  expect(native().props.cameraRequest).toBeNull();
  act(() => renderer.unmount());
});

function props(overrides: Partial<MapRendererProps> = {}): MapRendererProps {
  return {
    system: 'gcj02',
    markers: [{
      id: 'item-occurrence-1',
      coordinate: gcj02,
      ordinal: 1,
      label: '天安门',
      variant: 'selected',
    }],
    ...overrides,
  };
}

test('sends provider-native GCJ-02 marker and camera values to the native view', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AmapMapRenderer {...props({
      cameraRequest: {
        coordinates: [gcj02, second],
        padding: { top: 5, right: 4, bottom: 3, left: 2 },
      },
    })} />);
  });

  const view = renderer.root.findByProps({ testID: 'amap-map-renderer' });
  expect(view.props.markers).toEqual([{
    id: 'item-occurrence-1',
    coordinate: { latitude: gcj02.latitude, longitude: gcj02.longitude },
    ordinal: 1,
    label: '天安门',
    variant: 'selected',
    sourceItemIds: undefined,
  }]);
  expect(view.props.cameraRequest).toEqual({
    coordinates: [
      { latitude: gcj02.latitude, longitude: gcj02.longitude },
      { latitude: second.latitude, longitude: second.longitude },
    ],
    padding: { top: 5, right: 4, bottom: 3, left: 2 },
    requestKey: JSON.stringify({
      coordinates: [gcj02, second],
      padding: { top: 5, right: 4, bottom: 3, left: 2 },
    }),
  });
  act(() => renderer.unmount());
});

test('tags map and viewport events GCJ-02 and preserves the Item occurrence ID', () => {
  const onMarkerPress = jest.fn();
  const onMapPress = jest.fn();
  const onViewportChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AmapMapRenderer {...props({
      onMarkerPress,
      onMapPress,
      onViewportChange,
    })} />);
  });
  const view = renderer.root.findByProps({ testID: 'amap-map-renderer' });

  act(() => {
    view.props.onMarkerPress({ nativeEvent: { id: 'item-occurrence-1' } });
    view.props.onMapPress({ nativeEvent: { latitude: 39.9, longitude: 116.4 } });
    view.props.onViewportChange({ nativeEvent: {
      latitude: 39.9, longitude: 116.4,
      latitudeDelta: 0.1, longitudeDelta: 0.2,
    } });
  });
  expect(onMarkerPress).toHaveBeenCalledWith('item-occurrence-1');
  expect(onMapPress).toHaveBeenCalledWith({ latitude: 39.9, longitude: 116.4, system: 'gcj02' });
  expect(onViewportChange).toHaveBeenCalledWith({
    center: { latitude: 39.9, longitude: 116.4, system: 'gcj02' },
    latitudeDelta: 0.1,
    longitudeDelta: 0.2,
  });
  act(() => renderer.unmount());
});

test('changes the native request key for a repeated one-shot camera focus', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AmapMapRenderer {...props({
      cameraRequest: { coordinates: [gcj02], requestId: 1 },
    })} />);
  });
  const firstKey = renderer.root.findByProps({ testID: 'amap-map-renderer' })
    .props.cameraRequest.requestKey;
  act(() => {
    renderer.update(<AmapMapRenderer {...props({
      cameraRequest: { coordinates: [gcj02], requestId: 2 },
    })} />);
  });
  const secondKey = renderer.root.findByProps({ testID: 'amap-map-renderer' })
    .props.cameraRequest.requestKey;
  expect(secondKey).not.toBe(firstKey);
  act(() => renderer.unmount());
});

test('changes the native request key when a Day scope changes over identical coordinates', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AmapMapRenderer {...props({
      cameraRequest: { coordinates: [gcj02], scopeKey: 'day-1' },
    })} />);
  });
  const firstKey = renderer.root.findByProps({ testID: 'amap-map-renderer' })
    .props.cameraRequest.requestKey;
  act(() => renderer.update(<AmapMapRenderer {...props({
    cameraRequest: { coordinates: [gcj02], scopeKey: 'day-2' },
  })} />));
  const secondKey = renderer.root.findByProps({ testID: 'amap-map-renderer' })
    .props.cameraRequest.requestKey;
  expect(secondKey).not.toBe(firstKey);
  act(() => renderer.unmount());
});

test('surfaces native camera settlement with its request identity and GCJ-02 viewport', () => {
  const onCameraSettled = jest.fn();
  const request = { coordinates: [gcj02], scopeKey: 'day-1' };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AmapMapRenderer {...props({ cameraRequest: request, onCameraSettled })} />);
  });
  const native = renderer.root.findByProps({ testID: 'amap-map-renderer' });
  act(() => native.props.onCameraSettled({
    nativeEvent: {
      requestKey: JSON.stringify(request),
      latitude: 39.91,
      longitude: 116.4,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
      visibleMapRect: { x: 10, y: 24, width: 380, height: 500 },
      targetProjections: [{
        index: 0,
        targetCoordinate: { latitude: gcj02.latitude, longitude: gcj02.longitude },
        screenPoint: { x: 200, y: 240 },
        insideVisibleMapRect: true,
      }],
    },
  }));
  expect(onCameraSettled).toHaveBeenCalledWith({
    requestKey: JSON.stringify(request),
    center: { latitude: 39.91, longitude: 116.4, system: 'gcj02' },
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
    visibleMapRect: { x: 10, y: 24, width: 380, height: 500 },
    targetProjections: [{
      index: 0,
      targetCoordinate: { latitude: gcj02.latitude, longitude: gcj02.longitude, system: 'gcj02' },
      screenPoint: { x: 200, y: 240 },
      insideVisibleMapRect: true,
    }],
  });
  act(() => renderer.unmount());
});

test('rejects mixed or non-GCJ-02 renderer input', () => {
  expect(() => AmapMapRenderer(props({ system: 'wgs84' })))
    .toThrow('Coordinate system gcj02 does not match wgs84');
  expect(() => AmapMapRenderer(props({ markers: [], system: 'wgs84' })))
    .toThrow('AmapMapRenderer requires gcj02 coordinates');
});
