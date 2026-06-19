// 成长塔工厂：扩展普通塔，增加经验/属性/技能系统
// 成长塔 maxLevel=30，但 levels 数组只有前 5 级数据，6+ 级用外推公式

import type { Tower } from '../types';
import { createTower } from './Tower';
import { SKILLS } from '../data/skills';

/**
 * 创建成长塔
 * - 先调用 createTower 创建基础塔
 * - 再设置成长字段：isGrowth, exp, expToNext, str, agi, int, attrPoints, skillPoints, skills
 * - expToNext 初始 = 100（公式 100 + (level-1)*50，level=1 时为 100）
 */
export function createHeroTower(defId: string, x: number, y: number): Tower {
  const t = createTower(defId, x, y);

  t.isGrowth = true;
  t.exp = 0;
  t.expToNext = 100; // 100 + (1-1) * 50 = 100
  t.str = 10;
  t.agi = 10;
  t.int = 10;
  t.attrPoints = 0;
  t.skillPoints = 0;
  t.skills = [];

  return t;
}

/**
 * 增加经验值，达到阈值自动升级
 * - while exp >= expToNext 时升级：level++, exp-=expToNext, expToNext 重算, attrPoints+=1
 * - 每 5 级（level % 5 === 0）skillPoints += 1
 * - 满级（level >= maxLevel）后不再升级
 * - 返回 true 如果发生了升级
 */
export function addExp(t: Tower, exp: number): boolean {
  if (!t.isGrowth || t.exp === undefined || t.expToNext === undefined) {
    return false;
  }

  t.exp += exp;
  let leveled = false;

  while (t.exp >= t.expToNext! && t.level < t.maxLevel) {
    t.exp -= t.expToNext!;
    t.level++;
    // 重新计算下一级所需经验：100 + (level-1) * 50
    t.expToNext = 100 + (t.level - 1) * 50;
    // 每升一级 +1 属性点
    t.attrPoints = (t.attrPoints ?? 0) + 1;
    // 每 5 级 +1 技能点
    if (t.level % 5 === 0) {
      t.skillPoints = (t.skillPoints ?? 0) + 1;
    }
    leveled = true;
  }

  return leveled;
}

/**
 * 消耗属性点提升主属性
 * - attr: 'str' | 'agi' | 'int'
 * - attrPoints > 0 时对应属性 +1，attrPoints -1
 * - 返回 true 如果成功
 */
export function addAttr(t: Tower, attr: 'str' | 'agi' | 'int'): boolean {
  if (!t.isGrowth) {
    return false;
  }
  if ((t.attrPoints ?? 0) <= 0) {
    return false;
  }

  if (attr === 'str') {
    t.str = (t.str ?? 0) + 1;
  } else if (attr === 'agi') {
    t.agi = (t.agi ?? 0) + 1;
  } else {
    t.int = (t.int ?? 0) + 1;
  }
  t.attrPoints = (t.attrPoints ?? 0) - 1;
  return true;
}

/**
 * 获取成长塔当前属性加成后的战斗属性
 * - 基础属性 + 力量*0.5 伤害
 * - 敏捷*0.01 攻速（上限 3.0）
 * - 智力*0.3 伤害（仅魔法塔）
 * - 6+ 级基础伤害外推：levels[4].damage * 1.1^(level-5)
 */
export function getHeroStat(t: Tower): { damage: number; attackSpeed: number; range: number } {
  const base = getHeroBaseStat(t);
  const str = t.str ?? 0;
  const agi = t.agi ?? 0;
  const int = t.int ?? 0;

  // 伤害 = 基础 + 力量*0.5 + (魔法塔额外智力*0.3)
  let damage = base.damage + str * 0.5;
  if (t.attackType === 'magic') {
    damage += int * 0.3;
  }

  // 攻速 = 基础 + 敏捷*0.01，上限 3.0
  let attackSpeed = base.attackSpeed + agi * 0.01;
  if (attackSpeed > 3.0) {
    attackSpeed = 3.0;
  }

  return { damage, attackSpeed, range: base.range };
}

/**
 * 获取成长塔当前等级的基础战斗属性（不含属性加成）
 * - level <= 5：直接取 levels[level-1]
 * - level > 5：damage 用外推公式，attackSpeed/range 取 levels[4]
 */
function getHeroBaseStat(t: Tower): { damage: number; attackSpeed: number; range: number } {
  const levels = t.levels;
  if (t.level <= levels.length) {
    const lv = levels[t.level - 1];
    return { damage: lv.damage, attackSpeed: lv.attackSpeed, range: lv.range };
  }
  // 6+ 级外推：damage = levels[4].damage * 1.1^(level-5)
  const lv5 = levels[levels.length - 1];
  const damage = lv5.damage * Math.pow(1.1, t.level - levels.length);
  return { damage, attackSpeed: lv5.attackSpeed, range: lv5.range };
}

// ===== 技能系统 =====

/**
 * 获取塔已学技能的当前等级
 * - 未学习返回 0
 */
export function getSkillLevel(t: Tower, skillId: string): number {
  return t.skillLevels?.[skillId] ?? 0;
}

/**
 * 判断是否可以学习/升级技能
 * - 技能点 >= 1
 * - 当前等级 < maxLevel
 * - 满足属性要求（reqStr/reqInt）
 */
export function canLearnSkill(t: Tower, skillId: string): boolean {
  if (!t.isGrowth) return false;
  const def = SKILLS[skillId];
  if (!def) return false;
  if ((t.skillPoints ?? 0) < 1) return false;
  const cur = getSkillLevel(t, skillId);
  if (cur >= def.maxLevel) return false;
  // 属性要求：学习 1 级时检查，升级时同样检查（保持门槛）
  if (def.reqStr && (t.str ?? 0) < def.reqStr) return false;
  if (def.reqInt && (t.int ?? 0) < def.reqInt) return false;
  return true;
}

/**
 * 学习/升级技能
 * - 消耗 1 技能点，技能等级 +1
 * - 首次学习时加入 skills 数组
 * - 圣盾被动：更新 shieldBonus = values[level-1] * 0.3
 * - 返回 true 表示成功
 */
export function learnSkill(t: Tower, skillId: string): boolean {
  if (!canLearnSkill(t, skillId)) return false;
  const def = SKILLS[skillId];
  if (!t.skillLevels) t.skillLevels = {};
  if (!t.skillCds) t.skillCds = {};
  if (!t.skills) t.skills = [];

  const newLevel = getSkillLevel(t, skillId) + 1;
  t.skillLevels[skillId] = newLevel;
  t.skillPoints = (t.skillPoints ?? 0) - 1;

  // 首次学习加入技能列表
  if (!t.skills.includes(skillId)) {
    t.skills.push(skillId);
  }

  // 圣盾被动：更新附加神圣伤害
  if (def.effect === 'shield') {
    t.shieldBonus = def.values[newLevel - 1] * 0.3;
  }

  return true;
}
