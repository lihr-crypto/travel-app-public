# Travel App Review Decision Record

> Date: 2026-09-11  
> Status: Final independent review summary  
> Scope: Consolidated Heavy Traveler, Product Lead, and Staff Engineer review of the revised Stage 01-06 documents  
> Development environment: macOS + Xcode + iOS Simulator / physical iPhone  
> Purpose: Provide a durable decision and correction reference for future development agents

> **Product realignment amendment (2026-09-11, user-approved):** The V1 product goal has been re-confirmed as **personal travel-plan storage organized by Day and ordered Items**. Home remains map-centered as a travel-footprint/Trip-entry surface. Inside a Trip, the **Timeline / ordered itinerary is the primary planning and browsing view**, while the map is a synchronized **spatial projection** of saved Places. The app does **not** plan routes, choose route alternatives, recommend places, or replace AMap / Google Maps / Xiaohongshu-style discovery. Any earlier wording that makes Trip planning itself “map-first”, treats a Trip/Day as a route, requires Day anchors/routes, or implies automatic routing is superseded by this amendment. No M0 rollback is required.

## 0. Authority and Usage

This document is not Stage 07 and does not reopen the completed product design.

The authoritative specification chain remains:

```text
Stage 01 -> Stage 02 -> Stage 03 -> Stage 04 -> Stage 05 -> Stage 06
```

Use the following precedence during development:

1. Apply the **2026-09-11 Product Realignment Amendment** in this revised review pack over conflicting earlier product/UI wording.
2. Preserve Stage 01-03 semantics that do not conflict with that amendment.
3. Use Stage 04-05 architecture and implementation contracts, as revised.
4. Apply every explicit Stage 06 correction and post-review realignment over conflicting earlier text.
5. Apply milestone-scoped decisions in this review record.
6. Do not treat deferred or rejected suggestions as permission to expand V1.

Final verdict:

```text
GO WITH CORRECTIONS
```

The overall design is mature enough to stop broad design work and begin development. M0 and M1 are ready. Remaining corrections must be handled immediately before their affected milestones rather than blocking M0.

---

## 1. Confirmed Product Understanding

### Core value

Travel App is a personal-first, local-first travel-plan storage and browsing tool. The canonical planning structure is `Trip -> Day -> Ordered Items`. Home remains a map-centered travel-footprint surface; inside a Trip, Timeline is the primary planning/browsing projection and Map is a synchronized Place-only spatial projection.

### Core user loop

```text
Create Trip and date range
-> derive Days
-> add Item through search, map pick, or custom entry
-> assign to a Day or Unscheduled
-> add time, ordering, fixed state, notes and optional Place
-> browse/edit primarily through Ordered Timeline with synchronized spatial Map
-> adjust the itinerary before and during travel
-> retain the completed Trip on the Home Footprint Map
```

### Core model

```text
Trip
|- Day[]
|  `- Ordered Item[]
|      `- Place?
|- Unscheduled Item[]  // Item.dayId = null
`- derived ValidationIssue[]
```

- Item is the ordered thing the user plans to do; `sortOrder` is canonical sequence truth.
- Place contains spatial data only.
- There is no V1 Leg entity.
- A separately planned/booked/timed movement is a Transport Item.
- Hotel is one cross-day Item; intermediate days use derived Hotel Context.
- SQLite is durable truth; Map and Timeline are projections of the same Item data and share selection state.

### V1 non-goals

Do not add AI itinerary generation, cloud sync, authentication, collaboration, social features, a global Wishlist or Place library, automatic routing, turn-by-turn navigation, live traffic, ticket management, budget, weather, packing lists, photo journals, check-ins, or gamification.

---

## 2. Stage 06 Corrections Already Accepted

Do not reopen these corrections:

1. Exact time uses `startDateTime` and `endDateTime`, not one `exactTime`.
2. `DayPeriod` has exactly `morning`, `afternoon`, `evening`, and `night`.
3. Navigation uses Expo Router.
4. SQLite initialization enables foreign keys and semantic writes use exclusive transactions.
5. Commands depend only on the repository capabilities they use.
6. Pre-commit validation reads through the active transaction state.
7. Post-review reconciliation removes Leg entirely from canonical V1; M8 is retired/reserved.
8. Query invalidation accounts for Unscheduled, cross-day Items, structural moves, and deleted Trips.
9. Item Undo does not reinsert Place snapshots and must restore adjacency metadata atomically.
10. `GenericPayload` is not a V1 arbitrary-data escape hatch.
11. V1 is iOS-only: AMap + GCJ-02 for mainland-China Trip sessions, Google Maps/Places + WGS84 for overseas Trip sessions.
12. M4 uses an Expo Development Build and contains a mandatory real-device renderer/CRS gate.

---

## 3. Heavy Traveler Findings and Product Arbitration

| ID | Real travel scenario | Final decision | V1 treatment |
|---|---|---|---|
| UX-01 | A whole Trip moves from 3/10-3/16 to 3/11-3/17 | ACCEPT | Support explicit shift-items vs keep-calendar-dates semantics. |
| UX-02 | Half of today's plan is not visited | DEFER | Do not add visited/skipped state in V1. Describe Footprint as saved spatial itinerary/history, not verified visitation. |
| UX-03 | A traveler needs to navigate to the next stop | ACCEPT | Add provider-aware handoff to AMap or Google Maps. Do not build navigation. |
| UX-04 | One Trip contains mainland-China and overseas destinations | DEFER | V1 Trip uses one stable region session; split cross-region travel into separate Trips. |
| UX-05 | A train or flight has two spatial endpoints | DEFER | Keep lightweight text origin/destination in V1; do not add a ticketing-grade transport model. |
| UX-06 | Weather cancels four Items in one afternoon | DEFER | Keep explicit per-Item moves in V1; do not build a batch-edit framework yet. |
| UX-07 | A Trip contains 30 Unscheduled Places | ACCEPT | Add lightweight marker visibility or density control. |
| UX-08 | An empty Trip has no provider evidence | ACCEPT | Ask for the Trip's primary region using product language, not provider terminology. |
| UX-09 | Maps or search are unavailable on weak networks | ACCEPT WITH LIMIT | Existing itinerary, saved Places, and Timeline remain locally readable/editable; offline map packages are out of scope. |
| UX-10 | The same city is visited five times | KEEP | Preserve separate Trips/Items and aggregate display only. |

### Product decisions to preserve

- Keep Home as a map-centered environment. Keep one unified Trip Planning Workspace with Timeline-first planning and synchronized map context; do not add a traditional tab shell.
- Keep Timeline as an ordered itinerary, not a strict calendar or Todo list.
- Keep `none / period / exact` time precision and independent `isFixed` semantics.
- Keep Unscheduled separate from a global Wishlist.
- Keep repeated Place visits as independent Items.
- Keep Hotel as one cross-day Item.
- Keep Transport Item for separately planned/booked/timed transport. Treat ordinary movement / Leg UI as deferred unless usage proves a need.
- Keep gradual add, explicit Place confirmation, and lightweight Quick Edit.

---

## 4. Required Changes by Milestone

### Before M0/M1

No additional blocker.

```text
M0: READY
M1: READY
```

M0 must still satisfy all Stage 06 requirements for the corrected Migration 001, Expo Router, `PRAGMA foreign_keys = ON`, exclusive transaction behavior, rollback tests, and root engineering guardrails.

M1 must use a date-only helper that does not depend on device timezone conversion. `createTrip()` requires only Trip and Day transaction capabilities.

### Before M2

- Implement Item/Timeline/Quick Edit only; no Leg core.
- Do not expose user-visible permanent Item Delete before M11 Undo.

### Before M3

Change the date-range command to accept explicit product intent:

```ts
type ChangeTripDateRangeStrategy =
  | "shiftItems"
  | "keepCalendarDates";
```

Required behavior tests:

- shift a same-length Trip and all dated Items by the same day delta;
- keep Item calendar dates while reconciling Days;
- shorten a Trip without deleting Items;
- preserve cross-day Item intervals and return warnings when they become out of range.

### Before M4

- Persist `Trip.mapRegion = china_mainland | global` and use it as the stable provider selector.
- Add minimal Place repository/persisted fixture support before Map ↔ Timeline synchronization.
- Day marker IDs use Item occurrence IDs.
- Renderer contracts are marker/camera based; no required polyline.
- Use Xcode + Development Build + physical iPhone for final AMap/Google CRS gate.
- Prepare restricted provider keys/config and AMap privacy initialization outside Domain code.

### Before M5

- Add a lightweight state for showing or hiding Unscheduled markers.
- Define density/clustering so candidates do not obscure Trip-wide saved Place distribution.
- Implement revised Trip Overview / Day View semantics from the Product Realignment Amendment.

### Before M7

- Lock the native integration path for both Place providers. Prefer official iOS SDKs behind thin Expo modules or a specifically reviewed maintained binding.
- Do not place unrestricted provider Web Service keys in the client.
- Add `openPlaceInExternalMap()` or an equivalent provider-aware system handoff.
- Keep the handoff outside Domain semantics; it is an infrastructure/presentation capability.
- Keep explicit Place Preview confirmation and provider-native coordinate snapshots.

### Before M9

- Do not apply a naive `endDateTime < startDateTime` comparison to cross-timezone Transport Items when offsets/time zones are unavailable.
- In V1, only enforce that validation when both values are known to share a travel-local time basis.
- Continue using common Item `startDateTime/endDateTime`; do not duplicate canonical time in payload.

### Before M10

Run M10-T0 to select one Home renderer and validate mixed WGS84/GCJ-02 projection/alignment. Do not treat MapKit as locked before that gate.

Home V1 UI **does include** the accepted compact persistent Trip-list Bottom Sheet in addition to map markers/clusters, filters, Active Trip, preview, Continue Today and Create FAB.

### Before M11

- Implement the corrected Stage 06 Item Undo snapshot.
- Restore position and adjacency atomically.
- Remove bridge Legs created by deletion and restore surviving edge metadata where available.

### Before M12/M13

- Verify existing itinerary data remains readable and editable when map tiles/search are unavailable.
- Add release checks for provider key restrictions, AMap privacy initialization, privacy manifests, archive build, and current provider licensing requirements.

---

## 5. Architecture Decisions

### Required

- Add date-range change strategy to the Application Command.
- Persist or otherwise deterministically restore the user-facing Trip region choice.
- Lock PlaceProvider native integration before M7 implementation.
- Define the Home Map renderer and CRS projection policy before M10.
- Scope Transport interval validation to time values that are actually comparable.

### Recommended

- Keep provider key/config checks centralized in infrastructure startup diagnostics.
- Add Unscheduled marker visibility as presentation state, not Domain state.
- Treat external-map handoff as a small platform service.
- Keep local Timeline and saved Place data usable without map-network availability.

### Already correct

- React Native + Expo + TypeScript on iOS.
- Expo Router.
- Expo SQLite as durable local persistence.
- Exclusive semantic transactions and enabled foreign keys.
- TanStack Query for read/cache orchestration.
- Zustand for interaction state only.
- Repository and semantic Application Command boundaries.
- Shared read models and projections.
- Thin, asymmetric Renderer adapters.
- First-class CRS typing and provider-native coordinate storage.
- Development Build after custom native code is introduced.

### Rejected

- Replacing the app with native Swift.
- Forcing both map providers behind identical custom Swift bridges.
- Dynamically switching Renderer while panning.
- Mounting two native renderers in the Home view.
- Adding backend/auth/cloud merely to proxy the current local-first architecture.
- Adding CQRS, CommandBus, event sourcing, a DI container, or a plugin framework.
- Implementing RouteProvider/Leg, AI, or sync without a future user-approved use case.

---

## 6. Backlog Amendments

| Milestone | Final backlog amendment |
|---|---|
| M0 | Correct Migration 001: `map_region`, `start_datetime/end_datetime`, no `legs`; rebuild disposable dev DB if needed. |
| M1 | Trip/Day persistence remains valid; include `mapRegion` in create/edit contract. |
| M2 | Item + Ordered Timeline + Quick Edit; no Leg; no exposed permanent Delete. |
| M3 | Add date-range strategy + Item-only reorder/move/Unscheduled tests. |
| M4 | Add minimal Place persistence, marker-only dual-renderer contract, Item-ID markers and CRS gate. |
| M5 | Implement realigned Overview/Day/Selected UI, occurrence preview, Place-less numbering and Unscheduled density. |
| M7 | Lock native PlaceProvider integrations + external map handoff. |
| M8 | Retired/reserved; no implementation. |
| M9 | Hotel/Transport specialization over common time interval; no Leg acceptance. |
| M10 | Home renderer/CRS decision + accepted compact Trip list sheet. |
| M11 | Item Delete + Undo together; no Place/Leg snapshots. |
| M12 | Offline local-data usability + Place/mapRegion persistence; no Leg metadata checks. |
| M13 | Beijing/Sample + repeated Place + Place-less + CRS/provider/privacy/archive gates. |

Do not renumber M9–M13 after retiring M8.

## 7. Explicitly Rejected Suggestions

Future agents must not re-propose the following as V1 requirements without new evidence:

1. **Item visited/skipped/completed state**: it would push Timeline toward a Todo model. Correct Footprint wording first and validate the need through real use.
2. **Built-in navigation or automatic routing**: external-map handoff is sufficient for V1.
3. **Batch itinerary editing framework**: per-Item movement is acceptable until usage proves otherwise.
4. **Structured origin/destination Place IDs for Transport**: useful later, but not required for the lightweight V1 transport model.
5. **One mixed-region Trip dynamically switching AMap and Google**: split cross-region travel into separate Trips in V1.
6. **Offline map downloads**: local itinerary availability is required; offline tiles are not.
7. **One unified map SDK**: the locked regional provider strategy is intentional.
8. **Symmetric native bridges**: Google may use `react-native-maps`; only AMap requires the custom thin view unless evidence changes.
9. **Backend, authentication, cloud sync, or AI runtime**: these contradict current personal-first local-first scope.
10. **A larger Clean Architecture framework**: current Repository, Command, Projection, and UI boundaries are sufficient.

---

## 8. Final Change List

| ID | Severity | Stage | Problem | Decision | Required change |
|---|---|---|---|---|---|
| CL-01 | MAJOR | 02/05/06 | Trip date shift/keep behavior is missing from the command | ACCEPT | Add strategy, UI intent, and M3 regression tests. |
| CL-02 | MAJOR | 02/03/06 | During Trip has no external map handoff | ACCEPT | Add provider-aware open action in M7. |
| CL-03 | MAJOR | 04/05/06 | PlaceProvider native integration is not locked | ACCEPT | Select official SDK/thin Expo module path before M7. |
| CL-04 | MAJOR | 04/06 | Empty Trip provider choice is not deterministic | ACCEPT | Add user-facing Trip region choice and deterministic restoration. |
| CL-05 | MAJOR | 04/06 | Home mixed-CRS renderer policy is unresolved | ACCEPT | Add M10-T0 renderer/conversion decision. |
| CL-06 | MINOR | 01/03 | Footprint can imply verified visits | CHANGE | Clarify product language; defer visit states. |
| CL-07 | MINOR | 03 | Many Unscheduled markers can obscure the route | ACCEPT | Add visibility/density control. |
| CL-08 | MINOR | 06 | Cross-timezone Transport can be incorrectly validated | ACCEPT | Restrict interval comparison in M9. |
| CL-09 | MINOR | 05/06 | Item delete may be exposed before Undo | ACCEPT | Delay delete UI or move minimal Undo forward. |
| CL-10 | MINOR | 06 | Provider release configuration lacks explicit acceptance | ACCEPT | Add key/privacy/archive checks to M4/M7/M13. |
| CL-11 | MINOR | 06 | Stage 06 final code block/recommendation is truncated | ACCEPT | Repair document formatting when Stage 06 is next edited. |
| CL-12 | DEFER | 02/05 | Transport has no two-Place model | DEFER | Keep text endpoints in V1. |
| CL-13 | DEFER | 03 | No visited/skipped state | DEFER | Reassess from V1.x usage evidence. |
| CL-14 | DEFER | 03 | No batch movement | DEFER | Reassess after real itinerary editing. |
| CL-15 | DEFER | 04 | No offline map packages | REJECT FOR V1 | Require local data usability only. |

Severity meanings:

- `BLOCKER`: prevents development from starting.
- `MAJOR`: must be corrected before the affected milestone.
- `MINOR`: correct during the affected milestone without blocking earlier work.
- `DEFER`: deliberately outside V1 or awaiting usage evidence.

There are no current `BLOCKER` items.

---

## 9. M0/M1 Final Readiness

### M0: READY

Startup conditions:

- macOS with a supported Xcode version;
- current stable Expo + React Native + TypeScript project;
- Expo Router root stack;
- corrected Migration 001;
- `PRAGMA foreign_keys = ON` verified by test;
- exclusive transaction commit/rollback tests;
- typecheck, lint, and unit-test scripts;
- root `AGENTS.md` containing Stage 06 guardrails.

### M1: READY

Startup conditions:

- M0 exit gate passes;
- Trip/Day-only capability-shaped transaction dependency;
- timezone-independent date-only range helper;
- atomic Trip plus inclusive Day creation;
- temporary Create Trip UI and Home list sufficient to prove restart persistence;
- no Item, Map, PlaceProvider, Zustand, Bottom Sheet, AI, cloud, or routing work leaks into M1.

---

## 10. External Technical Verification

These findings validate implementation feasibility but do not replace the document-derived product decisions.

### Expo Development Build and native modules

- Expo supports local iOS Development Builds on macOS through Xcode and `npx expo run:ios`.
- A local Expo module can contain Swift code and native views.
- Native dependency or app-config changes require regeneration/rebuild; JavaScript-only changes do not.

Sources:

- https://docs.expo.dev/develop/development-builds/introduction/
- https://docs.expo.dev/modules/get-started/

### Expo SQLite

- `PRAGMA foreign_keys = ON` must be explicitly enabled.
- `withTransactionAsync()` can include unrelated concurrent queries.
- `withExclusiveTransactionAsync()` confines transaction work to the transaction object and matches Stage 06's semantic transaction requirement.

Source:

- https://docs.expo.dev/versions/latest/sdk/sqlite/

### Google Maps and Places for iOS

- Native SDK setup requires Xcode, enabled billing, API keys, and app configuration.
- Keys should be restricted to the iOS application/bundle where supported.
- Maps and Places include native privacy manifest considerations for App Store release.

Sources:

- https://developers.google.com/maps/documentation/ios-sdk/config
- https://developers.google.com/maps/documentation/places/ios-sdk/start

### AMap for iOS

- AMap provides separate iOS Map and Search SDK packages and supports markers, polylines, camera operations, POI search, and reverse geocoding needed by the V1 adapter contracts.
- Current AMap SDK use requires privacy-consent initialization before SDK calls.
- Public or commercial distribution may require licensing beyond short-term personal testing; verify current terms before release.

Sources:

- https://lbs.amap.com/api/ios-sdk/summary
- https://lbs.amap.com/api/ios-sdk/guide/create-project/cocoapods

---

## 11. Development Rule of Thumb

For each task:

```text
one bounded goal
-> one owning module
-> explicit invariants and non-goals
-> focused tests
-> typecheck/lint
-> diff review
-> manual app check when applicable
```

Do not batch multiple milestones into one autonomous implementation request. If a future review proposes a larger architecture or V1 feature, first check whether it appears in the Explicitly Rejected Suggestions or Final Change List above.

Final direction:

> Continue M0/M1. Before M4/M5, apply the user-approved Product Realignment: plan storage / Ordered Timeline is the Trip core, Map is the synchronized spatial aid, and route planning/navigation remain external.