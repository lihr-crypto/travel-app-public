import { expect, test } from '@jest/globals';

import { resolveDaySelection } from '@/state/day-selection';
import type { TripFocus } from '@/state/trip-focus';

test('selects only an Item focus that belongs to the requested Day', () => {
  expect(resolveDaySelection(
    { type: 'item', itemId: 'item-1', dayId: 'day-1' },
    'day-1',
  )).toBe('item-1');
});

test('never leaks an Item focus from another Day', () => {
  expect(resolveDaySelection(
    { type: 'item', itemId: 'item-1', dayId: 'day-2' },
    'day-1',
  )).toBeNull();
});

test('never leaks an Unscheduled Item focus into a Day', () => {
  expect(resolveDaySelection(
    { type: 'item', itemId: 'item-1', dayId: null },
    'day-1',
  )).toBeNull();
});

test('selects nothing for Overview, Day and Unscheduled focus', () => {
  const nonItemFocuses: TripFocus[] = [
    { type: 'overview' },
    { type: 'day', dayId: 'day-1' },
    { type: 'unscheduled' },
  ];
  for (const focus of nonItemFocuses) {
    expect(resolveDaySelection(focus, 'day-1')).toBeNull();
  }
});
