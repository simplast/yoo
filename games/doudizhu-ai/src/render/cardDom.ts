/**
 * 2D 卡牌 DOM 工具（经典空当接龙风格）
 *
 * 卡牌结构：
 *   <div class="card card-red|card-black card-back" data-card-id="H3">
 *     <div class="card-corner"><span class="rank">3</span><span class="suit">♥</span></div>
 *     <div class="card-center">♥</div>
 *   </div>
 *
 * 颜色规则：♥♦ 红、♠♣ 黑；小王黑、大王红。
 */
import type { CardId } from "../types";

const SUIT_SYMBOL: Record<string, string> = {
  S: "♠",
  H: "♥",
  C: "♣",
  D: "♦",
};

/** CardId → 显示文字（点数；大小王用中文） */
export function displayCard(cardId: CardId): string {
  if (cardId === "BJ") return "小王";
  if (cardId === "RJ") return "大王";
  return cardId.slice(1);
}

function isRedCard(cardId: CardId): boolean {
  if (cardId === "RJ") return true;
  if (cardId === "BJ") return false;
  const suit = cardId[0];
  return suit === "H" || suit === "D";
}

/** 构建一张正面朝上的卡牌 DOM */
function buildFaceUp(cardId: CardId): HTMLElement {
  const el = document.createElement("div");
  el.className = "card card-face " + (isRedCard(cardId) ? "card-red" : "card-black");
  el.dataset.cardId = cardId;

  if (cardId === "BJ" || cardId === "RJ") {
    el.innerHTML =
      '<div class="card-corner"><span class="rank">' +
      (cardId === "RJ" ? "大" : "小") +
      '</span><span class="suit">王</span></div>' +
      '<div class="card-center joker">' +
      (cardId === "RJ" ? "JOKER" : "joker") +
      "</div>";
    return el;
  }

  const suit = cardId[0];
  const rank = cardId.slice(1);
  const symbol = SUIT_SYMBOL[suit] ?? "";

  el.innerHTML =
    '<div class="card-corner"><span class="rank">' +
    rank +
    '</span><span class="suit">' +
    symbol +
    '</span></div>' +
    '<div class="card-center">' +
    symbol +
    "</div>";
  return el;
}

/** 构建一张背面朝上的卡牌 DOM */
function buildFaceDown(): HTMLElement {
  const el = document.createElement("div");
  el.className = "card card-back";
  el.innerHTML = '<div class="card-back-pattern">YOO</div>';
  return el;
}

/**
 * 创建一张卡牌 DOM。
 * faceUp=true 正面（带点数花色），faceUp=false 背面。
 */
export function createCardElement(cardId: CardId, faceUp: boolean): HTMLElement {
  const el = faceUp ? buildFaceUp(cardId) : buildFaceDown();
  el.dataset.cardId = cardId;
  return el;
}

/** 切换卡牌正/背面：重建内部内容，保留 data-card-id */
export function setFaceUp(el: HTMLElement, cardId: CardId, faceUp: boolean): void {
  const fresh = faceUp ? buildFaceUp(cardId) : buildFaceDown();
  el.className = fresh.className;
  el.innerHTML = fresh.innerHTML;
  el.dataset.cardId = cardId;
}

/** 选中/取消选中（仅样式，布局由 Scene 负责） */
export function setSelected(el: HTMLElement, selected: boolean): void {
  el.classList.toggle("selected", selected);
}
