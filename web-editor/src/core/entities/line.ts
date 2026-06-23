/**
 * 线类实体：直线（LineEntity）和多段线（PolylineEntity）
 *
 * 直线通过引用点（start_ref / end_ref）定义，内部使用 LineCurve 计算几何。
 * 多段线通过顶点数组定义，内部使用 PointsCurve 计算几何。
 */

import { Point2d, LineCurve, PointsCurve } from '../geometry';
import { Transform } from '../transform';
import {
  Entity, nextId, EntityData, IResolver, GripPoint, SnapPoint, PropertyItem,
  editablePointGrip
} from '../entity';
import { PointEntity } from './point';


// ─── line ──────────────────────────────────────────
/** 直线段：由起点引用和终点引用定义，内部委托 LineCurve 计算几何 */
export class LineEntity extends Entity {
  start_ref: string;
  end_ref: string;

  constructor(data: EntityData & { start_ref?: string; end_ref?: string }) {
    super(data);
    this.start_ref = data.start_ref ?? '';
    this.end_ref = data.end_ref ?? '';
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.start_ref = this.start_ref; o.end_ref = this.end_ref;
    return o;
  }

  clone(): LineEntity {
    const data = this.toJSON();
    data.id = nextId('L');
    return new LineEntity(data);
  }

  /** 获取或重建 LineCurve（惰性缓存） */
  getCurve(resolver: IResolver | undefined): LineCurve | null {
    const p1 = resolver?.get(this.start_ref)?.getResult(resolver);
    const p2 = resolver?.get(this.end_ref)?.getResult(resolver);
    if (!p1 || !p2) return null;
    this._curve = new LineCurve(p1, p2);
    return this._curve;
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    const byRule = this._resolveRepresentByRule(resolver);
    if (byRule) return byRule;
    const c = this.getCurve(resolver);
    return c ? c.mid() : new Point2d(0, 0);
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    PointEntity.transformPoints(resolver, [this.start_ref, this.end_ref], t);
    this._curve = null;
  }

  /** 点到线段的最近点参数 t，委托 LineCurve.tAt() */
  tAt(p: Point2d, resolver: IResolver | undefined): number {
    const c = this.getCurve(resolver);
    return c ? c.tAt(p) : 0;
  }

  /** 相等判断：比较起终点引用 */
  equals(other: LineEntity, eps = 1e-12): boolean {
    return this.start_ref === other.start_ref && this.end_ref === other.end_ref;
  }

  /** 吸附点：委托 LineCurve 计算端点和中点 */
  getSnapPoints(mode: string, resolver: IResolver | undefined): SnapPoint[] | null {
    const c = this.getCurve(resolver);
    if (!c) return null;
    const mid = c.eval(0.5);
    if (mode === 'endpoint' || !mode) {
      return [
        { pt: c.a.clone(), type: 'endpoint' },
        { pt: c.b.clone(), type: 'endpoint' }
      ];
    }
    if (mode === 'midpoint') return [{ pt: mid, type: 'midpoint' }];
    return [
      { pt: c.a.clone(), type: 'endpoint' },
      { pt: c.b.clone(), type: 'endpoint' },
      { pt: mid, type: 'midpoint' }
    ];
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'start_ref', label: '起点引用', type: 'text', value: this.start_ref });
    props.push({ key: 'end_ref', label: '终点引用', type: 'text', value: this.end_ref });
    return props;
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    const out: GripPoint[] = [];
    for (const ref of [this.start_ref, this.end_ref]) {
      const grip = editablePointGrip(resolver, ref);
      if (grip) out.push(grip);
    }
    return out.length ? out : null;
  }

  static get cliCommands() {
    return [{
      name: 'line',
      handler(viewer: any, args: string[]) {
        if (args.length < 4) { viewer._setDrawTool('line'); return; }
        const x1 = parseFloat(args[0]), y1 = parseFloat(args[1]);
        const x2 = parseFloat(args[2]), y2 = parseFloat(args[3]);
        if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) { viewer._setPrompt('坐标必须是数字'); return; }
        const before = viewer._saveSnapshot();
        const pid1 = viewer._ensurePoint(null, { x: x1, y: y1 }, '起点');
        const pid2 = viewer._ensurePoint(null, { x: x2, y: y2 }, '终点');
        const entity = viewer._createEntity({ type: 'line', id: nextId('L'), start_ref: pid1, end_ref: pid2, description: '直线' });
        viewer.doc.entities.push(entity);
        viewer._finishDraw(entity, before, `已创建直线 (${x1},${y1})-(${x2},${y2})`);
      },
      help: { short: '创建直线', usage: 'line <x1> <y1> <x2> <y2>', desc: '在指定坐标间创建直线。示例: line 0 0 100 100' }
    }];
  }
}

// ─── polyline ──────────────────────────────────────
/** 多段线：由多个顶点坐标数组定义，内部委托 PointsCurve 计算几何 */
export class PolylineEntity extends Entity {
  points: Point2d[];
  closed: boolean;

  constructor(data: any) {
    super(data);
    this.points = Array.isArray(data.points) ? data.points.map((p: any) => new Point2d(p.x ?? p[0], p.y ?? p[1])) : [];
    this.closed = data.closed ?? false;
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.points = this.points.map(p => [p.x, p.y]);
    if (this.closed) o.closed = true;
    return o;
  }

  clone(): PolylineEntity {
    const data = this.toJSON();
    data.id = nextId('PL');
    return new PolylineEntity(data);
  }

  /** 获取或重建 PointsCurve（惰性缓存） */
  getCurve(resolver?: any): PointsCurve {
    this._curve = new PointsCurve(this.points, this.closed);
    return this._curve;
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    const byRule = this._resolveRepresentByRule(resolver);
    if (byRule) return byRule;
    if (!this.points || this.points.length === 0) return new Point2d(0, 0);
    return this.points[0].clone();
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    for (const p of this.points) p.transform(t);
    this._curve = null;
    resolver?.updateItems?.([this.id]);
  }

  /** 点到折线的最近点参数 t，委托 PointsCurve.tAt() */
  tAt(p: Point2d): number {
    return this.getCurve().tAt(p);
  }

  /** 相等判断：委托 PointsCurve.equals() */
  equals(other: PolylineEntity, eps = 1e-12): boolean {
    return this.getCurve().equals(other.getCurve(), eps);
  }

  /** 分解为独立的点 + 直线段 */
  explode(resolver: IResolver | undefined): Entity[] | null {
    if (!this.points || this.points.length < 2) return null;
    const lines: Entity[] = [];
    const n = this.closed ? this.points.length : this.points.length - 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % this.points.length;
      const pid1 = nextId('P');
      const pid2 = nextId('P');
      lines.push(new PointEntity({ id: pid1, type: 'point', point: this.points[i].clone() }));
      lines.push(new PointEntity({ id: pid2, type: 'point', point: this.points[j].clone() }));
      lines.push(new LineEntity({
        id: `${this.id}_seg${i}`, type: 'line',
        start_ref: pid1, end_ref: pid2
      }));
    }
    return lines;
  }

  /** 吸附点：委托 PointsCurve 计算顶点和中点 */
  getSnapPoints(mode: string, resolver: IResolver | undefined): SnapPoint[] | null {
    if (!this.points || this.points.length < 2) return null;
    const c = this.getCurve();
    const pts: SnapPoint[] = [];
    const n = this.closed ? this.points.length : this.points.length - 1;
    for (let i = 0; i < this.points.length; i++) {
      const p = c.eval(i);
      if (p) pts.push({ pt: p, type: 'vertex' });
      if (mode !== 'endpoint' && i < n) {
        const mid = c.eval(i + 0.5);
        if (mid) pts.push({ pt: mid, type: 'midpoint' });
      }
    }
    return pts;
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'points', label: '顶点数', type: 'text', value: this.points ? this.points.length : 0 });
    props.push({ key: 'closed', label: '闭合', type: 'boolean', value: this.closed });
    return props;
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  /** 每个顶点作为一个可拖拽夹点 */
  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    if (!this.points || this.points.length < 2) return null;
    return this.points.map((p, i) => ({ pt: p.clone(), propPath: `points[${i}]`, isRef: false }));
  }

  /** 按 "points[index]" 模式解析 propPath 并更新对应顶点 */
  onGripDrag(propPath: string, newX: number, newY: number, resolver: IResolver | undefined): boolean {
    const m = propPath.match(/points\[(\d+)\]/);
    if (m && this.points) {
      const i = +m[1];
      if (this.points[i]) { this.points[i].x = newX; this.points[i].y = newY; this._curve = null; return true; }
    }
    return false;
  }

  /** 多点绘制处理器：每次点击收集一个点，按回车提交 */
}
