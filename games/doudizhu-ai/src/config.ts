/** 游戏全局常量 */
import type { ProviderId } from "./types";

/** AI 决策最多重试次数，超过则判负 */
export const MAX_AI_ATTEMPTS = 3;
/** LLM 代理地址，部署到 Cloudflare Pages 后可用同域 `/api/llm` */
export const DEFAULT_PROXY_URL = "/api/llm";
/** LLM 采样温度，较低以抑制随机性 */
export const DEFAULT_TEMPERATURE = 0.4;
/** LLM 单次最大输出 token 数 */
export const DEFAULT_MAX_TOKENS = 600;
/** 基础分，结算时按阵营角色和倍数换算 */
export const BASE_SCORE = 1;
/** 初始倍数，炸弹/火箭每次翻倍 */
export const INITIAL_MULTIPLIER = 1;
/** AI 台词最大字数（中文字符） */
export const SPEECH_MAX_LENGTH = 40;

/** 各厂商默认模型 */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  deepseek: "deepseek-chat",
  "spark-maas": "x1",
  agnes: "agnes-2.0-flash",
  nvidia: "z-ai/glm-5.1",
};
