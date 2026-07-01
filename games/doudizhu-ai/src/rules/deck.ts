/**
 * 牌堆管理：创建、洗牌、发牌
 *
 * 54 张牌（52 普通 + 2 Joker），随机洗牌后每人 17 张 + 3 张底牌。
 * 地主随机分配，获得底牌。
 */
import type { CardId, PlayerId } from '../types';
import { NORMAL_RANKS, SUITS, sortCards } from './card';

export interface DealResult {
  hands: Record<PlayerId, CardId[]>;
  bottomCards: CardId[];  // 三张底牌
}

export type RandomSource = () => number;

/** 创建一副 54 张牌 */
export function createDeck(): CardId[] {
  const cards: CardId[] = [];
  for (const suit of SUITS) {
    for (const rank of NORMAL_RANKS) {
      cards.push(`${suit}${rank}` as CardId);
    }
  }
  cards.push('BJ', 'RJ');
  return cards;
}

/** Fisher-Yates 洗牌（可注入随机源用于测试） */
export function shuffleDeck(cards: CardId[], random: RandomSource = Math.random): CardId[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 发牌：按 order 顺序每人轮发 17 张，剩余 3 张为底牌。
 * 底牌由调用方（createNewRound）分给地主。
 */
export function dealCards(deck: CardId[], order: PlayerId[]): DealResult {
  if (deck.length !== 54) throw new Error(`Expected a 54-card deck, received ${deck.length}.`);
  if (order.length !== 3) throw new Error(`Expected exactly 3 players, received ${order.length}.`);

  const hands = Object.fromEntries(
    order.map((playerId) => [playerId, [] as CardId[]]),
  ) as Record<PlayerId, CardId[]>;
  const playableCards = deck.slice(0, 51);

  // 轮发：每人依次拿一张
  playableCards.forEach((card, index) => {
    hands[order[index % order.length]].push(card);
  });

  // 发完后每人手牌排序
  for (const playerId of order) {
    hands[playerId] = sortCards(hands[playerId]);
  }

  return { hands, bottomCards: sortCards(deck.slice(51)) };
}
