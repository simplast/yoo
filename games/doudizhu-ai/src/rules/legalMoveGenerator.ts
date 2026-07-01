/**
 * 合法动作生成器 — 为 AI prompt 提供候选动作列表
 *
 * 从当前手牌中枚举所有能出且能压过上一手的牌型。
 * 采用启发式搜索：优先从分组（同值牌）构造常见牌型，再组合搜索复杂牌型。
 * 设置组合上限避免性能问题。
 */
import type { CardId, GameState, HandPattern, LegalActionHint } from "../types";
import { cardRank, sortCards, getCardValue } from "./card";
import { canBeatHand } from "./compare";
import { analyzeHand, describePattern } from "./handAnalyzer";

const MAX_HINTS = 80;                   // 最多返回的候选数
const MAX_COMBINATIONS_TO_INSPECT = 6000; // 组合搜索上限

/** 遍历组合（C(n, size)），visitor 返回 false 可提前终止 */
function forEachCombination<T>(items: T[], size: number, visit: (combo: T[]) => boolean | void): void {
  if (size > items.length) return;
  function walk(start: number, picked: T[]): boolean {
    if (picked.length === size) return visit([...picked]) === false;
    for (let i = start; i <= items.length - (size - picked.length); i += 1) {
      picked.push(items[i]);
      if (walk(i + 1, picked)) return true;
      picked.pop();
    }
    return false;
  }
  walk(0, []);
}

/** 将手牌按牌值分组 */
function byValueGroups(hand: CardId[]): Map<number, CardId[]> {
  const groups = new Map<number, CardId[]>();
  for (const card of sortCards(hand)) {
    const value = getCardValue(card);
    groups.set(value, [...(groups.get(value) ?? []), card]);
  }
  return groups;
}

/** 尝试添加候选（去重 + 校验） */
function addCandidate(candidates: Map<string, HandPattern>, cards: CardId[], previous: HandPattern | null): void {
  const pattern = analyzeHand(cards);
  if (pattern.type === "invalid" || !canBeatHand(pattern, previous)) return;
  candidates.set(pattern.cards.join(","), pattern);
}

/**
 * 生成可出牌型列表
 *
 * 策略：
 * 1. 从同值分组生成 singles/pairs/triples/bombs
 * 2. 检测火箭 (BJ+RJ)
 * 3. 组合搜索 straights / consecutive-pairs / airplanes 等
 */
export function generateLegalPlayPatterns(hand: CardId[], previous: HandPattern | null = null): HandPattern[] {
  const sortedHand = sortCards(hand);
  const groups = byValueGroups(sortedHand);
  const candidates = new Map<string, HandPattern>();

  // 跟牌时只搜索与上一手同长度的组合 + 炸弹/火箭
  const targetLengths = previous ? new Set([previous.length, 2, 4]) : null;
  const maybeAdd = (cards: CardId[]) => {
    if (targetLengths && !targetLengths.has(cards.length)) return;
    addCandidate(candidates, cards, previous);
  };

  // 从同值分组生成基础牌型
  for (const cards of groups.values()) {
    maybeAdd(cards.slice(0, 1));        // single
    if (cards.length >= 2) maybeAdd(cards.slice(0, 2)); // pair
    if (cards.length >= 3) maybeAdd(cards.slice(0, 3)); // triple
    if (cards.length === 4) maybeAdd(cards.slice(0, 4)); // bomb
  }

  // 火箭
  if (sortedHand.includes("BJ") && sortedHand.includes("RJ")) maybeAdd(["BJ", "RJ"]);

  // 组合搜索复杂牌型
  const maxComboLength = previous ? previous.length : Math.min(10, sortedHand.length);
  const minComboLength = previous ? previous.length : 4;
  let inspectedCombinations = 0;

  for (let size = minComboLength; size <= maxComboLength; size += 1) {
    if (size > sortedHand.length) break;
    let shouldStop = false;
    forEachCombination(sortedHand, size, (combo) => {
      inspectedCombinations += 1;
      maybeAdd(combo);
      shouldStop = candidates.size >= MAX_HINTS || inspectedCombinations >= MAX_COMBINATIONS_TO_INSPECT;
      return shouldStop ? false : undefined;
    });
    if (shouldStop) return [...candidates.values()].sort(comparePatternForHints);
  }

  return [...candidates.values()].sort(comparePatternForHints);
}

/** 候选排序：优先出高价值的牌（火箭 > 炸弹 > 张数少 > 主值低） */
function comparePatternForHints(a: HandPattern, b: HandPattern): number {
  const typeOrder = typePriority(a) - typePriority(b);
  if (typeOrder !== 0) return typeOrder;
  const lengthOrder = a.length - b.length;
  if (lengthOrder !== 0) return lengthOrder;
  return a.primaryValue - b.primaryValue;
}

function typePriority(pattern: HandPattern): number {
  if (pattern.type === "rocket") return 100;
  if (pattern.type === "bomb") return 90;
  return pattern.length;
}

/**
 * 为当前玩家生成合法动作列表（含 pass 和 play 候选）
 * 供 AI prompt 和校验失败时的提示使用。
 */
export function generateLegalActions(state: GameState, limit = 20): LegalActionHint[] {
  const player = state.players[state.currentPlayerId];
  const isLeader = state.currentPlayerId === state.trickLeaderId || state.previousMove === null;
  const previous = isLeader ? null : state.previousMove?.pattern ?? null;

  const patterns = generateLegalPlayPatterns(player.hand, previous);
  const hints: LegalActionHint[] = [];

  // 跟牌时可以 pass
  if (!isLeader) hints.push({ action: "pass", cards: [], label: "跳过" });

  hints.push(
    ...patterns.slice(0, limit).map((pattern) => ({
      action: "play" as const,
      cards: pattern.cards,
      label: `${describePattern(pattern)}：${pattern.cards.map((c) => cardRank(c)).join(' ')}`,
    })),
  );

  return hints;
}

/** 将合法动作列表转为 prompt 用的文字摘要 */
export function summarizeLegalActions(state: GameState, limit = 12): string {
  return generateLegalActions(state, limit)
    .map((hint, index) => `${index + 1}. ${hint.label}${hint.cards.length ? ` [${hint.cards.join(",")}]` : ""}`)
    .join("\n");
}
