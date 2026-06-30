/**
 * 2D 布局计算（经典空当接龙列式堆叠风格）
 *
 * 卡牌固定尺寸（CSS px）：
 *   CARD_W = 56, CARD_H = 80
 *
 * 区域布局（以 stage 容器为坐标系，原点左上）：
 *   顶部左：ai-calm 牌堆（竖向堆叠，仅露牌背）
 *   顶部右：ai-aggressive 牌堆
 *   顶部中：底牌区（3 张横排）
 *   中央：出牌区（上一手牌，横排）
 *   底部：真人手牌（横排，选中上浮）
 *
 * 布局函数返回每张牌的 { x, y, z }（z 为层叠顺序）。
 * Scene 用 translate3d(x, y, 0) 应用位置。
 */
import type { CardId, PlayedMove } from "../types";

export const CARD_W = 56;
export const CARD_H = 80;
const AI_STACK_OFFSET = 4; // AI 牌堆竖向偏移
const HAND_GAP = 30; // 真人手牌横排重叠间距（牌多时压缩）
const HAND_GAP_WIDE = 42; // 牌少时间距
const BOTTOM_GAP = 46;

export interface CardPos {
  x: number;
  y: number;
  z: number;
  rotate?: number; // 旋转角度（仅中心区随机堆叠使用）
}

export interface StageSize {
  width: number;
  height: number;
}

function handGap(count: number): number {
  return count > 10 ? HAND_GAP : HAND_GAP_WIDE;
}

/** 真人手牌：底部横排，居中对齐 */
export function layoutHumanHand(
  cards: CardId[],
  stage: StageSize,
  selected: Set<CardId>,
): Map<CardId, CardPos> {
  const out = new Map<CardId, CardPos>();
  const n = cards.length;
  if (n === 0) return out;
  const gap = handGap(n);
  const totalW = CARD_W + gap * (n - 1);
  const startX = Math.max(8, (stage.width - totalW) / 2);
  const y = stage.height - CARD_H - 12;

  cards.forEach((cardId, i) => {
    const isSelected = selected.has(cardId);
    out.set(cardId, {
      x: startX + i * gap,
      y: isSelected ? y - 18 : y,
      z: i,
    });
  });
  return out;
}

/** 中央出牌区：所有已出牌随机堆叠，z-index 按出牌顺序递增 */
export function layoutCenterCards(
  history: PlayedMove[],
  stage: StageSize,
): Map<CardId, CardPos> {
  const out = new Map<CardId, CardPos>();

  // 按卡牌 ID 字符串哈希生成伪随机偏移，保证每张牌位置始终固定
  const cx = stage.width / 2;
  const cy = (stage.height - CARD_H) / 2 - 20;
  let globalZ = 0;

  for (const move of history) {
    for (const cardId of move.cards) {
      if (out.has(cardId)) continue; // 防御：每张牌只会出现一次
      const rng = seedRandom(cardId);
      const dx = (rng() - 0.5) * 60; // 水平偏移 ±30px
      const dy = (rng() - 0.5) * 40; // 垂直偏移 ±20px
      const angle = (rng() - 0.5) * 24; // 旋转 ±12°
      out.set(cardId, {
        x: cx + dx,
        y: cy + dy,
        z: globalZ++,
        rotate: angle,
      });
    }
  }
  return out;
}

/** 基于字符串的简易伪随机数生成器（mulberry32） */
function seedRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  let t = h;
  return () => {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** AI 手牌：竖向堆叠（仅露牌背），给张数感 */
export function layoutAiHand(
  cards: CardId[],
  stage: StageSize,
  side: "left" | "right",
): Map<CardId, CardPos> {
  const out = new Map<CardId, CardPos>();
  const n = cards.length;
  if (n === 0) return out;
  const x = side === "left" ? 16 : stage.width - CARD_W - 16;
  const startY = 64;
  // 最多展示 8 张的堆叠效果，其余堆在最后
  const shown = Math.min(n, 8);

  cards.forEach((cardId, i) => {
    const stackIndex = Math.min(i, shown - 1);
    out.set(cardId, {
      x,
      y: startY + stackIndex * AI_STACK_OFFSET,
      z: i,
    });
  });
  return out;
}

/** 获取玩家手牌区域的大致中心坐标，作为卡牌飞入动画的起始位置 */
export function getPlayerOrigin(
  playerId: string,
  size: StageSize,
): { x: number; y: number } {
  if (playerId === "human") {
    return { x: size.width / 2, y: size.height - CARD_H / 2 - 12 };
  }
  if (playerId === "ai-calm") {
    return { x: 16 + CARD_W / 2, y: 64 + CARD_H / 2 + 14 };
  }
  return { x: size.width - 16 - CARD_W / 2, y: 64 + CARD_H / 2 + 14 };
}

/** 底牌区：顶部中央横排（3 张） */
export function layoutBottomCards(
  cards: CardId[],
  stage: StageSize,
): Map<CardId, CardPos> {
  const out = new Map<CardId, CardPos>();
  const n = cards.length;
  if (n === 0) return out;
  const gap = BOTTOM_GAP;
  const totalW = CARD_W + gap * (n - 1);
  const startX = (stage.width - totalW) / 2;
  const y = 12;

  cards.forEach((cardId, i) => {
    out.set(cardId, {
      x: startX + i * gap,
      y,
      z: i,
    });
  });
  return out;
}
