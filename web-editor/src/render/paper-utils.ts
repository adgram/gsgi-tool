/**
 * paper.js 路径工具：线型虚线数组、样式应用、路径创建
 */
import paper from 'paper';

export function linetypeDashArray(linetype: string | undefined): number[] {
  if (!linetype || linetype === 'ByLayer' || linetype === 'Continuous' || linetype === 'solid') return [];
  if (linetype === 'dashed' || linetype === 'DASHED') return [8, 4];
  if (linetype === 'dotted' || linetype === 'DOTTED') return [2, 4];
  if (linetype === 'dashdot' || linetype === 'DASHDOT') return [8, 3, 2, 3];
  return [];
}

export function applyStyle(
  item: any,
  doc: { resolveColor: (entity: any) => string },
  entity: { lineweight?: number; linetype?: string; [key: string]: any },
  opts: Record<string, any> = {}
): any {
  item.strokeColor = opts.strokeColor || doc.resolveColor(entity);
  item.dashArray = opts.dashArray || linetypeDashArray(entity.linetype);
  if (opts.fillColor) item.fillColor = opts.fillColor;
  if (opts.strokeWidth !== undefined) {
    item.strokeWidth = opts.strokeWidth;
    item.strokeScaling = false;
  } else if (entity.lineweight && entity.lineweight > 0) {
    item.strokeWidth = entity.lineweight;
    item.strokeScaling = true;
  } else {
    item.strokeWidth = 1;
    item.strokeScaling = false;
  }
  return item;
}

export function makePath(
  parent: any,
  segments: number[][],
  closed: boolean,
  doc: { resolveColor: (entity: any) => string },
  entity: { lineweight?: number; [key: string]: any },
  opts: Record<string, any> = {}
): any {
  const path = new paper.Path({ segments, closed, insert: false });
  applyStyle(path, doc, entity, opts);
  parent.addChild(path);
  return path;
}
