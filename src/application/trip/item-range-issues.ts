import type { Item } from '@/domain/item/types';
import type { Trip } from '@/domain/trip/types';
import type { ValidationIssue } from '@/domain/validation';

/**
 * Warns when an Item's absolute time falls outside the Trip's date range.
 *
 * Every Trip date change can produce this: an Unscheduled Item keeps its own
 * datetime and is deliberately never re-dated by a structural edit, so it can
 * end up pointing at a date the Trip no longer covers. The Item is kept.
 */
export function itemOutsideTripRangeIssues(
  trip: Trip,
  items: readonly Item[],
): ValidationIssue[] {
  return items.flatMap((item) => {
    if (
      item.timeMode !== 'exact'
      || (item.startDateTime === null && item.endDateTime === null)
    ) {
      return [];
    }

    const startDateTime = item.startDateTime ?? item.endDateTime;
    const endDateTime = item.endDateTime ?? item.startDateTime;
    if (startDateTime === null || endDateTime === null) return [];

    const startDate = startDateTime.slice(0, 10);
    const endDate = endDateTime.slice(0, 10);

    if (
      startDate >= trip.startDate &&
      startDate <= trip.endDate &&
      endDate >= trip.startDate &&
      endDate <= trip.endDate
    ) {
      return [];
    }

    return [
      {
        id: `item-outside-trip-range:${item.id}`,
        tripId: trip.id,
        itemId: item.id,
        type: 'ITEM_OUTSIDE_TRIP_RANGE',
        severity: 'warning' as const,
        message: 'Item time falls outside the Trip date range',
      },
    ];
  });
}
