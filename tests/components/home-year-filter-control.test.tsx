import { expect, jest, test } from '@jest/globals';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import { HomeYearFilterControl } from '@/components/home-year-filter-control';

function render(years: readonly number[], value: number | null = null, onChange = jest.fn()) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<HomeYearFilterControl onChange={onChange} value={value} years={years} />);
  });
  return { onChange, renderer };
}

function labelOf(renderer: ReturnType<typeof create>, testID: string) {
  return renderer.root.findByProps({ testID }).findAllByType(Text)[0].props.children as string;
}

test('the row opens with 全部年份 and then each year, in the order given', () => {
  const { renderer } = render([2026, 2025, 2024]);

  const tabs = renderer.root.findAll(
    (node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('home-year-filter-'),
  ).map((node) => node.props.testID);
  expect([...new Set(tabs)]).toEqual([
    'home-year-filter-all',
    'home-year-filter-2026',
    'home-year-filter-2025',
    'home-year-filter-2024',
  ]);
  expect(labelOf(renderer, 'home-year-filter-all')).toBe('全部年份');
  expect(labelOf(renderer, 'home-year-filter-2025')).toBe('2025');
  act(() => renderer.unmount());
});

test('it is named for screen readers and is a tablist apart from the lifecycle filter', () => {
  const { renderer } = render([2026, 2025]);
  const list = renderer.root.findByProps({ testID: 'home-year-filter' });

  expect(list.props.accessibilityRole).toBe('tablist');
  expect(list.props.accessibilityLabel).toBe('按年份筛选');
  act(() => renderer.unmount());
});

test('nothing is drawn when there is no year to choose between', () => {
  const none = render([]);
  expect(none.renderer.toJSON()).toBeNull();
  act(() => none.renderer.unmount());

  const one = render([2026]);
  expect(one.renderer.toJSON()).toBeNull();
  act(() => one.renderer.unmount());
});

test('the applied option is marked selected and choices are reported, 全部年份 as null', async () => {
  const { onChange, renderer } = render([2026, 2025], 2025);

  expect(renderer.root.findByProps({ testID: 'home-year-filter-2025' }).props
    .accessibilityState).toEqual({ selected: true });
  expect(renderer.root.findByProps({ testID: 'home-year-filter-2025' }).props['aria-selected']).toBe(true);
  expect(renderer.root.findByProps({ testID: 'home-year-filter-all' }).props
    .accessibilityState).toEqual({ selected: false });

  await act(async () => renderer.root.findByProps({ testID: 'home-year-filter-2026' }).props.onPress());
  expect(onChange).toHaveBeenLastCalledWith(2026);
  await act(async () => renderer.root.findByProps({ testID: 'home-year-filter-all' }).props.onPress());
  expect(onChange).toHaveBeenLastCalledWith(null);
  act(() => renderer.unmount());
});

test('selection is not carried by colour alone', () => {
  const { renderer } = render([2026, 2025], 2026);
  const style = (testID: string) => StyleSheet.flatten(
    renderer.root.findByProps({ testID }).findAllByType(Text)[0].props.style,
  ) as { color?: string; fontWeight?: string };

  expect(style('home-year-filter-2026').fontWeight).not.toBe(style('home-year-filter-2025').fontWeight);
  expect(style('home-year-filter-2026').color).not.toBe(style('home-year-filter-2025').color);
  act(() => renderer.unmount());
});
