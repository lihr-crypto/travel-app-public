import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type { Coordinate, EntityId, TravelDate } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day, Trip, TripLifecycle } from '@/domain/trip/types';
import { deriveTripLifecycle } from '@/domain/trip/lifecycle';
import type { MapCameraRequest } from '@/infrastructure/map/map-models';
import {
  getMapPlaceCoordinate,
  getMapPlaceName,
  type MapPlace,
} from './map-place';
import {
  classifyHomeCoordinate,
  planHomeMarkers,
  type HomeMarkerPlan,
} from '@/infrastructure/map/home-map-policy';
import type { HomeMarkerWeight, HomeTripMarker } from './home-markers';
import { buildHomeRecap, distinctPlaceKeys, type HomeRecap } from './home-recap';

/**
 * M10-T1 — the Home Footprint projection.
 *
 * Home is a cross-Trip surface: it answers "where have I been" over the whole
 * Trip collection, so it cannot bind itself to one source coordinate system.
 * It therefore does not go through `assertMapRendererInput` — that seam needs
 * one `system` for the entire marker set. Map coordinates come from the
 * presentation-only MapPlace getter, which validates any local display
 * coordinate while leaving the canonical Place's provider and coordinate intact.
 *
 * Ownership (Stage-05 §19): HomeMap owns the footprint projection, clusters and
 * Trip selection intents. It must never own the canonical Trip collection —
 * this module is pure and reads its input, it does not query or cache.
 */

/** Stage-03 §3.3: no `旅行中` filter in V1. Active Trips appear under 全部. */
export type HomeTripFilter = 'all' | 'planned' | 'completed';

export interface HomeTripData {
  trip: Trip;
  days: readonly Day[];
  items: readonly Item[];
  placesById: Readonly<Record<EntityId, Place>>;
  /** Optional presentation Places, keyed by the canonical Item Place id. */
  mapPlacesById?: Readonly<Record<EntityId, MapPlace>>;
}

export interface HomeMapData {
  trips: readonly HomeTripData[];
}

/**
 * `today` is an argument rather than part of the read model: the query that
 * assembles `HomeMapData` must not read the clock, so lifecycle stays a pure
 * function of its inputs and testable without freezing time.
 */
export interface HomeMapProjectionOptions {
  today: TravelDate;
  /** Stage-03 §3.3: 全部 / 计划中 / 已完成. Defaults to 全部. */
  filter?: HomeTripFilter;
  /**
   * Narrows the Footprint to Trips that start in this calendar year. A Trip is
   * counted in the year it starts, so one that crosses New Year is not split.
   * `null`/absent means 全部年份. A year the current filter has no Trip for is
   * ignored — see {@link HomeMapProjection.year}.
   */
  year?: number | null;
  selectedTripId?: EntityId | null;
  /** Use validated WGS84 MapPlace coordinates for the unified Apple map. */
  appleCoordinates?: boolean;
}

/**
 * Stage-03 §3.5: one marker family, state expressed through visual weight
 * rather than unrelated shapes. The marker and weight types live in
 * `home-markers.ts` because the cluster grouping adds a second marker kind to
 * the same family.
 */
export type { HomeMarkerWeight, HomeMarkerModel, HomeTripMarker } from './home-markers';

/**
 * A Trip as the 我的旅行 list shows it. Deliberately includes Trips with no
 * drawable marker: the list is the direct alternative to navigating by markers
 * (Stage-03 §3.2), so a Trip the CRS plan withheld must still be listed.
 */
export interface HomeTripSummary {
  tripId: EntityId;
  title: string;
  startDate: TravelDate;
  endDate: TravelDate;
  lifecycle: TripLifecycle;
  /** The Trip's own inclusive Day count. */
  dayCount: number;
  /** Distinct Places actually linked by Items — the trip's real footprint. */
  placeCount: number;
}

/**
 * Stage-03 §3.4 — the Active Trip Card's data.
 *
 * `fromLabel`/`toLabel` are the Day's first and last saved Place names, which is
 * what the approved card shows (`Day 3 · 北山 -> 南湾`). V1 has no Leg, so this is
 * a read of the Day's own ordered Items, never a route: a Day with one Place
 * reports `toLabel: null` rather than pretending it travelled somewhere, and a
 * Day with none reports both as null.
 */
export interface HomeActiveTrip {
  tripId: EntityId;
  tripTitle: string;
  /** Today's Day within the Trip. */
  dayId: EntityId;
  dayIndex: number;
  fromLabel: string | null;
  toLabel: string | null;
}

export interface HomeMapProjection {
  filter: HomeTripFilter;
  /**
   * The year filter actually applied: the requested year when the current
   * lifecycle filter has Trips in it and more than one year to choose from,
   * otherwise `null`. A control that is hidden must never leave a filter behind
   * that the user can neither see nor clear.
   */
  year: number | null;
  /** Start years of the Trips the lifecycle filter keeps, newest first. */
  availableYears: readonly number[];
  /** The count line for exactly the Trips `visibleTrips` lists. */
  recap: HomeRecap;
  markers: readonly HomeTripMarker[];
  /** The M10-T0 mixed-CRS decision, carried through for the renderer. */
  plan: HomeMapCoordinatePlan;
  /** Trips the filter excluded; they are not unplaced, just not selected. */
  filteredOutTripIds: readonly EntityId[];
  /** Trips with no map-resolvable Place, including an explicitly unresolved legacy source. */
  unplacedTripIds: readonly EntityId[];
  /** Trips whose anchor was refused by the CRS contract. */
  withheldTripIds: readonly EntityId[];
  cameraRequest: MapCameraRequest | null;
  /**
   * The Trip the camera opens on, when one could be resolved — `null` means the
   * camera follows no Trip (Home has no Trips, or none with a focusable
   * coordinate). Carried so tests and callers can read the decision without
   * reverse-engineering it from the coordinates.
   */
  focusedTripId: EntityId | null;
  /**
   * Every Trip the current filter keeps, in the map's own order. The filter rule
   * lives here and only here, so the sheet cannot drift from the markers.
   */
  visibleTrips: readonly HomeTripSummary[];
  /**
   * The Trip whose inclusive range contains today, if any. Stage-03 §3.4 keeps
   * it visible under `全部` and surfaces it here separately.
   */
  activeTrip: HomeActiveTrip | null;
}

export interface AppleCoordinateHomeMarkerPlan {
  renderer: 'apple';
  displayCrsPolicy: 'apple_wgs84';
  drawable: readonly Coordinate[];
  withheld: readonly [];
  tripsWithheld: readonly [];
}

export type HomeMapCoordinatePlan = HomeMarkerPlan | AppleCoordinateHomeMarkerPlan;

/**
 * Today's Day inside an active Trip, plus the labels the Active Trip Card shows.
 *
 * Deliberately derived from the *unfiltered* Trip set: the Active Trip Card is
 * not a filter result, and Stage-03 §3.3 keeps the active Trip visible under
 * `全部` while the card surfaces it independently of the current filter.
 */
function activeTripFor(
  trips: readonly HomeTripData[],
  today: TravelDate,
): HomeActiveTrip | null {
  const active = trips
    .filter(({ trip }) => deriveTripLifecycle(trip, today) === 'active')
    .sort((left, right) =>
      left.trip.startDate.localeCompare(right.trip.startDate)
      || left.trip.id.localeCompare(right.trip.id),
    )[0];
  if (!active) return null;

  const day = active.days.find((candidate) => candidate.date === today);
  if (!day) return null;

  const places = [...active.items]
    .filter((item) => item.dayId === day.id && item.placeId !== null)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
    .flatMap((item) => {
      const place = active.placesById[item.placeId!];
      return place ? [place.name] : [];
    });

  return {
    dayId: day.id,
    dayIndex: day.dayIndex,
    fromLabel: places[0] ?? null,
    toLabel: places.length > 1 ? places[places.length - 1] : null,
    tripId: active.trip.id,
    tripTitle: active.trip.title,
  };
}

function mapPlaceFor(data: HomeTripData, placeId: EntityId): MapPlace | null {
  const lookup = data.mapPlacesById ?? data.placesById;
  return lookup[placeId] ?? null;
}

const weightByLifecycle: Record<TripLifecycle, HomeMarkerWeight> = {
  completed: 'normal',
  planned: 'weak',
  active: 'emphasized',
};

/** The calendar year a Trip starts in; `TravelDate` is always `YYYY-MM-DD`. */
function tripStartYear(trip: Trip): number {
  return Number.parseInt(trip.startDate.slice(0, 4), 10);
}

function matchesFilter(lifecycle: TripLifecycle, filter: HomeTripFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'planned':
      // An active Trip is not "planned" — Stage-03 §3.3 keeps it in 全部 only.
      return lifecycle === 'planned';
    case 'completed':
      return lifecycle === 'completed';
  }
}

/**
 * The Trip's footprint anchor: the Place of its earliest *scheduled*
 * Place-bearing Item, in itinerary order (Day date, then `sortOrder`). A
 * named Place is chosen over a computed centroid because Stage-03 §3.6 shows a
 * cluster labelled by its location (`北京 · 3 次旅行`), and a centroid has no
 * name. The earliest Place is the Trip's own starting point, which is also the
 * most legible answer to "where was this Trip".
 *
 * A Trip whose Places are all Unscheduled still has a real footprint, so the
 * Unscheduled collection is the fallback rather than a dead end.
 */
function anchorPlace(
  data: HomeTripData,
): { place: MapPlace; item: Item } | null {
  const orderedDays = [...data.days].sort((left, right) =>
    left.date.localeCompare(right.date)
    || left.dayIndex - right.dayIndex
    || left.id.localeCompare(right.id),
  );
  const orderedItems = [...data.items].sort((left, right) =>
    left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
  );
  const dayOrder = new Map(orderedDays.map(({ id }, index) => [id, index]));

  const placeOf = (item: Item): Place | null => {
    if (item.placeId === null) return null;
    return mapPlaceFor(data, item.placeId);
  };

  const scheduled = orderedItems.filter(
    (item) => item.dayId !== null && dayOrder.has(item.dayId),
  );
  scheduled.sort((left, right) =>
    dayOrder.get(left.dayId!)! - dayOrder.get(right.dayId!)!
    || left.sortOrder - right.sortOrder
    || left.id.localeCompare(right.id),
  );

  for (const item of scheduled) {
    const place = placeOf(item);
    if (place) return { item, place };
  }
  for (const item of orderedItems) {
    if (item.dayId !== null) continue;
    const place = placeOf(item);
    if (place) return { item, place };
  }
  return null;
}

/**
 * UX-B (2026-03-25 device pass) — the camera focus rule.
 *
 * Home used to fit every drawable anchor, which at Footprint scale strands the
 * trip that actually matters as an anonymous dot. The map now opens on one
 * Trip, chosen by the current filter:
 *
 * - `全部`: the ongoing Trip's **current Day** (its Places, so the map shows
 *   where the trip is today, not where it started); with no ongoing Trip the
 *   nearest planned one; with none of those the most recent completed one.
 * - `计划中`: the nearest planned Trip.
 * - `已完成`: the most recently finished Trip.
 *
 * A Trip that cannot offer a drawable coordinate — no Places at all, or an
 * anchor the CRS plan refused — is skipped in favour of the next candidate, so
 * the camera never opens on a spot nothing can claim.
 */

interface HomeFocusCandidate {
  tripId: EntityId;
  lifecycle: TripLifecycle;
  startDate: TravelDate;
  endDate: TravelDate;
  /** The Trip anchor's resolved map coordinate; drawability is checked later. */
  anchor: Coordinate | null;
  /**
   * Drawable Places scheduled on today's Day, in itinerary order. Only the
   * active Trip uses these — for every other lifecycle "today" is not inside
   * the Trip, so there is no Day to focus.
   */
  todayCoordinates: readonly Coordinate[];
}

/** Places scheduled on `today`'s Day, drawable under the M10-T0 CRS plan. */
function drawableTodayCoordinates(
  data: HomeTripData,
  today: TravelDate,
  appleCoordinates: boolean,
): Coordinate[] {
  const day = data.days.find((candidate) => candidate.date === today);
  if (!day) return [];

  const orderedItems = [...data.items]
    .filter((item) => item.dayId === day.id && item.placeId !== null)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));

  const coordinates = new Set<Coordinate>();
  for (const item of orderedItems) {
    const place = mapPlaceFor(data, item.placeId!);
    if (!place) continue;
    const coordinate = getMapPlaceCoordinate(place);
    const drawable = appleCoordinates
      ? coordinate.system === 'wgs84'
      : classifyHomeCoordinate(data.trip.id, coordinate) === null;
    if (drawable) {
      coordinates.add(coordinate);
    }
  }
  return [...coordinates];
}

/**
 * The candidates in focus priority for one filter. Every Trip appears exactly
 * once — the lifecycles partition the collection — so when any marker exists,
 * some candidate can always resolve the camera.
 */
function focusCandidates(
  pool: readonly HomeFocusCandidate[],
  filter: HomeTripFilter,
): readonly HomeFocusCandidate[] {
  const byStartAsc = (left: HomeFocusCandidate, right: HomeFocusCandidate) =>
    left.startDate.localeCompare(right.startDate) || left.tripId.localeCompare(right.tripId);
  const active = pool.filter(({ lifecycle }) => lifecycle === 'active').sort(byStartAsc)[0] ?? null;
  const planned = pool.filter(({ lifecycle }) => lifecycle === 'planned').sort(byStartAsc);
  // "Most recent" is the Trip that finished last, not the one that started last.
  const completed = pool
    .filter(({ lifecycle }) => lifecycle === 'completed')
    .sort((left, right) =>
      right.endDate.localeCompare(left.endDate)
      || right.startDate.localeCompare(left.startDate)
      || left.tripId.localeCompare(right.tripId));

  switch (filter) {
    case 'all':
      return [...(active ? [active] : []), ...planned, ...completed];
    case 'planned':
      return planned;
    case 'completed':
      return completed;
  }
}

/** The coordinates the chosen Trip focuses the camera on, empty when it has none. */
function focusCoordinatesFor(
  candidate: HomeFocusCandidate,
  withheldTrips: ReadonlySet<EntityId>,
): readonly Coordinate[] {
  const anchor = candidate.anchor !== null && !withheldTrips.has(candidate.tripId)
    ? [candidate.anchor]
    : [];
  if (candidate.lifecycle === 'active' && candidate.todayCoordinates.length > 0) {
    return candidate.todayCoordinates;
  }
  return anchor;
}

export function buildHomeMapProjection(
  data: HomeMapData,
  options: HomeMapProjectionOptions,
): HomeMapProjection {
  const {
    today,
    filter = 'all',
    year: requestedYear = null,
    selectedTripId = null,
    appleCoordinates = false,
  } = options;
  const seenTripIds = new Set<EntityId>();
  const candidates: { data: HomeTripData; anchor: { place: Place; item: Item }; lifecycle: TripLifecycle }[] = [];
  const visibleTrips: HomeTripSummary[] = [];
  const visibleEntries: HomeTripData[] = [];
  const filteredOutTripIds: EntityId[] = [];
  const unplacedTripIds: EntityId[] = [];
  /** The camera-focus pool covers every Trip in the year, whatever the lifecycle filter keeps. */
  const focusPool: HomeFocusCandidate[] = [];

  const orderedTrips = [...data.trips].sort((left, right) =>
    left.trip.startDate.localeCompare(right.trip.startDate)
    || left.trip.id.localeCompare(right.trip.id),
  );

  /*
   * The years on offer come from the Trips the lifecycle filter keeps, so the
   * year row never lists a year that would show an empty list. With a single
   * year there is nothing to choose, so no year filter applies at all.
   */
  const availableYears = [...new Set(
    orderedTrips
      .filter(({ trip }) => matchesFilter(deriveTripLifecycle(trip, today), filter))
      .map(({ trip }) => tripStartYear(trip)),
  )].sort((left, right) => right - left);
  const year = requestedYear !== null
    && availableYears.length > 1
    && availableYears.includes(requestedYear)
    ? requestedYear
    : null;

  if (appleCoordinates) {
    for (const entry of orderedTrips) {
      if (entry.mapPlacesById === undefined) {
        throw new RangeError(`Home Apple map lookup is missing for Trip: ${entry.trip.id}`);
      }
      for (const place of Object.values(entry.mapPlacesById)) {
        assertCoordinateSystem(getMapPlaceCoordinate(place), 'wgs84');
      }
    }
  }

  for (const entry of orderedTrips) {
    const tripId = entry.trip.id;
    if (seenTripIds.has(tripId)) {
      throw new RangeError(`Duplicate Home Trip: ${tripId}`);
    }
    seenTripIds.add(tripId);

    for (const day of entry.days) {
      if (day.tripId !== tripId) {
        throw new RangeError(`Home Day belongs to another Trip: ${day.id}`);
      }
    }
    for (const item of entry.items) {
      if (item.tripId !== tripId) {
        throw new RangeError(`Home Item belongs to another Trip: ${item.id}`);
      }
    }

    const lifecycle = deriveTripLifecycle(entry.trip, today);
    const anchor = anchorPlace(entry);
    const inYear = year === null || tripStartYear(entry.trip) === year;
    /*
     * The pool is every Trip the *year* keeps — the lifecycle priority below
     * still picks within it. A pool that ignored the year would aim the camera
     * at a Trip whose marker this projection does not draw.
     */
    if (inYear) {
      focusPool.push({
        anchor: anchor ? getMapPlaceCoordinate(anchor.place) : null,
        endDate: entry.trip.endDate,
        lifecycle,
        startDate: entry.trip.startDate,
        todayCoordinates: drawableTodayCoordinates(entry, today, appleCoordinates),
        tripId,
      });
    }
    if (!matchesFilter(lifecycle, filter) || !inYear) {
      filteredOutTripIds.push(tripId);
      continue;
    }

    visibleEntries.push(entry);
    visibleTrips.push({
      dayCount: entry.days.length,
      endDate: entry.trip.endDate,
      lifecycle,
      placeCount: distinctPlaceKeys(entry).size,
      startDate: entry.trip.startDate,
      title: entry.trip.title,
      tripId,
    });

    if (anchor === null) {
      unplacedTripIds.push(tripId);
      continue;
    }
    candidates.push({ anchor, data: entry, lifecycle });
  }

  const plan: HomeMapCoordinatePlan = appleCoordinates
    ? {
      renderer: 'apple',
      displayCrsPolicy: 'apple_wgs84',
      drawable: candidates.map(({ anchor }) => getMapPlaceCoordinate(anchor.place)),
      withheld: [],
      tripsWithheld: [],
    }
    : planHomeMarkers(
      candidates.map(({ anchor, data: entry }) => ({
        coordinate: getMapPlaceCoordinate(anchor.place),
        tripId: entry.trip.id,
      })),
    );
  const withheldTripIds = plan.withheld.map(({ tripId }) => tripId);
  const withheld = new Set(withheldTripIds);
  const drawable = candidates.filter(({ data: entry }) => !withheld.has(entry.trip.id));

  /*
   * `plan.drawable` holds the same coordinate objects that went in, in the same
   * order, minus the refused ones — and `drawable` filters `candidates` in that
   * same order. So index `i` of each refers to the same Trip, and the marker's
   * coordinate is passed through untouched. That is the M10-T0 identity
   * conversion being *consumed*, not re-implemented here.
   */
  const markers: HomeTripMarker[] = drawable.map(({ anchor, data: entry, lifecycle }, index) => {
    const tripId = entry.trip.id;
    return {
      id: tripId,
      coordinate: plan.drawable[index],
      label: getMapPlaceName(anchor.place),
      tripId,
      tripTitle: entry.trip.title,
      lifecycle,
      weight: weightByLifecycle[lifecycle],
      variant: tripId === selectedTripId ? 'selected' : 'normal',
    };
  });

  /*
   * The focus chain partitions the candidate set (every lifecycle appears
   * exactly once), so when any marker exists some candidate resolves the
   * camera — there is deliberately no "fit everything" fallback behind it.
   */
  let focusedTripId: EntityId | null = null;
  let focusCoordinates: readonly Coordinate[] | null = null;
  for (const candidate of focusCandidates(focusPool, filter)) {
    const coordinates = focusCoordinatesFor(candidate, withheld);
    if (coordinates.length > 0) {
      focusedTripId = candidate.tripId;
      focusCoordinates = coordinates;
      break;
    }
  }

  return {
    activeTrip: activeTripFor(data.trips, today),
    cameraRequest: focusCoordinates ? { coordinates: focusCoordinates } : null,
    availableYears,
    filter,
    focusedTripId,
    filteredOutTripIds,
    markers,
    plan,
    recap: buildHomeRecap(visibleEntries),
    unplacedTripIds,
    visibleTrips,
    withheldTripIds,
    year,
  };
}
