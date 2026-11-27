# Travel App — 第二轮实机测试问题与修正要求

## 1. 本轮背景

第一轮修正后，实机测试仍存在多项交互问题。

本轮不要继续针对单个按钮做表面补丁，而应重点检查：

- Day Selector 的弹层生命周期
- Bottom Sheet 的手势事件处理
- 横向 Swipe 的监听位置与判定逻辑
- Location Picker 的打开/关闭机制
- Router / Navigation 状态
- 是否存在 pending navigation、watcher、延迟跳转等副作用

---

# 2. 已确认问题

以下均为当前实机测试中已经确认存在的现象。

## 2.1 Day 页面：左右滑动切换仍未实现

预期：

```text
左滑 → 下一天
右滑 → 前一天
```

当前：

- 左右滑动没有触发 Day 切换
- Sheet 内仍无法通过横向手势切换 Day

---

## 2.2 Day 页面：Day X 第二次点击大概率无响应

复现流程：

```text
进入 Day 页面
→ 点击 Day X
→ 选择另一个 Day
→ 再次点击 Day X
→ 大概率没有反应
```

这说明第一次打开/关闭 Day Selector 后，某些事件或弹层状态可能没有被彻底恢复。

---

## 2.3 Day X 旁边不需要向下箭头

当前 UI 在 `Day X` 旁增加了向下箭头。

需求：

```text
删除该向下箭头
```

保留：

```text
Day X
日期
```

整个区域可点击即可。

---

## 2.4 Day 页面：更换地点后出现黑屏

复现流程：

```text
Day 页面
→ 某行 ⋯
→ 更换地点
→ 选择新地点
→ 出现短暂黑屏
→ 再回到 Day 页面
```

预期：

```text
Day
→ 更换地点
→ 选择地点
→ 直接回到原 Day
```

中间不应该出现黑屏、空白页或页面重建感。

---

## 2.5 Edit 页面：地点栏点击无反应

当前：

```text
Edit Detail
→ 点击“地点”
→ 页面没有反应
```

但是如果此时返回 Day：

```text
Edit Detail
→ 点击地点（无反应）
→ 返回 Day
→ 自动跳到更换地点界面
```

说明点击动作很可能已经触发了某种“延迟导航”或“待处理状态”，只是没有立即显示。

这是本轮非常重要的排查点。

---

# 3. 可能根因分析

以下为基于现象的推测，不应直接视为已确认根因。

开发 Agent 必须通过实际代码确认。

## 3.1 Day X 第二次点击失效

可能原因包括：

- Day Selector 视觉上关闭了，但 overlay/backdrop 没有真正销毁
- 透明层仍覆盖在页面上
- `pointer-events` 没有恢复
- pointer capture 没有释放
- `isDaySelectorOpen` 等状态没有正确重置
- Bottom Sheet 手势仍处于 active 状态
- `touchend` / `click` / `pointerup` 混用导致事件状态异常
- Day Selector 只是 hidden，而不是 unmount

重点确认：

```text
第一次打开 Day Selector
→ 关闭
→ overlay 是否真正销毁
→ pointer 状态是否恢复
→ 第二次是否可以重新正常 mount
```

目标应该是：

```text
点击 Day X
→ 打开 Day Selector
→ 选择 Day
→ 更新 activeDay
→ 完整关闭并清理 Day Selector
```

---

## 3.2 左右 Swipe 没有生效

可能原因包括：

- Swipe 监听绑定在了错误 DOM 层
- Bottom Sheet 根节点自身的 drag 手势抢占了事件
- 横向 swipe 被纵向 drag gesture manager 截获
- `touch-action` 设置不正确
- threshold 判定不合理
- pointerdown / pointerup 实际没有在同一层接收到
- 交互子元素阻断了手势

重点检查当前 Swipe 到底绑定在：

```text
Bottom Sheet Root
还是
Bottom Sheet Content
```

建议优先绑定到：

```text
Bottom Sheet
└── Sheet Content
```

不要绑定到：

- Map
- Sheet drag handle
- Bottom Sheet root gesture 层

推荐思路：

```text
pointerDown
→ 记录 startX / startY

pointerUp
→ 计算 dx / dy

abs(dx) > 50
AND
abs(dx) > abs(dy) * 1.2
→ 才切换 Day
```

同时保持：

```css
touch-action: pan-y;
```

避免破坏纵向滚动。

不要在 `pointermove` / `touchmove` 中无条件调用：

```js
preventDefault()
```

---

## 3.3 更换地点后黑屏

可能原因：

当前 Location Picker 仍然通过页面 Route 来回跳转，例如：

```text
Day
→ push LocationPicker route
→ 选择
→ pop / replace
→ Day 重新创建
```

因此中间可能出现：

- route 空档
- 页面重新 mount
- transition 空白
- 黑屏

需要确认：

- Location Picker 是否仍是独立 Route
- 是否使用 `router.push`
- 是否使用 `router.replace`
- 是否在选择地点后重复 pop / push
- Day 是否被卸载后重新创建

更推荐：

```text
Day 始终保持 mounted
└── Location Picker Overlay / Modal
```

流程：

```text
Day
→ 打开 Location Picker
→ 选择地点
→ 更新 itinerary
→ 关闭 Picker
→ 原 Day 仍然存在
```

这样中间不会出现黑屏。

---

## 3.4 Edit 地点栏“点了没反应，返回后自动跳转”

这一现象很像存在：

- pending navigation
- 延迟执行的 router push
- watcher
- effect
- route state
- deferred callback
- modal 状态等待父页面关闭后才执行

例如可能存在类似逻辑：

```js
pendingOpenLocationPicker = true
```

然后某个 watcher / effect 在 Edit 关闭后执行：

```js
if (pendingOpenLocationPicker) {
  openLocationPicker()
}
```

结果就会变成：

```text
Edit 点击地点
→ 设置 pending 状态
→ 当前没有立即打开
→ 用户返回 Day
→ 条件满足
→ Location Picker 自动打开
```

这类逻辑必须重点排查。

目标行为必须是：

```text
Edit
→ 点击地点
→ Location Picker 立即打开
→ 选择地点
→ 关闭 Location Picker
→ 仍然停留在 Edit
```

不能经过 Day。

也不能留下任何待执行的导航状态。

---

# 4. 推荐的交互架构

本轮建议重新确认 Day Selector 与 Location Picker 的职责。

## 4.1 Day Selector

推荐：

```text
Day Screen
└── Day Selector Overlay / Modal
```

它只负责：

```text
选择 Day
→ 更新 activeDay
→ 关闭
```

不要让 Day Selector 自己控制复杂 Route。

## 4.2 Location Picker

推荐设计为可复用选择器：

```text
LocationPicker
```

只负责：

```text
展示地点搜索/选择
→ 返回选中的地点
→ 关闭
```

不要让 Location Picker 自己决定：

```text
下一步跳 Day
还是跳 Edit
```

应由调用方决定。

---

# 5. 目标交互流程

## 5.1 Day X

```text
Day
→ 点击 Day X
→ 打开 Day Selector
→ 选择 Day 2
→ Day Selector 关闭
→ 显示 Day 2
→ 再次点击 Day X
→ 仍可正常打开
```

要求连续重复操作都可靠。

## 5.2 Day 左右 Swipe

```text
Day 1
→ 左滑
→ Day 2

Day 2
→ 右滑
→ Day 1
```

同时：

- 上下滚动列表不能误切 Day
- 点击按钮不能误触 Swipe
- 地图拖动不能触发 Day Swipe
- Bottom Sheet 上下拖动不能冲突

## 5.3 Day → 更换地点

```text
Day
→ 某行 ⋯
→ 更换地点
→ Location Picker
→ 选择地点
→ 关闭 Location Picker
→ 回到原 Day
```

要求：

- 不跳 Edit
- 不黑屏
- 不重新加载 Day 页面
- Day 当前滚动/Sheet 状态尽量保持

## 5.4 Edit → 更换地点

```text
Edit Detail
→ 点击地点
→ Location Picker 立即打开
→ 选择地点
→ 关闭 Location Picker
→ 回到 Edit Detail
```

要求：

- 不经过 Day
- 不延迟打开
- 不需要用户返回后才触发
- 不产生 pending navigation

---

# 6. UI 要求

## Day X

显示：

```text
Day 1
2026-03-19
```

删除：

```text
⌄
```

整个：

```text
Day X + 日期
```

区域可点击。

---

# 7. 推荐开发顺序

## Step 1：先定位 Edit → Location Picker 延迟导航

这是当前最异常、最值得优先排查的问题。

重点搜索：

```text
watch
watchEffect
useEffect
pending
openLocation
navigate
router.push
router.replace
router.back
modal state
route state
```

确认是否存在“点击后只记录状态，等页面关闭再执行”的逻辑。

## Step 2：修 Location Picker 生命周期

实现：

```text
Day → Picker → Day
Edit → Picker → Edit
```

不要依赖中间 Route 跳转。

先消除：

- 黑屏
- 延迟跳转
- 返回后自动打开 Picker

## Step 3：修 Day Selector 生命周期

重点确认：

- overlay 是否销毁
- backdrop 是否残留
- pointer-events 是否恢复
- open 状态是否重置
- 第二次打开是否重新正常初始化

删除 Day X 的向下箭头。

## Step 4：重新实现 Swipe

确认 Swipe 监听层正确后，再实现：

```text
左滑 → 下一天
右滑 → 前一天
```

不要把 Swipe 与 Bottom Sheet drag 强行绑在同一个 gesture handler 中。

---

# 8. 实机验收条件

## 8.1 Day Selector

连续执行至少 20 次：

```text
点击 Day X
→ 选择其他 Day
→ 再次点击 Day X
```

要求：

```text
20 / 20 均正常响应
```

不得出现：

- 点不动
- overlay 残留
- 点击区域失效
- 页面假死

## 8.2 Swipe

至少测试：

```text
Day 1 左滑 → Day 2
Day 2 左滑 → Day 3
Day 3 右滑 → Day 2
Day 2 右滑 → Day 1
```

同时验证：

- 上下滚动正常
- `⋯` 点击正常
- Day X 点击正常
- 添加地点正常
- Bottom Sheet 拖动正常
- 地图拖动正常

## 8.3 Day 更换地点

连续测试多次：

```text
Day
→ ⋯
→ 更换地点
→ 选择地点
→ Day
```

要求：

- 不黑屏
- 不进入 Edit
- 不闪烁空白页
- 不重建整个 Day 页面

## 8.4 Edit 更换地点

连续测试多次：

```text
Edit
→ 点击地点
→ Picker
→ 选择
→ Edit
```

要求：

- Picker 立即出现
- 不需要返回页面才能触发
- 不经过 Day
- 不出现延迟跳转
- 返回 Day 后不得再次自动弹出 Picker

---

# 9. 给开发 Agent 的执行要求

请不要直接假设根因。

先阅读现有实现并确认：

1. Day Selector 当前是 Route、Modal、Sheet 还是普通 DOM Overlay
2. Day Selector 关闭后是否真正 unmount
3. 是否存在残留 backdrop / overlay
4. Bottom Sheet 的 drag 事件在哪里监听
5. Swipe 当前监听在哪里
6. Location Picker 当前是 Route 还是 Overlay
7. Day → Location Picker 当前使用什么导航方式
8. Edit → Location Picker 当前使用什么导航方式
9. 是否存在 pending navigation
10. 是否存在 watcher/effect 在页面关闭后继续触发跳转

---

# 10. 修改完成后请反馈

请输出：

1. 每个问题的最终根因
2. 修改了哪些文件
3. 每个文件做了什么修改
4. Day Selector 为什么会第二次失效
5. Swipe 为什么此前没有生效
6. Day 更换地点为什么出现黑屏
7. Edit 地点为什么出现延迟跳转
8. 当前 Location Picker 最终采用什么打开/关闭方式
9. 是否还保留 Router 跳转
10. 实机回归测试结果
11. 是否仍有风险点

---

# 11. 本轮目标

本轮不是继续增加新功能。

目标是彻底稳定以下三套交互：

```text
Day Selector
Location Picker
Day Swipe
```

最终要求：

```text
点击可靠
弹层生命周期明确
导航无副作用
不黑屏
不延迟跳转
Swipe 与滚动/点击互不冲突
```
