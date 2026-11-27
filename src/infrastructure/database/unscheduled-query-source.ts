import {
  getUnscheduledItemsFromContext,
  type UnscheduledQuerySource,
} from '@/application/queries/unscheduled';
import type { DatabaseRuntime } from './runtime';
import { SqliteItemRepository } from './sqlite/item-repository';

export function createUnscheduledQuerySource(
  runInReadContext: DatabaseRuntime['runInReadContext'],
): UnscheduledQuerySource {
  return {
    getUnscheduledItems: (tripId) =>
      runInReadContext((database) =>
        getUnscheduledItemsFromContext(tripId, {
          items: new SqliteItemRepository(database),
        }),
      ),
  };
}
