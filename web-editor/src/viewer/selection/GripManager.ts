import paper from 'paper';
import { GRIP_SIZE_PX, cloneDocumentData, createUndoCommand } from '../util/clipboard';

/** 控制实体夹点（grip）的显示、拖拽与更新的管理器 */
export class GripManager {
  viewer: any;
  _gripItems: any[] | null = null;
  _draggingGrip: any = null;
  _gripBeforeSnapshot: any = null;

  /** 构造 GripManager */
  constructor(viewer: any) {
    this.viewer = viewer;
  }

  /** 显示指定实体的所有夹点 */
  showGrips(entity: any): void {
    this.hideGrips();
    if (!entity) return;
    if (!this.viewer.renderer) return;
    if (typeof entity.getGripPoints !== 'function') return;

    const pts = entity.getGripPoints(this.viewer.renderer.resolver);
    if (!pts || pts.length === 0) return;

    this._gripItems = [];
    for (const gripPt of pts) {
      const grip = this._makeGripItem(gripPt.pt.x, gripPt.pt.y, gripPt.kind);
      Object.assign(grip.data, {
        type: 'grip',
        entityId: entity.id,
        propPath: gripPt.propPath,
        isRef: gripPt.isRef,
        x: gripPt.pt.x,
        y: gripPt.pt.y,
        kind: gripPt.kind
      });
      this._gripItems.push(grip);
    }
  }

  /** 隐藏所有夹点 */
  hideGrips(): void {
    if (this._gripItems) {
      for (const g of this._gripItems) g.remove();
      this._gripItems = null;
    }
    this._draggingGrip = null;
  }

  /** 检测坐标点是否命中某个夹点 */
  hitTestGrip(x: number, y: number): boolean {
    if (!this._gripItems) return false;
    const tol = 8 / this.viewer.view.zoom;
    for (const grip of this._gripItems) {
      const c = grip.position;
      if (Math.abs(x - c.x) < tol && Math.abs(y - c.y) < tol) return true;
    }
    return false;
  }

  /** 开始拖拽夹点 */
  startGripDrag(x: number, y: number): boolean {
    if (!this._gripItems) { return false; }
    const tol = 8 / this.viewer.view.zoom;
    for (const grip of this._gripItems) {
      const c = grip.position;
      if (Math.abs(x - c.x) < tol && Math.abs(y - c.y) < tol) {
        this._draggingGrip = {
          grip,
          entityId: grip.data.entityId,
          propPath: grip.data.propPath,
          isRef: grip.data.isRef,
          offsetX: x - grip.data.x,
          offsetY: y - grip.data.y
        };
        grip.fillColor = '#DDEBFF';
        this._gripBeforeSnapshot = this.viewer.doc ? cloneDocumentData(this.viewer.doc) : null;
        return true;
      }
    }
    return false;
  }

  /** 执行拖拽夹点过程中的更新 */
  doGripDrag(x: number, y: number): void {
    if (!this._draggingGrip) { console.warn(`[GripManager] doGripDrag: no dragging grip`); return; }
    const { entityId, propPath, grip, offsetX, offsetY, isRef } = this._draggingGrip;
    const newX = x - offsetX, newY = y - offsetY;
    const entity = this.viewer.doc.getEntityById(entityId);
    if (!entity) { console.warn(`[GripManager] doGripDrag: entity ${entityId} not found`); return; }
    const gripResult = entity.onGripDrag(propPath, newX, newY, this.viewer.renderer?.resolver);
    if (!gripResult) { console.warn(`[GripManager] doGripDrag: onGripDrag(${entityId}, ${propPath}, ${newX}, ${newY}) returned false`); return; }

    const affected = new Set([entityId]);
    if (this.viewer.renderer?.resolver) {
      const queue: string[] = [entityId];
      if (propPath && propPath !== entityId) queue.push(propPath);
      while (queue.length) {
        const id = queue.shift()!;
        const deps = this.viewer.renderer.resolver._dependents.get(id);
        if (deps) {
          for (const depId of deps) {
            if (!affected.has(depId)) { affected.add(depId); queue.push(depId); }
          }
        }
      }
    }

    for (const id of affected) {
      const e = this.viewer.doc.getEntityById(id);
      if (e) { this.viewer._updateRenderedItemDirect(e); }
      else { console.warn(`[GripManager] doGripDrag: affected entity ${id} not found`); }
    }

    if (grip) {
      grip.data.x = newX;
      grip.data.y = newY;
      grip.position = new paper.Point(newX, newY);
    }
    this.viewer.view.update();
  }

  /** 结束拖拽夹点，记录撤销快照 */
  endGripDrag(): void {
    if (!this._draggingGrip) { console.warn(`[GripManager] endGripDrag: no dragging grip`); return; }
    const { grip, entityId } = this._draggingGrip;
    if (grip) grip.fillColor = '#FFFFFF';
    if (this.viewer.renderer && entityId) {
      const before = this._gripBeforeSnapshot;
      if (before) {
        const after = cloneDocumentData(this.viewer.doc);
        const changed = JSON.stringify(before) !== JSON.stringify(after);
        if (changed) {
          this.viewer._undoManager.push(createUndoCommand(entityId, before, after, this.viewer));
        }
      } else {
        console.warn(`[GripManager] endGripDrag(${entityId}): gripBeforeSnapshot is null`);
      }
      this.viewer.renderer.render();
      for (const id of this.viewer.selectedIds) this.viewer._setEntitySelected(id, true);
    } else {
      console.warn(`[GripManager] endGripDrag: renderer=${!!this.viewer.renderer} entityId=${entityId}`);
    }

    const entity = this.viewer.doc.getEntityById(entityId);
    if (entity) {
      this.hideGrips();
      this.viewer._showProperties(entity);
      this.showGrips(entity);
    } else {
      console.warn(`[GripManager] endGripDrag: entity ${entityId} not found for grip refresh`);
    }
    this._gripBeforeSnapshot = null;
    this._draggingGrip = null;
    this.viewer._updateLayerPanel();
    this.viewer.view.update();
  }

  /** 根据当前视图缩放更新夹点尺寸 */
  updateScale(): void {
    if (!this._gripItems) return;
    for (const grip of this._gripItems) {
      const x = grip.data.x, y = grip.data.y;
      const hs = (grip.data.sizePx || GRIP_SIZE_PX) / Math.max(this.viewer.view.zoom, 1e-6) / 2;
      grip.bounds = new paper.Rectangle(x - hs, y - hs, hs * 2, hs * 2);
    }
  }

  /** 创建一个夹点图形项 */
  _makeGripItem(x: number, y: number, kind = 'default'): any {
    const hs = GRIP_SIZE_PX / Math.max(this.viewer.view.zoom, 1e-6) / 2;
    const grip = new paper.Path.Rectangle({
      from: [x - hs, y - hs],
      to: [x + hs, y + hs],
      fillColor: '#FFFFFF',
      strokeColor: kind === 'radius' || kind === 'angle' ? '#D97706' : '#0078D7',
      strokeWidth: 1.5,
      strokeScaling: false,
      insert: false
    });
    this.viewer._getWorldLayer().addChild(grip);
    grip.data = { screenFixedGrip: true, x, y, sizePx: GRIP_SIZE_PX };
    return grip;
  }
}
