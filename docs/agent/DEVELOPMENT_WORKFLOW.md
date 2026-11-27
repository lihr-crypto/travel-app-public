# Travel App — Development Workflow

> Purpose: automatic task routing for Codex and other coding agents.
> Broad design is closed. This file tells the agent what to read and how to advance work.

## 1. Automatic routing algorithm

At the beginning of every development request:

```text
read DEVELOPMENT_STATUS.md
→ inspect repository / git state
→ verify any prior task marked reported_complete or pending_verification
→ determine current milestone + next_task
→ use the milestone routing table below
→ read the exact Stage 05/06 task section
→ read only additional product/UI/architecture sections needed
→ execute one task
→ verify
→ update DEVELOPMENT_STATUS.md
→ stop
```

Never require the user to paste a task prompt.

If the user says only `继续开发`, `继续`, or `next`, use `next_task` from `DEVELOPMENT_STATUS.md`.

If the user explicitly names a future milestone while prerequisites are incomplete, do not skip silently. Report the unmet exit gate.

## 2. Canonical documents

All authoritative documents are under `docs/specs/`:

```text
docs/specs/MANIFEST.md
docs/specs/00-PRODUCT-REALIGNMENT-AMENDMENT.md
docs/specs/FINAL_REVIEW_ARBITRATION.md
docs/specs/travel-app-stage-01-product-foundation-rev-2026-09-11.md
docs/specs/travel-app-stage-02-v1-flow.md
docs/specs/travel-app-stage-03-ui-wireframe-spec.md
docs/specs/travel-app-stage-04-technical-architecture-rev-2026-09-11.md
docs/specs/travel-app-stage-05-development-spec-rev-2026-09-11.md
docs/specs/travel-app-stage-06-final-engineering-review.md
docs/specs/travel-app-review-decision-record-2026-09-11.md
```

The Product Realignment Amendment has highest product/UI precedence. Stage 06
owns the corrected executable M0/M1 task definitions. Do not execute older
Stage 05 task wording when it conflicts with the reconciled pack.

## 3. Milestone reading router

| Milestone | Required context |
|---|---|
| M0 | Stage 06 `M0 — Codex-Executable Task Backlog`, `Pre-Development Checklist`; Review Record `Before M0/M1` |
| M1 | Stage 01 Trip basics; Stage 05 M1; Stage 06 M1; Review Record `Before M0/M1` |
| M2 | Stage 02 Ordered Item semantics; Stage 05 M2; Stage 06 M2 amendment; Review Record `Before M2` |
| M3 | Stage 02 Trip date changes + Unscheduled; Stage 05 M3; Stage 06 M3 amendment; Review Record `Before M3` |
| M4 | Product Realignment map semantics; Stage 04 MapRenderer/CRS architecture; Stage 05/06 M4; Review Record `Before M4`; current official provider docs |
| M5 | Product Realignment; revised Stage 03 Trip Planning Workspace; Stage 05/06 M5; Review Record `Before M5` |
| M6 | Stage 03 reorder gesture; Stage 05/06 M6 |
| M7 | Stage 04 Renderer/PlaceProvider/CRS boundaries; Stage 05/06 M7; Review Record `Before M7`; current official provider docs |
| M8 | Reserved/retired; verify no Leg/routing implementation leaked into V1 |
| M9 | Stage 02 Hotel/Transport semantics; Stage 05/06 M9; Review Record `Before M9` |
| M10 | Stage 01 Home Footprint semantics; Stage 04/05/06 M10; Review Record `Before M10` |
| M11 | Stage 03 Delete/Undo; Stage 04/05/06 Undo contract; Review Record `Before M11` |
| M12 | Stage 05/06 persistence/offline requirements; Review Record `Before M12/M13` |
| M13 | Stage 05/06 stabilization/release requirements; Review Record `Before M12/M13`; current official provider/release docs |

Do not reread every long Stage document for each task.

## 4. Milestone execution policy

### M0 — Bootstrap

Stage 06 order is authoritative:

```text
M0-01 Bootstrap current stable Expo TypeScript project
M0-02 Add root engineering guardrails
M0-03 Establish quality scripts and unit-test harness
M0-04 Add Expo SQLite database initialization
M0-05 Implement migration runner and corrected 001_initial
M0-06 Add minimal app initialization shell
M0-07 Render empty Home baseline
M0-08 M0 verification gate
```

Important:
- no maps;
- no Zustand;
- no bottom sheet;
- no business domain in M0-01;
- no business repositories in M0-04;
- Migration 001 must use `map_region`, `start_datetime`, `end_datetime` and must not use `exact_time`.
- Migration 001 must not contain `legs` or routing geometry fields.

### M1 — Trip / Day vertical slice

Use Stage 06 M1 order exactly:

```text
M1-01 canonical common date/time + Trip + Day types
M1-02 inclusive timezone-safe date range derivation
M1-03 Trip/Day repository interfaces + SQLite adapters
M1-04 createTrip() semantic command
M1-05 Trip read queries + TanStack Query boundary
M1-06 temporary Create Trip UI
M1-07 temporary Home Trip list + restart persistence proof
M1-08 regression tests
M1-09 manual exit gate
```

Do not introduce Item/Place/Leg/Map/Zustand/Bottom Sheet in M1.

### M2

Introduce Item persistence, the basic Ordered Timeline and Quick Edit. There is
no Leg core or routing subsystem in V1.
User-facing permanent Delete stays hidden until Undo/restore is available.

### M3

Date-range intent must use:

```ts
type ChangeTripDateRangeStrategy =
  | "shiftItems"
  | "keepCalendarDates";
```

Required regression behavior includes same-length shift, keep-calendar-dates
reconciliation, shrink without data loss, cross-day interval preservation, and
Item-only move/reorder behavior.

### M4

First native-map gate:
- Expo Development Build;
- AMap iOS renderer + GCJ-02 fixture;
- Google renderer + WGS84 fixture;
- key/config/privacy fail-fast checks;
- physical-iPhone verification before passing the gate.
- minimal Place persistence and Item-occurrence marker identity;
- marker/camera renderer contract with no required polyline.

Do not implement Place Search yet.

### M5

Finalize the realigned Trip Planning shell: Trip-wide Place distribution plus
Day List in Overview, and current-Day Place-bearing markers plus complete
Ordered Timeline in Day View.
Unscheduled markers remain unnumbered and use presentation-only visibility/density behavior; high-count default-hide threshold is 20.

### M6

Connect drag gesture to the existing reorder command. Gesture preview is local state; durable mutation happens only on drop through the Application Command.

### M7

Use current official SDK docs before implementation.
- AMap official iOS Search SDK behind a thin local Expo module.
- Google Places SDK for iOS behind a thin local Expo module.
- Provider comes from `Trip.mapRegion`.
- Explicit Place preview confirmation.
- Provider-aware external-map handoff.
- No in-app navigation.

### M8

Reserved/retired. Do not build Leg, route polyline, duration/distance editing,
or RouteProvider.

### M9

Hotel = one cross-day Item.
Transport is an Item. V1 has no Leg entity.
Canonical time stays in Item start/end fields.
Transport origin/destination remain strings in V1.
Do not emit naive `END_BEFORE_START` warnings for incomparable cross-timezone local wall times.

### M10

Select and test the Home renderer only at M10-T0; it is not pre-locked earlier.
Apply the selected mixed-CRS presentation policy at the Home boundary.
Never rewrite persisted provider-native coordinates.

### M11

Implement corrected atomic Delete + Undo semantics before exposing user-facing Delete.

### M12

Existing itinerary data must stay readable/editable when map tiles/search/network are unavailable.
No offline map package.
No Leg metadata persistence requirement exists.

### M13

Stabilization/release only:
- E2E smoke;
- migration/error/performance sanity;
- Release/Archive build;
- key restrictions;
- privacy manifests/declarations/attribution;
- current AMap/Google licensing/config verification;
- real-device smoke.
Do not add new product features.

## 5. Task completion procedure

After a task implementation:

```text
focused tests
→ typecheck
→ lint
→ diff review
→ manual app check when applicable
→ update DEVELOPMENT_STATUS.md
→ stop
```

If typecheck/lint/test scripts do not exist yet because M0-03 is not complete, run only verification that is currently available and record the limitation.

Never mark a task `complete` solely because code was written. Record evidence.

## 6. Milestone exit procedure

When the last implementation task is complete, the next action is the milestone exit/verification task, not the next milestone.

Exit review checks:

1. all milestone tasks actually complete;
2. all exit acceptance criteria pass;
3. tests/typecheck/lint pass;
4. app remains runnable;
5. architecture guardrails are intact;
6. no future-scope work leaked in;
7. known technical debt is recorded;
8. next milestone has no unresolved blocker.

Only after PASS should `DEVELOPMENT_STATUS.md` advance to the next milestone.

## 7. External verification rule

At M4, M7, and M13, current SDK/config/licensing/privacy details may have changed since the design snapshot.

Recheck official documentation at that time.

External documentation can refine setup details but must not silently change locked product semantics.

## 8. Model recommendation router

使用根目录 `AGENTS.md` 的模型建议作为唯一来源。用户于 2026-10-08 指定 GPT-6 Luna xhigh
或更强且 xhigh 以上的执行模型；旧 Luna High / Sol Medium 表不再适用。
建议按数据/原生/地图风险判断，保留当前协调模型，不自动切换用户模型。

## 9. Historical Travel-ready checkpoint

`docs/agent/TRAVEL_READY_SPRINT.md` 描述 2026-03-09 的临时检查点，保留用于历史追查。
当前继续任务来自 `DEVELOPMENT_STATUS.md`；不要每轮为已过期的截止日重新安排里程碑。

## 10. Explicit extension and audit requests

以上“一次一个 next_task”路由适用于未指定任务的“继续开发”。用户明确指定审阅、修复批次或新范围时，
依该请求执行。当前已批准 Web/D1 协作与原生文件往返范围见根目录 `AGENTS.md` 和当前状态入口，
它们覆盖早期 iOS-only / no-cloud 的排除项，其他约束保留。
