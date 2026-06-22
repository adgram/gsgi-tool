/**
 * 渲染分派器：将实体类型映射到具体的 paper.js 绘制函数
 */
import paper from 'paper';
import { makePath, applyStyle } from './paper-utils';
import { ColorResolver } from '../core/color-resolver';
import { SplineFitCurve, SplineCvCurve, polygonCentroid, Point2d } from '../core/geometry';

const RENDER_SIZE = 5;
const RAD_TO_DEG = 180 / Math.PI;

export function registerDispatchers(renderer: any): void {
  renderer._dispatchers = {
    point(entity: any, parent: any): any[] | null {
      const pt = entity.getResult(this.resolver);
      const coords = [pt.x, pt.y];
      const isHidden = this._isHiddenConstructionPoint ? this._isHiddenConstructionPoint(entity) : false;
      if (isHidden) return null;
      const isConstruction = this._isConstructionPoint ? this._isConstructionPoint(entity) : false;
      const p = this._createScreenFixedItem(
        isConstruction ? 'diamond' : 'cross',
        coords[0], coords[1],
        isConstruction ? 12 : 10,
        isConstruction
          ? { strokeColor: '#6F7C86', fillColor: new paper.Color(0.35, 0.45, 0.55, 0.18), dashArray: [2, 2] }
          : { strokeColor: this._color(entity), strokeWidth: 1 }
      );
      parent.addChild(p);
      return [p];
    },

    param_pt(entity: any, parent: any): any[] | null {
      const pt = entity.getRepresent(this.resolver);
      const item = this._createScreenFixedItem('circle', pt.x, pt.y, RENDER_SIZE * 2,
        { strokeColor: this._color(entity), strokeWidth: 1 });
      parent.addChild(item);
      return [item];
    },

    line(entity: any, parent: any): any[] | null {
      const c = entity.getCurve(this.resolver);
      if (!c) return null;
      return [makePath(parent, [[c.a.x, c.a.y], [c.b.x, c.b.y]], false, this.doc, entity)];
    },

    polyline(entity: any, parent: any): any[] | null {
      if (!entity.points || entity.points.length < 2) return null;
      return [makePath(parent, entity.points.map((p: any) => [p.x, p.y]), entity.closed, this.doc, entity)];
    },

    polyarc(entity: any, parent: any): any[] | null {
      const curve = entity.getCurve(this.resolver);
      if (!curve) return null;
      const n = entity.closed ? entity.point_refs.length : entity.point_refs.length - 1;
      const samples = Math.max(n * 16, 32);
      const segs: number[][] = [];
      for (let i = 0; i <= samples; i++) {
        const t = (i / samples) * n;
        const p = curve.eval(t);
        if (p) segs.push([p.x, p.y]);
      }
      return [makePath(parent, segs, entity.closed, this.doc, entity)];
    },

    polycurve(entity: any, parent: any): any[] | null {
      const pts = entity.getPolycurvePoints(this.resolver);
      if (!pts || pts.length < 2) return null;
      return [makePath(parent, pts.map((p: any) => [p.x, p.y]), entity.closed, this.doc, entity)];
    },

    circle(entity: any, parent: any): any[] | null {
      const c = this.resolver?.get(entity.center_ref)?.getResult(this.resolver);
      if (!c) return null;
      const path = new paper.Path.Circle({ center: [c.x, c.y], radius: entity.r, insert: false });
      applyStyle(path, this.doc, entity);
      parent.addChild(path);
      return [path];
    },

    arc(entity: any, parent: any): any[] | null {
      const start = this.resolver?.get(entity.start_ref)?.getResult(this.resolver);
      const mid = this.resolver?.get(entity.mid_ref)?.getResult(this.resolver);
      const end = this.resolver?.get(entity.end_ref)?.getResult(this.resolver);
      if (!start || !mid || !end) return null;
      const path = new paper.Path.Arc({ from: [start.x, start.y], through: [mid.x, mid.y], to: [end.x, end.y], insert: false });
      applyStyle(path, this.doc, entity);
      parent.addChild(path);
      return [path];
    },

    rectangle(entity: any, parent: any): any[] | null {
      const p1 = this.resolver?.get(entity.min_ref)?.getResult(this.resolver);
      const p2 = this.resolver?.get(entity.max_ref)?.getResult(this.resolver);
      if (!p1 || !p2) return null;
      const path = new paper.Path.Rectangle({ from: [p1.x, p1.y], to: [p2.x, p2.y], insert: false });
      applyStyle(path, this.doc, entity);
      parent.addChild(path);
      return [path];
    },

    text(entity: any, parent: any): any[] | null {
      const pt = this.resolver?.get(entity.position_ref)?.getResult(this.resolver);
      if (!pt) { console.warn(`[${entity.id}] render: position_ref ${entity.position_ref} not resolved`); return null; }
      const lines = entity.text.split('\n');
      const fontSize = (entity.height || 2.5) * (entity.scale || 1);
      if (lines.length <= 1) {
        const t = new paper.PointText({
          point: [pt.x, pt.y], content: entity.text,
          fontSize, fillColor: this._color(entity), rotation: entity.rotation || 0, insert: false
        });
        t.strokeWidth = 0; t.strokeColor = null;
        parent.addChild(t); return [t];
      }
      const lh = fontSize * 1.4; const items: any[] = [];
      for (let i = 0; i < lines.length; i++) {
        const t = new paper.PointText({
          point: [pt.x, pt.y + i * lh], content: lines[i],
          fontSize, fillColor: this._color(entity), rotation: entity.rotation || 0, insert: false
        });
        t.strokeWidth = 0; t.strokeColor = null;
        parent.addChild(t); items.push(t);
      }
      return items.length ? items : null;
    },

    dimension(entity: any, parent: any): any[] | null {
      const p1 = this.resolver?.get(entity.p1_ref)?.getResult(this.resolver);
      const p2 = this.resolver?.get(entity.p2_ref)?.getResult(this.resolver);
      if (!p1 || !p2) return null;
      const s = entity.scale || 1;
      const off = (entity.dim_line_offset || 10) * s;
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (len < 1e-12) return null;
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const nx = -dy / len, ny = dx / len;
      const color = this._color(entity);
      const items: any[] = [];

      const dl = new paper.Path({ segments: [[p1.x + nx * off, p1.y + ny * off], [p2.x + nx * off, p2.y + ny * off]], insert: false });
      dl.strokeColor = color; dl.strokeWidth = 1; dl.strokeScaling = false; parent.addChild(dl); items.push(dl);

      const e1 = new paper.Path({ segments: [[p1.x, p1.y], [p1.x + nx * off, p1.y + ny * off]], insert: false });
      e1.strokeColor = color; e1.strokeWidth = 1; e1.strokeScaling = false; parent.addChild(e1); items.push(e1);

      const e2 = new paper.Path({ segments: [[p2.x, p2.y], [p2.x + nx * off, p2.y + ny * off]], insert: false });
      e2.strokeColor = color; e2.strokeWidth = 1; e2.strokeScaling = false; parent.addChild(e2); items.push(e2);

      const labelOff = off + 3 * s;
      const mx = (p1.x + p2.x) / 2 + nx * labelOff, my = (p1.y + p2.y) / 2 + ny * labelOff;
      const fs = Math.max(3 * s, 1);
      const label = entity.dim_text || String(entity.measurement || Math.round(len));
      const t = new paper.PointText({ point: [mx, my], content: label, fontSize: fs, fillColor: color, justification: 'center', insert: false });
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle > 90) angle -= 180;
      else if (angle < -90) angle += 180;
      t.rotation = -angle;
      parent.addChild(t); items.push(t);
      return items;
    },

    table(entity: any, parent: any): any[] | null {
      const pt = this.resolver?.get(entity.position_ref)?.getResult(this.resolver);
      if (!pt || !entity.markdown) return null;
      const items: any[] = [];
      const lines = entity.markdown.split('\n');
      if (lines.length < 3) return null;
      const headerLine = lines[0];
      const cols = headerLine.split('|').filter((s: string) => s.trim()).length;
      const dataRows = lines.slice(2);
      const cw = entity.col_widths || new Array(cols).fill(60);
      const rh = entity.row_heights || new Array(1 + dataRows.length).fill(22);
      const fontSize = entity.text_height || 2.5;

      const cellMatrix: string[][] = [];
      for (let ri = 0; ri <= dataRows.length; ri++) {
        const cells = ri === 0
          ? headerLine.split('|').filter((s: string) => s.trim())
          : dataRows[ri - 1].split('|').filter((s: string) => s.trim());
        cellMatrix.push(cells.map((c: string) => c.trim()));
      }

      function resolveCellRef(ref: string): string {
        const m = ref.match(/^\^R(\d+)C(\d+)$/);
        if (!m) return ref;
        const r = parseInt(m[1]), c = parseInt(m[2]);
        if (r < cellMatrix.length && c < cellMatrix[r].length) {
          const val = cellMatrix[r][c];
          if (val.startsWith('^')) return val;
          if (val.startsWith('@@') || val.startsWith('%%') || val.startsWith('^^')) return val.substring(1);
          return val;
        }
        return ref;
      }

      const totalRows = 1 + dataRows.length;
      const totalW = cw.slice(0, cols).reduce((a: number, b: number) => a + b, 0);
      const totalH = rh.slice(0, totalRows).reduce((a: number, b: number) => a + b, 0);
      const color = this._color(entity);
      const gridColor = new paper.Color(0.5, 0.5, 0.5);

      // 绘制格线
      let curY = pt.y;
      for (let ri = 0; ri <= totalRows; ri++) {
        const hLine = new paper.Path({ segments: [[pt.x, curY], [pt.x + totalW, curY]], insert: false });
        hLine.strokeColor = gridColor; hLine.strokeWidth = 0.5; hLine.strokeScaling = false;
        parent.addChild(hLine); items.push(hLine);
        if (ri < totalRows) curY += rh[Math.min(ri, rh.length - 1)];
      }
      let curX = pt.x;
      for (let ci = 0; ci <= cols; ci++) {
        const vLine = new paper.Path({ segments: [[curX, pt.y], [curX, pt.y + totalH]], insert: false });
        vLine.strokeColor = gridColor; vLine.strokeWidth = 0.5; vLine.strokeScaling = false;
        parent.addChild(vLine); items.push(vLine);
        if (ci < cols) curX += cw[Math.min(ci, cw.length - 1)];
      }

      // 绘制文字
      let y = pt.y;
      for (let ri = 0; ri <= dataRows.length; ri++) {
        const cells = ri === 0
          ? headerLine.split('|').filter((s: string) => s.trim())
          : dataRows[ri - 1].split('|').filter((s: string) => s.trim());
        let x = pt.x;
        const rowH = rh[Math.min(ri, rh.length - 1)];
        for (let ci = 0; ci < Math.min(cells.length, cols); ci++) {
          let content = cells[ci].trim();
          if (content.startsWith('@@') || content.startsWith('%%') || content.startsWith('^^')) {
            content = content.substring(1);
          } else if (content.startsWith('^')) {
            content = resolveCellRef(content);
          } else if (content.startsWith('@')) {
            content = `[BLOCK: ${content.substring(1)}]`;
          } else if (content.startsWith('%')) {
            content = `[XREF: ${content.substring(1)}]`;
          }
          const t = new paper.PointText({
            point: [x + 2, y + rowH * 0.7],
            content, fontSize, fillColor: color, insert: false
          });
          parent.addChild(t); items.push(t);
          x += cw[Math.min(ci, cw.length - 1)];
        }
        y += rowH;
      }
      return items.length ? items : null;
    },

    region_anno(entity: any, parent: any): any[] | null {
      const items: any[] = [];
      const fillColor = entity.fill !== undefined ? new paper.Color(ColorResolver.resolveColorValue(entity.fill)) : new paper.Color(0.3, 0.6, 1.0, 0.08);
      for (const edgeRef of entity.edges_refs) {
        const ee = this.doc.getEntityById(edgeRef);
        if (!ee) { console.warn(`[${entity.id}] render: edge ${edgeRef} not found`); continue; }
        if (typeof ee.getPolycurvePoints !== 'function') { console.warn(`[${entity.id}] render: edge ${edgeRef} has no getPolycurvePoints`); continue; }
        const pts = ee.getPolycurvePoints(this.resolver);
        if (pts.length < 3) continue;
        const path = new paper.Path({ segments: pts.map((p: any) => [p.x, p.y]), closed: true, insert: false });
        path.fillColor = fillColor;
        path.strokeColor = new paper.Color('#3366FF'); path.strokeWidth = 1; path.strokeScaling = false; path.dashArray = [8, 4];
        parent.addChild(path); items.push(path);
      }
      if (entity.area_text) {
        const outerEe = this.doc.getEntityById(entity.edges_refs[0]);
        if (!outerEe) { console.warn(`[${entity.id}] render: outer edge ${entity.edges_refs[0]} not found`); }
        const outer = outerEe && typeof outerEe.getPolycurvePoints === 'function' ? outerEe.getPolycurvePoints(this.resolver) : [];
        if (outer.length) {
          const c = polygonCentroid(outer);
          const t = new paper.PointText({ point: [c.x, c.y], content: entity.area_text, fontSize: 12, fillColor: '#3366FF', justification: 'center', insert: false });
          parent.addChild(t); items.push(t);
        }
      }
      return items.length ? items : null;
    },

    position(_entity: any, _parent: any): null { return null; },

    coord_sys(entity: any, parent: any): any[] | null {
      const origin = this.resolver?.get(entity.origin_ref)?.getResult(this.resolver);
      if (!origin) return null;
      const s = entity.scale || 1;
      const items: any[] = [], size = 10 * s, r = entity.rotation || 0;
      const cosR = Math.cos(r), sinR = Math.sin(r);
      const pts = [[origin.x, origin.y], [origin.x + size * cosR, origin.y + size * sinR], [origin.x - size * sinR, origin.y + size * cosR]];
      const xa = new paper.Path({ segments: [pts[0], pts[1]], insert: false });
      xa.strokeColor = new paper.Color('#F00'); xa.strokeWidth = 1; xa.strokeScaling = false; parent.addChild(xa); items.push(xa);
      const ya = new paper.Path({ segments: [pts[0], pts[2]], insert: false });
      ya.strokeColor = new paper.Color('#0C0'); ya.strokeWidth = 1; ya.strokeScaling = false; parent.addChild(ya); items.push(ya);
      return items;
    },

    custom_entity(_entity: any, _parent: any): null { return null; },

    block_ref(entity: any, parent: any): any[] | null {
      const pt = this.resolver?.get(entity.position_ref)?.getResult(this.resolver);
      if (!pt) { console.warn(`[${entity.id}] render: position_ref ${entity.position_ref} not resolved`); return null; }
      const blockDef = this.doc.getBlockById(entity.block_id);
      if (!blockDef) { console.warn(`[${entity.id}] render: block ${entity.block_id} not found`); return null; }
      const group = new paper.Group({ insert: false });
      const savedEntities = this.doc.entities;
      this.doc.entities = blockDef.entities;
      this.resolver._buildCache();

      const attrValues: Record<string, string> = {};
      if (blockDef.attributes && entity.attrs) {
        for (const [key, def] of Object.entries(blockDef.attributes) as [string, any][]) {
          attrValues[key] = entity.attrs[key] !== undefined ? String(entity.attrs[key]) : (def.default !== undefined ? String(def.default) : '');
        }
      }

      function applyAttrs(obj: any): void {
        if (typeof obj === 'string') return;
        if (Array.isArray(obj)) { for (let i = 0; i < obj.length; i++) applyAttrs(obj[i]); return; }
        if (obj && typeof obj === 'object') {
          for (const [k, v] of Object.entries(obj)) {
            if (typeof v === 'string' && v.includes('{')) {
              (obj as any)[k] = v.replace(/\{(\w+)\}/g, (_: string, name: string) => attrValues[name] !== undefined ? attrValues[name] : _);
            } else if (Array.isArray(v)) {
              for (let i = 0; i < v.length; i++) {
                if (typeof v[i] === 'string') v[i] = v[i].replace(/\{(\w+)\}/g, (_: string, name: string) => attrValues[name] !== undefined ? attrValues[name] : _);
              }
            } else if (v && typeof v === 'object') { applyAttrs(v); }
          }
        }
      }

      try {
        for (const be of blockDef.entities) {
          const cloned = be.clone();
          cloned.description = be.description;
          if (attrValues && Object.keys(attrValues).length > 0) applyAttrs(cloned);
          const items = this._renderEntityToParent(cloned, group);
          if (items) { for (const item of items) group.addChild(item); }
        }
      } finally {
        this.doc.entities = savedEntities;
        this.resolver._buildCache();
      }

      group.pivot = blockDef.base_point ? new paper.Point(blockDef.base_point[0], blockDef.base_point[1]) : new paper.Point(0, 0);
      group.position = new paper.Point(pt.x, pt.y);
      if (entity.rotation) group.rotation = entity.rotation * RAD_TO_DEG;
      if (entity.scale_x !== undefined || entity.scale_y !== undefined) group.scaling = new paper.Point(entity.scale_x || 1, entity.scale_y || 1);
      parent.addChild(group);
      return [group];
    },

    xref(entity: any, parent: any): any[] | null {
      const pt = this.resolver?.get(entity.position_ref)?.getResult(this.resolver);
      if (!pt) { console.warn(`[${entity.id}] render: position_ref ${entity.position_ref} not resolved`); return null; }
      const t = new paper.PointText({ point: [pt.x, pt.y], content: `[XREF: ${entity.file_path}]`,
        fontSize: 10, fillColor: '#888', insert: false });
      parent.addChild(t);
      const r = new paper.Path.Rectangle({ from: [pt.x - 5, pt.y - 15], to: [pt.x + t.bounds.width + 5, pt.y + 3], insert: false });
      r.strokeColor = new paper.Color('#AAA'); r.strokeWidth = 1; r.dashArray = [4, 3]; r.fillColor = new paper.Color(0.9, 0.9, 0.9, 0.3);
      parent.addChild(r);
      return [r, t];
    },

    subsegment(entity: any, parent: any): any[] | null {
      const pts = entity.getSubsegmentPoints(this.resolver);
      if (!pts || pts.length < 2) return null;
      const path = new paper.Path({ segments: pts.map((p: any) => [p.x, p.y]), insert: false });
      path.strokeColor = new paper.Color('#CC66FF'); path.strokeWidth = 1; path.strokeScaling = false;
      parent.addChild(path);
      return [path];
    },

    spline_fit(entity: any, parent: any): any[] | null {
      if (!entity.fit_point_refs || entity.fit_point_refs.length < 2) { console.warn(`[${entity.id}] render: insufficient fit_point_refs`); return null; }
      const pts: Point2d[] = [];
      for (const ref of entity.fit_point_refs) {
        const r = this.resolver?.get(ref)?.getResult(this.resolver);
        if (r) pts.push(new Point2d(r.x, r.y));
      }
      if (pts.length < 2) { console.warn(`[${entity.id}] render: insufficient resolved points (${pts.length})`); return null; }
      const segs = SplineFitCurve.toCubicBezierSegments(pts, entity.closed);
      if (!segs.length) return null;
      const path = new paper.Path({ insert: false });
      path.moveTo(new paper.Point(segs[0].from.x, segs[0].from.y));
      for (const seg of segs) {
        path.cubicCurveTo(new paper.Point(seg.cp1.x, seg.cp1.y), new paper.Point(seg.cp2.x, seg.cp2.y), new paper.Point(seg.to.x, seg.to.y));
      }
      if (entity.closed) path.closePath();
      applyStyle(path, this.doc, entity);
      parent.addChild(path);
      return [path];
    },

    spline_cv(entity: any, parent: any): any[] | null {
      if (!entity.control_point_refs || entity.control_point_refs.length < 2) return null;
      const pts: Point2d[] = [];
      for (const ref of entity.control_point_refs) {
        const r = this.resolver?.get(ref)?.getResult(this.resolver);
        if (r) pts.push(new Point2d(r.x, r.y));
      }
      if (pts.length < 2) return null;
      const items: any[] = [];

      const poly = new paper.Path({ segments: pts.map(p => [p.x, p.y]), closed: entity.closed, insert: false });
      poly.strokeColor = new paper.Color(0.5, 0.5, 0.5, 0.5);
      poly.strokeWidth = 0.5; poly.strokeScaling = false; poly.dashArray = [4, 4];
      parent.addChild(poly); items.push(poly);

      const d = entity.degree || 3;
      if (entity.closed || pts.length <= d) {
        const path = new paper.Path({ segments: pts.map(p => [p.x, p.y]), closed: entity.closed, insert: false });
        path.smooth({ type: 'catmull-rom', factor: 0.5 });
        applyStyle(path, this.doc, entity);
        parent.addChild(path); items.push(path);
      } else {
        const total = pts.length - d;
        const samples = Math.max(total * 16, 32);
        const curve = new paper.Path();
        let first = true;
        for (let t = 0; t <= total; t += total / samples) {
          const p = SplineCvCurve.evalBSpline(pts, t, d);
          if (first) { curve.moveTo(new paper.Point(p.x, p.y)); first = false; }
          else curve.lineTo(new paper.Point(p.x, p.y));
        }
        const end = SplineCvCurve.evalBSpline(pts, total, d);
        curve.lineTo(new paper.Point(end.x, end.y));
        applyStyle(curve, this.doc, entity);
        parent.addChild(curve); items.push(curve);
      }
      return items;
    }
  };
}
