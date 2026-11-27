import type { RunAddItemTransaction } from '@/application/item/add-item';
import type { RunChangeItemPlaceTransaction } from '@/application/item/change-item-place';
import type { RunDeleteItemTransaction } from '@/application/item/delete-item';
import type { RunRestoreDeletedItemTransaction } from '@/application/item/restore-deleted-item';
import type { RunUpdateItemDetailsTransaction } from '@/application/item/update-item-details';
import type { RunMoveItemToDayTransaction } from '@/application/item/move-item-to-day';
import type { RunMoveItemToUnscheduledTransaction } from '@/application/item/move-item-to-unscheduled';
import type { RunReorderItemTransaction } from '@/application/item/reorder-item';
import { SqliteDayRepository } from './sqlite/day-repository';
import { SqliteItemRepository } from './sqlite/item-repository';
import { SqlitePlaceRepository } from './sqlite/place-repository';
import { SqliteTripRepository } from './sqlite/trip-repository';
import type { DatabaseRuntime } from './runtime';

export function createItemTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunAddItemTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({
        days: new SqliteDayRepository(database),
        items: new SqliteItemRepository(database),
        places: new SqlitePlaceRepository(database),
        trips: new SqliteTripRepository(database),
      }),
    );
}

export function createUpdateItemDetailsTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunUpdateItemDetailsTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({ items: new SqliteItemRepository(database), places: new SqlitePlaceRepository(database), trips: new SqliteTripRepository(database) }),
    );
}

export function createChangeItemPlaceTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunChangeItemPlaceTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({
        items: new SqliteItemRepository(database),
        places: new SqlitePlaceRepository(database),
        trips: new SqliteTripRepository(database),
      }),
    );
}

export function createMoveItemToDayTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunMoveItemToDayTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({
        days: new SqliteDayRepository(database),
        items: new SqliteItemRepository(database),
      }),
    );
}

export function createMoveItemToUnscheduledTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunMoveItemToUnscheduledTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({ items: new SqliteItemRepository(database) }),
    );
}

export function createReorderItemTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunReorderItemTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({ items: new SqliteItemRepository(database) }),
    );
}

export function createDeleteItemTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunDeleteItemTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({ items: new SqliteItemRepository(database) }),
    );
}

export function createRestoreDeletedItemTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunRestoreDeletedItemTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({
        days: new SqliteDayRepository(database),
        items: new SqliteItemRepository(database),
      }),
    );
}
