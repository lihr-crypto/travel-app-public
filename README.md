# Travel App

旅行规划工具，规范数据为 `Trip → Day → Ordered Items`，Timeline 和地图共享焦点。
原生 iOS 使用 Expo/SQLite；独立 Web/PWA 支持已批准的云协作和离线待同步。
原生 App 可以导入、更新与恢复单趟 `.travel.json` 文件，尚不参与实时云编辑。

每趟旅行固定大陆 AMap/GCJ-02 或海外 Google/WGS84；保留历史地点的原始来源和坐标。

当前原生里程碑为 M10；最近交付包括 Web 协作与原生文件往返。Web v13 表单修正的真实 iPhone
焦点/键盘/缩放反馈仍待定。当前任务与分层证据见
[开发状态](docs/agent/DEVELOPMENT_STATUS.md)，Web/PWA 使用与数据说明见 [Web README](web/README.md)。
不要从历史测试数量或构建成功推断新的设备验收已完成。

## 开发与检查

```sh
npm ci
npm start
npm run check
```

`check` 汇总 TypeScript、Expo lint、原生/Web Jest、Node 原型测试和临时 SQLite 云服务验收。
可分别执行 `npm test`、`npm run test:prototype` 和 `npm run test:cloud`；云服务检查先构建源码，
使用隔离数据库，不访问真实 D1。Web UI 改动还应按需执行真实浏览器验收。

## 原生地图构建

按 `.env.example` 在忽略的 `.env.local` 配置 `GOOGLE_MAPS_IOS_API_KEY` 与 `AMAP_IOS_API_KEY`，
使用 Bundle-ID 限制的 iOS Key，然后执行 `npm run ios:maps`。脚本核对配置并构建；
真实地图、隐私选择、坐标对齐和触摸仍需相应设备证据。

AMap 隐私状态来自用户选择并在 native view 创建前就绪。当前 AMapFoundation 不支持 arm64 Simulator；
本机编译不能替代物理 iPhone 的 AMap 显示验收。

规则入口为 [AGENTS.md](AGENTS.md)；规范位于 `docs/specs/`。保留现有未提交改动、SQLite、
备份和私有配置；发布内容不得包含历史私人数据库或密钥。V1 仍无 Leg/自动路径实现。
