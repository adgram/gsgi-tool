/**
 * 圆（CircleEntity）和矩形（RectangleEntity）实体
 *
 * 圆：由中心点引用 + 半径定义
 * 矩形：由最小点和最大点引用定义（axis-aligned）
 */

import { Point2d, Box, CircleCurve} from '../geometry';
import { Transform } from '../transform';
import {
  Entity, nextId, EntityData, IResolver, GripPoint, SnapPoint, PropertyItem,
  editablePointGrip, editablePointGrips, dragEditablePoint
} from '../entity';
import { PolylineEntity } from './line';
import { PointEntity } from './point';

// ─── circle ────────────────────────────────────────
/** 圆实体：由 center_ref（圆心引用）+ r（半径）定义 */
export class CircleEntity extends Entity {
  center_ref: string;
  r: number;

  constructor(data: EntityData & { center_ref?: string; r?: number }) {
    super(data);
    this.center_ref = data.center_ref ?? '';
    this.r = data.r ?? 0;
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.center_ref = this.center_ref; o.r = this.r;
    return o;
  }

  clone(): CircleEntity {
    const data = this.toJSON();
    data.id = nextId('C');
    return new CircleEntity(data);
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    const c = resolver?.get(this.center_ref)?.getResult(resolver);
    return c ? new Point2d(c.x, c.y) : new Point2d(0, 0);
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    PointEntity.transformPoints(resolver, [this.center_ref], t);
    this._curve = null;
  }

  /** 获取几何圆曲线 */
  getCurve(resolver: IResolver | undefined): CircleCurve | null {
    if (this._curve) return this._curve;
    const c = resolver?.get(this.center_ref)?.getResult(resolver);
    if (!c) { console.warn(`[${this.id}] getCurve: center_ref ${this.center_ref} not resolved`); return null; }
    this._curve = new CircleCurve(new Point2d(c.x, c.y), this.r);
    return this._curve;
  }

  /** 点到圆的最近点参数 t，委托 CircleCurve.tAt() */
  tAt(p: Point2d, resolver: IResolver | undefined): number {
    const c = resolver?.get(this.center_ref)?.getResult(resolver);
    if (!c) return 0;
    return new CircleCurve(new Point2d(c.x, c.y), this.r).tAt(p);
  }

  /** 相等判断：比较圆心引用和半径 */
  equals(other: CircleEntity, eps = 1e-12): boolean {
    return this.center_ref === other.center_ref && Math.abs(this.r - other.r) < eps;
  }

  /** 吸附点：圆心 + 四个象限点（0°/90°/180°/270°） */
  getSnapPoints(mode: string, resolver: IResolver | undefined): SnapPoint[] | null {
    const c = resolver?.get(this.center_ref)?.getResult(resolver);
    if (!c) return null;
    const pts: SnapPoint[] = [{ pt: new Point2d(c.x, c.y), type: 'center' }];
    if (mode !== 'center') {
      for (const deg of [0, 90, 180, 270]) {
        const v = Point2d.fromAngle(deg * Math.PI / 180, this.r);
        pts.push({ pt: new Point2d(c.x, c.y).add(v), type: 'quadrant' });
      }
    }
    return pts;
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'center_ref', label: '中心引用', type: 'text', value: this.center_ref });
    props.push({ key: 'r', label: '半径', type: 'number', value: this.r });
    return props;
  }

  setProperty(key: string, value: any, resolver: IResolver | undefined): boolean {
    if (key === 'r') { this.r = Number(value); return true; }
    return super.setProperty(key, value, resolver);
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  /** 夹点：圆心可拖拽 + 右侧半径控制点 */
  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    const c = resolver?.get(this.center_ref)?.getResult(resolver);
    if (!c) return null;
    const out: GripPoint[] = [];
    const centerGrip = editablePointGrip(resolver, this.center_ref);
    if (centerGrip) out.push(centerGrip);
    out.push({ pt: new Point2d(c.x + this.r, c.y), propPath: 'radius', editable: true } as any);
    return out;
  }

  /** 拖拽 radius 夹点时根据距离重新计算半径 */
  onGripDrag(propPath: string, newX: number, newY: number, resolver: IResolver | undefined): boolean {
    if (propPath === 'radius') {
      const c = resolver?.get(this.center_ref)?.getResult(resolver);
      if (!c) return false;
      this.r = Math.max(Math.hypot(newX - c.x, newY - c.y), 1e-6);
      return true;
    }
    return dragEditablePoint(resolver, propPath, new Point2d(newX, newY));
  }

  static get cliCommands() {
    return [{
      name: 'circle',
      handler(viewer: any, args: string[]) {
        if (args.length < 3) { viewer._setDrawTool('circle'); return; }
        const cx = parseFloat(args[0]), cy = parseFloat(args[1]), r = parseFloat(args[2]);
        if (isNaN(cx) || isNaN(cy) || isNaN(r) || r <= 0) { viewer._setPrompt('参数无效'); return; }
        const before = viewer._saveSnapshot();
        const pid = viewer._ensurePoint(null, { x: cx, y: cy }, '圆心');
        const entity = viewer._createEntity({ type: 'circle', id: nextId('C'), center_ref: pid, r, description: `圆 r=${r}` });
        viewer.doc.entities.push(entity);
        viewer._finishDraw(entity, before, `已创建圆 (${cx},${cy}) r=${r}`);
      },
      help: { short: '创建圆', usage: 'circle <cx> <cy> <r>', desc: '在 (cx,cy) 处创建半径为 r 的圆。示例: circle 0 0 50' }
    }];
  }
}

// ─── rectangle ─────────────────────────────────────
/** 矩形实体：由两个对角点引用（min_ref / max_ref）定义，始终与坐标轴对齐 */
export class RectangleEntity extends Entity {
  min_ref: string;
  max_ref: string;

  constructor(data: EntityData & { min_ref?: string; max_ref?: string }) {
    super(data);
    this.min_ref = data.min_ref ?? '';
    this.max_ref = data.max_ref ?? '';
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.min_ref = this.min_ref; o.max_ref = this.max_ref;
    return o;
  }

  clone(): RectangleEntity {
    const data = this.toJSON();
    data.id = nextId('R');
    return new RectangleEntity(data);
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    PointEntity.transformPoints(resolver, [this.min_ref, this.max_ref], t);
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    const p1 = resolver?.get(this.min_ref)?.getResult(resolver);
    return p1 ? new Point2d(p1.x, p1.y) : new Point2d(0, 0);
  }

  getBox(resolver: IResolver | undefined): Box {
    const p1 = resolver?.get(this.min_ref)?.getResult(resolver);
    const p2 = resolver?.get(this.max_ref)?.getResult(resolver);
    if (!p1 || !p2) return { min: new Point2d(0, 0), max: new Point2d(0, 0) };
    return { min: new Point2d(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y)), max: new Point2d(Math.max(p1.x, p2.x), Math.max(p1.y, p2.y)) };
  }

  /** 吸附点：四个角点 + 四条边中点 */
  getSnapPoints(mode: string, resolver: IResolver | undefined): SnapPoint[] | null {
    const p1 = resolver?.get(this.min_ref)?.getResult(resolver);
    const p2 = resolver?.get(this.max_ref)?.getResult(resolver);
    if (!p1 || !p2) return null;
    const pts: SnapPoint[] = [];
    const corners = [
      { x: p1.x, y: p1.y }, { x: p2.x, y: p1.y },
      { x: p2.x, y: p2.y }, { x: p1.x, y: p2.y }
    ];
    for (const c of corners) pts.push({ pt: new Point2d(c.x, c.y), type: 'endpoint' });
    if (mode !== 'endpoint') {
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      pts.push({ pt: new Point2d(mx, p1.y), type: 'midpoint' });
      pts.push({ pt: new Point2d(mx, p2.y), type: 'midpoint' });
      pts.push({ pt: new Point2d(p1.x, my), type: 'midpoint' });
      pts.push({ pt: new Point2d(p2.x, my), type: 'midpoint' });
    }
    return pts;
  }

  /** 分解为四条 polyline 边 */
  explode(resolver: IResolver | undefined): Entity[] | null {
    const p1 = resolver?.get(this.min_ref)?.getResult(resolver);
    const p2 = resolver?.get(this.max_ref)?.getResult(resolver);
    if (!p1 || !p2) return null;
    const pts = [[p1.x, p1.y], [p2.x, p1.y], [p2.x, p2.y], [p1.x, p2.y]];
    const lines: Entity[] = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      lines.push(new PolylineEntity({
        id: `${this.id}_edge${i}`, points: [pts[i], pts[j]], closed: false
      }));
    }
    return lines;
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'min_ref', label: '最小点引用', type: 'text', value: this.min_ref });
    props.push({ key: 'max_ref', label: '最大点引用', type: 'text', value: this.max_ref });
    return props;
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    return editablePointGrips(resolver, [this.min_ref, this.max_ref]);
  }

}
