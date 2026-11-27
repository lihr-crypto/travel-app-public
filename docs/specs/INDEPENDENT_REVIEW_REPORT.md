# Travel App — Independent Review Report

> Date: 2026-09-11  
> Review type: Post-Stage-06 product realignment review  
> Development status assumed: M0 in progress  
> Development environment: macOS + Xcode + iOS Simulator / physical iPhone  
> Scope: Product semantics, UI/navigation, domain model, architecture, milestones, Codex executability, and visual references  
> Review behavior: Review only; no product redesign and no direct modification of Stage 01-06

## 0. Executive Summary

### Executive Verdict

```text
GO WITH CORRECTIONS
```

The revised product direction is sound:

```text
Canonical plan
Trip -> Day -> Ordered Items

Primary Trip planning projection
Ordered Timeline

Spatial aid
Map projection of saved Places
```

The same model and UI can cover Beijing city tourism, Sample road trips, and multi-city travel. The differences are data density, geographic extent, and Item content rather than navigation or screen structure.

M0 does not need broad rollback. M1 remains safe to start. However, the document pack is not yet safe for blind coding-agent execution from M2 onward because it still contains mutually incompatible instructions concerning:

1. whether `Leg` is required at all;
2. whether `legs` belongs in Migration 001;
3. whether `Trip.mapRegion` is persisted;
4. whether M8 adds or removes user-visible Leg behavior;
5. whether Map projections and renderer contracts require polylines;
6. whether the old `exactTime / exact_time / noon` model remains canonical;
7. whether Home MapKit is locked or still an M10 decision.

The most important immediate action is to settle the Leg branch before M0-05/M2. If Leg has not been implemented, this review recommends deferring it completely from V1.

---

## 1. Review Scope and Sources

The following files were read in full:

1. [00-PRODUCT-REALIGNMENT-AMENDMENT.md](00-PRODUCT-REALIGNMENT-AMENDMENT.md)
2. [REVIEW_GUIDE.md](REVIEW_GUIDE.md)
3. [MANIFEST.md](MANIFEST.md)
4. [travel-app-development-handoff.md](travel-app-development-handoff.md)
5. [AGENTS_PRODUCT_RULES.md](AGENTS_PRODUCT_RULES.md)
6. [travel-app-stage-01-product-foundation-rev-2026-09-11.md](travel-app-stage-01-product-foundation-rev-2026-09-11.md)
7. [travel-app-stage-02-v1-flow.md](travel-app-stage-02-v1-flow.md)
8. [travel-app-stage-03-ui-wireframe-spec.md](travel-app-stage-03-ui-wireframe-spec.md)
9. [travel-app-stage-04-technical-architecture-rev-2026-09-11.md](travel-app-stage-04-technical-architecture-rev-2026-09-11.md)
10. [travel-app-stage-05-development-spec-rev-2026-09-11.md](travel-app-stage-05-development-spec-rev-2026-09-11.md)
11. [travel-app-stage-06-final-engineering-review.md](travel-app-stage-06-final-engineering-review.md)
12. [travel-app-review-decision-record-2026-09-11.md](travel-app-review-decision-record-2026-09-11.md)

The following visual references were inspected:

- visual-reference/beijing-ui-reference.png（未随公开仓库发布）
- visual-reference/sample-ui-reference.png（未随公开仓库发布）

No Travel App implementation repository, `001_initial.sql`, or M0 source artifact was found in the available workspace. Therefore, M0 migration impact is reported with explicit branches for “not committed” and “already committed”.

---

## 2. Review Baseline and Precedence

The correct reading order is:

```text
Product Realignment Amendment
        ↓
non-conflicting Stage 01-03 product semantics
        ↓
revised Stage 04-05 architecture and implementation contracts
        ↓
Stage 06 corrections and post-review realignment
        ↓
Review Decision Record milestone decisions
```

This precedence is clearly documented in the Development Handoff and is suitable for future agents.

However, precedence alone is not sufficient when an older section contains executable TypeScript, SQL, task lists, or acceptance criteria. Coding agents often load only the relevant milestone section. A stale executable block can therefore override the intended amendment in practice even when the abstract precedence rule is correct.

Recommendation:

> Keep the precedence rule, but also remove or rewrite stale executable contracts in Stage 01-06. Do not rely on a top-of-file amendment to neutralize contradictory SQL, interfaces, and milestone tasks hundreds of lines later.

---

## 3. Product Core Review

### 3.1 Core requirement alignment

The realigned product now consistently answers the original need:

> Store, organize, browse, and edit a personal day-by-day ordered travel plan while using third-party products for discovery, route selection, traffic, and navigation.

The following separation is appropriate:

| Responsibility | Product owner |
|---|---|
| Trip dates and Days | Travel App |
| Ordered Items and time information | Travel App |
| Saved Place snapshots | Travel App |
| Day-by-day browsing and editing | Travel App Timeline |
| Spatial distribution of saved Places | Travel App Map |
| Place discovery and攻略 | Third-party products |
| Route alternatives and traffic | AMap / Google Maps |
| Turn-by-turn navigation | AMap / Google Maps |

This scope is tighter and more achievable than the earlier interpretation in which the Trip map carried route and Day-anchor semantics.

### 3.2 Core loop completeness

The V1 loop is complete:

```text
Create Trip
-> derive Days
-> add known Place or Custom Item
-> assign to Day or Unscheduled
-> set order, time, fixed state, and notes
-> browse/edit using Timeline
-> inspect Place distribution on Map
-> hand Place to external map when navigation is needed
-> retain Trip as saved itinerary/travel history
```

No route API, Leg UI, recommendation feed, or AI runtime is needed to complete this loop.

### 3.3 Product terminology

The revised documents correctly distinguish:

- Home as map-centered;
- Trip planning as Timeline-centered;
- Map as a Place-only synchronized projection;
- Footprint as saved itinerary/history rather than verified GPS visitation.

The remaining phrases “map-first”, “Trip Map”, or “A Trip is not a list with an attached map” are mostly historical naming. They become harmful only when they imply equal Map/Timeline responsibility or authorize route behavior. Those instances should be rewritten to use the canonical amendment wording.

---

## 4. Travel Shape Coverage

### 4.1 Beijing city tourism

The model handles Beijing well:

- many dense POIs become Place-bearing Items;
- Timeline order expresses the intended visit order;
- Day View filters to the selected Day;
- continuous marker numbering remains readable;
- Overview clustering controls density;
- repeated visits remain independent Item occurrences;
- restaurants, hotels, activities, and custom plans fit the same Item sequence.

Potential implementation risk:

- Day markers must use Item occurrence IDs, not Place IDs, otherwise repeated visits to the same Place collide.

### 4.2 Sample road trip

The same model handles Sample without a separate road-trip UI:

- camera fit handles a Day spanning 2 km or 300 km;
- Timeline order expresses intended progression;
- rural POIs can be created through Map Picker;
- a meaningful booked/timed transfer can be a Transport Item;
- a meaningful but non-POI event can be a Custom Item;
- external AMap handoff handles actual route selection and navigation.

Ordinary A-to-B movement does not need a persistent object merely because the trip is a road trip.

### 4.3 Multi-city and public-transport travel

The same model remains sufficient:

- intercity flight/train/ferry is a Transport Item;
- Hotel remains one cross-day Item;
- Day ownership and common time interval support overnight travel;
- Place remains optional, so non-spatial reminders remain valid Items.

Structured origin/destination Place IDs may be useful later, but the lightweight text fields are enough for V1 and avoid turning the app into a ticket manager.

### 4.4 Conclusion

No travel-shape-specific page hierarchy is required.

```text
Beijing
same screens + dense Places + short map extent

Sample
same screens + sparse Places + large map extent
```

This decision should remain locked.

---

## 5. Domain Model Review

### 5.1 Trip -> Day -> Ordered Items

This is sufficient as the canonical V1 model.

`sortOrder` is the source of sequence truth. Time is an independent Item property. This supports:

- plans without exact time;
- morning/afternoon/evening/night planning;
- booked exact-time events;
- reordering without manufacturing fake times;
- Place-less reminders;
- movement across Days and Unscheduled.

Persisted Days remain justified because they provide stable IDs, foreign keys, and predictable reconciliation when Trip dates change.

### 5.2 Place

Place has an appropriate narrow responsibility:

```text
name
provider-native coordinate + CRS
address
provider metadata snapshot
```

Place must not own itinerary order, Day, time, or completion state.

Keeping repeated Item occurrences independent is correct. Automatic Place merging by `providerPlaceId` should remain prohibited.

### 5.3 Item

Item is the correct unified ordered object for:

- sightseeing;
- food;
- hotel;
- activity;
- transport;
- custom plans.

Common fields should remain normalized. Arbitrary generic payload editing should remain prohibited.

### 5.4 Hotel

Hotel as one cross-day Item is appropriate.

- ownership Day = check-in/start Day;
- `startDateTime/endDateTime` = canonical interval;
- other Days derive Hotel Context;
- no duplicate check-in/check-out Items;
- no duplicate canonical timestamps inside payload.

### 5.5 Transport

Transport Item should remain the user-facing model for a separately planned, booked, or timed movement event.

V1 fields may remain lightweight:

```text
mode
serviceNumber
origin text
destination text
common startDateTime/endDateTime
```

Origin/destination Place IDs, ticket data, terminal models, and live status are deferred.

### 5.6 Leg

Under the realigned product, Leg no longer has an independent V1 user responsibility.

Item order already expresses:

```text
Item A
-> next in plan
Item B
```

No current behavior requires a separate persisted adjacency object:

- Timeline does not show Leg rows.
- Map does not draw Leg polylines.
- Users do not edit Leg mode/duration/distance.
- RouteProvider is not implemented.
- Navigation is handed to external map products.
- Validation has no essential Leg rule.
- Future AI can reorder Items without Leg.

Therefore, invisible Leg persistence is accidental complexity unless already required for compatibility with committed data.

---

## 6. Leg Final Recommendation

### Branch A: Migration 001 / Leg implementation not committed

**Recommendation: defer Leg completely from V1.**

Remove or do not create:

```text
legs table
Leg domain type
LegRepository
SqliteLegRepository
reconcileLegsForDay()
updateLeg()
Leg transaction capability
DayViewData.legs
DeletedItemSnapshot.affectedLegs
Leg preservation tests
Leg map/timeline projections
MapPolylineModel leg variant
RouteProvider implementation/interface file
future AI get_legs/update_leg tools
```

Item mutations then become:

```text
add/move/reorder/delete Item
-> reindex affected Item collections
-> validate through current transaction state
-> commit
-> invalidate affected read models
```

This does not remove any locked V1 behavior.

### Branch B: Leg schema/code already committed with data that must be preserved

Do not destructively roll back or drop the table.

Keep Leg as a private compatibility seam only:

- preserve existing rows and metadata;
- keep reconciliation only if code already depends on it;
- make the capability optional at command boundaries;
- do not add new route/provider metadata;
- do not expose Leg rows, polylines, mode, duration, or distance editing;
- do not let Leg affect the Timeline or Map product model.

### M8 consequence

The Leg decision must happen before M0-05/M2, not at M8.

M8 should not remain a development feature milestone. Preserve the numeric slot to avoid renumbering churn, but mark it retired/reserved after its checks are folded into earlier milestones.

---

## 7. UI and Navigation Review

### 7.1 Trip Overview

The revised hierarchy is sound:

```text
Top
Trip-wide scheduled Place distribution / clusters

Bottom
Day List + Unscheduled entry
```

Correct rules:

- no Day anchors;
- no D1/D2/D3 map sequence;
- no cross-Day routes;
- Day Row is primary Day navigation;
- Place marker opens occurrence Preview;
- repeated Place requires occurrence selection;
- no persistent introduction tab.

Required implementation clarification:

- Overview aggregates must retain underlying Item occurrence IDs.

### 7.2 Day View

The revised rules are unambiguous:

1. sort current-Day Items by canonical `sortOrder`;
2. filter to Place-bearing Items for Map;
3. number visible markers continuously from 1 to N;
4. show all Items in Timeline;
5. create no marker or numbering gap for a Place-less Item;
6. hide other Days by default;
7. do not draw a route/polyline.

This model works at both city and road-trip map extents.

Required implementation clarification:

- Day marker ID must be the Item occurrence ID.

### 7.3 Item Selected

Item Selected is correctly defined as a same-screen focus state.

```text
Marker tap or Timeline tap
-> same Item selection
-> selected row expands
-> corresponding marker highlights when Place exists
-> explicit Detail action navigates
```

For a Place-less Item, selection remains Timeline-only and must not emit a map-focus command.

For an Unscheduled Item, Back should return to Unscheduled rather than assuming a Day parent. This should be explicit in the selection-controller acceptance tests.

### 7.4 Bottom Sheet and gestures

The gesture ownership model is appropriate:

- Map owns pan/pinch.
- Sheet header owns resize.
- Day header owns horizontal Day switching.
- Timeline owns vertical scroll.
- Item long press enters reorder.
- Map Picker hides/disables the normal Trip sheet.

No global gesture manager is needed.

### 7.5 Home Map ambiguity

The visual references show a persistent “我的旅行” Bottom Sheet containing a Trip list. Stage 03 Home layout and M10 backlog mainly specify:

- map;
- filters;
- active Trip card;
- Trip marker/preview;
- Create Trip FAB.

The list is therefore a hidden visual requirement unless explicitly accepted.

M10 must decide one of the following:

```text
A. Home has a compact persistent Trip-list sheet.
B. Home remains map + active card/filter/marker preview only.
```

Do not let the visual reference silently decide implementation scope.

---

## 8. Visual Reference Review

### 8.1 Shared contract

The Beijing and Sample boards correctly use the same five-state sequence:

```text
01 Home Map
02 Trip Overview
03 Day View
04 Item Selected
05 Add Item / Search
```

Both use the same:

- top-level hierarchy;
- Bottom Sheet composition;
- Day navigation concept;
- Item selection behavior;
- marker visual language;
- Timeline structure;
- Add/Search screen.

The boards therefore support the “one UI for all travel shapes” decision.

### 8.2 Correct differences

The differences are data-driven and appropriate:

| Beijing | Sample |
|---|---|
| dense urban Places | sparse regional Places |
| short Day extent | wide Day extent |
| attractions and restaurant/hotel mix | scenic stops, meals, and lodging |
| city-scale camera fit | regional camera fit |

### 8.3 Visual inconsistencies and coverage gaps

1. The Day maps contain visual lines that can be interpreted as marker-connecting routes. Remove them from the V1 reference or mark them explicitly as non-implementable decoration.
2. The Home screens contain a Trip-list Bottom Sheet not clearly defined in the Home specification or M10 backlog.
3. Neither board demonstrates a Place-less Item, so the no-marker/no-gap rule is not visually tested.
4. Neither board demonstrates repeated Place occurrence selection.
5. The Add/Search board focuses on Place-backed categories and does not show the separate Custom Item path. This is acceptable for a reference board but must not be read as the full Add flow.

The boards are useful references, but they must remain subordinate to written acceptance criteria.

---

## 9. Architecture Review

### 9.1 Architecture that still fits the product

Keep:

```text
React Native + Expo + TypeScript
Expo Router
Expo SQLite
Repository boundary
semantic Application Commands
capability-shaped transaction dependencies
TanStack Query for reads/cache
Zustand for interaction state only
shared read models and projections
TripFocus discriminated union
CRS-aware Coordinate
provider-native Place snapshots
thin region-specific map/provider adapters
Expo Development Build for native AMap integration
```

These boundaries protect real V1 behavior and do not require enterprise frameworks.

### 9.2 Time contract inconsistency

Stage 04/05 still show the obsolete model:

```text
exactTime / exact_time
noon
Hotel payload timestamps
Transport payload timestamps
```

Stage 06 correctly replaces it with:

```text
startDateTime
endDateTime
period = morning | afternoon | evening | night
```

Hotel and Transport must use the common interval. Their payloads contain only genuinely type-specific sparse fields.

The corrected Stage 06 M0-05 task is executable, but Stage 04/05 canonical examples should be rewritten to prevent agents from generating the old schema.

### 9.3 Trip region conflict

The pack currently says both:

```text
Trip.mapRegion is a locked persisted selector
```

and:

```text
provider choice should remain presentation/session state
and should not be stored in Trip
```

This must be resolved before M4.

Recommended canonical contract:

```ts
type TripRegion = "china_mainland" | "global";
```

Persistence:

```text
trips.map_region
```

Semantics:

```text
china_mainland
-> AMap renderer
-> AMap PlaceProvider
-> GCJ-02 provider-native snapshots

global
-> Google renderer
-> Google PlaceProvider
-> WGS84 provider-native snapshots
```

It is a user-facing trip-region choice, not a provider SDK identifier. It does not switch based on phone location or map panning.

To avoid disturbing M0/M1, it may be introduced by a migration immediately before M4. If Migration 001 is still freely editable, including it initially is also acceptable, but the choice must be documented consistently.

### 9.4 M4 hidden Place dependency

M4 requires:

- Item-to-Marker synchronization;
- DayMapProjection;
- real renderer selection and camera behavior.

But Stage 05 introduces Place domain/repository only in M7. M4 can therefore only demonstrate fixtures rather than a persisted vertical slice.

Recommended correction:

Move the minimum Place domain/repository and persisted fixture support to M4. Keep provider search, Place Preview, Map Picker, and network adapters in M7.

### 9.5 Renderer contract

For V1, the shared renderer contract needs:

```text
markers
camera / fit coordinates
marker press
map press
viewport/camera events for Map Picker and focus
```

Polylines are not needed by any current V1 projection. They should be removed from M4 acceptance and from the required AMap native bridge. A future capability can add them through a later interface change.

### 9.6 Home renderer conflict

The Handoff states that Home uses Apple Maps/MapKit through the default `react-native-maps` provider. Stage 06 and the Review Decision Record leave the Home renderer and mixed-CRS projection as an M10 decision.

Do not treat MapKit as locked until a real mixed-CRS fixture test demonstrates the chosen conversion and alignment behavior.

M10-T0 should decide:

- one Home renderer;
- its display CRS contract;
- conversion of stored WGS84/GCJ-02 coordinates;
- acceptable alignment error;
- behavior when conversion is unavailable.

### 9.7 Unnecessary future infrastructure

Do not create the following only because older architecture diagrams name them:

- RouteProvider code;
- AI tool schemas or runtime;
- cloud/sync interfaces;
- CommandBus/CQRS/event sourcing;
- generic payload framework;
- global soft-delete system;
- symmetric custom native bridges for Google and AMap.

---

## 10. P0 / P1 / P2 Findings

Severity definitions:

- `P0`: must be resolved before the currently affected M0 task or before creating the canonical initial schema.
- `P1`: must be resolved before the owning milestone.
- `P2`: documentation cleanup, acceptance coverage, or non-blocking simplification.

### P0

| ID | Problem | Evidence | Impact | Required correction |
|---|---|---|---|---|
| P0-01 | Leg is simultaneously optional and mandatory in Migration 001/M2 | Amendment §5; Stage 06 C-07, M0-05, M2/M3/M8 | The initial schema can force an unused cross-cutting subsystem into every Item mutation | Decide before M0-05. If uncommitted, defer Leg entirely. If committed with required data, preserve it as private compatibility only. |

There is no broad product or architecture P0 and no reason to restart M0.

### P1

| ID | Problem | Affected documents/sections | Owner |
|---|---|---|---|
| P1-01 | Executable Stage 04/05 time contracts still use `exactTime/exact_time/noon` | Stage 04 §8; Stage 05 §3-4; Stage 06 C-01/C-02 | M0-05 / M2 docs |
| P1-02 | `Trip.mapRegion` persisted versus session-only conflict | Handoff locked decisions; Stage 03 §6.6; Stage 04 §21; Stage 06 §6.2 | Before M4 |
| P1-03 | Stage 06 simultaneously removes and mandates M8 Leg UI | Stage 06 §2.5, C-07, Final Backlog, §11 M8 | Before M2; backlog cleanup |
| P1-04 | M4 requires Place-based synchronization before Place persistence exists | Stage 04/05 M4 versus M7 | M4 |
| P1-05 | Trip date-range UI has two strategies but command input has none | Stage 02 §15; Stage 05 §8.1; Review Record Before M3 | M3 |
| P1-06 | Marker IDs do not explicitly preserve Item occurrence identity | Stage 03 repeated Place; Stage 04/05 MapMarkerModel | M4/M5 |
| P1-07 | Handoff locks Home MapKit while Stage 06 leaves it open | Handoff locked decisions; Stage 06 §6.4; Review Record Before M10 | M10 |
| P1-08 | Home visual Trip list is not part of written M10 scope | Stage 03 Home; Stage 05/06 M10; both visual boards | M10 |
| P1-09 | PlaceProvider native integration is not executable enough | Stage 04/05 provider adapters; Review Record Before M7 | M7 |
| P1-10 | User-visible delete appears earlier than Undo milestone | Stage 05 M2 versus Stage 03 §6.11/M11 | M2/M11 |

### P2

| ID | Problem | Correction |
|---|---|---|
| P2-01 | Stage 01 still contains simple-polyline and later-road-routing wording | Remove the obsolete §5.3 route flow and “map absolute core / 75%” final decision. |
| P2-02 | Stage 02 reorder still says map connection lines update | Replace with marker-number update only. |
| P2-03 | Stage 03 component draft still lists DayMarker, LegPolyline, and LegRow | Remove them from the V1 component boundary. |
| P2-04 | Stage 04/05 retain unused polyline/RouteProvider/future Leg tools | Mark out of V1 or remove until a real consumer exists. |
| P2-05 | Visual boards do not cover Place-less or repeated Place states | Add test fixtures/acceptance examples; no full board redesign required. |
| P2-06 | Unscheduled display wording varies between “all shown” and threshold/toggle | Use Stage 03 threshold/toggle semantics consistently. |
| P2-07 | Final Stage 06 invariant can be read as Map/Timeline equality | Replace it with the amendment’s Timeline-primary, Map-spatial-aid invariant. |
| P2-08 | `TripMap` naming remains after Trip Planning Workspace realignment | Rename opportunistically when touching the module; no standalone refactor. |

---

## 11. Effect on Current M0

### No rollback required

The following M0 work remains valid:

- Expo + React Native + TypeScript bootstrap;
- Expo Router root stack;
- root engineering guardrails;
- lint/typecheck/test setup;
- Expo SQLite initialization;
- `PRAGMA foreign_keys = ON`;
- exclusive semantic transaction wrapper;
- initialization shell;
- empty Home;
- M0 verification gate.

### M0-05 decision point

Before completing Migration 001:

1. use `start_datetime` and `end_datetime`;
2. do not use `exact_time`;
3. use exactly four DayPeriod values at the domain layer;
4. decide the Leg branch;
5. do not add route geometry merely for future use.

### If Migration 001 exists only in a disposable development database

It is reasonable to revise Migration 001 and rebuild the development database before M0 exit. This is not a product rollback; it is correcting the initial schema before user data exists.

### If Migration 001 is already committed with data that cannot be discarded

Do not destructively drop `legs`. Keep it unused/private and remove the requirement to expand it into M2/M8 product behavior.

### TripRegion timing

`mapRegion` need not block M0/M1. It may be added by Migration 002 before M4 after the documents settle its canonical values and creation/edit flow.

---

## 12. M1-M13 Final Milestone Review

| Milestone | Readiness | Required adjustment |
|---|---|---|
| M1 | READY | Keep Trip/Day persistence, inclusive date helper, temporary Create Trip UI, and restart proof. No Map/Place/Leg work. |
| M2 | READY AFTER LEG DECISION | Implement Item, Timeline, Quick Edit. If Leg is uncommitted, remove Leg core. Do not expose permanent Delete before Undo. |
| M3 | CORRECTION REQUIRED | Implement reorder/move/Unscheduled without Leg dependency in the deferred branch. Add `shiftItems \| keepCalendarDates`. |
| M4 | CORRECTION REQUIRED | Add `mapRegion` persistence, minimal Place persistence, dual-renderer/CRS gate, Item-ID markers, and marker-only renderer contract. |
| M5 | MOSTLY READY | Implement revised Overview/Day/Selected contract. Add repeated occurrence, Place-less numbering, Unscheduled density, and no-polyline acceptance. |
| M6 | READY | Keep local drag preview and one semantic reorder write on drop. |
| M7 | CORRECTION REQUIRED | Keep provider search, Preview, Map Picker, snapshots, and external handoff. Lock native provider integration before implementation. |
| M8 | RETIRE / RESERVE | Fold external-handoff check into M7 and Transport distinction into M9. Do not build Leg UI. Keep number reserved to avoid renumbering churn. |
| M9 | READY WITH CLEANUP | Keep Hotel/Transport specialization and common interval; remove Leg-oriented acceptance and duplicate time payloads. |
| M10 | DECISION REQUIRED | Add Home renderer/CRS spike and decide whether the Home Trip-list sheet is in scope. |
| M11 | READY AFTER LEG BRANCH | Undo snapshot never contains Place. In the deferred-Leg branch it also contains no Leg snapshot. |
| M12 | READY WITH CLEANUP | Verify local itinerary/Place usability offline; remove Leg metadata persistence acceptance when Leg is deferred. |
| M13 | READY WITH ADDED GATES | Add Beijing/Sample, repeated Place, Place-less Item, CRS, provider config/privacy, and archive checks. |

The milestone sequence remains generally good. There is no need to renumber M9-M13 after retiring M8.

---

## 13. Remaining Document Conflicts

### Conflict C-01: route semantics

- Amendment and revised Stage 03 prohibit route/polyline behavior.
- Stage 01 still authorizes a simple polyline and later road-route calculation.
- Stage 02 still says reorder updates the map connection line.
- Stage 03 component draft still contains LegPolyline.

### Conflict C-02: Leg decision

- Amendment says defer Leg if uncommitted.
- Handoff says minimal Leg exists from M2.
- Stage 05 schema/commands require Leg.
- Stage 06 C-07 leaves it open.
- Stage 06 M0/M2/M3/M8/test sections still force it.

### Conflict C-03: exact-time model

- Stage 04/05 show `exactTime/exact_time/noon` and duplicate payload times.
- Stage 06 and Handoff require `startDateTime/endDateTime` and four periods.

### Conflict C-04: Trip region

- Handoff and Stage 03 use persisted `Trip.mapRegion` semantics.
- Stage 04/06 provider-session sections discourage persistence.
- Stage 05 Trip/schema does not contain the field.

### Conflict C-05: Home renderer

- Handoff calls MapKit locked.
- Stage 06 and Review Record require an M10 decision.

### Conflict C-06: Home list

- Both visual boards show a persistent Trip-list Bottom Sheet.
- Stage 03 Home and M10 backlog do not define it.

### Conflict C-07: delete/Undo timing

- M2 includes delete baseline.
- Revised Stage 03 prohibits exposing Delete before Undo.
- Full Undo remains scheduled for M11.

### Conflict C-08: Unscheduled map density

- Stage 02 says all Place-bearing Unscheduled Items appear on the map.
- Revised Stage 03 adds a visibility control and hides counts above 20 by default.

---

## 14. Decisions to Keep and Stop Reopening

The following decisions were checked and remain appropriate:

1. iOS-only V1 developed on macOS with Xcode.
2. Personal-first and local-first product scope.
3. Home remains map-centered.
4. Trip planning is Timeline-centered.
5. `Trip -> Day -> Ordered Items` is the canonical planning model.
6. Map is a synchronized Place-only projection.
7. One UI/navigation model covers city tourism, road trips, and multi-city trips.
8. Trip Overview = Trip-wide Place distribution/clusters + Day List.
9. Day View = current-Day Place markers + complete Ordered Timeline.
10. Item Selected is a same-screen focus state.
11. Place-less Items remain fully orderable and create no marker/numbering gap.
12. Same Place occurrences remain independent Items.
13. Unscheduled is `dayId = null`, not Wishlist.
14. Hotel is one cross-day Item with derived Hotel Context.
15. Transport Item represents separately planned/booked/timed movement.
16. AMap + GCJ-02 serves mainland-China Trips.
17. Google Maps/Places + WGS84 serves global Trips.
18. Provider choice does not change with phone location or viewport panning.
19. Place Search is input assistance, not discovery/recommendation.
20. External-map handoff replaces in-app route/navigation scope.
21. SQLite is durable truth; Query and Zustand do not duplicate it.
22. Application Commands own semantic mutations.
23. Capability-shaped transactions replace a forced all-repository context.
24. Validation warnings do not silently mutate valid user data.
25. No AI runtime, cloud, auth, collaboration, social, ticketing, budget, weather, or route API in V1.

---

## 15. Explicitly Rejected Suggestions

Do not add the following as a response to this review:

- a separate road-trip screen;
- a Beijing-specific or Sample-specific layout;
- in-app navigation;
- automatic route generation;
- route alternatives, ETA, traffic, or closures;
- a destination recommendation system;
- a global Wishlist/Place library;
- Item visited/skipped/completed state in V1;
- a batch itinerary-editing framework;
- ticket-grade Transport modeling;
- dynamic AMap/Google switching within one Trip session;
- two simultaneous native map renderers on Home;
- backend/auth/cloud solely to support map providers;
- Clean Architecture layers beyond Repository/Command/Projection/UI;
- CommandBus, CQRS, event sourcing, generic DI, or plugin frameworks;
- offline map package downloads;
- AI tool/runtime implementation merely because future seams are discussed.

---

## 16. Final Recommended Change List

| ID | Severity | Owner | Required change | Timing |
|---|---|---|---|---|
| CR-01 | P0 | Stage 05/06 + M0-05 | Decide Leg branch; remove Leg from initial schema if uncommitted | Before M0-05 exit |
| CR-02 | P1 | Stage 04/05 | Replace obsolete exact-time, DayPeriod, and payload contracts | Before M2; SQL before M0-05 |
| CR-03 | P1 | Handoff/Stage 04/05/06 | Unify `Trip.mapRegion` persistence and values | Before M4 |
| CR-04 | P1 | Stage 06 | Remove stale M2/M3/M8 mandatory Leg instructions | Before M2 |
| CR-05 | P1 | Stage 04/05 | Move minimal Place persistence to M4 | Before M4 |
| CR-06 | P1 | Stage 02/05/06 | Add date-range strategy and tests | Before M3 |
| CR-07 | P1 | Stage 03/04/05 | Define Day marker ID as Item occurrence ID | Before M4/M5 |
| CR-08 | P1 | Stage 04/05/06 | Remove required polyline from renderer bridge and M4 acceptance | Before M4 |
| CR-09 | P1 | Handoff/Stage 06/Review Record | Reopen Home renderer only as M10-T0 decision | Before M10 |
| CR-10 | P1 | Stage 03/05/06/visual refs | Decide whether Home persistent Trip list belongs to M10 | Before M10 |
| CR-11 | P1 | Stage 05/06 | Retire M8 implementation and fold checks into M7/M9 | Before M2 backlog execution |
| CR-12 | P1 | Stage 05/06 | Ensure Delete is not user-visible before Undo | Before M2 UI ships |
| CR-13 | P1 | Stage 04/05/Review Record | Lock PlaceProvider native integration path | Before M7 |
| CR-14 | P2 | Stage 01/02 | Remove old route/map-connection wording | Documentation cleanup |
| CR-15 | P2 | Stage 03 | Remove DayMarker/LegPolyline/LegRow from V1 component draft | Documentation cleanup |
| CR-16 | P2 | Stage 03/05 | Add Place-less/repeated occurrence acceptance fixtures | Before M5 gate |
| CR-17 | P2 | Stage 02/03 | Normalize Unscheduled visibility threshold semantics | Before M5 |
| CR-18 | P2 | Stage 06 | Replace final equal-weight Map/Timeline invariant with amendment wording | Documentation cleanup |
| CR-19 | P2 | Handoff/Review Record | Stop listing the open Leg question as an already locked M2 decision | Immediately after CR-01 |
| CR-20 | P2 | M13 | Add dual-scenario, CRS, privacy/config, and archive release checks | Before release |

---

## 17. Final Readiness Decision

```text
M0
READY WITH ONE NARROW SCHEMA DECISION

M1
READY

M2+
DO NOT EXECUTE BLINDLY UNTIL CR-01 THROUGH CR-04 ARE INCORPORATED
```

Recommended immediate sequence:

```text
1. Confirm current M0-05 / Migration 001 state.
2. Resolve the Leg branch.
3. Update canonical Stage 04/05/06 contracts and Handoff.
4. Finish M0 verification gate.
5. Execute M1 unchanged.
6. Apply each later correction at its owning milestone.
```

Final conclusion:

> The product does not need another design stage. It needs one focused specification reconciliation pass, primarily to remove obsolete Leg and route assumptions from executable contracts. After that reconciliation, the revised design is suitable for milestone-by-milestone implementation by Codex or another coding agent.