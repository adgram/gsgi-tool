/**
 * Transform - 2D 仿射变换
 *
 * 使用 2×3 矩阵 [a, b, tx; c, d, ty] 表示变换，
 * 支持平移（translation）、缩放（scaling）、旋转（rotation）及复合变换。
 *
 * 矩阵乘法：result = this * t（先应用 t，再应用 this）
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export class Transform {
  // 构造函数参数对应 2×3 矩阵分量：a,b,tx / c,d,ty
  constructor(
    public a: number = 1,
    public b: number = 0,
    public tx: number = 0,
    public c: number = 0,
    public d: number = 1,
    public ty: number = 0
  ) {}

  // 单位变换（恒等变换）
  static identity(): Transform {
    return new Transform();
  }

  // 平移变换：dx 为 X 偏移，dy 为 Y 偏移
  static translation(vec: any): Transform {
    return new Transform(1, 0, vec.x, 0, 1, vec.y);
  }

  // 缩放变换：sx 为 X 方向缩放，sy 为 Y 方向缩放（省略时与 sx 相等）
  static scaling(sx: number, sy: number = sx): Transform {
    return new Transform(sx, 0, 0, 0, sy, 0);
  }

  // 旋转变换：rad 为旋转角度（度），绕原点逆时针旋转
  static rotation(rad: number): Transform {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return new Transform(c, -s, 0, s, c, 0);
  }

  // 旋转变换：绕指定中心点旋转 rad 弧度
  static rotationAbout(center: any, rad: number): Transform {
    const toOrigin = Transform.translation(center.neg());
    const rot = Transform.rotation(rad);
    const fromOrigin = Transform.translation(center);
    return fromOrigin.multiply(rot).multiply(toOrigin);
  }

  // 镜像变换：关于 X 轴镜像（y → -y）
  static mirrorX(): Transform {
    return new Transform(1, 0, 0, 0, -1, 0);
  }

  // 镜像变换：关于 Y 轴镜像（x → -x）
  static mirrorY(): Transform {
    return new Transform(-1, 0, 0, 0, 1, 0);
  }

  // 镜像变换：关于过原点、角度为 rad 的直线镜像
  static mirrorLine(rad: number): Transform {
    const c = Math.cos(rad), s = Math.sin(rad);
    return new Transform(c, s, 0, s, -c, 0);
  }

  // 镜像变换：关于过 pt、角度为 rad 的直线镜像
  static mirrorAbout(pt: any, rad: number): Transform {
    const line = Transform.mirrorLine(rad);
    const toOrigin = Transform.translation(pt.neg());
    const fromOrigin = Transform.translation(pt);
    return fromOrigin.multiply(line).multiply(toOrigin);
  }

  // 镜像变换：关于直线 line 镜像
  static mirrorAboutLine(line: any): Transform {
    const rad = line.direction.angle();
    return Transform.mirrorAbout(line.pt, rad);
  }

  // 将变换应用到点 (x, y)，返回变换后的坐标
  applyTo(x: number, y: number): { x: number; y: number } {
    return {
      x: this.a * x + this.b * y + this.tx,
      y: this.c * x + this.d * y + this.ty
    };
  }

  // 将变换应用到数组形式 [x, y]
  applyToArray(p: [number, number]): [number, number] {
    return [
      this.a * p[0] + this.b * p[1] + this.tx,
      this.c * p[0] + this.d * p[1] + this.ty
    ];
  }

  // 矩阵乘法：返回 this * t 的复合变换（先应用 t，再应用 this）
  multiply(t: Transform): Transform {
    return new Transform(
      this.a * t.a + this.b * t.c,
      this.a * t.b + this.b * t.d,
      this.a * t.tx + this.b * t.ty + this.tx,

      this.c * t.a + this.d * t.c,
      this.c * t.b + this.d * t.d,
      this.c * t.tx + this.d * t.ty + this.ty
    );
  }

  // 转为 2×3 矩阵数组格式 [[a,b,tx],[c,d,ty]]
  toArray(): [[number, number, number], [number, number, number]] {
    return [
      [this.a, this.b, this.tx],
      [this.c, this.d, this.ty]
    ];
  }

  // 从 2×3 矩阵数组创建 Transform 对象（空值返回恒等变换）
  static fromArray(
    m?: [[number, number, number], [number, number, number]] | null
  ): Transform {
    if (!m) return Transform.identity();

    return new Transform(
      m[0][0], m[0][1], m[0][2],
      m[1][0], m[1][1], m[1][2]
    );
  }

  static degToRad(deg: number): number {
    return deg * DEG;
  }

  static radToDeg(rad: number): number {
    return rad * RAD;
  }
}
