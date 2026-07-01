/**
 * HUD 主控制器
 *
 * 所有 UI 均为 DOM 元素。包含：右上设置图标按钮、AI 玩家面板（左上/右上）、
 * 操作栏（人类玩家状态 + 出牌/跳过，位于手牌上方）、右下状态日志、配置面板、Toast、结算弹窗。
 */
import type {
  CardId,
  GameSettings,
  GameState,
  PlayerId,
  RoundResult,
} from "../types";
import { cardRank } from "../rules/card";
import { ConfigPanel } from "./ConfigPanel";
import { SettlementModal } from "./SettlementModal";
import { Toast, type ToastKind } from "./Toast";

export interface HudEvents {
  onStart: (settings: GameSettings) => void;
  onPlay: () => void;
  onPass: () => void;
  onNewRound: () => void;
  onShowConfig: () => void;
  onHideConfig: () => void;
}

export interface HudUpdate {
  state: GameState | null;
  selectedCards: CardId[];
  status: string;
  canPlay: boolean;
  canPass: boolean;
  speeches?: Partial<Record<PlayerId, string>>;
}

interface PlayerWidget {
  container: HTMLDivElement;
  name: HTMLSpanElement;
  role: HTMLSpanElement;
  cards: HTMLSpanElement;
  speech: HTMLSpanElement;
}

export class Hud {
  readonly element: HTMLElement;
  readonly configPanel: ConfigPanel;
  readonly toast: Toast;
  readonly settlementModal: SettlementModal;
  private readonly status: HTMLDivElement;
  private readonly meta: HTMLDivElement;
  private readonly speechLog: HTMLDivElement;
  private readonly logEntries: Array<{ pid: string; text: string }> = [];
  private prevActivePlayer: string | null = null;
  private readonly playButton: HTMLButtonElement;
  private readonly passButton: HTMLButtonElement;
  private readonly configButton: HTMLButtonElement;
  private readonly humanWidget: PlayerWidget;
  private readonly aiCalmWidget: PlayerWidget;
  private readonly aiAggressiveWidget: PlayerWidget;

  constructor(root: HTMLElement, settings: GameSettings, events: HudEvents) {
    this.element = root;
    this.element.classList.add("hud-root");

    this.configPanel = new ConfigPanel(settings, {
      onStart: events.onStart,
      onClose: events.onHideConfig,
    });
    this.toast = new Toast();
    this.settlementModal = new SettlementModal({
      onNewRound: events.onNewRound,
      onConfig: events.onShowConfig,
    });

    this.status = document.createElement("div");
    this.status.className = "status-log";
    this.meta = document.createElement("div");
    this.meta.className = "meta-log";

    this.playButton = document.createElement("button");
    this.playButton.className = "primary-action hud-action";
    this.playButton.type = "button";
    this.playButton.textContent = "出牌";
    this.playButton.addEventListener("click", events.onPlay);

    this.passButton = document.createElement("button");
    this.passButton.className = "secondary-action hud-action";
    this.passButton.type = "button";
    this.passButton.textContent = "跳过";
    this.passButton.addEventListener("click", events.onPass);

    this.configButton = document.createElement("button");
    this.configButton.className = "icon-button config-toggle";
    this.configButton.type = "button";
    this.configButton.title = "设置";
    this.configButton.setAttribute("aria-label", "设置");
    this.configButton.textContent = "⚙";
    this.configButton.addEventListener("click", events.onShowConfig);

    // 人类玩家（操作栏内）
    this.humanWidget = createPlayerWidget("player-info");
    // AI 玩家（左上 / 右上）
    this.aiCalmWidget = createPlayerWidget("ai-player ai-player-left");
    this.aiAggressiveWidget = createPlayerWidget("ai-player ai-player-right");

    // 右上设置图标
    this.element.appendChild(this.configButton);

    // 玩家信息栏（居中，按钮上方）
    const playerBar = document.createElement("div");
    playerBar.className = "hud-player-bar";
    playerBar.append(this.humanWidget.container);

    // 出牌/跳过按钮（居中，手牌上方）
    const actionBar = document.createElement("div");
    actionBar.className = "hud-actionbar";
    actionBar.append(this.playButton, this.passButton);

    // 左下角对话日志
    this.speechLog = document.createElement("div");
    this.speechLog.className = "speech-log";

    // 右下状态日志
    const statusLog = document.createElement("div");
    statusLog.className = "status-log-wrap";
    statusLog.append(this.status, this.meta);

    this.element.append(
      playerBar,
      actionBar,
      this.aiCalmWidget.container,
      this.aiAggressiveWidget.container,
      statusLog,
      this.speechLog,
      this.configPanel.element,
      this.toast.element,
      this.settlementModal.element,
    );
  }

  /** 每帧更新 HUD 状态 */
  update(update: HudUpdate): void {
    const { state, status, canPlay, canPass, speeches } = update;
    this.status.textContent = status;
    this.playButton.disabled = !canPlay;
    this.passButton.disabled = !canPass;

    if (!state) {
      this.meta.textContent = "等待开局";
      this.humanWidget.container.style.display = "none";
      this.aiCalmWidget.container.style.display = "none";
      this.aiAggressiveWidget.container.style.display = "none";
      this.logEntries.length = 0;
      this.prevActivePlayer = null;
      this.speechLog.style.display = "none";
      return;
    }

    // 人类玩家
    this.humanWidget.container.style.display = "flex";
    updatePlayerWidget(this.humanWidget, state, "human", speeches?.human);

    // AI 玩家
    this.aiCalmWidget.container.style.display = "flex";
    this.aiAggressiveWidget.container.style.display = "flex";
    updatePlayerWidget(
      this.aiCalmWidget,
      state,
      "ai-calm",
      speeches?.["ai-calm"],
    );
    updatePlayerWidget(
      this.aiAggressiveWidget,
      state,
      "ai-aggressive",
      speeches?.["ai-aggressive"],
    );

    const landlord = state.players[state.landlordId].name;
    const previous = state.previousMove
      ? `${state.players[state.previousMove.playerId].name} · ${state.previousMove.cards.map((c) => cardRank(c)).join(" ")}`
      : "无";
    this.meta.textContent = `地主：${landlord} · 倍数 ×${state.multiplier} · 上一手：${previous}`;

    // 左下角对话日志 — 玩家操作完毕后追加
    const currentPlayer = state.currentPlayerId;
    if (this.prevActivePlayer && this.prevActivePlayer !== currentPlayer) {
      const pid = this.prevActivePlayer;
      const text =
        pid === "human" ? "我是最棒的" : (speeches?.[pid as PlayerId] ?? "");
      if (text) {
        this.logEntries.push({ pid, text });
        while (this.logEntries.length > 6) this.logEntries.shift();
      }
    }
    this.prevActivePlayer = currentPlayer;

    // 渲染日志
    this.speechLog.innerHTML = "";
    const playerNames: Record<string, string> = {
      human: "你",
      "ai-calm": state.players["ai-calm"].name,
      "ai-aggressive": state.players["ai-aggressive"].name,
    };
    for (const entry of this.logEntries) {
      const el = document.createElement("div");
      el.className = `sl-entry sl-${entry.pid}`;
      el.textContent = `${playerNames[entry.pid]}: ${entry.text}`;
      this.speechLog.appendChild(el);
    }
    this.speechLog.style.display = this.logEntries.length > 0 ? "flex" : "none";
  }

  showConfig(settings?: GameSettings): void {
    if (settings) this.configPanel.update(settings);
    this.configPanel.setVisible(true);
  }
  hideConfig(): void {
    this.configPanel.setVisible(false);
  }
  showSettlement(result: RoundResult): void {
    this.settlementModal.show(result);
  }
  hideSettlement(): void {
    this.settlementModal.hide();
  }
  showToast(message: string, kind: ToastKind = "info"): void {
    this.toast.show(message, kind);
  }
}

function createPlayerWidget(className: string): PlayerWidget {
  const container = document.createElement("div");
  container.className = className;

  const name = document.createElement("span");
  name.className = "player-name";
  const role = document.createElement("span");
  role.className = "player-role";
  const cards = document.createElement("span");
  cards.className = "player-cards";
  const speech = document.createElement("span");
  speech.className = "player-speech";

  container.append(name, role, cards, speech);
  return { container, name, role, cards, speech };
}

function updatePlayerWidget(
  w: PlayerWidget,
  state: GameState,
  playerId: PlayerId,
  speech?: string,
): void {
  const player = state.players[playerId];
  const active = state.currentPlayerId === playerId;

  w.name.textContent = player.name;
  w.name.classList.toggle("player-name-active", active);
  // avatar + player color
  w.container.setAttribute(
    "data-avatar",
    playerId === "human" ? "♟" : player.name.charAt(0),
  );
  w.container.setAttribute("data-color", playerId);
  w.role.textContent = player.role === "landlord" ? "地主" : "农民";
  w.container.classList.toggle(
    "player-role-landlord",
    player.role === "landlord",
  );
  w.container.classList.toggle("player-role-farmer", player.role === "farmer");
  w.cards.textContent = `${player.hand.length} 张`;
  w.cards.classList.toggle("player-cards-low", player.hand.length < 10);
  w.container.classList.toggle("player-active", active);
}
