# Travel-Ready Motion, Sheet, and Timeline Action Plan

> Date: 2026-09-16  
> State: `reported_complete_pending_verification`  
> Batch ID: `TRAVEL-READY-MOTION-AND-SHEET-UX-BATCH`  
> Scope: presentation and interaction corrections only; no business-domain expansion  
> Evidence boundary: implementation and automated evidence are in §10; the physical-device run,
> including the separate launch-blocking UIScene fix it uncovered, is in §11. The motion/Sheet/
> Timeline behaviour itself has not been visually observed, so the batch is not verified.

> **Superseded notice, 2026-09-16:** §3.5、§4.4 和 T6 中保留 keyed Day
> remount、对整个 Day surface 做 leaving/entering 的设计已被用户后续反馈覆盖。
> Day → Day 必须保持一个持续挂载的 Day Workspace、地图和 Bottom Sheet；执行合同见
> `docs/agent/TRAVEL_READY_PERSISTENT_DAY_VIEW_AGENT_PROMPT.md`。

## 1. Goal

Remove four sources of discomfort from the current Travel-Ready build:

1. the unnecessary floating AMap consent-revocation button;
2. the map strip exposed below the Trip Overview and Day View Bottom Sheets;
3. abrupt Home → Trip Overview, Trip Overview → Day View, and Day → Day replacements;
4. the small Timeline `编辑` action.

The completed result should feel calm and continuous without weakening the existing AMap privacy gate, Day camera reset, map request identity, Timeline selection, query invalidation, or Bottom Sheet gesture contracts.

## 2. Verified causes in the current code

### 2.1 AMap consent management

`src/components/amap-privacy-gate.tsx` renders `amap-privacy-revoke` as an absolute floating control after consent reaches `ready`. The gate also contains `revoking` and `revoke` retry branches used only by this visible action.

The accepted consent behavior that must remain is independent of that button:

- one global AsyncStorage record, not Trip state;
- policy version and acceptance timestamp;
- prompt on first use, prior refusal, version change, or invalid record;
- both AMap Map and Search native privacy calls awaited before children mount;
- native/storage failures remain fail-closed and retryable.

### 2.2 Bottom Sheet bottom gap

`src/components/trip-bottom-sheet.tsx` currently combines:

```text
BottomSheet bottomInset = safe-area bottom
+ content paddingBottom = safe-area bottom + 16
```

The first value lifts the whole white Sheet above the physical bottom edge while the map remains full-screen behind it. The second value already protects content from the Home Indicator. The duplicated safe-area treatment exposes a map strip below the Sheet in both Trip Overview and Day View.

### 2.3 Abrupt navigation

- `src/app/index.tsx` replaces Home with `TripPlanningWorkspace` immediately after `openedTrip` changes.
- `TripPlanningWorkspace` replaces Overview with Day solely from `TripFocus`.
- Pending Overview/Day queries replace the destination with full-screen loading text.
- `DayPlanningView` uses `key={selectedDayId}`. This intentionally remounts Day state and the native map so repeated coordinates and prior camera state do not leak between Days, but it also makes the entire map, Sheet, Header, and Timeline disappear/reappear at once.
- There is no existing screen-transition component in `src/`; Reanimated 4.5.1 is already installed.

### 2.4 Timeline edit target

`src/components/day-timeline.tsx` currently renders `编辑 ›` as 13-point text inside the selected row's content. It has no independent 44-point target and is nested inside the row-selection `Pressable`.

## 3. Locked product decisions

These are user-approved decisions for this batch.

### 3.1 Consent button

- Remove the visible revoke-management button.
- Remove revoke-only component states and dead UI branches when no longer needed.
- Preserve all startup hydration, policy-version, agreement/refusal, native readiness, error, and retry behavior.
- Do not move consent into Trip/Item/SQLite business state.

### 3.2 Sheet coverage

- The Sheet's white background reaches the physical bottom edge at every snap.
- Safe-area protection belongs to content padding, not a gap under the Sheet.
- `collapsed`, `half`, and `expanded` ratios remain unchanged.
- “Completely cover” means no map is visible *below* the Sheet. Expanded may still leave the intentional small map band *above* the Sheet, per the existing 88% product contract.

### 3.3 Motion language

- Use the already-installed Reanimated dependency; add no animation/navigation package.
- Motion is restrained: opacity plus 8–12 points of translation, no bounce, spring, large parallax, or full-screen card theatrics.
- Recommended timing:
  - Home → Trip Overview: 220–260 ms;
  - Overview ↔ Day: 200–240 ms;
  - adjacent Day switch: 180–220 ms;
  - Day Jump to a non-adjacent Day: neutral fade rather than a long directional travel animation.
- Use ease-out for entry and ease-in for exit.
- Respect iOS Reduce Motion. Reduced motion uses an instant replacement or a short opacity-only transition.
- Do not keep two live AMap/Google native map instances overlapped during a crossfade.

### 3.4 Data readiness during transitions

- Keep the source screen visible while destination data is being prepared.
- Prefetch Overview before committing Home → Trip.
- Prefetch Day data before committing Overview → Day and Day → Day.
- Adjacent Days should be proactively prefetched while the current Day is open.
- Do not render `旅行加载中…` or `Day 加载中…` as a full-screen intermediate frame during a user-initiated transition.
- If prefetch fails, retain the source screen and expose an actionable error there; do not navigate to a blank/error replacement.
- Prevent duplicate navigation while one transition is committing.

### 3.5 Native map lifecycle

- Preserve the functional effect of `key={selectedDayId}` or provide equally strong current-code evidence for a replacement.
- Each Day still gets a new camera request scope/key.
- A manually panned map must not replay the old request.
- Repeated coordinates across Days must still trigger the new Day camera request.
- Prefer a two-phase transition around the single native-map swap rather than two simultaneously mounted native maps.

### 3.6 Timeline edit action

- Every Item row exposes an always-visible `编辑` button at the far right.
- The button is a sibling of the row-selection target, not nested inside it.
- Minimum target: 56 × 44 points.
- Use `colors.primaryDeep` (or the same deep primary token), white semibold text, and 8–10 point radius.
- Tapping the main row still selects/focuses the Item and synchronizes the Marker.
- Tapping `编辑` opens the existing shared Item editor directly without requiring prior selection.
- Long titles, notes, exact-time labels, and narrow iPhones must not collapse the button or force horizontal scrolling.

## 4. Recommended implementation structure

Names may be adjusted to match repository conventions, but responsibilities should remain centralized.

### 4.1 Shared transition controller

Add one small presentation component/hook, for example:

```text
PlanningSurfaceTransition
usePlanningTransition
```

It should own:

- transition phase and duplicate-intent protection;
- source/destination direction;
- Reduce Motion behavior;
- the two-phase opacity/translation timing around the single surface swap;
- a stable page background that hides native-map first-frame flashes.

Do not scatter unrelated animation state across `index.tsx`, `TripOverviewWorkspace`, and `DayViewWorkspace`.

### 4.2 Home → Trip Overview

Recommended flow:

```text
tap Trip
→ prefetch tripKeys.overview(trip.id)
→ if success, begin exit animation
→ commit openedTrip at the swap point
→ enter Trip Overview
→ if failure, keep Home and show an inline error
```

The existing normal entry destination remains Trip Overview.

### 4.3 Overview → Day

Overview Day rows and occurrence-preview Day entry must use the same transition intent:

```text
request Day
→ prefetch dayKeys.view(dayId)
→ exit Overview
→ commit TripFocus.selectDay(dayId)
→ enter keyed Day surface
```

Do not let `TripOverviewWorkspace` bypass this path by calling the store directly.

### 4.4 Day → Day

> **SUPERSEDED (2026-09-16) by `TRAVEL-READY-PERSISTENT-DAY-VIEW`.** The keyed remount and the
> whole-surface leaving/entering transition below are **not** the shipped behavior. The user
> required one continuously mounted Day View, one native map instance and one Bottom Sheet that
> only receive new content. See §12 for the implementation that replaces this section. The
> data-readiness rules (prefetch, keep the source Day visible, commit only at the swap point,
> duplicate-intent protection) are unchanged and still apply.

- Prefetch previous/next Day on current Day readiness.
- Determine direction by `dayIndex` for adjacent header navigation.
- Day Jump uses direction only for a nearby Day if it reads naturally; otherwise use neutral fade.
- Preserve the outgoing Day until destination data is ready.
- Commit the new focus only at the controlled swap point.
- Remount Day-local state/map exactly once. → **superseded: the Day surface, map and Sheet are never remounted; Day-local state is reset in place.**
- Reset editor, jump sheet, transient selection, and scroll state as the current keyed remount does. → **superseded: the same resets happen explicitly on `data.day.id` change, because nothing unmounts to do it for us.**

### 4.5 Back navigation

Apply the same transition language in reverse:

```text
Day → Overview
Overview → Home
```

Back should not instantly drop one hierarchy level while forward navigation animates.

## 5. Implementation tasks

Execute this as one integrated batch in the order below.

### T1 — Remove AMap revoke UI

Likely files:

- `src/components/amap-privacy-gate.tsx`
- `tests/components/amap-privacy-gate.test.tsx`

Acceptance:

- no revoke button is rendered in ready state;
- ready children still mount only after both native calls succeed;
- first consent, accepted hydration, refusal, version mismatch, native false/rejection, storage failure, and retry tests remain meaningful and pass;
- no Trip-scoped consent state appears.

### T2 — Close the Sheet bottom gap

Likely files:

- `src/components/trip-bottom-sheet.tsx`
- `tests/components/trip-bottom-sheet.test.tsx`

Acceptance:

- native Sheet background reaches the bottom edge;
- content retains Home Indicator clearance;
- snap percentages and camera-padding semantics remain unchanged;
- both Overview and Day use the same corrected shell.

### T3 — Add the shared transition foundation

Likely files:

- a new component/hook under `src/components/` or `src/state/`;
- focused component tests under `tests/components/` or `tests/state/`;
- theme motion constants only if they prevent duplicated timing values.

Acceptance:

- deterministic transition phases under fake timers;
- forward, backward, adjacent-next, adjacent-previous, neutral jump, duplicate-intent, and Reduce Motion behavior are covered;
- only one native map surface is mounted at a time.

### T4 — Smooth Home ↔ Trip Overview

Likely files:

- `src/app/index.tsx`
- `src/components/temporary-trip-list.tsx`
- `tests/app/home.test.tsx`

Acceptance:

- Overview is prefetched before Home is replaced;
- the old Home stays visible during pending work;
- query failure does not navigate;
- forward and back use the shared transition language;
- no full-screen loading-text flash occurs in this path.

### T5 — Smooth Overview ↔ Day

Likely files:

- `src/components/trip-planning-workspace.tsx`
- `src/components/trip-overview-workspace.tsx`
- `src/components/trip-overview-sheet.tsx`
- `src/components/trip-overview-place-preview.tsx`
- focused planning/overview tests.

Acceptance:

- all Day-entry intents prefetch through one controller;
- destination commits only after data readiness;
- failed Day read retains Overview;
- reverse navigation is equally smooth;
- Overview lifecycle camera selection remains unchanged.

### T6 — Smooth Day ↔ Day

> **SUPERSEDED (2026-09-16) by `TRAVEL-READY-PERSISTENT-DAY-VIEW`.** Day → Day is an in-place
> content swap on a persistent Day View, not a smoothed page transition. The acceptance items
> below that assume a Day-level transition ("directional and subtle", "Day Jump does not produce a
> large multi-page slide") no longer describe shipped behavior; the data-readiness, failure,
> duplicate-tap and camera-replay items still do. See §12.

Likely files:

- `src/components/trip-planning-workspace.tsx`
- `src/components/day-view-workspace.tsx`
- `src/components/day-header.tsx`
- `src/state/day-selection.ts`
- focused planning/header/camera integration tests.

Acceptance:

- previous and next Day navigation is directional and subtle;
- Day Jump does not produce a large multi-page slide;
- current Day stays visible while destination is pending;
- destination failure retains current Day;
- keyed remount/new camera request behavior remains;
- rapid repeated taps cannot interleave transitions;
- no old camera request is replayed after manual pan.

### T7 — Enlarge the Timeline edit action

Likely files:

- `src/components/day-timeline.tsx`
- `tests/components/day-timeline.test.tsx`
- Day workspace/editor-routing tests as needed.

Acceptance:

- each row has a rightmost dark edit button with a minimum 56 × 44 point target;
- the action is always visible when editing is available;
- row selection and edit are independent sibling targets;
- editing still opens the shared editor directly;
- long text and narrow widths remain usable.

### T8 — Integrate, document, and perform one new Release check

- Update `docs/agent/DEVELOPMENT_STATUS.md` and this plan with observed evidence.
- Update `docs/agent/TRAVEL_READY_UI_TASKS.md` so the next physical-device checklist covers the new motion and Sheet behavior.
- Preserve previous Release/device facts rather than rewriting them.
- After all automated checks pass, build/install/launch one new current Release and visually check the integrated batch once.

## 6. Automated verification

At minimum run:

```bash
npm test
npm run typecheck
npm run lint
npx expo install --check
npx expo export --platform ios
plutil -lint ios/TravelApp/Info.plist ios/TravelApp/Supporting/Expo.plist
```

Also run applicable Swift/native target checks if any native-facing map contract changes. This batch should not require an AMap/Google native implementation change merely to animate presentation.

Focused tests should prove behavior, not implementation trivia:

- no revoke UI, while consent hydration/readiness remains fail-closed;
- Sheet has no bottom inset gap and retains safe content padding;
- source screen persists while prefetch is pending;
- destination is committed only on success;
- duplicate navigation is ignored while transitioning;
- reduced-motion behavior;
- Day direction selection and neutral jump behavior;
- Day remount/camera identity regression;
- right-side edit target geometry and independent intent.

## 7. Physical-device acceptance

One current Release run should verify:

- no map strip appears below Overview or Day Sheet at collapsed, half, or expanded snaps;
- Expanded still retains only the intended map band above the Sheet;
- Home ↔ Trip Overview and Overview ↔ Day transitions contain no white flash, loading-text flash, default-map flash, or bounce;
- previous/next Day transitions move subtly in the expected direction;
- Day Jump feels neutral and does not simulate traversing many pages;
- rapid repeated navigation does not produce stacked screens or stale Day content;
- AMap and Google still show the correct target after transitions;
- a manual map pan is not reclaimed by an old request;
- every Timeline row's edit button is easy to tap and opens the correct Item;
- Reduce Motion produces a usable non-animated or opacity-only path.

Build success, Jest, export, Simulator, and native compilation are not visual-motion evidence.

## 8. Scope exclusions

Do not implement or reopen:

- M6 drag reorder;
- M9 Hotel/Transport date specialization;
- M10 Home Footprint architecture;
- M11 Delete/Undo;
- M13 expansion or release verdict;
- route/Leg/polyline/navigation features;
- new animation or navigation dependencies;
- a new app-wide routing architecture;
- changes to Trip Overview lifecycle Place selection;
- changes to AMap `screenAnchor`, privacy persistence format, provider search, CRS, or camera semantics unless a regression introduced by this batch requires a narrowly evidenced correction.

## 9. Completion state

Implementation is complete only when:

- T1–T8 are integrated;
- focused and full automated checks pass;
- no existing map/privacy/data tests were weakened to pass;
- the ledger records exact evidence and remaining limitations;
- the new Release build/install/launch is recorded;
- visual checks are either observed and recorded or honestly left pending with the exact external blocker;
- the batch remains `reported_complete_pending_verification` until required physical-device observations pass.

## 10. Implementation evidence (2026-09-16)

### 10.1 What changed

| Task | Files | Change |
|---|---|---|
| T1 | `src/components/amap-privacy-gate.tsx`, `tests/components/amap-privacy-gate.test.tsx` | Removed the floating `amap-privacy-revoke` control, the `revoking` state, the revoke-only effect and the `revoke` error action. Ready state now renders children directly. Global consent persistence, policy version, refusal, both native privacy calls, fail-closed and retry are unchanged. |
| T2 | `src/components/trip-bottom-sheet.tsx`, `tests/components/trip-bottom-sheet.test.tsx` | Removed the sheet-level `bottomInset`, which was lifting the white background off the physical bottom edge. Home Indicator clearance now lives only in content `paddingBottom`. Snap percentages and camera padding are untouched. |
| T3 | `src/state/planning-transition.ts` (new), `src/state/reduce-motion.ts` (new), `src/components/planning-surface-transition.tsx` (new), `__mocks__/react-native-reanimated.js` (new), `tests/state/planning-transition.test.tsx` (new), `tests/components/planning-surface-transition.test.tsx` (new) | One shared transition controller: phase machine (`idle`/`preparing`/`leaving`/`entering`), synchronous duplicate-intent guard, `dayIndex`-derived direction, Reduce Motion that skips both timers, and a single presentation host with a stable page background around one surface at a time. |
| T4 | `src/app/index.tsx`, `tests/app/home.test.tsx` | Home → Trip prefetches `tripKeys.overview(trip.id)` through the same query key the Trip shell reads, keeps Home visible while it is pending, commits only on success, and reports an actionable inline error on failure. Trip → Home reuses the same motion language in reverse. |
| T5 | `src/components/trip-planning-workspace.tsx`, `src/components/trip-overview-workspace.tsx`, `src/components/day-view-workspace.tsx`, `src/components/trip-back-button.tsx`, `tests/components/trip-planning-workspace.test.tsx` | All Day-entry intents (Overview Day List, occurrence Preview, header arrows/swipe, Day Jump) now pass through one `requestDay()` that prefetches `dayKeys.view(dayId)` before committing `TripFocus`. Failure keeps the source surface and shows a retryable inline error. Back is transitioned through the same controller. |
| T6 | `src/components/trip-planning-workspace.tsx`, `src/components/day-view-workspace.tsx`, `tests/components/trip-planning-workspace.test.tsx` | Adjacent Days are prefetched while the current Day is open. Adjacent previous/next uses `forward`/`backward`; a non-adjacent Day Jump is a neutral fade. `key={selectedDayId}` remount and the per-Day camera scope are preserved. |
| T7 | `src/components/day-timeline.tsx`, `tests/components/day-timeline.test.tsx`, `tests/components/map-timeline-selection.test.tsx`, `tests/components/temporary-trip-workspace.test.tsx` | Every Item row now carries an always-visible right-side `编辑` button (`colors.primaryDeep`, white semibold, radius 10, min 56 × 44 pt) as a sibling of the row-selection target. Tapping it opens the shared editor without a prior selection. |

No dependency was added or upgraded, and no AMap/Google native implementation changed.

### 10.2 Approved timing decisions

`PLANNING_TRANSITION_TIMING.home` is 110 + 130 ms (240 ms) for Home → Trip Overview.

`PLANNING_TRANSITION_TIMING.day` is 100 + 120 ms (220 ms) and is used for **both** Overview ↔ Day
and adjacent Day ↔ Day. The approved windows overlap (200–240 ms and 180–220 ms), so one shared
value keeps a single motion language instead of two imperceptibly different ones. Travel distance
is 10 pt (inside the approved 8–12 pt band); easing is `Easing.in(quad)` on exit and
`Easing.out(quad)` on entry. No spring, bounce, or large travel was introduced.

### 10.3 Automated evidence

```text
npm test                       72 suites / 393 tests passed
npm run typecheck              passed
npm run lint                   passed (0 errors, 0 warnings)
npx expo export --platform ios passed (dist bundle written)
plutil -lint ios/TravelApp/Info.plist ios/TravelApp/Supporting/Expo.plist
                               both OK
npx expo install --check       reports expo@57.0.22 vs expected ~57.0.23 (see 10.5)
```

The suite grew from the pre-batch 70 suites / 369 tests to 72 suites / 393 tests. New focused
coverage: 7 transition-controller tests, 6 transition-host tests, 6 Home shell tests, 9 planning
shell tests, and the rewritten Timeline edit-action tests.

Existing map/privacy/data tests were not weakened. The three tests that needed adjusting are
listed in §10.4.

### 10.4 Existing tests adjusted, and why

- `tests/components/map-timeline-selection.test.tsx` and `tests/components/temporary-trip-workspace.test.tsx`
  previously asserted the selection highlight on the inner content view. The highlight now covers
  the whole row (including the new trailing edit action), so both read the new
  `timeline-row-<itemId>` seam. The selection semantics being asserted are unchanged.
- `tests/components/day-timeline.test.tsx` previously asserted that only the *selected* row exposed
  `编辑`. That is exactly the behavior this batch replaces, so the test now asserts an always-visible
  button with the required geometry and an independent intent.
- `tests/components/amap-privacy-gate.test.tsx` previously asserted the revoke control existed and
  that revoking unmounted map content. That control is the thing being removed, so the test now
  asserts its absence and keeps the version-change fail-closed path.

### 10.5 Known limitation introduced or left open

`npx expo install --check` reports `expo@57.0.22` where the SDK now expects `~57.0.23`. This batch
added and changed no dependency, so the drift is upstream and pre-existing. It was left untouched
rather than bundling an unrequested dependency bump and native rebuild into a presentation batch.

### 10.6 Not yet verified

A Release build was installed and launched on the physical iPhone after the launch-blocking
UIScene defect in §11.2 was fixed, and the process stayed alive. No visual or interactive
observation of T1–T7 has been recorded, so the §7 checks remain open.

## 11. Physical-device verification (2026-09-16)

### 11.1 Licence blocker, resolved

The first attempt could not run: every Xcode command-line tool refused with
"You have not agreed to the Xcode license agreements". The user accepted the licence
(`sudo xcodebuild -license`), after which `xcodebuild`, `xcrun simctl` and `xcrun devicectl`
all work and the physical iPhone 17 Pro (`<DEVICE_UDID>`) is visible as paired.

### 11.2 Launch-blocking defect found and fixed: UIScene life cycle

The user's own Release build installed but the app crashed on every launch. Eleven crash
reports (`TravelApp-2026-09-16-111842` … `-112303`) all have the same faulting frame:

```text
EXC_BREAKPOINT / SIGTRAP
Thread 0 (com.apple.main-thread)
  UIKitCore  ___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke
  libdispatch.dylib  _dispatch_client_callout
  ...
  UIKitCore  UIApplicationMain
  TravelApp  main
```

Cause, per Apple TN3187 and reproduced locally: a build made with the current SDK (Xcode 27 /
iOS 27 SDK, the only SDK installed here) **must adopt the UIScene life cycle**; otherwise UIKit
traps at launch. The project had no `UIApplicationSceneManifest` and created its window in
`AppDelegate.application(_:didFinishLaunchingWithOptions:)`, i.e. the pre-scene single-window
life cycle. This is independent of the presentation work in T1–T7: it reproduces on any build
made with this SDK, including the JS state before this batch.

Fix:

- `ios/TravelApp/Info.plist` (and `app.config.js` `ios.infoPlist`, so a `prebuild` keeps it):
  `UIApplicationSceneManifest` with `UIApplicationSupportsMultipleScenes = false` and one
  `UIWindowSceneSessionRoleApplication` configuration naming
  `$(PRODUCT_MODULE_NAME).SceneDelegate`.
- `ios/TravelApp/AppDelegate.swift`: window creation and the React Native start moved out of
  `didFinishLaunchingWithOptions` into `startReactNative(in:launchOptions:)`, called from a new
  `SceneDelegate.scene(_:willConnectTo:options:)` with `UIWindow(windowScene:)`. The delegate
  forwards `scene(_:openURLContexts:)` and `scene(_:continue:)` back to `AppDelegate`, so
  `expo-linking` / `expo-router` URL and universal-link delivery is unchanged. No Expo
  subscriber implements the four active/background life-cycle callbacks, so no forwarding is
  needed for those.

Verification: rebuilt Release, installed as `com.example.travelapp.dev`, launched, and the
process was still alive 70 s later with no new crash report. Before the fix the same build
died within a second.

### 11.3 Environment defect: Swift macro sandboxing

In this session every Swift macro expansion failed:

```text
sandbox-exec: sandbox_apply: Operation not permitted
error: external macro implementation type 'SwiftUIMacros.StateMacro' could not be found
       for macro 'State()'; '.../swift-plugin-server' produced malformed response
```

`swiftc` runs its macro plugin server under `sandbox-exec`, which this environment refuses to
apply, so the server never answers. That made `expo-dev-menu`'s SwiftUI sources uncompilable
and failed the whole build with 60 errors. Minimal reproduction:

```bash
xcrun -sdk iphoneos swiftc -target arm64-apple-ios16.0 -typecheck probe.swift   # fails
xcrun -sdk iphoneos swiftc -disable-sandbox -target arm64-apple-ios16.0 -typecheck probe.swift  # passes
```

The successful build therefore used a throwaway xcconfig, not a repository change:

```bash
echo 'OTHER_SWIFT_FLAGS = $(inherited) -disable-sandbox' > /tmp/swift-no-sandbox.xcconfig
XCODE_XCCONFIG_FILE=/tmp/swift-no-sandbox.xcconfig xcodebuild \
  -workspace ios/TravelApp.xcworkspace -scheme TravelApp -configuration Release \
  -destination 'id=<DEVICE_UDID>' -allowProvisioningUpdates build
```

`$(inherited)` keeps every target's own flags, including the app's `-D EXPO_CONFIGURATION_RELEASE`.
This is a defect of the agent environment, not of the project: the user's own terminal build
compiles the same sources without it. It is deliberately **not** committed to the repository.

### 11.4 Still unobserved

The app now launches, but no visual or interactive observation of T1–T7 has been recorded. The
checklist in `TRAVEL_READY_UI_TASKS.md` §4 and §4.1 remains open, and this batch stays
`reported_complete_pending_verification`.

### 11.5 Follow-up risk

`ios/TravelApp/AppDelegate.swift` is a prebuild-generated file. Running `expo prebuild --clean`
would regenerate it and **lose the `SceneDelegate`**, reintroducing the launch crash. The
`Info.plist` half of the fix survives because it is also in `app.config.js`. A local config
plugin that re-applies the AppDelegate change would remove this fragility; it was not written
in this batch.

## 12. Supersession: persistent Day View (2026-09-16)

### 12.1 What was superseded

The user rejected the Day → Day behavior this plan specified in §4.4 and T6. The requirement is:

> 在不同 Day 之间切换时，Day View 页面必须保持为同一个持续挂载的页面。Bottom Sheet 一直固定，
> 只更新列表内部内容；地图保持为同一个原生地图实例，在这张地图上平滑移动到新 Day 的地点，
> 不能看起来像整页重新加载或弹窗跳入。

Superseded decisions:

| Superseded decision | Where | Replacement |
|---|---|---|
| `key={selectedDayId}` on the Day surface | §4.4, T6 | No key. One `DayPlanningView` / `DayViewWorkspace` / map / Sheet instance for the whole Day phase of the Trip. |
| Whole-page leaving/entering on Day → Day | §4.4, T6 | `PlanningTransitionRequest.inPlace` skips the `leaving` and `entering` phases entirely for Day → Day. |
| Day → Day unmounts and rebuilds the map and Bottom Sheet | §4.4, T6 | The map and the Sheet stay mounted; only `markers` and `cameraRequest` props change. |

Not superseded: Home ↔ Overview and Overview ↔ Day keep the page-level transition, the prefetch
and single-swap-point rules, duplicate-intent protection, and the failure-keeps-source behavior.
The AMap consent button, sheet bottom gap, Timeline edit action, Item editor, Migration 002,
custom Item types, native time picker and provider search/pagination/handoff are untouched by this
change.

### 12.2 What changed

| File | Change |
|---|---|
| `src/state/planning-transition.ts` | Added `PlanningTransitionRequest.inPlace`. When set, `run()` still runs `prepare` and still honours the `busy` single-intent guard, but `leave()`/`swap()` skip the `leaving`/`entering` phases and their timers. `phase` therefore never leaves `preparing` → `idle`. |
| `src/components/trip-planning-workspace.tsx` | Removed `key={selectedDayId}` from `DayPlanningView`. `requestDay()` now passes `inPlace: selectedDayId !== null`, so the same intent is a page swap from Overview and an in-place content swap from another Day. |
| `src/state/day-focus-effects.ts` | Focus state is tagged with the Day it belongs to. On `data.day.id` change the hook reissues `buildDayMapProjection(data).cameraRequest` with a **monotonic** `seq` (a per-Day counter would collide with the previous Day's key) and clears the pending Timeline scroll intent. A Day with no Place yields `request: null` instead of replaying the previous Day's camera. |
| `src/components/day-view-workspace.tsx` | Day-local transient state is reset in the same render that receives the new Day: Item editor, Day Jump, `lastViewportCenter`, and the Place-entry state machine. A `placeEntryRequestId` ref invalidates any in-flight provider session so a late resolution cannot reopen the old Day's flow. The sheet content scrolls to `y: 0` with `animated: false` while `sheetSnap` is left untouched. The map and `TripBottomSheet` are never conditionally unmounted on a Day change. |
| `src/components/day-timeline.tsx` | `resetKey` now derives a content key that invalidates the cached row offsets and any pending marker-to-row scroll, so a new Day cannot scroll to the previous Day's offset. |

No dependency was added or upgraded, no AMap/Google native bridge was rebuilt, and no native
marker diff was introduced — the prompt required visual evidence of AMap `setMarkers` flicker
before expanding the native change, and no such evidence exists yet.

### 12.3 Automated evidence

```text
npm test                       72 suites / 407 tests passed
npm run typecheck              passed
npm run lint                   passed
npx expo export --platform ios passed (dist bundle written, 1879 modules)
plutil -lint ios/TravelApp/Info.plist ios/TravelApp/Supporting/Expo.plist
                               both OK
npx expo install --check       reports expo@57.0.22 vs expected ~57.0.23 (pre-existing, §10.5)
```

Focused coverage added or rewritten for this change:

| Requirement | Test |
|---|---|
| Day → Day keeps one Day workspace, no unmount | `tests/components/trip-planning-workspace.test.tsx` — "keeps one Day workspace mounted when the selected Day changes" |
| Day → Day has no page-level transition | same file — "Day → Day swaps content in place without a page-level transition" |
| Adjacent and Day-Jump swaps use the same in-place path | same test (day-1 → day-2 → day-1 → day-3) |
| Failed destination keeps the current Day, retry works | same file — "a failed Day → Day swap keeps the current Day in place and offers a retry" |
| Rapid out-of-order intent cannot interleave | same file — "ignores a repeated Day intent while the first swap is still in flight" |
| Overview ↔ Day and Day → Overview keep the page transition | same file — prefetch, failure, and back tests |
| Item save invalidates the Day on screen, not a stale closure | same file — "an Item save after a Day swap invalidates the Day that is on screen" |
| One map, one sheet, one Day surface; Header/Timeline/markers update | `tests/components/day-view-workspace.test.tsx` — "keeps one map, one sheet and one Day surface when a new Day arrives" |
| New camera request key on identical coordinates | same file — "reissues the camera on the same map for a new Day even when the coordinate repeats" |
| A Place-less Day does not replay the old camera | same file — "a Day without a Place does not replay the previous Day camera" |
| Sheet content scroll resets, snap unchanged | same file — "resets the sheet content scroll to the top without changing the snap" |
| Editor, Day Jump, Place entry and viewport centre cleared on Day change | same file — three tests |
| Manual pan is not reclaimed; the next Day request still applies | `tests/infrastructure/map/google-map-renderer.test.tsx` and `tests/infrastructure/map/amap-map-renderer.test.tsx` |

The previous test that required the old Day to unmount on a Day change was inverted into a
persistent acceptance test rather than deleted: it now asserts `mountedDayIds === ['day-1']` and
`unmountedDayIds === []` after a Day change, and asserts the unmount happens only on Day →
Overview. No assertion was weakened, no mount/unmount counter was hidden, and no core data
exchange was mocked out.

### 12.4 Not verified

- **No physical-device visual observation.** Whether Day → Day actually reads as one map moving
  smoothly to the new Day, with no black/white frame, no default-region first frame and a fully
  static Bottom Sheet, is a visual claim. It has not been observed on the device, so this task is
  `reported_complete_pending_verification`. Jest, `expo export` and a successful build are not
  visual evidence.
- **AMap marker flicker.** The prompt asked for a minimal ID-based annotation diff only if a real
  device showed flicker from the full `remove/add` in `setMarkers`. That evidence does not exist,
  so no native change was made and the risk remains open until the device pass.
- **Content-swap opacity mask.** The prompt allowed an optional ~100–140 ms opacity transition on
  the Header/Timeline content region to mask the React content replacement, with Reduce Motion
  swapping instantly. It was not added; the swap is currently instantaneous. This is a permitted
  option, not a required behavior, and it is left for the device pass to judge.
- Day → Day is not covered by a separate Release verification round. Per the prompt, this change
  is integrated into the existing motion batch and verified in one combined Release pass
  (`TRAVEL_READY_UI_BATCH_DEVICE_VERIFY`).

