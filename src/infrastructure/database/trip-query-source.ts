import type { TripQuerySource } from '@/application/queries/trip-queries';
import type { DatabaseRuntime } from './runtime';
import { SqliteDayRepository } from './sqlite/day-repository';
import { SqliteTripRepository } from './sqlite/trip-repository';

export function createTripQuerySource(
  runInReadContext: DatabaseRuntime['runInReadContext'],
): TripQuerySource {
  return {
    getTrips: () =>
      runInReadContext((database) =>
        new SqliteTripRepository(database).list(),
      ),
    getTrip: (tripId) =>
      runInReadContext((database) =>
        new SqliteTripRepository(database).getById(tripId),
      ),
    getTripDays: (tripId) =>
      runInReadContext((database) =>
        new SqliteDayRepository(database).listByTripId(tripId),
      ),
  };
}
