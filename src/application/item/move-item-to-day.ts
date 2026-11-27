import type { EntityId, IsoTimestamp } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { DayRepository } from '@/repositories/day-repository';
import type { ItemRepository } from '@/repositories/item-repository';
import type { CommandResult } from '../command-result';
import {
  reindexChangedItems,
  resolveItemInsertionIndex,
} from './ordering';
import type { ItemPosition } from './position';

export interface MoveItemToDayInput {
  itemId: EntityId;
  targetDayId: EntityId;
  position?: ItemPosition;
}

export type MoveItemToDayCommand = (
  input: MoveItemToDayInput,
) => Promise<CommandResult<Item>>;

export interface MoveItemToDayTransactionContext {
  days: Pick<DayRepository, 'getById'>;
  items: Pick<
    ItemRepository,
    | 'getById'
    | 'listByDayId'
    | 'listUnscheduledByTripId'
    | 'updateMany'
  >;
}

export type RunMoveItemToDayTransaction = <T>(
  task: (context: MoveItemToDayTransactionContext) => Promise<T>,
) => Promise<T>;

export interface MoveItemToDayDependencies {
  now(): IsoTimestamp;
  runInTransaction: RunMoveItemToDayTransaction;
}

export async function moveItemToDay(
  input: MoveItemToDayInput,
  dependencies: MoveItemToDayDependencies,
): Promise<CommandResult<Item>> {
  return dependencies.runInTransaction(async ({ days, items }) => {
    const sourceItem = await items.getById(input.itemId);

    if (!sourceItem) {
      throw new RangeError(`Item not found: ${input.itemId}`);
    }

    const targetDay = await days.getById(input.targetDayId);

    if (!targetDay) {
      throw new RangeError(`Day not found: ${input.targetDayId}`);
    }

    if (targetDay.tripId !== sourceItem.tripId) {
      throw new RangeError('Target Day must belong to the Item Trip');
    }

    if (sourceItem.dayId === targetDay.id) {
      throw new RangeError('Item already belongs to the target Day');
    }

    const sourceItems =
      sourceItem.dayId === null
        ? await items.listUnscheduledByTripId(sourceItem.tripId)
        : await items.listByDayId(sourceItem.dayId);
    const sourceIndex = sourceItems.findIndex(({ id }) => id === sourceItem.id);

    if (sourceIndex < 0) {
      throw new Error(`Item is missing from its source collection: ${sourceItem.id}`);
    }

    const targetItems = await items.listByDayId(targetDay.id);
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
        item.dayId === targetDay.id &&
        item.sortOrder === sortOrder
      ) {
        return [];
      }

      return [
        {
          ...item,
          dayId: targetDay.id,
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
