/**
 * LLM 会话日志记录器
 *
 * 每局游戏创建一个实例，记录所有 AI 回合的 LLM 交互。
 * 日志通过 window.__doudizhuLogs 暴露到浏览器控制台。
 *
 * 使用方式：
 *   在浏览器控制台输入 __doudizhuLogs 查看当前会话的完整日志。
 *   __doudizhuLogs.pretty() 输出格式化的文本日志。
 */
import type { AiDecisionAttempt, AiDecisionResult } from "./decisionLoop";

/** 单次 LLM 调用的完整记录 */
export interface LlmCallEntry {
  /** 调用序号（跨整局递增） */
  callIndex: number;
  /** 调用时间 */
  timestamp: string;
  /** 哪个 AI 玩家 */
  playerId: string;
  /** 玩家角色 */
  role: string;
  /** 当前手牌（纯点数） */
  hand: string[];
  /** 手牌张数 */
  handCount: number;
  /** 发给 LLM 的 system prompt */
  systemPrompt: string;
  /** 发给 LLM 的 user prompt */
  userPrompt: string;
  /** LLM 返回的原始文本 */
  rawText?: string;
  /** 是否使用了服务端 tool call（AI SDK 工具路径） */
  usedToolResult: boolean;
  /** 重试次数 */
  attempts: number;
  /** 各次尝试的详细信息 */
  attemptDetails: AiDecisionAttempt[];
  /** 最终决策结果 */
  decision: AiDecisionResult;
}

export interface SessionLogger {
  /** 记录一次完整的 AI 回合 */
  logTurn(entry: LlmCallEntry): void;
  /** 获取所有日志 */
  getAll(): LlmCallEntry[];
  /** 清空当前会话日志 */
  clear(): void;
  /** 格式化输出（供控制台 __doudizhuLogs.pretty()） */
  pretty(): string;
}

/** 创建新的会话日志记录器 */
export function createSessionLogger(): SessionLogger {
  const entries: LlmCallEntry[] = [];

  const logger: SessionLogger = {
    logTurn(entry) {
      entries.push(entry);
    },
    getAll() {
      return entries;
    },
    clear() {
      entries.length = 0;
    },
    pretty() {
      if (entries.length === 0) return "（暂无 LLM 调用日志）\n";
      const lines: string[] = [
        `═══════════════════════════════════`,
        `  LLM 会话日志 · 共 ${entries.length} 次调用`,
        `═══════════════════════════════════`,
        "",
      ];
      for (const entry of entries) {
        const outcome = entry.decision.ok
          ? `✅ 通过 → ${entry.decision.move.action} ${entry.decision.move.cards.join(" ")} | 台词: ${entry.decision.speech}`
          : entry.decision.kind === "forced-loss"
            ? `❌ 判负 → ${entry.decision.reason}`
            : `⚠️ LLM 错误 → [${entry.decision.code}] ${entry.decision.message}`;

        lines.push(
          `── 调用 #${entry.callIndex} ─────────────────────────`,
          `  时间:    ${entry.timestamp}`,
          `  玩家:    ${entry.playerId}（${entry.role}）`,
          `  手牌:    ${entry.hand.join(" ")}（${entry.handCount} 张）`,
          `  路径:    ${entry.usedToolResult ? "AI SDK 工具" : "文本解析 fallback"}`,
          `  重试:    ${entry.attempts} 次`,
          `  结果:    ${outcome}`,
          `  系统 Prompt:`,
          ...entry.systemPrompt.split("\n").map((l) => `    │ ${l}`),
          `  用户 Prompt:`,
          ...entry.userPrompt.split("\n").map((l) => `    │ ${l}`),
          `  LLM 原文:`,
          `    ${entry.rawText ?? "（空）"}`,
          "",
        );
      }
      return lines.join("\n");
    },
  };

  // 暴露到全局
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__doudizhuLogs = logger;
  }

  return logger;
}
