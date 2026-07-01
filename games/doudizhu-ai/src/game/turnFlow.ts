/**
 * 回合流转引擎
 *
 * 负责将校验通过的动作应用到游戏状态：
 * - 移除手牌
 * - 更新上一手 / 领出者
 * - 推进回合 / 处理两连 pass 重置
 * - 更新倍数（炸弹/火箭翻倍）
 * - 检测终局（手牌清空 → 结算）
 *
 * 同时提供 submitMove（校验 + 应用）和 mock AI 辅助。
 */
import type { CardId, GameState, MoveProposal, PlayedMove, PlayerId, ValidationResult } from "../types";
import { sortCards } from "../rules/card";
import { validateMove } from "../rules/moveValidator";
import { nextMultiplierForPattern, settleRoundByFinisher, settleRoundByForcedLoss, applyScoreDelta } from "../rules/scoring";
import { generateLegalActions } from "../rules/legalMoveGenerator";
import { getAwaitingPhase, getNextPlayerId } from "./state";

export interface ApplyMoveResult {
  state: GameState;
  validation: ValidationResult;
}

/** 从手牌中移除已出的牌 */
function removeCards(hand: CardId[], cards: CardId[]): CardId[] {
  const toRemove = new Set(cards);
  return hand.filter((card) => !toRemove.has(card));
}

/** 将 phase 还原为适当的 awaiting 阶段 */
function withAwaitingPhase(state: GameState): GameState {
  if (state.phase === "round-over" || state.phase === "settlement" || state.phase === "forced-loss") return state;
  return { ...state, phase: getAwaitingPhase(state.currentPlayerId) };
}

/** 标记游戏开始 */
export function startPlaying(state: GameState): GameState {
  return withAwaitingPhase({ ...state, phase: "playing" });
}

/**
 * 应用校验通过的动作到游戏状态
 *
 * @param state 当前状态
 * @param validation validateMove 返回的通过结果
 */
export function applyValidatedMove(state: GameState, validation: ValidationResult): GameState {
  if (!validation.ok || !validation.normalizedMove) return state;

  const move = validation.normalizedMove;

  // ---- pass ----
  if (move.action === "pass") {
    const passCount = state.passCount + 1;

    // 两连 pass：上一手出牌者成为新领出
    if (passCount >= 2 && state.previousMove) {
      return withAwaitingPhase({
        ...state,
        phase: "playing",
        currentPlayerId: state.previousMove.playerId,
        trickLeaderId: state.previousMove.playerId,
        previousMove: null,
        passCount: 0,
      });
    }

    return withAwaitingPhase({ ...state, phase: "playing", currentPlayerId: getNextPlayerId(state), passCount });
  }

  // ---- play ----
  if (!move.pattern) return state;

  const player = state.players[move.playerId];
  const nextHand = sortCards(removeCards(player.hand, move.cards));
  const players = { ...state.players, [move.playerId]: { ...player, hand: nextHand } };
  const playedMove: PlayedMove = { playerId: move.playerId, cards: move.cards, pattern: move.pattern };
  const multiplier = nextMultiplierForPattern(state.multiplier, move.pattern);

  // 手牌清空 → 终局结算
  if (nextHand.length === 0) {
    const roundState: GameState = {
      ...state, phase: "round-over", players, previousMove: playedMove,
      trickLeaderId: move.playerId, passCount: 0, multiplier,
      history: [...state.history, playedMove],
    };
    const result = settleRoundByFinisher(roundState, move.playerId);
    return applyScoreDelta({ ...roundState, phase: "settlement" }, result);
  }

  // 正常推进
  return withAwaitingPhase({
    ...state, phase: "playing", players,
    currentPlayerId: getNextPlayerId(state),
    previousMove: playedMove, trickLeaderId: move.playerId,
    passCount: 0, multiplier,
    history: [...state.history, playedMove],
  });
}

/**
 * 校验并应用动作（一体方法）
 * 校验不通过返回原状态 + 错误信息。
 */
export function submitMove(state: GameState, proposal: MoveProposal): ApplyMoveResult {
  const validation = validateMove(state, proposal);
  if (!validation.ok) return { state, validation };
  return { state: applyValidatedMove(state, validation), validation };
}

/** 强制某玩家判负（AI 连续非法决策场景） */
export function forcePlayerLoss(state: GameState, forcedLoserId: PlayerId): GameState {
  const forcedState: GameState = { ...state, phase: "forced-loss" };
  const result = settleRoundByForcedLoss(forcedState, forcedLoserId);
  return applyScoreDelta({ ...forcedState, phase: "settlement" }, result);
}

/** 从合法动作中选第一个 play 动作（Mock AI 用） */
export function chooseMockLegalMove(state: GameState): MoveProposal {
  const hints = generateLegalActions(state, 24);
  const firstPlay = hints.find((hint) => hint.action === "play");
  const choice = firstPlay ?? hints[0];
  return { playerId: state.currentPlayerId, action: choice.action, cards: choice.cards };
}

/** Mock AI 回合：自动选择合法动作 */
export function playMockAiTurn(state: GameState): ApplyMoveResult {
  if (state.currentPlayerId === "human") {
    return { state, validation: { ok: false, code: "NOT_AI_TURN", message: "Current player is human." } };
  }
  return submitMove(state, chooseMockLegalMove(state));
}
