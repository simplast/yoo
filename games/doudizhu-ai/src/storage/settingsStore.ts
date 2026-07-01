/**
 * 设置持久化
 *
 * 策略：
 * - 非敏感设置（厂商、模型、代理 URL 等）始终保存到 localStorage
 * - API Key 仅在用户勾选"记住本机密钥"时保存
 * - 内存中始终保留最新设置（localStorage 不可用时也能工作）
 * - clearSavedKeys() 可一键清除已保存的密钥
 */
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODELS,
  DEFAULT_PROXY_URL,
  DEFAULT_TEMPERATURE,
} from "../config";
import type { GameSettings } from "../types";

const STORAGE_KEY = "yoo.doudizhu-ai.settings.v1";

/** 持久化的设置类型：AI 的 apiKey 可选 */
type StoredSettings = Omit<GameSettings, "ai"> & {
  ai: {
    "ai-calm": Omit<GameSettings["ai"]["ai-calm"], "apiKey"> & {
      apiKey?: string;
    };
    "ai-aggressive": Omit<GameSettings["ai"]["ai-aggressive"], "apiKey"> & {
      apiKey?: string;
    };
  };
};

/** 内存中的当前设置（localStorage 不可用时的 fallback） */
let memorySettings: GameSettings = createDefaultSettings();

export const settingsStore = {
  /** 加载设置：localStorage → merge → 内存 */
  load(): GameSettings {
    const stored = readStoredSettings();
    memorySettings = mergeSettings(
      createDefaultSettings(),
      stored,
      memorySettings,
    );
    return cloneSettings(memorySettings);
  },

  /** 保存设置：写入内存 + localStorage */
  save(settings: GameSettings): void {
    memorySettings = cloneSettings(settings);
    const stored: StoredSettings = {
      proxyUrl: settings.proxyUrl,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      ai: {
        "ai-calm": persistableAi(settings.ai["ai-calm"]),
        "ai-aggressive": persistableAi(settings.ai["ai-aggressive"]),
      },
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // localStorage 不可用时静默失败（隐私模式等）
    }
  },

  /** 清除已保存的密钥 */
  clearSavedKeys(): void {
    const current = this.load();
    current.ai["ai-calm"].rememberKey = false;
    current.ai["ai-calm"].apiKey = "";
    current.ai["ai-aggressive"].rememberKey = false;
    current.ai["ai-aggressive"].apiKey = "";
    this.save(current);
  },
};

export function createDefaultSettings(): GameSettings {
  return {
    ai: {
      "ai-calm": {
        provider: "chenapi",
        model: DEFAULT_MODELS.chenapi,
        apiKey: "",
        rememberKey: false,
      },
      "ai-aggressive": {
        provider: "chenapi",
        model: DEFAULT_MODELS.chenapi,
        apiKey: "",
        rememberKey: false,
      },
    },
    proxyUrl: DEFAULT_PROXY_URL,
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
  };
}

/** 仅序列化已授权的字段，apiKey 只在 rememberKey 为 true 时写入 */
function persistableAi(
  ai: GameSettings["ai"]["ai-calm"],
): StoredSettings["ai"]["ai-calm"] {
  return {
    provider: ai.provider,
    model: ai.model,
    rememberKey: ai.rememberKey,
    ...(ai.rememberKey ? { apiKey: ai.apiKey } : {}),
  };
}

function readStoredSettings(): StoredSettings | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSettings>;
    if (!parsed || typeof parsed !== "object" || !parsed.ai) return null;
    return parsed as StoredSettings;
  } catch {
    return null;
  }
}

/** 三层合并：defaults < stored < memory（内存优先） */
function mergeSettings(
  defaults: GameSettings,
  stored: StoredSettings | null,
  memory: GameSettings,
): GameSettings {
  if (!stored) return memory;
  return {
    proxyUrl: stringOr(stored.proxyUrl, defaults.proxyUrl),
    temperature: numberOr(stored.temperature, defaults.temperature),
    maxTokens: numberOr(stored.maxTokens, defaults.maxTokens),
    ai: {
      "ai-calm": {
        provider:
          stored.ai["ai-calm"]?.provider ?? defaults.ai["ai-calm"].provider,
        model: stringOr(
          stored.ai["ai-calm"]?.model,
          defaults.ai["ai-calm"].model,
        ),
        rememberKey: Boolean(stored.ai["ai-calm"]?.rememberKey),
        apiKey: stored.ai["ai-calm"]?.rememberKey
          ? stringOr(stored.ai["ai-calm"]?.apiKey, "")
          : memory.ai["ai-calm"].apiKey,
      },
      "ai-aggressive": {
        provider:
          stored.ai["ai-aggressive"]?.provider ??
          defaults.ai["ai-aggressive"].provider,
        model: stringOr(
          stored.ai["ai-aggressive"]?.model,
          defaults.ai["ai-aggressive"].model,
        ),
        rememberKey: Boolean(stored.ai["ai-aggressive"]?.rememberKey),
        apiKey: stored.ai["ai-aggressive"]?.rememberKey
          ? stringOr(stored.ai["ai-aggressive"]?.apiKey, "")
          : memory.ai["ai-aggressive"].apiKey,
      },
    },
  };
}

function cloneSettings(settings: GameSettings): GameSettings {
  return {
    proxyUrl: settings.proxyUrl,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    ai: {
      "ai-calm": { ...settings.ai["ai-calm"] },
      "ai-aggressive": { ...settings.ai["ai-aggressive"] },
    },
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
