# 市场同类产品与架构调研 — 改进方案

日期：2026-10-04 · 性质：参考研究（不改动任何锁定规格/代码）
状态：待用户决策 · 前置阅读：`AGENTS.md` §2/§4、`docs/agent/DEVELOPMENT_STATUS.md`

---

## 0. 结论速览

1. **本项目的核心架构选择（本地优先 SQLite + 命令层 + 派生投影 + 双地图 CRS 隔离）与 2025–26 本地优先（local-first）行业方向一致**，且比多数同类开源项目在两个点上更领先：GCJ-02/WGS84 的坐标系统标签化处理、以及"离线不是 Pro 付费功能而是默认能力"。
2. 市场验证过的最强需求缺口，全部落在 AGENTS.md §4 的 V1 禁区内：**云同步/多设备、协作、AI 生成、交通路线、离线地图包**。它们是 V2 的自然路线图，不是现在的改动项。
3. 唯一一个**不违反任何禁区、但需要用户拍板才能动**的 V1.5 候选：**行程数据导出/导入（文件级互操作）**。它是所有 V2 能力（同步/协作/备份）的共同前置，且实现成本低。
4. 有 4 项来自市场的架构方案被**否决**（与锁定基线冲突），理由见 §4。

---

## 1. 调研对象

### 1.1 商业产品（功能与架构取向）

| 产品 | 定位 | 对本项目有参考价值的点 |
|---|---|---|
| **TripIt**（SAP） | 预订整理器：从确认邮件自动导入机票/酒店/租车，合成主行程 | ① 邮件自动导入 = "摄取适配器"模式；② 日历 feed 导出（单向 iCal）；③ 离线访问是它最有名的能力 |
| **Wanderlog** | 全功能行程规划：行程+地图统一视图、拖拽排序、路线工具、预算 | ① **实时协作**是核心卖点（免费层）；② "Import from anywhere"（粘贴链接生成行程）；③ 离线地图等锁在 Pro 付费层 |
| 共同点 | 两者都把"离线完整可用"当差异化能力 | 本项目免费+离线原生，天然占位 |

来源：[Wanderlog vs TripIt 对比（wandrly.app）](https://www.wandrly.app)、[travelmorepackless 对比](https://www.travelmorepackless.com)。

### 1.2 高星开源项目（架构参考）

| 项目 | 星数（约） | 架构 | 对本项目的意义 |
|---|---|---|---|
| [**AdventureLog**](https://github.com/seanmorley15/AdventureLog) | ~3.7k★，GPL-3.0，[awesome-selfhosted 收录](https://gitea.sporada.eu) | **Django 单体后端 + Web 前端 + Docker 自托管**，OSM 地图；行程/游记/足迹地图/协作 | 与本项目同域的最强 OSS。它押"自托管服务器"，我们押"本地优先零后端"——两条路线的对照证明了我们的数据模型（Trip/Day/Item/Place）与它的领域划分同构，未来若做自托管/云同步，领域层可以直接复用 |
| [**OpenTripPlanner (OTP)**](https://github.com/opentripplanner/OpenTripPlanner) | ~2k★+，Java | **RAPTOR 多标准路由算法**，GTFS 交通数据 + OSM 街网，服务端 REST/GraphQL（[docs](https://docs.opentripplanner.org)） | 交通路线计算的黄金标准。V1 明确禁做路线；若 V2 做"站点间公共交通方案"，正确姿势是**客户端接入 OTP 实例**而非自研路由 |
| [**Organic Maps**](https://organicmaps.app) / [CoMaps](https://www.comaps.app)（其社区 fork）/ [OsmAnd](https://osmand.net) | Organic Maps 用户 600 万+，CoMaps 为 2026 年活跃 fork | **OSM 向量数据全离线**，C++ 渲染引擎，完整离线导航 | 离线地图包的天花板。但它们是**另一个引擎**，不是可嵌入的 React Native 组件——V2 若做离线地图，现实路径是深度链接互操作（我们已有 provider-aware 交接框架），不是换核 |
| AI 行程生成类（Safarny 等，2025–26 一大批） | 星数普遍低、多为 demo | Azure AI/LLM 生成行程 + 聊天机器人 | 市场噪音大、成熟度低；且 V1 禁 AI。观察即可 |

来源：各项目仓库与 [awesome-selfhosted](https://gitea.sporada.eu)、[Self-Hosted 播客推荐](https://www.edljx.com)。

### 1.3 离线同步引擎生态（与本项目架构最相关的"下一个大件"）

本项目客户端形态（**Expo SQLite 持久层 + 命令层写入 + TanStack Query 读**）正是离线同步引擎生态假设的客户端形状——这是本次调研最重要的发现：未来加云同步**不需要推翻任何现有架构**。

| 引擎 | 模型 | 对本项目的适配度 |
|---|---|---|
| [**PowerSync**](https://tanstack.com)（与 TanStack 官方合作） | 规则驱动的部分同步：后端（Postgres/Supabase/Mongo）↔ 客户端嵌入式 SQLite，写入走后端队列 | **RN 路径的首选**。社区实测注意点：同步偏"啰嗦"（一次 ~6K 行双设备同步消耗 ~145K ops） |
| **ElectricSQL** | Postgres 读路径同步（shapes/streams），写路径独立 | Postgres 中心、读重应用；与我们的写模式匹配一般 |
| **Turso / libSQL 嵌入式副本** | 本地完整库副本自动同步云根库 | 概念最简单，但 **React Native 支持历史上受限**；社区常见组合是「Turso 做后端 + PowerSync 做 RN 客户端」 |
| **RxDB** | 多存储后端 + 离线复制 | 许可（Apache 2.0）与浏览器延迟有优势，作为替代项记录 |

来源：[TanStack 官方页](https://tanstack.com)、[HN 讨论（PowerSync/ElectricSQL/Evolu）](https://news.ycombinator.com)、[RxDB 对比页](https://rxdb.info)、[Drizzle+Turso](https://orm.drizzle.team)。

---

## 2. 对照结论：我们的架构被市场验证了什么

| 本项目已有设计 | 市场证据 |
|---|---|
| 本地优先、离线完整可用（SQLite + 无后端依赖） | TripIt/Wanderlog 都把离线当差异化能力，且 Wanderlog 把它锁在付费层；AdventureLog 要自托管服务器才能用。**我们的"零配置离线"是同类中最慷慨的** |
| 拖拽重排（M6，长按拖拽 + drop 才写库） | Wanderlog 的招牌交互就是拖拽排序——交互选型被市场首肯 |
| 行程+地图统一视图（M5/M10：Overview/Day/足迹三面一体） | Wanderlog 的核心卖点即"itinerary + map in one unified view" |
| 坐标系统标签化（每个坐标带 GCJ-02/WGS84 标签，跨 CRS fail-closed） | **调研中没有任何一个同类 OSS 正确处理中国大陆坐标系问题**——多数直接用 OSM/WGS84，在中国大陆会有系统性偏移。这是本项目相对全部竞品的独特优势 |
| 命令层（业务写入必须走 Application Command） | 与 OTP/成熟 OSS 的"引擎与 UI 分离"思路同向；也是未来接同步引擎的前置（同步层可以重放命令或直接同步表） |
| 双地图提供商策略（按行程区域选 AMap/Google/MapKit） | 竞品全部单一提供商。对我们"中国大陆+海外都可用"的目标场景是必要设计 |

## 3. 改进方案

### 3.1 V1.5 候选（不违反禁区、成本低、建议用户拍板）

**行程数据导出/导入（文件级互操作）**

- **为什么是它**：① 这是全部 V2 能力（备份/云同步/协作）的共同前置——先有"行程 = 可序列化文档"，才有"行程可以被同步/分享"；② TripIt 的 iCal 导出、Wanderlog 的任意导入说明这是用户硬需求；③ AGENTS.md §4 禁区清单里**没有**导入/导出；④ 成本低：我们已有完整的领域类型 + 严格 payload 校验，序列化/反序列化 + 一条 `importTrip()` 命令即可，天然走现有命令层。
- **建议形状**：导出 = 单个 Trip → JSON 文件（含 Trip/Days/Items/Places，坐标带 CRS 标签原样携带）；导入 = 校验 + 生成新 Trip（ID 全部重新生成，避免冲突）。**不做**邮件解析（需要后端，禁区）。
- **规模**：1–2 个 bounded task（导出命令 + 导入命令 + 测试）。

### 3.2 V2 路线图（按依赖顺序建议，全部需要届时立项）

```text
① 数据可携带（V1.5，见 3.1）
     ↓ 是同步/备份的公共前置
② 云同步 / 多设备
     推荐：PowerSync +（Supabase 或自托管 Postgres）
     我们已满足其客户端假设；写入已收敛在命令层，接同步只需在后端
     建表 + 配置同步规则；匿名→账号的迁移路径需要届时设计
     ↓ 多设备是协作的前置
③ 实时协作（Wanderlog 的核心卖点）
     复用 ② 的同步通道 + 行程级权限模型
     ↓
④ 预订导入（TripIt 模式）
     需要一个轻后端做邮件解析——③ 的账号/后端此时已存在
     ↓
⑤ AI 行程生成（Wanderlog "Import from anywhere" 的 AI 版）
     建议以 MCP 工具/服务端生成 + 命令层导入落地，与 ① 的导入复用校验
     ↓
⑥ 交通路线（OTP 接入）与 ⑦ 离线地图包（OSM 向量或深度链接 Organic Maps）
     两者都是大工程，且 AGENTS.md 禁区届时需用户明确解除
```

### 3.3 低成本架构卫生项（V1 内、不改行为、不破规格）

1. **WAL checkpoint 习惯**：设备取证与未来备份都要"连 WAL 一起拷"，建议在合适的时点（如冷启动完成迁移后）执行一次 `wal_checkpoint(TRUNCATE)`，让主文件自足，简化备份与导出。属实现细节，1 个 bounded task。
2. **导出所需的序列化边界**：若采纳 3.1，顺手把 `payload_json`/CRS 的序列化规则收敛到一个模块（现在散在仓储映射里），避免导出/导入各写一份。

### 3.4 否决项（来自市场、但与锁定基线冲突）

| 来自市场的方案 | 否决理由 |
|---|---|
| 换 Turso/libSQL 替换 Expo SQLite | AGENTS.md 锁定 Expo SQLite 为持久层；且 Turso 的 RN 支持历史受限。同步需求用 PowerSync 在现有 SQLite 之上满足 |
| 引入 CommandBus/DI/插件框架（Home Assistant 式） | AGENTS.md §4 明确禁止；现有命令层已覆盖需求 |
| 换 OSM 离线引擎（Organic Maps 核） | 禁区（offline map packages）+ 换核会推翻 M4/M10 的双提供商证据链；正确姿势是深度链接互操作 |
| 现在就做云同步/协作/AI/路线 | 全部在 §4 禁区清单内；V2 届时立项 |

---

## 4. 决策请求

需要用户拍板的只有一件事：**是否把「行程导出/导入」立项为 V1.5 的 1–2 个 bounded task**（3.1）。其余均为记录性结论或 V2 届时再议。

---

## 附：来源索引

- [AdventureLog 仓库](https://github.com/seanmorley15/AdventureLog) / [Railway 部署页](https://railway.com) / [self-hosted 评述](https://www.edljx.com)
- [OpenTripPlanner 仓库](https://github.com/opentripplanner/opentripplanner) / [官方文档](https://docs.opentripplanner.org)
- [Organic Maps](https://organicmaps.app) / [CoMaps](https://www.comaps.app) / [OsmAnd 对比评述](https://cutoffthespigot.com) / [欧洲 FOSS 应用评述](https://www.europeanstack.io)
- [Wanderlog vs TripIt（wandrly.app)](https://www.wandrly.app) / [对比评述](https://www.travelmorepackless.com)
- [PowerSync × TanStack](https://tanstack.com) / [HN：local-first 同步引擎讨论](https://news.ycombinator.com) / [RxDB](https://rxdb.info) / [Drizzle × Turso](https://orm.drizzle.team)
- 星数为检索时点的约数，采用前建议以 GitHub 实时数据复核。
