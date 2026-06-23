/**
 * Entity 基类 + 辅助函数
 *
 * 所有几何实体的父类。每个子类自包含与该实体类型相关的全部行为。
 * 提供通用的属性管理、样式应用、包围盒计算、夹点交互等基础能力，
 * 子类通过重写 render / getBox / getGripPoints 等方法实现具体表现。
 */

import { Box, Point2d, intersectCurves, Curve } from './geometry';
import { Transform } from './transform';

/** ref_pt object 形式的类型定义 */
export interface RefPtRef {
  id: string;
  represent?: string;
  ref_op?: string;
}

/** 从 string 或 object 形式的引用中提取实体 id */
export function refId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'id' in (value as any) && typeof (value as any).id === 'string') return (value as any).id;
  return null;
}

/** 当被引用实体是 point/param_pt 时，强制 represent='self'、ref_op='offset' */
export function sanitizeRefPtOverrides(entityType: string, represent?: string | Record<string, unknown>, ref_op?: string): { represent?: string | Record<string, unknown>; ref_op?: string } {
  if (entityType === 'point' || entityType === 'param_pt') {
    return {
      represent: represent === 'self' ? represent : undefined,
      ref_op: ref_op === 'offset' ? ref_op : undefined
    };
  }
  return { represent, ref_op };
}

/** 实体引用解析器的最小接口 */
export interface IResolver {
  doc: unknown;
  entityCache: Map<string, Entity>;
  get(id: string): Entity | null;
  updateItems(ids: string[]): void;
  _buildCache(): void;
}

// 所有受支持的实体类型列表，用于类型校验和 CLI 自动补全
export const ENTITY_TYPES = [
  'point', 'param_pt', 'line', 'polyline', 'polyarc', 'polycurve',
  'circle', 'arc', 'rectangle', 'text',
  'spline_fit', 'spline_cv', 'block_ref', 'xref', 'table',
  'subsegment', 'dimension', 'region_anno', 'position', 'coord_sys',
  'custom_entity'
] as const;

export type EntityType = typeof ENTITY_TYPES[number];

// 自增 ID 计数器，以当前时间戳为起始值，确保每次会话生成唯一 ID
let _uidCounter = Date.now();

export function nextId(prefix = 'E'): string {
  return `${prefix}${++_uidCounter}`;
}

// 存储创建实体的工厂函数引用，由 Document.js 在初始化时注入，避免循环依赖
let _createEntityFn: ((data: Record<string, unknown>) => Entity) | undefined;
export function _setCreateEntity(fn: (data: Record<string, unknown>) => Entity): void { _createEntityFn = fn; }

export interface EntityData {
  id?: string;
  type?: string;
  layer?: string;
  color?: number | string;
  linetype?: string;
  lineweight?: number;
  visible?: boolean;
  space?: string;
  scale?: number;
  transform?: number[] | null;
  description?: string;
  represent?: unknown;
  ref_op?: unknown;
  [key: string]: unknown;
}

export interface PropertyItem {
  key: string;
  label: string;
  type: string;
  value: unknown;
}

export interface GripPoint {
  pt: Point2d;
  propPath: string;
  isRef?: boolean;
  editable?: boolean;
  type?: string;
}

export interface SnapPoint {
  pt: Point2d;
  type?: string;
}

/** 实体状态，用于链式更新 */
export const enum EntityStatus {
  Empty, Collecting, Updating
}


export class Entity {
  id: string;
  type: string;
  layer: string;
  color: number | string | undefined;
  linetype: string | undefined;
  lineweight: number | undefined;
  _explicitVisible: boolean;
  visible: boolean;
  space: string;
  scale: number;
  transform: number[] | null | undefined;
  description: string;
  represent: unknown;
  ref_op: unknown;
  /** 子类扩展属性：polyline 的直接坐标点集 */
  points?: number[][] | Point2d[];
  /** 子类扩展属性：点实体的坐标（PointEntity 存储为 Point2d，raw 时可能为 number[]） */
  point?: number[] | Point2d | null;
  ref_pt?: string | RefPtRef | null;
  /** 子类扩展属性：polycurve/polyarc 的线段描述 */
  segments?: Array<{ start_ref?: string; end_ref?: string; mid_ref?: string; center_ref?: string; [key: string]: unknown }>;
  // 更新状态，临时数据
  status: EntityStatus = EntityStatus.Empty;
  // 依赖列表，临时数据
  independent: string[] = [];

  _curve: any = null;

  // 基类构造：从原始数据对象中提取所有通用属性，子类在 super(data) 后初始化自身特有属性
  constructor(data: EntityData) {
    this.id = data.id ?? '';
    this.type = data.type ?? '';
    this.layer = data.layer || '0';
    this.color = data.color;
    this.linetype = data.linetype;
    this.lineweight = data.lineweight;
    this._explicitVisible = Object.prototype.hasOwnProperty.call(data, 'visible');
    this.visible = data.visible !== false;
    this.space = data.space || 'model';
    this.scale = data.scale ?? 1;
    this.transform = data.transform ?? null;
    this.description = data.description || '';
    this.represent = data.represent;
    this.ref_op = data.ref_op;
  }

  // 序列化为 JSON：只输出与默认值不同的非空字段，保持文件简洁
  toJSON(): Record<string, unknown> {
    const o: Record<string, unknown> = { id: this.id, type: this.type };
    if (this.layer !== '0') o.layer = this.layer;
    if (this.color !== undefined) o.color = this.color;
    if (this.linetype) o.linetype = this.linetype;
    if (this.lineweight !== undefined) o.lineweight = this.lineweight;
    if (this._explicitVisible) o.visible = this.visible;
    if (this.space !== 'model') o.space = this.space;
    if (this.scale !== 1) o.scale = this.scale;
    if (this.transform) o.transform = this.transform;
    if (this.description) o.description = this.description;
    if (this.represent) o.represent = this.represent;
    if (this.ref_op) o.ref_op = this.ref_op;
    return o;
  }

  static get cliCommands(): Array<{ name: string; handler: (viewer: unknown, args: string[]) => void; help: { short: string; usage: string; desc: string } }> { return []; }

  getResult(resolver: IResolver | undefined): Point2d { return this.getRepresent(resolver); }

  render(parent: unknown, resolver: IResolver | undefined, doc: unknown, renderer?: unknown): unknown {
    console.warn(`[${this.id}] Entity.render base class called — ${this.type} did not override render`);
    return null;
  }

  /** 解析 represent 字段规则，返回代表点；不支持的规则返回 null */
  /** 可选接受外部 represent object，用于 ref_pt 覆盖解析 */
  _resolveRepresentByRule(resolver: IResolver | undefined, repOverride?: Record<string, unknown>): Point2d | null {
    const rep = repOverride ?? this.represent;
    if (!rep) return null;
    if (typeof rep === 'string') return null;
    const repObj = rep as Record<string, unknown>;
    if (repObj.method === 'intersect' && typeof repObj.curve_ref === 'string') {
      const thisCurve = this.getCurve(resolver);
      const otherEntity = resolver?.get(repObj.curve_ref);
      const otherCurve = otherEntity?.getCurve?.(resolver);
      if (thisCurve && otherCurve && 'type' in thisCurve && 'type' in otherCurve) {
        const intersections = intersectCurves(thisCurve as Curve, otherCurve as Curve);
        if (intersections.length > 0) return intersections[0].point;
      }
    }
    if (repObj.method === 'param' && typeof repObj.t === 'number') {
      const curve = this.getCurve(resolver);
      if (curve && typeof curve.eval === 'function') {
        const pt = curve.eval(repObj.t);
        if (pt) return pt;
      }
      return new Point2d(0, 0);
    }
    if (repObj.method === 'bbox') {
      const box = this.getBox(resolver);
      if (box) {
        const min = box.min, max = box.max;
        switch (repObj.which) {
          case 'min': return min;
          case 'max': return max;
          case 'center': return new Point2d((min.x + max.x) / 2, (min.y + max.y) / 2);
          case 'top_left': return new Point2d(min.x, max.y);
          case 'top_right': return max;
          case 'bottom_left': return min;
          case 'bottom_right': return new Point2d(max.x, min.y);
        }
      }
      return new Point2d(0, 0);
    }
    return null;
  }

  getRepresent(resolver: IResolver | undefined): Point2d {
    const byRule = this._resolveRepresentByRule(resolver);
    if (byRule) return byRule;
    return new Point2d(0, 0);
  }

  getRefPoint(resolver: IResolver | undefined, pt: Point2d): Point2d { return this.getRepresent(resolver).add(pt); }

  /** 支持代表点和组合运算覆盖的引用点解析（representOverride 可为 string 或 object method） */
  resolveRefPt(resolver: IResolver | undefined, offset: Point2d, representOverride?: string | Record<string, unknown>, refOpOverride?: string): Point2d {
    let repPt: Point2d;
    if (representOverride) {
      if (typeof representOverride === 'object') {
        const byRule = this._resolveRepresentByRule(resolver, representOverride);
        repPt = byRule ?? new Point2d(0, 0);
      } else {
        repPt = this._resolveRepresentKeyword(representOverride, resolver);
      }
    } else {
      repPt = this.getRepresent(resolver);
    }
    if (refOpOverride === 'link') return repPt;
    if (refOpOverride === 'local') {
      const origin = this.getRepresent(resolver);
      const angle = (this as any).rotation || 0;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      return new Point2d(
        origin.x + cos * offset.x - sin * offset.y,
        origin.y + sin * offset.x + cos * offset.y
      );
    }
    return repPt.add(offset);
  }

  /** 按关键字解析代表点（供 ref_pt 覆盖使用） */
  _resolveRepresentKeyword(keyword: string, resolver: IResolver | undefined): Point2d {
    switch (keyword) {
      case 'self':
        if (this.point) {
          const p = this.point;
          return p instanceof Point2d ? p.clone() : new Point2d((p as number[])[0], (p as number[])[1]);
        }
        return new Point2d(0, 0);
      case 'origin':
        return new Point2d(0, 0);
      case 'center':
      case 'base':
      default:
        return this.getRepresent(resolver);
    }
  }
  
  getBox(resolver: IResolver | undefined): Box {
    const curve = this.getCurve(resolver);
    if (curve && 'getBox' in curve && typeof (curve as { getBox(): Box }).getBox === 'function') {
      const box = (curve as { getBox(): Box }).getBox();
      if (box) return box;
    }
    return { min: this.getRepresent(resolver), max: this.getRepresent(resolver) };
  }

  clone(): Entity { return _createEntityFn!(this.toJSON() as Record<string, unknown>); }

  length(resolver: IResolver | undefined): number {
    const curve = this.getCurve(resolver);
    if (curve && 'length' in curve && typeof (curve as { length(): number }).length === 'function') return (curve as { length(): number }).length();
    return 0;
  }

  update(resolver: IResolver | undefined): void { this._curve = null; }
  applyTransform(resolver: IResolver | undefined, t: Transform): void {}
  getGripPoints(resolver: IResolver | undefined): GripPoint[] | null { return null; }
  onGripDrag(propPath: string, newX: number, newY: number, resolver: IResolver | undefined): boolean { return dragEditablePoint(resolver, propPath, new Point2d(newX, newY)); }

  resolveRef(ref: string | null | undefined, resolver: IResolver | undefined): Point2d | null {
    const r = resolver?.get(ref as string)?.getResult(resolver);
    return r ? new Point2d(r.x, r.y) : null;
  }

  getSnapPoints(mode: string, resolver: IResolver | undefined): SnapPoint[] | null { return null; }
  getCurve(resolver: IResolver | undefined): { eval: (t: number) => Point2d | null } | null { return null; }
  explode(resolver: IResolver | undefined): Entity[] | null { return null; }

  // 属性面板数据：返回可在 UI 属性面板中编辑的属性列表
  getProperties(): PropertyItem[] {
    const props: PropertyItem[] = [];
    const all: PropertyItem[] = [
      { key: 'layer', label: '图层', type: 'layer', value: this.layer },
      { key: 'color', label: '颜色', type: 'color', value: this.color ?? null },
      { key: 'linetype', label: '线型', type: 'linetype', value: this.linetype || 'ByLayer' },
      { key: 'lineweight', label: '线宽', type: 'number', value: this.lineweight ?? 0 },
      { key: 'visible', label: '可见性', type: 'boolean', value: this.visible },
      { key: 'space', label: '空间', type: 'text', value: this.space },
      { key: 'scale', label: '比例', type: 'number', value: this.scale },
      { key: 'transform', label: '变换矩阵', type: 'text', value: (this.transform || [1,0,0,1,0,0]).join(',') },
      { key: 'description', label: '说明', type: 'text', value: this.description },
    ];
    for (const p of all) {
      if (p.value !== null && p.value !== '' && p.value !== undefined) props.push(p);
    }
    return props;
  }

  setProperty(key: string, value: string | number | boolean, resolver: IResolver | undefined): boolean {
    if (key === 'layer') this.layer = String(value);
    else if (key === 'color') this.color = typeof value === 'number' ? value : parseInt(String(value), 10);
    else if (key === 'linetype') this.linetype = String(value);
    else if (key === 'lineweight') this.lineweight = typeof value === 'number' ? value : parseFloat(String(value));
    else if (key === 'visible') this.visible = value === true || value === 'true';
    else if (key === 'description') this.description = String(value);
    else if (key === 'scale') this.scale = typeof value === 'number' ? value : parseFloat(String(value));
    else if (key === 'space') this.space = String(value);
    else if (key === 'transform') {
      const s = String(value);
      const nums = s.split(',').map(Number);
      if (nums.length === 6 && nums.every((n: number) => !isNaN(n))) { this.transform = nums; }
      else if (!s.trim()) { this.transform = null; }
      else { return false; }
    }
    else return false;
    return true;
  }

  // 匹配属性：将 source 实体的通用绘制属性复制到当前实体
  matchProperties(source: Entity): void {
    for (const k of ['layer', 'color', 'linetype', 'lineweight', 'visible'] as const) {
      if (source[k] !== undefined) (this as unknown as Record<string, unknown>)[k] = source[k];
    }
  }

}

// ─── 夹点辅助函数 ─────────────────────────────────────

export function editablePointGrip(resolver: IResolver | undefined, ref: string, propPath = ref): GripPoint | null {
  const refEnt = resolver?.get(ref);
  if (refEnt && refEnt.type === 'point') {
    const pe = refEnt as unknown as { point?: Point2d | number[]; ref_pt?: string | RefPtRef };
    if (pe.point && !refId(pe.ref_pt)) {
      const p = pe.point;
      const pt = p instanceof Point2d ? p.clone() : new Point2d((p as number[])[0]!, (p as number[])[1]!);
      return { pt, propPath, isRef: true, editable: true };
    }
  }
  return null;
}

/**
 * 批量为多个点引用创建可编辑夹点
 * 遍历 refs 数组，对每个引用调用 editablePointGrip，
 * 过滤掉不可编辑的引用（链式引用或无效引用），返回有效夹点数组
 */
export function editablePointGrips(resolver: IResolver | undefined, refs: string[] = []): GripPoint[] | null {
  const grips: GripPoint[] = [];
  for (const ref of refs) {
    const grip = editablePointGrip(resolver, ref);
    if (grip) grips.push(grip);
  }
  return grips.length ? grips : null;
}

/**
 * 拖拽夹点时更新被引用的 point 实体坐标
 * 通过 resolver 查找 ref 指向的 point 实体，直接修改其坐标值
 * 兼容 Point2d 对象和 number[] 数组两种存储格式
 * 返回 true 表示更新成功，false 表示引用无效
 */
export function dragEditablePoint(resolver: IResolver | undefined, ref: string, newPt: Point2d): boolean {
  const refEnt = resolver?.entityCache.get(ref);
  if (refEnt && refEnt.type === 'point') {
    return (refEnt as unknown as { moveTo(r: IResolver | undefined, p: Point2d): boolean }).moveTo(resolver, newPt);
  }
  return false;
}
