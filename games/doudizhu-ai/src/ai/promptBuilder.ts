/**
 * Prompt 构造器
 *
 * 每次 AI 回合构建两条消息：
 * 1. system — 规则说明 + 人设
 * 2. user   — 当前局势 JSON（手牌、剩余牌数、上一手、合法动作等）
 *
 * 重试时附加 previousFailure 信息。
 */
import { SPEECH_MAX_LENGTH } from "../config";
import type { CardId, GameState, HandPattern, LegalActionHint, PlayedMove, PlayerId, ValidationResult } from "../types";
import { cardRank, handRanks } from "../rules/card";
import type { AiPersona, AiPlayerId } from "./personas";
import { getAiPersona } from "./personas";

export interface DecisionContext {
  state: GameState;
  playerId: AiPlayerId;
  legalActions: LegalActionHint[];
  previousFailure?: AiAttemptFailure;   // 上次校验失败信息（重试时注入）
  keyCardsPlayed?: CardId[];             // 已出关键牌
}

export interface AiAttemptFailure {
  attempt: number;
  code: string;
  message: string;
  proposedAction?: string;
  proposedCards?: string[];
}

export interface BuiltPrompt {
  messages: Array<{ role: "system" | "user"; content: string }>;
}

/** 构造完整的 system + user prompt */
export function buildDecisionPrompt(
  context: DecisionContext,
  persona: AiPersona = getAiPersona(context.playerId),
): BuiltPrompt {
  return {
    messages: [
      { role: "system", content: buildSystemPrompt(persona) },
      { role: "user", content: buildUserPrompt(context) },
    ],
  };
}

/** system 消息：固定规则 + 人设 */
function buildSystemPrompt(persona: AiPersona): string {
  return [
    "你正在玩中国斗地主。当前游戏地主随机产生，不存在叫抢地主阶段。",
    "你只能从自己手牌中选择牌。",
    "如果你是领出者，不能跳过；如果你是跟牌者，可以跳过，或者出合法且能压过上一手的牌。",
    "你必须调用 validateMove 工具提交动作，不要只用自然语言回答。",
    "validateMove 工具会校验你的出牌是否符合规则；如果失败，下一次会把失败原因告诉你。",
    `工具参数里的 speech 必须是一句非空中文短台词，最多 ${SPEECH_MAX_LENGTH} 个字符。`,
    "",
    `你的 AI 人设：${persona.name}`,
    `风格：${persona.style}`,
    `策略：${persona.strategy.map((item) => `- ${item}`).join("\n")}`,
    `台词风格：${persona.speechStyle}`,
    "",
    "工具参数：action 为 play 或 pass；cards 为 CardId 数组；reason 为中文理由；speech 为中文短台词。",
    "pass 时 cards 必须是空数组。play 时 cards 必须只包含你手牌中的 CardId。",
  ].join("\n");
}

/** user 消息：动态局势 JSON */
function buildUserPrompt(context: DecisionContext): string {
  const { state, playerId } = context;
  const player = state.players[playerId];
  const teammateIds = getTeammateIds(state, playerId);
  const isLeader = state.previousMove === null || state.trickLeaderId === playerId;

  const payload = {
    currentPlayer: { id: player.id, name: player.name, role: player.role, persona: playerId },
    teammateIds,
    hand: handRanks(player.hand),
    handCount: player.hand.length,
    remainingCards: Object.fromEntries(
      state.order.map((id) => [id, state.players[id].hand.length]),
    ) as Record<PlayerId, number>,
    previousMove: state.previousMove ? summarizePlayedMove(state.previousMove) : null,
    isNewTrickLeader: isLeader,
    multiplier: state.multiplier,
    passCount: state.passCount,
    keyCardsPlayed: context.keyCardsPlayed ?? summarizeKeyCards(state.history).map(cardRank),
    legalActions: summarizeLegalActions(context.legalActions),
    previousFailure: context.previousFailure ?? null,
  };

  return [
    "请根据当前局势选择一个动作。优先从 legalActions 中选择；如果你输出其他动作，本地 validateMove 仍会严格校验。",
    "当前局势 JSON：",
    JSON.stringify(payload, null, 2),
    "请直接调用 validateMove 工具提交你的动作。",
  ].join("\n");
}

/** 找出对局中同阵营的队友（地主无队友） */
function getTeammateIds(state: GameState, playerId: PlayerId): PlayerId[] {
  const player = state.players[playerId];
  if (player.role === "landlord") return [];
  return state.order.filter((id) => id !== playerId && state.players[id].role === "farmer");
}

function summarizePlayedMove(move: PlayedMove): {
  playerId: PlayerId; cards: CardId[]; pattern: Omit<HandPattern, "cards"> & { cards: CardId[] };
} {
  return { playerId: move.playerId, cards: move.cards, pattern: move.pattern };
}

/** 限制合法动作数量 + 去花色（prompt 不宜过长） */
function summarizeLegalActions(actions: LegalActionHint[]): Array<{ action: string; cards: string[]; label: string }> {
  return actions.slice(0, 24).map((a) => ({
    action: a.action,
    cards: a.cards.map((c) => cardRank(c)),
    label: a.label,
  }));
}

/** 提取已出的关键牌（2、小王、大王） */
function summarizeKeyCards(history: PlayedMove[]): CardId[] {
  const keyRanks = new Set(["2", "BJ", "RJ"]);
  const keyCards: CardId[] = [];
  for (const move of history) {
    for (const card of move.cards) {
      if (card === "BJ" || card === "RJ" || keyRanks.has(card.slice(1))) keyCards.push(card);
    }
  }
  return keyCards;
}

/** 将 validateMove 的校验失败转为 prompt 重试上下文 */
export function validationFailureToPromptFailure(
  attempt: number,
  validation: ValidationResult,
  proposedAction?: string,
  proposedCards?: string[],
): AiAttemptFailure {
  return {
    attempt,
    code: validation.code ?? "INVALID_MOVE",
    message: validation.message ?? "模型提交的动作未通过本地规则校验。",
    proposedAction,
    proposedCards,
  };
}
