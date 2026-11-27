import { openDatabaseAsync } from 'expo-sqlite';

import { runMigrations } from './migrations';
import { createDatabaseRuntime } from './runtime';
import { createDayViewQuerySource } from './day-view-query-source';
import { createUnscheduledQuerySource } from './unscheduled-query-source';
import { createTripOverviewQuerySource } from './trip-overview-query-source';
import { createHomeMapQuerySource } from './home-map-query-source';
import {
  createChangeItemPlaceTransactionRunner,
  createDeleteItemTransactionRunner,
  createMoveItemToDayTransactionRunner,
  createMoveItemToUnscheduledTransactionRunner,
  createReorderItemTransactionRunner,
  createRestoreDeletedItemTransactionRunner,
  createUpdateItemDetailsTransactionRunner,
} from './item-transaction';
import { createTripDayTransactionRunner } from './trip-day-transaction';
import { createTripDayStructureTransactionRunner } from './trip-day-structure-transaction';
import { createTripDateRangeTransactionRunner } from './trip-date-range-transaction';
import {
  createDeleteTripTransactionRunner,
  createRenameTripTransactionRunner,
} from './trip-transaction';
import { createApplePlaceBindingSource } from './apple-place-binding-source';
import { createApplePlaceBindingTransactionRunner } from './apple-place-binding-transaction';
import { persistM4MapFixtures, readM4MapFixtures } from './m4-map-fixtures';
import { createConfirmMapPickerPlaceTransactionRunner, createConfirmPlaceSearchResultTransactionRunner } from './place-item-transaction';

const DATABASE_NAME = 'travel-app.db';

const databaseRuntime = createDatabaseRuntime(
  () => openDatabaseAsync(DATABASE_NAME),
  { initializeConnection: runMigrations },
);

export const initializeDatabase = databaseRuntime.initialize;
export const runInReadContext = databaseRuntime.runInReadContext;
export const runInExclusiveTransaction =
  databaseRuntime.runInExclusiveTransaction;
export const runInTripDayTransaction = createTripDayTransactionRunner(
  databaseRuntime.runInExclusiveTransaction,
);
export const runInTripDateRangeTransaction =
  createTripDateRangeTransactionRunner(
    databaseRuntime.runInExclusiveTransaction,
  );
export const runInTripDayStructureTransaction =
  createTripDayStructureTransactionRunner(
    databaseRuntime.runInExclusiveTransaction,
  );
export const runInRenameTripTransaction = createRenameTripTransactionRunner(
  databaseRuntime.runInExclusiveTransaction,
);
export const runInDeleteTripTransaction = createDeleteTripTransactionRunner(
  databaseRuntime.runInExclusiveTransaction,
);
export const runInUpdateItemDetailsTransaction =
  createUpdateItemDetailsTransactionRunner(
    databaseRuntime.runInExclusiveTransaction,
  );
export const runInChangeItemPlaceTransaction =
  createChangeItemPlaceTransactionRunner(
    databaseRuntime.runInExclusiveTransaction,
  );
export const runInMoveItemToDayTransaction =
  createMoveItemToDayTransactionRunner(
    databaseRuntime.runInExclusiveTransaction,
  );
export const runInMoveItemToUnscheduledTransaction =
  createMoveItemToUnscheduledTransactionRunner(
    databaseRuntime.runInExclusiveTransaction,
  );
export const runInReorderItemTransaction =
  createReorderItemTransactionRunner(
    databaseRuntime.runInExclusiveTransaction,
  );
export const runInDeleteItemTransaction = createDeleteItemTransactionRunner(
  databaseRuntime.runInExclusiveTransaction,
);
export const runInRestoreDeletedItemTransaction =
  createRestoreDeletedItemTransactionRunner(
    databaseRuntime.runInExclusiveTransaction,
  );
export const runInConfirmPlaceSearchResultTransaction =
  createConfirmPlaceSearchResultTransactionRunner(
    databaseRuntime.runInExclusiveTransaction,
  );
export const runInConfirmMapPickerPlaceTransaction =
  createConfirmMapPickerPlaceTransactionRunner(
    databaseRuntime.runInExclusiveTransaction,
  );
export const dayViewQuerySource = createDayViewQuerySource(
  databaseRuntime.runInReadContext,
);
export const unscheduledQuerySource = createUnscheduledQuerySource(
  databaseRuntime.runInReadContext,
);
export const tripOverviewQuerySource = createTripOverviewQuerySource(
  databaseRuntime.runInReadContext,
);
export const homeMapQuerySource = createHomeMapQuerySource(
  databaseRuntime.runInReadContext,
);
export const applePlaceBindingSource = createApplePlaceBindingSource(databaseRuntime.runInReadContext);
export const runInApplePlaceBindingTransaction = createApplePlaceBindingTransactionRunner(
  databaseRuntime.runInExclusiveTransaction,
);

/** Explicit dev-only M4 fixture actions; never run during normal startup. */
export const installM4MapFixtures = () =>
  persistM4MapFixtures(databaseRuntime.runInExclusiveTransaction);
export const loadM4MapFixtures = () =>
  readM4MapFixtures(databaseRuntime.runInReadContext);
