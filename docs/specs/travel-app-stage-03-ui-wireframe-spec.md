# Travel App — Stage 03: UI Wireframe & Interaction Specification

> Status: Confirmed baseline  
> Scope: V1 mobile UI / interaction architecture  
> Depends on: Stage 01 Product Foundation, Stage 02 V1 Flow  
> Next: Stage 04 Technical Architecture & Frontend Implementation  
> **Stage 06 map-scope amendment (2026-09-11):** V1 ships iOS first; mainland-China Trips use AMap and overseas Trips use Google.
> **Product realignment amendment (2026-09-11, user-approved):** The V1 product goal has been re-confirmed as **personal travel-plan storage organized by Day and ordered Items**. Home remains map-centered as a travel-footprint/Trip-entry surface. Inside a Trip, the **Timeline / ordered itinerary is the primary planning and browsing view**, while the map is a synchronized **spatial projection** of saved Places. The app does **not** plan routes, choose route alternatives, recommend places, or replace AMap / Google Maps / Xiaohongshu-style discovery. Any earlier wording that makes Trip planning itself “map-first”, treats a Trip/Day as a route, requires Day anchors/routes, or implies automatic routing is superseded by this amendment. No M0 rollback is required.

## 1. Stage Goal

Stage 03 turns the product model and V1 flows into an implementable mobile UI structure.

The core principle is:

> A Trip is an ordered plan organized by Day. Timeline is the primary planning/browsing view; Map is a synchronized spatial projection of the same itinerary data. Neither view may invent routing or duplicate canonical itinerary state.

The product has two primary environments:

- Home Map — map-centered travel footprint and Trip entry.
- Trip Planning Workspace — Day/Timeline-centered planning with synchronized spatial map context.

Other functions appear as Bottom Sheets, floating cards, modes, or detail pages rather than additional top-level navigation.

---

# 2. Global Information Architecture

```text
Home Map
  |
  +-- Trip Preview
  |      |
  |      +-- Trip Overview
  |
  +-- Create Trip
  |
  +-- Active Trip -> Today Day View

Trip Planning Workspace
  |
  +-- Trip Overview
  |      +-- Trip-wide Place distribution
  |      +-- Day List
  |
  +-- Day View
  |      +-- current-Day Place markers ①②③...
  |      +-- Ordered Timeline
  |      +-- Item Selected (same screen state)
  |
  +-- Unscheduled
  +-- Item Editor
```

Back hierarchy:

```text
Item Editor -> Day View
Day View -> Trip Overview
Trip Overview -> Home Map
```

`Item Selected` is not a route/page; it is a focus state inside Day View.

Default Trip entry:

- Planned / Completed / normally opened Active Trip -> Trip Overview.
- “Continue today’s itinerary” -> Today Day View.

---

# 3. 03-A — Home Map

## 3.1 Purpose

Home Map is the user's Travel Footprint Map, not a Trip list with a decorative map.

In V1, “footprint” means the spatial record of saved Trips and itinerary Items. It is **not** GPS history and does not prove that every completed-Trip Item was actually visited. `visited / skipped` semantics are deferred.

Responsibilities:

- Show travel footprint.
- Aggregate Trips geographically.
- Enter a Trip.
- Create a Trip.
- Surface an active Trip.
- Filter footprint by Trip lifecycle and, secondarily, by start year (Amendment §21).

## 3.2 Base Layout

Home remains map-centered, but the accepted V1 visual contract includes a **compact persistent Trip-list Bottom Sheet**.

```text
+---------------------------+
|                           |
|            MAP            |
|      [Trip / Cluster]     |
|                           |
| [Active Trip Card]        |
|                           |
+---------------------------+
| 我的旅行              [+]|
| [All | Planned | Done]    |
| Trip row                  |
| Trip row                  |
+---------------------------+
```

Rules:

- The map remains visible and usable above the sheet.
- The sheet is the direct list alternative for users who do not want to navigate by markers.
- Trip Marker/Cluster and Trip Row lead to the same Trip identity and preview/entry semantics.
- Keep the Home list compact; it is not a separate top-level list page.
- Do not permanently display the app name in the top bar.
- Top controls are limited to low-frequency settings/search/map controls.

## 3.3 Filter

Floating segmented control:

```text
全部 | 计划中 | 已完成
```

Do not add a separate “旅行中” filter in V1.

Active Trip remains visible in “全部” and is separately surfaced by the Active Trip Card.

Amendment §21 (2026-11-05) adds a secondary, text-only year row under this control and a one-line
count recap above the Trip rows. They refine the list; they do not change the three options above.

## 3.4 Active Trip Card

Compact state:

```text
● 正在旅行 Day 3
示例秋季自驾 >
```

Expanded state:

```text
● 正在旅行
示例秋季自驾
Day 3 · 北山 -> 南湾
继续今天的行程 ->
```

The card must remain compact enough not to obscure the map.

## 3.5 Trip / Cluster Visual Language

Use one basic marker family and express state mainly through visual weight rather than many unrelated shapes.

Conceptually:

- Completed — normal/strong.
- Planned — weaker visual weight.
- Active — emphasized, potentially with halo.
- Cluster — count + location label.

Example:

```text
  3
 北京
```

Cluster size is capped; large counts use forms such as `99+`.

## 3.6 Marker Interaction

First tap selects only.

Single Trip:

```text
Trip marker
 -> Floating Trip Preview Card
 -> explicit “查看旅行”
 -> Trip Map
```

Trip Preview is a floating card, not a Bottom Sheet.

For multiple Trips in the same region:

```text
北京 · 3 次旅行

2029 秋季北京 >
2027 春季北京 >
2026 国庆北京 >
```

Selecting one Trip may dim other footprints and reveal the selected Trip footprint before entering it.

Data is never merged merely because multiple Trips share a Place or region.

## 3.7 Create Trip

When Trips already exist, use a circular `+` FAB.

First-use Home Empty State instead uses a full CTA:

```text
还没有旅行

从第一段旅程开始
记录你的旅行地图

+ 新建旅行
```

---

# 4. 03-B — Trip Planning Workspace & Bottom Sheet

## 4.1 Focus States

```text
Trip Overview -> Day View -> Item Selected
```

`Item Selected` is a focus state in the same Day View, not a separate top-level page.

## 4.2 Trip Overview

Trip Overview answers two different questions with two synchronized surfaces:

- **Map:** “这趟旅行保存了哪些地点、空间上分布在哪里？”
- **Day List:** “每天怎么安排、我要进入哪一天？”

Map rules:

- Show scheduled saved Places for the Trip as neutral Place markers / clusters.
- Do **not** show Day anchors (`D1`, `D2`, …).
- Do **not** draw cross-Day itinerary routes.
- Do **not** imply a real road/path.
- Repeated Place occurrences remain independent data; Overview may aggregate display.
- Unscheduled Places may be toggled/controlled for density, but remain visually distinct and unnumbered.

Day List rules:

```text
3/11–3/18 · 8天

Day 1  东城
Day 2  曲水河 · 西谷 +2
Day 3  北山 · 林间镇 · 南湾
...
未安排 · 4
```

- Day Row is the **primary** Day navigation.
- Day summary is derived from Items; there is no required `Day.destination` or `Day.title` field.
- A Place marker tap opens a lightweight occurrence preview. If the Place occurs once, offer explicit entry to that Day. If it occurs multiple times, list occurrences and let the user choose.
- No persistent “地图 / 简介” tab. Trip note/settings live behind the Trip action menu.

Selecting a Day:

```text
Trip Overview
 -> tap Day Row
 -> Day View
 -> camera fits current Day Places
 -> Day Timeline Sheet
```

## 4.3 Day View

Day View displays **only current-Day spatial information by default**.

```text
MAP                     TIMELINE

① Place A   <------->   Item A
② Place B   <------->   Item B
③ Place C   <------->   Item C
```

Rules:

- Filter current-Day Items in itinerary `sortOrder`.
- Keep only Items with a Place for map presentation.
- Assign continuous display numbers `1..N` to those map-visible Items.
- Items without Place remain fully visible/orderable in Timeline and do not create numbering gaps.
- Other Days are hidden by default.
- Camera fits the current Day’s valid Place coordinates, regardless of geographic span.
- No route/polyline is required in V1. Marker numbering communicates planned sequence without implying a navigation path.
- Bottom Sheet contains the current Day Ordered Timeline.

## 4.4 Item Selected

Selecting a marker or Timeline Item changes focus **within the same Day View**.

Effects:

- Selected marker is emphasized if the Item has a Place.
- Other current-Day markers reduce visual weight.
- Map camera gently centers the selected Place when applicable.
- Timeline automatically scrolls to the selected Item.
- Selected Item expands visually.
- Selection does not automatically open the editor.
- Explicit action `编辑` opens the shared Item editor directly.
- `在地图中打开` hands the Place to AMap / Google Maps; Travel App does not start in-app routing.

## 4.5 Bottom Sheet Heights

Use adaptive ratios rather than hard-coded pixels.

### Collapsed — approximately 15–18%

Map-focused inspection state; show compact Trip/Day context.

### Half — approximately 45–55%

**Default planning state.** Timeline / Day List and map are simultaneously useful. This is the normal Trip Overview and Day View composition.

### Expanded — approximately 85–90%

Planning content dominates while retaining a small amount of map context.

## 4.6 Day Switching

Adjacent Day:

- Horizontal swipe on Day Header only.

Direct jump:

- Tap Day title -> Day Jump Sheet.

Do not use a persistent horizontal date strip.

## 4.7 Bottom Sheet Gesture Zones

```text
Map area:
  vertical/horizontal drag -> map pan

Sheet content:
  vertical drag -> Day List / Timeline scroll

Sheet handle/header:
  vertical drag -> resize sheet

Day header:
  horizontal swipe -> previous/next Day
```

---

# 5. 03-C — Core Component System

## 5.1 Core Principle

Timeline and Map are synchronized projections of the same itinerary, but they do not carry equal product responsibility:

```text
Canonical plan
Trip -> Day -> Ordered Items
        |
        +--> Timeline = complete planning/browsing projection
        |
        +--> Map = Place-only spatial projection
```

```text
MAP                    TIMELINE

Item Marker   <------> Item Row
Selected      <------> Selected Item Card
Unscheduled   <------> Unscheduled Pool
```

No `Day Marker <-> Day Summary` mapping is required in Trip Overview, and no Leg Line is required for V1 map semantics.

## 5.2 Timeline

Timeline is an **Ordered Itinerary**, not a strict calendar timeline and not a Todo completion list.

Example:

```text
08:00  ● 北山早餐
09:30  ● 森民村
下午   ● 林间镇森林公园
18:00  ● 南湾晚餐
20:30  🏨 南湾民宿
```

`sortOrder` defines sequence. Time is an independent Item property.

A user may represent meaningful travel itself as a Transport Item (flight/train/booked transfer) or a Custom Item. Ordinary movement between adjacent places does not require a permanent user-visible row in V1.

## 5.3 Item Row

Avoid permanent large cards for every Item.

### Compact

```text
13:00
● 林间镇森林公园
  下午 · 固定
```

### Selected

```text
13:00
+------------------------+
| ● 林间镇森林公园    |
|   下午 · 固定行程      |
|                        |
|   拍照 / 徒步          |
|                        |
|   编辑 ->              |
+------------------------+
```

Card-like treatment is a selected state, not the default visual container for every Item.

## 5.4 Item Types

Types:

- sightseeing
- food
- hotel
- activity
- transport
- custom

Do not assign a separate strong color system to each type.

Use icons primarily for type; reserve color/visual weight primarily for state.

## 5.5 Time Modes

Support the existing three modes directly:

```text
exact:
09:30
● Item

period:
下午
● Item

none:
—
● Item
```

Do not manufacture fake precise times.

## 5.6 Fixed Item

Fixed status belongs primarily to Timeline/editing UI, not map markers.

Compact indication may use a lock icon.

Quick Edit label:

```text
固定行程       ON
调整行程时保持日期和时间不变
```

## 5.7 Leg / Ordinary Movement

V1 has **no user-facing or canonical Leg model**.

```text
Item A
Item B
```

Their order is expressed by Timeline position / `sortOrder` only.

Rules:

- no Leg Row;
- no Leg polyline;
- no ordinary-movement duration/distance editor;
- no route geometry;
- no automatic routing;
- navigation is delegated through `在地图中打开`.

A separately planned/booked/timed movement is a `Transport Item`.

## 5.8 Transport Item vs Leg

Rule:

> A separately planned/booked/timed movement event is a Transport Item. Ordinary adjacency between Items is represented only by Item order.

Example:

```text
10:10
✈ CA1234
东城 → 北京
10:10 → 12:20
```

Do not create a separate Leg merely because two Items are adjacent.

## 5.9 Hotel Context

Hotel remains one cross-day Item.

Check-in Day:

```text
18:00
🏨 南湾民宿
   入住
```

Intermediate Day:

```text
🏨 今早住宿 · 南湾民宿

09:00
● 早餐
```

Check-out Day:

```text
08:30
🏨 南湾民宿
   退房
```

Intermediate Hotel Context is displayed above the Timeline and does not become another sortable Item.

## 5.10 Marker Hierarchy

### Home Map

Trip / Trip Cluster level.

### Trip Overview

Trip-wide Place / Place-cluster level. **No Day numbering and no cross-Day routes.**

### Day View

Current-Day Item-level markers. Display numbers `①②③…` follow the relative itinerary order of map-visible (Place-bearing) Items.

This hierarchy avoids both long-Trip saturation and false route semantics.

## 5.11 Selected Marker

Selected marker enlarges or receives a label.

Map camera gently centers it without aggressive zoom changes.

Selection is bidirectional with Timeline.

## 5.12 Repeated Place

Same Place may correspond to multiple independent Items.

Overview may visually aggregate repeated visits.

Day Mode displays current-Day visits separately.

Same-day overlapping markers may use slight offset/spiderfy behavior.

Aggregation is display-only; underlying Items remain independent.

## 5.13 Unscheduled Marker

Unscheduled Items with Place may appear on the map but are not numbered.

Reason: numbering implies route order.

To prevent a large Unscheduled pool from obscuring the Trip-wide spatial distribution:

- provide a single `未安排地点` visibility control in Overview when Unscheduled Places exist;
- for a modest count, markers may be visible by default;
- when the count exceeds an implementation threshold (initial V1 constant: **20**), default them to hidden and show the count in the control;
- user choice remains session/presentation state and does not mutate itinerary data.

The threshold is a presentation constant, not a domain rule.

Example:

```text
Trip saved Places / clusters

        ·
     未安排地点
```

Selecting it surfaces:

```text
曲水河观景点
未安排日期

[安排到某一天]
```

---

# 6. 03-D — Add, Search, Edit & Feedback

## 6.1 Unified Add Action

Primary action:

```text
+ 添加行程
```

Context determines default ownership.

- Day Mode -> current Day.
- Unscheduled -> `dayId = null`.
- Overview -> choose Day or Unscheduled during confirmation.

Map FAB and Timeline Add call the same underlying flow.

## 6.2 Add Action Sheet

```text
添加到 Day 3

🔎 搜索地点
📍 在地图上选择
＋ 自定义行程
```

Do not force the user to choose an Item type before expressing what they want to add.

Type should be inferred where possible and remain editable.

## 6.3 Place Search

Search supports provider POIs.

Search results display useful identity information such as name and address.

Provide persistent fallback:

```text
在地图上选择地点
```

Do not build recommendation/discovery systems such as “猜你喜欢” for V1.

## 6.4 Search Result Confirmation

First result tap opens Place Preview.

It does not create an Item.

```text
林间镇国家森林公园
森林公园
示例自治区示例地区...

[添加到 Day 3]
```

Only explicit confirmation creates Place/Item.

## 6.5 Post-Add Quick Edit

After creation:

1. Marker appears.
2. Timeline updates.
3. Quick Edit opens.

```text
林间镇森林公园       ×

日期       Day 3       >
时间       下午        >
固定行程   OFF
备注       添加备注...

更多详情               >
```

User may close immediately.

Do not require unnecessary fields merely to save a Place into the Trip.

## 6.6 Shared Item Editor

Creation and editing reuse one Item form. The Day Timeline action `编辑`
opens this editor directly; there is no intervening read-only Item page.

- Header: return/cancel, current Item title, Save.
- Fields: title, compact Item type choice, independent optional custom type
  label, fixed state and multiline note.
- Time precision is a prominent segmented choice: `无时间 / 时段 / 精确时间`.
- Period selection appears in a subordinate region with
  `上午 / 中午 / 下午 / 晚上`.
- Exact time uses a native spinner. Current Day date is visible and fixed;
  optional end time reveals a second spinner.
- Save/Cancel remain reachable with the keyboard visible. Save errors retain
  entered values; success refreshes Day/Overview and returns to Day.
- `在地图中打开` and provider attribution are placed at the editor bottom
  only when the Item has a Place.

The external-map action is provider-aware:

```text
Trip.mapRegion = china_mainland → AMap
Trip.mapRegion = global         → Google Maps
```

It opens the selected Place as a destination in the external map app (or that provider's Universal Link/web fallback). It does not add in-app turn-by-turn navigation.

Hotel may include check-in/check-out.

Transport may include:

- transport mode
- origin
- destination
- departure
- arrival
- service number

Hotel/Transport cross-day date specialization remains deferred to M9.

## 6.7 Map Pick

Use fixed center crosshair rather than draggable marker.

```text
+---------------------------+
| ×                         |
|                           |
|             +             |
|        center point       |
|                           |
| [选择这个位置]            |
+---------------------------+
```

User pans/zooms the map under the fixed crosshair.

After confirmation:

- allow/edit name
- preserve coordinates
- address may be optional
- provider fields may be null
- then add to current Day / Unscheduled

## 6.8 Custom Item

Custom Item supports events without a POI.

Minimal form:

```text
名称   [看日落]
类型   其他
自定义类型 [摄影]
日期   Day 3
时间   晚上
地点   添加地点（可选）

[添加]
```

Title is required because no POI exists to supply one.

## 6.9 Unscheduled Pool

Unscheduled is a first-class Trip planning state.

```text
未安排

● 曲水河
● 黑石口骑马
● 和平村
● 某观景台

+ 添加地点
```

Do not implement cross-list drag from Unscheduled to a Day in V1.

Use explicit action:

```text
Item ···
 -> 安排到日期
 -> Day N
```

## 6.10 Reordering and Moving

Within a Day:

- long press Item
- drag vertically
- update Item order
- update marker numbering
- invalidate/recalculate affected Day/Overview projections

Across Days:

```text
···
编辑
移动到其他日期
复制
删除
```

Do not implement long-distance cross-Day drag in V1.

## 6.11 Undo

Once the user-facing Delete action is enabled, deleting an Item happens immediately **together with** an available Undo path. Do not expose a production Delete control in an earlier milestone before minimal Undo/restore support exists.

Show Snackbar for approximately 5 seconds:

```text
已删除「林间镇」    撤销
```

Undo infrastructure may later support move/remove actions.

## 6.12 Validation Feedback

Most validation issues should warn rather than block.

Trip-level summary:

```text
⚠ 2 个行程需要确认
```

Issue list:

```text
⚠ CA1234
到达时间已经超出旅行日期
[查看]

⚠ 南湾酒店
退房时间早于入住时间
[查看]
```

Reserve blocking dialogs for invalid operations that truly cannot be saved.

## 6.13 Empty States

### Home

```text
还没有旅行

从第一段旅程开始
记录你的旅行地图

+ 新建旅行
```

### Trip

```text
这趟旅行还是空的

先在地图上放下
第一个想去的地方

+ 添加行程
```

### Day

```text
Day 3 还没有安排

+ 添加行程
从未安排中选择
```

### Unscheduled

```text
没有未安排的地点

还没决定哪天去的地方
可以先放在这里

+ 添加地点
```

No dedicated illustration system is required. The map remains the visual background.

---

# 7. Mobile One-Hand Operation

High-frequency actions should remain in the lower half of the screen where possible:

- Add
- Day switch
- Timeline
- Quick Edit
- Search confirmation
- Undo

Top navigation is reserved mainly for:

- Back
- Trip title/context
- overflow menu

Do not place all primary editing controls in the top navigation bar.

---

# 8. V1 Gesture Contract

## Map

```text
Drag          -> Pan
Pinch         -> Zoom
Tap Marker    -> Select
Tap blank     -> Deselect
```

## Bottom Sheet Header

```text
Vertical drag -> Resize Sheet
Horizontal    -> Previous / Next Day
Tap Day       -> Day Jump
```

## Timeline

```text
Vertical      -> Scroll
Tap Item      -> Select
Long press    -> Reorder
Tap ···       -> Item actions
```

## Map Pick

```text
Drag          -> Move map
Pinch         -> Zoom
Center cross  -> Fixed
```

Do not add horizontal swipe actions such as swipe-to-delete on Timeline Items.

Deletion/move actions live under explicit Item actions.

---

# 9. Explicit V1 Non-Goals Reinforced by Stage 03

Do not add these merely because the UI makes them tempting:

- Item checkbox / Todo completion.
- “Visited / skipped / completed” Item state.
- Wishlist as a global entity.
- AI auto-planning UI.
- Route navigation UI.
- Live traffic/road closures.
- Complex recommendation feeds.
- Ticket/booking management system.
- Full photo journal/check-in system.
- Public social/community UI.
- Complex collaboration.
- Cross-Day drag-and-drop.
- Strong type-specific color taxonomy.

In particular, Timeline must not turn the product into a Todo application.

---

# 10. Frontend Component Boundary Draft

The UI specification suggests the following conceptual component boundaries. Names are illustrative rather than implementation-mandatory.

```text
HomeMap
├── TripClusterMarker
├── TripMarker
├── TripPreviewCard
├── ActiveTripCard
├── TripFilterControl
├── HomeTripListSheet
│   └── HomeTripRow
└── CreateTripFAB

TripPlanningWorkspace
├── TripHeader
├── MapLayer
│   ├── OverviewPlaceMarker / Cluster
│   ├── ItemMarker
│   ├── UnscheduledMarker
│   └── SelectedMarker
│
└── TripBottomSheet
    ├── TripOverviewSheet
    │   ├── DaySummaryRow
    │   └── UnscheduledEntry
    │
    └── DayTimeline
        ├── DayHeader
        ├── HotelContextCard
        ├── ItemRow
        ├── SelectedItemCard
        └── AddItemAction

AddItemFlow
├── AddItemActionSheet
├── PlaceSearch
├── PlacePreview
├── MapPicker
├── CustomItemForm
└── QuickEditSheet

Feedback
├── UndoSnackbar
├── ValidationSummary
├── ValidationIssueList
└── EmptyState
```

Canonical relationship:

```text
Trip / Day / Ordered Item / Place?
              |
              +--> Timeline (primary planning projection)
              |
              +--> Map (Place-only spatial projection)
```

Map and Timeline must not maintain independent itinerary state. Day marker identity uses the **Item occurrence ID**, never the Place ID.

# 11. Stage 03 Final Decisions

The following are the canonical Stage 03 UI decisions after the 2026-09-11 product realignment:

1. Home remains a full-screen Travel Footprint Map.
2. Home marker density is controlled through Trip clustering; first marker tap previews, explicit action enters Trip.
3. Planned/completed/normal Active Trip entry opens Trip Overview; Continue Today opens Today Day View.
4. Trip planning uses one unified Trip Planning Workspace for city tourism, road trips and multi-city trips.
5. Trip Overview map shows Trip-wide saved Place distribution/clusters, not Day anchors or routes.
6. Trip Overview Day List is the primary Day navigation.
7. Overview Place tap opens an occurrence Preview; repeated Places require occurrence selection before Day entry.
8. No persistent Trip “简介” tab; Trip note/settings live in the action/settings surface.
9. Day View map shows only current-Day Place-bearing Items by default.
10. Day map marker display numbers are assigned continuously after sorting Items by itinerary order and filtering to Place-bearing Items.
11. Place-less Items remain fully visible/orderable in Timeline and create no numbering gaps.
12. V1 Day map does not require route/polyline output.
13. Timeline is an Ordered Itinerary, not a strict calendar or Todo/checklist.
14. Item Selected is a same-screen focus state; explicit `编辑` opens the shared Item editor directly.
15. Marker ↔ Timeline selection is bidirectional through shared TripFocus.
16. Bottom Sheet supports Collapsed / Half / Expanded; Half is the normal planning state.
17. Day switching uses Day Header swipe + Day Jump; no persistent horizontal date strip.
18. Type is primarily communicated by icon, not a large color taxonomy.
19. Hotel remains one cross-day Item; intermediate Days use Hotel Context.
20. Transport Item represents separately planned/booked/timed transport.
21. Ordinary movement does not require user-visible Leg rows or map connections in V1.
22. Repeated Places remain independent Items; aggregation is display-only.
23. Unscheduled is first-class, distinct from Wishlist, and may use visibility/density control on maps.
24. Add flow begins from search / map pick / custom intent; Place Search is input assistance, not recommendation/discovery.
25. Search result requires explicit add confirmation; new Item opens the shared draft editor.
26. Map Pick uses a fixed center crosshair.
27. Cross-Day movement uses explicit actions, not cross-list drag.
28. Item deletion is not exposed before Undo/restore support exists.
29. Validation normally warns rather than silently mutating valid user data.
30. The shared Item editor can hand a Place off to AMap / Google Maps for navigation; Travel App does not navigate internally.

---

# 12. Stage 04 Handoff

Stage 03 closes the product/UI architecture:

```text
Stage 01
Product Foundation + Core Data Model

        ↓

Stage 02
V1 User Flow + Behavioral Rules

        ↓

Stage 03
Information Architecture + Wireframe + Component / Gesture Specification

        ↓

Stage 04
Technical Architecture + Frontend Implementation Plan
```

Stage 04 should decide implementation details rather than reopen settled product semantics.

Recommended Stage 04 topics:

1. Client technology stack and project structure.
2. Map provider abstraction and region-aware iOS provider strategy (AMap mainland China / Google overseas).
3. Local/remote persistence architecture.
4. Concrete database/schema design for Trip/Day/Item/Place/ValidationIssue, plus an explicit decision on whether internal Leg adjacency remains justified.
5. Type-specific Item payload strategy.
6. State management and Map ↔ Timeline synchronization.
7. Bottom Sheet / gesture implementation architecture.
8. External-map handoff and future route-provider seam without current route UI.
9. Offline/cache strategy.
10. Future AI Agent tool/API boundary.
11. Testing strategy.
12. V1 implementation milestones and vertical slices.

The goal of Stage 04 is to produce an architecture that can implement Stage 01–03 without prematurely building deferred features.
