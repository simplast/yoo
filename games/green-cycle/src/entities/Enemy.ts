// 敌人工厂：根据 defId 从 ENEMIES 表创建敌人实例
// 应用难度系数调整 hp 和金币奖励，初始化运行时状态

import type { Enemy } from '../types';
import type { Path } from '../utils/Path';
import type { Difficulty } from '../config';
import { ENEMIES } from '../data/enemies';
import { CONFIG } from '../config';
import { nextEntityId } from './Entity';

/**
 * 根据 defId 创建敌人实例
 * - hp/maxHp = baseHp * DIFF_HP[difficulty]
 * - rewardGold = baseRewardGold * DIFF_GOLD[difficulty]
 * - 初始位置取 path.getPosition(0)，pathProgress=0
 * - speed=baseSpeed，alive=true，buffs=[]，hitFlash=0，auraFlags=0
 */
export function createEnemy(defId: string, path: Path, difficulty: Difficulty): Enemy {
  const def = ENEMIES[defId];
  if (!def) {
    throw new Error(`[createEnemy] 未找到敌人定义: ${defId}`);
  }

  const hpMul = CONFIG.DIFF_HP[difficulty];
  const goldMul = CONFIG.DIFF_GOLD[difficulty];
  const pos = path.getPosition(0);
  const hp = def.baseHp * hpMul;

  const enemy: Enemy = {
    // 拷贝定义字段
    ...def,
    abilities: [...def.abilities],
    // 运行时字段
    instanceId: nextEntityId(),
    hp,
    maxHp: hp,
    pathProgress: 0,
    speed: def.baseSpeed,
    x: pos.x,
    y: pos.y,
    alive: true,
    buffs: [],
    auraFlags: 0,
    hitFlash: 0,
    // 难度调整后的奖励
    rewardGold: def.rewardGold * goldMul,
  };

  return enemy;
}

/**
 * 重置敌人运行时字段（对象池复用时调用）
 * 保留定义字段不变，仅清空运行时状态
 */
export function resetEnemy(e: Enemy): void {
  e.alive = false;
  e.hp = 0;
  e.maxHp = 0;
  e.pathProgress = 0;
  e.speed = 0;
  e.x = 0;
  e.y = 0;
  e.buffs.length = 0;
  e.auraFlags = 0;
  e.hitFlash = 0;
}
