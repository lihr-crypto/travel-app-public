import type { RunBindApplePlaceTransaction } from '@/application/place/bind-apple-place';
import { SqliteApplePlaceBindingRepository } from './sqlite/apple-place-binding-repository';
import { SqlitePlaceRepository } from './sqlite/place-repository';
import type { DatabaseRuntime } from './runtime';

export function createApplePlaceBindingTransactionRunner(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): RunBindApplePlaceTransaction {
  return (task) =>
    runInExclusiveTransaction((database) =>
      task({
        places: new SqlitePlaceRepository(database),
        bindings: new SqliteApplePlaceBindingRepository(database),
      }),
    );
}
