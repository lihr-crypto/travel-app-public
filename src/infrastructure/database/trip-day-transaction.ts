import type { RunCreateTripTransaction } from '@/application/trip/create-trip';
import { SqliteDayRepository } from './sqlite/day-repository';
import { SqliteTripRepository } from './sqlite/trip-repository';
import type { DatabaseRuntime } from './runtime';

export function createTripDayTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunCreateTripTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({
        days: new SqliteDayRepository(database),
        trips: new SqliteTripRepository(database),
      }),
    );
}
