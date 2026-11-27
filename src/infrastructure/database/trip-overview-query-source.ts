import {
  getTripOverviewData,
  type TripOverviewQuerySource,
} from '@/application/queries/trip-overview';
import type { DatabaseRuntime } from './runtime';
import { SqliteDayRepository } from './sqlite/day-repository';
import { SqliteItemRepository } from './sqlite/item-repository';
import { SqlitePlaceRepository } from './sqlite/place-repository';
import { SqliteTripRepository } from './sqlite/trip-repository';

export function createTripOverviewQuerySource(
  runInReadContext: DatabaseRuntime['runInReadContext'],
): TripOverviewQuerySource {
  return {
    getTripOverview: (tripId) => runInReadContext((database) =>
      getTripOverviewData(tripId, {
        trips: new SqliteTripRepository(database),
        days: new SqliteDayRepository(database),
        items: new SqliteItemRepository(database),
        places: new SqlitePlaceRepository(database),
      }),
    ),
  };
}
