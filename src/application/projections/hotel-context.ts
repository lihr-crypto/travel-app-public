import type { EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Day } from '@/domain/trip/types';

/**
 * Stage-02 §11.3 contextual accommodation card: a Hotel is one cross-day Item
 * owned by its check-in Day, so later Days show a context card instead of a
 * copied Item. The projection resolves which card (if any) a given Day shows.
 */
export type HotelContext =
  | Readonly<{ kind: 'stay'; title: string }>
  | Readonly<{ kind: 'checkout'; title: string; checkOutTime: string | null }>;

/**
 * Resolves the Hotel context for one Day from the Trip's full Item collection
 * (the hotel Item itself lives on its check-in Day's read model, so the Day
 * view cannot derive this from its own slice).
 *
 * Rules, per Stage-02 §11.3:
 * - the check-in Day shows nothing — the Hotel is already a Timeline row there;
 * - the check-out Day shows the `今早退房` card with the checkout time;
 * - intermediate nights show the `今晚住宿` card;
 * - a Hotel without a canonical check-out end, or with an inverted/same-day
 *   stay, yields no context.
 */
export function hotelContextForDay(
  day: Pick<Day, 'id' | 'date'>,
  days: readonly Pick<Day, 'id' | 'date'>[],
  items: readonly Item[],
): HotelContext | null {
  const dateByDayId = new Map(days.map(({ id, date }) => [id, date]));
  const hotels = items
    .filter(({ type, dayId }) => type === 'hotel' && dayId !== null && dayId !== day.id)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));

  for (const hotel of hotels) {
    const checkInDate = hotel.startDateTime?.slice(0, 10)
      ?? (hotel.dayId !== null ? dateByDayId.get(hotel.dayId) ?? null : null);
    const checkOutDate = hotel.endDateTime?.slice(0, 10) ?? null;

    if (checkInDate === null || checkOutDate === null || checkOutDate <= checkInDate) {
      continue;
    }

    if (day.date === checkOutDate) {
      return {
        kind: 'checkout',
        title: hotel.title,
        checkOutTime: hotel.endDateTime === null ? null : hotel.endDateTime.slice(11, 16),
      };
    }

    if (day.date > checkInDate && day.date < checkOutDate) {
      return { kind: 'stay', title: hotel.title };
    }
  }

  return null;
}

/** Collects the per-Day contexts for a whole Trip in one pass. */
export function hotelContextsByDayId(
  days: readonly Pick<Day, 'id' | 'date'>[],
  items: readonly Item[],
): ReadonlyMap<EntityId, HotelContext> {
  const contexts = new Map<EntityId, HotelContext>();
  for (const day of days) {
    const context = hotelContextForDay(day, days, items);
    if (context !== null) {
      contexts.set(day.id, context);
    }
  }
  return contexts;
}
