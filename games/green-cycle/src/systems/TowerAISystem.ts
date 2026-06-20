// 塔攻击系统：索敌、生成投射物/即时命中
import type { GameState } from '../game/State';
import type { Enemy, Tower, BuffType } from '../types';
import { getTowerStat } from '../entities/Tower';
import { getHeroStat } from '../entities/HeroTower';
import { createProjectile } from '../entities/Projectile';
import { createHitEffect, createDamageText } from '../entities/Effect';
import { applyDamage } from './CombatSystem';
import { applyPassiveOnAttack } from './SkillSystem';
import { dist2 } from '../utils/MathUtil';
import { Quadtree } from '../utils/Quadtree';
import { CONFIG } from '../config';
import { audio } from '../audio/Audio';

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
 * 提取 support / 控制塔的命中 debuff 信息
 * 条件：有 auraType、auraTarget 为 enemy、无 auraRadius（非光环塔）
 */
function getHitDebuff(tower: Tower): { type: BuffType; value: number; duration: number } | undefined {
  if (!tower.auraType || tower.auraTarget !== 'enemy') return undefined;
  if (tower.auraRadius != null && tower.auraRadius > 0) return undefined;
  if (tower.auraValue == null || tower.debuffDuration == null) return undefined;
  return {
    type: tower.auraType,
    value: tower.auraValue,
    duration: tower.debuffDuration,
  };
}

/**
 * 根据策略选择目标敌人
 * nearest: 距离最近 / first: pathProgress 最大 / strongest: hp 最高
 * weakest: hp 最低 / priority: 优先 boss/auraHaste，否则 nearest
 */
function selectTarget(qt: Quadtree, tower: Tower, range: number): Enemy | undefined {
  const range2 = range * range;
  const raw = qt.retrieve(tower.x, tower.y, range);
  // 去重（同一对象不会被重复插入，但防御性去重）
  const seen = new Set<number>();
  const candidates: Enemy[] = [];
  for (const ref of raw) {
    const e = ref as Enemy;
    if (!e.alive || seen.has(e.instanceId)) continue;
    seen.add(e.instanceId);
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
  // 构建敌人四叉树，加速范围查询
  const qt = new Quadtree({ x: 0, y: 0, w: CONFIG.WORLD_WIDTH, h: CONFIG.WORLD_HEIGHT });
  for (const e of state.enemies) {
    if (e.alive) {
      qt.insert({ x: e.x, y: e.y, ref: e });
    }
  }

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
      if (isCrit) audio.playCrit();
    }

    // 索敌
    const target = selectTarget(qt, tower, range);
    if (!target) continue;

    // 重置冷却
    tower.cooldown = attackSpeed > 0 ? 1 / attackSpeed : 1;

    const hitDebuff = getHitDebuff(tower);

    if (tower.projectileSpeed <= 0) {
      // 即时命中：直接结算伤害 + 命中特效 + 伤害飘字
      applyDamage(
        state,
        target,
        damage,
        tower.attackType,
        tower.instanceId,
        hitDebuff?.type,
        hitDebuff?.value,
        hitDebuff?.duration,
      );
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
        debuffType: hitDebuff?.type,
        debuffValue: hitDebuff?.value,
        debuffDuration: hitDebuff?.duration,
      });
      state.addProjectile(proj);
    }
  }
}
