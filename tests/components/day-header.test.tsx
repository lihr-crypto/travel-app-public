import { expect, jest, test } from '@jest/globals';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import type { Day } from '@/domain/trip/types';
import { DayHeader, resolveDaySwipeIntent } from '@/components/day-header';

const timestamp = '2026-09-14T00:00:00.000Z';
const previousDay: Day = {
  id: 'day-1',
  tripId: 'trip-1',
  date: '2026-09-20',
  dayIndex: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const currentDay: Day = {
  ...previousDay,
  id: 'day-2',
  date: '2026-09-21',
  dayIndex: 2,
};
const nextDay: Day = {
  ...previousDay,
  id: 'day-3',
  date: '2026-09-22',
  dayIndex: 3,
};

test('right and left swipes match previous and next arrows with or without a back seam', () => {
  const onSelectDay = jest.fn();
  const onOpenJump = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayHeader
        day={currentDay}
        nextDay={nextDay}
        onOpenJump={onOpenJump}
        onSelectDay={onSelectDay}
        previousDay={previousDay}
        today="2026-09-21"
      />,
    );
  });

  for (const canBack of [false, true]) {
    expect(resolveDaySwipeIntent(60, { canBack, nextDay, previousDay }))
      .toEqual({ kind: 'day', day: previousDay });
    expect(resolveDaySwipeIntent(-60, { canBack, nextDay, previousDay }))
      .toEqual({ kind: 'day', day: nextDay });
  }

  act(() => renderer.root.findByProps({ testID: 'day-header-previous' }).props.onPress());
  expect(onSelectDay).toHaveBeenLastCalledWith(previousDay.id);
  act(() => renderer.root.findByProps({ testID: 'day-header-next' }).props.onPress());
  expect(onSelectDay).toHaveBeenLastCalledWith(nextDay.id);
  expect(onOpenJump).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('Day swipe bounds and short movements are no-ops regardless of canBack', () => {
  for (const canBack of [false, true]) {
    expect(resolveDaySwipeIntent(60, { canBack, nextDay })).toBeNull();
    expect(resolveDaySwipeIntent(-60, { canBack, previousDay })).toBeNull();
    expect(resolveDaySwipeIntent(49, { canBack, previousDay, nextDay })).toBeNull();
  }
  expect(resolveDaySwipeIntent(Number.NaN, { canBack: true, previousDay })).toBeNull();
});

test('shows the Chinese Day label, dropdown cue, weekday, and date-picker accessibility name', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayHeader
        day={currentDay}
        nextDay={nextDay}
        onOpenJump={jest.fn()}
        onSelectDay={jest.fn()}
        previousDay={previousDay}
        today="2026-09-21"
      />,
    );
  });

  expect(renderer.root.findByProps({ testID: 'day-header-day-index' }).props.children)
    .toBe('第 2 天');
  expect(renderer.root.findAllByType(Text).map(({ props }) => props.children)).toContain('⌄');
  expect(renderer.root.findAllByType(Text).map(({ props }) => props.children)).toContain('9月21日 周一');
  expect(renderer.root.findByProps({ testID: 'day-header-title' }).props.accessibilityLabel)
    .toBe('选择日期');
  act(() => renderer.unmount());
});
