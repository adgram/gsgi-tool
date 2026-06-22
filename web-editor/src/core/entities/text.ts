/**
 * 文本（TextEntity）、尺寸标注（DimensionEntity）和表格（TableEntity）实体
 *
 * TextEntity 支持多行文字、字高、旋转角度；
 * DimensionEntity 在两点之间创建尺寸线；
 * TableEntity 用 Markdown 风格的表格数据生成表格。
 */

import { Point2d, Box, boundingBox } from '../geometry';
import { Transform } from '../transform';
import {
  Entity, nextId, EntityData, IResolver, GripPoint, SnapPoint, PropertyItem,
  editablePointGrip
} from '../entity';
import { PointEntity } from './point';

// ─── text ──────────────────────────────────────────
/** 文本实体：由 position_ref 定位 + text 内容 + 字高 + 旋转角度 */
export class TextEntity extends Entity {
  position_ref: string;
  text: string;
  height: number;
  rotation: number;

  constructor(data: EntityData & { position_ref?: string; text?: string; height?: number; rotation?: number }) {
    super(data);
    this.position_ref = data.position_ref ?? '';
    this.text = data.text ?? '';
    this.height = data.height ?? 2.5;
    this.rotation = data.rotation ?? 0;
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.position_ref = this.position_ref; o.text = this.text;
    if (this.height !== 2.5) o.height = this.height;
    if (this.rotation !== 0) o.rotation = this.rotation;
    return o;
  }

  clone(): TextEntity {
    const data = this.toJSON();
    data.id = nextId('T');
    return new TextEntity(data);
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
    const estW = this.text.length * (this.height || 2.5) * 0.6;
    const estH = (this.height || 2.5) * 1.2;
    return { min: new Point2d(pt.x - 2, pt.y - estH), max: new Point2d(pt.x + estW + 2, pt.y + 2) };
  }

  getSnapPoints(mode: string, resolver: IResolver | undefined): SnapPoint[] | null {
    const pt = resolver?.get(this.position_ref)?.getResult(resolver);
    return pt ? [{ pt: new Point2d(pt.x, pt.y), type: 'insert' }] : null;
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'text', label: '内容', type: 'text', value: this.text });
    props.push({ key: 'height', label: '字高', type: 'number', value: this.height });
    props.push({ key: 'rotation', label: '旋转', type: 'number', value: this.rotation });
    return props;
  }

  setProperty(key: string, value: any, resolver: IResolver | undefined): boolean {
    if (key === 'text') { this.text = value; return true; }
    if (key === 'height') { this.height = Number(value); return true; }
    if (key === 'rotation') { this.rotation = Number(value); return true; }
    return super.setProperty(key, value, resolver);
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    const grip = editablePointGrip(resolver, this.position_ref);
    return grip ? [grip] : null;
  }

}

// ─── dimension ─────────────────────────────────────
/** 尺寸标注实体：在两点间创建尺寸线 + 延伸线 + 标注文字 */
export class DimensionEntity extends Entity {
  p1_ref: string;
  p2_ref: string;
  measurement: number | undefined;
  dim_text: string | undefined;
  dim_line_offset: number;
  category: string;

  constructor(data: EntityData & { p1_ref?: string; p2_ref?: string; measurement?: number; text?: string; dim_line_offset?: number; category?: string }) {
    super(data);
    this.p1_ref = data.p1_ref ?? '';
    this.p2_ref = data.p2_ref ?? '';
    this.measurement = data.measurement;
    this.dim_text = data.text;
    this.dim_line_offset = data.dim_line_offset ?? 10;
    this.category = data.category || 'aligned';
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.p1_ref = this.p1_ref; o.p2_ref = this.p2_ref;
    if (this.measurement !== undefined) o.measurement = this.measurement;
    if (this.dim_text) o.text = this.dim_text;
    if (this.dim_line_offset !== 10) o.dim_line_offset = this.dim_line_offset;
    if (this.category !== 'aligned') o.category = this.category;
    return o;
  }

  clone(): DimensionEntity {
    const data = this.toJSON();
    data.id = nextId('D');
    return new DimensionEntity(data);
  }

  applyTransform(resolver: IResolver | undefined, t: Transform): void {
    PointEntity.transformPoints(resolver, [this.p1_ref, this.p2_ref], t);
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    const p1 = resolver?.get(this.p1_ref)?.getResult(resolver);
    return p1 ? new Point2d(p1.x, p1.y) : new Point2d(0, 0);
  }

  getBox(resolver: IResolver | undefined): Box {
    const p1 = resolver?.get(this.p1_ref)?.getResult(resolver);
    const p2 = resolver?.get(this.p2_ref)?.getResult(resolver);
    if (!p1 || !p2) return { min: new Point2d(0, 0), max: new Point2d(0, 0) };
    const s = this.scale || 1;
    const off = (this.dim_line_offset || 10) * 1.2 * s;
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (len < 1e-12) return { min: new Point2d(0, 0), max: new Point2d(0, 0) };
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const nx = -dy / len, ny = dx / len;
    const allPts = [
      new Point2d(p1.x, p1.y), new Point2d(p2.x, p2.y),
      new Point2d(p2.x + nx * off, p2.y + ny * off), new Point2d(p1.x + nx * off, p1.y + ny * off)
    ];
    return boundingBox(allPts) || { min: new Point2d(0, 0), max: new Point2d(0, 0) };
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    if (this.measurement !== undefined) props.push({ key: 'measurement', label: '测量值', type: 'number', value: this.measurement });
    if (this.dim_text) props.push({ key: 'dim_text', label: '标注文字', type: 'text', value: this.dim_text });
    props.push({ key: 'category', label: '类型', type: 'text', value: this.category });
    return props;
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

}

// ─── table ─────────────────────────────────────────
/** 表格实体：通过 Markdown 风格语法定义表格内容 */
export class TableEntity extends Entity {
  position_ref: string;
  width: number;
  height: number;
  col_widths: number[] | null;
  row_heights: number[] | null;
  style: string;
  text_height: number;
  markdown: string;

  constructor(data: EntityData & {
    position_ref?: string; width?: number; height?: number;
    col_widths?: number[]; row_heights?: number[];
    style?: string; text_height?: number; markdown?: string;
  }) {
    super(data);
    this.position_ref = data.position_ref ?? '';
    this.width = data.width ?? 200;
    this.height = data.height ?? 100;
    this.col_widths = data.col_widths || null;
    this.row_heights = data.row_heights || null;
    this.style = data.style || 'STANDARD';
    this.text_height = data.text_height ?? 2.5;
    this.markdown = data.markdown ?? '';
  }

  toJSON(): Record<string, any> {
    const o = super.toJSON();
    o.position_ref = this.position_ref; o.markdown = this.markdown;
    if (this.width) o.width = this.width; if (this.height) o.height = this.height;
    if (this.col_widths) o.col_widths = this.col_widths;
    if (this.row_heights) o.row_heights = this.row_heights;
    if (this.style !== 'STANDARD') o.style = this.style;
    if (this.text_height !== 2.5) o.text_height = this.text_height;
    return o;
  }

  clone(): TableEntity {
    const data = this.toJSON();
    data.id = nextId('TB');
    return new TableEntity(data);
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
    const w = this.width || 200;
    const h = this.height || 100;
    return { min: new Point2d(pt.x, pt.y - h), max: new Point2d(pt.x + w, pt.y) };
  }

  getProperties(): PropertyItem[] {
    const props = super.getProperties();
    props.push({ key: 'text_height', label: '字高', type: 'number', value: this.text_height });
    props.push({ key: 'col_widths', label: '列宽', type: 'text', value: this.col_widths?.join(',') ?? '' });
    props.push({ key: 'row_heights', label: '行高', type: 'text', value: this.row_heights?.join(',') ?? '' });
    props.push({ key: 'markdown', label: '内容(MD)', type: 'text', value: this.markdown });
    return props;
  }

  setProperty(key: string, value: any, resolver: IResolver | undefined): boolean {
    if (key === 'col_widths') {
      this.col_widths = String(value).split(',').map(s => parseFloat(s.trim()));
      return true;
    }
    if (key === 'row_heights') {
      this.row_heights = String(value).split(',').map(s => parseFloat(s.trim()));
      return true;
    }
    if (key === 'markdown') {
      this.markdown = String(value);
      return true;
    }
    return super.setProperty(key, value, resolver);
  }

  render(parent: any, resolver: IResolver | undefined, doc: any): any[] | null {
    return null;
  }

  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null {
    const grip = editablePointGrip(resolver, this.position_ref);
    return grip ? [grip] : null;
  }

}
