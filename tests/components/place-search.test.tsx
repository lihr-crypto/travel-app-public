import { expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { Image, Keyboard, Modal, Text, View } from 'react-native';

import { PlaceSearch } from '@/components/place-search';
import { SafeAreaTestProvider } from '../helpers/safe-area';
import type { PlaceProviderSession } from '@/infrastructure/place/place-provider-session';
import type { PlaceSearchPage, PlaceSearchQuery, PlaceSearchResult } from '@/infrastructure/place/place-provider';
import type { ConfirmPlaceSearchResultCommand } from '@/application/place/confirm-place-search-result';
import type { ConfirmMapPickerPlaceCommand } from '@/application/place/confirm-map-picker-place';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { MapRenderer, MapRendererProps } from '@/infrastructure/map/map-renderer';

const timestamp = '2026-09-14T00:00:00.000Z';

function renderedText(renderer: ReturnType<typeof create>) {
  return renderer.root.findAllByType(Text)
    .map((node) => String(node.props.children))
    .join(' ');
}

const result: PlaceSearchResult = {
  name: '颐和园',
  address: '新建宫门路19号',
  coordinate: { latitude: 39.999676, longitude: 116.275118, system: 'gcj02' },
  provider: 'amap',
  providerPlaceId: 'B000SAMP01',
  regionLabel: '海淀区',
  metadata: { typeCode: '110200' },
};

const confirmedPlace: Place = {
  id: 'place-picked',
  name: '39.99000, 116.28000',
  coordinate: { latitude: 39.99, longitude: 116.28, system: 'gcj02' },
  address: null,
  provider: 'amap',
  providerPlaceId: null,
  metadata: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const confirmedItem: Item = {
  id: 'item-picked',
  tripId: 'trip-1',
  dayId: 'day-1',
  placeId: confirmedPlace.id,
  type: 'sightseeing',
  title: confirmedPlace.name,
  sortOrder: 0,
  timeMode: 'none',
  startDateTime: null,
  endDateTime: null,
  period: null,
  isFixed: false,
  note: null,
  payload: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function session(
  search: (query: PlaceSearchQuery) => Promise<PlaceSearchPage | PlaceSearchResult[]>,
  providerId: 'amap' | 'google' = 'amap',
): PlaceProviderSession {
  return {
    mapRegion: providerId === 'amap' ? 'china_mainland' : 'global',
    providerId,
    coordinateSystem: providerId === 'amap' ? 'gcj02' : 'wgs84',
    provider: {
      search: async (query) => {
        const page = await search(query);
        return Array.isArray(page) ? { results: page, nextCursor: null } : page;
      },
    },
  };
}

function render(props: Partial<React.ComponentProps<typeof PlaceSearch>> = {}) {
  const provider = session(jest.fn(async () => []));
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <SafeAreaTestProvider>
        <PlaceSearch
          onOpenMapPicker={jest.fn()}
          session={provider}
          {...props}
        />
      </SafeAreaTestProvider>,
    );
  });
  return { renderer, provider };
}

test('shows target Day and submits an explicit city, then clears both city and map bias for keyword search', async () => {
  const providerSearch = jest.fn(async () => [result]);
  const { renderer } = render({ session: session(providerSearch), initialDate: '2026-03-20', targetDayIndex: 2,
    initialQuery: { center: result.coordinate },
    confirmation: { command: jest.fn(async () => searchConfirmationResult({ result })), tripId: 'trip-1', dayId: 'day-1' } });
  expect(renderedText(renderer)).toContain('第 2 天');
  expect(renderedText(renderer)).toContain('3月20日 周五');
  act(() => {
    renderer.root.findByProps({ testID: 'place-search-city-toggle' }).props.onPress();
    renderer.root.findByProps({ testID: 'place-search-input' }).props.onChangeText('示例酒店');
  });
  act(() => renderer.root.findByProps({ testID: 'place-search-city-input' }).props.onChangeText(' 北京 '));
  act(() => renderer.root.findByProps({ testID: 'place-search-city-apply' }).props.onPress());
  await act(async () => renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress());
  expect(providerSearch).toHaveBeenLastCalledWith({ keyword: '示例酒店', region: { city: '北京' } });
  act(() => renderer.root.findByProps({ testID: 'place-search-city-toggle' }).props.onPress());
  act(() => {
    renderer.root.findByProps({ testID: 'place-search-city-clear' }).props.onPress();
    renderer.root.findByProps({ testID: 'place-search-input' }).props.onChangeText('西安 示例酒店');
  });
  await act(async () => renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress());
  expect(providerSearch).toHaveBeenLastCalledWith({ keyword: '西安 示例酒店' });
  act(() => renderer.unmount());
});

test('switching the city invalidates an in-flight response and pagination context', async () => {
  let resolve!: (value: PlaceSearchPage) => void;
  const providerSearch = jest.fn(() => new Promise<PlaceSearchPage>((r) => { resolve = r; }));
  const { renderer } = render({ session: session(providerSearch) });
  act(() => renderer.root.findByProps({ testID: 'place-search-input' }).props.onChangeText('示例酒店'));
  act(() => renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'place-search-city-toggle' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'place-search-city-input' }).props.onChangeText('北京'));
  act(() => renderer.root.findByProps({ testID: 'place-search-city-apply' }).props.onPress());
  await act(async () => { resolve({ results: [result], nextCursor: 'old-city' }); });
  expect(renderer.root.findAllByProps({ testID: 'place-search-result-0' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'place-search-has-more' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('search submission dismisses the keyboard and results support drag dismissal', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  const { renderer } = render();
  await act(async () => renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress());
  expect(dismiss).toHaveBeenCalled();
  expect(renderer.root.findByProps({ testID: 'place-search-results' }).props.keyboardDismissMode).toBe('on-drag');
  act(() => renderer.unmount());
  dismiss.mockRestore();
});

test('merged add keeps a custom draft across changing Place and only submits on the final action', async () => {
  const second = { ...result, name: '新店', providerPlaceId: 'second', coordinate: { ...result.coordinate, latitude: 39.8 } };
  const command = jest.fn<ConfirmPlaceSearchResultCommand>(async (input) => searchConfirmationResult(input));
  const { renderer } = render({ session: session(jest.fn(async () => [result, second])), targetDayIndex: 2,
    confirmation: { command, tripId: 'trip-1', dayId: 'day-1' } });
  await searchAndPreview(renderer);
  expect(renderer.root.findAllByProps({ testID: 'place-preview' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'place-preview-name' }).props.children).toBe(result.name);
  expect(command).not.toHaveBeenCalled();
  act(() => {
    renderer.root.findByProps({ testID: 'add-item-draft-title' }).props.onChangeText('入住');
    renderer.root.findByProps({ testID: 'add-item-draft-type-hotel' }).props.onPress();
    renderer.root.findByProps({ testID: 'add-item-draft-note' }).props.onChangeText('晚到，保留房间');
  });
  act(() => renderer.root.findByProps({ testID: 'add-item-draft-change-place' }).props.onPress());
  expect(command).not.toHaveBeenCalled();
  act(() => renderer.root.findByProps({ testID: 'place-search-result-1' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'add-item-draft-title' }).props.value).toBe('入住');
  expect(renderer.root.findByProps({ testID: 'add-item-draft-note' }).props.value).toBe('晚到，保留房间');
  expect(renderer.root.findByProps({ testID: 'place-preview-name' }).props.children).toBe('新店');
  await act(async () => renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress());
  expect(command).toHaveBeenCalledTimes(1);
  expect(command).toHaveBeenCalledWith(expect.objectContaining({ result: second,
    draft: expect.objectContaining({ title: '入住', type: 'hotel', note: '晚到，保留房间' }) }));
  act(() => renderer.unmount());
});

test('explicit cancellation discards an abandoned draft while changing Place preserves it', async () => {
  const command = jest.fn<ConfirmPlaceSearchResultCommand>(async (input) => searchConfirmationResult(input));
  const { renderer } = render({ session: session(jest.fn(async () => [result])),
    confirmation: { command, tripId: 'trip-1', dayId: 'day-1' } });
  await searchAndPreview(renderer);
  act(() => renderer.root.findByProps({ testID: 'add-item-draft-note' }).props.onChangeText('放弃的备注'));
  act(() => renderer.root.findByProps({ testID: 'add-item-draft-close' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'place-search-result-0' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'add-item-draft-note' }).props.value).toBe('');
  expect(command).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('old pagination completion cannot unlock a newer page or leave its progress stuck', async () => {
  let oldPage!: (value: PlaceSearchPage) => void;
  let newPage!: (value: PlaceSearchPage) => void;
  const providerSearch = jest.fn< (query: PlaceSearchQuery) => Promise<PlaceSearchPage> >()
    .mockResolvedValueOnce({ results: [result], nextCursor: 'old' })
    .mockImplementationOnce(() => new Promise((resolve) => { oldPage = resolve; }))
    .mockResolvedValueOnce({ results: [result], nextCursor: 'new' })
    .mockImplementationOnce(() => new Promise((resolve) => { newPage = resolve; }));
  const { renderer } = render({ session: session(providerSearch) });
  act(() => renderer.root.findByProps({ testID: 'place-search-input' }).props.onChangeText('颐和园'));
  await act(async () => renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'place-search-results' }).props.onEndReached());
  await act(async () => renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress());
  expect(renderer.root.findAllByProps({ testID: 'place-search-load-more' })).toHaveLength(0);
  act(() => renderer.root.findByProps({ testID: 'place-search-results' }).props.onEndReached());
  await act(async () => oldPage({ results: [], nextCursor: null }));
  act(() => renderer.root.findByProps({ testID: 'place-search-results' }).props.onEndReached());
  expect(providerSearch).toHaveBeenCalledTimes(4);
  expect(renderer.root.findByProps({ testID: 'place-search-load-more' })).toBeDefined();
  await act(async () => newPage({ results: [], nextCursor: null }));
  expect(renderer.root.findAllByProps({ testID: 'place-search-load-more' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('blank create title uses the current original Place name and in-flight save blocks close and duplicates', async () => {
  let finish!: (value: ReturnType<typeof searchConfirmationResult>) => void;
  const command = jest.fn<ConfirmPlaceSearchResultCommand>(() => new Promise((resolve) => { finish = resolve; }));
  const { renderer } = render({ session: session(jest.fn(async () => [result])),
    confirmation: { command, tripId: 'trip-1', dayId: 'day-1' } });
  await searchAndPreview(renderer);
  const close = renderer.root.findByProps({ testID: 'add-item-draft-close' });
  await act(async () => {
    const save = renderer.root.findByProps({ testID: 'add-item-draft-save' });
    save.props.onPress(); save.props.onPress();
  });
  expect(command).toHaveBeenCalledTimes(1);
  expect(command).toHaveBeenCalledWith(expect.objectContaining({ draft: expect.objectContaining({ title: result.name }) }));
  act(() => { close.props.onPress(); renderer.root.findByType(Modal).props.onRequestClose(); });
  expect(renderer.root.findByProps({ testID: 'add-item-draft-form' })).toBeDefined();
  await act(async () => finish(searchConfirmationResult({ result })));
  expect(renderer.root.findAllByProps({ testID: 'add-item-draft-form' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('pick-only map failure stays on the picker with its original coordinate and visible retry', async () => {
  const command = jest.fn<ConfirmMapPickerPlaceCommand>(async () => { throw new Error('更换未完成'); });
  const { renderer } = render({ mapPicker: { initialCoordinate: result.coordinate,
    mapRenderer: () => <View />, onUseCoordinate: jest.fn(),
    confirmation: { command, tripId: 'trip-1', dayId: 'day-1', pickOnly: true } } });
  act(() => renderer.root.findByProps({ testID: 'place-search-map-picker' }).props.onPress());
  await act(async () => renderer.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'map-picker-error' }).props.children).toBe('更换未完成');
  expect(renderer.root.findByProps({ testID: 'map-picker' })).toBeDefined();
  expect(command).toHaveBeenCalledWith(expect.objectContaining({ coordinate: result.coordinate }));
  act(() => renderer.unmount());
});

test('renders provider identity and persistent map-picker fallback before searching', () => {
  const { renderer } = render();
  expect(renderer.root.findByProps({ testID: 'place-search' })).toBeDefined();
  expect(renderedText(renderer)).toContain('高德地图');
  expect(renderer.root.findByProps({ testID: 'place-search-map-picker' })).toBeDefined();
  expect(renderedText(renderer)).not.toContain('没有找到');
  act(() => renderer.unmount());
});

test('names the page after the task the user is in', () => {
  const { renderer } = render();
  expect(renderer.root.findByProps({ testID: 'place-search-title' }).props.children)
    .toBe('添加行程');
  act(() => renderer.unmount());

  const replacing = render({ title: '更换地点' });
  expect(replacing.renderer.root.findByProps({ testID: 'place-search-title' }).props.children)
    .toBe('更换地点');
  act(() => replacing.renderer.unmount());
});

test('a result row is one tappable line: no coordinate, no separate 查看 button', async () => {
  const onResultPress = jest.fn();
  const { renderer } = render({
    onResultPress,
    session: session(jest.fn(async () => [result])),
  });
  act(() => {
    renderer.root.findByProps({ testID: 'place-search-input' }).props.onChangeText('颐和园');
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress();
  });

  const row = renderer.root.findByProps({ testID: 'place-search-result-0' });
  expect(row.props.accessibilityRole).toBe('button');
  const rowText = row.findAllByType(Text).map((node) => String(node.props.children)).join(' ');
  // A chevron replaces the separate 查看 button.
  expect(rowText).toContain('›');
  // The coordinate belongs to the detail page, and the row itself is the action.
  expect(rowText).not.toContain('39.99968');
  expect(rowText).not.toContain('查看');

  act(() => row.props.onPress());
  expect(onResultPress).toHaveBeenCalledWith(result);
  act(() => renderer.unmount());
});

test('makes the back affordance an explicit leading control', () => {
  const onCancel = jest.fn();
  const { renderer } = render({ onCancel });
  const back = renderer.root.findByProps({ testID: 'place-search-cancel' });

  expect(back.props.accessibilityRole).toBe('button');
  expect(back.props.accessibilityLabel).toBe('返回');
  expect(back.findAllByType(Text).map((node) => node.props.children)).toEqual(['‹', '返回']);

  const tree = renderedText(renderer);
  expect(tree.indexOf('返回')).toBeLessThan(tree.indexOf('添加行程'));

  act(() => back.props.onPress());
  expect(onCancel).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('renders no back control when the caller owns no cancel intent', () => {
  const { renderer } = render();
  expect(renderer.root.findAllByProps({ testID: 'place-search-cancel' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('rejects a blank keyword without invoking the provider', async () => {
  const providerSearch = jest.fn(async () => []);
  const { renderer } = render({ session: session(providerSearch) });
  await act(async () => {
    renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress();
  });
  expect(providerSearch).not.toHaveBeenCalled();
  expect(renderedText(renderer)).toContain('请输入地点名称后再搜索');
  act(() => renderer.unmount());
});

test('shows transient ordered results and emits result intent without persistence', async () => {
  const providerSearch = jest.fn(async () => [result]);
  const onResultPress = jest.fn();
  const confirmCommand = jest.fn<ConfirmPlaceSearchResultCommand>(async (input) => ({
    data: {
      place: {
        id: 'place-1', name: input.result.name, coordinate: input.result.coordinate,
        address: input.result.address, provider: input.result.provider,
        providerPlaceId: input.result.providerPlaceId, metadata: input.result.metadata,
        createdAt: '2026-09-14T08:00:00.000Z', updatedAt: '2026-09-14T08:00:00.000Z',
      },
      item: {
        id: 'item-1', tripId: input.tripId, dayId: input.dayId, placeId: 'place-1',
        type: 'custom', title: input.result.name, sortOrder: 0, timeMode: 'none',
        startDateTime: null, endDateTime: null, period: null, isFixed: false,
        note: null, payload: null, createdAt: '2026-09-14T08:00:00.000Z',
        updatedAt: '2026-09-14T08:00:00.000Z',
      },
    },
    affectedEntityIds: ['place-1', 'item-1'],
    validationIssues: [],
  }));
  const { renderer } = render({
    confirmation: { command: confirmCommand, tripId: 'trip-1', dayId: 'day-1' },
    onResultPress,
    session: session(providerSearch),
  });
  act(() => {
    renderer.root.findByProps({ testID: 'place-search-input' }).props.onChangeText(' 颐和园 ');
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress();
  });

  expect(providerSearch).toHaveBeenCalledWith({ keyword: '颐和园' });
  expect(renderedText(renderer)).toContain('颐和园');
  expect(renderedText(renderer)).toContain('新建宫门路19号');
  act(() => renderer.root.findByProps({ testID: 'place-search-result-0' }).props.onPress());
  expect(onResultPress).toHaveBeenCalledWith(result);
  expect(renderer.root.findAllByProps({ testID: 'place-preview' })).toHaveLength(0);
  expect(confirmCommand).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({ testID: 'add-item-draft-form' })).toBeDefined();
  act(() => {
    renderer.root.findByProps({ testID: 'add-item-draft-title' }).props.onChangeText('晚餐');
    renderer.root.findByProps({ testID: 'add-item-draft-type-food' }).props.onPress();
    renderer.root.findByProps({ testID: 'add-item-draft-time-period' }).props.onPress();
  });
  act(() => {
    renderer.root.findByProps({ testID: 'add-item-draft-period-night' }).props.onPress();
    renderer.root.findByProps({ testID: 'add-item-draft-note' }).props.onChangeText('提前预约');
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });
  expect(confirmCommand).toHaveBeenCalledWith({
    tripId: 'trip-1', dayId: 'day-1', result,
    draft: {
      title: '晚餐', type: 'food', timeMode: 'period',
      startDateTime: null, endDateTime: null, period: 'night',
      note: '提前预约', payload: null,
    },
  });
  expect(renderer.root.findAllByProps({ testID: 'place-preview' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('search confirmation keeps a custom category separate from the Item title', async () => {
  const confirmCommand = jest.fn<ConfirmPlaceSearchResultCommand>(async () => ({
    data: { place: confirmedPlace, item: confirmedItem },
    affectedEntityIds: [confirmedPlace.id, confirmedItem.id],
    validationIssues: [],
  }));
  const { renderer } = render({
    confirmation: { command: confirmCommand, tripId: 'trip-1', dayId: 'day-1' },
    session: session(jest.fn(async () => [result])),
  });

  act(() => {
    renderer.root.findByProps({ testID: 'place-search-input' }).props.onChangeText('颐和园');
  });
  await act(async () => renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'place-search-result-0' }).props.onPress());
  act(() => {
    renderer.root.findByProps({ testID: 'add-item-draft-title' }).props.onChangeText('逛园子');
    renderer.root.findByProps({ testID: 'add-item-draft-type-custom' }).props.onPress();
  });
  act(() => {
    renderer.root.findByProps({ testID: 'add-item-draft-custom-label' })
      .props.onChangeText('  拍照  ');
  });
  await act(async () => renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress());

  expect(confirmCommand).toHaveBeenCalledWith(expect.objectContaining({
    draft: expect.objectContaining({
      title: '逛园子',
      type: 'custom',
      payload: { kind: 'custom', label: '拍照' },
    }),
  }));
  act(() => renderer.unmount());
});

test('shows compact Google source text only on actual Google results, with no extra logo', async () => {
  const overseas: PlaceSearchResult = {
    ...result, name: '东京站', provider: 'google', providerPlaceId: 'tokyo-station',
    coordinate: { latitude: 35.6813, longitude: 139.7671, system: 'wgs84' },
  };
  const { renderer } = render({
    session: { ...session(jest.fn(async () => [result, overseas]), 'google'), automatic: true },
  });
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'Google Maps' })).toHaveLength(0);
  act(() => renderer.root.findByProps({ testID: 'place-search-input' }).props.onChangeText('东京站'));
  await act(async () => renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress());
  expect(renderer.root.findAllByProps({ testID: 'place-search-google-source-0' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'place-search-google-source-1' }).findByType(Text).props.children).toBe('Google Maps');
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'place-search-provider-attribution' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('exposes loading, empty and provider-error states', async () => {
  let resolve!: (value: PlaceSearchResult[]) => void;
  const pending = new Promise<PlaceSearchResult[]>((nextResolve) => { resolve = nextResolve; });
  const providerSearch = jest.fn(() => pending);
  const { renderer } = render({ session: session(providerSearch) });
  act(() => {
    renderer.root.findByProps({ testID: 'place-search-input' }).props.onChangeText('颐和园');
  });
  let searchPromise!: Promise<void>;
  act(() => {
    searchPromise = renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'place-search-loading' })).toBeDefined();
  await act(async () => {
    resolve([]);
    await searchPromise;
  });
  expect(renderer.root.findByProps({ testID: 'place-search-empty' })).toBeDefined();
  act(() => renderer.unmount());

  const failed = render({
    session: session(jest.fn(async () => { throw new Error('network down'); })),
  });
  act(() => {
    failed.renderer.root.findByProps({ testID: 'place-search-input' }).props.onChangeText('颐和园');
  });
  await act(async () => {
    failed.renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress();
  });
  expect(failed.renderer.root.findByProps({ testID: 'place-search-error' })).toBeDefined();
  expect(renderedText(failed.renderer)).toContain('network down');
  act(() => failed.renderer.unmount());
});

test('paginates the long results list, preserves rows on failure, and retries with the same cursor', async () => {
  const next = { ...result, name: '颐和园东门', providerPlaceId: 'amap-page-2' };
  const providerSearch = jest.fn<(query: PlaceSearchQuery) => Promise<PlaceSearchPage>>()
    .mockResolvedValueOnce({ results: [result], nextCursor: 'amap:2' })
    .mockRejectedValueOnce(new Error('page offline'))
    .mockResolvedValueOnce({ results: [next], nextCursor: null });
  const { renderer } = render({ session: session(providerSearch) });
  act(() => renderer.root.findByProps({ testID: 'place-search-input' }).props.onChangeText('颐和园'));
  await act(async () => {
    renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress();
  });

  await act(async () => {
    renderer.root.findByProps({ testID: 'place-search-results' }).props.onEndReached();
  });
  expect(renderer.root.findByProps({ testID: 'place-search-result-0' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'place-search-load-more-error' }).props.children)
    .toContain('page offline');
  await act(async () => {
    renderer.root.findByProps({ testID: 'place-search-load-more-retry' }).props.onPress();
  });
  expect(providerSearch).toHaveBeenLastCalledWith({ keyword: '颐和园', cursor: 'amap:2' });
  expect(renderer.root.findByProps({ testID: 'place-search-result-1' })).toBeDefined();
  act(() => renderer.unmount());
});

test('discards a stale provider response after the keyword changes', async () => {
  let resolveOld!: (page: PlaceSearchPage) => void;
  let resolveNew!: (page: PlaceSearchPage) => void;
  const oldPage = new Promise<PlaceSearchPage>((resolve) => { resolveOld = resolve; });
  const newPage = new Promise<PlaceSearchPage>((resolve) => { resolveNew = resolve; });
  const providerSearch = jest.fn<(query: PlaceSearchQuery) => Promise<PlaceSearchPage>>((query) =>
    query.keyword === 'old' ? oldPage : newPage,
  );
  const { renderer } = render({ session: session(providerSearch) });
  const input = renderer.root.findByProps({ testID: 'place-search-input' });
  act(() => input.props.onChangeText('old'));
  let oldRequest!: Promise<void>;
  act(() => { oldRequest = renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress(); });
  act(() => input.props.onChangeText('new'));
  let newRequest!: Promise<void>;
  act(() => { newRequest = renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress(); });

  const newer = { ...result, name: '新的候选', providerPlaceId: 'new-id' };
  await act(async () => {
    resolveNew({ results: [newer], nextCursor: null });
    await newRequest;
  });
  await act(async () => {
    resolveOld({ results: [result], nextCursor: null });
    await oldRequest;
  });
  expect(renderedText(renderer)).toContain('新的候选');
  expect(renderer.root.findAllByProps({ testID: 'place-search-result-0' })[0]
    .findAllByType(Text).map((node) => String(node.props.children)).join(' '))
    .not.toContain('颐和园');
  act(() => renderer.unmount());
});

test('map-picker intent is presentation-only', () => {
  const onOpenMapPicker = jest.fn();
  const { renderer } = render({ onOpenMapPicker });
  act(() => renderer.root.findByProps({ testID: 'place-search-map-picker' }).props.onPress());
  expect(onOpenMapPicker).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('opens the configured fixed-crosshair picker and returns its coordinate intent', async () => {
  let rendererProps!: MapRendererProps;
  const mapRenderer: MapRenderer = (props) => {
    rendererProps = props;
    return <View testID="place-search-fake-map" />;
  };
  const onUseCoordinate = jest.fn();
  const { renderer } = render({
    mapPicker: {
      mapRenderer,
      initialCoordinate: result.coordinate,
      onUseCoordinate,
    },
  });
  act(() => renderer.root.findByProps({ testID: 'place-search-map-picker' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'map-picker-crosshair' })).toBeDefined();
  const next = { latitude: 40.001, longitude: 116.281, system: 'gcj02' as const };
  act(() => rendererProps.onViewportChange?.({
    center: next,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }));
  await act(async () => {
    renderer.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress();
  });
  expect(onUseCoordinate).toHaveBeenCalledWith({ coordinate: next, enrichment: null });
  expect(renderer.root.findByProps({ testID: 'place-search' })).toBeDefined();
  act(() => renderer.unmount());
});

test('saves the picked coordinate through the injected picker command', async () => {
  let rendererProps!: MapRendererProps;
  const mapRenderer: MapRenderer = (props) => {
    rendererProps = props;
    return <View testID="place-search-fake-map" />;
  };
  const command = jest.fn<ConfirmMapPickerPlaceCommand>(async () => ({
    data: { place: confirmedPlace, item: confirmedItem },
    affectedEntityIds: [confirmedPlace.id, confirmedItem.id],
    validationIssues: [],
  }));
  const onConfirmed = jest.fn();
  const onUseCoordinate = jest.fn();
  const { renderer } = render({
    mapPicker: {
      mapRenderer,
      initialCoordinate: result.coordinate,
      onUseCoordinate,
      confirmation: {
        command,
        tripId: 'trip-1',
        dayId: 'day-1',
        itemType: 'sightseeing',
        onConfirmed,
      },
    },
  });
  act(() => renderer.root.findByProps({ testID: 'place-search-map-picker' }).props.onPress());
  const next = { latitude: 39.99, longitude: 116.28, system: 'gcj02' as const };
  act(() => rendererProps.onViewportChange?.({
    center: next,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }));
  await act(async () => {
    renderer.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress();
  });

  expect(command).not.toHaveBeenCalled();
  act(() => renderer.root.findByProps({ testID: 'add-item-draft-type-custom' }).props.onPress());
  act(() => {
    renderer.root.findByProps({ testID: 'add-item-draft-custom-label' })
      .props.onChangeText('购物');
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });

  expect(command).toHaveBeenCalledWith({
    tripId: 'trip-1',
    dayId: 'day-1',
    coordinate: next,
    enrichment: null,
    draft: {
      title: '39.99000, 116.28000', type: 'custom', timeMode: 'none',
      startDateTime: null, endDateTime: null, period: null,
      note: null, payload: { kind: 'custom', label: '购物' },
    },
  });
  expect(onConfirmed).toHaveBeenCalledWith({
    place: confirmedPlace,
    item: confirmedItem,
  });
  expect(onUseCoordinate).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({ testID: 'place-search' })).toBeDefined();
  act(() => renderer.unmount());
});

test('keeps the Item Draft open and shows a failed save for correction', async () => {
  let rendererProps!: MapRendererProps;
  const mapRenderer: MapRenderer = (props) => {
    rendererProps = props;
    return <View testID="place-search-fake-map" />;
  };
  const command = jest.fn<ConfirmMapPickerPlaceCommand>(async () => {
    throw new Error('transaction rolled back');
  });
  const onConfirmed = jest.fn();
  const { renderer } = render({
    mapPicker: {
      mapRenderer,
      initialCoordinate: result.coordinate,
      onUseCoordinate: jest.fn(),
      confirmation: { command, tripId: 'trip-1', dayId: null, onConfirmed },
    },
  });
  act(() => renderer.root.findByProps({ testID: 'place-search-map-picker' }).props.onPress());
  await act(async () => {
    renderer.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });

  expect(renderer.root.findByProps({ testID: 'add-item-draft-form' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'add-item-draft-error' }).props.children)
    .toBe('transaction rolled back');
  expect(renderedText(renderer)).toContain('添加到未安排');
  expect(onConfirmed).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('keeps the create form open and shows command failure after a rollback', async () => {
  const confirmCommand = jest.fn<ConfirmPlaceSearchResultCommand>(async () => {
    throw new Error('transaction rolled back');
  });
  const { renderer } = render({
    confirmation: { command: confirmCommand, tripId: 'trip-1', dayId: null },
    session: session(jest.fn(async () => [result])),
  });
  act(() => {
    renderer.root.findByProps({ testID: 'place-search-input' }).props.onChangeText('颐和园');
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress();
  });
  act(() => renderer.root.findByProps({ testID: 'place-search-result-0' }).props.onPress());
  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });

  expect(renderer.root.findByProps({ testID: 'add-item-draft-form' })).toBeDefined();
  expect(renderedText(renderer)).toContain('transaction rolled back');
  act(() => renderer.unmount());
});

function searchConfirmationResult(input: { result: PlaceSearchResult }) {
  return {
    data: {
      place: {
        ...confirmedPlace,
        name: input.result.name,
        coordinate: input.result.coordinate,
      },
      item: confirmedItem,
    },
    affectedEntityIds: [confirmedPlace.id, confirmedItem.id],
    validationIssues: [],
  };
}

/** Search for the fixture result and open its Preview. */
async function searchAndPreview(renderer: ReturnType<typeof create>) {
  act(() => {
    renderer.root.findByProps({ testID: 'place-search-input' }).props.onChangeText('颐和园');
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress();
  });
  act(() => renderer.root.findByProps({ testID: 'place-search-result-0' }).props.onPress());
}

test('a caller-owned selection is reported instead of committed', async () => {
  const command = jest.fn<ConfirmPlaceSearchResultCommand>(async (input) =>
    searchConfirmationResult(input));
  const onSelectTarget = jest.fn();
  const onConfirmed = jest.fn();
  const { renderer } = render({
    confirmation: {
      command,
      dayId: 'day-1',
      onConfirmed,
      onSelectTarget,
      pickOnly: true,
      tripId: 'trip-1',
    },
    session: session(jest.fn(async () => [result])),
  });

  await searchAndPreview(renderer);
  // Replace mode names the action after the replace, not the ambiguous continue.
  expect(renderedText(renderer)).toContain('更改为此地点');
  await act(async () => {
    renderer.root.findByProps({ testID: 'place-preview-confirm' }).props.onPress();
  });

  expect(onSelectTarget).toHaveBeenCalledWith({ kind: 'search', result });
  // Nothing is written: the Item editor owns the draft until 保存.
  expect(command).not.toHaveBeenCalled();
  expect(onConfirmed).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({ testID: 'add-item-draft-form' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('a caller-owned map pick is reported instead of committed', async () => {
  let rendererProps!: MapRendererProps;
  const mapRenderer: MapRenderer = (props) => {
    rendererProps = props;
    return <View testID="place-search-fake-map" />;
  };
  const command = jest.fn<ConfirmMapPickerPlaceCommand>(async () => ({
    data: { place: confirmedPlace, item: confirmedItem },
    affectedEntityIds: [confirmedPlace.id, confirmedItem.id],
    validationIssues: [],
  }));
  const onSelectTarget = jest.fn();
  const { renderer } = render({
    mapPicker: {
      confirmation: {
        command,
        dayId: 'day-1',
        onSelectTarget,
        pickOnly: true,
        tripId: 'trip-1',
      },
      initialCoordinate: result.coordinate,
      mapRenderer,
      onUseCoordinate: jest.fn(),
    },
  });

  act(() => renderer.root.findByProps({ testID: 'place-search-map-picker' }).props.onPress());
  const next = { latitude: 39.99, longitude: 116.28, system: 'gcj02' as const };
  act(() => rendererProps.onViewportChange?.({
    center: next,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }));
  await act(async () => {
    renderer.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress();
  });

  expect(onSelectTarget).toHaveBeenCalledWith({
    kind: 'map-picker',
    coordinate: next,
    enrichment: null,
  });
  expect(command).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('clearing the Place is a contextual action, not a permanent large button', () => {
  const onClearPlace = jest.fn();
  const { renderer } = render({ onClearPlace });

  act(() => renderer.root.findByProps({ testID: 'place-search-clear-place' }).props.onPress());
  expect(onClearPlace).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());

  const withoutClear = render();
  expect(withoutClear.renderer.root.findAllByProps({ testID: 'place-search-clear-place' }))
    .toHaveLength(0);
  act(() => withoutClear.renderer.unmount());
});

test('forwards the provider handoff to the preview page', async () => {
  const onOpenInExternalMap = jest.fn(async () => ({ app: 'amap', url: 'mocked' }));
  const { renderer } = render({
    onOpenInExternalMap,
    session: session(jest.fn(async () => [result])),
  });

  await searchAndPreview(renderer);
  await act(async () => {
    renderer.root.findByProps({ testID: 'place-preview-open-in-map' }).props.onPress();
  });

  expect(onOpenInExternalMap).toHaveBeenCalledWith(result);
  act(() => renderer.unmount());
});
test('pick-only commits the selected result and never opens the Item Draft form', async () => {
  const command = jest.fn<ConfirmPlaceSearchResultCommand>(
    async (input) => searchConfirmationResult(input),
  );
  const onConfirmed = jest.fn();
  const { renderer } = render({
    confirmation: { command, dayId: 'day-1', onConfirmed, pickOnly: true, tripId: 'trip-1' },
    session: session(jest.fn(async () => [result])),
  });

  await searchAndPreview(renderer);
  expect(renderer.root.findByProps({ testID: 'place-preview' })).toBeDefined();
  await act(async () => {
    renderer.root.findByProps({ testID: 'place-preview-confirm' }).props.onPress();
  });

  // The Item already exists and owns its title/type/time, so asking again would
  // offer edits this flow will not save.
  expect(renderer.root.findAllByProps({ testID: 'add-item-draft-form' })).toHaveLength(0);
  expect(command).toHaveBeenCalledWith({ tripId: 'trip-1', dayId: 'day-1', result });
  expect(onConfirmed).toHaveBeenCalledWith(expect.objectContaining({ item: confirmedItem }));
  act(() => renderer.unmount());
});

test('pick-only reports a commit failure inside the still-open detail layer', async () => {
  const command = jest.fn<ConfirmPlaceSearchResultCommand>(async () => {
    throw new RangeError('Place provider must match the Trip map region');
  });
  const onConfirmed = jest.fn();
  const { renderer } = render({
    confirmation: { command, dayId: 'day-1', onConfirmed, pickOnly: true, tripId: 'trip-1' },
    session: session(jest.fn(async () => [result])),
  });

  await searchAndPreview(renderer);
  await act(async () => {
    renderer.root.findByProps({ testID: 'place-preview-confirm' }).props.onPress();
  });

  expect(renderer.root.findByProps({ testID: 'place-preview-error' }).props.children)
    .toBe('Place provider must match the Trip map region');
  expect(renderer.root.findAllByProps({ testID: 'add-item-draft-form' })).toHaveLength(0);
  expect(onConfirmed).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('pick-only ignores a repeated confirm while the first commit is in flight', async () => {
  let resolveCommit!: (value: ReturnType<typeof searchConfirmationResult>) => void;
  const pending = new Promise<ReturnType<typeof searchConfirmationResult>>((resolve) => {
    resolveCommit = resolve;
  });
  const command = jest.fn<ConfirmPlaceSearchResultCommand>(() => pending);
  const { renderer } = render({
    confirmation: { command, dayId: 'day-1', pickOnly: true, tripId: 'trip-1' },
    session: session(jest.fn(async () => [result])),
  });

  await searchAndPreview(renderer);
  await act(async () => {
    renderer.root.findByProps({ testID: 'place-preview-confirm' }).props.onPress();
    renderer.root.findByProps({ testID: 'place-preview-confirm' }).props.onPress();
  });

  expect(command).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByProps({ testID: 'place-search-confirming' })).toBeDefined();

  await act(async () => {
    resolveCommit(searchConfirmationResult({ result }));
    await Promise.resolve();
  });
  act(() => renderer.unmount());
});

test('pick-only commits a picked coordinate without opening the Item Draft form', async () => {
  let rendererProps!: MapRendererProps;
  const mapRenderer: MapRenderer = (props) => {
    rendererProps = props;
    return <View testID="place-search-fake-map" />;
  };
  const command = jest.fn<ConfirmMapPickerPlaceCommand>(async () => ({
    data: { place: confirmedPlace, item: confirmedItem },
    affectedEntityIds: [confirmedPlace.id, confirmedItem.id],
    validationIssues: [],
  }));
  const onConfirmed = jest.fn();
  const { renderer } = render({
    mapPicker: {
      confirmation: { command, dayId: 'day-1', onConfirmed, pickOnly: true, tripId: 'trip-1' },
      initialCoordinate: result.coordinate,
      mapRenderer,
      onUseCoordinate: jest.fn(),
    },
  });

  act(() => renderer.root.findByProps({ testID: 'place-search-map-picker' }).props.onPress());
  const next = { latitude: 39.99, longitude: 116.28, system: 'gcj02' as const };
  act(() => rendererProps.onViewportChange?.({
    center: next,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }));
  await act(async () => {
    renderer.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress();
  });

  expect(command).toHaveBeenCalledWith({
    tripId: 'trip-1',
    dayId: 'day-1',
    coordinate: next,
    enrichment: null,
  });
  expect(renderer.root.findAllByProps({ testID: 'add-item-draft-form' })).toHaveLength(0);
  expect(onConfirmed).toHaveBeenCalledWith({ place: confirmedPlace, item: confirmedItem });
  // The picker closed and the search surface is back, not the draft form.
  expect(renderer.root.findByProps({ testID: 'place-search' })).toBeDefined();
  act(() => renderer.unmount());
});

test('a typed throttle asks the user to wait and exposes no empty-result alternatives', async () => {
  const { PlaceProviderError } = jest.requireActual<typeof import('@/infrastructure/place/place-provider')>('@/infrastructure/place/place-provider');
  const search = jest.fn(async () => { throw new PlaceProviderError('apple', 'rate_limited', 'native throttle'); });
  const { renderer } = render({ session: session(search), initialQuery: { keyword: '示例历史文化街区' },
    emptySearchSuggestions: ['示例市示例路64号'] });
  await act(async () => { renderer.root.findByProps({ testID: 'place-search-submit' }).props.onPress(); });
  expect(renderedText(renderer)).toContain('搜索请求较多，请稍候再试。');
  expect(renderer.root.findAllByProps({ testID: 'place-search-suggestions' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'place-search-empty' })).toHaveLength(0);
  act(() => renderer.unmount());
});
