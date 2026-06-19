// 技能系统：成长塔技能 CD tick、主动技能自动释放、被动技能应用
import type { GameState } from '../game/State';
import type { Tower, Enemy, SkillDef, Buff, AttackType } from '../types';
import { SKILLS } from '../data/skills';
import { getHeroStat, getSkillLevel } from '../entities/HeroTower';
import { applyDamage } from './CombatSystem';
import {
  createLightningEffect,
  createJudgeEffect,
  createShockwaveEffect,
  createDamageText,
} from '../entities/Effect';

/**
 * 被动技能：在攻击时应用
 * - 圣盾（shield）：附加 shieldBonus 神圣伤害
 * - 致命一击（crit）：概率暴击，伤害 × 倍率
 * 返回 { damage, isCrit }
 */
export function applyPassiveOnAttack(
  tower: Tower,
  damage: number,
): { damage: number; isCrit: boolean } {
  let dmg = damage;

  // 圣盾：附加神圣伤害（shieldBonus 已在 learnSkill 时计算）
  if (tower.shieldBonus) {
    dmg += tower.shieldBonus;
  }

  // 致命一击：暴击
  let isCrit = false;
  const critLevel = getSkillLevel(tower, 'jianfa_crit');
  if (critLevel > 0) {
    const def = SKILLS['jianfa_crit'];
    if (def && Math.random() < (def.critChance ?? 0)) {
      dmg *= def.values[critLevel - 1];
      isCrit = true;
    }
  }

  return { damage: dmg, isCrit };
}

/**
 * 查找塔射程内最强敌人（hp 最高）
 */
function findStrongestInRange(state: GameState, tower: Tower, range: number): Enemy | undefined {
  const range2 = range * range;
  let best: Enemy | undefined;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = e.x - tower.x;
    const dy = e.y - tower.y;
    if (dx * dx + dy * dy > range2) continue;
    if (!best || e.hp > best.hp) best = e;
  }
  return best;
}

/**
 * 查找塔范围内所有敌人
 */
function findAllInRange(state: GameState, tower: Tower, range: number): Enemy[] {
  const range2 = range * range;
  const result: Enemy[] = [];
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = e.x - tower.x;
    const dy = e.y - tower.y;
    if (dx * dx + dy * dy <= range2) result.push(e);
  }
  return result;
}

/**
 * 查找距离某点最近的敌人（排除已命中列表）
 */
function findNearestExcept(
  state: GameState,
  x: number,
  y: number,
  range2: number,
  excluded: Set<number>,
): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDist = Infinity;
  for (const e of state.enemies) {
    if (!e.alive || excluded.has(e.instanceId)) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range2) continue;
    if (d2 < bestDist) {
      bestDist = d2;
      best = e;
    }
  }
  return best;
}

/** 施加 buff 到敌人 */
function applyBuff(enemy: Enemy, type: Buff['type'], value: number, duration: number, source: string): void {
  const existing = enemy.buffs.find((b) => b.type === type && b.source === source);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, duration);
    existing.value = value;
  } else {
    enemy.buffs.push({ type, value, remaining: duration, source });
  }
}

/**
 * 释放主动技能
 * - 返回 true 表示成功释放（进入 CD）
 */
function castActiveSkill(
  state: GameState,
  tower: Tower,
  skillId: string,
  level: number,
  def: SkillDef,
  towerRange: number,
): boolean {
  const value = def.values[level - 1];
  const skillRange = def.range && def.range > 0 ? def.range : towerRange;

  switch (def.effect) {
    case 'holyDamage': {
      // 审判之光：单体神圣伤害
      const target = findStrongestInRange(state, tower, skillRange);
      if (!target) return false;
      applyDamage(state, target, value, 'holy', tower.instanceId);
      state.addEffect(createJudgeEffect(target.x, target.y, '#FFD700'));
      state.addEffect(createDamageText(target.x, target.y - target.size, String(value), '#FFD700'));
      return true;
    }
    case 'aoeDamage': {
      // 剑刃风暴：范围普通伤害
      const targets = findAllInRange(state, tower, skillRange);
      if (targets.length === 0) return false;
      for (const e of targets) {
        applyDamage(state, e, value, 'normal', tower.instanceId);
      }
      state.addEffect(createShockwaveEffect(tower.x, tower.y, skillRange, '#C0C0C0'));
      return true;
    }
    case 'chainLightning': {
      // 闪电链：连锁魔法伤害，value=弹射次数
      const jumps = value;
      const chainRange2 = (skillRange * 1.5) * (skillRange * 1.5); // 连锁范围放宽
      const points: { x: number; y: number }[] = [{ x: tower.x, y: tower.y }];
      const hit = new Set<number>();
      let current = { x: tower.x, y: tower.y };
      const baseDamage = getHeroStat(tower).damage * 1.5;
      for (let i = 0; i < jumps; i++) {
        const next = findNearestExcept(state, current.x, current.y, chainRange2, hit);
        if (!next) break;
        hit.add(next.instanceId);
        const dmg = baseDamage * Math.pow(0.85, i); // 每跳衰减 15%
        applyDamage(state, next, dmg, 'magic', tower.instanceId);
        points.push({ x: next.x, y: next.y });
        current = { x: next.x, y: next.y };
      }
      if (points.length < 2) return false; // 没有命中任何敌人
      state.addEffect(createLightningEffect(points, '#00FFFF'));
      return true;
    }
    case 'stormStun': {
      // 雷暴：范围魔法伤害 + 眩晕
      const targets = findAllInRange(state, tower, skillRange);
      if (targets.length === 0) return false;
      const source = String(tower.instanceId);
      for (const e of targets) {
        applyDamage(state, e, value, 'magic', tower.instanceId);
        applyBuff(e, 'stun', 1, 2, source); // 眩晕 2 秒
      }
      state.addEffect(createShockwaveEffect(tower.x, tower.y, skillRange, '#00BFFF'));
      return true;
    }
    default:
      return false;
  }
}

export function update(state: GameState, dt: number): void {
  // ===== tick 主动技能 CD =====
  for (const tower of state.towers) {
    if (!tower.isGrowth || !tower.skillCds) continue;
    for (const skillId in tower.skillCds) {
      if (tower.skillCds[skillId] > 0) {
        tower.skillCds[skillId] = Math.max(0, tower.skillCds[skillId] - dt);
      }
    }
  }

  // ===== 自动释放主动技能 =====
  for (const tower of state.towers) {
    if (!tower.isGrowth || !tower.skillLevels) continue;
    const stat = getHeroStat(tower);
    const towerRange = stat.range;

    for (const skillId in tower.skillLevels) {
      const level = tower.skillLevels[skillId];
      if (level < 1) continue;
      const def = SKILLS[skillId];
      if (!def || def.type !== 'active') continue;

      // CD 未就绪
      const cd = tower.skillCds?.[skillId] ?? 0;
      if (cd > 0) continue;

      const casted = castActiveSkill(state, tower, skillId, level, def, towerRange);
      if (casted) {
        if (!tower.skillCds) tower.skillCds = {};
        tower.skillCds[skillId] = def.cooldown ?? 0;
      }
    }
  }
}
