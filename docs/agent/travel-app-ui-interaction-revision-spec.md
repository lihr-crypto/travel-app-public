# Travel App UI / Interaction Revision Spec

## 0. Purpose

This document consolidates the requested revisions for:

- Day Overview
- Item Detail
- Location Search / Location Preview
- Day switching
- Edit-session state preservation
- Bottom-sheet / modal animation behavior

The implementation must **preserve the visual language of the existing app**. This is an interaction and information-architecture refinement, not a visual redesign.

---

# 1. Global UI Consistency Requirements

Keep the current app's visual identity and reuse existing design tokens/components wherever possible.

## Visual language to preserve

- White / very light gray page backgrounds
- Dark navy primary text
- Existing dark green accent color for primary actions and interactive text
- Current rounded-corner language
- Current typography scale and weight hierarchy
- Current spacing rhythm and page margins
- Current iOS-like sheet / card treatment
- Existing button heights, border radii, border colors, and input styles where possible
- Avoid introducing new colors, shadows, gradients, or unrelated component styles

## General principle

Do **not** redesign pages into a different visual system.

Prefer:

> existing component + simplified hierarchy + improved interaction

over:

> new component library / new visual style

The final UI should feel like the same app, only cleaner and more coherent.

---

# 2. Day Overview

## 2.1 Replace large "编辑" buttons with three-dot menu

Current large green `编辑` buttons visually dominate each itinerary row.

Change each item to a compact three-dot action:

```text
08:30      取车                         ⋯
           交通 · 东城站（出站口）
────────────────────────────

上午       曲水河                   ⋯
           其他
────────────────────────────

下午       西谷湿地                 ⋯
           景点 · 河边小路、观景台俯瞰…
────────────────────────────
```

### Interaction

Tap `⋯`:

```text
更改地点
编辑详情
────────
删除行程
```

If no location exists:

```text
设置地点
编辑详情
删除行程
```

- `删除行程` uses destructive/red styling.
- Keep a sufficiently large invisible hit target around the three-dot icon, approximately 44×44pt.
- The menu can use the app's existing popover / action-sheet pattern.

---

## 2.2 Do not show full notes in Day Overview

The Day Overview is a compact schedule, not a detail page.

Long notes must not expand the row height excessively.

### Display priority

Each row should contain:

1. time / time period
2. primary title
3. one compact secondary line

Recommended secondary line priority:

```text
类型 → 地点 → 备注摘要
```

Examples:

```text
08:30  取车
       交通 · 东城站（出站口）
```

```text
下午   西谷湿地
       景点 · 河边小路、观景台俯瞰…
```

### Notes rule

- Notes preview: maximum 1 line
- Use truncation / ellipsis
- Do not allow long notes to change the overall list rhythm

---

# 3. Day Switching

Current left/right arrows are too small as the only switching mechanism.

Keep the arrows for discoverability, but add horizontal swipe.

## Required behavior

```text
← swipe              swipe →
Day 1  ←   Day 2   →  Day 3
```

### Gesture requirements

- Horizontal swipe switches Day
- Preserve vertical scrolling
- Trigger Day switching only when horizontal movement clearly dominates vertical movement
- Use an appropriate horizontal threshold before switching
- Do not trigger Day switching from map gestures
- Prefer limiting the swipe interaction to the Day content / white sheet area rather than the entire screen

### Arrow behavior

- Keep visual arrows
- Increase actual touch target to approximately 44×44pt even if the visible icon stays small

---

# 4. Item Detail: Information Architecture

The current Item Detail page repeats information and becomes too tall, especially after choosing precise time.

Main principle:

> One field / concept should ideally appear only once.

---

# 5. Item Title / Name

Do **not** completely remove the itinerary title concept.

The title and location are sometimes different:

```text
取车
地点：东城站（出站口）
```

```text
办理入住
地点：某酒店
```

But for scenic spots they may be identical.

Therefore change:

```text
行程标题
```

to:

```text
名称（可选）
```

### Behavior

If `name` exists:

```text
Overview title = name
```

If `name` is empty:

```text
Overview title = location name
```

Suggested placeholder:

```text
不填写时使用地点名称
```

This avoids duplicated inputs while preserving cases such as "取车", "晚餐", "办理入住", etc.

---

# 6. Item Detail Layout

Recommended structure:

```text
‹ 返回             取车              保存


名称（可选）

取车


类型

景点   餐饮   住宿   活动   [交通]   其他


时间

无时间     时段     [具体时间]

开始时间                         08:30 >
添加结束时间                         +


备注

┌────────────────────────────┐
│ 取车注意事项……                    │
│                                  │
└────────────────────────────┘


地点

东城站（出站口）                  >


日期

Day 2 · 3月10日                     >


在地图中查看                        ↗
```

Keep the actual fonts, green accent, borders, spacing and rounded corners consistent with the current app.

---

# 7. Time Section

The current precise-time section is too verbose.

Remove repeated labels such as:

- "精确时间" shown again below the segmented control
- "当前 Day · 2026-03-10"
- other repeated context already known from the page

## Precise time

Collapsed state:

```text
时间

[ 无时间 ] [ 时段 ] [ 具体时间 ]

开始时间                         08:30 >
添加结束时间                         +
```

Tap `08:30` to open a time picker.

Do not keep a large wheel picker permanently visible inside the form.

If an end time is enabled:

```text
开始                              08:30 >
结束                              10:30 >
```

The time picker should appear only when editing the time.

---

## Time period

When `时段` is selected:

```text
时间

[ 无时间 ] [ 时段 ] [ 具体时间 ]

[早晨] [上午] [中午]
[下午] [傍晚] [晚上]
```

Do not show redundant labels describing the selected mode again.

---

# 8. Notes

Notes should contain detailed free-form information.

The full note is edited only in Item Detail.

Day Overview should only show a short one-line preview when useful.

---

# 9. Location Section in Item Detail

The existing structure uses too many permanent buttons:

```text
更换
清除
在地图中打开
```

Simplify it.

Recommended:

```text
地点

东城站（出站口）                  >
```

Tap the entire row to enter Location Search / Location Picker.

Below it:

```text
在地图中查看                        ↗
```

If "clear location" is required, put it inside the location picker / contextual menu instead of showing a permanent large button.

---

# 10. Date Section

Replace the current concept of:

```text
所在日期
移出当天
```

with a clearer move action:

```text
日期

Day 2 · 3月10日                     >
```

Tap to open:

```text
移动行程

Day 1 · 3月9日
✓ Day 2 · 3月10日
Day 3 · 3月11日
Day 4 · 3月12日
```

If the data model supports unscheduled items:

```text
──────────
移至未安排
```

Use "移动行程" / selecting another Day rather than the ambiguous wording "移出当天".

---

# 11. Edit Session / Draft State

This is a functional requirement, not only UI.

Current bug:

```text
Day Overview
→ Item Detail
→ edit fields
→ 更换地点
→ select new location
→ returns to Day Overview
→ previous unsaved edits are lost
```

This must be fixed.

## Correct navigation flow

```text
Day Overview
   ↓
Item Detail
   │
   ├─ edit name
   ├─ edit type
   ├─ edit time
   ├─ edit notes
   │
   └─ change location
          ↓
       Location Search
          ↓
       Location Preview
          ↓
       Use this location
          ↓
Item Detail
   ↓
Save
   ↓
Day Overview
```

## State ownership

Item Detail should own a temporary edit draft for the whole editing session.

Example:

Original:

```text
名称：取车
时间：08:30
地点：东城站
备注：空
```

User changes:

```text
时间：09:00
备注：提前联系租车公司
```

Then enters Location Search.

These changes must remain in the Item Detail draft.

Selecting a new location should only update:

```text
draft.location = selectedLocation
```

Then return to Item Detail.

Only tapping `保存` commits the complete draft.

### Important

Do not silently autosave every field while also keeping a visible Save button.

Use one consistent model:

```text
edit draft
→ explicit Save
→ commit
```

---

# 12. Location Search Page

Current page is functional but visually too much like raw search results.

Also change page title depending on context:

- creating new item: `添加地点`
- editing an existing item: `更换地点`

## Search result row

Remove unnecessary coordinates from the search-result list.

Current:

```text
西谷国家湿地公园
地址
40.36003, 106.41510
                              查看
```

Recommended:

```text
西谷国家湿地公园              ›
示例办事处北山桥东13公里处

西谷市                        ›
示例自治区示例市西谷市

西谷湿地景区                  ›
示例街道西北部
```

### Interaction

- Entire row is tappable
- Remove the separate `查看` text button
- Use a subtle chevron `›`
- Coordinates belong in the detail / preview page, not the search list
- Keep row typography and separators consistent with existing app list styles

Keep:

```text
在地图上选择地点                  >
```

as a separate option near the bottom.

---

# 13. Location Preview

Current preview uses a Bottom Sheet and a button called:

```text
继续编辑行程
```

This wording is ambiguous.

The user's current task is selecting a location, so the primary action should describe that action.

Use:

```text
使用此地点
```

or, in replace mode:

```text
更改为此地点
```

---

# 14. Location Preview with Map

Prefer a dedicated location preview page rather than the current small text-only Bottom Sheet.

Recommended structure:

```text
‹ 返回                地点详情


┌──────────────────────────┐
│                          │
│          地 图            │
│                          │
│              ●           │
│                          │
└──────────────────────────┘


西谷国家湿地公园

示例办事处北山桥东13公里处

示例自治区示例市西谷市

40.36003, 106.41510


在地图 App 中打开                 ›


┌──────────────────────────┐
│       更改为此地点          │
└──────────────────────────┘
```

## Map behavior

- Show the selected POI pin
- Initial camera should frame the selected POI clearly
- The map helps distinguish:
  - scenic area
  - parking lot
  - visitor center
  - city / administrative region
  - similarly named POIs

Map should use the same map technology already used in the app.

Do not introduce a new map provider unless technically necessary.

---

# 15. Optional Future Enhancement: Map + Result List Linking

Not required for the current revision, but architecture should not block it.

Potential later behavior:

```text
┌────────────────────────┐
│          地图            │
│       ●   ●  ●          │
│              ●          │
├────────────────────────┤
│ 西谷湿地景区      › │
│ 西谷国家湿地公园  › │
│ 西谷市            › │
└────────────────────────┘
```

- Tap list result → focus corresponding pin
- Tap pin → focus corresponding list item

Do not over-engineer this now.

---

# 16. Bottom Sheet / Modal Animation

Current problem:

When a Bottom Sheet opens, the dark transparent background appears to move upward together with the white sheet.

This produces an unnatural "black layer rising from the bottom" effect.

The backdrop and sheet must be animated independently.

## Correct structure

```text
Backdrop
+
Bottom Sheet
```

NOT:

```text
[Backdrop + Bottom Sheet]
→ entire combined container translates upward
```

---

## 16.1 Backdrop animation

Backdrop should always cover the full viewport.

Implementation behavior:

```text
position: fixed
inset: 0
```

Opening:

```text
opacity: 0 → approximately 0.28
duration: ~150–200ms
```

Closing:

```text
opacity: ~0.28 → 0
```

Do not animate:

- translate
- height
- scale

on the backdrop.

The background should simply fade darker / lighter.

---

## 16.2 Bottom Sheet animation

The white sheet moves independently.

Opening:

```text
translateY: 100% → 0
duration: approximately 250–320ms
easing: ease-out or a subtle spring
```

Closing:

```text
translateY: 0 → 100%
```

Backdrop fades simultaneously.

Visual result should be:

```text
page gradually dims
+
white sheet slides upward
```

not:

```text
dark region slides upward together with sheet
```

---

# 17. Day Selector Bottom Sheet

The existing Day selector is suitable as a Bottom Sheet and should remain one.

Do not convert it to a full page only to solve the animation problem.

## Behavior

Tap Day title:

```text
screen remains in place
+
backdrop fades in
+
Day selector sheet slides up
```

Use a reasonable maximum sheet height, roughly 75–85% of the viewport.

If the list is longer:

- keep the sheet height bounded
- scroll inside the sheet

The currently selected Day remains visually highlighted using the current app's existing selection style.

---

# 18. Navigation Principles

Use these rules throughout the implementation.

## Principle A: Child editing returns to parent editing

```text
Item Detail
→ Location Picker
→ Location Preview
→ Item Detail
```

The child flow should not unexpectedly terminate the parent editing session.

---

## Principle B: Overview is for scanning, Detail is for editing

Day Overview:

```text
when / what / where
```

Item Detail:

```text
specific configuration and notes
```

Do not make Day Overview behave like an editor.

---

## Principle C: Avoid duplicated context

If the user already knows they are editing:

```text
Day 2
具体时间
```

do not repeatedly display:

```text
当前 Day
当前模式：具体时间
精确时间
```

unless it adds new information.

---

## Principle D: One action = one clear label

Avoid labels such as:

```text
继续编辑行程
移出当天
查看
```

when a more precise action exists.

Prefer:

```text
更改为此地点
移动行程
打开地点详情
```

or make the whole row tappable.

---

# 19. Acceptance Criteria

The revision is complete when all of the following are true:

1. Day Overview no longer uses large `编辑` buttons.
2. Each Day item uses a three-dot menu.
3. Long notes no longer expand Day Overview rows excessively.
4. Day switching supports horizontal swipe.
5. Arrow touch targets are large enough for comfortable tapping.
6. Item Detail uses `名称（可选）`.
7. Empty name falls back to location name.
8. Precise-time selection no longer permanently displays a large wheel picker.
9. Redundant "当前 Day / 精确时间" labels are removed.
10. Location and date sections use compact tappable rows.
11. Entering Location Search preserves all unsaved Item Detail changes.
12. Selecting a location returns to Item Detail, not Day Overview.
13. Only Item Detail `保存` commits the complete edit draft.
14. Location Search results no longer show unnecessary coordinates.
15. Search-result rows are fully tappable.
16. Location preview includes a map and POI pin.
17. Primary location-preview action is `使用此地点` / `更改为此地点`.
18. Day selector remains a Bottom Sheet.
19. Backdrop fades instead of sliding upward.
20. Only the white Bottom Sheet translates vertically.
21. New UI matches the current app's fonts, colors, spacing, radii, and component language.
22. No unrelated visual redesign or new design system is introduced.

---

# 20. Implementation Priority

Recommended order:

```text
P0
1. Fix Item Detail draft-state preservation
2. Fix location-selection return path
3. Fix Bottom Sheet / backdrop animation

P1
4. Simplify Item Detail layout
5. Replace Day Overview edit buttons with ⋯
6. Add note truncation
7. Add horizontal Day swipe

P2
8. Refine Location Search list
9. Add map-based Location Preview
10. Polish spacing / animation / consistency
```

The P0 items affect data safety and navigation correctness, so they should be implemented before purely visual refinements.
