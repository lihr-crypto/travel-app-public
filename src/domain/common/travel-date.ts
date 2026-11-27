import type { TravelDate } from './types';

/**
 * Today as a calendar date in the device's own timezone.
 *
 * Deliberately built from local `getFullYear`/`getMonth`/`getDate` rather than
 * from `toISOString()`, which would convert the calendar date through UTC and
 * report tomorrow for anyone east of Greenwich after their local midnight. Trip
 * dates are date-only values, so the comparison must stay date-only.
 */
export function deviceLocalTravelDate(now = new Date()): TravelDate {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
