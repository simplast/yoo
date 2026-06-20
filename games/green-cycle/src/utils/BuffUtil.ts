// Buff 工具：统一处理 debuff 施加与叠加规则
import type { Enemy, BuffType } from '../types';

export interface DebuffInfo {
  type: BuffType;
  value: number;
  duration: number;
}

/**
 * 对敌人施加 buff/debuff，处理叠加规则：
 * - 同类型同来源：刷新持续时间与数值
 * - 同类型不同来源：新增层，数值各自生效（由消费方汇总）
 */
export function applyBuff(
  enemy: Enemy,
  type: BuffType,
  value: number,
  duration: number,
  source?: string,
): void {
  const existing = enemy.buffs.find((b) => b.type === type && b.source === source);
  if (existing) {
    existing.value = value;
    existing.remaining = duration;
  } else {
    enemy.buffs.push({ type, value, remaining: duration, source });
  }
}

/**
 * 计算敌人身上指定类型 buff 的数值总和
 */
export function sumBuffValue(enemy: Enemy, type: BuffType): number {
  return enemy.buffs.filter((b) => b.type === type).reduce((sum, b) => sum + b.value, 0);
}

/**
 * 判断敌人是否处于指定控制状态
 */
export function isCrowdControlled(enemy: Enemy, type: BuffType): boolean {
  return enemy.buffs.some((b) => b.type === type && b.remaining > 0);
}
