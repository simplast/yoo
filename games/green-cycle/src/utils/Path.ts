// 循环闭合路径：敌人沿外圈 + 内圈 + 连接道无限循环移动
import type { Vec2 } from '../types';

/** 单段最大长度（像素），超过则插值中间点保证敌人移动平滑 */
const MAX_SEGMENT_LENGTH = 80;

/**
 * 将 from -> to 的线段按需插值后追加到 points。
 * 只追加中间点和 to，不追加 from（假设 from 已是上一个 push 的点）。
 */
function pushDense(points: Vec2[], from: Vec2, to: Vec2): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len <= 0) return;
  const steps = Math.max(1, Math.ceil(len / MAX_SEGMENT_LENGTH));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    points.push({ x: from.x + dx * t, y: from.y + dy * t });
  }
}

/**
 * 闭合路径。points 首尾自动相连形成闭环。
 * 敌人通过 progress∈[0,1) 在路径上循环移动。
 */
export class Path {
  /** 路径点序列（已去除连续重复点和首尾重复点） */
  readonly points: Vec2[];
  /** 路径总长度 */
  readonly totalLength: number;
  /** 每条线段长度，长度等于 points.length */
  readonly segmentLengths: number[];
  /** 累计长度，cumulativeLengths[i] = 前 i+1 条线段长度之和 */
  readonly cumulativeLengths: number[];

  constructor(points: Vec2[]) {
    // 过滤连续重复点，避免零长度线段导致插值异常
    const clean: Vec2[] = [];
    for (const p of points) {
      const prev = clean.length > 0 ? clean[clean.length - 1] : null;
      if (!prev || prev.x !== p.x || prev.y !== p.y) {
        clean.push({ x: p.x, y: p.y });
      }
    }
    // 若首尾相同则移除末尾点，由闭合逻辑自动连接
    if (clean.length > 1) {
      const first = clean[0];
      const last = clean[clean.length - 1];
      if (first.x === last.x && first.y === last.y) {
        clean.pop();
      }
    }
    this.points = clean;

    const segmentLengths: number[] = [];
    const cumulativeLengths: number[] = [];
    let total = 0;
    const n = clean.length;
    for (let i = 0; i < n; i++) {
      const a = clean[i];
      const b = clean[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      segmentLengths.push(len);
      total += len;
      cumulativeLengths.push(total);
    }
    this.segmentLengths = segmentLengths;
    this.cumulativeLengths = cumulativeLengths;
    this.totalLength = total;
  }

  /**
   * 根据 progress∈[0,1) 返回插值后的坐标。
   * progress >= 1 或 < 0 会自动取模到 [0,1)。
   */
  getPosition(progress: number): Vec2 {
    const p = this.normalize(progress);
    if (this.totalLength <= 0 || this.points.length === 0) {
      return this.points[0] ? { x: this.points[0].x, y: this.points[0].y } : { x: 0, y: 0 };
    }
    const targetDist = p * this.totalLength;
    const idx = this.findSegmentIndex(targetDist);
    const n = this.points.length;
    const a = this.points[idx];
    const b = this.points[(idx + 1) % n];
    const segStart = idx === 0 ? 0 : this.cumulativeLengths[idx - 1];
    const segLen = this.segmentLengths[idx];
    const t = segLen > 0 ? (targetDist - segStart) / segLen : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /**
   * 返回当前 progress 所在线段的索引
   */
  getSegmentIndex(progress: number): number {
    const p = this.normalize(progress);
    if (this.totalLength <= 0) return 0;
    return this.findSegmentIndex(p * this.totalLength);
  }

  /**
   * 返回当前切线方向单位向量
   */
  getDirection(progress: number): Vec2 {
    const p = this.normalize(progress);
    if (this.totalLength <= 0 || this.points.length === 0) {
      return { x: 1, y: 0 };
    }
    const targetDist = p * this.totalLength;
    const idx = this.findSegmentIndex(targetDist);
    const n = this.points.length;
    const a = this.points[idx];
    const b = this.points[(idx + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return { x: 1, y: 0 };
    return { x: dx / len, y: dy / len };
  }

  /** 将 progress 归一化到 [0,1) */
  private normalize(progress: number): number {
    if (!isFinite(progress)) return 0;
    let p = progress % 1;
    if (p < 0) p += 1;
    return p;
  }

  /** 根据累计距离找到所在线段索引（二分查找） */
  private findSegmentIndex(targetDist: number): number {
    const n = this.segmentLengths.length;
    if (n === 0) return 0;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cumulativeLengths[mid] > targetDist) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    return lo;
  }

  /**
   * 生成"外圈正方形 → 连接道 → 内圈正方形 → 连接道 → 回到外圈起点"的闭合循环路径。
   *
   * 路径结构（顺时针方向，视觉连贯）：
   *   1. 外圈左上角 A 起点
   *   2. 外圈顺时针走完整一圈回到 A
   *   3. 连接道 1：A → 内圈左上角 E
   *   4. 内圈顺时针走完整一圈回到 E
   *   5. 连接道 2：E → A（由 Path 闭合自动连接）
   *
   * 敌人会在外圈和内圈之间无限循环。
   *
   * @param worldW    世界宽度
   * @param worldH    世界高度
   * @param outerPad  外圈距画布边距
   * @param innerSize 内圈边长（居中放置）
   */
  static createLoopPath(worldW: number, worldH: number, outerPad: number, innerSize: number): Path {
    // 外圈四角（顺时针：左上 → 右上 → 右下 → 左下）
    const A: Vec2 = { x: outerPad, y: outerPad };
    const B: Vec2 = { x: worldW - outerPad, y: outerPad };
    const C: Vec2 = { x: worldW - outerPad, y: worldH - outerPad };
    const D: Vec2 = { x: outerPad, y: worldH - outerPad };

    // 内圈四角（居中，顺时针：左上 → 右上 → 右下 → 左下）
    const cx = worldW / 2;
    const cy = worldH / 2;
    const half = innerSize / 2;
    const E: Vec2 = { x: cx - half, y: cy - half };
    const F: Vec2 = { x: cx + half, y: cy - half };
    const G: Vec2 = { x: cx + half, y: cy + half };
    const H: Vec2 = { x: cx - half, y: cy + half };

    const points: Vec2[] = [];
    // 起点：外圈左上角 A
    points.push({ x: A.x, y: A.y });
    // 外圈顺时针完整一圈：A → B → C → D → A
    pushDense(points, A, B);
    pushDense(points, B, C);
    pushDense(points, C, D);
    pushDense(points, D, A);
    // 连接道 1：外圈 A → 内圈 E
    pushDense(points, A, E);
    // 内圈顺时针完整一圈：E → F → G → H → E
    pushDense(points, E, F);
    pushDense(points, F, G);
    pushDense(points, G, H);
    pushDense(points, H, E);
    // 连接道 2：内圈 E → 外圈 A 由 Path 闭合自动连接（不在末尾重复 push A）

    return new Path(points);
  }
}
