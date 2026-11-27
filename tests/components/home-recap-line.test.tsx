import { expect, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import { HomeRecapLine } from '@/components/home-recap-line';

function render(recap: { tripCount: number; dayCount: number; placeCount: number }) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<HomeRecapLine recap={recap} />);
  });
  return renderer;
}

test('the line states trips, itinerary days and places, and never claims visits', () => {
  const renderer = render({ dayCount: 21, placeCount: 48, tripCount: 3 });
  const text = JSON.stringify(renderer.toJSON());

  expect(renderer.root.findByProps({ testID: 'home-recap-trips' }).props.children).toBeDefined();
  expect(text).toContain('次旅行');
  expect(text).toContain('天行程');
  expect(text).toContain('个地点');
  // Footprint is a saved plan, not a visit log (UX-02).
  expect(text).not.toMatch(/到访|去过|走过|足迹/);
  act(() => renderer.unmount());
});

test('the whole line is one screen-reader element with the numbers spelled out', () => {
  const renderer = render({ dayCount: 21, placeCount: 48, tripCount: 3 });
  const line = renderer.root.findByProps({ testID: 'home-recap' });

  expect(line.props.accessible).toBe(true);
  expect(line.props.accessibilityLabel).toBe('3 次旅行，21 天行程，48 个地点');
  act(() => renderer.unmount());
});

test('an empty set draws no line', () => {
  const renderer = render({ dayCount: 0, placeCount: 0, tripCount: 0 });

  expect(renderer.toJSON()).toBeNull();
  act(() => renderer.unmount());
});
