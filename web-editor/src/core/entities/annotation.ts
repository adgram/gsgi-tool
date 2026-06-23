/**
 * 注释和标注实体：区域标注（RegionAnnoEntity）、位置标注（PositionEntity）、
 * 坐标系（CoordSysEntity）、自定义实体（CustomEntity）
 */

import { Point2d, Box, boundingBox } from '../geometry';
import { Transform } from '../transform';
import {
  Entity, nextId, EntityData, IResolver, GripPoint, SnapPoint, PropertyItem,
  editablePointGrip, dragEditablePoint
} from '../entity';
import { PointEntity } from './point';

// ─── region_anno ───────────────────────────────────
/** 区域标注：引用一组 Polycurve 边缘形成封闭区域 */
export class RegionAnnoEntity extends Entity {
  edges_refs: string[];
  area: number | undefined;
  area_text: string;
  height: number;
  contained_entities: any;
  region_label: string;
  operation: any;
  fill: any;

  constructor(data: EntityData & { edges_refs?: string[]; area?: number; area_text?: string; height?: number; contained_entities?: any; label?: string; operation?: any; fill?: any }) {
    super(data);
    this.edges_refs = data.edges_refs || [];
    this.area = data.area;
    this.area_text = data.area_text || '';
    this.height = data.height ?? 12;
    this.contained_entities = data.contained_entities || null;
    this.region_label = data.label || '';
    this.operation = data.operation || null;
    this.fill = data.fill;
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.edges_refs = this.edges_refs;
    if (this.area !== undefined) o.area = this.area;
    if (this.area_text) o.area_text = this.area_text;
    if (this.height !== 12) o.height = this.height;
    if (this.contained_entities) o.contained_entities = this.contained_entities;
    if (this.region_label) o.label = this.region_label;
    if (this.operation) o.operation = this.operation;
    if (this.fill !== undefined) o.fill = this.fill;
    return o;
  }

  clone(): RegionAnnoEntity {
    const data = this.toJSON();
    data.id = nextId('RA');
    return new RegionAnnoEntity(data);
  }

  getBox(resolver: IResolver | undefined): Box {
    if (!resolver || !this.edges_refs || !this.edges_refs.length) return { min: new Point2d(0, 0), max: new Point2d(0, 0) };
    const allPts: Point2d[] = [];
    for (const edgeRef of this.edges_refs) {
      const ee = (resolver.doc as { getEntityById(id: string): Entity | undefined }).getEntityById(edgeRef);
      if (!ee) { console.warn(`[${this.id}] getBox: edge ${edgeRef} not found`); continue; }
      const pc = (ee as unknown as { getPolycurvePoints(r: IResolver | undefined): Point2d[] });
      if (typeof pc.getPolycurvePoints !== 'function') { console.warn(`[${this.id}] getBox: edge ${edgeRef} has no getPolycurvePoints`); continue; }
      const pts = pc.getPolycurvePoints(resolver);
      allPts.push(...pts);
    }
    if (allPts.length === 0) return { min: new Point2d(0, 0), max: new Point2d(0, 0) };
    return boundingBox(allPts) || { min: new Point2d(0, 0), max: new Point2d(0, 0) };
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    if (this.area !== undefined) props.push({ key: 'area', label: '面积', type: 'number', value: this.area });
    if (this.area_text) props.push({ key: 'area_text', label: '面积标注', type: 'text', value: this.area_text });
    if (this.region_label) props.push({ key: 'label', label: '区域标签', type: 'text', value: this.region_label });
    if (this.fill !== undefined) props.push({ key: 'fill', label: '填充', type: 'color', value: this.fill });
    if (this.operation) {
      const opLabels: Record<string, string> = { union: '∪', intersect: '∩', difference: '−', xor: '⊕' };
      const sym = opLabels[this.operation.op] || this.operation.op;
      props.push({ key: 'operation', label: '布尔运算', type: 'text', value: `${sym} ${this.operation.refs.length}个区域` });
    }
    return props;
  }

  setProperty(key: string, value: any, resolver: IResolver | undefined): boolean {
    if (key === 'area') { this.area = value; return true; }
    if (key === 'area_text') { this.area_text = value; return true; }
    if (key === 'label') { this.region_label = value; return true; }
    if (key === 'fill') { this.fill = value; return true; }
    if (key === 'operation') {
      try { this.operation = value ? JSON.parse(value) : null; } catch (e) { console.warn(`[${this.id}] setProperty operation: invalid JSON`, value, e); }
      return true;
    }
    return super.setProperty(key, value, resolver);
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): null { return null; }

}

// ─── position ──────────────────────────────────────
/** 位置/尺寸/公差标注：纯数据实体，不渲染图形 */
export class PositionEntity extends Entity {
  kind: string;
  ref_a: string;
  ref_b: string | null;
  value: any;
  operator: string | null;
  datum: string | null;
  relationship: string | null;
  params: any;

  constructor(data: EntityData & { kind?: string; ref_a?: string; ref_b?: string; value?: any; operator?: string; datum?: string; relationship?: string; params?: any }) {
    super(data);
    this.kind = data.kind ?? '';
    this.ref_a = data.ref_a ?? '';
    this.ref_b = data.ref_b || null;
    this.value = data.value;
    this.operator = data.operator || null;
    this.datum = data.datum || null;
    this.relationship = data.relationship || null;
    this.params = data.params || null;
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.kind = this.kind;
    if (this.ref_a) o.ref_a = this.ref_a;
    if (this.ref_b) o.ref_b = this.ref_b;
    if (this.value !== undefined) o.value = this.value;
    if (this.operator) o.operator = this.operator;
    if (this.datum) o.datum = this.datum;
    if (this.relationship) o.relationship = this.relationship;
    if (this.params) o.params = this.params;
    return o;
  }

  clone(): PositionEntity {
    const data = this.toJSON();
    data.id = nextId('PO');
    return new PositionEntity(data);
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'kind', label: '类型', type: 'text', value: this.kind });
    props.push({ key: 'ref_a', label: '引用 A', type: 'text', value: this.ref_a });
    if (this.ref_b) props.push({ key: 'ref_b', label: '引用 B', type: 'text', value: this.ref_b });
    if (this.value !== undefined) props.push({ key: 'value', label: '值', type: 'number', value: this.value });
    if (this.operator) props.push({ key: 'operator', label: '运算符', type: 'text', value: this.operator });
    if (this.datum) props.push({ key: 'datum', label: '基准', type: 'text', value: this.datum });
    if (this.relationship) props.push({ key: 'relationship', label: '关系', type: 'text', value: this.relationship });
    if (this.params) props.push({ key: 'params', label: '参数', type: 'text', value: JSON.stringify(this.params) });
    return props;
  }

  setProperty(key: string, value: any, resolver: IResolver | undefined): boolean {
    if (key === 'kind') { this.kind = value; return true; }
    if (key === 'ref_a') { this.ref_a = value || ''; return true; }
    if (key === 'ref_b') { this.ref_b = value || null; return true; }
    if (key === 'value') { this.value = value; return true; }
    if (key === 'operator') { this.operator = value || null; return true; }
    if (key === 'datum') { this.datum = value || null; return true; }
    if (key === 'relationship') { this.relationship = value || null; return true; }
    if (key === 'params') {
      try { this.params = value ? JSON.parse(value) : null; } catch (e) { console.warn(`[${this.id}] setProperty params: invalid JSON`, value, e); return false; }
      return true;
    }
    return super.setProperty(key, value, resolver);
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    const refs = [this.ref_a];
    if (this.ref_b) refs.push(this.ref_b);
    PointEntity.transformPoints(resolver, refs, t);
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): null { return null; }
  getGripPoints(resolver: IResolver | undefined): null { return null; }

}

// ─── coord_sys ─────────────────────────────────────
/** 用户坐标系：在 origin_ref 位置显示 X（红）和 Y（绿）轴箭头 */
export class CoordSysEntity extends Entity {
  origin_ref: string;
  rotation: number;
  sys_visible: boolean;

  constructor(data: EntityData & { origin_ref?: string; rotation?: number; visible?: boolean }) {
    super(data);
    this.origin_ref = data.origin_ref ?? '';
    this.rotation = data.rotation ?? 0;
    this.sys_visible = data.visible !== false;
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.origin_ref = this.origin_ref;
    if (this.rotation !== 0) o.rotation = this.rotation;
    if (!this.sys_visible) o.visible = false;
    return o;
  }

  clone(): CoordSysEntity {
    const data = this.toJSON();
    data.id = nextId('CS');
    return new CoordSysEntity(data);
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    PointEntity.transformPoints(resolver, [this.origin_ref], t);
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    const pt = resolver?.get(this.origin_ref)?.getResult(resolver);
    return pt ? new Point2d(pt.x, pt.y) : new Point2d(0, 0);
  }

  getBox(resolver: IResolver | undefined): Box {
    const pt = resolver?.get(this.origin_ref)?.getResult(resolver);
    if (!pt) return { min: new Point2d(0, 0), max: new Point2d(0, 0) };
    const s = 16;
    return { min: new Point2d(pt.x - s, pt.y - s), max: new Point2d(pt.x + s, pt.y + s) };
  }

  getSnapPoints(mode: string, resolver: IResolver | undefined): SnapPoint[] | null {
    const pt = resolver?.get(this.origin_ref)?.getResult(resolver);
    return pt ? [{ pt: new Point2d(pt.x, pt.y), type: 'origin' }] : null;
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'origin_ref', label: '原点引用', type: 'text', value: this.origin_ref });
    props.push({ key: 'rotation', label: '旋转', type: 'number', value: this.rotation });
    return props;
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    const out: GripPoint[] = [];
    const origin = resolver?.get(this.origin_ref)?.getResult(resolver);
    if (!origin) return null;
    const grip = editablePointGrip(resolver, this.origin_ref);
    if (grip) out.push(grip);
    const s = this.scale || 1;
    const axisLen = 10 * s;
    const r = this.rotation || 0;
    const cosR = Math.cos(r), sinR = Math.sin(r);
    out.push({ pt: new Point2d(origin.x + axisLen * cosR, origin.y + axisLen * sinR), propPath: '_rot_x', editable: true } as GripPoint);
    out.push({ pt: new Point2d(origin.x - axisLen * sinR, origin.y + axisLen * cosR), propPath: '_rot_y', editable: true } as GripPoint);
    return out;
  }

  onGripDrag(propPath: string, newX: number, newY: number, resolver: IResolver | undefined): boolean {
    if (propPath === '_rot_x' || propPath === '_rot_y') {
      const origin = resolver?.get(this.origin_ref)?.getResult(resolver);
      if (!origin) return false;
      this.rotation = Math.atan2(newY - origin.y, newX - origin.x) - (propPath === '_rot_y' ? Math.PI / 2 : 0);
      return true;
    }
    return dragEditablePoint(resolver, propPath, new Point2d(newX, newY));
  }

}

// ─── custom_entity ─────────────────────────────────
/** 自定义实体：为扩展预留 */
export class CustomEntity extends Entity {
  entity_type: string;
  properties: Record<string, any>;

  constructor(data: EntityData & { entity_type?: string; properties?: Record<string, any> }) {
    super(data);
    this.entity_type = data.entity_type ?? '';
    this.properties = data.properties || {};
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.entity_type = this.entity_type;
    o.properties = this.properties;
    return o;
  }

  clone(): CustomEntity {
    const data = this.toJSON();
    data.id = nextId('CE');
    return new CustomEntity(data);
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'entity_type', label: '自定义类型', type: 'text', value: this.entity_type });
    props.push({ key: 'properties', label: '属性', type: 'text', value: JSON.stringify(this.properties) });
    return props;
  }

  setProperty(key: string, value: any, resolver: IResolver | undefined): boolean {
    if (key === 'entity_type') { this.entity_type = value; return true; }
    if (key === 'properties') {
      try { this.properties = value ? JSON.parse(value) : {}; } catch (e) { console.warn(`[${this.id}] setProperty properties: invalid JSON`, value, e); return false; }
      return true;
    }
    return super.setProperty(key, value, resolver);
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): null { return null; }
  getGripPoints(resolver: IResolver | undefined): null { return null; }
}
