import type { EntityId, IsoTimestamp } from '@/domain/common/types';
import type { ItemRepository } from '@/repositories/item-repository';
import type { CommandResult } from '../command-result';
import { reindexChangedItems } from './ordering';
import type { DeletedItemSnapshot } from './deleted-item-snapshot';

export interface DeleteItemInput {
  itemId: EntityId;
}

export type DeleteItemCommand = (
  input: DeleteItemInput,
) => Promise<CommandResult<DeletedItemSnapshot>>;

export interface DeleteItemTransactionContext {
  items: Pick<
    ItemRepository,
    | 'getById'
    | 'listByDayId'
    | 'listUnscheduledByTripId'
    | 'delete'
    | 'updateMany'
  >;
}

export type RunDeleteItemTransaction = <T>(
  task: (context: DeleteItemTransactionContext) => Promise<T>,
) => Promise<T>;

export interface DeleteItemDependencies {
  now(): IsoTimestamp;
  runInTransaction: RunDeleteItemTransaction;
}

/**
 * Internal Item delete (Stage-05 §9): captures the canonical
 * `DeletedItemSnapshot` inside the same exclusive transaction that removes the
 * row and reindexes the surviving collection. User-facing exposure stays
 * hidden until the M11 Undo surface exists.
 */
export async function deleteItem(
  input: DeleteItemInput,
  dependencies: DeleteItemDependencies,
): Promise<CommandResult<DeletedItemSnapshot>> {
  return dependencies.runInTransaction(async ({ items }) => {
    const sourceItem = await items.getById(input.itemId);

    if (!sourceItem) {
      throw new RangeError(`Item not found: ${input.itemId}`);
    }

    const collection =
      sourceItem.dayId === null
        ? await items.listUnscheduledByTripId(sourceItem.tripId)
        : await items.listByDayId(sourceItem.dayId);
    const sourceIndex = collection.findIndex(({ id }) => id === sourceItem.id);

    if (sourceIndex < 0) {
      throw new Error(
        `Item is missing from its source collection: ${sourceItem.id}`,
      );
    }

    const snapshot: DeletedItemSnapshot = {
      item: sourceItem,
      previousItemId: collection[sourceIndex - 1]?.id ?? null,
      nextItemId: collection[sourceIndex + 1]?.id ?? null,
    };

    await items.delete(sourceItem.id);

    const reindexed = reindexChangedItems(
      collection.filter(({ id }) => id !== sourceItem.id),
      dependencies.now(),
    );
    await items.updateMany(reindexed);

    return {
      data: snapshot,
      affectedEntityIds: [sourceItem.id, ...reindexed.map(({ id }) => id)],
      validationIssues: [],
    };
  });
}
