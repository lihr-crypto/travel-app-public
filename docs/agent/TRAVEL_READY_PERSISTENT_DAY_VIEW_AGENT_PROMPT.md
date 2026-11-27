# Agent Prompt — Persistent Day View and In-Place Day Switching

在当前 Git 仓库根目录实现 `TRAVEL-READY-PERSISTENT-DAY-VIEW`。

这是一项用户明确要求的实现任务。连续完成实现、focused tests、全量自动检查和文档收尾；不要每个小步骤后暂停。只有真实的用户决策、外部权限或设备条件阻塞时才停。

## 先读与前置检查

先完整阅读：

- `AGENTS.md`
- `docs/agent/DEVELOPMENT_STATUS.md`
- `docs/agent/DEVELOPMENT_WORKFLOW.md`
- `docs/agent/TRAVEL_READY_MOTION_AND_SHEET_UX_PLAN.md`
- `docs/agent/TRAVEL_READY_UI_TASKS.md`
- `docs/specs/00-PRODUCT-REALIGNMENT-AMENDMENT.md`
- `docs/specs/travel-app-stage-03-ui-wireframe-spec.md` 中 Trip Planning Workspace、Day switching、Bottom Sheet 和地图/Timeline 同步部分

然后检查当前代码和测试。共享仓库可能已有另一 Agent 对 motion batch 的未完成或刚完成修改，特别是：

- `src/components/trip-planning-workspace.tsx`
- `src/components/day-view-workspace.tsx`
- `src/components/planning-surface-transition.tsx`
- `src/state/planning-transition.ts`
- 对应 tests

保留并兼容这些改动，不要回滚、覆盖或从旧版本重写。当前代码与测试比旧文档描述更权威。

## 本提示词覆盖的旧决定

本提示词明确覆盖上一份 motion 方案中以下建议：

- Day → Day 继续使用 `key={selectedDayId}`；
- Day → Day 使用整个页面的 leaving/entering transition；
- 切换 Day 时卸载并重建 Day Workspace、地图和 Bottom Sheet。

新的用户要求是：

> 在不同 Day 之间切换时，Day View 页面必须保持为同一个持续挂载的页面。Bottom Sheet 一直固定，只更新列表内部内容；地图保持为同一个原生地图实例，在这张地图上平滑移动到新 Day 的地点，不能看起来像整页重新加载或弹窗跳入。

## 目标

实现一个持续挂载的 Day View：

```text
Persistent Day View
  ├─ one native map instance
  ├─ one TripBottomSheet instance
  ├─ stable current sheet snap
  ├─ Day Header content changes in place
  ├─ Timeline content changes in place
  └─ map markers/camera update through props
```

Day 1 → Day 2 时只发生：

1. 目标 Day 数据预取成功；
2. Header 和 Timeline 数据原地替换；
3. 同一地图更新 markers；
4. 同一地图使用新 request key 平滑移动/fit 到 Day 2；
5. Sheet 保持同一实例、同一高度和同一背景，不做整块 entering/exiting 动画。

## 当前代码证据

- `TripPlanningWorkspace` 已有 `requestDay()`、目标 Day `fetchQuery()`、相邻 Day prefetch 和 `PlanningSurfaceTransition`。
- 当前 `DayPlanningView` 仍使用 `key={selectedDayId}`，所以 Day 切换会卸载整个 Day surface。
- 当前 `PlanningSurfaceTransition` 包住 Overview/Day content，Day → Day 也会让整个地图和 Sheet 淡出/位移后再进入。
- `GoogleMapRenderer` 的同一个 `MapView` 可以在 camera request 改变时调用 `animateCamera`、`animateToRegion` 或 `fitToCoordinates`。
- `AmapMapRenderer` 的同一个 Expo native view 可以接收新的 `markers` 和 `cameraRequest`；Swift view 已支持新 request key、`setMarkers` 和原生 animated camera。
- `useDayFocusEffects(data)` 当前只在首次挂载时初始化 camera request；取消 remount 后必须显式响应 `data.day.id` 变化。
- `DayViewWorkspace` 当前依赖卸载自动清理 editor、Day Jump、Place entry、viewport center、scroll state 等临时状态；持续挂载后必须主动清理。

## 所有权与范围

本任务主要拥有并可修改：

- `src/components/trip-planning-workspace.tsx`
- `src/components/day-view-workspace.tsx`
- `src/components/day-header.tsx`（仅 Day intent/内容切换需要时）
- `src/components/day-timeline.tsx`（仅 Day 数据变化后的 offset/scroll 清理需要时）
- `src/state/day-focus-effects.ts`
- `src/state/day-selection.ts`（仅统一 Day intent 需要时）
- 上述行为对应的 focused tests
- 本任务直接覆盖的 agent docs/status 记录

除非当前共享代码已经把职责放到 transition controller 中，否则不要重写：

- Home ↔ Trip Overview motion；
- Trip Overview ↔ Day View 的页面级 motion；
- AMap consent button；
- Bottom Sheet bottom safe-area gap；
- Timeline 右侧大编辑按钮；
- Item editor、Migration 002、自定义类型、native time picker、provider search/pagination/handoff。

这些属于原 motion/corrective batch 的其他部分。只在本任务完成所必需且不会覆盖并发成果时做最小接线修改。

## 锁定实现语义

### 1. Day Workspace 不卸载

- 删除 Day surface 上按 `selectedDayId` 设置的 React `key`。
- Day 1 → Day 2 后，`DayPlanningView`、`DayViewWorkspace`、Map Renderer 和 `TripBottomSheet` 都保持同一个 mounted instance。
- Overview → Day 初次进入仍然可以创建 Day View；Day → Overview 才卸载它。
- 不用隐藏的双 Day 页面或两个 native map 做交叉淡入。

### 2. Day → Day 不走整页 transition

- 保留 `PlanningSurfaceTransition` 给真正的页面层级变化：Home ↔ Overview、Overview ↔ Day。
- `requestDay()` 仍先 fetch/prefetch 目标 Day，失败时保留当前 Day。
- 当来源和目标都是 Day 时，不触发整个 surface 的 opacity/translate leaving/entering。
- query 成功后原地 commit 新 Day。
- Day Jump 与前后 Day 使用同一 persistent swap；不做整页滑入。

### 3. Bottom Sheet 固定

- Day 切换期间 `TripBottomSheet` 不卸载。
- 保留当前 `collapsed / half / expanded` snap。
- handle、白色背景、圆角和 Sheet 位置完全不动。
- 新 Day 内容默认复位到列表顶部，但用无动画 scroll reset，并在内容交换点执行，不能让整个 Sheet 跳动。

### 4. 列表只更新内部内容

- Header 的 Day 编号/日期原地更新。
- Timeline rows 原地替换为新 Day projection。
- 默认不做横向页面滑入。
- 如需要掩盖 React 内容替换，只允许 Header/Timeline 内容区域使用约 100–140ms 的轻微 opacity transition；不要移动 Sheet 容器。
- Reduce Motion 下直接替换内容。

### 5. 地图保持同一实例

- Provider 在一个 Trip 内不变，保持同一个 Google `MapView` 或 AMap `MAMapView`。
- 新 Day 到来时只更新 marker props 和 camera request。
- 新 camera request 必须包含目标 Day 的 `scopeKey` 和新的单调 `requestId`。
- Google 在同一 `MapView` 上 animate/fit；AMap 在同一 native view 上 setMapStatus/showAnnotations。
- 不重置到默认区域，不显示黑屏/白屏，不创建第二张活动地图。
- 若真机证据显示 AMap `setMarkers` 的全量 remove/add 仍造成明显 marker 闪烁，再做基于 Item ID 的最小 annotation diff；没有视觉证据时不要先扩大原生修改。

### 6. `useDayFocusEffects` 响应 Day 变化

持续挂载后，监听 `data.day.id`：

- 为新 Day 从 `buildDayMapProjection(data).cameraRequest` 生成新 request；
- 使用单调递增 request ID，不能因 Day 变化归零而撞 key；
- 清除旧 Timeline scroll request；
- 新 Day 没有 Place 时不要回放旧 Day camera；
- 同一 Day 内用户手动 pan 后不重放旧 request；
- 不破坏 Timeline/Marker selection 双向联动。

### 7. Day-local 临时状态主动重置

在 `data.day.id` 变化时集中处理：

- 关闭 Item Editor；
- 关闭 Day Jump；
- 取消/作废未完成的 Place provider initialization/search/picker flow；
- 清除旧 `lastViewportCenter`，防止新 Day Map Picker 使用旧 Day 视口；
- 清除旧 Marker-to-row scroll intent；
- 清空 `DayTimeline` 的 item offset/pending scroll cache；
- 将 Sheet 内部滚动位置复位到顶部；
- 不改变 `sheetSnap`；
- 不销毁地图或 Sheet。

## 失败与并发行为

- 目标 Day fetch pending 时当前 Day 继续完整显示。
- fetch 失败时不修改 `TripFocus`、不替换内容、不移动地图；显示可重试错误。
- transition/navigation in flight 时忽略重复点击，不能让 Day 2/Day 3 响应乱序覆盖。
- 当前请求失效后，迟到结果不能重新切回旧目标。
- Item save/query invalidation 应使用当前显示 Day ID，不能继续闭包捕获前一个 Day。

## 必须调整的测试语义

当前 `tests/components/trip-planning-workspace.test.tsx` 有测试要求 Day 改变时旧 Day unmount。将其反转为 persistent acceptance，不要仅删除断言。

Focused tests 至少覆盖：

1. Day 1 → Day 2 后 `DayViewWorkspace` mount count 仍为 1，unmount count 为 0。
2. Map Renderer mount count 仍为 1。
3. `TripBottomSheet` mount count 仍为 1，snap 不变。
4. Header、Timeline 和 markers 更新成 Day 2 数据。
5. Day 2 camera request 的 scope/request key 与 Day 1 不同。
6. 同一地图收到 animate/fit intent，而不是重新创建。
7. Day → Day 不出现 `planning-transition-leaving-*` 或整页 entering phase。
8. Overview → Day 和 Day → Overview 仍保留页面级 transition。
9. 目标 query pending 时 Day 1 保持可见；失败后仍是 Day 1。
10. 快速 Day 2 → Day 3 intent 不产生乱序内容。
11. Day-local editor/jump/place-entry/viewport/scroll 状态在 data swap 后被清理。
12. Sheet 内容滚动复位，但 Sheet snap 不变。
13. 重复坐标跨 Day 仍产生新 camera request。
14. 手动 pan 后旧 request 不重放，新 Day request 仍可应用。
15. Day → Overview 时 persistent Day Workspace、地图和 Sheet 才真正 unmount。

不要为了让测试通过而隐藏 mount/unmount 计数、弱化 request-key 断言或 mock 掉核心数据交换。

## 保护要求

- 仓库没有初始 commit，全部内容可能显示为未跟踪；保留全部用户文件。
- 不要 reset、checkout、clean、commit 或 push。
- 你不是工作区里唯一的 Agent。不要回滚或覆盖其他 Agent 的改动；发现同文件新改动时基于最新内容继续。
- 不要实现 M6、M9、M10、M11、M13，不增加 Leg、RouteProvider、polyline、AI 或云同步。
- 不改变 Trip Overview 生命周期地点选择策略。
- 不改变 AMap privacy persistence format、CRS、search、pagination、screenAnchor 或外部地图 handoff，除非本任务造成了有证据的回归并且修复严格最小。
- 不增加导航/动画依赖。
- 不把 Jest、export、Simulator 或编译写成真机视觉成功。

## 自动化验证

先运行 focused tests，再运行：

```bash
npm test
npm run typecheck
npm run lint
npx expo install --check
npx expo export --platform ios
plutil -lint ios/TravelApp/Info.plist ios/TravelApp/Supporting/Expo.plist
```

只有修改 native-facing map contract 时才增加 Swift/native target 检查。本任务原则上应复用现有 renderer 更新能力，不需要重建 AMap/Google native bridge。

## 真机与证据边界

不要为本子任务单独安排一轮与其他 motion 改动分离的 Release 验收。完成并集成到当前 motion batch 后，按照 `docs/agent/TRAVEL_READY_UI_TASKS.md` 执行一次统一 current Release。

真机必须观察：

- Day 切换时地图没有黑屏、白屏或默认位置首帧；
- 地图是同一实例平滑移动到目标 Day；
- Bottom Sheet、handle、背景和 snap 完全固定；
- 只有 Header/Timeline/Markers 内容更新；
- 快速切换不会显示旧 Day 或错误 Marker；
- AMap 与 Google 都通过；
- 手动 pan 后旧请求不夺回地图。

无法取得屏幕观察路径时，诚实保留 `reported_complete_pending_verification`，不能用 build/install/launch 替代视觉验收。

## 文档收尾

- 更新 `docs/agent/TRAVEL_READY_MOTION_AND_SHEET_UX_PLAN.md`，把 Day → Day 的 keyed remount/整页 transition 方案标为 superseded，并记录 persistent Day View 的实际实现。
- 更新 `docs/agent/DEVELOPMENT_STATUS.md` 和 `docs/agent/TRAVEL_READY_UI_TASKS.md` 的精确证据。
- 保留历史，不改写此前用户反馈和失败事实。
- 未完成统一真机视觉验收前，不给 Travel-Ready `READY`。

## 最终返回

清楚区分：

- persistent instances 和数据交换的实际实现；
- focused/full tests；
- map request/camera regression evidence；
- native/Release build evidence；
- 实际真机视觉观察；
- 尚未验证或被外部条件阻塞的项目。

只有创建了一个持续挂载的 Day Workspace、一个持续挂载的地图和一个持续挂载的 Bottom Sheet，并通过相应验收，才算完成本任务。

