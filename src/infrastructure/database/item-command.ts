import { randomUUID } from 'expo-crypto';

import {
  changeItemPlace,
  type ChangeItemPlaceCommand,
} from '@/application/item/change-item-place';
import {
  updateItemDetails,
  type UpdateItemDetailsCommand,
} from '@/application/item/update-item-details';
import {
  moveItemToDay,
  type MoveItemToDayCommand,
} from '@/application/item/move-item-to-day';
import {
  moveItemToUnscheduled,
  type MoveItemToUnscheduledCommand,
} from '@/application/item/move-item-to-unscheduled';
import {
  reorderItem,
  type ReorderItemCommand,
} from '@/application/item/reorder-item';
import {
  deleteItem,
  type DeleteItemCommand,
} from '@/application/item/delete-item';
import {
  restoreDeletedItem,
  type RestoreDeletedItemCommand,
} from '@/application/item/restore-deleted-item';
import {
  confirmPlaceSearchResult,
  type ConfirmPlaceSearchResultCommand,
} from '@/application/place/confirm-place-search-result';
import {
  confirmMapPickerPlace,
  type ConfirmMapPickerPlaceCommand,
} from '@/application/place/confirm-map-picker-place';
import {
  runInChangeItemPlaceTransaction,
  runInConfirmMapPickerPlaceTransaction,
  runInConfirmPlaceSearchResultTransaction,
  runInDeleteItemTransaction,
  runInMoveItemToDayTransaction,
  runInMoveItemToUnscheduledTransaction,
  runInReorderItemTransaction,
  runInRestoreDeletedItemTransaction,
  runInUpdateItemDetailsTransaction,
} from './index';

export const updateItemDetailsCommand: UpdateItemDetailsCommand = (input) =>
  updateItemDetails(input, {
    now: () => new Date().toISOString(),
    createPlaceId: randomUUID,
    runInTransaction: runInUpdateItemDetailsTransaction,
  });

export const changeItemPlaceCommand: ChangeItemPlaceCommand = (input) =>
  changeItemPlace(input, {
    createPlaceId: randomUUID,
    now: () => new Date().toISOString(),
    runInTransaction: runInChangeItemPlaceTransaction,
  });

export const moveItemToDayCommand: MoveItemToDayCommand = (input) =>
  moveItemToDay(input, {
    now: () => new Date().toISOString(),
    runInTransaction: runInMoveItemToDayTransaction,
  });

export const moveItemToUnscheduledCommand: MoveItemToUnscheduledCommand =
  (input) =>
    moveItemToUnscheduled(input, {
      now: () => new Date().toISOString(),
      runInTransaction: runInMoveItemToUnscheduledTransaction,
    });

export const reorderItemCommand: ReorderItemCommand = (input) =>
  reorderItem(input, {
    now: () => new Date().toISOString(),
    runInTransaction: runInReorderItemTransaction,
  });

export const deleteItemCommand: DeleteItemCommand = (input) =>
  deleteItem(input, {
    now: () => new Date().toISOString(),
    runInTransaction: runInDeleteItemTransaction,
  });

export const restoreDeletedItemCommand: RestoreDeletedItemCommand = (input) =>
  restoreDeletedItem(input, {
    now: () => new Date().toISOString(),
    runInTransaction: runInRestoreDeletedItemTransaction,
  });

export const confirmPlaceSearchResultCommand: ConfirmPlaceSearchResultCommand =
  (input) => confirmPlaceSearchResult(input, {
    createPlaceId: randomUUID,
    createItemId: randomUUID,
    now: () => new Date().toISOString(),
    runInTransaction: runInConfirmPlaceSearchResultTransaction,
  });

export const confirmMapPickerPlaceCommand: ConfirmMapPickerPlaceCommand =
  (input) => confirmMapPickerPlace(input, {
    createPlaceId: randomUUID,
    createItemId: randomUUID,
    now: () => new Date().toISOString(),
    runInTransaction: runInConfirmMapPickerPlaceTransaction,
  });
