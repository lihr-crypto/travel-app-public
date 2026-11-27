import type { IsoTimestamp } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { DayRepository } from '@/repositories/day-repository';
import type { ItemRepository } from '@/repositories/item-repository';
import type { CommandResult } from '../command-result';
import type { DeletedItemSnapshot } from './deleted-item-snapshot';

export interface RestoreDeletedItemInput {
  snapshot: DeletedItemSnapshot;
}

export type RestoreDeletedItemCommand = (
  input: RestoreDeletedItemInput,
) => Promise<CommandResult<Item>>;

export interface RestoreDeletedItemTransactionContext {
  days: Pick<DayRepository, 'getById'>;
  items: Pick<
    ItemRepository,
    'getById' | 'listByDayId' | 'listUnscheduledByTripId' | 'insert' | 'updateMany'
  >;
}

export type RunRestoreDeletedItemTransaction = <T>(
  task: (context: RestoreDeletedItemTransactionContext) => Promise<T>,
) => Promise<T>;

export interface RestoreDeletedItemDependencies {
  now(): IsoTimestamp;
  runInTransaction: RunRestoreDeletedItemTransaction;
}

/**
 * Resolves the insert index for a restored Item from its snapshot neighbours
 * (Stage-05 §9 "as closely as possible"). Only anchors that still live in the
 * target collection count: a neighbour moved to another Day or deleted since
 * the delete is treated as missing. A surviving previous anchor wins, then a
 * surviving next anchor, and with neither the Item appends at the end.
 */
export function resolveRestoreInsertionIndex(
  collection: readonly Item[],
  snapshot: DeletedItemSnapshot,
): number {
  if (snapshot.previousItemId !== null) {
    const previousIndex = collection.findIndex(
      ({ id }) => id === snapshot.previousItemId,
    );

    if (previousIndex >= 0) {
      return previousIndex + 1;
    }
  }

  if (snapshot.nextItemId !== null) {
    const nextIndex = collection.findIndex(
      ({ id }) => id === snapshot.nextItemId,
    );

    if (nextIndex >= 0) {
      return nextIndex;
    }
  }

  return collection.length;
}

/**
 * Restores a deleted Item from its canonical snapshot (Stage-05 §9): reinsert
 * the snapshot Item with its original Day/Unscheduled ownership, land it at
 * the closest position its neighbours still allow, reindex the surviving
 * collection, and commit inside the caller's exclusive transaction.
 */
export async function restoreDeletedItem(
  input: RestoreDeletedItemInput,
  dependencies: RestoreDeletedItemDependencies,
): Promise<CommandResult<Item>> {
  return dependencies.runInTransaction(async ({ days, items }) => {
    const snapshot = input.snapshot;

    if (await items.getById(snapshot.item.id)) {
      throw new RangeError(`Item already exists: ${snapshot.item.id}`);
    }

    if (snapshot.item.dayId !== null) {
      const day = await days.getById(snapshot.item.dayId);

      if (!day) {
        throw new RangeError(
          `Target Day no longer exists: ${snapshot.item.dayId}`,
        );
      }

      if (day.tripId !== snapshot.item.tripId) {
        throw new RangeError(
          'Target Day must belong to the restored Item Trip',
        );
      }
    }

    const targetCollection =
      snapshot.item.dayId === null
        ? await items.listUnscheduledByTripId(snapshot.item.tripId)
        : await items.listByDayId(snapshot.item.dayId);
    const insertIndex = resolveRestoreInsertionIndex(
      targetCollection,
      snapshot,
    );
    const targetSequence = [...targetCollection];
    const timestamp = dependencies.now();
    const restoredItem: Item = {
      ...snapshot.item,
      sortOrder: insertIndex,
      updatedAt: timestamp,
    };
    targetSequence.splice(insertIndex, 0, restoredItem);

    await items.insert(restoredItem);

    const survivorUpdates = targetSequence.flatMap((item, sortOrder) =>
      item.id === restoredItem.id || item.sortOrder === sortOrder
        ? []
        : [{ ...item, sortOrder, updatedAt: timestamp }],
    );
    await items.updateMany(survivorUpdates);

    return {
      data: restoredItem,
      affectedEntityIds: [
        restoredItem.id,
        ...survivorUpdates.map(({ id }) => id),
      ],
      validationIssues: [],
    };
  });
}
