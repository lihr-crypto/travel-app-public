import { expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import type { HomeActiveTrip } from '@/application/projections/home-map';
import {
  formatActiveDayLine,
  HomeActiveTripCard,
} from '@/components/home-active-trip-card';

const active: HomeActiveTrip = {
  dayId: 'day-3',
  dayIndex: 3,
  fromLabel: '北山',
  toLabel: '南湾',
  tripId: 'trip-1',
  tripTitle: '示例秋季自驾',
};

function render(trip: HomeActiveTrip, props: {
  expanded?: boolean;
  onContinueToday?: (tripId: string, dayId: string) => void;
  onToggle?: (expanded: boolean) => void;
} = {}) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<HomeActiveTripCard trip={trip} {...props} />);
  });
  return renderer;
}

test('M10-T5: the card starts compact — badge, Day N and the Trip title', () => {
  const renderer = render(active);

  // Stage-03 §3.4 compact state: `● 正在旅行 Day 3` over the Trip title.
  expect(renderer.root.findByProps({ testID: 'home-active-trip-compact-day' }).props.children)
    .toEqual(['Day ', 3]);
  expect(renderer.root.findByProps({ testID: 'home-active-trip-title' }).props.children)
    .toBe('示例秋季自驾');
  // Compact enough not to obscure the map: the detail and the action stay hidden.
  expect(renderer.root.findAllByProps({ testID: 'home-active-trip-day' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'home-active-trip-continue' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('M10-T5: opening the card reveals the Day line and the continue action', async () => {
  const onContinueToday = jest.fn();
  const onToggle = jest.fn();
  const renderer = render(active, { onContinueToday, onToggle });

  await act(async () => renderer.root.findByProps({ testID: 'home-active-trip-toggle' })
    .props.onPress());
  expect(onToggle).toHaveBeenCalledWith(true);
  expect(renderer.root.findByProps({ testID: 'home-active-trip-day' }).props.children)
    .toBe('Day 3 · 北山 -> 南湾');
  expect(renderer.root.findAllByProps({ testID: 'home-active-trip-compact-day' })).toHaveLength(0);

  await act(async () => renderer.root.findByProps({ testID: 'home-active-trip-continue' })
    .props.onPress());
  expect(onContinueToday).toHaveBeenCalledWith('trip-1', 'day-3');
  act(() => renderer.unmount());
});

test('M10-T5: the Day line degrades honestly when the Day has fewer Places', () => {
  // V1 has no Leg, so the card never implies a route it cannot know.
  expect(formatActiveDayLine(active)).toBe('Day 3 · 北山 -> 南湾');
  expect(formatActiveDayLine({ ...active, toLabel: null })).toBe('Day 3 · 北山');
  expect(formatActiveDayLine({ ...active, fromLabel: null, toLabel: null })).toBe('Day 3');
});

test('M10-T5: without a continue seam the action is absent, and expanded is controllable', () => {
  const renderer = render(active, { expanded: true });
  expect(renderer.root.findByProps({ testID: 'home-active-trip-day' })).toBeDefined();
  // No seam, no action — the same rule the preview card and the map follow.
  expect(renderer.root.findAllByProps({ testID: 'home-active-trip-continue' })).toHaveLength(0);

  // Controlled: pressing reports upward without changing what is shown.
  act(() => renderer.root.findByProps({ testID: 'home-active-trip-toggle' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'home-active-trip-day' })).toBeDefined();
  act(() => renderer.unmount());
});
