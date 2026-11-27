# SideStore、原生 iPhone 分发与云数据方案

核验日期：2026-10-11。本文是咨询记录，不代表已授权安装 SideStore、开通付费服务、发布 App 或实现云同步。

## 用户目标和当前状态

- 个人使用：希望少连接电脑、尽量免费；旅行之间可能间隔一两个月，已有行程需要长期保存。
- 对外使用：用户已明确选择「安装 iPhone App」；主要用户所在地尚未明确。
- 当前项目仍以 Expo SQLite 保存业务数据；本次检查 `package.json` 未发现 Firebase、Supabase、CloudBase 或 `expo-updates` 依赖，`app.json` 没有 `updates` / `runtimeVersion` 配置。当前没有据此可声称已经上线的云同步或 OTA。
- 安装渠道、代码 OTA、业务数据同步是三个独立问题。朋友各自保存本地行程，不要求先实现业务后端。

## SideStore

官方流程要求 iOS 15+、设备密码、Apple Account、首次使用电脑安装 iloader 并通过 USB 配对。较新的 iOS 需要开发者模式与开发者信任。日常安装、更新、续签必须连接 Wi-Fi 并开启 LocalDevVPN；仅蜂窝网络不满足要求。LocalDevVPN 用于设备内部通信。

免费账号的签名有效期仍是 7 天；SideStore 提供后台刷新，但不应把它作为一两个月无人检查时的可用性保障。免费账号同时激活 3 个 App，SideStore 自身占一个；另有每周 10 个 App ID 的限制，扩展可能占用额外 ID。

优势是免费、无需越狱，正常设置后可在手机上续签、安装更新 IPA。局限是每周续签、Apple Account 登录及签名服务依赖、异常排查；设备更新或重置后配对文件可能失效，官方也记载了随机失效情况，此时需要电脑重建配对。当前 Travel App 经 SideStore 的兼容性和迁移保留数据尚未实测。

迁移前先生成独立备份并验证恢复；不删除现有 App 来尝试迁移，不仅凭 bundle identifier 相同就承诺跨签名渠道数据一定保留。

来源：[前置要求](https://docs.sidestore.io/docs/installation/prerequisites)、[安装流程](https://docs.sidestore.io/docs/installation/install)、[FAQ](https://docs.sidestore.io/docs/faq)。

## 让别人安装 iPhone App

| 路径 | 适用对象 | 维护负担 |
| --- | --- | --- |
| SideStore | 自用或愿意折腾的少数朋友 | 每个人首次电脑配置、Apple Account 登录、每周续签 |
| TestFlight | 小范围测试 | 开发者发布新构建；每个构建最多使用 90 天，外部测试可能需要审核 |
| App Store | 稳定后长期使用 | 正式审核和持续维护；用户无 TestFlight 的 90 天测试倒计时 |

常规 TestFlight / App Store 分发需要发布方加入 Apple Developer Program，标准价格为每会员年 99 USD，地区价格以注册页面为准。TestFlight 测试者无需付开发者会员费；App Store 上本 App 是否收费由发布方决定。单独把 IPA 放在云服务器上，并不提供面向任意 iPhone 的常规免签安装渠道。

来源：[Apple 注册与费用](https://developer.apple.com/programs/enroll/)、[TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)。

## 云数据的候选方向

建议保持本地 SQLite 可离线使用，再按实际需要增加账号、每用户私有数据、云备份和换机恢复。同步会传播删除，因此还需要可独立恢复的历史备份。初期不必同时实现多人协作编辑或实时多设备同步。

- 中国大陆用户为主：优先评估腾讯 CloudBase。当前免费体验版每月 3,000 资源点、一个免费环境，单次续期 6 个月；不是永久无限额承诺。当前个人版页面显示 19.9 元/月限时价格，不作为长期固定预算。
- 海外用户为主：Firebase Firestore 可以从免费额度开始。当前免费数据库容量 1 GiB，每日 50,000 次读、20,000 次写；内置备份、恢复与 PITR 需要开启计费。整个系统费用还取决于所选登录、存储等服务。
- Supabase 免费项目在连续 7 天活动不足时可能暂停，因此不适合作为本用户「间隔一两个月仍无需管理」的默认方案；付费方案可避免此类自动暂停。

这是基于使用习惯的候选建议；最终平台和部署区域需结合主要用户所在地、实际连通性、登录方式、数据量和备份需求验证。

来源：[CloudBase 定价](https://www.cloudbase.net/pricing)、[Firestore 免费额度及收费备份功能](https://firebase.google.com/docs/firestore/quotas)、[Supabase 暂停政策](https://supabase.com/docs/guides/platform/free-project-pausing)。

## 建议顺序

1. 先实现用户可操作的行程导出、导入和恢复验证，保护当前数据。
2. 仅自用且坚持免费时，评估 SideStore，接受每周续签及偶尔电脑排查。
3. 需要普通朋友方便试用时，再准备 Apple Developer Program 与 TestFlight；稳定后考虑 App Store。
4. 有换机恢复或账号需求时，再独立规划私有云备份；完整实时同步按后续需求确定。

后续涉及备份恢复、签名迁移或云数据隔离时建议使用 Sol xhigh；错误会影响已有行程数据或原生安装身份。
