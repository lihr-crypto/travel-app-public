import type { EntityId } from '@/domain/common/types';
import type { TripRepository } from '@/repositories/trip-repository';
import type { CommandResult } from '../command-result';

export interface DeleteTripInput {
  tripId: EntityId;
}

export type DeleteTripCommand = (
  input: DeleteTripInput,
) => Promise<CommandResult<void>>;

export interface DeleteTripTransactionContext {
  trips: Pick<TripRepository, 'getById' | 'delete'>;
}

export type RunDeleteTripTransaction = <T>(
  task: (context: DeleteTripTransactionContext) => Promise<T>,
) => Promise<T>;

export interface DeleteTripDependencies {
  runInTransaction: RunDeleteTripTransaction;
}

/**
 * Deletes a Trip and relies on the database's foreign-key cascade for its
 * owned Days and Items. Place snapshots are independent rows and remain intact.
 */
export async function deleteTrip(
  input: DeleteTripInput,
  dependencies: DeleteTripDependencies,
): Promise<CommandResult<void>> {
  return dependencies.runInTransaction(async ({ trips }) => {
    const current = await trips.getById(input.tripId);
    if (!current) {
      throw new RangeError(`Trip not found: ${input.tripId}`);
    }

    await trips.delete(current.id);

    return {
      data: undefined,
      affectedEntityIds: [current.id],
      validationIssues: [],
    };
  });
}
