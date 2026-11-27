# Travel App — Stage 06: Final Engineering Review & Execution Backlog

> Status: Final engineering review baseline  
> Scope: Cross-stage consistency review, execution-risk correction, final backlog, M0/M1 Codex tasks, execution order, and pre-development checklist  
> Reviewed baselines: Stage 01 Product Foundation, Stage 02 V1 Flow & Product Semantics, Stage 03 UI / Wireframe / Interaction Specification, Stage 04 Technical Architecture & Frontend Implementation Plan, Stage 05 Development Specification  
> Rule: Stage 06 does **not** add product features or reopen settled design. It only resolves contradictions, non-executable contracts, implementation risks, and avoidable complexity discovered by engineering review.
>
> **Map/platform amendment (2026-09-11, user-approved):** V1 is now explicitly **iOS-first/iOS-only for the initial implementation**. Mainland-China Trip sessions use AMap rendering + AMap place search; overseas Trip sessions use Google Maps + Google Places. This is an explicit post-review scope correction and supersedes earlier China-only/provisional-renderer wording where conflicting.
>
> **Product realignment amendment (2026-09-11, user-approved):** The V1 product goal has been re-confirmed as **personal travel-plan storage organized by Day and ordered Items**. Home remains map-centered as a travel-footprint/Trip-entry surface. Inside a Trip, the **Timeline / ordered itinerary is the primary planning and browsing view**, while the map is a synchronized **spatial projection** of saved Places. The app does **not** plan routes, choose route alternatives, recommend places, or replace AMap / Google Maps / Xiaohongshu-style discovery. Any earlier wording that makes Trip planning itself “map-first”, treats a Trip/Day as a route, requires Day anchors/routes, or implies automatic routing is superseded by this amendment. No M0 rollback is required.

---

# 0. Executive Verdict

## 0.1 Overall consistency

After final post-review reconciliation, the canonical baseline is:

- V1 is personal-first, iOS-only, local-first and manually planned.
- Home is map-centered; Trip planning is Day/Ordered-Timeline-centered.
- Core domain is `Trip / Day / Ordered Item / Place?`; V1 has no Leg entity.
- Unscheduled is `Item.dayId = null`.
- Days are derived from Trip date range but persisted for stable IDs.
- Trip lifecycle is derived from dates.
- `Trip.mapRegion` is persisted and selects AMap/GCJ-02 for mainland China or Google/WGS84 for global Trips.
- Timeline is the complete planning projection; Map is the synchronized Place-only spatial projection.
- SQLite is durable truth; Application Commands own semantic mutations; Query/Zustand do not duplicate canonical business state.
- Hotel is one cross-day Item; separately planned/booked/timed movement is a Transport Item.
- Route planning/navigation, AI, cloud, social, budget, weather, ticketing and similar systems remain outside V1.

No new design stage is required.

## 0.2 Review result

However, Stage 05 **cannot be executed literally as written** without corrections.

The review found several concrete execution problems:

1. the Stage 05 common Item time model regressed from a time interval to one `exactTime`, making already-defined V1 behavior and validation partially impossible;
2. navigation is left formally undecided even though the repository structure is already file-route shaped;
3. SQLite foreign-key activation and safe async transaction behavior are not explicit despite the design relying on FK/cascade/rollback semantics;
4. the all-repository `TransactionContext` conflicts with vertical-slice milestone sequencing;
5. M1 has an internal dependency-order problem and omits the Create Trip UI required by its own exit flow;
6. Item commands require Leg reconciliation before the Leg implementation milestone exists;
7. validation is specified inside a transaction but its contract is not transaction-aware;
8. some query invalidation and Undo details are insufficient for later cross-day/restore behavior;
9. The iOS dual-renderer strategy is locked: AMap for mainland-China Trip sessions and Google Maps for overseas Trip sessions. M4 must validate both native integrations and CRS alignment before productization.

## 0.3 Go / No-Go

```text
Stage 05 as-is
→ NO-GO for blind implementation

Stage 05 + Stage 06 corrections below
→ GO for M0 and M1

M4 dual iOS renderer integration/CRS validation
→ remains a mandatory product/technical gate before broad productization
```

Stage 06 is the final pre-development stage. No Stage 07/08 is required.

---

# 1. Review Precedence Rule

The documents are not five independent specifications. They form a refinement chain.

Use this rule during development:

```text
Stage 01  product foundation
    ↓
Stage 02  product-semantic corrections / V1 flow
    ↓
Stage 03  UI and interaction lock
    ↓
Stage 04  architecture translation
    ↓
Stage 05  executable engineering specification
    ↓
Stage 06  engineering errata + execution order
```

A later stage may refine an earlier implementation detail, but it must not silently remove an earlier locked product capability.

For development conflicts:

1. preserve locked Stage 01–03 product semantics;
2. use Stage 04–05 architecture unless Stage 06 explicitly corrects it;
3. Stage 06 corrections override the conflicting Stage 04/05 clause only;
4. everything not explicitly corrected remains frozen.

---

# 2. Apparent Cross-Stage Differences That Are NOT Problems

The following differences were reviewed and are accepted refinements. Do not reopen them.

| Earlier wording | Final interpretation | Review |
|---|---|---|
| Stage 01 Trip `status` field | lifecycle derived from dates | intentional Stage 02+ simplification |
| Stage 01 `name` vs later `title` | canonical engineering field is `title` | naming normalization only |
| Stage 01 active Trip tends toward today | normal open → Overview; explicit Continue Today → Today | Stage 03 interaction refinement |
| Stage 01 top App name | Stage 03 removes permanent App title to preserve map space | intentional UI refinement |
| Stage 02 Day `title?/note?` draft | omitted from Stage 04/05 canonical V1 Day | not in V1 Must Have; accepted simplification |
| Stage 02 Transport origin/destination Place IDs were suggested | Stage 05 uses lightweight transport payload fields | suggestion was not locked V1 identity semantics |
| ValidationIssue draft entity | derived, not persisted | intentional Stage 04 simplification |
| Route API seam exists | route implementation deferred | consistent with V1 non-goals |

No development task should re-litigate these items.

---

# 2.5 Post-Review Product Realignment (2026-09-11)

This is a user-approved product correction based on re-checking the original core need: **store and browse a day-by-day ordered travel plan** while continuing to use third-party apps for route planning, navigation and destination discovery.

It supersedes conflicting earlier product/UI wording without changing M0 readiness.

Locked product semantics:

1. Home remains the travel-footprint map / Trip-entry surface.
2. Inside a Trip, `Trip -> Day -> Ordered Items` is the primary planning structure.
3. Trip Overview map shows Trip-wide saved Place distribution/clusters; no Day anchors and no cross-Day routes.
4. Day View map shows only current-Day Place-bearing Items by default.
5. Day map marker numbers are continuous display numbers after filtering current-Day Items by itinerary order for Place-bearing Items.
6. Item Selected is a same-screen Day View focus state; explicit `详情` navigates to Item Detail.
7. Day Row is primary Day navigation; Overview Place markers use occurrence Preview before explicit Day entry.
8. No persistent Trip “简介” tab.
9. V1 does not require user-visible Leg rows, map polylines, distance/duration editing, route choice, ETA, traffic or in-app navigation.
10. Place Search is an input helper for known places, not recommendation/discovery.
11. Beijing city tourism and Sample road-trip data use the same UI/navigation; only map extent/density differs.

Milestone impact:

```text
M0 -> no change
M1 -> no domain/schema change required by product realignment
M2/M3 -> Ordered Timeline / reorder / Unscheduled become even more central
M4 -> revise DayMapProjection; no required polyline
M5 -> implement revised Trip Planning Shell
M7 -> keep Place input + external map handoff
M8 -> retired/reserved; no implementation
M10 -> Home Map remains valid
```

Open engineering review question:

> Final arbitration: Leg is removed from canonical V1. Correct a disposable initial migration before M0 exit; use a compatibility migration only if non-disposable data unexpectedly exists.

---

# 3. Required Stage 06 Corrections

## C-01 — Restore an executable exact-time interval contract

**Severity: P0 / must be resolved before Migration 001 is committed.**

Stage 01/02 support exact start/end time ranges and cross-midnight Items. Stage 04/05 reduce the common model to one `exactTime` / `exact_time` field while still defining:

- `END_BEFORE_START`;
- `FIXED_ITEM_TIME_CONFLICT`;
- cross-midnight activity semantics;
- Hotel check-in/out and Transport departure/arrival ranges.

A single common `exactTime` cannot express those semantics.

### Stage 06 canonical correction

Replace the single exact time with a start/end local travel datetime pair:

```ts
export type TravelLocalDateTime = string;
// YYYY-MM-DDTHH:mm
// travel wall-clock value; no UTC conversion is implied

export interface Item {
  // ...identity / ownership fields unchanged

  timeMode: TimeMode;
  startDateTime: TravelLocalDateTime | null;
  endDateTime: TravelLocalDateTime | null;
  period: DayPeriod | null;

  // ...remaining fields unchanged
}
```

Persistence:

```sql
start_datetime TEXT,
end_datetime   TEXT,
period         TEXT,
```

Remove:

```text
exactTime
exact_time
```

Canonical consistency:

```text
timeMode = none
→ startDateTime = null
→ endDateTime   = null
→ period        = null

timeMode = period
→ startDateTime = null
→ endDateTime   = null
→ period        != null

timeMode = exact
→ startDateTime != null
→ endDateTime may be null
→ period        = null
```

`dayId` remains ownership, not the source of truth for clock values. If a dated Item is moved to Unscheduled because a Trip is shortened, its time values are preserved and validation may warn that it lies outside the Trip range.

For V1, Hotel check-in/out and Transport departure/arrival should use the same canonical `startDateTime / endDateTime` pair and present type-specific labels in UI. Do **not** maintain a second canonical copy of those timestamps inside `payload_json`.

Transport payload may keep genuinely type-specific sparse fields such as:

```ts
type TransportPayload = {
  kind: "transport";
  mode?: string;
  serviceNumber?: string;
  origin?: string;
  destination?: string;
};
```

Hotel requires no separate time payload in V1; Hotel Context is derived from the Item type plus the common start/end interval.

This correction restores Stage 02 semantics while reducing duplicate time state.

---

## C-02 — Remove the extra `noon` DayPeriod

**Severity: P1 / resolve before M2 Item domain implementation.**

Locked V1 UI semantics define four period choices:

```text
上午 / 下午 / 傍晚 / 晚上
```

The later five-value enum introduces `noon` without a product requirement.

Final V1 enum:

```ts
export type DayPeriod =
  | "morning"
  | "afternoon"
  | "evening"
  | "night";
```

UI mapping:

```text
morning   → 上午
afternoon → 下午
evening   → 傍晚
night     → 晚上
```

Do not add a fifth period in V1.

---

## C-03 — Lock navigation to Expo Router

**Severity: P0 / resolve in M0.**

Stage 05 says the navigation library is not selected, but simultaneously fixes route-shaped files such as `_layout.tsx`, `index.tsx`, `[tripId].tsx` and `[itemId].tsx`.

Final implementation choice:

```text
Navigation library: Expo Router
Navigation model: Stack-style Home → Trip → Item Detail
```

Use the directory convention generated by the current stable Expo template. `src/app/` is acceptable and should not be moved merely to reproduce the older Stage 05 tree diagram; route ownership is more important than the physical root.

Do not add direct application imports from external `@react-navigation/*` packages merely to recreate the same stack manually.

This resolves ambiguity only; it does not change the Stage 03/05 navigation semantics.

---

## C-04 — Make SQLite FK and transaction guarantees explicit

**Severity: P0 / resolve in M0.**

The schema relies on foreign keys, cascade behavior, rollback and multi-entity semantic transactions. Those guarantees must be enabled/implemented, not assumed.

Database initialization must execute at least:

```sql
PRAGMA foreign_keys = ON;
```

`PRAGMA journal_mode = WAL;` is recommended but is not a business invariant.

For Expo SQLite asynchronous semantic writes, the database adapter should use the exclusive transaction API where available so unrelated async queries cannot accidentally join the active transaction.

Required tests:

```text
PRAGMA foreign_keys returns 1
Trip delete cascades owned Day rows
Day delete SET NULL behavior is observable in repository test
failed semantic transaction rolls back all writes
queries outside the transaction callback do not become part of the semantic write transaction
```

Do not let UI code access the SQLite handle directly.

---

## C-05 — Narrow transaction dependencies by command capability

**Severity: P0/P1 / required before M1 command implementation.**

Each command depends only on the repository capabilities it needs.

Canonical V1 context may expose:

```text
Trip / Day / Item / Place
```

Examples:

```ts
type CreateTripTx = Pick<TransactionContext, "trips" | "days">;
type ItemMutationTx = Pick<TransactionContext, "days" | "items">;
```

Do not force unused repositories into early milestones and do not introduce a DI container/CommandBus to solve this. The concrete database adapter still owns one atomic SQLite transaction.

## C-06 — Validation inside mutations must read the same transaction state

**Severity: P1 / resolve before M2–M3 mutations.**

Stage 05 orders mutation as:

```text
write
→ reconciliation
→ validation
→ commit
```

but exposes only:

```text
validateTrip(tripId)
```

If validation opens an independent read path, it may not see the uncommitted state it is supposed to validate.

Final rule:

```text
Validation invoked before commit must read through the current transaction context
or through a read model constructed from that transaction.
```

A valid implementation may use:

```ts
validateTrip(tripId, tx)
```

or an equivalent transaction-bound reader.

Do not persist ValidationIssue in V1.

---

## C-07 — Reconcile Leg dependency with the post-review product realignment

**Final decision: remove Leg completely from canonical V1.**

Rationale:

- Item `sortOrder` already expresses plan sequence;
- Timeline has no Leg row;
- Map has no route polyline;
- users do not edit ordinary movement metadata;
- navigation/route choice is delegated externally;
- no validation rule requires persisted adjacency.

Therefore do not create or require:

```text
legs table
Leg domain type / repository
updateLeg()
Leg transaction capability
Leg snapshot/Undo metadata
RouteProvider
Leg map/timeline projections
```

If an older disposable M0 development database already contains `legs`, correct Migration 001 and rebuild before M0 exit. If non-disposable compatibility data unexpectedly exists, preserve it privately through a forward migration exception, but it must not alter the canonical V1 domain or UI.

## C-08 — Tighten query invalidation for ownership and cross-day effects

**Severity: P1 / resolve incrementally when relevant commands appear.**

Final rules:

### Item detail mutation

Scheduled normal Item:

```text
invalidate current DayView
invalidate Trip Overview
```

Unscheduled Item:

```text
invalidate Unscheduled by Trip
invalidate Trip Overview
```

Cross-day Hotel/Transport interval changes:

```text
invalidate Trip Overview
invalidate all DayViews of that Trip for V1 simplicity
```

Daily datasets are small; a simple bounded over-invalidation is safer than stale Hotel Context.

### Structural Item mutations

Invalidate only:

```text
source DayView if any
target DayView if any
Unscheduled if source/target includes it
Trip Overview
```

### deleteTrip

Do not invalidate only `tripKeys.all`.

Also remove/invalidate all trip-scoped caches:

```text
trip detail
trip days
trip overview
unscheduled
day views belonging to that Trip
```

Do not build a generalized invalidation framework.

---

## C-09 — Simplify Delete/Undo snapshot

User-visible Item Delete ships only with Undo in M11.

```ts
export type DeletedItemSnapshot = {
  item: Item;
  previousItemId: EntityId | null;
  nextItemId: EntityId | null;
};
```

No Place or Leg snapshot is included.

Restore reinserts the Item, restores Day/Unscheduled ownership and relative position, reindexes the collection, validates through the active transaction, commits, and invalidates read models.

## C-10 — Do not use `GenericPayload` as a V1 dumping ground

**Severity: P2 / simplification.**

The arbitrary `GenericPayload { [key: string]: unknown }` weakens the TypeScript boundary and is not needed by the locked V1 product.

Rule:

```text
sightseeing / food / activity / custom
→ common normalized fields
→ payload = null unless a concrete V1 typed requirement exists
```

Keep the nullable `payload_json` column because Transport specialization requires sparse data and future migrations may add typed payloads.

Do not expose arbitrary raw payload editing to UI or future Agent tools.

---

# 4. Technical Risk Register

| ID | Risk | Likelihood | Impact | Stage | Treatment |
|---|---|---:|---:|---|---|
| R-01 | single `exactTime` cannot express V1 intervals | High | Critical | M0 schema / M2 domain | fixed by C-01 before Migration 001 |
| R-02 | FK actions silently inactive | Medium | High | M0 | `PRAGMA foreign_keys=ON` + test |
| R-03 | async query accidentally participates in transaction | Medium | High | M0–M3 | exclusive transaction adapter + rollback/concurrency test |
| R-04 | all-repo TransactionContext forces horizontal build | High | Medium | M1+ | capability-shaped transaction dependencies |
| R-05 | M1 exit flow cannot be exercised because Create Trip UI task is absent | High | High | M1 | add minimal temporary Create Trip UI |
| R-06 | Obsolete Leg dependency leaks into Item mutations | High | High | M0/M2/M3 | remove Leg from schema/domain/commands; Item order is sufficient |
| R-07 | pre-commit validation sees stale state | Medium | High | M2/M3 | transaction-bound validation |
| R-08 | stale query cache after unscheduled/cross-day/delete mutations | Medium | Medium | M2/M9/M11 | corrected invalidation helper |
| R-09 | Undo Place restoration conflicts with retained Place row | Medium | Medium | M11 | remove Place from snapshot restore path |
| R-10 | AMap iOS SDK requires custom native integration and cannot be treated as an Expo-Go-only dependency | Medium | High | M4 | thin Expo native view/module + Development Build; bridge only renderer capabilities used by V1 |
| R-11 | GCJ-02/WGS84 values cross the wrong renderer/provider boundary and create visible offset | Medium | High | M4/M7 | CRS-tagged coordinates + provider-native persistence + real AMap/Google fixture tests |
| R-12 | date-only Day generation drifts due JS timezone parsing | Medium | High | M1 | date-only helper + boundary tests; avoid careless UTC/local conversion |
| R-13 | AI-assisted tasks expand scope into future architecture | Medium | Medium | all | AGENTS.md + one-task-at-a-time review loop |
| R-14 | Trip Overview / Day spatial projection rules must follow post-review product realignment | Medium | Medium | M4/M5 | Trip-wide Place distribution in Overview; current-Day Place-only numbered projection in Day View; no Day anchors/routes; no schema change |
| R-15 | Google Maps/Places API key, billing or AMap key/privacy configuration blocks device builds | Medium | Medium | M4/M7 | keep secrets/config outside Domain; add manual provider smoke checklist and fail-fast configuration diagnostics |

---

# 5. Final Architecture Review

## 5.1 Keep — justified complexity

The following abstractions are justified and remain:

- Repository boundary between Application and SQLite;
- semantic Application Commands;
- shared read models and projections;
- `TripFocus` discriminated union;
- `MapRenderer / PlaceProvider` separation;
- CRS-aware `Coordinate`;
- persisted Day stable IDs;
- persisted `Trip.mapRegion`;
- ephemeral Undo instead of global soft delete.

There is no V1 Leg or RouteProvider abstraction.

## 5.2 Do not pre-build — unnecessary complexity

Do not create code merely because an older architecture diagram named a future seam.

Through M1, do not install/implement map SDKs, PlaceProvider SDKs, Zustand, Bottom Sheet, Hotel/Transport specialization, AI/cloud/auth/sync.

Across all V1 milestones, do not pre-build:

```text
Leg / LegRepository / reconciliation
RouteProvider
route polyline infrastructure
AI tool/runtime
cloud/sync interfaces
CommandBus/CQRS/event sourcing/plugin framework
```

Install dependencies only when the first owning milestone uses them.

# 6. Locked iOS Map / Place Provider Review

Trip map/provider policy:

```text
V1 platform → iOS only

Trip.mapRegion = china_mainland
→ AmapMapRenderer
→ official AMap iOS Map SDK
→ AmapPlaceProvider using official AMap iOS Search SDK
→ GCJ-02 provider-native Place snapshots

Trip.mapRegion = global
→ GoogleMapRenderer via react-native-maps + PROVIDER_GOOGLE
→ GooglePlaceProvider using Google Places SDK for iOS
→ WGS84 provider-native Place snapshots
```

Both PlaceProvider integrations sit behind thin Expo native modules/adapters. Provider keys/config/privacy setup stay outside Domain code. CI uses mocks; real-device smoke checks are milestone/release gates.

There is no V1 RouteProvider.

## 6.1 Native integration boundary

AMap map bridge exposes only:

```text
markers
camera / fit coordinates
map press
marker press
viewport/camera events required by focus / Map Picker
```

No polyline/navigation/3D bridge is required.

Google rendering uses `react-native-maps` + Google provider; Google Place input uses the Places SDK for iOS through the PlaceProvider adapter.

## 6.2 Persisted provider-session rule

Provider selection comes from persisted `Trip.mapRegion` and remains stable for the Trip session. It never switches because of phone location or viewport panning.

Mixed mainland-China/global Trips are outside V1 and should be split into separate Trips.

## 6.3 CRS rule

```text
china_mainland Place snapshot → GCJ-02
global Place snapshot         → WGS84
```

Coordinates always carry an explicit CRS tag. Conversion happens only at a presentation/provider boundary that requires it and must be tested with known fixtures.

## 6.4 Home Footprint Map boundary

Home is a cross-Trip surface that may contain both stored CRS families. Its renderer is **not pre-locked**.

M10-T0 must select one Home renderer and define/test:

```text
display CRS contract
WGS84 / GCJ-02 conversion path
alignment tolerance
fallback behavior
```

Do not mount AMap and Google renderers simultaneously in one Home view.

## 6.5 M4 gate

Before productization, M4 must prove on a Development Build / real iPhone:

```text
Google renderer + known WGS84 fixture aligns correctly
AMap renderer + known GCJ-02 fixture aligns correctly
persisted mapRegion chooses the expected stack
Day marker Item identity ↔ Timeline selection is bidirectional
Place-less Items do not create markers/numbering gaps
no polyline is required
```

# 7. Final Development Backlog

## Phase A — Bootstrap

### M0 — Bootstrap

Deliver a runnable, guarded, testable local app shell with SQLite and corrected Migration 001.

No product complexity beyond empty Home.

## Phase B — Core Prototype

### M1 — Trip + Day Persistence

Deliver the first complete persisted vertical slice:

```text
Home
→ minimal Create Trip
→ save
→ restart
→ Trip + inclusive Days still exist
```

### M2 — Item + Basic Timeline

Deliver Item persistence, basic Ordered Timeline and Quick Edit. No Leg/routing subsystem. Do not expose destructive Item Delete before M11 Undo.

### M3 — Itinerary Engine

Deliver reorder, move, Unscheduled and explicit Trip date-range strategies (`shiftItems | keepCalendarDates`). Structural mutations reindex Items only.

### M4 — Dual iOS Map Renderers + Map/Timeline Synchronization

Add minimal Place persistence, persisted `Trip.mapRegion`, marker-only renderer contracts, both iOS renderers/CRS fixtures, DayMapProjection and Item-occurrence selection synchronization. No polylines. **Mandatory human gate.**

## Phase C — Productization

### M5 — Final Trip Planning Shell

Implement the realigned Trip Planning Workspace: Trip-wide Place distribution + Day List in Overview; current-Day numbered Place markers + complete Timeline in Day View; same-screen Item Selected; repeated-Place occurrence Preview; Place-less numbering rules; Unscheduled density/toggle behavior.

### M6 — Drag Reorder Gesture

Connect long-press local preview to the already-tested reorder command.

### M7 — Place Search (AMap + Google) + Map Picker

Implement provider-native Place search adapters, explicit Preview confirmation, Map Picker, saved Place snapshot enrichment and provider-aware external-map handoff. Lock AMap official iOS Search SDK + Google Places SDK for iOS behind thin Expo native modules before implementation.

### M8 — Reserved / Retired

**RETIRED / RESERVED.** No implementation. Keep the numeric slot only to avoid renumbering later milestones.

### M9 — Hotel + Transport Specialization

Use common Item `startDateTime/endDateTime` as the canonical temporal interval. Add Hotel Context and Transport-specific non-time payload fields.

### M10 — Home Footprint Map

M10-T0 first selects/tests one Home renderer and mixed-CRS projection policy. Then implement Home markers/clustering, filters, active Trip, preview, Create FAB, Continue Today and the accepted compact persistent Trip-list Bottom Sheet.

## Phase D — Stabilization

### M11 — Validation + Undo Polish

Finalize warning UI, transaction-aware validation presentation and corrected Item Undo.

### M12 — Offline / Persistence Polish

Verify kill/restart, offline saved-itinerary editing, Item ordering, Place + `mapRegion` persistence, migrations and rollback. No Leg metadata persistence requirement.

### M13 — Stabilization

Critical E2E smoke, prototype cleanup, migration review, errors and performance sanity checks.

---

# 8. M0 — Codex-Executable Task Backlog

Run tasks one at a time. Do not give Codex the entire M0 as one prompt.

## M0-01 — Bootstrap current stable Expo TypeScript project

**Goal**

Create the minimal mobile project and use Expo Router as navigation.

**Scope**

- bootstrap current stable Expo + React Native + TypeScript;
- keep the current Expo Router route directory generated by the template (`src/app` is acceptable);
- preserve only a simple root stack; no tabs;
- commit the package lockfile.

**Acceptance**

```text
□ app starts
□ `/` route renders
□ TypeScript is enabled
□ no bottom tabs are introduced
□ no map/bottom-sheet/state-management dependency is added
□ no business domain code is implemented
```

**Non-goals**

```text
SQLite
Trip domain
Map
Design System
Theme engine
Auth
AI
Cloud
```

---

## M0-02 — Add root engineering guardrails

**Depends on:** M0-01

**Goal**

Create `AGENTS.md` before business implementation begins.

**Required guardrails**

Include at least:

```text
SQLite = durable business truth
UI never executes raw SQL
business mutations go through Application Commands
TanStack Query is cache/read orchestration only
no canonical domain collections in Zustand
Map and Timeline share one read model / TripFocus
coordinates always carry CRS
Unscheduled = dayId null
Trip shrink never silently deletes Items
Item `sortOrder` is authoritative; ordinary adjacency is not persisted in V1
exact Item time is startDateTime/endDateTime, not exactTime
no noon DayPeriod in V1
Expo Router is the navigation layer
no V2 feature implementation
no unrelated refactor
behavior changes require tests
```

**Acceptance**

```text
□ AGENTS.md exists at repository root
□ it references Stage 06 corrections
□ it is concise enough for an Agent to read every task
□ no implementation code is changed except trivial README/project references
```

---

## M0-03 — Establish quality scripts and unit-test harness

**Depends on:** M0-01

**Goal**

Make every later task mechanically reviewable.

**Scope**

Provide commands for:

```text
typecheck
lint
test
```

Use Expo/React-Native-compatible defaults rather than introducing a custom build system.

**Acceptance**

```text
□ typecheck command succeeds
□ lint command succeeds
□ one trivial unit test succeeds
□ scripts are documented in README/package.json
□ no arbitrary coverage threshold is configured
```

---

## M0-04 — Add Expo SQLite database initialization

**Depends on:** M0-02, M0-03

**Goal**

Create the infrastructure boundary for local persistence without implementing business repositories.

**Scope**

- install `expo-sqlite` with an Expo-compatible version;
- create database initialization module;
- execute `PRAGMA foreign_keys = ON` on initialization;
- optionally enable WAL;
- create an exclusive semantic transaction wrapper;
- keep SQLite handle inside infrastructure.

**Acceptance**

```text
□ database opens on app startup
□ PRAGMA foreign_keys reads back as 1
□ UI has no raw SQL import/call
□ transaction wrapper can commit
□ transaction wrapper can roll back on thrown error
□ tests demonstrate rollback behavior
```

**Non-goals**

```text
TripRepository
ItemRepository
PlaceRepository
ORM
Drizzle
Cloud database
```

---

## M0-05 — Implement migration runner and corrected `001_initial`

**Depends on:** M0-04

**Goal**

Create the canonical initial schema before user data exists.

**Required tables**

```text
schema_migrations
trips
days
places
items
```

Required canonical fields include:

```text
trips.map_region TEXT NOT NULL // china_mainland | global
items.start_datetime TEXT
items.end_datetime TEXT
items.period TEXT
```

Must not include:

```text
legs
exact_time
validation_issues
unscheduled_items
trip_status
```

**Acceptance**

```text
□ migration applies on an empty database
□ migration version is recorded exactly once
□ second initialization is idempotent
□ FK pragma is active
□ Trip/Day/Item/Place FK actions match Stage 05
□ schema contains map_region + start_datetime/end_datetime
□ schema contains no legs table and no exact_time column
```

If the current dev DB is disposable, rebuild it after correcting Migration 001 before M0 exit.

## M0-06 — Add minimal app initialization shell

**Depends on:** M0-04, M0-05

**Goal**

Ensure routing and database readiness have one deterministic startup path.

**Scope**

- root Expo Router layout;
- database initialization before business screens depend on it;
- simple loading/error boundary if initialization fails;
- no nested navigation stack inside future sheets.

**Acceptance**

```text
□ cold start runs initialization once
□ migration failure surfaces an explicit development-visible error
□ successful initialization renders Home
□ restart does not reapply Migration 001
```

---

## M0-07 — Render empty Home baseline

**Depends on:** M0-06

**Goal**

Leave M0 with a runnable UI surface.

**Scope**

Render a minimal Home placeholder only. Do not attempt the final Home Map.

**Acceptance**

```text
□ Home renders after database initialization
□ no Trip list is required yet
□ no map dependency exists
□ no design-system abstraction is created
```

---

## M0-08 — M0 verification gate

**Depends on:** M0-01…M0-07

**Goal**

Verify the baseline before adding business behavior.

**Acceptance**

```text
□ app launches from a clean install
□ app launches on second run
□ migration is idempotent
□ foreign keys are enabled
□ transaction rollback test passes
□ typecheck passes
□ lint passes
□ unit tests pass
□ AGENTS.md exists
□ git working tree contains no accidental/generated junk
```

**Exit**

M0 is complete only after all boxes pass.

---

# 9. M1 — Codex-Executable Task Backlog

## M1-01 — Implement canonical common date/time, Trip and Day types

**Depends on:** M0 complete

**Goal**

Create only the domain needed by the Trip/Day slice.

**Scope**

```text
EntityId
TravelDate
TravelLocalDateTime
IsoTimestamp
Trip
TripLifecycle derivation helper
Day
```

Do not implement Item yet except shared type aliases required by the corrected schema documentation.

**Acceptance**

```text
□ Trip has no stored lifecycle/status
□ Trip uses title/startDate/endDate/mapRegion/note
□ Day has stable id/tripId/date/dayIndex
□ no React/Expo/SQLite import exists in domain
□ lifecycle derivation tests pass
```

---

## M1-02 — Implement inclusive travel-date range derivation

**Depends on:** M1-01

**Goal**

Provide the pure function used by `createTrip()` to generate Days.

**Required behavior**

```text
2026-03-10 → 2026-03-10
= 1 Day

2026-03-10 → 2026-03-12
= 3 Days
```

**Acceptance**

```text
□ range is inclusive
□ dayIndex is deterministic and 1-based (`startDate` = Day 1), matching the product Day labels
□ end < start is rejected before persistence
□ month boundary test passes
□ year boundary test passes
□ behavior does not depend on device timezone conversion of ISO date-only strings
```

Do not scatter date arithmetic across commands/UI.

---

## M1-03 — Implement Trip/Day repository interfaces and SQLite adapters

**Depends on:** M1-01, M0-05

**Goal**

Map the first business entities to the existing schema.

**Scope**

- `TripRepository`;
- `DayRepository`;
- SQLite implementations;
- row ↔ domain mapping;
- repository tests using a test database.

**Acceptance**

```text
□ Trip insert/read/update/delete mapping works
□ Day insertMany/read/list mapping works
□ UNIQUE(trip_id,date) is exercised
□ UNIQUE(trip_id,day_index) is exercised
□ repository modules contain no UI behavior
□ do not implement Item/Place repositories merely to fill a global context
```

---

## M1-04 — Implement `createTrip()` as the first semantic command

**Depends on:** M1-02, M1-03

**Goal**

Persist Trip and all derived Days atomically.

**Flow**

```text
validate input
→ derive all Days in memory
→ one exclusive SQLite transaction
   → insert Trip
   → insert Days
→ commit
→ return CommandResult<Trip>
```

**Acceptance**

```text
□ empty/whitespace-only title is rejected before persistence
□ invalid date range creates no rows
□ valid Trip + all Days commit atomically
□ forced Day insert failure rolls back Trip insert
□ no Item/Place implementation is required
□ command returns affected IDs / validationIssues according to CommandResult contract
```

---

## M1-05 — Implement Trip read queries and TanStack Query boundary

**Depends on:** M1-03, M1-04

**Goal**

Read persisted Trips/Days through application query modules, not directly from UI repositories.

**Scope**

```text
tripKeys.all
tripKeys.detail(tripId)
tripKeys.days(tripId)
getTrips
getTrip
getTripDays
QueryClient provider/root integration
```

**Acceptance**

```text
□ Home can request Trips without raw repository calls in the component
□ Days can be read for one Trip
□ successful createTrip invalidates Trip list and relevant detail/day keys
□ SQLite remains the durable source, Query cache is disposable
```

---

## M1-06 — Add minimal temporary Create Trip UI

**Depends on:** M1-04, M1-05

**Goal**

Make M1's declared exit flow actually executable.

**Scope**

Temporary UI is allowed. It does not need the final Bottom Sheet implementation.

Inputs:

```text
title
start date
end date
trip region: 中国大陆 / 海外
```

Behavior:

```text
submit
→ createTrip()
→ refresh query
→ show created Trip
```

**Acceptance**

```text
□ user can create a Trip without a debug console
□ status is not manually entered
□ mapRegion persists as china_mainland or global
□ validation error is visible
□ UI does not call repository/SQLite directly
□ no final visual polish or Bottom Sheet library is introduced
```

---

## M1-07 — Add temporary Home Trip list and persistence proof

**Depends on:** M1-05, M1-06

**Goal**

Provide the smallest read UI needed to prove persistence before Home Map exists.

**Display at minimum**

```text
Trip title
start/end date
number of derived Days or a way to inspect Days in development
```

**Acceptance**

```text
□ newly created Trip appears
□ kill/restart retains Trip
□ kill/restart retains the same Day IDs
□ creating a second Trip does not corrupt the first
□ this component is explicitly marked temporary for M10 replacement
```

---

## M1-08 — M1 application/repository regression tests

**Depends on:** M1-01…M1-07

**Required tests**

```text
create one-day Trip
create multi-day Trip
inclusive Day generation
invalid date range rejection
transaction rollback
Trip/Day persistence after reopen/test DB re-open
lifecycle derivation around start/end dates
unique Day constraints
```

**Acceptance**

```text
□ all tests pass
□ typecheck passes
□ lint passes
□ no Stage 02/03 product behavior is contradicted
□ no M2+ feature has leaked into M1
```

---

## M1-09 — M1 manual exit gate

Run the actual app and exercise:

```text
Home
→ Create Trip
→ enter title + date range
→ Save
→ Trip appears
→ terminate app
→ relaunch
→ same Trip appears
→ same inclusive Day set exists
```

M1 is complete only when this succeeds without a debug-only database mutation.

---

# 10. Exact M0 → M1 Execution Order

Do not execute task numbers from the old Stage 05 list literally. Use this dependency order:

```text
M0-01  Expo + TS + Expo Router bootstrap
   ↓
M0-02  AGENTS.md guardrails
   ├───────────────┐
   ↓               ↓
M0-03  tooling     M0-04 SQLite initialization / exclusive transaction
                       ↓
                   M0-05 corrected Migration 001
                       ↓
                   M0-06 startup initialization shell
                       ↓
                   M0-07 empty Home
        \              /
         \            /
          → M0-08 verification gate
                    ↓

M1-01  Trip/Day/common types
   ↓
M1-02  date range derivation
   ├──────────────────────┐
   ↓                      ↓
M1-03  Trip/Day repositories + SQLite adapters
   ↓
M1-04  createTrip() transaction
   ↓
M1-05  Trip queries + TanStack Query boundary
   ↓
M1-06  minimal Create Trip UI
   ↓
M1-07  temporary Home Trip list + persistence proof
   ↓
M1-08  regression suite
   ↓
M1-09  manual exit gate
```

Codex should receive **one task at a time**. After every task:

```text
implementation
→ tests
→ typecheck/lint
→ diff review
→ actual app check when applicable
→ next task
```

Do not batch M0+M1 into one autonomous request.

---

# 11. M2+ Dependency Amendments

These amendments prevent future milestones from reintroducing contradictions.

## M2

- Item domain/repository + Ordered Timeline + Quick Edit.
- No Leg core.
- User-visible permanent Delete remains hidden until M11 Undo.

## M3

- reorder/move/Unscheduled with Item-only reindexing;
- `changeTripDateRange(strategy)` with `shiftItems | keepCalendarDates`;
- regression tests for shortening without data loss.

## M4

- persisted `Trip.mapRegion`;
- minimal Place repository/persisted fixture support;
- Day marker ID = Item occurrence ID;
- marker-only renderer/native bridge contract;
- real-device Google WGS84 + AMap GCJ-02 alignment gate.

## M8

Retired/reserved. No Leg implementation or presentation work.

## M9

Do not duplicate Hotel/Transport canonical time fields in payload. Use the common Item interval.

## M11

Implement user-visible Item Delete together with Undo. Snapshot contains Item + relative position only; no Place/Leg data.

# 12. Test Concentration Review

Stage 04/05 correctly prioritize behavior over visual coverage. Keep that strategy.

## Highest-risk tests before / during M4

```text
Trip date range generation
Trip shrink never loses Items
transaction rollback
Item move / reorder preserves sequence
Unscheduled ownership
exact start/end interval validation
fixed-time conflict validation
Trip.mapRegion persistence/provider resolution
Day marker ID = Item occurrence ID
Place-less numbering behavior
```

## Highest-risk tests after map introduction

```text
DayViewData → map projection
DayViewData → Timeline projection
same Item identity selected from either projection
CRS-aware marker conversion
camera one-shot effect does not permanently control viewport
```

## Do not spend early effort on

```text
pixel-perfect snapshots
animation implementation details
high coverage percentage targets
large E2E matrix
live AMap/Google-provider-dependent CI
```

---

# 13. Pre-Development Checklist

Development may start only after this checklist is satisfied.

## Specification

```text
□ Stage 01–05 final docs are available in the repository/project knowledge
□ Stage 06 is treated as the final errata/override document
□ no one is using the old single exactTime/exact_time contract
□ DayPeriod has exactly four V1 values
□ Expo Router is the selected navigation implementation
```

## Repository

```text
□ Git repository initialized
□ working branch is identified
□ package manager lockfile will be committed
□ AGENTS.md exists before domain implementation
□ no generated secrets are committed
```

## M0 technical baseline

```text
□ current stable Expo/React Native/TypeScript versions are pinned by the generated lockfile
□ Expo Router starts successfully
□ expo-sqlite installed through Expo-compatible package resolution
□ PRAGMA foreign_keys = ON is verified
□ semantic transaction wrapper has rollback test
□ corrected Migration 001 uses start_datetime/end_datetime
□ migration is idempotent
□ typecheck/lint/test scripts exist
```

## Architecture guardrails

```text
□ UI has no raw SQL
□ repositories are not called directly for business mutation from UI
□ command transaction dependencies are capability-shaped, not forced all-repo stubs
□ Query cache is not treated as persistence
□ no domain arrays are mirrored into Zustand
□ no V2 service/backend skeleton is added
```

## Milestone discipline

```text
□ Codex receives one bounded task at a time
□ each task declares acceptance criteria and non-goals
□ behavior changes include tests
□ unrelated refactors are rejected from task diffs
□ each milestone leaves the app runnable
□ M4 dual-renderer iOS integration/CRS gate is recorded before productization
```

---

# 14. Codex Review Checklist for Every Task

After Codex returns a patch, review in this order:

```text
1. Did it implement exactly the requested task?
2. Did it modify files outside the declared scope without necessity?
3. Did it bypass Application Commands?
4. Did it introduce raw SQL into UI?
5. Did it duplicate canonical business state in React/Zustand/Query cache?
6. Did it weaken CRS typing?
7. Did it alter dayId/sortOrder through generic patch logic?
8. Did it introduce V2 functionality or unnecessary abstraction?
9. Are transaction boundaries atomic?
10. Are tests checking behavior rather than implementation details?
11. Do typecheck, lint and relevant tests pass?
12. Does the actual app behavior match the acceptance criteria?
```

Reject a patch that passes tests but violates these architectural boundaries.

---

# 15. Final Development Decision

The design phase is complete.

The engineering review does **not** recommend another architecture stage. It recommends applying the corrections in this document as the final authoritative errata and beginning development.

The immediate path is:

```text
Stage 06 finalized
↓
M0-01
↓
M0-02 ... M0-08
↓
M1-01 ... M1-09
↓
M2
↓
M3
↓
M4 dual iOS renderer + Map/Timeline product gate
```

Final recommendation:

```text
GO for M0/M1
provided C-01 through C-05 are applied from the first implementation commit.
```

The remaining C-06 through C-10 corrections must be applied before their affected milestones, but they do not justify delaying the start of M0/M1.

After M1, continue milestone by milestone. Do not reopen Stage 01–05 decisions unless implementation evidence demonstrates an actual blocker.

---

# 16. Stage 06 Closure

Pre-development design is now closed at:

```text
Stage 01  Product Foundation
Stage 02  V1 Flow & Product Semantics
Stage 03  UI / Wireframe / Interaction Specification
Stage 04  Technical Architecture & Frontend Implementation Plan
Stage 05  Development Specification
Stage 06  Final Engineering Review & Execution Backlog
──────────────────────────────────────────────
Development
M0 → M13
```

The invariant that all implementation reviews must preserve remains:

> A Trip is not a list with an attached map. The map and Timeline are synchronized projections of one itinerary model.
