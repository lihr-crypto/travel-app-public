# Travel App — Product Realignment Amendment

> Date: 2026-09-11  
> Status: **User-approved product/UI correction**  
> Scope: Supersedes conflicting product/UI semantics in Stage 01–06 and the prior Review Decision Record.  
> Development impact: **M0 does not need rollback; M1 domain/persistence remains valid. Main impact begins at M4/M5, with an M8 scope reduction.**

## 1. Re-confirmed core need

Travel App exists primarily to **store, organize, browse and edit a personal travel plan**:

```text
Trip
  -> Day
      -> Ordered Items
```

The user may use AMap / Google Maps / Xiaohongshu / other apps to decide:

- exact route and route alternatives;
- navigation and traffic;
- what attractions/restaurants are worth visiting;
- detailed destination discovery/攻略.

Travel App does not need to duplicate those capabilities.

## 2. Canonical product invariant

> **A Trip is an ordered plan organized by Day. Timeline is the primary planning and browsing projection. Map is a synchronized spatial projection of saved Places. Neither view may invent routing or duplicate canonical itinerary state.**

Home remains map-centered because the travel-footprint experience is valuable as a Trip-entry/history surface.

## 3. Unified UI for all travel shapes

The same UI/navigation must handle city tourism, road trips and multi-city travel. Beijing and Sample do **not** get separate layouts.

### Home Map

- Trip / Trip Cluster markers.
- Travel-footprint entry surface.
- Active Trip shortcut and Create Trip.

### Trip Overview

```text
Top:    Trip-wide saved Place distribution / clusters
Bottom: Day List
```

Rules:

- no Day anchors on map;
- no D1/D2/D3 marker sequence;
- no cross-Day route lines;
- Day Row is primary navigation into a Day;
- Place marker tap opens occurrence Preview; if repeated across Days, user selects occurrence;
- no persistent “简介” tab; Trip note belongs to settings/editing.

### Day View

```text
Top:    current-Day Place-bearing Item markers
Bottom: complete current-Day Ordered Timeline
```

Marker numbering:

1. sort all current-Day Items by canonical itinerary order (`sortOrder`);
2. filter to Items with a Place;
3. assign continuous display numbers `1..N`.

Therefore an Item without Place remains in Timeline but creates neither Marker nor numbering gap.

Default:

- other Days hidden;
- no route/polyline;
- camera fits current Day Places whether span is 2 km or 300 km.

### Item Selected

- same Day View, not a separate page;
- Marker tap and Timeline Item tap select the same Item;
- selected Item expands; corresponding Marker highlights;
- explicit `编辑` opens the shared Item editor directly; there is no
  read-only detail page between Timeline and editing;
- `在地图中打开` hands Place to AMap / Google Maps.

## 4. Place Search role

Place Search is an **input helper**, not a recommendation/discovery system.

```text
User already knows “颐和园”
-> search provider POI
-> Preview
-> explicit Add to Day / Unscheduled
-> save provider-native coordinate snapshot
```

Do not add “附近热门 / 猜你喜欢 / 推荐路线 / 餐厅推荐” to V1.

## 5. Route / Leg decision

Final V1 decision:

```text
Item order = plan sequence
Transport Item = separately planned/booked/timed movement
External map = route selection/navigation
```

V1 does **not** include:

- Leg domain/table/repository/reconciler;
- Leg rows;
- route polylines;
- ordinary-movement duration/distance editing;
- RouteProvider;
- automatic routing, ETA, traffic or navigation.

If a disposable development Migration 001 already contains `legs`, remove it before M0 exit and rebuild the development database. Only non-disposable compatibility data justifies a private forward-migration exception; that exception does not change the canonical product/domain model.

## 6. Milestone impact

| Milestone | Decision |
|---|---|
| M0 | No change / no rollback |
| M1 | Trip + Day persistence remains valid |
| M2 | Timeline + Item becomes even more central; no Leg core |
| M3 | Move / reorder / Unscheduled remains valid |
| M4 | DayMapProjection = current-Day Place-bearing Items; no required polyline |
| M5 | Rename conceptually to Final Trip Planning Shell; implement revised Overview/Day/Selected semantics |
| M6 | Drag reorder remains valid |
| M7 | Place input/search + Map Picker + external-map handoff remain valid |
| M8 | Retired/reserved; no implementation |
| M9 | Hotel + Transport Item specialization remains valid |
| M10 | Home Footprint Map remains valid |
| M11–M13 | Mostly unchanged |

## 7. Non-negotiable UI consistency

Beijing city tourism and Sample road-trip examples must use:

- same screen hierarchy;
- same Bottom Sheet behavior;
- same Day navigation;
- same Item selection flow;
- same Add Item flow;
- same marker semantics.

Only map extent, marker density and the actual data differ.

## 8. Item time edits determine persisted itinerary order (2026-09-15)

This later user-approved correction supersedes the older Stage 02 statement that
Timeline order is independent of time.

- `sortOrder` remains the single persisted order used by Timeline and map marker
  numbering; sorting only the presentation is insufficient.
- Creating an Item or changing its time fields recalculates a Day's or
  Unscheduled collection inside the same exclusive transaction and rewrites
  continuous `sortOrder` values.
- Buckets sort as `morning → noon → afternoon → night → no time`. Exact starts
  map to morning for 05:00–10:59, noon for 11:00–13:59, afternoon for
  14:00–17:59, and night for 18:00–04:59. Exact Items sort by `HH:mm` within
  a bucket; same-time ties preserve the previous order. Exact Items precede
  period-only Items in the same bucket, whose relative order stays stable.
- Manual reorder remains a later direct override. Ordinary reads do not
  re-sort the collection; only Item creation or an explicit time-field update
  applies the automatic order.

## 9. DayPeriod labels and legacy migration (2026-09-16)

This user-approved correction supersedes older four-period wording in the
Stage 01/05/06 snapshots and the previous `evening` enum contract. The
canonical DayPeriod values and visible labels are:

```text
morning   上午
noon      中午
afternoon 下午
night     晚上
```

Migration 002 rebuilds the constrained Item table without dropping rows and
maps legacy values as follows: `morning → morning`, `afternoon → afternoon`,
`evening → night`, and `night → night`. The old `evening` distinction cannot
be recovered after migration; folding it into `night` is the explicit
compatibility decision. Exact-time bucket boundaries are governed by §8.

## 10. Direct Item editor and time-entry hierarchy (2026-09-16)

- The selected Day Timeline action is `编辑` and opens the editable Item form
  directly; no read-only Item Detail page is part of the flow.
- Creation from Place Search/Map Picker and editing reuse the same draft form.
  The Item title stays independent from the optional custom category label.
- Time precision is a parent segmented control (`无时间 / 时段 / 精确时间`).
  Period choices (`上午 / 中午 / 下午 / 晚上`) appear in a subordinate region.
- Exact times use a native time wheel. The current Day date is displayed and
  fixed; an end-time wheel is optional. Persist local `YYYY-MM-DDTHH:mm`
  fields from the picker’s local hour/minute, never via UTC serialization.
- Save and Cancel remain reachable while scrolling or using the keyboard.
  Save failure preserves the draft and exposes the error; success refreshes
  Day/Overview reads and returns to Day.
- A Place-bearing Item may expose provider-aware external-map handoff and its
  provider attribution in the editor. Place-less Items expose no map action.


## 11. Trip management, cross-border planning and independent time endpoints (2026-10-08)

The user explicitly requested this update and confirmed that one Trip must support
both mainland-China and overseas Items. This section supersedes the older
creation-time region selector, single-provider-per-Trip rule and required-start-time
contract wherever they conflict.

- New Trip has no `旅行范围` field. Its departure/return fields use the shared
  Gregorian calendar with Chinese year/month/day labels; persistence stays ISO date-only.
  The existing `map_region` column remains a legacy empty-map/SDK hint, not a constraint
  on which places a Trip can own. No migration or rewriting of existing rows is needed.
- Place search automatically combines available AMap and Google results, preserving
  each result's provider, native coordinate system and attribution. A source failure
  retains the healthy results and is disclosed; continuation tokens stay source-specific.
  Foreign-CRS query centers are omitted, not relabelled. AMap search still requires
  native privacy readiness; declining optional mainland search consent leaves overseas
  search available.
- A Trip may persist both GCJ-02 and WGS84 Places. Commands verify each snapshot against
  its own provider and Item/Trip ownership. Day and Overview projections retain every
  Item occurrence and both coordinate families. The active native map follows the selected
  Place, then camera focus, then the first Place, and displays only that map's coordinate
  family. Selecting a different-source Timeline Item switches the native map, while the
  Day Workspace and sheet remain mounted. No coordinates are converted or rewritten,
  and no Google Places listing is drawn on a non-Google map. An all-regions map displaying
  both sources simultaneously is not claimed by this implementation.
- External-map handoff follows the saved Place's own coordinate family, rather than the
  Trip's old map hint. Map Picker confirms coordinates from its actual native map.
- The Unscheduled date action is `安排到某一天`; `永久删除` requires a named confirmation
  and discards the returned in-memory Undo snapshot. Existing ordinary Day delete/Undo
  remains available. Day creation is labelled `添加行程`.
- Home's Trip rows and the Trip Overview title offer `修改旅行名称` and `删除整趟旅行`.
  Rename preserves Trip/Day/Item identities. Whole-Trip deletion requires a confirmation
  naming the Trip and its Days plus scheduled/Unscheduled Items, and deletes through an
  exclusive transaction plus existing foreign-key cascade. Shared Place rows survive.
  Successful operations refresh the Home/Trip reads; deleting the open Trip returns Home.
- Exact Item time requires at least one endpoint: start only, arrival/end only, or both.
  Setting/clearing either endpoint does not create or clear the other. Hotel keeps its
  check-in/out labels; Transport keeps departure/arrival labels. Arrival-only Items sort
  by their saved end time, remain visible in Timeline and retain local wall-clock values
  across save/reopen. Empty exact time is rejected.

Runtime boundary: unit/component/file-backed database checks do not establish live
provider availability, native camera alignment or physical-device tap acceptance.

## 12. Unified Apple map and search (2026-10-08)

The user selected Apple MapKit for both the map and search after reporting that
mixed-source Item focus switches the native map and hides the other source's pins.
This section supersedes §11's composite search, source-driven renderer switching
and coordinate-family filtering. The domestic product flow must not require VPN.

- Day/Overview/Home use MapKit. MKLocalSearch and Apple reverse geocoding supply
  all newly selected Places. The same native map instance displays domestic and
  overseas Apple coordinates; Item focus changes highlight/camera only.
- New Apple search/picker snapshots retain the SDK-returned coordinates, tagged
  WGS84. Coordinate-only picks retain `provider = apple` even if geocoding fails.
  No legacy AMap/Google point may be relabelled or drawn directly on Apple maps.
- Existing Trip, Day, Item and Place rows remain intact. Migration 003 adds only
  `apple_place_bindings`: original Place ID → a separately stored Apple snapshot.
  Original provider, coordinates, names, Item Place foreign keys, dates, times and
  sort order are never rewritten by map adaptation.
- Automatic legacy lookup accepts only one distinct Apple result with a meaningful
  matching name and a conservative 2 km raw-coordinate proximity gate. This is a
  matching filter, not a CRS conversion or proof of native alignment. Ambiguity,
  unavailable search and coordinate-only names retain the original itinerary and
  expose `确认旧地点`; their pins wait for explicit Apple search/map-pick confirmation.
- Read models keep raw `placesById` and optionally supply `mapPlacesById`, keyed by
  original Place ID. Timeline and counts use canonical Items; map projections use
  Apple counterparts. Home reads existing bindings without triggering mass lookup.
- Apple Places hand off to Apple Maps. Historical handoff remains provider-aware
  where an original Place is still presented. Google/AMap adapters remain for historical
  development paths; they are not selected by production trip/map/search flows.
- Verification distinguishes automated/component checks, device Apple searches,
  MapKit native screen-point projection, physical visual/tap acceptance and domestic
  network availability. A Japanese device network cannot establish mainland direct
  access, and successful coordinates alone cannot establish landmark alignment.

## 13. Preserve saved AMap names and restore legacy pins (2026-10-08)

The user explicitly requires existing AMap-listed names and locations to remain
visible, rather than replacing their labels with less intuitive Apple results.
This supersedes §12's Apple binding prerequisite for legacy AMap Places.

- Existing AMap Places are map-resolvable from their saved native points; Apple
  catalog/name search is not a prerequisite. Their original names/addresses and
  provider remain presentation labels and canonical data. They do not enter the
  `确认旧地点` list merely because Apple cannot find the same name.
- `MapPlace` extends the read projection with optional `displayCoordinate` and
  `displayName`. Original `Place.coordinate`/provider/name/id stay intact. All
  map markers, camera targets and picker centers read display values through the
  same getters; external AMap handoff reads the original native Place.
- The AMap native adapter uses public `AMapCoordinateConvert(..., GPS)` as its
  forward function and solves for the WGS84 display input with at most 12 steps.
  It is a numerical inverse, not an officially supplied inverse API. Inputs,
  outputs and forward residual are validated; no guessed country rectangle or
  copied private SDK formula is used. No additional search/network/privacy
  initialization is introduced by the local coordinate utility.
- The live SDK showed final residuals around 1.26e-7–1.99e-7 degrees with a stricter
  1e-7 gate. The bounded acceptance gate is 5e-7 degrees (under 0.08 m double-axis
  equatorial forward residual). This is numerical consistency, not a claim that
  the source POI or native map has centimetre-level positional accuracy.
- Display coordinates are transient Query data and are never written to Place,
  Item, Day or Trip tables. Other legacy sources retain their Apple coordinate
  bindings, but their saved names can remain view-only labels. New place search
  and map picking continue to use Apple.
- One stable Apple map shows all resolved domestic/overseas pins. Restored AMap
  pins retain Item-occurrence marker identity/order. Native screen-point evidence,
  SDK snapshots/landmark checks and physical UI interaction remain separate gates.

## 14. Restore regional providers; no new mixed Trip (2026-10-09)

The user explicitly selected the original AMap/Google arrangement and no
mainland/overseas mixed itinerary. This supersedes §11–13 for production Trip
planning, new location input and map source selection.

- New Trip chooses `中国大陆 / 海外`, persisted as `china_mainland / global`.
  Mainland uses AMap search/map and GCJ-02; overseas uses Google search/map and
  WGS84. Renderer/search are fixed for the whole Trip, independent of Item focus.
- Place creation, coordinate picks, association and replacement validate the
  Trip's provider/CRS in the exclusive write transaction. Apple and opposite-source
  new snapshots are rejected without partial Place/Item writes.
- Existing source-native Names, Coordinates and Item foreign keys remain intact.
  Previously mixed Items are not deleted, moved, split or re-snapshotted. Timeline
  retains every Item. Its region's map draws only matching source/native points,
  with a compact explanation if historical opposite-region points exist.
- No Apple Place resolution/confirmation or display-coordinate conversion is
  required to enter Day/Overview. New searches use the retained regional adapters;
  Google uncentered Text Search keeps its earlier HTTP repair.
- AMap consent/setup gates the complete mainland shell. Google results preserve
  their required source attribution, without restoring a duplicate image icon.
- Home remains the saved cross-Trip footprint with its existing display adapter;
  it is separate from the region-specific Trip search and detailed map.
- Keep all unrelated user-approved improvements: free Day sheet drag, Unscheduled
  edit/permanent delete, `添加行程`, Trip rename/delete, rename keyboard avoidance,
  Chinese Gregorian dates, independent arrival/departure times and durable ordering.

## 15. Priority UI/UX improvements (2026-10-09)

The user authorized implementation of the priority concept comparisons in
`docs/design/2026-10-09-uiux-icons/proposals.html`（设计稿未随公开仓库发布）. The icon remains a concept
pending independent review. This section refines presentation/interaction only;
§14's regional providers and canonical Trip/Day/Item/Place data stay intact.

- Day content and header swipes select adjacent Days: right/previous and
  left/next. At the bounds they do nothing. Explicit Back remains independent.
  The Day selector has a visible disclosure and Chinese date/weekday copy.
- Search shows its target Day and visible scope. A user can choose a city or
  clear city and map bias to search by full keywords. Mainland city scope and
  overseas city preference use the existing provider query; cities are not
  silently guessed from free text. Scope changes discard stale results/cursors.
- For new Items, selecting a search result opens a combined Place confirmation
  and Item form; there is one persistence action, named for the target Day.
  Name/type/time/note remain editable. A blank title falls back to the selected
  original Place name, or the coordinate-pick name. Changing Place preserves
  draft fields; explicit cancellation discards them. Existing-Item pickOnly and
  editor-owned selection flows retain their distinct persistence boundaries.
- Confirmation progress/error is shown in the current operation layer. Duplicate
  submission and cancellation during a pending save are blocked; failure retains
  the current Place/draft for retry. Map-picker failure remains on that picker.
- Home's Trip open and management controls are siblings with separate touch and
  accessibility targets. Existing rename/delete confirmation remains unchanged.
- Timeline suppresses same-name Place subtitle duplication, while a custom title
  keeps the original Place name. Overview remaining count is independent of text
  truncation. No-time copy is `待定`; time and sort-order semantics are unchanged.
- Place details keep original name/address/map/required attribution; raw coordinate,
  CRS and provider types are accessible through an explicit disclosure.

Automated/component checks, signed installation, database-preservation evidence
and physical touch/keyboard/large-text acceptance are distinct verification gates.

## 16. Adopt approved icon and align app tones (2026-10-09)

The user selected the latest warm ivory folded-map icon with blue-gray route
detail (`docs/design/2026-10-09-uiux-icons/icons/a1-bluegray-route.png`) and
requested corresponding internal colors. This supersedes older directional
visual-reference colors while preserving layout, gestures and product semantics.

- Forest green remains the primary action color; ivory surfaces and warm page
  backgrounds follow the paper motif. Blue-gray emphasizes selections, map pins
  and itinerary controls. Text/borders use coordinated green-gray neutrals.
- Error/warning roles remain distinct. Required provider attribution and map tile
  styling are preserved. The icon's decorative path adds no route domain or UI.
- Shared tokens own the palette, including selected states; AMap native marker
  constants stay synchronized with the JS/Google/Home marker palette.
- The approved opaque square source replaces `assets/icon.png`; Expo's targeted
  iOS icon generator exports the 1024px AppIcon catalog without regenerating
  AppDelegate or changing the existing scene-lifecycle repair.
- Branding work performs no data migration or canonical business mutation.

## 17. Trip pins and immediate Home map switching (2026-10-09)

The user requested Google-like pointed pins on the Trip map and direct map
refresh when switching Home's planned/completed filters across distant places.

- Trip Overview and Day use compact blue-gray teardrop pins. Day ordinals and
  cluster counts remain visible; selected pins become larger and darker. An
  unnumbered pin has a small dark centre. Home's Trip/cluster markers are unchanged.
- The geographic coordinate anchors the pin tip. Transparent hit bounds remain
  at least 44 points; original marker identity, coordinates and press selection
  are preserved in both AMap and Google renderers.
- Every Home camera request directly applies the new viewport without a flight
  animation, including planned/completed/all filters and one-time empty-map user
  location centring. It keeps the current map instance and existing filter logic.
- The optional camera `animated` flag defaults to the existing animated behavior
  outside Home. Trip/Day focus and their screen-space settlement contracts remain
  intact. Provider, source CRS, saved names, ordering and canonical data are unchanged.
- Follow-up: overseas pins use the mainland AMap curved silhouette and shadow,
  replacing the initial React Native circle/triangle approximation. Checked-in
  1x/2x/3x transparent assets are generated from the current marker palette by
  `scripts/generate-map-pin-assets.swift`; ordinal/count labels remain live text.
  Nearby-point clustering and simplified color semantics are design proposals
  until the user selects them; this shape repair does not change those rules.

## 18. Numeric Overview aggregation and grouped Item editor (2026-10-09)

The user selected the numeric aggregation proposal and requested a clearer Item
details/editing screen. This supersedes §17's pending-proposal status and the
older sparse-Unscheduled-on-Overview density rule.

- Overview proximity groups use real native screen projections from AMap and
  Google, recomputed after viewport/source/layout changes. The pin/badge hit
  frames keep a visible gap, including their different tip/centre anchors.
  Group anchors use a saved member point nearest the screen centroid; original
  Place coordinates, identities and canonical rows are never moved or rewritten.
- A round badge shows distinct saved Place count. Repeated visits to one Place
  stay one unnumbered pin and retain every original Item occurrence for preview.
  Day remains an ordered occurrence projection with its original ordinal pins.
- A badge press fits its original member coordinates. Co-located members open
  the occurrence list directly; a repeated fit that cannot separate a group
  also opens the list. Manual map gestures reset that fit attempt. Preview lists
  retain original names and explicit entry into the selected Day.
- Trip pins and badges share one normal blue-gray color; selection uses size
  and a white ring. Unscheduled Items stay in their dedicated surface instead
  of gray Overview pins. Home's marker colors/filter camera behavior are unchanged.
- Google pending projections retain the previous groups and reject stale
  asynchronous results; current projection failures fall back without dropping
  original markers. AMap emissions have source identity and viewport revision.
- Item editor groups basic information, transport details, time and notes into
  readable surfaces, with six equal-width type choices and a persistent filled
  Save action. Already-loaded original Place information may appear read-only;
  location changes/navigation remain in the row menu. Unscheduled editing says
  `未安排日期`, without implying the initialization date is an actual assignment.
- Card/nested-region/input offsets are combined for keyboard focus scrolling.
  Header/editor and footer/create keyboard strategies remain distinct. Draft
  preservation, optional name fallback, transport payload, independent arrival
  time, cross-day timestamps, cancellation and transactional writes are unchanged.

## 19. Place change from the Item editor (2026-10-09)

The user explicitly requested `更改` inside the editor's Place block. This
supersedes §18's row-menu-only location-change presentation.

- Day and Unscheduled editors may select a new Place in their fixed regional
  search/map picker. The selector is an opaque layer inside the existing editor
  Modal; the form remains mounted beneath it. Original name/address are displayed
  when available, and the button is disabled during save.
- Confirming a selection only updates the editor's pending target. Cancelling
  the selector restores the form; cancelling the editor discards all pending
  fields/Place choice. No Place/Item row is written before `保存`.
- `updateItemDetails` may accept a `placeTarget`, joining the existing Place
  command to its exclusive transaction. Region/CRS, title/payload/time validation
  failures roll back the Place snapshot, association and fields together. The
  supported row-menu action keeps its existing immediate-commit semantics.
- Unchanged time values preserve existing manual order; actual time edits keep
  the original time-ordering behavior. Original Item ownership, Day and source
  records are not silently changed.

## 20. One-piece selected numbered pin (2026-10-11)

The user's Day screenshots showed a numbered circle appearing pasted over a
pointed pin on both providers. The head-only selection ring is removed.

- Day ordinals are transparent text inside one curved pin body. Selected pins
  are larger and use an inset white outline along the complete silhouette,
  including its tail, instead of a separate circle around the number.
- Google assets and native AMap drawing use the same clipping/stroke geometry.
  Reused native annotation views remove the former head-ring subview.
- Existing tip anchors, saved coordinates, Item press/selection identities and
  hit frames are preserved. Overview's intentional round quantity badges retain
  their existing shape/count behavior. No itinerary, time or persistence changes.

## 21. Home year filter and recap (2026-11-05)

The user reviewed a competing photo-map app and approved two ideas for Home: filtering
the Footprint by year, and a cumulative/yearly recap. Photos stay out of scope (Stage-01/02
exclude photo travelogues), so this adds no media, tables, dependencies or migrations.

- A year row sits under the lifecycle filter. It is a secondary control: Stage-03 §3.3's
  `全部 | 计划中 | 已完成` stays exactly as specified and still has no `旅行中`. A Trip
  belongs to the calendar year of its `startDate`; a Trip crossing New Year is not split.
  The years offered come from the Trips the lifecycle filter keeps, so no choice leads to
  an empty list. With fewer than two years the row is hidden and no year filter applies.
  Changing the lifecycle filter clears the year.
- The year narrows the list, the markers and the camera focus pool together. Only the
  Active Trip Card ignores it, as it ignores the lifecycle filter. §17 applies unchanged:
  changing the year directly applies the new viewport with no flight animation, and it
  keeps the current map instance.
- A one-line recap above the rows counts the Trips the list shows: 次旅行, 天行程, 个地点.
  Days are the union of calendar dates. Places are distinct by provider and provider id,
  otherwise by CRS, coordinate (4 decimals) and name, and the 我的旅行 rows use the same key
  so a row and a single-Trip recap agree. The wording never says visited: Footprint remains
  saved itineraries and does not prove any Item was reached (Stage-03 §3.1, UX-02).
- Deferred, not built: a "first seen" count, per-region coverage, and a country count.
  They need a stable cross-source place identity or structured country data that the saved
  Places do not carry, and "first" reads as "visited".
- On Web the recap includes Trips shared with the user, as the list and map already do.

## 22. Add a Place by tapping the Trip map — Web (2026-11-20)

The user asked to add places straight from the Trip map. This adds to Stage-03 §6.7
and Stage-02 §10.2; it does not replace them. The fixed-crosshair picker stays as the
fallback and is unchanged, except that a Global Trip's picker now gets the same Google name
suggestion described below that AMap Trips already had. The map still creates no canonical itinerary state: a tap only
proposes a candidate, and an Item exists only after the explicit confirmation below.

- In a Trip the viewer can edit, tapping an empty map point in Day, Overview or Unscheduled
  view shows a transient candidate: one local pin and one floating card. Nothing is written.
  The candidate is not a Place, an Item or a `TripFocus` selection. A new tap replaces it.
  Closing the card, tapping a pin, changing view or Day, or losing edit permission discards it.
- The card names the target (`第N天` or `未安排行程`) and shows a name and address when the
  Trip's own provider returns one; otherwise it shows the coordinates only (Stage-04: reverse
  geocoding is enrichment, coordinate-only Places stay valid). AMap Trips use AMap's reverse
  geocoder. Global Trips use the nearest Google Places result within 30 m, because the Web key
  is limited to the Maps JavaScript and Places APIs. That answer is only a suggested name: the
  enrichment still carries the tapped coordinate, and the editor lets the user rename it.
- The same behavior applies to both regions' Web maps. A Trip never queries the other region's
  provider (Amendment §14).
- Target Day follows Stage-03 §6.1: Day view uses the current Day, Unscheduled view uses
  `dayId = null`, and Overview lets the user pick a Day or Unscheduled on the card
  (default Unscheduled).
- The card's one button opens the existing Item editor with the candidate as its pending
  map-picker Place (§19). The editor's `保存` is the single persistence action and runs
  `confirmMapPickerPlace`; cancelling the editor writes nothing. Ordering, region/CRS
  validation and the offline/cloud operation path are those of the crosshair picker.
- The tap passes the renderer's raw coordinate and the Trip's fixed provider; there is no
  CRS conversion. Pin taps keep their meaning (select/preview an existing Item) and never
  create a candidate. Panning and zooming do not.
- Read-only members get no tap handler and no card.
- Not built: the native iOS Trip map, tapping the provider's own POI labels (needs native
  modules and device checks), long-press and multi-candidate selection.

## 23. Pick a displayed place with one tap, a coordinate with two, and a map search box — Web (2026-11-20)

The user tried §22 on a phone (Google, a Japan trip) and reported: icons are hard to hit and an empty-spot
coordinate should need more than one tap, the add card looks poor, names default to English, and a search box
is wanted on the map. This revises §22's rule that one tap on an empty point
makes a candidate. Everything else in §22 stays, including the explicit confirmation in the Item editor.

- One tap selects only what the map displays. On Google a labelled icon arrives with its place id
  (Google's own info window is suppressed); it becomes a place candidate that keeps that provider id and the
  place's own coordinate, and is saved through `confirmPlaceSearchResult`. AMap's JS API has no clickable
  base-map icons, so a tap takes the nearest AMap place within about 24 px of the finger (15–150 m by zoom).
  That is an approximation of "displayed icon" and is not verified against a live key.
- A tap where nothing is displayed opens no card. A small dot marks the spot while a second tap would still
  count; there is no explanatory text (the user did not want it). A second tap on the same spot (within about
  36 px, same zoom, at least 350 ms later so a double-tap zoom is not mistaken for it, within 4.5 s) makes the
  §22 coordinate candidate. Any other tap starts over. The dot expires with the window.
- A writable member sees a search box under the top toolbar. A search runs on submit, never per keystroke,
  against the Trip's own provider. Choosing a result moves the camera to it above the sheet and makes a place
  candidate. Closing the list, the card or the Trip screen discards it.
- Names prefer Chinese or Japanese. Google answers are requested in Chinese first; when the name has no kana or
  CJK ideograph the request is repeated in Japanese (a query containing kana starts in Japanese) and a CJK answer
  wins; with none, the first answer stands. This also applies to the Place picker's search. AMap is unchanged.
- The card is compact: name, address, the target (a selector only in Overview) and `添加`. It sits above the
  sheet, so it does not cover the sheet's header.
- Nothing is saved before the editor's `保存`, and read-only members get none of this. Not built: the native iOS
  Trip map, exact AMap icon taps, long-press and search history.

## 24. Web map pins (2026-11-20)

The user found the Trip map's pins ugly (dull slate body, dark centre dot). Web only: the Trip map now draws its
own SVG pins; the native app keeps its PNG pins (§20) and the Home footprint map is unchanged.

- Frame size, tip position and anchoring come from the shared pin geometry, so a saved coordinate still sits under
  the tip and numbers, selection and cluster counts keep their meaning (§20, Stage-03).
- Palette is the app's one green. Itinerary pins are green with a white outline and a white disc holding the Day
  number (a small dot when the view has no numbers). The selected pin is larger and a deeper green. A place that is
  only a candidate is a white pin with a green outline and a `+`, so it cannot be mistaken for a saved Item.
  Overview counts stay round badges. No animation or glow.
