// 核心类型定义 - 所有模块共享

import type { Difficulty } from './config';

export interface Vec2 {
  x: number;
  y: number;
}

// ===== 攻击/护甲类型 =====
export type AttackType = 'normal' | 'pierce' | 'magic' | 'chaos' | 'holy';
export type ArmorType = 'physical' | 'magic' | 'holy' | 'resist';

// 攻击类型显示名
export const ATTACK_TYPE_NAME: Record<AttackType, string> = {
  normal: '普通',
  pierce: '穿刺',
  magic: '魔法',
  chaos: '混乱',
  holy: '神圣',
};

export const ARMOR_TYPE_NAME: Record<ArmorType, string> = {
  physical: '物理',
  magic: '魔法',
  holy: '神圣',
  resist: '抗性',
};

export const ARMOR_COLOR: Record<ArmorType, string> = {
  physical: '#FF5555',
  magic: '#4FA3FF',
  holy: '#FFE9A8',
  resist: '#B266FF',
};

// ===== 目标选择策略 =====
export type TargetStrategy = 'nearest' | 'first' | 'strongest' | 'weakest' | 'priority';

// ===== 资源 =====
export interface Resources {
  gold: number;
  wood: number;
  pop: number; // 已用人口
  popMax: number;
  pf: number;
}

// ===== 敌人定义（数据表） =====
export type EnemyAbility =
  | 'invisible'
  | 'flying'
  | 'magicImmune'
  | 'virusImmune'
  | 'auraHaste'
  | 'auraHeal'
  | 'auraDamage'
  | 'split'
  | 'boss';

export interface EnemyDef {
  id: string;
  name: string;
  baseHp: number;
  baseSpeed: number; // 像素/秒
  armor: ArmorType;
  abilities: EnemyAbility[];
  rewardGold: number;
  rewardWood: number;
  rewardExp: number;
  size: number; // 渲染尺寸
  color: string;
  isBoss?: boolean;
}

// ===== 敌人实例（运行时） =====
export interface Enemy extends EnemyDef {
  instanceId: number;
  hp: number;
  maxHp: number;
  pathProgress: number; // [0,1)
  speed: number; // 当前速度
  x: number;
  y: number;
  alive: boolean;
  // Buff/Debuff 列表
  buffs: Buff[];
  // 光环来源标记
  auraFlags: number;
  // 受击闪烁
  hitFlash: number;
}

// ===== Buff/Debuff =====
export type BuffType =
  | 'slow' // 减速
  | 'haste' // 加速
  | 'armorBreak' // 减甲
  | 'stun' // 眩晕
  | 'poison' // 中毒
  | 'freeze'; // 冰冻

export interface Buff {
  type: BuffType;
  value: number; // 强度（减速比例/减甲数值等）
  remaining: number; // 剩余秒数
  source?: string; // 来源塔 id
}

// ===== 塔定义（数据表） =====
export type TowerCategory = 'growth' | 'basic' | 'support' | 'aura' | 'special';

export interface TowerLevelDef {
  level: number;
  damage: number;
  attackSpeed: number; // 攻击/秒
  range: number;
  upgradeCost: number; // 升级到此级的成本（level 1 为建造成本）
}

export interface TowerDef {
  id: string;
  name: string;
  category: TowerCategory;
  attackType: AttackType;
  targetStrategy: TargetStrategy;
  projectileSpeed: number; // 0 = 即时命中
  splashRadius: number; // 0 = 单体
  description: string;
  popCost: number;
  levels: TowerLevelDef[]; // 索引 0 = 1级
  maxLevel: number;
  // 光环塔字段
  auraType?: BuffType;
  auraRadius?: number;
  auraValue?: number;
  auraTarget?: 'enemy' | 'ally';
  // support / 控制塔：命中 debuff 持续时间（秒）
  debuffDuration?: number;
  color: string;
  size: number;
}

// ===== 塔实例（运行时） =====
export interface Tower extends TowerDef {
  instanceId: number;
  level: number; // 1-based
  x: number;
  y: number;
  cooldown: number; // 当前冷却剩余
  totalSpent: number; // 累计投入（用于出售返还）
  // 成长塔字段
  isGrowth?: boolean;
  exp?: number;
  expToNext?: number;
  str?: number; // 力量
  agi?: number; // 敏捷
  int?: number; // 智力
  attrPoints?: number;
  skillPoints?: number;
  skills?: string[]; // 已学技能 id
  // 技能等级表：skillId → 当前等级（1-based，未学习则无键）
  skillLevels?: Record<string, number>;
  // 主动技能冷却：skillId → 剩余秒数
  skillCds?: Record<string, number>;
  // 圣盾被动：附加神圣伤害值
  shieldBonus?: number;
  // 光环缓存
  auraApplied?: boolean;
}

// ===== 投射物 =====
export interface Projectile {
  instanceId: number;
  x: number;
  y: number;
  targetId: number;
  speed: number;
  damage: number;
  attackType: AttackType;
  splashRadius: number;
  sourceTowerId: number;
  alive: boolean;
  // 命中 debuff（support / 控制塔）
  debuff?: {
    type: BuffType;
    value: number;
    duration: number;
  };
  // 视觉
  color: string;
  size: number;
}

// ===== 特效 =====
export type EffectType =
  | 'hit'
  | 'death'
  | 'build'
  | 'upgrade'
  | 'splash'
  | 'damageText'
  | 'aura'
  | 'lightning' // 闪电链/审判之光：折线连接多点
  | 'shockwave' // 剑刃风暴/雷暴：扩散冲击波
  | 'combine'; // 合成成功：星光粒子

export interface Effect {
  instanceId: number;
  type: EffectType;
  x: number;
  y: number;
  remaining: number;
  duration: number;
  alive: boolean;
  // damageText
  text?: string;
  color?: string;
  vy?: number;
  // 粒子
  particles?: { x: number; y: number; vx: number; vy: number; life: number; color: string }[];
  // lightning：折线顶点序列（塔→敌人1→敌人2...）
  points?: Vec2[];
  // shockwave：最大半径
  radius?: number;
}

// ===== 波次定义 =====
export type WaveScale = 'many' | 'medium' | 'few'; // 多75/中35/少15

export interface WaveSpawn {
  enemyId: string;
  count: number;
  interval: number; // 出生间隔秒
  startDelay: number; // 波次开始后延迟
}

export interface WaveDef {
  index: number; // 1-based
  isBoss: boolean;
  isEconomy: boolean;
  spawns: WaveSpawn[];
  rewardGold: number;
  rewardWood: number;
  bossTimer?: number; // Boss 击杀限时秒
  hint: string; // 波次提示文字
}

// ===== 合成配方 =====
export interface Recipe {
  id: string;
  name: string;
  ingredients: { towerId: string; level?: number }[];
  result: { towerId: string; level?: number };
  cost?: { gold?: number; wood?: number };
}

// ===== 技能定义 =====
export type SkillType = 'active' | 'passive' | 'aura';

export interface SkillDef {
  id: string;
  name: string;
  type: SkillType;
  maxLevel: number;
  description: string;
  // 触发条件（属性节点）
  reqStr?: number;
  reqInt?: number;
  // 效果
  effect: string;
  values: number[]; // 各等级数值
  // 主动技能冷却（秒）
  cooldown?: number;
  // 主动技能作用范围（像素，0=单体/全屏）
  range?: number;
  // 暴击被动触发概率（0~1）
  critChance?: number;
}

// ===== 存档 =====
export interface SaveData {
  version: number;
  settings: { volume: number; quality: 'low' | 'high' };
  unlocks: { difficulties: Difficulty[]; endlessUnlocked: boolean };
  leaderboard: { endless: { wave: number; score: number; date: number }[] };
  bestPf: number;
}

// re-export
export type { Difficulty, GamePhase } from './config';
