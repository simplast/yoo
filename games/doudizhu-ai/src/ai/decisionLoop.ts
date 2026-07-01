/**
 * AI 决策循环
 *
 * 每次 AI 回合执行：
 *
 * 路径 1（主线）：LLM → AI SDK tool call → 服务端 validateMove → toolResult
 *   - 使用 toolResult.validation 决定是否通过
 *   - 优先于 fallback
 *
 * 路径 2（fallback）：LLM → 纯文本 → 前端 JSON 解析 → 本地 validateMove
 *   - 模型不支持 tool calling 或 SDK 未触发时使用
 *
 * 重试与判负：
 *   - 校验失败 → 注入错误信息到下一次 prompt，最多 3 次
 *   - 3 次后仍非法 → 该 AI 阵营判负（forced loss）
 *   - 鉴权/配置错误 → 暂停游戏，不判负
 */
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODELS,
  DEFAULT_PROXY_URL,
  DEFAULT_TEMPERATURE,
  MAX_AI_ATTEMPTS,
} from "../config";
import type {
  AiSettings,
  GameSettings,
  GameState,
  LegalActionHint,
  MoveProposal,
  NormalizedLlmRequest,
  NormalizedMove,
  ProviderId,
  ToolCallProposal,
  ValidationResult,
} from "../types";
import { createLlmClient, type LlmClient } from "./llmClient";
import type { AiPlayerId } from "./personas";
import {
  buildDecisionPrompt,
  type AiAttemptFailure,
  type DecisionContext,
  validationFailureToPromptFailure,
} from "./promptBuilder";
import { parseToolCallResponse } from "./responseParser";

export type ValidateMove = (
  state: GameState,
  proposal: MoveProposal,
) => ValidationResult;
export type GenerateLegalActions = (
  state: GameState,
  playerId: AiPlayerId,
) => LegalActionHint[];

export interface DecideMoveOptions {
  state: GameState;
  playerId: AiPlayerId;
  validateMove: ValidateMove;
  legalActions?: LegalActionHint[];
  generateLegalActions?: GenerateLegalActions;
  llmClient?: LlmClient;
  proxyUrl?: string;
  aiSettings?: AiSettings;
  gameSettings?: GameSettings;
  temperature?: number;
  maxTokens?: number;
  maxAttempts?: number;
}

/* ---------- 决策结果类型 ---------- */

export interface AiAcceptedDecision {
  ok: true;
  move: NormalizedMove;
  proposal: ToolCallProposal;
  speech: string;
  attempts: AiDecisionAttempt[];
}

export interface AiForcedLossDecision {
  ok: false;
  kind: "forced-loss";
  forcedLoserId: AiPlayerId;
  winnerSide: "landlord" | "farmer";
  reason: string;
  attempts: AiDecisionAttempt[];
}

export interface AiLlmErrorDecision {
  ok: false;
  kind: "llm-error";
  code: string;
  message: string;
  attempts: AiDecisionAttempt[];
}

export type AiDecisionResult =
  AiAcceptedDecision | AiForcedLossDecision | AiLlmErrorDecision;

/** 单次尝试的记录 */
export interface AiDecisionAttempt {
  attempt: number;
  promptFailure?: AiAttemptFailure;
  /** 发给 LLM 的 system prompt */
  systemPrompt?: string;
  /** 发给 LLM 的 user prompt */
  userPrompt?: string;
  rawText?: string;
  proposal?: ToolCallProposal;
  validation?: ValidationResult;
  error?: { code: string; message: string };
}

/**
 * 执行 AI 决策（含重试循环）
 *
 * @returns 决策结果 — 成功（move + speech）、LLM 错误（暂停）、或强制判负
 */
export async function decideAiMove(
  options: DecideMoveOptions,
): Promise<AiDecisionResult> {
  const maxAttempts = options.maxAttempts ?? MAX_AI_ATTEMPTS;
  const llmClient =
    options.llmClient ??
    createLlmClient({ proxyUrl: options.proxyUrl ?? DEFAULT_PROXY_URL });
  const attempts: AiDecisionAttempt[] = [];
  let previousFailure: AiAttemptFailure | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // 1. 构造 prompt（含上次错误）
    const context = createDecisionContext(options, previousFailure);
    const prompt = buildDecisionPrompt(context);
    const request = buildLlmRequest(options, prompt.messages);

    const attemptRecord: AiDecisionAttempt = {
      attempt,
      promptFailure: previousFailure,
      systemPrompt: prompt.messages.find((m) => m.role === "system")?.content,
      userPrompt: prompt.messages.find((m) => m.role === "user")?.content,
    };
    attempts.push(attemptRecord);

    if (!request.ok) {
      attemptRecord.error = request.error;
      return {
        ok: false,
        kind: "llm-error",
        code: request.error.code,
        message: request.error.message,
        attempts,
      };
    }

    // 2. 调用 /api/llm
    const response = await llmClient.complete(request.value);
    if (!response.ok) {
      attemptRecord.error = response.error;
      return {
        ok: false,
        kind: "llm-error",
        code: response.error.code,
        message: response.error.message,
        attempts,
      };
    }

    attemptRecord.rawText = response.text;

    // 3a. 主线：使用服务端 toolResult
    if (response.toolResult) {
      attemptRecord.validation = response.toolResult.validation;
      if (
        response.toolResult.validation.ok &&
        response.toolResult.validation.normalizedMove
      ) {
        return {
          ok: true,
          move: response.toolResult.validation.normalizedMove,
          proposal: {
            tool: "validateMove",
            arguments: {
              action: response.toolResult.action,
              cards: response.toolResult.cards,
              reason: response.toolResult.reason,
            },
            speech: response.toolResult.speech,
          },
          speech: response.toolResult.speech,
          attempts,
        };
      }

      // 服务端校验失败 → 注入错误，重试
      previousFailure = validationFailureToPromptFailure(
        attempt,
        response.toolResult.validation,
        response.toolResult.action,
        response.toolResult.cards,
      );
      continue;
    }

    // 3b. Fallback：解析文本 JSON
    const parsed = parseToolCallResponse(
      response.text,
      options.state.players[options.playerId].hand,
    );
    if (!parsed.ok) {
      attemptRecord.error = { code: parsed.code, message: parsed.message };
      previousFailure = { attempt, code: parsed.code, message: parsed.message };
      continue;
    }

    // 4. 本地校验
    attemptRecord.proposal = parsed.proposal;
    const moveProposal: MoveProposal = {
      playerId: options.playerId,
      action: parsed.proposal.arguments.action,
      cards: parsed.proposal.arguments.cards,
    };
    const validation = options.validateMove(options.state, moveProposal);
    attemptRecord.validation = validation;

    if (validation.ok && validation.normalizedMove) {
      return {
        ok: true,
        move: validation.normalizedMove,
        proposal: parsed.proposal,
        speech: parsed.proposal.speech,
        attempts,
      };
    }

    // 校验失败 → 重试
    previousFailure = validationFailureToPromptFailure(
      attempt,
      validation.ok
        ? {
            ok: false,
            code: "MISSING_NORMALIZED_MOVE",
            message: "规则校验通过但没有返回 normalizedMove。",
          }
        : validation,
      parsed.proposal.arguments.action,
      parsed.proposal.arguments.cards,
    );
  }

  // 5. 超过重试次数 → 强制判负
  return buildForcedLoss(
    options.state,
    options.playerId,
    maxAttempts,
    attempts,
  );
}

/* ---------- 内部辅助 ---------- */

function createDecisionContext(
  options: DecideMoveOptions,
  previousFailure: AiAttemptFailure | undefined,
): DecisionContext {
  const legalActions =
    options.legalActions ??
    options.generateLegalActions?.(options.state, options.playerId) ??
    [];
  return {
    state: options.state,
    playerId: options.playerId,
    legalActions,
    previousFailure,
  };
}

type BuildRequestResult =
  | { ok: true; value: NormalizedLlmRequest }
  | { ok: false; error: { code: string; message: string } };

/** 构造发给 /api/llm 的请求体 */
function buildLlmRequest(
  options: DecideMoveOptions,
  messages: NormalizedLlmRequest["messages"],
): BuildRequestResult {
  const settings = resolveAiSettings(options);
  if (!settings.ok) return settings;
  return {
    ok: true,
    value: {
      provider: settings.value.provider,
      apiKey: settings.value.apiKey,
      model: settings.value.model,
      messages,
      temperature: settings.value.temperature,
      maxTokens: settings.value.maxTokens,
      toolContext: { state: options.state, playerId: options.playerId },
    },
  };
}

/** 从多层配置中解析 AI 设置（决策参数 > 游戏设置 > 默认值） */
function resolveAiSettings(options: DecideMoveOptions):
  | {
      ok: true;
      value: {
        provider: ProviderId;
        apiKey: string;
        model: string;
        temperature: number;
        maxTokens: number;
      };
    }
  | { ok: false; error: { code: string; message: string } } {
  const ai = options.aiSettings ?? options.gameSettings?.ai[options.playerId];

  if (!ai)
    return {
      ok: false,
      error: {
        code: "MISSING_AI_SETTINGS",
        message: `缺少 ${options.playerId} 的 AI 配置。`,
      },
    };
  if (
    ai.provider !== "deepseek" &&
    ai.provider !== "spark-maas" &&
    ai.provider !== "agnes" &&
    ai.provider !== "nvidia" &&
    ai.provider !== "chenapi"
  )
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_PROVIDER",
        message: `不支持的 AI 厂商：${String(ai.provider)}。`,
      },
    };
  if (typeof ai.apiKey !== "string" || ai.apiKey.trim() === "")
    return {
      ok: false,
      error: {
        code: "MISSING_API_KEY",
        message: `缺少 ${options.playerId} 的 API Key。`,
      },
    };

  return {
    ok: true,
    value: {
      provider: ai.provider,
      apiKey: ai.apiKey,
      model: ai.model.trim() || DEFAULT_MODELS[ai.provider],
      temperature:
        options.temperature ??
        options.gameSettings?.temperature ??
        DEFAULT_TEMPERATURE,
      maxTokens:
        options.maxTokens ??
        options.gameSettings?.maxTokens ??
        DEFAULT_MAX_TOKENS,
    },
  };
}

/** 构造强制判负结果 */
function buildForcedLoss(
  state: GameState,
  playerId: AiPlayerId,
  maxAttempts: number,
  attempts: AiDecisionAttempt[],
): AiForcedLossDecision {
  const role = state.players[playerId].role;
  const winnerSide = role === "landlord" ? "farmer" : "landlord";
  const playerName = state.players[playerId].name;
  return {
    ok: false,
    kind: "forced-loss",
    forcedLoserId: playerId,
    winnerSide,
    reason: `${playerName}连续 ${maxAttempts} 次提交非法动作，触发强制判负。`,
    attempts,
  };
}
