import paper from 'paper';

/** 管理实体选择状态的选中、取消、框选等操作 */
export class SelectionManager {
  viewer: any;
  selectedIds: Set<string> = new Set();
  _previousSelectedIds: Set<string> = new Set();
  _selectionRectItem: paper.Path.Rectangle | null = null;
  _isBoxSelecting: boolean = false;

  /** 构造 SelectionManager */
  constructor(viewer: any) {
    this.viewer = viewer;
  }

  /** 处理单击选中事件 */
  handleSingleClick(pt: { x: number; y: number }, additive = false): void {
    if (!this.viewer.renderer) return;

    if (!additive) this.deselectAll();

    const pickPx = 10;
    const hit = this.viewer.project.hitTest(
      this.viewer._worldToProject(pt),
      { stroke: true, fill: true, tolerance: pickPx / this.viewer.view.zoom }
    );

    let hitItem = hit?.item;
    while (hitItem && !hitItem.data?.entityId) hitItem = hitItem.parent;

    if (hitItem && hitItem.data?.entityId) {
      const id = hitItem.data.entityId;
      const hitEntity = this.viewer.renderer.resolver.doc.getEntityById(id);
      if (hitEntity) {
        const hitLayer = this.viewer.doc?.layers?.find((l: any) => l.id === (hitEntity.layer || '0'));
        if (hitLayer?.locked) {
          this.viewer._setPrompt('图层已锁定');
          return;
        }
      }

      if (additive) {
        if (this.selectedIds.has(id)) {
          this.selectedIds.delete(id);
          this.viewer._setEntitySelected(id, false);
        } else {
          this.selectedIds.add(id);
          this.viewer._setEntitySelected(id, true);
        }

        this.viewer._removeGrips();
        if (this.selectedIds.size === 1) {
          const entity = this.viewer.renderer.resolver.doc.getEntityById([...this.selectedIds][0]);
          if (entity) { this.viewer._showProperties(entity); this.viewer._showGrips(entity); }
        } else {
          this.viewer._showMultiSelectionSummary(this.selectedIds);
        }
      } else {
        this.selectEntity(id);
      }
    } else if (!additive) {
      this.deselectAll();
    }

    this.viewer._updateLayerPanel();
    this.viewer.view.update();
  }

  /** 选中指定 ID 的实体 */
  selectEntity(id: string): void {
    this.deselectAll();

    if (!this.viewer.renderer) return;
    if (this.viewer.renderer.itemMap.get(id) === undefined) return;

    this.selectedIds.add(id);
    this.viewer._setEntitySelected(id, true);

    const entity = this.viewer.renderer.resolver.doc.getEntityById(id);
    if (entity) {
      this.viewer._showProperties(entity);
      this.viewer._showGrips(entity);
    }

    this.viewer._updateLayerPanel();
  }

  /** 取消全部选中 */
  deselectAll(): void {
    if (!this.viewer.renderer) return;
    this._previousSelectedIds = new Set(this.selectedIds);

    for (const id of this.selectedIds) {
      this.viewer._setEntitySelected(id, false);
    }

    this.selectedIds.clear();
    this.viewer._removeGrips();
    this.viewer._switchToLayerView();
    this.viewer._updateLayerPanel();
  }

  /** 处理框选过程中的矩形绘制 */
  handleBoxSelect(toPt: { x: number; y: number }, additive = false): void {
    if (!this.viewer.renderer || !this.viewer._mouseDownPt) return;
    this._isBoxSelecting = true;

    const from = this.viewer._mouseDownPt;

    this.clearSelectionRect();
    this._selectionRectItem = new paper.Path.Rectangle({
      from: [from.x, from.y],
      to: [toPt.x, toPt.y],
      strokeColor: '#0078D7',
      strokeWidth: 1,
      dashArray: [4, 3],
      fillColor: new paper.Color(0, 0.47, 0.84, 0.08),
      insert: false
    });
    this.viewer._getWorldLayer().addChild(this._selectionRectItem);
    this.viewer.view.update();
  }

  /** 结束框选，收集框内实体 */
  endBoxSelect(toPt: { x: number; y: number }, additive = false): void {
    if (!this._selectionRectItem || !this.viewer._mouseDownPt) return;
    const from = this.viewer._mouseDownPt;
    const to = toPt;

    this.clearSelectionRect();
    this._isBoxSelecting = false;

    const selBounds = new paper.Rectangle(
      Math.min(from.x, to.x), Math.min(from.y, to.y),
      Math.abs(to.x - from.x), Math.abs(to.y - from.y)
    );

    const strict = from.x <= to.x;

    if (!this.viewer.renderer) return;
    if (!additive) this.deselectAll();

    const found = new Set<string>();

    for (const item of this.viewer.renderer.hitItems) {
      if (!item.bounds) continue;
      const eid = item.data.entityId;
      if (eid) {
        const ent = this.viewer.renderer.resolver.doc.getEntityById(eid);
        if (ent) {
          const l = this.viewer.doc?.layers?.find((ly: any) => ly.id === (ent.layer || '0'));
          if (l?.locked) continue;
        }
      }

      const inside = strict
        ? (selBounds.contains(item.bounds.topLeft) &&
           selBounds.contains(item.bounds.topRight) &&
           selBounds.contains(item.bounds.bottomLeft) &&
           selBounds.contains(item.bounds.bottomRight))
        : selBounds.intersects(item.bounds);

      if (inside) {
        found.add(eid);
      }
    }

    for (const id of found) {
      this.selectedIds.add(id);
      this.viewer._setEntitySelected(id, true);
    }

    if (found.size === 1) {
      const entity = this.viewer.renderer.resolver.doc.getEntityById([...found][0]);
      if (entity) this.viewer._showProperties(entity);
    } else if (found.size > 1) {
      this.viewer._showMultiSelectionSummary(found);
    } else {
      this.viewer._switchToLayerView();
    }

    this.viewer._updateLayerPanel();
    this.viewer.view.update();
  }

  /** 清除框选矩形 */
  clearSelectionRect(): void {
    if (this._selectionRectItem) {
      this._selectionRectItem.remove();
      this._selectionRectItem = null;
    }
  }

  /** 恢复上一次的选中状态 */
  selectPrevious(): void {
    this.deselectAll();
    for (const id of this._previousSelectedIds) {
      this.selectedIds.add(id);
      this.viewer._setEntitySelected(id, true);
    }
    if (this.selectedIds.size === 1) {
      const entity = this.viewer.doc?.getEntityById([...this.selectedIds][0]);
      if (entity) this.viewer._showProperties(entity);
    }
    this.viewer._updateLayerPanel();
    this.viewer.view.update();
  }

  /** 获取当前选中的实体 ID 集合 */
  get selectedEntityIds(): Set<string> {
    return this.selectedIds;
  }
}
