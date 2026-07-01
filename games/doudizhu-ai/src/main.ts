/**
 * 游戏入口 — 组装所有模块并驱动主循环
 *
 * 架构：
 *   AppModel（单一状态树）→ render() → scene.update() + hud.update()
 *
 * 职责：
 * - 加载设置、初始化 2D 场景和 HUD
 * - 处理真人交互（选牌、出牌、跳过）
 * - 调度 AI 回合（Mock 或 LLM）
 * - 管理回合开始/结算/暂停状态
 * - 协调 2D 场景和 DOM HUD 的同步渲染
 *
 * 注意：这里没有独立的 Game 类。AppModel + 闭包函数
 * 替代了传统 Game 类的编排角色，保持简洁。
 */
import "./styles.css";
import type {
  CardId,
  GameSettings,
  GameState,
  MoveProposal,
  PlayerId,
  ValidationResult,
} from "./types";
import { decideAiMove } from "./ai/decisionLoop";
import type { AiPlayerId } from "./ai/personas";
import { createSessionLogger, type LlmCallEntry } from "./ai/sessionLog";
import type { AiDecisionResult } from "./ai/decisionLoop";
import { handRanks } from "./rules/card";
import { createNewRound } from "./game/state";
import {
  applyValidatedMove,
  forcePlayerLoss,
  playMockAiTurn,
  submitMove,
} from "./game/turnFlow";
import { generateLegalActions } from "./rules/legalMoveGenerator";
import { validateMove } from "./rules/moveValidator";
import { DoudizhuScene } from "./render/Scene";
import { settingsStore } from "./storage/settingsStore";
import { Hud } from "./ui/Hud";
import { playerDisplayName } from "./ui/ConfigPanel";

/** 通过 URL 参数 `?mockAi=1` 启用本地 Mock AI 模式（无需 LLM key） */
const USE_MOCK_AI =
  new URLSearchParams(window.location.search).get("mockAi") === "1";

/** 局级 LLM 会话日志（浏览器控制台：__doudizhuLogs.pretty()） */
const sessionLog = createSessionLogger();
let llmCallIndex = 0;

/** 游戏的核心状态对象 — 替代传统 Game 类 */
interface AppModel {
  state: GameState | null;
  settings: GameSettings;
  selectedCards: CardId[];
  speeches: Partial<Record<PlayerId, string>>;
  status: string;
}

const stage = document.querySelector<HTMLElement>("#game-stage");
const hudRoot = document.querySelector<HTMLElement>("#hud-root");

if (!stage || !hudRoot) {
  throw new Error("Doudizhu AI bootstrap requires #game-stage and #hud-root.");
}

const model: AppModel = {
  state: null,
  settings: settingsStore.load(),
  selectedCards: [],
  speeches: {},
  status: USE_MOCK_AI
    ? "开发模式：Mock AI。配置后开始一局。"
    : "配置两个 LLM 玩家后开始一局。",
};

let aiTimer = 0;
let aiTurnToken = 0;

const scene = new DoudizhuScene({
  stage,
  onCardToggle: (cardId) => {
    if (
      !model.state ||
      model.state.currentPlayerId !== "human" ||
      model.state.phase !== "awaiting-human"
    ) {
      hud.showToast("还没轮到你。", "warning");
      return;
    }
    toggleSelected(cardId);
    render();
  },
});

const hud = new Hud(hudRoot, model.settings, {
  onStart: (settings) => {
    model.settings = settings;
    settingsStore.save(settings);
    startRound();
  },
  onPlay: () => playHumanSelection(),
  onPass: () => passHuman(),
  onNewRound: () => startRound(),
  onShowConfig: () => {
    cancelPendingAi();
    hud.hideSettlement();
    hud.showConfig(model.settings);
    if (model.state && model.state.phase !== "settlement") {
      model.state = { ...model.state, phase: "paused-for-config" };
    }
    model.status = "已暂停，可调整 AI 厂商、模型、API Key 或代理 URL。";
    render();
  },
  onHideConfig: () => {
    hud.hideConfig();
  },
});

hud.showConfig(model.settings);
render();

/**
 * 开始新牌局：清空选中/语音，创建新 GameState，启动首回合。
 * 如果首回合轮到 AI（地主是 AI），自动触发 AI 决策。
 */
function startRound(): void {
  cancelPendingAi();
  hud.hideConfig();
  hud.hideSettlement();
  model.selectedCards = [];
  model.speeches = {};
  sessionLog.clear();
  llmCallIndex = 0;
  model.state = createNewRound({ previousScores: currentScores() });
  model.status = `${playerDisplayName(model.state.landlordId)} 成为地主并先出。`;
  hud.showToast(
    USE_MOCK_AI
      ? "新牌局已发牌（Mock AI）。"
      : "新牌局已发牌，AI 将通过 LLM 决策。",
    "success",
  );
  render();
  maybeRunAiTurn();
}

function currentScores(): Partial<Record<PlayerId, number>> {
  if (!model.state) return {};
  return Object.fromEntries(
    model.state.order.map((id) => [id, model.state?.players[id].score ?? 0]),
  ) as Partial<Record<PlayerId, number>>;
}

/** 取消待执行的 AI 计时器并令运行中的决策失效 */
function cancelPendingAi(): void {
  window.clearTimeout(aiTimer);
  aiTurnToken += 1;
}

function toggleSelected(cardId: CardId): void {
  if (model.selectedCards.includes(cardId)) {
    model.selectedCards = model.selectedCards.filter((id) => id !== cardId);
  } else {
    model.selectedCards = [...model.selectedCards, cardId];
  }
}

function playHumanSelection(): void {
  const state = model.state;
  if (!state) return;
  if (state.currentPlayerId !== "human") {
    hud.showToast("还没轮到你。", "warning");
    return;
  }

  const result = submitMove(state, {
    playerId: "human",
    action: "play",
    cards: model.selectedCards,
  });
  if (!result.validation.ok) {
    hud.showToast(result.validation.message ?? "这手牌不合法。", "error");
    return;
  }

  model.speeches.human = "这手交给你们验算。";
  model.selectedCards = [];
  updateStateAfterMove(result.state, result.validation, "human");
}

function passHuman(): void {
  const state = model.state;
  if (!state) return;
  if (state.currentPlayerId !== "human") {
    hud.showToast("还没轮到你。", "warning");
    return;
  }

  const result = submitMove(state, {
    playerId: "human",
    action: "pass",
    cards: [],
  });
  if (!result.validation.ok) {
    hud.showToast(result.validation.message ?? "现在不能跳过。", "error");
    return;
  }

  model.speeches.human = "先过一手。";
  model.selectedCards = [];
  updateStateAfterMove(result.state, result.validation, "human");
}

/** 检测是否需要 AI 出牌，如果是则延迟触发（让 UI 先更新） */
function maybeRunAiTurn(): void {
  const state = model.state;
  if (
    !state ||
    state.phase === "settlement" ||
    state.currentPlayerId === "human"
  )
    return;
  if (
    state.currentPlayerId !== "ai-calm" &&
    state.currentPlayerId !== "ai-aggressive"
  )
    return;

  const playerId = state.currentPlayerId;
  const token = ++aiTurnToken;
  model.state = { ...state, phase: "requesting-llm" };
  model.status = `${playerDisplayName(playerId)} 思考中${USE_MOCK_AI ? "（Mock AI）" : "（LLM）"}…`;
  render();

  aiTimer = window.setTimeout(
    () => {
      void runAiTurn(playerId, token);
    },
    USE_MOCK_AI ? 650 : 120,
  );
}

/**
 * 执行 AI 回合（Mock 或 LLM）
 *
 * 使用 aiTurnToken 机制防止竞态：如果回合开始后又触发了新的 AI 回合，
 * 旧的异步结果会被丢弃。
 */
async function runAiTurn(playerId: AiPlayerId, token: number): Promise<void> {
  const state = model.state;
  if (
    !state ||
    token !== aiTurnToken ||
    state.currentPlayerId !== playerId ||
    state.phase === "settlement"
  )
    return;

  if (USE_MOCK_AI) {
    const result = playMockAiTurn({ ...state, phase: "awaiting-ai" });
    if (!result.validation.ok) {
      applyForcedLoss(
        playerId,
        result.validation.message ?? "Mock AI 决策非法。",
      );
      return;
    }
    model.speeches[playerId] = mockSpeech(
      playerId,
      result.validation.normalizedMove?.action ?? "play",
    );
    updateStateAfterMove(result.state, result.validation, playerId);
    return;
  }

  const decision = await decideAiMove({
    state: { ...state, phase: "awaiting-ai" },
    playerId,
    validateMove: validateMoveForAi,
    generateLegalActions: (nextState) => generateLegalActions(nextState, 18),
    gameSettings: model.settings,
    proxyUrl: model.settings.proxyUrl,
  });

  if (token !== aiTurnToken) return;

  // 记录本次 LLM 调用到会话日志
  logLlmCall(playerId, decision);

  if (decision.ok) {
    const validation: ValidationResult = {
      ok: true,
      normalizedMove: decision.move,
    };
    model.speeches[playerId] = decision.speech;
    updateStateAfterMove(
      applyValidatedMove({ ...state, phase: "awaiting-ai" }, validation),
      validation,
      playerId,
    );
    return;
  }

  if (decision.kind === "forced-loss") {
    applyForcedLoss(playerId, decision.reason);
    return;
  }

  model.state = { ...state, phase: "paused-for-config" };
  model.status = `${playerDisplayName(playerId)} 的 LLM 调用失败：${decision.message}`;
  hud.showToast(decision.message, "error");
  hud.showConfig(model.settings);
  render();
}

function validateMoveForAi(
  state: GameState,
  proposal: MoveProposal,
): ValidationResult {
  return validateMove({ ...state, phase: "awaiting-ai" }, proposal);
}

function updateStateAfterMove(
  nextState: GameState,
  validation: ValidationResult,
  actorId: PlayerId,
): void {
  const previousMultiplier = model.state?.multiplier ?? nextState.multiplier;
  model.state = nextState;

  if (validation.normalizedMove?.action === "pass") {
    model.status = `${playerDisplayName(actorId)} 跳过。`;
  } else if (validation.normalizedMove?.cards.length) {
    model.status = `${playerDisplayName(actorId)} 出牌：${validation.normalizedMove.cards.join(" ")}`;
  }

  if (nextState.multiplier > previousMultiplier) {
    hud.showToast(
      `炸弹/火箭触发，倍数变为 ×${nextState.multiplier}。`,
      "warning",
    );
  }

  render();
  maybeShowSettlement();
  maybeRunAiTurn();
}

function applyForcedLoss(playerId: PlayerId, reason: string): void {
  const state = model.state;
  if (!state) return;
  model.state = forcePlayerLoss(state, playerId);
  model.status = reason;
  hud.showToast(reason, "error");
  render();
  maybeShowSettlement();
}

function maybeShowSettlement(): void {
  const state = model.state;
  if (state?.phase === "settlement" && state.roundResult) {
    hud.showSettlement(state.roundResult);
  }
}

/** Mock AI 的固定台词（按人设区分） */
function mockSpeech(playerId: PlayerId, action: "play" | "pass"): string {
  if (playerId === "ai-calm")
    return action === "play" ? "按概率，这手收益最高。" : "不急，保留结构。";
  return action === "play" ? "节奏归我了。" : "这手让你喘口气。";
}

/** 将 AI 决策结果记录到会话日志 */
function logLlmCall(playerId: AiPlayerId, decision: AiDecisionResult): void {
  const state = model.state;
  if (!state) return;
  llmCallIndex += 1;
  const player = state.players[playerId];
  const lastAttempt = decision.attempts[decision.attempts.length - 1];
  const usedTool = decision.ok
    ? decision.attempts.some((a) => a.validation && !a.error)
    : false;

  const entry: LlmCallEntry = {
    callIndex: llmCallIndex,
    timestamp: new Date().toISOString(),
    playerId,
    role: player.role === "landlord" ? "地主" : "农民",
    hand: handRanks(player.hand),
    handCount: player.hand.length,
    systemPrompt: lastAttempt?.systemPrompt ?? "",
    userPrompt: lastAttempt?.userPrompt ?? "",
    rawText: lastAttempt?.rawText,
    usedToolResult: usedTool,
    attempts: decision.attempts.length,
    attemptDetails: decision.attempts,
    decision,
  };
  sessionLog.logTurn(entry);
}

/**
 * 同步 state + scene + hud
 *
 * 这是整个游戏的渲染入口。每次状态变更后调用一次。
 * 2D 场景和 DOM HUD 通过同一份 AppModel 保持同步。
 */
function render(): void {
  const state = model.state;
  const canAct =
    state?.currentPlayerId === "human" && state.phase === "awaiting-human";
  const canPass = Boolean(
    canAct && state?.previousMove && state.trickLeaderId !== "human",
  );
  hud.update({
    state,
    selectedCards: model.selectedCards,
    status: model.status,
    canPlay: Boolean(canAct && model.selectedCards.length > 0),
    canPass,
    speeches: model.speeches,
  });
  scene.update({
    state,
    selectedCards: model.selectedCards,
    speeches: model.speeches,
  });
}
