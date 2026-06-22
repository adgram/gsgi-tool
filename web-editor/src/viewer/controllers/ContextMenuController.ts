import { Viewer } from '../Viewer';

/**
 * 右键菜单控制器
 * 管理画布右键菜单的创建、显示/隐藏与操作分发。
 */
export class ContextMenuController {
  private viewer: Viewer;
  private _contextMenu: HTMLElement | null = null;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
    this._create();
  }

  /** 创建右键菜单 DOM，绑定点击事件 */
  private _create(): void {
    this._contextMenu = document.createElement('div');
    this._contextMenu.id = 'ctx-menu';
    this._contextMenu.innerHTML = `
      <div class="ctx-item" data-action="select-all">全选</div>
      <div class="ctx-item" data-action="deselect">取消选择</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" data-action="zoom-ext">缩放到全图</div>
      <div class="ctx-item" data-action="zoom-in">放大</div>
      <div class="ctx-item" data-action="zoom-out">缩小</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" data-action="inspect">检查实体属性</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" data-action="clear">清空全部</div>`;
    document.body.appendChild(this._contextMenu);
    this._contextMenu.addEventListener('click', (e: MouseEvent) => {
      const item = (e.target as HTMLElement).closest('.ctx-item') as HTMLElement;
      if (!item) return;
      const action = item.dataset.action;
      if (action) this._handleAction(action);
      this.hide();
    });
  }

  /** 在指定屏幕坐标位置显示右键菜单 */
  showAt(x: number, y: number, _pt: { x: number; y: number }): void {
    if (!this._contextMenu) return;
    this._contextMenu.classList.add('visible');
    this._contextMenu.style.left = Math.min(x, window.innerWidth - 160) + 'px';
    this._contextMenu.style.top = Math.min(y, window.innerHeight - 240) + 'px';
    this._contextMenu.dataset.clickPoint = JSON.stringify({ x: _pt.x, y: _pt.y });
  }

  /** 隐藏右键菜单 */
  hide(): void {
    if (this._contextMenu) this._contextMenu.classList.remove('visible');
  }

  /** 判断点击目标是否在菜单内 */
  contains(target: EventTarget | null): boolean {
    return !!this._contextMenu && this._contextMenu.contains(target as Node);
  }

  /** 根据菜单项 action 分发对应操作 */
  private _handleAction(action: string): void {
    const v = this.viewer;
    switch (action) {
      case 'select-all':
        v.deselectAll();
        if (v.renderer) {
          for (const id of v.renderer.entityItems?.keys() || v.renderer.itemMap.keys()) {
            v.selectedIds.add(id);
            v._setEntitySelected(id, true);
          }
          v._showMultiSelectionSummary(v.selectedIds);
          v._updateLayerPanel();
          v.view.update();
        }
        break;
      case 'deselect': v.deselectAll(); break;
      case 'zoom-ext': v.zoomExtents(); break;
      case 'zoom-in': v.zoomIn(); break;
      case 'zoom-out': v.zoomOut(); break;
      case 'inspect':
        if (v.selectedIds.size === 1) {
          const eid = [...v.selectedIds][0];
          const entity = v.renderer?.resolver.doc.getEntityById(eid);
          if (entity) v._showProperties(entity);
        }
        break;
      case 'clear':
        v.deselectAll();
        if (v.renderer) { v.renderer.clear(); v.view.update(); }
        break;
    }
  }
}
