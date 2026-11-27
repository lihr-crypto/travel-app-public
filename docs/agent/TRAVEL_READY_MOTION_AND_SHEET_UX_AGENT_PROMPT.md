# Agent Prompt — Travel-Ready Motion, Sheet, and Timeline Action Batch

> **Superseded notice, 2026-09-16:** 本提示词中 Day → Day 的 keyed remount 和整页
> leaving/entering 方案已被用户后续反馈覆盖。执行 Day 切换相关工作时，必须改用
> `docs/agent/TRAVEL_READY_PERSISTENT_DAY_VIEW_AGENT_PROMPT.md`；Home ↔ Overview、
> Overview ↔ Day、Sheet 漏底、consent 按钮和 Timeline 编辑按钮部分仍有效。

在当前 Git 仓库根目录执行 `TRAVEL-READY-MOTION-AND-SHEET-UX-BATCH`。

先完整阅读：

- `AGENTS.md`
- `docs/agent/DEVELOPMENT_STATUS.md`
- `docs/agent/DEVELOPMENT_WORKFLOW.md`
- `docs/agent/TRAVEL_READY_MOTION_AND_SHEET_UX_PLAN.md`
- `docs/agent/TRAVEL_READY_UI_TASKS.md`
- `docs/specs/00-PRODUCT-REALIGNMENT-AMENDMENT.md`
- `docs/specs/travel-app-stage-03-ui-wireframe-spec.md` 中 Trip Planning Workspace、Bottom Sheet、Day switching 和 Item Selected 相关部分

然后检查当前代码和测试，以当前代码为准，不依赖旧结论。设计方案已经在 `TRAVEL_READY_MOTION_AND_SHEET_UX_PLAN.md` 锁定；若代码漂移，允许按现场证据调整实现方法，但不能改变用户可见目标和验收标准。

## 目标

作为一个连续批次完成以下用户反馈：

1. 删除地图就绪后的“撤销地图同意”悬浮按钮；保留全局持久化同意、隐私版本、拒绝、启动时两套 AMap 原生 privacy API readiness、fail-closed 和重试。
2. 修复 Trip Overview 和 Day View Bottom Sheet 下方漏出地图的问题。Sheet 白色背景必须贴到物理底边；安全区只用于内部内容 padding。不要把 expanded 改成 100%，顶部仍保留现有规范要求的小地图语境。
3. 让 Home ↔ Trip Overview、Trip Overview ↔ Day View 的切换平缓自然，消除直接条件替换、查询 loading 中间帧、白闪和默认地图首帧闪烁。
4. 让不同 Day 之间的前后切换和 Day Jump 更平滑。保留 Day keyed remount 或同等强度的地图状态隔离，不能让旧 Day 相机状态、重复坐标或旧 request key 泄漏。
5. 将每个 Day Timeline Item 的编辑操作改成最右侧常驻的深色大按钮。按钮至少 56 × 44pt，和行选择做成同级独立触控目标；点击直接打开现有共享 Item 编辑器。

## 已确认实现方向

- 使用已有 `react-native-reanimated@4.5.1`，不要增加动画或导航依赖。
- 动效只使用克制的 opacity + 8–12pt translate：Home → Trip 约 220–260ms，Overview ↔ Day 约 200–240ms，Day ↔ Day 约 180–220ms；不使用弹簧、bounce、大幅滑动或夸张转场。
- 支持 iOS Reduce Motion；开启时使用短 opacity-only 或即时切换。
- 目的页面数据 ready 前保留来源页面：Home 进入 Trip 前 prefetch Overview，进入/切换 Day 前 prefetch Day；当前 Day 打开后预取相邻 Day。
- prefetch 失败时留在来源页面并显示可操作错误，不要切到全屏错误/加载文字。
- 一个 transition 中不要同时叠两套活动的 AMap/Google 原生地图。推荐两阶段淡出/单点替换/淡入，并用稳定页面背景遮住 native map 首帧。
- 防止 transition 期间重复点击造成并发导航。
- Day adjacent switch 根据 `dayIndex` 使用轻微方向；非相邻 Day Jump 使用 neutral fade。
- forward 与 back 使用一致的 motion language。

## 当前代码证据

- `src/components/trip-bottom-sheet.tsx` 同时使用 `bottomInset={insets.bottom}` 和内部 `paddingBottom: insets.bottom + 16`，导致 Sheet 被整体抬高并在底部漏地图。
- `src/app/index.tsx` 通过 `openedTrip` 条件分支立即替换 Home。
- `src/components/trip-planning-workspace.tsx` 通过 `TripFocus` 立即替换 Overview/Day，并在 Day pending 时显示 `Day 加载中…`。
- `DayPlanningView` 当前 `key={selectedDayId}` 是先前相机隔离修复的一部分；不能无证据删除。
- `src/components/day-timeline.tsx` 把 13pt `编辑 ›` 嵌在 selected row 内容里，触控区域不足且嵌套在选择 Pressable 内。
- 当前无通用页面 transition 组件；TanStack Query、Zustand、Reanimated 已存在。

## 保护要求

- 仓库没有初始 commit，全部内容可能显示为未跟踪；保留全部用户文件和现有实现。
- 不要 reset、checkout、clean、commit 或 push。
- 不要覆盖已完成的 AMap screenAnchor、consent persistence、Migration 002、自定义类型、native time picker、direct Item editor、搜索/分页和 provider handoff 工作。
- 不要实现 M6、M9、M10、M11、M13，也不要增加 Leg、RouteProvider、polyline、AI、云同步或其他新产品范围。
- 不要改变 Trip Overview 生命周期地点选择策略。
- 不要把 Jest、export、Simulator 或原生编译写成真机视觉成功。
- 用户已授权把本提示词中的任务作为一个连续批次推进；不要每个子任务后暂停或重复请求批准。只有真实用户决策、登录/权限或外部设备阻塞时才停。

## 建议执行顺序

1. 移除 revoke UI，并修正 focused consent tests。
2. 修复 Bottom Sheet bottom coverage，并锁定 safe-area/snap regression。
3. 新增一个共享 transition host/controller 和 Reduce Motion/duplicate-intent tests。
4. 接入 Home ↔ Trip Overview prefetch + transition。
5. 接入 Overview ↔ Day 的统一 Day-entry prefetch + transition，包含 occurrence Preview。
6. 接入 adjacent Day/Day Jump 的方向、prefetch、失败保留和 keyed remount。
7. 重构 Timeline row，使右侧深色编辑按钮始终可见并具有独立最小触控尺寸。
8. 集成测试、全量门禁、文档台账和一次新的 current Release 检查。

## 行为验收

- ready AMap 内容中不再出现 revoke 按钮；隐私首次同意、已同意启动、跨 Trip、拒绝、版本变化、两套 native readiness、native/storage failure 和 retry 继续工作。
- Overview/Day Sheet 在 collapsed、half、expanded 三种状态下底部不漏地图；内容不被 Home Indicator 遮挡；snap 百分比和 camera padding 不变。
- Home → Trip、Overview → Day、Day → Overview、Overview → Home 没有白闪、loading 文字闪烁、地图默认位置闪烁或弹跳。
- 目标查询 pending 时来源页面保持可见；失败时不离开来源页面。
- adjacent previous/next Day 有轻微正确方向；非相邻 Jump 使用 neutral fade。
- 快速重复点击不叠页面、不交错 focus、不显示错误 Day。
- Day 切换仍产生新 scope/request key；重复坐标仍重放新 Day 请求；手动 pan 后旧请求不重新夺回地图。
- transition 期间最多一套活动 native map。
- 每个可编辑 Item 行最右侧都有深色 `编辑` 按钮，至少 56 × 44pt；长标题/备注和窄屏不挤掉按钮；行点击仍只做 selection，编辑点击只开 editor。
- Reduce Motion 路径可用。

## 自动化与发布验证

为行为变化增加 focused tests，然后运行：

```bash
npm test
npm run typecheck
npm run lint
npx expo install --check
npx expo export --platform ios
plutil -lint ios/TravelApp/Info.plist ios/TravelApp/Supporting/Expo.plist
```

如修改了 native-facing map contract，再运行适用的 Swift/native target 检查；普通 presentation transition 不应要求修改 AMap/Google native 实现。

全部自动检查通过后，只执行一次新的 current Release：

```bash
export PATH="$HOME/.gem/ruby/4.0.0/bin:$HOME/homebrew/Library/Homebrew/vendor/portable-ruby/4.0.6/bin:$PATH"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(git rev-parse --show-toplevel)"
EXPO_MAPS_REQUIRE_KEYS=1 npx expo run:ios --device <DEVICE_UDID> --configuration Release --no-bundler
```

- Expo/Xcode device UDID: `<DEVICE_UDID>`
- `devicectl` identifier: `<DEVICECTL_IDENTIFIER>`

若设备不可用，完成所有独立检查并明确记录 blocker；不要把 Simulator 当成实体机验收，也不要无限重试相同失败。

## 文档与状态

- 将实现证据和真机结果更新到 `docs/agent/TRAVEL_READY_MOTION_AND_SHEET_UX_PLAN.md`。
- 更新 `docs/agent/DEVELOPMENT_STATUS.md` 与 `docs/agent/TRAVEL_READY_UI_TASKS.md`，保留历史失败和旧 Release 事实。
- 批次在实现但未完成实体机视觉验收时必须保持 `reported_complete_pending_verification`。
- 不要提前给 Travel-Ready `READY`。

## 返回结果

最终报告必须区分：

- 实际修改和用户可见影响；
- focused/full automated evidence；
- native/Release build/install/launch evidence；
- 实际观察到的视觉/交互行为；
- 未观察或受阻的真机项目；
- 未实现的明确范围。

在目标未完成时不要用“已完成”概括部分结果。
