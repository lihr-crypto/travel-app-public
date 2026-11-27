import {
  getHomeMapData,
  type HomeMapQuerySource,
} from '@/application/queries/home-map';
import type { DatabaseRuntime } from './runtime';
import { SqliteDayRepository } from './sqlite/day-repository';
import { SqliteItemRepository } from './sqlite/item-repository';
import { SqlitePlaceRepository } from './sqlite/place-repository';
import { SqliteTripRepository } from './sqlite/trip-repository';

export function createHomeMapQuerySource(
  runInReadContext: DatabaseRuntime['runInReadContext'],
): HomeMapQuerySource {
  return {
    getHomeMap: () => runInReadContext((database) =>
      getHomeMapData({
        days: new SqliteDayRepository(database),
        items: new SqliteItemRepository(database),
        places: new SqlitePlaceRepository(database),
        trips: new SqliteTripRepository(database),
      }),
    ),
  };
}
