import type { IsoTimestamp } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { ItemPosition } from './position';

export function resolveItemInsertionIndex(
  items: readonly Item[],
  position: ItemPosition,
) {
  switch (position.type) {
    case 'start':
      return 0;
    case 'end':
      return items.length;
    case 'before': {
      const index = items.findIndex(({ id }) => id === position.itemId);
      if (index < 0) {
        throw new RangeError(`Target position Item not found: ${position.itemId}`);
      }
      return index;
    }
    case 'after': {
      const index = items.findIndex(({ id }) => id === position.itemId);
      if (index < 0) {
        throw new RangeError(`Target position Item not found: ${position.itemId}`);
      }
      return index + 1;
    }
    default:
      throw new RangeError('Invalid Item position');
  }
}

export function reindexChangedItems(
  items: readonly Item[],
  timestamp: IsoTimestamp,
): Item[] {
  return items.flatMap((item, sortOrder) =>
    item.sortOrder === sortOrder
      ? []
      : [{ ...item, sortOrder, updatedAt: timestamp }],
  );
}

const periodOrder: Record<NonNullable<Item['period']>, number> = {
  morning: 0,
  noon: 1,
  afternoon: 2,
  night: 3,
};

/** Maps exact times into the four DayPeriod buckets. */
export function periodForExactStart(startDateTime: string): NonNullable<Item['period']> {
  const hour = Number(startDateTime.slice(11, 13));
  if (hour < 5 || hour >= 18) return 'night';
  if (hour < 11) return 'morning';
  if (hour < 14) return 'noon';
  return 'afternoon';
}

function exactDateTimeForOrdering(item: Item): string | null {
  return item.startDateTime ?? item.endDateTime;
}

/**
 * Rebuilds the persisted order after a create/time edit. Exact times come first
 * within a bucket and sort by HH:mm; exact-time ties and period-only items keep
 * their previous relative order. Untimed items remain last. A later manual
 * reorder can still directly replace this result.
 */
export function orderItemsByTravelTime(items: readonly Item[]): Item[] {
  return items
    .map((item, previousIndex) => ({ item, previousIndex }))
    .sort((left, right) => {
      const leftExactDateTime = left.item.timeMode === 'exact'
        ? exactDateTimeForOrdering(left.item)
        : null;
      const rightExactDateTime = right.item.timeMode === 'exact'
        ? exactDateTimeForOrdering(right.item)
        : null;
      const leftPeriod = leftExactDateTime !== null
        ? periodForExactStart(leftExactDateTime)
        : left.item.timeMode === 'period' ? left.item.period : null;
      const rightPeriod = rightExactDateTime !== null
        ? periodForExactStart(rightExactDateTime)
        : right.item.timeMode === 'period' ? right.item.period : null;
      const leftBucket = leftPeriod === null ? 4 : periodOrder[leftPeriod];
      const rightBucket = rightPeriod === null ? 4 : periodOrder[rightPeriod];
      if (leftBucket !== rightBucket) return leftBucket - rightBucket;

      if (
        left.item.timeMode === 'exact'
        && right.item.timeMode === 'exact'
        && leftExactDateTime !== null
        && rightExactDateTime !== null
      ) {
        const leftTime = leftExactDateTime.slice(11, 16);
        const rightTime = rightExactDateTime.slice(11, 16);
        if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
      } else if (left.item.timeMode !== right.item.timeMode) {
        // Exact items precede period-only entries within each bucket.
        return left.item.timeMode === 'exact' ? -1 : 1;
      }

      return left.item.sortOrder - right.item.sortOrder
        || left.previousIndex - right.previousIndex;
    })
    .map(({ item }) => item);
}
