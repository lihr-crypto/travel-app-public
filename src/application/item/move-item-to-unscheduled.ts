import type { EntityId, IsoTimestamp } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { ItemRepository } from '@/repositories/item-repository';
import type { CommandResult } from '../command-result';
import {
  reindexChangedItems,
  resolveItemInsertionIndex,
} from './ordering';
import type { ItemPosition } from './position';

export interface MoveItemToUnscheduledInput {
  itemId: EntityId;
  position?: ItemPosition;
}

export type MoveItemToUnscheduledCommand = (
  input: MoveItemToUnscheduledInput,
) => Promise<CommandResult<Item>>;

export interface MoveItemToUnscheduledTransactionContext {
  items: Pick<
    ItemRepository,
    | 'getById'
    | 'listByDayId'
    | 'listUnscheduledByTripId'
    | 'updateMany'
  >;
}

export type RunMoveItemToUnscheduledTransaction = <T>(
  task: (context: MoveItemToUnscheduledTransactionContext) => Promise<T>,
) => Promise<T>;

export interface MoveItemToUnscheduledDependencies {
  now(): IsoTimestamp;
  runInTransaction: RunMoveItemToUnscheduledTransaction;
}

export async function moveItemToUnscheduled(
  input: MoveItemToUnscheduledInput,
  dependencies: MoveItemToUnscheduledDependencies,
): Promise<CommandResult<Item>> {
  return dependencies.runInTransaction(async ({ items }) => {
    const sourceItem = await items.getById(input.itemId);

    if (!sourceItem) {
      throw new RangeError(`Item not found: ${input.itemId}`);
    }

    if (sourceItem.dayId === null) {
      throw new RangeError('Item is already Unscheduled');
    }

    const sourceItems = await items.listByDayId(sourceItem.dayId);
    const sourceIndex = sourceItems.findIndex(({ id }) => id === sourceItem.id);

    if (sourceIndex < 0) {
      throw new Error(`Item is missing from its source collection: ${sourceItem.id}`);
    }

    const targetItems = await items.listUnscheduledByTripId(sourceItem.tripId);
    const position = input.position ?? { type: 'end' as const };
    const targetIndex = resolveItemInsertionIndex(targetItems, position);
    const remainingSource = sourceItems.filter(({ id }) => id !== sourceItem.id);
    const targetSequence = [...targetItems];
    targetSequence.splice(targetIndex, 0, sourceItem);
    const timestamp = dependencies.now();
    const sourceUpdates = reindexChangedItems(remainingSource, timestamp);
    const targetUpdates = targetSequence.flatMap((item, sortOrder) => {
      if (
        item.id !== sourceItem.id &&
        item.dayId === null &&
        item.sortOrder === sortOrder
      ) {
        return [];
      }

      return [
        {
          ...item,
          dayId: null,
          sortOrder,
          updatedAt: timestamp,
        },
      ];
    });
    const updates = [...sourceUpdates, ...targetUpdates];
    const movedItem = targetUpdates.find(({ id }) => id === sourceItem.id);

    if (!movedItem) {
      throw new Error(`Moved Item was not reindexed: ${sourceItem.id}`);
    }

    await items.updateMany(updates);

    return {
      data: movedItem,
      affectedEntityIds: updates.map(({ id }) => id),
      validationIssues: [],
    };
  });
}
