/**
 * GSGI 数据模型 — Barrel re-export
 *
 * 统一导出所有实体类、工厂函数和核心类型，
 * 方便外部一次性导入全部公开符号。
 */

export { ENTITY_TYPES, nextId, Entity } from './entity';
export type { IResolver } from './entity';
export { _setCreateEntity } from './entity';
export {
  editablePointGrip, editablePointGrips, dragEditablePoint
} from './entity';

export { PointEntity, ParamPtEntity } from './entities/point';
export { LineEntity, PolylineEntity } from './entities/line';
export { PolyarcEntity, PolycurveEntity, ArcEntity } from './entities/arc';
export { CircleEntity, RectangleEntity } from './entities/circle';
export { TextEntity, DimensionEntity, TableEntity } from './entities/text';
export { SplineFitEntity, SplineCvEntity } from './entities/spline';
export { BlockRefEntity, XrefEntity, SubsegmentEntity } from './entities/block';
export { RegionAnnoEntity, PositionEntity, CoordSysEntity, CustomEntity } from './entities/annotation';

export {
  TYPE_MAP, getAllEntityClasses, getAllCLICommands, createEntity,
  BlockDef, Group, GSGIDocument
} from './document';
export { Transform } from './transform';

import { Transform } from './transform';
import { Point2d } from './geometry';
import type { Entity, IResolver } from './entity';

/** 对一批实体应用仿射变换（平移/旋转/镜像等），每个实体调用其 applyTransform */
export function batchTransform(resolver: IResolver | undefined, entities: Entity[], t: Transform): void {
  for (const entity of entities) {
    if (typeof entity.applyTransform === 'function') {
      entity.applyTransform(resolver, t);
    }
  }
}

/** 对一批实体关于直线 p1-p2 镜像 */
export function batchMirror(resolver: IResolver | undefined, entities: Entity[], p1: { x: number; y: number }, p2: { x: number; y: number }): void {
  const d = new Point2d(p2.x, p2.y).sub(new Point2d(p1.x, p1.y));
  if (d.lenSq() < 1e-12) return;
  const mirrorT = Transform.mirrorAboutLine({ pt: new Point2d(p1.x, p1.y), direction: d });
  batchTransform(resolver, entities, mirrorT);
}
