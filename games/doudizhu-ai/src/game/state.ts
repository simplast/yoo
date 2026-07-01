/**
 * 游戏状态创建工具
 *
 * 负责新牌局初始化：洗牌、发牌、随机地主、构造初始 GameState。
 * 提供 getNextPlayerId / getAwaitingPhase 等辅助函数。
 */
import type { CardId, GameState, PlayerId, PlayerState } from "../types";
import { INITIAL_MULTIPLIER } from "../config";
import { createDeck, dealCards, shuffleDeck, type RandomSource } from "../rules/deck";
import { sortCards } from "../rules/card";

/** 默认出牌顺序 */
export const DEFAULT_PLAYER_ORDER: PlayerId[] = ["human", "ai-calm", "ai-aggressive"];

const PLAYER_NAMES: Record<PlayerId, string> = {
  human: "你",
  "ai-calm": "冷静数学派",
  "ai-aggressive": "激进压迫派",
};

export interface CreateRoundOptions {
  random?: RandomSource;           // 可注入随机源用于测试
  landlordId?: PlayerId;           // 强制指定地主（测试用）
  previousScores?: Partial<Record<PlayerId, number>>; // 跨局累积分数
  order?: PlayerId[];              // 出牌顺序
}

/** 随机选一个玩家为地主 */
function pickRandomPlayer(order: PlayerId[], random: RandomSource): PlayerId {
  return order[Math.floor(random() * order.length)];
}

/** 为每位玩家创建 PlayerState */
export function createInitialPlayers(
  landlordId: PlayerId,
  hands: Record<PlayerId, CardId[]>,
  previousScores: Partial<Record<PlayerId, number>> = {},
  order: PlayerId[] = DEFAULT_PLAYER_ORDER,
): Record<PlayerId, PlayerState> {
  return Object.fromEntries(
    order.map((playerId) => [
      playerId,
      {
        id: playerId,
        name: PLAYER_NAMES[playerId],
        role: playerId === landlordId ? "landlord" : "farmer",
        hand: sortCards(hands[playerId]),
        score: previousScores[playerId] ?? 0,
      },
    ]),
  ) as Record<PlayerId, PlayerState>;
}

/**
 * 创建新牌局
 *
 * 流程：创建牌堆 → 洗牌 → 发牌 → 随机地主 → 分底牌 → 构造 GameState。
 * 地主先出。
 */
export function createNewRound(options: CreateRoundOptions = {}): GameState {
  const random = options.random ?? Math.random;
  const order = options.order ?? DEFAULT_PLAYER_ORDER;
  const landlordId = options.landlordId ?? pickRandomPlayer(order, random);
  const shuffled = shuffleDeck(createDeck(), random);
  const deal = dealCards(shuffled, order);

  // 地主获得底牌
  deal.hands[landlordId] = sortCards([...deal.hands[landlordId], ...deal.bottomCards]);

  return {
    phase: getAwaitingPhase(landlordId),
    players: createInitialPlayers(landlordId, deal.hands, options.previousScores, order),
    order,
    currentPlayerId: landlordId,
    landlordId,
    bottomCards: deal.bottomCards,
    previousMove: null,
    trickLeaderId: landlordId,
    passCount: 0,
    multiplier: INITIAL_MULTIPLIER,
    history: [],
  };
}

/** 获取按出牌顺序的下一个玩家 */
export function getNextPlayerId(state: GameState, playerId: PlayerId = state.currentPlayerId): PlayerId {
  const index = state.order.indexOf(playerId);
  if (index < 0) throw new Error(`Unknown player ${playerId}.`);
  return state.order[(index + 1) % state.order.length];
}

/** 根据玩家类型返回对应的等待阶段 */
export function getAwaitingPhase(playerId: PlayerId): GameState["phase"] {
  return playerId === "human" ? "awaiting-human" : "awaiting-ai";
}
