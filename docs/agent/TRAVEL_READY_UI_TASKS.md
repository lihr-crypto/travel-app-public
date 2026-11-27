# Travel-Ready UI and Search Batch

> Updated 2026-09-16. This ledger preserves the original six-task batch and
> records one user-authorized corrective batch, the motion/Sheet/Timeline
> action batch, and the persistent Day View follow-up that supersedes that
> batch's Day → Day behavior. All implementation and automated checks are
> reported complete; one consolidated post-batch Release/device acceptance
> remains pending and is currently blocked by an unaccepted Xcode licence.
> This document does not declare the app Travel-Ready.

## 1. Evidence boundary

The initiating evidence was physical-device feedback: China Trip maps could
open away from the intended Day, a known school did not appear in AMap results,
long search lists had no continuation, changing an Item's time did not change
its persisted order, Place confirmation saved immediately, and the Item editor
was difficult to use.

Jest, TypeScript, lint, Expo export, Swift parsing, and Pods target builds each
verify only their own layer. They do not establish provider ranking on-device,
Release startup, camera timing on a real map, or the editor's visual behavior.
All six tasks therefore remain
`reported_complete_pending_verification` until one combined Release run passes.

## 2. Batch task ledger

| Task | State | Implementation and evidence |
|---|---|---|
| `TRAVEL-READY-AMAP-CAMERA-V2` | `reported_complete_pending_verification` | AMap single-Place focus uses a deterministic, fitted region before applying sheet padding; multi-Place fit is retained; Day identity participates in camera request identity; native settlement emits request key and viewport. Trip Overview lifecycle camera policy remains scheduled-only. Focused projection/renderer tests and `ExpoAmapMap` Pods target build pass. Release/device observation remains open. |
| `TRAVEL-READY-AMAP-SEARCH-RELEVANCE` | `reported_complete_pending_verification` | AMap uses official Input Tips plus keyword POI results; search sends broad travel categories and comprehensive sort; only candidates with a POI UID and valid location can be confirmed. Suggestion and empty states are surfaced. Provider mocks cover relevant query/result rules; `ExpoAmapSearch` Pods target build passes. Live query quality remains open. |
| `TRAVEL-READY-PLACE-SEARCH-PAGINATION` | `reported_complete_pending_verification` | `PlaceSearchPage` carries results, an opaque continuation cursor, and suggestions. AMap carries query-bound page cursors; Google uses the installed Places SDK for iOS Text Search pagination, with Autocomplete suggestions as an empty-result aid. The FlatList deduplicates provider IDs, ignores stale keyword responses, retains existing rows on page errors, and exposes retry. Google attribution is shown. Adapter and component mocks do not call real providers. |
| `TRAVEL-READY-TIME-AWARE-ORDERING` | `reported_complete_pending_verification` | Item creation and time-field updates calculate and persist continuous `sortOrder` inside their exclusive transaction. Exact times map to a time bucket and sort by `HH:mm`; ties and period-only rows are stable; untimed rows come last. Real SQLite tests cover add, edit, peer reindex, and rollback. The current user-approved rule is recorded in Amendment §8 and Stage 02 §4.3. |
| `TRAVEL-READY-ITEM-CREATE-EDITOR` | `reported_complete_pending_verification` | Search and Map Picker selections open the same Item Draft form. Save passes title, type, time mode, period/exact fields, fixed state, and note through the existing confirmation Application Command. Place snapshot and Item persist atomically; failed save keeps the form and its values. Real SQLite confirmation tests and component tests pass. |
| `TRAVEL-READY-ITEM-EDITOR-UX-V2` | `reported_complete_pending_verification` | Create and edit share one field form, with a compact type row, no-time/period/exact controls, separate date/time inputs, multiline note, keyboard-aware scrolling, and a persistent Save/Cancel footer. Item Detail has a clear back/title/edit header; the repeated gray summary box and duplicate editor title are removed. Existing command validation and external-map handoff are preserved. Component tests pass. |

## 2.1 Corrective implementation follow-up (2026-09-16)

The latest physical-device feedback supersedes the V2 AMap camera claim above:
Google Trip Overview/Day View opened correctly, but AMap remained offset in both.
V2 changed the geographic camera center using a fitted latitude span. That
coordinate-space approximation did not set AMap's normalized screen anchor, so
it could not guarantee that the actual projected target Marker stayed inside
the map rectangle above the Sheet. The Trip Overview lifecycle selection policy
was not changed. V3 uses `MAMapStatus.screenAnchor`, preserves the original
GCJ-02 center for a single Place, waits for initialization/layout/request
readiness, and exposes post-settlement target screen projections for one-shot
acceptance. The previous V2 implementation and feedback record remain above.

| Corrective task | State | Implementation and evidence |
|---|---|---|
| `TRAVEL-READY-AMAP-CONSENT-PERSISTENCE` | `reported_complete_pending_verification` | AsyncStorage holds one global record with `agreed`, policy version and acceptance time. Every gate remount rehydrates; both Map and Search native privacy APIs must succeed before AMap content mounts. Refusal/revoke fail closed, and the visible revoke entry reopens confirmation. Component/storage/adapter tests cover cross-Trip sharing, remount/restart, stale version, refusal, native false/rejection, ordering and retry. |
| `TRAVEL-READY-AMAP-CAMERA-V3-SCREEN-ANCHOR` | `reported_complete_pending_verification` | Removed V2 coordinate shifting. Single Place keeps its original GCJ-02 center and uses normalized visible-rectangle center anchor/zoom 16; multiple Places retain `showAnnotations` and edge padding; Map Picker uses screen center. Native requests wait for map-init completion and valid layout. Manual pan suppresses that request key; a new Day key remains eligible. Settlement carries each target's actual map-to-screen projection, visible rect and containment result through the AMap renderer callback. AMap/Google adapter tests cover anchor conversion, pan suppression, Day key and evidence forwarding. |
| `TRAVEL-READY-DIRECT-ITEM-EDITOR` | `reported_complete_pending_verification` | The selected Timeline action is `编辑` and opens the shared editor directly. There is no read-only Item Detail stop. Successful save refreshes Day/Overview reads and returns to Day; failures retain the form/error. Provider-aware map handoff and attribution are integrated into the Place-bearing editor. |
| `TRAVEL-READY-DAY-PERIOD-NOON-MIGRATION` | `reported_complete_pending_verification` | Canonical values are morning/noon/afternoon/night. Migration 002 rebuilds the constrained table while preserving rows and payload JSON; legacy evening maps to night (irreversible). Exact buckets are 05:00–10:59, 11:00–13:59, 14:00–17:59, 18:00–04:59. Real SQLite tests cover migration/reopen/FKs, persisted ordering, ties and rollback. |
| `TRAVEL-READY-CUSTOM-ITEM-TYPE` | `reported_complete_pending_verification` | The existing `custom` Item type has an optional typed `CustomPayload { kind: 'custom'; label }` in `payload_json`. Its independent label trims and caps at 20 characters; blank becomes null/“其他”; mismatched or malformed payloads reject. UI switches clear stale payloads and Search, Map Picker, Add, Update, Timeline display, SQLite read/write/reopen are covered. |
| `TRAVEL-READY-NATIVE-TIME-PICKER` | `reported_complete_pending_verification` | Expo SDK 57-compatible native picker uses iOS `mode="time"`, `display="spinner"`, and five-minute increments. Day date is fixed/displayed; the end-time wheel is optional; local wall-clock fields are saved without UTC serialization. Existing cross-Day Hotel/Transport dates are retained because date editing remains M9. |
| `TRAVEL-READY-ITEM-EDITOR-HIERARCHY` | `reported_complete_pending_verification` | Shared create/edit form has a prominent time-mode segmented control, indented period/picker regions, compact type choice, multiline note, keyboard-safe actions and a separate custom label field. No repeated summary panel or read-only detail screen remains. |

Expo's [SDK 57 AsyncStorage reference](https://docs.expo.dev/versions/v57.0.0/sdk/async-storage/)
recommends `2.2.0`; the [SDK 57 date-time-picker reference](https://docs.expo.dev/versions/v57.0.0/sdk/date-time-picker/)
recommends `9.1.0` and `npx expo install`. iOS spinner mode and `minuteInterval`
are supported by the [picker API](https://github.com/react-native-datetimepicker/datetimepicker).

## 3. Search implementation references

AMap Input Tips is an iOS Maps SDK capability whose official `AMapTip` model
distinguishes a real POI by the presence of both a UID and location. The native
adapter drops tips without both fields before exposing saveable candidates.
[AMap Input Tips request](https://a.amap.com/lbs/static/unzip/iOS_Map_Doc/AMap_iOS_API_Doc_Search/interface_a_map_input_tips_search_request.html)
and [AMap POI search guide](https://lbs.amap.com/api/ios-sdk/guide/map-data/poi)
document the relevant interfaces.

Google's current Autocomplete (New) response is limited to five suggestions.
Because Place Search now has an incremental candidate list, the global provider
uses the already installed on-device `GooglePlacesSwift` Text Search and its
official pagination object; Autocomplete assists with alternate query text
when Text Search has no result. Returned third-party attribution text and HTTPS
links are retained for the result, preview, and saved Place detail. The custom
Google result surface uses Google's official dark-gray Maps logo. No Web Service
key was added.
[Autocomplete (New)](https://developers.google.com/maps/documentation/places/ios-sdk/place-autocomplete),
[Text Search and pagination](https://developers.google.com/maps/documentation/places/ios-sdk/text-search),
[Places Swift SDK release notes](https://developers.google.com/maps/documentation/places/ios-sdk/places-swift-release-notes),
and [Google Maps attribution](https://developers.google.com/maps/documentation/ios-sdk/policies)
are the implementation references.

## 4. Unified Release/device acceptance

Run this once after both implementation batches have been integrated. Use the mainland-China
Trip for AMap checks and a global Trip for Google checks.

- [x] Previous six-task Release build was installed/launched on the physical iPhone on 2026-09-15. This predates the corrective batch and is historical evidence only.
- [x] After the corrective batch's automated checks, the current Release app was built/installed/launched once on the physical iPhone on 2026-09-16.
- [x] Motion/Sheet/Timeline batch: current Release built, installed and launched on 2026-09-16 after the UIScene launch fix (see §5.1). The process stayed alive; no crash report was produced.
- [ ] Observe the app's visible startup screen and perform the remaining checklist flows below.
- [ ] In the China Trip, verify Overview opens on the first populated Day before
  travel, today's populated Day during travel (or nearest later/earlier populated
  Day when today is empty), and all scheduled Places after travel. Unscheduled
  Places must not pull the default camera.
- [ ] Switch between two geographically separated Days. The new Day must fit
  its own Places even when a coordinate repeats; a selected Place stays inside
  the visible map band above the Bottom Sheet. Manually move the map and confirm
  the previous focus request is not replayed; a new Day request still applies.
- [ ] Verify a one-Place Day uses a reasonable close view with the target above
  the sheet at collapsed, half and expanded heights. Confirm the target keeps
  its original GCJ-02 coordinate, and the native settlement evidence reports
  its projected screen point inside the visible map rectangle.
- [ ] Verify multiple Places retain native fit/edge padding and that Map Picker
  uses the screen-center anchor with no sheet padding.
- [ ] With previously accepted consent, restart the app and verify the policy
  page is skipped only after both native privacy APIs are ready. Across two
  China Trips, consent remains global. Verify refusal, revoke, retry and a
  policy-version change all remain fail-closed until the user confirms again.
- [ ] Search and inspect the actual AMap candidates for `中国传媒大学`, `天安门`,
  `北京南站`, and `上海迪士尼度假区`. Check relevance, suggestion/empty
  behavior, and that every saveable candidate has a real UID and coordinate.
- [ ] Scroll AMap results to the end and load the next page. Confirm no duplicate
  POIs, that the same keyword/region is retained, that a failed page keeps the
  existing list, and retry succeeds.
- [ ] In a global Trip, run a known-place Text Search, scroll to the next page,
  verify existing candidates remain on failure, and confirm the official Google
  Maps logo and any returned third-party attribution links are visible and
  actionable.
- [ ] Add a Place from search and from Map Picker. Each must open the same editor;
  change title/type/time/fixed/note; Save creates the snapshot and Item together.
  Cause or observe a validation/save failure and verify the form values remain.
- [ ] From a selected Day Timeline row, tap `编辑` and verify the shared editor
  opens directly with no read-only detail page. Change title/type/period/time,
  fixed state and note; verify keyboard access, Save/Cancel, save errors,
  refreshed Day/Overview data, and return to Day.
- [ ] Verify the parent `无时间 / 时段 / 精确时间` segmented control. Period
  choices are visibly subordinate (`上午 / 中午 / 下午 / 晚上`). Exact time
  uses the native spinner; the current Day date is fixed, end time is optional,
  and no manual date/HH:mm inputs remain.
- [ ] In create and edit flows, select `其他`, enter a custom type label, save,
  restart/read it back, and confirm Timeline shows that label independently of
  the title. Test blank label, type switching/clearing and the 20-character cap.
  Confirm Hotel/Transport payloads are preserved only for matching types.
- [ ] Verify adding a timed Item and changing an existing Item's time persists
  `上午 → 中午 → 下午 → 晚上 → 未设置`, exact HH:mm ordering, stable same-time
  and period-only order, and matching Timeline/map numbering. A later explicit
  manual reorder must still override automatic ordering.
- [ ] Verify Place Search's leading back control, the Day Timeline's final row
  and marker-to-row scroll, the separated external-map button, AMap app-first
  handoff, and the existing fallback behavior.

## 4.1 Motion, Sheet, and Timeline action checks (added 2026-09-16)

Run these together with §4 in the same Release build. Every item below is
**unobserved** — the batch that introduced it has automated evidence only.

- [ ] Confirm the ready AMap surface shows no floating `撤销地图同意` control.
  Separately confirm first consent, accepted restart, cross-Trip consent,
  refusal, policy-version change, both native readiness calls, and retry still
  behave fail-closed.
- [ ] In both Trip Overview and Day View, check the Bottom Sheet at collapsed,
  half, and expanded: no map strip is visible *below* the white sheet, and no
  content is hidden behind the Home Indicator. Expanded must still leave only
  the intended small map band above the sheet.
- [ ] Home → Trip Overview: no white flash, no `旅行加载中…` frame, no
  default-map flash, no bounce. Then Trip Overview → Home.
- [ ] Trip Overview → Day View and Day View → Trip Overview: same expectations,
  with no `Day 加载中…` frame.
- [ ] Tap a Day row twice in quick succession and confirm the app does not stack
  surfaces or land on the wrong Day.
- [ ] ~~Header previous/next: the swap should read as a subtle movement in the
  correct direction. Open the Day Jump and pick a distant Day: it should read as
  a neutral fade, not a multi-page travel.~~ **Superseded 2026-09-16 by
  `TRAVEL-READY-PERSISTENT-DAY-VIEW`.** Day → Day is now an in-place content
  swap on a persistent Day View, not a page transition. Use the checks in §4.2
  instead. The failure/duplicate-tap expectations below still apply.
- [ ] Switch between two geographically separated Days and confirm the new Day
  still fits its own Places, a selected Place stays inside the visible map band,
  a manual pan is not reclaimed by the old request, and a repeated coordinate
  still triggers the new Day request.
- [ ] Every Timeline row shows a dark `编辑` button at the far right. Tap it on a
  row that is *not* selected: the shared editor must open for that Item. Tap the
  row itself: it must only select and synchronise the marker.
- [ ] With a long title and a long note on a narrow iPhone, the `编辑` button
  stays fully visible and tappable and no horizontal scrolling appears.
- [ ] Enable iOS Reduce Motion and repeat the Home → Trip, Overview → Day, and
  Day → Day navigations. Each must remain usable with an instant or
  opacity-only swap.

## 4.2 Persistent Day View checks (added 2026-09-16)

Run these in the same combined Release build as §4 and §4.1. Every item is
**unobserved**: the change has automated evidence only, and none of these are
visual claims that Jest or a bundle export can settle.

- [ ] Day 1 → Day 2 via the header arrow: the map must not black out, white out,
  or show a default/global first frame. It must read as the *same* map moving to
  Day 2's Places.
- [ ] The Bottom Sheet handle, white background, corner radius and position must
  be completely static across the switch. Only the Header text, the Timeline
  rows and the markers change.
- [ ] The sheet snap must survive the switch: collapsed stays collapsed, half
  stays half, expanded stays expanded. The content list must start at the top
  without the whole Sheet jumping.
- [ ] Day Jump to a distant Day and back: same persistent behavior, no
  full-page slide or fade, no second map instance.
- [ ] Day View → Trip Overview → back into a Day still performs the page-level
  transition, and the Day surface is only torn down there.
- [ ] Switch Day with the Item editor open, then with the Day Jump open, then
  mid-Place-entry: the new Day must not inherit the previous Day's editor, jump
  sheet, or pending Place provider flow.
- [ ] Pan the map manually on Day 1, then switch to Day 2: the map must not snap
  back to Day 1's old request, and Day 2's own request must still apply.
- [ ] Repeat on both an AMap (mainland China Trip) and a Google (global Trip)
  Trip. Watch specifically for AMap marker flicker during the marker swap; if
  flicker is clearly visible, report it as evidence for an ID-based annotation
  diff, which was deliberately not written without that evidence.
- [ ] Tap two different Day entries in rapid succession: the app must not show
  the wrong Day or a stale marker set.
- [ ] Enable iOS Reduce Motion and repeat the Day → Day switch.

## 4.3 Item Place editing checks (added 2026-09-16)

Run these in the same combined Release build. Every item is **unobserved**: the
task has automated evidence only.

- [ ] Open a Day View Item that has a Place. The editor shows a `地点` row with the
  current Place name and both `更换` and `清除`.
- [ ] Open a Place-less Item. The row shows `未设置` and only `添加`; there is no
  destructive action to press.
- [ ] Press `更换`. The editor must close **before** the picker appears, and the
  picker must open on the Item's current Place, not on wherever the map was left.
- [ ] Pick a new Place from search. The Item Draft form must **not** appear. After
  confirming, the Day returns with the Item still selected and its marker at the
  new location; the Item's title, type, time and note are unchanged.
- [ ] Repeat from the Map Picker crosshair.
- [ ] Confirm the map does **not** fly back to the old Place after the change.
- [ ] Press `清除`. The Item's marker disappears; the remaining markers keep their
  numbers with no gap; the editor stays open and the row reads `未设置`.
- [ ] Check both regions: a mainland China Trip must only offer AMap candidates and
  a global Trip only Google candidates. A mismatched provider must be rejected with
  an inline error and the Item must keep its old Place.

## 4.4 Item editor keyboard checks (added 2026-09-16)

Run these in the same combined Release build. Every item is **unobserved**: the
task has automated evidence only.

- [ ] In the Item editor, tap the note field on a narrow iPhone. The whole field
  must be visible above the keyboard, with no part of it behind the keyboard.
- [ ] Type several lines into the note so it grows. The caret must stay visible;
  the form must follow it rather than letting it sink behind the keyboard.
- [ ] Tap the title field, then the custom type label (with `其他` selected), then
  the note: each must come fully into view without the form jumping around.
- [ ] Confirm the form does not jump or re-scroll while typing if you are not in a
  text field, and that dismissing the keyboard restores the normal layout with no
  leftover gap.
- [ ] In the create flow (from Place Search or the Map Picker), confirm the
  Save/Cancel row is still reachable above the keyboard and that the fields scroll
  into view there too.
- [ ] Confirm there is no double gap: the space between the last field and the
  keyboard must not look larger than in the create flow.

## 4.5 固定行程 removal checks (added 2026-09-16)

Run these in the same combined Release build. Every item is **unobserved**: the
task has automated evidence only.

- [ ] Open the Item editor for an existing Item. There must be no `固定行程` row
  and no toggle between the time section and the note field.
- [ ] Open the create flow (Place Search → confirm, and Map Picker → confirm).
  There must be no `固定行程` row there either.
- [ ] Look at a full Timeline for a Day with several Items. No Item may show a
  `固定` badge in its metadata row.
- [ ] Edit an Item and save it. The other fields must round-trip unchanged and
  the editor must close normally — the removed row must not have left a gap or a
  stray divider in the form layout.
- [ ] Confirm the form still fits without the row: the note field must not be
  pushed off-screen on the smallest supported device.

## 4.6 移出当天 / 未安排 checks (added 2026-09-16)

Run these in the same combined Release build. Every item is **unobserved**: the
task has automated evidence only.

- [ ] Open an Item from the Day Timeline. There must be a `所在日期` row showing
  `Day N · <date>` and a `移出当天` action.
- [ ] Tap `移出当天`. The editor must close, and the row must disappear from that
  Day's Timeline.
- [ ] Tap `未安排` in the Trip Overview. You must land on a distinct 未安排 surface
  — **not** stay on the Overview. Previously this button changed nothing visible.
- [ ] On the 未安排 surface, the moved Item must be listed. Tap `安排到日期`, pick a
  Day, and confirm the Item reappears in that Day's Timeline.
- [ ] With no unscheduled Items, the surface must show the empty state rather than
  a blank screen, and Back must return to the Overview.
- [ ] Confirm the Overview's 未安排 count changes after a move out and after a
  move back.

## 5. Release command and device identifiers

The repository's prior device runs require portable Ruby/CocoaPods on `PATH`.
Use the Expo UDID for installation/build and the separate `devicectl` identifier
only for post-install launch/snapshot commands.

```bash
export PATH="$HOME/.gem/ruby/4.0.0/bin:$HOME/homebrew/Library/Homebrew/vendor/portable-ruby/4.0.6/bin:$PATH"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(git rev-parse --show-toplevel)"
EXPO_MAPS_REQUIRE_KEYS=1 npx expo run:ios --device <DEVICE_UDID> --configuration Release --no-bundler
```

- Expo / Xcode device UDID: `<DEVICE_UDID>`
- `devicectl` identifier: `<DEVICECTL_IDENTIFIER>`

Release run record, 2026-09-15: the command above completed with `Build Succeeded`,
installed `com.example.travelapp.dev`, and `devicectl device process launch` returned
success. Xcode reported zero errors and 4,096 warnings, primarily unavailable object
files while generating dSYM information for the vendor AMap static libraries. The app
launch command succeeded, but no visual or interactive device observations have been
recorded yet; the remaining checkboxes stay open.

Corrective Release run, 2026-09-16: the §5 `npx expo run:ios --device ...`
command completed with
`Build Succeeded`, zero errors and 4,096 warnings (primarily unavailable AMap
vendor object files while generating dSYM information). The app installed as
`com.example.travelapp.dev`; `devicectl device process launch` succeeded, and
the process list showed `TravelApp.app/TravelApp` running. The initial device
inventory briefly reported unavailable before reconnecting. QuickTime did not
provide a live preview; no recording or file was saved, and its Open panel is
left visible. No visual/interactive observations are claimed; those checks remain
open. Simulator/target builds are not a substitute.

### 5.1 Motion/Sheet/Timeline Release run, 2026-09-16 (later)

The user's own Release build of this batch installed but crashed on every launch.
Eleven crash reports (`TravelApp-2026-09-16-111842` … `-112303`) all fault at
`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`. Cause: a build
made with the current SDK (Xcode 27 / iOS 27 SDK) must adopt the UIScene life
cycle (Apple TN3187); the project still used the pre-scene single-window
`AppDelegate`. It is unrelated to the presentation batch — any build made with
this SDK fails the same way.

Fix and re-run:

- `UIApplicationSceneManifest` added to `ios/TravelApp/Info.plist` and to
  `app.config.js` `ios.infoPlist`.
- `SceneDelegate` added in `ios/TravelApp/AppDelegate.swift`; the window is now
  `UIWindow(windowScene:)` created when the scene connects, and React Native is
  started from there. URL / universal-link callbacks are forwarded back to
  `AppDelegate` so `expo-linking` / `expo-router` behaviour is unchanged.
- Rebuild command (the `XCODE_XCCONFIG_FILE` line is a workaround for this
  session's inability to use `sandbox-exec`; see the plan §11.3):

```bash
export PATH="$HOME/.gem/ruby/4.0.0/bin:$HOME/homebrew/Library/Homebrew/vendor/portable-ruby/4.0.6/bin:$PATH"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(git rev-parse --show-toplevel)"
echo 'OTHER_SWIFT_FLAGS = $(inherited) -disable-sandbox' > /tmp/swift-no-sandbox.xcconfig
XCODE_XCCONFIG_FILE=/tmp/swift-no-sandbox.xcconfig xcodebuild \
  -workspace ios/TravelApp.xcworkspace -scheme TravelApp -configuration Release \
  -destination 'id=<DEVICE_UDID>' -allowProvisioningUpdates build
xcrun devicectl device install app --device <DEVICE_UDID> \
  "<path-to-built-app>/TravelApp.app"
xcrun devicectl device process launch --device <DEVICE_UDID> --terminate-existing com.example.travelapp.dev
```

Result: `** BUILD SUCCEEDED **`, installed as `com.example.travelapp.dev`,
launched, and the process was still alive 70 s later with no new crash report.
The built `Info.plist` carries
`UISceneDelegateClassName = TravelApp.SceneDelegate`. No visual or interactive
observation is claimed; §4 and §4.1 remain open.

### 5.2 Integrated persistent-Day-View Release run, 2026-09-16 (later)

One Release build now carries the corrective batch, the motion/Sheet/Timeline
batch, the UIScene fix **and** the persistent Day View change. Same commands as
§5.1.

- `** BUILD SUCCEEDED **` (exit 0). Both `TravelApp.app/TravelApp` and
  `TravelApp.app/main.jsbundle` were written at 16:47, i.e. the JS bundle is
  from this build, not a stale artifact.
- The bundle really contains the new code: `inPlace` — the property introduced
  by `PlanningTransitionRequest.inPlace` — is present in the Hermes string table
  of `main.jsbundle`. (Local variable names such as `placeEntryRequestId` are
  correctly absent; Hermes does not retain them, so their absence is not
  evidence either way.)
- Installed as `com.example.travelapp.dev` (container
  `<APP_CONTAINER_ID>`).
- Launched with `devicectl device process launch --terminate-existing`. The
  process was still alive 45 s later (PID 4926).
- **No new crash report.** The `systemCrashLogs` set was enumerated before and
  after: 13 files, newest `TravelApp-2026-09-16-115940.ips`, unchanged. Every
  existing report predates the UIScene fix.
- **No visual or interactive observation was obtained, and none is claimed.**
  `devicectl device capture screenshot` does work on this toolchain (the earlier
  "no screenshot route" note is obsolete), but the first capture returned the
  user's own foreground app, not TravelApp. The device was in active use, so the
  app was not brought forward. `devicectl` also has no tap/swipe injection and
  the app exposes no per-Day deep link, so a Day → Day swap cannot be driven
  from the command line in any case.

§4, §4.1 and §4.2 therefore remain open. A build, an install, a live process and
an absent crash report are not visual evidence.

## 6. Automated and native verification

The integrated corrective batch passes:

- Corrective focused regressions: 17 suites / 121 tests (privacy, native map
  request/settlement, UI/editor/time picker, real SQLite/migration/order).
- Full Jest suite: 70 suites / 369 tests.
- `npm run typecheck`.
- `npm run lint`.
- `npx expo install --check`.
- `npx expo export --platform ios`.
- `plutil -lint` for generated app `Info.plist` and Expo plist; filtered public
  config confirms iOS-only target and `com.example.travelapp.dev`.
- AMap Swift/native target checks and full iOS Simulator Release-scheme build.

### 6.1 Motion/Sheet/Timeline batch (2026-09-16)

- Full Jest suite: **72 suites / 393 tests passed** (up from 70 / 369). New
  focused coverage: 7 transition-controller tests, 6 transition-host tests,
  6 Home shell tests, 9 planning shell tests, and the rewritten Timeline
  edit-action tests.
- `npm run typecheck` — passed.
- `npm run lint` — passed, 0 errors and 0 warnings.
- `npx expo export --platform ios` — passed; iOS bundle written to `dist`.
- `plutil -lint ios/TravelApp/Info.plist ios/TravelApp/Supporting/Expo.plist` —
  both `OK`.
- `npx expo install --check` — **does not pass**: it reports `expo@57.0.22`
  where the SDK now expects `~57.0.23`. This batch added and changed no
  dependency, so the drift is upstream and pre-existing; it was deliberately not
  bundled into a presentation batch, because a dependency bump would force an
  unrequested native rebuild.
- **No native, Release, Simulator, or device check ran at implementation time.**
  Every Xcode command-line tool refused to run with "You have not agreed to the
  Xcode license agreements": `xcodebuild -showsdks`, `xcrun simctl list devices`
  and `xcrun devicectl list devices` all failed. The licence was accepted later
  the same day; see §5.1 for the resulting Release build, install and launch.
  The Simulator was never used as a substitute for device acceptance.

The focused count above is the combined assertion count in the final corrective
run; the individual AMap/Google focused suite is also included. Tests never call
the real Map/Search services. The two Swift/Xcode checks establish source/native
compilation only, not physical-device camera or visual acceptance.

### 6.2 Persistent Day View batch (2026-09-16)

- Full Jest suite: **72 suites / 407 tests passed** (up from 72 / 393). The
  added tests are the persistent-acceptance rewrite in
  `tests/components/trip-planning-workspace.test.tsx`, the new Day-swap tests in
  `tests/components/day-view-workspace.test.tsx`, the `resetKey` coverage in
  `tests/components/day-timeline.test.tsx`, the `inPlace` coverage in
  `tests/state/planning-transition.test.tsx`, and the manual-pan test in
  `tests/infrastructure/map/google-map-renderer.test.tsx`.
- Focused suites: `trip-planning-workspace`, `day-view-workspace`,
  `day-timeline`, `planning-transition` — 4 suites / 48 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npx expo export --platform ios` — passed; iOS bundle written to `dist`
  (1879 modules).
- `plutil -lint ios/TravelApp/Info.plist ios/TravelApp/Supporting/Expo.plist` —
  both `OK`.
- `npx expo install --check` — still reports `expo@57.0.22` vs `~57.0.23`. No
  dependency was added or changed by this batch, so the drift is unchanged and
  still pre-existing.
- **No native, Release, Simulator, or device check ran for this change.** No
  native source was modified: the renderers already accepted new `markers` and
  `cameraRequest` props, so no AMap/Google bridge rebuild was required or
  performed. The AMap `setMarkers` full remove/add was deliberately left alone,
  because the prompt required real-device flicker evidence before expanding the
  native change.

The test that previously required the old Day to unmount on a Day change was
inverted into a persistent acceptance test, not deleted: it now asserts one
mounted Day workspace and zero unmounts across a Day change, and that the
unmount happens only on Day → Overview. No assertion was weakened, no
mount/unmount counter was hidden, and no core data exchange was mocked away.

This batch remains `reported_complete_pending_verification`. The §4.2 checks are
visual claims and stay open.

The iOS export is only a JavaScript bundle check. Pods/native target builds and
the full iOS Simulator Release-scheme build establish compilation only, not
physical installation or visual acceptance. The previous physical Release app
was built/launched before this corrective batch. A new single post-batch physical
Release installation/launch and all visible/interactive checks in §4 remain open
until that unified run.

## 7. Scope kept for later

This batch does not implement M6 drag gestures, M9 Hotel/Transport specialization,
M10 Home, M11 Delete/Undo, or M13 full release expansion. This document records
no Travel-Ready verdict; the final review remains a later task after the unified
device acceptance and existing Unscheduled/reorder product gaps are handled.
