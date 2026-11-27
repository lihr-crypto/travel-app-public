# Travel App — Stage 04: Technical Architecture & Frontend Implementation Plan

> Status: Final
>
> Scope: Technical architecture, local persistence, map/provider abstraction, state synchronization, gesture architecture, application command boundary, testing strategy, and V1 implementation order.
>
> This document consolidates and supersedes the Stage 04 interim decisions from 04-A through 04-H.
>
> **Stage 06 map amendment (2026-09-11):** V1 is now explicitly **iOS-only**. Mainland-China Trip sessions use the official **AMap iOS Map SDK + AMap place/search services**; Trip sessions outside mainland China use **Google Maps on iOS + Google Places**. The neutral `MapRenderer / PlaceProvider / Coordinate` boundaries remain unchanged. This amendment supersedes the earlier provisional `react-native-maps first, AMap only if needed` renderer strategy.

> **Product realignment amendment (2026-09-11, user-approved):** The V1 product goal has been re-confirmed as **personal travel-plan storage organized by Day and ordered Items**. Home remains map-centered as a travel-footprint/Trip-entry surface. Inside a Trip, the **Timeline / ordered itinerary is the primary planning and browsing view**, while the map is a synchronized **spatial projection** of saved Places. The app does **not** plan routes, choose route alternatives, recommend places, or replace AMap / Google Maps / Xiaohongshu-style discovery. Any earlier wording that makes Trip planning itself “map-first”, treats a Trip/Day as a route, requires Day anchors/routes, or implies automatic routing is superseded by this amendment. No M0 rollback is required.

---

# 0. Stage 04 Objective

Stage 01–03 established the product semantics and interaction model. Stage 04 translates those decisions into an implementation-ready mobile architecture.

The app remains:

- personal-first in V1
- Home-map-centered, but Day/Timeline-centered inside Trip planning
- local-first in persistence
- manually planned in V1
- designed so future AI assistance can reuse the same application capabilities
- intentionally conservative about premature cloud/backend complexity

The core principle is:

> The map and timeline are two projections of the same itinerary state. Business data has one durable source of truth.

---

# 1. Client Stack

Recommended V1 stack:

```text
React Native
+ Expo
+ TypeScript
+ iOS-only V1 target
```

Supporting libraries/concepts:

```text
Expo SQLite
TanStack Query
Zustand
React Native navigation
react-native-maps (Google renderer on iOS; Home/global renderer may reuse its iOS support)
AMap iOS Map SDK via a thin Expo native view/module
Google Places / AMap place-search adapters
Expo Development Build once custom AMap native code is introduced
@gorhom/bottom-sheet
React Native Testing Library
```

The stack is selected because it provides:

- one mobile codebase
- strong TypeScript boundaries
- manageable transition from existing JavaScript/Vue experience
- good compatibility with AI-assisted coding workflows
- a practical path to native escape hatches if map/provider integration later requires them

Do not rewrite the application in native Swift. Native Swift is limited to the thin AMap bridge required to expose map rendering/events through the existing renderer abstraction. From the milestone that introduces this bridge onward, use an Expo Development Build rather than relying on Expo Go.

---

# 2. Overall Architecture

```text
React Native UI
  HomeMap / TripPlanningWorkspace / Timeline / Sheets / Detail
        ↓
Presentation / Interaction
  TripFocus / Sheet / UI effects
        ↓
Application Layer
  Commands / Queries / Services
        ↓
Repository Layer                   Provider Layer
  Trip / Day / Item / Place        MapRenderer
        ↓                          PlaceProvider
      SQLite                       Coordinate services
        ↓
future SyncService / AI only after a future approved product need
```

Dependency direction:

```text
Presentation → Application → Domain
Infrastructure implements Repository / Provider boundaries
```

V1 contains no Leg or RouteProvider layer.

# 3. Persistence Strategy

V1 is local-first.

```text
SQLite = durable business source of truth
```

Do not build the following only for hypothetical future needs:

```text
authentication
cloud backend
cross-device sync
conflict resolution
collaboration
server-side AI orchestration
```

Future sync must remain possible behind repository and application boundaries, but it is not a V1 prerequisite.

---

# 4. Canonical Domain Tables

Canonical V1 business tables:

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

Do not create V1 tables for:

```text
legs
validation_issues
unscheduled_items
trip_status
```

`ValidationIssue` is derived. `Unscheduled` is `Item.day_id = null`. Ordinary movement is represented by Item order, not a persisted adjacency table.

# 5. Trip Schema

Suggested fields:

```text
id
title
start_date
end_date
map_region      // china_mainland | global
note?
created_at
updated_at
```

`map_region` is a persisted **product choice**, not an SDK identifier and not derived from phone location or current viewport.

```text
china_mainland → AMap renderer + AMap PlaceProvider + GCJ-02 snapshots
global         → Google renderer + Google Places + WGS84 snapshots
```

V1 does not dynamically switch a Trip between providers while panning.

# 6. Day Schema

Suggested fields:

```text
id
trip_id
date
day_index
created_at
updated_at
```

Constraints:

```text
UNIQUE(trip_id, date)
UNIQUE(trip_id, day_index)
```

Days are derived from Trip date range but persisted for stable IDs and foreign keys.

No public generic:

```text
deleteDay()
```

Day reconciliation is controlled through:

```text
changeTripDateRange()
```

When shortening a Trip:

```text
affected Items
→ Unscheduled
→ then removed Days may be deleted
```

No Item is silently deleted.

---

# 7. Place Schema

Suggested fields:

```text
id
name
latitude
longitude
coordinate_system
address?
provider?
provider_place_id?
metadata_json?
created_at
updated_at
```

Supported initial coordinate systems:

```text
wgs84
gcj02
```

Place data is stored as a local snapshot.

After explicit confirmation, the app must not depend only on an external provider ID.

Custom/map-picked Places may have no provider information.

Do not automatically merge Place records solely because `provider_place_id` matches.

V1 has no global user-facing Place Library.

Repeated itinerary visits remain independent at the Item level.

---

# 8. Item Schema

Suggested fields:

```text
id
trip_id
day_id nullable
place_id nullable
type
title
sort_order
time_mode
start_datetime?
end_datetime?
period?
is_fixed
note?
payload_json?
created_at
updated_at
```

Rule:

```text
day_id = null → Unscheduled
```

No separate Unscheduled table.

Supported types:

```text
sightseeing
food
hotel
activity
transport
custom
```

Time modes:

```text
none
period
exact
```

DayPeriod values are exactly:

```text
morning
afternoon
evening
night
```

Canonical consistency:

```text
none   → start/end null, period null
period → start/end null, period non-null
exact  → start non-null, end optional, period null
```

Hotel and Transport use the common `start_datetime / end_datetime` interval. Type payloads contain only genuinely type-specific sparse fields.

Hotel payload need not duplicate time fields in V1.

Transport payload may contain:

```json
{
  "mode": "...",
  "serviceNumber": "...",
  "origin": "...",
  "destination": "..."
}
```

Hotel remains one cross-day Item; intermediate days derive Hotel Context.

# 9. Item Ordering

V1 uses simple integer sequential `sort_order`.

Example:

```text
0
1
2
3
```

After reorder, reindex the affected list.

Do not introduce fractional/floating ordering in V1.

Typical daily itinerary sizes are small, so reindexing is trivial and more robust.

Unscheduled Items are ordered using the same principle.

---

# 10. Leg Schema

V1 has **no Leg schema**.

Ordinary adjacency is derived directly from ordered Items when presentation needs the concept of “next”, but it is not persisted and carries no user metadata.

Do not create:

```text
legs table
Leg domain type
LegRepository
route geometry fields
```

A separately planned/booked/timed movement is a `Transport Item`.

# 11. Leg Reconciliation

Not applicable in V1 because Leg is not a canonical or persisted entity.

Item mutations only reindex affected Item collections and invalidate/rebuild derived read models.

# 12. Foreign Keys and Deletion

Recommended behavior:

```text
Trip → Day       CASCADE
Trip → Item      CASCADE
Day  → Item      SET NULL
Place → Item     SET NULL
```

Application Commands may perform additional semantic cleanup.

Correctness takes priority over aggressive orphan cleanup; Place rows may remain after an Item is deleted unless explicit cleanup is later justified.

# 13. IDs and Dates

IDs:

```text
UUID text
```

UUID v4 is sufficient for V1 and future sync.

Timestamps:

```text
created_at
updated_at
→ UTC ISO 8601
```

Travel dates:

```text
YYYY-MM-DD
```

represent local travel calendar dates.

---

# 14. Validation

Initial types:

```text
ITEM_OUTSIDE_TRIP_RANGE
END_BEFORE_START
FIXED_ITEM_TIME_CONFLICT
HOTEL_CHECKOUT_BEFORE_CHECKIN
```

Validation is primarily computed:

```text
validateTrip(tripId)
```

Validation does not automatically mutate data.

Distinguish:

```text
invalid command input
```

from:

```text
valid mutation that creates a domain warning
```

Examples:

```text
endDate < startDate
→ reject input

fixed-time overlap
→ allow save + return warning
```

---

# 15. Map Provider Architecture

Keep two distinct V1 boundaries:

```text
MapRenderer
PlaceProvider
```

`MapRenderer` responsibilities:

```text
render markers
camera / fit coordinates
map press / marker press
viewport/camera events needed by focus and Map Picker
```

`PlaceProvider` responsibilities:

```text
text/autocomplete POI search
place details required for snapshot
optional reverse geocoding for Map Picker
```

V1 does not require polylines or a RouteProvider. Add a routing boundary only if a future user-approved feature actually consumes it.

# 16. Locked iOS Map Technology

V1 is iOS-only.

Persisted `Trip.mapRegion` selects the Trip renderer:

```text
china_mainland
→ AmapMapRenderer
→ official AMap iOS Map SDK

global
→ GoogleMapRenderer
→ react-native-maps + PROVIDER_GOOGLE
```

`AmapMapRenderer` is a thin Expo native view/module exposing only marker/camera/press/viewport capabilities required by V1. No polyline/navigation/3D bridge is required.

Because AMap introduces custom native code, use an Expo Development Build / native iOS build for M4+ map work. Google rendering does not need a matching custom Swift bridge merely for symmetry.

# 17. Region-Specific Place Provider Strategy

Trip-level mapping/search policy:

```text
Mainland China
MapRenderer   → AmapMapRenderer
PlaceProvider → AmapPlaceProvider
Coordinate    → GCJ-02 provider-native values

Outside mainland China
MapRenderer   → GoogleMapRenderer
PlaceProvider → GooglePlaceProvider
Coordinate    → WGS84 provider-native values

Automatic route
→ none in V1
```

`GoogleMapRenderer` may reuse `react-native-maps` with `PROVIDER_GOOGLE`; do not create a custom Google Swift bridge unless an actual missing capability is demonstrated.

`GooglePlaceProvider` and `AmapPlaceProvider` must both map provider responses into the same neutral `PlaceSearchResult` contract before anything reaches Application/UI code.

Provider licensing, API keys, billing and privacy requirements are operational configuration concerns and must not leak into Domain types.

---

# 18. Coordinate System Is First-Class

Never pass naked lat/lng without coordinate-system information.

```ts
type CoordinateSystem =
  | "wgs84"
  | "gcj02"

type Coordinate = {
  latitude: number
  longitude: number
  system: CoordinateSystem
}
```

This type applies to:

```text
Place
Marker
Polyline
Route geometry
Camera targets
Provider results
```

Do not silently mix WGS84 and GCJ-02.

Do not force all data into WGS84 when reliable conversion is unavailable.

Preserve provider-native coordinates with explicit CRS.

---

# 19. Coordinate Conversion

Conceptual interface:

```ts
interface CoordinateConverter {
  convert(
    coordinate: Coordinate,
    target: CoordinateSystem
  ): Promise<Coordinate>
}
```

Only support conversion directions backed by reliable implementations.

Do not assume every CRS pair is fully reversible.

Prefer provider/renderer combinations that minimize conversion. For normal Trip Map operation this means AMap + GCJ-02 in mainland China and Google + WGS84 outside mainland China.

---

# 20. Place Search Flow

Search results are transient.

```text
PlaceProvider.search()
↓
PlaceSearchResult[]
↓
Place Preview
↓
explicit confirmation
↓
local Place snapshot
↓
Item creation
```

Search results must not create database records automatically.

Provider-specific API parameters remain inside provider adapters.

Neutral query shape:

```ts
type PlaceSearchQuery = {
  keyword: string
  center?: Coordinate
  region?: {
    countryCode?: string
    city?: string
  }
  limit?: number
}
```

---

# 21. Provider Session Strategy

Trip provider selection is deterministic from persisted `Trip.mapRegion`:

```text
china_mainland → AMap + AMap PlaceProvider
global         → Google Maps + Google Places
```

Rules:

- Persist `map_region` on Trip.
- Do not infer provider from the phone's current location.
- Do not switch provider because the user pans across a border.
- A cross-provider/mixed-region Trip is outside V1; split it into separate Trips.
- `mapRegion` is product language (`中国大陆 / 海外` in UI), not an SDK/provider enum exposed to users.

# 22. Map Presentation Model

`MapRenderer` consumes neutral presentation primitives rather than domain entities.

Required V1 primitives:

```ts
type MapMarkerModel = {
  id: string;                 // Day View: Item occurrence ID
  coordinate: Coordinate;
  label?: string;
  ordinal?: number;           // continuous among Place-bearing Items
  variant: "normal" | "selected" | "unscheduled" | "cluster";
  sourceItemIds?: string[];   // Overview aggregate / repeated-Place preview
};

type MapCameraRequest = {
  coordinates: Coordinate[];
  padding?: { top: number; right: number; bottom: number; left: number };
};
```

No V1 projection requires a route polyline.

Projection rules:

- Trip Overview: scheduled Place distribution / clustering + occurrence IDs; no Day anchors, no order line.
- Day View: current-Day Place-bearing Items only; marker IDs are Item IDs; ordinal numbers follow Item `sortOrder` with no gap for Place-less Items.
- Item Selected: selected marker highlights when the selected Item has a Place.
- Unscheduled: Place-bearing candidates are unnumbered and obey density/toggle rules.

# 23. Map Picker

Use fixed center crosshair behavior:

```text
user pans/zooms map
+
crosshair remains fixed
```

On confirm:

```text
camera center
→ selected coordinate
```

Reverse geocoding is optional enrichment.

If reverse geocoding fails, coordinate-only Place creation remains valid.

Crosshair must not consume touch events.

---

# 24. State Model

Three classes of state:

```text
Persistent Domain State
→ SQLite

Async Query / Derived State
→ Repository + TanStack Query

Ephemeral Interaction State
→ Zustand / local React state
```

Do not duplicate business entity collections inside Zustand.

TanStack Query is cache/query orchestration, not the database.

---

# 25. TripFocus

Use one discriminated union instead of several independent nullable fields.

```ts
type TripFocus =
  | {
      type: "overview"
    }
  | {
      type: "day"
      dayId: string
    }
  | {
      type: "item"
      itemId: string
      dayId: string | null
    }
  | {
      type: "unscheduled"
    }
```

This avoids illegal combinations.

Suggested store:

```ts
type TripMapState = {
  tripId: string | null
  focus: TripFocus
  sheetSnap: "collapsed" | "half" | "expanded"
  editingItemId: string | null
  mapPickerMode: boolean
}
```

---

# 26. Selection Controller

Use stable IDs only.

Core actions:

```text
selectTrip()
selectDay()
selectItem()
enterOverview()
openUnscheduled()
continueToday()
handleBack()
```

Components should not manually update multiple focus-related fields.

Map and Timeline never directly control each other.

Both:

```text
read TripFocus
emit user intents
```

Marker press and Timeline row press both resolve to:

```text
selectItem(itemId)
```

---

# 27. Day Navigation

Day header swipe and Day jump list both resolve to:

```text
selectDay(dayId)
```

Switching Day clears Item focus.

Do not auto-select the first Item.

Normal Trip open:

```text
Overview
```

Active Trip “Continue Today”:

```text
today Day mode
```

Back hierarchy:

```text
Item
→ Day
→ Overview
→ Home
```

---

# 28. State vs One-Shot Effects

Durable interaction state:

```text
TripFocus
sheetSnap
editingItemId
```

One-shot UI effects:

```text
FocusMapOnItem
FitDayOnMap
FitTripOnMap
ScrollTimelineToItem
ShowUndoSnackbar
OpenQuickEdit
```

Do not permanently bind camera position to selected Item.

Selection may emit a one-shot camera command, after which manual panning remains respected.

---

# 29. Shared Read Model

Avoid independent business reads for Map and Timeline.

Use a shared read model, for example:

```text
DayViewData
```

containing:

```text
Day
Items
Places
Hotel Context
Validation
```

Then derive:

```text
buildDayMapProjection(DayViewData)        // current-Day Place-bearing Items only
buildTimelineProjection(DayViewData)      // complete ordered Items
```

This reduces the chance of Map/Timeline drift.

---

# 30. Mutation Flow

Canonical mutation path:

```text
UI intent
↓
Application Command
↓
SQLite transaction
↓
semantic reconciliation
↓
commit
↓
query invalidation
↓
shared read model refresh
↓
Map + Timeline projections refresh
```

Do not use Zustand as an optimistic business-state mirror.

Small local interaction previews are allowed during gestures.

---

# 31. Application Command Layer

Human UI and future AI must share the same semantic application commands.

Correct:

```text
UI ───────┐
          ├→ Application Command → Domain / Repository
AI Tool ──┘
```

Incorrect:

```text
UI → one business path
AI → direct DB / second business path
```

Commands represent business intent rather than raw CRUD.

Core V1 commands:

```text
createTrip()
updateTripDetails()
changeTripDateRange()
deleteTrip()

addItem()
updateItemDetails()
moveItemToDay()
moveItemToUnscheduled()
reorderItem()
deleteItem()
restoreDeletedItem()

updateLeg()
```

---

# 32. Structural Fields Must Not Be Generic Patch Fields

`updateItemDetails()` may update:

```text
title
time
isFixed
note
type-specific payload
```

It must not directly update:

```text
tripId
dayId
sortOrder
```

Those fields have structural consequences and must use semantic commands.

---

# 33. Move Item Semantics

Example:

```ts
type MoveItemToDayCommand = {
  itemId: string
  targetDayId: string
  position?:
    | { type: "end" }
    | { type: "before"; itemId: string }
    | { type: "after"; itemId: string }
}
```

Application behavior:

```text
validate target Day belongs to same Trip
↓
move Item
↓
reindex source/target
↓
reconcile source/target ↓
validate Trip
↓
commit
```

`moveItemToUnscheduled()` remains an explicit business operation.

---

# 34. Reorder Semantics

Do not expose raw `sortOrder` as the primary command input.

Use relative intent:

```ts
type ReorderItemCommand = {
  itemId: string
  position:
    | { beforeItemId: string }
    | { afterItemId: string }
    | { atStart: true }
    | { atEnd: true }
}
```

Application computes the final sequence and reindexes integer sort orders.

This is safer for both UI and future AI tools.

---

# 35. Transaction Boundaries

A semantic mutation that touches multiple entities should normally execute inside one SQLite transaction.

Examples:

```text
changeTripDateRange()
moveItemToDay()
reorderItem()
addItem()
```

Do not allow partially-applied business operations.

---

# 36. Add Item Semantics

Provider calls happen before the database transaction.

Flow:

```text
search provider
↓
candidate in memory
↓
user confirms
↓
begin local transaction
↓
create Place snapshot if needed
↓
create Item
↓
reconcile affected ↓
validation
↓
commit
```

Do not hold a SQLite transaction open while waiting for external network APIs.

Custom Item may have:

```text
place = null
```

A single generic add flow is sufficient; avoid separate CRUD stacks for every Item type.

---

# 37. Delete + Undo

User-visible Item Delete ships only together with minimal Undo/restore support (M11).

`DeletedItemSnapshot` contains the deleted Item identity/state and its relative position, but **does not** snapshot Place or Leg data.

Restore requirements:

```text
restore the Item
→ restore dayId / Unscheduled ownership
→ restore relative order as closely as possible
→ reindex affected collection
→ invalidate affected Day / Overview queries
```

No Leg bridge cleanup is required because V1 has no Leg entity.

# 38. Application Services

Only extract shared services when multiple commands need meaningful shared logic.

Examples:

```text
Trip date reconciliation
transaction-bound Validation
projection builders
```

Avoid full CQRS/CommandBus/Handler hierarchies.

Recommended organization:

```text
application/
├── trip/
│   ├── createTrip.ts
│   ├── changeTripDateRange.ts
│   └── deleteTrip.ts
├── item/
│   ├── addItem.ts
│   ├── updateItemDetails.ts
│   ├── moveItemToDay.ts
│   ├── moveItemToUnscheduled.ts
│   ├── reorderItem.ts
│   └── deleteItem.ts       // user-visible only with M11 Undo
├── validation/
│   └── validateTrip.ts
└── queries/
```

Plain typed use-case functions are sufficient.

# 39. Future AI Tool Boundary

AI is not implemented in V1.

Stage 04 only ensures the architecture supports it later.

Future structure:

```text
AI Agent
↓
Agent Tool
↓
Application Command
↓
Domain / Repository
```

AI must never receive:

```text
raw SQL access
generic repository write access
screen-coordinate automation as business logic
```

---

# 40. Future Read vs Write Tools

Potential Read Tools:

```text
get_trip
get_day
list_days
list_items
get_legs
search_places
validate_trip
```

Potential Write Tools:

```text
create_trip
update_trip_dates
add_item
update_item
move_item
move_item_to_unscheduled
reorder_item
delete_item
update_leg
```

Write tools wrap existing Application Commands.

Search tools may call providers without mutating the itinerary.

---

# 41. Future AI Proposal Model

Preferred future experience:

```text
AI reads current itinerary
↓
AI generates proposed changes
↓
user reviews
↓
approved tools execute
```

Conceptually:

```ts
type ProposedChange = {
  tool: string
  arguments: unknown
  explanation?: string
}
```

The AI should not silently overwrite the user's trip by default.

Stable entity IDs are used internally.

Names and Day labels may be used for display/resolution, but not as final unique identity.

AI tools should never modify arrays by UI index.

---

# 42. Tool Schema Design Principles

AI tools should accept semantic structured fields.

Good:

```text
move_item(itemId, targetDayId, afterItemId)
```

Bad:

```text
update_items_table(...)
```

Good:

```text
structured transport fields
```

Bad:

```text
raw payload_json
```

Good:

```text
relative reorder intent
```

Bad:

```text
sortOrder = 3
```

Tool results should include:

```text
success
affected entity IDs
validation issues
```

---

# 43. Bottom Sheet Architecture

Use a mature Bottom Sheet library such as:

```text
@gorhom/bottom-sheet
```

Trip layout:

```text
TripMapScreen
├── MapCanvas
└── TripBottomSheet
```

Snap states:

```text
collapsed
half
expanded
```

Approximate visual targets:

```text
collapsed ≈ 12–15%
half      ≈ 45–50%
expanded  ≈ 85–90%
```

Use safe-area/device-aware sizing.

Expanded state must retain some map context.

---

# 44. Gesture Ownership

Gesture ownership is primarily determined by the region where interaction starts.

| Region | Gesture | Owner |
|---|---|---|
| Map | pan / pinch | Map |
| Sheet handle/header | vertical drag | Bottom Sheet |
| Day Header | horizontal swipe | Day switching |
| Timeline body | vertical scroll | Timeline |
| Item row | tap | selection |
| Item row | long press + drag | reorder |
| Map Picker | pan / zoom | Map |

Do not implement an app-global gesture manager.

---

# 45. Day Swipe

Horizontal Day swipe exists only in Day Header.

Do not make the entire Timeline horizontally swipeable.

This avoids conflict with:

```text
vertical scrolling
selection
long-press reorder
```

A tap on the Day title also opens direct Day selection.

---

# 46. Timeline List

A normal `FlatList` is sufficient for V1.

Daily itinerary sizes are small.

Do not introduce high-complexity list optimization prematurely.

---

# 47. Drag Reorder

Behavior:

```text
tap
→ select

normal vertical move
→ scroll

long press
→ reorder
```

Suggested long-press activation:

```text
~300–400ms
```

During drag:

```text
temporary preview order
```

lives in component-local state.

Do not write SQLite or reindex affected Items on every intermediate drag movement.

On drop:

```text
reorderItem()
→ transaction
→ reindex
→ reconcile → invalidate query
```

---

# 48. Zustand vs Local UI State

Zustand:

```text
TripFocus
sheetSnap
editingItemId
mapPickerMode
temporary Undo state if needed
```

Local component state:

```text
draggingItemId
previewOrder
search text
form draft
gesture progress
```

Do not globalize transient details unnecessarily.

---

# 49. Bottom Sheet Selection Behavior

Use:

```text
ensureSheetAtLeast("half")
```

rather than force-setting a specific snap.

Rules:

```text
collapsed + select Item
→ half

half + select Item
→ half

expanded + select Item
→ remain expanded
```

---

# 50. Map Camera and Sheet Insets

Selected marker focus must account for visible map space above the Bottom Sheet.

Concept:

```ts
type MapViewportInsets = {
  top: number
  right: number
  bottom: number
  left: number
}
```

Do not recenter the map continuously while the Sheet is being dragged.

Update viewport information after snap completion and use it for later camera effects.

---

# 51. Map Picker Mode

When active:

```text
normal Trip Bottom Sheet
→ hidden / disabled
```

UI:

```text
Cancel
Map
fixed center crosshair
Confirm
```

Crosshair:

```text
pointerEvents = none
```

The map owns pan/zoom gestures.

---

# 52. Sheet Content vs Full Navigation

Lightweight flows may reuse the Sheet:

```text
Trip Summary
Day Timeline
Place Search
Place Preview
Quick Edit
Validation
```

Do not create a second full navigation stack inside the Sheet.

Full Item Detail remains an independent screen/modal screen.

---

# 53. Delete Gesture

No swipe-to-delete in V1.

Timeline already contains:

```text
vertical scroll
tap
long press reorder
```

Deletion uses explicit context/detail actions and Undo.

---

# 54. Back Handling

Back priority:

```text
1. Context Menu / Modal
2. Add Item Flow
3. Quick Edit
4. Map Picker
5. TripFocus Item
6. TripFocus Day / Unscheduled
7. Trip Overview
8. Home
```

---

# 55. Testing Strategy

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

Do not chase arbitrary high coverage percentages.

Test the rules most likely to break during iteration and AI-assisted coding.

---

# 56. Highest-Priority Tests

Must strongly cover:

```text
changeTripDateRange(strategy)
moveItemToDay()
moveItemToUnscheduled()
reorderItem()
transaction-bound Validation
Hotel Context projection
Map / Timeline projection consistency
Trip.mapRegion persistence/provider resolution
```

Critical invariants:

```text
Trip shortening never loses Items
same Place occurrences remain distinct Items
Day marker identity = Item occurrence ID
Map numbering follows Place-bearing Item order without gaps
Unscheduled remains first-class
Place-less Items remain fully orderable
ordinary adjacency is not persisted
```

# 57. Repository / Database Tests

Use a test SQLite database.

Test:

```text
insert/read/update/delete
foreign keys
unique constraints
nullable Day
transaction rollback
coordinate_system persistence
```

Do not test SQLite itself; test our schema and repository mapping.

---

# 58. Provider Tests

Do not make normal CI depend on live AMap or Google Maps/Places network/API behavior.

Use mocked responses to test adapter mapping:

```text
provider ID
provider kind (amap/google)
name
address
coordinate
coordinate system
```

Real-provider integration is handled with occasional manual smoke checks.

---

# 59. Component Tests

Use React Native Testing Library for behavior.

Test user intent:

```text
press Item Row
→ selectItem called

choose another Day
→ selectDay called

reorder gesture completion
→ reorderItem intent emitted
```

Do not test internal View hierarchy or library animation implementation.

---

# 60. E2E Strategy

Keep V1 E2E small: roughly 5–8 critical smoke flows.

Recommended flows:

```text
Create Trip → persist → reopen

Add Custom Item → persist → reopen

Reorder → Timeline + Map numbering update

Marker → Timeline synchronization

Timeline Item → Map synchronization

Delete → Undo

Shorten Trip → affected Items become Unscheduled

POI search using mock provider → confirm → Item created
```

Do not make CI depend on live POI search.

---

# 61. Type System and Runtime Validation

Prefer preventing illegal states through TypeScript first.

Use runtime schema validation at untrusted boundaries:

```text
provider API response
future Agent Tool input
future cloud response
imported files
```

A library such as Zod is appropriate.

Do not validate every internal typed object redundantly.

---

# 62. Test Organization and AI-Coding Rule

Prefer colocated tests:

```text
moveItemToDay.ts
moveItemToDay.test.ts
```

Rule:

> Any change to Domain or Application behavior must update or add the relevant tests.

Bug fixing:

```text
write regression test
↓
reproduce failure
↓
fix
↓
test passes
```

This is especially important when Codex/AI agents are generating changes.

---

# 63. Initial CI

Initial pipeline only needs:

```text
install
typecheck
lint
unit tests
```

Later:

```text
build
critical E2E
```

Definition of Done for normal tasks:

```text
feature works
typecheck passes
relevant tests pass
architecture guardrails respected
no unrelated refactor
no deferred feature introduced
```

---

# 64. V1 Implementation Philosophy

Development uses Vertical Slices, not full horizontal layers.

Incorrect:

```text
finish all Domain
↓
finish all Repositories
↓
finish all UI
↓
integrate at the end
```

Preferred:

```text
one user capability
↓
UI → Application → Repository → SQLite
↓
running result
↓
next capability
```

Every milestone should leave the app runnable.

---

# 65. Milestone 0 — Bootstrap

Implement only:

```text
Expo + React Native + TypeScript
navigation
SQLite initialization
basic folder structure
testing
lint
typecheck
```

Acceptance:

```text
App launches
empty Home renders
migration runs
unit test runs
typecheck runs
```

Do not build:

```text
Design System
theme engine
AI
backend
auth
sync
analytics
```

---

# 66. Milestone 1 — Trip + Day Persistence

First complete business slice:

```text
Home
↓
Create Trip
↓
save
↓
restart
↓
Trip still exists
```

Implement:

```text
Trip
Day
TripRepository
DayRepository
createTrip()
getTrips()
automatic Day generation
```

UI may temporarily use a simple Trip list.

Home will become map-centered at M10; Trip planning itself is Ordered-Timeline-centered with synchronized spatial map context. Implementation does not need to start with map infrastructure.

---

# 67. Milestone 2 — Basic Timeline + Custom Item

Implement:

```text
Item domain/repository
addItem / updateItemDetails
DayViewData
basic Ordered Timeline
basic Quick Edit
persistence/application tests
```

Do not implement Leg or routing infrastructure. User-visible permanent Delete remains deferred until Undo in M11.

# 68. Milestone 3 — Ordering + Movement + Unscheduled + Date Range

Implement:

```text
moveItemToDay
moveItemToUnscheduled
reorderItem
changeTripDateRange(strategy)
Unscheduled read model/UI
Day switching
```

Date-range strategy is explicit:

```ts
type ChangeTripDateRangeStrategy = "shiftItems" | "keepCalendarDates";
```

All structural operations reindex Item collections and invalidate affected read models. No Leg reconciliation exists.

# 69. Milestone 4 — Dual iOS Map Renderers + Core Synchronization

M4 introduces the minimum persisted Place vertical slice required for a real Map ↔ Timeline product gate.

Implement:

```text
Coordinate / CRS contract
minimal Place domain + PlaceRepository + SQLite adapter
persisted fixture Places linked to Items
MapMarkerModel + marker-only MapRenderer contract
GoogleMapRenderer
thin AmapMapRenderer native view/module
persisted Trip.mapRegion resolver
DayMapProjection from current-Day Items + Places
TripFocus / selection controller
marker tap ↔ Timeline selection
real-device WGS84 / GCJ-02 fixture tests
```

M4 does **not** include provider search, Place Preview or Map Picker; those remain M7.

Day marker `id` is the Item occurrence ID, not Place ID.

No route polyline is required in the renderer bridge or M4 acceptance.

# 70. Milestone 5 — Final Trip Planning Shell

Introduce:

```text
Bottom Sheet
collapsed / half / expanded
TripFocus modes
Day Header
Map viewport insets
Safe Area
```

Replace the temporary Trip UI with the revised Stage 03 Trip Planning composition: Trip Overview = Trip-wide Place distribution + Day List; Day View = current-Day Place markers + Ordered Timeline; Item Selected = same-screen state.

Do not simultaneously introduce place-search integration, Hotel, Transport, and Route functionality; both map renderer adapters are already introduced in M4.

---

# 71. Milestone 6 — Drag Reorder Gesture

Business reorder already exists from M3.

Now add:

```text
long press
↓
local preview
↓
drop
↓
reorderItem()
```

Keeping gesture implementation separate makes bugs easier to isolate.

---

# 72. Milestone 7 — Place Search (AMap + Google) + Map Picker

Implement:

```text
Place domain
PlaceRepository
coordinate_system persistence

PlaceProvider
AmapPlaceProvider
GooglePlaceProvider
provider/session resolver
```

Flow:

```text
Add Item
↓
resolve current Trip map/search session
↓
AMap search for mainland-China session
or Google Places search for global session
↓
Place Preview
↓
Confirm
↓
provider-native coordinate snapshot + Item
```

Also add Map Picker:

```text
fixed crosshair
optional reverse geocode through active PlaceProvider
coordinate-only fallback
```

CI must use mocked provider responses for both AMap and Google. Live provider smoke tests are manual/occasional and must not be required for normal CI.

---

# 73. Milestone 8 — Adjacency / Movement Scope Review

**Retired / reserved milestone slot.**

V1 does not implement Leg UI, Leg persistence, route polyline or RouteProvider.

Keep the numeric slot to avoid renumbering downstream milestones. The only checks formerly associated with M8 are owned elsewhere:

- external-map handoff → M7;
- Transport Item semantics → M9.

# 74. Milestone 9 — Hotel + Transport Specialization

Hotel:

```text
cross-day payload
Hotel Context
check-in/check-out validation
```

Transport:

```text
mode
service number
origin/destination
departure/arrival
```

These are specializations of the generic Item engine rather than separate data models.

---

# 75. Milestone 10 — Home Footprint Map

M10 starts with an explicit renderer/CRS decision spike rather than assuming MapKit is already locked.

```text
M10-T0
→ choose one Home renderer
→ define its display CRS contract
→ test mixed stored WGS84 + GCJ-02 fixtures
→ define conversion/alignment tolerance and fallback
```

Then implement the accepted Home UI:

```text
Home Travel Footprint Map
Trip markers / clustering
Active Trip card
All / Planned / Completed filter
Trip Preview
compact persistent “我的旅行” Trip-list Bottom Sheet
Create Trip FAB
Continue Today
```

Do not mount AMap and Google simultaneously in Home.

# 76. Milestone 11 — Validation + Undo UI Polish

Finalize:

```text
Validation Summary
Validation Issue UI
Undo Snackbar
delete restore
error feedback
```

Validation logic should already have been tested earlier; this milestone focuses on final presentation.

---

# 77. Milestone 12 — Offline / Persistence Polish

Verify:

```text
kill/restart persistence
offline read/edit of existing itinerary
Item ordering persistence
Place persistence
Trip.mapRegion persistence
migration behavior
transaction rollback
```

Offline map tiles are not required. Saved Timeline and Place data must remain usable when provider network calls fail.

# 78. Milestone 13 — Stabilization

Final steps:

```text
critical E2E smoke
remove debug fixtures
remove temporary prototype screens
review migrations
review error states
basic performance sanity check
```

Avoid premature heavy optimization.

---

# 79. Milestone Phases

Condensed implementation sequence:

```text
M0  Bootstrap

M1  Trip + Day persistence

M2  Timeline + Custom Item

M3  Move / Reorder / Unscheduled / Trip dates

M4  Dual iOS renderers + Map↔Timeline sync

M5  Final Bottom Sheet Trip shell

M6  Drag reorder gesture

M7  Place + AMap/Google search + Map Picker

M8  Reserved / retired

M9  Hotel + Transport specialization

M10 Home Footprint Map

M11 Validation + Undo polish

M12 Offline/persistence polish

M13 E2E + cleanup
```

Grouping:

```text
M1–M4
→ Core Prototype

M5–M10
→ Productization

M11–M13
→ Stabilization
```

---

# 80. Interfaces to Define Early, Features Not to Build Early

Define early:

```text
Repository interfaces
MapRenderer
PlaceProvider
Coordinate
Application Commands
```

Do not implement early:

```text
Cloud Sync
AI Agent
Authentication
Collaboration
Route API
Wishlist
Budget
Weather
```

Principle:

> Leave seams for the future; do not write future code without a current use case.

---

# 81. Codex Task Granularity

Do not ask:

```text
Build TripMap.
```

Prefer:

```text
Implement createTrip Application Command,
including automatic Day generation,
SQLite transaction,
and relevant tests.
```

or:

```text
Implement DayMapProjection from current-Day Items and Places. Leg geometry is not required for V1 map semantics.
Do not modify MapRenderer.
Add projection tests.
```

A good Codex task normally has:

```text
one clear goal
one primary module
bounded impact
explicit acceptance criteria
relevant tests
```

One milestone can be split into several small Codex tasks.

---

# 82. Development Review Loop

Recommended cadence:

```text
Design
↓
Codex implementation
↓
Tests
↓
Review
↓
Run actual app
↓
next milestone
```

Do not ask Codex to implement many milestones in one uncontrolled pass.

Small errors compound quickly in AI-generated code.

---

# 83. Architecture Guardrails

Before implementation, create a root-level:

```text
AGENTS.md
```

with concise non-negotiable rules.

Recommended rules:

```text
SQLite is the durable business source of truth.

Do not duplicate domain collections in Zustand.

UI must not execute raw SQL.

Map and Timeline must share one TripFocus.

Do not bypass Application Commands.

Coordinates must always include CRS.

Do not automatically merge Places by providerPlaceId.

Do not silently delete Items when Trip dates shrink.


Do not implement AI/cloud/deferred features unless explicitly requested.

Do not perform unrelated large refactors.
```

Stage documents explain the architecture.

`AGENTS.md` protects it during implementation.

---

# 84. Final Stage 04 Architecture Summary

Implementation baseline:

```text
React Native + Expo + TypeScript
Expo Router

SQLite = durable business truth
TanStack Query = read/query cache
Zustand = interaction state only
Application Commands = semantic mutation boundary
Repository = persistence abstraction
Projection = Timeline / Map read models
MapRenderer = neutral marker/camera map capability
PlaceProvider = provider-native Place input capability
TripFocus = shared Map/Timeline selection context
Coordinate = CRS-aware spatial value
```

Core domain:

```text
Trip
├── Day[]
│   └── Ordered Item[]
│        └── Place?
├── Unscheduled Item[]
│    └── Place?
└── derived ValidationIssue[]
```

Central invariant:

> A Trip is an ordered plan organized by Day. Timeline is the primary planning projection; Map is a synchronized Place-only spatial projection. Neither view may invent routing or duplicate canonical itinerary state.

V1 has no Leg or RouteProvider.

# 85. Deferred Beyond V1

Explicitly deferred:

```text
automatic route API
traffic / closures
navigation
AI itinerary generation
AI autonomous edits
cloud sync
multi-device
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

These features should only be introduced after the V1 core proves useful in actual personal travel planning.

---

# 86. Stage 04 Exit Criteria

Stage 04 is complete when the following are considered settled:

- client stack
- local-first architecture
- SQLite domain schema
- coordinate-system strategy
- map/provider boundaries
- state ownership
- Map ↔ Timeline synchronization
- Bottom Sheet / gesture ownership
- semantic Application Commands
- future AI tool boundary
- test strategy
- V1 implementation order
- architecture guardrails for Codex execution

All are now defined.

The next stage should focus on preparing the concrete development specification rather than reopening product architecture.
