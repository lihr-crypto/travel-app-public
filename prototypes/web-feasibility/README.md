# Travel Web 可行性验证

这是独立的技术验证项目，不是完整迁移版。复用原 Application Commands、Timeline、Sheet、手势辅助、主题和数字图钉；没有改动原生 App 的平台、依赖、数据库或地图 Key。

## 启动

在本目录执行：

```sh
npm run setup
npm run export
npm run start-local
```

打开 <http://127.0.0.1:8095>。`start-local` 启动独立后台进程，命令返回后继续运行；不会设置开机启动，电脑重启后需要再次执行。服务只监听本机，不是可发给朋友的公网链接。手机上的 `127.0.0.1` 指手机自己，不能用此地址连接 Mac。

状态检查用 `npm run status-local`，停止用 `npm run stop-local`；修改 Key 后依次停止、重新启动。`npm run serve` 保留为前台调试方式。开发模式可用 `npm start`，地址为 <http://localhost:8094>。

安装的 Web 依赖只在本目录 `.deps` 中；原生项目的 `package.json` / lockfile 不变。原生 SQLite 调试日志通过验证项目的 Metro resolver 适配成内存日志，业务存储使用独立 IndexedDB。

## 可以操作的路径

- 国内 / 海外两趟样例，日期切换，原 Timeline / Sheet 和样例图钉。
- 点项目旁 ⋯：编辑名称、类型、仅到达时间、备注，保存或取消。
- 箭头调整顺序，刷新、关闭后重新打开，核对保存结果。
- 导出交互测试库 JSON，修改测试库后用备份恢复。
- 数据自检：真实 IndexedDB 中运行原业务 Commands，验证回滚、来源约束、并发冲突、重开、恢复与损坏导入拒绝；新生成的自检库结束后清理。
- 已有旧备份验证：只在本机测试库中导入并核对；不会把旧记录画到外部地图或送入搜索 API。
- 主屏幕：Web manifest 和批准的路线折页图标已加入构建。首次在线打开并显示缓存就绪后，行程页可离线打开／编辑；地图和搜索仍需网络。
- 更新：检查网页更新，完成保存或取消草稿后点击“更新并重新打开”。其它页面不会被自动重开；缓存不保存地图 Key、地图瓦片或旧原生备份响应，不删除 IndexedDB。
- 备份：可选择 JSON 文件或粘贴内容；新导出带 SHA-256 校验。内容损坏时拒绝恢复，当前测试库保留；旧格式仍可恢复。浏览器持久保存状态与独立备份分别显示。

## 网页地图 Key

2026-10-12：已将用户提供的两套网页 Key 配置到本机忽略文件，Mac 的 Codex 内置浏览器已验证两种底图、真实搜索、保存、刷新后保留和图钉点击定位。高德搜索验证了示例历史文化街区、南京禄口国际机场；Google 搜索验证了示例庭园、成田国际机场。原四个离线样例仍有明确标注，不是搜索结果。

复制 `.env.web-probe.local.example` 为 `.env.web-probe.local`，填入以下三项，重启服务器；不需要把 Key 发到聊天里：

```dotenv
AMAP_WEB_API_KEY=
AMAP_WEB_SECURITY_CODE=
GOOGLE_MAPS_WEB_API_KEY=
```

高德：登录[高德控制台](https://console.amap.com/)，进入应用管理，创建用于验证的新应用，在应用里添加 Key，服务平台选择 **Web 端（JS API）**。创建后取得 Key 和配套安全密钥；分别填入 `AMAP_WEB_API_KEY` 与 `AMAP_WEB_SECURITY_CODE`。本地开发域名若需白名单，配置当前验证使用的 localhost /127.0.0.1，按控制台字段提示填写。安全密钥只由本地代理使用，不送给浏览器。[官方申请步骤](https://developer.amap.com/api/javascript-api-v2/prerequisites)、[安全密钥用法](https://developer.amap.com/api/javascript-api-v2/guide/abc/jscode)

Google：试验阶段优先评估 **Maps Demo Key**。官方当前说明它无需提供计费信息，支持地图、标记、Place Class 与 Places API (New)，不提供用户照片/评论，只用于测试。生成时需本人登录并接受 Demo Project 条款；本次没有开通或接受新条款。[免费 Demo Key](https://developers.google.com/maps/documentation/javascript/demo-key)

在上述官方页面点击 **Get a Demo Key**，登录自己的 Google 账号，阅读并自行确认条款，复制生成的 Demo Key 到 `GOOGLE_MAPS_WEB_API_KEY`。这一步由账号所有者操作，不在聊天里传递 Key。填写后执行 `npm run stop-local`、`npm run start-local`，再刷新验证页。

使用标准 Google Key 时，在原项目中确认 Maps JavaScript API 和 Places API (New) 的可用性，并限制为验证网址，例如：

```text
http://127.0.0.1:8095/*
http://localhost:8094/*
```

标准生产接入的计费由账号所有者决定，不在本验证中自动开通。[Google 设置文档](https://developers.google.com/maps/documentation/javascript/get-api-key)

## 旧备份准备

从已有只读备份生成本机验证文件：

```sh
python3 prepare-legacy-backup.py --database /absolute/path/to/travel-app.db
```

输出到忽略的 `private/legacy-backup.json`。使用 `--source-label` 和 `--output` 区分快照；请使用合成数据库进行公开验证。

## 验证边界

Chrome 开发版与正式网页包的数据验证通过；390px 宽度的布局、鼠标拖动、箭头排序与表单操作已检查。配置网页 Key 后，Mac 的 Codex 内置浏览器同样通过 10 项 IndexedDB 自检；保存的真实高德 / Google 地点保留原名称、地址、来源 ID 与 GCJ-02 / WGS84 坐标，图钉落在相应底图的同名地点。刷新与国内 / 海外切换后仍保留，空白第二天不残留第一天的图钉。地图代理使用 SDK 要求的一级 `/_AMapService` 路径，安全密钥不进入浏览器配置或静态包。代理路由 / 密钥边界回归检查使用 `node --test server-middleware.test.js`。

2026-10-12 用户已在真实 iPhone Safari 确认搜索新增、仅到达时间／备注／键盘保存、添加到主屏幕后创建行程并断网重开编辑正常；补充确认 Google 成田国际机场搜索与图钉、Sheet 标题下／列表空白处上下拖动、日期箭头切换及箭头排序后的重开保留正常。这些是用户实机反馈，不能替代未测试的长按拖动排序与原生完整交互。Mac Safari 工具捕获失败不代表网站不兼容。本机地址仅供 Mac，实机使用下方经授权的临时 HTTPS 入口。

没有实现首页足迹地图、完整日期管理 UI、账号或云备份。当前整库快照加 revision 冲突重试与 Service Worker 均用于验证；全面迁移前应评估容量、性能、原生完整交互与稳定地址。

## 临时手机入口和导出包

临时手机入口需另行授权对外开放，使用已有 `cloudflared`：`node phone-preview.js start`、`status`、`stop`。入口有访问码，仅监听本机8096，由 HTTPS 隧道转发；两小时后同时关闭服务与隧道。认证后的旧备份接口也返回404。访问码只在忽略的 `.runtime` 下，不应写入文档或公开仓库。

临时地址每次变化，供公共样例验证使用。原行程导入与长期使用需要稳定 HTTPS 地址、独立备份和正式迁移流程。高德安全密钥留在本机代理；网页 Key 会经过经授权的隧道中转。[Cloudflare 临时入口说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

执行 `python3 package-validation.py` 生成 `dist-validation.zip`，包含静态构建与运行脚本，不包含 Key、安全密钥、访问码、原行程或数据库。解压后可按包内 README 在本机运行，不需要安装 Expo 构建依赖。

详细证据：[web-feasibility.txt](../../docs/agent/device-evidence/2026-10-12/web-feasibility.txt)。后续地图和数据完整性验证建议使用 **Sol xhigh**。

