/**
 * Resolver - 实体引用解析器
 *
 * 核心功能：通过实体间的 _ref 引用链计算坐标值。
 * 支持 point（含 ref_pt 链式偏移）、param_pt（曲线参数化求值）。
 * 带有缓存和依赖追踪，当上游变化时自动失效下游缓存。
 */

import { Entity, EntityStatus, IResolver, refId } from './entity';
import { GSGIDocument } from './document';

/**
 * 实体引用解析器：通过实体间的 _ref 引用链计算坐标值，
 * 支持 point（含 ref_pt 链式偏移）、param_pt（曲线参数化求值）。
 * 带有缓存和依赖追踪，当上游变化时自动失效下游缓存，避免重复计算。
 */
export class Resolver implements IResolver {
  doc: GSGIDocument;
  /** id → Entity 缓存（含 block 内部实体） */
  entityCache: Map<string, Entity>;
  /** 依赖图：id → Set<依赖方 id>，toId 变化时 fromId 需重新解析 */
  _dependents: Map<string, Set<string>>;
  /**依赖列表，临时数据 Entity->Set<被依赖方> */ 
  _status: Map<Entity, Set<Entity>> = new Map();

  constructor(doc: GSGIDocument) {
    this.doc = doc;
    this.entityCache = new Map();
    this._dependents = new Map();
    this._buildCache();
  }

  /** 重建实体缓存（含 block 内部实体），在文档变更后调用以刷新缓存 */
  _buildCache(): void {
    this.entityCache.clear();
    for (const e of this.doc.entities) {
      this.entityCache.set(e.id, e);
    }
    for (const b of this.doc.blocks) {
      for (const e of b.entities) {
        this.entityCache.set(e.id, e);
      }
    }
    this._buildDeps();
  }

  /** 扫描所有实体中的引用字段，重建依赖图 */
  _buildDeps(): void {
    this._dependents.clear();
    for (const [id, entity] of this.entityCache) {
      this._trackEntityDeps(id, entity);
    }
  }

  /** 遍历单个实体的引用字段，注册依赖关系到 _dependents */
  _trackEntityDeps(id: string, entity: Entity): void {
    const scan = (key: string, value: unknown) => {
      if ((key.endsWith('_ref') || key === 'curve_ref') && typeof value === 'string' && value) {
        this._trackDep(id, value);
      } else if (key === 'ref_pt') {
        const refIdStr = refId(value);
        if (refIdStr) this._trackDep(id, refIdStr);
      } else if (key.endsWith('_refs') && Array.isArray(value)) {
        for (const ref of value) {
          if (typeof ref === 'string' && ref) this._trackDep(id, ref);
        }
      } else if (key === 'segments' && Array.isArray(value)) {
        for (const seg of value) {
          if (seg.type === 'curve_ref') {
            if (seg.ref && typeof seg.ref === 'string') this._trackDep(id, seg.ref);
          } else {
            if (seg.start_ref && typeof seg.start_ref === 'string') this._trackDep(id, seg.start_ref);
            if (seg.end_ref && typeof seg.end_ref === 'string') this._trackDep(id, seg.end_ref);
            if (seg.mid_ref && typeof seg.mid_ref === 'string') this._trackDep(id, seg.mid_ref);
            if (seg.center_ref && typeof seg.center_ref === 'string') this._trackDep(id, seg.center_ref);
          }
        }
      }
    };
    for (const [key, value] of Object.entries(entity)) {
      scan(key, value);
    }
  }

  /** 记录依赖关系：fromId 依赖于 toId（toId 变化时需重新解析 fromId） */
  _trackDep(fromId: string, toId: string): void {
    if (!this._dependents.has(toId)) {
      this._dependents.set(toId, new Set());
    }
    this._dependents.get(toId)!.add(fromId);
  }

  /**to 更新时，对from进行更新*/
  check(from: Entity, to: Entity): void {
    if (from.status === EntityStatus.Collecting) {
      throw new Error(`循环依赖检测：实体 ${from.id} 存在循环引用`);
    } else if (from.status === EntityStatus.Updating) {
      return;
    }
    // 标记当前正在收集依赖
    from.status = EntityStatus.Collecting;
    if (!this._status.has(from)) this._status.set(from, new Set());
    this._status.get(from)!.add(to);
    // 递归标记下游依赖
    const deps = this._dependents.get(from.id);
    if (deps) {
      for (const depId of deps) {
        const depEntity = this.entityCache.get(depId);
        if (depEntity) this.check(depEntity, from);
      }
    }
    // 如果不存在死循环，则标记为待更新
    from.status = EntityStatus.Updating;
  }

  /**更新对象，仅当对象的所有依赖都更新后才执行更新 */
  _update(item: Entity): void {
    if (item.status !== EntityStatus.Updating) return;
    // 检查所有依赖是否都已回到 Empty 状态
    const deps = this._status.get(item);
    if (deps) {
      for (const dep of deps) {
        if (dep.status !== EntityStatus.Empty) return;
      }
    }
    // 所有依赖已就绪，执行更新
    item.update(this);
    item.status = EntityStatus.Empty;
  }

  /**更新多个对象：先收集所有依赖关系，再依次执行更新 */
  updateItems(ids: string[]): void {
    // 第一遍：标记所有需要更新的实体及其下游依赖
    for (const id of ids) {
      const item = this.entityCache.get(id);
      if (!item) continue;
      item.status = EntityStatus.Updating;
      const deps = this._dependents.get(item.id);
      if (deps) {
        for (const depId of deps) {
          const depEntity = this.entityCache.get(depId);
          if (depEntity) this.check(depEntity, item);
        }
      }
    }
    // 第二遍：收集所有被标记为 Updating 的实体，按拓扑序依次执行更新
    const allUpdating: Entity[] = [];
    for (const [, entity] of this.entityCache) {
      if (entity.status === EntityStatus.Updating) allUpdating.push(entity);
    }
    for (const item of allUpdating) {
      this._update(item);
    }
    this._status = new Map();
  }

  /**
   * 解析实体 id 的坐标，返回 {x, y} 或 null
   * 缓存命中且非脏则直接返回，否则根据实体类型分发到对应的解析方法
   */
  get(id: string): Entity | null {
    if (!id) { return null; }
    const entity = this.entityCache.get(id);
    if (!entity) { return null; }
    return entity;
  }
}
