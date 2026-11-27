import type { EntityId, IsoTimestamp } from '@/domain/common/types';
import type { Trip } from '@/domain/trip/types';
import type { TripRepository } from '@/repositories/trip-repository';
import type { CommandResult } from '../command-result';

export interface RenameTripInput {
  tripId: EntityId;
  title: string;
}

export type RenameTripCommand = (
  input: RenameTripInput,
) => Promise<CommandResult<Trip>>;

export interface RenameTripTransactionContext {
  trips: Pick<TripRepository, 'getById' | 'update'>;
}

export type RunRenameTripTransaction = <T>(
  task: (context: RenameTripTransactionContext) => Promise<T>,
) => Promise<T>;

export interface RenameTripDependencies {
  now(): IsoTimestamp;
  runInTransaction: RunRenameTripTransaction;
}

/**
 * Renames a Trip in the same exclusive transaction that reads its current
 * entity, so the persisted title and updated timestamp cannot diverge.
 */
export async function renameTrip(
  input: RenameTripInput,
  dependencies: RenameTripDependencies,
): Promise<CommandResult<Trip>> {
  const title = input.title.trim();
  if (!title) {
    throw new RangeError('Trip title must not be empty');
  }

  return dependencies.runInTransaction(async ({ trips }) => {
    const current = await trips.getById(input.tripId);
    if (!current) {
      throw new RangeError(`Trip not found: ${input.tripId}`);
    }

    const updated: Trip = {
      ...current,
      title,
      updatedAt: dependencies.now(),
    };
    await trips.update(updated);

    return {
      data: updated,
      affectedEntityIds: [updated.id],
      validationIssues: [],
    };
  });
}
