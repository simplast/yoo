import { generateText, hasToolCall, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod/v4";
import type {
  AiToolContext,
  CardId,
  LlmMessage,
  NormalizedLlmError,
  NormalizedLlmRequest,
  NormalizedLlmResponse,
  ProviderId,
  ToolValidationOutput,
} from "../../games/doudizhu-ai/src/types";
import { validateMove } from "../../games/doudizhu-ai/src/rules/moveValidator";
import { matchCardsByRank } from "../../games/doudizhu-ai/src/rules/card";

interface PagesContext {
  request: Request;
}

type LlmProxyResponse = NormalizedLlmResponse | NormalizedLlmError;

interface OpenAiCompatibleProviderConfig {
  id: ProviderId;
  baseURL: string;
  displayName: string;
}

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const PROVIDERS: Record<ProviderId, OpenAiCompatibleProviderConfig> = {
  deepseek: {
    id: "deepseek",
    baseURL: "https://api.deepseek.com/v1",
    displayName: "DeepSeek",
  },
  "spark-maas": {
    id: "spark-maas",
    baseURL: "https://maas-api.cn-huabei-1.xf-yun.com/v2",
    displayName: "星火 MaaS",
  },
  agnes: {
    id: "agnes",
    baseURL: "https://apihub.agnes-ai.com/v1",
    displayName: "Agnes",
  },
  nvidia: {
    id: "nvidia",
    baseURL: "https://integrate.api.nvidia.com/v1",
    displayName: "NVIDIA NIM",
  },
  chenapi: {
    id: "chenapi",
    baseURL: "http://api.chenbei.online",
    displayName: "chenAPI",
  },
};

const validateMoveInputSchema = z.object({
  action: z.enum(["play", "pass"]),
  cards: z.array(z.string()).default([]),
  reason: z.string().max(200).optional(),
  speech: z.string().min(1).max(80),
});

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  let requestBody: unknown;
  try {
    requestBody = await context.request.json();
  } catch {
    return json(error("BAD_JSON", "请求体必须是 JSON。"), 400);
  }

  const normalized = validateRequest(requestBody);
  if (!normalized.ok) {
    return json(normalized, 400);
  }

  try {
    const result = await runAiSdkDecision(normalized.value);
    return json(result);
  } catch (caught) {
    return json(normalizeAiSdkError(caught, normalized.value.provider), 502);
  }
}

export async function onRequest(): Promise<Response> {
  return json(error("METHOD_NOT_ALLOWED", "只支持 POST /api/llm。"), 405);
}

async function runAiSdkDecision(
  request: NormalizedLlmRequest,
): Promise<LlmProxyResponse> {
  if (!request.toolContext) {
    return {
      ok: false,
      error: {
        code: "MISSING_TOOL_CONTEXT",
        message: "AI SDK 工具校验需要 toolContext。",
      },
    } satisfies NormalizedLlmError;
  }

  const providerConfig = PROVIDERS[request.provider];
  const provider = createOpenAI({
    apiKey: request.apiKey,
    baseURL: providerConfig.baseURL,
    name: providerConfig.id,
    // DeepSeek V4 默认开启思考模式，需在请求体中注入 thinking: disabled
    // 才能正常支持工具调用（思考模式下工具调用不稳定）
    ...(request.provider === "deepseek"
      ? {
          fetch: async (url: string, init?: RequestInit) => {
            if (init?.body && typeof init.body === "string") {
              const body = JSON.parse(init.body);
              body.thinking = { type: "disabled" };
              init = { ...init, body: JSON.stringify(body) };
            }
            return fetch(url, init);
          },
        }
      : {}),
  });
  const toolContext = request.toolContext;

  const prompt = splitInstructionsAndMessages(request.messages);

  const result = await generateText({
    model: provider.chat(request.model),
    instructions: prompt.instructions,
    messages: prompt.messages,
    temperature: clamp(request.temperature, 0, 2),
    maxOutputTokens: Math.max(1, Math.floor(request.maxTokens)),
    tools: {
      validateMove: tool({
        description:
          "提交斗地主动作并由游戏规则引擎校验。必须调用此工具来出牌或跳过。cards 用点数（3-2）或 BJ/RJ。",
        inputSchema: validateMoveInputSchema,
        execute: async (input): Promise<ToolValidationOutput> => {
          const hand = toolContext.state.players[toolContext.playerId].hand;
          const action = input.action;
          // pass 时 cards 为空
          if (action === "pass") {
            return {
              action: "pass",
              cards: [],
              speech: input.speech,
              reason: input.reason,
              validation: validateMove(toolContext.state, {
                playerId: toolContext.playerId,
                action: "pass",
                cards: [],
              }),
            };
          }
          // play 时：从手牌匹配实际 CardId
          const resolved = matchCardsByRank(hand, input.cards);
          const cards: CardId[] = resolved ?? [];
          const validation = validateMove(toolContext.state, {
            playerId: toolContext.playerId,
            action: input.action,
            cards,
          });

          return {
            action: input.action,
            cards,
            speech: input.speech,
            reason: input.reason,
            validation,
          };
        },
      }),
    },
    stopWhen: hasToolCall("validateMove"),
    maxRetries: 1,
  });

  const toolResult = result.toolResults.find(
    (item) => item.toolName === "validateMove",
  )?.output as ToolValidationOutput | undefined;

  if (!toolResult) {
    // 模型未调用工具 — 返回错误而非空文本
    if (!result.text || result.text.trim().length === 0) {
      return {
        ok: false,
        error: {
          code: "MODEL_DID_NOT_CALL_TOOL",
          message: "模型未调用 validateMove 工具，且未返回文本。",
        },
      };
    }
    return {
      ok: true,
      text: result.text,
      usage: {
        promptTokens: result.usage.inputTokens,
        completionTokens: result.usage.outputTokens,
      },
    };
  }

  return {
    ok: true,
    text: result.text,
    toolResult,
    usage: {
      promptTokens: result.usage.inputTokens,
      completionTokens: result.usage.outputTokens,
    },
  };
}

function validateRequest(
  value: unknown,
): { ok: true; value: NormalizedLlmRequest } | NormalizedLlmError {
  const record = asRecord(value);

  if (
    record.provider !== "deepseek" &&
    record.provider !== "spark-maas" &&
    record.provider !== "agnes" &&
    record.provider !== "nvidia" &&
    record.provider !== "chenapi"
  ) {
    return error(
      "UNSUPPORTED_PROVIDER",
      "provider 必须是 deepseek、spark-maas、agnes、nvidia 或 chenapi。",
    );
  }

  if (typeof record.apiKey !== "string" || record.apiKey.trim() === "") {
    return error("MISSING_API_KEY", "apiKey 不能为空。");
  }

  if (typeof record.model !== "string" || record.model.trim() === "") {
    return error("MISSING_MODEL", "model 不能为空。");
  }

  const messages = validateMessages(record.messages);
  if (!messages.ok) return messages;

  const toolContext = validateToolContext(record.toolContext);
  if (!toolContext.ok) return toolContext;

  return {
    ok: true,
    value: {
      provider: record.provider,
      apiKey: record.apiKey,
      model: record.model.trim(),
      messages: messages.value,
      temperature:
        typeof record.temperature === "number" &&
        Number.isFinite(record.temperature)
          ? record.temperature
          : 0.4,
      maxTokens:
        typeof record.maxTokens === "number" &&
        Number.isFinite(record.maxTokens)
          ? record.maxTokens
          : 600,
      toolContext: toolContext.value,
    },
  };
}

function splitInstructionsAndMessages(messages: LlmMessage[]): {
  instructions: string | undefined;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean);

  const nonSystemMessages = messages
    .filter(
      (message): message is { role: "user" | "assistant"; content: string } =>
        message.role !== "system",
    )
    .map((message) => ({ role: message.role, content: message.content }));

  return {
    instructions:
      systemMessages.length > 0 ? systemMessages.join("\n\n") : undefined,
    messages: nonSystemMessages,
  };
}

function validateMessages(
  value: unknown,
): { ok: true; value: LlmMessage[] } | NormalizedLlmError {
  if (!Array.isArray(value) || value.length === 0) {
    return error("INVALID_MESSAGES", "messages 必须是非空数组。");
  }

  const messages: LlmMessage[] = [];
  for (const item of value) {
    const message = asRecord(item);
    if (
      !isRole(message.role) ||
      typeof message.content !== "string" ||
      message.content.trim() === ""
    ) {
      return error(
        "INVALID_MESSAGE",
        "每条 message 必须包含 role 和非空 content。",
      );
    }
    messages.push({ role: message.role, content: message.content });
  }
  return { ok: true, value: messages };
}

function validateToolContext(
  value: unknown,
): { ok: true; value: AiToolContext } | NormalizedLlmError {
  const context = asRecord(value);
  const state = asRecord(context.state);
  const playerId = context.playerId;

  if (playerId !== "ai-calm" && playerId !== "ai-aggressive") {
    return error(
      "INVALID_TOOL_CONTEXT",
      "toolContext.playerId 必须是 AI 玩家。",
    );
  }

  if (!state.players || !state.currentPlayerId || !state.order) {
    return error(
      "INVALID_TOOL_CONTEXT",
      "toolContext.state 缺少必要游戏状态。",
    );
  }

  return {
    ok: true,
    value: { state: state as unknown as AiToolContext["state"], playerId },
  };
}

function normalizeAiSdkError(
  caught: unknown,
  provider: ProviderId,
): NormalizedLlmError {
  const statusCode =
    typeof caught === "object" && caught !== null && "statusCode" in caught
      ? Number((caught as { statusCode?: unknown }).statusCode)
      : undefined;
  const message =
    caught instanceof Error
      ? caught.message
      : `${PROVIDERS[provider].displayName} 调用失败。`;

  if (statusCode === 401 || statusCode === 403) {
    return error("PROVIDER_AUTH_FAILED", message);
  }
  if (statusCode === 404) {
    return error("PROVIDER_MODEL_NOT_FOUND", message);
  }
  if (statusCode === 429) {
    return error("PROVIDER_RATE_LIMITED", message);
  }
  if (statusCode && statusCode >= 500) {
    return error("PROVIDER_UNAVAILABLE", message);
  }

  return error("PROVIDER_REQUEST_FAILED", message);
}

function json(body: LlmProxyResponse, status = body.ok ? 200 : 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...CORS_HEADERS,
    },
  });
}

function error(code: string, message: string): NormalizedLlmError {
  return { ok: false, error: { code, message } };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isRole(value: unknown): value is LlmMessage["role"] {
  return value === "system" || value === "user" || value === "assistant";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
