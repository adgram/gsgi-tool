/**
 * 点实体：独立点（PointEntity）和参数化曲线上点（ParamPtEntity）
 *
 * PointEntity 支持 ref_pt 链式偏移，ParamPtEntity 在曲线上按参数 t 求值。
 * 点实体通常用作其他几何实体的"骨架参考点"。
 */

import {Entity, nextId, EntityData, IResolver, GripPoint, SnapPoint, PropertyItem} from '../entity';
import { Point2d, Box } from '../geometry';
import { Transform } from '../transform';

// 点的渲染尺寸
const RENDER_SIZE = 5;

// ─── point ─────────────────────────────────────────
export class PointEntity extends Entity {
  point: Point2d | null;
  ref_pt: string | null;
  point_role: string | null;
  construction: boolean;

  constructor(data: EntityData & { point?: number[] | Point2d; ref_pt?: string; point_role?: string; role?: string; construction?: boolean }) {
    super(data);
    if (data.point) {
      this.point = data.point instanceof Point2d ? data.point : new Point2d(data.point[0], data.point[1]);
    } else {
      this.point = null;
    }
    this.ref_pt = data.ref_pt || null;
    this.point_role = data.point_role || data.role || null;
    this.construction = data.construction === true;
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    if (this.point) {
      o.point = [this.point.x, this.point.y];
      if (this.ref_pt) o.ref_pt = this.ref_pt;
    }
    if (this.point_role) o.point_role = this.point_role;
    if (this.construction) o.construction = true;
    return o;
  }

  getResult(resolver: IResolver | undefined): Point2d {
    if (!this.ref_pt) return this.point ?? new Point2d(0, 0);
    const ref = resolver?.get(this.ref_pt);
    if (!ref) return this.point ?? new Point2d(0, 0);
    const offset = this.point ?? new Point2d(0, 0);
    return ref.getRefPoint(resolver, offset);
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    return this.getResult(resolver);
  }

  getBox(resolver: IResolver | undefined): Box{
    const p = this.getResult(resolver);
    return { min: p, max: p };
  }

  clone(): PointEntity {
    const data = this.toJSON();
    data.id = nextId('P');
    return new PointEntity(data);
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    if (this.ref_pt) return;
    if (!this.point) return;
    (this.point as Point2d).transform(t);
    resolver?.updateItems([this.id]);
  }

  static transformPoints(resolver: IResolver | undefined, pts: string[], t: Transform): void {
    if (!resolver) return;
    const res: string[] = [];
    for (const ptId of pts) {
      const ptEntity = resolver.entityCache.get(ptId);
      if (ptEntity && !ptEntity.ref_pt && ptEntity.point){
          (ptEntity.point as Point2d).transform(t);
          res.push(ptId);
      }
    }
    resolver.updateItems(res);
  }
  
  moveTo(resolver: IResolver | undefined, newPt: Point2d): boolean {
    if (this.ref_pt) return false;
    if (!this.point) return false;
    this.point = newPt;
    resolver?.updateItems([this.id]);
    return true;
  }

  getSnapPoints(mode: string, resolver: IResolver | undefined): SnapPoint[]{
    const pt = this.getResult(resolver);
    return [{ pt, type: 'point' }];
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    if (this.point) {
      props.push({ key: 'x', label: 'X', type: 'number', value: this.point.x });
      props.push({ key: 'y', label: 'Y', type: 'number', value: this.point.y });
    }
    if (this.ref_pt) props.push({ key: 'ref_pt', label: '参照点', type: 'text', value: this.ref_pt });
    return props;
  }

  setProperty(key: string, value: any, resolver: IResolver | undefined): boolean {
    if (key === 'x' && this.point) { this.point.x = Number(value); return true; }
    if (key === 'y' && this.point) { this.point.y = Number(value); return true; }
    if (key === 'ref_pt') { this.ref_pt = value || null; return true; }
    return super.setProperty(key, value, resolver);
  }

  render(parent: any, resolver: IResolver | undefined, doc: any, renderer?: any): any[] | null {
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    if (!this.point || this.ref_pt) return null;
    return [{ pt: this.point.clone(), propPath: 'point', isRef: false }];
  }

  onGripDrag(propPath: string, newX: number, newY: number, resolver: IResolver | undefined): boolean {
    if (propPath === 'point') { return this.moveTo(resolver, new Point2d(newX, newY)); }
    return false;
  }

  static get cliCommands() {
    return [{
      name: 'point',
      handler(viewer: any, args: string[]) {
        if (args.length < 2) { viewer._setDrawTool('point'); return; }
        const x = parseFloat(args[0]), y = parseFloat(args[1]);
        if (isNaN(x) || isNaN(y)) { viewer._setPrompt('坐标必须是数字'); return; }
        const before = viewer._saveSnapshot();
        const pt = viewer._createEntity({ type: 'point', id: nextId('P'), point: [x, y], description: `点 (${x},${y})` });
        viewer.doc.entities.push(pt);
        viewer._finishDraw(pt, before, `已创建点 (${x}, ${y})`);
      },
      help: { short: '创建点', usage: 'point <x> <y>', desc: '在 (x,y) 处创建一个点实体。示例: point 10 20' }
    }];
  }
}

// ─── param_pt ──────────────────────────────────────
export class ParamPtEntity extends Entity {
  curve_ref: string;
  t: number;
  label: string;
  private _cachedPoint: Point2d | null = null;
  private _cacheKey: string = '';

  constructor(data: EntityData & { curve_ref?: string; t?: number; label?: string }) {
    super(data);
    this.curve_ref = data.curve_ref ?? '';
    this.t = data.t ?? 0;
    this.label = data.label || '';
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.curve_ref = this.curve_ref; o.t = this.t;
    const p = this._evalCurve(undefined);
    o.point = [p.x, p.y];
    if (this.label) o.label = this.label;
    return o;
  }

  private _evalCurve(resolver: IResolver | undefined): Point2d {
    if (this.curve_ref && resolver) {
      const entity = resolver.get(this.curve_ref);
      if (entity && typeof entity.getCurve === 'function') {
        const curve = entity.getCurve(resolver);
        if (curve && typeof curve.eval === 'function') {
          const pt = curve.eval(this.t);
          if (pt) return pt;
        }
      }
    }
    return new Point2d(0, 0);
  }

  getResult(resolver: IResolver | undefined): Point2d {
    const key = `${this.curve_ref}@${this.t}`;
    if (this._cacheKey !== key || !this._cachedPoint) {
      this._cachedPoint = this._evalCurve(resolver);
      this._cacheKey = key;
    }
    return this._cachedPoint;
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    return this.getResult(resolver);
  }
  
  getBox(resolver: IResolver | undefined): Box {
    const p = this.getRepresent(resolver);
    return { min: p, max: p };
  }

  clone(): ParamPtEntity {
    const data = this.toJSON();
    data.id = nextId('PP');
    return new ParamPtEntity(data);
  }

  update(resolver: IResolver | undefined): void {
    this._cacheKey = "";
  }

  getSnapPoints(mode: string, resolver: IResolver | undefined): SnapPoint[] {
    const pt = this.getRepresent(resolver);
    return [{ pt, type: 'point' }];
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'curve_ref', label: '曲线引用', type: 'text', value: this.curve_ref });
    props.push({ key: 't', label: '参数 t', type: 'number', value: this.t });
    if (this.label) props.push({ key: 'label', label: '标签', type: 'text', value: this.label });
    return props;
  }

  setProperty(key: string, value: any, resolver: IResolver | undefined): boolean {
    if (key === 't') { this.t = parseFloat(value); this._cacheKey = ''; return true; }
    if (key === 'label') { this.label = value; return true; }
    return super.setProperty(key, value, resolver);
  }

  render(parent: any, resolver: IResolver | undefined, doc: any, renderer: any): any[] | null {
    const pt = this.getRepresent(resolver);
    if (renderer) {
      const item = renderer._createScreenFixedItem('circle', pt.x, pt.y, RENDER_SIZE*2,
        { strokeColor: doc.resolveColor(this), strokeWidth: 1 });
      parent.addChild(item);
      return [item];
    }
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): null { return null; }
}
