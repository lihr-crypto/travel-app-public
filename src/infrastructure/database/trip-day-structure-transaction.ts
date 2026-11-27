import type { RunTripDayStructureTransaction } from '@/application/trip/trip-day-structure';
import { SqliteDayRepository } from './sqlite/day-repository';
import { SqliteItemRepository } from './sqlite/item-repository';
import { SqliteTripRepository } from './sqlite/trip-repository';
import type { DatabaseRuntime } from './runtime';

/**
 * One exclusive transaction for Trip Day structure edits. Insert and delete both
 * rewrite Trip, Days and Item times together, so a failure anywhere must roll
 * back all three rather than leaving a Trip whose Days disagree with its range.
 */
export function createTripDayStructureTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunTripDayStructureTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({
        days: new SqliteDayRepository(database),
        items: new SqliteItemRepository(database),
        trips: new SqliteTripRepository(database),
      }),
    );
}
