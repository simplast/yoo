// 护甲克制表（PRD 5.5 节）
// 行：攻击类型，列：护甲类型，值为伤害系数

import type { AttackType, ArmorType } from '../types';

// 护甲克制系数表
export const ARMOR_TABLE: Record<AttackType, Record<ArmorType, number>> = {
  // 普通攻击：对物理甲全额，魔法甲打折，神圣甲极低
  normal: { physical: 1.0, magic: 0.75, holy: 0.25, resist: 0.75 },
  // 穿刺攻击：克制物理甲
  pierce: { physical: 1.5, magic: 0.75, holy: 0.25, resist: 0.75 },
  // 魔法攻击：克制魔法甲
  magic: { physical: 0.75, magic: 1.5, holy: 0.25, resist: 0.75 },
  // 混乱攻击：无视所有护甲，全额伤害
  chaos: { physical: 1.0, magic: 1.0, holy: 1.0, resist: 1.0 },
  // 神圣攻击：克制神圣甲
  holy: { physical: 1.0, magic: 1.0, holy: 2.0, resist: 1.0 },
};

// 根据攻击类型与护甲类型获取伤害系数
export function getDamageMultiplier(attack: AttackType, armor: ArmorType): number {
  return ARMOR_TABLE[attack][armor];
}
