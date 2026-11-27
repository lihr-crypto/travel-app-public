import { expect, jest, test } from '@jest/globals';
import type { ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import { MapPicker } from '@/components/map-picker';
import type { Coordinate } from '@/domain/common/types';
import { AmapMapRenderer } from '@/infrastructure/map/amap-map-renderer';
import { GoogleMapRenderer } from '@/infrastructure/map/google-map-renderer';
import type { PlaceProviderSession } from '@/infrastructure/place/place-provider-session';
import { SafeAreaTestProvider } from '../helpers/safe-area';

jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const MapView = React.forwardRef(
    (props: { children?: ReactNode; [key: string]: unknown }, ref) => {
      React.useImperativeHandle(ref, () => ({
        animateCamera: jest.fn(),
        fitToCoordinates: jest.fn(),
      }));
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
  };
});

jest.mock('../../modules/expo-amap-map/src/ExpoAmapMapView', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: (props: { children?: ReactNode; [key: string]: unknown }) =>
      React.createElement('MockAmapView', props, props.children),
  };
});

const wgs84Session: PlaceProviderSession = {
  mapRegion: 'global',
  providerId: 'google',
  coordinateSystem: 'wgs84',
  provider: { search: jest.fn(async () => ({ results: [], nextCursor: null })) },
};

const gcj02Session: PlaceProviderSession = {
  mapRegion: 'china_mainland',
  providerId: 'amap',
  coordinateSystem: 'gcj02',
  provider: { search: jest.fn(async () => ({ results: [], nextCursor: null })) },
};

test('the real Google renderer drives the WGS84 crosshair and confirms that center', () => {
  const initial: Coordinate = {
    latitude: -33.8683,
    longitude: 151.2086,
    system: 'wgs84',
  };
  const onUseCoordinate = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <SafeAreaTestProvider>
        <MapPicker
          initialCoordinate={initial}
          mapRenderer={GoogleMapRenderer}
          onCancel={jest.fn()}
          onUseCoordinate={onUseCoordinate}
          session={wgs84Session}
        />
      </SafeAreaTestProvider>,
    );
  });

  expect(
    renderer.root.findByProps({ testID: 'map-picker-crosshair' }).props.pointerEvents,
  ).toBe('none');

  const map = renderer.root.findByProps({ testID: 'google-map-renderer' });
  expect(map.props.provider).toBe('google');
  expect(JSON.stringify(renderer.toJSON())).toContain('WGS84');

  act(() => map.props.onRegionChangeComplete({
    latitude: -33.9,
    longitude: 151.3,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }));
  expect(JSON.stringify(renderer.toJSON())).toContain('-33.90000');

  act(() => {
    renderer.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress();
  });
  expect(onUseCoordinate).toHaveBeenCalledWith({
    coordinate: { latitude: -33.9, longitude: 151.3, system: 'wgs84' },
    enrichment: null,
  });
  act(() => renderer.unmount());
});

test('the real AMap renderer keeps the picked center provider-native GCJ-02', () => {
  const initial: Coordinate = {
    latitude: 39.90923,
    longitude: 116.397428,
    system: 'gcj02',
  };
  const onUseCoordinate = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <SafeAreaTestProvider>
        <MapPicker
          initialCoordinate={initial}
          mapRenderer={AmapMapRenderer}
          onCancel={jest.fn()}
          onUseCoordinate={onUseCoordinate}
          session={gcj02Session}
        />
      </SafeAreaTestProvider>,
    );
  });

  const view = renderer.root.findByProps({ testID: 'amap-map-renderer' });
  expect(view.props.markers).toEqual([]);
  expect(JSON.stringify(renderer.toJSON())).toContain('GCJ02');

  act(() => view.props.onViewportChange({
    nativeEvent: {
      latitude: 39.999676,
      longitude: 116.275118,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    },
  }));

  act(() => {
    renderer.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress();
  });
  expect(onUseCoordinate).toHaveBeenCalledWith({
    coordinate: { latitude: 39.999676, longitude: 116.275118, system: 'gcj02' },
    enrichment: null,
  });
  act(() => renderer.unmount());
});

test('a renderer from the other provider fails closed instead of tagging the wrong CRS', () => {
  const initial: Coordinate = {
    latitude: 39.90923,
    longitude: 116.397428,
    system: 'gcj02',
  };
  expect(() => {
    act(() => {
      create(
        <SafeAreaTestProvider>
          <MapPicker
            initialCoordinate={initial}
            mapRenderer={GoogleMapRenderer}
            onCancel={jest.fn()}
            onUseCoordinate={jest.fn()}
            session={gcj02Session}
          />
        </SafeAreaTestProvider>,
      );
    });
  }).toThrow('GoogleMapRenderer requires wgs84 coordinates');
});
