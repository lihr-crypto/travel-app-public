# Travel-Ready — Item Editing and Trip Date Range Plan

> Created 2026-09-16 from physical-device user feedback. This document records the
> user's decisions and the resulting task set. It authorizes no implementation by
> itself; each task has its own agent prompt and its own bounded scope.

## 1. Reported problems

Four problems reported from actual use on the physical iPhone:

1. Opening an Item from the Day View lets the user change only the title — the
   **Place cannot be changed at all**.
2. The Item editor's **`固定行程` row should be removed**.
3. Typing in the **note field is partially covered by the keyboard**.
4. The user wants to **change the Trip length / each Day's date**, and to
   **delete a single Day**.

## 2. User decisions (2026-09-16)

| Question | Decision |
|---|---|
| Keep the Timeline `固定` badge after removing the editor row? | **Remove the badge too.** |
| Delete: implement permanent Item Delete now, or start with the non-destructive path? | **Option B** — start with `移出当天 → 未安排` and `清除地点`. Permanent Delete stays deferred. |
| Accept `缩短区间` instead of deleting an individual Day? | **Yes, accepted.** |

## 3. Why permanent Item Delete is deferred

This is a locked product constraint, stated identically in five places. It is not
a judgement call:

- `docs/specs/travel-app-stage-05-development-spec-rev-2026-09-11.md` §9:
  `User-visible permanent Item Delete is not shipped before M11, when
  Undo/restore is implemented.` and `An internal delete command may exist earlier
  for tests, but no destructive user-facing action is exposed until Undo exists.`
- `docs/specs/travel-app-stage-04-technical-architecture-rev-2026-09-11.md` §37.
- `docs/specs/MANIFEST.md`: `Delete UI ships with Undo at M11.`
- `docs/specs/FINAL_REVIEW_ARBITRATION.md`: `User-visible Item Delete ships only
  together with Undo in M11.`
- `AGENTS.md` §3: `User-facing Item Delete must not ship before minimal
  Undo/restore support exists.`

Infrastructure is also absent, not merely unexposed: `ItemRepository`
(`src/repositories/item-repository.ts`) has no `delete`, and
`src/infrastructure/database/item-command.ts` defines no delete command. Shipping
Delete therefore means implementing `DeletedItemSnapshot` + `restoreDeletedItem()`
+ an Undo snackbar, i.e. the substance of M11-T3/T4/T5.

Option B delivers what the user is actually blocked on (a wrong or obsolete Item
can be taken out of the Day without destroying data) and simultaneously closes one
of the two Travel-Ready acceptance items that could not be verified on device.

## 4. Task set

Ordered by value, not by size. Each task is bounded and independently verifiable.

| # | Task | Scope | Depends on | Model | State |
|---|---|---|---|---|---|
| 1 | `TRAVEL-READY-ITEM-PLACE-EDIT` | Change or clear an existing Item's Place from the editor | — | **Sol Medium** | `reported_complete_pending_verification` |
| 2 | `TRAVEL-READY-ITEM-EDITOR-KEYBOARD` | Note field no longer covered by the keyboard | — | Luna High | `reported_complete_pending_verification` |
| 3 | `TRAVEL-READY-REMOVE-FIXED-ITEM` | Remove the `固定行程` editor row and the Timeline `固定` badge | — | Luna High | `reported_complete_pending_verification` |
| 4 | `TRAVEL-READY-UNSCHEDULED-MOVE` | Move an Item out of its Day into Unscheduled, with a production surface | — | **Sol Medium** | `reported_complete_pending_verification` |
| 5 | `TRAVEL-READY-TRIP-DATE-RANGE-EDIT` | Edit the Trip date range, including shrinking | 4 (for the shrink outcome) | **Sol Medium** | planned |

Tasks 1–3 are independent and can run in any order. Task 4 should precede Task 5,
because shrinking the Trip moves Items into Unscheduled and the user must be able
to see and recover them.

### 4.1 Why task 1 is in scope

`docs/specs/travel-app-stage-05-development-spec-rev-2026-09-11.md` §8.2 lists
what `updateItemDetails` may update, and includes:

```text
Place association when performed through an explicit supported edit flow
```

The capability is specified; it was never implemented. `UpdateItemDetailsInput`
(`src/application/item/update-item-details.ts`) has no `placeId` field at all, and
`ItemDraftForm` exposes only title, type, custom label, time, isFixed and note.
An Item's Place can currently only be set at creation time by
`confirmPlaceSearchResultCommand` / `confirmMapPickerPlaceCommand`.

### 4.2 Why task 5 is mostly wiring

`changeTripDateRangeCommand` is already implemented and tested. It supports
`shiftItems` and `keepCalendarDates`, and shrinking moves the affected Items to
Unscheduled rather than deleting them, satisfying
`修改 Trip 日期永远不能静默删除 Item` (`travel-app-stage-02-v1-flow.md` §15.3).
It is wired to no UI. Trip Overview
(`src/components/trip-overview-workspace.tsx`) currently exposes only a back
control and a map, so the task must also add an entry point.

### 4.3 Why deleting an individual Day is not a task

`travel-app-stage-02-v1-flow.md` §17.2 states:

> V1 **不支持单独删除 Day**。Day 完全由 Trip 日期范围派生。

Days are the contiguous inclusive range derived by
`deriveInclusiveTravelDateRange(startDate, endDate)`, and `changeTripDateRange`
reconciles the Day set to exactly that range on every call. A gap in the middle of
a Trip is therefore not representable, and "one day fewer" can only be expressed as
a shorter range. The user accepted `缩短区间` as the replacement, so this becomes
part of task 5 rather than a separate feature.

## 5. Explicitly out of scope for this plan

- Permanent Item Delete and Undo/restore (M11).
- Deleting an individual Day (not representable in V1).
- Any new Place cleanup: changing or clearing a Place leaves the previous `places`
  row unreferenced, exactly as today. `PlaceRepository` deliberately has no delete.
- Re-using or resurrecting `FIXED_ITEM_TIME_CONFLICT`; it is a specified-but-
  unimplemented validation type and is unaffected by removing the editor row.
- M6 reorder, M9 Hotel/Transport specialization, M10 Home, M13 release expansion.

## 6. Evidence basis

Every claim in this plan was read from the current repository, not from memory:

| Claim | Source |
|---|---|
| `updateItemDetails` has no `placeId` | `src/application/item/update-item-details.ts` |
| Item editor has no Place control | `src/components/item-draft-form.tsx` |
| Places are immutable snapshots | `src/repositories/place-repository.ts` (`insert`, `getById` only) |
| Snapshot policy helpers are reusable | `src/application/place/place-snapshot.ts` (`expectedSnapshotPolicy`, `assertSnapshotMatchesTrip`, `insertPlaceSnapshot`) |
| Place picker commands create new Items | `src/application/place/confirm-place-search-result.ts`, `confirm-map-picker-place.ts` |
| `PlaceSearch` pins the command type to the create commands | `src/components/place-search.tsx` (`confirmation`, `mapPicker.confirmation`) |
| The Place flow replaces the whole Day surface | `src/components/day-view-workspace.tsx` (`placeEntry` branch) |
| No Item delete exists | `src/repositories/item-repository.ts`, `src/infrastructure/database/item-command.ts` |
| `isFixed` has no consumer | `src/components/day-timeline.tsx` (badge only); no validation reads it |
| Keyboard handling uses two conflicting mechanisms | `src/components/item-draft-form.tsx` (`KeyboardAvoidingView` + `automaticallyAdjustKeyboardInsets`) |
| The working Home pattern uses only one | `src/app/index.tsx` |
| `changeTripDateRangeCommand` exists and is unwired | `src/infrastructure/database/trip-command.ts`; no UI consumer |
| No production Unscheduled surface | `UnscheduledItemList` is mounted only by `temporary-trip-workspace.tsx` |

## 7. Implementation evidence — task 1 (2026-09-16)

Task 1 is implemented and automated-verified. Prompt:
`docs/agent/TRAVEL_READY_ITEM_PLACE_EDIT_AGENT_PROMPT.md`.

| File | Change |
|---|---|
| `src/application/item/change-item-place.ts` (new) | `changeItemPlace` Application Command. Discriminated `target`: `search` / `map-picker` / `none`. One exclusive transaction: read the Item, read **its own** Trip for the provider policy, insert a Place snapshot (skipped for `none`), then write `placeId` + `updatedAt` only. |
| `src/application/place/place-snapshot.ts` | `assertEnrichmentMatchesPick` and `resolveCoordinatePlaceName` moved here from `confirm-map-picker-place.ts`, so both the create and the change path share one implementation instead of a copy. Semantics unchanged. |
| `src/application/place/confirm-map-picker-place.ts` | Uses the shared helpers; `resolveCoordinatePlaceName` is re-exported so existing callers and tests keep one import path. |
| `src/infrastructure/database/item-transaction.ts`, `index.ts`, `item-command.ts` | `createChangeItemPlaceTransactionRunner` (items + places + trips), `runInChangeItemPlaceTransaction`, `changeItemPlaceCommand`. |
| `src/components/place-search.tsx` | Optional `pickOnly` on `confirmation` and `mapPicker.confirmation`. When set, the picked Place commits immediately instead of opening the Item Draft form; absent, behaviour is byte-for-byte what it was. The pick-only path owns its own `place-search-confirm-error` / `place-search-confirming` surface, and a ref guards a synchronous double tap. |
| `src/components/item-editor-modal.tsx` | A `地点` row: current Place name, `更换`/`添加`, and `清除` only when a Place exists. Both actions render only when the corresponding seam is wired. Clear failures stay inline. |
| `src/components/day-view-workspace.tsx` | `placeEntryState` carries an intent (`create` \| `change-place` + `itemId`). A change opens the picker at the Item's **current** Place coordinate, uses `pickOnly`, and adapts `changeItemPlace` to the create commands' signatures rather than widening `PlaceSearch`'s prop types. |
| `src/components/trip-planning-workspace.tsx` | Wires `changeItemPlaceCommand` and invalidates `dayKeys.view` + `tripKeys.overview` on a change or clear. |
| `src/state/day-focus-effects.ts` | Exposes bare `selectItem`. A change must not reuse `selectFromTimeline`, which reads the pre-change Day projection and would fly the map back to the Place the user just replaced. |

### 7.1 Behaviour decisions worth recording

- **The Item's own `tripId` decides the provider policy.** A caller-supplied `tripId` never does, so an Item cannot be pointed at another region's snapshot.
- **Changing a Place never reorders the Day.** Only `placeId` and `updatedAt` change; `orderItemsByTravelTime` does not run, because moving an Item to another Place must not move it in the Timeline.
- **The editor closes before the picker opens.** The Place flow replaces the whole Day surface, so a Modal left open would float over it.
- **Clearing keeps the editor open.** There is no picker step, so the user stays where they were and the row refreshes to `未设置` after the invalidation.
- **The camera is not moved on a change.** At commit time the only coordinates available belong to the pre-change projection. The marker moves when the refetched Day lands; tapping the row afterwards issues a fresh request against the new data.
- **The duplicate-commit guard is at the UI layer** (a ref in `PlaceSearch`, plus the surface swap after commit). The command has no idempotency key; a duplicate would leave an extra unreferenced Place row rather than corrupting the Item.

### 7.2 Automated evidence

```text
npm test                       73 suites / 430 tests passed   (was 72 / 407)
npm run typecheck              0 errors
npm run lint                   passed
npx expo export --platform ios --output-dir /tmp/expo-export-check
                               passed
plutil -lint (both plists)     OK
npx expo install --check       expo@57.0.22 vs ~57.0.23 — unchanged, pre-existing
```

`expo export` was pointed at `/tmp` because the default in-repo `dist/` now exceeds this
environment's safe-delete threshold: the CLI deletes the previous export directory first, and the
host's delete shim refuses a bulk delete of that size (`node-safe-delete-shim.cjs`). This is the
same environmental defect recorded in `TRAVEL_READY_MOTION_AND_SHEET_UX_PLAN.md` §11.3 for Swift
macro sandboxing — it is not a project problem, and the bundle check itself is unaffected.
`dist/` is gitignored.

Focused coverage added: 9 real-SQLite command tests, 4 `PlaceSearch` pick-only tests,
5 `ItemEditorModal` Place-row tests, 4 `DayViewWorkspace` change-flow tests, and 1
`TripPlanningWorkspace` invalidation test.

### 7.3 Known limitations and unverified items

- **Orphan Place rows.** Changing or clearing a Place leaves the previous `places` row
  unreferenced, exactly as moving an Item already does today. `PlaceRepository` deliberately has
  no delete, and this task added none.
- **No native or Release build ran for this task**, and no native source changed.
- **No physical-device observation.** That the new row reads correctly, that the picker opens at
  the Item's current Place, and that the marker moves without the map jumping are visual claims.
  They are covered by `TRAVEL-READY-UI-TASKS.md` §4.2/§4.3 and the combined Release pass.

## 8. Implementation evidence — task 2 (2026-09-16)

Task 2 is implemented and automated-verified.

### 8.1 Root cause

`src/components/item-draft-form.tsx` enabled **two** keyboard strategies at once:

- `KeyboardAvoidingView` with `behavior="padding"` (iOS), and
- `ScrollView automaticallyAdjustKeyboardInsets`.

They compensate for the same keyboard independently, so the geometry was double-counted. The
working precedent in this repo is the Home create-Trip form (`src/app/index.tsx`), which uses
`automaticallyAdjustKeyboardInsets` alone.

Separately — and this is what actually left the note covered — **neither strategy scrolls a focused
input into view.** Reading the installed React Native source confirms it: `ScrollView.js` subscribes
to `keyboardWillShow`/`keyboardWillHide` only to adjust insets, and `TextInput.js` never calls
`scrollResponderScrollNativeHandleToKeyboard`. A focused field at the bottom of a tall form stays
where it is and the keyboard simply covers it.

### 8.2 What changed

| File | Change |
|---|---|
| `src/components/item-draft-form.tsx` | One strategy per container. The header variant (the editor, inside a Modal, Save/Cancel in the header) uses `automaticallyAdjustKeyboardInsets` and no `KeyboardAvoidingView`. The create variant keeps `KeyboardAvoidingView` because its Save/Cancel row sits outside the ScrollView and must stay above the keyboard. Each text field records its own `onLayout` offset and scrolls itself to `max(0, offset - 24)` on focus; the multiline note re-aligns on `onContentSizeChange` **only while focused**. |
| `src/components/item-editor-modal.tsx` | Dropped the container's `paddingBottom: insets.bottom`. The form owns its own bottom clearance, so keeping both stacked an extra home-indicator gap on top of the keyboard. |

### 8.3 Why not `scrollResponderScrollNativeHandleToKeyboard`

That ScrollView method is purpose-built for this and was the first choice. It was rejected on
evidence:

- `ScrollView.d.ts` types the argument as `nodeHandle: any`, and the implementation takes either a
  numeric tag (`UIManager.measureLayout`) or an object with `measureLayout`.
- On this React Native version, `findNodeHandle(textInputRef)` returns `null`, and the `TextInput`
  ref exposes only `clear` / `getNativeRef` / `isFocused` / `setSelection` — **no `measureLayout`**.
  Both supported argument paths are therefore unavailable, which was confirmed with a throwaway
  probe test rather than assumed.
- A path that cannot be observed in a test and cannot be exercised without a device is not a fix
  that can be verified. The `onLayout` offset used instead is deterministic and fully covered.

Trade-off recorded honestly: aligning the field's **top** near the top of the visible area is
height-independent, which is the only rule guaranteed to clear a keyboard the component cannot
measure synchronously at focus time. The cost is that focusing a field low in the form scrolls it
further up than strictly necessary.

### 8.4 Automated evidence

```text
npm test                       73 suites / 436 tests passed   (was 73 / 430)
npm run typecheck              0 errors
npm run lint                   passed
npx expo export --platform ios --output-dir /tmp/expo-export-check   passed
plutil -lint (both plists)     OK
```

Six focused tests were added: the two container strategies are mutually exclusive, the note and
title fields scroll to the measured offset, a field near the content start clamps to `y: 0`, a
growing note re-aligns only while focused, and an unmeasured field does not scroll at all.

### 8.5 Not verified

- **No physical-device observation.** That the note is now fully visible with the keyboard up, that
  the form does not jump when the keyboard appears, and that the create flow's Save/Cancel row still
  clears the keyboard are all visual claims. The device pass must confirm them.
- The create flow's keyboard behaviour changed from two mechanisms to one (`KeyboardAvoidingView`
  only). It has no device observation either.

## 9. Implementation evidence — task 3 (2026-09-16)

Task 3 is implemented and automated-verified.

### 9.1 What was removed from the UI

| Surface | Removal |
|---|---|
| `src/components/item-draft-form.tsx` | The `固定行程` row and its `Switch` (`${prefix}-fixed`), the `isFixed` state, the `styles.fixedRow` style, and `isFixed` from the object passed to `onSave`. |
| `src/components/day-timeline.tsx` | The `固定` badge in the metadata row. |
| `src/components/quick-edit.tsx` | `isFixed: item.isFixed` from the `initialDraft` it hands the form. |
| `src/components/item-editor-modal.tsx` | Already had no `isFixed` surface. |

### 9.2 The UI-facing types were narrowed too

Removing the widgets alone would leave two types advertising a field no screen can
produce, so `isFixed` was dropped from both:

| Type | File | Why |
|---|---|---|
| `ItemDraft` | `src/application/item/item-draft.ts` | The shared create/edit draft contract. Every draft now physically cannot carry the flag. |
| `TimelineItemModel` | `src/application/projections/timeline.ts` | The projection `DayTimeline` renders. No badge is reachable even from a legacy row. |

Three default-draft construction sites dropped their now-ill-typed `isFixed: false`:
`confirm-place-search-result.ts`, `confirm-map-picker-place.ts`, and `place-search.tsx`.

Typecheck is the evidence that the removal is complete: after narrowing `ItemDraft`,
**every** remaining error was in a test fixture — **no production source referenced the
field**. That is the proof that the flag had no consumer left.

### 9.3 What deliberately stays

- The `is_fixed` column in `migrations.ts` and `SqliteItemRepository`.
- `isFixed` on the domain `Item` type.
- `isFixed?` on `AddItemInput` and `UpdateItemDetailsInput`.

No migration was written. Dropping a `NOT NULL` column the repository still reads and
writes would be a schema change with data-loss risk for zero functional benefit, and the
plan's scope for this task is the UI.

### 9.4 Behaviour preserved by omitting the field

The form now never emits `isFixed`, and that is what preserves existing rows rather than
resetting them:

- `updateItemDetails` computes `input.isFixed ?? current.isFixed`, so editing an Item
  leaves a stored `true` untouched.
- `addItem` computes `input.isFixed ?? false`, so a new Item is created unfixed.

Had the form sent an explicit `false` instead, every edit of a legacy fixed row would
have silently cleared it.

### 9.5 Automated evidence

```text
npm test                       73 suites / 438 tests passed   (was 73 / 436)
npm run typecheck              0 errors
npm run lint                   passed
npx expo export --platform ios --output-dir /tmp/expo-export-check   passed
plutil -lint (both plists)     OK
```

Focused coverage: neither form variant renders a `固定行程` control, a save never emits
`isFixed`, and `DayTimeline` renders no `固定` badge. Existing assertions in
`quick-edit`, `place-search`, `day-view-workspace`, `timeline`, `confirm-place-search-result`
and `confirm-map-picker-place` were updated to the new contract — the latter two now assert
`isFixed: false` on the created Item, which is what `addItem` produces from a draft that
cannot carry the field.

### 9.6 Not verified

- **No physical-device observation.** That the editor no longer shows the row and the
  Timeline no longer shows the badge are layout claims; the device pass must confirm them.
- **No behavioural check that a legacy fixed row keeps its value.** The preservation
  argument in §9.4 rests on reading `update-item-details.ts`, not on an end-to-end test
  that seeds `is_fixed = 1`, edits the Item, and re-reads the row. No test covers it because
  no UI path can set the flag any more.

## 10. Implementation evidence — task 4 (2026-09-16)

Task 4 is implemented and automated-verified.

### 10.1 The real gap was bigger than "no production surface"

`moveItemToUnscheduledCommand` and `moveItemToDayCommand` were both already wired in
`src/infrastructure/database/item-command.ts`, and both are covered by real-SQLite tests. What was
missing was worse than an absent button:

**The Overview's `未安排` entry was a dead button.** `TripOverviewSheet` calls
`openUnscheduled()`, the store sets `focus: { type: 'unscheduled' }` — and
`src/components/trip-planning-workspace.tsx` contained **zero** occurrences of the string
`unscheduled`. It derived `selectedDayId` from the focus, got `null`, and rendered
`TripOverviewWorkspace`. Pressing 未安排 changed the focus and changed nothing on screen.

So the task had two halves, and the second is what makes the first safe:

1. give the Day View an exit (移出当天), and
2. give `focus.type === 'unscheduled'` an actual surface — because without it, moving an Item out of
   a Day would be indistinguishable from deleting it.

### 10.2 What changed

| File | Change |
|---|---|
| `src/components/unscheduled-workspace.tsx` (new) | Production Unscheduled surface: back button, heading, `UnscheduledItemList`, and a move-back path that reuses `DayJumpSheet` to pick the target Day. Renders a move control only when `moveItemToDayCommand` is supplied **and** the Trip has at least one Day. |
| `src/components/item-editor-modal.tsx` | A `所在日期` row showing `Day N · date` plus a `移出当天` action, rendered only when `onMoveToUnscheduled` is supplied. Failures stay inline and leave the row actionable. |
| `src/components/day-view-workspace.tsx` | `moveItemToUnscheduled` + `onItemMovedOutOfDay` seams. `moveItemOutOfDay` closes the editor after a successful move. |
| `src/components/trip-planning-workspace.tsx` | Unscheduled is now a fourth focus branch, checked **before** the `selectedDayId === null` Overview fallback. New `unscheduledSource` prop. `invalidateAfterMoveOutOfDay` and `invalidateAfterMoveToDay` invalidate three keys. |
| `src/app/index.tsx` | Supplies `unscheduledQuerySource` (already exported from `src/infrastructure/database`). |

### 10.3 Behaviour decisions worth recording

- **Unscheduled is a fourth focus state, not an Overview variant.** The bug in §10.1 existed
  precisely because it was treated as the fallback rather than as a branch.
- **The editor closes on a successful move, not on a failed one.** `editorItem` is looked up in
  `data.items`; leaving the Modal open would keep showing a row the refetched Day will not contain.
  On failure the Modal stays open so the inline error is visible and the user can retry.
- **A move invalidates three read models, an ordinary save still invalidates two.** Editing an
  Item's details cannot move it between collections, so `invalidateItineraryReads` was deliberately
  left at Day + Overview. A test asserts Unscheduled is *not* invalidated on save.
- **Move-back is included.** `UnscheduledItemList` already had an `onRequestMoveItem` seam and
  `moveItemToDayCommand` already existed; without a way back, 移出当天 would be a one-way door,
  which contradicts the plan's "without destroying data" rationale.
- **The Unscheduled surface has no map.** It is a list-first surface, consistent with its purpose
  (see what was moved out, put it back). Noted here as a deliberate simplification, not an
  oversight.

### 10.4 Automated evidence

```text
npm test                       74 suites / 453 tests passed   (was 73 / 438)
npm run typecheck              0 errors
npm run lint                   passed
npx expo export --platform ios --output-dir /tmp/expo-export-check   passed
plutil -lint (both plists)     OK
```

Fifteen focused tests across four files: the Unscheduled surface renders moved Items and offers no
move control without a command or without Days; a move-back reports the chosen Day; a failed
move-back keeps the Item visible; the editor row appears only with the seam and reports failures
inline; a Day move-out closes the editor; **the 未安排 focus renders the Unscheduled surface instead
of the Overview** (the §10.1 regression); a move invalidates all three keys; an ordinary save does
not invalidate Unscheduled.

### 10.5 Known limitations and unverified items

- **No physical-device observation.** That the row reads correctly, that the Unscheduled surface is
  legible, and that 未安排 now visibly navigates are all visual claims.
- **The move is not end-to-end verified against real SQLite from the UI.** `moveItemToUnscheduled`
  itself has real-SQLite command tests; the wiring is verified with injected commands, not with a
  full database round trip through the screen.
- **After a move-out, selection is not cleared.** The Trip Focus store may still point at the moved
  Item id. It simply selects nothing in the Day it no longer belongs to; no crash path was found,
  but the state is stale until the next selection.
- **Orphan Place rows** remain, unchanged from task 1 and from moving an Item between Days.
