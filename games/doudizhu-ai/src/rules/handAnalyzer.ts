/**
 * 牌型识别器
 *
 * 输入手牌，识别其属于哪种斗地主牌型（13 种）。
 * 返回 HandPattern，包含类型、主牌值、张数等元信息。
 *
 * 识别逻辑按张数分治：1-5 张直接判定，≥5 张尝试顺子/连对/飞机等组合。
 */
import type { CardId, HandPattern, HandType } from '../types';
import { getCardValue, sortCards } from './card';

/** 按牌值分组的结果 */
interface CountGroup {
  value: number;
  count: number;
  cards: CardId[];
}

/** 构造 invalid 牌型（含错误信息） */
function invalid(cards: CardId[], message: string): HandPattern {
  return { type: 'invalid', cards: sortCards(cards), primaryValue: 0, length: cards.length, message };
}

/** 构造合法牌型 */
function valid(type: HandType, cards: CardId[], primaryValue: number, units?: number): HandPattern {
  return { type, cards: sortCards(cards), primaryValue, length: cards.length, ...(units === undefined ? {} : { units }) };
}

/** 将手牌按牌值分组（用于分析结构） */
function countByValue(cards: CardId[]): CountGroup[] {
  const map = new Map<number, CardId[]>();
  for (const card of cards) {
    const value = getCardValue(card);
    const existing = map.get(value) ?? [];
    existing.push(card);
    map.set(value, existing);
  }
  return [...map.entries()]
    .map(([value, groupedCards]) => ({ value, count: groupedCards.length, cards: groupedCards }))
    .sort((a, b) => a.value - b.value);
}

/** 判断一组牌值是否连续（且不含 2/Joker） */
function isConsecutive(values: number[]): boolean {
  if (values.length === 0 || values.some((value) => value >= 15)) return false;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] !== values[i - 1] + 1) return false;
  }
  return true;
}

/** 从分组中找出连续三张组（用于飞机识别） */
function findConsecutiveTripleValues(groups: CountGroup[], units: number): number[] | null {
  const tripleValues = groups.filter((group) => group.count === 3).map((group) => group.value);
  if (tripleValues.length !== units || !isConsecutive(tripleValues)) return null;
  return tripleValues;
}

/**
 * 核心入口：分析手牌牌型
 *
 * 按张数分类处理：
 * - 1 张 → single
 * - 2 张 → pair / rocket
 * - 3 张 → triple
 * - 4 张 → bomb / triple-single
 * - 5 张 → triple-pair / straight
 * - ≥5 张 → straight / consecutive-pairs / airplane 系列 / four-two
 */
export function analyzeHand(cards: CardId[]): HandPattern {
  const sorted = sortCards(cards);
  const length = sorted.length;

  if (length === 0) return invalid(cards, 'No cards were selected.');

  const uniqueCards = new Set(sorted);
  if (uniqueCards.size !== sorted.length)
    return invalid(cards, 'Duplicate card ids are not allowed in a single hand.');

  const groups = countByValue(sorted);
  const counts = groups.map((group) => group.count).sort((a, b) => b - a);
  const values = groups.map((group) => group.value);
  const maxValue = Math.max(...values);

  // 1-3 张：简单判定
  if (length === 1) return valid('single', sorted, maxValue);
  if (length === 2) {
    if (sorted.includes('BJ') && sorted.includes('RJ')) return valid('rocket', sorted, 17);
    return counts[0] === 2 ? valid('pair', sorted, maxValue) : invalid(cards, 'Two cards must be a pair or rocket.');
  }
  if (length === 3)
    return counts[0] === 3 ? valid('triple', sorted, maxValue) : invalid(cards, 'Three cards must have the same rank.');

  // 4 张：bomb 或 triple-single
  if (length === 4) {
    if (counts[0] === 4) return valid('bomb', sorted, maxValue);
    const triple = groups.find((group) => group.count === 3);
    return triple ? valid('triple-single', sorted, triple.value) : invalid(cards, 'Four cards must be a bomb or three-with-one.');
  }

  // 5 张：triple-pair 或 straight
  if (length === 5) {
    const triple = groups.find((group) => group.count === 3);
    if (triple && groups.some((group) => group.count === 2)) return valid('triple-pair', sorted, triple.value);
    if (groups.every((group) => group.count === 1) && isConsecutive(values)) return valid('straight', sorted, maxValue, length);
    return invalid(cards, 'Five cards must be a straight or three-with-pair.');
  }

  // ≥5 张全单且连续 → straight
  if (groups.every((group) => group.count === 1) && length >= 5 && isConsecutive(values))
    return valid('straight', sorted, maxValue, length);

  // ≥6 张全对且连续 → consecutive-pairs
  if (length >= 6 && length % 2 === 0 && groups.every((group) => group.count === 2) && isConsecutive(values))
    return valid('consecutive-pairs', sorted, maxValue, groups.length);

  // ≥6 张全三且连续 → airplane
  if (length >= 6 && length % 3 === 0 && groups.every((group) => group.count === 3) && isConsecutive(values))
    return valid('airplane', sorted, maxValue, groups.length);

  // 四带二（6 或 8 张）
  if (length === 6 || length === 8) {
    const four = groups.find((group) => group.count === 4);
    if (four) {
      const attachments = groups.filter((group) => group.value !== four.value);
      const hasTwoSingles = length === 6 && attachments.reduce((total, group) => total + group.count, 0) === 2;
      const hasTwoPairs = length === 8 && attachments.length === 2 && attachments.every((group) => group.count === 2);
      if (hasTwoSingles || hasTwoPairs) return valid('four-two', sorted, four.value);
    }
  }

  // 飞机带单（≥8 张，每 4 张一组：3+1）
  if (length >= 8 && length % 4 === 0) {
    const units = length / 4;
    const tripleValues = findConsecutiveTripleValues(groups, units);
    const attachments = groups.filter((group) => group.count !== 3);
    if (tripleValues && attachments.length === units && attachments.every((group) => group.count === 1))
      return valid('airplane-singles', sorted, Math.max(...tripleValues), units);
  }

  // 飞机带对（≥10 张，每 5 张一组：3+2）
  if (length >= 10 && length % 5 === 0) {
    const units = length / 5;
    const tripleValues = findConsecutiveTripleValues(groups, units);
    const attachments = groups.filter((group) => group.count !== 3);
    if (tripleValues && attachments.length === units && attachments.every((group) => group.count === 2))
      return valid('airplane-pairs', sorted, Math.max(...tripleValues), units);
  }

  return invalid(cards, 'Selected cards do not match a supported Doudizhu hand type.');
}

/** 返回牌型的中文名称（用于 UI 展示） */
export function describePattern(pattern: HandPattern): string {
  const typeLabel: Record<HandType, string> = {
    invalid: '非法牌型', single: '单张', pair: '对子', triple: '三张',
    'triple-single': '三带一', 'triple-pair': '三带二', straight: '顺子',
    'consecutive-pairs': '连对', airplane: '飞机', 'airplane-singles': '飞机带单',
    'airplane-pairs': '飞机带对', 'four-two': '四带二', bomb: '炸弹', rocket: '火箭',
  };
  return typeLabel[pattern.type];
}
