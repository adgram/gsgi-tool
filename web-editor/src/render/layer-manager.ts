/**
 * 图层管理：在 paper.js 中创建/维护与文档图层对应的 Layer 组
 */
import paper from 'paper';

const WORLD_LAYER_MATRIX = new paper.Matrix(1, 0, 0, -1, 0, 0);

export function setWorldLayer(layer: paper.Layer) {
  layer.applyMatrix = false;
  layer.matrix = WORLD_LAYER_MATRIX.clone();
  layer.data = { ...(layer.data || {}), worldLayer: true };
}

export function buildLayerGroups(project: paper.Project, doc: any, layerGroups: Map<string, paper.Layer>) {
  setWorldLayer(project.activeLayer);
  layerGroups.set('0', project.activeLayer);
  for (const layer of doc.layers) {
    if (layer.id === '0') {
      project.activeLayer.visible = layer.visible !== false;
      continue;
    }
    const lg = new paper.Layer();
    setWorldLayer(lg);
    lg.name = 'layer_' + layer.id;
    lg.visible = layer.visible !== false;
    lg.data = { ...(lg.data || {}), layerId: layer.id };
    layerGroups.set(layer.id, lg);
  }
  layerGroups.get('0')?.activate();
}

export function getTargetLayer(entity: any, layerGroups: Map<string, paper.Layer>, project: paper.Project) {
  const lid = entity.layer || '0';
  return layerGroups.get(lid) || project.activeLayer;
}
