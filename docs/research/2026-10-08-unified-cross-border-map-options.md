# 跨境旅行统一地图方案（2026-10-08）

状态：用户已确认方案 B，2026-10-08 开始实施。下文保留方案比较的调查记录。

用户进一步指出国内使用不能以 VPN 为前提。推荐据此调整为方案 B。
方案 A 调整量较小，但不能据此忽略大陆直连可用性；此前在日本环境获得的
Google 搜索成功证据不证明其在大陆普通网络下可用。

## 已确认的问题与目标

截图中 Day 1 同时包含成田国际机场和南京禄口国际机场。当前
`AutomaticTripMapRenderer` 先按选中图钉确定 CRS，再过滤另一种 CRS 的图钉，
最后切换 AMap/Google 原生组件。因此无法同时展示两座机场，点击 Item 也会换底图。
这是当前实现的限制。

目标为同一趟跨境旅行使用稳定的地图实例；全部当前 Day/Overview 图钉同时参与
展示和取景。点击 Item 只改变高亮、相机和列表定位，不重建地图。

## 方案 A：跨境旅行固定 Google（保留为备选）

- 保留已经工作的高德/Google 地点搜索与所有行程数据。
- 在旅行级选择地图：仅大陆来源的旅行继续使用高德；包含海外地点的旅行固定
  Google，选择 Item 不再影响地图提供商。
- 显示投影统一到 Google SDK 使用的 WGS84。高德 GCJ-02 只生成临时展示坐标；
  数据库保存的原始坐标、地点来源、Item/Day/Trip ID、顺序和时间全部保留。
- 图钉和相机请求使用同一转换边界。移除按来源过滤图钉的行为。
- 先验证坐标转换和原生图钉对齐，再接入实际页面；不能把 gcj02 标签直接改成 wgs84。
- 优势：调整集中在地图展示层，当前海外搜索可继续使用。
- 限制：大陆实际网络下的 Google 地图可用性需要独立验收；不能用日本网络测试
  替代大陆网络结果。纯大陆旅行的高德路径保留。

## 方案 B：统一 Apple MapKit 与地点搜索（当前推荐）

- iOS 项目可将地图和搜索一起统一为 MapKit / MKLocalSearch。
- 首页已经有 MapKit 原生适配器，可复用部分展示能力；现有首页的粗略矩形
  CRS 判定不能当成准确国界，也尚无充分的混合地标对齐证据。
- 需要新增 Apple 搜索适配与旧地点显示适配，验证大陆/日本/港澳/邻国地标。
  原有旅行数据必须保留；搜索质量和旧地点匹配也要纳入验收。
- 当前非 EEA Google Places 条款 14.2 限制其内容与非 Google 地图结合使用，
  因而不能只换底图、继续把现有 Google Places 结果直接画到 Apple 地图上。
- 优势：一套 iOS 地图/搜索体系。
- 代价：比方案 A 涉及更多模块和旧地点处理，不能作为几个样式改动交付。

## 高德世界地图

官方提供全球道路/POI 展示，但世界地图属于高级服务，需商务申请。
现有 SDK 版本约束为 AMap3DMap ~>11.2，版本条件具备；本次没有验证账号是否具有
世界地图权限或其商务价格。需要海外服务权限与对应搜索/数据来源方案后才能选用。

## 验收条件

1. 截图中的两座机场同时出现，取景能涵盖中国与日本，图钉编号仍对应 Item。
2. 反复选择两个 Item、切换 Day 和缩放地图时，地图实例与 Sheet 保持稳定。
3. 地标级检查证明两座机场的位置正确，不能只靠坐标数值单元测试。
4. 旧地点坐标、所属日期、时间与排序不发生持久化改写。
5. 新建、地图选点和外部导航仍按各自真实坐标/来源处理。
6. 国内与海外网络分别记录地图/搜索结果；不混称为统一已验证。

## 一手资料

- Google Maps iOS WGS84 坐标规范：
  https://developers.google.com/maps/documentation/ios-sdk/coordinates
- 当前 Google 服务条款，Places API 14.2：
  https://cloud.google.com/maps-platform/terms/maps-service-terms
- 高德 iOS 世界地图（高级服务、SDK 最低版本与开关）：
  https://lbs.amap.com/api/ios-sdk/guide/create-map/world-map
- Apple MapKit 地图、注记和搜索能力：
  https://developer.apple.com/maps/
- 高德 SDK 已安装头文件 AMapUtility.h：官方转换接口输出高德坐标；转换精度需实测。


## 国内直连优先的决策更新

- 推荐统一 Apple MapKit 底图和 MKLocalSearch 地点搜索，先用大陆普通网络验证
  大陆、海外两类地点搜索和混合图钉对齐，再决定旧地点适配方式。
- 不把 VPN 当作正常产品使用条件；也不把任何地区/网络的可用性当成未经
  实测的保证。旧行程、标题、日期、顺序和时间继续保留。
- Google Maps iOS SDK 仍依赖 clients4.google.com / www.google.com 等域名。
  覆盖范围表描述的是地图数据覆盖，不能据此推断大陆网络可达。
- 一手资料：
  https://developers.google.com/maps/domains
  https://www.apple.com.cn/maps/
  https://developer.apple.com/maps/


## Search coverage reconsideration — 2026-10-08

User reports Apple-only new-place search misses familiar AMap results (示例酒店)
and is considering returning to the original AMap/Google setup. Provider choice
is pending; do not infer an irreversible rollback from the conditional wording.

- Current production new search is Apple-only. Saved-place display restoration is
  separate; it does not add AMap/Google catalog data to MKLocalSearch.
- Original AMapPlaceProvider, GooglePlaceProvider, AutomaticPlaceProvider and native
  renderers remain in the repo, including the repaired Google uncentered HTTP search.
  Returning to them can preserve all itinerary and unrelated UI fixes.
- Existing Google Places API/SDK policy requires Google results on a Google map.
  https://developers.google.com/maps/documentation/places/ios-sdk/policies
  https://cloud.google.com/maps-platform/terms/maps-service-terms (§14.2)
- Google Places UI Kit is an explicit exception for non-Google maps (§15.1), now
  available in PlacesSwift on iOS. It needs a different component/API integration,
  billing/project setup and attribution; it is not permission to reuse the current
  raw Places API results arbitrarily on Apple maps.
  https://developers.google.com/maps/documentation/places/ios-sdk/places-ui-kit-overview
  https://developers.google.com/maps/documentation/places/ios-sdk/places-ui-kit-get-started
- AMap terms govern detached service-data use; no special third-party-map licence
  was verified for this account. Do not turn a generic clause into an unsupported
  claim that every possible AMap/Apple integration is technically impossible.
  https://lbs.amap.com/pages/terms/ (§3.5/§4.12)

Recommendation for present usability: restore AMap mainland search/map and Google
foreign search/map, keeping one itinerary and all preserved data. A mixed Trip
still changes native map when focusing the other source; an all-source single map
is not promised by that path. Mainland direct availability of Google foreign
search remains a separate network constraint. Open-platform API search need not
replicate the first-party consumer apps' complete ranking/catalog interface.

Active Japanese saved-Google display work is implemented and being checked but
not accepted as a completed device pass; build installed its temporary verification
package before this steering arrived, and launch was blocked by device lock. The
probe source has been removed; further installation awaits the provider decision.


## Final user decision — 2026-10-09

The user explicitly selected restoration of the original AMap/Google arrangement
and cancelled mainland/overseas mixed Trips. This is authorization to restore the
regional sources and create-time scope selection, preserving all user-owned data
and unrelated UI fixes. Product Amendment §14 is now authoritative. Existing mixed
history stays readable; only new/replacement Place writes are scope constrained.
