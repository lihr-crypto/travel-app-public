# 旅行计划 App｜阶段 02 方案定稿

> V1 页面边界、完整用户流程、交互状态与数据模型修订
>
> 状态：阶段性设计基线（后续阶段允许在 Review 后修订）
>
> 前置文档：`travel-app-stage-01-product-foundation.md`
>
> **Stage 06 地图范围修订（2026-09-11）：** V1 首发平台为 iOS；中国大陆 Trip 使用高德，海外 Trip 使用 Google。
> **Product realignment amendment (2026-09-11, user-approved):** The V1 product goal has been re-confirmed as **personal travel-plan storage organized by Day and ordered Items**. Home remains map-centered as a travel-footprint/Trip-entry surface. Inside a Trip, the **Timeline / ordered itinerary is the primary planning and browsing view**, while the map is a synchronized **spatial projection** of saved Places. The app does **not** plan routes, choose route alternatives, recommend places, or replace AMap / Google Maps / Xiaohongshu-style discovery. Any earlier wording that makes Trip planning itself “map-first”, treats a Trip/Day as a route, requires Day anchors/routes, or implies automatic routing is superseded by this amendment. No M0 rollback is required.
> **User-approved correction (2026-09-16):** The current DayPeriod values and migration, direct shared Item editor, custom category label, and native time-picker hierarchy supersede conflicting legacy wording below. See `00-PRODUCT-REALIGNMENT-AMENDMENT.md` §9–10.

---

## 0. 阶段 02 目标

阶段 01 已确定 personal/local-first 定位、Trip → Day → Item → Place 基础模型，以及 V1 先做手动规划、最终扩展到 AI 辅助规划。2026-09-11 产品校正进一步明确：Trip 内以 Ordered Timeline 为计划核心，地图为空间辅助视图。

阶段 02 的目标不是继续扩功能，而是回答：

1. V1 到底有哪些页面与交互状态；
2. 用户从创建旅行到完成编排的完整流程是否闭环；
3. Day、Item、Place 与空间视图之间如何编辑与联动；
4. 哪些功能必须做，哪些必须延后；
5. Stage 01 的基础数据模型需要哪些最小修订，才能支撑真实旅行场景和未来 AI。

核心原则保持不变：

> 产品是“按 Day 组织的有序旅行计划存储器 + 同步空间地图”。Home 仍以地图为主；Trip 内 Timeline 是主要规划视图，Map 是辅助空间视图。

---

# 1. V1 页面边界

V1 不设计传统底部 Tab Bar。

核心环境：

```text
Home Map
   ↕
Trip Planning Workspace
```

### ① Home Map｜我的旅行地图

职责：旅行足迹、Trip 聚合、进入 Trip、创建 Trip、继续今天行程。Home 仍然 map-centered。

### ② Trip Overview｜旅行总览

职责：

- 上半地图：整趟 Trip 已保存 Place 的空间分布 / 聚合；
- 下半 Day List：按 Day 浏览计划摘要，是进入 Day 的主要导航；
- 不表达 Trip route，不使用 Day anchor，不要求“每日目的地”字段；
- 地图 Place 点击用于空间导航：Preview occurrence，再显式进入对应 Day。

### ③ Day View｜单日行程

这是 Trip 内最核心的计划工作状态。

- Timeline 显示当前 Day 的完整 Ordered Items；
- Map 只显示当前 Day 中带 Place 的 Items；
- Marker `①②③…` 按 Timeline 顺序过滤带 Place 项后连续编号；
- 其他 Day 默认不显示；
- 无 Place 的 Item 仍保留在 Timeline；
- V1 默认不画路线，不让用户选择路线。

### ④ Item Selected｜同屏选中状态

不是独立页面。点击 Marker 或 Timeline Item 后，在当前 Day View 内高亮 Marker、滚动并展开 Item。显式点击“详情”才进入 Item Detail。

### ⑤ Place Search / Picker｜地点输入辅助

定位是“保存用户已经知道要去的地点”，不是发现/推荐系统。支持 provider POI 搜索、地图选点和自定义 Place。

### ⑥ Item Detail / Edit｜项目详情

统一骨架 + 类型专属字段；高频修改通过 Quick Edit，复杂字段进入 Detail。

### ⑦ Trip Settings｜旅行设置

旅行名称、起止日期、备注、区域/provider 选择、删除 Trip。Trip 备注不占用 Overview 常驻“简介”Tab。

---

# 2. 页面导航结构

```text
App
│
├─ Home Map
│   ├─ Trip Marker / Cluster -> Trip Preview -> Trip Overview
│   ├─ + 新建旅行 -> Create Trip
│   └─ Active Trip -> Continue Today -> Day View
│
└─ Trip Planning Workspace
    ├─ Trip Overview
    │    ├─ Day Row -> Day View
    │    └─ Place -> occurrence Preview -> explicit Day entry
    │
    ├─ Day View
    │    ├─ Marker <-> Timeline Item selection
    │    ├─ + Add Item
    │    ├─ Quick Edit
    │    └─ Item Detail
    │
    ├─ Unscheduled
    └─ Trip Settings
```

返回原则：

- Item Detail → 回到原 Day View / selected state；
- Place Search 取消 → 回到触发前的 Day / Unscheduled；
- Day View → Trip Overview；
- Trip Overview → Home Map；
- Item Selected 不改变页面层级，只改变当前 Day View 的 focus state。

---

# 3. Home Map 完整状态

## 3.1 首次使用

无 Trip：

```text
[地图]

还没有旅行
从第一段旅程开始记录你的旅行地图

＋ 新建旅行
```

不额外制作教程页。

---

## 3.2 有计划中旅行

低缩放时继续使用区域聚合。

例如：

```text
示例地区 ●1
北京     ●3
上海     ●4
```

Marker 数字表示关联 Trip 数量，而不是 Place 数量。

---

## 3.3 多次前往同一地区

数据不合并，地图显示可以聚合。

点击聚合 Marker：

```text
北京 · 3 次旅行

2026 国庆北京
2027 春季北京
2029 秋季北京
```

选择具体 Trip 后可突出该 Trip 已保存地点的空间覆盖；不显示或暗示“真实路线”。

---

## 3.4 Trip Preview

第一次点击 Marker 只做选择，不直接跳页面：

```text
┌──────────────────────┐
│ 示例秋季自驾      │
│ 3/10–3/16 · 7天       │
│ 计划中                │
│                      │
│      查看旅行 →       │
└──────────────────────┘
```

与 Stage 01 的“首次点击只选择”原则保持一致。

---

## 3.5 旅行进行中

Home 仍然保持 Travel Footprint Map，不自动强制跳 Trip。

额外提供：

```text
正在旅行
示例秋季自驾
Day 3 · 北山 · 林间镇 · 南湾

继续今天的行程 →
```

点击后：

```text
Trip Map → Today Day
```

---

# 4. Trip Overview + Day Timeline

## 4.1 Trip Overview

```text
[ Trip-wide saved Place distribution / clusters ]

日期范围 · N 天
Day 1  地点摘要
Day 2  地点摘要
Day 3  地点摘要
未安排 · N
```

- 地图负责“这趟旅行保存了哪些地点、空间上分布在哪里”。
- Day List 负责“每天怎么组织”，并作为进入 Day 的主要导航。
- 不使用 `D1/D2/...` 地图 anchor，不绘制跨 Day route。
- Day 摘要由 Item 派生，不新增 `Day.destination`：可以显示 `颐和园 · 鼓楼 · 什刹海`、`北山 · 林间镇 · 南湾`，地点过多时使用 `A · B +3` 等紧凑形式。

## 4.2 Day 切换

- Day View 内左右滑动 Day Header 切相邻 Day；
- 点击 Day 标题打开 Day Jump；
- 不常驻横向日期条。

## 4.3 Timeline 基础结构

```text
Day 3 · 3/13

08:00  ● 北山早餐
09:30  ● 森民村
下午   ● 林间镇国家森林公园
18:00  ● 南湾晚餐
20:30  🏨 南湾民宿

＋ 添加行程
```

Timeline 是 **Ordered Itinerary**。`sortOrder` 是持久化顺序真相；创建 Item 或修改时间字段时，按时间时段在同一 exclusive transaction 中重新计算连续 `sortOrder`。时段值为上午、中午、下午、晚上；精确时间分桶为 05:00–10:59 上午、11:00–13:59 中午、14:00–17:59 下午、18:00–04:59 晚上。精确时间在同组按 `HH:mm` 排序；相同时间和仅设时段的 Item 保持稳定相对顺序；无时间排在最后。完整持久化与迁移规则见 `00-PRODUCT-REALIGNMENT-AMENDMENT.md` §8–9。无 Place 的 Item 仍可参与排序和时间规划。

## 4.4 Day Map

- 只显示当前 Day 有 Place 的 Item；
- 先按 Item `sortOrder` 排序、过滤带 Place 项，再生成连续显示序号 `①②③…`；
- Marker 与 Timeline 双向选择；
- 默认不显示其他 Day；
- 默认不显示地点间路线 / polyline；
- camera fit 当前 Day 的地点范围；一天跨度大或小都使用同一规则。

## 4.5 Item Selected

点击 Marker 或 Timeline Item 只进入同屏 selected state：

```text
Day View
  -> Item Selected (same screen)
       -> 编辑 (直接进入共享 Item 编辑器)
       -> 在地图中打开
```

---

# 5. Item 添加流程

## 5.1 渐进式添加（已确认方案 C）

核心原则：

> 先快速加入，再逐步补信息。

点击：

```text
＋ 添加行程
```

打开：

```text
添加行程

🔍 搜索地点或行程

景点  餐饮  酒店
活动  交通  其他

最近搜索
```

既可以直接搜索“颐和园”，也可以先进入酒店、交通、自定义类型。

---

## 5.2 搜索结果确认

搜索结果列表和地图 Marker 双向联动。

用户点某个搜索结果后，先进入轻确认态：

```text
[地图 / Marker]

西谷湿地景区
示例自治区示例市

＋ 添加到行程
```

只有点击“添加到行程”才真正创建 Item。

目的：避免用户只是查看相似 POI 时误创建大量 Item。

---

## 5.3 创建后 Quick Edit

创建成功后立即出现轻量编辑 Sheet：

```text
西谷湿地

日期   Day 2 · 3/11
时间   下午
固定   ○
备注   添加备注

查看完整详情 >
```

用户可以完全不填，关闭即可。

---

# 6. Item 时间系统

保持 Stage 01 的三档时间精度：

```text
none
period
exact
```

UI：

```text
时间

○ 不指定

○ 时段
  上午
  中午
  下午
  晚上

○ 具体时间
  14:00 → 16:30
```

显示示例：

```text
● 颐和园
```

```text
下午
● 颐和园
```

```text
14:00–16:30
● 颐和园
```

不要求用户在规划初期制造虚假的精确时间。

---

# 7. 固定 Item

底层字段继续使用：

```text
isFixed: boolean
```

UI 不直接只写“固定”，而使用：

```text
🔒 固定行程
```

解释：

> 调整行程时保持日期和时间不变。

未来 AI 调整时：

- `isFixed=true`：默认不可移动；
- `isFixed=false`：未来 AI 可根据顺序、时间、用户指令调整。

---

# 8. Item 排序与跨 Day 移动

## 8.1 Day 内排序

V1 支持长按拖拽：

```text
● 曲水河
● 西谷湿地 ☰
● 北山
```

排序完成后：

- Timeline 顺序更新；
- Marker 编号更新；
- Timeline 顺序与 Marker 编号同步更新。

---

## 8.2 跨 Day 移动

V1 不要求跨 Day 长距离拖拽。

Item 菜单：

```text
编辑
移动到其他日期
复制
删除
```

选择目标 Day 后默认：

```text
放到：
○ 最前
● 最后
```

之后在目标 Day 内再拖拽微调。

跨 Day 拖拽可列为后续增强项。

---

# 9. 未安排行程池

V1 纳入。

定义：

> 已经属于本次 Trip，但暂时还不知道放在哪一天。

底层：

```text
item.dayId = null
```

不创建 Day 0。

示例：

```text
未安排 · 4

☰ 示例林地
☰ 黑石口日落
☰ 和平村
☰ 南湾口岸

＋ 添加行程
```

所有带 Place 的未安排 Item 同时显示在地图上。

---

## 9.1 未安排 ≠ 收藏

严格区分：

```text
未安排
= 属于某个 Trip
= 只是还没定 Day
```

```text
收藏 / Wishlist
= 未来可能想去
= 不一定属于任何 Trip
```

V1 不做全局收藏系统。

---

# 10. Place Search 与地图选点

## 10.1 Place Search

搜索结果必须同时提供：

- 名称；
- 地址/区域；
- 地图 Marker；
- provider Place ID（若有）；
- 经纬度。

结果列表与 Marker 双向高亮。

---

## 10.2 地图选点

V1 必须支持，作为 POI 搜索失败时的兜底。

原因包括：

- 观景点；
- 小众道路节点；
- 民宿；
- 自驾停车点；
- 摄影点；
- 地图供应商没有收录的位置。

交互：

```text
移动地图选择位置

      +
      ●

[使用此位置]
```

确认后输入：

```text
名称 *
地址（可选）
```

创建：

```text
Place
id
name
latitude
longitude
address?
provider?
providerPlaceId?
```

`providerPlaceId` 可以为 `null`。

---

# 11. Item Detail｜统一骨架 + 类型专属字段

## 11.1 基础字段

所有 Item 共用：

```text
id
type
title
tripId
dayId?
order?

placeId?

timeMode
startDateTime?
endDateTime?
isFixed

note?
```

---

## 11.2 普通类型

`sightseeing / food / activity / custom` V1 尽量使用统一字段。

不提前为餐厅预约号、门票号、活动票务等制造大量专用字段。

额外信息先放 `note`。

---

## 11.3 Hotel

Hotel 是**一个可跨日 Item**，不是入住/退房两个 Item。

推荐字段：

```text
hotelCheckInDateTime?
hotelCheckOutDateTime?
```

或在实现阶段映射到通用 `startDateTime/endDateTime` 并用类型语义解释。

示例：

```text
🏨 北山酒店
3/11 19:00 → 3/12 08:30
1晚
```

主归属 Day：入住日。

后续 Day 不复制 Item，而显示 contextual accommodation card。

例如 Day 3 顶部：

```text
🏨 今早住宿 · 北山酒店
退房 08:30
```

连续 3 晚仍只有一个 Item。

---

## 11.4 Transport Item

只用于**本身是需要计划、预订、记住时间的交通事件**：

- 航班；
- 火车；
- 长途巴士；
- 轮渡；
- 取/还租车等明确事件。

建议字段：

```text
transportMode
originPlaceId?
destinationPlaceId?
departureDateTime?
arrivalDateTime?
serviceNumber?
```

V1 不做：

- PNR；
- 舱位；
- 座位号；
- 航站楼复杂模型；
- 票价；
- 航空公司完整票务结构。

避免产品过早变成票务管理器。

---

# 12. 普通移动 / Leg 的 V1 定位

普通相邻 Item 的移动关系**不建模为 V1 domain entity**。

用户计划语义已经由 Item 顺序表达：

```text
Item A
  ↓ next in plan
Item B
```

最终规则：

- V1 不创建 `Leg` table / domain type / repository / reconciler；
- 不要求 Timeline Leg row；
- 不绘制地图连接线 / route geometry；
- 不要求用户填写 mode / duration / distance；
- 不实现 RouteProvider；
- 路线候选、实时导航、交通信息交给高德 / Google Maps；
- 若移动本身是需要计划/预订/记时间的事件，使用 `Transport Item`。

如果当前本地开发仓库已经在 disposable 的 Migration 001 中加入了 `legs`，应在 M0 exit 前修改初始 migration 并重建开发数据库。只有在存在不可丢弃的兼容数据时，才允许保留旧表作为 private compatibility seam；它不属于 canonical V1 specification。

# 13. 跨日 Item

不取消所有 Item 的 `dayId`。

规则：

- `dayId` 仍表示主归属 Day；
- 允许 `startDateTime/endDateTime` 跨越日期；
- Day 查询时同时处理“主归属当前 Day”和“跨越当前 Day”的 Item。

典型：

- Hotel；
- 夜班航班；
- 夜班火车；
- 跨午夜活动。

避免为了少数跨日场景将所有 Item 改造成复杂 Date Range 模型。

---

# 14. 创建 Trip

## 14.1 创建表单

V1 最小输入：

```text
旅行名称
开始日期
结束日期
旅行区域： 中国大陆 / 海外
```

映射：

```text
中国大陆 → mapRegion = china_mainland
海外     → mapRegion = global
```

状态不要求用户填写，由日期自动计算。`mapRegion` 是持久化 product state；V1 不支持一个 Trip 内动态混用两套地图 provider。

## 14.2 Trip 展示状态

建议由日期自动计算：

```text
startDate > today
→ planned

startDate ≤ today ≤ endDate
→ active

endDate < today
→ completed
```

后续若需要归档/取消，再增加独立 user state，不与日期状态混在一起。

---

## 14.3 创建完成

```text
创建 Trip
   ↓
自动派生 Day 1 ... Day N
   ↓
直接进入 Trip Planning Workspace / Trip Overview
```

不返回 Home 再重新进入。

---

# 15. Trip 日期修改规则

这是 V1 必须定义清楚的数据安全规则。

## 15.1 延长旅行

自动新增 Day。

已有 Item 不受影响。

---

## 15.2 整体平移日期

例如：

```text
3/10–3/16
↓
3/11–3/17
```

提示：

```text
是否同时移动已安排的行程？

● 整体顺延 1 天
○ 保持原日期
```

默认推荐整体平移。

---

## 15.3 缩短旅行

如果被删除日期中存在 Item：

```text
3/16 有 2 个行程

缩短后这些行程会移到「未安排」，不会删除。
```

统一原则：

> 修改 Trip 日期永远不能静默删除 Item。

超出范围的普通 Item → `dayId = null`。

---

## 15.4 跨日 Item 超界

例如酒店退房日超出 Trip endDate：

不自动篡改用户时间。

产生 Validation Issue：

```text
⚠ 超出旅行日期
```

用户选择：

- 修改 Item 时间；
- 调整 Trip 日期；
- 移至未安排。

---

# 16. Validation Issue

V1 不做复杂自动冲突解决，但数据层要能够统一表达 Warning。

建议：

```text
ValidationIssue
id
tripId
itemId?
type
severity
message
```

首批可覆盖：

```text
ITEM_OUTSIDE_TRIP_RANGE
END_BEFORE_START
FIXED_ITEM_TIME_CONFLICT
HOTEL_CHECKOUT_BEFORE_CHECKIN
```

V1 可以只展示警告，不自动修改。

---

# 17. 删除规则

## 17.1 Item

删除后不二次弹窗：

```text
已删除「西谷湿地」     撤销
```

使用短时 Undo。

---

## 17.2 Day

V1 **不支持单独删除 Day**。

Day 完全由 Trip 日期范围派生。

---

## 17.3 Trip

高破坏操作，需要确认：

```text
删除「示例秋季自驾」？

将删除：
7 个旅行日
24 个行程项目
相关路线与备注

此操作无法撤销。
```

V1 不做回收站。

---

# 18. 重复地点规则

允许重复添加同一 Place。

原因：

- 同一天上午/晚上可能重复前往；
- 不同 Day 可以重复访问；
- 多次旅行更不能合并原始访问记录。

可轻提示：

```text
这个地点已在本次旅行中添加过
```

但不能阻止添加。

继续遵守：

> 数据不合并，显示可以聚合。

---

# 19. 空状态与异常流程

## 19.1 空 Day

```text
Day 2 还没有行程

＋ 添加行程
```

---

## 19.2 Place Search 无结果

```text
没有找到「拉莫线观景台」

换个关键词，或
[在地图上选点]
```

---

## 19.3 网络异常

```text
地点搜索暂时不可用

[重新加载]

仍然可以：
[在地图上选点]
```

---

## 19.4 Provider POI 后续失效

本地 Place 必须保存必要快照：

```text
id
name
latitude
longitude
address?
provider?
providerPlaceId?
metadata?
```

不能只保存 providerPlaceId。

这样供应商记录变化、POI 下架、未来切换地图供应商时，历史旅行仍然可以显示。

---

# 20. V1 Must Have

以下是第一版闭环必须实现的能力：

## Home

- Travel Footprint Map；
- Trip 聚合 Marker；
- Trip Preview Card；
- planned / active / completed 视觉区分；
- 新建 Trip；
- active Trip “继续今天行程”。

## Trip Planning Workspace

- Trip Overview：Trip-wide Place 分布 / cluster + Day List；
- Day View：当前 Day Place Marker + Ordered Timeline；
- Day 左右滑 / Day Jump；
- Bottom Sheet collapsed / half / expanded；
- Marker ↔ Timeline 双向选择；
- Item Selected 同屏状态；
- 不使用 Day anchor / Trip route / Day route。

## Item

- 添加；
- 编辑；
- 删除 + Undo；
- Day 内排序；
- 跨 Day 移动；
- 未安排；
- none / period / exact 时间；
- isFixed；
- note；
- custom Item；
- Hotel 跨日；
- Transport Item 基础字段。

## Place

- POI 搜索；
- 搜索结果 ↔ Marker 联动；
- 地图选点；
- 自定义 Place；
- provider 解耦存储。

## Ordinary Movement / Leg

- 不要求用户可见 Leg 功能；
- 若保留内部 Leg，仅作为 adjacency seam；
- V1 不要求 Leg row / polyline / duration-distance 编辑。

## Trip 生命周期

- 创建；
- 自动 Day；
- 日期修改；
- 缩短时移入未安排；
- 删除 Trip；
- 基础 validation warning。

---

# 21. V1 明确延后

以下能力不是 V1 开发阻塞项：

## 路线能力

- 高德/地图路线 API 自动驾车路径；
- 自动时间/距离；
- 多交通模式复杂导航；
- 实时路况；
- 封路信息。

## AI

- 自动生成旅行；
- 自动编排未安排 Item；
- 自动优化路线；
- 自动时间冲突解决；
- Agent 自主修改行程。

V1 的 `Item / Place / Transport Item` 与 provider abstraction 应为未来能力留出接口，但不得为了未来 Route API 预构建当前没有用户价值的路线 UI。

## 旅行管理增强

- Wishlist / 收藏；
- 全局 Place 库；
- 预算；
- 天气；
- 航班实时状态；
- 票务管理；
- 附件/订单识别；
- 行李清单；
- 照片旅行日志；
- 打卡；
- 游戏化。

## 社交

- 公共社区；
- 陌生人关注；
- 旅行攻略 Feed；
- 复杂多人实时协作。

---

# 22. Stage 02 最终数据关系

```text
Trip
│
├─ Day[]
│   └─ Ordered Item[]
│        └─ Place?
│
├─ Unscheduled Item[]   // Item.dayId = null
│    └─ Place?
│
└─ derived ValidationIssue[]
```

其中：

- Day：日期容器，由 Trip 日期范围派生并持久化 stable ID；
- Item：用户真正安排的事情，`sortOrder` 是顺序真相；
- Place：可选空间快照；
- Unscheduled Item：属于 Trip 但暂无 Day；
- ValidationIssue：派生的冲突/异常提示，不持久化。

普通 Item 之间不需要额外 Leg entity。Transport Item 用于真正需要计划/预订/记时间的移动事件。

# 23. 推荐实体草案

## Trip

```text
Trip
id
name
startDate
endDate
mapRegion  // china_mainland | global
note?
createdAt
updatedAt
```

状态优先通过日期计算。

---

## Day

```text
Day
id
tripId
date
dayIndex
title?
note?
```

Day 可以是数据库实体，也可以在技术设计阶段进一步评估是否由日期动态派生；Stage 02 暂保持显式实体，便于 Day note/title 和稳定 ID。

---

## Item

```text
Item
id
tripId
dayId?

type
title
order?

placeId?

timeMode
startDateTime?
endDateTime?
isFixed

note?

createdAt
updatedAt
```

类型专属字段后续可采用 subtype payload 或 nullable columns，Stage 03 再决定。

---

## Place

```text
Place
id
name
latitude
longitude
address?

provider?
providerPlaceId?
metadata?
```

---

## Optional Internal Leg (engineering review only)

V1 **没有 Leg entity**。

不要为普通相邻 Item 创建 adjacency row、mode、duration、distance 或 geometry。Item 顺序本身已经表达“下一站”。

未来如果真实使用证据证明需要在 Travel App 内保存某段移动元数据，应作为 V1.x / V2 的独立产品提案重新设计，而不是预建。

# 24. 完整用户 Flow Review

## Flow A｜第一次规划一趟旅行

```text
打开 App
 ↓
Home Map 空状态
 ↓
＋ 新建旅行
 ↓
输入名称 + 日期
 ↓
自动创建 Day
 ↓
进入 Trip Planning Workspace / Day 1
 ↓
＋ 添加行程
 ↓
搜索地点
 ↓
确认 POI
 ↓
创建 Item
 ↓
Quick Edit
 ↓
继续添加
 ↓
拖拽排序

```

闭环成立。

---

## Flow B｜先收集想去的地方

```text
Trip Planning Workspace
 ↓
Day Jump
 ↓
未安排
 ↓
搜索 / 添加多个地点
 ↓
Unscheduled Pool
 ↓
移动到 Day
 ↓
Day 内排序
```

闭环成立。

---

## Flow C｜旅行整体改期

```text
Trip Settings
 ↓
修改日期
 ↓
选择整体顺延
 ↓
Item 日期同步调整
 ↓
重新验证跨日 Item
```

闭环成立。

---

## Flow D｜缩短行程

```text
修改 Trip endDate
 ↓
系统检测被移除 Day 有 Item
 ↓
提示不会删除
 ↓
Item → 未安排
 ↓
用户重新安排/删除
```

闭环成立。

---

## Flow E｜旅行中使用

```text
打开 App
 ↓
Home Map
 ↓
正在旅行 Card
 ↓
继续今天的行程
 ↓
Day View / Today
 ↓
Marker ↔ Timeline
 ↓
临时修改时间/删除/添加
```

闭环成立。

---

## Flow F｜地图搜不到地点

```text
搜索无结果
 ↓
地图选点
 ↓
输入自定义名称
 ↓
创建 Place
 ↓
创建 Item
```

闭环成立。

---

# 25. Stage 02 设计结论

截至本阶段，V1 已形成完整产品闭环，并确认以下关键决策：

1. Home Map 与 Trip Planning Workspace 是两个核心环境；Home map-centered，Trip planning-centered；
2. Day Timeline 不做独立 top-level route，而是 Trip Planning Workspace 中的主要规划 Sheet / view；
3. Day 使用“滑动相邻 Day + 点击标题快速跳转”的组合方式；
4. 添加 Item 使用渐进式流程；
5. POI 选择后需轻确认，再真正创建 Item；
6. Quick Edit 处理高频修改，Detail 处理复杂字段；
7. 未安排行程池进入 V1，`dayId` 允许为 null；
8. 未安排与全局收藏严格分离；
9. Hotel 使用一个跨日 Item，不复制入住/退房 Item；
10. Transport Event 仍是 Item；普通 Item 间移动不要求用户在 V1 中维护路线对象；
11. V1 不包含 Leg domain / Leg UI / route polyline / RouteProvider；普通相邻 Item 的顺序由 `sortOrder` 表达；
12. 路线候选、距离/耗时、实时交通与导航交给外部地图；计划中的航班/火车等使用 Transport Item。
13. Day 不允许单独删除，由 Trip 日期范围控制；
14. Trip 日期缩短时绝不静默删除 Item；
15. 超界/冲突使用 Validation Issue，而不是自动篡改用户数据；
16. Trip planned / active / completed 优先通过日期自动计算；
17. Place 必须保存本地名称与坐标，不依赖 providerPlaceId；
18. 同一 Place 允许重复添加；
19. V1 不做 Wishlist、路线导航、AI、票务管理、预算天气等扩展能力；
20. V1 的人工编辑能力继续作为未来 AI Agent 的基础工具层。

---

# 26. Stage 03 建议范围

下一阶段建议进入：

> **Stage 03｜信息架构细化 + 页面 Wireframe + 组件系统**

重点包括：

1. Home Map 具体视觉层级；
2. Trip Planning Workspace 的 Overview / Day / Bottom Sheet 尺寸与手势；
3. Marker、聚合 Marker、Item Marker 视觉系统；
4. Day Timeline 组件结构；
5. Item Card / Hotel Context Card；
6. Add Item / Search / Quick Edit Wireframe；
7. 空状态、Warning、Undo 等反馈组件；
8. 移动端单手操作与地图手势冲突规则；
9. 输出可供前端开发/设计 Agent 继续实现的页面规格。

在 Stage 03 完成之前，不建议直接开始大规模编码，以免页面结构在实现中反复返工。
