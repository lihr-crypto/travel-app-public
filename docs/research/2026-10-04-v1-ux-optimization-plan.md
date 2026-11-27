# V1 框架内 UX 优化方案（市场借鉴）

日期：2026-10-04 · 性质：交互优化提案（V1 范围内，不扩功能、不加后端）
前置：`docs/research/2026-10-04-market-architecture-review.md` · 验收清单：`DEVICE_PASS_TAP_SCRIPT.md`

---

## 0. 结论速览

市场对标（Wanderlog / TripIt / NN Group / Material 规范）给出的差距里，**大部分高价值项我们已经做完**（拖拽排序、地图+行程统一视图、持久 Day 面板、44pt 命中目标、三档 Bottom Sheet）。剩余可做的差距分三组：

- **A 组「现在就能做」**：5 个纯呈现层小任务，V1 框架内、无新依赖、每个 ≤1 个 bounded task；
- **B 组「验收后再定」**：3 个地图层优化，需要 A–N 验收的第一手证据定优先级；
- **C 组「需要拍板」**：2 项涉及新依赖或新命令（触感反馈、移动撤销）。
- **否决 1 项**：路线优化/站间距离（Wanderlog 招牌之一）——V1 禁区（Leg/RouteProvider）。

建议顺序：**先跑 A–N 验收 → A 组随时穿插 → B 组按验收证据 → C 组拍板**。

---

## 1. A 组 — 现在就能做（V1 内，无新依赖）

### A1 · Trip 卡片与预览加"内容摘要"

- **现状**：`我的旅行` 列表行与 Trip Preview Card 显示 标题 + 日期区间 + 天数徽标。
- **市场参照**：Wanderlog 的行程卡直接告诉你"有多少天、多少个地点、计划进行到哪"（[App Store 页](https://apps.apple.com)、[对比评述](https://mapyourvoyage.com)）。
- **建议**：卡片/列表行第二行改为 `8 天 · 12 个地点 · 进行中`（数据全部已存在于 Overview 读模型，纯呈现）。
- **规模**：1 task（projection + 组件 + 测试）。合规：✅ 无新数据、无新命令。

### A2 · 空状态升级为"引导公式"

- **现状**：Day 的 `暂无行程`、未安排/搜索无结果都是一行灰字。规格 §6.13 的空状态（还没有旅行 + CTA）只在 Home 体现了。
- **市场参照**：NN Group「不要默认全空，空状态要给帮助线索」（[nngroup.com](https://www.nngroup.com/articles/empty-states/)）；Mobbin/UX Planet 公式 = 视觉 + 一句话说明 + CTA（[mobbin.com](https://mobbin.com/articles/empty-state)、[uxplanet.org](https://uxplanet.org)）。
- **建议**：① Day 空 → `这一天还没有安排` + `＋ 添加地点`（按钮已存在，补引导文案与视觉）；② 未安排空 → `没有待安排的行程` + `去某天添加`；③ 搜索无结果 → `没有找到"xx"` + `换个关键词，或在地图上选地点`（入口已存在）。
- **规模**：1 task（3 个组件 + 测试）。合规：✅ 纯文案与呈现。

### A3 · 友好日期标注（今天/明天/周几）

- **现状**：日期显示为 ISO 区间与 `Day N`。
- **市场参照**：TripIt/Wanderlog 的时间语境都是相对化表达（"今天""明天"）。
- **建议**：在 Day 标题、总览 Day 列表、Active Trip 卡的日期旁加 `今天`/`明天` 徽标（`trip-date-labels.ts` 已是日期文案的集中地，加一个纯函数 + 调用点）。Active Trip 卡已显示 `Day 7`，补日期相对词即可。
- **规模**：1 task。合规：✅ 纯呈现。

### A4 · 总览加载骨架屏

- **现状**：Home → 总览的首载显示 `旅行加载中…` 文本。
- **市场参照**：骨架屏让感知加载时间显著短于 spinner（[NN Group](https://www.nngroup.com/articles/skeleton-screens/)、[onething.design](https://www.onething.design)、[LogRocket](https://blog.logrocket.com)）；骨架应**模拟最终卡片布局**。
- **建议**：总览首载渲染 3–4 条 Day 列表行形状的骨架（复用行样式，灰色块 + 已有 planning-surface-transition 淡入）；持久 Day 面板已消除大部分重载，此处理只影响首载一次。
- **规模**：1 task。合规：✅ 纯呈现。

### A5 · 搜索体验细节

- **现状**：搜索有 loading/empty/error 态（M7-T5 起齐备），G 场已验证分页。
- **市场参照**：Wanderlog 的"从任何地方导入"之外，基础搜索体验的关键是**空结果引导**与**输入建议**。
- **建议**：只做 A2 已覆盖的空结果引导。**输入建议（Input Tips）维持不做**——台账已有记录：高德 Tips 部分结果无坐标，而我们的结果必须带坐标，这是有依据的产品决定，不翻案。
- **规模**：并入 A2。合规：✅。

## 2. B 组 — 等 A–N 验收证据再定（地图层）

| # | 项 | 现状与参照 | 前置 |
|---|---|---|---|
| B1 | **AMap 标记切天闪烁 → ID-based annotation diff** | 验收 B9 专门收集"闪/不闪/轻微"；Wanderlog 的地图层以稳定著称 | B9 结果 |
| B2 | **聚合气泡城市名**（现在是锚点地名，如 `天安门 · 2`） | 已记录的技术债；Wanderlog 用城市聚合 | 需要 Place 区域字段（数据模型小改） |
| B3 | **按天着色标记**（Wanderlog 的总览地图每天一个颜色，空间结构一眼可读——[对比评述](https://chictravel.ai)、[travel-stories](https://travel-stories.12f.dk)) | 我们的标记有编号无颜色；总览加 dayIndex→色板映射是纯投影改动，但要与 B1 的标记 diff、N 场的聚簇一起做，避免三次动地图层 | B1/B9 完成 |

## 3. C 组 — 需要拍板（涉及新依赖或新命令）

| # | 项 | 市场参照 | 代价 | 建议 |
|---|---|---|---|---|
| C1 | **触感反馈**：拖拽拿起/放下、删除确认、撤销弹出 | 微交互共识：克制地确认关键动作，不做装饰（[studio5creative](https://studio5creative.com)、[microinteraction 指南](https://www.linkedin.com)) | **新依赖 `expo-haptics`**（AGENTS.md 不预装未来依赖，需明确批准） | 建议批准——它是 L 场拖拽手感的最大增量，量小（3–4 个调用点） |
| C2 | **移动/重排的撤销**：目前只有删除有 Undo；移动到别的天/重排不可逆 | M11 的规格原文预留："Undo infrastructure may later support move/remove actions"；TripIt/Wanderlog 的危险感操作都有撤销 | 中任务：移动快照 + `restoreMovedItem()`（走现有 move 命令原路返回）+ Snackbar 复用 | 建议排在 B 组之后；复用 M11 的 Snackbar，不动架构 |

## 4. 否决项

| 来自市场的模式 | 否决理由 |
|---|---|
| 行程内**路线优化 / 站间步行驾车距离**（Wanderlog 招牌之一） | AGENTS.md §4：V1 无 Leg/RouteProvider，禁自动路由。V2 若做，接 OTP（见市场调研文档 §3.2-⑥） |
| 邮件/链接自动导入行程 | 需要后端服务，§4 禁区 |
| 多人实时协作编辑 | §4 禁区（V2 已立项顺序） |

## 5. 建议执行顺序

```text
现在      A–N 真机验收（ UX 问题的第一手来源，清单已就绪）
穿插      A1–A5（每个 ≤1 task，纯呈现层，随时可做，不碰地图层）
验收后    B1（按 B9 证据）→ B3（按天着色）→ B2（城市聚合）
拍板后    C1 触感（批准 expo-haptics 即做）→ C2 移动撤销
```

来源：[NN Group 骨架屏](https://www.nngroup.com/articles/skeleton-screens/) · [NN Group 空状态](https://www.nngroup.com/articles/empty-states/) · [Mobbin 空状态](https://mobbin.com/articles/empty-state) · [NN Group Bottom Sheets](https://www.nngroup.com/articles/bottom-sheets/) · [LogRocket bottom sheets](https://blog.logrocket.com) · [Wanderlog App Store 页](https://apps.apple.com) · [对比评述](https://chictravel.ai) · [无障碍手势陷阱](https://testparty.ai)。
