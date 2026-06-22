/**
 * 块引用（BlockRefEntity）、外部引用（XrefEntity）和子段（SubsegmentEntity）
 *
 * BlockRefEntity 引用一个 BlockDef，在 position_ref 处以指定旋转/缩放插入；
 * XrefEntity 引用外部文件，以占位符形式显示；
 * SubsegmentEntity 引用一条曲线的部分区间，用于截取子段。
 */

import { Point2d, Box, boundingBox } from '../geometry';
import { Transform } from '../transform';
import { PointEntity } from './point';
import {
  Entity, nextId, EntityData, IResolver, GripPoint, PropertyItem,
  editablePointGrip
} from '../entity';

interface DocWithBlock {
  getBlockById(id: string): { entities: Entity[]; base_point?: number[] } | null;
}

// ─── block_ref ─────────────────────────────────────
/** 块引用：在 position_ref 位置插入 block_id 指定的块定义 */
export class BlockRefEntity extends Entity {
  block_id: string;
  position_ref: string;
  rotation: number;
  scale_x: number;
  scale_y: number;
  attrs: Record<string, any> | null;

  constructor(data: EntityData & { block_id?: string; position_ref?: string; rotation?: number; scale_x?: number; scale_y?: number; attrs?: Record<string, any> }) {
    super(data);
    this.block_id = data.block_id ?? '';
    this.position_ref = data.position_ref ?? '';
    this.rotation = data.rotation ?? 0;
    this.scale_x = data.scale_x ?? 1;
    this.scale_y = data.scale_y ?? 1;
    this.attrs = data.attrs || null;
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.block_id = this.block_id; o.position_ref = this.position_ref;
    if (this.rotation !== 0) o.rotation = this.rotation;
    if (this.scale_x !== 1) o.scale_x = this.scale_x;
    if (this.scale_y !== 1) o.scale_y = this.scale_y;
    if (this.attrs) o.attrs = this.attrs;
    return o;
  }

  clone(): BlockRefEntity {
    const data = this.toJSON();
    data.id = nextId('BR');
    return new BlockRefEntity(data);
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    PointEntity.transformPoints(resolver, [this.position_ref], t);
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    const pt = resolver?.get(this.position_ref)?.getResult(resolver);
    return pt ? new Point2d(pt.x, pt.y) : new Point2d(0, 0);
  }

  getBox(resolver: IResolver | undefined): Box {
    const pt = resolver?.get(this.position_ref)?.getResult(resolver);
    if (!pt) return { min: new Point2d(0, 0), max: new Point2d(0, 0) };
    return { min: new Point2d(pt.x - 5, pt.y - 5), max: new Point2d(pt.x + 5, pt.y + 5) };
  }

  /** 分解为块定义中所有实体的克隆 */
  explode(resolver: IResolver | undefined): Entity[] | null {
    if (!resolver) return null;
    const blockDef = (resolver.doc as DocWithBlock).getBlockById(this.block_id);
    if (!blockDef) { console.warn(`[${this.id}] explode: block ${this.block_id} not found`); return null; }
    const pt = resolver?.get(this.position_ref)?.getResult(resolver);
    if (!pt) { console.warn(`[${this.id}] explode: position_ref ${this.position_ref} not resolved`); return null; }
    const items: Entity[] = [];
    const base = blockDef.base_point || [0, 0];
    const tx = pt.x - base[0], ty = pt.y - base[1];
    for (const be of blockDef.entities) {
      const cloned = be.clone();
      if (cloned.applyTransform) {
        cloned.applyTransform(resolver, Transform.translation(new Point2d(tx, ty)).multiply(Transform.rotation(this.rotation)).multiply(Transform.scaling(this.scale_x, this.scale_y)));
      }
      cloned.id = `${this.id}_${be.id}`;
      items.push(cloned);
    }
    return items;
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'block_id', label: '块 ID', type: 'text', value: this.block_id });
    props.push({ key: 'rotation', label: '旋转', type: 'number', value: this.rotation });
    props.push({ key: 'scale_x', label: 'X 比例', type: 'number', value: this.scale_x });
    props.push({ key: 'scale_y', label: 'Y 比例', type: 'number', value: this.scale_y });
    if (this.attrs) props.push({ key: 'attrs', label: '属性', type: 'text', value: JSON.stringify(this.attrs) });
    return props;
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    const grip = editablePointGrip(resolver, this.position_ref);
    return grip ? [grip] : null;
  }

}

// ─── xref ──────────────────────────────────────────
/** 外部引用：引用外部文件，在 position_ref 处显示占位符 */
export class XrefEntity extends Entity {
  file_path: string;
  block_id: string | null;
  position_ref: string;
  rotation: number;
  scale_x: number;
  scale_y: number;

  constructor(data: EntityData & { file_path?: string; block_id?: string; position_ref?: string; rotation?: number; scale_x?: number; scale_y?: number }) {
    super(data);
    this.file_path = data.file_path ?? '';
    this.block_id = data.block_id || null;
    this.position_ref = data.position_ref ?? '';
    this.rotation = data.rotation ?? 0;
    this.scale_x = data.scale_x ?? 1;
    this.scale_y = data.scale_y ?? 1;
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.file_path = this.file_path; o.position_ref = this.position_ref;
    if (this.block_id) o.block_id = this.block_id;
    if (this.rotation !== 0) o.rotation = this.rotation;
    if (this.scale_x !== 1) o.scale_x = this.scale_x;
    if (this.scale_y !== 1) o.scale_y = this.scale_y;
    return o;
  }

  clone(): XrefEntity {
    const data = this.toJSON();
    data.id = nextId('XR');
    return new XrefEntity(data);
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    const pt = resolver?.get(this.position_ref)?.getResult(resolver);
    return pt ? new Point2d(pt.x, pt.y) : new Point2d(0, 0);
  }

  getBox(resolver: IResolver | undefined): Box {
    const pt = resolver?.get(this.position_ref)?.getResult(resolver);
    if (!pt) return { min: new Point2d(0, 0), max: new Point2d(0, 0) };
    const estW = this.file_path.length * 6 + 20;
    return { min: new Point2d(pt.x - 5, pt.y - 15), max: new Point2d(pt.x + estW + 5, pt.y + 3) };
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'file_path', label: '文件路径', type: 'text', value: this.file_path });
    return props;
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    const grip = editablePointGrip(resolver, this.position_ref);
    return grip ? [grip] : null;
  }

}

// ─── subsegment ────────────────────────────────────
/** 子段：引用一条曲线的 [from_t, to_t] 区间 */
export class SubsegmentEntity extends Entity {
  curve_ref: string;
  from_t: number;
  to_t: number;
  from_point: any;
  to_point: any;
  label: string;

  constructor(data: EntityData & { curve_ref?: string; from_t?: number; to_t?: number; from_point?: any; to_point?: any; label?: string }) {
    super(data);
    this.curve_ref = data.curve_ref ?? '';
    this.from_t = data.from_t ?? 0;
    this.to_t = data.to_t ?? 1;
    this.from_point = data.from_point || null;
    this.to_point = data.to_point || null;
    this.label = data.label || '';
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.curve_ref = this.curve_ref; o.from_t = this.from_t; o.to_t = this.to_t;
    if (this.from_point) o.from_point = this.from_point;
    if (this.to_point) o.to_point = this.to_point;
    if (this.label) o.label = this.label;
    return o;
  }

  clone(): SubsegmentEntity {
    const data = this.toJSON();
    data.id = nextId('SS');
    return new SubsegmentEntity(data);
  }

  /** 在 [from_t, to_t] 区间内对引用的曲线采样离散点 */
  getSubsegmentPoints(resolver: IResolver | undefined, steps = 32): Point2d[] {
    if (!resolver) { console.warn(`[${this.id}] getSubsegmentPoints: resolver is null`); return []; }
    if (!this.curve_ref) { console.warn(`[${this.id}] getSubsegmentPoints: curve_ref is empty`); return []; }
    const entity = resolver.entityCache.get(this.curve_ref);
    if (!entity) { console.warn(`[${this.id}] getSubsegmentPoints: referenced entity ${this.curve_ref} not found`); return []; }
    const pts: Point2d[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = this.from_t + (this.to_t - this.from_t) * (i / steps);
      const curve = entity.getCurve?.(resolver) ?? null;
      if (!curve) { console.warn(`[${this.id}] getCurve returned null for ${this.curve_ref}`); break; }
      const pt = curve.eval?.(t) ?? null;
      if (pt) pts.push(pt);
    }
    return pts;
  }

  getBox(resolver: IResolver | undefined): Box {
    const pts = this.getSubsegmentPoints(resolver);
    if (!pts || pts.length < 2) return { min: new Point2d(0, 0), max: new Point2d(0, 0) };
    return boundingBox(pts) || { min: new Point2d(0, 0), max: new Point2d(0, 0) };
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'curve_ref', label: '曲线引用', type: 'text', value: this.curve_ref });
    props.push({ key: 'from_t', label: '起始 t', type: 'number', value: this.from_t });
    props.push({ key: 'to_t', label: '终止 t', type: 'number', value: this.to_t });
    return props;
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): null { return null; }

}
