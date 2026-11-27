# 现有 Travel App 的网页 / PWA 迁移评估

核验日期：2026-10-11。用户本次要求分析难易度与优缺点；本次未实施迁移、安装依赖、发布网站或读取/改写手机数据库。

## 判断

可行，建议目标形态为移动端优先的 PWA：通过 HTTPS 链接使用，也可添加到 iPhone 主屏幕。整体是中等偏高的迁移工作量，主要成本来自地图、持久化与交互适配。现有业务规则和界面设计有复用价值；不能以增加 Web 构建开关作为迁移完成判据。

用户希望减少连手机、避免免费签名每周到期，也考虑让朋友使用；PWA 可以解决分发问题。长期保留行程仍需独立设计备份和恢复，浏览器存储不自动提供云同步。

## 当前代码证据

| 部分 | 当前事实 | 对迁移的影响 |
| --- | --- | --- |
| 平台配置 | `app.json` 只启用 `ios`；未安装 `react-native-web`，无 Web 构建脚本或 Metro 配置 | 尚无当前可用的 Web 目标；未运行 Web 导出验证 |
| 业务规则 | `src/domain` 13 个文件 / 744 行；`src/application` 48 个文件 / 4,933 行；Repository 接口与具体数据库实现分开 | Trip / Day / Item、日期、编辑校验和排序规则可复用；文件计数不代表可直接复用比例 |
| 界面 | 55 个 TS/TSX 组件文件 / 12,624 行；有 React Native 表单、手势、Sheet 与键盘处理 | 主题、布局和不少组件可复用；需要网页端验证，不能假定全部支持 |
| 国内地图与搜索 | `amap-map-renderer.tsx` 使用本地原生 View；`amap-place-provider.ts` 调用 Swift 模块 | 改接 AMap JS API / Web 搜索适配器 |
| 海外地图与搜索 | `google-map-renderer.tsx` 使用 `react-native-maps`；`google-place-provider.ts` 调用 Swift 模块 | 改接 Google Maps JavaScript / Places；需 Web API key、额度和真实网络验证 |
| 首页足迹 | `apple-map-renderer.tsx` 使用原生 MapKit，首页是跨 Trip、跨坐标系投影 | 需单独设计 Web 首页地图；不能默认无成本照搬，也不能直接混用 GCJ-02 与 WGS84 |
| 本地数据 | `database/index.ts` 打开 `travel-app.db`；`runtime.ts:104` 依赖 `withExclusiveTransactionAsync` | Expo SQLite 当前 Web 支持仍为 alpha；该独占事务接口在 Web 明确抛错，持久化必须适配 |
| 时间控件 | `item-draft-form.tsx` 导入原生 DateTimePicker | 增加网页日期 / 时间控件，保留中文公历和到达时间可单独设置等规则 |
| 跳转地图 | `external-map-handoff.ts` 已有高德 / Google 网页 URL 回退 | URL 构造可复用；浏览器端唤起与回退流程需验证 |

本地原生模块的 `expo-module.config.json` 均只有 Apple 平台。现有 `@gorhom/bottom-sheet` v5 官方支持 Web；需适配的是当前自定义 Sheet / Timeline 手势组合，不应把整个 Sheet 库判定为不支持 Web。[Bottom Sheet Web 支持](https://gorhom.dev/react-native-bottom-sheet/web-support)

Expo SQLite Web 需要 WASM 和 COOP / COEP 等宿主配置；`withExclusiveTransactionAsync` 不支持 Web，普通异步事务又不提供同样的独占行为。需要保持多项编辑、排序、日期修改的原子提交与失败回滚，不能仅替换函数名。[Expo SQLite 文档](https://docs.expo.dev/versions/latest/sdk/sqlite/)

## 路径选择

推荐先扩展现有 Expo / React Native Web 目标，复用业务规则与可以运行的 UI，增加 Web 地图、存储和日期控件适配器。第一轮只验证关键路径；如果自定义手势或存储桥接适配成本过高，再为部分页面采用 Web 原生 UI，并继续共享业务规则。暂不建议先完整另写一套业务逻辑。

国内 Trip 保留高德、海外 Trip 保留 Google，不重新引入同趟旅行混排。高德官方 Web API 提供 POI 搜索；Google 官方提供 JavaScript 地图与 Text Search。两端结果覆盖与排序仍需实测，不能承诺与各自消费端 App 或 iOS SDK 完全一致。[高德 POI 搜索](https://developer.amap.com/api/javascript-api-v2/guide/services/autocomplete)、[Google 地图](https://developers.google.com/maps/documentation/javascript/overview)、[Google Text Search](https://developers.google.com/maps/documentation/javascript/place-search)

首页现有 Apple 原生地图另行评估。MapKit JS 是可选 Web 适配方案，但需要 Maps token，官方免费额度按 Apple Developer Program 会员提供；不能因为改为网页就承诺继续使用此地图完全无费用。保持零苹果会员费时，应评估其他首页呈现方式及其跨区域能力、数据使用条件。[MapKit JS](https://developer.apple.com/documentation/mapkitjs)、[Apple Web Maps 额度](https://developer.apple.com/maps/web/)

## 数据与离线

1. 浏览器没有现有 iPhone App 沙箱的数据库读取能力，需要用户授权下的导出、导入或云端迁移。
2. 保留原 Trip / Day / Item / Place ID、关联、排序、名称、时间、备注、来源、坐标系和旧地点快照；迁移不以重新搜索地点替代原记录。
3. 先形成独立备份，在新的数据目标验证后再切换；既有外键问题已有项目记录，迁移时诊断并报告，不默默清理或丢弃用户数据。
4. 第一阶段可选择本地浏览器保存加文件导出恢复，降低账号和同步工作量；长期跨设备使用再增加每用户私有云备份。云备份、实时同步和多人协作分别评估，不默认一起实施。
5. 浏览器存储默认是 best-effort，可能受用户清理与存储压力影响。可请求持久化并检测是否获准，仍不能替代独立备份。WebKit 对主屏幕 Web App 有特别规则，不能笼统说「PWA 7 天不打开就一定删数据」。[WebKit 存储政策](https://webkit.org/blog/14403/updates-to-storage-policy/)、[ITP 主屏幕 App 例外](https://webkit.org/tracking-prevention/)
6. 可缓存网页资源与行程，使首次成功加载后能离线查看和编辑；地图及地点搜索仍需网络，不能承诺离线地图。Service Worker 必须有明确更新与回滚策略，避免长时间停留旧版本。[Expo PWA 指南](https://docs.expo.dev/guides/progressive-web-apps/)

## 优缺点与费用

优势：无 iOS 开发签名倒计时；链接即可分发；可添加到主屏幕；可以在手机、桌面和其他系统上使用；网页发布后可通过应用明确的更新流程加载新版本。PWA 分发本身不要求 Apple Developer 会员。[Apple 主屏幕 Web App](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27)

代价：iPhone Safari 的键盘、安全区、浏览器返回、地图与 Sheet 的触摸竞争需重新验证；浏览器保存的数据需独立保护；离线初始启动、资源缓存、更新策略需实现；同时维护原生和 Web 会增加后续验证范围。海外地图的大陆连通性也不会因为增加网页目标而自动改善。

网站可以在免费托管额度内起步，但域名、云数据库、地图与搜索服务分别计费。Cloudflare Pages 有免费计划，不代表在所有目标网络上都可稳定访问；平台与区域需按用户所在地实测。Google Maps JavaScript 要开启计费，地图加载和 Places 请求按不同 SKU 计量。高德生产接入建议使用服务端代理保护安全密钥，不能直接照抄 iOS Key 或把服务器密钥发给浏览器。[Pages 限制](https://developers.cloudflare.com/pages/platform/limits/)、[Google 用量计费](https://developers.google.com/maps/documentation/javascript/usage-and-billing)、[高德安全密钥](https://developer.amap.com/api/javascript-api-v2/guide/abc/jscode)

## 粗略工作量

以下是根据当前代码的单人有效投入估算，未经 Web 原型验证，不是工期承诺；账号申请、服务开通或网络阻塞的等待时间不包含在内。

| 阶段 | 范围 | 估算 |
| --- | --- | --- |
| 可行性验证 | 一趟国内 / 海外行程，真实搜索、图钉、存储写入回滚，Safari 关键输入 | 2–4 人日 |
| 核心可用 PWA | 在验证基础上完成主要查看 / 编辑、导出导入、主屏幕、缓存和更新流程 | 累计约 10–20 人日 |
| 长期多人使用版本 | 在核心版本上增加账号隔离、云备份恢复及更完整的兼容验证 | 累计约 20–35 人日；实时协作不包含 |

以「减少插线」为唯一目标时，无线原生安装成本更低；以「免费分发、长期无签名到期、让朋友直接打开链接」为目标时，PWA 的迁移投入更有价值。

## 建议的第一步验收

先做有边界的可行性验证：真实高德国内搜索与 Google 海外搜索，各建立一趟测试行程；图钉位置、Day 切换、编辑、排序、页面重开保存、失败回滚、原记录导入与主屏幕键盘操作都通过。还需明确首页地图和长期间隔使用的数据恢复策略。此时再细化全面迁移工作量，并保留原 App 与原数据，避免先切断可用入口。

后续技术验证建议模型：**Sol xhigh**。原因：Web 地图、坐标系与替换独占事务都会影响位置正确性和数据完整性。
