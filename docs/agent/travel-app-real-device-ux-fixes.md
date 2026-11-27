# Travel App — 实机测试修正需求

## 1. 背景

当前 Travel App 在实机测试中发现了一些交互问题，主要集中在：

1. Day 页面部分按钮点击偶发无响应
2. 地点更换后的页面返回逻辑不合理
3. Day 行程项操作入口不够完整
4. 编辑详情页面信息布局较分散
5. Day 左右滑动切换尚未实现

本轮修改目标：

- 修复点击可靠性
- 统一页面导航逻辑
- 简化行程编辑流程
- 优化编辑详情的信息结构
- 实现 Day 间的左右滑动切换

---

# 2. P0：修复点击偶发无响应

## 2.1 当前问题

以下操作在实机上经常出现点击没有反应：

### Day 页面
- 点击顶部 `Day X`
- 点击某个行程右侧 `⋯`

### 编辑详情页面
- 点击日期栏中的 `Day X`

该问题属于最高优先级问题，应首先排查。

## 2.2 排查重点

不要只重新绑定 click 事件，需要重点检查：

- touch / pointer / click 事件是否冲突
- Bottom Sheet 的 drag 手势是否抢占点击
- 是否存在透明 overlay 覆盖按钮
- z-index 是否异常
- pointer-events 是否异常
- 父元素是否拦截事件
- stopPropagation / preventDefault 是否使用不当
- 滑动手势识别是否将普通点击误判为 swipe

## 2.3 点击区域规范

### Day X

不要只让文字本身响应点击。

建议 `Day X + 日期` 整块区域可点击：

```text
      Day 1
   2026-03-19
```

点击区域高度建议至少 44px。

### `⋯` 菜单

实际点击区域至少：

```text
44 × 44 px
```

视觉上的 `⋯` 可以保持原尺寸。

需要阻止点击事件冒泡到行程项本身，例如：

```vue
@click.stop
```

或等价实现。

---

# 3. P0：重构 Location Picker 返回逻辑

## 3.1 从 Day 页面进入

当前错误流程：

```text
Day
↓
⋯
↓
更换地点
↓
Location Picker
↓
选择地点
↓
编辑详情
```

正确流程：

```text
Day
↓
更换地点
↓
Location Picker
↓
选择地点
↓
Day
```

## 3.2 从编辑详情进入

当前错误流程：

```text
Edit Detail
↓
更换地点
↓
Location Picker
↓
Day
↓
Edit Detail
```

正确流程：

```text
Edit Detail
↓
更换地点
↓
Location Picker
↓
Edit Detail
```

## 3.3 设计原则

Location Picker 不应该自己决定：

```text
选择完地点后跳转到哪个页面
```

它只负责：

```text
选择地点
↓
返回选择结果
↓
关闭
```

调用者负责决定后续页面。

理想结构：

```text
Day
 └─ Location Picker
      └─ 选完 → 返回 Day
```

```text
Edit Detail
 └─ Location Picker
      └─ 选完 → 返回 Edit Detail
```

优先考虑：

```text
Modal / Sheet + Callback
```

例如：

```js
openLocationPicker({
  currentPlace,
  onSelect(place) {
    updatePlace(place)
  }
})
```

选择地点之后：

```js
updatePlace(place)
closeLocationPicker()
```

尽量避免由 Location Picker 自己执行：

```js
router.push('/edit')
```

如果现有架构必须走 Router，则至少保存来源：

```js
origin: 'day'
```

或：

```js
origin: 'edit'
```

然后返回来源页面。

---

# 4. P1：重构 Day 行程项 `⋯` 菜单

## 当前菜单

```text
Shinagawa Sta.

更改地点
编辑详情
```

## 修改为

```text
Shinagawa Sta.

更换地点
更改日期
编辑详情

────────────

删除行程
```

## 各项行为

### 更换地点

```text
Day
↓
⋯
↓
更换地点
↓
Location Picker
↓
选择
↓
返回当前 Day
```

不要进入 Edit Detail。

### 更改日期

打开 Day / 日期选择器，例如：

```text
移动到

Day 1 · 3月19日
Day 2 · 3月20日
Day 3 · 3月21日
Day 4 · 3月22日
```

选择后：

```text
更新 itinerary item 的 day/date
↓
关闭菜单
↓
当前 Day 列表刷新
```

如果项目移动到了其他 Day：

- 当前 Day 中该项目消失
- 不需要自动跳转到目标 Day

### 编辑详情

正常进入：

```text
Edit Detail
```

### 删除行程

作为危险操作放在菜单最下方，并与其他操作视觉分隔。

---

# 5. P1：删除 Edit Detail 中的日期修改入口

当前编辑详情底部：

```text
日期

Day 1 · 3月19日 >
```

建议删除。

日期修改统一放到：

```text
Day → 行程 ⋯ → 更改日期
```

这样交互入口更集中，也能减少编辑详情页面的信息负担。

---

# 6. P1：重新整理 Edit Detail 页面结构

## 当前结构

目前大致为：

```text
名称

类型

时间

备注

地点

Google Maps

日期

在地图中查看
```

名称与地点距离较远，信息层级较散。

## 推荐结构

修改为：

```text
名称
┌─────────────────────┐
│ Shinagawa Sta. │
└─────────────────────┘

地点
Shinagawa Sta.              >

在地图中查看 ↗


类型
景点   餐饮   住宿   活动   交通   其他


时间
无时间     时段     具体时间

上午   中午   下午   晚上


备注
┌─────────────────────┐
│                     │
│                     │
└─────────────────────┘
```

整体顺序：

```text
名称
↓
地点
↓
类型
↓
时间
↓
备注
```

---

# 7. 删除 Google Maps Logo

当前：

```text
地点
Shinagawa Sta.

Google Maps
```

中间的 Google Maps Logo / 字样不需要，直接删除。

## 如果打开 App 内地图

显示：

```text
在地图中查看 ↗
```

即可。

## 如果打开外部 Google Maps

显示：

```text
在 Google Maps 中打开 ↗
```

即可。

不需要额外单独显示 Google Maps Logo。

---

# 8. P1：优化 Day X 的交互

当前：

```text
‹

Day 1
2026-03-19

›
```

`Day 1` 看起来更像普通标题，用户不容易意识到可以点击。

建议：

```text
‹        Day 1 ⌄        ›
         2026-03-19
```

其中：

```text
Day 1
+
2026-03-19
```

整个中间区域都可以点击。

## 点击后打开 Day Selector

例如：

```text
选择日期

✓ Day 1     3月19日
  Day 2     3月20日
  Day 3     3月21日
  Day 4     3月22日
```

选择后直接切换 Day。

---

# 9. P2：实现 Day 左右滑动

Day 页面目前已有：

```text
‹ Day 1 ›
```

需要增加左右滑动。

## 手势

```text
左滑 → 下一天
右滑 → 前一天
```

## Swipe 生效区域

不要在地图区域监听 Day Swipe。

因为地图本身需要：

```text
左右拖动
上下拖动
缩放
```

否则会产生严重手势冲突。

Swipe 只在下方 Day Bottom Sheet 内生效，例如：

```text
┌──────────────────────┐
│        Day 1         │
│      2026-03-19      │
│                      │
│ + 添加地点           │
│                      │
│ 上午  Shinaga... ⋯   │
└──────────────────────┘
```

---

# 10. Swipe 判定规则

避免用户上下滚动列表时误切换 Day。

建议只有满足：

```text
abs(dx) > 50px
```

并且：

```text
abs(dx) > abs(dy) * 1.2
```

才认定为横向 Swipe。

也就是说，必须明显是横向移动，而不是斜向或纵向滚动。

---

# 11. Swipe 与点击事件隔离

以下元素操作时，不应该触发 Swipe：

```text
⋯
按钮
输入框
Day Selector
添加地点
行程操作菜单
其他交互控件
```

可以考虑给这些区域加：

```html
data-no-swipe
```

例如：

```html
<button data-no-swipe>
  ⋯
</button>
```

Swipe Handler 检测事件 target：

```js
if (event.target.closest('[data-no-swipe]')) {
  return
}
```

---

# 12. 不建议的实现

不要简单在整个 Bottom Sheet 上：

```js
touchstart
touchmove
touchend
```

然后在 `touchmove` 中无条件：

```js
preventDefault()
```

否则很可能导致：

- Day X 点击失效
- `⋯` 点击失效
- 页面滚动异常
- Bottom Sheet 拖动异常

Swipe 应该先判断方向，再决定是否接管手势。

---

# 13. 修改后的整体交互结构

## Day 页面

```text
                   Day 页面
                       │
        ┌──────────────┼──────────────┐
        │              │              │
    点击 Day X        点击 ‹ ›       左右 Swipe
        │              │              │
   Day Selector      上/下一天       上/下一天
```

## 行程操作

```text
Shinagawa Sta.                 ⋯
                                     │
                  ┌──────────────────┼──────────────┐
                  │                  │              │
               更换地点            更改日期       编辑详情
                  │                  │              │
          Location Picker       Day Selector       Edit
                  │
                选择
                  │
              返回 Day
```

## Edit Detail

```text
Edit Detail
    │
    ├─ 名称
    │
    ├─ 地点
    │    │
    │    └─ Location Picker
    │           │
    │           └─ 返回 Edit Detail
    │
    ├─ 类型
    │
    ├─ 时间
    │
    └─ 备注
```

Edit Detail 中不再修改日期。

---

# 14. 推荐开发顺序

为了避免 Swipe 进一步干扰现有点击事件，建议按照以下顺序修改：

## Step 1
修复：

```text
Day X 点击偶发无响应
⋯ 点击偶发无响应
```

确认基础点击已经稳定。

## Step 2
重构 Location Picker：

```text
从 Day 打开 → 返回 Day
从 Edit 打开 → 返回 Edit
```

## Step 3
修改 `⋯` 行程操作菜单：

```text
更换地点
更改日期
编辑详情
删除行程
```

## Step 4
调整 Edit Detail：

```text
名称
地点
类型
时间
备注
```

删除：

```text
日期
Google Maps Logo
```

## Step 5
实现：

```text
Day 左右 Swipe
```

最后处理手势冲突。

---

# 15. 验收条件

## 15.1 点击

连续点击 Day 标题至少 20 次：

```text
20 / 20 正常响应
```

连续点击不同 itinerary 的 `⋯`：

```text
20 / 20 正常响应
```

不能出现点击无反应。

## 15.2 更换地点

### Day 页面进入

```text
Day
→ 更换地点
→ 选择地点
→ Day
```

不能进入 Edit Detail。

### Edit Detail 进入

```text
Edit
→ 更换地点
→ 选择地点
→ Edit
```

不能闪现 Day 页面。

## 15.3 更改日期

```text
Day 1
→ itinerary ⋯
→ 更改日期
→ Day 2
```

结果：

```text
项目从 Day 1 移除
项目出现在 Day 2
```

## 15.4 Day Swipe

```text
Day 1 左滑 → Day 2
Day 2 右滑 → Day 1
```

同时测试：

```text
上下滚动列表
点击 ⋯
点击 Day X
点击添加地点
操作地图
```

均不能误触 Day Swipe。

---

# 16. 本轮修改原则

本轮不要只针对 UI 表面打补丁。

重点检查并统一：

```text
Navigation
Touch / Pointer Event
Bottom Sheet Gesture
Location Picker 返回机制
Day 状态管理
```

尤其 Location Picker 应设计为：

```text
通用选择组件
```

而不是：

```text
选择完成后固定跳转到某个页面的页面
```

避免以后其他页面调用 Location Picker 时再次出现类似导航问题。

---

# 17. 给开发 Agent 的执行要求

请先阅读现有项目代码，确认：

- Day 页面组件结构
- Bottom Sheet / Sheet 手势实现
- Day 切换逻辑
- Location Picker 的调用方式
- Edit Detail 的导航方式
- itinerary item 的 day/date 数据结构

然后按照本文档优先级逐项修改。

不要在未定位当前点击失效原因之前直接加入新的全局 Swipe 监听。

完成后请输出：

1. 修改了哪些文件
2. 每个文件修改了什么
3. 点击失效的根因
4. Location Picker 返回逻辑如何重构
5. Swipe 如何避免与点击、滚动、地图拖动冲突
6. 是否存在仍需人工确认的风险点
7. 建议的实机回归测试项目
