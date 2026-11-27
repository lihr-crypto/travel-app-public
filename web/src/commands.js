import { createTrip } from '@/application/trip/create-trip';
import { renameTrip } from '@/application/trip/rename-trip';
import { deleteTrip } from '@/application/trip/delete-trip';
import { insertTripDay } from '@/application/trip/insert-trip-day';
import { deleteTripDay } from '@/application/trip/delete-trip-day';
import { changeTripDateRange } from '@/application/trip/change-trip-date-range';
import { addItem } from '@/application/item/add-item';
import { updateItemDetails } from '@/application/item/update-item-details';
import { changeItemPlace } from '@/application/item/change-item-place';
import { reorderItem } from '@/application/item/reorder-item';
import { moveItemToDay } from '@/application/item/move-item-to-day';
import { moveItemToUnscheduled } from '@/application/item/move-item-to-unscheduled';
import { deleteItem } from '@/application/item/delete-item';
import { restoreDeletedItem } from '@/application/item/restore-deleted-item';
import { confirmPlaceSearchResult } from '@/application/place/confirm-place-search-result';
import { confirmMapPickerPlace } from '@/application/place/confirm-map-picker-place';

export function createWebCommands(store, options = {}) {
  const id = options.createId ?? (() => crypto.randomUUID());
  const deps = { createId: id, createPlaceId: id, createItemId: id, now: options.now ?? (() => new Date().toISOString()), runInTransaction: store.runInTransaction };
  const bind = (command) => (input) => command(input, deps);
  return {
    createTrip: bind(createTrip), renameTrip: bind(renameTrip), deleteTrip: bind(deleteTrip),
    insertTripDay: bind(insertTripDay), deleteTripDay: bind(deleteTripDay), changeTripDateRange: bind(changeTripDateRange),
    addItem: bind(addItem), updateItemDetails: bind(updateItemDetails), changeItemPlace: bind(changeItemPlace),
    reorderItem: bind(reorderItem), moveItemToDay: bind(moveItemToDay), moveItemToUnscheduled: bind(moveItemToUnscheduled),
    confirmPlaceSearchResult: bind(confirmPlaceSearchResult), confirmMapPickerPlace: bind(confirmMapPickerPlace),
    deleteItem: (input) => deleteItem(input, { ...deps, runInTransaction: (task) => store.runInTransaction(async (context) => {
      const result = await task(context); context.trash.save(result.data); return result;
    }) }),
    permanentlyDeleteItem: (input) => deleteItem(input, { ...deps, runInTransaction: (task) => store.runInTransaction(async (context) => {
      const result = await task(context); context.trash.remove(input.itemId); return result;
    }) }),
    restoreDeletedItem: (input) => restoreDeletedItem(input, { ...deps, runInTransaction: (task) => store.runInTransaction(async (context) => {
      const result = await task(context); context.trash.remove(input.snapshot.item.id); return result;
    }) }),
    emptyTrashItem: (input) => store.runInTransaction(async (context) => { context.trash.remove(input.itemId); }),
  };
}
