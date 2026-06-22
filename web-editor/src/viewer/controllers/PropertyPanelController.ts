/**
 * 属性面板控制器
 * 管理实体属性面板的渲染、属性编辑事件处理与撤销。
 * 合并了 ViewerMethods.ts 中 _showProperties / _buildPropertyTree / _renderEditableProperties /
 * _showMultiSelectionSummary 等逻辑，以及已删除的 PropertyManager.ts 的全部功能。
 * 通过 Viewer._propertyPanelController 访问。
 */
import { Viewer } from '../Viewer';
import { Entity } from '../../core/entity';
import { escapeHTML, cloneDocumentData, createUndoCommand } from '../util/clipboard';

export class PropertyPanelController {
  private viewer: Viewer;
  private _currentPropsEntity: Entity | null = null;

  /** 构造函数：保存 Viewer 引用并初始化事件。 */
  constructor(viewer: Viewer) {
    this.viewer = viewer;
    this._initEvents();
  }

  /** 初始化属性面板的变更事件监听。 */
  private _initEvents(): void {
    const container = document.getElementById('info-panel-content');
    if (!container) return;
    container.addEventListener('change', (e: Event) => {
      const el = e.target as HTMLElement;
      const key = el.dataset.propKey;
      const eid = el.dataset.entityId;
      if (!key || !eid || !this.viewer.doc) return;
      this._handlePropertyChange(eid, key, el);
    });
  }

  /** 处理属性值变更，执行撤销/重做并刷新面板。 */
  private _handlePropertyChange(entityId: string, key: string, el: HTMLElement): void {
    const entity = this.viewer.doc!.getEntityById(entityId);
    if (!entity) return;

    let value: string | number | boolean = (el as HTMLInputElement).value;
    if ((el as HTMLInputElement).type === 'number') value = parseFloat(value);
    else if (el.tagName === 'SELECT') {
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
    }

    if (typeof entity.setProperty !== 'function') return;
    const before = cloneDocumentData(this.viewer.doc!);
    entity.setProperty(key, value, this.viewer.renderer?.resolver);
    this.viewer.renderer?.render();
    const after = cloneDocumentData(this.viewer.doc!);
    if (this.viewer._undoManager && JSON.stringify(before) !== JSON.stringify(after)) {
      this.viewer._undoManager.push(createUndoCommand(entityId, before, after, this.viewer));
    }

    this.viewer._persist();
    this.viewer._updateLayerPanel();
    this.viewer.view.update();

    const refreshEntity = this._currentPropsEntity && this.viewer.doc!.getEntityById(this._currentPropsEntity.id)
      ? this.viewer.doc!.getEntityById(this._currentPropsEntity.id)
      : this.viewer.doc!.getEntityById(entityId);
    if (refreshEntity) this.showProperties(refreshEntity);
  }

  /** 显示单个实体的属性树。 */
  showProperties(entity: Entity | null): void {
    if (!entity) {
      this.viewer._switchToLayerView();
      return;
    }
    this._currentPropsEntity = entity;
    const container = document.getElementById('info-panel-content');
    const title = document.getElementById('info-panel-title');
    const btnNew = document.getElementById('btn-new-layer');
    const btnBack = document.getElementById('btn-back-layers');
    const count = document.getElementById('layer-count');
    if (title) title.textContent = `属性 - ${entity.id}`;
    if (btnNew) btnNew.style.display = 'none';
    if (btnBack) btnBack.style.display = '';
    if (count) count.style.display = 'none';
    if (!container) return;
    const visited = new Set<string>();
    container.innerHTML = this.buildPropertyTree(entity, visited, 0);
  }

  /** 显示多选实体的摘要列表，支持点击跳转。 */
  showMultiSelectionSummary(ids: Set<string>): void {
    const container = document.getElementById('info-panel-content');
    const title = document.getElementById('info-panel-title');
    const btnNew = document.getElementById('btn-new-layer');
    const btnBack = document.getElementById('btn-back-layers');
    const count = document.getElementById('layer-count');
    if (title) title.textContent = `已选 ${ids.size} 个实体`;
    if (btnNew) btnNew.style.display = 'none';
    if (btnBack) btnBack.style.display = '';
    if (count) count.style.display = 'none';
    if (!container || !this.viewer.doc) return;
    this._currentPropsEntity = null;

    const groups: Record<string, Entity[]> = {};
    for (const id of ids) {
      const ent: Entity | null = this.viewer.doc.getEntityById(id);
      if (!ent) continue;
      const t = ent.type || 'unknown';
      if (!groups[t]) groups[t] = [];
      groups[t].push(ent);
    }

    const typeOrder = ['point', 'line', 'circle', 'arc', 'polyline', 'polyarc', 'polycurve', 'spline_fit', 'spline_cv', 'text', 'dimension', 'block_ref', 'region_anno', 'coord_sys', 'custom_entity'];
    const sorted = Object.entries(groups).sort((a, b) => {
      const ia = typeOrder.indexOf(a[0]), ib = typeOrder.indexOf(b[0]);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    let html = `<div style="padding:6px 8px;color:#aaa;font-size:11px;border-bottom:1px solid #333;">共 ${ids.size} 个实体</div>`;
    for (const [type, entities] of sorted) {
      html += `<div style="padding:4px 8px;font-size:11px;color:#888;background:#2a2a2a;border-bottom:1px solid #333;font-weight:600;">${type} (${entities.length})</div>`;
      for (const ent of entities) {
        const desc = ent.description ? ` — ${ent.description}` : '';
        html += `<div class="sel-entity-row" data-id="${ent.id}" style="padding:3px 8px 3px 16px;font-size:11px;color:#ccc;cursor:pointer;display:flex;align-items:center;gap:6px;border-bottom:1px solid #2a2a2a;">`;
        html += `<span style="color:#888;">${ent.id}</span><span style="color:#666;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${desc}</span>`;
        html += '</div>';
      }
    }

    container.innerHTML = html;

    container.querySelectorAll('.sel-entity-row').forEach(el => {
      el.addEventListener('mouseenter', () => (el as HTMLElement).style.background = '#333');
      el.addEventListener('mouseleave', () => (el as HTMLElement).style.background = '');
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const eid = (el as HTMLElement).dataset.id;
        if (eid) {
          const entity = this.viewer.doc!.getEntityById(eid);
          if (entity) {
            this.viewer.deselectAll();
            this.viewer.selectEntity(eid);
          }
        }
      });
    });
  }

  /** 递归构建属性树的 HTML 字符串。 */
  buildPropertyTree(entity: Entity, visited: Set<string>, depth: number): string {
    if (visited.has(entity.id)) return '';
    visited.add(entity.id);
    const indent = depth * 16;
    const bg = depth === 0 ? '#2d2d2d' : (depth % 2 === 1 ? '#2a2a2a' : '#252526');
    const isTop = depth === 0;
    const contentId = `pc_${entity.id}_${depth}_${Math.random().toString(36).slice(2,6)}`;
    let html = `<div style="margin-left:${indent}px;background:${bg};border-radius:${isTop?'4px 4px 0 0':'2px'};padding:4px 6px;${depth>0?'margin-top:2px;border:1px solid #333;':''}">`;
    html += `<div style="font-weight:${isTop?'700':'600'};font-size:12px;color:#d4d4d4;display:flex;align-items:center;gap:4px;">`;
    if (!isTop) html += '<span style="color:#666;font-weight:400;">↳</span> ';
    html += `${entity.type} · ${escapeHTML(entity.id)}`;
    if (!isTop) {
      html += ` <span style="font-weight:400;font-size:10px;color:#666;cursor:pointer;" onclick="var c=document.getElementById('${contentId}');if(c){c.style.display=c.style.display==='none'?'':'none';this.textContent=this.textContent==='−'?'+':'−';}">−</span>`;
    }
    html += '</div>';
    html += `<div id="${contentId}">`;
    if (typeof entity.getProperties === 'function') {
      html += this.renderEditableProperties(entity);
    } else {
      const obj = entity.toJSON();
      html += '<table class="prop-table">';
      for (const [key, val] of Object.entries(obj)) {
        if (key === 'id') continue;
        const display = typeof val === 'object' ? JSON.stringify(val) : String(val);
        if (!display || display === '{}' || display === '[]') continue;
        html += `<tr><td class="prop-label-cell" style="padding:1px 4px;">${escapeHTML(key)}</td><td style="padding:1px 4px;word-break:break-all;color:#d4d4d4;">${escapeHTML(display)}</td></tr>`;
      }
      html += '</table>';
    }

    const obj = entity.toJSON();
    const refKeys = Object.keys(obj).filter(k => k.endsWith('_ref') || k.endsWith('_refs') || k === 'ref_pt' || k === 'ref_a' || k === 'ref_b');
    for (const key of refKeys) {
      const val = obj[key];
      if (Array.isArray(val)) {
        for (const refId of val) {
          if (typeof refId === 'string' && this.viewer.doc) {
            const refEntity = this.viewer.doc.getEntityById(refId);
            if (refEntity) html += this.buildPropertyTree(refEntity, visited, depth + 1);
          }
        }
      } else if (typeof val === 'string' && this.viewer.doc) {
        const refEntity = this.viewer.doc.getEntityById(val);
        if (refEntity) html += this.buildPropertyTree(refEntity, visited, depth + 1);
      }
    }
    html += '</div></div>';
    return html;
  }

  /** 渲染实体的可编辑属性表单 HTML。 */
  renderEditableProperties(entity: Entity): string {
    const props = entity.getProperties();
    if (!props || props.length === 0) return '';
    let html = '<table class="prop-table">';
    for (const prop of props) {
      const key = prop.key;
      const label = prop.label || prop.key;
      const value = prop.value !== undefined && prop.value !== null ? prop.value : '';
      const eid = entity.id;
      html += `<tr><td class="prop-label-cell">${label}</td><td class="prop-value-cell">`;
      if (prop.type === 'layer') {
        html += `<select class="prop-select" data-prop-key="${key}" data-entity-id="${eid}">`;
        if (this.viewer.doc && this.viewer.doc.layers) {
          for (const layer of this.viewer.doc.layers) {
            html += `<option value="${layer.id}"${layer.id === value ? ' selected' : ''}>${layer.id}</option>`;
          }
        }
        html += '</select>';
      } else if (prop.type === 'color') {
        const colorVal = value !== null && value !== '' ? value : '7';
        html += `<select class="prop-select" data-prop-key="${key}" data-entity-id="${eid}">`;
        const ACI_COLORS = [
          { n: 1, name: '红', hex: '#FF0000' }, { n: 2, name: '黄', hex: '#FFFF00' },
          { n: 3, name: '绿', hex: '#00FF00' }, { n: 4, name: '青', hex: '#00FFFF' },
          { n: 5, name: '蓝', hex: '#0000FF' }, { n: 6, name: '紫', hex: '#FF00FF' },
          { n: 7, name: '白/黑', hex: '#FFFFFF' }, { n: 8, name: '灰', hex: '#808080' },
          { n: 9, name: '亮灰', hex: '#C0C0C0' },
        ];
        for (const c of ACI_COLORS) {
          html += `<option value="${c.n}"${String(c.n) === String(colorVal) ? ' selected' : ''} style="background:${c.hex};">${c.n} (${c.name})</option>`;
        }
        html += '<option value="ByLayer"' + (colorVal === 'ByLayer' ? ' selected' : '') + '>ByLayer</option>';
        html += '</select>';
      } else if (prop.type === 'linetype') {
        html += `<select class="prop-select" data-prop-key="${key}" data-entity-id="${eid}">`;
        for (const lt of ['ByLayer', 'Continuous', 'DASHED', 'DOTTED', 'DASHDOT']) {
          html += `<option value="${lt}"${lt === value ? ' selected' : ''}>${lt}</option>`;
        }
        html += '</select>';
      } else if (prop.type === 'boolean') {
        html += `<select class="prop-select" data-prop-key="${key}" data-entity-id="${eid}">`;
        html += `<option value="true"${value === true ? ' selected' : ''}>是</option>`;
        html += `<option value="false"${value === false ? ' selected' : ''}>否</option>`;
        html += '</select>';
      } else if (prop.type === 'number') {
        html += `<input class="prop-input" type="number" step="any" data-prop-key="${key}" data-entity-id="${eid}" value="${value}">`;
      } else {
        html += `<input class="prop-input" type="text" data-prop-key="${key}" data-entity-id="${eid}" value="${escapeHTML(String(value))}">`;
      }
      html += '</td></tr>';
    }
    html += '</table>';
    return html;
  }

  /** 获取当前正在显示属性的实体。 */
  get currentEntity(): Entity | null {
    return this._currentPropsEntity;
  }
}
