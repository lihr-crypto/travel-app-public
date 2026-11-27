import { expect, jest, test } from '@jest/globals';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import type { HomeTripSummary } from '@/application/projections/home-map';
import { HomeTripListSheet } from '@/components/home-trip-list-sheet';

const planned: HomeTripSummary = {
  dayCount: 5, endDate: '2026-12-05', lifecycle: 'planned', placeCount: 9,
  startDate: '2026-12-01', title: '示例秋季自驾', tripId: 'trip-1',
};
const done: HomeTripSummary = {
  dayCount: 8, endDate: '2026-08-05', lifecycle: 'completed', placeCount: 6,
  startDate: '2026-08-01', title: '日本test', tripId: 'trip-2',
};

function render(trips: HomeTripSummary[], props: {
  filter?: 'all' | 'planned' | 'completed';
  isFirstUse?: boolean;
  onCreateTrip?: () => void;
  onFilterChange?: (filter: 'all' | 'planned' | 'completed') => void;
  onManageTrip?: (tripId: string) => void;
  onOpenTrip?: (tripId: string) => void;
  availableYears?: readonly number[];
  year?: number | null;
  onYearChange?: (year: number | null) => void;
  recap?: { tripCount: number; dayCount: number; placeCount: number };
} = {}) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <HomeTripListSheet
        filter={props.filter ?? 'all'}
        isFirstUse={props.isFirstUse}
        onCreateTrip={props.onCreateTrip}
        onFilterChange={props.onFilterChange ?? jest.fn()}
        onManageTrip={props.onManageTrip}
        onOpenTrip={props.onOpenTrip}
        availableYears={props.availableYears}
        onYearChange={props.onYearChange}
        recap={props.recap}
        year={props.year}
        trips={trips}
      />,
    );
  });
  return renderer;
}

test('M10-T6: the sheet lists 我的旅行 with a count and the pinned filter', () => {
  const renderer = render([planned, done]);

  expect(renderer.root.findByProps({ testID: 'home-trip-list-count' }).props.children)
    .toBe(2);
  expect(renderer.root.findByProps({ testID: 'home-trip-row-trip-1' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'home-trip-row-trip-2' })).toBeDefined();
  // Stage-03 §3.2: the filter sits at the sheet's top, above the rows.
  expect(renderer.root.findByProps({ testID: 'home-trip-filter' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).toContain('12月1日');
  expect(JSON.stringify(renderer.toJSON())).toContain('计划中');
  expect(JSON.stringify(renderer.toJSON())).toContain('已完成');
  act(() => renderer.unmount());
});

test('UX-B: a row opens the Trip outright, and reports the filter', async () => {
  const onOpenTrip = jest.fn();
  const onFilterChange = jest.fn();
  const renderer = render([planned], { onFilterChange, onOpenTrip });

  await act(async () => renderer.root.findByProps({ testID: 'home-trip-row-trip-1' })
    .props.onPress());
  // UX-B (2026-03-25): the list is the one-step alternative — a row navigates
  // to the Trip Overview instead of stopping at a preview.
  expect(onOpenTrip).toHaveBeenCalledWith('trip-1');

  await act(async () => renderer.root.findByProps({ testID: 'home-trip-filter-completed' })
    .props.onPress());
  expect(onFilterChange).toHaveBeenCalledWith('completed');
  act(() => renderer.unmount());
});

test('each Trip row exposes the compact management affordance separately from entry', async () => {
  const onManageTrip = jest.fn();
  const onOpenTrip = jest.fn();
  const renderer = render([planned], { onManageTrip, onOpenTrip });
  const open = renderer.root.findByProps({ testID: 'home-trip-row-trip-1' });
  const manage = renderer.root.findByProps({ testID: 'home-trip-manage-trip-1' });

  expect(open.parent).toBe(manage.parent);
  expect(open.parent?.type).toBe('View');
  expect(open.props.accessibilityRole).toBe('button');
  expect(open.props.accessibilityLabel).toBe('打开旅行 示例秋季自驾');
  expect(open.props.style.minHeight).toBeGreaterThanOrEqual(44);
  expect(manage.props.accessibilityLabel).toBe('管理旅行 示例秋季自驾');
  expect(manage.props.accessibilityHint).toBe('打开旅行管理选项');
  expect(manage.props.style.minHeight).toBeGreaterThanOrEqual(44);
  expect(manage.props.style.minWidth).toBeGreaterThanOrEqual(44);

  await act(async () => manage.props.onPress());
  expect(onManageTrip).toHaveBeenCalledWith('trip-1');
  expect(onOpenTrip).not.toHaveBeenCalled();
  await act(async () => open.props.onPress());
  expect(onOpenTrip).toHaveBeenCalledWith('trip-1');
  expect(onManageTrip).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('M10-T6: without an open seam the rows are inert, and an empty filter says so', () => {
  const renderer = render([planned]);
  expect(renderer.root.findByProps({ testID: 'home-trip-row-trip-1' }).props.onPress)
    .toBeUndefined();
  act(() => renderer.unmount());

  const empty = render([], { filter: 'completed' });
  expect(empty.root.findByProps({ testID: 'home-trip-list-empty' })).toBeDefined();
  expect(empty.root.findByProps({ testID: 'home-trip-list-count' }).props.children).toBe(0);
  act(() => empty.unmount());
});

test('M10-T7: the create affordance sits in the heading row, and reports upward', async () => {
  const onCreateTrip = jest.fn();
  const renderer = render([planned], { onCreateTrip });

  // Stage-03 §3.2 puts `[+]` at the end of the 我的旅行 row.
  await act(async () => renderer.root.findByProps({ testID: 'home-create-trip' }).props.onPress());
  expect(onCreateTrip).toHaveBeenCalledTimes(1);
  // The compact graphic retains its action label for assistive technology.
  expect(renderer.root.findByProps({ testID: 'home-create-trip' })
    .props.accessibilityLabel).toBe('新建旅行');
  act(() => renderer.unmount());
});

test('M10-T7: an empty Footprint replaces the list with the first-use CTA', () => {
  const onCreateTrip = jest.fn();
  const renderer = render([], { isFirstUse: true, onCreateTrip });

  // Stage-03 §3.7: 还没有旅行 / 从第一段旅程开始 … / + 新建旅行.
  expect(renderer.root.findByProps({ testID: 'home-trip-list-first-use' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).toContain('从第一段旅程开始');
  expect(renderer.root.findByProps({ testID: 'home-create-trip' }).findAllByType(Text)[0]
    .props.children).toBe('+ 新建旅行');
  // No filter and no rows: there is nothing to filter yet.
  expect(renderer.root.findAllByProps({ testID: 'home-trip-filter' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('M10-T7: a filter that hides everything is not a first use', () => {
  const renderer = render([], { filter: 'completed', isFirstUse: false });

  expect(renderer.root.findAllByProps({ testID: 'home-trip-list-first-use' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'home-trip-filter' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'home-trip-list-empty' })).toBeDefined();
  act(() => renderer.unmount());
});

test('M10-T7: without a create seam the affordance is absent, not dead', () => {
  const withTrips = render([planned]);
  expect(withTrips.root.findAllByProps({ testID: 'home-create-trip' })).toHaveLength(0);
  act(() => withTrips.unmount());

  const firstUse = render([], { isFirstUse: true });
  expect(firstUse.root.findAllByProps({ testID: 'home-create-trip' })).toHaveLength(0);
  // The copy still explains the empty state.
  expect(firstUse.root.findByProps({ testID: 'home-trip-list-first-use' })).toBeDefined();
  act(() => firstUse.unmount());
});

test('A1: rows carry the content summary (days, places, lifecycle)', () => {
  const renderer = render([planned, done]);
  const text = renderer.root
    .findAllByType(Text)
    .map(({ props }) => (typeof props.children === 'string' ? props.children : ''))
    .join('\n');
  expect(text).toContain('5 天 · 9 个地点 · 计划中');
  expect(text).toContain('8 天 · 6 个地点 · 已完成');
  act(() => renderer.unmount());
});

test('the year row and recap sit between the lifecycle filter and the rows', async () => {
  const onYearChange = jest.fn();
  const renderer = render([planned, done], {
    availableYears: [2026, 2025],
    onYearChange,
    recap: { dayCount: 13, placeCount: 15, tripCount: 2 },
    year: 2026,
  });
  const order = JSON.stringify(renderer.toJSON());

  expect(order.indexOf('home-trip-filter"')).toBeLessThan(order.indexOf('home-year-filter"'));
  expect(order.indexOf('home-year-filter"')).toBeLessThan(order.indexOf('"home-recap"'));
  expect(order.indexOf('"home-recap"')).toBeLessThan(order.indexOf('home-trip-row-trip-1'));

  await act(async () => renderer.root.findByProps({ testID: 'home-year-filter-2025' }).props.onPress());
  expect(onYearChange).toHaveBeenCalledWith(2025);
  act(() => renderer.unmount());
});

test('existing callers that pass no year props see neither the year row nor a recap', () => {
  const renderer = render([planned, done]);

  expect(renderer.root.findAllByProps({ testID: 'home-year-filter' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'home-recap' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('a lone year is not offered, and the first-use state shows neither row', () => {
  const lone = render([planned], { availableYears: [2026], onYearChange: jest.fn(), recap: { dayCount: 5, placeCount: 9, tripCount: 1 } });
  expect(lone.root.findAllByProps({ testID: 'home-year-filter' })).toHaveLength(0);
  expect(lone.root.findByProps({ testID: 'home-recap' })).toBeDefined();
  act(() => lone.unmount());

  const first = render([], {
    availableYears: [2026, 2025],
    isFirstUse: true,
    onYearChange: jest.fn(),
    recap: { dayCount: 0, placeCount: 0, tripCount: 0 },
  });
  expect(first.root.findAllByProps({ testID: 'home-year-filter' })).toHaveLength(0);
  expect(first.root.findAllByProps({ testID: 'home-recap' })).toHaveLength(0);
  act(() => first.unmount());
});
