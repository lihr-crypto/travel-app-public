import type { RunDeleteTripTransaction } from '@/application/trip/delete-trip';
import type { RunRenameTripTransaction } from '@/application/trip/rename-trip';
import { SqliteTripRepository } from './sqlite/trip-repository';
import type { DatabaseRuntime } from './runtime';

/** Trip metadata mutations share one exclusive SQLite transaction boundary. */
export function createRenameTripTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunRenameTripTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({ trips: new SqliteTripRepository(database) }),
    );
}

export function createDeleteTripTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunDeleteTripTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({ trips: new SqliteTripRepository(database) }),
    );
}
