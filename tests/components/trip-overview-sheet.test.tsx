import { expect, jest, test } from '@jest/globals';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import { TripOverviewSheet } from '@/components/trip-overview-sheet';
import type { TripOverviewProjection } from '@/application/projections/trip-overview';

const timestamp = '2026-09-14T00:00:00.000Z';
const projection: TripOverviewProjection = {
  tripId: 'trip-1',
  markers: [],
  unscheduledMarkers: [],
  cameraRequest: null,
  cameraDayId: null,
  cameraScope: null,
  days: [
    {
      day: { id: 'day-1', tripId: 'trip-1', date: '2026-09-20', dayIndex: 1, createdAt: timestamp, updatedAt: timestamp },
      itemCount: 3,
      previewTitles: ['天安门', '故宫'],
      remainingItemCount: 1,
    },
    {
      day: { id: 'day-2', tripId: 'trip-1', date: '2026-09-21', dayIndex: 2, createdAt: timestamp, updatedAt: timestamp },
      itemCount: 0,
      previewTitles: [],
      remainingItemCount: 0,
    },
  ],
  unscheduledItemCount: 4,
  unscheduledPlaceCount: 2,
};

test('renders a derived Day List as the primary Day navigation', () => {
  const onSelectDay = jest.fn();
  const onOpenUnscheduled = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripOverviewSheet
        onOpenUnscheduled={onOpenUnscheduled}
        onSelectDay={onSelectDay}
        projection={projection}
      />,
    );
  });

  expect(renderer.root.findByProps({ testID: 'trip-overview-day-list' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'trip-overview-day-day-1' }))
    .toBeDefined();
  const textValues = renderer.root.findAllByType(Text).map(({ props }) => props.children);
  expect(textValues).toContain('天安门 · 故宫');
  const summary = renderer.root.findByProps({ testID: 'trip-overview-day-summary-day-1' });
  const remaining = renderer.root.findByProps({ testID: 'trip-overview-day-remaining-day-1' });
  expect(summary.props.numberOfLines).toBe(1);
  expect(remaining.props.children).toBe('+1');
  expect(remaining.props.accessibilityLabel).toBe('还有 1 项');
  expect(summary.parent).toBe(remaining.parent);
  expect(textValues).toContain('暂无安排');
  expect(textValues).toContain(4);
  expect(textValues).toContain('第 1 天');
  expect(textValues).toContain('9月20日 周日');

  act(() => renderer.root.findByProps({ testID: 'trip-overview-day-day-1' }).props.onPress());
  expect(onSelectDay).toHaveBeenCalledWith('day-1');
  act(() => renderer.root.findByProps({ testID: 'trip-overview-unscheduled-entry' }).props.onPress());
  expect(onOpenUnscheduled).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('summarises the trip dates in one tappable block', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripOverviewSheet onSelectDay={jest.fn()} projection={projection} />,
    );
  });

  // Days *are* the contiguous inclusive range, so the edges are the range.
  expect(renderer.root.findByProps({ testID: 'trip-overview-date-range-text' }).props.children)
    .toBe('2026年9月20日 ～ 9月21日');
  expect(renderer.root.findByProps({ testID: 'trip-overview-date-count' }).props.children)
    .toBe('2 天');
  act(() => renderer.unmount());
});

test('keeps the year visible on both sides of a cross-year Trip range', () => {
  const crossYearProjection: TripOverviewProjection = {
    ...projection,
    days: [
      {
        ...projection.days[0],
        day: { ...projection.days[0].day, date: '2026-12-30' },
      },
      {
        ...projection.days[1],
        day: { ...projection.days[1].day, date: '2027-01-02' },
      },
    ],
  };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripOverviewSheet onSelectDay={jest.fn()} projection={crossYearProjection} />,
    );
  });

  expect(renderer.root.findByProps({ testID: 'trip-overview-date-range-text' }).props.children)
    .toBe('2026年12月30日 ～ 2027年1月2日');
  act(() => renderer.unmount());
});

test('keeps the remaining count visible beside long previews and ignores invalid counts', () => {
  const robustProjection: TripOverviewProjection = {
    ...projection,
    days: [
      {
        ...projection.days[0],
        previewTitles: ['非常长的地点名称'.repeat(10)],
        remainingItemCount: 7,
      },
      { ...projection.days[1], remainingItemCount: Number.NaN },
    ],
  };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripOverviewSheet onSelectDay={jest.fn()} projection={robustProjection} />,
    );
  });

  const summary = renderer.root.findByProps({ testID: 'trip-overview-day-summary-day-1' });
  const badge = renderer.root.findByProps({ testID: 'trip-overview-day-remaining-day-1' });
  expect(summary.props.numberOfLines).toBe(1);
  expect(String(summary.props.children)).not.toContain('+7');
  expect(badge.props.children).toBe('+7');
  expect(renderer.root.findAllByProps({ testID: 'trip-overview-day-remaining-day-2' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('offers no date entry when the trip dates are not editable', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripOverviewSheet onSelectDay={jest.fn()} projection={projection} />,
    );
  });

  expect(renderer.root.findByProps({ testID: 'trip-overview-date-summary' }).props.disabled)
    .toBe(true);
  act(() => renderer.unmount());
});

test('the whole date block opens the date sheet through the seam', () => {
  const onEditDateRange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripOverviewSheet
        onEditDateRange={onEditDateRange}
        onSelectDay={jest.fn()}
        projection={projection}
      />,
    );
  });

  expect(renderer.root.findByProps({ testID: 'trip-overview-date-summary' }).props.disabled)
    .toBe(false);
  act(() => renderer.root.findByProps({ testID: 'trip-overview-date-summary' }).props.onPress());
  expect(onEditDateRange).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('every Day row keeps `›` as the only Day action', () => {
  const onSelectDay = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripOverviewSheet
        onEditDateRange={jest.fn()}
        onSelectDay={onSelectDay}
        projection={projection}
      />,
    );
  });

  // Structure editing is never reachable from a Day row here.
  expect(renderer.root.findAllByProps({ testID: 'trip-day-structure-menu-day-1' }))
    .toHaveLength(0);
  act(() => renderer.root.findByProps({ testID: 'trip-overview-day-day-2' }).props.onPress());
  expect(onSelectDay).toHaveBeenCalledWith('day-2');
  act(() => renderer.unmount());
});
