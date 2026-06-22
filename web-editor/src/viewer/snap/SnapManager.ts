/**
 * 捕捉管理器 — 整合栅格捕捉、对象捕捉、最近点捕捉
 *
 * 支持三种捕捉模式，优先级从高到低：
 * 1. 对象捕捉（端点/中点/圆心等，附带 pointId）
 * 2. 最近点捕捉（曲线上最近点，附带 entityId/t）
 * 3. 栅格捕捉（按文档比例对齐）
 */

import paper from 'paper';
import { Point2d, LineCurve, ArcCurve, PointsCurve } from '../../core/geometry';
import { Resolver } from '../../core/resolver';

/** 通过 resolver 获取实体解析后的坐标 */
function resolveCoord(resolver: Resolver, id: string): { x: number; y: number } | null {
  const ent = resolver.get(id) as any;
  return ent?.getResult(resolver) ?? null;
}

interface SnapResult {
  x: number;
  y: number;
  pointId?: string;   // 命中的点实体 ID（复用已有 PointEntity）
  lineId?: string;     // 命中的曲线实体 ID（最近点捕捉）
  t?: number;          // 曲线参数位置
}

interface NearestResult {
  x: number;
  y: number;
  t?: number;          // 曲线参数位置
}

/** 捕捉管理器：整合栅格捕捉、对象捕捉、最近点捕捉，统一提供 snapPoint 接口 */
export class SnapManager {
  viewer: any;
  _snapEnabled: boolean;       // 栅格捕捉开关
  _gridEnabled: boolean;       // 栅格显示开关
  _objectSnapEnabled: boolean; // 对象捕捉开关（端点/中点/圆心等）
  _nearestSnapEnabled: boolean;// 最近点捕捉开关
  _snapIndicator: any;         // 捕捉指示器（橙色圆圈标记）
  _gridItems: any[];           // 当前显示的栅格线

  constructor(viewer: any) {
    this.viewer = viewer;
    this._snapEnabled = localStorage.getItem('gsgi_snap') !== '0';
    this._gridEnabled = localStorage.getItem('gsgi_grid') === '1';
    this._objectSnapEnabled = localStorage.getItem('gsgi_osnap') === '1';
    this._nearestSnapEnabled = localStorage.getItem('gsgi_nearest') === '1';
    this._snapIndicator = null;
    this._gridItems = [];
  }

  /** 核心捕捉入口：按优先级依次尝试对象捕捉 → 最近点 → 栅格 */
  snapPoint(pt: { x: number; y: number }): SnapResult {
    let result: SnapResult = { x: pt.x, y: pt.y };
    const resolver = this.viewer.renderer?.resolver;
    const tol = 10 / (this.viewer.view?.zoom || 1);

    if (this._objectSnapEnabled && resolver) {
      const best = this._findBestSnap(pt, resolver, tol);
      if (best) {
        result = { x: best.x, y: best.y };
        if (best.pointId) result.pointId = best.pointId;
      }
    }

    if (this._nearestSnapEnabled && resolver && !result.pointId) {
      const best = this._findNearestOnCurve(pt, resolver, tol);
      if (best) {
        result = { x: best.x, y: best.y };
        if (best.lineId) result.lineId = best.lineId;
        if (best.t != null) result.t = best.t;
      }
    }

    if (this._snapEnabled && this.viewer.doc?.properties?.scale && !result.pointId && !result.lineId) {
      const g = this.viewer.doc.properties.scale;
      result.x = Math.round(pt.x / g) * g;
      result.y = Math.round(pt.y / g) * g;
    }

    return result;
  }

  /** 遍历所有可见实体，返回距离 pt 最近且在容差内的对象捕捉点 */
  _findBestSnap(pt: { x: number; y: number }, resolver: Resolver, tol: number): (SnapResult & { type?: string }) | null {
    let best: (SnapResult & { type?: string }) | null = null;
    let bestD = tol * tol;
    for (const entity of this.viewer.doc.entities) {
      if (entity.visible === false) continue;
      const snapPts = entity.getSnapPoints(null, resolver);
      if (!snapPts) continue;
      for (const sp of snapPts) {
        if (sp.pt.x == null || sp.pt.y == null) continue;
        const d = (pt.x - sp.pt.x) ** 2 + (pt.y - sp.pt.y) ** 2;
        if (d < bestD) {
          bestD = d;
          const pointId = this._findPointEntityAt(sp.pt.x, sp.pt.y, resolver);
          best = { x: sp.pt.x, y: sp.pt.y, type: sp.type, pointId: pointId ?? undefined };
        }
      }
    }
    return best;
  }

  /** 在捕捉位置查找已存在的 PointEntity / ParamPtEntity，用于复用 */
  _findPointEntityAt(x: number, y: number, resolver: Resolver): string | null {
    const eps = 1e-6;
    for (const e of this.viewer.doc.entities) {
      if (e.visible === false) continue;
      if (e.type === 'point' || e.type === 'param_pt') {
        const ent = resolver.get(e.id);
        if (ent) {
          const r = (ent as any)?.getResult(resolver);
          if (r && Math.abs(r.x - x) < eps && Math.abs(r.y - y) < eps) return e.id;
        }
      }
    }
    return null;
  }

  /** 遍历所有曲线类实体，求曲线上距离 pt 最近的点 */
  _findNearestOnCurve(pt: { x: number; y: number }, resolver: Resolver, tol: number): SnapResult | null {
    let best: SnapResult | null = null;
    let bestD = tol * tol;
    for (const entity of this.viewer.doc.entities) {
      if (entity.visible === false) continue;
      const npt = this._nearestOnEntity(entity, pt, resolver);
      if (!npt) continue;
      const d = Math.hypot(pt.x - npt.x, pt.y - npt.y);
      if (d * d < bestD) { bestD = d * d; best = { x: npt.x, y: npt.y, lineId: entity.id, t: npt.t }; }
    }
    return best;
  }

  /** 按实体类型分支，计算单个实体上距离 pt 最近的点 */
  _nearestOnEntity(entity: any, pt: { x: number; y: number }, resolver: Resolver): NearestResult | null {
    const p = new Point2d(pt.x, pt.y);
    switch (entity.type) {
      case 'line':
      case 'polyline':
      case 'circle':
      case 'arc':
      case 'polyarc':
      case 'spline_cv':
      case 'spline_fit':
        return entity.getCurve?.(resolver)?.nearestPoint?.(p) ?? null;
      case 'polycurve': {
        const segments = entity.segments || [];
        if (!segments.length) return null;
        let best: NearestResult | null = null, bestD = Infinity;
        for (let si = 0; si < segments.length; si++) {
          const c = this._nearestOnPolycurveSeg(segments[si], pt, resolver);
          if (c) {
            const d = Math.hypot(pt.x - c.x, pt.y - c.y);
            if (d < bestD) { bestD = d; best = { x: c.x, y: c.y, t: si + (c.t ?? 0) }; }
          }
        }
        return best;
      }
      case 'rectangle': {
        const min = resolveCoord(resolver, entity.min_ref);
        const max = resolveCoord(resolver, entity.max_ref);
        if (!min || !max) return null;
        const corners = [
          { x: min.x, y: min.y }, { x: max.x, y: min.y },
          { x: max.x, y: max.y }, { x: min.x, y: max.y }
        ].map(c => new Point2d(c.x, c.y));
        const curve = new PointsCurve(corners, true);
        return curve.nearestPoint(p);
      }
      case 'point':
      case 'coord_sys':
      case 'dimension':
      case 'param_pt':
      case 'subsegment':
      case 'region_anno':
      case 'position':
      case 'block_ref':
      case 'xref':
      case 'custom':
      case 'text':
        return null;
      default:
        console.warn(`[SnapManager._nearestOnEntity] unknown entity type: ${entity.type}`);
        return null;
    }
  }

  /** 复合曲线单个子段上的最近点，支持 line/arc/curve_ref/subsegment_ref */
  _nearestOnPolycurveSeg(seg: any, pt: { x: number; y: number }, resolver: Resolver): NearestResult | null {
    const p = new Point2d(pt.x, pt.y);
    switch (seg.type) {
      case 'line': {
        const p1 = resolveCoord(resolver, seg.start_ref);
        const p2 = resolveCoord(resolver, seg.end_ref);
        if (!p1 || !p2) {
          console.warn(`[SnapManager] line seg: missing refs start=${seg.start_ref} end=${seg.end_ref}`);
          return null;
        }
        return new LineCurve(new Point2d(p1.x, p1.y), new Point2d(p2.x, p2.y)).nearestPoint(p);
      }
      case 'arc': {
        const start = resolveCoord(resolver, seg.start_ref);
        const mid = resolveCoord(resolver, seg.mid_ref);
        const end = resolveCoord(resolver, seg.end_ref);
        if (!start || !mid || !end) {
          console.warn(`[SnapManager] arc seg: missing refs start=${seg.start_ref} mid=${seg.mid_ref} end=${seg.end_ref}`);
          return null;
        }
        return new ArcCurve(new Point2d(start.x, start.y), new Point2d(mid.x, mid.y), new Point2d(end.x, end.y)).nearestPoint(p);
      }
      case 'curve_ref':
      case 'subsegment_ref': {
        const refEntity = resolver.entityCache?.get(seg.ref);
        if (!refEntity) { console.warn(`[SnapManager] ${seg.type}: entity ${seg.ref} not found`); return null; }
        const c = this._nearestOnEntity(refEntity, pt, resolver);
        return c ? { x: c.x, y: c.y, t: c.t ?? 0 } : null;
      }
      default:
        console.warn(`[SnapManager._nearestOnPolycurveSeg] unhandled segment type: ${seg.type}`);
        return null;
    }
  }

  /** 更新捕捉指示器：当鼠标位置与捕捉位置差异大于阈值时显示橙色圆圈 */
  updateSnapIndicator(pt: { x: number; y: number }): void {
    if (this._snapIndicator) { this._snapIndicator.remove(); this._snapIndicator = null; }
    if (!this._snapEnabled && !this._objectSnapEnabled && !this._nearestSnapEnabled) return;
    if (this.viewer._drawTool === 'select' || !this.viewer.project) return;
    const snapPt = this.snapPoint(pt);
    if (Math.abs(snapPt.x - pt.x) < 0.1 && Math.abs(snapPt.y - pt.y) < 0.1) return;
    const size = 6 / this.viewer.view.zoom;
    this._snapIndicator = new paper.Path.Circle({
      center: new paper.Point(snapPt.x, snapPt.y), radius: size,
      strokeColor: new paper.Color('#FF6600'), strokeWidth: 1.5 / this.viewer.view.zoom,
      fillColor: new paper.Color(1, 0.4, 0, 0.2), insert: false
    });
    this.viewer._getWorldLayer().addChild(this._snapIndicator);
  }

  /** 移除捕捉指示器 */
  clearIndicator(): void {
    if (this._snapIndicator) { this._snapIndicator.remove(); this._snapIndicator = null; }
  }

  /** 更新栅格显示：根据视图边界和文档比例绘制栅格线，过密时自动隐藏 */
  updateGridDisplay(): void {
    if (!this.viewer.project) return;
    for (const item of this._gridItems || []) item.remove();
    this._gridItems = [];
    if (!this._gridEnabled || !this.viewer.doc) {
      this.viewer._getWorldLayer().activate();
      return;
    }
    let gridLayer = this.viewer.project.layers.find((l: any) => l.name === '__grid__');
    if (!gridLayer) {
      gridLayer = new paper.Layer({ name: '__grid__', insert: false });
      this.viewer.project.insertLayer(0, gridLayer);
    }
    gridLayer.applyMatrix = true;
    gridLayer.matrix = new paper.Matrix();
    const scale = this.viewer.doc.properties?.scale || 1;
    const g = scale;
    if (g * this.viewer.view.zoom < 20) { this.viewer._getWorldLayer().activate(); return; }
    const viewBounds = this.viewer.view.bounds;
    const startX = Math.floor(viewBounds.left / g) * g;
    const startY = Math.floor(viewBounds.top / g) * g;
    const endX = Math.ceil(viewBounds.right / g) * g;
    const endY = Math.ceil(viewBounds.bottom / g) * g;
    const color = new paper.Color(1, 1, 1, 0.15);
    for (let x = startX; x <= endX; x += g) {
      const line = new paper.Path.Line({ from: new paper.Point(x, startY), to: new paper.Point(x, endY), strokeColor: color, strokeWidth: 1, strokeScaling: false, insert: false });
      gridLayer.addChild(line); line.data.grid = true; this._gridItems.push(line);
    }
    for (let y = startY; y <= endY; y += g) {
      const line = new paper.Path.Line({ from: new paper.Point(startX, y), to: new paper.Point(endX, y), strokeColor: color, strokeWidth: 1, strokeScaling: false, insert: false });
      gridLayer.addChild(line); line.data.grid = true; this._gridItems.push(line);
    }
    this.viewer._getWorldLayer().activate();
  }

  /** 绑定工具栏按钮事件，状态持久化到 localStorage */
  setupUI(): void {
    const btnSnap = document.getElementById('btn-snap');
    const btnGrid = document.getElementById('btn-grid');
    const btnOsnap = document.getElementById('btn-osnap');
    const btnNearest = document.getElementById('btn-nearest');
    if (btnSnap) {
      btnSnap.classList.toggle('active', this._snapEnabled);
      btnSnap.addEventListener('click', () => { this._snapEnabled = !this._snapEnabled; btnSnap.classList.toggle('active', this._snapEnabled); localStorage.setItem('gsgi_snap', this._snapEnabled ? '1' : '0'); });
    }
    if (btnOsnap) {
      btnOsnap.classList.toggle('active', this._objectSnapEnabled);
      btnOsnap.addEventListener('click', () => { this._objectSnapEnabled = !this._objectSnapEnabled; btnOsnap.classList.toggle('active', this._objectSnapEnabled); localStorage.setItem('gsgi_osnap', this._objectSnapEnabled ? '1' : '0'); });
    }
    if (btnGrid) {
      btnGrid.classList.toggle('active', this._gridEnabled);
      btnGrid.addEventListener('click', () => { this._gridEnabled = !this._gridEnabled; btnGrid.classList.toggle('active', this._gridEnabled); localStorage.setItem('gsgi_grid', this._gridEnabled ? '1' : '0'); this.updateGridDisplay(); });
    }
    if (btnNearest) {
      btnNearest.classList.toggle('active', this._nearestSnapEnabled);
      btnNearest.addEventListener('click', () => { this._nearestSnapEnabled = !this._nearestSnapEnabled; btnNearest.classList.toggle('active', this._nearestSnapEnabled); localStorage.setItem('gsgi_nearest', this._nearestSnapEnabled ? '1' : '0'); });
    }
  }
}
