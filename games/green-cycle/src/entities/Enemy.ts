// 敌人工厂：根据 defId 从 ENEMIES 表创建敌人实例
// 应用难度系数调整 hp 和金币奖励，初始化运行时状态

import type { Enemy } from '../types';
import type { Path } from '../utils/Path';
import type { Difficulty } from '../config';
import type { Pool } from '../utils/Pool';
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
export function createEnemy(
  defId: string,
  path: Path,
  difficulty: Difficulty,
  pool?: Pool<Enemy>,
): Enemy {
  const def = ENEMIES[defId];
  if (!def) {
    throw new Error(`[createEnemy] 未找到敌人定义: ${defId}`);
  }

  const hpMul = CONFIG.DIFF_HP[difficulty];
  const goldMul = CONFIG.DIFF_GOLD[difficulty];
  const pos = path.getPosition(0);
  const hp = def.baseHp * hpMul;

  // 从池获取或新建
  const enemy = pool ? pool.acquire() : ({} as Enemy);

  // 拷贝定义字段
  Object.assign(enemy, def);
  enemy.abilities = [...def.abilities];
  // 运行时字段
  enemy.instanceId = nextEntityId();
  enemy.hp = hp;
  enemy.maxHp = hp;
  enemy.pathProgress = 0;
  enemy.speed = def.baseSpeed;
  enemy.x = pos.x;
  enemy.y = pos.y;
  enemy.alive = true;
  enemy.buffs = [];
  enemy.auraFlags = 0;
  enemy.hitFlash = 0;
  // 难度调整后的奖励
  enemy.rewardGold = def.rewardGold * goldMul;

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
  e._splitChild = undefined;
}
