/**
 * 出牌校验器 —— 游戏规则的唯一裁判
 *
 * 校验内容包括：
 * 1. 阶段正确（playing / awaiting-human / awaiting-ai）
 * 2. 轮到该玩家
 * 3. 卡牌归属正确
 * 4. pass 是否合法（领出者不可 pass）
 * 5. 牌型是否可识别
 * 6. 跟牌时能否压过上一手
 *
 * 这是 AI 安全的关键防线：LLM 不能直接改变游戏状态，必须通过此校验。
 */
import type { CardId, GameState, MoveProposal, ValidationResult } from '../types';
import { sortCards } from './card';
import { compareHands } from './compare';
import { analyzeHand } from './handAnalyzer';
import { generateLegalActions } from './legalMoveGenerator';

/** 构造校验失败结果，并附上合法动作提示 */
function fail(state: GameState, code: string, message: string): ValidationResult {
  return { ok: false, code, message, allowedActionsHint: generateLegalActions(state, 12) };
}

/** 检查手牌中是否包含请求的牌（支持重复校验） */
function hasCards(hand: CardId[], requested: CardId[]): boolean {
  const remaining = new Map<CardId, number>();
  for (const card of hand) remaining.set(card, (remaining.get(card) ?? 0) + 1);
  for (const card of requested) {
    const count = remaining.get(card) ?? 0;
    if (count <= 0) return false;
    remaining.set(card, count - 1);
  }
  return true;
}

/** 是否为新一轮领出（无上一手 或 自己是上一轮赢家） */
export function isLeadingTurn(state: GameState): boolean {
  return state.previousMove === null || state.currentPlayerId === state.trickLeaderId;
}

/**
 * 校验并规范动作
 *
 * @param state 当前游戏状态（phase 应设为 awaiting-*）
 * @param proposal 玩家或 AI 提交的动作提议
 * @returns 校验结果（ok + normalizedMove 或失败原因 + 合法动作提示）
 */
export function validateMove(state: GameState, proposal: MoveProposal): ValidationResult {
  // 阶段检查
  if (state.phase !== 'playing' && state.phase !== 'awaiting-human' && state.phase !== 'awaiting-ai') {
    return fail(state, 'INVALID_PHASE', `Cannot move while game phase is ${state.phase}.`);
  }

  if (!state.players[proposal.playerId]) return fail(state, 'UNKNOWN_PLAYER', `Unknown player ${proposal.playerId}.`);

  if (proposal.playerId !== state.currentPlayerId)
    return fail(state, 'NOT_YOUR_TURN', `It is ${state.currentPlayerId}'s turn, not ${proposal.playerId}'s.`);

  const player = state.players[proposal.playerId];
  const cards = sortCards(proposal.cards);

  // 禁止重复使用同一张牌 ID
  if (new Set(cards).size !== cards.length)
    return fail(state, 'DUPLICATE_CARDS', 'A move cannot include the same card id more than once.');

  // ---- pass 校验 ----
  if (proposal.action === 'pass') {
    if (cards.length > 0) return fail(state, 'PASS_WITH_CARDS', 'Pass actions must not include cards.');
    if (isLeadingTurn(state)) return fail(state, 'LEADER_CANNOT_PASS', 'The trick leader must play cards.');
    return { ok: true, normalizedMove: { playerId: proposal.playerId, action: 'pass', cards: [] } };
  }

  // ---- play 校验 ----
  if (proposal.action !== 'play') return fail(state, 'UNKNOWN_ACTION', `Unsupported action ${proposal.action as string}.`);
  if (cards.length === 0) return fail(state, 'PLAY_REQUIRES_CARDS', 'Play actions must include at least one card.');
  if (!hasCards(player.hand, cards)) return fail(state, 'CARDS_NOT_OWNED', 'Player does not own all selected cards.');

  // 牌型识别
  const pattern = analyzeHand(cards);
  if (pattern.type === 'invalid')
    return fail(state, 'INVALID_HAND', pattern.message ?? 'Selected cards do not form a legal hand.');

  // 非领出时，需压过上一手
  if (!isLeadingTurn(state)) {
    const compare = compareHands(pattern, state.previousMove?.pattern ?? null);
    if (!compare.canBeat)
      return fail(state, compare.code ?? 'CANNOT_BEAT_PREVIOUS', compare.message ?? 'Selected cards cannot beat the previous move.');
  }

  return { ok: true, normalizedMove: { playerId: proposal.playerId, action: 'play', cards: pattern.cards, pattern } };
}
