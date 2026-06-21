// 投射物工厂：创建飞行中的投射物实例
// 投射物由塔发射，追踪目标敌人，命中后造成伤害

import type { Projectile, AttackType } from '../types';
import type { Pool } from '../utils/Pool';
import { nextEntityId } from './Entity';

import type { BuffType } from '../types';

/** 创建投射物的参数 */
export interface CreateProjectileOpts {
  x: number;
  y: number;
  targetId: number;
  speed: number;
  damage: number;
  attackType: AttackType;
  splashRadius: number;
  sourceTowerId: number;
  color: string;
  size: number;
  // 命中 debuff（support / 控制塔）
  debuffType?: BuffType;
  debuffValue?: number;
  debuffDuration?: number;
}

/**
 * 创建投射物实例
 * - instanceId = nextEntityId()
 * - alive = true
 */
export function createProjectile(opts: CreateProjectileOpts, pool?: Pool<Projectile>): Projectile {
  const proj = pool ? pool.acquire() : ({} as Projectile);
  // 重新分配 id
  proj.instanceId = nextEntityId();
  // 填充所有字段
  proj.x = opts.x;
  proj.y = opts.y;
  proj.targetId = opts.targetId;
  proj.speed = opts.speed;
  proj.damage = opts.damage;
  proj.attackType = opts.attackType ?? 'normal';
  proj.splashRadius = opts.splashRadius ?? 0;
  proj.sourceTowerId = opts.sourceTowerId ?? 0;
  proj.alive = true;
  proj.color = opts.color ?? '#FFFFFF';
  proj.size = opts.size ?? 4;
  // debuff 字段：显式设置（覆盖池中旧值）
  if (opts.debuffType != null) {
    proj.debuff = {
      type: opts.debuffType,
      value: opts.debuffValue ?? 0,
      duration: opts.debuffDuration ?? 1,
    };
  } else {
    proj.debuff = undefined;
  }
  return proj;
}
