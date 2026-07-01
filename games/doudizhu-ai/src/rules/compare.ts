/**
 * 牌型比较器
 *
 * 判断一手牌能否压过另一手牌。
 * 规则：火箭无敌，炸弹可压非炸弹，同牌型比主牌值。
 */
import type { HandPattern } from '../types';

export interface CompareResult {
  canBeat: boolean;
  code?: string;
  message?: string;
}

function fail(code: string, message: string): CompareResult {
  return { canBeat: false, code, message };
}

/** 便捷方法：只返回 boolean */
export function canBeatHand(candidate: HandPattern, previous: HandPattern | null): boolean {
  return compareHands(candidate, previous).canBeat;
}

/**
 * 比较两手牌
 *
 * @param candidate 待出的牌型
 * @param previous 上一手牌（null 表示领出，任何合法牌型均可）
 */
export function compareHands(candidate: HandPattern, previous: HandPattern | null): CompareResult {
  if (candidate.type === 'invalid') return fail('INVALID_CANDIDATE', candidate.message ?? 'Candidate hand is invalid.');

  // 领出：无限制
  if (!previous || previous.type === 'invalid') return { canBeat: true };

  // 火箭无法被压
  if (previous.type === 'rocket') return fail('ROCKET_UNBEATABLE', 'Rocket is the highest hand.');

  // 火箭压一切
  if (candidate.type === 'rocket') return { canBeat: true };

  // 炸弹可压非炸弹（普通牌型）
  if (candidate.type === 'bomb' && previous.type !== 'bomb') return { canBeat: true };

  // 同牌型检查
  if (candidate.type !== previous.type)
    return fail('TYPE_MISMATCH', `A ${candidate.type} cannot beat a ${previous.type}.`);

  // 张数必须一致（同牌型下）
  if (candidate.length !== previous.length)
    return fail('LENGTH_MISMATCH', 'Hands of this type must have the same card count.');

  // 飞机/连对需相同单元数
  if ((candidate.units ?? 0) !== (previous.units ?? 0))
    return fail('UNIT_MISMATCH', 'Hands of this type must have the same sequence length.');

  // 主牌值必须更大
  if (candidate.primaryValue <= previous.primaryValue)
    return fail('NOT_HIGHER', 'Candidate hand must have a higher primary rank.');

  return { canBeat: true };
}
