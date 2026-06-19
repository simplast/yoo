// 塔攻击系统：索敌、生成投射物/即时命中
import type { GameState } from '../game/State';
import type { Enemy, Tower } from '../types';
import { getTowerStat } from '../entities/Tower';
import { getHeroStat } from '../entities/HeroTower';
import { createProjectile } from '../entities/Projectile';
import { createHitEffect, createDamageText } from '../entities/Effect';
import { applyDamage } from './CombatSystem';
import { applyPassiveOnAttack } from './SkillSystem';
import { dist2 } from '../utils/MathUtil';

/**
 * 获取塔的战斗属性（成长塔用 getHeroStat，普通塔用 getTowerStat）
 */
function getStat(tower: Tower): { damage: number; attackSpeed: number; range: number } {
  return tower.isGrowth ? getHeroStat(tower) : getTowerStat(tower);
}

/**
 * 计算友方光环加成：返回 { damageMult, speedMult }
 * auraDamage 加攻击，auraHaste 加攻速
 */
function getAllyAuraBonus(
  state: GameState,
  tower: Tower,
): { damageMult: number; speedMult: number } {
  let damageMult = 1;
  let speedMult = 1;
  for (const aura of state.towers) {
    if (aura.category !== 'aura' || aura.auraTarget !== 'ally') continue;
    if (aura.auraRadius == null || aura.auraValue == null) continue;
    const dx = aura.x - tower.x;
    const dy = aura.y - tower.y;
    if (dx * dx + dy * dy > aura.auraRadius * aura.auraRadius) continue;
    if (aura.id === 'auraDamage') {
      damageMult *= 1 + aura.auraValue;
    } else if (aura.id === 'auraHaste') {
      speedMult *= 1 + aura.auraValue;
    }
  }
  return { damageMult, speedMult };
}

/**
 * 根据策略选择目标敌人
 * nearest: 距离最近 / first: pathProgress 最大 / strongest: hp 最高
 * weakest: hp 最低 / priority: 优先 boss/auraHaste，否则 nearest
 */
function selectTarget(state: GameState, tower: Tower, range: number): Enemy | undefined {
  const range2 = range * range;
  const candidates: Enemy[] = [];
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = e.x - tower.x;
    const dy = e.y - tower.y;
    if (dx * dx + dy * dy <= range2) {
      candidates.push(e);
    }
  }
  if (candidates.length === 0) return undefined;

  let best = candidates[0];
  const strategy = tower.targetStrategy;

  for (let i = 1; i < candidates.length; i++) {
    const e = candidates[i];
    let replace = false;
    switch (strategy) {
      case 'nearest':
        replace = dist2(tower.x, tower.y, e.x, e.y) < dist2(tower.x, tower.y, best.x, best.y);
        break;
      case 'first':
        replace = e.pathProgress > best.pathProgress;
        break;
      case 'strongest':
        replace = e.hp > best.hp;
        break;
      case 'weakest':
        replace = e.hp < best.hp;
        break;
      case 'priority': {
        // 优先 boss/auraHaste，同优先级内取最近
        const ePri = e.abilities.includes('boss') || e.abilities.includes('auraHaste');
        const bestPri =
          best.abilities.includes('boss') || best.abilities.includes('auraHaste');
        if (ePri !== bestPri) {
          replace = ePri;
        } else {
          replace = dist2(tower.x, tower.y, e.x, e.y) < dist2(tower.x, tower.y, best.x, best.y);
        }
        break;
      }
    }
    if (replace) best = e;
  }
  return best;
}

export function update(state: GameState, dt: number): void {
  for (const tower of state.towers) {
    // 光环塔不攻击（由 AuraSystem / 友方光环加成处理）
    if (tower.category === 'aura') continue;

    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;

    // 取属性并应用友方光环加成
    const baseStat = getStat(tower);
    const auraBonus = getAllyAuraBonus(state, tower);
    let damage = baseStat.damage * auraBonus.damageMult;
    const attackSpeed = baseStat.attackSpeed * auraBonus.speedMult;
    const range = baseStat.range;

    // 成长塔被动技能：圣盾附加伤害 + 致命一击暴击
    let isCrit = false;
    if (tower.isGrowth) {
      const passive = applyPassiveOnAttack(tower, damage);
      damage = passive.damage;
      isCrit = passive.isCrit;
    }

    // 索敌
    const target = selectTarget(state, tower, range);
    if (!target) continue;

    // 重置冷却
    tower.cooldown = attackSpeed > 0 ? 1 / attackSpeed : 1;

    if (tower.projectileSpeed <= 0) {
      // 即时命中：直接结算伤害 + 命中特效 + 伤害飘字
      applyDamage(state, target, damage, tower.attackType, tower.instanceId);
      state.addEffect(createHitEffect(target.x, target.y, tower.color));
      state.addEffect(
        createDamageText(
          target.x,
          target.y - target.size,
          (isCrit ? '✦' : '') + Math.floor(damage).toString(),
          isCrit ? '#FFD700' : tower.color,
        ),
      );
    } else {
      // 生成投射物
      const proj = createProjectile({
        x: tower.x,
        y: tower.y,
        targetId: target.instanceId,
        speed: tower.projectileSpeed,
        damage,
        attackType: tower.attackType,
        splashRadius: tower.splashRadius,
        sourceTowerId: tower.instanceId,
        color: isCrit ? '#FFD700' : tower.color,
        size: 4,
      });
      state.addProjectile(proj);
    }
  }
}
