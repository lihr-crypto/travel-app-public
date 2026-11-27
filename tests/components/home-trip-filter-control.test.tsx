import { expect, jest, test } from '@jest/globals';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import type { HomeTripFilter } from '@/application/projections/home-map';
import {
  HOME_TRIP_FILTERS,
  HomeTripFilterControl,
} from '@/components/home-trip-filter-control';

function render(value: HomeTripFilter = 'all', onChange = jest.fn()) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<HomeTripFilterControl onChange={onChange} value={value} />);
  });
  return { onChange, renderer };
}

function labelOf(renderer: ReturnType<typeof create>, filter: HomeTripFilter) {
  const texts = renderer.root.findByProps({ testID: `home-trip-filter-${filter}` })
    .findAllByType(Text);
  return texts[0].props.children as string;
}

test('M10-T4: the control is exactly 全部 | 计划中 | 已完成, with no 旅行中', () => {
  // Stage-03 §3.3: no `旅行中` filter in V1 — an active Trip stays under 全部 and
  // is surfaced separately by the Active Trip Card.
  expect(HOME_TRIP_FILTERS).toEqual(['all', 'planned', 'completed']);

  const { renderer } = render();
  expect(labelOf(renderer, 'all')).toBe('全部');
  expect(labelOf(renderer, 'planned')).toBe('计划中');
  expect(labelOf(renderer, 'completed')).toBe('已完成');
  expect(renderer.root.findAllByProps({ testID: 'home-trip-filter-active' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('M10-T4: the selected option is marked and the choice is reported', async () => {
  const { onChange, renderer } = render('planned');

  expect(renderer.root.findByProps({ testID: 'home-trip-filter-planned' }).props
    .accessibilityState).toEqual({ selected: true });
  expect(renderer.root.findByProps({ testID: 'home-trip-filter-all' }).props
    .accessibilityState).toEqual({ selected: false });
  // RN Web forwards the ARIA alias to the DOM, exposing the selected tab.
  expect(renderer.root.findByProps({ testID: 'home-trip-filter-planned' }).props['aria-selected']).toBe(true);
  expect(renderer.root.findByProps({ testID: 'home-trip-filter-all' }).props['aria-selected']).toBe(false);

  await act(async () => renderer.root.findByProps({ testID: 'home-trip-filter-completed' })
    .props.onPress());
  expect(onChange).toHaveBeenCalledWith('completed');
  act(() => renderer.unmount());
});

test('M10-T4: selection is carried by weight, not by a different control', () => {
  const { renderer } = render('completed');
  const selected = StyleSheet.flatten(
    renderer.root.findByProps({ testID: 'home-trip-filter-completed' }).props.style,
  ) as { backgroundColor?: string };
  const unselected = StyleSheet.flatten(
    renderer.root.findByProps({ testID: 'home-trip-filter-all' }).props.style,
  ) as { backgroundColor?: string };

  expect(selected.backgroundColor).toBeDefined();
  expect(unselected.backgroundColor).toBeUndefined();
  // All three remain the same kind of control.
  for (const filter of HOME_TRIP_FILTERS) {
    expect(renderer.root.findByProps({ testID: `home-trip-filter-${filter}` }).props
      .accessibilityRole).toBe('tab');
  }
  act(() => renderer.unmount());
});
