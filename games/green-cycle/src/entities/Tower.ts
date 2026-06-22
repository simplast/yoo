// 普通塔工厂：根据 defId 从 TOWERS 表创建塔实例
// 提供升级、属性查询、出售返还等功能

import type { Tower } from '../types';
import { TOWERS } from '../data/towers';
import { CONFIG } from '../config';
import { nextEntityId } from './Entity';

/**
 * 根据 defId 创建塔实例
 * - 浅拷贝 TOWERS[defId] 所有字段
 * - level=1，cooldown=0
 * - totalSpent = levels[0].upgradeCost（建造成本）
 * - 光环塔（category==='aura'）auraApplied=false
 */
export function createTower(defId: string, x: number, y: number): Tower {
  const def = TOWERS[defId];
  if (!def) {
    throw new Error(`[createTower] 未找到塔定义: ${defId}`);
  }

  const tower: Tower = {
    // 浅拷贝定义字段
    ...def,
    levels: def.levels, // 只读访问，共享引用即可
    // 运行时字段
    instanceId: nextEntityId(),
    level: 1,
    x,
    y,
    cooldown: 0,
    totalSpent: def.levels[0].upgradeCost,
  };

  // 光环塔初始化光环缓存标记
  if (def.category === 'aura') {
    tower.auraApplied = false;
  }

  return tower;
}

/**
 * 升级塔
 * - level < maxLevel 时 level++，totalSpent += 新级 upgradeCost
 * - 返回 true 表示升级成功，false 表示已满级
 * - 防御性：索引做 Math.min 钳制，避免成长塔（levels 数组较短）越界
 */
export function upgradeTower(t: Tower): boolean {
  if (t.level >= t.maxLevel) {
    return false;
  }
  t.level++;
  const lvIndex = Math.min(t.level - 1, t.levels.length - 1);
  t.totalSpent += t.levels[lvIndex].upgradeCost;
  return true;
}

/**
 * 获取塔当前等级的战斗属性
 * - 取 levels[level-1] 的 damage/attackSpeed/range
 * - 防御性：索引做 Math.min 钳制，避免成长塔（levels 数组较短）越界
 */
export function getTowerStat(t: Tower): { damage: number; attackSpeed: number; range: number } {
  const lvIndex = Math.min(t.level - 1, t.levels.length - 1);
  const lv = t.levels[lvIndex];
  return {
    damage: lv.damage,
    attackSpeed: lv.attackSpeed,
    range: lv.range,
  };
}

/**
 * 出售返还金额
 * - 仅返还建造资金（levels[0].upgradeCost），不含升级投入
 * - 返还比例 = CONFIG.SELL_REFUND
 */
export function getSellRefund(t: Tower): number {
  return t.levels[0].upgradeCost * CONFIG.SELL_REFUND;
}
