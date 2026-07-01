/**
 * 赛前配置面板
 *
 * 为每个 AI 提供：
 * - 厂商选择（DeepSeek / 星火 MaaS）
 * - 模型名输入
 * - API Key 输入（密码框）
 * - 记住本机密钥 checkbox
 *
 * 高级设置（折叠）：代理 URL、Temperature、Max Tokens。
 * 校验通过后触发 onStart。
 */
import type { GameSettings, PlayerId, ProviderId } from "../types";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODELS,
  DEFAULT_PROXY_URL,
  DEFAULT_TEMPERATURE,
} from "../config";

export interface ConfigPanelEvents {
  onStart: (settings: GameSettings) => void;
  onClose?: () => void;
}

const AI_IDS = ["ai-calm", "ai-aggressive"] as const;
const AI_NAMES: Record<(typeof AI_IDS)[number], string> = {
  "ai-calm": "冷静数学派",
  "ai-aggressive": "激进压迫派",
};

export class ConfigPanel {
  readonly element: HTMLDivElement;
  private form: HTMLFormElement;
  private currentSettings: GameSettings;
  private readonly onClose?: () => void;

  constructor(settings: GameSettings, events: ConfigPanelEvents) {
    this.currentSettings = settings;
    this.onClose = events.onClose;
    this.element = document.createElement("div");
    this.element.className = "config-panel";
    this.element.innerHTML = this.template(settings);
    this.form =
      this.element.querySelector("form") ?? document.createElement("form");

    // 关闭按钮
    const closeBtn = this.element.querySelector<HTMLButtonElement>(
      "[data-config-close]",
    );
    if (closeBtn) closeBtn.addEventListener("click", () => this.onClose?.());

    // 切换厂商时自动填充默认模型
    this.element.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (target.name.endsWith(".provider")) {
        const aiId = target.name.split(".")[0] as (typeof AI_IDS)[number];
        const modelInput = this.form.elements.namedItem(`${aiId}.model`);
        if (
          modelInput instanceof HTMLInputElement &&
          !modelInput.value.trim()
        ) {
          modelInput.value = DEFAULT_MODELS[target.value as ProviderId];
        }
      }
    });

    // 提交时校验 → onStart
    this.element.addEventListener("submit", (event) => {
      event.preventDefault();
      const next = this.readSettings();
      const validation = validateSettings(next);
      if (!validation.ok) {
        this.setError(validation.message);
        return;
      }
      this.setError("");
      this.currentSettings = next;
      events.onStart(next);
    });
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  update(settings: GameSettings): void {
    this.currentSettings = settings;
    this.element.innerHTML = this.template(settings);
    this.form =
      this.element.querySelector("form") ?? document.createElement("form");
    const closeBtn = this.element.querySelector<HTMLButtonElement>(
      "[data-config-close]",
    );
    if (closeBtn) closeBtn.addEventListener("click", () => this.onClose?.());
  }

  /** 从表单 DOM 读取当前配置 */
  private readSettings(): GameSettings {
    const readText = (name: string, fallback: string) => {
      const input = this.form.elements.namedItem(name);
      return input instanceof HTMLInputElement ? input.value.trim() : fallback;
    };
    const readNumber = (name: string, fallback: number) => {
      const input = this.form.elements.namedItem(name);
      return input instanceof HTMLInputElement &&
        Number.isFinite(Number(input.value))
        ? Number(input.value)
        : fallback;
    };
    const readProvider = (name: string, fallback: ProviderId) => {
      const input = this.form.elements.namedItem(name);
      return input instanceof HTMLSelectElement
        ? (input.value as ProviderId)
        : fallback;
    };
    const readChecked = (name: string) => {
      const input = this.form.elements.namedItem(name);
      return input instanceof HTMLInputElement ? input.checked : false;
    };

    return {
      ai: {
        "ai-calm": {
          provider: readProvider("ai-calm.provider", "deepseek"),
          model: readText("ai-calm.model", DEFAULT_MODELS.deepseek),
          apiKey: readText("ai-calm.apiKey", ""),
          rememberKey: readChecked("ai-calm.rememberKey"),
        },
        "ai-aggressive": {
          provider: readProvider("ai-aggressive.provider", "spark-maas"),
          model: readText("ai-aggressive.model", DEFAULT_MODELS["spark-maas"]),
          apiKey: readText("ai-aggressive.apiKey", ""),
          rememberKey: readChecked("ai-aggressive.rememberKey"),
        },
      },
      proxyUrl: readText("proxyUrl", DEFAULT_PROXY_URL),
      temperature: readNumber("temperature", DEFAULT_TEMPERATURE),
      maxTokens: readNumber("maxTokens", DEFAULT_MAX_TOKENS),
    };
  }

  private setError(message: string): void {
    const error = this.element.querySelector<HTMLElement>(
      "[data-config-error]",
    );
    if (error) error.textContent = message;
  }

  /** 使用 innerHTML 模板渲染（零框架依赖） */
  private template(settings: GameSettings): string {
    return `
      <form class="panel-card" autocomplete="off">
        <button type="button" class="panel-close" data-config-close aria-label="关闭">✕</button>
        <div class="panel-eyebrow">Cyber Doudizhu</div>
        <h1>AI 斗地主</h1>
        <p class="panel-copy">配置两个 AI 的厂商与密钥。密钥默认只保存在当前页面内存；只有勾选"保存到本地"时才会写入浏览器 localStorage。</p>
        <div class="ai-config-grid">
          ${AI_IDS.map((id) => this.aiSection(id, settings)).join("")}
        </div>
        <details class="advanced-config">
          <summary>高级设置</summary>
          <label><span>LLM 代理 URL</span><input name="proxyUrl" value="${escapeAttr(settings.proxyUrl)}" placeholder="/api/llm" /></label>
          <div class="inline-fields">
            <label><span>Temperature</span><input name="temperature" type="number" min="0" max="2" step="0.1" value="${settings.temperature}" /></label>
            <label><span>Max tokens</span><input name="maxTokens" type="number" min="100" max="4000" step="50" value="${settings.maxTokens}" /></label>
          </div>
        </details>
        <p class="config-error" data-config-error></p>
        <button class="primary-action" type="submit">开始一局</button>
      </form>
    `;
  }

  private aiSection(
    id: (typeof AI_IDS)[number],
    settings: GameSettings,
  ): string {
    const ai = settings.ai[id];
    return `
      <fieldset class="ai-config-card">
        <legend>${AI_NAMES[id]}</legend>
        <label><span>厂商</span>
          <select name="${id}.provider">
            <option value="deepseek" ${ai.provider === "deepseek" ? "selected" : ""}>DeepSeek</option>
            <option value="spark-maas" ${ai.provider === "spark-maas" ? "selected" : ""}>星火 MaaS</option>
            <option value="agnes" ${ai.provider === "agnes" ? "selected" : ""}>Agnes</option>
            <option value="nvidia" ${ai.provider === "nvidia" ? "selected" : ""}>NVIDIA NIM</option>
          </select>
        </label>
        <label><span>模型名</span><input name="${id}.model" value="${escapeAttr(ai.model)}" placeholder="${DEFAULT_MODELS[ai.provider]}" /></label>
        <label><span>API Key</span><input name="${id}.apiKey" type="password" value="${escapeAttr(ai.apiKey)}" placeholder="仅用于本次游戏请求" /></label>
        <label class="checkbox-row"><input name="${id}.rememberKey" type="checkbox" ${ai.rememberKey ? "checked" : ""} /><span>保存到本地</span></label>
      </fieldset>
    `;
  }
}

/** 表单校验 */
function validateSettings(
  settings: GameSettings,
): { ok: true } | { ok: false; message: string } {
  for (const aiId of AI_IDS) {
    const ai = settings.ai[aiId];
    if (!ai.provider)
      return { ok: false, message: `${AI_NAMES[aiId]} 需要选择厂商。` };
    if (!ai.model.trim())
      return { ok: false, message: `${AI_NAMES[aiId]} 需要填写模型名。` };
    if (!ai.apiKey.trim())
      return { ok: false, message: `${AI_NAMES[aiId]} 需要填写 API Key。` };
  }
  if (!settings.proxyUrl.trim())
    return { ok: false, message: "LLM 代理 URL 不能为空。" };
  return { ok: true };
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 玩家 ID → 显示名 */
export function playerDisplayName(playerId: PlayerId): string {
  if (playerId === "human") return "你";
  return AI_NAMES[playerId];
}
