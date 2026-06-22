/**
 * 实体绘制处理器策略模式
 * 每个工具对应一个独立的 handler 函数，替代实体类上的 static handleDrawClick
 */
import { Point2d } from '../../core/geometry';
import { createEntity, nextId } from '../../core/barrel';

export type EntityDrawHandler = (viewer: any, pt: any, rawPt?: any) => void;

/** 多点工具通用单击处理器：收集点击点，回车提交创建多段线/多弧/样条等 */
function multiToolPrompt(viewer: any): string {
  if (viewer._drawTool === 'polyarc') return '点击添加更多点，回车完成，按A键添加圆弧上点，或按C键闭合';
  return '点击添加更多点，回车完成，或按C键闭合';
}

function multiPointClickHandler(viewer: any, pt: any): void {
  if (viewer._drawStep === 0) {
    viewer._drawData.points = [{ x: pt.x, y: pt.y }];
    viewer._drawStep = 1;
    viewer._setPrompt(multiToolPrompt(viewer));
    viewer._clearPreview();
    viewer._drawToolController.addPreviewPoint(pt.x, pt.y);
  } else if (viewer._drawStep === 2) {
    viewer._drawData._arcMid = { x: pt.x, y: pt.y };
    viewer._drawStep = 3;
    viewer._setPrompt('点击圆弧终点');
    viewer._drawToolController.addPreviewLine(viewer._drawData.points[viewer._drawData.points.length - 1], pt);
  } else if (viewer._drawStep === 3) {
    const prev = viewer._drawData.points[viewer._drawData.points.length - 1];
    const mid = viewer._drawData._arcMid;
    const segIdx = viewer._drawData.points.length - 1;
    if (!viewer._drawData._arcSegments) viewer._drawData._arcSegments = {};
    viewer._drawData._arcSegments[segIdx] = { x: mid.x, y: mid.y };
    viewer._drawData.points.push({ x: pt.x, y: pt.y });
    viewer._drawData._arcMid = undefined;
    viewer._drawStep = 1;
    viewer._setPrompt(multiToolPrompt(viewer));
    viewer.view.update();
  } else {
    viewer._drawData.points.push({ x: pt.x, y: pt.y });
    viewer._setPrompt(multiToolPrompt(viewer));
    viewer.view.update();
  }
}

export const pointHandler: EntityDrawHandler = (viewer, pt) => {
  const before = viewer._saveSnapshot();
  const entity = viewer._createEntity({
    type: 'point', id: nextId('P'), point: [pt.x, pt.y],
    description: `点 (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`
  });
  if (entity) viewer.doc.entities.push(entity);
  viewer._finishDraw(entity, before);
  viewer._setPrompt(`已创建点 (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`);
};

export const lineHandler: EntityDrawHandler = (viewer, pt) => {
  if (viewer._drawStep === 0) {
    viewer._drawData.p1 = pt;
    viewer._drawStep = 1;
    viewer._setPrompt('点击指定终点');
    viewer._clearPreview();
    viewer._drawToolController.addPreviewPoint(pt.x, pt.y);
  } else {
    const p1 = viewer._drawData.p1;
    viewer._clearPreview();
    const before = viewer._saveSnapshot();
    const pid1 = viewer._ensurePoint(p1, p1, '起点');
    const pid2 = viewer._ensurePoint(pt, pt, '终点');
    const entity = viewer._createEntity({ type: 'line', id: nextId('L'), start_ref: pid1, end_ref: pid2, description: '直线' });
    viewer.doc.entities.push(entity);
    viewer._finishDraw(entity, before, '已创建 直线');
  }
};

export const circleHandler: EntityDrawHandler = (viewer, pt) => {
  if (viewer._drawStep === 0) {
    viewer._drawData.center = pt;
    viewer._drawStep = 1;
    viewer._setPrompt('点击指定半径，或在命令栏输入半径值后按回车');
    viewer._clearPreview();
    viewer._drawToolController.addPreviewPoint(pt.x, pt.y);
    viewer._focusCmdInput('提示: 输入半径并按回车，或点击确定');
  } else {
    const center = viewer._drawData.center;
    const radius = new Point2d(pt.x, pt.y).dist(new Point2d(center.x, center.y));
    if (radius <= 0) { viewer._setPrompt('半径必须大于0'); return; }
    viewer._clearPreview();
    const before = viewer._saveSnapshot();
    const pid = viewer._ensurePoint(center, center, '圆心');
    const entity = viewer._createEntity({ type: 'circle', id: nextId('C'), center_ref: pid, r: radius, description: `圆 r=${radius.toFixed(1)}` });
    viewer.doc.entities.push(entity);
    viewer._finishDraw(entity, before);
  }
};

export const arcHandler: EntityDrawHandler = (viewer, pt) => {
  if (viewer._drawStep === 0) {
    viewer._drawData.startPt = pt;
    viewer._drawStep = 1;
    viewer._setPrompt('点击指定中间点');
    viewer._clearPreview();
    viewer._drawToolController.addPreviewPoint(pt.x, pt.y);
  } else if (viewer._drawStep === 1) {
    viewer._drawData.midPt = pt;
    viewer._drawStep = 2;
    viewer._setPrompt('点击指定终点');
  } else {
    viewer._clearPreview();
    const before = viewer._saveSnapshot();
    const pidS = viewer._ensurePoint(viewer._drawData.startPt, viewer._drawData.startPt, '弧起点');
    const pidM = viewer._ensurePoint(viewer._drawData.midPt, viewer._drawData.midPt, '弧中间点');
    const pidE = viewer._ensurePoint(pt, pt, '弧终点');
    const entity = viewer._createEntity({ type: 'arc', id: nextId('A'), start_ref: pidS, mid_ref: pidM, end_ref: pidE, description: '弧' });
    viewer.doc.entities.push(entity);
    viewer._finishDraw(entity, before);
  }
};

export const rectangleHandler: EntityDrawHandler = (viewer, pt) => {
  if (viewer._drawStep === 0) {
    viewer._drawData.p1 = pt;
    viewer._drawStep = 1;
    viewer._setPrompt('点击指定对角点');
    viewer._clearPreview();
    viewer._drawToolController.addPreviewPoint(pt.x, pt.y);
  } else {
    const p1 = viewer._drawData.p1;
    viewer._clearPreview();
    const before = viewer._saveSnapshot();
    const pid1 = viewer._ensurePoint(p1, p1, '角点1');
    const pid2 = viewer._ensurePoint(pt, pt, '角点2');
    const entity = viewer._createEntity({ type: 'rectangle', id: nextId('R'), min_ref: pid1, max_ref: pid2, description: '矩形' });
    viewer.doc.entities.push(entity);
    viewer._finishDraw(entity, before);
  }
};

export const textHandler: EntityDrawHandler = (viewer, pt) => {
  if (viewer._drawStep === 0) {
    viewer._drawData.insertPt = pt;
    viewer._drawStep = 1;
    viewer._setPrompt('在命令栏输入文字内容（多行用 | 分隔）后按回车');
    viewer._drawToolController.addPreviewPoint(pt.x, pt.y);
    viewer._focusCmdInput('输入文字内容后按回车...');
    viewer._drawCallback = (text: any): void => {
      if (!text || !text.trim()) { viewer._cancelDrawing(false); return; }
      viewer._clearPreview();
      const before = viewer._saveSnapshot();
      const pid = viewer._ensurePoint(pt, pt, '文字位置');
      const lines = String(text).split('|').map((s: any) => s.trim()).filter((s: any) => s);
      const finalText = lines.length > 1 ? lines.join('\n') : String(text).trim();
      const entity = viewer._createEntity({ type: 'text', id: nextId('T'), position_ref: pid, text: finalText, height: 2.5, scale: viewer.doc?.properties?.scale || 1, description: `文字: ${finalText.slice(0, 20).replace(/\n/g, ' ')}` });
      viewer.doc.entities.push(entity);
      viewer._finishDraw(entity, before);
    };
  }
};

export const dimensionHandler: EntityDrawHandler = (viewer, pt) => {
  if (viewer._drawStep === 0) {
    viewer._drawData.p1 = pt;
    viewer._drawStep = 1;
    viewer._setPrompt('点击指定第二个点');
    viewer._clearPreview();
    viewer._drawToolController.addPreviewPoint(pt.x, pt.y);
  } else {
    const p1 = viewer._drawData.p1;
    viewer._clearPreview();
    const before = viewer._saveSnapshot();
    const pid1 = viewer._ensurePoint(p1, p1, '标注点1');
    const pid2 = viewer._ensurePoint(pt, pt, '标注点2');
    const len = new Point2d(pt.x, pt.y).dist(new Point2d(p1.x, p1.y));
    const entity = viewer._createEntity({
      type: 'dimension', id: nextId('D'), p1_ref: pid1, p2_ref: pid2,
      measurement: len, dim_line_offset: 10, category: 'aligned',
      scale: viewer.doc?.properties?.scale || 1,
      description: `标注 ${len.toFixed(1)}`
    });
    viewer.doc.entities.push(entity);
    viewer._finishDraw(entity, before, `已创建标注 ${len.toFixed(1)}`);
  }
};

export const positionHandler: EntityDrawHandler = (viewer, pt) => {
  const before = viewer._saveSnapshot();
  const pid = viewer._ensurePoint(pt, pt, `位置点 (${pt.x.toFixed(1)},${pt.y.toFixed(1)})`);
  const entity = viewer._createEntity({
    type: 'position', id: nextId('POS'), kind: 'point', ref_a: pid,
    value: 0, description: `位置 (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`
  });
  viewer.doc.entities.push(entity);
  viewer._finishDraw(entity, before);
};

export const coordSysHandler: EntityDrawHandler = (viewer, pt) => {
  const before = viewer._saveSnapshot();
  const pid = viewer._ensurePoint(pt, pt, `坐标系原点 (${pt.x.toFixed(1)},${pt.y.toFixed(1)})`);
  const entity = viewer._createEntity({
    type: 'coord_sys', id: nextId('CS'), origin_ref: pid, rotation: 0,
    description: `坐标系 (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`
  });
  viewer.doc.entities.push(entity);
  viewer._finishDraw(entity, before);
};

export const blockRefHandler: EntityDrawHandler = (viewer, pt) => {
  if (viewer._drawStep === 0) {
    viewer._drawData.insertPt = pt;
    viewer._drawStep = 1;
    viewer._drawToolController.addPreviewPoint(pt.x, pt.y);
    viewer._focusCmdInput('输入块 ID后按回车...');
    viewer._setPrompt('在命令栏输入块 ID');
    viewer._drawCallback = (blockId: any): void => {
      if (!blockId || !blockId.trim()) { viewer._cancelDrawing(false); return; }
      blockId = String(blockId).trim();
      const blockDef = viewer.doc.getBlockById(blockId);
      if (!blockDef) { viewer._setPrompt(`块不存在: ${blockId}`); viewer._cancelDrawing(false); return; }
      viewer._clearPreview();
      const before = viewer._saveSnapshot();
      const pid = viewer._ensurePoint(pt, pt, '块插入点');
      const entity = viewer._createEntity({
        type: 'block_ref', id: nextId('BR'), block_id: blockId, position_ref: pid,
        rotation: 0, scale_x: 1, scale_y: 1,
        description: `块引用: ${blockDef.name || blockId}`
      });
      viewer.doc.entities.push(entity);
      viewer._finishDraw(entity, before);
    };
  }
};

export const xrefHandler: EntityDrawHandler = (viewer, pt) => {
  if (viewer._drawStep === 0) {
    viewer._drawData.insertPt = pt;
    viewer._drawStep = 1;
    viewer._drawToolController.addPreviewPoint(pt.x, pt.y);
    viewer._focusCmdInput('输入文件路径后按回车...');
    viewer._setPrompt('在命令栏输入外部引用文件路径');
    viewer._drawCallback = (filePath: any): void => {
      if (!filePath || !filePath.trim()) { viewer._cancelDrawing(false); return; }
      viewer._clearPreview();
      const before = viewer._saveSnapshot();
      const pid = viewer._ensurePoint(pt, pt, 'XREF插入点');
      const entity = viewer._createEntity({
        type: 'xref', id: nextId('XR'), file_path: String(filePath).trim(), position_ref: pid,
        rotation: 0, scale_x: 1, scale_y: 1,
        description: `外部引用: ${filePath}`
      });
      viewer.doc.entities.push(entity);
      viewer._finishDraw(entity, before);
    };
  }
};

export const tableHandler: EntityDrawHandler = (viewer, pt) => {
  if (viewer._drawStep === 0) {
    viewer._drawData.insertPt = pt;
    viewer._drawStep = 1;
    viewer._drawToolController.addPreviewPoint(pt.x, pt.y);
    viewer._focusCmdInput('输入列数,行数（如 3,4）后按回车...');
    viewer._setPrompt('在命令栏输入列数,行数（如 3,4 表示3列4行）');
    viewer._drawCallback = (input: any): void => {
      if (!input || !input.trim()) { viewer._cancelDrawing(false); return; }
      const parts = String(input).split(',').map((s: any) => parseInt(s.trim()));
      if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1]) || parts[0] < 1 || parts[1] < 1) {
        viewer._setPrompt('格式错误，请输入 列数,行数（如 3,4）');
        viewer._focusCmdInput('输入列数,行数（如 3,4）后按回车...');
        return;
      }
      const cols = parts[0], rows = parts[1];
      const before = viewer._saveSnapshot();
      const pid = viewer._ensurePoint(pt, pt, '表格插入点');
      const header = '| ' + Array.from({ length: cols }, (_, i) => `列${i + 1}`).join(' | ') + ' |';
      const sep = '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |';
      const dataRows = Array.from({ length: rows - 1 }, () =>
        '| ' + Array.from({ length: cols }, () => '').join(' | ') + ' |');
      const md = [header, sep, ...dataRows].join('\n');
      const entity = viewer._createEntity({
        type: 'table', id: nextId('TB'), position_ref: pid, markdown: md,
        col_widths: new Array(cols).fill(60), row_heights: new Array(rows).fill(22), text_height: 2.5,
        description: `表格 ${cols}列${rows}行`
      });
      viewer.doc.entities.push(entity);
      viewer._finishDraw(entity, before);
    };
  }
};

export const subsegmentHandler: EntityDrawHandler = (viewer, pt) => {
  if (viewer._drawStep === 0) {
    const hit = viewer._drawToolController.hitTestEntity(pt);
    if (!hit) { viewer._setPrompt('未选中实体'); return; }
    const curveEntity = viewer.doc.getEntityById(hit);
    if (!curveEntity) { viewer._setPrompt('未选中实体'); return; }
    const curveTypes = ['line', 'polyline', 'polyarc', 'polycurve', 'circle', 'arc', 'subsegment'];
    if (!curveTypes.includes(curveEntity.type)) {
      viewer._setPrompt(`不支持的曲线类型: ${curveEntity.type}`);
      return;
    }
    viewer._drawData.curveRef = hit;
    viewer._drawStep = 1;
    viewer._setPrompt('点击曲线上第一点');
    return;
  }
  const resolver = viewer.renderer?.resolver;
  const ent = viewer.doc.getEntityById(viewer._drawData.curveRef);
  const curve = ent?.getCurve?.(resolver);
  if (!curve) { viewer._setPrompt('无法获取曲线'); viewer._cancelDrawing(false); return; }
  const hitPt = new Point2d(pt.x, pt.y);
  const near = curve.nearestPoint(hitPt);
  if (!near) { viewer._setPrompt('无法计算曲线参数'); return; }
  if (viewer._drawStep === 1) {
    viewer._drawData._t0 = near.t;
    viewer._drawStep = 2;
    viewer._drawToolController.addPreviewPoint(pt.x, pt.y);
    viewer._setPrompt('点击曲线上第二点');
  } else {
    const t0 = viewer._drawData._t0!;
    const t1 = near.t;
    const fromT = Math.min(t0, t1);
    const toT = Math.max(t0, t1);
    viewer._clearPreview();
    const before = viewer._saveSnapshot();
    const entity = viewer._createEntity({
      type: 'subsegment', id: nextId('SS'), curve_ref: viewer._drawData.curveRef,
      from_t: fromT, to_t: toT, label: `t:[${fromT.toFixed(3)},${toT.toFixed(3)}]`,
      description: `子线段 ${fromT.toFixed(3)}-${toT.toFixed(3)}`
    });
    viewer.doc.entities.push(entity);
    viewer._finishDraw(entity, before);
  }
};

export const regionAnnoHandler: EntityDrawHandler = (viewer, pt) => {
  if (viewer._drawStep === 0) {
    const hit = viewer._drawToolController.hitTestEntity(pt);
    if (!hit) { viewer._setPrompt('未选中实体'); return; }
    const edgeEntity = viewer.doc.getEntityById(hit);
    if (!edgeEntity) { viewer._setPrompt('未选中实体'); return; }
    if (edgeEntity.type !== 'polycurve') {
      viewer._setPrompt(`区域标注需要 polycurve 类型，当前为: ${edgeEntity.type}`);
      return;
    }
    viewer._drawData.edgeRefs = [hit];
    viewer._drawStep = 1;
    viewer._drawToolController.addPreviewPoint(pt.x, pt.y);
    viewer._focusCmdInput('输入面积标注文字（或直接按回车跳过），按回车确认...');
    viewer._setPrompt('在命令栏输入面积标注文字后按回车');
    viewer._drawCallback = (text: any): void => {
      viewer._clearPreview();
      const before = viewer._saveSnapshot();
      const entity = viewer._createEntity({
        type: 'region_anno', id: nextId('RA'), edges_refs: viewer._drawData.edgeRefs,
        area: text ? 0 : undefined, area_text: text ? String(text).trim() : undefined,
        fill: viewer._drawTool === 'hatch' ? '#4488FF' : undefined,
        description: text ? `区域标注: ${text}` : '区域标注'
      });
      viewer.doc.entities.push(entity);
      viewer._finishDraw(entity, before);
    };
  }
};

export const polylineHandler = multiPointClickHandler;
export const polyarcHandler = multiPointClickHandler;
export const polycurveHandler = multiPointClickHandler;
export const splineFitHandler = multiPointClickHandler;
export const splineCvHandler = multiPointClickHandler;

/** 绘制工具名称到 handler 的映射 */
/** 擦除工具 */
function eraseHandler(viewer: any, pt: any, rawPt?: any): void {
  viewer._drawToolController.drawEraseClick(pt, rawPt);
}

/** 移动工具 */
function moveHandler(viewer: any, pt: any, rawPt?: any): void {
  viewer._transformToolController.drawMoveClick(pt, rawPt);
}

/** 复制工具 */
function copyHandler(viewer: any, pt: any, rawPt?: any): void {
  viewer._transformToolController.drawCopyClick(pt, rawPt);
}

/** 旋转工具 */
function rotateHandler(viewer: any, pt: any, rawPt?: any): void {
  viewer._transformToolController.drawRotateClick(pt, rawPt);
}

/** 镜像工具 */
function mirrorHandler(viewer: any, pt: any, rawPt?: any): void {
  viewer._transformToolController.drawMirrorClick(pt, rawPt);
}

export const DRAW_HANDLER_MAP: Record<string, EntityDrawHandler> = {
  point: pointHandler,
  line: lineHandler,
  circle: circleHandler,
  arc: arcHandler,
  rectangle: rectangleHandler,
  text: textHandler,
  mtext: textHandler,
  polyline: polylineHandler,
  polyarc: polyarcHandler,
  polycurve: polycurveHandler,
  spline_fit: splineFitHandler,
  spline_cv: splineCvHandler,
  dimension: dimensionHandler,
  position: positionHandler,
  coord_sys: coordSysHandler,
  block_ref: blockRefHandler,
  xref: xrefHandler,
  table: tableHandler,
  subsegment: subsegmentHandler,
  region_anno: regionAnnoHandler,
  hatch: regionAnnoHandler,
  erase: eraseHandler,
  move: moveHandler,
  copy: copyHandler,
  rotate: rotateHandler,
  mirror: mirrorHandler,
};
