import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day, Trip } from '@/domain/trip/types';
import { resolveTripMapStack, type TripMapStack } from '@/infrastructure/map/map-provider-policy';
import type { DatabaseRuntime } from './runtime';
import { SqliteDayRepository } from './sqlite/day-repository';
import { SqliteItemRepository } from './sqlite/item-repository';
import { SqlitePlaceRepository } from './sqlite/place-repository';
import { SqliteTripRepository } from './sqlite/trip-repository';

/** Opt-in development fixtures; never called during normal app startup. */
export interface M4MapFixture {
  trip: Trip;
  day: Day;
  place: Place;
  item: Item;
}

export interface PersistedM4MapFixture extends M4MapFixture {
  stack: TripMapStack;
}

const timestamp = '2026-09-12T00:00:00.000Z';
const date = '2026-10-01';

function makeFixture(
  slug: string,
  region: Trip['mapRegion'],
  placeName: string,
  coordinate: Place['coordinate'],
): M4MapFixture {
  const tripId = `m4-fixture-${slug}-trip`;
  const dayId = `m4-fixture-${slug}-day`;
  const placeId = `m4-fixture-${slug}-place`;
  return {
    trip: {
      id: tripId,
      title: `M4 Fixture — ${placeName}`,
      startDate: date,
      endDate: date,
      mapRegion: region,
      note: 'Development map-alignment fixture',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    day: {
      id: dayId,
      tripId,
      date,
      dayIndex: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    place: {
      id: placeId,
      name: placeName,
      coordinate,
      address: null,
      provider: null,
      providerPlaceId: null,
      metadata: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    item: {
      id: `m4-fixture-${slug}-item`,
      tripId,
      dayId,
      placeId,
      type: 'sightseeing',
      title: placeName,
      sortOrder: 0,
      timeMode: 'none',
      startDateTime: null,
      endDateTime: null,
      period: null,
      isFixed: false,
      note: null,
      payload: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

export const m4MapFixtures: readonly M4MapFixture[] = [
  // Google iOS marker example: https://developers.google.com/maps/documentation/ios-sdk/examples/info-window-marker
  makeFixture('global', 'global', 'Sydney marker', {
    latitude: -33.8683,
    longitude: 151.2086,
    system: 'wgs84',
  }),
  // AMap Beijing center: https://lbs.amap.com/api/javascript-api-v2/tutorails/display-a-map
  makeFixture('mainland', 'china_mainland', '天安门中心点', {
    latitude: 39.90923,
    longitude: 116.397428,
    system: 'gcj02',
  }),
];

/** Install both chains atomically; existing complete fixtures are left untouched. */
export async function persistM4MapFixtures(
  runInExclusiveTransaction: DatabaseRuntime['runInExclusiveTransaction'],
): Promise<void> {
  await runInExclusiveTransaction(async (database) => {
    const trips = new SqliteTripRepository(database);
    const days = new SqliteDayRepository(database);
    const places = new SqlitePlaceRepository(database);
    const items = new SqliteItemRepository(database);

    for (const fixture of m4MapFixtures) {
      assertCoordinateSystem(
        fixture.place.coordinate,
        fixture.trip.mapRegion === 'china_mainland' ? 'gcj02' : 'wgs84',
      );

      const [trip, day, place, item] = await Promise.all([
        trips.getById(fixture.trip.id),
        days.getById(fixture.day.id),
        places.getById(fixture.place.id),
        items.getById(fixture.item.id),
      ]);
      const existing = [trip, day, place, item];

      if (existing.every((entity) => entity !== null)) {
        if (
          JSON.stringify(trip) !== JSON.stringify(fixture.trip) ||
          JSON.stringify(day) !== JSON.stringify(fixture.day) ||
          JSON.stringify(place) !== JSON.stringify(fixture.place) ||
          JSON.stringify(item) !== JSON.stringify(fixture.item)
        ) {
          throw new Error(`M4 fixture collision: ${fixture.trip.id}`);
        }
        continue;
      }

      if (existing.some((entity) => entity !== null)) {
        throw new Error(`Incomplete M4 fixture: ${fixture.trip.id}`);
      }

      await trips.insert(fixture.trip);
      await days.insertMany([fixture.day]);
      await places.insert(fixture.place);
      await items.insert(fixture.item);
    }
  });
}

/** Read the saved fixture chains for the M4-T9 native map check. */
export async function readM4MapFixtures(
  runInReadContext: DatabaseRuntime['runInReadContext'],
): Promise<PersistedM4MapFixture[]> {
  return runInReadContext(async (database) => {
    const trips = new SqliteTripRepository(database);
    const days = new SqliteDayRepository(database);
    const places = new SqlitePlaceRepository(database);
    const items = new SqliteItemRepository(database);

    return Promise.all(m4MapFixtures.map(async (fixture) => {
      const [trip, day, place, item] = await Promise.all([
        trips.getById(fixture.trip.id),
        days.getById(fixture.day.id),
        places.getById(fixture.place.id),
        items.getById(fixture.item.id),
      ]);
      if (
        !trip || !day || !place || !item ||
        day.tripId !== trip.id ||
        item.tripId !== trip.id ||
        item.dayId !== day.id ||
        item.placeId !== place.id
      ) {
        throw new Error(`Incomplete M4 map fixture: ${fixture.trip.id}`);
      }
      const stack = resolveTripMapStack(trip);
      assertCoordinateSystem(place.coordinate, stack.coordinateSystem);
      return { trip, day, place, item, stack };
    }));
  });
}
