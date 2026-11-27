import { expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import type { ItemDraft } from '@/application/item/item-draft';
import { ItemDraftForm } from '@/components/item-draft-form';
import { ItemEditorModal } from '@/components/item-editor-modal';
import type { Item } from '@/domain/item/types';
import type { Day } from '@/domain/trip/types';
import { SafeAreaTestProvider } from '../helpers/safe-area';

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: jest.fn((props: { testID?: string }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
    return React.createElement(ReactNative.View, { testID: props.testID });
  }),
}));

const DateTimePickerMock = jest.requireMock('@react-native-community/datetimepicker') as {
  default: ReturnType<typeof jest.fn>;
};

const draft: ItemDraft = {
  title: 'Plan item',
  type: 'custom',
  timeMode: 'none',
  startDateTime: null,
  endDateTime: null,
  period: null,
  note: null,
  payload: null,
};

function renderForm(
  initialDraft = draft,
  onSave: (value: ItemDraft) => Promise<void> = async () => undefined,
) {
  let renderer!: ReturnType<typeof create>;
  DateTimePickerMock.default.mockClear();
  act(() => {
    renderer = create(
      <SafeAreaTestProvider>
        <ItemDraftForm
          initialDate="2026-03-11"
          initialDraft={initialDraft}
          onCancel={jest.fn()}
          onSave={onSave}
          testIDPrefix="add-item-draft"
        />
      </SafeAreaTestProvider>,
    );
  });
  return renderer;
}

test('period mode is a child section of the stronger three-way time control', () => {
  const renderer = renderForm();

  act(() => renderer.root.findByProps({ testID: 'add-item-draft-time-period' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'add-item-draft-time-mode' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'add-item-draft-period-region' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).toContain('中午');
  expect(JSON.stringify(renderer.toJSON())).toContain('晚上');
  // The mode is already visible on the segmented control, so no second label
  // restates it.
  expect(JSON.stringify(renderer.toJSON())).not.toContain('选择时段');
  act(() => renderer.unmount());
});

test('custom type is independent of title, trims and limits its label, and clears on normal type', async () => {
  const onSave = jest.fn(async () => undefined);
  const renderer = renderForm(draft, onSave);

  expect(renderer.root.findByProps({ testID: 'add-item-draft-custom-label' }).props.maxLength)
    .toBe(20);
  act(() => {
    renderer.root.findByProps({ testID: 'add-item-draft-custom-label' })
      .props.onChangeText('  拍照  ');
    renderer.root.findByProps({ testID: 'add-item-draft-type-food' }).props.onPress();
  });
  expect(renderer.root.findAllByProps({ testID: 'add-item-draft-custom-label' })).toHaveLength(0);
  act(() => renderer.root.findByProps({ testID: 'add-item-draft-type-custom' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'add-item-draft-custom-label' }).props.value)
    .toBe('  拍照  ');

  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Plan item',
    type: 'custom',
    payload: { kind: 'custom', label: '拍照' },
  }));
  act(() => renderer.unmount());
});

test('blank custom label becomes null and text is capped at twenty Unicode characters', async () => {
  const onSave = jest.fn(async () => undefined);
  const renderer = renderForm(draft, onSave);

  act(() => {
    renderer.root.findByProps({ testID: 'add-item-draft-custom-label' })
      .props.onChangeText('12345678901234567890X');
  });
  expect(renderer.root.findByProps({ testID: 'add-item-draft-custom-label' }).props.value)
    .toBe('12345678901234567890');
  act(() => renderer.root.findByProps({ testID: 'add-item-draft-custom-label' }).props.onChangeText('   '));
  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ payload: null }));
  act(() => renderer.unmount());
});

/** Props of a mounted clock wheel, taken from the mocked native picker. */
function pickerProps(testID: string) {
  return DateTimePickerMock.default.mock.calls
    .map(([props]) => props as Record<string, unknown>)
    .find((props) => props.testID === testID);
}

function setPicker(testID: string, value: Date) {
  const props = pickerProps(testID)!;
  (props.onValueChange as (_event: unknown, value: Date) => void)({}, value);
}

test('exact time keeps the wheel collapsed until a time row is opened', async () => {
  const onSave = jest.fn(async () => undefined);
  const renderer = renderForm(draft, onSave);

  act(() => renderer.root.findByProps({ testID: 'add-item-draft-time-exact' }).props.onPress());

  // No permanently visible wheel, and no repeated Day context line.
  expect(DateTimePickerMock.default).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({ testID: 'add-item-draft-start-picker' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'add-item-draft-day-date' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'add-item-draft-start-date' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'add-item-draft-start-time' })).toHaveLength(0);
  // Neither endpoint is manufactured when exact mode is selected. Each row
  // provides its own add/set affordance.
  expect(renderer.root.findAllByProps({ testID: 'add-item-draft-start-value' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'add-item-draft-start-row' }).props.label)
    .toBe('添加开始时间');
  expect(renderer.root.findByProps({ testID: 'add-item-draft-end-add' })).toBeDefined();

  act(() => renderer.root.findByProps({ testID: 'add-item-draft-start-row' }).props.onPress());
  const picker = pickerProps('add-item-draft-start-picker')!;
  expect(picker.mode).toBe('time');
  expect(picker.display).toBe('spinner');
  expect(picker.minuteInterval).toBe(5);

  act(() => setPicker('add-item-draft-start-picker', new Date(2026, 8, 22, 11, 25)));
  expect(renderer.root.findByProps({ testID: 'add-item-draft-start-value' }).props.children)
    .toBe('11:25');

  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    startDateTime: '2026-03-11T11:25',
    endDateTime: null,
    period: null,
  }));
  act(() => renderer.unmount());
});

test('end time is optional, reversible, and adds a second wheel only while editing', async () => {
  const onSave = jest.fn(async () => undefined);
  const renderer = renderForm(draft, onSave);
  act(() => renderer.root.findByProps({ testID: 'add-item-draft-time-exact' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'add-item-draft-start-row' }).props.onPress());

  // Enabling the end time opens its wheel; the start wheel is collapsed first.
  act(() => renderer.root.findByProps({ testID: 'add-item-draft-end-add' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'add-item-draft-end-picker' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'add-item-draft-start-row' })).toBeDefined();

  act(() => {
    setPicker('add-item-draft-start-picker', new Date(2026, 8, 20, 10, 15));
    setPicker('add-item-draft-end-picker', new Date(2026, 8, 20, 12, 40));
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    startDateTime: '2026-03-11T10:15',
    endDateTime: '2026-03-11T12:40',
  }));

  // The end time stays reversible: 移除 collapses the row and drops the value.
  act(() => renderer.root.findByProps({ testID: 'add-item-draft-end-remove' }).props.onPress());
  expect(renderer.root.findAllByProps({ testID: 'add-item-draft-end-picker' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'add-item-draft-end-add' })).toBeDefined();
  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });
  expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ endDateTime: null }));
  act(() => renderer.unmount());
});

test('supports arrival-only exact time and clearing departure preserves arrival', async () => {
  const onSave = jest.fn(async () => undefined);
  const arrivalOnly: ItemDraft = {
    ...draft,
    type: 'transport',
    timeMode: 'exact',
    startDateTime: null,
    endDateTime: '2026-03-12T18:45',
  };
  const renderer = renderForm(arrivalOnly, onSave);

  expect(renderer.root.findAllByProps({ testID: 'add-item-draft-start-value' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'add-item-draft-start-row' }).props.label)
    .toBe('添加出发时间');
  expect(renderer.root.findByProps({ testID: 'add-item-draft-end-value' }).props.children)
    .toBe('18:45');

  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    timeMode: 'exact',
    startDateTime: null,
    endDateTime: '2026-03-12T18:45',
  }));
  act(() => renderer.unmount());

  const both = renderForm({
    ...arrivalOnly,
    startDateTime: '2026-03-12T17:15',
  }, onSave);
  act(() => both.root.findByProps({ testID: 'add-item-draft-start-remove' }).props.onPress());
  expect(both.root.findAllByProps({ testID: 'add-item-draft-start-value' })).toHaveLength(0);
  expect(both.root.findByProps({ testID: 'add-item-draft-end-value' }).props.children)
    .toBe('18:45');
  await act(async () => {
    both.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });
  expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({
    startDateTime: null,
    endDateTime: '2026-03-12T18:45',
  }));
  act(() => both.unmount());
});

test('does not save exact mode with neither endpoint', async () => {
  const onSave = jest.fn(async () => undefined);
  const renderer = renderForm(draft, onSave);
  act(() => renderer.root.findByProps({ testID: 'add-item-draft-time-exact' }).props.onPress());

  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });
  expect(onSave).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({ testID: 'add-item-draft-error' }).props.children)
    .toBe('具体时间至少需要设置开始或结束时间。');
  act(() => renderer.unmount());
});

test('keeps saved cross-Day dates while editing clock values until M9 date editing exists', async () => {
  const onSave = jest.fn(async () => undefined);
  const crossDayDraft: ItemDraft = {
    ...draft,
    type: 'hotel',
    timeMode: 'exact',
    startDateTime: '2026-03-11T23:10',
    endDateTime: '2026-03-12T01:10',
    payload: { kind: 'hotel' },
  };
  const renderer = renderForm(crossDayDraft, onSave);
  expect(renderer.root.findByProps({ testID: 'add-item-draft-start-value' }).props.children)
    .toBe('23:10');
  expect(renderer.root.findByProps({ testID: 'add-item-draft-end-value' }).props.children)
    .toBe('01:10');

  act(() => renderer.root.findByProps({ testID: 'add-item-draft-start-row' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'add-item-draft-end-row' }).props.onPress());
  act(() => {
    setPicker('add-item-draft-start-picker', new Date(2026, 8, 22, 23, 35));
    setPicker('add-item-draft-end-picker', new Date(2026, 8, 22, 1, 40));
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    startDateTime: '2026-03-11T23:35',
    endDateTime: '2026-03-12T01:40',
    payload: { kind: 'hotel' },
  }));
  act(() => renderer.unmount());
});

function renderWithHeader(headerTitle = '编辑') {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <SafeAreaTestProvider>
        <ItemDraftForm
          headerTitle={headerTitle}
          initialDate="2026-03-11"
          initialDraft={draft}
          onCancel={jest.fn()}
          onSave={async () => undefined}
          testIDPrefix="quick-edit"
        />
      </SafeAreaTestProvider>,
    );
  });
  return renderer;
}

function flattenedContentStyle(renderer: ReturnType<typeof create>) {
  const { StyleSheet } = jest.requireActual<typeof import('react-native')>('react-native');
  return StyleSheet.flatten(
    renderer.root.findByProps({ testID: 'quick-edit-fields' }).props.contentContainerStyle,
  );
}

/** The live ScrollView instance, which owns the scroll intent. */
function scrollViewInstance(renderer: ReturnType<typeof create>) {
  const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');
  return renderer.root.findAllByType(ScrollView)[0].instance as unknown as {
    scrollTo: (options: { y: number; animated: boolean }) => void;
  };
}

/** Seed a field's measured offset the way a real layout pass would. */
function layoutField(renderer: ReturnType<typeof create>, testID: string, y: number) {
  act(() => {
    renderer.root.findByProps({ testID }).props.onLayout({
      nativeEvent: { layout: { x: 0, y, width: 320, height: 96 } },
    });
  });
}

function layoutSection(renderer: ReturnType<typeof create>, testID: string, y: number) {
  act(() => {
    renderer.root.findByProps({ testID }).props.onLayout({
      nativeEvent: { layout: { x: 0, y, width: 320, height: 420 } },
    });
  });
}

function layoutRegion(renderer: ReturnType<typeof create>, testID: string, y: number) {
  act(() => {
    renderer.root.findByProps({ testID }).props.onLayout({
      nativeEvent: { layout: { x: 0, y, width: 280, height: 100 } },
    });
  });
}

test('the editor header variant uses the ScrollView keyboard insets, not KeyboardAvoidingView', () => {
  const { KeyboardAvoidingView } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  );
  const renderer = renderWithHeader();

  // Enabling both would compensate for the same keyboard twice.
  expect(renderer.root.findAllByType(KeyboardAvoidingView)).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'quick-edit-fields' })
    .props.automaticallyAdjustKeyboardInsets).toBe(true);
  // The header variant has no footer row, so the content owns the clearance.
  expect(flattenedContentStyle(renderer).paddingBottom).toBe(34 + 16);
  act(() => renderer.unmount());
});

test('editor header distinguishes an Unscheduled Item from its placeholder Day date', () => {
  const timestamp = '2026-09-14T00:00:00.000Z';
  const item: Item = {
    id: 'item-header-context',
    tripId: 'trip-1',
    dayId: 'day-1',
    placeId: null,
    type: 'sightseeing',
    title: '行程标题',
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
  const day: Day = {
    id: 'day-1',
    tripId: 'trip-1',
    date: '2026-03-11',
    dayIndex: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const renderEditor = (currentItem: Item) => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <SafeAreaTestProvider>
          <ItemEditorModal
            commitDraft={async () => currentItem}
            day={day}
            item={currentItem}
            onClose={jest.fn()}
            visible
          />
        </SafeAreaTestProvider>,
      );
    });
    return renderer;
  };

  const scheduled = renderEditor(item);
  expect(scheduled.root.findByProps({ testID: 'quick-edit-header-date' }).props.children)
    .toBe('2026年3月11日 · 编辑行程');
  act(() => scheduled.unmount());

  const unscheduled = renderEditor({ ...item, dayId: null });
  expect(unscheduled.root.findByProps({ testID: 'quick-edit-header-date' }).props.children)
    .toBe('未安排日期 · 编辑行程');
  expect(JSON.stringify(unscheduled.toJSON())).not.toContain('1970年');
  act(() => unscheduled.unmount());
});

test('the create variant keeps KeyboardAvoidingView for its Save/Cancel row', () => {
  const { KeyboardAvoidingView } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  );
  const renderer = renderForm();

  // The action row lives outside the ScrollView, so only the container can hold
  // it above the keyboard.
  expect(renderer.root.findAllByType(KeyboardAvoidingView).length).toBeGreaterThan(0);
  expect(renderer.root.findByProps({ testID: 'add-item-draft-fields' })
    .props.automaticallyAdjustKeyboardInsets).toBe(false);
  expect(renderer.root.findByProps({ testID: 'add-item-draft-save' })).toBeDefined();
  act(() => renderer.unmount());
});

test('focusing the note scrolls it above the keyboard', () => {
  const renderer = renderWithHeader();
  const scrollTo = jest.spyOn(scrollViewInstance(renderer), 'scrollTo')
    .mockImplementation(() => undefined);
  layoutField(renderer, 'quick-edit-note', 900);

  act(() => renderer.root.findByProps({ testID: 'quick-edit-note' }).props.onFocus());

  expect(scrollTo).toHaveBeenCalledWith({ y: 900 - 24, animated: true });

  scrollTo.mockRestore();
  act(() => renderer.unmount());
});

test('a field near the top of the form is not scrolled past the content start', () => {
  const renderer = renderWithHeader();
  const scrollTo = jest.spyOn(scrollViewInstance(renderer), 'scrollTo')
    .mockImplementation(() => undefined);
  layoutField(renderer, 'quick-edit-title', 14);

  act(() => renderer.root.findByProps({ testID: 'quick-edit-title' }).props.onFocus());

  // 14 - 24 would be negative, so the form must stay at its start.
  expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });

  scrollTo.mockRestore();
  act(() => renderer.unmount());
});

test('focus scrolling adds each nested field card offset to its input offset', () => {
  const renderer = renderWithHeader();
  const scrollTo = jest.spyOn(scrollViewInstance(renderer), 'scrollTo')
    .mockImplementation(() => undefined);

  layoutSection(renderer, 'quick-edit-basic-section', 40);
  layoutField(renderer, 'quick-edit-title', 65);
  // A dynamic section above can move the card after the field's own onLayout.
  layoutSection(renderer, 'quick-edit-basic-section', 100);
  act(() => renderer.root.findByProps({ testID: 'quick-edit-title' }).props.onFocus());
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 100 + 65 - 24, animated: true });

  layoutRegion(renderer, 'quick-edit-custom-type-region', 20);
  layoutField(renderer, 'quick-edit-custom-label', 130);
  layoutRegion(renderer, 'quick-edit-custom-type-region', 55);
  layoutSection(renderer, 'quick-edit-basic-section', 120);
  act(() => renderer.root.findByProps({ testID: 'quick-edit-custom-label' }).props.onFocus());
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 120 + 55 + 130 - 24, animated: true });

  act(() => renderer.root.findByProps({ testID: 'quick-edit-type-transport' }).props.onPress());
  layoutSection(renderer, 'quick-edit-transport-fields', 300);
  for (const [field, localY] of [
    ['transport-origin', 48],
    ['transport-destination', 112],
    ['transport-service-number', 184],
  ] as const) {
    const testID = `quick-edit-${field}`;
    layoutField(renderer, testID, localY);
    layoutSection(renderer, 'quick-edit-transport-fields', 380);
    scrollTo.mockClear();
    act(() => renderer.root.findByProps({ testID }).props.onFocus());
    expect(scrollTo).toHaveBeenCalledWith({ y: 380 + localY - 24, animated: true });
  }

  layoutSection(renderer, 'quick-edit-notes-section', 700);
  layoutField(renderer, 'quick-edit-note', 72);
  layoutSection(renderer, 'quick-edit-notes-section', 900);
  scrollTo.mockClear();
  act(() => renderer.root.findByProps({ testID: 'quick-edit-note' }).props.onFocus());
  expect(scrollTo).toHaveBeenCalledWith({ y: 900 + 72 - 24, animated: true });

  scrollTo.mockRestore();
  act(() => renderer.unmount());
});

test('a growing note re-aligns only while it is still focused', () => {
  const renderer = renderWithHeader();
  const scrollTo = jest.spyOn(scrollViewInstance(renderer), 'scrollTo')
    .mockImplementation(() => undefined);
  layoutField(renderer, 'quick-edit-note', 900);

  act(() => renderer.root.findByProps({ testID: 'quick-edit-note' }).props.onFocus());
  scrollTo.mockClear();
  act(() => renderer.root.findByProps({ testID: 'quick-edit-note' })
    .props.onContentSizeChange());
  expect(scrollTo).toHaveBeenCalledTimes(1);

  // A blurred note must not be dragged around by an unrelated re-render.
  act(() => renderer.root.findByProps({ testID: 'quick-edit-note' }).props.onBlur());
  scrollTo.mockClear();
  act(() => renderer.root.findByProps({ testID: 'quick-edit-note' })
    .props.onContentSizeChange());
  expect(scrollTo).not.toHaveBeenCalled();

  scrollTo.mockRestore();
  act(() => renderer.unmount());
});

test('a field that has not been measured yet does not scroll', () => {
  const renderer = renderWithHeader();
  const scrollTo = jest.spyOn(scrollViewInstance(renderer), 'scrollTo')
    .mockImplementation(() => undefined);

  act(() => renderer.root.findByProps({ testID: 'quick-edit-note' }).props.onFocus());

  expect(scrollTo).not.toHaveBeenCalled();

  scrollTo.mockRestore();
  act(() => renderer.unmount());
});

test('offers no 固定行程 control in either variant', () => {
  const createRenderer = renderForm();
  expect(createRenderer.root.findAllByProps({ testID: 'add-item-draft-fixed' })).toHaveLength(0);
  expect(JSON.stringify(createRenderer.toJSON())).not.toContain('固定行程');
  act(() => createRenderer.unmount());

  const editorRenderer = renderWithHeader();
  expect(editorRenderer.root.findAllByProps({ testID: 'quick-edit-fixed' })).toHaveLength(0);
  expect(JSON.stringify(editorRenderer.toJSON())).not.toContain('固定行程');
  act(() => editorRenderer.unmount());
});

test('transport type gains origin, destination, service number and mode fields', async () => {
  const onSave = jest.fn(async () => undefined);
  const renderer = renderForm(draft, onSave);

  act(() => renderer.root.findByProps({ testID: 'add-item-draft-type-transport' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'add-item-draft-transport-fields' })).toBeDefined();

  act(() => {
    renderer.root.findByProps({ testID: 'add-item-draft-transport-origin' })
      .props.onChangeText(' 北京首都机场 ');
    renderer.root.findByProps({ testID: 'add-item-draft-transport-destination' })
      .props.onChangeText('东城站');
    renderer.root.findByProps({ testID: 'add-item-draft-transport-service-number' })
      .props.onChangeText('K101');
    renderer.root.findByProps({ testID: 'add-item-draft-transport-mode-train' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    type: 'transport',
    payload: {
      kind: 'transport',
      mode: 'train',
      origin: '北京首都机场',
      destination: '东城站',
      serviceNumber: 'K101',
    },
  }));

  // Tapping the selected mode again clears it.
  act(() => {
    renderer.root.findByProps({ testID: 'add-item-draft-transport-mode-train' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });
  expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({
    payload: { kind: 'transport', origin: '北京首都机场', destination: '东城站', serviceNumber: 'K101' },
  }));
  act(() => renderer.unmount());
});

test('Hotel and Transport Items get type-aware clock labels', () => {
  const exact = { ...draft, timeMode: 'exact' as const };
  const hotelRenderer = renderForm({
    ...exact, type: 'hotel', payload: { kind: 'hotel' },
  });
  expect(hotelRenderer.root.findByProps({ testID: 'add-item-draft-start-row' }).props.label)
    .toBe('添加入住时间');
  expect(hotelRenderer.root.findByProps({ testID: 'add-item-draft-end-add' }).props.label)
    .toBe('添加退房时间');
  act(() => hotelRenderer.unmount());

  const transportRenderer = renderForm({ ...exact, type: 'transport' });
  expect(transportRenderer.root.findByProps({ testID: 'add-item-draft-start-row' }).props.label)
    .toBe('添加出发时间');
  act(() => transportRenderer.unmount());

  const plainRenderer = renderForm(exact);
  expect(plainRenderer.root.findByProps({ testID: 'add-item-draft-start-row' }).props.label)
    .toBe('添加开始时间');
  act(() => plainRenderer.unmount());
});

test('saving a Hotel composes the bare semantic payload', async () => {
  const onSave = jest.fn(async () => undefined);
  const renderer = renderForm(draft, onSave);

  act(() => renderer.root.findByProps({ testID: 'add-item-draft-type-hotel' }).props.onPress());
  await act(async () => {
    renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress();
  });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    type: 'hotel',
    payload: { kind: 'hotel' },
  }));
  act(() => renderer.unmount());
});

test('a save never sends isFixed, so the stored value survives an edit', async () => {
  let saved: ItemDraft | null = null;
  const onSave = jest.fn(async (value: ItemDraft) => {
    saved = value;
  });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <SafeAreaTestProvider>
        <ItemDraftForm
          headerTitle="编辑"
          initialDate="2026-03-11"
          initialDraft={draft}
          onCancel={jest.fn()}
          onSave={onSave}
          testIDPrefix="quick-edit"
        />
      </SafeAreaTestProvider>,
    );
  });

  await act(async () => {
    renderer.root.findByProps({ testID: 'quick-edit-save' }).props.onPress();
  });

  // `ItemDraft` cannot carry `isFixed` any more, and the form never adds it back.
  // Omitting the field is what preserves a stored row: `updateItemDetails` keeps
  // `current.isFixed` when the input leaves it undefined, and `addItem` defaults
  // a new Item to false.
  expect(saved).not.toBeNull();
  expect('isFixed' in (saved as unknown as ItemDraft)).toBe(false);
  act(() => renderer.unmount());
});
