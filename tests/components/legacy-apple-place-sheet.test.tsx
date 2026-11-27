import { afterEach, expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';

import { LegacyApplePlaceSheet } from '@/components/legacy-apple-place-sheet';
import { PlaceSearch } from '@/components/place-search';
import type { Place } from '@/domain/place/types';
import type { MapRenderer } from '@/infrastructure/map/map-renderer';
import type { PlaceProviderSession } from '@/infrastructure/place/place-provider-session';
import type {
  PlaceSearchPage,
  PlaceSearchQuery,
  PlaceSearchResult,
} from '@/infrastructure/place/place-provider';
import { SafeAreaTestProvider } from '../helpers/safe-area';

jest.mock('@/state/reduce-motion', () => ({
  useReduceMotionPreference: () => true,
}));

const oldPlace: Place = {
  id: 'legacy-place-1',
  name: '旧地点名称',
  coordinate: { latitude: 31.2304, longitude: 121.4737, system: 'gcj02' },
  address: '原有地址',
  provider: 'amap',
  providerPlaceId: 'old-amap-id',
  metadata: { source: 'legacy' },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
};

const appleResult: PlaceSearchResult = {
  name: 'Apple 搜索地点',
  address: 'Apple 地址',
  coordinate: { latitude: 35.6586, longitude: 139.7454, system: 'wgs84' },
  provider: 'apple',
  providerPlaceId: 'apple-place-id',
  regionLabel: 'Minato City',
  metadata: { source: 'MapKit' },
};

const mapRenderer: MapRenderer = () => null;
const mountedRenderers: ReturnType<typeof create>[] = [];

afterEach(() => {
  act(() => mountedRenderers.splice(0).forEach((renderer) => renderer.unmount()));
});

function makeSession(
  search: (query: PlaceSearchQuery) => Promise<PlaceSearchPage | PlaceSearchResult[]> = async () => [],
): PlaceProviderSession {
  return {
    mapRegion: 'global',
    providerId: 'apple',
    coordinateSystem: 'wgs84',
    provider: {
      search: async (query) => {
        const response = await search(query);
        return Array.isArray(response)
          ? { results: response, nextCursor: null }
          : response;
      },
    },
  };
}

function render(props: Partial<React.ComponentProps<typeof LegacyApplePlaceSheet>> = {}) {
  const onClose = props.onClose ?? jest.fn();
  const onBindResult = props.onBindResult ?? jest.fn(async () => undefined);
  const session = props.session ?? makeSession();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <SafeAreaTestProvider>
        <LegacyApplePlaceSheet
          mapRenderer={mapRenderer}
          onBindResult={onBindResult}
          onClose={onClose}
          places={[oldPlace]}
          session={session}
          visible
          {...props}
        />
      </SafeAreaTestProvider>,
    );
  });
  mountedRenderers.push(renderer);
  return { renderer, onBindResult, onClose, session };
}

function renderedText(renderer: ReturnType<typeof create>) {
  return renderer.root.findAllByType(Text)
    .map(({ props }) => String(props.children ?? ''))
    .join('\n');
}

function textByTestId(renderer: ReturnType<typeof create>, testID: string) {
  const children = renderer.root.findByProps({ testID }).props.children;
  return Array.isArray(children) ? children.join('') : String(children);
}

async function openSearchResult(renderer: ReturnType<typeof create>) {
  await act(async () => {
    renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress();
  });
  act(() => {
    renderer.root.findByProps({ testID: 'place-search-result-0' }).props.onPress();
  });
}

async function flushSelection() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test('lists unresolved Places and opens Apple search in a full-screen layer with a safe map center', () => {
  const onClose = jest.fn();
  const { renderer } = render({ onClose });

  expect(renderer.root.findByProps({ testID: 'legacy-apple-place-sheet-title' }))
    .toBeDefined();
  expect(renderedText(renderer)).toContain(oldPlace.name);
  act(() => renderer.root.findByProps({ testID: `legacy-apple-place-row-${oldPlace.id}` })
    .props.onPress());

  const searchModal = renderer.root.findByProps({ testID: 'legacy-apple-place-search-modal' });
  expect(searchModal.props.visible).toBe(true);
  expect(renderer.root.findByProps({ testID: 'place-search-title' }).props.children)
    .toBe('确认旧地点');
  expect(renderer.root.findByProps({ testID: 'place-search-input' }).props.value)
    .toBe(oldPlace.name);
  const searchProps = renderer.root.findByType(PlaceSearch).props;
  const now = new Date();
  expect(searchProps.initialDate).toBe(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  );
  expect(searchProps.session.providerId).toBe('apple');
  expect(renderer.root.findByProps({ testID: 'place-search-map-picker' })).toBeDefined();

  act(() => renderer.root.findByProps({ testID: 'place-search-map-picker' }).props.onPress());
  expect(textByTestId(renderer, 'map-picker-coordinate'))
    .toContain('0.00000, 0.00000 · WGS84');
  expect(onClose).not.toHaveBeenCalled();

  act(() => renderer.root.findByProps({ testID: 'map-picker-cancel' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'legacy-apple-place-search-modal' })
    .props.onRequestClose());
  expect(renderer.root.findAllByProps({ testID: 'legacy-apple-place-search-modal' }))
    .toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'legacy-apple-place-sheet-title' }))
    .toBeDefined();
  expect(onClose).not.toHaveBeenCalled();

  act(() => renderer.root.findByProps({ testID: 'legacy-apple-place-sheet-close' }).props.onPress());
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('does not reuse raw Google WGS84 coordinates for the Apple map picker', () => {
  const oldGooglePlace: Place = {
    ...oldPlace,
    id: 'legacy-google-place',
    name: 'Old Google place',
    coordinate: { latitude: 40.7128, longitude: -74.006, system: 'wgs84' },
    provider: 'google',
    providerPlaceId: 'old-google-id',
  };
  const { renderer } = render({ places: [oldGooglePlace] });

  act(() => renderer.root.findByProps({ testID: `legacy-apple-place-row-${oldGooglePlace.id}` })
    .props.onPress());
  act(() => renderer.root.findByProps({ testID: 'place-search-map-picker' }).props.onPress());
  expect(textByTestId(renderer, 'map-picker-coordinate'))
    .toContain('0.00000, 0.00000 · WGS84');
});

test('search confirmation binds only the selected old Place and closes back to the list on success', async () => {
  const providerSearch = jest.fn(async () => [appleResult]);
  const onBindResult = jest.fn(async () => undefined);
  const { renderer } = render({
    onBindResult,
    session: makeSession(providerSearch),
  });
  act(() => renderer.root.findByProps({ testID: `legacy-apple-place-row-${oldPlace.id}` })
    .props.onPress());

  await openSearchResult(renderer);
  const confirmation = renderer.root.findByProps({ testID: 'place-preview-confirm' });
  expect(confirmation.findByType(Text).props.children).toBe('确认此地点');
  await act(async () => {
    confirmation.props.onPress();
    await flushSelection();
  });

  expect(providerSearch).toHaveBeenCalledWith({ keyword: oldPlace.name, limit: 20 });
  expect(onBindResult).toHaveBeenCalledTimes(1);
  expect(onBindResult).toHaveBeenCalledWith(oldPlace.id, appleResult);
  expect(renderer.root.findAllByProps({ testID: 'legacy-apple-place-search-modal' }))
    .toHaveLength(0);
  expect(renderer.root.findByProps({ testID: `legacy-apple-place-row-${oldPlace.id}` }))
    .toBeDefined();
});

test('a failed binding keeps the search page open and retry repeats the same binding', async () => {
  const onBindResult = jest.fn<(
    sourcePlaceId: string,
    result: PlaceSearchResult,
  ) => Promise<void>>()
    .mockRejectedValueOnce(new Error('temporary storage failure'))
    .mockResolvedValueOnce(undefined);
  const { renderer } = render({
    onBindResult,
    session: makeSession(async () => [appleResult]),
  });
  act(() => renderer.root.findByProps({ testID: `legacy-apple-place-row-${oldPlace.id}` })
    .props.onPress());
  await openSearchResult(renderer);

  await act(async () => {
    renderer.root.findByProps({ testID: 'place-preview-confirm' }).props.onPress();
    await flushSelection();
  });
  expect(renderer.root.findByProps({ testID: 'legacy-apple-place-search-modal' }).props.visible)
    .toBe(true);
  expect(renderedText(renderer)).toContain('temporary storage failure');
  expect(renderer.root.findByProps({ testID: 'legacy-apple-place-retry' })).toBeDefined();

  await act(async () => {
    renderer.root.findByProps({ testID: 'legacy-apple-place-retry' }).props.onPress();
    await flushSelection();
  });
  expect(onBindResult).toHaveBeenCalledTimes(2);
  expect(onBindResult).toHaveBeenNthCalledWith(1, oldPlace.id, appleResult);
  expect(onBindResult).toHaveBeenNthCalledWith(2, oldPlace.id, appleResult);
  expect(renderer.root.findAllByProps({ testID: 'legacy-apple-place-search-modal' }))
    .toHaveLength(0);
});

test('map fallback uses a reviewed Apple result or an Apple-safe zero coordinate, then binds enrichment', async () => {
  const onBindResult = jest.fn(async () => undefined);
  const { renderer } = render({
    onBindResult,
    session: makeSession(async () => [appleResult]),
  });
  act(() => renderer.root.findByProps({ testID: `legacy-apple-place-row-${oldPlace.id}` })
    .props.onPress());
  await openSearchResult(renderer);
  act(() => renderer.root.findByProps({ testID: 'place-preview-close' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'place-search-map-picker' }).props.onPress());
  expect(textByTestId(renderer, 'map-picker-coordinate'))
    .toContain('35.65860, 139.74540 · WGS84');

  await act(async () => {
    renderer.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress();
    await flushSelection();
  });
  expect(onBindResult).toHaveBeenCalledWith(oldPlace.id, {
    name: oldPlace.name,
    address: null,
    coordinate: appleResult.coordinate,
    provider: 'apple',
    providerPlaceId: null,
    regionLabel: null,
    metadata: null,
  });
  expect(renderer.root.findAllByProps({ testID: 'legacy-apple-place-search-modal' }))
    .toHaveLength(0);
});

test('an empty legacy-name lookup offers its original address with the stored city hint', async () => {
  const place = { ...oldPlace, name: '示例历史文化街区', address: '示例路64号',
    metadata: { district: '示例省示例市示例区' } };
  const search = jest.fn(async (_query: PlaceSearchQuery) => []);
  const { renderer } = render({ places: [place], session: makeSession(search) });
  act(() => renderer.root.findByProps({ testID: `legacy-apple-place-row-${place.id}` }).props.onPress());
  await act(async () => { renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress(); });
  expect(search).toHaveBeenCalledWith({ keyword: place.name, limit: 20,
    region: { city: '示例省示例市示例区' } });
  expect(renderer.root.findByProps({ testID: 'place-search-empty' })).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'place-search-error' })).toHaveLength(0);
  const alternative = '示例省示例市示例区 示例路64号';
  await act(async () => { renderer.root.findByProps({ testID: `place-search-suggestion-${alternative}` }).props.onPress(); });
  expect(search.mock.calls[1][0].keyword).toBe(alternative);
  expect(search.mock.calls[1][0]).not.toHaveProperty('center');
});
