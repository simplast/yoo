/**
 * 计分与结算
 *
 * 公式：
 *   - 地主胜：地主 +2×倍数，农民各 -1×倍数
 *   - 农民胜：地主 -2×倍数，农民各 +1×倍数
 *   - 基础分 BASE_SCORE = 1
 *
 * 支持两种结算路径：
 *   - 正常出完手牌（settleRoundByFinisher）
 *   - AI 强制判负（settleRoundByForcedLoss）
 */
import type { GameState, PlayerId, Role, RoundResult } from '../types';
import { BASE_SCORE } from '../config';
import type { HandPattern } from '../types';

/** 炸弹/火箭触发倍数翻倍 */
export function nextMultiplierForPattern(currentMultiplier: number, pattern: HandPattern): number {
  return pattern.type === 'bomb' || pattern.type === 'rocket' ? currentMultiplier * 2 : currentMultiplier;
}

/** 正常结算：出完手牌的玩家所在阵营获胜 */
export function getWinnerSideByFinisher(state: GameState, finisherId: PlayerId): Role {
  return state.players[finisherId].role;
}

/** 强制判负结算：失态玩家阵营输 */
export function getWinnerSideForForcedLoss(state: GameState, forcedLoserId: PlayerId): Role {
  return state.players[forcedLoserId].role === 'landlord' ? 'farmer' : 'landlord';
}

/**
 * 计算各玩家分数变化
 *
 * 地主为 2 倍系数，农民为 1 倍系数。
 * 赢方为正，输方为负。
 */
export function calculateScoreDelta(state: GameState, winnerSide: Role): Record<PlayerId, number> {
  const scoreDelta = {} as Record<PlayerId, number>;
  for (const playerId of state.order) {
    const player = state.players[playerId];
    const sideSign = player.role === winnerSide ? 1 : -1;
    const roleUnits = player.role === 'landlord' ? 2 : 1;
    scoreDelta[playerId] = sideSign * roleUnits * BASE_SCORE * state.multiplier;
  }
  return scoreDelta;
}

/** 正常出完结算 */
export function settleRoundByFinisher(state: GameState, finisherId: PlayerId): RoundResult {
  const winnerSide = getWinnerSideByFinisher(state, finisherId);
  const scoreDelta = calculateScoreDelta(state, winnerSide);
  return {
    winnerSide,
    reason: 'empty-hand',
    scoreDelta,
    multiplier: state.multiplier,
    message: winnerSide === 'landlord' ? '地主出完手牌，地主获胜。' : '农民出完手牌，农民阵营获胜。',
  };
}

/** AI 强制判负结算 */
export function settleRoundByForcedLoss(state: GameState, forcedLoserId: PlayerId): RoundResult {
  const winnerSide = getWinnerSideForForcedLoss(state, forcedLoserId);
  const scoreDelta = calculateScoreDelta(state, winnerSide);
  return {
    winnerSide,
    reason: 'forced-loss',
    forcedLoserId,
    scoreDelta,
    multiplier: state.multiplier,
    message: `${state.players[forcedLoserId].name} 连续非法决策，${winnerSide === 'landlord' ? '地主' : '农民'}阵营获胜。`,
  };
}

/** 将分数变化应用到玩家状态并写入 roundResult */
export function applyScoreDelta(state: GameState, result: RoundResult): GameState {
  const players = { ...state.players };
  for (const playerId of state.order) {
    players[playerId] = { ...players[playerId], score: players[playerId].score + result.scoreDelta[playerId] };
  }
  return { ...state, players, roundResult: result };
}
