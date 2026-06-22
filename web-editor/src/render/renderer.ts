/**
 * 渲染器：管理 paper.js Project 中所有实体的绘制、图层面板和屏幕固定项
 */
import paper from 'paper';
import { Resolver } from '../core/resolver';
import { buildLayerGroups, setWorldLayer, getTargetLayer } from './layer-manager';
import { createScreenFixedItem, updateScreenFixedItem } from './screen-fixed';
import { applyStyle, linetypeDashArray } from './paper-utils';
import { registerDispatchers } from './render-visitor';
import { GSGIDocument } from '../core/document';

const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const POINT_SIZE_PX = 12;
const PARAM_POINT_SIZE_PX = 8;
const CONSTRUCTION_POINT_SIZE_PX = 12;

export class Renderer {
  project: paper.Project;
  doc: GSGIDocument;
  resolver: Resolver;
  itemMap: Map<string, any>;
  entityItems: Map<string, any[]>;
  layerGroups: Map<string, paper.Layer>;
  hitItems: any[];
  referencedPointIds: Set<string>;
  _dispatchers: Record<string, any>;
  _frozenSet: Set<string> | null;

  constructor(project: paper.Project, doc: GSGIDocument) {
    this.project = project;
    this.doc = doc;
    this.resolver = new Resolver(doc);
    this.itemMap = new Map();
    this.entityItems = new Map();
    this.layerGroups = new Map();
    this.hitItems = [];
    this.referencedPointIds = new Set();
    this._dispatchers = {};
    registerDispatchers(this);
    this._frozenSet = null;
  }

  clear() {
    const layers = [...this.project.layers];
    const baseLayer = layers.find((l: any) => l.name !== '__grid__') || layers[0] || new paper.Layer();
    for (const layer of layers) {
      if ((layer as any).name === '__grid__') continue;
      layer.removeChildren();
    }
    for (const layer of layers) {
      if ((layer as any).name === '__grid__' || layer === baseLayer) continue;
      layer.remove();
    }
    baseLayer.activate();
    this.itemMap.clear();
    this.entityItems.clear();
    this.layerGroups.clear();
    this.hitItems = [];
    this.referencedPointIds.clear();
    this._frozenSet = null;
  }

  render() {
    this.clear();
    this._collectReferencedPoints();
    buildLayerGroups(this.project, this.doc, this.layerGroups);
    for (const entity of this.doc.entities) {
      this._renderEntity(entity);
    }
    this.project.view.update();
    return this.itemMap;
  }

  renderBlock(blockDef: any, insertX: number, insertY: number, rotation: number, sx: number, sy: number) {
    const group = new paper.Group();
    group.pivot = new paper.Point(0, 0);
    group.position = new paper.Point(insertX, insertY);
    group.rotation = (rotation || 0) * RAD_TO_DEG;
    group.scaling = new paper.Point(sx, sy);

    const savedEntities = this.doc.entities;
    this.doc.entities = blockDef.entities;
    this.resolver._buildCache();

    for (const entity of blockDef.entities) {
      const items = this._renderEntityToParent(entity, group);
      if (items) {
        for (const item of items) {
          group.addChild(item);
        }
      }
    }

    this.doc.entities = savedEntities;
    this.resolver._buildCache();
    return group;
  }

  _collectReferencedPoints() {
    const add = (value: any) => {
      if (typeof value === 'string') this.referencedPointIds.add(value);
      else if (Array.isArray(value)) value.forEach(add);
    };

    const visitEntity = (entity: any) => {
      for (const [key, value] of Object.entries(entity)) {
        if (key === 'id' || key === 'type') continue;
        if (key.endsWith('_ref') || key.endsWith('_refs') || key === 'ref_pt') add(value);
      }
      if (entity.type === 'polycurve' && Array.isArray(entity.segments)) {
        for (const segment of entity.segments) {
          add(segment.start_ref);
          add(segment.end_ref);
          add(segment.center_ref);
        }
      }
    };

    for (const entity of this.doc.entities) visitEntity(entity);
    for (const block of this.doc.blocks) {
      for (const entity of block.entities) visitEntity(entity);
    }
  }

  _isConstructionPoint(entity: any) {
    if (entity.type !== 'point') return false;
    return entity.point_role === 'construction' || entity.point_role === 'helper' ||
      entity.construction === true || (this.referencedPointIds.has(entity.id) && !entity._explicitVisible);
  }

  _isHiddenConstructionPoint(entity: any) {
    return this._isConstructionPoint(entity) && !entity._explicitVisible;
  }

  _buildFrozenSet() {
    if (this._frozenSet) return;
    this._frozenSet = new Set();
    const frozenLayers = new Set(
      this.doc.layers.filter((l: any) => l.frozen).map((l: any) => l.id)
    );
    if (frozenLayers.size === 0) return;
    const docLayerIds = new Set(this.doc.layers.map((l: any) => l.id));
    const usedLayers = new Set();
    for (const e of this.doc.entities) {
      const lid = e.layer || '0';
      if (!docLayerIds.has(lid)) usedLayers.add(lid);
    }
    const frozenIds = new Set<string>();
    for (const e of this.doc.entities) {
      const lid = e.layer || '0';
      if (frozenLayers.has(lid) || (usedLayers.has(lid) && frozenLayers.size === this.doc.layers.length)) {
        frozenIds.add(e.id);
      }
    }
    for (const e of this.doc.entities) {
      if (frozenIds.has(e.id)) continue;
      for (const [key, value] of Object.entries(e)) {
        if (key === 'id' || key === 'type') continue;
        if ((key.endsWith('_ref') || key.endsWith('_refs') || key === 'ref_pt') && typeof value === 'string' && frozenIds.has(value)) {
          frozenIds.add(e.id);
          break;
        }
      }
      if (e.type === 'polycurve' && Array.isArray(e.segments)) {
        for (const seg of e.segments) {
          for (const refKey of ['start_ref', 'end_ref', 'center_ref']) {
            if (typeof seg[refKey] === 'string' && frozenIds.has(seg[refKey])) {
              frozenIds.add(e.id);
              break;
            }
          }
          if (frozenIds.has(e.id)) break;
        }
      }
    }
    this._frozenSet = frozenIds;
  }

  _renderEntity(entity: any) {
    this._buildFrozenSet();
    if (this._frozenSet!.has(entity.id)) return;
    const layer = getTargetLayer(entity, this.layerGroups, this.project);
    const items = this._renderEntityToParent(entity, layer);
    if (items) {
      this._registerEntityItems(entity, items);
    }
  }

  _registerEntityItems(entity: any, items: any[]) {
    if (!items || items.length === 0) return;
    this.entityItems.set(entity.id, items);
    this.itemMap.set(entity.id, items[0]);
    for (const item of items) {
      this._ensureMinStroke(item);
      this._stampEntityData(item, entity);
      if (entity.transform) this._applyEntityTransform(item, entity.transform);
      this._keepTextReadable(item);
      this.hitItems.push(item);
      item.visible = entity.visible !== false;
    }
  }

  _keepTextReadable(item: any) {
    if (item instanceof paper.PointText) {
      item.scale(1, -1, item.point);
    }
    if (item.children) {
      for (const child of item.children) this._keepTextReadable(child);
    }
  }

  _applyEntityTransform(item: any, t: number[]) {
    if (item.data?.screenFixed) {
      item.translate(t[4], t[5]);
    } else {
      const cx = item.position ? item.position.x : 0;
      const cy = item.position ? item.position.y : 0;
      const m = new paper.Matrix(t[0], t[1], t[2], t[3], t[4], t[5]) as any;
      const composed = (new paper.Matrix() as any).translate(cx, cy).multiply(m).translate(-cx, -cy);
      item.transform(composed, true);
    }
    if (item.children) {
      for (const child of item.children) this._applyEntityTransform(child, t);
    }
  }

  _stampEntityData(item: any, entity: any) {
    item.data = item.data || {};
    item.data.entityId = entity.id;
    item.data.entityType = entity.type;
    item.data.entity = entity;
    if (item.children) {
      for (const child of item.children) this._stampEntityData(child, entity);
    }
  }

  _ensureMinStroke(item: any) {
    if (item.data?.screenFixed) return;
    const entity = item.data?.entity;
    if (entity && entity.lineweight && entity.lineweight > 0) {
      const zoom = Math.max(this.project.view.zoom, 1e-6);
      const screenPx = entity.lineweight * zoom;
      if (screenPx < 1) {
        item.strokeWidth = 1;
        item.strokeScaling = false;
      } else {
        item.strokeWidth = entity.lineweight;
        item.strokeScaling = true;
      }
    }
    if (item.children) {
      for (const child of item.children) {
        this._ensureMinStroke(child);
      }
    }
  }

  _renderEntityToParent(entity: any, parent: any): any[] | null {
    try {
      const fn = this._dispatchers[entity.type];
      if (fn) return fn.call(this, entity, parent);
      return null;
    } catch (e) {
      console.warn(`[renderer] _renderEntityToParent(${entity?.id},${entity?.type}) failed:`, e);
      return null;
    }
  }

  _resolveOrNull(id: string) {
    const e = this.resolver.get(id);
    return e ? e : null;
  }

  _color(entity: any, fallback = '#FFFFFF'): string {
    return this.doc.resolveColor(entity) || fallback;
  }

  _setStyle(item: any, entity: any, opts: any = {}) {
    const zoom = Math.max(this.project.view.zoom, 1e-6);
    item.strokeColor = opts.strokeColor || this._color(entity);
    if (opts.strokeWidth !== undefined) {
      item.strokeWidth = opts.strokeWidth;
      item.strokeScaling = false;
    } else if (entity.lineweight && entity.lineweight > 0) {
      const screenPx = entity.lineweight * zoom;
      if (screenPx < 1) {
        item.strokeWidth = 1;
        item.strokeScaling = false;
      } else {
        item.strokeWidth = entity.lineweight;
        item.strokeScaling = true;
      }
    } else {
      item.strokeWidth = 1;
      item.strokeScaling = false;
    }
    item.dashArray = opts.dashArray || linetypeDashArray(entity.linetype);
    if (opts.fillColor) item.fillColor = opts.fillColor;
    if (opts.fontSize) item.fontSize = opts.fontSize * (entity.scale || 1);
    if (opts.justification) item.justification = opts.justification;
    return item;
  }

  updateStrokeWidths() {
    const zoom = Math.max(this.project.view.zoom, 1e-6);
    for (const items of this.entityItems.values()) {
      for (const item of items) this._updateItemStrokeWidth(item, zoom);
    }
  }

  _updateItemStrokeWidth(item: any, zoom: number) {
    if (item.data?.screenFixed) return;
    const entity = item.data?.entity;
    if (entity && entity.lineweight && entity.lineweight > 0) {
      const screenPx = entity.lineweight * zoom;
      if (screenPx < 1) {
        item.strokeWidth = 1;
        item.strokeScaling = false;
      } else {
        item.strokeWidth = entity.lineweight;
        item.strokeScaling = true;
      }
    }
    if (item.children) {
      for (const child of item.children) this._updateItemStrokeWidth(child, zoom);
    }
  }

  updateScreenFixedItems() {
    for (const items of this.entityItems.values()) {
      for (const item of items) updateScreenFixedItem(item, this.project.view.zoom);
    }
  }

  _getTargetLayer(entity: any) {
    return getTargetLayer(entity, this.layerGroups, this.project);
  }

  _createScreenFixedItem(kind: string, x: number, y: number, sizePx: number, style: any = {}) {
    return createScreenFixedItem(kind, x, y, sizePx, this.project.view.zoom, style);
  }
}
