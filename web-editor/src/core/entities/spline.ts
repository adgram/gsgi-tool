/**
 * 样条实体：拟合样条（SplineFitEntity）和控制点样条（SplineCvEntity）
 *
 * SplineFitEntity 通过拟合点（fit points）使用 Catmull-Rom 插值生成平滑曲线，
 * SplineCvEntity 通过控制点使用 de Boor 算法求值 B 样条曲线。
 */

import { Point2d, SplineFitCurve, SplineCvCurve } from '../geometry';
import { Transform } from '../transform';
import {
  Entity, nextId, EntityData, IResolver, GripPoint, SnapPoint, PropertyItem,
  editablePointGrips
} from '../entity';
import { PointEntity } from './point';

// ─── spline_fit ────────────────────────────────────
/** 拟合样条：通过一组拟合点的引用，使用 Catmull-Rom 算法生成平滑插值曲线 */
export class SplineFitEntity extends Entity {
  fit_point_refs: string[];
  degree: number;
  closed: boolean;
  tolerance: number;

  constructor(data: EntityData & { fit_point_refs?: string[]; degree?: number; closed?: boolean; tolerance?: number }) {
    super(data);
    this.fit_point_refs = data.fit_point_refs || [];
    this.degree = data.degree ?? 3;
    this.closed = !!data.closed;
    this.tolerance = data.tolerance ?? 0;
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.fit_point_refs = this.fit_point_refs;
    if (this.degree !== 3) o.degree = this.degree;
    if (this.closed) o.closed = true;
    if (this.tolerance !== 0) o.tolerance = this.tolerance;
    return o;
  }

  clone(): SplineFitEntity {
    const data = this.toJSON();
    data.id = nextId('SF');
    return new SplineFitEntity(data);
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    if (!this.fit_point_refs || this.fit_point_refs.length === 0) return new Point2d(0, 0);
    const r = resolver?.get(this.fit_point_refs[0])?.getResult(resolver);
    return r ? new Point2d(r.x, r.y) : new Point2d(0, 0);
  }

  /** 获取几何拟合样条曲线 */
  getCurve(resolver: IResolver | undefined): SplineFitCurve | null {
    if (this._curve) return this._curve;
    const pts = this._resolvePts(resolver);
    if (pts.length < 2) { console.warn(`[${this.id}] getCurve: insufficient resolved points (${pts.length})`); return null; }
    this._curve = new SplineFitCurve(pts, this.closed, this.degree);
    return this._curve;
  }

  /** 相等判断：比较拟合点引用、次数和闭合 */
  equals(other: SplineFitEntity, eps = 1e-12): boolean {
    if (this.fit_point_refs.length !== other.fit_point_refs.length || this.degree !== other.degree || this.closed !== other.closed) return false;
    for (let i = 0; i < this.fit_point_refs.length; i++) {
      if (this.fit_point_refs[i] !== other.fit_point_refs[i]) return false;
    }
    return true;
  }

  private _resolvePts(resolver: IResolver | undefined): Point2d[] {
    const pts: Point2d[] = [];
    for (const ref of this.fit_point_refs) {
      const r = resolver?.get(ref)?.getResult(resolver);
      if (r) pts.push(new Point2d(r.x, r.y));
    }
    return pts;
  }

  getSnapPoints(mode: string, resolver: IResolver | undefined): SnapPoint[] | null {
    if (!this.fit_point_refs || this.fit_point_refs.length < 2) return null;
    const pts: SnapPoint[] = [];
    for (const ref of this.fit_point_refs) {
      const r = resolver?.get(ref)?.getResult(resolver);
      if (r) pts.push({ pt: new Point2d(r.x, r.y), type: 'fit' });
    }
    return pts.length ? pts : null;
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'degree', label: '次数', type: 'number', value: this.degree });
    props.push({ key: 'closed', label: '闭合', type: 'boolean', value: this.closed });
    return props;
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    PointEntity.transformPoints(resolver, this.fit_point_refs, t);
    this._curve = null;
  }

  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    return editablePointGrips(resolver, this.fit_point_refs);
  }

}

// ─── spline_cv ─────────────────────────────────────
/** 控制点样条：通过控制点引用定义 B 样条曲线 */
export class SplineCvEntity extends Entity {
  control_point_refs: string[];
  knots: number[] | null;
  weights: number[] | null;
  degree: number;
  closed: boolean;

  constructor(data: EntityData & { control_point_refs?: string[]; knots?: number[]; weights?: number[]; degree?: number; closed?: boolean }) {
    super(data);
    this.control_point_refs = data.control_point_refs || [];
    this.knots = data.knots || null;
    this.weights = data.weights || null;
    this.degree = data.degree ?? 3;
    this.closed = !!data.closed;
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.control_point_refs = this.control_point_refs;
    if (this.knots) o.knots = this.knots;
    if (this.weights) o.weights = this.weights;
    if (this.degree !== 3) o.degree = this.degree;
    if (this.closed) o.closed = true;
    return o;
  }

  clone(): SplineCvEntity {
    const data = this.toJSON();
    data.id = nextId('SC');
    return new SplineCvEntity(data);
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    if (!this.control_point_refs || this.control_point_refs.length === 0) return new Point2d(0, 0);
    const r = resolver?.get(this.control_point_refs[0])?.getResult(resolver);
    return r ? new Point2d(r.x, r.y) : new Point2d(0, 0);
  }

  /** 获取几何控制点样条曲线 */
  getCurve(resolver: IResolver | undefined): SplineCvCurve | null {
    if (this._curve) return this._curve;
    const pts = this._resolvePts(resolver);
    if (pts.length < 2) { console.warn(`[${this.id}] getCurve: insufficient control points (${pts.length})`); return null; }
    this._curve = new SplineCvCurve(pts, this.closed, this.degree);
    return this._curve;
  }

  /** 相等判断：比较控制点引用、次数和闭合 */
  equals(other: SplineCvEntity, eps = 1e-12): boolean {
    if (this.control_point_refs.length !== other.control_point_refs.length || this.degree !== other.degree || this.closed !== other.closed) return false;
    for (let i = 0; i < this.control_point_refs.length; i++) {
      if (this.control_point_refs[i] !== other.control_point_refs[i]) return false;
    }
    return true;
  }

  private _resolvePts(resolver: IResolver | undefined): Point2d[] {
    const pts: Point2d[] = [];
    for (const ref of this.control_point_refs) {
      const r = resolver?.get(ref)?.getResult(resolver);
      if (r) pts.push(new Point2d(r.x, r.y));
    }
    return pts;
  }

  getSnapPoints(mode: string, resolver: IResolver | undefined): SnapPoint[] | null {
    if (!this.control_point_refs || this.control_point_refs.length < 2) return null;
    const pts: SnapPoint[] = [];
    for (const ref of this.control_point_refs) {
      const r = resolver?.get(ref)?.getResult(resolver);
      if (r) pts.push({ pt: new Point2d(r.x, r.y), type: 'control' });
    }
    return pts.length ? pts : null;
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'degree', label: '次数', type: 'number', value: this.degree });
    props.push({ key: 'closed', label: '闭合', type: 'boolean', value: this.closed });
    return props;
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    PointEntity.transformPoints(resolver, this.control_point_refs, t);
    this._curve = null;
  }

  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    return editablePointGrips(resolver, this.control_point_refs);
  }

}
