/**
 * 图层控制器
 * 管理图层面板的创建、更新、图层属性编辑（名称/颜色/线型/冻结/锁定/可见/打印）。
 * 合并了 ViewerMethods.ts 中 _switchToLayerView / _updateLayerPanel / _addLayerItem / _editLayerProp 等逻辑。
 * 通过 Viewer._layerController 访问。
 */
import { Viewer } from '../Viewer';
import { escapeHTML } from '../util/clipboard';
import { showModal } from '../util/ui';

export class LayerController {
  private viewer: Viewer;

  /**
   * 构造函数
   */
  constructor(viewer: Viewer) {
    this.viewer = viewer;
    this._setupActions();
  }

  /**
   * 设置新建/返回按钮事件
   */
  private _setupActions(): void {
    const btnNew = document.getElementById('btn-new-layer');
    const btnBack = document.getElementById('btn-back-layers');
    if (btnNew) {
      btnNew.addEventListener('click', async () => {
        if (!this.viewer.doc) return;
        const name = await showModal({ title: '新建图层', message: '输入新图层名称:', input: true, confirmText: '创建', cancelText: '取消', width: 280 });
        if (!name) return;
        const layerName = name as string;
        if ((this.viewer.doc.layers || []).find((l: { id: string }) => l.id === layerName)) { this.viewer._setPrompt(`图层 ${layerName} 已存在`); return; }
        this.viewer.doc.layers = this.viewer.doc.layers || [];
        this.viewer.doc.layers.push({ id: layerName, color: 7, frozen: false, locked: false, linetype: 'Continuous', visible: true, printable: true, description: '' });
        this.switchToLayerView();
        this.viewer._persist();
      });
    }
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        this.viewer.deselectAll();
        this.switchToLayerView();
      });
    }
  }

  /**
   * 切换到图层视图
   */
  switchToLayerView(): void {
    const title = document.getElementById('info-panel-title');
    const btnNew = document.getElementById('btn-new-layer');
    const btnBack = document.getElementById('btn-back-layers');
    const count = document.getElementById('layer-count');
    if (title) title.textContent = '图层';
    if (btnNew) btnNew.style.display = '';
    if (btnBack) btnBack.style.display = 'none';
    if (count) count.style.display = '';
    this.updateLayerPanel();
  }

  /**
   * 更新图层面板
   */
  updateLayerPanel(): void {
    const container = document.getElementById('info-panel-content');
    if (!container) return;
    const title = document.getElementById('info-panel-title');
    if (title && title.textContent !== '图层') return;
    const documentLayerIds = new Set((this.viewer.doc?.layers || []).map((l: { id: string }) => l.id));
    const layerCounts = new Map<string, number>();
    const usedLayers = new Set<string>(['0']);
    if (this.viewer.doc) {
      for (const e of this.viewer.doc.entities) {
        if (!e) continue;
        const layerId = e.layer || '0';
        layerCounts.set(layerId, (layerCounts.get(layerId) || 0) + 1);
        if (!documentLayerIds.has(layerId)) usedLayers.add(layerId);
      }
    }
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (const l of (this.viewer.doc?.layers || [])) {
      this._addLayerItem(fragment, l, l.id === '0', layerCounts.get(l.id) || 0);
    }
    for (const lid of usedLayers) {
      if (lid !== '0' && !documentLayerIds.has(lid)) {
        this._addLayerItem(fragment, { id: lid, color: 7 }, false, layerCounts.get(lid) || 0);
      }
    }
    container.appendChild(fragment);
    const countEl = document.getElementById('layer-count');
    if (countEl) countEl.textContent = String(container.children.length);
  }

  /**
   * 添加图层面板项
   */
  private _addLayerItem(list: HTMLElement | DocumentFragment, layer: { id: string; [key: string]: unknown }, isDefault: boolean, entityCount: number): void {
    const div = document.createElement('div');
    div.className = 'layer-item';
    div.dataset.layerId = layer.id;

    const colorBox = document.createElement('div');
    colorBox.className = 'layer-color';
    colorBox.style.background = this.viewer.doc ? this.viewer.doc.resolveColorValue((layer.color as number) || 7) : '#FFFFFF';

    const makeToggleIcon = (field: string, activeIcon: string, inactiveIcon: string): HTMLElement => {
      const el = document.createElement('span');
      el.className = 'layer-icon';
      el.textContent = layer[field] ? activeIcon : inactiveIcon;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        layer[field] = !layer[field];
        el.textContent = layer[field] ? activeIcon : inactiveIcon;
        this.viewer.renderer?.render();
        this.viewer._persist();
      });
      return el;
    };

    const frozenIcon = makeToggleIcon('frozen', '❄', '☐');
    const lockedIcon = makeToggleIcon('locked', '🔒', '○');

    const nameEl = document.createElement('span');
    nameEl.className = 'layer-name';
    nameEl.textContent = isDefault ? '0 (默认)' : (layer.id as string);

    const linetypeEl = document.createElement('span');
    linetypeEl.className = 'layer-linetype';
    linetypeEl.textContent = (layer.linetype as string) || 'Continuous';

    const visibleIcon = document.createElement('span');
    visibleIcon.className = 'layer-icon';
    visibleIcon.textContent = layer.visible !== false ? '👁' : '🚫';
    visibleIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      visibleIcon.textContent = layer.visible ? '👁' : '🚫';
      this.viewer.renderer?.render();
      this.viewer._persist();
    });

    const printIcon = document.createElement('span');
    printIcon.className = 'layer-icon';
    printIcon.textContent = layer.printable ? '🖨' : '🚫';
    printIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      layer.printable = !layer.printable;
      printIcon.textContent = layer.printable ? '🖨' : '🚫';
      this.viewer._persist();
    });

    const countEl = document.createElement('span');
    countEl.className = 'layer-count';
    countEl.textContent = String(entityCount);

    const curr = this.viewer.doc?.properties?.currentLayer;
    if (curr === layer.id) div.classList.add('is-current');

    div.appendChild(colorBox);
    div.appendChild(frozenIcon);
    div.appendChild(lockedIcon);
    div.appendChild(nameEl);
    div.appendChild(linetypeEl);
    div.appendChild(visibleIcon);
    div.appendChild(printIcon);
    div.appendChild(countEl);

    const self = this;
    div.addEventListener('dblclick', function(this: HTMLElement, e: MouseEvent) {
      e.preventDefault();
      self._editLayerProp(layer, isDefault);
    });

    list.appendChild(div);
  }

  /**
   * 编辑图层属性（弹窗）
   */
  private _editLayerProp(layer: { id: string; [key: string]: unknown }, isDefault: boolean): void {
    const existing = document.getElementById('gsgi-modal-overlay');
    if (existing) existing.remove();

    const ACI_COLORS = [
      { n: 1, name: '红', hex: '#FF0000' },
      { n: 2, name: '黄', hex: '#FFFF00' },
      { n: 3, name: '绿', hex: '#00FF00' },
      { n: 4, name: '青', hex: '#00FFFF' },
      { n: 5, name: '蓝', hex: '#0000FF' },
      { n: 6, name: '紫', hex: '#FF00FF' },
      { n: 7, name: '白/黑', hex: '#FFFFFF' },
      { n: 8, name: '灰', hex: '#808080' },
      { n: 9, name: '亮灰', hex: '#C0C0C0' },
    ];
    const linetypes = ['Continuous', 'ByLayer', 'DASHED', 'DOTTED', 'DASHDOT'];
    let colorVal = layer.color;
    if (colorVal === undefined || colorVal === null) colorVal = 7;

    const html = `
      <style>
        .layer-edit-form { font-size: 12px; }
        .layer-edit-form .field { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
        .layer-edit-form .field label { width:60px; flex-shrink:0; color:#aaa; }
        .layer-edit-form .field input[type="text"],
        .layer-edit-form .field select {
          flex:1; padding:4px 6px; background:#3c3c3c; color:#d4d4d4;
          border:1px solid #555; border-radius:3px; font-size:12px; outline:none;
        }
        .layer-edit-form .field input[type="checkbox"] { width:16px; height:16px; accent-color:#4ec9b0; cursor:pointer; }
        .layer-edit-form .field input:focus, .layer-edit-form .field select:focus { border-color:#4ec9b0; }
      </style>
      <div class="layer-edit-form">
        <div class="field"><label>名称</label><input type="text" id="le-name" value="${escapeHTML(layer.id as string)}" ${isDefault ? 'readonly style="flex:1;padding:4px 6px;background:#2a2a2a;color:#888;border:1px solid #555;border-radius:3px;font-size:12px;"' : ''}></div>
        <div class="field"><label>说明</label><input type="text" id="le-description" value="${escapeHTML((layer.description as string) || '')}" placeholder="图层用途说明" style="flex:1;padding:4px 6px;background:#3c3c3c;color:#d4d4d4;border:1px solid #555;border-radius:3px;font-size:12px;outline:none;"></div>
        <div class="field"><label>颜色</label><select id="le-color">
          ${ACI_COLORS.map(c => `<option value="${c.n}" style="background:${c.hex};" ${String(c.n) === String(colorVal) ? 'selected' : ''}>${c.n} (${c.name})</option>`).join('')}
        </select></div>
        <div class="field"><label>线型</label><select id="le-linetype">
          ${linetypes.map(lt => `<option value="${lt}" ${lt === (layer.linetype || 'Continuous') ? 'selected' : ''}>${lt}</option>`).join('')}
        </select></div>
        <div class="field"><label>冻结</label><input type="checkbox" id="le-frozen" ${layer.frozen ? 'checked' : ''}></div>
        <div class="field"><label>锁定</label><input type="checkbox" id="le-locked" ${layer.locked ? 'checked' : ''}></div>
        <div class="field"><label>可见</label><input type="checkbox" id="le-visible" ${layer.visible !== false ? 'checked' : ''} ${isDefault ? 'disabled style="accent-color:#4ec9b0;cursor:default;"' : ''}></div>
        <div class="field"><label>可打印</label><input type="checkbox" id="le-printable" ${layer.printable !== false ? 'checked' : ''}></div>
      </div>`;

    const overlay = document.createElement('div');
    overlay.id = 'gsgi-modal-overlay';

    const box = document.createElement('div');
    box.className = 'gsgi-modal-box';

    const title = document.createElement('div');
    title.className = 'gsgi-modal-title';
    title.textContent = '图层属性';
    box.appendChild(title);

    const content = document.createElement('div');
    content.innerHTML = html;
    box.appendChild(content);

    const btnRow = document.createElement('div');
    btnRow.className = 'gsgi-modal-buttons';

    const cb = document.createElement('button');
    cb.className = 'gsgi-modal-btn-cancel';
    cb.textContent = '取消';
    cb.addEventListener('click', () => overlay.remove());

    const ok = document.createElement('button');
    ok.className = 'gsgi-modal-btn-confirm';
    ok.textContent = '确定';
    ok.addEventListener('click', () => {
      const nameEl = document.getElementById('le-name') as HTMLInputElement;
      if (!nameEl) return;
      const newName = nameEl.value.trim();
      if (!newName) return;

      if (newName !== layer.id && this.viewer.doc?.layers?.find((l: { id: string }) => l.id === newName)) {
        this.viewer._setPrompt(`图层 ${newName} 已存在`);
        return;
      }

      const oldName = layer.id;
      const description = (document.getElementById('le-description') as HTMLInputElement).value.trim();
      const color = parseInt((document.getElementById('le-color') as HTMLSelectElement).value, 10);
      const linetype = (document.getElementById('le-linetype') as HTMLSelectElement).value;
      const frozen = (document.getElementById('le-frozen') as HTMLInputElement).checked;
      const locked = (document.getElementById('le-locked') as HTMLInputElement).checked;
      const visible = (document.getElementById('le-visible') as HTMLInputElement).checked;
      const printable = (document.getElementById('le-printable') as HTMLInputElement).checked;

      if (!this.viewer.doc) return;

      if (newName !== oldName) {
        for (const e of this.viewer.doc.entities) {
          if (e.layer === oldName) e.layer = newName;
        }
        const existing = this.viewer.doc.layers.find((l: { id: string }) => l.id === oldName);
        if (existing) existing.id = newName;
      }

      const existing = this.viewer.doc.layers.find((l: { id: string }) => l.id === newName);
      if (existing) {
        existing.color = color;
        existing.linetype = linetype;
        existing.frozen = frozen;
        existing.locked = locked;
        existing.visible = visible;
        existing.printable = printable;
        existing.description = description || '';
      }

      if (this.viewer.doc.properties?.currentLayer === oldName && newName !== oldName) {
        this.viewer.doc.properties.currentLayer = newName;
      }

      this.updateLayerPanel();
      this.viewer.renderer?.render();
      this.viewer._persist();
      overlay.remove();
    });

    btnRow.appendChild(cb);
    btnRow.appendChild(ok);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    setTimeout(() => {
      const nameEl = document.getElementById('le-name') as HTMLInputElement;
      if (nameEl && !isDefault) nameEl.focus();
    }, 50);

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', keyHandler);
      }
    };
    document.addEventListener('keydown', keyHandler);
  }
}
