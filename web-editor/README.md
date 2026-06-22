# GSGI Web Editor

基于 Paper.js 的 [GSGI](https://github.com/adgram/GSGI) Web 查看器/编辑器，无需 AutoCAD 等外部依赖，直接在浏览器中运行。
A Paper.js-based [GSGI](https://github.com/adgram/GSGI) web viewer/editor that runs directly in the browser with no external dependencies like AutoCAD.

## 快速开始 / Quick Start

```bash
npm install
npm run dev        # 开发服务器，默认 http://localhost:3000 / Dev server, default http://localhost:3000
npm run build      # 构建到 dist/ / Build to dist/
npm run preview    # 预览构建产物 / Preview build output
```

## 操作指南 / Operation Guide

| 操作 / Action | 鼠标/键盘 / Mouse/Keyboard |
|------|-----------|
| 平移视图 / Pan | 鼠标中键拖拽 / Middle mouse drag |
| 缩放 / Zoom | 滚轮（以光标为中心）/ Scroll wheel (cursor-centered) |
| 选择实体 / Select Entity | 左键单击 / Left click |
| 加选/反选 / Add/Invert Selection | Shift + 左键单击，或鼠标中键单击 / Shift + left click, or middle click |
| 框选 / Box Select | 左键拖拽（左→右：完全包含；右→左：交叉）/ Left drag (L→R: window; R→L: crossing) |
| 夹点编辑 / Grip Edit | 选中实体后，拖拽白色方块夹点 / Drag white grip points after selection |
| 取消选择 / Deselect | Esc |
| 撤销 / Undo | Ctrl+Z |
| 重做 / Redo | Ctrl+Shift+Z / Ctrl+Y |
| 打开文件 / Open File | 工具栏「打开」按钮，或拖拽 .gsgi 文件到画布 / Toolbar "Open" button, or drag-drop .gsgi file |
| 保存文件 / Save File | 工具栏「保存」按钮 / Toolbar "Save" button |
| 右键菜单 / Context Menu | 全选、取消选择、缩放到全图、缩放、检查属性 / Select all, deselect, zoom extents, zoom, inspect |

## 项目架构 / Project Architecture

```
src/
├── main.js                 入口：UI 事件绑定、工具栏、示例数据
│                           Entry: UI event binding, toolbar, sample data
├── core/                   数据模型（TypeScript）/ Data Model (TypeScript)
│   ├── entity.ts           Entity 基类 + 实体辅助函数 / Entity base class + helpers
│   ├── document.ts         GSGIDocument、BlockDef、TYPE_MAP、工厂函数 / Factory functions
│   ├── geometry.ts         几何工具：Point2d、ArcCurve、BoundBox、交并计算
│   │                       Geometry utilities
│   ├── resolver.ts         引用解析器：缓存 + 依赖追踪 / Reference resolver: cache + dependency tracking
│   ├── SnapManager.ts      对象捕捉引擎 / Snap engine
│   ├── transform.ts        2×3 仿射变换矩阵 / 2×3 affine transform matrix
│   └── entities/           21 种实体类 / 21 entity classes
├── render/
│   └── renderer.ts         渲染引擎：图层管理、实体→Paper.js 分发渲染
│                           Rendering engine: layer management, entity→Paper.js dispatch
└── viewer/                 交互层（TypeScript + JavaScript）/ Interaction layer
    ├── Viewer.ts           Viewer 主类：事件绑定、命令处理 / Viewer main class: events, commands
    ├── ViewerMethods.ts    原型扩展：选择、夹点、缩放、删除 / Prototype extensions: select, grip, zoom, delete
    ├── DrawingTools.ts     绘图工具：line/circle/move/rotate/mirror… / Drawing tools
    ├── EntityDrawHandlers.ts 静态绘制处理器 / Static drawing handlers
    ├── FileOps.ts          文件操作：打开/保存/新建/标签页 / File ops: open/save/new/tabs
    ├── CLI.js              命令行解释器 / CLI interpreter
    ├── UndoManager.js      撤销/重做管理器 / Undo/redo manager
    ├── UIManager.js        UI 面板管理 / UI panel manager
    ├── selection/          选择/夹点/属性管理器 / Selection/grip/property managers
    │   ├── SelectionManager.js
    │   ├── GripManager.js
    │   └── PropertyManager.js
    ├── ui/                 工具栏、图层面板、栅格、标签页等 UI 组件 / UI components
    └── util/               工具函数：剪贴板、快照、文件、弹窗 / Utilities: clipboard, snapshot, file, dialogs
```

### 关键设计 / Key Design Decisions

- **实体自包含 / Self-contained Entities**：每个实体类拥有 `render()`、`getGripPoints()`、`onGripDrag()` 方法 / Each entity class has its own render, grip, and drag methods
- **引用-点架构 / Reference-Point Architecture**：线/圆/弧等实体的几何通过 `_ref` 引用独立 PointEntity，修改点坐标即可移动关联实体 / Geometry references independent PointEntity via `_ref`, moving point moves related entities
- **Resolver 依赖追踪 / Resolver Dependency Tracking**：自动追踪实体间的引用链，上游变化时自动失效下游缓存 / Automatically tracks reference chains, invalidates downstream caches on upstream changes
- **原生 DOM 事件 / Native DOM Events**：绕过 Paper.js 事件系统，解决中键平移和框选的可靠性问题 / Bypasses Paper.js event system for reliable middle-button pan and box select
- **夹点编辑 / Grip Editing**：通过 `propPath` 定位实体属性，支持多段线顶点、引用点等多种编辑模式 / Locates entity properties via `propPath`, supports polyline vertices, ref points, etc.
- **撤销/重做 / Undo/Redo**：实体快照对比，仅在数据变化时压栈 / Snapshot diffing, pushes only on data change

## 技术栈 / Tech Stack

- [Paper.js](https://paperjs.org/) v0.12 — 矢量图形渲染 / Vector graphics rendering
- [Vite](https://vitejs.dev/) v6 — 构建工具 / Build tool
- TypeScript + JavaScript 混合，逐步迁移中 / Mixed TS + JS, migration in progress
- 纯浏览器端运行，无需外部服务 / Runs purely in browser, no server required

## GSGI 格式 / GSGI Format

GSGI 格式定义、JSON Schema 及完整实体类型列表请参见上游仓库：
For GSGI format definition, JSON Schema and full entity type list, see the upstream repository:
https://github.com/adgram/GSGI
