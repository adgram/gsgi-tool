/**
 * geometry.ts — 轻量 2D 几何计算库
 *
 * 所有函数工作在纯数据上（{x,y} / [[x,y],...]）。
 * 用途：曲线求交、围合区域检测、几何变换、多边形分析。
 */

import { Transform } from './transform';

// ═══════════════════════════════════════════
//  类型定义，设计最简单的数据类型
// ═══════════════════════════════════════════

/** 二维点/向量，所有方法返回新对象，不修改自身 */
export class Point2d {
  constructor(public x: number, public y: number) {}
  /** 深拷贝 */
  clone(): Point2d { return new Point2d(this.x, this.y); }
  /** this + other */
  add(other: Point2d): Point2d { return new Point2d(this.x + other.x, this.y + other.y); }
  /** this - other */
  sub(other: Point2d): Point2d { return new Point2d(this.x - other.x, this.y - other.y); }
  /** - this */
  neg(): Point2d { return new Point2d(-this.x, -this.y); }
  /** 数乘 */
  scale(s: number): Point2d { return new Point2d(this.x * s, this.y * s); }
  /** 点积 */
  dot(other: Point2d): number { return this.x * other.x + this.y * other.y; }
  /** 二维叉积（标量 z 分量） */
  cross(other: Point2d): number { return this.x * other.y - this.y * other.x; }
  /** 向量长度 */
  len(): number { return Math.hypot(this.x, this.y); }
  /** 长度平方 */
  lenSq(): number { return this.x * this.x + this.y * this.y; }
  /** 归一化，零向量返回 (0,0) */
  normalize(): Point2d {
    const l = this.len();
    return l < 1e-15 ? new Point2d(0, 0) : new Point2d(this.x / l, this.y / l);
  }
  /** 到 other 的距离 */
  dist(other: Point2d): number { return Math.hypot(this.x - other.x, this.y - other.y); }
  /** 到 other 的距离平方 */
  distSq(other: Point2d): number {
    const dx = this.x - other.x, dy = this.y - other.y;
    return dx * dx + dy * dy;}
  /** 极角（弧度），范围 (-π, π] */
  angle(): number { return Math.atan2(this.y, this.x); }
  /** 由极角与长度构造向量 */
  static fromAngle(a: number, l: number = 1): Point2d {
    return new Point2d(Math.cos(a) * l, Math.sin(a) * l);
  }
  /** 绕原点旋转 a 弧度 */
  rotate(a: number): Point2d {
    const c = Math.cos(a), s = Math.sin(a);
    return new Point2d(this.x * c - this.y * s, this.x * s + this.y * c);
  }
  /** 逆时针垂直向量 (-y, x) */
  perp(): Point2d { return new Point2d(-this.y, this.x); }
  /** 向 other 线性插值：this + (other - this) * t */
  lerp(other: Point2d, t: number): Point2d {
    return new Point2d(this.x + (other.x - this.x) * t, this.y + (other.y - this.y) * t);
  }
  /** 与 other 的中点 */
  mid(other: Point2d): Point2d {
    return new Point2d((this.x + other.x) / 2, (this.y + other.y) / 2);
  }
  /** 容差相等判断（默认 1e-12） */
  equals(other: Point2d, eps = 1e-12): boolean {
    return Math.abs(this.x - other.x) < eps && Math.abs(this.y - other.y) < eps;
  }
  /** 原地应用仿射变换 */
  transform(t: Transform): void {
    const x = t.a * this.x + t.b * this.y + t.tx;
    const y = t.c * this.x + t.d * this.y + t.ty;
    this.x = x; this.y = y;
  }
  /** 序列化为 {x, y} 普通对象 */
  toJSON(): { x: number; y: number } { return { x: this.x, y: this.y }; }
}


/** 无限长直线：点斜式 pt + t·direction */
export class Line {
  constructor(public pt: Point2d, public direction: Point2d) {}
  /** 由两点构造点斜式直线 */
  static fromPoints(a: Point2d, b: Point2d): Line {
    return new Line(a.clone(), b.sub(a).normalize());
  }
  /** 深拷贝 */
  clone(): Line { return new Line(this.pt.clone(), this.direction.clone()); }
  /** 长度为 t 处的点 */
  eval(t: number): Point2d { return this.pt.add(this.direction.scale(t)); }
  /** 点 p 到直线的投影参数 t */
  tAt(p: Point2d): number {
    return p.sub(this.pt).dot(this.direction);
  }
  /** 点 p 到直线的最近点 */
  closestPoint(p: Point2d): Point2d {
    return this.eval(this.tAt(p));
  }
  /** 点 p 到直线的距离 */
  dist(p: Point2d): number {
    return p.dist(this.closestPoint(p));
  }
  /** 与另一条直线的交点，平行返回 null */
  intersect(other: Line): Point2d | null {
    const denom = this.direction.cross(other.direction);
    if (Math.abs(denom) < 1e-12) return null;
    const t = other.pt.sub(this.pt).cross(other.direction) / denom;
    return this.eval(t);
  }
  /** 判断点是否在直线上（容差 eps） */
  onLine(p: Point2d, eps = 1e-12): boolean {
    return Math.abs(p.sub(this.pt).cross(this.direction)) < eps;
  }
  /** 与另一条直线的夹角（弧度，[0, π/2]） */
  angleBetween(other: Line): number {
    const d = Math.max(-1, Math.min(1, Math.abs(this.direction.dot(other.direction))));
    const angle = Math.acos(d);
    return Math.min(angle, Math.PI - angle);
  }
  /** 容差相等判断（默认 1e-12） */
  equals(other: Line, eps = 1e-12): boolean {
    return this.pt.equals(other.pt, eps) && this.direction.equals(other.direction, eps);
  }
}


// 边、直线段
export interface Edge {
  from: Point2d;
  to: Point2d;
  curve?: Curve;
  id?: string;
}

// 矩形box
export interface Box {
  min: Point2d;
  max: Point2d;
}

// 三次贝塞尔段
export interface CubicBezierSegment {
  from: Point2d;
  cp1: Point2d;
  cp2: Point2d;
  to: Point2d;
}

// 圆弧
export interface ArcParams {
  center: Point2d;
  r: number;
  startAngle: number;
  endAngle: number;
  sweep: number;
}

// 圆形结果（由三点定圆返回）
export interface Circle {
  center: Point2d;
  radius: number;
}

// 用于图遍历的半边模型
interface HalfEdge {
  to: Point2d;            // 目标顶点
  angle: number;          // 边的方向角（弧度），用于排序
  twin: HalfEdge | null;  // 反向半边（对偶边）
  used: boolean;          // 遍历时标记是否已访问
  id: string;             // 原始边的标识
  curve?: SimpleCurve;    // 对应的曲线段
  tStart?: number;        // 曲线段起点参数
  tEnd?: number;          // 曲线段终点参数
}


// 一般曲线
/** 直线段：由端点 a→b 定义 */
export class LineCurve {
  readonly type = 'line';
  constructor(public a: Point2d, public b: Point2d) {}
  getLine(): Line { return new Line(this.a, this.b.sub(this.a).normalize()); }
  /** t ∈ [0, 1] 线性插值 */
  eval(t: number): Point2d { return this.a.lerp(this.b, t); }
  /** 原地变换 */
  transform(t: Transform): void {
    this.a.transform(t);
    this.b.transform(t);
  }
  /**中点 */
  mid(): Point2d {return this.a.mid(this.b);}
  /** 深拷贝 */
  clone(): LineCurve { return new LineCurve(this.a.clone(), this.b.clone()); }
  length(): number {return this.a.dist(this.b); }
  getBox(): Box {
    return boundingBox([this.a, this.b]) || { min: new Point2d(0, 0), max: new Point2d(0, 0) };
  }
  /** 点 p 到线段最近点，返回 {x,y,t}，t ∈ [0,1] */
  nearestPoint(p: Point2d): { x: number; y: number; t: number } {
    const t = Math.max(0, Math.min(1, this.tAt(p)));
    const pt = this.eval(t);
    return { x: pt.x, y: pt.y, t };
  }
  /** 点 p 到直线段的投影参数 t*/
  tAt(p: Point2d): number {
    const ab = this.b.sub(this.a);
    const lenSq = ab.lenSq();
    if (lenSq < 1e-30) return 0;
    return p.sub(this.a).dot(ab) / lenSq;
  }
  /** 在参数 t ∈ [0, 1] 处拆分为两条子直线段 */
  split(t: number): [LineCurve, LineCurve] {
    const m = this.a.lerp(this.b, t);
    return [new LineCurve(this.a, m), new LineCurve(m, this.b)];
  }
  /** 容差相等判断（默认 1e-12） */
  equals(other: LineCurve, eps = 1e-12): boolean {
    return this.a.equals(other.a, eps) && this.b.equals(other.b, eps);
  }
}

/** 圆：由圆心和半径定义 */
export class CircleCurve {
  readonly type = 'circle';
  constructor(public center: Point2d, public r: number) {}
  /** t ∈ [0, 1]，映射到 [0, 2π) 角度 */
  eval(t: number): Point2d {
    const a = 2 * Math.PI * t;
    return new Point2d(this.center.x + this.r * Math.cos(a), this.center.y + this.r * Math.sin(a));
  }
  /** 深拷贝 */
  clone(): CircleCurve { return new CircleCurve(this.center.clone(), this.r); }
  /** 周长 */
  length(): number { return 2 * Math.PI * this.r; }
  getBox(): Box {
    const r = this.r, c = this.center;
    return boundingBox([new Point2d(c.x - r, c.y), new Point2d(c.x + r, c.y), new Point2d(c.x, c.y - r), new Point2d(c.x, c.y + r)])
      || { min: new Point2d(c.x - r, c.y - r), max: new Point2d(c.x + r, c.y + r) };
  }
  /** 原地变换 */
  transform(t: Transform): void {
    const px = new Point2d(this.center.x + this.r, this.center.y);
    const py = new Point2d(this.center.x, this.center.y + this.r);
    this.center.transform(t);
    px.transform(t);
    py.transform(t);
    const sx = px.dist(this.center);
    const sy = py.dist(this.center);
    this.r = (sx + sy) / 2;
  }
  /** 点 p 到圆的最近点，返回 {x,y,t}，t ∈ [0, 1) */
  nearestPoint(p: Point2d): { x: number; y: number; t: number } {
    const t = p.dist(this.center) < 1e-12 ? 0 : this.tAt(p);
    const pt = this.eval(t);
    return { x: pt.x, y: pt.y, t };
  }
  /** 点 p 到圆的投影参数 t（最近点的角度位置），截断到 [0, 1] */
  tAt(p: Point2d): number {
    return CircleCurve.normalizeAngle(p.sub(this.center).angle()) / (2 * Math.PI);
  }
  /** 容差相等判断（默认 1e-12） */
  equals(other: CircleCurve, eps = 1e-12): boolean {
    return this.center.equals(other.center, eps) && Math.abs(this.r - other.r) < eps;
  }
  /** 两圆求交，返回 0/1/2 个交点 */
  circleIntersect(other: CircleCurve): Point2d[] {
    const diff = other.center.sub(this.center);
    const dSq = diff.lenSq(), d = diff.len();
    const r1 = this.r, r2 = other.r;
    if (d <= 1e-10 || d > r1 + r2 + 1e-12 || d < Math.abs(r1 - r2) - 1e-12) return [];
    const a = (r1 * r1 - r2 * r2 + dSq) / (2 * d);
    const hSq = r1 * r1 - a * a;
    const dir = diff.scale(1 / d);
    if (hSq < 0) {
      return a < 0 && hSq > -1e-8
        ? [this.center.add(dir.scale(r1))]
        : [];
    }
    const h = Math.sqrt(hSq);
    const p = this.center.add(dir.scale(a));
    const perp = diff.perp().scale(h / d);
    if (h < 1e-12) return [p];
    return [p.add(perp), p.sub(perp)];
  }
  /** 直线与圆求交，返回 0/1/2 个交点 */
  lineIntersect(line: LineCurve): Point2d[] {
    const dir = line.b.sub(line.a);
    const oc = line.a.sub(this.center);
    const a = dir.dot(dir);
    if (a < 1e-30) return [];
    const b = 2 * oc.dot(dir);
    const c = oc.dot(oc) - this.r * this.r;
    let disc = b * b - 4 * a * c;
    if (disc < 0) return [];
    if (disc < 1e-12) {
      const t = -b / (2 * a);
      return [line.a.add(dir.scale(t))];
    }
    disc = Math.sqrt(disc);
    const t1 = (-b + disc) / (2 * a), t2 = (-b - disc) / (2 * a);
    return [line.a.add(dir.scale(t1)), line.a.add(dir.scale(t2))];
  }

  /** 由三点定圆，三点共线返回 null */
  static fromThreePoints(a: Point2d, b: Point2d, c: Point2d): CircleCurve | null {
    const ab = b.sub(a), ac = c.sub(a);
    const d = 2 * ab.cross(ac);
    if (Math.abs(d) < 1e-12) return null;
    const abSq = ab.lenSq(), acSq = ac.lenSq();
    const ux = (ac.y * abSq - ab.y * acSq) / d;
    const uy = (ab.x * acSq - ac.x * abSq) / d;
    const center = new Point2d(a.x + ux, a.y + uy);
    return new CircleCurve(center, center.dist(a));
  }

  /** 将角度转换到0-2pi */
  static normalizeAngle(a: number): number {
    a = a % (2 * Math.PI);
    return a < 0 ? a + 2 * Math.PI : a;
  }
  /** 在参数 t ∈ [0, 1] 处拆分为两条圆弧 */
  split(t: number): [ArcCurve, ArcCurve] {
    const a0 = 0, a1 = 2 * Math.PI * t;
    const aMid1 = Math.PI * t, aMid2 = Math.PI * (1 + t);
    const start = new Point2d(this.center.x + this.r, this.center.y);
    const mid1 = new Point2d(this.center.x + this.r * Math.cos(aMid1), this.center.y + this.r * Math.sin(aMid1));
    const splitPt = new Point2d(this.center.x + this.r * Math.cos(a1), this.center.y + this.r * Math.sin(a1));
    const mid2 = new Point2d(this.center.x + this.r * Math.cos(aMid2), this.center.y + this.r * Math.sin(aMid2));
    return [new ArcCurve(start, mid1, splitPt), new ArcCurve(splitPt, mid2, start)];
  }
}



/** 三点弧：由起点(start)、中间点(mid)、终点(end)定义 */
export class ArcCurve {
  readonly type = 'arc';
  constructor(public start: Point2d, public mid: Point2d, public end: Point2d) {}
  /** 获取弧参数（圆心、半径、起止角度） */
  getArcParams(): ArcParams | null {
    const circle = CircleCurve.fromThreePoints(this.start, this.mid, this.end);
    if (!circle) return null;
    const { center, r } = circle;
    const sa = this.start.sub(center).angle();
    const ea = this.end.sub(center).angle();
    const ma = this.mid.sub(center).angle();

    let a1 = CircleCurve.normalizeAngle(sa);
    let a2 = CircleCurve.normalizeAngle(ea);
    const aM = CircleCurve.normalizeAngle(ma);

    const ccwPassMid = a1 < a2
      ? (aM >= a1 && aM <= a2)
      : (aM >= a1 || aM <= a2);

    if (!ccwPassMid) {
      [a1, a2] = [a2, a1];
    }

    const sweep = a2 >= a1 ? a2 - a1 : a2 - a1 + 2 * Math.PI;
    return { center, r, startAngle: a1, endAngle: a2, sweep };
  }
  /** t ∈ [0, 1]，映射到弧的扫掠角 */
  eval(t: number): Point2d | null {
    const params = this.getArcParams();
    if (!params) return this.start.lerp(this.end, t);
    const angle = params.startAngle + params.sweep * t;
    return new Point2d(params.center.x + params.r * Math.cos(angle), params.center.y + params.r * Math.sin(angle));
  }
  /** 深拷贝 */
  clone(): ArcCurve { return new ArcCurve(this.start.clone(), this.mid.clone(), this.end.clone()); }
  /** 弧长 */
  length(): number {
    const params = this.getArcParams();
    if (!params) return this.start.dist(this.end);
    return params.r * params.sweep;
  }
  getBox(): Box {
    const params = this.getArcParams();
    if (!params) return boundingBox([this.start, this.end]) || { min: new Point2d(0, 0), max: new Point2d(0, 0) };
    const pts = [this.start, this.end];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      if (this.angleIn(a)) {
        pts.push(new Point2d(params.center.x + params.r * Math.cos(a), params.center.y + params.r * Math.sin(a)));
      }
    }
    return boundingBox(pts) || { min: new Point2d(0, 0), max: new Point2d(0, 0) };
  }
  /** 原地变换 */
  transform(t: Transform): void {
    this.start.transform(t);
    this.mid.transform(t);
    this.end.transform(t);
  }
  /** 点 p 到弧的最近点，返回 {x,y,t}，t ∈ [0, 1] */
  nearestPoint(p: Point2d): { x: number; y: number; t: number } | null {
    const params = this.getArcParams();
    if (!params || params.r < 1e-12) return new LineCurve(this.start, this.end).nearestPoint(p);
    const t = this.tAt(p);
    const pt = this.eval(t);
    return pt ? { x: pt.x, y: pt.y, t } : null;
  }
  /** 点 p 到弧的投影参数 t，截断到 [0, 1] */
  tAt(p: Point2d): number {
    const params = this.getArcParams();
    if (!params || Math.abs(params.sweep) < 1e-12) return 0;
    let da = p.sub(params.center).angle() - params.startAngle;
    if (params.sweep > 0) { while (da < 0) da += 2 * Math.PI; while (da > 2 * Math.PI) da -= 2 * Math.PI; }
    else { while (da > 0) da -= 2 * Math.PI; while (da < -2 * Math.PI) da += 2 * Math.PI; }
    return Math.max(0, Math.min(1, da / params.sweep));
  }
  /** 容差相等判断（默认 1e-12） */
  equals(other: ArcCurve, eps = 1e-12): boolean {
    return this.start.equals(other.start, eps) && this.mid.equals(other.mid, eps) && this.end.equals(other.end, eps);
  }
    
  /** 由弧参数创建子弧 */
  static fromSubArc(arc: ArcParams, tStart: number, tEnd: number): ArcCurve {
    const a1 = arc.startAngle + arc.sweep * tStart;
    const a2 = arc.startAngle + arc.sweep * tEnd;
    const aMid = a1 + (a2 - a1) * 0.5;
    const start = new Point2d(arc.center.x + arc.r * Math.cos(a1), arc.center.y + arc.r * Math.sin(a1));
    const mid = new Point2d(arc.center.x + arc.r * Math.cos(aMid), arc.center.y + arc.r * Math.sin(aMid));
    const end = new Point2d(arc.center.x + arc.r * Math.cos(a2), arc.center.y + arc.r * Math.sin(a2));
    return new ArcCurve(start, mid, end);
  }
  /** 在参数 t ∈ [0, 1] 处拆分为两条子弧 */
  split(t: number): [ArcCurve, ArcCurve] {
    const params = this.getArcParams();
    if (!params) {
      const m = this.start.lerp(this.end, t);
      return [new ArcCurve(this.start, this.start.lerp(m, 0.5), m), new ArcCurve(m, m.lerp(this.end, 0.5), this.end)];
    }
    return [ArcCurve.fromSubArc(params, 0, t), ArcCurve.fromSubArc(params, t, 1)];
  }
  /** 判断半径角是否是圆弧内的角 */
  angleIn(angle: number): boolean {
    const arc = this.getArcParams();
    if (!arc) return false;
    let da = angle - arc.startAngle;
    if (arc.sweep > 0) { while (da < 0) da += 2 * Math.PI; while (da > 2 * Math.PI) da -= 2 * Math.PI; }
    else { while (da > 0) da -= 2 * Math.PI; while (da < -2 * Math.PI) da += 2 * Math.PI; }
    return arc.sweep > 0 ? da <= arc.sweep + 1e-12 : da >= arc.sweep - 1e-12;
  }
  /** 等距采样弧，返回离散点序列 */
  static _sample(arc: ArcParams, sampleSteps: number): Point2d[] {
    const { center, r, startAngle, sweep } = arc;
    const total = sweep || 2 * Math.PI;
    const steps = Math.max(4, Math.round(sampleSteps * Math.abs(total) / (2 * Math.PI)));
    const pts: Point2d[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = startAngle + total * (i / steps);
      pts.push(new Point2d(center.x + r * Math.cos(a), center.y + r * Math.sin(a)));
    }
    return pts;
  }
}


/** 折线段：一组点坐标组成的单纯折线 */
export class PointsCurve {
  readonly type = 'points';
  constructor(public points: Point2d[], public closed = false) {}
  /** t ∈ [0, n-1]，整数部分为线段索引，小数部分为段内比例 */
  eval(t: number): Point2d | null {
    const pts = this.points;
    if (!pts || pts.length < 2) return null;
    const n = this.closed ? pts.length : pts.length - 1;
    const idx = Math.max(0, Math.min(Math.floor(t), n - 1));
    const s = t - idx;
    const i0 = Math.min(idx, pts.length - 2);
    const i1 = this.closed ? (i0 + 1) % pts.length : i0 + 1;
    return pts[i0].lerp(pts[i1], s);
  }
  /** 深拷贝 */
  clone(): PointsCurve { return new PointsCurve(this.points.map(p => p.clone()), this.closed); }
  /** 折线总长 */
  length(): number {
    let total = 0;
    for (let i = 0, n = this.points.length; i < n - 1; i++) {
      total += this.points[i].dist(this.points[i + 1]);
    }
    if (this.closed && this.points.length > 1) {
      total += this.points[0].dist(this.points[this.points.length - 1]);
    }
    return total;
  }
  getBox(): Box {
    return boundingBox(this.points) || { min: new Point2d(0, 0), max: new Point2d(0, 0) };
  }
  /** 原地变换 */
  transform(t: Transform): void {
    for (const p of this.points) {
      p.transform(t);
    }
  }
  /** 点 p 到折线的最近点，返回 {x,y,t}，t ∈ [0, n-1] */
  nearestPoint(p: Point2d): { x: number; y: number; t: number } | null {
    if (!this.points || this.points.length < 2) return null;
    let best: { x: number; y: number; t: number } | null = null;
    let bestD = Infinity;
    const last = this.closed ? this.points.length : this.points.length - 1;
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % this.points.length;
      const seg = new LineCurve(this.points[i], this.points[j]).nearestPoint(p);
      const d = p.distSq(new Point2d(seg.x, seg.y));
      if (d < bestD) { bestD = d; best = { x: seg.x, y: seg.y, t: i + seg.t }; }
    }
    return best;
  }
  /** 点 p 到折线的最近点参数 t，截断到 [0, n-1] */
  tAt(p: Point2d): number {
    const pts = this.points;
    if (pts.length < 2) return 0;
    const n = this.closed ? pts.length : pts.length - 1;
    let bestT = 0, bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % pts.length;
      const ab = pts[j].sub(pts[i]);
      const lenSq = ab.lenSq();
      let t = 0;
      if (lenSq > 1e-30) {
        t = Math.max(0, Math.min(1, p.sub(pts[i]).dot(ab) / lenSq));
      }
      const c = pts[i].lerp(pts[j], t);
      const d = p.distSq(c);
      if (d < bestDist) { bestDist = d; bestT = i + t; }
    }
    return bestT;
  }
  /** 容差相等判断（默认 1e-12） */
  equals(other: PointsCurve, eps = 1e-12): boolean {
    if (this.closed !== other.closed || this.points.length !== other.points.length) return false;
    for (let i = 0; i < this.points.length; i++) {
      if (!this.points[i].equals(other.points[i], eps)) return false;
    }
    return true;
  }
  /** 在参数 t ∈ [0, n-1] 处拆分为两条折线 */
  split(t: number): [PointsCurve, PointsCurve] {
    const idx = Math.min(Math.floor(t), this.points.length - 2);
    const s = t - idx;
    if (idx < 0) return [new PointsCurve([], this.closed), this.clone()];
    const left = this.points.slice(0, idx + 1).map(p => p.clone());
    const right = this.points.slice(idx + 1).map(p => p.clone());
    if (s > 1e-12 && idx + 1 < this.points.length) {
      const m = this.points[idx].lerp(this.points[idx + 1], s);
      left.push(m);
      right.unshift(m.clone());
    }
    return [new PointsCurve(left, false), new PointsCurve(right, this.closed)];
  }
  /** 多边形有符号面积（正=逆时针，负=顺时针） */
  static area(pts: Point2d[]): number {
    let area = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const j = (i + 1) % n;
      area += pts[i].cross(pts[j]);
    }
    return area / 2;
  }
  /** 多边形顶点是否逆时针排列 */
  static isCCW(pts: Point2d[]): boolean {
    return PointsCurve.area(pts) > 0;
  }
  /** 多边形周长 */
  static perimeter(pts: Point2d[]): number {
    let perim = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      perim += pts[i].dist(pts[(i + 1) % n]);
    }
    return perim;
  }
  /** 多边形质心（几何中心） */
  static centroid(pts: Point2d[]): Point2d {
    let cx = 0, cy = 0, area = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const j = (i + 1) % n;
      const f = pts[i].cross(pts[j]);
      cx += (pts[i].x + pts[j].x) * f;
      cy += (pts[i].y + pts[j].y) * f;
      area += f;
    }
    area /= 2;
    if (Math.abs(area) < 1e-12) return new Point2d(pts[0]?.x ?? 0, pts[0]?.y ?? 0);
    const s = 1 / (6 * area);
    return new Point2d(cx * s, cy * s);
  }
  /** 射线法判断点是否在多边形内 */
  static pointInPolygon(p: Point2d, polygon: Point2d[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      if (((yi > p.y) !== (yj > p.y)) &&
          (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }
  /** 绕数法判断点是否在多边形内（更稳定） */
  static windingNumber(p: Point2d, polygon: Point2d[]): boolean {
    let wn = 0;
    for (let i = 0, n = polygon.length; i < n; i++) {
      const a = polygon[i], b = polygon[(i + 1) % n];
      if (a.y <= p.y) {
        if (b.y > p.y && b.sub(a).cross(p.sub(a)) > 0) wn++;
      } else {
        if (b.y <= p.y && b.sub(a).cross(p.sub(a)) < 0) wn--;
      }
    }
    return wn !== 0;
  }
}


/** 多段弧：顶点 + 凸度值（0=直线，>0 逆时针弧，<0 顺时针弧） */
export class PolyarcCurve {
  readonly type = 'polyarc';
  constructor(public points: Point2d[], public bulges: number[], public closed = false) {}
  /** t ∈ [0, n-1]，整数部分为段索引 */
  eval(t: number): Point2d | null {
    const pts = this.points;
    const bulges = this.bulges;
    if (!pts || pts.length < 2) return null;
    const n = this.closed ? pts.length : pts.length - 1;
    const idx = Math.max(0, Math.min(Math.floor(t), n - 1));
    const s = t - idx;
    const i0 = Math.min(idx, pts.length - 2);
    const i1 = this.closed ? (i0 + 1) % pts.length : i0 + 1;
    const p0 = pts[i0], p1 = pts[i1];
    const bulge = (bulges && bulges[i0]) || 0;
    if (bulge === 0) return new Point2d(p0.x + (p1.x - p0.x) * s, p0.y + (p1.y - p0.y) * s);
    const chord = p0.dist(p1);
    if (chord < 1e-12) return p0;
    const theta = 4 * Math.atan(Math.abs(bulge));
    const r = chord / (2 * Math.sin(theta / 2));
    const perp = bulge > 0 ? 1 : -1;
    const h = Math.sqrt(Math.max(0, r * r - (chord / 2) * (chord / 2)));
    const nd = p1.sub(p0).normalize().perp();
    const cx = (p0.x + p1.x) / 2 + perp * h * nd.x;
    const cy = (p0.y + p1.y) / 2 + perp * h * nd.y;
    const a0 = Math.atan2(p0.y - cy, p0.x - cx);
    const a1 = Math.atan2(p1.y - cy, p1.x - cx);
    const sweep = bulge > 0
      ? (a1 > a0 ? a1 - a0 : a1 - a0 + 2 * Math.PI)
      : (a1 < a0 ? a1 - a0 : a1 - a0 - 2 * Math.PI);
    const angle = a0 + sweep * s;
    return new Point2d(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  /** 深拷贝 */
  clone(): PolyarcCurve { return new PolyarcCurve(this.points.map(p => p.clone()), [...this.bulges], this.closed); }
  /** 原地变换 */
  transform(t: Transform): void {
    for (const p of this.points) p.transform(t);
  }
  /** 多段弧总长 */
  length(): number {
    const pts = this.points;
    const n = this.closed ? pts.length : pts.length - 1;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % pts.length;
      const p0 = pts[i], p1 = pts[j];
      const bulge = this.bulges[i] || 0;
      const chord = p0.dist(p1);
      if (Math.abs(bulge) < 1e-12) { total += chord; continue; }
      const theta = 4 * Math.atan(Math.abs(bulge));
      if (Math.abs(Math.sin(theta / 2)) < 1e-12) { total += chord; continue; }
      const r = chord / (2 * Math.sin(theta / 2));
      total += r * theta;
    }
    return total;
  }
  getBox(): Box {
    return boundingBox(this.points) || { min: new Point2d(0, 0), max: new Point2d(0, 0) };
  }
  /** 点 p 到多段弧的最近点，返回 {x,y,t}，t ∈ [0, n-1] */
  nearestPoint(p: Point2d): { x: number; y: number; t: number } | null {
    const pts = this.points;
    const bulges = this.bulges;
    if (!pts || pts.length < 2) return null;
    let best: { x: number; y: number; t: number } | null = null;
    let bestD = Infinity;
    const n = this.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const j = this.closed ? (i + 1) % pts.length : Math.min(i + 1, pts.length - 1);
      const p1 = pts[i], p2 = pts[j];
      const bulge = (bulges && bulges[i]) || 0;
      let c: { x: number; y: number; t: number } | null = null;
      const asLine = () => new LineCurve(p1, p2).nearestPoint(p);
      if (Math.abs(bulge) < 1e-10) {
        c = asLine();
        if (c) c.t = i + c.t;
      } else {
        const chord = p1.dist(p2);
        if (chord < 1e-12) { c = { x: p1.x, y: p1.y, t: i }; continue; }
        const theta = 4 * Math.atan(Math.abs(bulge));
        const r = chord / (2 * Math.sin(theta / 2));
        if (r < 1e-12) {
          c = asLine();
          if (c) c.t = i + c.t;
        } else {
          const perp = bulge > 0 ? 1 : -1;
          const h = Math.sqrt(Math.max(0, r * r - (chord / 2) * (chord / 2)));
          const ndx = -(p2.y - p1.y) / chord, ndy = (p2.x - p1.x) / chord;
          const cx = (p1.x + p2.x) / 2 + perp * h * ndx;
          const cy = (p1.y + p2.y) / 2 + perp * h * ndy;
          const a0 = Math.atan2(p1.y - cy, p1.x - cx);
          const a1 = Math.atan2(p2.y - cy, p2.x - cx);
          const sweep = bulge > 0
            ? (a1 > a0 ? a1 - a0 : a1 - a0 + 2 * Math.PI)
            : (a1 < a0 ? a1 - a0 : a1 - a0 - 2 * Math.PI);
          const aPt = Math.atan2(p.y - cy, p.x - cx);
          let da = aPt - a0;
          if (sweep > 0) { while (da < 0) da += 2 * Math.PI; while (da > 2 * Math.PI) da -= 2 * Math.PI; }
          else { while (da > 0) da -= 2 * Math.PI; while (da < -2 * Math.PI) da += 2 * Math.PI; }
          const st = Math.max(0, Math.min(1, da / sweep));
          const angle = a0 + sweep * st;
          c = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, t: i + st };
        }
      }
      if (c) { const d = p.dist(new Point2d(c.x, c.y)); if (d < bestD) { bestD = d; best = c; } }
    }
    return best;
  }
  /** 点 p 到多段弧的最近点参数 t（采样搜索），截断到 [0, n-1] */
  tAt(p: Point2d): number {
    return SplineFitCurve.curveAt(this, p, 100);
  }
  /** 在参数 t ∈ [0, n-1] 处拆分为两条多段弧 */
  split(t: number): [PolyarcCurve, PolyarcCurve] {
    const pts = this.points;
    if (pts.length < 2) return [this.clone(), new PolyarcCurve([pts[0]], [0], false)];
    const n = this.closed ? pts.length : pts.length - 1;
    const idx = Math.max(0, Math.min(Math.floor(t), n - 1));
    const p = this.eval(t);
    if (!p) return [this.clone(), new PolyarcCurve([pts[0]], [0], false)];
    const leftPts = pts.slice(0, idx + 1);
    const leftBulges = this.bulges.slice(0, idx);
    leftPts.push(p);
    leftBulges.push(0);
    const rightPts = [p, ...pts.slice(idx + 1)];
    const rightBulges = [0, ...this.bulges.slice(idx + 1)];
    return [new PolyarcCurve(leftPts, leftBulges, false), new PolyarcCurve(rightPts, rightBulges, this.closed)];
  }
  /** 容差相等判断（默认 1e-12） */
  equals(other: PolyarcCurve, eps = 1e-12): boolean {
    if (this.closed !== other.closed || this.points.length !== other.points.length || this.bulges.length !== other.bulges.length) return false;
    for (let i = 0; i < this.points.length; i++) {
      if (!this.points[i].equals(other.points[i], eps)) return false;
    }
    for (let i = 0; i < this.bulges.length; i++) {
      if (Math.abs(this.bulges[i] - other.bulges[i]) >= eps) return false;
    }
    return true;
  }
}


/** 插值样条：曲线精确通过所有控制点（Catmull-Rom → 三次贝塞尔） */
export class SplineFitCurve {
  readonly type = 'spline_fit';
  constructor(public points: Point2d[], public closed = false, public degree = 3) {}
  private static _cubicBezier(p0: Point2d, p1: Point2d, p2: Point2d, p3: Point2d, t: number): Point2d {
    const u = 1 - t, u2 = u * u, u3 = u2 * u, t2 = t * t, t3 = t2 * t;
    return new Point2d(
      u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
      u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
    );
  }
  /** Catmull-Rom → 三次贝塞尔段，返回每段的控制点 */
  static toCubicBezierSegments(pts: Point2d[], closed: boolean): CubicBezierSegment[] {
    if (pts.length < 2) return [];
    const n = closed ? pts.length : pts.length - 1;
    const segs: CubicBezierSegment[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % pts.length;
      const i0 = closed ? (i - 1 + pts.length) % pts.length : Math.max(0, i - 1);
      const i3 = closed ? (i + 2) % pts.length : Math.min(i + 2, pts.length - 1);
      const p0 = pts[i0], p1 = pts[i], p2 = pts[j], p3 = pts[i3];
      const b1 = p1.add(p2.sub(p0).scale(1 / 6));
      const b2 = p2.sub(p3.sub(p1).scale(1 / 6));
      segs.push({ from: p1, cp1: b1, cp2: b2, to: p2 });
    }
    return segs;
  }
  /** t ∈ [0, n-1]，整数部分为段索引 */
  eval(t: number): Point2d | null {
    const pts = this.points;
    if (!pts || pts.length < 2) return null;
    const n = this.closed ? pts.length : pts.length - 1;
    const idx = Math.max(0, Math.min(Math.floor(t), n - 1));
    const s = t - idx;
    const deg = this.degree || 3;
    if (deg === 3 && pts.length >= 2) {
      const i0 = Math.max(0, idx - 1);
      const i1 = Math.min(idx, pts.length - 1);
      const i2 = Math.min(idx + 1, pts.length - 1);
      const i3 = Math.min(idx + 2, pts.length - 1);
      const p0 = pts[i0], p1 = pts[i1], p2 = pts[i2], p3 = pts[i3];
      const b1 = p1.add(p2.sub(p0).scale(1 / 6));
      const b2 = p2.sub(p3.sub(p1).scale(1 / 6));
      return SplineFitCurve._cubicBezier(p1, b1, b2, p2, s);
    }
    const i = Math.max(0, Math.min(idx, pts.length - 2));
    const j = i + 1;
    return pts[i].lerp(pts[j], s);
  }
  /** 深拷贝 */
  clone(): SplineFitCurve { return new SplineFitCurve(this.points.map(p => p.clone()), this.closed, this.degree); }
  /** 原地变换 */
  transform(t: Transform): void {
    for (const p of this.points) p.transform(t);
  }
  /** 在参数 t ∈ [0, n-1] 处拆分为两条样条 */
  split(t: number): [SplineFitCurve, SplineFitCurve] {
    const idx = Math.max(0, Math.min(Math.floor(t), this.points.length - 2));
    const pts = this.points;
    const left = pts.slice(0, idx + 1);
    const right = pts.slice(idx + 1);
    const p = this.eval(t);
    if (p) {
      left.push(p);
      right.unshift(p);
    }
    return [new SplineFitCurve(left, false, this.degree), new SplineFitCurve(right, this.closed, this.degree)];
  }
  /** 采样计算曲线长度 */
  static curveLength(curve: { eval: (t: number) => Point2d | null }, steps: number): number {
    let total = 0, prev: Point2d | null = null;
    for (let i = 0; i <= steps; i++) {
      const p = curve.eval(i / steps);
      if (p && prev) total += p.dist(prev);
      prev = p;
    }
    return total;
  }
  /** 采样搜索曲线上离 p 最近点的参数 t */
  static curveAt(curve: { eval: (t: number) => Point2d | null; closed: boolean; points: any[] }, p: Point2d, steps: number): number {
    const n = curve.closed ? curve.points.length : curve.points.length - 1;
    if (n <= 0) return 0;
    let bestT = 0, bestDist = Infinity;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * n;
      const q = curve.eval(t);
      if (!q) continue;
      const d = q.distSq(p);
      if (d < bestDist) { bestDist = d; bestT = t; }
    }
    return bestT;
  }
  /** 曲线长度（数值积分采样） */
  length(): number {
    return SplineFitCurve.curveLength(this, 50);
  }
  getBox(): Box {
    return boundingBox(this.points) || { min: new Point2d(0, 0), max: new Point2d(0, 0) };
  }
  /** 点 p 到曲线的最近点，返回 {x,y,t}，t ∈ [0, n-1] */
  nearestPoint(p: Point2d): { x: number; y: number; t: number } | null {
    const pts = this.points;
    if (!pts || pts.length < 2) return null;
    const N = 64;
    let best: { x: number; y: number; t: number } | null = null;
    let bestD = Infinity;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * (pts.length - 1);
      const q = this.eval(t);
      if (!q) continue;
      const d = p.distSq(q);
      if (d < bestD) { bestD = d; best = { x: q.x, y: q.y, t }; }
    }
    return best;
  }
  /** 点 p 到曲线的最近点参数 t（采样搜索），截断到 [0, n-1] */
  tAt(p: Point2d): number {
    return SplineFitCurve.curveAt(this, p, 100);
  }
  /** 容差相等判断（默认 1e-12） */
  equals(other: SplineFitCurve, eps = 1e-12): boolean {
    if (this.closed !== other.closed || this.degree !== other.degree || this.points.length !== other.points.length) return false;
    for (let i = 0; i < this.points.length; i++) {
      if (!this.points[i].equals(other.points[i], eps)) return false;
    }
    return true;
  }
}

/** 控制点样条：曲线逼近控制点（均匀三次 B 样条） */
export class SplineCvCurve {
  readonly type = 'spline_cv';
  constructor(public points: Point2d[], public closed = false, public degree = 3, public knots?: number[]) {}
  /** t ∈ [0, n-1]，整数部分为段索引 */
  eval(t: number): Point2d | null {
    const pts = this.points;
    if (!pts || pts.length < 2) return null;
    const n = this.closed ? pts.length : pts.length - 1;
    const idx = Math.max(0, Math.min(Math.floor(t), n - 1));
    const s = t - idx;
    const deg = this.degree || 3;
    if (deg === 3 && pts.length >= 4) {
      const i = Math.max(0, Math.min(idx, pts.length - 4));
      const p0 = pts[i], p1 = pts[i + 1], p2 = pts[i + 2], p3 = pts[i + 3];
      const u = s, u2 = u * u, u3 = u2 * u;
      return new Point2d(
        (p0.x * (-u3 + 3 * u2 - 3 * u + 1) +
            p1.x * (3 * u3 - 6 * u2 + 4) +
            p2.x * (-3 * u3 + 3 * u2 + 3 * u + 1) +
            p3.x * u3) / 6,
        (p0.y * (-u3 + 3 * u2 - 3 * u + 1) +
            p1.y * (3 * u3 - 6 * u2 + 4) +
            p2.y * (-3 * u3 + 3 * u2 + 3 * u + 1) +
            p3.y * u3) / 6,
      );
    }
    const i = Math.max(0, Math.min(idx, pts.length - 2));
    const j = i + 1;
    return pts[i].lerp(pts[j], s);
  }
  /** 在参数 t ∈ [0, n-1] 处拆分为两条样条 */
  split(t: number): [SplineCvCurve, SplineCvCurve] {
    const idx = Math.max(0, Math.min(Math.floor(t), this.points.length - 2));
    const pts = this.points;
    const left = pts.slice(0, idx + 1);
    const right = pts.slice(idx + 1);
    const p = this.eval(t);
    if (p) {
      left.push(p);
      right.unshift(p);
    }
    return [new SplineCvCurve(left, false, this.degree), new SplineCvCurve(right, this.closed, this.degree)];
  }
  /** 深拷贝 */
  clone(): SplineCvCurve { return new SplineCvCurve(this.points.map(p => p.clone()), this.closed, this.degree, this.knots?.slice()); }
  /** 原地变换 */
  transform(t: Transform): void {
    for (const p of this.points) p.transform(t);
  }
  /** 曲线长度（数值积分采样） */
  length(): number {
    return SplineFitCurve.curveLength(this, 50);
  }
  getBox(): Box {
    return boundingBox(this.points) || { min: new Point2d(0, 0), max: new Point2d(0, 0) };
  }
  /** 点 p 到曲线的最近点，返回 {x,y,t}，t ∈ [0, n-1] */
  nearestPoint(p: Point2d): { x: number; y: number; t: number } | null {
    const pts = this.points;
    if (!pts || pts.length < 2) return null;
    const d = this.degree || 3;
    const total = this.closed ? pts.length : pts.length - d;
    const N = 64;
    let best: { p: Point2d; t: number } | null = null;
    let bestD = Infinity;
    for (let i = 0; i <= N; i++) {
      const t = total * i / N;
      const pt = this.eval(t);
      if (!pt) continue;
      const dsq = p.distSq(pt);
      if (dsq < bestD) { bestD = dsq; best = { p: pt, t }; }
    }
    if (best) {
      for (let iter = 0; iter < 8; iter++) {
        const step = total / N / Math.pow(2, iter + 1);
        for (const dir of [-1, 1]) {
          const t2 = Math.max(0, Math.min(total, best.t + dir * step));
          const p2 = this.eval(t2);
          if (!p2) continue;
          const d2 = p.distSq(p2);
          if (d2 < bestD) { bestD = d2; best = { p: p2, t: t2 }; }
        }
      }
    }
    return best ? { x: best.p.x, y: best.p.y, t: best.t } : null;
  }
  /** 均匀 B 样条求值（de Boor 算法，端点插值），u 为参数值 */
  static evalBSpline(pts: Point2d[], u: number, degree: number = 3): Point2d {
    const m = pts.length, d = degree;
    const last = m - d;
    const U: number[] = [];
    for (let i = 0; i <= d; i++) U.push(0);
    for (let i = 1; i < last; i++) U.push(i);
    for (let i = 0; i <= d; i++) U.push(last);
    const uu = Math.max(0, Math.min(u, last - 1e-10));
    let k = d;
    while (k < U.length - 1 && U[k + 1] <= uu) k++;
    const dv: Point2d[] = [];
    for (let j = 0; j <= d; j++) dv.push(pts[k - d + j].clone());
    for (let r = 1; r <= d; r++) {
      for (let j = d; j >= r; j--) {
        const num = uu - U[k - d + j];
        const den = U[k + j - r + 1] - U[k - d + j];
        const alpha = den < 1e-12 ? 0 : num / den;
        dv[j] = dv[j - 1].lerp(dv[j], alpha);
      }
    }
    return dv[d];
  }
  /** 点 p 到曲线的最近点参数 t（采样搜索），截断到 [0, n-1] */
  tAt(p: Point2d): number {
    return SplineFitCurve.curveAt(this, p, 100);
  }
  /** 容差相等判断（默认 1e-12） */
  equals(other: SplineCvCurve, eps = 1e-12): boolean {
    if (this.closed !== other.closed || this.degree !== other.degree || this.points.length !== other.points.length) return false;
    for (let i = 0; i < this.points.length; i++) {
      if (!this.points[i].equals(other.points[i], eps)) return false;
    }
    if (this.knots && other.knots) {
      if (this.knots.length !== other.knots.length) return false;
      for (let i = 0; i < this.knots.length; i++) {
        if (Math.abs(this.knots[i] - other.knots[i]) >= eps) return false;
      }
    } else if (this.knots !== other.knots) return false;
    return true;
  }
}

export type SimpleCurve = LineCurve | ArcCurve | CircleCurve | PointsCurve | PolyarcCurve | SplineFitCurve | SplineCvCurve;


/** 子段类型 — 合成曲线(CompositeCurve)的基本单元 */
export interface CurveSegment {
  curve: SimpleCurve;
  start: number;
  end: number;
}

/** 合成曲线：由子段（直线/弧/曲线引用）组合而成的复杂曲线 */
export class CompositeCurve {
  readonly type = 'composite';
  constructor(public segments: CurveSegment[], public closed = false) {}
  /** t ∈ [0, n-1]，整数部分为子段索引，localT 映射到子段的 [start, end] */
  eval(t: number): Point2d | null {
    const segs = this.segments;
    if (!segs || segs.length === 0) return null;
    const n = segs.length;
    const idx = Math.max(0, Math.min(Math.floor(t), n - 1));
    const s = t - idx;
    const seg = segs[idx];
    const localT = seg.start + (seg.end - seg.start) * s;
    return seg.curve.eval(localT);
  }
  /** 深拷贝（递归克隆所有子段曲线） */
  clone(): CompositeCurve {
    return new CompositeCurve(this.segments.map(s => ({ curve: s.curve.clone(), start: s.start, end: s.end })), this.closed);
  }
  /** 原地变换 */
  transform(t: Transform): void {
    for (const seg of this.segments) {
      (seg.curve as any).transform?.(t);
    }
  }
  /** 合成曲线总长（采样积分） */
  length(): number {
    let total = 0;
    const stepsPerSeg = 20;
    for (const seg of this.segments) {
      const localRange = Math.abs(seg.end - seg.start);
      if (localRange < 1e-30) continue;
      let prev: Point2d | null = null;
      for (let i = 0; i <= stepsPerSeg; i++) {
        const localT = seg.start + (seg.end - seg.start) * (i / stepsPerSeg);
        const p = seg.curve.eval(localT);
        if (p && prev) total += p.dist(prev);
        prev = p;
      }
    }
    return total;
  }
  getBox(): Box {
    const pts: Point2d[] = [];
    for (const seg of this.segments) {
      const box = seg.curve.getBox();
      if (box) { pts.push(box.min, box.max); }
    }
    return boundingBox(pts) || { min: new Point2d(0, 0), max: new Point2d(0, 0) };
  }
  /** 点 p 到合成曲线的最近点，返回 {x,y,t}，t ∈ [0, n-1] */
  nearestPoint(p: Point2d): { x: number; y: number; t: number } | null {
    const n = this.segments.length;
    if (n === 0) return null;
    let best: { x: number; y: number; t: number } | null = null;
    let bestD = Infinity;
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * n;
      const q = this.eval(t);
      if (!q) continue;
      const d = p.distSq(q);
      if (d < bestD) { bestD = d; best = { x: q.x, y: q.y, t }; }
    }
    return best;
  }
  /** 点 p 到合成曲线的最近点参数 t（采样搜索），截断到 [0, n-1] */
  tAt(p: Point2d): number {
    const n = this.segments.length;
    if (n === 0) return 0;
    let bestT = 0, bestDist = Infinity;
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * n;
      const q = this.eval(t);
      if (!q) continue;
      const d = p.distSq(q);
      if (d < bestDist) { bestDist = d; bestT = t; }
    }
    return bestT;
  }
  /** 容差相等判断（默认 1e-12） */
  equals(other: CompositeCurve, eps = 1e-12): boolean {
    if (this.closed !== other.closed || this.segments.length !== other.segments.length) return false;
    for (let i = 0; i < this.segments.length; i++) {
      const a = this.segments[i], b = other.segments[i];
      if (Math.abs(a.start - b.start) >= eps || Math.abs(a.end - b.end) >= eps) return false;
      if (!(a.curve as any).equals?.(b.curve as any, eps)) return false;
    }
    return true;
  }
  /** 离散采样合成曲线 */
  static _sample(curve: CompositeCurve, stepsPerSegment: number = 16): Point2d[] {
    const segs = curve.segments;
    if (!segs || segs.length === 0) return [];
    const result: Point2d[] = [];
    for (let i = 0; i <= segs.length * stepsPerSegment; i++) {
      const p = curve.eval(i / stepsPerSegment);
      if (p) result.push(p);
    }
    return result;
  }
  /** 在参数 t ∈ [0, n-1] 处拆分为两条合成曲线 */
  split(t: number): [CompositeCurve, CompositeCurve] {
    const segs = this.segments;
    if (!segs || segs.length === 0) return [this.clone(), new CompositeCurve([], false)];
    const n = segs.length;
    const idx = Math.max(0, Math.min(Math.floor(t), n - 1));
    const s = t - idx;
    const seg = segs[idx];
    const localT = seg.start + (seg.end - seg.start) * s;
    const [leftSub, rightSub] = (seg.curve as any).split?.(localT) ?? [seg.curve, seg.curve];
    const leftSegs = segs.slice(0, idx).map(s => ({ curve: s.curve.clone(), start: s.start, end: s.end }));
    leftSegs.push({ curve: leftSub, start: seg.start, end: seg.start + (seg.end - seg.start) * s });
    const rightSegs = [{ curve: rightSub, start: seg.start + (seg.end - seg.start) * s, end: seg.end }];
    for (let i = idx + 1; i < segs.length; i++) {
      rightSegs.push({ curve: segs[i].curve.clone(), start: segs[i].start, end: segs[i].end });
    }
    return [new CompositeCurve(leftSegs, false), new CompositeCurve(rightSegs, this.closed)];
  }
}

export type Curve = CompositeCurve | SimpleCurve;


/** 区域：由外轮廓 + 内部岛屿组成，轮廓和岛屿必须是封闭曲线 */
// ═══════════════════════════════════════════
//  曲线求交
// ═══════════════════════════════════════════

export interface CurveIntersection {
  point: Point2d;
  tA: number;
  tB: number;
}

/** 两条曲线求交，返回交点及其在各自曲线上的参数 t */
export function intersectCurves(a: Curve, b: Curve): CurveIntersection[] {
  if (a.type === 'line' && b.type === 'line') return intersectLineLine(a, b);
  if (a.type === 'line' && b.type === 'circle') return intersectLineCircle(a, b);
  if (a.type === 'circle' && b.type === 'line') return intersectLineCircle(b, a);
  if (a.type === 'circle' && b.type === 'circle') return intersectCircleCircle(a, b);
  if (a.type === 'line' && b.type === 'arc') return intersectLineArc(a, b);
  if (a.type === 'arc' && b.type === 'line') return intersectLineArc(b, a);
  if (a.type === 'circle' && b.type === 'arc') return intersectCircleArc(a, b);
  if (a.type === 'arc' && b.type === 'circle') return intersectCircleArc(b, a);
  if (a.type === 'arc' && b.type === 'arc') return intersectArcArc(a, b);
  return intersectCurvesSampling(a, b);
}

function intersectLineLine(a: Curve, b: Curve): CurveIntersection[] {
  const la = (a as LineCurve).getLine(), lb = (b as LineCurve).getLine();
  const pt = la.intersect(lb);
  if (!pt) return [];
  const ta = (a as LineCurve).tAt(pt);
  const tb = (b as LineCurve).tAt(pt);
  if (ta < 0 || ta > 1 || tb < 0 || tb > 1) return [];
  return [{ point: pt, tA: ta, tB: tb }];
}

function intersectLineCircle(a: Curve, b: Curve): CurveIntersection[] {
  const pts = (b as CircleCurve).lineIntersect(a as LineCurve);
  const results: CurveIntersection[] = [];
  for (const pt of pts) {
    const ta = (a as LineCurve).tAt(pt);
    if (ta < 0 || ta > 1) continue;
    const tb = (b as CircleCurve).tAt(pt);
    results.push({ point: pt, tA: ta, tB: tb });
  }
  return results;
}

function intersectCircleCircle(a: Curve, b: Curve): CurveIntersection[] {
  const pts = (a as CircleCurve).circleIntersect(b as CircleCurve);
  return pts.map(pt => ({
    point: pt,
    tA: (a as CircleCurve).tAt(pt),
    tB: (b as CircleCurve).tAt(pt),
  }));
}

function intersectLineArc(a: Curve, b: Curve): CurveIntersection[] {
  const arcCurve = b as ArcCurve;
  const params = arcCurve.getArcParams();
  if (!params) return [];
  const circle = new CircleCurve(params.center, params.r);
  const pts = circle.lineIntersect(a as LineCurve);
  const results: CurveIntersection[] = [];
  for (const pt of pts) {
    const ta = (a as LineCurve).tAt(pt);
    if (ta < 0 || ta > 1) continue;
    if (!arcCurve.angleIn(Math.atan2(pt.y - params.center.y, pt.x - params.center.x))) continue;
    const tb = arcCurve.tAt(pt);
    results.push({ point: pt, tA: ta, tB: tb });
  }
  return results;
}

function intersectCircleArc(a: Curve, b: Curve): CurveIntersection[] {
  const arcCurve = b as ArcCurve;
  const params = arcCurve.getArcParams();
  if (!params) return [];
  const arcCircle = new CircleCurve(params.center, params.r);
  const pts = (a as CircleCurve).circleIntersect(arcCircle);
  const results: CurveIntersection[] = [];
  for (const pt of pts) {
    if (!arcCurve.angleIn(Math.atan2(pt.y - params.center.y, pt.x - params.center.x))) continue;
    const ta = (a as CircleCurve).tAt(pt);
    const tb = arcCurve.tAt(pt);
    results.push({ point: pt, tA: ta, tB: tb });
  }
  return results;
}

function intersectArcArc(a: Curve, b: Curve): CurveIntersection[] {
  const arcA = a as ArcCurve, arcB = b as ArcCurve;
  const paramsA = arcA.getArcParams(), paramsB = arcB.getArcParams();
  if (!paramsA || !paramsB) return [];
  const circleA = new CircleCurve(paramsA.center, paramsA.r);
  const circleB = new CircleCurve(paramsB.center, paramsB.r);
  const pts = circleA.circleIntersect(circleB);
  const results: CurveIntersection[] = [];
  for (const pt of pts) {
    if (!arcA.angleIn(Math.atan2(pt.y - paramsA.center.y, pt.x - paramsA.center.x))) continue;
    if (!arcB.angleIn(Math.atan2(pt.y - paramsB.center.y, pt.x - paramsB.center.x))) continue;
    const ta = arcA.tAt(pt);
    const tb = arcB.tAt(pt);
    results.push({ point: pt, tA: ta, tB: tb });
  }
  return results;
}

function intersectCurvesSampling(a: Curve, b: Curve): CurveIntersection[] {
  const steps = 50;
  const results: CurveIntersection[] = [];
  for (let i = 0; i <= steps; i++) {
    const ta = i / steps;
    const pa = a.eval(ta);
    if (!pa) continue;
    for (let j = 0; j <= steps; j++) {
      const tb = j / steps;
      const pb = b.eval(tb);
      if (!pb) continue;
      if (pa.dist(pb) < 1e-6) {
        if (!results.some(r => r.point.dist(pa) < 1e-6)) {
          results.push({ point: pa, tA: ta, tB: tb });
        }
      }
    }
  }
  return results;
}

/** 获取曲线参数范围的最大值（t 的右端点） */
function getCurveMaxT(c: Curve): number {
  if (c.type === 'line' || c.type === 'circle' || c.type === 'arc') return 1;
  if (c.type === 'composite') return c.segments.length;
  const pts = (c as any).points;
  const closed = (c as any).closed;
  return closed ? pts.length : pts.length - 1;
}

/** 在参数 t 处拆分曲线，返回 [左子段, 右子段] */
function splitCurveAt(c: Curve, t: number): [Curve, Curve] {
  const fn = (c as any).split as ((t: number) => [Curve, Curve]) | undefined;
  if (fn) return fn.call(c, t);
  const mid = c.eval(t);
  if (!mid) return [c, c];
  if (c.type === 'line') return (c as LineCurve).split(t);
  if (c.type === 'arc') return (c as ArcCurve).split(t);
  if (c.type === 'circle') return (c as CircleCurve).split(t);
  if (c.type === 'composite') return (c as CompositeCurve).split(t);
  return [c, c];
}

export class Region {
  readonly type = 'region';
  constructor(
    /** 外轮廓（须闭合） */
    public contour: Curve,
    /** 内部岛屿列表 */
    public island: Curve[] = [],
    public id?: string
  ) {}

  /** 深拷贝 */
  clone(): Region {
    return new Region(
      (this.contour as any).clone(),
      this.island.map(c => (c as any).clone()),
      this.id,
    );
  }

  /** 容差相等判断 */
  equals(other: Region, eps = 1e-12): boolean {
    if (!(this.contour as any).equals?.(other.contour, eps)) return false;
    if (this.island.length !== other.island.length) return false;
    for (let i = 0; i < this.island.length; i++) {
      if (!(this.island[i] as any).equals?.(other.island[i], eps)) return false;
    }
    return true;
  }

  /** 原地变换 */
  transform(t: Transform): void {
    (this.contour as any).transform(t);
    for (const c of this.island) {
      (c as any).transform(t);
    }
  }
  
  static findEnclosedRegions(edges: Edge[]): Region {
    const eps = 1e-8;
    const points: Point2d[] = [];
    const findPt = (p: Point2d): Point2d => {
      for (const q of points) if ((q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y) < eps * eps) return q;
      const np = new Point2d(p.x, p.y);
      points.push(np);
      return np;
    };

    const halfEdges = new Map<string, HalfEdge[]>();
    const key = (p: Point2d): string => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;

    for (const e of edges) {
      const from = findPt(e.from), to = findPt(e.to);
      const fk = key(from), tk = key(to);
      const d = { x: to.x - from.x, y: to.y - from.y };
      const angle = Math.atan2(d.y, d.x);
      const he: HalfEdge = { to, angle, twin: null, used: false, id: e.id ?? '' };
      const twin: HalfEdge = {
        to: from, angle: CircleCurve.normalizeAngle(angle + Math.PI),
        twin: he, used: false, id: e.id ?? '',
      };
      he.twin = twin;

      if (!halfEdges.has(fk)) halfEdges.set(fk, []);
      if (!halfEdges.has(tk)) halfEdges.set(tk, []);
      halfEdges.get(fk)!.push(he);
      halfEdges.get(tk)!.push(twin);
    }

    for (const [, list] of halfEdges) {
      list.sort((a, b) => a.angle - b.angle);
    }

    const nextHalfEdge = (he: HalfEdge): HalfEdge | null => {
      const fk = key(he.to);
      const list = halfEdges.get(fk);
      if (!list || list.length === 0) return null;
      const idx = list.indexOf(he.twin!);
      if (idx === -1) return null;
      return list[(idx + 1) % list.length];
    };

    const rawCycles: Point2d[][] = [];
    for (const [, list] of halfEdges) {
      for (const start of list) {
        if (start.used) continue;
        const pts: Point2d[] = [];
        let he: HalfEdge | null = start;
        do {
          he.used = true;
          if (he.twin) he.twin.used = true;
          pts.push(new Point2d(he.to.x, he.to.y));
          he = nextHalfEdge(he);
          if (!he) break;
        } while (he !== start && !he.used);
        if (he === start && pts.length >= 3 && Math.abs(PointsCurve.area(pts)) > 1e-8) {
          rawCycles.push(pts);
        }
      }
    }
    if (rawCycles.length === 0) return new Region(new PointsCurve([], true));
    rawCycles.sort((a, b) => Math.abs(PointsCurve.area(b)) - Math.abs(PointsCurve.area(a)));
    const toClosed = (pts: Point2d[]): PointsCurve => {
      return new PointsCurve(pts.map(p => p.clone()), true);
    };
    const contour = rawCycles[0];
    const islands: Curve[] = [];
    for (let i = 1; i < rawCycles.length; i++) {
      if (PointsCurve.pointInPolygon(rawCycles[i][0], contour)) {
        islands.push(toClosed(rawCycles[i]));
      }
    }
    return new Region(toClosed(contour), islands);
  }

  /**
   * 从一组曲线中提取封闭区域（围合区域检测）
   * 支持所有 Curve 子类型：line/circle/arc/points/polyarc/spline_fit/spline_cv/composite
   * @param curves 曲线列表
   * @returns Region
   */
  static findEnclosedRegionsFromCurves(curves: Curve[]): Region {
    const edges: Edge[] = [];
    // 1. 两两求交，收集每根曲线上的交点和端点参数 t
    const allTs: number[][] = curves.map(c => {
      const maxT = getCurveMaxT(c);
      return [0, maxT];
    });
    for (let i = 0; i < curves.length; i++) {
      for (let j = i + 1; j < curves.length; j++) {
        const xs = intersectCurves(curves[i], curves[j]);
        for (const x of xs) {
          allTs[i].push(x.tA);
          allTs[j].push(x.tB);
        }
      }
    }
    // 2. 按 t 排序去重，拆分曲线为子段 Edge
    for (let i = 0; i < curves.length; i++) {
      const c = curves[i];
      let ts = allTs[i];
      ts.sort((a, b) => a - b);
      const uniq: number[] = [];
      for (const t of ts) if (uniq.length === 0 || Math.abs(t - uniq[uniq.length - 1]) > 1e-10) uniq.push(t);
      const hasInternal = uniq.length > 2;
      if (hasInternal) {
        let current: Curve = c;
        let offset = 0;
        for (let k = 0; k < uniq.length - 1; k++) {
          const t0 = uniq[k], t1 = uniq[k + 1];
          if (Math.abs(t1 - t0) < 1e-12) continue;
          const relT = (t1 - offset) / (getCurveMaxT(current) - offset + 1e-30);
          const [left, right] = splitCurveAt(current, Math.min(relT, 0.999999));
          const from = c.eval(t0);
          const to = c.eval(t1);
          if (from && to) edges.push({ from, to, curve: left, id: `c${i}_seg${k}` });
          current = right;
          offset = t0;
        }
      } else {
        // 无交点，采样为多段 Edge（确保闭合曲线能形成环）
        const maxT = getCurveMaxT(c);
        if (c.type === 'line') {
          const from = c.eval(0), to = c.eval(maxT);
          if (from && to) edges.push({ from, to, curve: c, id: `c${i}` });
        } else {
          const steps = c.type === 'circle' ? 32 : Math.max(16, Math.ceil(maxT));
          for (let k = 0; k < steps; k++) {
            const t0 = (k / steps) * maxT, t1 = ((k + 1) / steps) * maxT;
            const from = c.eval(t0), to = c.eval(t1);
            if (from && to) edges.push({ from, to, id: `c${i}_samp${k}` });
          }
        }
      }
    }
    return Region.findEnclosedRegions(edges);
  }
}

/** 一组点的包围盒，空数组返回 null */
export function boundingBox(pts: Point2d[]): Box | null {
  if (!pts || !pts.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { min: new Point2d(minX, minY), max: new Point2d(maxX, maxY) };
}

/** 两包围盒是否相交（碰撞检测） */
export function bboxIntersect(a: Box, b: Box): boolean {
  return !(a.max.x < b.min.x || a.min.x > b.max.x ||
           a.max.y < b.min.y || a.min.y > b.max.y);
}

/** 多边形几何中心（鞋带公式，pts 为任意 {x,y}[] 且首尾不必重复） */
export function polygonCentroid(pts: { x: number; y: number }[]): Point2d {
  let cx = 0, cy = 0, area = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const j = (i + 1) % n;
    const f = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    cx += (pts[i].x + pts[j].x) * f;
    cy += (pts[i].y + pts[j].y) * f;
    area += f;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) return new Point2d(pts[0]?.x ?? 0, pts[0]?.y ?? 0);
  const s = 1 / (6 * area);
  return new Point2d(cx * s, cy * s);
}

// 辅助函数
/** 角度 */
export function angleDeg(cx: number, cy: number, x: number, y: number): number {
  return (new Point2d(x - cx, y - cy).angle() * 180 / Math.PI + 360) % 360;
}

/** 弧度 */
export function angleRad(cx: number, cy: number, x: number, y: number): number {
  const a = new Point2d(x - cx, y - cy).angle();
  return a < 0 ? a + Math.PI * 2 : a;
}

// 辅助：将点 (x,y) 绕 (cx,cy) 旋转 angleDeg 度，返回旋转后的坐标
export function rotatePoint(x: number, y: number, cx: number, cy: number, angleDeg: number): { x: number; y: number } {
    const v = new Point2d(x - cx, y - cy).rotate(angleDeg * Math.PI / 180);
    return { x: cx + v.x, y: cy + v.y };
  }


/** 将数值 v 限制在 [min, max] 范围内 */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}


