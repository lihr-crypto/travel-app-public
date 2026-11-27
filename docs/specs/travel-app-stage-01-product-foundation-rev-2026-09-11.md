# 旅行计划 App｜阶段 01 方案定稿

> 产品骨架、地图交互原则与核心数据模型\
> 状态：阶段性设计基线（后续阶段允许在 Review 后修订）\
> **Stage 06 地图范围修订（2026-09-11）：** V1 首发平台锁定 iOS；中国大陆 Trip 使用高德，海外 Trip 使用 Google。
> **Product realignment amendment (2026-09-11, user-approved):** The V1 product goal has been re-confirmed as **personal travel-plan storage organized by Day and ordered Items**. Home remains map-centered as a travel-footprint/Trip-entry surface. Inside a Trip, the **Timeline / ordered itinerary is the primary planning and browsing view**, while the map is a synchronized **spatial projection** of saved Places. The app does **not** plan routes, choose route alternatives, recommend places, or replace AMap / Google Maps / Xiaohongshu-style discovery. Any earlier wording that makes Trip planning itself “map-first”, treats a Trip/Day as a route, requires Day anchors/routes, or implies automatic routing is superseded by this amendment. No M0 rollback is required.

## 1. 产品定位

-   **目标用户**：首先满足个人使用，同时允许未来扩展到朋友使用；V1
    暂不以公开社区或大规模多人协作为目标。
-   **地图范围 / 平台**：V1 明确以 **iOS** 为首发平台，同时支持中国大陆与海外旅行。
    -   中国大陆 Trip：高德地图 / 高德地点服务；
    -   海外 Trip：Google Maps / Google Places；
    -   地图供应商差异通过统一 Renderer / Provider 与显式坐标系隔离，不进入核心业务模型。
-   **规划方式**：
    -   V1：手动规划（A）
    -   最终目标：手动编辑 + AI 辅助规划（C）
-   因此，当前的数据结构与操作模型必须允许未来 AI
    对行程执行新增、删除、移动、排序、调整时间等操作。

------------------------------------------------------------------------

## 2. 核心产品原则：计划为核心，地图为空间辅助视图

V1 的首要目标不是解决“去哪玩、怎么走、选哪条路线”，而是可靠保存用户已经决定或正在整理的旅行计划。

核心关系：

```text
Trip
  ↓
Day
  ↓
Ordered Items
```

- **Timeline / Ordered Itinerary**：主要的计划浏览与编辑视图，回答“每天安排了什么、先后顺序是什么”。
- **Map**：同一份行程数据的空间投影，回答“这些已保存地点在哪里、分布如何”。
- **Home Map**：仍然是产品特色入口，用于查看旅行足迹、Trip 聚合和进入旅行。
- **第三方 App**：路线选择、导航、交通实时信息、攻略与地点发现继续交给高德 / Google Maps / 小红书等。

Trip 内的信息层级：

```text
Trip Overview
  ├─ Map: 整趟 Trip 已保存 Place 的空间分布 / 聚合
  └─ Day List: 每天的计划摘要与主要导航
        ↓
Day View
  ├─ Map: 仅当前 Day 中有 Place 的 Item
  │       ①②③… 表示这些地点在 Timeline 中的相对顺序
  └─ Timeline: 当前 Day 的完整 Ordered Items
        ↓
Item Selected
  └─ 仍在同一个 Day View 中，Marker 与 Timeline 双向联动
```

地图不得自行生成路线语义；V1 默认不需要 Trip route、Day route 或真实道路 polyline。

------------------------------------------------------------------------

## 3. 首页：旅行足迹地图

首页采用 **旅行足迹模式**。

但不能永久显示所有旅行的完整轨迹，否则随着旅行数量增加，北京、长三角、川渝等高频区域会变得不可读。

### 3.1 聚合规则

低缩放层级：

``` text
示例地区 ● 1

北京 ● 3

上海 ● 4
```

这里的数字表示该区域关联的旅行数量。

地图放大后：

-   区域聚合 Marker 自动拆成具体旅行。
-   如果多次旅行位置高度重叠，则继续显示旅行堆叠 Marker。
-   点击堆叠 Marker 后，通过底部卡片选择具体旅行。
-   选择某趟旅行后，可突出该 Trip 已保存地点的空间覆盖 / footprint；不显示或暗示“真实路线”。

### 3.2 重复访问同一地点

**数据不合并，显示可以聚合。**

例如：

``` text
Place: 颐和园

Visit / Item:
- 2026-03-16
- 2027-05-03
- 2029-10-12
```

地图低层级可以显示：

``` text
颐和园 ×3
```

但底层仍保留三次独立访问记录。

这为未来的"我的地点"功能预留能力，例如：

``` text
北京
去过 5 次 · 累计 17 天

颐和园     3 次
故宫       2 次
北海公园   2 次
```

该功能不属于 V1。

### 3.3 旅行状态

  状态     建议地图表现               默认行为
  -------- -------------------------- ----------------------
  计划中   空心 Marker / 必要时虚线   进入后查看整趟规划
  旅行中   强调 Marker + 当前 Day     进入后优先定位今天
  已完成   实心 Marker / 稳定足迹表现   作为个人旅行足迹沉淀

### 3.4 首页 V1 UI

地图全屏，其他 UI 作为浮层。

建议只保留：

-   顶部：App 名 / 个人入口
-   底部：`全部 / 计划中 / 已完成`
-   右下角：`＋ 新建旅行`

V1 暂不采用传统的"首页 / 行程 / 地图 / 我的"多 Tab
导航，避免削弱地图中心体验。

------------------------------------------------------------------------

## 4. 单次旅行：计划工作区

进入 Trip 后使用统一的 Trip Planning Workspace。北京城市游、示例自驾、多城市铁路旅行等均使用同一套页面结构；区别只来自地点分布，而不是页面布局或导航逻辑。

### 4.1 Trip Overview

默认同时提供地图空间视图与 Day List：

```text
┌───────────────────────┐
│ ← Trip             ··· │
│                       │
│         MAP           │
│  saved Places /       │
│  clusters             │
│                       │
├───────────────────────┤
│ 日期范围 · N 天        │
│ Day 1  地点摘要        │
│ Day 2  地点摘要        │
│ Day 3  地点摘要        │
│ 未安排 · N             │
└───────────────────────┘
```

规则：

- Overview 地图表达整趟 Trip 已保存 Place 的空间覆盖，不表达跨 Day 的行程顺序。
- Overview 不使用 `D1 / D2 / D3` Day Anchor，也不绘制 Day 之间的 route。
- Day Row 是进入某一天的主要导航。
- 点击 Overview 的 Place 可显示该 Place 在本 Trip 中出现的 Day / Item occurrence；若仅出现一次，可从 Preview 显式进入对应 Day；若多次出现，由用户选择 occurrence。
- Trip 级“简介”不是 V1 常驻 Tab；Trip 备注放在 Trip Settings / 编辑旅行中。

### 4.2 Day View

Day View 只显示当前 Day 的行程：

```text
MAP                         TIMELINE

① Place A        <------>  Item A
② Place B        <------>  Item B
③ Place C        <------>  Item C
```

- 地图默认只显示当前 Day 中带 Place 的 Item；其他 Day 默认隐藏。
- 地图 Marker 的 `①②③…` 是**显示序号**：先按 Timeline `sortOrder` 排序，再过滤出带 Place 的 Item，连续编号 1..N。
- 没有 Place 的 Item 仍完整存在于 Timeline，不产生 Marker，也不会造成地图编号缺号。
- V1 默认不画地点之间的路线；编号已经足以表达计划顺序。
- 地图自动 fit 当前 Day 的有效坐标范围，因此一天跨度 2 km 或 300 km 都使用同一规则。

### 4.3 Map ↔ Timeline 双向联动

- 点击地图 Marker：选中对应 Item，Timeline 自动滚动并展开该 Item。
- 点击 Timeline Item：若有 Place，地图轻柔聚焦并高亮对应 Marker；无 Place 时仅在 Timeline 中选中。
- Item Selected 是 Day View 的同屏状态，不是独立页面。
- 只有显式点击“详情”才进入 Item Detail。

核心原则：

> Trip 是按 Day 组织的有序旅行计划。Timeline 是主要规划视图，Map 是同一行程数据的同步空间投影；任何一个视图都不得创造另一套 canonical itinerary state 或自行推导路线。

------------------------------------------------------------------------

## 5. 新建旅行：V1 手动规划

首页点击 `＋` 后，先建立 Trip 的最小框架。

### 5.1 创建字段

```text
旅行名称
开始日期
结束日期
旅行区域：
  ○ 中国大陆
  ○ 海外
```

`旅行区域` 是 V1 的稳定 product choice：

```text
中国大陆 → mapRegion = china_mainland
海外     → mapRegion = global
```

它用于后续确定地图 / Place Provider 与坐标系，不根据手机位置或地图平移自动改变。

Trip 状态不要求用户填写，由日期自动推导。封面等字段可以后续增加。

### 5.2 添加地点 / Item

V1 支持：

1.  搜索地点
2.  在地图上选点

加入时指定所属 Day。

地点加入后立即出现在：

-   地图
-   当天时间轴

### 5.3 路线

V1 **不在 App 内维护普通地点之间的路线对象**。

用户计划的先后关系由 Day 内 `Item.sortOrder` 表达：

```text
① 颐和园
② 鼓楼
③ 什刹海
```

地图只把这些有 Place 的 Item 投影为空间位置；编号表达计划顺序，不代表道路、导航或推荐路线。

路线选择、实时交通、ETA、封路与 turn-by-turn navigation 全部交给第三方地图：

```text
中国大陆 Trip → 高德地图
海外 Trip     → Google Maps
```

当用户需要前往某个已保存 Place 时，Travel App 提供 `在地图中打开` 的 provider-aware handoff。

如果“移动”本身是需要计划、预订或记时间的事件，例如航班、火车、轮渡、机场巴士，则建模为 `Transport Item`，而不是普通地点之间的路线。

V1 不创建 `Leg` 用户功能、不显示 Leg row、不绘制路线 polyline，也不实现 RouteProvider。

## 6. 核心数据模型

核心层级：

``` text
Trip
 └── Day
      └── Item
           └── Place
```

### 6.1 Trip

代表一次完整旅行。

建议至少包含：

``` text
id
name
startDate
endDate
status
cover?       // optional
note?        // optional
days[]
```

状态：

``` text
planned
active
completed
```

### 6.2 Day

代表旅行中的一个自然日。

建议至少包含：

``` text
id
tripId
date
dayIndex
title?       // optional
note?        // optional
items[]
```

### 6.3 Item

**Item 是 Day 中统一的可排序对象。**

景点同样作为 Item 的一种类型处理。

这样避免同时维护：

``` text
Visit[]
Item[]
```

两套排序体系。

Item 类型：

  type          示例                     Place 关联
  ------------- ------------------------ --------------
  sightseeing   颐和园、曲水河       通常有
  food          餐厅、午餐计划           可有 / 可空
  hotel         酒店、民宿               通常有
  activity      演唱会、展览             通常有
  transport     飞机、火车、租车、转场   可关联起终点
  custom        其他安排                 可选

建议字段：

``` text
id
dayId
type
title
order
placeId?
timeMode
startTime?
endTime?
isFixed
note?
```

### 6.4 Place

Place 只负责 **空间信息**，而不是时间安排。

例如：

``` text
Item:
  type: hotel
  title: 示例酒店入住
  placeId: xxx
```

对应：

``` text
Place:
  name: 示例酒店
  latitude: ...
  longitude: ...
  address: ...
```

建议字段：

``` text
id
name
latitude
longitude
address?
providerPlaceId?
metadata?
```

餐厅、酒店、演唱会场馆虽然业务上属于不同 Item，但仍可以关联
Place，从而显示在地图上。

------------------------------------------------------------------------

## 7. 时间系统

Item 支持三种时间精度：

  timeMode   表现                        适用
  ---------- --------------------------- --------------------------
  none       不指定时间                  只确定当天会去
  period     上午 / 下午 / 傍晚 / 晚上   自驾、散步、吃饭
  exact      19:00--21:30                航班、火车、演唱会、预约

例如：

``` text
上午
曲水河

下午
西谷湿地

傍晚
抵达北山
```

也可以：

``` text
19:00–21:30
周深演唱会
```

### 7.1 isFixed

时间精度和"是否固定"是两个独立维度。

例如：

``` text
颐和园
上午
isFixed = false

周深演唱会
19:00
isFixed = true
```

未来 AI 调整行程时：

-   `isFixed = true`：原则上保护，不随意移动
-   `isFixed = false`：允许根据路线、时间等条件调整

典型固定 Item：

-   已购票演唱会
-   航班
-   火车
-   已预约项目
-   特定时间餐厅预约

------------------------------------------------------------------------

## 8. 为未来 AI（目标 C）预留

未来 AI 不应该生成一整段不可编辑的旅行文本。

AI 应该操作和用户相同的数据对象。

例如可以逐渐抽象出：

``` text
addItem(dayId, item)

removeItem(itemId)

moveItem(
  itemId,
  targetDayId,
  targetOrder
)

updateItemTime(
  itemId,
  ...
)

updateItemPlace(
  itemId,
  placeId
)

reorderItems(
  dayId,
  itemIds
)
```

这样：

> V1 的手动编辑能力 = 未来 AI Agent 的基础工具层。

后续从 A 发展到 C 时，不需要推翻整个产品模型。

------------------------------------------------------------------------

## 9. 当前阶段明确不做

以下能力不属于阶段 01 / V1 核心：

-   AI 自动生成行程
-   AI 自动调整行程
-   公开社区
-   陌生人社交
-   复杂多人实时协作
-   预算统计
-   天气
-   航班实时状态
-   照片游记
-   打卡体系
-   第一阶段即实现完整道路导航

------------------------------------------------------------------------

## 10. 阶段 01 已确认决策

1. 用户定位：个人优先，未来可以给朋友使用。
2. V1 平台：iOS；中国大陆 Trip 使用高德，海外 Trip 使用 Google。
3. **Canonical planning model = `Trip → Day → Ordered Items`**。
4. Timeline 是 Trip 内主要规划、浏览和编辑视图；Map 是同一计划的同步空间投影。
5. 首页仍采用旅行足迹地图，并提供紧凑的 Trip 列表 Bottom Sheet，作为旅行入口与历史浏览界面。
6. Trip Overview 显示整趟旅行已保存 Place 的空间分布 / 聚合 + Day List；不显示 Day Anchor、跨 Day 路线或 D1/D2/D3 地图序列。
7. Day View 默认只显示当前 Day 有 Place 的 Item；Marker 编号按照有 Place 的 Item 的 `sortOrder` 连续生成。
8. Place-less Item 仍完整存在于 Timeline，不生成 Marker，也不制造编号缺口。
9. Item Selected 是 Day View 的同屏 focus state；只有显式 `详情` 才进入 Item Detail。
10. 大量旅行 / Place 使用显示聚合，不合并底层 Trip / Item 数据。
11. Trip 状态分为计划中 / 旅行中 / 已完成并优先由日期推导。
12. V1 采用手动规划，未来可扩展为手动 + AI；未来 AI 操作同一 Item/Day 模型。
13. 核心实体采用 `Trip → Day → Item → Place?`；V1 不需要 Leg domain。
14. 景点、餐饮、住宿、活动、交通统一进入 Item 时间轴。
15. Place 只负责空间快照，不负责 Day、时间或顺序。
16. 时间支持 `none / period / exact`；exact 使用 `startDateTime/endDateTime`，period 仅有上午/下午/傍晚/晚上。
17. `isFixed` 与时间模式独立。
18. Map 与 Timeline 共享同一 Item selection / TripFocus，不维护两套 canonical itinerary state。
19. Route discovery、路线候选、实时交通与导航交给第三方地图；Travel App 只做 external-map handoff。
20. Place Search 是“保存用户已知地点”的输入辅助，不是景点/餐厅推荐系统。

## 11. 下一阶段

### 阶段 02：V1 页面 / 功能边界与完整用户流程

需要确定：

-   V1 到底有哪些页面
-   页面之间如何进入 / 返回
-   首页的完整状态
-   Trip Planning Workspace 的完整状态
-   Day 编辑流程
-   Item 创建 / 编辑流程
-   Place 搜索 / 选择流程
-   哪些编辑能力必须进入 V1
-   哪些能力延后
-   空状态、错误状态、删除等基础流程

阶段 02 完成后生成独立文档。

------------------------------------------------------------------------

## 12. Review 建议重点挑战的问题

后续交给其他 Agent Review 时，建议重点审查：

1.  `Trip / Day / Item / Place` 四层模型是否足够，是否存在不必要复杂度？
2.  地图缩放层级承担信息架构是否存在发现性问题？
3.  Item 统一模型能否合理覆盖跨日住宿、航班等特殊场景？
4.  `timeMode + isFixed` 是否足够支持未来 AI 调整约束？
5.  高德（中国大陆）与 Google（海外）的 Place ID、Provider 与 WGS84 / GCJ-02 坐标如何隔离，避免跨 Provider 数据污染？
6.  首页旅行聚合在旅行数量达到几十甚至上百次以后是否仍然可用？
7.  "旅行中直接进入今日 Day"的行为是否需要允许用户修改默认设置？
