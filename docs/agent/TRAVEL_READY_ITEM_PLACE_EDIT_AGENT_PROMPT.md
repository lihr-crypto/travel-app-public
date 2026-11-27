# Agent Prompt — Change or Clear an Existing Item's Place

在当前 Git 仓库根目录实现 `TRAVEL-READY-ITEM-PLACE-EDIT`。

这是一项用户明确要求的实现任务（真机使用反馈：从 Day View 打开 Item 后只能改标题，地点完全无法更改）。连续完成实现、focused tests、全量自动检查和文档收尾；不要每个小步骤后暂停。只有真实的用户决策、外部权限或设备条件阻塞时才停。

## 先读与前置检查

先完整阅读：

- `AGENTS.md`
- `docs/agent/DEVELOPMENT_STATUS.md`
- `docs/agent/DEVELOPMENT_WORKFLOW.md`
- `docs/agent/TRAVEL_READY_ITEM_EDITING_AND_DATE_RANGE_PLAN.md`（本任务在 §4 的第 1 项）
- `docs/specs/00-PRODUCT-REALIGNMENT-AMENDMENT.md`
- `docs/specs/travel-app-stage-05-development-spec-rev-2026-09-11.md` §8.2（`updateItemDetails` 允许的字段）
- `docs/specs/travel-app-stage-04-technical-architecture-rev-2026-09-11.md` 中 Place 快照、CRS、Application Command 与事务边界部分

然后检查当前代码。共享仓库可能已有其他 Agent 的未完成改动，特别是：

- `src/application/place/place-snapshot.ts`
- `src/application/place/confirm-place-search-result.ts`
- `src/application/place/confirm-map-picker-place.ts`
- `src/components/place-search.tsx`
- `src/components/day-view-workspace.tsx`
- `src/components/item-editor-modal.tsx`
- 对应 tests

保留并兼容这些改动，不要回滚、覆盖或从旧版本重写。当前代码与测试比旧文档描述更权威。

## 本任务解决的规格缺口

Stage-05 §8.2 的 `updateItemDetails` 契约明确列出可更新字段，其中包含：

```text
Place association when performed through an explicit supported edit flow
```

该能力**已在规格内，但从未实现**。`UpdateItemDetailsInput`（`src/application/item/update-item-details.ts`）完全没有 `placeId` 字段；`ItemDraftForm` 只有标题、类型、自定义类型标签、时间、固定行程、备注。Item 的 Place 目前只能在**创建时**由 `confirmPlaceSearchResultCommand` / `confirmMapPickerPlaceCommand` 写入。

因此本任务不是扩大 V1 范围，而是补齐一个已规定但缺失的用户能力。

## 目标

Day View 的 Item 编辑器新增「地点」一行，用户可以：

1. **更换地点** —— 复用现有 Place Search / Map Picker 选择流程，把选中的 Place 挂到**已存在的** Item 上；
2. **清除地点** —— 把 Item 变回 Place-less，不删除 Item 本身。

Item 的标题、类型、时间、备注、`sortOrder`、`dayId`、`tripId` **一律不得改变**。

## 当前代码证据

- `PlaceRepository`（`src/repositories/place-repository.ts`）只有 `insert` 与 `getById`。Place 是**不可变快照**，没有 update/delete。
- 因此更换地点 = **插入一条新的 Place 行 + 把 `items.placeId` 指向它**。旧 Place 行可能被其他 Item 共享，绝不能原地修改。
- `src/application/place/place-snapshot.ts` 已提供可直接复用的 `expectedSnapshotPolicy`、`assertSnapshotMatchesTrip`、`insertPlaceSnapshot`，以及 `ConfirmedPlaceItem` 形状。
- `confirmMapPickerPlace` 里的 `assertEnrichmentMatchesPick`（provider 必须一致、enrichment 坐标必须等于拾取坐标）目前是模块私有函数，需要提取到共享位置供新命令复用，**不要复制一份**。
- `PlaceSearch`（`src/components/place-search.tsx`）的 `confirmation.command` 与 `mapPicker.confirmation.command` 被钉死为两个**创建**命令的类型；且 `confirmPreview` / `confirmPickedCoordinate` 一定会先进入 Item Draft 表单，再由 `saveDraft` 调用命令。
- `DayViewWorkspace.openPlaceEntry`（`src/components/day-view-workspace.tsx`）在 Place 流程期间**整屏替换** Day surface，`placeEntryState` 只有 `closed | loading | ready | error` 四种状态，没有"为哪个 Item 服务"的信息。
- `ItemEditorModal`（`src/components/item-editor-modal.tsx`）是编辑器的宿主，`QuickEdit` → `ItemDraftForm`。它已经接收 `place` 并渲染 attribution 与「在地图中打开」。
- `DayViewWorkspace` 从 `data.placesById[editorItem.placeId]` 取 `editorPlace`。
- `buildDayMapProjection` 的 marker 只来自 Place-bearing Item；marker 序号是 **Item occurrence ID**，不是 Place ID。

## 所有权与范围

本任务主要拥有并可修改：

- 新增 `src/application/item/change-item-place.ts`
- `src/application/place/place-snapshot.ts`（仅提取/导出共享校验，不改现有语义）
- `src/application/place/confirm-map-picker-place.ts`（仅改为引用提取后的共享校验）
- `src/infrastructure/database/item-command.ts` 与 `src/infrastructure/database/index.ts`（新增命令与其事务 runner）
- `src/components/item-editor-modal.tsx`
- `src/components/item-draft-form.tsx`（仅在需要放置「地点」入口时）
- `src/components/day-view-workspace.tsx`
- `src/components/place-search.tsx`（仅新增可选 pick-only 行为）
- 上述行为对应的 focused tests
- 本任务直接覆盖的 agent docs/status 记录

不要重写：Item 编辑器的字段布局与校验、时间选择、自定义类型、Migration、provider search/pagination/handoff、persistent Day View 语义、地图相机语义。

## 锁定实现语义

### 1. 一个专用 Application Command

新增 `changeItemPlace`，**不要**把 place 塞进 `updateItemDetails`。原因：挂载 Place 需要插入快照并做 provider/CRS 校验，与"改字段"是不同的关注点，且它的调用方是 Place 选择流程而不是表单 Save。

输入用判别联合，三个分支各自明确：

```ts
export type ChangeItemPlaceTarget =
  | { kind: 'search'; result: PlaceSearchResult }
  | { kind: 'map-picker'; coordinate: Coordinate; enrichment?: ReverseGeocodeResult | null }
  | { kind: 'none' };

export interface ChangeItemPlaceInput {
  itemId: EntityId;
  target: ChangeItemPlaceTarget;
}
```

返回 `CommandResult<ConfirmedPlaceItem>`；`kind: 'none'` 时 `place` 允许为 `null`（或另设返回形状，但必须在类型上表达"没有 Place"）。

### 2. 命令行为（单一排他事务）

```text
items.getById(itemId)                       → 必须存在
trips.getById(item.tripId)                  → provider 策略只由该 Item 自己的 Trip 决定
按 target 分支：
  search       → assertSnapshotMatchesTrip({provider, coordinate}, trip)
  map-picker   → assertCoordinateSystem(coordinate, policy.coordinateSystem)
                 + 共享的 enrichment 一致性校验
  none         → 不插入任何 Place 行
插入新 Place 快照（kind !== 'none'）
更新 item.placeId（新 id 或 null）与 updatedAt
```

- **不得**从调用方传入的 `tripId` 决定 provider 策略；一律以 Item 自身的 `tripId` 为准，防止把 Item 指向另一区域策略的快照。
- **不得**修改 `title`、`type`、`timeMode`、`startDateTime`、`endDateTime`、`period`、`isFixed`、`note`、`payload`、`sortOrder`、`dayId`、`tripId`。
- **不得**触发时间重排（`orderItemsByTravelTime` / `reindexChangedItems`）：换地点不改变排序。
- 校验失败必须整事务回滚，Item 保持原状（包括原 `placeId`）。

### 3. PlaceSearch 增加显式 pick-only 模式

在 `confirmation` 与 `mapPicker.confirmation` 上新增可选 `pickOnly?: boolean`。

- `pickOnly` 为真时，选中搜索结果或拾取坐标**直接提交命令**，不进入 Item Draft 表单。
- `pickOnly` 缺省时必须与今天完全一致（先表单、再命令）。这是回归红线。
- 变更流程调用命令时忽略 draft：不得用表单里的值覆盖既有 Item 的字段。

### 4. Day View 的 Place 流程携带意图

`placeEntryState` 增加意图，明确这次流程是创建还是给某个既有 Item 换地点：

```ts
type PlaceEntryIntent =
  | { kind: 'create' }
  | { kind: 'change-place'; itemId: EntityId };
```

- 现有「＋ 添加地点」使用 `create`，行为不变。
- 换地点使用 `change-place` 并携带目标 `itemId`。
- Day 切换时 `placeEntryState` 复位为 `closed` 的既有行为必须继续覆盖两种意图（persistent Day View 不会卸载来清理它）。
- 换地点流程的搜索中心优先级：**该 Item 当前 Place 的坐标** → `lastViewportCenter` → `placeEntry.initialCoordinate` → 现有 fallback。

### 5. 编辑器入口与流程衔接

- `ItemEditorModal` 新增「地点」一行：显示当前 Place 名称；有 Place 时提供「更换地点」与「清除地点」，无 Place 时只提供「添加地点」。
- 「更换地点」→ **先关闭编辑器 Modal**，再进入现有的整屏 Place 流程。不要把 Modal 叠在被替换的 Day surface 上。
- 确认后回到 Day，该 Item 保持选中，并失效 Day 与 Overview 两个读模型。
- 「清除地点」→ 直接提交 `kind: 'none'`，编辑器保持打开并刷新为无地点状态（footer 的 attribution 与「在地图中打开」随 `place` 变为 undefined 而消失）。
- Place-less Item 不显示任何地图相关动作，维持既有规则。

### 6. 投影与 marker 语义不变

- marker 仍只来自 Place-bearing Item，序号仍是 Item occurrence ID。
- 清除地点后该 Item 不再产生 marker，**不产生编号空洞**。
- Place-less Item 的编号规则不得改变。

## 失败与并发行为

- 目标 Item 不存在、Trip 不存在、provider 与 Trip 区域不符、CRS 不符、enrichment 与拾取坐标不符 → 抛错并整事务回滚，Item 的 `placeId` 保持原值。
- Place 流程进行中 Day 切换 → 按 persistent Day View 既有规则放弃该流程，不得把 Place 挂到新 Day 的 Item 上。
- 提交失败时不得关闭编辑器或丢失用户已输入的内容。
- 命令必须防重复提交：同一 Item 的连续两次换地点请求不得产生两条 Place 行指向不同结果。

## 必须新增的测试语义

Focused tests 至少覆盖：

1. 从搜索结果更换地点：插入新 Place 行，`items.placeId` 指向它，Item 的标题/类型/时间/备注/`sortOrder`/`dayId` 全部不变。
2. 从 Map Picker 更换地点：坐标 + enrichment 走同一套 provider/CRS 校验。
3. 清除地点：`placeId` 变为 `null`，**不插入任何 Place 行**，该 Item 从 Day 地图投影的 markers 中消失。
4. provider 不匹配（例如 China Trip 配 google 结果）被拒绝，且 Item 的 `placeId` 保持原值。
5. enrichment 描述的不是被拾取的坐标时被拒绝。
6. 编辑器在无 Place 时只显示「添加地点」，有 Place 时显示当前名称 +「更换地点」+「清除地点」。
7. `pickOnly` 为真时选中搜索结果直接提交，**不渲染** Item Draft 表单。
8. `pickOnly` 缺省时创建流程与今天逐字一致（回归）。
9. 换地点后 Day 与 Overview 两个读模型都被失效，Item 保持选中，编辑器已关闭。
10. 换地点不改变 Item 数量、不改变任何 Item 的 `sortOrder`、不产生时间重排。

不要为了让测试通过而弱化 provider/CRS 断言、跳过回滚验证或 mock 掉真实数据交换。

## 保护要求

- 仓库没有初始 commit，全部内容可能显示为未跟踪；保留全部用户文件。
- 不要 reset、checkout、clean、commit 或 push。
- 你不是工作区里唯一的 Agent。不要回滚或覆盖其他 Agent 的改动；发现同文件新改动时基于最新内容继续。
- 不实现 Item 删除或 Undo（属 M11，见 plan §3）。
- 不增加 Place 清理逻辑：旧 Place 行留在库中是既有且可接受的行为，`PlaceRepository` 刻意没有 delete。
- 不实现 M6、M9、M10、M11、M13，不增加 Leg、RouteProvider、polyline、AI 或云同步。
- 不改变 `Trip.mapRegion`、CRS、AMap privacy persistence format、provider search/pagination、screenAnchor 或外部地图 handoff。
- 不增加依赖。
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

只有修改 native-facing map contract 时才增加 Swift/native target 检查。本任务不应改动任何原生代码。

## 真机与证据边界

不要为本任务单独安排一轮 Release 验收。完成并集成后，按
`docs/agent/TRAVEL_READY_UI_TASKS.md` 执行一次统一 current Release。

真机必须观察（可由用户操作，也可用 `devicectl device capture screenshot` 取证）：

- 从 Day View 打开一个带地点的 Item，「地点」一行显示当前名称；
- 点「更换地点」→ 编辑器关闭 → 搜索并选中新地点 → 回到 Day，marker 移到新位置，Timeline 仍是同一个 Item；
- 点「清除地点」→ 该 Item 的 marker 消失，其余 marker 编号不跳号；
- China Trip 只出现 AMap 候选，global Trip 只出现 Google 候选；
- 全程 Item 的标题、类型、时间、备注没有被改动。

无法取得屏幕观察路径时，诚实保留 `reported_complete_pending_verification`，不能用 build/install/launch 替代视觉验收。

## 文档收尾

- 更新 `docs/agent/DEVELOPMENT_STATUS.md` 与 `docs/agent/TRAVEL_READY_UI_TASKS.md` 的精确证据。
- 在 `docs/agent/TRAVEL_READY_ITEM_EDITING_AND_DATE_RANGE_PLAN.md` §4 标注本任务状态。
- 保留历史，不改写此前用户反馈和失败事实。
- 未完成统一真机视觉验收前，不给 Travel-Ready `READY`。

## 最终返回

清楚区分：

- 实际实现（新命令、pick-only、意图化 Place 流程、编辑器入口）；
- focused/full tests；
- provider/CRS 与回滚证据；
- native/Release build evidence；
- 实际真机视觉观察；
- 尚未验证或被外部条件阻塞的项目。
