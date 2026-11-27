import { expect, jest, test } from '@jest/globals';
import { Platform, StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import { DayTimeline } from '@/components/day-timeline';
import type { TimelineProjection } from '@/application/projections/timeline';

const projection: TimelineProjection = {
  dayId: 'day-1',
  items: [
    {
      id: 'item-1',
      title: 'Breakfast',
      type: 'food',
      typeLabel: '餐饮',
      time: { mode: 'period', period: 'morning' },
      note: null,
      placeName: null,
    },
    {
      id: 'item-2',
      title: 'Train',
      type: 'transport',
      typeLabel: '交通',
      time: {
        mode: 'exact',
        startDateTime: '2026-12-30T09:15',
        endDateTime: '2026-12-30T10:00',
      },
      note: 'Reserved',
      placeName: null,
    },
    {
      id: 'item-3',
      title: 'Free walk',
      type: 'custom',
      typeLabel: '其他',
      time: { mode: 'none' },
      note: null,
      placeName: null,
    },
    {
      id: 'item-4',
      title: '西谷湿地',
      type: 'sightseeing',
      typeLabel: '景点',
      time: { mode: 'period', period: 'afternoon' },
      note: '河边小路、观景台俯瞰，备注很长很长很长很长很长很长',
      placeName: '西谷国家湿地公园',
    },
  ],
};

test('Web exposes selected rows for selection paint without changing row geometry', () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'web');
  let renderer!: ReturnType<typeof create>;
  try {
    act(() => { renderer = create(<DayTimeline projection={projection} selectedItemId="item-2" />); });
    expect(renderer.root.findByProps({ testID: 'timeline-row-item-1' }).props['aria-selected']).toBe(false);
    expect(renderer.root.findByProps({ testID: 'timeline-row-item-2' }).props['aria-selected']).toBe(true);
    act(() => { renderer.update(<DayTimeline projection={projection} selectedItemId="item-1" />); });
    expect(renderer.root.findByProps({ testID: 'timeline-row-item-1' }).props['aria-selected']).toBe(true);
    expect(renderer.root.findByProps({ testID: 'timeline-row-item-2' }).props['aria-selected']).toBe(false);
  } finally {
    act(() => { renderer?.unmount(); });
    platform.restore();
  }
});

test('renders every ordered Item with time and metadata', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayTimeline projection={projection} />);
  });

  expect(renderer.root.findByProps({ testID: 'day-timeline' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'timeline-item-item-1' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'timeline-item-item-2' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'timeline-item-item-3' })).toBeDefined();
  const rendered = JSON.stringify(renderer.toJSON());
  expect(rendered).toContain('上午');
  expect(rendered).toContain('09:15–10:00');
  // The `固定` badge is gone and `TimelineItemModel` no longer carries `isFixed`,
  // so no Item can render the badge even from a legacy stored row.
  expect(rendered).not.toContain('固定');
  expect(rendered).toContain('Reserved');
  expect(rendered).toContain('待定');
});

test('renders empty state and sends selection intent without mutating data', () => {
  const onSelectItem = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayTimeline
        projection={{ dayId: 'day-1', items: [] }}
        onSelectItem={onSelectItem}
      />,
    );
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('暂无行程');

  act(() => {
    renderer.update(
      <DayTimeline
        onSelectItem={onSelectItem}
        projection={projection}
        selectedItemId="item-2"
      />,
    );
  });
  renderer.root.findByProps({ testID: 'timeline-select-item-2' }).props.onPress();
  expect(onSelectItem).toHaveBeenCalledWith('item-2');
  expect(renderer.root.findByProps({ testID: 'timeline-item-item-2' })).toBeDefined();
});

test('exposes a compact three-dot action with its own 44 × 44 pt target', () => {
  const onOpenItemActions = jest.fn();
  const onSelectItem = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayTimeline
        onOpenItemActions={onOpenItemActions}
        onSelectItem={onSelectItem}
        projection={projection}
      />,
    );
  });

  const pressable = (testID: string) => renderer.root.findAll(
    (node) => node.props?.testID === testID && typeof node.props?.onPress === 'function',
  )[0];

  for (const id of ['item-1', 'item-2', 'item-3', 'item-4']) {
    const button = pressable(`timeline-actions-${id}`);
    expect(button).toBeDefined();
    const style = StyleSheet.flatten(button.props.style) as {
      minHeight?: number;
      minWidth?: number;
    };
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    // The large green 编辑 button is gone; the action is icon-only.
    expect(button.findAllByType(Text).map((node) => node.props.children)).toEqual(['⋯']);
  }
  expect(JSON.stringify(renderer.toJSON())).not.toContain('编辑');

  // The action is a sibling of row selection, never nested inside it.
  const selectTarget = pressable('timeline-select-item-1');
  expect(selectTarget.findAllByProps({ testID: 'timeline-actions-item-1' })).toHaveLength(0);
  expect(pressable('timeline-actions-item-1').parent).toBe(selectTarget.parent);

  // Tapping the action opens the menu without a prior selection tap.
  act(() => pressable('timeline-actions-item-3').props.onPress());
  expect(onOpenItemActions).toHaveBeenCalledWith('item-3');
  expect(onSelectItem).not.toHaveBeenCalled();

  act(() => renderer.unmount());
});

test('renders an arrival-only exact Item from its end wall-clock value', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayTimeline
        projection={{
          dayId: 'day-1',
          items: [{
            id: 'arrival-only',
            title: '到达机场',
            type: 'transport',
            typeLabel: '交通',
            time: {
              mode: 'exact',
              startDateTime: null,
              endDateTime: '2026-12-30T19:20',
            },
            note: null,
            placeName: null,
          }],
        }}
      />,
    );
  });

  expect(JSON.stringify(renderer.toJSON())).toContain('19:20');
  expect(JSON.stringify(renderer.toJSON())).not.toContain('–');
  act(() => renderer.unmount());
});

test('omits the action menu when no menu is wired', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayTimeline projection={projection} />);
  });
  expect(renderer.root.findAllByProps({ testID: 'timeline-actions-item-1' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('keeps one truncated secondary line, preferring the Place over the note', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayTimeline projection={projection} />);
  });

  const secondary = (id: string) => renderer.root.findByProps({ testID: `timeline-secondary-${id}` });

  // Type only, when there is neither a Place nor a note.
  expect(secondary('item-1').props.children).toBe('餐饮');
  // The note is the fallback detail.
  expect(secondary('item-2').props.children).toBe('交通 · Reserved');
  // A Place outranks a long note, so the note cannot grow the row.
  expect(secondary('item-4').props.children).toBe('景点 · 西谷国家湿地公园');
  expect(JSON.stringify(renderer.toJSON())).not.toContain('观景台俯瞰');

  // One line, tail-ellipsised: the list rhythm cannot be changed by a note.
  for (const id of ['item-1', 'item-2', 'item-4']) {
    expect(secondary(id).props.numberOfLines).toBe(1);
    expect(secondary(id).props.ellipsizeMode).toBe('tail');
  }

  act(() => renderer.unmount());
});

test('suppresses only a normalized duplicate Place subtitle and keeps custom Place names', () => {
  const timeline: TimelineProjection = {
    dayId: 'day-1',
    items: [
      {
        id: 'same-place',
        title: '故宫  博物院',
        type: 'sightseeing',
        typeLabel: '景点',
        time: { mode: 'none' },
        note: '不展示的备注',
        placeName: '故宫 博物院',
      },
      {
        id: 'custom-title',
        title: '下午逛一逛',
        type: 'sightseeing',
        typeLabel: '景点',
        time: { mode: 'none' },
        note: '不覆盖地点名',
        placeName: '故宫博物院',
      },
      {
        id: 'note-only',
        title: '自由活动',
        type: 'custom',
        typeLabel: '其他',
        time: { mode: 'none' },
        note: '附近散步',
        placeName: null,
      },
    ],
  };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayTimeline projection={timeline} />);
  });

  const secondary = (id: string) => renderer.root.findByProps({ testID: `timeline-secondary-${id}` });
  expect(secondary('same-place').props.children).toBe('景点');
  expect(secondary('custom-title').props.children).toBe('景点 · 故宫博物院');
  expect(secondary('note-only').props.children).toBe('其他 · 附近散步');
  expect(renderer.root.findByProps({ testID: 'timeline-item-note-only' }).findAllByType(Text)[0].props.children)
    .toBe('待定');
  expect(StyleSheet.flatten(
    renderer.root.findByProps({ testID: 'timeline-item-note-only' }).findAllByType(Text)[0].props.style,
  )).toMatchObject({ fontVariant: ['tabular-nums'] });

  act(() => renderer.unmount());
});

test('renders bounded move controls that only emit adjacent-item intent', () => {
  const onMoveItem = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayTimeline onMoveItem={onMoveItem} projection={projection} />);
  });
  expect(renderer.root.findByProps({ testID: 'timeline-move-up-item-1' }).props.disabled).toBe(true);
  expect(renderer.root.findByProps({ testID: 'timeline-move-down-item-4' }).props.disabled).toBe(true);
  act(() => {
    renderer.root.findByProps({ testID: 'timeline-move-down-item-1' }).props.onPress();
  });
  expect(onMoveItem).toHaveBeenCalledWith('item-1', 'down');
  expect(projection.items.map((item) => item.id))
    .toEqual(['item-1', 'item-2', 'item-3', 'item-4']);
  act(() => renderer.unmount());
});

test('requests outer-sheet scrolling for each marker-origin request, including the same Item after a pan', () => {
  const onScrollToOffset = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayTimeline onScrollToOffset={onScrollToOffset} projection={projection} />);
  });
  const row = renderer.root.findByProps({ testID: 'timeline-item-item-2' });
  let layoutNode = row;
  while (layoutNode.parent && typeof layoutNode.props.onLayout !== 'function') {
    layoutNode = layoutNode.parent;
  }
  expect(typeof layoutNode.props.onLayout).toBe('function');
  act(() => {
    layoutNode.props.onLayout({ nativeEvent: { layout: { y: 180 } } });
  });
  act(() => {
    renderer.update(<DayTimeline onScrollToOffset={onScrollToOffset} projection={projection} scrollRequest={{ itemId: 'item-2', requestId: 1 }} />);
  });
  // Row offsets are timeline-root-relative: 16 list padding + 164 in-list.
  expect(onScrollToOffset).toHaveBeenCalledWith(196);
  expect(onScrollToOffset).toHaveBeenCalledTimes(1);
  act(() => {
    renderer.update(<DayTimeline onScrollToOffset={onScrollToOffset} projection={projection} scrollRequest={{ itemId: 'item-2', requestId: 2 }} />);
  });
  expect(onScrollToOffset).toHaveBeenCalledTimes(2);
  act(() => renderer.unmount());
});

test('drops measured offsets and a queued scroll intent when the content identity changes', () => {
  const onScrollToOffset = jest.fn();
  let renderer!: ReturnType<typeof create>;

  const layoutNodeFor = (itemId: string) => {
    let node = renderer.root.findByProps({ testID: `timeline-item-${itemId}` });
    while (node.parent && typeof node.props.onLayout !== 'function') {
      node = node.parent;
    }
    return node;
  };

  act(() => {
    renderer = create(
      <DayTimeline onScrollToOffset={onScrollToOffset} projection={projection} resetKey="day-1" />,
    );
  });
  // Day 1 measured item-2 at 180.
  act(() => {
    layoutNodeFor('item-2').props.onLayout({ nativeEvent: { layout: { y: 180 } } });
  });
  // A marker-origin request for a not-yet-measured row is queued, not fired.
  act(() => {
    renderer.update(
      <DayTimeline
        onScrollToOffset={onScrollToOffset}
        projection={projection}
        resetKey="day-1"
        scrollRequest={{ itemId: 'item-3', requestId: 1 }}
      />,
    );
  });
  expect(onScrollToOffset).not.toHaveBeenCalled();

  // A persistent Day View replaces the rows in place.
  act(() => {
    renderer.update(
      <DayTimeline
        onScrollToOffset={onScrollToOffset}
        projection={projection}
        resetKey="day-2"
        scrollRequest={null}
      />,
    );
  });

  // The queued Day 1 intent must not scroll the new content.
  act(() => {
    layoutNodeFor('item-3').props.onLayout({ nativeEvent: { layout: { y: 40 } } });
  });
  expect(onScrollToOffset).not.toHaveBeenCalled();

  // A Day 2 request must not reuse the Day 1 measurement for item-2.
  act(() => {
    renderer.update(
      <DayTimeline
        onScrollToOffset={onScrollToOffset}
        projection={projection}
        resetKey="day-2"
        scrollRequest={{ itemId: 'item-2', requestId: 2 }}
      />,
    );
  });
  expect(onScrollToOffset).not.toHaveBeenCalled();

  // The re-measured row is what the new content scrolls to.
  act(() => {
    layoutNodeFor('item-2').props.onLayout({ nativeEvent: { layout: { y: 12 } } });
  });
  // 16 list padding + the 12 the layout reports inside the list.
  expect(onScrollToOffset).toHaveBeenCalledWith(28);

  act(() => renderer.unmount());
});

test('A2: the empty surface explains and points at the next action', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayTimeline
        emptyState={{
          hint: '点上方「＋ 添加地点」，把想去的地方排进来',
          title: '这一天还没有安排',
        }}
        projection={{ dayId: 'day-1', items: [] }}
      />,
    );
  });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('这一天还没有安排');
  expect(text).toContain('添加地点');
  act(() => renderer.unmount());
});

test('UX-C: a second tap on the same row within the window opens the detail', () => {
  const nowSpy = jest.spyOn(Date, 'now');
  let now = 1_000;
  nowSpy.mockImplementation(() => now);

  const onSelectItem = jest.fn();
  const onOpenItemDetails = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayTimeline
        onOpenItemDetails={onOpenItemDetails}
        onSelectItem={onSelectItem}
        projection={projection}
      />,
    );
  });
  const tap = (id: string) => act(() => {
    renderer.root.findByProps({ testID: `timeline-select-${id}` }).props.onPress();
  });

  // The first tap only selects.
  tap('item-1');
  expect(onSelectItem).toHaveBeenCalledTimes(1);
  expect(onOpenItemDetails).not.toHaveBeenCalled();

  // A second tap on the same row inside the window opens the detail instead of
  // re-selecting.
  now += 150;
  tap('item-1');
  expect(onOpenItemDetails).toHaveBeenCalledWith('item-1');
  expect(onSelectItem).toHaveBeenCalledTimes(1);

  // Past the window it is two independent taps: select again, no detail.
  now += 400;
  tap('item-1');
  expect(onSelectItem).toHaveBeenCalledTimes(2);
  expect(onOpenItemDetails).toHaveBeenCalledTimes(1);

  // Two taps on different rows never count as a double-tap.
  now += 50;
  tap('item-2');
  now += 100;
  tap('item-3');
  expect(onOpenItemDetails).toHaveBeenCalledTimes(1);
  expect(onSelectItem).toHaveBeenCalledTimes(4);

  act(() => renderer.unmount());
  nowSpy.mockRestore();
});

test('UX-C: without a detail seam the row stays a plain select', () => {
  const onSelectItem = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayTimeline onSelectItem={onSelectItem} projection={projection} />);
  });
  act(() => renderer.root.findByProps({ testID: 'timeline-select-item-1' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'timeline-select-item-1' }).props.onPress());
  expect(onSelectItem).toHaveBeenCalledTimes(2);
  act(() => renderer.unmount());
});
