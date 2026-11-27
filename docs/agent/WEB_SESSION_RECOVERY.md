# Web 登录失效被误报离线（2026-10-29）

用户反馈当前 Workers 主站在 iPhone 主屏幕和 Safari 都显示离线，首页公共底图仍能显示，行程地图配置失败，界面也停在旧版。

## 定位

对当前受 Access 保护的 `/api/cloud/me` 做匿名只读请求：普通请求 HTTP 302 到登录页，增加 `X-Requested-With: XMLHttpRequest` 后为 HTTP 401。与 [Cloudflare 的 AJAX 会话说明](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/#ajax) 一致。

旧云请求没有该头。浏览器跟随跨域登录跳转失败时只得到网络/解析错误，控制器将其归为 offline；地图配置请求同样失败。缓存应用仍能读取本机行程，公共 OpenFreeMap 不依赖站点会话，于是出现“底图有、云端离线、行程地图无配置”的组合。用户确认 URL 是当前 Workers，排除了旧域名入口。

此证据确认代码缺陷与现象吻合；没有直接读取用户手机 Cookie，也未将桌面验证视为其手机会话的实际状态证明。

## 修复

- 同源 JSON API 统一发送 AJAX 头、same-origin credentials，手动识别重定向/401/登录 HTML，明确区分会话失效、HTTP 服务异常与真正网络失败。
- 过期会话冷启动仍能读取原账号本机缓存；同步遇到 401 不发送队列操作，不清理或更换业务库。
- 全局登录提示覆盖 Home/Trip；编辑或保存中禁用登录跳转，先保存到本机或取消。
- 登录后通过现有 `/install` 非缓存入口加载当前页面，再恢复安全的原行程路径或邀请 fragment，避免返回旧的 cache-first 页面。
- 地图配置恢复后自动清除登录提示；已有配置与地图实例在普通网络失败时保留。
- PWA 壳资源请求同样标记 AJAX；401/登录页不能写入新壳缓存。未修改 Access 策略、会话期限、地图 Key、D1 或原生 App，也未清除网站数据。

## 验证

- `npm run check`：144 suites / 1019 passed / 1 skipped，6 项原型及临时 SQLite 云验收通过。
- 最终 Web 生产构建/PWA 打包通过，shell `0c827041a1646159`（托管包装转换前）。
- 新回归覆盖请求头、401、opaque/普通登录跳转、HTML 响应、网络与服务状态、缓存账号/待同步队列保留、地图回连、返回路径与未保存编辑保护。
- 实际 App + 独立 SQLite 浏览器：模拟会话过期；未保存草稿保留且登录按钮禁用；本机保存后远端仍是旧值；重新登录返回原 Day，并将队列操作恰好提交一次。再次以 401 冷启动仍能看到本机行程。
- 登录提示参与布局，393px 下 banner bottom=84、main top=96，无横向溢出或标题遮挡。
- 样例和截图仅在本机忽略目录 `outputs/offline-recovery/`；测试没有使用生产库或手机 Cookie。真实手机仍需要用户完成一次登录验证。
