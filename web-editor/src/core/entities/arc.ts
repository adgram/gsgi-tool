/**
 * 弧线类实体：多段弧（PolyarcEntity）、合成曲线（PolycurveEntity）、三点弧（ArcEntity）
 *
 * PolyarcEntity 使用"顶点引用 + 凸度值（bulge）"描述弧线段，
 * PolycurveEntity 由多种类型的子段（直线、弧、曲线引用）组合而成，
 * ArcEntity 通过三端点（起点-中间点-终点）定义一条弧。
 */

import { Point2d, Box, ArcCurve, PolyarcCurve, boundingBox } from '../geometry';
import { Transform } from '../transform';
import {
  Entity, nextId, EntityData, IResolver, GripPoint, SnapPoint, PropertyItem,
  editablePointGrip, editablePointGrips
} from '../entity';
import { PointEntity } from './point';

// ─── polyarc ────────────────────────────────────────
/** 多段弧：point_refs 引用顶点，bulges 控制每段的凸度（0=直线，>0 逆时针弧，<0 顺时针弧） */
export class PolyarcEntity extends Entity {
  point_refs: string[];
  bulges: number[];
  closed: boolean;

  constructor(data: EntityData & { point_refs?: string[]; bulges?: number[]; closed?: boolean }) {
    super(data);
    this.point_refs = data.point_refs || [];
    this.bulges = data.bulges || [];
    this.closed = !!data.closed;
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.point_refs = this.point_refs; o.bulges = this.bulges;
    if (this.closed) o.closed = true;
    return o;
  }

  clone(): PolyarcEntity {
    const data = this.toJSON();
    data.id = nextId('PA');
    return new PolyarcEntity(data);
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    if (!this.point_refs || this.point_refs.length === 0) return new Point2d(0, 0);
    const r = resolver?.get(this.point_refs[0])?.getResult(resolver);
    return r ? new Point2d(r.x, r.y) : new Point2d(0, 0);
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    PointEntity.transformPoints(resolver, this.point_refs, t);
    this._curve = null;
  }

  /** 获取几何多段弧曲线 */
  getCurve(resolver: IResolver | undefined): any {
    if (this._curve) return this._curve;
    const pts: Point2d[] = [];
    for (const ref of this.point_refs) {
      const r = resolver?.get(ref)?.getResult(resolver);
      if (r) pts.push(new Point2d(r.x, r.y));
    }
    if (pts.length < 2) { console.warn(`[${this.id}] getCurve: insufficient resolved points (${pts.length})`); return null; }
    this._curve = new PolyarcCurve(pts, this.bulges, this.closed);
    return this._curve;
  }

  /** 相等判断：比较顶点引用、凸度和闭合 */
  equals(other: PolyarcEntity, eps = 1e-12): boolean {
    if (this.point_refs.length !== other.point_refs.length || this.closed !== other.closed) return false;
    for (let i = 0; i < this.point_refs.length; i++) {
      if (this.point_refs[i] !== other.point_refs[i]) return false;
      if (Math.abs((this.bulges[i] || 0) - (other.bulges[i] || 0)) >= eps) return false;
    }
    return true;
  }

  getSnapPoints(mode: string, resolver: IResolver | undefined): SnapPoint[] | null {
    if (!this.point_refs || this.point_refs.length < 2) return null;
    const pts: SnapPoint[] = [];
    for (const ref of this.point_refs) {
      const r = resolver?.get(ref)?.getResult(resolver);
      if (r) pts.push({ pt: new Point2d(r.x, r.y), type: 'vertex' });
    }
    return pts.length ? pts : null;
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'point_refs', label: '顶点引用数', type: 'text', value: this.point_refs ? this.point_refs.length : 0 });
    props.push({ key: 'closed', label: '闭合', type: 'boolean', value: this.closed });
    return props;
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    return editablePointGrips(resolver, this.point_refs);
  }

}

// ─── polycurve ─────────────────────────────────────
/** 合成曲线：由多种子段类型的 segments 数组组合而成 */
export class PolycurveEntity extends Entity {
  segments: any[];
  closed: boolean;

  constructor(data: EntityData & { segments?: any[]; closed?: boolean }) {
    super(data);
    this.segments = data.segments || [];
    this.closed = !!data.closed;
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.segments = this.segments; if (this.closed) o.closed = true;
    return o;
  }

  clone(): PolycurveEntity {
    const data = this.toJSON();
    data.id = nextId('PC');
    return new PolycurveEntity(data);
  }

  /** 获取所有子段的离散点序列 */
  getPolycurvePoints(resolver: IResolver | undefined, steps = 32): Point2d[] {
    if (!resolver) { console.warn(`[${this.id}] getPolycurvePoints: resolver is null`); return []; }
    const allPts: Point2d[] = [];
    const res = (ref: string) => resolver.entityCache.get(ref)?.getResult?.(resolver);
    for (const seg of this.segments || []) {
      switch (seg.type) {
        case 'line': {
          const p1 = res(seg.start_ref);
          const p2 = res(seg.end_ref);
          if (p1 && p2) allPts.push(new Point2d(p1.x, p1.y), new Point2d(p2.x, p2.y));
          else console.warn(`[${this.id}] line segment: missing refs start=${seg.start_ref} end=${seg.end_ref}`);
          break;
        }
        case 'curve_ref': {
          const entity = resolver.entityCache.get(seg.ref);
          if (!entity) { console.warn(`[${this.id}] curve_ref: entity ${seg.ref} not found`); break; }
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const curve = entity.getCurve?.(resolver) ?? null;
            if (!curve) { console.warn(`[${this.id}] curve_ref ${seg.ref}: getCurve returned null`); break; }
            const pt = curve.eval?.(t) ?? null;
            if (pt) allPts.push(pt);
          }
          if (seg.reverse) {
            const start = allPts.length - (steps + 1);
            if (start >= 0) {
              const sub = allPts.splice(start, steps + 1);
              allPts.push(...sub.reverse());
            }
          }
          break;
        }
        case 'subsegment_ref': {
          const subseg = resolver.entityCache.get(seg.ref);
          if (!subseg) { console.warn(`[${this.id}] subsegment_ref: entity ${seg.ref} not found`); break; }
          const ss: any = subseg;
          if (typeof ss.getSubsegmentPoints !== 'function') {
            console.warn(`[${this.id}] subsegment_ref: ${seg.ref} has no getSubsegmentPoints method`);
            break;
          }
          allPts.push(...ss.getSubsegmentPoints(resolver, steps));
          break;
        }
        case 'arc': {
          const startP = res(seg.start_ref);
          const midP = res(seg.mid_ref);
          const endP = res(seg.end_ref);
          if (!startP || !midP || !endP) {
            console.warn(`[${this.id}] arc segment: missing refs start=${seg.start_ref} mid=${seg.mid_ref} end=${seg.end_ref}`);
            break;
          }
          const arc = new ArcCurve(
            new Point2d(startP.x, startP.y),
            new Point2d(midP.x, midP.y),
            new Point2d(endP.x, endP.y)
          );
          for (let i = 0; i <= steps; i++) {
            const pt = arc.eval(i / steps);
            if (pt) allPts.push(pt);
          }
          break;
        }
        default:
          console.warn(`[${this.id}] unknown segment type: ${seg.type}`);
      }
    }
    return allPts;
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    const refs: string[] = [];
    for (const seg of this.segments) {
      if (seg.start_ref) refs.push(seg.start_ref);
      if (seg.end_ref) refs.push(seg.end_ref);
      if (seg.mid_ref) refs.push(seg.mid_ref);
      if (seg.center_ref) refs.push(seg.center_ref);
    }
    PointEntity.transformPoints(resolver, refs, t);
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    const pts = this.getPolycurvePoints(resolver);
    return (pts && pts.length > 0) ? pts[0] : new Point2d(0, 0);
  }

  getBox(resolver: IResolver | undefined): Box {
    const pts = this.getPolycurvePoints(resolver);
    if (!pts || pts.length < 2) return { min: new Point2d(0, 0), max: new Point2d(0, 0) };
    const bx = boundingBox(pts);
    return bx || { min: new Point2d(0, 0), max: new Point2d(0, 0) };
  }

  /** 相等判断：比较段数、闭合和每段的引用 */
  equals(other: PolycurveEntity, eps = 1e-12): boolean {
    if (this.segments.length !== other.segments.length || this.closed !== other.closed) return false;
    for (let i = 0; i < this.segments.length; i++) {
      const a = this.segments[i], b = other.segments[i];
      if (a.type !== b.type || a.start_ref !== b.start_ref || a.end_ref !== b.end_ref) return false;
    }
    return true;
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'segments', label: '段数', type: 'text', value: this.segments ? this.segments.length : 0 });
    props.push({ key: 'closed', label: '闭合', type: 'boolean', value: this.closed });
    return props;
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    if (!this.segments || this.segments.length === 0) return null;
    const refs: string[] = [];
    for (const seg of this.segments) {
      if (seg.start_ref) refs.push(seg.start_ref);
      if (seg.end_ref) refs.push(seg.end_ref);
      if (seg.mid_ref) refs.push(seg.mid_ref);
      if (seg.center_ref) refs.push(seg.center_ref);
    }
    return editablePointGrips(resolver, refs);
  }

}

// ─── arc (3P) ──────────────────────────────────────
/** 三点弧：由起点、中间点、终点三个引用确定一条弧线 */
export class ArcEntity extends Entity {
  start_ref: string;
  mid_ref: string;
  end_ref: string;

  constructor(data: EntityData & { start_ref?: string; mid_ref?: string; end_ref?: string }) {
    super(data);
    this.start_ref = data.start_ref ?? '';
    this.mid_ref = data.mid_ref ?? '';
    this.end_ref = data.end_ref ?? '';
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.start_ref = this.start_ref;
    o.mid_ref = this.mid_ref;
    o.end_ref = this.end_ref;
    return o;
  }

  clone(): ArcEntity {
    const data = this.toJSON();
    data.id = nextId('A');
    return new ArcEntity(data);
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    PointEntity.transformPoints(resolver, [this.start_ref, this.mid_ref, this.end_ref], t);
    this._curve = null;
  }

  /** 获取几何弧曲线 */
  getCurve(resolver: IResolver | undefined): ArcCurve | null {
    if (this._curve) return this._curve;
    const start = resolver?.get(this.start_ref)?.getResult(resolver);
    const mid = resolver?.get(this.mid_ref)?.getResult(resolver);
    const end = resolver?.get(this.end_ref)?.getResult(resolver);
    if (!start || !mid || !end) { console.warn(`[${this.id}] getCurve: missing arc refs s=${this.start_ref} m=${this.mid_ref} e=${this.end_ref}`); return null; }
    this._curve = new ArcCurve(new Point2d(start.x, start.y), new Point2d(mid.x, mid.y), new Point2d(end.x, end.y));
    return this._curve;
  }

  /** 计算弧参数（圆心、半径、起止角），委托 ArcCurve.getArcParams */
  _arcParams(resolver: IResolver | undefined) {
    const arc = this.getCurve(resolver);
    if (!arc) return null;
    const params = arc.getArcParams();
    if (!params) return null;
    return { cx: params.center.x, cy: params.center.y, r: params.r, start_angle: params.startAngle, sweep: params.sweep };
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    const r = resolver?.get(this.start_ref)?.getResult(resolver);
    return r ? new Point2d(r.x, r.y) : new Point2d(0, 0);
  }

  getBox(resolver: IResolver | undefined): Box {
    const p = this._arcParams(resolver);
    if (!p) return { min: new Point2d(0, 0), max: new Point2d(0, 0) };
    return { min: new Point2d(p.cx - p.r, p.cy - p.r), max: new Point2d(p.cx + p.r, p.cy + p.r) };
  }

  /** 相等判断：比较三个端点引用 */
  equals(other: ArcEntity, eps = 1e-12): boolean {
    return this.start_ref === other.start_ref && this.mid_ref === other.mid_ref && this.end_ref === other.end_ref;
  }

  getSnapPoints(mode: string, resolver: IResolver | undefined): SnapPoint[] | null {
    const p = this._arcParams(resolver);
    if (!p) return null;
    const pts: SnapPoint[] = [{ pt: new Point2d(p.cx, p.cy), type: 'center' }];
    const start = resolver?.get(this.start_ref)?.getResult(resolver);
    const end = resolver?.get(this.end_ref)?.getResult(resolver);
    const mid = resolver?.get(this.mid_ref)?.getResult(resolver);
    if (start) pts.push({ pt: new Point2d(start.x, start.y), type: 'endpoint' });
    if (end) pts.push({ pt: new Point2d(end.x, end.y), type: 'endpoint' });
    if (mid) pts.push({ pt: new Point2d(mid.x, mid.y), type: 'midpoint' });
    return pts;
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'start_ref', label: '起点引用', type: 'text', value: this.start_ref });
    props.push({ key: 'mid_ref', label: '中间点引用', type: 'text', value: this.mid_ref });
    props.push({ key: 'end_ref', label: '终点引用', type: 'text', value: this.end_ref });
    return props;
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): GripPoint[] {
    return [
      editablePointGrip(resolver, this.start_ref),
      editablePointGrip(resolver, this.mid_ref),
      editablePointGrip(resolver, this.end_ref)
    ].filter(Boolean) as GripPoint[];
  }

}
