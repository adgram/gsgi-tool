# GSGI 依赖与配置要求 / GSGI Dependencies & Requirements

## 系统要求 / System Requirements

| 组件 / Component | 最低要求 / Minimum | 推荐 / Recommended |
|------|----------|------|
| Node.js | 18.x | 20.x LTS |
| npm | 9.x | 10.x |
| Python | 3.10 | 3.12+ |
| 内存 / Memory | 512 MB | 2 GB+ |
| 浏览器 / Browser | Chrome 90+ / Edge 90+ / Firefox 90+ | 最新稳定版 / Latest stable |

## 项目组件与依赖 / Project Components & Dependencies

### 1. Web 编辑器 / Web Editor (`web-editor/`)

**运行依赖 / Runtime Dependencies**

| 包名 / Package | 版本 / Version | 说明 / Description |
|------|------|------|
| [paper](https://paperjs.org/) | ^0.12.17 | 矢量图形渲染引擎 / Vector graphics rendering engine |

**开发依赖 / Dev Dependencies**

| 包名 / Package | 版本 / Version | 说明 / Description |
|------|------|------|
| [vite](https://vitejs.dev/) | ^6.0.0 | 构建工具与开发服务器 / Build tool & dev server |

**安装 / Installation**

```bash
cd web-editor
npm install
```

**脚本 / Scripts**

| 命令 / Command | 用途 / Purpose |
|------|------|
| `npm run dev` | 启动开发服务器（默认 http://localhost:3000）/ Start dev server |
| `npm run build` | 构建生产版本到 `dist/` / Build production to `dist/` |
| `npm run preview` | 预览构建产物 / Preview build output |

**关键技术决策 / Key Technical Decisions**

- 使用原生 DOM 事件而非 Paper.js 事件系统，以解决中间键平移和框选的可靠性问题
  Uses native DOM events instead of Paper.js event system for reliable middle-button panning and box selection
- 所有几何计算（引用链解析、曲线求值、凸度→弧转换）在 `core/` 层完成，与渲染解耦
  All geometry calculations (reference chain resolution, curve evaluation, bulge→arc conversion) are done in `core/`, decoupled from rendering
- 撤销/重做基于 JSON 快照比对，仅在数据变化时压栈
  Undo/redo based on JSON snapshot diffing, pushes to stack only when data changes

---

### 2. 格式转换器 / Format Converter (`converter/`)

计划中，尚未实现。预期依赖：
Planned, not yet implemented. Expected dependencies:

| 依赖 / Dependency | 用途 / Purpose |
|------|------|
| Python 3.10+ | 运行环境 / Runtime environment |
| [ezdxf](https://ezdxf.mozman.at/) | DXF 文件读写 / DXF file I/O |
| ODA File Converter | DWG → DXF 转换（可选）/ DWG → DXF conversion (optional) |

---

### 3. 数据模型 / Data Model (`schema/`, `core/`)

核心数据模型在 `web-editor/src/core/` 中以 TypeScript 实现，包含：
The core data model is implemented in TypeScript under `web-editor/src/core/`, including:

| 文件 / File | 职责 / Responsibility |
|------|------|
| `entity.ts` + `entities/` | Entity 基类、21 种实体类 / Entity base class, 21 entity types |
| `document.ts` | GSGIDocument、BlockDef、TYPE_MAP、工厂函数 / Factory functions |
| `geometry.ts` | Point2d、ArcCurve、BoundBox、交并计算 / Intersection & geometry ops |
| `resolver.ts` | 坐标引用链解析、参数曲线求值、缓存 / Reference chain resolution |
| `SnapManager.ts` | 对象捕捉引擎 / Snap engine |
| `transform.ts` | 2×3 仿射变换矩阵、数学工具 / 2×3 affine transform matrix |

无外部依赖，所有几何计算均为纯 TypeScript。
No external dependencies, all geometry calculations are pure TypeScript.

## 浏览器兼容性 / Browser Compatibility

| 特性 / Feature | 支持情况 / Support |
|------|----------|
| ES Modules | 需要 / Required |
| Canvas 2D | 需要 / Required |
| Pointer Events | 需要（用于鼠标交互）/ Required (mouse interaction) |
| File API | 需要（用于打开 .gsgi 文件）/ Required (open .gsgi files) |
| Drag & Drop | 需要（用于拖拽打开文件）/ Required (drag-drop files) |

所有现代浏览器（Chromium 内核、Firefox、Safari 15+）均受支持。
All modern browsers (Chromium-based, Firefox, Safari 15+) are supported.

## 开发环境配置 / Dev Environment Setup

### Windows

```powershell
# 安装 Node.js（推荐通过 winget 或 nvm-windows）
# Install Node.js (via winget or nvm-windows recommended)
winget install OpenJS.NodeJS.LTS

# 安装 Python / Install Python
winget install Python.Python.3.12

# 安装项目依赖 / Install project dependencies
cd web-editor
npm install
```

### macOS / Linux

```bash
# 安装 Node.js (推荐通过 nvm)
# Install Node.js (via nvm recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 20

# 安装项目依赖 / Install project dependencies
cd web-editor
npm install
```

## 部署要求 / Deployment Requirements

静态部署时只需 `web-editor/dist/` 目录的全部文件，放置于任意 HTTP 服务器即可访问。
For static deployment, just serve all files in `web-editor/dist/` via any HTTP server.

**注意**：由于浏览器安全策略，`file://` 协议下部分功能可能受限，建议通过 HTTP 服务器访问。
**Note**: Due to browser security policies, some features may be limited under `file://` protocol. Access via HTTP server is recommended.
