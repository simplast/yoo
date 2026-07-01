/**
 * 响应解析器 — 前端 fallback JSON 路径
 *
 * 当 AI SDK 返回纯文本（无 toolResult）时，从文本中提取并解析
 * validateMove JSON 工具调用。
 *
 * 接受去花色的点数格式（如 "3"、"K"），通过 matchCardsByRank 还原为内部 CardId。
 */
import { SPEECH_MAX_LENGTH } from '../config';
import type { Action, CardId, ToolCallProposal } from '../types';
import { matchCardsByRank, RANK_NAMES, sortCards } from '../rules/card';

export interface ParseSuccess { ok: true; proposal: ToolCallProposal; }
export interface ParseFailure { ok: false; code: string; message: string; }
export type ParseResult = ParseSuccess | ParseFailure;

/**
 * 从 LLM 文本响应中解析 validateMove 调用
 *
 * @param hand 当前 AI 的手牌（CardId[]），用于 matchCardsByRank 反向映射
 */
export function parseToolCallResponse(text: string, hand: CardId[]): ParseResult {
  if (typeof text !== 'string' || text.trim().length === 0) return fail('EMPTY_RESPONSE', '模型返回为空。');

  const jsonText = extractJsonObject(text.trim());
  if (!jsonText) return fail('NON_JSON_RESPONSE', '模型没有返回可解析的 JSON 对象。');

  let value: unknown;
  try { value = JSON.parse(jsonText); } catch {
    return fail('INVALID_JSON', '模型返回的 JSON 格式不合法。');
  }

  if (!isRecord(value)) return fail('INVALID_SCHEMA', '模型返回的顶层 JSON 必须是对象。');
  if (value.tool !== 'validateMove') return fail('INVALID_TOOL', '模型必须调用 validateMove。');
  if (!isRecord(value.arguments)) return fail('INVALID_ARGUMENTS', 'validateMove.arguments 必须是对象。');

  const action = value.arguments.action;
  if (!isAction(action)) return fail('INVALID_ACTION', 'arguments.action 必须是 play 或 pass。');

  const cards = value.arguments.cards;
  if (!Array.isArray(cards)) return fail('INVALID_CARDS', 'arguments.cards 必须是数组。');

  // 解析去花色的点数 → 还原为 CardId
  const rankNames: string[] = [];
  for (const card of cards) {
    if (typeof card !== 'string' || !RANK_NAMES.has(card)) return fail('INVALID_CARD', `非法牌名：${String(card)}。`);
    rankNames.push(card);
  }

  if (action === 'pass' && rankNames.length !== 0) return fail('PASS_WITH_CARDS', 'pass 动作必须使用空 cards 数组。');
  if (action === 'play' && rankNames.length === 0) return fail('PLAY_WITHOUT_CARDS', 'play 动作必须至少选择一张牌。');

  // 从手牌中匹配实际 CardId
  const parsedCards = matchCardsByRank(hand, rankNames);
  if (!parsedCards) return fail('CARDS_NOT_OWNED', '选中的牌不在手牌中。');

  // 去重检查
  if (new Set(sortCards(parsedCards)).size !== parsedCards.length)
    return fail('DUPLICATE_CARD', '重复选择同一张牌。');

  const speech = value.speech;
  if (typeof speech !== 'string' || speech.trim().length === 0) return fail('INVALID_SPEECH', 'speech 必须是非空字符串。');

  const reason = value.arguments.reason;
  if (reason !== undefined && typeof reason !== 'string') return fail('INVALID_REASON', 'arguments.reason 必须是字符串。');

  return {
    ok: true,
    proposal: {
      tool: 'validateMove',
      arguments: { action, cards: parsedCards, reason },
      speech: truncateSpeech(speech.trim()),
    },
  };
}

function extractJsonObject(text: string): string | null {
  if (text.startsWith('{') && text.endsWith('}')) return text;
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return null;
  let depth = 0, inString = false, escaped = false;
  for (let index = firstBrace; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) { escaped = false; }
      else if (char === '\\') { escaped = true; }
      else if (char === '"') { inString = false; }
      continue;
    }
    if (char === '"') { inString = true; }
    else if (char === '{') { depth += 1; }
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(firstBrace, index + 1);
    }
  }
  return null;
}

function isAction(value: unknown): value is Action { return value === 'play' || value === 'pass'; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncateSpeech(speech: string): string {
  return [...speech].slice(0, SPEECH_MAX_LENGTH).join('');
}

function fail(code: string, message: string): ParseFailure { return { ok: false, code, message }; }
