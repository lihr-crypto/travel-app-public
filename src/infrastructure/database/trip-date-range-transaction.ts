import type { RunChangeTripDateRangeTransaction } from '@/application/trip/change-trip-date-range';
import { SqliteDayRepository } from './sqlite/day-repository';
import { SqliteItemRepository } from './sqlite/item-repository';
import { SqliteTripRepository } from './sqlite/trip-repository';
import type { DatabaseRuntime } from './runtime';

export function createTripDateRangeTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunChangeTripDateRangeTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({
        days: new SqliteDayRepository(database),
        items: new SqliteItemRepository(database),
        trips: new SqliteTripRepository(database),
      }),
    );
}
