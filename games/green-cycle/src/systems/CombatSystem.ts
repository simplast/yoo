// 战斗系统：伤害计算、投射物移动、死亡处理
import type { GameState } from '../game/State';
import type { Enemy, AttackType } from '../types';
import { getDamageMultiplier } from '../data/armor';
import { addExp } from '../entities/HeroTower';
import { createDeathEffect, createHitEffect, createSplashEffect } from '../entities/Effect';

/**
 * 对敌人施加伤害（含护甲克制、魔免判定、死亡处理）
 * 供 TowerAISystem 即时命中和本系统投射物命中调用
 */
export function applyDamage(
  state: GameState,
  enemy: Enemy,
  damage: number,
  attackType: AttackType,
  sourceTowerId: number,
): void {
  if (!enemy.alive) return;

  // 魔免敌人受魔法攻击伤害为 0
  if (enemy.abilities.includes('magicImmune') && attackType === 'magic') {
    return;
  }

  // 计算实际伤害（护甲克制系数）
  const multiplier = getDamageMultiplier(attackType, enemy.armor);
  const actualDamage = damage * multiplier;

  enemy.hp -= actualDamage;
  enemy.hitFlash = 0.1;

  // 死亡处理
  if (enemy.hp <= 0) {
    enemy.alive = false;
    // 死亡特效
    state.addEffect(createDeathEffect(enemy.x, enemy.y, enemy.color));
    // 击杀奖励
    state.gold += enemy.rewardGold;
    state.wood += enemy.rewardWood;
    state.kills++;
    // 成长塔获得经验
    if (sourceTowerId >= 0) {
      const sourceTower = state.getTowerById(sourceTowerId);
      if (sourceTower && sourceTower.isGrowth) {
        addExp(sourceTower, enemy.rewardExp);
      }
    }
  }
}

export function update(state: GameState, dt: number): void {
  // ===== 处理投射物 =====
  for (const proj of state.projectiles) {
    if (!proj.alive) continue;

    const target = state.getEnemyById(proj.targetId);

    // 目标已死或不存在
    if (!target || !target.alive) {
      // 溅射投射物在当前位置爆炸
      if (proj.splashRadius > 0) {
        const r2 = proj.splashRadius * proj.splashRadius;
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const dx = e.x - proj.x;
          const dy = e.y - proj.y;
          if (dx * dx + dy * dy <= r2) {
            applyDamage(state, e, proj.damage * 0.6, proj.attackType, proj.sourceTowerId);
          }
        }
        state.addEffect(createSplashEffect(proj.x, proj.y, proj.splashRadius, proj.color));
      }
      proj.alive = false;
      continue;
    }

    // 向目标移动
    const dx = target.x - proj.x;
    const dy = target.y - proj.y;
    const dist = Math.hypot(dx, dy);
    const moveDist = proj.speed * dt;

    if (dist <= 6 || dist <= moveDist) {
      // 命中
      if (proj.splashRadius > 0) {
        // 溅射：主目标全额，范围内其他敌人 0.6 倍衰减
        applyDamage(state, target, proj.damage, proj.attackType, proj.sourceTowerId);
        const r2 = proj.splashRadius * proj.splashRadius;
        for (const e of state.enemies) {
          if (!e.alive || e === target) continue;
          const ex = e.x - target.x;
          const ey = e.y - target.y;
          if (ex * ex + ey * ey <= r2) {
            applyDamage(state, e, proj.damage * 0.6, proj.attackType, proj.sourceTowerId);
          }
        }
        state.addEffect(
          createSplashEffect(target.x, target.y, proj.splashRadius, proj.color),
        );
      } else {
        // 单体伤害
        applyDamage(state, target, proj.damage, proj.attackType, proj.sourceTowerId);
        state.addEffect(createHitEffect(target.x, target.y, proj.color));
      }
      proj.alive = false;
    } else {
      // 移动
      proj.x += (dx / dist) * moveDist;
      proj.y += (dy / dist) * moveDist;
    }
  }

  // ===== 清理已死亡投射物（反向遍历）=====
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    if (!state.projectiles[i].alive) {
      state.projectiles.splice(i, 1);
    }
  }

  // ===== 清理已死亡敌人（反向遍历）=====
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    if (!state.enemies[i].alive) {
      state.enemies.splice(i, 1);
    }
  }
}
