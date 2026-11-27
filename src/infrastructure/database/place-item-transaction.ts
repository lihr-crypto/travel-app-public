import type { RunConfirmMapPickerPlaceTransaction } from '@/application/place/confirm-map-picker-place';
import type { RunConfirmPlaceSearchResultTransaction } from '@/application/place/confirm-place-search-result';
import { SqliteDayRepository } from './sqlite/day-repository';
import { SqliteItemRepository } from './sqlite/item-repository';
import { SqlitePlaceRepository } from './sqlite/place-repository';
import { SqliteTripRepository } from './sqlite/trip-repository';
import type { DatabaseExecutor, DatabaseRuntime } from './runtime';

/** Both Place confirmation commands need the same four repositories. */
function placeItemRepositories(database: DatabaseExecutor) {
  return {
    days: new SqliteDayRepository(database),
    items: new SqliteItemRepository(database),
    places: new SqlitePlaceRepository(database),
    trips: new SqliteTripRepository(database),
  };
}

export function createConfirmPlaceSearchResultTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunConfirmPlaceSearchResultTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task(placeItemRepositories(database)),
    );
}

export function createConfirmMapPickerPlaceTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunConfirmMapPickerPlaceTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task(placeItemRepositories(database)),
    );
}
