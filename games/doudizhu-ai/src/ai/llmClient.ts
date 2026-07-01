/**
 * LLM 代理客户端（前端侧）
 *
 * 封装 fetch 调用 /api/llm，处理超时、网络错误和响应格式校验。
 * 可注入 fetchImpl 供测试用。
 */
import { DEFAULT_MAX_TOKENS, DEFAULT_PROXY_URL, DEFAULT_TEMPERATURE } from "../config";
import type { LlmProxyResponse, NormalizedLlmRequest } from "../types";

export interface LlmClientOptions {
  proxyUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface LlmClient {
  complete(request: NormalizedLlmRequest): Promise<LlmProxyResponse>;
}

/** 创建 LLM 客户端实例 */
export function createLlmClient(options: LlmClientOptions = {}): LlmClient {
  const proxyUrl = options.proxyUrl ?? DEFAULT_PROXY_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;

  return {
    async complete(request: NormalizedLlmRequest): Promise<LlmProxyResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalizeRequest(request)),
          signal: controller.signal,
        });

        const payload = await readJson(response);
        if (isLlmProxyResponse(payload)) return payload;

        return {
          ok: false,
          error: {
            code: response.ok ? "INVALID_PROXY_RESPONSE" : `HTTP_${response.status}`,
            message: response.ok ? "LLM 代理返回格式不合法。" : `LLM 代理请求失败：HTTP ${response.status}`,
          },
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof DOMException && error.name === "AbortError" ? "PROXY_TIMEOUT" : "PROXY_NETWORK_ERROR",
            message: error instanceof DOMException && error.name === "AbortError" ? "LLM 代理请求超时。" : "无法连接 LLM 代理。",
          },
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** 默认值填充 */
function normalizeRequest(request: NormalizedLlmRequest): NormalizedLlmRequest {
  return {
    ...request,
    temperature: Number.isFinite(request.temperature) ? request.temperature : DEFAULT_TEMPERATURE,
    maxTokens: Number.isFinite(request.maxTokens) ? request.maxTokens : DEFAULT_MAX_TOKENS,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

/** 类型守卫：校验 /api/llm 返回格式 */
function isLlmProxyResponse(value: unknown): value is LlmProxyResponse {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  const response = value as LlmProxyResponse;
  if (response.ok === true) return typeof response.text === "string";
  return response.ok === false && typeof response.error?.code === "string" && typeof response.error?.message === "string";
}
