// 成长塔技能库（PRD 5.4 节）
// 每个技能 values 数组长度 = maxLevel，索引 0 对应 1 级

import type { SkillDef } from '../types';

export const SKILLS: Record<string, SkillDef> = {
  // ===== 天神技能 =====
  // 审判之光：主动神圣伤害（单体）
  tianshen_judge: {
    id: 'tianshen_judge',
    name: '审判之光',
    type: 'active',
    maxLevel: 5,
    description: '对目标造成神圣伤害，等级越高伤害越强',
    reqStr: 80,
    effect: 'holyDamage',
    values: [200, 350, 500, 700, 900],
    cooldown: 8,
    range: 0, // 使用塔自身射程
  },
  // 圣盾：被动，将护盾能量转化为攻击附加神圣伤害
  tianshen_shield: {
    id: 'tianshen_shield',
    name: '圣盾',
    type: 'passive',
    maxLevel: 3,
    description: '护盾能量强化攻击，附加神圣伤害',
    reqStr: 160,
    effect: 'shield',
    values: [100, 200, 350],
  },

  // ===== 剑圣技能 =====
  // 剑刃风暴：主动范围普通伤害
  jianfa_blade: {
    id: 'jianfa_blade',
    name: '剑刃风暴',
    type: 'active',
    maxLevel: 5,
    description: '对周围敌人造成范围普通伤害',
    reqStr: 80,
    effect: 'aoeDamage',
    values: [150, 250, 350, 500, 700],
    cooldown: 10,
    range: 120, // 固定范围
  },
  // 致命一击：被动暴击
  jianfa_crit: {
    id: 'jianfa_crit',
    name: '致命一击',
    type: 'passive',
    maxLevel: 5,
    description: '攻击有概率暴击，等级越高暴击倍率越大',
    reqInt: 80,
    effect: 'crit',
    values: [1.5, 2.0, 2.5, 3.0, 4.0],
    critChance: 0.25,
  },

  // ===== 电法技能 =====
  // 闪电链：主动连锁魔法伤害
  dianfa_chain: {
    id: 'dianfa_chain',
    name: '闪电链',
    type: 'active',
    maxLevel: 5,
    description: '闪电在敌人间连锁弹射，造成魔法伤害',
    reqInt: 30,
    effect: 'chainLightning',
    values: [3, 4, 5, 6, 8], // 弹射次数
    cooldown: 6,
    range: 0, // 使用塔自身射程
  },
  // 雷暴：主动范围魔法伤害 + 眩晕
  dianfa_storm: {
    id: 'dianfa_storm',
    name: '雷暴',
    type: 'active',
    maxLevel: 3,
    description: '召唤雷暴对范围内敌人造成魔法伤害并眩晕',
    reqInt: 90,
    effect: 'stormStun',
    values: [300, 500, 800],
    cooldown: 15,
    range: 130,
  },
};

/**
 * 成长塔 → 可学技能 id 列表映射
 */
export const HERO_SKILLS: Record<string, string[]> = {
  tianshen: ['tianshen_judge', 'tianshen_shield'],
  jianfa: ['jianfa_blade', 'jianfa_crit'],
  dianfa: ['dianfa_chain', 'dianfa_storm'],
};
