// 投射物工厂：创建飞行中的投射物实例
// 投射物由塔发射，追踪目标敌人，命中后造成伤害

import type { Projectile, AttackType } from '../types';
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
export function createProjectile(opts: CreateProjectileOpts): Projectile {
  const proj: Projectile = {
    instanceId: nextEntityId(),
    x: opts.x,
    y: opts.y,
    targetId: opts.targetId,
    speed: opts.speed,
    damage: opts.damage,
    attackType: opts.attackType,
    splashRadius: opts.splashRadius,
    sourceTowerId: opts.sourceTowerId,
    alive: true,
    color: opts.color,
    size: opts.size,
  };
  if (opts.debuffType != null) {
    proj.debuff = {
      type: opts.debuffType,
      value: opts.debuffValue ?? 0,
      duration: opts.debuffDuration ?? 1,
    };
  }
  return proj;
}
