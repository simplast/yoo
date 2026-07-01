/**
 * 领域类型定义
 *
 * 涵盖卡牌、玩家、牌型、游戏状态、LLM 请求/响应、AI 工具调用等核心类型。
 * 本文件是纯类型层，不依赖任何模块（除 TS 内置类型）。
 */

/* ---------- 卡牌 ---------- */

export type Suit = "S" | "H" | "C" | "D";
export type Rank =
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A"
  | "2"
  | "BJ"
  | "RJ";
/** 卡牌 ID，如 "S3"（黑桃3）、"BJ"（小王）、"RJ"（大王） */
export type CardId = `${Suit}${Exclude<Rank, "BJ" | "RJ">}` | "BJ" | "RJ";

export interface Card {
  id: CardId;
  suit: Suit | "Joker";
  rank: Rank;
  label: string; // 展示标签，如 "♠3"、"小王"
  value: number; // 数值大小，用于比较
}

/* ---------- 牌型 ---------- */

export type HandType =
  | "invalid"
  | "single"
  | "pair"
  | "triple"
  | "triple-single"
  | "triple-pair"
  | "straight"
  | "consecutive-pairs"
  | "airplane"
  | "airplane-singles"
  | "airplane-pairs"
  | "four-two"
  | "bomb"
  | "rocket";

export interface HandPattern {
  type: HandType;
  cards: CardId[];
  primaryValue: number; // 主牌值（用于比较）
  length: number; // 总张数
  units?: number; // 连续单元数（顺子/飞机用）
  message?: string; // invalid 时的错误信息
}

/* ---------- 玩家 ---------- */

export type PlayerId = "human" | "ai-calm" | "ai-aggressive";
export type Role = "landlord" | "farmer";
export type Action = "play" | "pass";

export interface PlayerState {
  id: PlayerId;
  name: string;
  role: Role;
  hand: CardId[];
  score: number;
}

/* ---------- 动作/校验 ---------- */

export interface MoveProposal {
  playerId: PlayerId;
  action: Action;
  cards: CardId[];
}

export interface NormalizedMove extends MoveProposal {
  pattern?: HandPattern;
}

export interface LegalActionHint {
  action: Action;
  cards: CardId[];
  label: string; // 人类可读描述
}

export interface ValidationResult {
  ok: boolean;
  code?: string;
  message?: string;
  normalizedMove?: NormalizedMove;
  allowedActionsHint?: LegalActionHint[];
}

/** 已生效的出牌记录 */
export interface PlayedMove {
  playerId: PlayerId;
  cards: CardId[];
  pattern: HandPattern;
}

/* ---------- 游戏状态 ---------- */

export type GamePhase =
  | "config" // 配置 AI 厂商/密钥
  | "dealing" // 发牌中
  | "playing" // 回合进行中
  | "awaiting-human" // 等待真人选择
  | "awaiting-ai" // 等待 AI 决策
  | "requesting-llm" // AI 正在请求 LLM
  | "paused-for-config" // 因鉴权/配置错误暂停
  | "forced-loss" // AI 判负
  | "round-over" // 牌局结束
  | "settlement"; // 结算展示中

export interface GameState {
  phase: GamePhase;
  players: Record<PlayerId, PlayerState>;
  order: PlayerId[]; // 出牌顺序 [human, ai-calm, ai-aggressive]
  currentPlayerId: PlayerId; // 当前轮到谁
  landlordId: PlayerId;
  bottomCards: CardId[]; // 地主底牌
  previousMove: PlayedMove | null; // 上一手出牌
  trickLeaderId: PlayerId; // 本轮领出者
  passCount: number; // 连续 pass 次数
  multiplier: number; // 当前倍数
  history: PlayedMove[]; // 出牌历史
  roundResult?: RoundResult;
}

export interface RoundResult {
  winnerSide: Role;
  reason: "empty-hand" | "forced-loss";
  forcedLoserId?: PlayerId;
  scoreDelta: Record<PlayerId, number>;
  multiplier: number;
  message: string;
}

/* ---------- 设置 ---------- */

export type ProviderId =
  "deepseek" | "spark-maas" | "agnes" | "nvidia" | "chenapi";

export interface AiSettings {
  provider: ProviderId;
  model: string;
  apiKey: string;
  rememberKey: boolean; // 是否保存到 localStorage
}

export interface GameSettings {
  ai: Record<"ai-calm" | "ai-aggressive", AiSettings>;
  proxyUrl: string;
  temperature: number;
  maxTokens: number;
}

/* ---------- LLM 通信 ---------- */

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 传给 /api/llm 供服务端执行 validateMove 的上下文 */
export interface AiToolContext {
  state: GameState;
  playerId: PlayerId;
}

/** 服务端 AI SDK 工具执行后返回的校验结果 */
export interface ToolValidationOutput {
  action: Action;
  cards: CardId[];
  speech: string;
  reason?: string;
  validation: ValidationResult;
}

export interface NormalizedLlmRequest {
  provider: ProviderId;
  apiKey: string;
  model: string;
  messages: LlmMessage[];
  temperature: number;
  maxTokens: number;
  toolContext?: AiToolContext;
}

export interface NormalizedLlmResponse {
  ok: true;
  text: string;
  /** AI SDK 原生 tool call 的执行结果（优先使用） */
  toolResult?: ToolValidationOutput;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface NormalizedLlmError {
  ok: false;
  error: { code: string; message: string };
}

export type LlmProxyResponse = NormalizedLlmResponse | NormalizedLlmError;

/** 前端 fallback 解析的 JSON 工具调用 */
export interface ToolCallProposal {
  tool: "validateMove";
  arguments: { action: Action; cards: CardId[]; reason?: string };
  speech: string;
}
