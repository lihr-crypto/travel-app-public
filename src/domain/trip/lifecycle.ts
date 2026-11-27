import type { TravelDate } from '@/domain/common/types';
import type { Trip, TripLifecycle } from './types';

type TripDateRange = Pick<Trip, 'startDate' | 'endDate'>;

/**
 * Derives the display lifecycle from an inclusive calendar-date range.
 *
 * TravelDate values are deliberately compared as date-only ISO strings. This
 * avoids converting a calendar date through the device timezone.
 */
export function deriveTripLifecycle(
  trip: TripDateRange,
  today: TravelDate,
): TripLifecycle {
  if (trip.startDate > today) {
    return 'planned';
  }

  if (trip.endDate < today) {
    return 'completed';
  }

  return 'active';
}
