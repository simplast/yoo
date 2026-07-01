/**
 * 卡牌定义与工具函数
 *
 * 内部 CardId = 花色+点数（如 S3, H3），保证同点牌唯一。
 * 对外（UI / LLM）始终用 cardRank() 去花色，只显示点数。
 * matchCardsByRank() 负责反向映射：点数 → 实际 CardId。
 */
import type { Card, CardId, Rank, Suit } from '../types';

export const SUITS: Suit[] = ['S', 'H', 'C', 'D'];
export const NORMAL_RANKS: Exclude<Rank, 'BJ' | 'RJ'>[] = [
  '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2',
];
export const RANKS: Rank[] = [...NORMAL_RANKS, 'BJ', 'RJ'];

export const RANK_VALUE: Record<Rank, number> = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 11, Q: 12, K: 13, A: 14, '2': 15, BJ: 16, RJ: 17,
};

/** 合法的对外卡牌名（点数 + 小王/大王），用于解析 LLM 返回 */
export const RANK_NAMES = new Set(['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', 'BJ', 'RJ']);

const SUIT_LABEL: Record<Suit, string> = { S: '♠', H: '♥', C: '♣', D: '♦' };

export function getRank(cardId: CardId): Rank {
  if (cardId === 'BJ' || cardId === 'RJ') return cardId;
  return cardId.slice(1) as Rank;
}

export function getCardValue(cardId: CardId): number {
  return RANK_VALUE[getRank(cardId)];
}

/** 外部表示：只显示点数，去花色前缀 */
export function cardRank(cardId: CardId): string {
  if (cardId === 'BJ') return 'BJ';
  if (cardId === 'RJ') return 'RJ';
  return cardId.slice(1);
}

/** 手牌 → 点数数组（去花色，用于 LLM prompt 和 UI 展示） */
export function handRanks(cards: CardId[]): string[] {
  return sortCards(cards).map(cardRank);
}

/** 点数数组的展示标签（空格分隔） */
export function ranksLabel(cards: CardId[]): string {
  return sortCards(cards).map(cardRank).join(' ');
}

/**
 * 从手牌中按点数匹配实际 CardId
 * 输入: hand = ["S3","H3","C3"], ranks = ["3","3"]
 * 输出: ["S3","H3"] （按 hand 顺序选前两个 3）
 * 失败返回 null（手牌不含足够数量的该点数）
 */
export function matchCardsByRank(hand: CardId[], requestedRanks: string[]): CardId[] | null {
  const available = [...hand];
  const result: CardId[] = [];

  for (const rank of requestedRanks) {
    const idx = available.findIndex((c) => cardRank(c) === rank);
    if (idx < 0) return null;
    result.push(available[idx]);
    available.splice(idx, 1);
  }

  return result;
}

export function createCard(cardId: CardId): Card {
  if (cardId === 'BJ') return { id: cardId, suit: 'Joker', rank: 'BJ', label: '小王', value: RANK_VALUE.BJ };
  if (cardId === 'RJ') return { id: cardId, suit: 'Joker', rank: 'RJ', label: '大王', value: RANK_VALUE.RJ };
  const suit = cardId[0] as Suit;
  const rank = getRank(cardId);
  return { id: cardId, suit, rank, label: `${SUIT_LABEL[suit]}${rank}`, value: RANK_VALUE[rank] };
}

export function compareCards(a: CardId, b: CardId): number {
  const valueDiff = getCardValue(a) - getCardValue(b);
  if (valueDiff !== 0) return valueDiff;
  return a.localeCompare(b);
}

export function sortCards(cards: CardId[], direction: 'asc' | 'desc' = 'asc'): CardId[] {
  const sorted = [...cards].sort(compareCards);
  return direction === 'asc' ? sorted : sorted.reverse();
}

/** 内部标签（含花色） */
export function cardLabel(cardId: CardId): string {
  return createCard(cardId).label;
}

/** 内部多牌标签（含花色） */
export function cardsLabel(cards: CardId[]): string {
  return sortCards(cards).map(cardLabel).join(' ');
}
