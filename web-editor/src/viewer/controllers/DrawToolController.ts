/**
 * 绘制工具控制器
 * 管理图形绘制工具（直线/圆/弧/矩形/多段线/样条等）的工具切换、
 * 点击处理、多点提交、预览渲染与撤销提交流程。
 * 拆分自 DrawingTools.ts 原型方法，通过 Viewer._drawToolController 访问。
 */
import paper from 'paper';
import { Viewer } from '../Viewer';
import { Entity } from '../../core/entity';
import { createEntity, nextId } from '../../core/barrel';
import { Point2d } from '../../core/geometry';
import { cloneDocumentData, createUndoCommand } from '../util/clipboard';
import { DRAW_HANDLER_MAP } from '../tools/draw-handlers';

/** 绘制工具临时数据 */
export interface DrawData {
  targetIds?: string[];
  sourceIds?: string[];
  offset?: { x: number; y: number };
  centerPt?: { x: number; y: number };
  _lastDx?: number;
  _lastDy?: number;
  _before?: unknown;
  _selectedEntityId?: string;
  _selectPt?: { x: number; y: number };
  _previewItems?: paper.Item[];
  center?: { x: number; y: number };
  points?: { x: number; y: number }[];
  /** 弧模式挂起点（按A后第一次点击） */
  _arcMid?: { x: number; y: number };
  /** 弧段中点映射：segIndex → midPoint，seg i 对应 points[i]→points[i+1] */
  _arcSegments?: Record<number, { x: number; y: number }>;
  /** 子线段第一点击的 t 值 */
  _t0?: number;
  /** 表格列数 */
  _tableCols?: number;
  /** 表格行数 */
  _tableRows?: number;
  startPt?: { x: number; y: number };
  midPt?: { x: number; y: number };
  insertPt?: { x: number; y: number };
  p1?: { x: number; y: number };
  targetEntityId?: string;
  mirrorLine?: { x: number; y: number }[];
  curveRef?: string;
}

export class DrawToolController {
  private viewer: Viewer;

  /** 当前绘制工具名称 */
  drawTool: string = 'select';
  /** 当前绘制步骤（0=未开始, 1+=步骤中） */
  drawStep: number = 0;
  /** 绘制过程临时数据 */
  drawData: DrawData = {};
  /** 绘制回调（用于 text/block_ref/xref/table 等需要用户输入的工具） */
  drawCallback: ((val: string) => void) | null = null;
  /** 预览图形列表 */
  previewItems: paper.Item[] = [];

  /** 构造绘制工具控制器 */
  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  /** 获取多点工具的当前提示文本 */
  multiToolPrompt(): string {
    if (this.drawTool === 'polyarc') return '点击添加更多点，回车完成，按A添加圆弧上点，或按C闭合';
    return '点击添加更多点，回车完成，或按C键闭合';
  }

  /** 选择阶段提示 */
  private static SELECT_PROMPTS: Record<string, string> = {
    move: '点击选择要移动的实体', copy: '点击选择要复制的实体',
    rotate: '点击选择要旋转的实体', mirror: '点击选择要镜像的实体',
    erase: '点击选择要擦除的实体'
  };
  /** 绘图阶段提示（step 1） */
  private static DRAW_PROMPTS: Record<string, string> = {
    move: '点击指定移动基点', copy: '点击指定复制基点',
    rotate: '点击指定旋转参照点', mirror: '点击指定镜像轴第一点'
  };
  /** 常规绘图工具提示 */
  private static TOOL_PROMPTS: Record<string, string> = {
    line: '点击指定起点', circle: '点击指定圆心', arc: '点击指定起点',
    rectangle: '点击指定第一个角点', text: '点击指定文字插入点', point: '点击指定点位置',
    mtext: '点击指定文字插入点', polyline: '点击指定起点', polyarc: '点击指定起点',
    polycurve: '点击指定起点', subsegment: '点击选择曲线',
    spline_fit: '点击指定起点', spline_cv: '点击指定起点',
    block_ref: '点击指定插入点', xref: '点击指定插入点', table: '点击指定插入点',
    hatch: '点击指定边界点', dimension: '点击指定第一个点', region_anno: '点击指定边界点',
    position: '点击指定点', coord_sys: '点击指定原点'
  };

  /** 进入选择模式（step 0）—— 点击选择实体，回车确认 */
  private beginSelection(tool: string): void {
    this.drawStep = 0;
    this.viewer._setCanvasCursor('default');
    this.viewer._setPrompt(DrawToolController.SELECT_PROMPTS[tool] || tool);
  }

  /** 进入绘图状态（step 1）—— 跳过选择，直接开始操作 */
  beginDrawing(tool: string, ids: string[]): void {
    this.drawStep = 1;
    this.viewer._setCanvasCursor('crosshair');
    this.viewer._setPrompt(DrawToolController.DRAW_PROMPTS[tool] || '');
    if (tool === 'move') {
      this.drawData.targetIds = ids;
    } else if (tool === 'copy') {
      this.drawData.sourceIds = ids;
    } else if (tool === 'rotate') {
      this.drawData.targetIds = ids;
    } else if (tool === 'mirror') {
      this.drawData.targetIds = ids;
    }
  }

  /** 切换当前绘制工具，更新 UI 按钮、鼠标光标和提示信息 */
  setDrawTool(tool: string): void {
    this.cancelDrawing(false);
    this.drawTool = tool;
    this.drawStep = 0;
    this.drawData = {};

    document.querySelectorAll('.draw-btn').forEach((btn: Element) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === tool);
    });

    if (tool === 'select') {
      this.viewer._setCanvasCursor('default');
      this.viewer._setPrompt('就绪');
      this.viewer._keepCmdInput();
      return;
    }

    const selectTools = new Set(['move', 'copy', 'rotate', 'mirror', 'erase']);
    const hasSelection = !!(this.viewer._selectionManager?.selectedIds?.size);

    if (selectTools.has(tool)) {
      this.viewer._removeGrips();
      if (hasSelection) {
        this.beginDrawing(tool, [...(this.viewer._selectionManager!.selectedIds)]);
      } else {
        this.beginSelection(tool);
      }
    } else {
      this.viewer.deselectAll();
      this.viewer._setCanvasCursor('crosshair');
      this.viewer._setPrompt(DrawToolController.TOOL_PROMPTS[tool] || tool);
    }

    if (this.viewer._snapIndicator) { this.viewer._snapIndicator.remove(); this.viewer._snapIndicator = null; }
  }

  /** 取消当前绘制操作，清除预览、步骤数据和回调 */
  cancelDrawing(clearCmd = true): void {
    if (this.drawTool === 'select') return;
    this.viewer._snapManager?.clearIndicator();
    this.viewer._transformToolController.revertMovePreview();
    this.viewer._transformToolController.removeCopyPreview();
    this.drawStep = 0;
    this.drawData = {};
    this.drawCallback = null;
    this.clearPreview();
    if (clearCmd) {
      this.viewer._setPrompt('就绪');
      this.viewer._keepCmdInput();
    }
    if (this.drawTool === 'text') {
      this.viewer._setPrompt('点击指定文字插入点');
    }
  }

  /** 处理绘制工具点击事件，通过 DRAW_HANDLER_MAP 统一分发 */
  handleDrawClick(pt: { x: number; y: number }, e: MouseEvent, rawPt: { x: number; y: number }): void {
    this.viewer._snapManager?.clearIndicator();
    if (this.viewer._snapIndicator) { this.viewer._snapIndicator.remove(); this.viewer._snapIndicator = null; }

    const handler = DRAW_HANDLER_MAP[this.drawTool];
    if (handler) {
      handler(this.viewer, pt, rawPt);
    } else {
      this.viewer._setPrompt(`[${this.drawTool}] 尚未实现`);
    }
  }

  /** 处理擦除工具点击事件，删除选中或点击的实体 */
  drawEraseClick(pt: { x: number; y: number }, rawPt: { x: number; y: number }): void {
    if (!this.viewer.doc) return;
    let ids = [...(this.viewer._selectionManager?.selectedIds || [])];
    if (ids.length === 0) {
      if (!this.viewer.renderer) return;
      const hitPt = rawPt || pt;
      const hit = this.viewer.project.hitTest(this.viewer._worldToProject(hitPt), {
        stroke: true, fill: true, tolerance: 10 / this.viewer.view.zoom
      });
      if (!hit?.item) { this.viewer._setPrompt('未选中实体'); return; }
      let item = hit.item;
      while (item && !item.data?.entityId) item = item.parent;
      if (!item?.data?.entityId) { this.viewer._setPrompt('未选中实体'); return; }
      ids = [item.data.entityId];
    }
    const before = this.viewer._saveSnapshot();
    const idsSet = new Set(ids);
    const doc = this.viewer.doc;
    const refedPoints = new Set<string>();
    for (const id of ids) {
      const entity = doc.getEntityById(id);
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
      if (idsSet.has(ptId)) continue;
      const ptEnt = doc.getEntityById(ptId);
      if (!ptEnt) continue;
      const isConstruction = ptEnt.type === 'param_pt' || (ptEnt as any).construction === true;
      if (!isConstruction) continue;
      const isUsedElsewhere = doc.entities.some(e =>
        !idsSet.has(e.id) && e.id !== ptId && this.entityRefsPoint(e, ptId));
      if (!isUsedElsewhere) allToRemove.add(ptId);
    }
    doc.entities = doc.entities.filter((e: Entity) => !allToRemove.has(e.id));
    this.viewer._selectionManager?.deselectAll();
    this.finishDraw(null, before, `已擦除 ${allToRemove.size} 个实体`);
  }

  /** 检查实体是否引用了指定点 ID */
  entityRefsPoint(entity: Entity, pointId: string): boolean {
    for (const [key, value] of Object.entries(entity)) {
      if (key.endsWith('_ref') && value === pointId) return true;
      if (key === 'ref_pt') {
        const id = typeof value === 'string' ? value : (value as any)?.id;
        if (id === pointId) return true;
      }
      if (key.endsWith('_refs') && Array.isArray(value) && value.includes(pointId)) return true;
    }
    if (entity.segments && Array.isArray(entity.segments)) {
      for (const seg of entity.segments) {
        if (seg.start_ref === pointId || seg.end_ref === pointId || seg.mid_ref === pointId || seg.center_ref === pointId) return true;
      }
    }
    return false;
  }

  /** 根据三点计算圆弧 bulge 值 */
  private bulgeFromPoints(p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }): number {
    const dx = p3.x - p1.x, dy = p3.y - p1.y;
    const chordLenSq = dx * dx + dy * dy;
    if (chordLenSq < 1e-12) return 0;
    const cross = (p2.x - p1.x) * dy - (p2.y - p1.y) * dx;
    if (Math.abs(cross) < 1e-12) return 0;
    const x12 = (p1.x + p2.x) / 2, y12 = (p1.y + p2.y) / 2;
    const dx12 = p2.x - p1.x, dy12 = p2.y - p1.y;
    const x23 = (p2.x + p3.x) / 2, y23 = (p2.y + p3.y) / 2;
    const dx23 = p3.x - p2.x, dy23 = p3.y - p2.y;
    const a1 = dx12, b1 = dy12, c1 = dx12 * x12 + dy12 * y12;
    const a2 = dx23, b2 = dy23, c2 = dx23 * x23 + dy23 * y23;
    const det = a1 * b2 - a2 * b1;
    if (Math.abs(det) < 1e-12) return 0;
    const cx = (c1 * b2 - c2 * b1) / det;
    const cy = (a1 * c2 - a2 * c1) / det;
    const a0 = Math.atan2(p1.y - cy, p1.x - cx);
    const a1v = Math.atan2(p3.y - cy, p3.x - cx);
    const am = Math.atan2(p2.y - cy, p2.x - cx);
    let sweep = a1v - a0;
    if (sweep < 0) sweep += 2 * Math.PI;
    let midA = am - a0;
    if (midA < 0) midA += 2 * Math.PI;
    if (midA > sweep) sweep -= 2 * Math.PI;
    return Math.tan(sweep / 4);
  }

  /** 提交多点绘制工具（多段线/多弧/样条等）的结果 */
  commitMultiPointTool(closed = false): void {
    const pts = this.drawData?.points;
    if (!pts || pts.length < 2) { this.viewer._setPrompt('至少需要2个点'); return; }
    const before = this.viewer._saveSnapshot();
    let entity: Entity | null = null;
    const t = this.drawTool;
    if (t === 'polyline') {
      const id = nextId('PL');
      const ptCoords = pts.map((p: { x: number; y: number }) => [p.x, p.y]);
      entity = this.createEntity({ type: 'polyline', id, points: ptCoords, closed, description: `多段线 ${pts.length}个点` });
    } else if (t === 'polyarc') {
      const id = nextId('PA');
      const refs = pts.map((p: { x: number; y: number }) => {
        const pid = this.ensurePoint(p, p, '多弧顶点');
        return pid;
      });
      const arcs = this.drawData._arcSegments || {};
      const bulges = pts.slice(0, -1).map((_, i) => {
        const mid = arcs[i];
        if (mid) return this.bulgeFromPoints(pts[i], mid, pts[i + 1]);
        return 0;
      });
      entity = this.createEntity({ type: 'polyarc', id, point_refs: refs, bulges, closed, description: `多弧 ${pts.length}个点` });
    } else if (t === 'polycurve') {
      const id = nextId('PC');
      const segs = [];
      const pids = pts.map((p: { x: number; y: number }) => this.ensurePoint(p, p, '曲线顶点'));
      for (let i = 0; i < pids.length - 1; i++) {
        segs.push({ type: 'line', start_ref: pids[i], end_ref: pids[i + 1] });
      }
      entity = this.createEntity({ type: 'polycurve', id, segments: segs, closed, description: `复合曲线 ${pts.length}个点` });
    } else if (t === 'spline_fit') {
      const id = nextId('SF');
      const refs = pts.map((p: { x: number; y: number }) => {
        const pid = this.ensurePoint(p, p, '拟合点');
        return pid;
      });
      entity = this.createEntity({ type: 'spline_fit', id, fit_point_refs: refs, degree: 3, closed, description: `拟合样条 ${pts.length}个点` });
    } else if (t === 'spline_cv') {
      const id = nextId('SC');
      const refs = pts.map((p: { x: number; y: number }) => {
        const pid = this.ensurePoint(p, p, '控制点');
        return pid;
      });
      entity = this.createEntity({ type: 'spline_cv', id, control_point_refs: refs, degree: 3, closed, description: `控制样条 ${pts.length}个点` });
    }
    if (entity && this.viewer.doc) { this.viewer.doc.entities.push(entity); this.finishDraw(entity, before); }
  }

  /** 确保存在指定点，若没有则创建新的构造点 */
  ensurePoint(snapResult: Record<string, unknown>, fallbackPt: { x: number; y: number }, description: string): string {
    if (snapResult?.pointId) {
      return snapResult.pointId as string;
    }
    if (snapResult?.lineId && snapResult.t != null) {
      const ppid = nextId('PP');
      const pp = this.createEntity({
        type: 'param_pt', id: ppid, curve_ref: snapResult.lineId, t: snapResult.t,
        point: [snapResult.x, snapResult.y], label: description || '捕捉点'
      });
      this.viewer.doc!.entities.push(pp!);
      this.viewer.renderer?.resolver?._trackEntityDeps(ppid, pp!);
      const pid = nextId('P');
      const pt = this.createEntity({
        type: 'point', id: pid, point: [0, 0], ref_pt: ppid,
        point_role: 'construction', construction: true,
        description: description || `曲线参数点 ${snapResult.lineId}@${(snapResult.t as number).toFixed(3)}`
      });
      this.viewer.doc!.entities.push(pt!);
      return pid;
    }
    const pid = nextId('P');
    const pt = this.createEntity({
      type: 'point', id: pid, point: [fallbackPt.x, fallbackPt.y],
      construction: true, visible: true,
      description: description || `构造点 ${fallbackPt.x.toFixed(1)},${fallbackPt.y.toFixed(1)}`
    });
    this.viewer.doc!.entities.push(pt!);
    return pid;
  }

  /** 对指定坐标进行命中测试，返回命中的实体 ID */
  hitTestEntity(pt: { x: number; y: number }): string | null {
    if (!this.viewer.renderer) return null;
    const hit = this.viewer.project.hitTest(this.viewer._worldToProject(pt), {
      stroke: true, fill: true, tolerance: 10 / this.viewer.view.zoom
    });
    if (!hit?.item) return null;
    let item = hit.item;
    while (item && !item.data?.entityId) item = item.parent;
    return item?.data?.entityId || null;
  }

  /** 创建实体并自动填充当前文档比例 */
  createEntity(data: Record<string, unknown>): Entity | null {
    if (data.scale === undefined) data.scale = this.viewer.doc?.properties?.scale ?? 1;
    return createEntity(data);
  }

  /** 完成绘制，将结果加入撤销栈并重置绘制状态 */
  finishDraw(entity: Entity | null, before: unknown, prompt?: string): void {
    if (!before) before = this.viewer._saveSnapshot();
    const after = cloneDocumentData(this.viewer.doc!);
    this.viewer._undoManager.push(createUndoCommand(entity?.id, before, after, this.viewer));
    this.cancelDrawing(false);
    this.viewer._setPrompt(prompt || (entity ? `已创建 ${entity.type}` : ''));
    this.viewer._applyDocSnapshot();
    if (entity) { this.viewer.selectEntity(entity.id); this.viewer.view.update(); }
    this.viewer._setCanvasCursor(this.drawTool === 'select' ? 'default' : 'crosshair');
    this.viewer._keepCmdInput();
  }

  /** 更新绘制过程中的实时预览图形 */
  updateDrawPreview(pt: { x: number; y: number }): void {
    if (this.drawStep === 0) return;
    this.clearPreview();
    const multiPointTools = new Set(['polyline', 'polyarc', 'polycurve', 'spline_fit', 'spline_cv']);
    if (multiPointTools.has(this.drawTool) && this.drawData.points) {
      for (const p of this.drawData.points) {
        this.addPreviewPoint(p.x, p.y);
      }
      const pts = this.drawData.points;
      if (pts.length >= 1) {
        const last = pts[pts.length - 1];
        if (pts.length >= 2) {
          for (let i = 0; i < pts.length - 1; i++) {
            const mid = this.drawData._arcSegments?.[i];
            if (mid) {
              const arcSeg = new paper.Path.Arc({
                from: [pts[i].x, pts[i].y], through: [mid.x, mid.y], to: [pts[i + 1].x, pts[i + 1].y],
                strokeColor: '#4fc3f7', strokeWidth: 1.5 / this.viewer.view.zoom,
                dashArray: [4 / this.viewer.view.zoom, 3 / this.viewer.view.zoom], insert: false
              });
              this.viewer._getWorldLayer().addChild(arcSeg);
              this.previewItems.push(arcSeg);
            } else {
              this.addPreviewLine(pts[i], pts[i + 1]);
            }
          }
        }
        if (this.drawStep === 3 && this.drawData._arcMid) {
          this.addPreviewPoint(this.drawData._arcMid.x, this.drawData._arcMid.y);
          const arc = new paper.Path.Arc({
            from: [last.x, last.y], through: [this.drawData._arcMid.x, this.drawData._arcMid.y], to: [pt.x, pt.y],
            strokeColor: '#4fc3f7', strokeWidth: 1.5 / this.viewer.view.zoom,
            dashArray: [4 / this.viewer.view.zoom, 3 / this.viewer.view.zoom], insert: false
          });
          this.viewer._getWorldLayer().addChild(arc);
          this.previewItems.push(arc);
        } else {
          this.addPreviewLine(last, pt);
        }
      }
      this.viewer.view.update();
      return;
    }
    const p1 = this.drawData.p1 || this.drawData.center || this.drawData.startPt || this.drawData.insertPt;
    if (!p1) return;
    this.addPreviewPoint(p1.x, p1.y);
    if (this.drawTool === 'line' && this.drawStep >= 1) {
      this.addPreviewLine(p1, pt);
    } else if (this.drawTool === 'circle' && this.drawStep >= 1) {
      const radius = new Point2d(pt.x, pt.y).dist(new Point2d(p1.x, p1.y));
      this.addPreviewCircle(p1.x, p1.y, radius);
    } else if (this.drawTool === 'arc' && this.drawStep >= 1 && this.drawData.startPt) {
      const startPt = this.drawData.startPt;
      if (this.drawStep === 1) {
        this.addPreviewLine(startPt, pt);
      } else if (this.drawStep === 2 && this.drawData.midPt) {
        const midPt = this.drawData.midPt;
        const arc = new paper.Path.Arc({
          from: [startPt.x, startPt.y], through: [midPt.x, midPt.y], to: [pt.x, pt.y],
          strokeColor: '#4fc3f7', strokeWidth: 1.5 / this.viewer.view.zoom,
          dashArray: [4 / this.viewer.view.zoom, 3 / this.viewer.view.zoom], insert: false
        });
        this.viewer._getWorldLayer().addChild(arc);
        this.previewItems.push(arc);
      }
    } else if (this.drawTool === 'rectangle' && this.drawStep >= 1) {
      this.addPreviewRect(p1, pt);
    }
    this.viewer.view.update();
  }

  /** 清除所有预览图形 */
  clearPreview(): void {
    for (const item of this.previewItems) item.remove();
    this.previewItems = [];
  }

  /** 添加预览点图形 */
  addPreviewPoint(x: number, y: number): paper.Item {
    const r = 4 / Math.max(this.viewer.view.zoom, 1e-6);
    const c = new paper.Path.Circle({ center: [x, y], radius: r, fillColor: '#4fc3f7', insert: false });
    this.viewer._getWorldLayer().addChild(c);
    this.previewItems.push(c);
    return c;
  }

  /** 添加预览直线图形 */
  addPreviewLine(p1: { x: number; y: number }, p2: { x: number; y: number }): paper.Item {
    const l = new paper.Path.Line({
      from: [p1.x, p1.y], to: [p2.x, p2.y],
      strokeColor: '#4fc3f7', strokeWidth: 1.5 / this.viewer.view.zoom,
      dashArray: [4 / this.viewer.view.zoom, 3 / this.viewer.view.zoom],
      insert: false
    });
    this.viewer._getWorldLayer().addChild(l);
    this.previewItems.push(l);
    return l;
  }

  /** 添加预览圆图形 */
  addPreviewCircle(cx: number, cy: number, r: number): paper.Item | undefined {
    if (r <= 0) return;
    const c = new paper.Path.Circle({
      center: [cx, cy], radius: r,
      strokeColor: '#4fc3f7', strokeWidth: 1.5 / this.viewer.view.zoom,
      dashArray: [4 / this.viewer.view.zoom, 3 / this.viewer.view.zoom],
      insert: false
    });
    this.viewer._getWorldLayer().addChild(c);
    this.previewItems.push(c);
    return c;
  }

  /** 添加预览圆弧图形 */
  addPreviewArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): paper.Item | undefined {
    if (r <= 0) return;
    const arc = new paper.Path.Arc({
      from: [cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle)],
      through: [cx + r * Math.cos((startAngle + endAngle) / 2), cy + r * Math.sin((startAngle + endAngle) / 2)],
      to: [cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle)],
      strokeColor: '#4fc3f7', strokeWidth: 1.5 / this.viewer.view.zoom,
      dashArray: [4 / this.viewer.view.zoom, 3 / this.viewer.view.zoom],
      insert: false
    });
    this.viewer._getWorldLayer().addChild(arc);
    this.previewItems.push(arc);
    return arc;
  }

  /** 添加预览矩形图形 */
  addPreviewRect(p1: { x: number; y: number }, p2: { x: number; y: number }): paper.Item {
    const r = new paper.Path.Rectangle({
      from: [p1.x, p1.y], to: [p2.x, p2.y],
      strokeColor: '#4fc3f7', strokeWidth: 1.5 / this.viewer.view.zoom,
      dashArray: [4 / this.viewer.view.zoom, 3 / this.viewer.view.zoom],
      insert: false
    });
    this.viewer._getWorldLayer().addChild(r);
    this.previewItems.push(r);
    return r;
  }
}
