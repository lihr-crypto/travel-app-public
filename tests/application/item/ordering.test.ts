import { expect, test } from '@jest/globals';

import { orderItemsByTravelTime } from '@/application/item/ordering';
import type { Item } from '@/domain/item/types';

function item(overrides: Partial<Item> & { id: string }): Item {
  const { id, ...rest } = overrides;
  return {
    id,
    tripId: 'trip-1',
    dayId: 'day-1',
    placeId: null,
    type: 'transport',
    title: overrides.id,
    sortOrder: 0,
    timeMode: 'none',
    startDateTime: null,
    endDateTime: null,
    period: null,
    isFixed: false,
    note: null,
    payload: { kind: 'transport' },
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    ...rest,
  };
}

test('uses an arrival-only end time for the exact-time bucket and order', () => {
  const ordered = orderItemsByTravelTime([
    item({
      id: 'period-morning',
      type: 'custom',
      payload: null,
      timeMode: 'period',
      period: 'morning',
      sortOrder: 0,
    }),
    item({
      id: 'arrival-night',
      timeMode: 'exact',
      endDateTime: '2026-12-30T19:20',
      sortOrder: 1,
    }),
    item({
      id: 'arrival-morning',
      timeMode: 'exact',
      endDateTime: '2026-12-30T05:30',
      sortOrder: 2,
    }),
    item({
      id: 'start-noon',
      timeMode: 'exact',
      startDateTime: '2026-12-30T11:00',
      sortOrder: 3,
    }),
  ]);

  expect(ordered.map(({ id }) => id)).toEqual([
    'arrival-morning',
    'period-morning',
    'start-noon',
    'arrival-night',
  ]);
});
