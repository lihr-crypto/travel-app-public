import type { Item } from '@/domain/item/types';
import type { Trip } from '@/domain/trip/types';
import type { ValidationIssue } from '@/domain/validation';
import { itemOutsideTripRangeIssues } from './item-range-issues';

/**
 * Derived Trip validation (Stage-05 §11). Issues are computed, never persisted,
 * and never block a valid save — they warn. Both time comparisons stay on the
 * uniform `YYYY-MM-DDTHH:mm` travel-local wall-time strings V1 persists, which
 * is the shared basis the Review Decision Record requires before comparing.
 */

function issue(
  type: string,
  trip: Trip,
  item: Item,
  message: string,
): ValidationIssue {
  return {
    id: `${type.toLowerCase().replace(/_/g, '-')}:${item.id}`,
    tripId: trip.id,
    itemId: item.id,
    type,
    severity: 'warning' as const,
    message,
  };
}

function exactBounds(item: Item): { start: string; end: string } | null {
  if (item.timeMode !== 'exact') return null;
  const start = item.startDateTime ?? item.endDateTime;
  const end = item.endDateTime ?? item.startDateTime;
  return start === null || end === null ? null : { start, end };
}

/** An exact-time Item that ends before it starts. Hotel Items are reported
 * by the dedicated check-out issue instead, so a stay never warns twice. */
export function endBeforeStartIssues(
  trip: Trip,
  items: readonly Item[],
): ValidationIssue[] {
  return items.flatMap((item) => {
    if (
      item.type === 'hotel'
      || item.timeMode !== 'exact'
      || item.startDateTime === null
      || item.endDateTime === null
      || item.endDateTime >= item.startDateTime
    ) {
      return [];
    }

    return [
      issue('END_BEFORE_START', trip, item, 'End time is before start time'),
    ];
  });
}

/** A cross-day Hotel whose canonical check-out precedes its check-in. */
export function hotelCheckoutIssues(
  trip: Trip,
  items: readonly Item[],
): ValidationIssue[] {
  return items.flatMap((item) => {
    if (
      item.type !== 'hotel'
      || item.timeMode !== 'exact'
      || item.startDateTime === null
      || item.endDateTime === null
      || item.endDateTime >= item.startDateTime
    ) {
      return [];
    }

    return [
      issue(
        'HOTEL_CHECKOUT_BEFORE_CHECKIN',
        trip,
        item,
        'Hotel check-out is before check-in',
      ),
    ];
  });
}

/**
 * Overlapping exact-time windows between two fixed Items of the same Day. A
 * missing end collapses to the start instant, so an instant can only sit
 * strictly inside a window to conflict — touching bounds never do. Unscheduled
 * fixed Items are not compared in V1: they have no Day to collide on.
 */
export function fixedItemTimeConflictIssues(
  trip: Trip,
  items: readonly Item[],
): ValidationIssue[] {
  const fixed = items.filter(
    (item) =>
      item.isFixed
      && item.timeMode === 'exact'
      && (item.startDateTime !== null || item.endDateTime !== null)
      && item.dayId !== null,
  );

  return fixed.flatMap((left, leftIndex) =>
    fixed.slice(leftIndex + 1).flatMap((right) => {
      if (left.dayId !== right.dayId) return [];

      const leftBounds = exactBounds(left);
      const rightBounds = exactBounds(right);
      if (leftBounds === null || rightBounds === null) return [];
      const overlaps =
        leftBounds.start < rightBounds.end
        && rightBounds.start < leftBounds.end;
      if (!overlaps) return [];

      const first = left.sortOrder <= right.sortOrder ? left : right;
      const second = first.id === left.id ? right : left;
      return [
        {
          id: `fixed-item-time-conflict:${first.id}:${second.id}`,
          tripId: trip.id,
          itemId: first.id,
          type: 'FIXED_ITEM_TIME_CONFLICT',
          severity: 'warning' as const,
          message: 'Fixed Item time conflict',
        },
      ];
    }),
  );
}

/**
 * `validateTrip` per Stage-05 §11: the initial V1 issue types derived from the
 * Trip's complete Item collection. `HOTEL_CHECKOUT_BEFORE_CHECKIN` exists from
 * M9 onward and supersedes the generic `END_BEFORE_START` for Hotel Items.
 */
export function validateTrip({
  trip,
  items,
}: {
  trip: Trip;
  items: readonly Item[];
}): ValidationIssue[] {
  return [
    ...itemOutsideTripRangeIssues(trip, items),
    ...endBeforeStartIssues(trip, items),
    ...hotelCheckoutIssues(trip, items),
    ...fixedItemTimeConflictIssues(trip, items),
  ];
}
