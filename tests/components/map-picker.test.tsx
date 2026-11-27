import { expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { View } from 'react-native';

import { MapPicker } from '@/components/map-picker';
import { resolveCoordinatePlaceName } from '@/application/place/place-snapshot';
import type { Coordinate } from '@/domain/common/types';
import type { MapRenderer, MapRendererProps } from '@/infrastructure/map/map-renderer';
import type { PlaceProvider, ReverseGeocodeQuery, ReverseGeocodeResult } from '@/infrastructure/place/place-provider';
import type { PlaceProviderSession } from '@/infrastructure/place/place-provider-session';
import { SafeAreaTestProvider } from '../helpers/safe-area';

const initial: Coordinate = {
  latitude: 39.999676,
  longitude: 116.275118,
  system: 'gcj02',
};

const session: PlaceProviderSession = {
  mapRegion: 'china_mainland',
  providerId: 'amap',
  coordinateSystem: 'gcj02',
  provider: { search: jest.fn(async () => ({ results: [], nextCursor: null })) },
};

/** The enrichment effect is debounced; tests shrink it to zero and flush timers. */
async function flushEnrichment() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof MapPicker>> = {},
  providerOverrides: Partial<PlaceProvider> = {},
) {
  let rendererProps: MapRendererProps | undefined;
  const renderer: MapRenderer = (props) => {
    rendererProps = props;
    return <View testID="fake-map-renderer" />;
  };
  const onUseCoordinate = jest.fn();
  const onCancel = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <SafeAreaTestProvider>
        <MapPicker
          enrichmentDebounceMs={0}
          initialCoordinate={initial}
          mapRenderer={renderer}
          onCancel={onCancel}
          onUseCoordinate={onUseCoordinate}
          session={{ ...session, provider: { ...session.provider, ...providerOverrides } }}
          {...overrides}
        />
      </SafeAreaTestProvider>,
    );
  });
  return { tree, getRendererProps: () => rendererProps!, onUseCoordinate, onCancel };
}

test('renders a fixed crosshair over an empty provider-native map', () => {
  const { tree, getRendererProps } = renderPicker();
  expect(tree.root.findByProps({ testID: 'map-picker-crosshair' })).toBeDefined();
  expect(getRendererProps()).toMatchObject({
    system: 'gcj02',
    markers: [],
    cameraRequest: { coordinates: [initial], requestId: 1 },
  });
  expect(JSON.stringify(tree.toJSON())).toContain('GCJ02');
  act(() => tree.unmount());
});

test('uses the latest viewport center and emits coordinate-change intent', () => {
  const onCoordinateChange = jest.fn();
  const { tree, getRendererProps, onUseCoordinate } = renderPicker({ onCoordinateChange });
  const next: Coordinate = {
    latitude: 40.001,
    longitude: 116.281,
    system: 'gcj02',
  };
  act(() => getRendererProps().onViewportChange?.({
    center: next,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }));
  expect(onCoordinateChange).toHaveBeenCalledWith(next);
  expect(JSON.stringify(tree.toJSON())).toContain('40.00100');
  act(() => tree.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress());
  expect(onUseCoordinate).toHaveBeenCalledWith({ coordinate: next, enrichment: null });
  act(() => tree.unmount());
});

test('fails closed for initial or viewport coordinates from the wrong CRS', () => {
  expect(() => renderPicker({
    initialCoordinate: { ...initial, system: 'wgs84' },
  })).toThrow('does not match gcj02');

  const { tree, getRendererProps } = renderPicker();
  expect(() => act(() => getRendererProps().onViewportChange?.({
    center: { ...initial, system: 'wgs84' },
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }))).toThrow('does not match gcj02');
  act(() => tree.unmount());
});

test('emits cancel without producing a coordinate', () => {
  const { tree, onCancel, onUseCoordinate } = renderPicker();
  act(() => tree.root.findByProps({ testID: 'map-picker-cancel' }).props.onPress());
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onUseCoordinate).not.toHaveBeenCalled();
  act(() => tree.unmount());
});

test('enriches the picked coordinate through a provider that supports it', async () => {
  const reverseGeocode = jest.fn(
    async (_query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> => ({
      provider: 'amap',
      coordinate: initial,
      name: '颐和园',
      address: '北京市海淀区新建宫门路19号',
      regionLabel: '海淀区',
      providerPlaceId: 'B000SAMP01',
      metadata: null,
    }),
  );
  const { tree, onUseCoordinate } = renderPicker({}, { reverseGeocode });

  await flushEnrichment();
  expect(reverseGeocode).toHaveBeenCalledWith({ coordinate: initial });
  // The label is the name the Place will be saved under, not the address: an
  // AMap re-geocode returns both `poiName` and `formattedAddress` for a POI.
  expect(tree.root.findByProps({ testID: 'map-picker-address' }).props.children)
    .toBe('颐和园');

  act(() => tree.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress());
  expect(onUseCoordinate).toHaveBeenCalledWith({
    coordinate: initial,
    enrichment: {
      provider: 'amap',
      coordinate: initial,
      name: '颐和园',
      address: '北京市海淀区新建宫门路19号',
      regionLabel: '海淀区',
      providerPlaceId: 'B000SAMP01',
      metadata: null,
    },
  });
  act(() => tree.unmount());
});

test('falls back to the place name when the provider reports no address', async () => {
  const reverseGeocode = jest.fn(
    async (_query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> => ({
      provider: 'amap',
      coordinate: initial,
      name: '颐和园',
      address: null,
      regionLabel: '海淀区',
      providerPlaceId: null,
      metadata: null,
    }),
  );
  const { tree } = renderPicker({}, { reverseGeocode });

  await flushEnrichment();
  expect(tree.root.findByProps({ testID: 'map-picker-address' }).props.children)
    .toBe('颐和园');
  act(() => tree.unmount());
});

test('falls back to the address when the provider reports no place name', async () => {
  const reverseGeocode = jest.fn(
    async (_query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> => ({
      provider: 'amap',
      coordinate: initial,
      name: null,
      address: '北京市海淀区新建宫门路19号',
      regionLabel: '海淀区',
      providerPlaceId: null,
      metadata: null,
    }),
  );
  const { tree } = renderPicker({}, { reverseGeocode });

  await flushEnrichment();
  expect(tree.root.findByProps({ testID: 'map-picker-address' }).props.children)
    .toBe('北京市海淀区新建宫门路19号');
  act(() => tree.unmount());
});

test('shows the same label the Place will be saved under, in every field combination', async () => {
  const cases = [
    // POI with an address: the name wins, on screen and in the database.
    { name: '颐和园', address: '北京市海淀区新建宫门路19号', regionLabel: '海淀区', expected: '颐和园' },
    // No POI name: the address is what gets saved.
    { name: null, address: '北京市海淀区新建宫门路19号', regionLabel: '海淀区', expected: '北京市海淀区新建宫门路19号' },
    // A blank name is not a name.
    { name: '   ', address: '北京市海淀区新建宫门路19号', regionLabel: '海淀区', expected: '北京市海淀区新建宫门路19号' },
    // Nothing usable: the picker shows the coordinate label it would save,
    // rather than a region name the commit would never write.
    {
      name: null,
      address: null,
      regionLabel: '海淀区',
      expected: `${initial.latitude.toFixed(5)}, ${initial.longitude.toFixed(5)}`,
    },
  ];

  for (const testCase of cases) {
    const reverseGeocode = jest.fn(
      async (_query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> => ({
        provider: 'amap',
        coordinate: initial,
        name: testCase.name,
        address: testCase.address,
        regionLabel: testCase.regionLabel,
        providerPlaceId: null,
        metadata: null,
      }),
    );
    const { tree } = renderPicker({}, { reverseGeocode });
    await flushEnrichment();

    const shown = tree.root.findByProps({ testID: 'map-picker-address' }).props.children;
    // The screen and the commit must agree, which is the whole contract.
    const saved = resolveCoordinatePlaceName(
      {
        provider: 'amap',
        coordinate: initial,
        name: testCase.name,
        address: testCase.address,
        regionLabel: testCase.regionLabel,
        providerPlaceId: null,
        metadata: null,
      },
      initial,
    );
    expect(shown).toBe(testCase.expected);
    expect(shown).toBe(saved);

    act(() => tree.unmount());
  }
});

test('an unanswered enrichment keeps the coordinate-only path valid', async () => {
  const reverseGeocode = jest.fn(
    async (_query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> => null,
  );
  const { tree, onUseCoordinate } = renderPicker({}, { reverseGeocode });

  await flushEnrichment();
  expect(tree.root.findByProps({ testID: 'map-picker-address' }).props.children)
    .toBe('无法解析地址，仍可保存坐标');
  act(() => tree.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress());
  expect(onUseCoordinate).toHaveBeenCalledWith({
    coordinate: initial,
    enrichment: null,
  });
  act(() => tree.unmount());
});

test('a failing enrichment never blocks confirming the coordinate', async () => {
  const reverseGeocode = jest.fn(
    async (_query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> => {
      throw new Error('provider unavailable');
    },
  );
  const { tree, onUseCoordinate } = renderPicker({}, { reverseGeocode });

  await flushEnrichment();
  expect(tree.root.findByProps({ testID: 'map-picker-address' }).props.children)
    .toBe('无法解析地址，仍可保存坐标');
  act(() => tree.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress());
  expect(onUseCoordinate).toHaveBeenCalledWith({
    coordinate: initial,
    enrichment: null,
  });
  act(() => tree.unmount());
});

test('a provider without reverse geocoding shows no address line', async () => {
  const { tree } = renderPicker();
  await flushEnrichment();
  expect(tree.root.findAllByProps({ testID: 'map-picker-address' })).toHaveLength(0);
  act(() => tree.unmount());
});

test('coalesces panning into one enrichment request for the settled center', async () => {
  const reverseGeocode = jest.fn(
    async (_query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> => null,
  );
  const { tree, getRendererProps } = renderPicker({}, { reverseGeocode });
  await flushEnrichment();
  reverseGeocode.mockClear();

  const next: Coordinate = {
    latitude: 40.001,
    longitude: 116.281,
    system: 'gcj02',
  };
  act(() => {
    getRendererProps().onViewportChange?.({
      center: next,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    });
    getRendererProps().onViewportChange?.({
      center: next,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  });
  await flushEnrichment();

  expect(reverseGeocode).toHaveBeenCalledTimes(1);
  expect(reverseGeocode).toHaveBeenCalledWith({ coordinate: next });
  act(() => tree.unmount());
});

test('a pan discards the previous address so a stale enrichment is never confirmed', async () => {
  const reverseGeocode = jest.fn(
    async (_query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> => ({
      provider: 'amap',
      coordinate: initial,
      name: '颐和园',
      address: '北京市海淀区新建宫门路19号',
      regionLabel: '海淀区',
      providerPlaceId: 'B000SAMP01',
      metadata: null,
    }),
  );
  const { tree, getRendererProps, onUseCoordinate } = renderPicker({}, { reverseGeocode });
  await flushEnrichment();
  expect(tree.root.findByProps({ testID: 'map-picker-address' }).props.children)
    .toBe('颐和园');

  const next: Coordinate = {
    latitude: 40.001,
    longitude: 116.281,
    system: 'gcj02',
  };
  act(() => getRendererProps().onViewportChange?.({
    center: next,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }));
  expect(tree.root.findAllByProps({ testID: 'map-picker-address' })).toHaveLength(0);

  act(() => tree.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress());
  expect(onUseCoordinate).toHaveBeenCalledWith({
    coordinate: next,
    enrichment: null,
  });
  act(() => tree.unmount());
});

test('rejects enrichment from another provider or coordinate system', async () => {
  const reverseGeocode = jest.fn(
    async (_query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> => ({
      provider: 'google',
      coordinate: { ...initial, system: 'wgs84' },
      name: 'wrong provider',
      address: 'wrong address',
      regionLabel: null,
      providerPlaceId: null,
      metadata: null,
    }),
  );
  const { tree, onUseCoordinate } = renderPicker({}, { reverseGeocode });
  await flushEnrichment();

  expect(tree.root.findByProps({ testID: 'map-picker-address' }).props.children)
    .toBe('无法解析地址，仍可保存坐标');
  act(() => tree.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress());
  expect(onUseCoordinate).toHaveBeenCalledWith({ coordinate: initial, enrichment: null });
  act(() => tree.unmount());
});
