import type { EntityId, IsoTimestamp } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Day, Trip } from '@/domain/trip/types';
import type { DayRepository } from '@/repositories/day-repository';
import type { ItemRepository } from '@/repositories/item-repository';
import type { TripRepository } from '@/repositories/trip-repository';

/**
 * Shared seams for the two Trip Day structure commands (insert / delete).
 *
 * Both rewrite the Day spine and the absolute times of the scheduled Items that
 * ride along with it, so they need the same three repositories in one exclusive
 * transaction — the same shape `changeTripDateRange` uses.
 */
export interface TripDayStructureTransactionContext {
  trips: Pick<TripRepository, 'getById' | 'update'>;
  days: Pick<
    DayRepository,
    'listByTripId' | 'insertMany' | 'updateMany' | 'deleteMany'
  >;
  items: Pick<
    ItemRepository,
    'listByDayId' | 'listUnscheduledByTripId' | 'updateMany'
  >;
}

export type RunTripDayStructureTransaction = <T>(
  task: (context: TripDayStructureTransactionContext) => Promise<T>,
) => Promise<T>;

export interface TripDayStructureDependencies {
  createId(): EntityId;
  now(): IsoTimestamp;
  runInTransaction: RunTripDayStructureTransaction;
}

export interface TripDayStructureSnapshot {
  trip: Trip;
  /** Ordered by `dayIndex`, which is also ascending `date`. */
  days: Day[];
  itemsByDayId: Map<EntityId, Item[]>;
  unscheduledItems: Item[];
}

/**
 * Reads the whole Day spine in one pass.
 *
 * A Trip Day is contiguous with the Trip range, so `dayIndex` order and date
 * order must agree; a snapshot that disagrees is already corrupt and is
 * rejected rather than silently "repaired" into a different itinerary.
 */
export async function loadTripDayStructure(
  tripId: EntityId,
  context: TripDayStructureTransactionContext,
): Promise<TripDayStructureSnapshot> {
  const trip = await context.trips.getById(tripId);

  if (!trip) {
    throw new RangeError(`Trip not found: ${tripId}`);
  }

  const days = await context.days.listByTripId(trip.id);
  const itemsByDayId = new Map<EntityId, Item[]>();

  for (const [index, day] of days.entries()) {
    if (day.dayIndex !== index + 1) {
      throw new RangeError(
        `Trip Day index is not contiguous at Day ${day.id}: ${day.dayIndex}`,
      );
    }

    itemsByDayId.set(day.id, await context.items.listByDayId(day.id));
  }

  return {
    trip,
    days,
    itemsByDayId,
    unscheduledItems: await context.items.listUnscheduledByTripId(trip.id),
  };
}

export function scheduledItemsOf(snapshot: TripDayStructureSnapshot): Item[] {
  return snapshot.days.flatMap((day) => snapshot.itemsByDayId.get(day.id) ?? []);
}
