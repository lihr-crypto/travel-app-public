import { expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import { ItemEditorModal } from '@/components/item-editor-modal';
import type { ItemDraft } from '@/application/item/item-draft';
import type { Item } from '@/domain/item/types';
import type { Day } from '@/domain/trip/types';
import { SafeAreaTestProvider } from '../helpers/safe-area';

const timestamp = '2026-09-14T00:00:00.000Z';

const item: Item = {
  id: 'item-1',
  tripId: 'trip-1',
  dayId: 'day-1',
  placeId: 'place-1',
  type: 'sightseeing',
  title: '取车',
  sortOrder: 0,
  timeMode: 'none',
  startDateTime: null,
  endDateTime: null,
  period: null,
  isFixed: false,
  note: '预约 10:00 场次',
  payload: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const day: Day = {
  id: 'day-1',
  tripId: 'trip-1',
  date: '2026-09-20',
  dayIndex: 2,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function renderEditor(overrides: Partial<React.ComponentProps<typeof ItemEditorModal>> = {}) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <SafeAreaTestProvider>
        <ItemEditorModal
          commitDraft={jest.fn(async (draft: ItemDraft) => ({ ...item, ...draft }))}
          day={day}
          item={item}
          onClose={jest.fn()}
          visible
          {...overrides}
        />
      </SafeAreaTestProvider>,
    );
  });
  return renderer;
}

test('opens the shared editor directly with fixed save/cancel actions', () => {
  const renderer = renderEditor();
  expect(renderer.root.findByProps({ testID: 'item-editor-modal' })).toBeDefined();
  // The header names the current draft, and falls back to the Place when the
  // optional name is empty.
  expect(renderer.root.findByProps({ testID: 'quick-edit-header-title' }).props.children)
    .toBe(item.title);
  expect(renderer.root.findByProps({ testID: 'quick-edit-title' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'quick-edit-save' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'quick-edit-close' })).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'item-detail-content' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('names the title field 名称（可选） and explains the location fallback', () => {
  const renderer = renderEditor();
  expect(JSON.stringify(renderer.toJSON())).toContain('名称（可选）');
  expect(renderer.root.findByProps({ testID: 'quick-edit-title' }).props.placeholder)
    .toBe('不填写时使用地点名称');
  expect(renderer.root.findByProps({ testID: 'quick-edit-title' }).props.accessibilityLabel)
    .toBe('名称');
  act(() => renderer.unmount());
});

test('commits the complete draft, reports the save and closes', async () => {
  const commitDraft = jest.fn(async (draft: ItemDraft) => ({ ...item, ...draft, title: '还车' }));
  const onItemSaved = jest.fn();
  const onClose = jest.fn();
  const renderer = renderEditor({ commitDraft, onClose, onItemSaved });

  act(() => {
    renderer.root.findByProps({ testID: 'quick-edit-title' }).props.onChangeText('还车');
    renderer.root.findByProps({ testID: 'quick-edit-note' }).props.onChangeText('新的备注');
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'quick-edit-save' }).props.onPress();
  });

  expect(commitDraft).toHaveBeenCalledWith(expect.objectContaining({
    title: '还车',
    note: '新的备注',
  }));
  expect(onItemSaved).toHaveBeenCalledWith(expect.objectContaining({ title: '还车' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('reports every edit so the caller can preserve the draft', () => {
  const onDraftChange = jest.fn();
  const renderer = renderEditor({ onDraftChange });

  act(() => {
    renderer.root.findByProps({ testID: 'quick-edit-title' }).props.onChangeText('取车');
    renderer.root.findByProps({ testID: 'quick-edit-note' }).props.onChangeText('提前联系租车公司');
  });

  expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({
    title: '取车',
    note: '提前联系租车公司',
  }));
  act(() => renderer.unmount());
});

test('keeps form values and displays a command error when save fails', async () => {
  const commitDraft = jest.fn(async () => {
    throw new RangeError('Invalid TravelLocalDateTime');
  });
  const onClose = jest.fn();
  const renderer = renderEditor({ commitDraft, onClose });

  act(() => {
    renderer.root.findByProps({ testID: 'quick-edit-title' }).props.onChangeText('Keep this');
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'quick-edit-save' }).props.onPress();
  });

  expect(renderer.root.findByProps({ testID: 'quick-edit-title' }).props.value).toBe('Keep this');
  expect(renderer.root.findByProps({ testID: 'quick-edit-error' }).props.children)
    .toBe('Invalid TravelLocalDateTime');
  expect(onClose).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('keeps the current Place read-only when no change-place seam is provided', () => {
  const renderer = renderEditor({
    place: { name: '机场', address: '北京市顺义区' },
  });
  const text = JSON.stringify(renderer.toJSON());
  expect(renderer.root.findByProps({ testID: 'item-editor-place-summary' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'item-editor-place-name' }).props.children)
    .toBe('机场');
  expect(renderer.root.findAllByProps({ testID: 'item-editor-change-place' })).toHaveLength(0);
  expect(text).not.toContain('item-editor-open-in-map');
  expect(text).not.toContain('在地图中查看');
  act(() => renderer.unmount());
});

test('forwards the change-place action and offers selection when no Place is set', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const onChangePlace = jest.fn();
  const renderer = renderEditor({
    onChangePlace,
    place: { name: '机场', address: '北京市顺义区' },
  });

  const button = renderer.root.findByProps({ testID: 'item-editor-change-place' });
  expect(button.findByType(Text).props.children).toBe('更改');
  expect(button.props.accessibilityLabel).toBe('更改地点');
  act(() => button.props.onPress());
  expect(onChangePlace).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());

  const choosePlace = jest.fn();
  const unsetRenderer = renderEditor({ onChangePlace: choosePlace });
  expect(unsetRenderer.root.findByProps({ testID: 'item-editor-place-name' }).props.children)
    .toBe('未设置地点');
  const chooseButton = unsetRenderer.root.findByProps({ testID: 'item-editor-change-place' });
  expect(chooseButton.findByType(Text).props.children).toBe('选择地点');
  expect(chooseButton.props.accessibilityLabel).toBe('选择地点');
  act(() => chooseButton.props.onPress());
  expect(choosePlace).toHaveBeenCalledTimes(1);
  act(() => unsetRenderer.unmount());
});

test('disables change-place while the form save is pending', async () => {
  let resolveCommit!: (saved: Item) => void;
  const commitDraft = jest.fn(() => new Promise<Item>((resolve) => {
    resolveCommit = resolve;
  }));
  const onChangePlace = jest.fn();
  const onClose = jest.fn();
  const renderer = renderEditor({ commitDraft, onChangePlace, onClose });
  const { Modal } = jest.requireActual<typeof import('react-native')>('react-native');
  const modal = renderer.root.findByType(Modal);

  act(() => renderer.root.findByProps({ testID: 'quick-edit-save' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'item-editor-change-place' }).props.disabled).toBe(true);
  act(() => modal.props.onRequestClose());
  expect(onClose).not.toHaveBeenCalled();
  expect(onChangePlace).not.toHaveBeenCalled();

  await act(async () => {
    resolveCommit(item);
  });
  expect(onClose).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('uses the normal editor close request when no place-picker layer is present', () => {
  const { Modal } = jest.requireActual<typeof import('react-native')>('react-native');
  const onClose = jest.fn();
  const onClosePlacePicker = jest.fn();
  const renderer = renderEditor({ onClose, onClosePlacePicker });

  act(() => renderer.root.findByType(Modal).props.onRequestClose());
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onClosePlacePicker).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('renders the place picker above the still-mounted form in the same Modal', () => {
  const { Modal, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const onClose = jest.fn();
  const onClosePlacePicker = jest.fn();
  const renderer = renderEditor({
    onClose,
    onClosePlacePicker,
    place: { name: '机场', address: null },
    placePickerLayer: <View testID="place-picker-content" />,
  });
  const modal = renderer.root.findByType(Modal);

  expect(renderer.root.findAllByType(Modal)).toHaveLength(1);
  expect(modal.findByProps({ testID: 'item-editor-place-picker-layer' })).toBeDefined();
  expect(modal.findByProps({ testID: 'place-picker-content' })).toBeDefined();
  expect(modal.findByProps({ testID: 'quick-edit-title' })).toBeDefined();
  act(() => renderer.root.findByProps({ testID: 'quick-edit-title' }).props.onChangeText('未保存标题'));
  expect(modal.findByProps({ testID: 'quick-edit-title' }).props.value).toBe('未保存标题');

  act(() => modal.props.onRequestClose());
  expect(onClosePlacePicker).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});
