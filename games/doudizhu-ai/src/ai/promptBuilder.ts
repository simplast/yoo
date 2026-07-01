/**
 * Prompt 构造器
 *
 * 每次 AI 回合构建两条消息：
 * 1. system — 规则说明 + 人设（不含工具参数描述，由 AI SDK tool schema 提供）
 * 2. user   — XML 局势（手牌、结构、对手信息、出牌记录、关键牌、提示）
 *
 * validateMove 工具由服务端 AI SDK tool() 定义，输入 schema 自动发送给模型。
 * 重试时附加 previousFailure 信息。
 */
import { SPEECH_MAX_LENGTH } from "../config";
import type {
  CardId,
  GameState,
  LegalActionHint,
  PlayedMove,
  PlayerId,
  ValidationResult,
} from "../types";
import {
  cardRank,
  handRanks,
  ranksLabel,
  getRank,
  getCardValue,
  sortCards,
} from "../rules/card";
import { describePattern, analyzeHand } from "../rules/handAnalyzer";
import type { AiPersona, AiPlayerId } from "./personas";
import { AI_PERSONAS, getAiPersona } from "./personas";

export interface DecisionContext {
  state: GameState;
  playerId: AiPlayerId;
  legalActions: LegalActionHint[];
  previousFailure?: AiAttemptFailure; // 上次校验失败信息（重试时注入）
  keyCardsPlayed?: CardId[]; // 已出关键牌
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
      { role: "system", content: buildSystemPrompt(context, persona) },
      { role: "user", content: buildUserPrompt(context) },
    ],
  };
}

/* ---------- 牌型等级（注入 system prompt） ---------- */

const HAND_TYPE_HIERARCHY = [
  "牌型等级（从高到低，同类型比点数）：",
  "1. 火箭（BJ+RJ，最大，可压任何牌）",
  "2. 炸弹（四张同点数，可压火箭以外的任何牌，炸弹之间比点数）",
  "3. 单张、对子、三张、三带一、三带二 → 同类比较，必须点数更大",
  "4. 顺子（≥5 连单）、连对（≥3 连对）、飞机（≥2 连三张）→ 同长度同类型才能压，比最大点数",
  "5. 四带二（四张+两单/两对）→ 比四张的点数",
  "注意：不同类型之间，只有火箭和炸弹能压普通牌型；普通牌型只能被同类型更大的牌或火箭/炸弹压。",
];

const ROLE_STRATEGY = {
  landlord: [
    "你是地主，目标：尽快出完所有手牌。",
    "策略：主动出牌控制节奏；优先出掉小牌和零散牌；保留大牌用于收尾；考虑如何打破农民的配合。",
  ],
  farmer: [
    "你是农民，目标：和队友配合，阻止地主先出完。只要任一农民出完手牌即可获胜。",
    "策略：队友出小牌时不要压，让队友走；地主出牌时用最小的合法牌压；如果你手牌很少（≤3张），队友应主动帮你走牌；反之亦然。",
    "除非能直接获胜或帮队友获胜，尽量保留炸弹和 2。",
  ],
};

/* ---------- 构建 Prompt ---------- */

function buildSystemPrompt(
  context: DecisionContext,
  persona: AiPersona,
): string {
  const { state, playerId } = context;
  const role = state.players[playerId].role;
  const teammateId = state.order.find(
    (id) => id !== playerId && state.players[id].role === "farmer",
  );
  const teammateName = teammateId
    ? playerDisplayName(teammateId, playerId)
    : null;

  const lines: string[] = [
    "你正在玩中国斗地主。",
    ...HAND_TYPE_HIERARCHY,
    "",
    ...(ROLE_STRATEGY[role] ?? []),
  ];

  if (role === "farmer" && teammateName) {
    lines.push(
      `你的队友是「${teammateName}」。不要压队友的牌；队友出小牌让他走。`,
    );
  }

  lines.push(
    "",
    `你必须调用 validateMove 工具提交动作。speech 必须是非空中文短台词，最多 ${SPEECH_MAX_LENGTH} 字符。`,
    `你的 AI 人设：${persona.name}`,
    `风格：${persona.style}`,
    `策略：${persona.strategy.map((item) => `- ${item}`).join("\n")}`,
    `台词风格：${persona.speechStyle}`,
  );

  return lines.join("\n");
}

function buildUserPrompt(context: DecisionContext): string {
  const { state, playerId } = context;
  const xml = buildStateXml(context);
  const keyInfo = buildKeyCardsInfo(context);
  const legalText = buildCompactLegalActions(context.legalActions);
  const failureText = context.previousFailure
    ? `\n⚠️ 上次校验失败：${context.previousFailure.message}（动作：${context.previousFailure.proposedAction ?? "?"}，牌：${(context.previousFailure.proposedCards ?? []).join(" ") || "无"}）`
    : "";

  return [
    "根据当前局势，调用 validateMove 工具提交你的动作。",
    "",
    xml,
    keyInfo,
    "",
    legalText,
    failureText,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ---------- XML 构造 ---------- */

const ROLE_LABEL: Record<string, string> = { landlord: "地主", farmer: "农民" };
const MAX_HISTORY_TURNS = 10;

function playerDisplayName(id: PlayerId, currentPlayerId: AiPlayerId): string {
  if (id === currentPlayerId) return "你";
  if (id === "human") return "真人";
  return AI_PERSONAS[id as AiPlayerId]?.name ?? id;
}

function buildStateXml(context: DecisionContext): string {
  const { state, playerId } = context;
  const player = state.players[playerId];
  const others = state.order.filter((id) => id !== playerId);
  const isLeader =
    state.previousMove === null || state.trickLeaderId === playerId;

  const lines: string[] = [];
  lines.push("<state>");
  lines.push(`  <role>${ROLE_LABEL[player.role]}</role>`);
  lines.push(`  <hand>${handRanks(player.hand).join(" ")}</hand>`);
  lines.push(`  <structure>${analyzeHandStructure(player.hand)}</structure>`);
  lines.push("  <others>");
  for (const id of others) {
    const p = state.players[id];
    const isTeammate = player.role === "farmer" && p.role === "farmer";
    const tag = isTeammate ? "teammate" : "player";
    lines.push(
      `    <${tag} name="${playerDisplayName(id, playerId)}" role="${ROLE_LABEL[p.role]}" cards="${p.hand.length}"/>`,
    );
  }
  lines.push("  </others>");

  // 出牌记录（截断最近 N 条）
  if (state.history.length > 0) {
    const recent = state.history.slice(-MAX_HISTORY_TURNS);
    lines.push(`  <plays multiplier="${state.multiplier}">`);
    if (state.history.length > MAX_HISTORY_TURNS) {
      lines.push(
        `    <!-- 省略前 ${state.history.length - MAX_HISTORY_TURNS} 手 -->`,
      );
    }
    for (const move of recent) {
      const who = playerDisplayName(move.playerId, playerId);
      const cards = move.cards.map(cardRank).join(" ");
      const type = describePattern(move.pattern);
      lines.push(`    <turn who="${who}" type="${type}">${cards}</turn>`);
    }
    lines.push("  </plays>");
  }

  // 当前局势提示
  const hint = isLeader
    ? "你是领出者，必须出牌。"
    : state.previousMove
      ? `${playerDisplayName(state.previousMove.playerId, playerId)} 上一手出了 ${describePattern(state.previousMove.pattern)}: ${ranksLabel(state.previousMove.cards)}`
      : "等待出牌。";
  lines.push(`  <hint>${hint}</hint>`);
  lines.push("</state>");

  return lines.join("\n");
}

/* ---------- 手牌结构分析 ---------- */

/** 分析手牌结构，返回摘要文本（帮助 LLM 快速理解手牌） */
function analyzeHandStructure(hand: CardId[]): string {
  const sorted = sortCards(hand);
  const parts: string[] = [];

  // 按点数分组统计
  const byRank = new Map<string, CardId[]>();
  for (const card of sorted) {
    const rank = cardRank(card);
    const group = byRank.get(rank) ?? [];
    group.push(card);
    byRank.set(rank, group);
  }

  // 统计炸弹
  const bombs: string[] = [];
  const triples: string[] = [];
  const pairs: string[] = [];
  const singles: string[] = [];

  for (const [rank, cards] of byRank) {
    if (cards.length === 4) bombs.push(rank);
    else if (cards.length === 3) triples.push(rank);
    else if (cards.length === 2) pairs.push(rank);
    else if (cards.length === 1) singles.push(rank);
  }

  if (bombs.length) parts.push(`炸弹: ${bombs.join(" ")}（${bombs.length}个）`);
  if (triples.length) parts.push(`三张: ${triples.join(" ")}`);
  if (pairs.length) parts.push(`对子: ${pairs.join(" ")}`);
  if (singles.length) parts.push(`单张: ${singles.join(" ")}`);

  return parts.join(" | ") || "无特殊结构";
}

/* ---------- 已出关键牌 ---------- */

function buildKeyCardsInfo(context: DecisionContext): string {
  const keyCards =
    context.keyCardsPlayed ?? summarizeKeyCards(context.state.history);

  // 计算未出的关键牌
  const allKeys = ["2", "2", "2", "2", "BJ", "RJ"]; // 初始共 4 个 2 + 大小王
  const played = keyCards.map(cardRank);
  const remaining: string[] = [];
  const countPlayed = new Map<string, number>();
  for (const card of played) {
    countPlayed.set(card, (countPlayed.get(card) ?? 0) + 1);
  }

  const rankOrder = ["2", "BJ", "RJ"];
  for (const rank of rankOrder) {
    const p = countPlayed.get(rank) ?? 0;
    const total = rank === "2" ? 4 : 1;
    if (p < total) remaining.push(`${rank}(余${total - p})`);
  }

  if (remaining.length === 0) return "";

  // 判断自己的 2/小王 是否是最大单张
  const player = context.state.players[context.playerId];
  const myRanks = new Set(player.hand.map(cardRank));
  const insights: string[] = [];

  if (myRanks.has("2")) {
    // 还有未出的 2 吗？如果没有，且我有 2，则 2 是最大单张（除非有大小王）
    const remaining2 = 4 - (countPlayed.get("2") ?? 0);
    if (
      remaining2 <= (myRanks.has("2") ? 1 : 0) &&
      !myRanks.has("BJ") &&
      !myRanks.has("RJ")
    ) {
      // 检查外面是否有大小王
      if (
        (countPlayed.get("BJ") ?? 0) >= 1 &&
        (countPlayed.get("RJ") ?? 0) >= 1
      ) {
        insights.push("外面没有大小王，你的 2 是当前最大单张");
      }
    }
  }

  return `未出关键牌: ${remaining.join(" ")}${insights.length ? "。" + insights.join("；") : ""}`;
}

/* ---------- 合法动作（精简版） ---------- */

/** 精简合法动作：合并同牌型同点数的重复项 */
function buildCompactLegalActions(actions: LegalActionHint[]): string {
  const limited = actions.slice(0, 24);
  if (limited.length === 0) return "";

  const passAction = limited.find((a) => a.action === "pass");
  const playActions = limited.filter((a) => a.action === "play");

  // 按牌型和主牌值合并
  const merged = new Map<string, { cards: string; count: number }>();
  for (const a of playActions) {
    const analyzed = analyzeHand(a.cards);
    const key = `${analyzed.type}-${analyzed.primaryValue}`;
    const existing = merged.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      merged.set(key, {
        cards: a.cards.map(cardRank).join(" "),
        count: 1,
      });
    }
  }

  const items: string[] = [];
  if (passAction) items.push("pass（跳过）");

  // 按牌型分组输出
  const typeOrder = [
    "single",
    "pair",
    "triple",
    "bomb",
    "rocket",
    "straight",
    "triple-single",
    "triple-pair",
    "consecutive-pairs",
    "airplane",
    "airplane-singles",
    "airplane-pairs",
    "four-two",
  ];
  const byType = new Map<string, string[]>();

  for (const [key, info] of merged) {
    const type = key.split("-")[0];
    const group = byType.get(type) ?? [];
    const countSuffix = info.count > 1 ? `（${info.count}组可选）` : "";
    group.push(`[${info.cards}]${countSuffix}`);
    byType.set(type, group);
  }

  for (const type of typeOrder) {
    const group = byType.get(type);
    if (!group || group.length === 0) continue;
    const typeLabel = describePattern({
      type: type as never,
      cards: [],
      primaryValue: 0,
      length: 0,
    });
    items.push(`${typeLabel}: ${group.join("  ")}`);
  }

  return "合法动作:\n" + items.map((item) => `  ${item}`).join("\n");
}

/* ---------- 辅助函数 ---------- */

/** 提取已出的关键牌（2、小王、大王） */
function summarizeKeyCards(history: PlayedMove[]): CardId[] {
  const keyRanks = new Set(["2", "BJ", "RJ"]);
  const keyCards: CardId[] = [];
  for (const move of history) {
    for (const card of move.cards) {
      if (card === "BJ" || card === "RJ" || keyRanks.has(card.slice(1)))
        keyCards.push(card);
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
