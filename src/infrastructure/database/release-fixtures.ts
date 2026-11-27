import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day, Trip } from '@/domain/trip/types';
import type { DatabaseRuntime } from './runtime';
import { SqliteDayRepository } from './sqlite/day-repository';
import { SqliteItemRepository } from './sqlite/item-repository';
import { SqlitePlaceRepository } from './sqlite/place-repository';
import { SqliteTripRepository } from './sqlite/trip-repository';

/**
 * M13 release-gate itinerary fixtures (Stage-05 §23): opt-in development
 * data, never seeded during normal app startup. Coordinates are fixture
 * approximations of the named places, provider-native GCJ-02, and are not
 * search results.
 */

export interface ReleaseItineraryFixture {
  key: 'beijing-dense' | 'sample-wide';
  trip: Trip;
  days: Day[];
  places: Place[];
  items: Item[];
}

const timestamp = '2026-03-24T00:00:00.000Z';
const startDate = '2026-03-22';

function makeDay(tripId: string, dayIndex: number): Day {
  const date = new Date(
    `${startDate}T00:00:00Z`,
  );
  date.setUTCDate(date.getUTCDate() + dayIndex - 1);
  return {
    id: `m13-${tripId}-day-${dayIndex}`,
    tripId,
    date: date.toISOString().slice(0, 10),
    dayIndex,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

interface Entry {
  placeName: string;
  /** Fixture GCJ-02 coordinate of the named place. */
  latitude: number;
  longitude: number;
  dayIndex: number;
  /** Exact start time (HH:mm); items without one sort after timed ones. */
  start?: string;
  /** Links a second Item to the same Place (repeated occurrence). */
  repeatAt?: string;
}

function makeItinerary(
  key: ReleaseItineraryFixture['key'],
  title: string,
  region: 'china_mainland',
  dayCount: number,
  entries: Entry[],
): ReleaseItineraryFixture {
  const tripId = `m13-${key}-trip`;
  const trip: Trip = {
    id: tripId,
    title: `M13 — ${title}`,
    startDate,
    endDate: makeDay(tripId, dayCount).date,
    mapRegion: region,
    note: 'M13 release-gate fixture',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const days = Array.from({ length: dayCount }, (_, index) => makeDay(tripId, index + 1));

  const places: Place[] = [];
  const items: Item[] = [];
  for (const [index, entry] of entries.entries()) {
    const placeId = `m13-${key}-place-${index + 1}`;
    places.push({
      id: placeId,
      name: entry.placeName,
      coordinate: { latitude: entry.latitude, longitude: entry.longitude, system: 'gcj02' },
      address: null,
      provider: 'amap',
      providerPlaceId: `B000M13${index + 1}`,
      metadata: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const makeItem = (id: string, start: string | undefined, sortOrder: number): Item => ({
      id,
      tripId,
      dayId: `m13-${tripId}-day-${entry.dayIndex}`,
      placeId,
      type: 'sightseeing',
      title: entry.placeName,
      sortOrder,
      timeMode: start ? 'exact' : 'none',
      startDateTime: start ? `${days[entry.dayIndex - 1].date}T${start}:00` : null,
      endDateTime: null,
      period: null,
      isFixed: false,
      note: null,
      payload: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    items.push(makeItem(`m13-${key}-item-${index + 1}`, entry.start, 0));
    if (entry.repeatAt !== undefined) {
      items.push(makeItem(`m13-${key}-item-${index + 1}-return`, entry.repeatAt, 1));
    }
  }

  // Contiguous per-Day sortOrder in collection order.
  const perDayCount = new Map<string, number>();
  for (const item of items) {
    if (item.dayId === null) continue;
    const count = perDayCount.get(item.dayId) ?? 0;
    item.sortOrder = count;
    perDayCount.set(item.dayId, count + 1);
  }

  return { key, trip, days, places, items };
}

/** Five Places within roughly three kilometres of 天安门. */
const beijingDense = makeItinerary(
  'beijing-dense',
  '北京密集城区',
  'china_mainland',
  2,
  [
    { placeName: '故宫博物院', latitude: 39.9163, longitude: 116.3972, dayIndex: 1, start: '09:00', repeatAt: '15:00' },
    { placeName: '王府井大街', latitude: 39.9097, longitude: 116.4109, dayIndex: 1, start: '11:30' },
    { placeName: '前门大街', latitude: 39.8994, longitude: 116.3980, dayIndex: 1, start: '14:00' },
    { placeName: '景山公园', latitude: 39.9254, longitude: 116.3968, dayIndex: 2, start: '09:30' },
    { placeName: '国家博物馆', latitude: 39.9053, longitude: 116.4014, dayIndex: 2, start: '13:30' },
  ],
);

/** Four Places spread across roughly two degrees of latitude in a sample region. */
const sampleWide = makeItinerary(
  'sample-wide',
  '示例广域',
  'china_mainland',
  4,
  [
    { placeName: '口岸国门', latitude: 39.5980, longitude: 103.3778, dayIndex: 1, start: '10:00' },
    { placeName: '东城纪念园', latitude: 39.2122, longitude: 105.7460, dayIndex: 2, start: '10:00' },
    { placeName: '西谷湿地', latitude: 40.2429, longitude: 106.1900, dayIndex: 3, start: '10:00' },
    { placeName: '林间镇森林公园', latitude: 41.2872, longitude: 106.9953, dayIndex: 4, start: '10:00' },
  ],
);

export const releaseItineraryFixtures: readonly ReleaseItineraryFixture[] = [
  beijingDense,
  sampleWide,
];

/** Install both itineraries atomically; existing complete fixtures are skipped. */
export async function persistReleaseItineraryFixtures(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): Promise<void> {
  await runInExclusiveTransaction(async (database) => {
    const trips = new SqliteTripRepository(database);
    const days = new SqliteDayRepository(database);
    const places = new SqlitePlaceRepository(database);
    const items = new SqliteItemRepository(database);

    for (const fixture of releaseItineraryFixtures) {
      if (await trips.getById(fixture.trip.id)) continue;

      await trips.insert(fixture.trip);
      await days.insertMany(fixture.days);
      for (const place of fixture.places) {
        await places.insert(place);
      }
      for (const item of fixture.items) {
        await items.insert(item);
      }
    }
  });
}
