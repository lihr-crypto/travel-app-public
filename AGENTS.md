# Travel App — Agent Instructions

## 任务与权威

- 从当前 Git 仓库根目录执行开发和验证。
- 宽泛产品与架构设计已结束。只有明确新需求或实现证据暴露阻塞时才重新讨论对应决策。
- “继续/继续开发/next”时，读取 `docs/agent/DEVELOPMENT_STATUS.md` 和
  `docs/agent/DEVELOPMENT_WORKFLOW.md`，核对代码/Git/现有证据，执行一个 `next_task`，验证、更新状态并停止。
  用户明确给出其他任务或批次时按该范围执行，不要求粘贴旧任务提示词。
- 当前状态入口只保留现状；历史记录没有随公开仓库发布。
- `docs/specs/00-PRODUCT-REALIGNMENT-AMENDMENT.md` 覆盖冲突的产品/UI措辞；保留 Stage01–03 非冲突语义，
  采用修订 Stage04–05、Stage06 修正及对应 Review Decision Record。延期/拒绝的建议不扩展范围。
  应用该优先级后仍有实质冲突，报告具体原句并停在受影响步骤，继续独立工作。

## 实现约束

- 原生 iOS 使用 React Native + Expo + TypeScript、Expo Router、Expo SQLite。
- 规范行程为 `Trip → Day → Ordered Items`。Timeline 与地图共享 `TripFocus`；地图只是 Place 投影，
  不创建规范行程。`Unscheduled = Item.dayId === null`，`sortOrder` 为权威顺序。
- 开启 SQLite 外键；语义写入使用 exclusive transaction 和 Application Commands；UI 不执行原始 SQL。
  TanStack Query 只管理读取/缓存；Zustand 只保留交互状态，不镜像业务集合。
- 缩短旅行不得静默删除 Item。日期策略是 `shiftItems | keepCalendarDates`。
  精确时间使用 `startDateTime/endDateTime`；`DayPeriod = morning | noon | afternoon | night`，
  标签与旧值迁移按 Product Realignment Amendment §9。
- 用户可见删除须有最小 Undo/restore。Footprint 是已保存的行程历史，不代表逐 Item 实际到访。

## 地图与地点

- 每趟 Trip 固定 `mapRegion = china_mainland | global`；Amendment §14 覆盖 §11–13 的混合区域/Apple规划。
- 大陆使用 AMap map/search 与原始 GCJ-02；海外使用 Google map/search 与原始 WGS84。
  新建/更改 Place 拒绝来源/CRS不匹配与 Apple 来源快照；新 Trip 必须选区域。
- 历史混合 Item 留在 Timeline；地图仅绘制匹配的原始来源并披露省略的历史图钉，不删除、移动、拆分或重写旧行。
- Item focus 不切换 renderer。AMap 隐私/配置由整个区域 Trip shell 负责，不重复增加内部许可门。
- Home 是跨 Trip 的历史 Footprint；其展示适配器不为新 Trip 提供 Apple 搜索。
- Day 图钉使用 Item occurrence ID；无 Place 的 Item 不产生编号空洞。
  外部导航使用保存的来源/原生 CRS，不实现 App 内导航。

## 已批准扩展与范围

- 原始 V1 平台基线为 iOS。用户于 2026-10-13 批准 `web/` 的 Web/PWA、D1 云协作、成员权限、离线队列、
  单趟文件，以及原生文件导入/更新/恢复。它覆盖旧 V1 的 backend/auth/cloud/collaboration 排除项，
  仅限当前已批准实现；原生 App 不新增实时云同步，旧本机库/备份不自动上传。
- 仍排除 AI 行程生成、社交、自动路径/交通/逐向导航、离线地图包、全局 Wishlist/Place库、
  Leg/RouteProvider/路线折线、普通移动元数据、CQRS/event sourcing/CommandBus/DI/plugin framework。
  M8 保留/退役，不提前创建未来模块或依赖。
- 保留用户已有改动和数据，避免无关重构。2026-03-09 Travel-Ready sprint 是历史检查点，
  `docs/agent/TRAVEL_READY_SPRINT.md` 仅在相关历史或用户明确请求时读取。

## 验证与收尾

- 行为缺陷添加能捕获问题的聚焦测试。可逆、低影响文档/配置修改使用相称检查。
- `npm run check` 运行 TypeScript、lint、Jest、Node 原型与临时 SQLite 云服务验收；
  聚焦开发可先运行受影响检查，交付前核对适用的完整门槛。
- 按需进行真实浏览器或 App 检查。测试、构建、安装、桌面手机尺寸和手指驱动设备验收各自记录，
  不用 `--forceExit` 隐藏测试进程泄漏，不把尚待手机反馈的任务改为 complete。
- 检查 diff 的范围与约束，更新 `DEVELOPMENT_STATUS.md`，报告结果、证据、未解决项和下一步。

## 模型建议

保留当前协调模型。委派执行使用 `gpt-6-luna`、`xhigh` 或更强模型且 `xhigh` 以上
（用户 2026-10-08 指令）；固定 `luna_wb` 若是 GPT-5.6 Luna 则不适用于本项目。

下一任务的简短建议：普通文档、配置、UI接线、测试和lint优先 GPT-6 Luna xhigh；
涉及 SQLite/迁移/事务、日期、结构性命令/排序、原生模块、地图/CRS、复杂调试或里程碑验收时推荐 Sol xhigh，
并写一句风险理由。建议不代表模型选择器已切换。

## GitHub workflow

后续源码修改先读取 [GITHUB_WORKFLOW.md](GITHUB_WORKFLOW.md)，从 `main` 新建功能分支，验证后推送并创建 PR；合并以用户指令为准。
