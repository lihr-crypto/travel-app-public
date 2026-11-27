# 迁移副本的可复现检查

从私有 GitHub 克隆后，在仓库根目录执行 `npm ci` 和 `npm run check`。Web 的 IndexedDB 测试、云服务构建和 Site 打包所需依赖已固定在根目录的 `devDependencies` 与 `package-lock.json`，不需要本机忽略的 `web/.test-deps/` 或 `web/.build-deps/`。

`tests/config/fixtures/ios-app-delegate-template.swift` 是一次真实 Expo prebuild 的原始模板；`ios-app-delegate-generated.swift` 是同一实际生成的 `AppDelegate.swift`，仅将 Google Maps key 和 react-native-maps 的两个 sync hash 替换为占位符。常规 Jest 会把插件转换结果与这份独立捕获的 golden fixture 逐字比较，并验证固定点、重复执行和模板形状异常。这个测试不要求克隆中存在被忽略的 `ios/`。

如果本机已生成 `ios/TravelApp/AppDelegate.swift`，同一测试还会与 golden fixture 做脱敏后的集成一致性检查；没有生成项目时，该项以明确原因 skip。需要核验当前 Expo prebuild 及原生运行时行为时，在配置本机忽略的地图凭据后运行 `npx expo prebuild --platform ios`、重新运行该测试，并按原生构建与设备验收流程检查。golden fixture 的通过仅证明已捕获模板上的插件行为，不能替代新 SDK 模板、编译或实体设备验收。切勿把 `.env.local`、实际 API key、`ios/` 生成物或运行数据提交到仓库。
