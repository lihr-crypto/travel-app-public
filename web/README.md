# Travel Web / PWA

独立网页版复用原 Application Commands、Domain、DayTimeline、Sheet 与图钉；不直接打开或写入原生 SQLite。
当前主站：https://travel.example.com 。旧 Sites 入口仅重定向，写请求返回 410。最近交付记录以开发状态为准；当前状态与证据见
[开发状态](../docs/agent/DEVELOPMENT_STATUS.md)。

主站使用 Cloudflare Access 保护，保留原成员范围。站点访问权限与每趟旅行的
owner/editor/viewer 权限分开；获得站点访问不自动获得他人的行程。

主屏幕图标沿用 `assets/icon.png` 的地图设计，180/192/512 PNG 位于 `web/public/`。
安装图标通过现有公开工作台 `/app-icons/` 下的哈希命名 PNG 提供，避免系统的无登录图标下载被私有站点拦截；
Travel 页面和 API 仍保留成员权限。manifest 链接携带登录凭据。
从 Safari 打开 `/install` 后添加主屏幕，使用当前入口的安装元数据；保留已保存的行程和离线待同步内容。

## 数据与协作

- 新旅行使用登录账号的 D1 云端库，本机 IndexedDB 保存缓存、离线待同步和恢复数据。
  Safari 与主屏幕窗口首次联网同步后读取同一云端计划；离线修改重连后同步。
- 旧 IndexedDB `travel-web-plan-v1` 库保留；用户在设置中逐趟选择才上传。原生数据不自动上传。
  云端冲突与撤权保留待处理的本机内容，不静默丢弃；设置提供恢复与个人完整备份。
- 首页使用 MapLibre GL JS＋OpenFreeMap 单一全球底图，不再区分大陆/海外画布。复用 App 的 Home
  projection/cluster：每趟旅行一个代表点，未安排地点兜底，数字为旅行数，默认聚焦进行中当天、最近计划、
  最近完成，筛选直接跳转。高德坐标只做内存中的 WGS84 展示适配，原地点/导出数据不改写。
- Trip/Day 搜索与地图继续按每趟旅行固定区域使用 AMap/GCJ-02 或 Google/WGS84，新地点不混排。
  Web Item 菜单只保留所有者“删除行程”，确认后不进入回收站；旧回收站与恢复记录保留。
  交通起终点、住宿入住/离店编辑隐藏，旧值保留；Day 长按排序与横滑独立处理。
- “共享旅行”提供指定邮箱邀请、撤权和独立复制。按 2026-10-28 用户要求，Web 首页、设置和共享面板
  已移除单趟旅行文件的导入/导出入口；云端同步、个人完整备份和本机原有旅行的选择上传保留。
- 编辑详情按地点与名称、类型、时间、备注分区；保存/取消固定在独立底栏，内容区域滚动。
- 原 App 从“我的旅行 → 导入旅行文件”导入、更新和恢复同一格式；原 App 不参与实时云编辑。
- 旧六张原始表保存在 `extras.sourceTables`；不重写历史名称/坐标或自动修正既有关联问题。
  缺 Trip 的旧 Item 保持可读，缺 Day 的 Item 可重新安排。
- 清除网站数据可能删除尚未同步的修改；先同步或导出。Safari 主屏幕首次联网缓存界面后可离线编辑，
  地图/搜索仍需网络，恢复网络或前台会重连，也可点“重新连接地图”。

## 本机开发与检查

从仓库根执行 `npm run check`，包含 Jest、Node 原型和临时 SQLite 云服务验收。
Web 构建与本机服务从 `web/` 执行：

```sh
npm run build
npm run serve:background
npm run serve:status
npm run serve:stop
```

本机 http://127.0.0.1:8098/ 仅供 Mac 开发，重复后台启动不会另开服务；`npm start` 使用8097。
共享 Web 依赖位于 `prototypes/web-feasibility/.deps/node_modules`。
本机 `.runtime/cloud.sqlite` 与托管 D1 相互独立；云服务验收使用临时数据库。
`test-user` header 仅在 localhost 开发识别；托管请求只接受 Sites 可信身份头。

忽略的 `.env.local` 使用 `AMAP_WEB_API_KEY`、`AMAP_WEB_SECURITY_CODE` 与 `GOOGLE_MAPS_WEB_API_KEY`。
AMap 安全码只在服务端代理使用，Google 浏览器 Key 从运行配置取得并限制 origin/API。
首页 OpenFreeMap 不需要新 Key 或 Apple 会员；其公开服务当前免费，不提供 SLA，国内实际网络与 iPhone
WebGL/触摸可用性仍需设备核验。底图从 tiles.openfreemap.org 加载，旅行名称/备注不发送给该服务。
MapLibre CSS 随 PWA 界面缓存，瓦片/样式/字体仍需网络；许可证见 public/map-licenses.txt。
托管配置、私人数据库、原生备份和生成的部署归档不得提交或放进新的发布包。

## 已核验与剩余门槛

最近记录包括真实朋友编辑、Safari/PWA 同步、离线保存后恢复、跨账号文件副本及撤权的用户确认；
原生文件导入/更新/恢复同时有用户触摸确认与复制数据库核对。详细分层证据在开发状态和历史记录中。
本机浏览器的尺寸检查、自动测试、构建或云端 SQL 结果各自只证明对应阶段。

2026-10-14 v13 修正新建旅行/Item 编辑的初始焦点、16px字段、滚动锁与 visual viewport 边界，
320px/393px桌面浏览器和缩短视口检查通过。新的真实 iPhone Safari/主屏幕键盘与缩放反馈仍待定。

Google Web 已按用户批准换为专用标准 Key，限定本站 origin 和 Maps JavaScript API / Places API (New)，
使用现有 Cloud Free Trial。没有开通付费账号或设置硬费用上限；到期前的后续计费决定需另行授权。
规则与实际保存/展示的 Places 数据约束仍需按相关改动核对官方文档，不自动清理用户历史数据。

> **占位符说明**：文档、清单和代码里的 `dashboard.example.com`、`travel.example.com`、`dashboard.example.invalid`、`appgprj_REPLACE_WITH_YOUR_PROJECT_ID` 都是示例值。部署前请换成你自己的公开域名和项目 ID；`dashboard.example.com/app-icons/` 指的是你自己部署的公开工作台（见 kindle-mobile-cloud 的 `public/app-icons/`）。
