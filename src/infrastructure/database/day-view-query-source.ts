import {
  getDayViewData,
  type DayViewQuerySource,
} from '@/application/queries/day-view';
import type { DatabaseRuntime } from './runtime';
import { SqliteDayRepository } from './sqlite/day-repository';
import { SqliteItemRepository } from './sqlite/item-repository';
import { SqlitePlaceRepository } from './sqlite/place-repository';
import { SqliteTripRepository } from './sqlite/trip-repository';

export function createDayViewQuerySource(
  runInReadContext: DatabaseRuntime['runInReadContext'],
): DayViewQuerySource {
  return {
    getDayView: (dayId) =>
      runInReadContext((database) =>
        getDayViewData(dayId, {
          days: new SqliteDayRepository(database),
          items: new SqliteItemRepository(database),
          places: new SqlitePlaceRepository(database),
          trips: new SqliteTripRepository(database),
        }),
      ),
  };
}
