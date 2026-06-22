/**
 * 屏幕固定项：在视口空间中创建/更新固定大小的标记（十字、菱形、圆形）
 */
import paper from 'paper';

export function createScreenFixedItem(kind: string, x: number, y: number, sizePx: number, zoom: number, style: any = {}) {
  const item = makeScreenFixedPath(kind, x, y, sizePx, zoom);
  item.data = item.data || {};
  item.data.screenFixed = { kind, x, y, sizePx, style };
  applyScreenFixedStyle(item, style, zoom);
  return item;
}

export function applyScreenFixedStyle(item: any, style: any, zoom: number) {
  if (item.children && item.children.length > 0) {
    for (const child of item.children) applyScreenFixedStyle(child, style, zoom);
  } else {
    item.strokeColor = style.strokeColor || '#FFFFFF';
    item.strokeWidth = style.strokeWidth || 1.5;
    item.strokeScaling = false;
    if (style.fillColor) item.fillColor = style.fillColor;
    if (style.dashArray) item.dashArray = style.dashArray.map((v: number) => v * zoom);
  }
}

export function makeScreenFixedPath(kind: string, x: number, y: number, sizePx: number, zoom: number) {
  const size = sizePx / Math.max(zoom, 1e-6);
  const h = size / 2;
  if (kind === 'circle') {
    return new paper.Path.Circle({ center: [x, y], radius: h, insert: false });
  }
  if (kind === 'diamond') {
    const path = new paper.Path({ insert: false });
    path.add(new paper.Point(x, y - h));
    path.add(new paper.Point(x + h, y));
    path.add(new paper.Point(x, y + h));
    path.add(new paper.Point(x - h, y));
    path.closed = true;
    return path;
  }
  const group = new paper.Group({ insert: false });
  group.addChild(new paper.Path.Line({ from: [x - h, y], to: [x + h, y], insert: false }));
  group.addChild(new paper.Path.Line({ from: [x, y - h], to: [x, y + h], insert: false }));
  return group;
}

export function updateScreenFixedItem(item: any, zoom: number) {
  const fixed = item.data?.screenFixed;
  if (!fixed) {
    if (item.children) for (const child of item.children) updateScreenFixedItem(child, zoom);
    return;
  }
  let x = fixed.x, y = fixed.y;
  const entity = item.data?.entity;
  if (entity && entity.transform) {
    const t = entity.transform;
    const rx = t[0] * x + t[2] * y + t[4];
    const ry = t[1] * x + t[3] * y + t[5];
    x = rx; y = ry;
  }
  const size = fixed.sizePx / Math.max(zoom, 1e-6);
  const h = size / 2;
  if (fixed.kind === 'circle') {
    item.removeSegments();
    const temp = new paper.Path.Circle({ center: [x, y], radius: h, insert: false });
    for (const seg of temp.segments) item.add(seg.clone());
    temp.remove();
    item.closed = true;
  } else if (fixed.kind === 'diamond') {
    item.removeSegments();
    item.add(new paper.Point(x, y - h));
    item.add(new paper.Point(x + h, y));
    item.add(new paper.Point(x, y + h));
    item.add(new paper.Point(x - h, y));
    item.closed = true;
  } else {
    const s = fixed.style || {};
    while (item.children.length > 0) item.children[0].remove();
    applyScreenFixedStyle(item.addChild(new paper.Path.Line({ from: [x - h, y], to: [x + h, y], insert: false })), s, zoom);
    applyScreenFixedStyle(item.addChild(new paper.Path.Line({ from: [x, y - h], to: [x, y + h], insert: false })), s, zoom);
  }
}
