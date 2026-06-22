import { showModal } from '../util/ui';

/** 右键菜单管理器 */
export class MenuManager {
  viewer: any;
  _contextMenu: HTMLElement | null = null;
  _layerContextMenu: HTMLElement | null = null;

  /** 初始化菜单管理器 */
  constructor(viewer: any) {
    this.viewer = viewer;
    this._init();
  }

  /** 初始化所有菜单 */
  _init(): void {
    this._createContextMenu();
    this._createLayerContextMenu();
  }

  /** 创建画布右键菜单 */
  _createContextMenu(): void {
    this._contextMenu = document.createElement('div');
    this._contextMenu.id = 'ctx-menu';
    this._contextMenu.innerHTML = `
      <div class="ctx-item" data-action="select-all">\u5168\u9009</div>
      <div class="ctx-item" data-action="deselect">\u53D6\u6D88\u9009\u62E9</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" data-action="zoom-ext">\u7F29\u653E\u5230\u5168\u56FE</div>
      <div class="ctx-item" data-action="zoom-in">\u653E\u5927</div>
      <div class="ctx-item" data-action="zoom-out">\u7F29\u5C0F</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" data-action="inspect">\u68C0\u67E5\u5B9E\u4F53\u5C5E\u6027</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" data-action="clear">\u6E05\u7A7A\u5168\u90E8</div>`;

    document.body.appendChild(this._contextMenu);

    this._contextMenu.addEventListener('click', (e: Event) => {
      const item = (e.target as HTMLElement).closest('.ctx-item') as HTMLElement;
      if (!item) return;
      this._handleContextAction(item.dataset.action);
      this.hide();
    });
  }

  /** 创建图层右键菜单 */
  _createLayerContextMenu(): void {
    this._layerContextMenu = document.createElement('div');
    this._layerContextMenu.id = 'layer-context-menu';
  }

  /** 在指定位置显示菜单 */
  showAt(screenX: number, screenY: number, projectPt: { x: number; y: number }): void {
    if (!this._contextMenu) return;
    this._contextMenu.classList.add('visible');
    this._contextMenu.style.left = Math.min(screenX, window.innerWidth - 160) + 'px';
    this._contextMenu.style.top = Math.min(screenY, window.innerHeight - 240) + 'px';
    this._contextMenu.dataset.clickPoint = JSON.stringify({ x: projectPt.x, y: projectPt.y });
  }

  /** 隐藏菜单 */
  hide(): void {
    if (this._contextMenu) this._contextMenu.classList.remove('visible');
  }

  /** 处理右键菜单操作 */
  _handleContextAction(action: string | undefined): void {
    switch (action) {
      case 'select-all':
        this.viewer.deselectAll();
        if (this.viewer.renderer) {
          for (const id of this.viewer.renderer.entityItems?.keys() || this.viewer.renderer.itemMap.keys()) {
            this.viewer.selectedIds.add(id);
            this.viewer._setEntitySelected(id, true);
          }
          this.viewer._showMultiSelectionSummary(this.viewer.selectedIds);
          this.viewer._updateLayerPanel();
          this.viewer.view.update();
        }
        break;
      case 'deselect':
        this.viewer.deselectAll();
        break;
      case 'zoom-ext':
        this.viewer.zoomExtents();
        break;
      case 'zoom-in':
        this.viewer.zoomIn();
        break;
      case 'zoom-out':
        this.viewer.zoomOut();
        break;
      case 'inspect':
        if (this.viewer.selectedIds.size === 1) {
          const eid = [...this.viewer.selectedIds][0];
          const entity = this.viewer.renderer?.resolver.doc.getEntityById(eid);
          if (entity) this.viewer._showProperties(entity);
        }
        break;
      case 'clear':
        this.viewer.deselectAll();
        if (this.viewer.renderer) {
          this.viewer.renderer.clear();
          this.viewer.view.update();
        }
        break;
    }
  }

  /** 创建图层上下文菜单 */
  createLayerContextMenu(x: number, y: number, layerId?: string): void {
    this._removeLayerContextMenu();
    this._layerContextMenu = document.createElement('div');
    this._layerContextMenu.id = 'layer-context-menu';
    this._layerContextMenu.classList.add('visible');
    this._layerContextMenu.style.left = x + 'px';
    this._layerContextMenu.style.top = y + 'px';

    const items = [
      { label: '\u8BBE\u4E3A\u5F53\u524D', icon: '\u2713', action: () => this._setCurrentLayer(layerId) },
      { label: '\u91CD\u547D\u540D', icon: '\u270E', action: () => this._renameLayer(layerId) },
      { label: '\u4FEE\u6539\u989C\u8272', icon: '\uD83C\uDFA8', action: () => this._changeLayerColor(layerId) },
    ];

    for (const item of items) {
      const btn = document.createElement('div');
      btn.className = 'ctx-item';
      btn.addEventListener('click', () => { item.action(); this._removeLayerContextMenu(); });
      const iconSpan = document.createElement('span');
      iconSpan.style.width = '16px';
      iconSpan.style.textAlign = 'center';
      iconSpan.textContent = item.icon;
      btn.appendChild(iconSpan);
      btn.appendChild(document.createTextNode(item.label));
      this._layerContextMenu.appendChild(btn);
    }

    document.body.appendChild(this._layerContextMenu);
  }

  /** 设置当前图层 */
  _setCurrentLayer(layerId?: string): void {
    if (!this.viewer.doc || !layerId) return;
    this.viewer.doc.properties = this.viewer.doc.properties || {};
    this.viewer.doc.properties.currentLayer = layerId;
    this.viewer._updateLayerPanel();
    this.viewer._persist();
    this.viewer._setPrompt(`\u5F53\u524D\u56FE\u5C42: ${layerId}`);
  }

  /** 重命名图层 */
  async _renameLayer(layerId?: string): Promise<void> {
    const layer = layerId || this.viewer.doc.properties?.currentLayer;
    const newName = await showModal({
      title: '\u91CD\u547D\u540D\u56FE\u5C42',
      message: '\u8F93\u5165\u65B0\u540D\u79F0:',
      input: true,
      inputValue: layer,
      confirmText: '\u786E\u5B9A',
      cancelText: '\u53D6\u6D88',
      width: 280
    });

    if (newName && newName !== layer && this.viewer.doc) {
      for (const e of this.viewer.doc.entities) {
        if (e.layer === layer) e.layer = newName;
      }
      const existing = this.viewer.doc.layers.find((l: any) => l.id === layer);
      if (existing) existing.id = newName;
      if (this.viewer.doc.properties?.currentLayer === layer) {
        this.viewer.doc.properties.currentLayer = newName;
      }
      this.viewer._updateLayerPanel();
      this.viewer.renderer?.render();
      this.viewer._persist();
    }
  }

  /** 修改图层颜色 */
  async _changeLayerColor(layerId?: string): Promise<void> {
    const layerIdStr = layerId || this.viewer.doc?.properties?.currentLayer;
    const layerObj = this.viewer.doc?.layers?.find((l: any) => l.id === layerIdStr);
    const currentColor = layerObj?.color || 7;
    const colorNum = await showModal({
      title: '\u4FEE\u6539\u56FE\u5C42\u989C\u8272',
      message: 'ACI \u989C\u8272\u7F16\u53F7 (1-255):',
      input: true,
      inputValue: String(currentColor),
      confirmText: '\u786E\u5B9A',
      cancelText: '\u53D6\u6D88',
      width: 280
    });

    if (colorNum) {
      const n = parseInt(colorNum as string, 10);
      if (n >= 1 && n <= 255 && this.viewer.doc) {
        const existing = this.viewer.doc.layers.find((l: any) => l.id === layerIdStr);
        if (existing) existing.color = n;
        this.viewer._updateLayerPanel();
        this.viewer.renderer?.render();
        this.viewer._persist();
      }
    }
  }

  /** 移除图层上下文菜单 */
  _removeLayerContextMenu(): void {
    const existing = document.getElementById('layer-context-menu');
    if (existing) existing.remove();
  }
}
