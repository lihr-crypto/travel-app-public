import type { EntityId, IsoTimestamp } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { ItemRepository } from '@/repositories/item-repository';
import type { CommandResult } from '../command-result';
import {
  reindexChangedItems,
  resolveItemInsertionIndex,
} from './ordering';
import type { ItemPosition } from './position';

export interface ReorderItemInput {
  itemId: EntityId;
  position: ItemPosition;
}

export type ReorderItemCommand = (
  input: ReorderItemInput,
) => Promise<CommandResult<Item>>;

export interface ReorderItemTransactionContext {
  items: Pick<
    ItemRepository,
    'getById' | 'listByDayId' | 'listUnscheduledByTripId' | 'updateMany'
  >;
}

export type RunReorderItemTransaction = <T>(
  task: (context: ReorderItemTransactionContext) => Promise<T>,
) => Promise<T>;

export interface ReorderItemDependencies {
  now(): IsoTimestamp;
  runInTransaction: RunReorderItemTransaction;
}

export async function reorderItem(
  input: ReorderItemInput,
  dependencies: ReorderItemDependencies,
): Promise<CommandResult<Item>> {
  return dependencies.runInTransaction(async ({ items }) => {
    const sourceItem = await items.getById(input.itemId);

    if (!sourceItem) {
      throw new RangeError(`Item not found: ${input.itemId}`);
    }

    if (
      (input.position.type === 'before' || input.position.type === 'after') &&
      input.position.itemId === sourceItem.id
    ) {
      throw new RangeError('Item cannot be positioned relative to itself');
    }

    const collection =
      sourceItem.dayId === null
        ? await items.listUnscheduledByTripId(sourceItem.tripId)
        : await items.listByDayId(sourceItem.dayId);
    const sourceIndex = collection.findIndex(({ id }) => id === sourceItem.id);

    if (sourceIndex < 0) {
      throw new Error(`Item is missing from its collection: ${sourceItem.id}`);
    }

    const remaining = collection.filter(({ id }) => id !== sourceItem.id);
    const targetIndex = resolveItemInsertionIndex(remaining, input.position);
    const reordered = [...remaining];
    reordered.splice(targetIndex, 0, sourceItem);
    const updates = reindexChangedItems(reordered, dependencies.now());
    const reorderedItem =
      updates.find(({ id }) => id === sourceItem.id) ?? sourceItem;

    if (updates.length > 0) {
      await items.updateMany(updates);
    }

    return {
      data: reorderedItem,
      affectedEntityIds: updates.map(({ id }) => id),
      validationIssues: [],
    };
  });
}
