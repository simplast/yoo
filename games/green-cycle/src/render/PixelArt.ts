// 程序生成像素精灵 - 全部用 Canvas 矩形 fillRect 绘制，不用图片
import type { Enemy, Tower, Projectile, Effect } from '../types';
import { ARMOR_COLOR } from '../types';

// 颜色常量（复用，避免每帧创建字符串）
const COLOR_WHITE = '#FFFFFF';
const COLOR_BLACK = '#000000';
const COLOR_RED = '#FF0000';
const COLOR_DARK_RED = '#880000';

// 塔类别顶部颜色
const TOWER_CATEGORY_COLOR: Record<string, string> = {
  basic: '#8B4513', // 棕
  support: '#4FA3FF', // 蓝
  aura: '#FFD700', // 金
  growth: '#B266FF', // 紫
  special: '#33CC33', // 绿
};

// 光环类型颜色
const AURA_COLOR: Record<string, string> = {
  slow: '#1E90FF',
  haste: '#FFD700',
  armorBreak: '#7CFC00',
  poison: '#9ACD32',
  freeze: '#00BFFF',
  stun: '#FFFF00',
};

/**
 * 绘制像素风敌人
 * - 以 enemy.x, enemy.y 为中心，size 为边长
 * - 身体主色用 ARMOR_COLOR[armor]，加黑色护甲边框 + 眼睛
 * - 隐形怪半透明，飞行怪加阴影，Boss 加发光环
 * - hitFlash>0 时整体变白
 * - 头顶画血条（背景黑 + 前景红）
 */
export function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy): void {
  const { x, y, size, hp, maxHp, hitFlash, armor, abilities } = enemy;
  const half = Math.floor(size / 2);
  const isBoss = enemy.isBoss === true || abilities.includes('boss');
  const isInvisible = abilities.includes('invisible');
  const isFlying = abilities.includes('flying');
  const bodyColor = ARMOR_COLOR[armor];
  const useFlash = hitFlash > 0;

  ctx.save();

  // 隐形怪半透明
  if (isInvisible) ctx.globalAlpha = 0.45;

  // 飞行怪阴影
  if (isFlying) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - half + 2, y + half - 1, size, 4);
  }

  // Boss 发光环（脉动）
  if (isBoss) {
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
    ctx.strokeStyle = `rgba(255,80,80,${0.4 + pulse * 0.4})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, size + 5 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 护甲色边框（受击时变白）
  ctx.fillStyle = useFlash ? COLOR_WHITE : COLOR_BLACK;
  ctx.fillRect(x - half - 1, y - half - 1, size + 2, size + 2);

  // 身体主色
  ctx.fillStyle = useFlash ? COLOR_WHITE : bodyColor;
  ctx.fillRect(x - half, y - half, size, size);

  // 眼睛（黑色像素，受击时不画）
  if (!useFlash) {
    ctx.fillStyle = COLOR_BLACK;
    const eyeSize = Math.max(1, Math.floor(size / 6));
    const eyeY = y - half + Math.floor(size / 3);
    ctx.fillRect(x - half + Math.floor(size / 3), eyeY, eyeSize, eyeSize);
    ctx.fillRect(
      x + half - Math.floor(size / 3) - eyeSize,
      eyeY,
      eyeSize,
      eyeSize,
    );
  }

  ctx.restore();

  // 头顶血条
  drawHpBar(ctx, x, y - half - 6, size, hp, maxHp, isBoss);

  // 头顶 debuff 状态指示
  drawBuffIndicators(ctx, x, y - half - 10, enemy.buffs);
}

/**
 * 画敌人头顶 debuff 小图标（像素风）
 * - slow: 蓝色向下箭头
 * - armorBreak: 绿色小破甲（向下三角）
 * - stun: 黄色小星号
 * - freeze: 青色小十字（雪花简化）
 */
function drawBuffIndicators(
  ctx: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  buffs: { type: string }[],
): void {
  if (buffs.length === 0) return;
  const uniqueTypes = Array.from(new Set(buffs.map((b) => b.type)));
  const size = 4;
  const gap = 2;
  const totalW = uniqueTypes.length * size + (uniqueTypes.length - 1) * gap;
  let x = cx - totalW / 2;
  for (const type of uniqueTypes) {
    ctx.fillStyle = AURA_COLOR[type] ?? '#FFFFFF';
    switch (type) {
      case 'slow':
      case 'armorBreak': {
        ctx.beginPath();
        ctx.moveTo(x + size / 2, topY + size);
        ctx.lineTo(x, topY);
        ctx.lineTo(x + size, topY);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'stun': {
        // 小星号
        ctx.fillRect(x + size / 2 - 1, topY, 2, size);
        ctx.fillRect(x, topY + size / 2 - 1, size, 2);
        break;
      }
      case 'freeze': {
        // 小十字
        ctx.fillRect(x + size / 2 - 0.5, topY, 1, size);
        ctx.fillRect(x, topY + size / 2 - 0.5, size, 1);
        break;
      }
    }
    x += size + gap;
  }
}

/**
 * 画血条：背景黑 + 前景红，按 hp/maxHp 比例
 */
function drawHpBar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  width: number,
  hp: number,
  maxHp: number,
  isBoss: boolean,
): void {
  if (hp <= 0 || maxHp <= 0) return;
  const w = Math.max(width, 16);
  const h = isBoss ? 4 : 3;
  const x = cx - w / 2;
  // 黑色背景
  ctx.fillStyle = COLOR_BLACK;
  ctx.fillRect(x - 1, topY - 1, w + 2, h + 2);
  // 红色前景
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  ctx.fillStyle = isBoss ? COLOR_DARK_RED : COLOR_RED;
  ctx.fillRect(x, topY, w * ratio, h);
}

/**
 * 绘制像素风塔
 * - 以 tower.x, tower.y 为中心，size 为底座
 * - 底座灰色方块 + 顶部按 category 着色
 * - 成长塔顶部画等级数字
 * - 光环塔底部画半透明范围圈
 * - 等级越高颜色越亮
 */
export function drawTower(
  ctx: CanvasRenderingContext2D,
  tower: Tower,
  allyAura: boolean = false,
): void {
  const { x, y, size, category, level } = tower;
  const half = Math.floor(size / 2);

  ctx.save();

  // 光环塔底部画半透明范围圈
  if (category === 'aura' && tower.auraRadius) {
    const auraColor = tower.auraType
      ? (AURA_COLOR[tower.auraType] ?? '#FFD700')
      : '#FFD700';
    ctx.fillStyle = hexToRgba(auraColor, 0.12);
    ctx.beginPath();
    ctx.arc(x, y, tower.auraRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(auraColor, 0.4);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 底座灰色方块（外亮内暗）
  ctx.fillStyle = '#444444';
  ctx.fillRect(x - half, y - half, size, size);
  ctx.fillStyle = '#2A2A2A';
  ctx.fillRect(x - half + 2, y - half + 2, size - 4, size - 4);

  // 顶部按 category 着色，等级越高越亮
  const catColor = TOWER_CATEGORY_COLOR[category] ?? '#888888';
  const brightAmount = Math.min(0.5, (level - 1) * 0.06);
  const topColor = brighten(catColor, brightAmount);
  const topSize = Math.max(4, size - 8);
  ctx.fillStyle = topColor;
  ctx.fillRect(x - topSize / 2, y - topSize / 2, topSize, topSize);

  // 成长塔顶部画等级数字
  if (tower.isGrowth === true || category === 'growth') {
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), x, y);
  }

  // 友方光环加成可视化：塔顶金色小箭头
  if (allyAura) {
    ctx.fillStyle = '#FFD700';
    const arrowSize = Math.max(3, Math.floor(size / 5));
    ctx.beginPath();
    ctx.moveTo(x, y - half - 2);
    ctx.lineTo(x - arrowSize, y - half - 2 - arrowSize * 1.5);
    ctx.lineTo(x + arrowSize, y - half - 2 - arrowSize * 1.5);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * 绘制投射物：小方块，按 p.color
 */
export function drawProjectile(
  ctx: CanvasRenderingContext2D,
  p: Projectile,
): void {
  const s = Math.max(2, p.size);
  ctx.fillStyle = p.color;
  ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
}

/**
 * 绘制特效
 * - damageText：画文字（带描边）
 * - hit/death：画粒子方块
 * - splash：画扩散圆环
 * - build/upgrade：画上升粒子
 */
export function drawEffect(ctx: CanvasRenderingContext2D, e: Effect): void {
  const lifeRatio = e.duration > 0 ? e.remaining / e.duration : 0;

  switch (e.type) {
    case 'damageText': {
      if (!e.text) break;
      const offsetY = (1 - lifeRatio) * (e.vy ?? -20);
      ctx.save();
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 黑色描边
      ctx.strokeStyle = COLOR_BLACK;
      ctx.lineWidth = 3;
      ctx.strokeText(e.text, e.x, e.y + offsetY);
      // 填充
      ctx.fillStyle = e.color ?? COLOR_WHITE;
      ctx.fillText(e.text, e.x, e.y + offsetY);
      ctx.restore();
      break;
    }
    case 'hit':
    case 'death': {
      if (!e.particles) break;
      for (const p of e.particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
      break;
    }
    case 'splash': {
      const r = (1 - lifeRatio) * 30;
      ctx.save();
      ctx.strokeStyle = hexToRgba(e.color ?? '#FFFFFF', lifeRatio);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'build':
    case 'upgrade':
    case 'combine': {
      if (!e.particles) break;
      for (const p of e.particles) {
        ctx.fillStyle = hexToRgba(p.color, lifeRatio);
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
      break;
    }
    case 'aura': {
      // 光环脉动圆
      ctx.save();
      ctx.strokeStyle = hexToRgba(e.color ?? '#FFD700', lifeRatio * 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 20 + (1 - lifeRatio) * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'lightning': {
      // 闪电折线：在相邻顶点间画锯齿线
      if (!e.points || e.points.length < 2) break;
      ctx.save();
      ctx.strokeStyle = hexToRgba(e.color ?? '#FFFFFF', lifeRatio);
      ctx.lineWidth = 2;
      ctx.shadowColor = e.color ?? '#FFFFFF';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let i = 0; i < e.points.length - 1; i++) {
        const a = e.points[i];
        const b = e.points[i + 1];
        drawLightningSegment(ctx, a.x, a.y, b.x, b.y);
      }
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'shockwave': {
      // 扩散冲击波圆环
      const r = (1 - lifeRatio) * (e.radius ?? 60);
      ctx.save();
      ctx.strokeStyle = hexToRgba(e.color ?? '#FFFFFF', lifeRatio);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.stroke();
      // 内圈
      ctx.strokeStyle = hexToRgba(e.color ?? '#FFFFFF', lifeRatio * 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
}

// ===== 工具函数 =====

/** 在两点间画锯齿闪电线段（添加到当前 path） */
function drawLightningSegment(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const segments = 4;
  const dx = (x2 - x1) / segments;
  const dy = (y2 - y1) / segments;
  // 垂直方向偏移
  const perpX = -dy;
  const perpY = dx;
  const perpLen = Math.hypot(perpX, perpY) || 1;
  ctx.moveTo(x1, y1);
  for (let i = 1; i < segments; i++) {
    const cx = x1 + dx * i;
    const cy = y1 + dy * i;
    const offset = (Math.random() - 0.5) * 12;
    ctx.lineTo(cx + (perpX / perpLen) * offset, cy + (perpY / perpLen) * offset);
  }
  ctx.lineTo(x2, y2);
}

/** 将 #RRGGBB 转为 rgba 字符串 */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 提亮颜色（amount 0~1，向白色靠拢） */
function brighten(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  let r = parseInt(h.substring(0, 2), 16) || 0;
  let g = parseInt(h.substring(2, 4), 16) || 0;
  let b = parseInt(h.substring(4, 6), 16) || 0;
  r = Math.min(255, Math.floor(r + (255 - r) * amount));
  g = Math.min(255, Math.floor(g + (255 - g) * amount));
  b = Math.min(255, Math.floor(b + (255 - b) * amount));
  return `rgb(${r},${g},${b})`;
}
