import {
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { ItemRepository } from '@/repositories/item-repository';
import { unscheduledKeys } from './query-keys';

export interface UnscheduledQuerySource {
  getUnscheduledItems(tripId: EntityId): Promise<Item[]>;
}

export function getUnscheduledItems(
  source: UnscheduledQuerySource,
  tripId: EntityId,
) {
  return source.getUnscheduledItems(tripId);
}

export function useUnscheduledItems(
  source: UnscheduledQuerySource,
  tripId: EntityId,
): UseQueryResult<Item[], Error> {
  return useQuery({
    queryKey: unscheduledKeys.byTrip(tripId),
    queryFn: () => getUnscheduledItems(source, tripId),
  });
}

export interface UnscheduledReadContext {
  items: Pick<ItemRepository, 'listUnscheduledByTripId'>;
}

export function getUnscheduledItemsFromContext(
  tripId: EntityId,
  context: UnscheduledReadContext,
) {
  return context.items.listUnscheduledByTripId(tripId);
}
