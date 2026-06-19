// Canvas 内 UI：建造预览、Boss 血条、漏怪警报
import type { GameState } from '../game/State';
import type { Vec2 } from '../types';
import { CONFIG } from '../config';
import { TOWERS } from '../data/towers';

// 颜色常量（复用）
const COLOR_RANGE_OK = 'rgba(80,255,80,0.6)';
const COLOR_RANGE_NO = 'rgba(255,80,80,0.6)';

/**
 * 画建造预览：鼠标位置半透明塔投影 + 射程圈
 * - pendingBuildTowerId 非 null 时显示
 * - 可建造且金币足够 → 绿色虚线；否则 → 红色虚线
 * - range 从 TOWERS[pendingBuildTowerId].levels[0].range 取
 */
export function drawBuildPreview(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  mouseWorld: Vec2,
): void {
  const towerId = state.pendingBuildTowerId;
  if (towerId === null) return;
  const def = TOWERS[towerId];
  if (!def) return;

  // 判断可建造：找到鼠标所在格子
  const col = Math.floor(mouseWorld.x / CONFIG.TILE);
  const row = Math.floor(mouseWorld.y / CONFIG.TILE);
  const cell = state.buildCells[col]?.[row];
  const buildable = !!cell && cell.buildable && !cell.occupied;
  const affordable = state.gold >= def.levels[0].upgradeCost;
  const ok = buildable && affordable;

  ctx.save();
  ctx.globalAlpha = 0.6;

  // 射程圈（虚线）
  const range = def.levels[0].range;
  ctx.strokeStyle = ok ? COLOR_RANGE_OK : COLOR_RANGE_NO;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.arc(mouseWorld.x, mouseWorld.y, range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 半透明塔投影
  const half = Math.floor(def.size / 2);
  ctx.fillStyle = ok ? 'rgba(80,255,80,0.5)' : 'rgba(255,80,80,0.5)';
  ctx.fillRect(mouseWorld.x - half, mouseWorld.y - half, def.size, def.size);
  ctx.fillStyle = def.color;
  ctx.fillRect(
    mouseWorld.x - half + 4,
    mouseWorld.y - half + 4,
    def.size - 8,
    def.size - 8,
  );

  ctx.restore();
}

/**
 * 画 Boss 顶部血条
 * - state.bossAlive 时显示
 * - 找 enemies 中 isBoss 的，画 hp/maxHp 进度条 + 名字 + 倒计时
 */
export function drawBossBar(
  ctx: CanvasRenderingContext2D,
  state: GameState,
): void {
  if (!state.bossAlive) return;
  // 找 Boss 敌人
  let boss = null;
  for (const e of state.enemies) {
    if (e.alive && e.isBoss) {
      boss = e;
      break;
    }
  }
  if (!boss) return;

  const W = CONFIG.WORLD_WIDTH;
  const barW = Math.min(400, W * 0.5);
  const barH = 14;
  const x = (W - barW) / 2;
  const y = 12;

  ctx.save();
  // 外框背景
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4 + 18);
  // 血条背景
  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, barW, barH);
  // 血条前景
  const ratio = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
  ctx.fillStyle = '#880000';
  ctx.fillRect(x, y, barW * ratio, barH);
  // 名字
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(boss.name, W / 2, y + barH + 2);
  // 倒计时
  if (state.bossTimer > 0) {
    ctx.fillStyle = '#FFAA00';
    ctx.font = '10px monospace';
    ctx.fillText(`限时 ${Math.ceil(state.bossTimer)}s`, W / 2, y + barH + 16);
  }
  ctx.restore();
}

/**
 * 画漏怪警报红色边框
 * - state.isDanger 时显示
 * - 用 Date.now() % 1000 / 1000 控制透明度脉动
 */
export function drawAlert(
  ctx: CanvasRenderingContext2D,
  state: GameState,
): void {
  if (!state.isDanger) return;
  const pulse = (Date.now() % 1000) / 1000;
  const alpha = 0.3 + 0.4 * Math.sin(pulse * Math.PI * 2);
  ctx.save();
  ctx.strokeStyle = `rgba(255,0,0,${alpha})`;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, CONFIG.WORLD_WIDTH - 8, CONFIG.WORLD_HEIGHT - 8);
  ctx.restore();
}
