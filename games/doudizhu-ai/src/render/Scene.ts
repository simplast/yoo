/**
 * 2D 场景总控（经典空当接龙风格 · DOM + CSS）
 *
 * 职责：
 * - 在 stage 容器内构建五个区域 DOM（ai-left / ai-right / bottom / center / human）
 * - 用 Map<CardId, HTMLElement> 增量同步卡牌（增/删），避免全量重建
 * - 计算布局坐标，用 transform: translate3d 定位，CSS transition 平滑过渡
 * - 出牌飞入动画（card--enter）、旧牌淡出（card--exit）后再移除
 * - 底牌始终正面显示
 * - 检测炸弹/火箭并触发 CSS 抖动特效
 */
import type { CardId, GameState, PlayerId } from "../types";
import {
  createCardElement,
  setFaceUp,
  setSelected,
} from "./cardDom";
import {
  layoutHumanHand,
  layoutCenterCards,
  layoutAiHand,
  layoutBottomCards,
  getPlayerOrigin,
  CARD_W,
  CARD_H,
  type CardPos,
  type StageSize,
} from "./layout";

export interface RenderSceneOptions {
  stage: HTMLElement;
  onCardToggle: (cardId: CardId) => void;
}

export interface RenderUpdate {
  state: GameState | null;
  selectedCards: CardId[];
  speeches?: Partial<Record<PlayerId, string>>;
}

const REGION_CLS = "card-region";

export class DoudizhuScene {
  private readonly stage: HTMLElement;
  private readonly onCardToggle: (cardId: CardId) => void;
  private readonly humanCards = new Map<CardId, HTMLElement>();
  private readonly centerCards = new Map<CardId, HTMLElement>();
  private readonly bottomCards = new Map<CardId, HTMLElement>();
  private readonly aiCalmCards = new Map<CardId, HTMLElement>();
  private readonly aiAggressiveCards = new Map<CardId, HTMLElement>();

  private readonly regions: Record<string, HTMLElement>;
  private lastBombHistoryLength = 0;
  private prevCenterCardIds = new Set<CardId>();
  private resizeObserver: ResizeObserver | null = null;
  private currentSize: StageSize = { width: 0, height: 0 };

  constructor(options: RenderSceneOptions) {
    this.stage = options.stage;
    this.onCardToggle = options.onCardToggle;

    this.stage.classList.add("game-stage");
    this.regions = this.buildRegions();
    Object.values(this.regions).forEach((r) => this.stage.appendChild(r));

    this.measure();
    this.resizeObserver = new ResizeObserver(() => {
      this.measure();
    });
    this.resizeObserver.observe(this.stage);
  }

  /** 每次状态变更时同步：增删卡牌 + 重算布局 + 选中态 + 特效 */
  update(update: RenderUpdate): void {
    const { state, selectedCards } = update;
    if (!state) {
      this.clearAll();
      return;
    }

    const selected = new Set(selectedCards);
    const size = this.currentSize;

    // 真人手牌（正面，可点击）
    this.syncCardMap(
      this.humanCards,
      state.players.human.hand,
      true,
      "human",
      selected,
    );
    this.applyLayout(
      this.humanCards,
      layoutHumanHand(state.players.human.hand, size, selected),
      selected,
      true,
    );

    // AI 左：ai-calm（背面堆叠）
    this.syncCardMap(
      this.aiCalmCards,
      state.players["ai-calm"].hand,
      false,
      "ai-calm",
      new Set(),
    );
    this.applyLayout(
      this.aiCalmCards,
      layoutAiHand(state.players["ai-calm"].hand, size, "left"),
      new Set(),
      false,
    );

    // AI 右：ai-aggressive（背面堆叠）
    this.syncCardMap(
      this.aiAggressiveCards,
      state.players["ai-aggressive"].hand,
      false,
      "ai-aggressive",
      new Set(),
    );
    this.applyLayout(
      this.aiAggressiveCards,
      layoutAiHand(state.players["ai-aggressive"].hand, size, "right"),
      new Set(),
      false,
    );

    // 中央出牌区（正面，飞入动画）
    // 累积展示所有已出牌（从 history 中提取），z-index 按出牌顺序递增
    const allPlayedCards: CardId[] = [];
    for (const move of state.history) {
      allPlayedCards.push(...move.cards);
    }

    if (allPlayedCards.length > 0) {
      const centerSet = new Set(allPlayedCards);
      this.prevCenterCardIds = centerSet;

      this.syncCardMap(
        this.centerCards,
        allPlayedCards,
        true,
        "center",
        new Set(),
      );
      // 飞入起始位置：最近一次出牌玩家的手牌区
      const lastMove = state.history[state.history.length - 1];
      const playerOrigin = getPlayerOrigin(lastMove.playerId, size);
      this.applyLayout(
        this.centerCards,
        layoutCenterCards(state.history, size),
        new Set(),
        false,
        playerOrigin,
      );
    } else {
      // 无出牌记录，清空中央区（例如新对局）
      for (const el of this.centerCards.values()) el.remove();
      this.centerCards.clear();
      this.prevCenterCardIds.clear();
    }

    // 底牌（始终正面显示）
    this.syncCardMap(
      this.bottomCards,
      state.bottomCards,
      true,
      "bottom",
      new Set(),
    );
    this.applyLayout(
      this.bottomCards,
      layoutBottomCards(state.bottomCards, size),
      new Set(),
      false,
    );

    // 炸弹/火箭抖动特效
    if (state.history.length !== this.lastBombHistoryLength) {
      const latest = state.history[state.history.length - 1];
      if (
        latest?.pattern.type === "bomb" ||
        latest?.pattern.type === "rocket"
      ) {
        this.triggerShake();
      }
      this.lastBombHistoryLength = state.history.length;
    }
  }

  dispose(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.clearAll();
    Object.values(this.regions).forEach((r) => r.remove());
    this.stage.classList.remove("game-stage");
  }

  /* ---------- 区域构建 ---------- */

  private buildRegions(): Record<string, HTMLElement> {
    const mk = (cls: string): HTMLElement => {
      const el = document.createElement("div");
      el.className = REGION_CLS + " " + cls;
      return el;
    };
    return {
      "ai-calm": mk("region-ai-left"),
      "ai-aggressive": mk("region-ai-right"),
      bottom: mk("region-bottom"),
      center: mk("region-center"),
      human: mk("region-human"),
    };
  }

  /* ---------- 卡牌同步 ---------- */

  /**
   * 按目标集合同步卡牌 Map。
   * 新增的卡牌标记 entering 动画（applyLayout 负责播放飞入）。
   */
  private syncCardMap(
    map: Map<CardId, HTMLElement>,
    cards: CardId[],
    faceUp: boolean,
    owner: string,
    _selected: Set<CardId>,
  ): void {
    const wanted = new Set(cards);
    const region = this.regions[owner] ?? this.regions.center;

    // 移除不需要的卡牌
    for (const [cardId, el] of map) {
      if (!wanted.has(cardId)) {
        el.remove();
        map.delete(cardId);
      }
    }

    for (const cardId of cards) {
      const existing = map.get(cardId);
      if (existing) {
        setFaceUp(existing, cardId, faceUp);
        // 中央区：若已存在但刚进入（上一帧不在），补 animation
        if (owner === "center" && !this.prevCenterCardIds.has(cardId)) {
          existing.classList.remove("card--exit");
          existing.dataset.entering = "true";
        }
        continue;
      }
      const el = createCardElement(cardId, faceUp);
      el.dataset.cardId = cardId;
      el.dataset.owner = owner;
      if (owner === "human") {
        el.classList.add("clickable");
        el.addEventListener("click", () => this.onCardToggle(cardId));
      }
      if (owner === "center") {
        // 延迟添加动画 class，等 applyLayout 设置好 CSS 变量后再触发
        el.dataset.entering = "true";
      }
      region.appendChild(el);
      map.set(cardId, el);
    }
  }

  /** 应用布局坐标到卡牌 DOM */
  private applyLayout(
    map: Map<CardId, HTMLElement>,
    positions: Map<CardId, CardPos>,
    selected: Set<CardId>,
    isHuman: boolean,
    startOrigin?: { x: number; y: number },
  ): void {
    for (const [cardId, el] of map) {
      const pos = positions.get(cardId);
      if (!pos) continue;

      const angle = pos.rotate ?? 0;
      const isEntering = el.dataset.entering === "true";

      // 设置 CSS 变量供 card-exit 动画使用
      el.style.setProperty("--tx", `${pos.x}px`);
      el.style.setProperty("--ty", `${pos.y}px`);
      el.style.setProperty("--rotate", `${angle}deg`);

      if (isEntering) {
        delete el.dataset.entering;
        // 入场动画：从出牌玩家的位置飞到中央
        const origin = startOrigin ?? { x: pos.x, y: pos.y - 140 };
        el.style.opacity = "0";
        el.style.transform = `translate3d(${origin.x}px, ${origin.y}px, 0) scale(0.35) rotate(${angle - 22}deg)`;
        el.style.transition = "none";
        // 强制浏览器计算起始帧
        void el.offsetWidth;
        // 第二步：触发过渡到目标状态
        el.style.transition =
          "transform 520ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 230ms ease-out";
        el.style.opacity = "1";
        el.style.transform =
          `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${angle}deg)`;
        // 过渡结束后恢复默认 transition
        const onEnd = (e: TransitionEvent) => {
          if (e.propertyName === "transform") {
            el.removeEventListener("transitionend", onEnd);
            el.style.transition =
              "transform 160ms ease-out, box-shadow 120ms ease-out";
          }
        };
        el.addEventListener("transitionend", onEnd);
      } else {
        // 普通布局：直接设位置，CSS transition 平滑移动
        el.style.transform =
          `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${angle}deg)`;
      }

      el.style.zIndex = String(pos.z);
      if (isHuman) {
        setSelected(el, selected.has(cardId));
      }
    }
  }

  private clearAll(): void {
    for (const map of [
      this.humanCards,
      this.centerCards,
      this.bottomCards,
      this.aiCalmCards,
      this.aiAggressiveCards,
    ]) {
      for (const el of map.values()) el.remove();
      map.clear();
    }
  }

  /* ---------- 特效 ---------- */

  private triggerShake(): void {
    const el = this.regions.center;
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
    window.setTimeout(() => el.classList.remove("shake"), 360);
  }

  /* ---------- 尺寸 ---------- */

  private measure(): void {
    const rect = this.stage.getBoundingClientRect();
    this.currentSize = {
      width: rect.width || window.innerWidth,
      height: rect.height || window.innerHeight,
    };
  }
}

/** 卡牌尺寸常量（供外部/main.ts 引用） */
export { CARD_W, CARD_H };
