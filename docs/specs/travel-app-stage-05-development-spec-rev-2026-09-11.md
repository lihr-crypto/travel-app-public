# Travel App --- Stage 05: Development Specification

> Status: Final\
> Scope: Codex-executable development contract derived from Stage
> 01--04\
> Execution mode: **Architecture-constrained autonomy (B)**\
> Depends on: Stage 01 Product Foundation, Stage 02 V1 Flow & Product
> Semantics, Stage 03 UI / Interaction Specification, Stage 04 Technical
> Architecture & Implementation Plan\
> Next: Stage 06 Final Engineering Review & Execution Backlog

------------------------------------------------------------------------

> **Stage 06 map amendment (2026-09-11):** V1 is iOS-only. Mainland-China Trip sessions use AMap for both rendering and place search; Trip sessions outside mainland China use Google Maps + Google Places. This supersedes the earlier single `react-native-maps` renderer baseline where conflicting.

> **Product realignment amendment (2026-09-11, user-approved):** The V1 product goal has been re-confirmed as **personal travel-plan storage organized by Day and ordered Items**. Home remains map-centered as a travel-footprint/Trip-entry surface. Inside a Trip, the **Timeline / ordered itinerary is the primary planning and browsing view**, while the map is a synchronized **spatial projection** of saved Places. The app does **not** plan routes, choose route alternatives, recommend places, or replace AMap / Google Maps / Xiaohongshu-style discovery. Any earlier wording that makes Trip planning itself “map-first”, treats a Trip/Day as a route, requires Day anchors/routes, or implies automatic routing is superseded by this amendment. No M0 rollback is required.

# 0. Stage 05 Objective

Stage 05 does not redesign the product or reopen architecture choices.

Stage 01--04 already established:

-   Home is map-centered; inside a Trip, the ordered Timeline is the primary planning/browsing projection and the map is a synchronized Place-only spatial projection;
-   the core hierarchy is `Trip → Day → Ordered Item → Place?`; ordinary adjacency is not persisted;
-   V1 is personal-first, local-first, manually planned, and
    intentionally conservative about cloud/backend complexity;
-   Map and Timeline are two projections of one itinerary model;
-   SQLite is the durable business source of truth;
-   application mutations go through semantic Application Commands;
-   TanStack Query orchestrates reads/cache;
-   Zustand stores cross-component interaction state only;
-   route automation, cloud sync, AI, collaboration, Wishlist, budget,
    weather, ticketing and similar features are deferred beyond V1.

The goal of Stage 05 is to translate those settled decisions into a
concrete development contract that Codex or another coding agent can
execute without being given freedom to redesign the architecture.

The operating principle is:

``` text
Product semantics + Architecture + Contracts
                 ↓
            fixed by docs

Local implementation details
                 ↓
         agent may decide
```

Codex may choose local helper names, function decomposition and internal
implementation details when they do not alter the contracts in this
document.

Codex must not reinterpret product semantics, introduce parallel state
models, bypass application commands, or add deferred V2 capabilities.

------------------------------------------------------------------------

# 1. Agent Autonomy Model

Stage 05 uses **B --- Architecture-Constrained Autonomy**.

The specification locks:

1.  repository / directory boundaries;
2.  canonical TypeScript domain contracts;
3.  SQLite Migration 001 shape and invariants;
4.  repository interfaces;
5.  application command boundaries and semantic inputs;
6.  transaction boundaries;
7.  query-key and invalidation rules;
8.  shared read models and projections;
9.  navigation contract;
10. component ownership;
11. milestone order;
12. Codex task granularity;
13. testing obligations;
14. root `AGENTS.md` guardrails;
15. Definition of Done.

The specification does **not** lock:

-   exact line numbers;
-   internal helper implementation;
-   every local variable name;
-   arbitrary file splitting inside an already-approved module;
-   low-level animation details that do not affect behavior;
-   cosmetic design-system work not required by current milestones.

Do not build a full enterprise Clean Architecture framework, CQRS
framework, Command Bus, event sourcing system, generic
dependency-injection container, or generalized plugin architecture.

The practical V1 boundaries remain:

``` text
UI / Features
     ↓
Application Commands / Queries
     ↓
Domain + Repository Interfaces
     ↓
Infrastructure Implementations
     ↓
SQLite / Providers
```

------------------------------------------------------------------------

# 2. Final Repository Structure

The following structure is the baseline. Small local deviations are
allowed only when they preserve the same ownership and dependency
boundaries.

``` text
travel-app/
├── app/
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── trip/
│   │   └── [tripId].tsx
│   └── item/
│       └── [itemId].tsx
│
├── src/
│   ├── domain/
│   │   ├── trip.ts
│   │   ├── day.ts
│   │   ├── item.ts
│   │   ├── place.ts
│   │   ├── leg.ts
│   │   ├── validation.ts
│   │   └── coordinate.ts
│   │
│   ├── application/
│   │   ├── trip/
│   │   │   ├── createTrip.ts
│   │   │   ├── updateTripDetails.ts
│   │   │   ├── changeTripDateRange.ts
│   │   │   └── deleteTrip.ts
│   │   │
│   │   ├── item/
│   │   │   ├── addItem.ts
│   │   │   ├── updateItemDetails.ts
│   │   │   ├── moveItemToDay.ts
│   │   │   ├── moveItemToUnscheduled.ts
│   │   │   ├── reorderItem.ts
│   │   │   ├── deleteItem.ts
│   │   │   └── restoreDeletedItem.ts
│   │   │
│   │   ├── leg/
│   │   │
│   │   ├── validation/
│   │   │   └── validateTrip.ts
│   │   │
│   │   └── queries/
│   │       ├── tripQueries.ts
│   │       ├── dayQueries.ts
│   │       └── queryKeys.ts
│   │
│   ├── repositories/
│   │   ├── TripRepository.ts
│   │   ├── DayRepository.ts
│   │   ├── ItemRepository.ts
│   │   ├── PlaceRepository.ts
│   │
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── database.ts
│   │   │   ├── transaction.ts
│   │   │   ├── migrations/
│   │   │   │   └── 001_initial.sql
│   │   │   └── sqlite/
│   │   │       ├── SqliteTripRepository.ts
│   │   │       ├── SqliteDayRepository.ts
│   │   │       ├── SqliteItemRepository.ts
│   │   │       ├── SqlitePlaceRepository.ts
│   │   │
│   │   ├── map/
│   │   │   ├── MapRenderer.ts
│   │   │   ├── GoogleMapRenderer.ts
│   │   │   ├── AmapMapRenderer.ts
│   │   │   ├── mapProviderPolicy.ts
│   │   │   └── mapModels.ts
│   │   │
│   │   ├── place/
│   │   │   ├── PlaceProvider.ts
│   │   │   ├── AmapPlaceProvider.ts
│   │   │   └── GooglePlaceProvider.ts
│   │   │
│   │   └── route/
│   │
│   ├── projections/
│   │   ├── buildDayViewData.ts
│   │   ├── buildDayMapProjection.ts
│   │   ├── buildTimelineProjection.ts
│   │   ├── buildTripOverviewProjection.ts
│   │   └── buildHomeMapProjection.ts
│   │
│   ├── state/
│   │   ├── tripMapStore.ts
│   │   └── uiEffects.ts
│   │
│   ├── features/
│   │   ├── home-map/
│   │   ├── trip-map/
│   │   ├── timeline/
│   │   ├── add-item/
│   │   ├── place-search/
│   │   ├── map-picker/
│   │   ├── quick-edit/
│   │   ├── item-detail/
│   │   └── validation/
│   │
│   ├── components/
│   └── shared/
│
├── tests/
├── AGENTS.md
└── README.md
```

Notes:

-   The exact navigation library is not re-selected in Stage 05. Stage
    04 specifies React Native navigation conceptually; the chosen
    implementation must preserve the Navigation Contract below.
-   UI modules must not execute raw SQL.
-   V1 targets iOS only. `GoogleMapRenderer` may use `react-native-maps` with `PROVIDER_GOOGLE`; `AmapMapRenderer` is a thin Expo native view/module around the official AMap iOS SDK. Once AMap native code enters the build, map development uses an Expo Development Build rather than Expo Go.
-   UI modules must not mutate repositories directly for business
    operations.
-   Infrastructure may import Application/Domain interfaces; Domain must
    not import React, Expo, Zustand, SQLite or AMap.

------------------------------------------------------------------------

# 3. Core TypeScript Domain Contract

## 3.1 Common Types

``` ts
export type EntityId = string;

export type TravelDate = string;      // YYYY-MM-DD
export type IsoTimestamp = string;    // UTC ISO 8601

export type CoordinateSystem =
  | "wgs84"
  | "gcj02";

export interface Coordinate {
  latitude: number;
  longitude: number;
  system: CoordinateSystem;
}
```

Rule:

> Coordinates are never passed as naked latitude/longitude values when
> they cross meaningful architecture boundaries. CRS is first-class.

Do not silently mix WGS84 and GCJ-02.

------------------------------------------------------------------------

## 3.2 Trip

```ts
export type TripMapRegion = "china_mainland" | "global";

export interface Trip {
  id: EntityId;
  title: string;
  startDate: TravelDate;
  endDate: TravelDate;
  mapRegion: TripMapRegion;
  note: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export type TripLifecycle = "planned" | "active" | "completed";
```

`TripLifecycle` is derived from dates; `mapRegion` is persisted product state and never changes because the phone moves or the map pans.

## 3.3 Day

``` ts
export interface Day {
  id: EntityId;
  tripId: EntityId;
  date: TravelDate;
  dayIndex: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}
```

Rules:

-   Days are derived from Trip date range.
-   Days are persisted to preserve stable IDs and foreign keys.
-   There is no public generic `deleteDay()` business command.
-   Day reconciliation occurs through `changeTripDateRange()`.

------------------------------------------------------------------------

## 3.4 Item

```ts
export type ItemType =
  | "sightseeing"
  | "food"
  | "hotel"
  | "activity"
  | "transport"
  | "custom";

export type TimeMode = "none" | "period" | "exact";

export type DayPeriod =
  | "morning"
  | "afternoon"
  | "evening"
  | "night";

export type TravelLocalDateTime = string; // YYYY-MM-DDTHH:mm

export interface Item {
  id: EntityId;
  tripId: EntityId;
  dayId: EntityId | null;
  placeId: EntityId | null;
  type: ItemType;
  title: string;
  sortOrder: number;
  timeMode: TimeMode;
  startDateTime: TravelLocalDateTime | null;
  endDateTime: TravelLocalDateTime | null;
  period: DayPeriod | null;
  isFixed: boolean;
  note: string | null;
  payload: ItemPayload | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}
```

Rules:

```text
dayId = null → Unscheduled
none   → start/end null, period null
period → start/end null, period non-null
exact  → start non-null, end optional, period null
```

`sortOrder` is the canonical sequence truth. Structural fields (`tripId/dayId/sortOrder`) change only through semantic commands.

## 3.5 Item Payload

Common fields remain normalized. Sparse type-specific fields live in `payload_json`.

```ts
export type ItemPayload = HotelPayload | TransportPayload | null;

export interface HotelPayload {
  kind: "hotel";
}

export interface TransportPayload {
  kind: "transport";
  mode?: string;
  serviceNumber?: string;
  origin?: string;
  destination?: string;
}
```

Rules:

- Hotel is one cross-day Item; its time uses common `startDateTime/endDateTime`.
- Intermediate days derive Hotel Context.
- Transport Item represents a separately planned/booked/timed movement event; its departure/arrival also use the common interval.
- Do not duplicate canonical timestamps inside payload.
- Do not introduce `GenericPayload` as an arbitrary-data escape hatch in V1.

## 3.6 Place

``` ts
export interface Place {
  id: EntityId;
  name: string;

  coordinate: Coordinate;

  address: string | null;

  provider: string | null;
  providerPlaceId: string | null;

  metadata: Record<string, unknown> | null;

  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}
```

Rules:

-   Place is stored as a local snapshot after explicit user
    confirmation.
-   Custom/map-picked Places may have no provider information.
-   Do not automatically merge Place records solely because
    `providerPlaceId` matches.
-   Repeated visits remain independent at Item level.
-   V1 has no global user-facing Place Library.

------------------------------------------------------------------------

## 3.7 Leg

V1 has **no Leg domain type**.

Item adjacency is derived from `sortOrder` when needed for display semantics. No user metadata is attached to ordinary adjacency.

Do not create Leg persistence, repository, reconciliation, UI, polyline, RouteProvider or future-AI Leg tools in V1.

# 4. SQLite Migration 001 Contract

V1 canonical persisted business tables:

```text
trips
days
places
items
```

Infrastructure:

```text
schema_migrations
```

Do not create `legs`, `validation_issues`, `unscheduled_items`, or `trip_status` tables.

Representative Migration 001:

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  map_region TEXT NOT NULL CHECK (map_region IN ('china_mainland','global')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE days (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  date TEXT NOT NULL,
  day_index INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  UNIQUE (trip_id, date),
  UNIQUE (trip_id, day_index)
);

CREATE TABLE places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  coordinate_system TEXT NOT NULL,
  address TEXT,
  provider TEXT,
  provider_place_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  day_id TEXT,
  place_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  time_mode TEXT NOT NULL,
  start_datetime TEXT,
  end_datetime TEXT,
  period TEXT,
  is_fixed INTEGER NOT NULL,
  note TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (day_id) REFERENCES days(id) ON DELETE SET NULL,
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL
);
```

Domain-layer validation enforces:

```text
map_region ∈ {china_mainland, global}
period ∈ {morning, afternoon, evening, night}
time-mode field consistency
```

If a disposable local database already used an older initial migration during M0, correct Migration 001 and rebuild before M0 exit. If non-disposable data unexpectedly exists, add a forward migration rather than destructive rollback.

# 5. Repository Interfaces

Canonical V1 repositories:

```ts
interface TripRepository { /* Trip persistence/query methods */ }
interface DayRepository { /* Day persistence/query methods */ }
interface ItemRepository { /* ordered Item persistence/query methods */ }
interface PlaceRepository { /* saved Place snapshot persistence/query methods */ }
```

There is no `LegRepository` in V1.

Repositories are persistence abstractions; UI never executes raw SQL. Commands receive only the repository capabilities they actually need.

# 6. Transaction Contract

Semantic multi-write commands run in one exclusive SQLite transaction.

Conceptual context:

```ts
interface TransactionContext {
  trips: TripRepository;
  days: DayRepository;
  items: ItemRepository;
  places: PlaceRepository;
}
```

Commands depend on capability-shaped subsets, e.g.:

```ts
type CreateTripTx = Pick<TransactionContext, "trips" | "days">;
type ItemMutationTx = Pick<TransactionContext, "days" | "items">;
```

The concrete adapter uses the exclusive transaction API so unrelated async queries cannot join the semantic write transaction.

UI must never access the SQLite handle directly.

# 7. Command Result Contract

Use a lightweight consistent result shape.

``` ts
export type CommandResult<T> = {
  data: T;
  affectedEntityIds: EntityId[];
  validationIssues: ValidationIssue[];
};
```

This is not a Command Bus.

It is simply a stable contract usable by:

``` text
Human UI
Tests
future AI tools
```

Invalid command input must still throw/return an explicit failure rather
than being disguised as a ValidationIssue.

Example distinction:

``` text
endDate < startDate
→ reject command

fixed-time overlap
→ mutation may succeed
→ return ValidationIssue
```

------------------------------------------------------------------------

# 8. Application Command Contract

## 8.1 Trip Commands

### createTrip

``` ts
export type CreateTripInput = {
  title: string;
  startDate: TravelDate;
  endDate: TravelDate;
  mapRegion: TripMapRegion;
  note?: string;
};

export async function createTrip(
  input: CreateTripInput
): Promise<CommandResult<Trip>>;
```

Behavior:

``` text
validate input
↓
create Trip
↓
derive inclusive Day range
↓
transaction
  insert Trip
  insert Days
↓
validate Trip
↓
commit
```

Must reject invalid date range.

------------------------------------------------------------------------

### updateTripDetails

``` ts
export type UpdateTripDetailsInput = {
  tripId: EntityId;
  title?: string;
  note?: string | null;
};
```

Must not update Trip dates.

------------------------------------------------------------------------

### changeTripDateRange

```ts
type ChangeTripDateRangeStrategy = "shiftItems" | "keepCalendarDates";

changeTripDateRange(input: {
  tripId: EntityId;
  startDate: TravelDate;
  endDate: TravelDate;
  strategy: ChangeTripDateRangeStrategy;
}): Promise<CommandResult<void>>;
```

Semantics:

- `shiftItems`: when moving the whole Trip by the same length, shift dated Item intervals by the same calendar-day delta.
- `keepCalendarDates`: keep Item calendar dates, reconcile Days to the new Trip range.
- when shortening a Trip, never silently delete Items; affected Items become Unscheduled and retain their time values, with validation warnings if needed.

### deleteTrip

Deletes the Trip and its owned Day/Item graph according to database cascade semantics.

------------------------------------------------------------------------

## 8.2 Item Commands

V1 commands:

``` text
addItem()
updateItemDetails()
moveItemToDay()
moveItemToUnscheduled()
reorderItem()
deleteItem()
restoreDeletedItem()
```

------------------------------------------------------------------------

### addItem

``` ts
export type NewPlaceInput = {
  name: string;
  coordinate: Coordinate;
  address?: string | null;
  provider?: string | null;
  providerPlaceId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AddItemInput = {
  tripId: EntityId;
  dayId: EntityId | null;

  title: string;
  type: ItemType;

  place?:
    | { type: "existing"; placeId: EntityId }
    | { type: "snapshot"; place: NewPlaceInput }
    | null;

  timeMode?: TimeMode;
  startDateTime?: TravelLocalDateTime | null;
  endDateTime?: TravelLocalDateTime | null;
  period?: DayPeriod | null;

  isFixed?: boolean;
  note?: string | null;
  payload?: ItemPayload | null;
};
```

Provider flow:

``` text
PlaceProvider.search()
↓
transient candidate
↓
Place Preview
↓
explicit user confirmation
↓
neutral NewPlaceInput
↓
addItem()
↓
transaction
  create Place snapshot if needed
  create Item
  reconcile affected Legs
  validate
↓
commit
```

Search result selection must not automatically create database records.

------------------------------------------------------------------------

### updateItemDetails

May update:

``` text
title
type
time fields
isFixed
note
type-specific payload
Place association when performed through an explicit supported edit flow
```

Must not generically patch:

``` text
tripId
dayId
sortOrder
```

------------------------------------------------------------------------

## 8.3 Relative Position Contract

``` ts
export type ItemPosition =
  | { type: "start" }
  | { type: "end" }
  | { type: "before"; itemId: EntityId }
  | { type: "after"; itemId: EntityId };
```

Do not expose raw `sortOrder` as the primary semantic input.

------------------------------------------------------------------------

### moveItemToDay

``` ts
export type MoveItemToDayInput = {
  itemId: EntityId;
  targetDayId: EntityId;
  position?: ItemPosition;
};
```

Behavior:

``` text
validate source Item
validate target Day
validate same Trip
↓
move Item
↓
reindex source collection
reindex target collection
↓
reconcile source Legs
reconcile target Legs
↓
validate Trip
↓
commit
```

------------------------------------------------------------------------

### moveItemToUnscheduled

Explicit business operation. `dayId` becomes `null`, Unscheduled
sequence is reindexed, source Day Legs are reconciled.

------------------------------------------------------------------------

### reorderItem

``` ts
export type ReorderItemInput = {
  itemId: EntityId;
  position: ItemPosition;
};
```

Application computes final sequential integer order:

``` text
0
1
2
3
...
```

------------------------------------------------------------------------

# 9. Delete + Undo Contract

User-visible permanent Item Delete is not shipped before M11, when Undo/restore is implemented.

Canonical snapshot:

```ts
export type DeletedItemSnapshot = {
  item: Item;
  previousItemId: EntityId | null;
  nextItemId: EntityId | null;
};
```

Do not include Place or Leg data in the snapshot.

Restore:

```text
insert Item
→ restore Day/Unscheduled ownership
→ restore relative position as closely as possible
→ reindex Item collection
→ validate in the active transaction
→ commit
→ invalidate affected read models
```

An internal delete command may exist earlier for tests, but no destructive user-facing action is exposed until Undo exists.

# 10. Leg Reconciliation Contract

Not applicable in V1. There is no Leg entity or reconciliation contract.

Structural Item mutations only reindex affected Item collections and invalidate projections.

# 11. Validation Contract

Initial V1 issue types:

``` text
ITEM_OUTSIDE_TRIP_RANGE
END_BEFORE_START
FIXED_ITEM_TIME_CONFLICT
HOTEL_CHECKOUT_BEFORE_CHECKIN
```

Validation is computed:

``` ts
validateTrip(tripId)
```

Validation must not automatically mutate business data.

Model distinction:

``` text
invalid command input
→ reject

valid mutation with warning
→ commit + ValidationIssue[]
```

ValidationIssue remains derived and is not canonical persisted state in
V1.

------------------------------------------------------------------------

# 12. Query Keys

TanStack Query owns read/cache orchestration only.

Query keys must represent business read models, not UI components.

``` ts
export const tripKeys = {
  all: ["trips"] as const,

  detail: (tripId: EntityId) =>
    ["trips", tripId] as const,

  days: (tripId: EntityId) =>
    ["trips", tripId, "days"] as const,

  overview: (tripId: EntityId) =>
    ["trips", tripId, "overview"] as const,
};

export const dayKeys = {
  view: (dayId: EntityId) =>
    ["days", dayId, "view"] as const,
};

export const unscheduledKeys = {
  byTrip: (tripId: EntityId) =>
    ["trips", tripId, "unscheduled"] as const,
};
```

Avoid UI-specific canonical keys such as:

``` text
["TripMapItems"]
["TimelineItems"]
```

Map and Timeline must not establish parallel business read paths.

------------------------------------------------------------------------

# 13. Shared Read Models

Build shared read models once, then derive Timeline and Map projections so they cannot drift.

```ts
type DayViewData = {
  trip: Trip;
  day: Day;
  items: Item[];          // complete ordered Timeline
  placesById: Record<EntityId, Place>;
  hotelContext?: unknown;
};

type TripOverviewData = {
  trip: Trip;
  days: Day[];
  scheduledItems: Item[];
  placesById: Record<EntityId, Place>;
  unscheduledItems: Item[];
};
```

Derived outputs:

```text
buildTimelineProjection(DayViewData)
buildDayMapProjection(DayViewData)
buildTripOverviewProjection(TripOverviewData)
```

No read model contains canonical duplicated Item collections in Zustand.

# 14. Map Presentation Contract

`MapRenderer` consumes neutral visual primitives.

```ts
export type MapMarkerModel = {
  id: EntityId;                 // Day View: Item occurrence ID
  coordinate: Coordinate;
  ordinal?: number;
  label?: string;
  variant: "normal" | "selected" | "unscheduled" | "cluster";
  sourceItemIds?: EntityId[];   // Overview cluster/repeated occurrence resolution
};
```

Required renderer behavior:

```text
render markers
marker press
map press
fit coordinates / camera focus
camera/viewport events needed by Map Picker
```

No V1 renderer contract requires polylines.

DayMapProjection acceptance:

- only current-Day Items with Place appear;
- marker `id` = Item occurrence ID;
- ordinals are continuous among Place-bearing Items following canonical `sortOrder`;
- Place-less Items create no Marker and no numbering gap;
- other Days are hidden by default;
- selected Item uses selected variant;
- coordinates retain CRS.

TripOverviewProjection acceptance:

- shows Trip-wide scheduled Place distribution / clusters;
- no Day anchors, D1/D2/D3 sequence or routes;
- aggregate markers retain underlying Item occurrence IDs;
- repeated Place can open occurrence Preview;
- Unscheduled markers are unnumbered and obey density/toggle rules.

# 15. Interaction State Contract

## 15.1 TripFocus

``` ts
export type TripFocus =
  | { type: "overview" }
  | { type: "day"; dayId: EntityId }
  | {
      type: "item";
      itemId: EntityId;
      dayId: EntityId | null;
    }
  | { type: "unscheduled" };
```

Use one discriminated union rather than multiple nullable selection
fields.

------------------------------------------------------------------------

## 15.2 Zustand Boundary

``` ts
export interface TripMapState {
  tripId: EntityId | null;
  focus: TripFocus;

  sheetSnap:
    | "collapsed"
    | "half"
    | "expanded";

  editingItemId: EntityId | null;
  mapPickerMode: boolean;

  undo?: UndoState;
}
```

Zustand may contain:

``` text
TripFocus
sheet state
editing context
map picker mode
temporary Undo
```

Zustand must not contain canonical:

``` text
Trip[]
Day[]
Item[]
Place[]
```

Persistent business truth belongs to SQLite.

------------------------------------------------------------------------

# 16. State vs One-Shot Effects

Durable interaction state:

``` text
TripFocus
sheetSnap
editingItemId
```

One-shot effects:

``` text
FocusMapOnItem
FitDayOnMap
FitTripOnMap
ScrollTimelineToItem
ShowUndoSnackbar
OpenQuickEdit
```

Selection example:

``` text
Timeline Item tap
↓
selectItem(itemId)
↓
TripFocus = item
↓
emit FocusMapOnItem
↓
ensureSheetAtLeast("half")
```

Do not permanently bind camera position to the selected Item.

After a one-shot camera movement the user may freely pan the map.

------------------------------------------------------------------------

# 17. Query Invalidation Contract

Avoid global indiscriminate invalidation when the affected read models
are known.

## Item detail mutation

Example:

``` text
updateItemDetails()
```

Invalidate:

``` text
dayKeys.view(dayId)
tripKeys.overview(tripId)
```

## Structural Item mutation

Examples:

``` text
add
delete
restore
move
reorder
```

Invalidate as applicable:

``` text
source DayView
target DayView
Unscheduled by Trip
Trip Overview
```

## Trip date mutation

Invalidate:

``` text
trip detail
trip days
trip overview
affected DayViews
unscheduled by Trip
```

## Trip create/delete

Invalidate:

``` text
tripKeys.all
```

A simple helper is sufficient. Do not create a generalized invalidation
framework without a current need.

------------------------------------------------------------------------

# 18. Navigation Contract

V1 top-level navigation model:

``` text
Home
 │
 └── TripMap(tripId, entryIntent)
       │
       └── ItemDetail(itemId)
```

Entry intent:

``` ts
export type TripEntryIntent =
  | { type: "overview" }
  | { type: "today" };
```

Semantics:

``` text
normal Trip open
→ Overview

Active Trip "Continue Today"
→ Today Day Mode
```

The following are not independent top-level routes:

``` text
Trip Summary
Day Timeline
Unscheduled
Place Search
Place Preview
Quick Edit
Validation
Map Picker
```

They remain TripMap-local Sheet / interaction states.

Full Item Detail is an independent screen or modal screen.

Back priority:

``` text
1. Context Menu / Modal
2. Add Item Flow
3. Quick Edit
4. Map Picker
5. TripFocus Item
6. TripFocus Day / Unscheduled
7. Trip Overview
8. Home
```

Do not create a second full navigation stack inside the Bottom Sheet.

------------------------------------------------------------------------

# 19. Component Ownership Contract

  ----------------------------------------------------------------------------
  Module                  Owns                       Must not own
  ----------------------- -------------------------- -------------------------
  HomeMap                 footprint projection,      canonical Trip collection
                          clusters, Trip selection   
                          intents                    

  TripMapScreen           composition of Map +       raw SQL
                          Sheet; TripFocus           
                          consumption                

  MapCanvas               rendering neutral map      business Item state
                          models; marker intents     

  TripBottomSheet         content for current focus; itinerary truth
                          snap state                 

  DayTimeline             TimelineProjection;        canonical Item\[\]
                          select/reorder intents     

  ItemRow                 rendering and local        mutation semantics
                          interaction intent         

  AddItemFlow             search → preview →         automatic DB insert from
                          confirmation               search

  QuickEdit               lightweight form draft     structural mutation
                                                     bypass

  ItemDetail              full edit form             repository bypass

  tripMapStore            focus/sheet/editing/Undo   Trip/Day/Item/Place
                          interaction state          collections

  Projection              read model → presentation  mutation
                          model                      

  Application             semantic business mutation React/map rendering

  Repository              persistence primitives     UI behavior
  ----------------------------------------------------------------------------

Core rule:

> Components emit user intents. Application Commands execute business
> operations.

------------------------------------------------------------------------

# 20. Bottom Sheet / Gesture Execution Contract

Trip composition:

``` text
TripMapScreen
├── MapCanvas
└── TripBottomSheet
```

Snap states:

``` text
collapsed
half
expanded
```

Approximate targets remain device-aware:

``` text
collapsed ≈ 12–15%
half      ≈ 45–50%
expanded  ≈ 85–90%
```

Expanded retains some visible map context.

Gesture ownership:

  Region                Gesture             Owner
  --------------------- ------------------- ---------------
  Map                   pan / pinch         Map
  Sheet handle/header   vertical drag       Bottom Sheet
  Day Header            horizontal swipe    Day switching
  Timeline body         vertical scroll     Timeline
  Item row              tap                 selection
  Item row              long press + drag   reorder
  Map Picker            pan / zoom          Map

Do not add a global app gesture manager.

Do not make the whole Timeline horizontally swipeable.

No swipe-to-delete in V1.

------------------------------------------------------------------------

# 21. Drag-Reorder Contract

Gesture sequence:

``` text
tap
→ select

vertical movement
→ scroll

long press (~300–400 ms)
→ reorder mode
```

During drag:

``` text
temporary preview order
```

lives in local component state.

Do not write SQLite on every intermediate movement.

On drop:

``` text
reorderItem()
↓
transaction
↓
reindex
↓
reconcile Legs
↓
query invalidation
```

------------------------------------------------------------------------

# 22. Codex Task Format

Every Codex task should normally contain:

``` text
Goal
Scope
Primary module
Allowed/expected files
Behavior / invariants
Acceptance criteria
Required tests
Explicit non-goals
```

Bad:

``` text
Build TripMap.
```

Good:

``` text
Goal:
Implement DayMapProjection.

Scope:
src/projections/

Input:
DayViewData

Output:
MapMarkerModel[]

Acceptance:
- map-visible Items are sorted by itinerary sortOrder, then assigned continuous display numbers 1..N
- Items without Place create no marker and no numbering gap
- Unscheduled markers are unnumbered
- selected Item uses selected variant
- Day projection does not require route/polyline output
- all coordinates preserve CRS

Tests:
projection unit tests

Non-goals:
- do not modify MapRenderer
- do not add AMap
- do not modify SQLite schema
```

A good task has:

``` text
one clear goal
one primary module
bounded impact
explicit acceptance criteria
relevant tests
```

Do not ask an agent to implement several milestones in one uncontrolled
pass.

------------------------------------------------------------------------

# 23. Milestone Execution Map

Development order remains M0--M13.

## M0 --- Bootstrap

Tasks:

``` text
M0-T1 Bootstrap React Native + Expo + TypeScript project
M0-T2 Add navigation shell
M0-T3 Add Expo SQLite initialization
M0-T4 Add migration runner + 001_initial
M0-T5 Add lint + typecheck + unit test setup
M0-T6 Render empty Home
```

Exit criteria:

``` text
App launches
Empty Home renders
Migration runs
Unit test runs
Typecheck passes
Lint passes
```

Explicit non-goals:

``` text
Design System
theme engine
AI
backend
auth
sync
analytics
```

------------------------------------------------------------------------

## M1 --- Trip + Day Persistence

Tasks:

``` text
M1-T1 Implement Trip/Day domain types including persisted Trip.mapRegion
M1-T2 Implement TripRepository / DayRepository
M1-T3 Implement SQLite repository adapters
M1-T4 Implement createTrip()
M1-T5 Implement automatic Day generation
M1-T6 Implement getTrips / Trip read queries
M1-T7 Add temporary Home Trip list if needed
M1-T8 Add persistence/application tests
```

Exit flow:

``` text
Home
→ Create Trip (title + dates + 中国大陆/海外)
→ save
→ restart
→ Trip and Days still exist
```

A temporary list is allowed. The canonical planning hierarchy remains `Trip → Day → Ordered Items`; Home will become map-centered later, while Trip planning must not invent route semantics.

------------------------------------------------------------------------

## M2 --- Basic Timeline + Custom Item

Tasks:

```text
M2-T1 Implement Item domain and repository
M2-T2 Implement addItem()
M2-T3 Implement updateItemDetails()
M2-T4 Implement DayViewData baseline
M2-T5 Implement basic Ordered Timeline
M2-T6 Implement basic Quick Edit
M2-T7 Add persistence/application tests
```

Exit flow:

```text
Open Trip
→ Select Day
→ Add Custom Item
→ Timeline displays Item
→ restart
→ Item remains
```

No Place search, Leg, routing or user-visible destructive Delete is required.

## M3 --- Itinerary Engine

Tasks:

```text
M3-T1 Implement moveItemToDay()
M3-T2 Implement moveItemToUnscheduled()
M3-T3 Implement reorderItem()
M3-T4 Implement changeTripDateRange(strategy)
M3-T5 Add Unscheduled read model/UI
M3-T6 Add Day switching
M3-T7 Add basic reorder control
M3-T8 Add Move-to-Day actions
M3-T9 Add invariant tests
```

Critical acceptance:

```text
shiftItems vs keepCalendarDates behave differently and explicitly
Trip shortening never deletes Items
reorder/move only reindex Items; no Leg side effects
```

## M4 --- Dual iOS Map Renderers + Core Synchronization

Tasks:

```text
M4-T1 Implement Coordinate / CRS contract
M4-T2 Implement minimal Place domain / PlaceRepository / SQLite adapter
M4-T3 Add persisted fixture Places linked to Items
M4-T4 Implement marker-only MapMarkerModel / MapRenderer contract
M4-T5 Implement GoogleMapRenderer with react-native-maps + PROVIDER_GOOGLE
M4-T6 Implement thin AmapMapRenderer Expo native view/module
M4-T7 Configure iOS Development Build/native map dependencies
M4-T8 Persist/resolve Trip.mapRegion (`china_mainland | global`)
M4-T9 Verify WGS84 Google fixture and GCJ-02 AMap fixture on real iOS build
M4-T10 Implement DayMapProjection
M4-T11 Implement TripFocus / selection controller
M4-T12 Wire marker tap ↔ Timeline Item selection
M4-T13 Add one-shot map/timeline focus effects
M4-T14 Add renderer-contract and projection-consistency tests
```

Acceptance:

```text
Day marker ID is Item occurrence ID
Place-less Item creates no marker/number gap
no route polyline is required
Google WGS84 and AMap GCJ-02 markers align correctly
marker tap and Timeline tap select the same Item
```

Provider search/Preview/Map Picker remain M7.

## M5 --- Final Trip Planning Shell

Tasks:

``` text
M5-T1 Add @gorhom/bottom-sheet integration
M5-T2 Implement collapsed / half / expanded state (Half is default planning state)
M5-T3 Implement Trip Overview = Trip-wide Place distribution/clusters + Day List
M5-T4 Implement Day View = current-Day Place markers + Ordered Timeline
M5-T5 Implement Item Selected as same-Day-View focus state
M5-T6 Implement Day Header / Day Jump
M5-T7 Implement Overview Place occurrence Preview -> explicit Day entry
M5-T8 Implement Unscheduled presentation / density control
M5-T9 Implement viewport inset + safe-area sizing
M5-T10 Implement back hierarchy: Detail -> Day -> Overview -> Home
M5-T11 Replace temporary Trip UI
```

Acceptance:

``` text
Trip Overview
→ no Day anchors
→ no cross-Day route lines
→ Day Row is primary Day navigation

Day View
→ only current-Day Place-bearing Items are on map by default
→ marker display numbers follow relative Timeline order 1..N
→ no Place-less Item causes a numbering gap
→ no route/polyline is required

Marker tap <-> Timeline tap
→ select the same Item
→ Item Selected remains same screen
→ explicit Detail action opens Item Detail
```

Do not simultaneously add place-search integration, routing, Hotel and Transport; the renderer integrations are already established in M4.

------------------------------------------------------------------------

## M6 --- Drag-Reorder Gesture

Tasks:

``` text
M6-T1 Add long-press activation
M6-T2 Add local preview order
M6-T3 Integrate Timeline vertical scrolling
M6-T4 On drop emit reorderItem()
M6-T5 Verify SQLite write happens only at drop
M6-T6 Add interaction/regression tests
```

------------------------------------------------------------------------

## M7 --- Place Search (AMap + Google) + Map Picker

Tasks:

```text
M7-T1 Lock PlaceProvider native integration path:
      AMap official iOS Search SDK behind thin Expo native module
      Google Places SDK for iOS behind thin Expo native module
M7-T2 Implement AmapPlaceProvider mapping
M7-T3 Implement GooglePlaceProvider mapping
M7-T4 Implement Trip.mapRegion provider resolver
M7-T5 Implement Place Search UI
M7-T6 Implement Place Preview
M7-T7 Wire explicit confirmation → save Place snapshot + addItem()
M7-T8 Implement Map Picker fixed crosshair
M7-T9 Add optional reverse-geocode enrichment
M7-T10 Support coordinate-only fallback
M7-T11 Implement provider-aware `在地图中打开`
M7-T12 Add mocked adapter tests + real-device smoke checklist
```

Place domain/repository already exists from M4. CI must not depend on live provider services. Place Search is input assistance, not discovery/recommendation.

## M8 --- Reserved / Retired

**RETIRED / RESERVED. No implementation tasks.**

Do not build Leg, route polyline, duration/distance editing or RouteProvider.

Keep milestone number reserved to avoid renumbering M9–M13.

Relevant checks moved to:

- external map handoff → M7;
- Transport Item semantics → M9.

## M9 --- Hotel + Transport Specialization

Tasks:

``` text
M9-T1 Implement Hotel payload mapping
M9-T2 Implement Hotel Context projection
M9-T3 Add check-in/out validation
M9-T4 Implement Transport payload mapping
M9-T5 Add Transport edit/display fields
M9-T6 Verify separately planned/timed movement remains a Transport Item; ordinary adjacency remains Item order only
M9-T7 Add application/projection tests
```

Hotel remains one cross-day Item.

------------------------------------------------------------------------

## M10 --- Home Footprint Map

Tasks:

```text
M10-T0 Select one Home renderer and lock mixed-CRS display/conversion policy using real fixtures
M10-T1 Implement HomeMap projection
M10-T2 Add Trip markers + clustering
M10-T3 Add Trip Preview Card
M10-T4 Add All / Planned / Completed filter
M10-T5 Add Active Trip Card + Continue Today
M10-T6 Add compact persistent “我的旅行” Trip-list Bottom Sheet
M10-T7 Add Create Trip FAB
M10-T8 Replace temporary Home UI
```

Do not assume MapKit before M10-T0 proves the chosen renderer and conversion alignment. Do not mount AMap + Google simultaneously in Home.

## M11 --- Validation + Undo Polish

Tasks:

``` text
M11-T1 Finalize ValidationIssue presentation
M11-T2 Add Trip-level Validation Summary
M11-T3 Implement DeletedItemSnapshot
M11-T4 Implement restoreDeletedItem()
M11-T5 Add Undo Snackbar
M11-T6 Add error feedback
M11-T7 Add regression tests
```

Warning-type validation must not block valid saves.

------------------------------------------------------------------------

## M12 --- Offline / Persistence Polish

Tasks:

```text
M12-T1 Verify kill/restart persistence
M12-T2 Verify offline read/edit of existing itinerary
M12-T3 Verify ordering persistence
M12-T4 Verify Place persistence
M12-T5 Verify Trip.mapRegion persistence
M12-T6 Verify schema/repository edge cases
M12-T7 Review transaction rollback behavior
```

Provider network/tile availability must not make saved Timeline/Place data unreadable.

## M13 --- Stabilization

Required release gates include:

```text
Beijing dense-city itinerary fixture
Sample wide-extent itinerary fixture
Place-less Item numbering fixture
repeated Place occurrence selection fixture
Google WGS84 / AMap GCJ-02 alignment regression
provider key/privacy/native configuration smoke
archive/release build
critical navigation / persistence E2E
performance and error sanity checks
```

# 24. Milestone Phases

``` text
M0
→ Bootstrap

M1–M4
→ Core Prototype

M5–M10
→ Productization

M11–M13
→ Stabilization
```

Every milestone must leave the app runnable.

------------------------------------------------------------------------

# 25. Test Contract

Testing priority:

```text
Domain / Application
>
Projection
>
Repository
>
critical UI interaction
>
pure visual UI
```

Highest-priority behaviors:

```text
changeTripDateRange(strategy)
moveItemToDay()
moveItemToUnscheduled()
reorderItem()
transaction-bound Validation
Hotel Context projection
Map / Timeline projection consistency
Trip.mapRegion provider resolution
```

Critical invariants:

```text
Trip shortening never loses Items
same Place occurrences remain distinct Items
Day marker ID = Item occurrence ID
Place-less Items create no marker/numbering gap
Map numbering follows canonical Item order
Unscheduled remains first-class
no Leg persistence or route-polyline side effects
```

Repository tests use a test SQLite database and cover canonical Trip/Day/Item/Place persistence, foreign-key behavior, migration idempotence and transaction rollback.

# 26. E2E Smoke Contract

Keep V1 E2E small: approximately 5--8 critical flows.

Recommended:

``` text
Create Trip → persist → reopen

Add Custom Item → persist → reopen

Reorder → Timeline + Map numbering update

Marker → Timeline synchronization

Timeline Item → Map synchronization

Delete → Undo

Shorten Trip → affected Items become Unscheduled

Mock POI search → confirm → Item created
```

------------------------------------------------------------------------

# 27. Type System / Runtime Validation

Prefer TypeScript to prevent illegal internal states.

Use runtime validation at untrusted boundaries:

``` text
provider API response
future Agent Tool input
future cloud response
imported files
```

Zod or an equivalent runtime schema library is appropriate.

Do not redundantly validate every internal typed object.

------------------------------------------------------------------------

# 28. Root AGENTS.md Contract

Before implementation, create a concise root-level `AGENTS.md`.

Recommended content:

``` md
# Travel App Engineering Guardrails

## Architecture

- SQLite is the durable business source of truth.
- UI must never execute raw SQL.
- UI business mutations must go through Application Commands.
- Repositories expose persistence primitives; they do not own UI behavior.
- TanStack Query is read/cache orchestration, not persistence.
- Do not duplicate Trip/Day/Item/Place collections in Zustand.

## Map / Timeline

- Map and Timeline are projections of the same itinerary model.
- Both share one TripFocus.
- Do not create separate canonical Item state for Map and Timeline.
- MapRenderer consumes neutral presentation primitives, not business entities.

## Domain

- Coordinates always include CRS.
- Never silently mix WGS84 and GCJ-02.
- Do not automatically merge Places by providerPlaceId.
- Unscheduled means Item.dayId = null.
- Day lifecycle is controlled through Trip date reconciliation.
- Shrinking Trip dates must never silently delete Items.
- Item sequence (`sortOrder`) is authoritative. Ordinary adjacency is not persisted in V1.
- Structural Item fields such as dayId and sortOrder must use semantic Commands.

## Development

- Prefer small vertical slices.
- Every milestone must leave the app runnable.
- Domain/Application behavior changes require relevant tests.
- Bug fixes require regression tests.
- Do not perform unrelated large refactors.
- Do not introduce deferred features unless explicitly requested.

## Deferred Beyond V1

- No cloud sync.
- No authentication.
- No collaboration.
- No AI implementation.
- No automatic route API.
- No Wishlist.
- No budget/weather/ticket/social systems.
```

Stage documents explain the architecture. `AGENTS.md` protects the
architecture during implementation.

------------------------------------------------------------------------

# 29. Definition of Done

Every normal Codex task is complete only when:

``` text
□ requested capability works

□ TypeScript typecheck passes

□ lint passes

□ relevant unit/integration tests pass

□ business invariant tests pass where applicable

□ architecture guardrails are respected

□ no raw SQL is introduced into UI

□ no duplicate canonical domain state is introduced

□ no direct bypass of Application Commands is introduced

□ no unrelated large refactor is included

□ no deferred V2 feature is introduced

□ acceptance criteria are explicitly verified
```

Milestone-level DoD additionally requires:

``` text
□ App launches

□ previously completed slices still work

□ milestone user flow is manually exercised

□ migrations are verified when schema changes

□ milestone exit criteria are met
```

Initial CI:

``` text
install
typecheck
lint
unit tests
```

Later, once useful:

``` text
build
critical E2E
```

Do not chase arbitrary coverage percentages.

------------------------------------------------------------------------

# 30. Development Review Loop

Recommended cadence:

``` text
Codex task specification
↓
implementation
↓
tests
↓
code review
↓
run actual app
↓
manual behavior check
↓
next task
```

Do not delegate several milestones at once.

Small errors compound quickly in AI-assisted code.

------------------------------------------------------------------------

# 31. Non-Negotiable V1 Non-Goals

Stage 05 must not be interpreted as permission to implement:

``` text
automatic route API
traffic / closures
turn-by-turn navigation
AI itinerary generation
AI autonomous edits
cloud sync
multi-device sync
authentication
collaboration
global Wishlist
global Place library
budget management
weather integration
live flight status
ticket management
packing lists
attachments
photo journal
social/community features
gamification
```

Future seams may exist as interfaces, but future functionality must not
be pre-built without a current use case.

Principle:

> Leave seams for the future; do not write future code without a current
> use case.

------------------------------------------------------------------------

# 32. Stage 05 Exit Criteria

Stage 05 is complete when the following are settled:

-   architecture-constrained agent autonomy model;
-   repository/directory boundaries;
-   canonical TypeScript domain contracts;
-   Migration 001 contract;
-   Repository interfaces;
-   transaction boundary;
-   semantic Application Command contract;
-   relative move/reorder semantics;
-   Delete + Undo snapshot contract;
-   Validation contract;
-   TanStack Query keys;
-   query invalidation rules;
-   shared read models;
-   Map/Timeline projection contract;
-   TripFocus/Zustand ownership;
-   one-shot UI effects;
-   Navigation contract;
-   Component ownership;
-   Bottom Sheet/gesture execution rules;
-   M0--M13 Codex task map;
-   testing/E2E obligations;
-   root `AGENTS.md`;
-   task and milestone Definition of Done.

All are now defined.

------------------------------------------------------------------------

# 33. Stage 06 Handoff

Stage 06 is **Final Engineering Review & Execution Backlog**.

Stage 06 must not introduce new product features or casually redesign
the architecture.

Its job is to review Stage 01--05 as one system and answer:

``` text
Are there contradictions between product semantics and implementation contracts?

Are any interfaces unnecessary or over-designed?

Are any required contracts still missing?

Does Migration 001 actually support every V1 invariant?

Are transaction boundaries sufficient?

Can Map and Timeline drift despite the current read-model design?

Can Trip date reconciliation lose data?


Are query invalidation rules sufficient but not excessive?

Are navigation/back rules implementable without conflicting state?

Are M0 and M1 small enough for Codex?

Are any tasks dependent on infrastructure not yet introduced?

Are tests concentrated on the highest-risk invariants?

Are deferred V2 features accidentally leaking into V1?
```

Stage 06 outputs:

``` text
1. Conflict / risk review of Stage 01–05
2. Required corrections, if any
3. Final architecture risk register
4. Final development backlog
5. M0 task list
6. M1 task list
7. Exact M0 → M1 execution order
8. Per-task acceptance criteria
9. Pre-development checklist
10. Go / No-Go recommendation
```

After Stage 06, development starts with M0.

Do not create Stage 07/08 for further pre-development design.

------------------------------------------------------------------------

# 34. Final Execution Baseline

``` text
Stage 01
Product Foundation
        ↓
Stage 02
V1 Flow & Product Semantics
        ↓
Stage 03
UI / Wireframe / Interaction Specification
        ↓
Stage 04
Technical Architecture & Implementation Plan
        ↓
Stage 05
Development Specification
        ↓
Stage 06
Final Engineering Review & Execution Backlog
        ↓
Development
M0 → M13
```

The central invariant remains unchanged:

> A Trip is an ordered plan organized by Day. Timeline is the primary planning projection; Map is a synchronized Place-only spatial projection of the same itinerary model. Neither view may invent routing or duplicate canonical itinerary state.
