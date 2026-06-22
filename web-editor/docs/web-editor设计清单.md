# web-editor 设计清单

## 1. 项目概述

### 1.1 目标

实现 GSGI（General Simple Geometry Information）数据模型的**Web 查看器/编辑器**：基于 Paper.js 的轻量级 GSGI 文件浏览和基础编辑

### 1.2 项目依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| Paper.js | v0.13.x | 2D 路径渲染、HitTest、交互 |
| Vite | v6.x | 开发服务器和构建 |
| npm | — | 包管理 |

---

## 2. 项目结构

```
web-editor/
├── index.html                  # 入口 HTML
├── vite.config.js              # Vite 构建配置
├── package.json
├── tsconfig.json               # TypeScript 配置（strict mode）
├── default_demo/               # 启动时加载的演示 .gsgi 文件
├── assets/icons/               # SVG 工具图标
├── docs/                       # 设计文档
│   ├── web-editor设计清单.md     # 本文件
│   ├── 工具操作.md              # 工具操作流程
│   ├── 接口统一.md              # 接口组织
│   └── CLI命令参考.md           # 命令行参考
├── src/
│   ├── main.ts                 # 入口：初始化 Viewer、示例数据
│   ├── core/                   # 数据模型（TypeScript）
│   │   ├── entity.ts           # Entity 基类 + GripPoint / IResolver 接口
│   │   ├── document.ts         # GSGIDocument、BlockDef、TYPE_MAP、createEntity
│   │   ├── geometry.ts         # Point2d / ArcCurve / PolyarcCurve / BoundBox / 样条
│   │   ├── transform.ts        # 2×3 仿射变换矩阵
│   │   ├── resolver.ts         # 引用解析引擎（缓存 + 依赖追踪）
│   │   ├── barrel.ts           # 批量导出 + batchTransform / batchMirror
│   │   ├── color-resolver.ts   # ACI→Hex / ByLayer 颜色解析
│   │   ├── types.ts            # 共享接口（PointData / SnapResult / CmdHistoryEntry…）
│   │   └── entities/           # 21 种实体类
│   │       ├── point.ts        # point / param_pt
│   │       ├── line.ts         # line / polyline
│   │       ├── arc.ts          # arc / polyarc / polycurve / subsegment
│   │       ├── circle.ts       # circle / rectangle
│   │       ├── spline.ts       # spline_fit / spline_cv
│   │       ├── text.ts         # text / dimension / table
│   │       ├── block.ts        # block_ref / xref / subsegment
│   │       └── annotation.ts   # region_anno / position / coord_sys / custom_entity
│   ├── render/                 # 渲染引擎
│   │   ├── renderer.ts         # 主渲染器：图层管理、分发、注册
│   │   ├── render-visitor.ts   # 策略分发：每种实体类型 → Paper.js 对象
│   │   ├── layer-manager.ts    # 图层分组、构建、目标层选择
│   │   ├── paper-utils.ts      # makePath / applyStyle / linetypeDashArray
│   │   └── screen-fixed.ts     # 屏幕固定元素创建/更新
│   └── viewer/                 # 交互层（TypeScript）
│       ├── Viewer.ts           # 主类：事件绑定、命令处理、模态框、缩放、撤销
│       ├── controllers/
│       │   ├── DrawToolController.ts      # 工具状态机 + 通用选择/绘图逻辑
│       │   ├── TransformToolController.ts # 移动/复制/旋转/镜像交互
│       │   ├── ContextMenuController.ts   # 右键菜单
│       │   ├── PropertyPanelController.ts # 属性面板
│       │   └── LayerController.ts         # 图层面板
│       ├── tools/
│       │   └── draw-handlers.ts           # 21+ 绘制 handler 策略模式 + DRAW_HANDLER_MAP
│       ├── selection/
│       │   ├── SelectionManager.ts        # 点选/框选/加选
│       │   └── GripManager.ts             # 夹点创建/拖拽/更新
│       ├── snap/
│       │   └── SnapManager.ts             # 对象捕捉 + 栅格
│       ├── commands/
│       │   ├── CLI.ts                     # 命令行解释器
│       │   └── UndoManager.ts             # 撤销/重做栈
│       ├── files/
│       │   └── FileOps.ts                 # 文件打开/保存/新建/标签页
│       ├── ui/
│       │   ├── Toolbar.ts                 # 工具栏按钮
│       │   ├── TabManager.ts              # 文档标签
│       │   ├── SnapGrid.ts                # 栅格 + 捕捉切换
│       │   ├── ScaleController.ts         # 比例选择
│       │   └── MenuManager.ts             # 下拉菜单
│       └── util/
│           ├── clipboard.ts               # cloneDocumentData / createUndoCommand
│           ├── file.ts                    # 文件对话框
│           ├── snapshot.ts                # 文档快照
│           └── ui.ts                      # 模态对话框等 UI 工具
```

---

## 3. 数据模型核心层（src/core/）

### 3.1 entity.ts + document.ts + entities/

#### 实体基类 Entity

所有实体继承自 `Entity`，提供通用字段和接口：

```
通用字段：id, type, layer, color, linetype, lineweight, visible, description, scale
基础方法：toJSON, getBounds, getProperties, setProperty, render, getGripPoints, onGripDrag
渲染工具：resolvePt, _applyStyle, _makePath, _boundsFromPoints
```

- `getProperties()` 返回可编辑属性列表（用于属性面板渲染）
- `setProperty(key, value)` 属性面板修改时的数据更新入口

#### TYPE_MAP（21 种）

```
point, param_pt, line, polyline, polyarc, polycurve,
circle, arc, rectangle, text,
spline_fit, spline_cv, block_ref, xref, table,
subsegment, dimension, region_anno, position, coord_sys,
custom_entity
```

#### 各类型要点

| 类型 | 关键字段 | 说明 |
|------|---------|------|
| `point` | `point[x,y]`, `ref_pt`, `point_role`, `construction` | 可参照其他点 |
| `param_pt` | `curve_ref`, `t`, `point[x,y]`, `label` | 曲线参数点 |
| `line` | `start_ref`, `end_ref` | 两端点引用 |
| `polyline` | `points[x,y][]`, `closed` | 顶点坐标数组（非引用） |
| `polyarc` | `point_refs[]`, `bulges[]`, `closed` | bulge→arc 弧形多段线 |
| `polycurve` | `segments[]`, `closed` | 复合子段（line/arc/curve_ref/subsegment_ref） |
| `circle` | `center_ref`, `r` | 圆 |
| `arc` | `start_ref`, `mid_ref`, `end_ref` | 三点弧 |
| `rectangle` | `min_ref`, `max_ref` | 对角矩形 |
| `text` | `position_ref`, `text`, `height`, `rotation` | 单行文字（旋转用度） |
| `spline_fit` | `fit_point_refs[]`, `degree`, `closed` | 拟合样条 |
| `spline_cv` | `control_point_refs[]`, `knots[]`, `weights[]`, `degree`, `closed` | 控制点样条 |
| `block_ref` | `block_id`, `position_ref`, `rotation`, `scale_x`, `scale_y`, `attrs{}` | 块参照 |
| `xref` | `file_path`, `position_ref`, `rotation`, `scale_x`, `scale_y` | 外部引用 |
| `table` | `position_ref`, `markdown`, `col_widths[]`, `row_heights[]`, `text_height` | 表格（Markdown 内容） |
| `subsegment` | `curve_ref`, `from_t`, `to_t`, `label` | 曲线子段 |
| `dimension` | `p1_ref`, `p2_ref`, `measurement`, `dim_line_offset`, `category` | 标注 |
| `region_anno` | `edges_refs[]`, `area`, `area_text`, `fill`, `operation` | 区域注释 |
| `position` | `kind`, `ref_a`, `ref_b?`, `value`, `operator?`, `datum?` | 位置关系（point/constraint/text/relation） |
| `coord_sys` | `origin_ref`, `rotation` | 坐标系 |
| `custom_entity` | `entity_type`, `properties{}` | 用户自定义类型 |

### 3.2 resolver.js

#### 引用解析引擎

GSGI 的引用链（point → param_pt → curve_ref）是全局复杂性最高的模块。

```
引用链示例：
  dimension.p1_ref → point.id="P1"
    → point.ref_pt → param_pt.id="PP1"
      → param_pt.curve_ref → polyline.id="E3"
      → param_pt.t = 2.5

解析流程：
  1. resolve(id) 缓存查找 → 未命中则递归解析
  2. 若为 param_pt：curveRef = resolve(curve_ref)，调用 curve.eval(t)
  3. 若为 point + ref_pt：base = resolve(ref_pt)，坐标 = base + point
  4. 递归终止：无引用的 point（WCS 绝对坐标）
```

**核心接口**：

```ts
resolve(id)          // 任意引用 → 世界坐标（递归解析 + 缓存）
getCurve(entityId)   // 解析 entity 的曲线对象
get(id)              // 按 id 获取实体（支持循环检测）
```

**依赖追踪**：

```
polyline "E3" 被编辑
  → resolver._cache 中依赖 "E3" 的条目失效
    → param_pt "PP1" 重新 resolve，触发重算
      → point "P1" 重新 resolve，触发重算
        → dimension "D1" 重算 measurement
```

- `_dependents` Map: `providerId → Set<consumerId>`
- `_trackDep(fromId, toId)`：自动追踪解析路径
- `_cache` Map: `entityId → Point2d`（已计算的缓存坐标）
- `_buildCache(ids?)`：重建指定实体缓存（全量或增量）
- 注意：不再有 `invalidate(id)` 接口；依赖失效通过 `_buildCache` 重建实现

### 3.3 transform.ts

2×3 仿射变换矩阵：

```ts
new Transform(a, b, tx, c, d, ty)
// 结果: x' = a·x + b·y + tx
//       y' = c·x + d·y + ty
```

静态工厂：`identity()`, `translation(dx, dy)`, `scaling(sx, sy)`, `rotation(deg)`
实例方法：`applyTo(x,y)`, `applyToArray(p)`, `multiply(t)`, `toArray()`, `invert()`

### 3.4 geometry.ts

几何工具集合，无类依赖：

| 导出 | 说明 |
|------|------|
| `Point2d` | 二维点类：`new Point2d(x, y)` → `.x/.y/.len()/.dist()/.sub()/.add()/.lenSq()/.dot()/.angle()` |
| `ArcCurve` | 弧曲线：`new ArcCurve(segment, closed)` → `.eval(t)`/`.nearestPoint(p)`/`.length()` |
| `getArcCurve` | 从 polyarc 段构造 ArcCurve |
| `getPolyPoints` | 从 point_refs 列表解析坐标数组 |
| `BoundBox` | 包围盒：`union()`/`contains()`/`containsPoint()` |
| `lineIntersect` | 两线段交点检测 |
| `splineCvPoint` | 样条控制点 → 曲线求值（De Boor 算法） |
| `splineFitPoints` | 三次 Catmull-Rom → 均匀 B 样条 |

### 3.5 SnapManager

路径: `viewer/snap/SnapManager.ts`

对象捕捉引擎，当鼠标移动时遍历所有可捕捉实体：

- `snapPoint(pt)` → `{x,y}` 主入口，按优先级尝试：对象捕捉 → 最近点 → 栅格
- `_findBestSnap(pt, tolerance)` 对象捕捉：端点/中点/圆心/象限点/顶点
- `_findNearestOnCurve(pt)` 最近点捕捉：曲线上最近点
- `updateSnapIndicator(pt)` 橙色圆环指示器
- 支持切换启用/禁用（F9），栅格捕捉独立控制（F7）

---

## 4. 渲染层（src/render/renderer.ts）

### 4.1 技术选型

| 项 | 选择 | 理由 |
|----|------|------|
| 渲染引擎 | Paper.js | 路径 API 优美，支持弧/曲线/合成路径，HitTest 精确 |
| 数据绑定 | 手动同步（GSGI JSON ↔ Paper.js Layer） | 无框架依赖，数据结构清晰 |
| 构建工具 | Vite | 快速 HMR，零配置即可用 |
| 包管理 | npm | 标准生态 |

### 4.2 渲染器架构

渲染器采用 **Renderer + RenderVisitor 策略模式**：

```
Renderer.render()
  ├─ _collectReferencedPoints()         // 收集被引用的构造点
  ├─ buildLayerGroups(...)              // 构建图层分组（layer-manager.ts）
  ├─ for each entity: _renderEntityToParent(entity, layer)
  │    └─ _dispatchers[entity.type](entity, layer)   // RenderVisitor 分发
  └─ _registerEntityItems(entity, items)  // 注册到 itemMap / entityItems
```

**Renderer**（`render/renderer.ts`）:
- `clear()` 清除所有 Paper.js 图层
- `render()` 全量重绘
- `renderBlock(blockDef, ...)` 块参照内部展开渲染
- `entityItems` / `itemMap` / `hitItems` 实体 ↔ Paper.js items 映射

**RenderVisitor**（`render/render-visitor.ts`）:
- 每种实体类型注册一个 `(entity, parent) → paper.Item[] | null` 处理器
- 统一处理样式、屏幕固定元素

### 4.3 实体类型到 Paper.js 映射

| GSGI 类型 | Paper.js 对象 | 说明 |
|-----------|---------------|------|
| `point` | `PointText` + 十字标记 | 构造点用虚线十字 |
| `param_pt` | `PointText` + `Path.Circle` | 带参数值标签 |
| `line` | `Path` 两点线段 | 简单线 |
| `polyline` | `Path` + segments | 直线段多段线 |
| `polyarc` | `Path` + segments + 弧 | bulge→arc 转换 |
| `polycurve` | `Path` + 复合 segments | 拼接各类子段（line/arc/curve_ref/subsegment_ref） |
| `circle` | `Path.Circle` | 中心+半径 |
| `arc` | `Path` 弧段 | 中心+半径+起止角（弧度） |
| `rectangle` | `Path.Rectangle` | min/max 对角 |
| `text` | `PointText` | 单行文字 |
| `spline_fit` | `Path` + smooth | 平滑插值 |
| `spline_cv` | `Path` + handle | 控制点+阶数 |
| `block_ref` | `Group` | 展开块定义实体 |
| `dimension` | `Group`（线+文字+箭头） | 自定义标注组 |
| `region_anno` | `Path` + 半透明填充 | 区域高亮 |
| `position` | 不渲染 | 仅面板显示 |
| `coord_sys` | `Group`（箭头+文字） | 坐标系图标 |
| `subsegment` | `Path` 截取片段 | 沿曲线的子段 |
| `xref` | `Group`（从外部文件加载） | 引用解析 |
| `table` | `Group` 表格线+文字 | 网格+文字 |
| `custom_entity` | `Path` / `Group` | 自定义渲染（由 `custom_type` 决定） |

> **角度单位规范**：除 text/mtext 的 `rotation` 使用**度**外，所有 GSGI 角度字段（arc.start_angle/end_angle, block_ref.rotation 等）使用**弧度**。渲染层在构造 Paper.js 对象时统一转换为度。

> **比例因子**：`properties.scale` 仅作为创建新实体时 `entity.scale` 的初始值（元数据），不参与渲染计算。渲染尺寸 = 实际尺寸 × `entity.scale`。

---

## 5. 交互层（src/viewer/）

### 5.1 文件拆分

Viewer 层已从单个 `viewer.js` 拆分为多个文件：

| 文件 | 负责 |
|------|------|
| `Viewer.ts` | 主类：事件绑定、命令处理、模态框、缩放、撤销代理 |
| `controllers/DrawToolController.ts` | 工具状态机 + `beginDrawing`/`beginSelection` + 通用绘制/擦除 |
| `controllers/TransformToolController.ts` | 移动/复制/旋转/镜像的交互、预览、提交 |
| `controllers/ContextMenuController.ts` | 右键上下文菜单 |
| `controllers/PropertyPanelController.ts` | 属性面板树形展示 |
| `controllers/LayerController.ts` | 图层面板管理 |
| `tools/draw-handlers.ts` | 21+ 绘制 handler 策略模式 + `DRAW_HANDLER_MAP` |
| `selection/SelectionManager.ts` | 点选/框选/加选/左框(包含)/右框(相交) |
| `selection/GripManager.ts` | 夹点创建/拖拽/更新 |
| `snap/SnapManager.ts` | 对象捕捉 + 栅格显示 |
| `commands/CLI.ts` | 命令行解释器：命令注册、Tab 补全、历史浏览 |
| `commands/UndoManager.ts` | 撤销/重做栈（快照模式） |
| `files/FileOps.ts` | 文件打开/保存/新建/标签页/拖入 |
| `ui/Toolbar.ts` | 工具栏按钮管理 |
| `ui/TabManager.ts` | 文档标签页 |
| `ui/SnapGrid.ts` | 栅格/捕捉 UI |
| `ui/ScaleController.ts` | 比例选择控件 |
| `ui/MenuManager.ts` | 下拉菜单 |
| `util/clipboard.ts` | `cloneDocumentData` / `createUndoCommand` |
| `util/file.ts` | 文件对话框 |
| `util/snapshot.ts` | 文档快照 |
| `util/ui.ts` | 模态对话框等 |

### 5.2 属性面板

属性面板以**树形结构**展示选中实体及其引用链：

```
选中实体
├── 可编辑属性表格（getProperties() → _renderEditableProperties）
│   ├── layer (下拉选择)
│   ├── color (数字输入)
│   ├── linetype (文本)
│   ├── lineweight (数字)
│   ├── visible (布尔)
│   ├── description (文本)
│   └── 类型特有属性...
├── description 说明区块
├── 引用子实体（递归展开）
│   ├── point (P1)
│   │   ├── X (数字) ← 可编辑
│   │   └── Y (数字) ← 可编辑
│   └── ...
└── type-specific 区块
```

- 修改子实体的坐标时，`_setupPropertyEditing` 调用 `setProperty` 后重建 resolver 缓存（`resolver._buildCache()`），确保引用方的渲染使用新坐标。
- 属性修改触发完整撤销快照（`cloneDocumentData`）。

### 5.3 夹点编辑（GripManager.js + ViewerMethods.ts）

1. 选中实体 → `GripManager.showGrips(entity)` → 调用 `entity.getGripPoints(resolver)` 获取 `GripPoint[]`，在各顶点绘制小矩形
2. 鼠标悬停 → 高亮（`#DDEBFF`）
3. 拖拽 → `GripManager.startGripDrag` → `_startGripDrag(gripPt)` 调用 `entity.onGripDrag(resolver, gripPt, initMouse, mouse)`
   - 修改底层 point 坐标
   - 重建 resolver 缓存（`resolver._buildCache()`）
   - 直接更新 Paper.js segment 位置（`_updateRenderedItemDirect`）实现实时反馈
4. 释放 → `_endGripDrag` 全量重绘（`renderer.render()`），推入撤销栈

### 5.4 撤销/重做

基于完整数据快照：

```ts
const before = this._takeDocSnapshot();
// ... 执行操作 ...
const after = this._takeDocSnapshot();
undoManager.push({
  type: 'modify-document', entityId, before, after,
  undo() { self._applyDocSnapshot(before); },
  redo() { self._applyDocSnapshot(after); }
});
```

- `_takeDocSnapshot()` 深度克隆整个文档
- `_applyDocSnapshot(data)` 重建整个文档（`doc.loadJSON()` → `resolver._buildCache()` → `renderer.render()` → 恢复选中状态）
- 支持的操作：属性修改、夹点拖拽、移动/旋转/镜像、比例修改
