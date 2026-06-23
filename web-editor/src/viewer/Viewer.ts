/**
 * 图形视图核心类
 * 管理 Paper.js 画布生命周期、文档对象、渲染器、各子系统控制器、
 * 命令行界面、缩放控制、撤销/重做及全局事件绑定。
 * 通过组合模式聚合 DrawToolController / TransformToolController / PropertyPanelController /
 * LayerController / ContextMenuController 等子控制器。
 */

import paper from 'paper';
import UndoManager from './commands/UndoManager';
import { Point2d } from '../core/geometry';
import { showModal } from './util/ui';
import { nextId, DRAG_THRESHOLD, applyDocumentData, cloneDocumentData, createUndoCommand } from './util/clipboard';
import { batchTransform, Transform } from '../core/barrel';
import { processCLICommand, getCLICommandNames } from './commands/CLI';
import { SnapManager } from './snap/SnapManager';
import { SelectionManager } from './selection/SelectionManager';
import { GripManager } from './selection/GripManager';
import { GSGIDocument } from '../core/document';
import { Renderer } from '../render/renderer';
import { ENTITY_TYPES, Entity } from '../core/entity';
import { DocTab, CmdHistoryEntry } from '../core/types';
import { ContextMenuController } from './controllers/ContextMenuController';
import { PropertyPanelController } from './controllers/PropertyPanelController';
import { LayerController } from './controllers/LayerController';
import { DrawToolController, DrawData } from './controllers/DrawToolController';
import { TransformToolController } from './controllers/TransformToolController';

export class Viewer {
  static _plugins: { name?: string; install(v: Viewer): void }[] = [];

  /** 注册 Viewer 插件 */
  static use(plugin: { name?: string; install(v: Viewer): void }): typeof Viewer {
    Viewer._plugins.push(plugin);
    return Viewer;
  }

  canvas: HTMLCanvasElement;
  doc: GSGIDocument | null = null;
  renderer: Renderer | null = null;
  project!: paper.Project;
  view!: paper.View;
  selectedIds: Set<string> = new Set();
  _undoManager: UndoManager;
  _snapManager: SnapManager;
  _selectionManager: SelectionManager;
  _gripManager: GripManager;
  _tabCounter: number = 0;
  _docTabs: DocTab[] = [];
  _activeTabIndex: number = -1;
  _mouseDownPt: { x: number; y: number } | null = null;
  _isDragging: boolean = false;
  _isBoxSelecting: boolean = false;
  _isPanning: boolean = false;
  _panScreenStart: { x: number; y: number } | null = null;
  _panViewCenter: { x: number; y: number } | null = null;
  _selectionRectItem: paper.Path.Rectangle | null = null;
  _contextMenuController: ContextMenuController;
  _propertyPanelController: PropertyPanelController;
  _layerController: LayerController;
  _drawToolController: DrawToolController;
  _transformToolController: TransformToolController;
  _middleDownPt: { x: number; y: number } | null = null;
  _isMiddleDragging: boolean = false;
  _draggingGrip: unknown = null;

  get _drawTool(): string { return this._drawToolController.drawTool; }
  set _drawTool(v: string) { this._drawToolController.drawTool = v; }
  get _drawStep(): number { return this._drawToolController.drawStep; }
  set _drawStep(v: number) { this._drawToolController.drawStep = v; }
  get _drawData(): DrawData { return this._drawToolController.drawData; }
  set _drawData(v: DrawData) { this._drawToolController.drawData = v; }
  get _drawCallback(): ((val: string) => void) | null { return this._drawToolController.drawCallback; }
  set _drawCallback(v: ((val: string) => void) | null) { this._drawToolController.drawCallback = v; }
  get _previewItems(): paper.Item[] { return this._drawToolController.previewItems; }
  set _previewItems(v: paper.Item[]) { this._drawToolController.previewItems = v; }

  _snapEnabled: boolean = true;
  _gridEnabled: boolean = false;
  _gridItems: paper.Item[] = [];
  _cmdInput: HTMLInputElement | null = null;
  _cmdPrompt: HTMLElement | null = null;
  _cmdHistory: CmdHistoryEntry[] = [];
  _cmdHistoryIndex: number = -1;
  _showCmdHistoryPanel: boolean = false;
  _clearPromptTimer: ReturnType<typeof setTimeout> | null = null;
  _autoSaveInterval: ReturnType<typeof setInterval> | null = null;
  _snapIndicator: paper.Item | null = null;
  _previousSelectedIds: Set<string> | null = null;
  _scaleSelect: HTMLSelectElement | null = null;
  _scaleCustom: HTMLInputElement | null = null;

  /** 构造 Viewer，初始化画布、事件、撤销管理、捕捉、选择、夹点及各 UI 组件 */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.doc = null;
    this.renderer = null;
    this._undoManager = new UndoManager();
    this._snapManager = new SnapManager(this);
    this._selectionManager = new SelectionManager(this);
    this._gripManager = new GripManager(this);

    const sm = this._selectionManager;
    Object.defineProperty(this, 'selectedIds', {
      get() { return sm.selectedIds; },
      set(v) { sm.selectedIds = v; },
      configurable: true,
      enumerable: true
    });
    this._tabCounter = 0;
    this._docTabs = [];
    this._activeTabIndex = -1;

    this._mouseDownPt = null;
    this._isDragging = false;
    this._isBoxSelecting = false;
    this._isPanning = false;
    this._panScreenStart = null;
    this._panViewCenter = null;
    this._selectionRectItem = null;
    this._middleDownPt = null;
    this._isMiddleDragging = false;

    this._draggingGrip = null;

    this._snapEnabled = true;
    this._gridEnabled = false;
    this._gridItems = [];

    this._setupCanvas();
    this._contextMenuController = new ContextMenuController(this);
    this._propertyPanelController = new PropertyPanelController(this);
    this._layerController = new LayerController(this);
    this._drawToolController = new DrawToolController(this);
    this._transformToolController = new TransformToolController(this);
    this._setupEvents();
    this._setupPropertyEditing();
    this._setupToolbar();
    this._setupCmdBar();
    this._setupScaleControl();
    this._snapManager.setupUI();
    this._setupLayerActions();
    this._setupPanelResize();

    window.addEventListener('beforeunload', () => this._persist({ skipDirty: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this._persist({ skipDirty: true });
    });
    this._autoSaveInterval = setInterval(() => this._persist({ skipDirty: true }), 30000);
    for (const plugin of Viewer._plugins) {
      try { plugin.install(this); } catch (e) { console.warn(`插件 ${plugin.name} 安装失败:`, e); }
    }
  }

  // ------ 画布与初始化 ------

  /** 初始化 Paper.js 画布，建立 project 与 view 引用 */
  _setupCanvas(): void {
    paper.setup(this.canvas);
    this.project = paper.project;
    this.view = paper.view;
  }

  // ------ 坐标转换 ------

  /** 世界坐标 → Paper.js 投影坐标（Y 轴翻转） */
  _worldToProject(pt: { x: number; y: number }): paper.Point {
    return new paper.Point(pt.x, -pt.y);
  }

  /** Paper.js 投影坐标 → 世界坐标（Y 轴翻转） */
  _projectToWorld(pt: { x: number; y: number }): paper.Point {
    return new paper.Point(pt.x, -pt.y);
  }

  /** 获取世界坐标系图层（默认图层 '0' 或当前激活层） */
  _getWorldLayer(): paper.Layer {
    return this.renderer?.layerGroups?.get('0') || this.project.activeLayer;
  }

  // ------ 事件处理 ------

  /** 绑定鼠标与键盘事件：单击/拖拽/框选/平移/右键菜单/快捷键等 */
  _setupEvents(): void {
    const canvasEl = this.canvas;

    this._screenToProj = (clientX: number, clientY: number) => {
      const rect = canvasEl.getBoundingClientRect();
      return this._projectToWorld(this.view.viewToProject(new paper.Point(clientX - rect.left, clientY - rect.top)));
    };

    canvasEl.addEventListener('mousedown', this._onCanvasMouseDown);
    document.addEventListener('mousemove', this._onDocMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
    canvasEl.addEventListener('mousemove', this._onCanvasHover);
    canvasEl.addEventListener('mouseleave', this._onCanvasLeave);
    canvasEl.addEventListener('mousedown', this._onCanvasMiddleDown);
    canvasEl.addEventListener('contextmenu', this._onCanvasContextMenu);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('contextmenu', this._onDocContextMenu);
    document.addEventListener('click', this._onDocClick);
  }

  /** 屏幕坐标 → 世界投影坐标 */
  _screenToProj!: (clientX: number, clientY: number) => { x: number; y: number };

  /** 鼠标按下：绘制工具 / 夹点 / 框选 */
  _onCanvasMouseDown = (e: MouseEvent): void => {
    const pt = this._screenToProj(e.clientX, e.clientY);

    if (this._drawTool !== 'select') {
      this._isBoxSelecting = false;
      this._isDragging = false;
      this._clearSelectionRect();
      this._removeGrips();
      e.preventDefault();
      const selTools = new Set(['move','copy','rotate','mirror']);
      if (selTools.has(this._drawTool) && this._drawStep === 0) {
        this._mouseDownPt = { x: pt.x, y: pt.y };
        return;
      }
      this._mouseDownPt = null;
      const snapPt = this._snapManager.snapPoint(pt);
      this._handleDrawClick(snapPt, e, pt);
      return;
    }

    if (this._startGripDrag(pt.x, pt.y)) return;

    this._mouseDownPt = { x: pt.x, y: pt.y };
    this._isDragging = false;
    this._isBoxSelecting = false;
    this._clearSelectionRect();
  };

  /** 鼠标移动：夹点 / 绘制预览 / 平移 / 框选 */
  _onDocMouseMove = (e: MouseEvent): void => {
    if (this._draggingGrip) {
      const pt = this._screenToProj(e.clientX, e.clientY);
      this._doGripDrag(pt.x, pt.y);
      return;
    }

    if (this._drawTool !== 'select') {
      const cursorPt = this._screenToProj(e.clientX, e.clientY);
      const selTools = new Set(['move','copy','rotate','mirror']);
      if (selTools.has(this._drawTool) && this._drawStep === 0 && this._mouseDownPt) {
        if (e.buttons === 1) {
          const d = new Point2d(cursorPt.x, cursorPt.y).dist(new Point2d(this._mouseDownPt.x, this._mouseDownPt.y));
          if (!this._isDragging && d > DRAG_THRESHOLD) this._isDragging = true;
          if (this._isDragging) this._doBoxSelect(cursorPt);
        }
        return;
      }
      if (this._drawTool === 'move' && this._drawStep >= 1) {
        if (this._drawData?.offset) {
          this._setCanvasCursor('crosshair');
          this._transformToolController.updateMovePreview(cursorPt);
        }
      } else if (this._drawTool === 'copy' && this._drawStep >= 1) {
        if (this._drawData?.offset) {
          this._setCanvasCursor('crosshair');
          this._transformToolController.updateCopyPreview(cursorPt);
        }
      } else if (selTools.has(this._drawTool) && this._drawStep > 0) {
        this._setCanvasCursor('crosshair');
      } else {
        this._updateDrawPreview(cursorPt);
      }
      const selectMode = selTools.has(this._drawTool) && this._drawStep === 0;
      if (!selectMode) {
        this._updateSnapIndicator(cursorPt);
      }
      return;
    }

    if (this._isPanning) {
      if (!this._panScreenStart || !this._panViewCenter) return;
      const dx = e.clientX - this._panScreenStart.x;
      const dy = e.clientY - this._panScreenStart.y;
      if (new Point2d(dx, dy).len() > DRAG_THRESHOLD && this._middleDownPt) {
        this._isMiddleDragging = true;
      }
      this.view.center = new paper.Point(
        this._panViewCenter.x - dx / this.view.zoom,
        this._panViewCenter.y - dy / this.view.zoom
      );
      this.view.update();
      this._updateScreenFixedVisuals();
      return;
    }

    if (e.buttons === 1 && this._mouseDownPt) {
      const pt = this._screenToProj(e.clientX, e.clientY);
      const d = new Point2d(pt.x, pt.y).dist(new Point2d(this._mouseDownPt.x, this._mouseDownPt.y));
      if (!this._isDragging && d > DRAG_THRESHOLD) this._isDragging = true;
      if (this._isDragging) this._doBoxSelect(pt);
    }
  };

  _showTransformSelPrompt(): void {
    const selTools = new Set(['move','copy','rotate','mirror']);
    if (selTools.has(this._drawTool) && this._drawStep === 0 &&
        (this._selectionManager?.selectedIds.size ?? 0) > 0) {
      this._setPrompt('已选中，按 Enter 确认');
    }
  }

  /** 鼠标释放：结束夹点 / 框选 / 单击 / 平移 */
  _onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0 && this._draggingGrip) {
      this._endGripDrag();
      this._mouseDownPt = null;
      this._isDragging = false;
      return;
    }

    if (e.button === 0 && this._isBoxSelecting) {
      const pt = this._screenToProj(e.clientX, e.clientY);
      this._endBoxSelect(pt, e.shiftKey);
      this._mouseDownPt = null;
      this._isDragging = false;
      if (!this._drawData) this._drawData = {};
      this._drawData._selectPt = { x: pt.x, y: pt.y };
      this._showTransformSelPrompt();
      return;
    }

    if (e.button === 0 && !this._isDragging && this._mouseDownPt) {
      const pt = this._screenToProj(e.clientX, e.clientY);
      this._handleClick(pt, e.shiftKey);
      this._mouseDownPt = null;
      if (!this._drawData) this._drawData = {};
      this._drawData._selectPt = { x: pt.x, y: pt.y };
      this._showTransformSelPrompt();
      return;
    }

    if (e.button === 1) {
      if (this._isPanning) {
        this._isPanning = false;
        this._panScreenStart = null;
        this._panViewCenter = null;
        this.canvas.style.cursor = '';
      }
      if (!this._isMiddleDragging && this._middleDownPt) {
        this._handleClick(this._middleDownPt, true);
      }
      this._middleDownPt = null;
      this._isMiddleDragging = false;
    }

    this._mouseDownPt = null;
    this._isDragging = false;
  };

  /** 画布悬停：坐标显示 / 吸附指示 */
  _onCanvasHover = (e: MouseEvent): void => {
    if (e.buttons !== 0) return;
    const pt = this._screenToProj(e.clientX, e.clientY);
    const info = document.getElementById('info-pos');
    if (info) {
      const sp = this._snapPoint(pt);
      const snap = this._snapEnabled ? ` [${sp.x.toFixed(1)}, ${sp.y.toFixed(1)}]` : '';
      info.textContent = `坐标: ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}${snap}`;
    }
    const selTools = new Set(['move','copy','rotate','mirror']);
    if (this._drawTool === 'select' || (selTools.has(this._drawTool) && this._drawStep > 0)) {
      this._updateSnapIndicator(pt);
    }
  };

  /** 画布离开：清除吸附指示 */
  _onCanvasLeave = (): void => {
    if (this._snapIndicator) { this._snapIndicator.remove(); this._snapIndicator = null; }
  };

  /** 中键按下：开始平移 */
  _onCanvasMiddleDown = (e: MouseEvent): void => {
    if (e.button !== 1) return;
    e.preventDefault();
    const pt = this._screenToProj(e.clientX, e.clientY);
    this._middleDownPt = { x: pt.x, y: pt.y };
    this._isMiddleDragging = false;
    this._isPanning = true;
    this._panScreenStart = { x: e.clientX, y: e.clientY };
    this._panViewCenter = { x: this.view.center.x, y: this.view.center.y };
    this.canvas.style.cursor = 'grabbing';
  };

  /** 右键菜单：显示上下文菜单 */
  _onCanvasContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const pt = this._screenToProj(e.clientX, e.clientY);
    this._contextMenuController.showAt(e.clientX, e.clientY, pt);
  };

  /** 键盘按下：Enter / Escape / 快捷键 */
  _onKeyDown = (e: KeyboardEvent): void => {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const key = e.key;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    const done = () => { (document.activeElement as HTMLElement)?.blur(); };

    if (key === 'Enter') {
      const transformTools = new Set(['move','copy','rotate','mirror']);
      if (transformTools.has(this._drawTool) && this._drawStep === 0 &&
          (this._selectionManager?.selectedIds.size ?? 0) > 0) {
        e.preventDefault();
        this._drawData = {};
        this._drawToolController.beginDrawing(this._drawTool, [...(this._selectionManager.selectedIds)]);
        done();
        return;
      }
      const multiTools = ['polyline', 'polyarc', 'polycurve', 'spline_fit', 'spline_cv'];
      if (multiTools.includes(this._drawTool) && this._drawStep >= 1 && this._drawData?.points) {
        e.preventDefault();
        if (this._drawStep >= 2 && this._drawData?._arcMid) {
          const pts = this._drawData.points;
          pts.push({ ...this._drawData._arcMid });
          this._drawData._arcMid = undefined;
          this._drawStep = 1;
        } else if (this._drawStep >= 2) {
          this._drawStep = 1;
          this._setPrompt(this._drawToolController.multiToolPrompt());
          done();
          return;
        }
        this._drawToolController.commitMultiPointTool(false);
        done();
        return;
      }
    }
    if (key === 'Escape') {
      e.preventDefault();
      this._contextMenuController.hide();
      this._cancelDrawing(false);
      this._previousSelectedIds = new Set(this.selectedIds);
      (document.querySelector('.draw-btn[data-tool="select"]') as HTMLElement)?.click();
      this.deselectAll();
      done();
      return;
    }
    if (ctrl && key === 'o') { e.preventDefault(); this._openFile(); done(); return; }
    if (ctrl && key === 's') { e.preventDefault(); document.getElementById('btn-save')?.click(); done(); return; }
    if (ctrl && key === 'z' && !shift) { e.preventDefault(); document.getElementById('btn-undo')?.click(); done(); return; }
    if ((ctrl && key === 'z' && shift) || (ctrl && key === 'y')) { e.preventDefault(); document.getElementById('btn-redo')?.click(); done(); return; }
    if (key === 'Home') { e.preventDefault(); document.getElementById('btn-zoom-ext')?.click(); done(); return; }
    if (ctrl && shift && key === 'P') { e.preventDefault(); this._selectPrevious(); done(); return; }
    if (key === 'F7') { e.preventDefault(); document.getElementById('btn-grid')?.click(); done(); return; }
    if (key === 'F9') { e.preventDefault(); document.getElementById('btn-snap')?.click(); done(); return; }
    if (!ctrl && (key === 'a' || key === 'A') && this._drawTool === 'polyarc' && this._drawStep === 1 && this._drawData?.points) {
      e.preventDefault();
      this._drawStep = 2;
      this._setPrompt('点击圆弧上第一点');
      done();
      return;
    }
    if (!ctrl && (key === 'c' || key === 'C')) {
      const multiTools = ['polyline', 'polyarc', 'polycurve', 'spline_fit', 'spline_cv'];
      if (multiTools.includes(this._drawTool) && this._drawStep >= 1 && this._drawData?.points) {
        if (this._drawStep >= 2 && this._drawData?._arcMid) {
          const pts = this._drawData.points;
          pts.push({ ...this._drawData._arcMid });
          this._drawData._arcMid = undefined;
          this._drawStep = 1;
        } else if (this._drawStep >= 2) {
          this._drawStep = 1;
          this._setPrompt(this._drawToolController.multiToolPrompt());
          done();
          return;
        }
        e.preventDefault();
        this._drawToolController.commitMultiPointTool(true);
        done();
        return;
      }
    }
    if ((key === 'Delete' || key === 'Backspace') && !ctrl) {
      e.preventDefault();
      this._deleteSelected();
      done();
      return;
    }
  };

  /** 文档级右键菜单：防止非画布区域弹出 */
  _onDocContextMenu = (e: MouseEvent): void => {
    if (!e.defaultPrevented && e.target !== this.canvas && !this.canvas.contains(e.target as Node)) {
      e.preventDefault();
    }
  };

  /** 文档级点击：隐藏上下文菜单 */
  _onDocClick = (e: MouseEvent): void => {
    if (!this._contextMenuController.contains(e.target)) {
      this._contextMenuController.hide();
    }
  };

  // ------ 命令行界面 ------

  /** 初始化命令行输入框、历史面板、自动完成与快捷键 */
  _setupCmdBar(): void {
    this._cmdInput = document.getElementById('cmd-input') as HTMLInputElement;
    this._cmdPrompt = document.getElementById('cmd-prompt');
    this._cmdHistory = [];
    this._cmdHistoryIndex = -1;
    if (!this._cmdInput) return;
    const cmdInput = this._cmdInput;

    this._showCmdHistoryPanel = false;
    const histPanel = document.createElement('div');
    histPanel.id = 'cmd-history-panel';
    histPanel.innerHTML =
      '<div id="hist-title">' +
        '<span>📋 历史记录</span>' +
        '<span id="hist-close">\u2716</span>' +
      '</div>' +
      '<div id="cmd-history-content"></div>' +
      '<div id="hist-resize"></div>';
    document.body.appendChild(histPanel);
    const titleEl = histPanel.querySelector('#hist-title') as HTMLElement;
    const closeEl = histPanel.querySelector('#hist-close') as HTMLElement;
    const resizeEl = histPanel.querySelector('#hist-resize') as HTMLElement;
    closeEl.onclick = () => { histPanel.classList.remove('visible'); this._showCmdHistoryPanel = false; };
    (function(panel: HTMLElement, title: HTMLElement) {
      let moving = false, sx: number, sy: number, sl: number, st: number;
      title.onmousedown = function(e: MouseEvent) {
        if ((e.target as HTMLElement)?.id === 'hist-close') return;
        moving = true; sx = e.clientX; sy = e.clientY;
        sl = panel.offsetLeft; st = panel.offsetTop;
        document.onmousemove = function(e: MouseEvent) {
          if (!moving) return;
          panel.style.left = Math.max(0, Math.min(window.innerWidth - 200, sl + (e.clientX - sx))) + 'px';
          panel.style.top = Math.max(0, Math.min(window.innerHeight - 60, st + (e.clientY - sy))) + 'px';
          panel.style.right = ''; panel.style.bottom = '';
        };
        document.onmouseup = function() { moving = false; document.onmousemove = null; document.onmouseup = null; };
      };
    })(histPanel, titleEl);
    (function(panel: HTMLElement, handle: HTMLElement) {
      let resizing = false, sx: number, sy: number, sw: number, sh: number;
      handle.onmousedown = function(e: MouseEvent) {
        e.stopPropagation(); e.preventDefault();
        resizing = true; sx = e.clientX; sy = e.clientY;
        sw = panel.offsetWidth; sh = panel.offsetHeight;
        document.onmousemove = function(e: MouseEvent) {
          if (!resizing) return;
          var dw = e.clientX - sx, dh = e.clientY - sy;
          var maxW = window.innerWidth - panel.offsetLeft - 4;
          var maxH = window.innerHeight - panel.offsetTop - 4;
          panel.style.width = Math.min(Math.max(200, sw + dw), maxW) + 'px';
          panel.style.height = Math.min(Math.max(120, sh + dh), maxH) + 'px';
        };
        document.onmouseup = function() { resizing = false; document.onmousemove = null; document.onmouseup = null; };
      };
    })(histPanel, resizeEl);
    const histBtn = document.createElement('button');
    histBtn.id = 'hist-btn';
    histBtn.textContent = '📋';
    histBtn.title = '历史记录';
    histBtn.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      this._showCmdHistoryPanel = !this._showCmdHistoryPanel;
      if (this._showCmdHistoryPanel) histPanel.classList.add('visible');
      else histPanel.classList.remove('visible');
    };
    this._cmdInput!.parentNode!.appendChild(histBtn);

    cmdInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const val = cmdInput.value.trim();
        cmdInput.value = '';

        if (val) {
          this._cmdHistoryIndex = this._cmdHistory.length;
          this._addHistoryEntry(val, 'cmd');
        }

        if (this._drawTool === 'circle' && this._drawStep === 1) {
          const radius = parseFloat(val);
          if (!isNaN(radius) && radius > 0) {
            this._commitCircle(this._drawData.center as { x: number; y: number }, radius);
            (document.activeElement as HTMLElement)?.blur();
          } else {
            this._setPrompt('');
            this._focusCmdInput('');
          }
          return;
        }

        if (this._drawCallback) {
          this._drawCallback(val);
          this._drawCallback = null;
          (document.activeElement as HTMLElement)?.blur();
          return;
        }

        if (this._drawTool === 'rotate' && this._drawStep === 2) {
          const angleDeg = parseFloat(val);
          if (!isNaN(angleDeg)) {
            this._transformToolController.applyRotateByAngle(angleDeg);
            (document.activeElement as HTMLElement)?.blur();
          } else {
            this._setPrompt('请输入有效的角度值');
          }
          return;
        }

        if (this._drawTool === 'polyarc' && val.toLowerCase() === 'a' && this._drawStep === 1 && this._drawData?.points) {
          this._drawStep = 2;
          this._setPrompt('点击圆弧上第一点');
          return;
        }

        const multiTools = ['polyline', 'polyarc', 'polycurve', 'spline_fit', 'spline_cv'];
        if (multiTools.includes(this._drawTool) && this._drawStep >= 1 && this._drawData.points) {
          if (this._drawStep >= 2 && this._drawData?._arcMid) {
            const pts = this._drawData.points;
            pts.push({ ...this._drawData._arcMid });
            this._drawData._arcMid = undefined;
            this._drawStep = 1;
          } else if (this._drawStep >= 2) {
            this._drawStep = 1;
            this._setPrompt(this._drawToolController.multiToolPrompt());
            return;
          }
          if (val.toLowerCase() === 'c') {
            this._drawToolController.commitMultiPointTool(true);
          } else {
            this._drawToolController.commitMultiPointTool(false);
          }
          (document.activeElement as HTMLElement)?.blur();
          return;
        }

        if (val) this._processCommand(val);
      }
      if (e.key === 'ArrowUp') {
        const cmds = this._cmdHistory.filter((h: CmdHistoryEntry) => h.type === 'cmd');
        if (cmds.length > 0) {
          this._cmdHistoryIndex = Math.max(0, this._cmdHistoryIndex - 1);
          const idx = Math.min(this._cmdHistoryIndex, cmds.length - 1);
          cmdInput.value = cmds[idx].text;
        }
        e.preventDefault();
      }
      if (e.key === 'ArrowDown') {
        const cmds = this._cmdHistory.filter((h: CmdHistoryEntry) => h.type === 'cmd');
        if (cmds.length > 0) {
        this._cmdHistoryIndex = Math.min(cmds.length, this._cmdHistoryIndex + 1);
          cmdInput.value = this._cmdHistoryIndex < cmds.length ? cmds[this._cmdHistoryIndex].text : '';
        }
        e.preventDefault();
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const val = cmdInput.value.trim().toLowerCase();
        if (!val) return;
        const allNames = [
          ...getCLICommandNames(),
          ...ENTITY_TYPES,
          'rect', 'rectangle', 'select', 'move', 'copy', 'rotate', 'mirror', 'erase',
          'zoom', 'z', 'undo', 'redo', 'clear', 'layer', 'layers'
        ];
        const matches = allNames.filter((n: string) => n.startsWith(val) && n !== val);
        if (matches.length === 1) {
          cmdInput.value = matches[0] + ' ';
        } else if (matches.length > 1) {
          this._setPrompt(`候选: ${matches.join(', ')}`);
        }
      }
      if (e.key === 'Escape') {
        this._cancelDrawing(true);
        this._previousSelectedIds = new Set(this.selectedIds);
        (document.querySelector('.draw-btn[data-tool="select"]') as HTMLElement)?.click();
        this.deselectAll();
      }
    });
  }

  /** 命令栏输入半径后提交创建圆 */
  _commitCircle(center: { x: number; y: number }, radius: number): void {
    this._clearPreview();
    const before = this._saveSnapshot();
    const pid = this._ensurePoint(center, center, '圆心');
    const entity = this._createEntity({ type: 'circle', id: nextId('C'), center_ref: pid, r: radius, description: `圆 r=${radius.toFixed(1)}` });
    if (!entity) return;
    this.doc?.entities.push(entity);
    this._finishDraw(entity, before);
  }

  /** 聚焦命令行输入框并设置占位文本 */
  _focusCmdInput(placeholder: string): void {
    if (!this._cmdInput) return;
    this._cmdInput.placeholder = placeholder || 'Input...';
    this._cmdInput.focus();
  }

  /** 重置命令行占位文本为默认 */
  _keepCmdInput(): void {
    if (this._cmdInput) this._cmdInput.placeholder = 'Input command...';
  }

  /** 添加一条历史记录，同步显示到历史面板 */
  _addHistoryEntry(text: string, type: CmdHistoryEntry['type'] = 'system'): void {
    const content = document.getElementById('cmd-history-content');
    const entry = { text, type, time: Date.now() };
    this._cmdHistory.push(entry);
    if (content) {
      const div = document.createElement('div');
      div.className = 'hist-entry' + (type === 'cmd' ? ' cmd' : ' info');
      div.textContent = (type === 'cmd' ? '> ' : '') + text;
      content.appendChild(div);
      content.scrollTop = content.scrollHeight;
    }
  }

  /** 填充历史面板（重新渲染全部历史记录） */
  _populateHistoryPanel(): void {
    const content = document.getElementById('cmd-history-content');
    if (!content) return;
    content.innerHTML = '';
    for (const entry of this._cmdHistory) {
      const div = document.createElement('div');
      div.className = 'hist-entry' + (entry.type === 'cmd' ? ' cmd' : ' info');
      div.textContent = (entry.type === 'cmd' ? '> ' : '') + entry.text;
      content.appendChild(div);
    }
    content.scrollTop = content.scrollHeight;
  }

  /** 设置提示栏文本（带自动清除超时） */
  _setPrompt(text: string): void {
    if (this._cmdPrompt) {
      if (!text) { this._cmdPrompt.innerHTML = ''; return; }
      const maxLen = 120;
      const flat = text.replace(/\n/g, ' | ');
      this._cmdPrompt.textContent = flat.length > maxLen ? flat.slice(0, maxLen) + '...' : flat;
    }
    if (text) this._addHistoryEntry(text.replace(/\n/g, ' | '), 'system');
    if (this._clearPromptTimer) clearTimeout(this._clearPromptTimer);
    this._clearPromptTimer = setTimeout(() => {
      if (this._cmdPrompt) this._cmdPrompt.innerHTML = '';
    }, 10000);
  }

  /** 设置画布鼠标样式（十字准线 / 默认） */
  _setCanvasCursor(mode: 'crosshair' | 'default'): void {
    const canvas = this.canvas;
    if (mode === 'crosshair') {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = '';
    }
  }

  // ------ 命令处理 ------

  /** 解析并执行命令行输入的文本（工具切换、缩放、撤销/重做、创建点等） */
  async _processCommand(val: string): Promise<void> {
    if (processCLICommand(this, val)) return;

    const cmd = val.toLowerCase().trim();
    const toolMap: Record<string, string> = {
      'line': 'line', 'circle': 'circle', 'arc': 'arc',
      'rect': 'rectangle', 'rectangle': 'rectangle',
      'text': 'text',
      'select': 'select', 'point': 'point',
      'polyline': 'polyline', 'polyarc': 'polyarc', 'polycurve': 'polycurve',
      'subsegment': 'subsegment',
      'spline_fit': 'spline_fit', 'spline_cv': 'spline_cv',
      'block_ref': 'block_ref', 'xref': 'xref', 'table': 'table',
      'dimension': 'dimension', 'region_anno': 'region_anno',
      'position': 'position', 'coord_sys': 'coord_sys',
      'move': 'move', 'copy': 'copy', 'rotate': 'rotate',
      'mirror': 'mirror', 'erase': 'erase'
    };
    if (toolMap[cmd]) {
      this._setDrawTool(toolMap[cmd]);
      this._setPrompt(`Switched to ${toolMap[cmd]} mode`);
    } else if (cmd === 'zoom' || cmd === 'z') {
      this.zoomExtents();
      this._setPrompt('');
    } else if (cmd === 'undo') {
      this.undo();
    } else if (cmd === 'redo') {
      this.redo();
      } else if (cmd === 'clear' || cmd === 'erase all') {
      const ok = await showModal({ title: '清空全部', message: '确定要清除所有实体吗', confirmText: '确定', cancelText: '取消', width: 280 });
      if (ok) {
        this.deselectAll();
        if (this.renderer) { this.renderer.clear(); this.view.update(); }
        this._setPrompt('');
      }
    } else if (cmd.startsWith('point ')) {
      const parts = cmd.split(/\s+/);
      if (parts.length >= 3) {
        const x = parseFloat(parts[1]), y = parseFloat(parts[2]);
        if (!isNaN(x) && !isNaN(y)) {
          this._createEntity({ type: 'point', id: nextId('P'), point: [x, y], description: `点 (${x},${y})` });
          if (this.renderer) { this.renderer.render(); }
          this._setPrompt(`Created point (${x}, ${y})`);
        }
      }
    } else if (cmd === 'layer' || cmd === 'layers') {
      const layerList = this.doc?.layers?.map((l: { id: string }) => l.id).join(', ') || '0';
      this._setPrompt(`Layers: ${layerList}`);
    } else if (cmd) {
      this._setPrompt(`Unknown: ${val}`);
    }
  }

  // ------ 撤销 / 重做 ------

  /** 执行撤销操作，恢复实体并更新选中状态 */
  undo(): void {
    if (!this.doc) return;
    const cmd = this._undoManager.undo();
    if (!cmd) return;
    cmd.undo();
    const undoEntityId = cmd.entityId!;
    if (cmd.type === 'modify-document') {
      const entity = this.doc.getEntityById(undoEntityId);
      if (entity && this.selectedIds.has(undoEntityId)) {
        this._showProperties(entity);
        this._showGrips(entity);
      }
      this.view.update();
      return;
    }
    this._rerenderEntity(undoEntityId);
    const entity = this.doc.getEntityById(undoEntityId);
    if (entity && this.selectedIds.has(undoEntityId)) {
      this._showProperties(entity);
      this._removeGrips();
      this._showGrips(entity);
    }
    this._updateLayerPanel();
    this.view.update();
  }

  /** 执行重做操作，恢复实体并更新选中状态 */
  redo(): void {
    if (!this.doc) return;
    const cmd = this._undoManager.redo();
    if (!cmd) return;
    cmd.redo();
    const redoEntityId = cmd.entityId!;
    if (cmd.type === 'modify-document') {
      const entity = this.doc.getEntityById(redoEntityId);
      if (entity && this.selectedIds.has(redoEntityId)) {
        this._showProperties(entity);
        this._showGrips(entity);
      }
      this.view.update();
      return;
    }
    this._rerenderEntity(redoEntityId);
    const entity = this.doc.getEntityById(redoEntityId);
    if (entity && this.selectedIds.has(redoEntityId)) {
      this._showProperties(entity);
      this._removeGrips();
      this._showGrips(entity);
    }
    this._updateLayerPanel();
    this.view.update();
  }

  // ------ 视图缩放 ------

  /** 缩放到全部实体的范围 */
  zoomExtents(): void {
    if (!this.renderer || this.renderer.hitItems.length === 0) return;
    const bounds = this.renderer.hitItems.reduce((b: paper.Rectangle | null, item: paper.Item) => {
      if (item.bounds) return b ? b.unite(item.bounds) : item.bounds;
      return b;
    }, null as paper.Rectangle | null);
    if (bounds) {
      const width = Math.max(bounds.width, 1);
      const height = Math.max(bounds.height, 1);
      this.view.zoom = 0.9 * Math.min(
        this.view.viewSize.width / width,
        this.view.viewSize.height / height
      );
      this.view.center = this._worldToProject(bounds.center);
      this.view.update();
      this._updateScreenFixedVisuals();
    }
  }

  /** 放大视图（缩放系数 1.3） */
  zoomIn(): void {
    this.view.zoom *= 1.3;
    this.view.update();
    this._updateScreenFixedVisuals();
  }

  /** 缩小视图（缩放系数 1/1.3） */
  zoomOut(): void {
    this.view.zoom /= 1.3;
    this.view.update();
    this._updateScreenFixedVisuals();
  }

  /** 以鼠标位置为中心进行缩放 */
  zoomToCursor(e: WheelEvent, factor: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const screenPt = new paper.Point(mx, my);
    const projPt = this.view.viewToProject(screenPt);
    this.view.zoom *= factor;
    const projPt2 = this.view.viewToProject(screenPt);
    this.view.center = this.view.center.add(projPt.subtract(projPt2));
    this.view.update();
    this._updateScreenFixedVisuals();
  }

  // ═══════════════════════════════════════════
  //  ViewerMethods.ts (merged)
  // ═══════════════════════════════════════════

  /** 坐标捕捉（委托给 SnapManager） */
  _snapPoint(pt: { x: number; y: number }): { x: number; y: number } {
    return this._snapManager ? this._snapManager.snapPoint(pt) : { x: pt.x, y: pt.y };
  }

  /** 更新捕捉指示器位置 */
  _updateSnapIndicator(pt: { x: number; y: number }): void {
    if (this._snapManager) this._snapManager.updateSnapIndicator(pt);
  }

  /** 清除选框 */
  _clearSelectionRect(): void {
    if (this._selectionManager) this._selectionManager.clearSelectionRect();
  }

  /** 取消全部选中 */
  deselectAll(): void {
    this._selectionManager?.deselectAll();
  }

  /** 选中指定 ID 的实体 */
  selectEntity(id: string): void {
    this._selectionManager?.selectEntity(id);
  }

  /** 恢复上一次选择集 */
  _selectPrevious(): void {
    this._selectionManager?.selectPrevious();
  }

  /** 设置实体选中/取消选中的视觉高亮 */
  _setEntitySelected(id: string, selected: boolean): void {
    if (!this.renderer) return;
    const items = this.renderer.entityItems.get(id);
    if (!items) return;
    for (const item of items) {
      if (item.data?.layers) {
        for (const child of item.data.layers) {
          if (selected) {
            child.data._origColor = child.strokeColor?.toCSS(true) ?? null;
            child.strokeColor = new paper.Color('#4fc3f7');
          } else {
            child.strokeColor = child.data?._origColor ?? child.strokeColor;
          }
        }
      }
      if (selected) {
        if (item instanceof paper.PointText) {
          item.data._origFill = item.fillColor?.toCSS(true) ?? null;
          item.fillColor = new paper.Color('#4fc3f7');
        } else {
          item.data._origColor = item.strokeColor?.toCSS(true) ?? null;
          item.strokeColor = new paper.Color('#4fc3f7');
        }
      } else {
        if (item instanceof paper.PointText) {
          item.fillColor = item.data?._origFill ?? item.fillColor;
        } else {
          item.strokeColor = item.data?._origColor ?? item.strokeColor;
        }
      }
    }
  }

  /** 框选进行中（记录选框矩形） */
  _doBoxSelect(pt: { x: number; y: number }): void {
    if (this._selectionManager) {
      this._selectionManager.handleBoxSelect(pt);
      this._isBoxSelecting = true;
    }
  }

  /** 结束框选，确定最终选中实体 */
  _endBoxSelect(toPt: { x: number; y: number }, additive: boolean): void {
    if (this._selectionManager) this._selectionManager.endBoxSelect(toPt, additive);
  }

  /** 处理单击选择/取消选择 */
  _handleClick(pt: { x: number; y: number }, additive: boolean): void {
    if (this._selectionManager) this._selectionManager.handleSingleClick(pt, additive);
  }

  /** 检测是否点击到夹点，是则开始拖拽 */
  _hitTestGrip(x: number, y: number): boolean {
    return this._gripManager ? this._gripManager.hitTestGrip(x, y) : false;
  }

  /** 开始拖拽夹点 */
  _startGripDrag(x: number, y: number): boolean {
    if (!this._gripManager) return false;
    const ret = this._gripManager.startGripDrag(x, y);
    if (ret) this._draggingGrip = this._gripManager._draggingGrip;
    return ret;
  }

  /** 夹点拖拽中（更新实体形状） */
  _doGripDrag(x: number, y: number): void {
    if (!this._gripManager) { console.warn(`[Viewer] _doGripDrag: gripManager is null`); return; }
    this._gripManager.doGripDrag(x, y);
  }

  /** 结束夹点拖拽，提交撤销快照 */
  _endGripDrag(): void {
    if (!this._gripManager) { console.warn(`[Viewer] _endGripDrag: gripManager is null`); return; }
    this._gripManager.endGripDrag();
    this._draggingGrip = null;
  }

  /** 隐藏所有夹点 */
  _removeGrips(): void {
    this._gripManager?.hideGrips();
  }

  /** 显示指定实体的夹点 */
  _showGrips(entity: Entity): void {
    const transformTools = new Set(['move','copy','rotate','mirror','erase']);
    if (transformTools.has(this._drawTool)) return;
    this._gripManager?.showGrips(entity);
  }

  /** 重新渲染所有实体并更新图层面板 */
  _rerenderEntity(id: string): void {
    if (!this.renderer) return;
    this.renderer.render();
    this._updateLayerPanel();
    this.view.update();
  }

  /** 直接更新单个实体的渲染项（删除旧项，重新生成） */
  _updateRenderedItemDirect(entity: Entity): void {
    if (!this.renderer) { console.warn(`[Viewer] _updateRenderedItemDirect(${entity?.id}): renderer is null`); return; }
    const items = this.renderer.entityItems.get(entity.id);
    if (!items) { console.warn(`[Viewer] _updateRenderedItemDirect(${entity?.id}): no existing items in entityItems`); return; }
    for (const item of items) {
      if (item.data?.layers) {
        for (const child of item.data.layers) child.remove();
        delete item.data.layers;
      }
      item.remove();
    }
    this.renderer.entityItems.delete(entity.id);
    this.renderer.itemMap.delete(entity.id);
    if (typeof entity.update === 'function') entity.update(this.renderer.resolver);
    const targetLayer = this.renderer._getTargetLayer(entity);
    const newItems = this.renderer._renderEntityToParent(entity, targetLayer);
    if (newItems) {
      this.renderer._registerEntityItems(entity, newItems);
    } else {
      console.warn(`[Viewer] _updateRenderedItemDirect(${entity.id}): _renderEntityToParent returned null`);
    }
  }

  /** 删除选中的实体（带撤销支持） */
  _deleteSelected(): void {
    if (!this.doc) return;
    const ids = new Set([...(this._selectionManager?.selectedIds || [])]);
    if (ids.size === 0) return;
    const before = this._saveSnapshot();
    const refedPoints = new Set<string>();
    for (const id of ids) {
      const entity = this.doc.getEntityById(id);
      if (!entity) continue;
      for (const [key, value] of Object.entries(entity)) {
        if (key.endsWith('_ref') && typeof value === 'string'
            && /^[A-Z]+[0-9]+$/.test(value)) refedPoints.add(value);
        else if (key === 'ref_pt') {
          const refStr = typeof value === 'string' ? value : (value as any)?.id;
          if (refStr && /^[A-Z]+[0-9]+$/.test(refStr)) refedPoints.add(refStr);
        }
        if (key.endsWith('_refs') && Array.isArray(value)) {
          for (const v of value) { if (typeof v === 'string' && /^[A-Z]+[0-9]+$/.test(v)) refedPoints.add(v); }
        }
      }
      if ((entity as any).segments) {
        for (const seg of (entity as any).segments) {
          for (const rk of ['start_ref', 'end_ref', 'mid_ref', 'center_ref', 'ref']) {
            if (seg[rk] && /^[A-Z]+[0-9]+$/.test(seg[rk])) refedPoints.add(seg[rk]);
          }
        }
      }
    }
    const allToRemove = new Set(ids);
    for (const ptId of refedPoints) {
      if (ids.has(ptId)) continue;
      const ptEnt = this.doc.getEntityById(ptId);
      if (!ptEnt) continue;
      const isConstruction = ptEnt.type === 'param_pt' || (ptEnt as any).construction === true;
      if (!isConstruction) continue;
      const isUsedElsewhere = this.doc.entities.some(e =>
        !ids.has(e.id) && e.id !== ptId && this._drawToolController.entityRefsPoint(e, ptId));
      if (!isUsedElsewhere) allToRemove.add(ptId);
    }
    this.doc.entities = this.doc.entities.filter((e: Entity) => !allToRemove.has(e.id));
    this._selectionManager?.deselectAll();
    const after = this._saveSnapshot();
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this._undoManager.push(createUndoCommand(undefined, before, after, this));
    this._applyDocSnapshot();
    this._setPrompt(`已删除 ${allToRemove.size} 个实体`);
  }

  /** 在信息面板中显示实体的详细属性（委托给 PropertyPanelController） */
  _showProperties(entity: Entity): void {
    this._propertyPanelController.showProperties(entity);
  }

  /** 递归构建属性树 HTML（委托给 PropertyPanelController） */
  _buildPropertyTree(entity: Entity, visited: Set<string>, depth: number): string {
    return this._propertyPanelController.buildPropertyTree(entity, visited, depth);
  }

  /** 渲染可编辑属性表单（委托给 PropertyPanelController） */
  _renderEditableProperties(entity: Entity): string {
    return this._propertyPanelController.renderEditableProperties(entity);
  }

  /** 显示多选摘要（委托给 PropertyPanelController） */
  _showMultiSelectionSummary(ids: Set<string>): void {
    this._propertyPanelController.showMultiSelectionSummary(ids);
  }

  /** 切换到图层视图（委托给 LayerController） */
  _switchToLayerView(): void {
    this._layerController.switchToLayerView();
  }

  /** 切换到属性视图（委托给 PropertyPanelController） */
  _switchToPropertyView(entity: Entity): void {
    this._propertyPanelController.showProperties(entity);
  }

  /** 刷新图层面板（委托给 LayerController） */
  _updateLayerPanel(): void {
    this._layerController.updateLayerPanel();
  }

  /** 创建单个图层 DOM 条目（委托给 LayerController） */
  _addLayerItem(list: HTMLElement | DocumentFragment, layer: { id: string; [key: string]: unknown }, isDefault: boolean, entityCount: number): void {
    this._layerController.updateLayerPanel();
  }

  /** 弹出图层属性编辑对话框（委托给 LayerController） */
  _editLayerProp(layer: { id: string; [key: string]: unknown }, isDefault: boolean): void {
    this._layerController.updateLayerPanel();
  }

  /** 更新状态栏信息（文档标签、摘要、实体/块/图层计数、比例显示） */
  updateUI(): void {
    if (!this.doc) return;
    const fi = document.getElementById('file-info');
    if (fi) {
      const tagStr = this.doc.tags?.length ? `[${this.doc.tags.join(', ')}] ` : '';
      const summaryStr = this.doc.summary ? `"${this.doc.summary.slice(0, 40)}${this.doc.summary.length > 40 ? '…' : ''}"` : '';
      fi.textContent = tagStr + summaryStr;
    }
    (document.getElementById('info-entities') as HTMLElement).textContent = `实体: ${this.doc.entities.length}`;
    (document.getElementById('info-blocks') as HTMLElement).textContent = `块: ${this.doc.blocks.length}`;
    (document.getElementById('info-layers') as HTMLElement).textContent = `图层: ${this.doc.layers.length + 1}`;
    this._updateLayerPanel();
    this._updateScaleDisplay();
  }

  /** 刷新网格显示 */
  _updateGridDisplay(): void {
    if (this._snapManager) this._snapManager.updateGridDisplay();
  }

  /** 更新标签栏 DOM，支持激活/关闭标签 */
  _updateTabBar(): void {
    const bar = document.getElementById('tab-bar');
    if (!bar) return;
    bar.innerHTML = '';
    for (let i = 0; i < this._docTabs.length; i++) {
      const tab = this._docTabs[i];
      const div = document.createElement('div');
      div.className = 'tab' + (i === this._activeTabIndex ? ' active' : '');
      div.dataset.index = String(i);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'tab-name';
      nameSpan.textContent = tab.dirty ? '● ' + tab.name : tab.name;
      div.appendChild(nameSpan);
      if (this._docTabs.length > 1) {
        const close = document.createElement('span');
        close.className = 'tab-close';
        close.textContent = '×';
        close.addEventListener('click', (e) => { e.stopPropagation(); this._closeTab(i); });
        div.appendChild(close);
      }
      div.addEventListener('click', () => {
        if (i !== this._activeTabIndex) { this._saveCurrentTabState(); this._activateDoc(i); }
      });
      bar.appendChild(div);
    }
  }

  /** 更新页面标题为当前标签名 */
  _updateTitle(): void {
    const tab = this._docTabs[this._activeTabIndex];
    document.title = tab ? `GSGI — ${tab.name}${tab.dirty ? ' ●' : ''}` : 'GSGI Viewer';
  }

  /** 更新屏幕固定视觉元素（线宽、屏幕固定项、夹点比例、网格） */
  _updateScreenFixedVisuals(): void {
    this.renderer?.updateStrokeWidths();
    this.renderer?.updateScreenFixedItems();
    this._gripManager?.updateScale();
    this._updateGridDisplay();
  }

  /** 应用文档比例（带撤销快照） */
  _applyScale(scaleValue: number): void {
    if (!this.doc) return;
    const before = this._saveSnapshot();
    const rounded = Math.round(scaleValue * 100) / 100;
    const oldScale = this.doc.properties?.scale || 1;
    if (Math.abs(rounded - oldScale) < 0.001) return;
    this.doc.properties = this.doc.properties || {};
    this.doc.properties.scale = rounded;
    const after = this._saveSnapshot();
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      this._undoManager.push(createUndoCommand('_scale', before, after, this));
    }
    if (this.renderer) {
      this.renderer.render();
      this._persist();
      const selIds = this._selectionManager?.selectedIds || this.selectedIds;
      for (const id of selIds) this._setEntitySelected(id, true);
    }
    this._updateGridDisplay();
    this._updateScaleDisplay();
    this._updateLayerPanel();
    this.updateUI();
    this.view.update();
  }

  /** 创建实体的快捷入口（委托给 _createEntity） */
  createEntity(data: Record<string, unknown>): Entity | null {
    return this._createEntity(data);
  }

  /** 绑定工具栏按钮事件（绘图工具、文件、撤销、缩放等） */
  _setupToolbar(): void {
    document.querySelectorAll('.draw-btn').forEach((btn: Element) => {
      btn.addEventListener('click', () => {
        this._setDrawTool((btn as HTMLElement).dataset.tool!);
      });
    });
    document.getElementById('btn-new')?.addEventListener('click', () => this._newDocument());
    document.getElementById('btn-open')?.addEventListener('click', () => this._openFile());
    document.getElementById('btn-save')?.addEventListener('click', () => this._saveCurrentFile());
    document.getElementById('btn-saveas')?.addEventListener('click', () => this._saveAsFile());
    document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('btn-zoom-ext')?.addEventListener('click', () => this.zoomExtents());
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.zoomOut());
  }

  /** 初始化比例选择控件（预设 + 自定义输入） */
  _setupScaleControl(): void {
    this._scaleSelect = document.getElementById('scale-select') as HTMLSelectElement | null;
    this._scaleCustom = document.getElementById('scale-custom') as HTMLInputElement | null;
    if (!this._scaleSelect || !this._scaleCustom) return;
    const sel = this._scaleSelect;
    const cust = this._scaleCustom;
    sel.addEventListener('change', () => {
      const val = sel.value;
      if (val === 'custom') {
        cust.style.display = '';
        cust.focus();
        return;
      }
      cust.style.display = 'none';
      this._applyScale(parseFloat(val));
    });
    cust.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const val = parseFloat(cust.value);
        if (!isNaN(val) && val > 0) {
          this._applyScale(val);
        }
        cust.style.display = 'none';
        sel.value = 'custom';
      }
      if (e.key === 'Escape') {
        cust.style.display = 'none';
        this._updateScaleDisplay();
      }
    });
    this._updateScaleDisplay();
  }

  /** 更新比例显示（匹配最近预设或显示自定义值） */
  _updateScaleDisplay(): void {
    const sel = this._scaleSelect;
    const cust = this._scaleCustom;
    if (!sel || !cust || !this.doc) return;
    const s = this.doc.properties?.scale || 1;
    const presets = [...sel.options]
      .filter(o => (o as HTMLOptionElement).value !== 'custom')
      .map(o => ({ val: parseFloat((o as HTMLOptionElement).value), label: o.text }));
    let closest = presets[0];
    let minDiff = Infinity;
    for (const p of presets) {
      const d = Math.abs(p.val - s);
      if (d < minDiff) { minDiff = d; closest = p; }
    }
    if (minDiff <= 0.02) {
      sel.value = String(closest.val);
      cust.style.display = 'none';
    } else {
      sel.value = 'custom';
      cust.style.display = '';
      cust.value = s.toFixed(2);
    }
  }

  /** 初始化捕捉与网格 UI */
  _setupSnapGrid(): void {
    if (this._snapManager) this._snapManager.setupUI();
  }

  /** 图层按钮事件绑定已在 LayerController 构造函数中处理 */
  _setupLayerActions(): void {
  }

  /** 绑定面板分割条拖拽调整大小事件 */
  _setupPanelResize(): void {
    const handle = document.getElementById('panels-resize-handle');
    const panels = document.getElementById('panels');
    if (!handle || !panels) return;
    let startX = 0, startW = 0;
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      startX = e.clientX;
      startW = panels.offsetWidth;
      handle.classList.add('active');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
    const onMouseMove = (e: MouseEvent) => {
      const dw = startX - e.clientX;
      const w = Math.max(180, Math.min(window.innerWidth * 0.5, startW + dw));
      panels.style.width = w + 'px';
    };
    const onMouseUp = () => {
      handle.classList.remove('active');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    handle.addEventListener('mousedown', onMouseDown);
  }

  /** 属性面板变更事件已在 PropertyPanelController 构造函数中绑定 */
  _setupPropertyEditing(): void {
  }

  /** 关闭指定索引的标签页 */
  _closeTab(index: number): void {
    if (this._docTabs.length <= 1) return;
    this._docTabs.splice(index, 1)[0];
    const newIndex = Math.min(index, this._docTabs.length - 1);
    this._activateDoc(newIndex);
    this._updateTabBar();
    this._persist({ skipDirty: true });
  }

  /** 确保捕捉点存在，返回点 ID（委托给 DrawToolController） */
  _ensurePoint(snapResult: Record<string, unknown>, fallbackPt: { x: number; y: number }, description: string): string {
    return this._drawToolController.ensurePoint(snapResult, fallbackPt, description);
  }

  /** 切换当前绘制工具（委托给 DrawToolController） */
  _setDrawTool(tool: string): void {
    this._drawToolController.setDrawTool(tool);
  }

  /** 取消当前绘制操作（委托给 DrawToolController） */
  _cancelDrawing(clearCmd = true): void {
    this._drawToolController.cancelDrawing(clearCmd);
  }

  /** 分发单击事件到对应工具处理函数（委托给 DrawToolController） */
  _handleDrawClick(pt: { x: number; y: number }, e: MouseEvent, rawPt: { x: number; y: number }): void {
    this._drawToolController.handleDrawClick(pt, e, rawPt);
  }

  /** 提交多点绘制工具的结果（委托给 DrawToolController） */
  _commitMultiPointTool(): void {
    this._drawToolController.commitMultiPointTool();
  }

  /** 清除所有预览图形（委托给 DrawToolController） */
  _clearPreview(): void {
    this._drawToolController.clearPreview();
  }

  /** 更新绘制过程中的预览图形（委托给 DrawToolController） */
  _updateDrawPreview(pt: { x: number; y: number }): void {
    this._drawToolController.updateDrawPreview(pt);
  }

  /** 创建实体，自动填充当前比例（委托给 DrawToolController） */
  _createEntity(data: Record<string, unknown>): Entity | null {
    return this._drawToolController.createEntity(data);
  }

  /** 完成绘制并记录撤销（委托给 DrawToolController） */
  _finishDraw(entity: Entity | null, before: unknown, msg?: string): void {
    this._drawToolController.finishDraw(entity, before, msg);
  }

  /** 平移实体坐标，通过 batchTransform 实现 */
  _moveEntity(entity: Entity, dx: number, dy: number): void {
    if (this.renderer?.resolver) {
      batchTransform(this.renderer.resolver, [entity], Transform.translation({ x: dx, y: dy }));
    }
  }

  /** 保存当前文档快照（用于撤销） */
  _saveSnapshot(): unknown {
    return this.doc ? cloneDocumentData(this.doc) : null;
  }

  /** 应用文档快照：重建缓存、重新渲染、持久化、恢复选中状态、更新面板 */
  _applyDocSnapshot(): void {
    if (this.renderer) {
      this.renderer.resolver._buildCache();
      this.renderer.render();
      this._persist();
      const selIds = this._selectionManager?.selectedIds || this.selectedIds;
      for (const id of selIds) this._setEntitySelected(id, true);
    }
    this._updateLayerPanel();
    this._removeGrips();
    this.updateUI();
    this._updateGridDisplay();
    this.view.update();
  }
}
