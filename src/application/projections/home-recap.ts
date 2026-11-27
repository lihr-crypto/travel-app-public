import type { EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day } from '@/domain/trip/types';

/**
 * Home recap — the 累计/年度 numbers shown above the 我的旅行 list.
 *
 * It summarizes the Trips the list currently shows, nothing more. It is a count
 * of saved itineraries, not of visits: Footprint is saved Trip history and does
 * not claim any Item was actually reached (Stage-03 §3.1, UX-02), so the labels
 * the UI uses say 旅行 / 行程天数 / 地点 and never 去过 / 到访.
 */

export interface HomeRecap {
  tripCount: number;
  /** Distinct calendar dates across the Trips, so overlapping Trips are not double counted. */
  dayCount: number;
  /** Distinct Places across the Trips, by {@link placeIdentityKey}. */
  placeCount: number;
}

/** The slice of a Home Trip entry the recap reads. */
export interface HomeRecapTrip {
  days: readonly Day[];
  items: readonly Item[];
  placesById: Readonly<Record<EntityId, Place>>;
}

/**
 * Two Item rows rarely share a Place row — the app has no global Place library,
 * so the same café saved on two Trips is two rows. "Distinct" therefore has to
 * be decided by what the Place is, not by its row id:
 *
 * - a provider POI is identified by provider + providerPlaceId;
 * - a hand-placed pin is identified by CRS + coordinate (4 decimals, about 11 m)
 *   + normalized name;
 * - a placeId whose Place row is missing keeps its own id, which is the old
 *   "distinct placeId" count.
 *
 * Known residue, accepted: the same POI saved once via AMap (GCJ-02) and once via
 * Google (WGS84) is two Places, and an unnamed pin is told apart by coordinate only.
 */
export function placeIdentityKey(placeId: EntityId, place: Place | undefined): string {
  if (place === undefined) return `id:${placeId}`;
  if (place.provider && place.providerPlaceId) {
    return `poi:${place.provider}:${place.providerPlaceId}`;
  }
  const { latitude, longitude, system } = place.coordinate;
  return `pin:${system}:${latitude.toFixed(4)},${longitude.toFixed(4)}:${place.name.trim().toLowerCase()}`;
}

/** Identity keys of every Place the Trip's Items link, Unscheduled included. */
export function distinctPlaceKeys(entry: Pick<HomeRecapTrip, 'items' | 'placesById'>): Set<string> {
  const keys = new Set<string>();
  for (const { placeId } of entry.items) {
    if (placeId === null) continue;
    keys.add(placeIdentityKey(placeId, entry.placesById[placeId]));
  }
  return keys;
}

export function buildHomeRecap(trips: readonly HomeRecapTrip[]): HomeRecap {
  const dates = new Set<string>();
  const places = new Set<string>();
  for (const entry of trips) {
    for (const { date } of entry.days) dates.add(date);
    for (const key of distinctPlaceKeys(entry)) places.add(key);
  }
  return { dayCount: dates.size, placeCount: places.size, tripCount: trips.length };
}
