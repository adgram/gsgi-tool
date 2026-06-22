/**
 * 文档相关类
 *
 * 包含 TYPE_MAP（实体类型→类的映射表）、工厂函数 createEntity、
 * BlockDef（块定义）、Group（编组）、GSGIDocument（文档根对象）。
 * 文档对象管理图层、块定义、线型、文本样式等全局资源。
 */

import { ColorResolver } from './color-resolver';
import { Entity, _setCreateEntity, EntityData, IResolver } from './entity';
import { PointEntity, ParamPtEntity } from './entities/point';
import { LineEntity, PolylineEntity } from './entities/line';
import { PolyarcEntity, PolycurveEntity, ArcEntity } from './entities/arc';
import { CircleEntity, RectangleEntity } from './entities/circle';
import { TextEntity, DimensionEntity, TableEntity } from './entities/text';
import { SplineFitEntity, SplineCvEntity } from './entities/spline';
import { BlockRefEntity, XrefEntity, SubsegmentEntity } from './entities/block';
import { RegionAnnoEntity, PositionEntity, CoordSysEntity, CustomEntity } from './entities/annotation';

/** 实体类型字符串 → 实体类的映射表，用于工厂函数按类型创建实例 */
export const TYPE_MAP: Record<string, typeof Entity> = {
  point: PointEntity, param_pt: ParamPtEntity, line: LineEntity,
  polyline: PolylineEntity, polyarc: PolyarcEntity, polycurve: PolycurveEntity,
  circle: CircleEntity, arc: ArcEntity,
  rectangle: RectangleEntity, text: TextEntity,
  spline_fit: SplineFitEntity, spline_cv: SplineCvEntity,
  block_ref: BlockRefEntity, xref: XrefEntity,
  table: TableEntity,
  subsegment: SubsegmentEntity, dimension: DimensionEntity,
  region_anno: RegionAnnoEntity, position: PositionEntity,
  coord_sys: CoordSysEntity,
  custom_entity: CustomEntity
};

/** 返回所有实体类的数组，用于注册或遍历 */
export function getAllEntityClasses(): (new (data: EntityData) => Entity)[] {
  return Object.values(TYPE_MAP);
}

/** 返回所有实体类注册的 CLI 命令（去重） */
export function getAllCLICommands(): any[] {
  const cmds: any[] = [];
  const seen = new Set<string>();
  for (const Cls of Object.values(TYPE_MAP)) {
    if (Cls === Entity) continue;
    const list = (Cls as any).cliCommands || [];
    for (const cmd of list) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        cmds.push(cmd);
      }
    }
  }
  return cmds;
}

/** 工厂函数：根据 data.type 创建对应类型的实体实例，未知类型返回 null */
export function createEntity(data: EntityData): Entity | null {
  const Cls = TYPE_MAP[data.type!];
  if (!Cls) { console.warn(`[document] createEntity: unknown type "${data.type}"`); return null; }
  return new Cls(data);
}

// 将工厂函数注入 Entity 基类，使 Entity.clone() 可利用它创建副本
_setCreateEntity(createEntity as (data: any) => Entity);

/** 图层定义 */
export interface LayerData {
  id: string;
  name?: string;
  color?: number | string;
  visible?: boolean;
  locked?: boolean;
  linetype?: string;
  lineweight?: number;
  [key: string]: any;
}

/** 文本样式定义 */
export interface TextStyleData {
  id: string;
  name?: string;
  font?: string;
  height?: number;
  [key: string]: any;
}

/** 线型定义 */
export interface LinetypeData {
  id: string;
  name?: string;
  pattern?: number[];
  [key: string]: any;
}

/** 块定义：包含块名、基点、属性定义和内部实体列表，供 BlockRefEntity 引用 */
export class BlockDef {
  id: string;
  name: string;
  base_point: number[];
  attributes: Record<string, any> | null;
  entities: Entity[];
  descriptions: any[];

  constructor(data: EntityData & { name?: string; base_point?: number[]; attributes?: Record<string, any>; entities?: EntityData[]; descriptions?: any[] }) {
    this.id = data.id ?? '';
    this.name = data.name || this.id;
    this.base_point = data.base_point || [0, 0];
    this.attributes = data.attributes || null;
    this.entities = (data.entities || []).map(createEntity).filter(Boolean) as Entity[];
    this.descriptions = data.descriptions || [];
  }

  toJSON(): Record<string, any> {
    const o: Record<string, any> = {
      id: this.id, name: this.name, base_point: this.base_point,
      entities: this.entities.map(e => e.toJSON()), descriptions: this.descriptions
    };
    if (this.attributes) o.attributes = this.attributes;
    return o;
  }
}

/** 编组：按名称组织一组实体 ID，便于批量选择和操作 */
export class Group {
  id: string;
  name: string;
  members: string[];

  constructor(data: { id?: string; name?: string; members?: string[] }) {
    this.id = data.id ?? '';
    this.name = data.name || '';
    this.members = data.members || [];
  }

  toJSON(): Record<string, any> {
    return { id: this.id, name: this.name, members: this.members };
  }
}

/** 文档根类：是整个 GSGI 文件的 JS 表示，包含版本信息、图层、块、实体等全部数据 */
export class GSGIDocument {
  version: string;
  summary: string;
  tags: string[];
  author: string;
  created: string;
  modified: string;
  properties: Record<string, any>;
  layers: LayerData[];
  textStyles: TextStyleData[];
  linetypes: LinetypeData[];
  blocks: BlockDef[];
  entities: Entity[];
  groups: Group[];
  descriptions: any[];
  ext_derive: any;

  constructor(data: Record<string, any> = {}) {
    this.version = data.gsgi || '1.0';
    this.summary = data.summary || data.description || '';
    this.tags = data.tags || [];
    this.author = data.author || '';
    this.created = data.created || '';
    this.modified = data.modified || '';
    this.properties = data.properties || {};
    this.layers = data.layers || [];
    this.textStyles = data.text_styles || [];
    this.linetypes = data.linetypes || [];
    this.blocks = (data.blocks || []).map((b: any) => b ? new BlockDef(b) : null).filter(Boolean) as BlockDef[];
    this.entities = (data.entities || []).map(createEntity).filter(Boolean) as Entity[];
    this.groups = (data.groups || []).map((g: any) => new Group(g));
    this.descriptions = data.descriptions || [];
    this.ext_derive = data.ext_derive || null;
  }

  /** 序列化为 JSON：将所有子对象递归转换 */
  toJSON(): Record<string, any> {
    const out: Record<string, any> = {
      gsgi: this.version, tags: this.tags, summary: this.summary, author: this.author,
      created: this.created, modified: this.modified, properties: this.properties,
      layers: this.layers, text_styles: this.textStyles, linetypes: this.linetypes,
      blocks: this.blocks.filter(Boolean).map(b => b.toJSON()),
      entities: this.entities.filter(Boolean).map(e => e.toJSON()),
      groups: this.groups.filter(Boolean).map(g => g.toJSON()),
      descriptions: this.descriptions
    };
    if (this.ext_derive) out.ext_derive = this.ext_derive;
    return out;
  }

  /** 按 ID 查找实体 */
  getEntityById(id: string): Entity | null {
    return this.entities.find(e => e.id === id) || null;
  }

  /** 按 ID 查找块定义 */
  getBlockById(id: string): BlockDef | null {
    return this.blocks.find(b => b.id === id) || null;
  }

  /** 按 ID 查找图层 */
  getLayerById(id: string): LayerData | null {
    return this.layers.find(l => l.id === id) || null;
  }

  /** ACI（AutoCAD 颜色索引）→ 十六进制颜色字符串 */
  aciToHex(aci: number): string {
    return ColorResolver.aciToHex(aci);
  }

  /** 解析实体的最终颜色：ByLayer 时向上查找图层颜色，ByBlock 使用默认色 */
  resolveColor(entity: Entity): string {
    return ColorResolver.resolveColor(entity, this.layers);
  }

  /** 将颜色值统一解析为十六进制字符串 */
  resolveColorValue(c: number | string | undefined): string {
    return ColorResolver.resolveColorValue(c);
  }
}
