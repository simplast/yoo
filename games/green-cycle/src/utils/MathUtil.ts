// 通用数学工具函数
import type { Vec2 } from '../types';

/**
 * 将值限制在 [min, max] 范围内
 */
export function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/**
 * 线性插值 a -> b，t∈[0,1]
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 两点距离
 */
export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * 两点距离平方（用于性能敏感的比较场景）
 */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * 计算从 from 到 to 的弧度角（atan2）
 */
export function angle(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * 返回 [min, max] 范围内的整数（包含 max）
 */
export function randomInt(min: number, max: number): number {
  if (max < min) {
    const t = min;
    min = max;
    max = t;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 返回 [min, max) 范围内的浮点数
 */
export function randomRange(min: number, max: number): number {
  if (max < min) {
    const t = min;
    min = max;
    max = t;
  }
  return Math.random() * (max - min) + min;
}

/**
 * 从数组中随机选取一个元素
 */
export function randomChoice<T>(arr: T[]): T {
  if (arr.length === 0) {
    throw new Error('randomChoice: 数组不能为空');
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 以固定步长 delta 向 target 逼近，不会越过 target
 */
export function approach(current: number, target: number, delta: number): number {
  if (current < target) {
    return Math.min(current + delta, target);
  }
  if (current > target) {
    return Math.max(current - delta, target);
  }
  return target;
}

/**
 * 格式化大数字：<1000 原样，<1M 显示 k，>=1M 显示 M
 * 例如：999 -> "999"，1000 -> "1k"，1200 -> "1.2k"，1000000 -> "1M"
 */
export function formatNumber(n: number): string {
  if (n < 1000) {
    return Math.floor(n).toString();
  }
  if (n < 1000000) {
    const k = n / 1000;
    return (k >= 10 ? Math.floor(k).toString() : k.toFixed(1).replace(/\.0$/, '')) + 'k';
  }
  const m = n / 1000000;
  return (m >= 10 ? Math.floor(m).toString() : m.toFixed(1).replace(/\.0$/, '')) + 'M';
}
