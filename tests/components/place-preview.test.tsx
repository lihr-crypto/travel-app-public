import { expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { Modal, View } from 'react-native';

import { PlacePreview } from '@/components/place-preview';
import type { PlaceSearchResult } from '@/infrastructure/place/place-provider';
import type { MapRenderer, MapRendererProps } from '@/infrastructure/map/map-renderer';
import { SafeAreaTestProvider } from '../helpers/safe-area';

const result: PlaceSearchResult = {
  name: 'Sydney Opera House',
  address: 'Bennelong Point, Sydney NSW 2000',
  coordinate: { latitude: -33.85678, longitude: 151.2153, system: 'wgs84' },
  provider: 'google',
  providerPlaceId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
  regionLabel: 'Sydney NSW, Australia',
  metadata: { types: ['tourist_attraction', 'point_of_interest'] },
};

function render(props: Partial<React.ComponentProps<typeof PlacePreview>> = {}) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <SafeAreaTestProvider>
        <PlacePreview onClose={jest.fn()} result={result} visible {...props} />
      </SafeAreaTestProvider>,
    );
  });
  return renderer;
}

test('shows the original place identity and provider attribution by default', () => {
  const renderer = render();
  const json = JSON.stringify(renderer.toJSON());
  expect(renderer.root.findByProps({ testID: 'place-preview' })).toBeDefined();
  expect(json).toContain('Sydney Opera House');
  expect(json).toContain('Bennelong Point, Sydney NSW 2000');
  expect(json).toContain('Sydney NSW, Australia');
  expect(renderer.root.findByProps({ accessibilityLabel: 'Google Maps' })).toBeDefined();
  expect(json).not.toContain('WGS84');
  expect(json).not.toContain('tourist_attraction');
  expect(renderer.root.findByProps({ testID: 'place-preview-details-toggle' })
    .props.accessibilityState).toEqual({ expanded: false });
  act(() => renderer.unmount());
});

test('reveals coordinates, CRS and provider types through 地点信息', () => {
  const renderer = render();
  const toggle = renderer.root.findByProps({ testID: 'place-preview-details-toggle' });
  act(() => toggle.props.onPress());

  const json = JSON.stringify(renderer.toJSON());
  expect(renderer.root.findByProps({ testID: 'place-preview-details-toggle' })
    .props.accessibilityState).toEqual({ expanded: true });
  expect(renderer.root.findByProps({ testID: 'place-preview-coordinate' }).props.children)
    .toContain('WGS84');
  expect(renderer.root.findByProps({ testID: 'place-preview-types' }).props.children)
    .toContain('tourist_attraction');
  expect(json).toContain('Sydney Opera House');
  act(() => renderer.unmount());
});

test('uses a trimmed nonempty region when the address is empty', () => {
  const renderer = render({
    result: { ...result, address: '  ', regionLabel: '  Sydney NSW, Australia  ' },
  });

  expect(renderer.root.findByProps({ testID: 'place-preview-address' }).props.children)
    .toBe('Sydney NSW, Australia');
  expect(renderer.root.findAllByProps({ testID: 'place-preview-region' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('frames the picked POI on the app map with a single pin', () => {
  let mapProps!: MapRendererProps;
  const mapRenderer: MapRenderer = (props) => {
    mapProps = props;
    return <View testID="place-preview-fake-map" />;
  };
  const renderer = render({ mapRenderer });

  expect(renderer.root.findByProps({ testID: 'place-preview-map' })).toBeDefined();
  expect(mapProps.system).toBe('wgs84');
  expect(mapProps.markers).toEqual([
    expect.objectContaining({ coordinate: result.coordinate, variant: 'selected' }),
  ]);
  expect(mapProps.cameraRequest?.coordinates).toEqual([result.coordinate]);
  expect(renderer.root.findByProps({ testID: 'place-preview-google-attribution' })).toBeDefined();
  act(() => renderer.unmount());
});

test('omits the map when no renderer is available', () => {
  const renderer = render();
  expect(renderer.root.findAllByProps({ testID: 'place-preview-map' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('confirm emits only the explicit intent and close emits dismissal', () => {
  const onConfirm = jest.fn();
  const onClose = jest.fn();
  const renderer = render({ onClose, onConfirm });
  act(() => renderer.root.findByProps({ testID: 'place-preview-confirm' }).props.onPress());
  expect(onConfirm).toHaveBeenCalledWith(result);
  act(() => renderer.root.findByProps({ testID: 'place-preview-close' }).props.onPress());
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByProps({ testID: 'place-preview-close' }).props.style.minHeight)
    .toBeGreaterThanOrEqual(44);
  act(() => renderer.unmount());
});

test('names the task the user is in, instead of 继续编辑行程', () => {
  const create = render({ onConfirm: jest.fn() });
  expect(JSON.stringify(create.toJSON())).toContain('使用此地点');
  expect(JSON.stringify(create.toJSON())).not.toContain('继续编辑行程');
  act(() => create.unmount());

  const replace = render({ confirmLabel: '更改为此地点', onConfirm: jest.fn() });
  expect(JSON.stringify(replace.toJSON())).toContain('更改为此地点');
  act(() => replace.unmount());
});

test('does not provide a live confirmation action until a callback is wired', () => {
  const renderer = render();
  const confirm = renderer.root.findByProps({ testID: 'place-preview-confirm' });
  expect(confirm.props.disabled).toBe(true);
  expect(confirm.props.onPress).toBeUndefined();
  act(() => renderer.unmount());
});

test('keeps confirmation failures beside the confirm action', () => {
  const renderer = render({ confirmationError: '保存失败，请重试。', onConfirm: jest.fn() });
  const error = renderer.root.findByProps({ testID: 'place-preview-error' });
  const confirm = renderer.root.findByProps({ testID: 'place-preview-confirm' });

  expect(error.props.accessibilityRole).toBe('alert');
  expect(error.parent).toBe(confirm.parent);
  act(() => renderer.unmount());
});

test('disables confirmation and guards both close paths while a write is in flight', () => {
  const onClose = jest.fn();
  const onConfirm = jest.fn();
  const renderer = render({ isConfirming: true, onClose, onConfirm });
  const confirm = renderer.root.findByProps({ testID: 'place-preview-confirm' });
  const close = renderer.root.findByProps({ testID: 'place-preview-close' });
  const modal = renderer.root.findByType(Modal);

  expect(confirm.props.disabled).toBe(true);
  expect(confirm.props.accessibilityLabel).toBe('正在确认地点');
  expect(confirm.props.onPress).toBeUndefined();
  expect(close.props.disabled).toBe(true);
  expect(close.props.accessibilityState).toEqual({ disabled: true });
  act(() => close.props.onPress());
  act(() => modal.props.onRequestClose());
  expect(onClose).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('offers the provider handoff as a row and reports its failure inline', async () => {
  const onOpenInExternalMap = jest.fn(async () => {
    throw new Error('无法打开外部地图。');
  });
  const renderer = render({ onOpenInExternalMap });

  await act(async () => {
    renderer.root.findByProps({ testID: 'place-preview-open-in-map' }).props.onPress();
  });

  expect(onOpenInExternalMap).toHaveBeenCalledWith(result);
  expect(renderer.root.findByProps({ testID: 'place-preview-open-in-map-error' }).props.children)
    .toBe('无法打开外部地图。');
  act(() => renderer.unmount());

  const withoutHandoff = render();
  expect(withoutHandoff.root.findAllByProps({ testID: 'place-preview-open-in-map' }))
    .toHaveLength(0);
  act(() => withoutHandoff.unmount());
});
