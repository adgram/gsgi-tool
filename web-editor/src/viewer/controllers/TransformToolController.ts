/**
 * 变换工具控制器
 * 管理实体变换操作（移动/复制/旋转/镜像）的交互流程、预览渲染与几何变换计算。
 * 拆分自 DrawingTools.ts 原型方法，通过 Viewer._transformToolController 访问。
 */
import paper from 'paper';
import { Viewer } from '../Viewer';
import { Entity } from '../../core/entity';
import { createEntity, nextId, batchTransform, batchMirror, Transform } from '../../core/barrel';
import { Point2d } from '../../core/geometry';
import { cloneDocumentData, createUndoCommand } from '../util/clipboard';

export class TransformToolController {
  private viewer: Viewer;

  /** 构造函数 */
  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  /** 完成变换并记录撤销快照，完成后切回选择工具 */
  finishTransform(entity: Entity | null, before: unknown, prompt: string): void {
    const after = cloneDocumentData(this.viewer.doc!);
    this.viewer._undoManager.push(createUndoCommand(entity?.id, before, after, this.viewer));
    this.viewer._applyDocSnapshot();
    this.viewer._setPrompt(prompt);
    this.viewer._setDrawTool('select');
  }

  /** 移动点击交互处理 */
  drawMoveClick(pt: { x: number; y: number }, rawPt: { x: number; y: number }): void {
    if (!this.viewer.doc) return;
    if (this.viewer._drawToolController.drawStep === 0) {
      const hit = this.viewer._drawToolController.hitTestEntity(rawPt || pt);
      if (!hit) { this.viewer._setPrompt('未选中实体'); return; }
      this.viewer.deselectAll();
      this.viewer.selectEntity(hit);
      this.viewer._drawToolController.drawData._selectedEntityId = hit;
      this.viewer._drawToolController.drawData._selectPt = { x: (rawPt || pt).x, y: (rawPt || pt).y };
      this.viewer._setPrompt('已选中，按 Enter 确认');
      return;
    } else if (this.viewer._drawToolController.drawStep === 1) {
      this.viewer._drawToolController.drawData.offset = { x: pt.x, y: pt.y };
      this.viewer._drawToolController.drawData._lastDx = 0; this.viewer._drawToolController.drawData._lastDy = 0;
      this.viewer._drawToolController.drawData._before = this.viewer._saveSnapshot();
      this.viewer._drawToolController.drawStep = 2;
      this.viewer._setCanvasCursor('crosshair');
      this.viewer._setPrompt('点击指定新位置');
    } else {
      const offset = this.viewer._drawToolController.drawData.offset!;
      const dx = pt.x - offset.x;
      const dy = pt.y - offset.y;
      this.revertMovePreview();
      const t = Transform.translation({ x: dx, y: dy });
      if (this.viewer._drawToolController.drawData.targetIds) {
        const entities = this.viewer._drawToolController.drawData.targetIds
          .map((id: string) => this.viewer.doc!.getEntityById(id))
          .filter(Boolean) as Entity[];
        batchTransform(this.viewer.renderer?.resolver, entities, t);
        this.finishTransform(null, this.viewer._drawToolController.drawData._before, `已移动 ${entities.length} 个实体`);
      } else {
        const entity = this.viewer.doc.getEntityById(this.viewer._drawToolController.drawData.targetEntityId!);
        if (!entity) { this.viewer._setPrompt('实体不存在'); this.viewer._cancelDrawing(false); return; }
        batchTransform(this.viewer.renderer?.resolver, [entity], t);
        this.finishTransform(entity, this.viewer._drawToolController.drawData._before, '已移动');
      }
    }
  }

  /** 更新移动预览 */
  updateMovePreview(pt: { x: number; y: number }): void {
    if (this.viewer._drawToolController.drawStep < 1 || !this.viewer._drawToolController.drawData.offset) return;
    const offset = this.viewer._drawToolController.drawData.offset;
    const dx = pt.x - offset.x;
    const dy = pt.y - offset.y;
    const itemDx = dx - (this.viewer._drawToolController.drawData._lastDx || 0);
    const itemDy = dy - (this.viewer._drawToolController.drawData._lastDy || 0);
    this.viewer._drawToolController.drawData._lastDx = dx;
    this.viewer._drawToolController.drawData._lastDy = dy;
    const ids: string[] = this.viewer._drawToolController.drawData.targetIds || (this.viewer._drawToolController.drawData.targetEntityId ? [this.viewer._drawToolController.drawData.targetEntityId] : []);
    if (!this.viewer.renderer?.entityItems) return;
    for (const id of ids) {
      const items = this.viewer.renderer.entityItems.get(id);
      if (!items) continue;
      for (const item of items) {
        if (item.translate) item.translate(new paper.Point(itemDx, itemDy));
      }
    }
    this.viewer.view.update();
  }

  /** 恢复移动预览 */
  revertMovePreview(): void {
    const dx = -(this.viewer._drawToolController.drawData._lastDx || 0);
    const dy = -(this.viewer._drawToolController.drawData._lastDy || 0);
    this.viewer._drawToolController.drawData._lastDx = 0;
    this.viewer._drawToolController.drawData._lastDy = 0;
    const ids: string[] = this.viewer._drawToolController.drawData.targetIds || (this.viewer._drawToolController.drawData.targetEntityId ? [this.viewer._drawToolController.drawData.targetEntityId] : []);
    if (!this.viewer.renderer?.entityItems) return;
    for (const id of ids) {
      const items = this.viewer.renderer.entityItems.get(id);
      if (!items) continue;
      for (const item of items) {
        if (item.translate) item.translate(new paper.Point(dx, dy));
      }
    }
    this.viewer.view.update();
  }

  /** 复制点击交互处理 */
  drawCopyClick(pt: { x: number; y: number }, rawPt: { x: number; y: number }): void {
    if (!this.viewer.doc) return;
    if (this.viewer._drawToolController.drawStep === 0) {
      const hit = this.viewer._drawToolController.hitTestEntity(rawPt || pt);
      if (!hit) { this.viewer._setPrompt('未选中实体'); return; }
      this.viewer.deselectAll();
      this.viewer.selectEntity(hit);
      this.viewer._drawToolController.drawData._selectedEntityId = hit;
      this.viewer._drawToolController.drawData._selectPt = { x: (rawPt || pt).x, y: (rawPt || pt).y };
      this.viewer._setPrompt('已选中，按 Enter 确认');
      return;
    } else if (this.viewer._drawToolController.drawStep === 1) {
      this.viewer._drawToolController.drawData.offset = { x: pt.x, y: pt.y };
      this.viewer._drawToolController.drawData._lastDx = 0; this.viewer._drawToolController.drawData._lastDy = 0;
      this.viewer._drawToolController.drawData._previewItems = [];
      this.viewer._drawToolController.drawStep = 2;
      this.viewer._setCanvasCursor('crosshair');
      this.viewer._setPrompt('点击指定副本位置');
    } else {
      const offset = this.viewer._drawToolController.drawData.offset!;
      const dx = pt.x - offset.x;
      const dy = pt.y - offset.y;
      this.removeCopyPreview();
      const before = this.viewer._saveSnapshot();
      const ids = this.viewer._drawToolController.drawData.sourceIds || [];
      const { copies, oldToNew } = this.cloneEntities(ids);
      if (copies.length === 0) { this.viewer._setPrompt('复制失败'); return; }
      this.viewer.renderer?.resolver._buildCache();

      const newToOld = new Map<string, string>();
      for (const [oldId, newId] of oldToNew) newToOld.set(newId, oldId);
      const srcIdSet = new Set(ids);
      const rootCopies = copies.filter(c => {
        const oldId = newToOld.get(c.id);
        return oldId && srcIdSet.has(oldId);
      });

      const nonPointRoots = rootCopies.filter(c => c.type !== 'point');
      batchTransform(this.viewer.renderer?.resolver, nonPointRoots, Transform.translation({ x: dx, y: dy }));

      for (const copy of rootCopies) {
        if (copy.type !== 'point') continue;
        if (!(copy as any).point) continue;
        const isReferenced = nonPointRoots.some(rc => {
          const j = rc.toJSON();
          for (const v of Object.values(j)) { if (v === copy.id || (Array.isArray(v) && v.includes(copy.id))) return true; }
          if (j.segments) { for (const seg of j.segments as any[]) { if (seg.start_ref === copy.id || seg.end_ref === copy.id || seg.mid_ref === copy.id || seg.center_ref === copy.id) return true; } }
          return false;
        });
        if (!isReferenced) {
          (copy as any).point = new Point2d((copy as any).point.x + dx, (copy as any).point.y + dy);
        }
      }
      const after = cloneDocumentData(this.viewer.doc);
      this.viewer._undoManager.push(createUndoCommand(copies[0]?.id, before, after, this.viewer));
      this.viewer._applyDocSnapshot();
      this.viewer._setPrompt(`已复制 ${rootCopies.length} 个实体`);
      this.viewer._setDrawTool('select');
    }
  }

  /** 更新复制预览 */
  updateCopyPreview(pt: { x: number; y: number }): void {
    if (this.viewer._drawToolController.drawStep < 1 || !this.viewer._drawToolController.drawData.offset) return;
    const offset = this.viewer._drawToolController.drawData.offset;
    const dx = pt.x - offset.x;
    const dy = pt.y - offset.y;
    const itemDx = dx - (this.viewer._drawToolController.drawData._lastDx || 0);
    const itemDy = dy - (this.viewer._drawToolController.drawData._lastDy || 0);
    this.viewer._drawToolController.drawData._lastDx = dx;
    this.viewer._drawToolController.drawData._lastDy = dy;
    const ids: string[] = this.viewer._drawToolController.drawData.sourceIds || [];
    if (!this.viewer.renderer?.entityItems) return;
    if (!this.viewer._drawToolController.drawData._previewItems?.length) {
      this.viewer._drawToolController.drawData._previewItems = [];
      for (const id of ids) {
        const items = this.viewer.renderer.entityItems.get(id);
        if (!items) continue;
        for (const item of items) {
          const clone = item.clone();
          clone.opacity = 0.4;
          this.viewer._getWorldLayer().addChild(clone);
          this.viewer._drawToolController.drawData._previewItems.push(clone);
        }
      }
    }
    for (const item of this.viewer._drawToolController.drawData._previewItems) {
      if (item.translate) item.translate(new paper.Point(itemDx, itemDy));
    }
    this.viewer.view.update();
  }

  /** 移除复制预览 */
  removeCopyPreview(): void {
    for (const item of (this.viewer._drawToolController.drawData._previewItems || [])) item.remove();
    this.viewer._drawToolController.drawData._previewItems = [];
  }

  /** 批量克隆实体并替换内部引用（共享 old→new 映射） */
  cloneEntities(ids: string[]): { copies: Entity[]; oldToNew: Map<string, string> } {
    const visited = new Set<string>();
    const pointRefs = new Set<string>();
    const scanQueue = [...ids];
    while (scanQueue.length > 0) {
      const scanId = scanQueue.shift()!;
      if (visited.has(scanId)) continue;
      visited.add(scanId);
      const entity = this.viewer.doc!.getEntityById(scanId);
      if (!entity) continue;
      for (const [key, value] of Object.entries(entity.toJSON())) {
        if (key === 'id' || key === 'type') continue;
        const checkId = (v: unknown) => {
          if (typeof v === 'string' && /^[A-Z]+[0-9]+$/.test(v)) {
            const refEnt = this.viewer.doc!.getEntityById(v);
            if (refEnt && refEnt.type === 'point' && (refEnt as any).point) {
              if (!pointRefs.has(v)) { pointRefs.add(v); scanQueue.push(v); }
            }
          }
        };
        if (key.endsWith('_ref') && typeof value === 'string') { checkId(value); }
        else if (key === 'ref_pt') { const id = typeof value === 'string' ? value : (value as any)?.id; if (id) checkId(id); }
        else if (key.endsWith('_refs') && Array.isArray(value)) { value.forEach(checkId); }
        else if (key === 'segments' && Array.isArray(value)) {
          for (const seg of value) {
            for (const rk of ['start_ref', 'end_ref', 'mid_ref', 'center_ref']) { checkId(seg[rk]); }
          }
        }
      }
    }

    const allToClone = [...new Set([...ids, ...pointRefs])];
    const oldToNew = new Map<string, string>();
    for (const id of allToClone) {
      const entity = this.viewer.doc!.getEntityById(id);
      if (!entity) continue;
      oldToNew.set(id, nextId(entity.id.replace(/[0-9]+$/, '') || 'CP'));
    }

    const copies: Entity[] = [];
    for (const id of allToClone) {
      const entity = this.viewer.doc!.getEntityById(id);
      if (!entity) continue;
      const json = JSON.parse(JSON.stringify(entity.toJSON()));

      const remap = (val: unknown): unknown => {
        if (typeof val === 'string' && oldToNew.has(val)) return oldToNew.get(val);
        return val;
      };
      for (const [key, value] of Object.entries(json)) {
        if (key === 'id') { json[key] = oldToNew.get(id); }
        else if ((key.endsWith('_ref')) && typeof value === 'string') { json[key] = remap(value); }
        else if (key === 'ref_pt') {
          if (typeof value === 'string') { json[key] = remap(value); }
          else if (typeof value === 'object' && (value as Record<string, unknown>)?.id) {
            const v = value as Record<string, unknown>;
            json[key] = { ...v, id: remap(v.id) as string };
          }
        }
        else if (key.endsWith('_refs') && Array.isArray(value)) { json[key] = value.map((v: unknown) => remap(v)); }
        else if (key === 'segments' && Array.isArray(value)) {
          for (const seg of value) {
            for (const rk of ['start_ref', 'end_ref', 'mid_ref', 'center_ref']) { seg[rk] = remap(seg[rk]); }
          }
        }
      }

      const refPtId = typeof json.ref_pt === 'string' ? json.ref_pt : json.ref_pt?.id;
      if (refPtId && !oldToNew.has(refPtId)) {
        const refEnt = this.viewer.doc!.getEntityById(refPtId);
        if (refEnt && this.viewer.renderer?.resolver) {
          const r = (refEnt as any).getResult?.(this.viewer.renderer.resolver);
          if (r) { json.point = [r.x, r.y]; delete json.ref_pt; }
        }
      }

      const copy = createEntity(json) as Entity;
      if (!copy) continue;
      this.viewer.doc!.entities.push(copy);
      copies.push(copy);
    }
    return { copies, oldToNew };
  }

  /** 旋转点击交互处理 */
  drawRotateClick(pt: { x: number; y: number }, rawPt: { x: number; y: number }): void {
    if (!this.viewer.doc) return;
    if (this.viewer._drawToolController.drawStep === 0) {
      const hit = this.viewer._drawToolController.hitTestEntity(rawPt || pt);
      if (!hit) { this.viewer._setPrompt('未选中实体'); return; }
      this.viewer.deselectAll();
      this.viewer.selectEntity(hit);
      this.viewer._drawToolController.drawData._selectedEntityId = hit;
      this.viewer._drawToolController.drawData._selectPt = { x: (rawPt || pt).x, y: (rawPt || pt).y };
      this.viewer._setPrompt('已选中，按 Enter 确认');
      return;
    } else if (this.viewer._drawToolController.drawStep === 1) {
      this.viewer._drawToolController.drawData.centerPt = { x: pt.x, y: pt.y };
      this.viewer._drawToolController.drawStep = 2;
      this.viewer._setCanvasCursor('crosshair');
      this.viewer._focusCmdInput('输入旋转角度（度）后按回车，或点击指定角度');
      this.viewer._setPrompt('输入旋转角度（度），或点击指定角度');
    } else {
      this._applyRotate(pt);
    }
  }

  /** 应用旋转变换 */
  private _applyRotate(pt: { x: number; y: number }): void {
    if (!this.viewer.doc) return;
    const center = new Point2d(this.viewer._drawToolController.drawData.centerPt!.x, this.viewer._drawToolController.drawData.centerPt!.y);
    const angleRad = new Point2d(pt.x - center.x, pt.y - center.y).angle();
    const t = Transform.rotationAbout(center, angleRad);
    const before = this.viewer._saveSnapshot();
    if (this.viewer._drawToolController.drawData.targetIds) {
      const entities = this.viewer._drawToolController.drawData.targetIds
        .map((id: string) => this.viewer.doc!.getEntityById(id))
        .filter(Boolean) as Entity[];
      batchTransform(this.viewer.renderer?.resolver, entities, t);
      this.finishTransform(null, before, `已旋转 ${entities.length} 个实体 ${(angleRad * 180 / Math.PI).toFixed(1)}°`);
    } else {
      const entity = this.viewer.doc.getEntityById(this.viewer._drawToolController.drawData.targetEntityId!);
      if (!entity) { this.viewer._setPrompt('实体不存在'); this.viewer._cancelDrawing(false); return; }
      batchTransform(this.viewer.renderer?.resolver, [entity], t);
      this.finishTransform(entity, before, `已旋转 ${(angleRad * 180 / Math.PI).toFixed(1)}°`);
    }
  }

  /** 通过角度值（度）应用旋转 */
  applyRotateByAngle(angleDeg: number): void {
    if (!this.viewer.doc || !this.viewer._drawToolController.drawData.centerPt) return;
    const center = new Point2d(this.viewer._drawToolController.drawData.centerPt.x, this.viewer._drawToolController.drawData.centerPt.y);
    const angleRad = angleDeg * Math.PI / 180;
    const t = Transform.rotationAbout(center, angleRad);
    const before = this.viewer._saveSnapshot();
    if (this.viewer._drawToolController.drawData.targetIds) {
      const entities = this.viewer._drawToolController.drawData.targetIds
        .map((id: string) => this.viewer.doc!.getEntityById(id))
        .filter(Boolean) as Entity[];
      batchTransform(this.viewer.renderer?.resolver, entities, t);
      this.finishTransform(null, before, `已旋转 ${entities.length} 个实体 ${angleDeg.toFixed(1)}°`);
    } else {
      const entity = this.viewer.doc.getEntityById(this.viewer._drawToolController.drawData.targetEntityId!);
      if (!entity) { this.viewer._setPrompt('实体不存在'); this.viewer._cancelDrawing(false); return; }
      batchTransform(this.viewer.renderer?.resolver, [entity], t);
      this.finishTransform(entity, before, `已旋转 ${angleDeg.toFixed(1)}°`);
    }
  }

  /** 镜像点击交互处理 */
  drawMirrorClick(pt: { x: number; y: number }, rawPt: { x: number; y: number }): void {
    if (!this.viewer.doc) return;
    if (this.viewer._drawToolController.drawStep === 0) {
      const hit = this.viewer._drawToolController.hitTestEntity(rawPt || pt);
      if (!hit) { this.viewer._setPrompt('未选中实体'); return; }
      this.viewer.deselectAll();
      this.viewer.selectEntity(hit);
      this.viewer._drawToolController.drawData._selectedEntityId = hit;
      this.viewer._drawToolController.drawData._selectPt = { x: (rawPt || pt).x, y: (rawPt || pt).y };
      this.viewer._setPrompt('已选中，按 Enter 确认');
      return;
    } else if (this.viewer._drawToolController.drawStep === 1) {
      this.viewer._drawToolController.drawData.mirrorLine = [pt];
      this.viewer._drawToolController.drawStep = 2;
      this.viewer._setPrompt('点击指定镜像轴第二点');
    } else {
      const p1 = this.viewer._drawToolController.drawData.mirrorLine![0];
      const p2 = pt;
      const before = this.viewer._saveSnapshot();
      if (this.viewer._drawToolController.drawData.targetIds) {
        const entities = this.viewer._drawToolController.drawData.targetIds
          .map((id: string) => this.viewer.doc!.getEntityById(id))
          .filter(Boolean) as Entity[];
        batchMirror(this.viewer.renderer?.resolver, entities, p1, p2);
        this.finishTransform(null, before, `已镜像 ${entities.length} 个实体`);
      } else {
        const entity = this.viewer.doc.getEntityById(this.viewer._drawToolController.drawData.targetEntityId!);
        if (!entity) { this.viewer._setPrompt('实体不存在'); this.viewer._cancelDrawing(false); return; }
        batchMirror(this.viewer.renderer?.resolver, [entity], p1, p2);
        this.finishTransform(entity, before, '已镜像');
      }
    }
  }

}
