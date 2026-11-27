import { expect, test } from '@jest/globals';

import { deriveTripLifecycle } from '@/domain/trip/lifecycle';

const trip = {
  startDate: '2026-09-11',
  endDate: '2026-09-13',
};

test('derives a planned lifecycle before the Trip starts', () => {
  expect(deriveTripLifecycle(trip, '2026-09-10')).toBe('planned');
});

test('derives an active lifecycle on both inclusive Trip boundaries', () => {
  expect(deriveTripLifecycle(trip, '2026-09-11')).toBe('active');
  expect(deriveTripLifecycle(trip, '2026-09-13')).toBe('active');
});

test('derives a completed lifecycle after the Trip ends', () => {
  expect(deriveTripLifecycle(trip, '2026-09-14')).toBe('completed');
});
