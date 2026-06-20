// 地图渲染：草地 + 跑道 + 出怪口 + 放置提示
import type { GameState } from '../game/State';
import type { Path } from '../utils/Path';
import type { Vec2 } from '../types';
import { CONFIG } from '../config';

// 颜色常量
const COLOR_GRASS_LIGHT = '#5a8c4f';
const COLOR_GRASS_DARK = '#3d6b35';
const COLOR_PATH_DARK = '#4e342e';
const COLOR_PATH_MAIN = '#6d4c41';
const COLOR_PATH_LIGHT = '#795548';
const COLOR_PORTAL = '#b71c1c';
const COLOR_PORTAL_GLOW = '#ff5252';
const COLOR_BASE = '#1976d2';
const COLOR_BASE_GLOW = '#64b5f6';
const COLOR_PLACE_OK = 'rgba(124,252,0,0.35)';
const COLOR_PLACE_OK_BORDER = '#7CFC00';
const COLOR_PLACE_NO = 'rgba(255,80,80,0.35)';
const COLOR_PLACE_NO_BORDER = '#FF5050';

// 离屏 canvas 缓存静态地图层（草地 + 路径）
let staticCache: HTMLCanvasElement | null = null;
let cachedPathKey = '';

function getCacheCanvas(): HTMLCanvasElement {
  if (!staticCache) {
    staticCache = document.createElement('canvas');
    staticCache.width = CONFIG.WORLD_WIDTH;
    staticCache.height = CONFIG.WORLD_HEIGHT;
  }
  return staticCache;
}

function pathKey(points: { x: number; y: number }[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('|');
}

/**
 * 同步绘制 32x32 草地纹理单元
 * 棋盘明暗交替以 (col+row) 奇偶决定，每格 32x32 = 一个塔基
 */
function drawGrassTile(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  col: number,
  row: number,
): void {
  // 基础草地（奇偶交替明暗）
  const isLight = (col + row) % 2 === 0;
  ctx.fillStyle = isLight ? COLOR_GRASS_LIGHT : COLOR_GRASS_DARK;
  ctx.fillRect(ox, oy, 32, 32);

  // 像素草地点缀
  ctx.fillStyle = '#6b9c5f';
  ctx.globalAlpha = 0.35;
  ctx.fillRect(ox + 4, oy + 6, 2, 2);
  ctx.fillRect(ox + 8, oy + 22, 2, 2);
  ctx.fillRect(ox + 18, oy + 10, 2, 2);
  ctx.fillRect(ox + 24, oy + 26, 2, 2);

  ctx.fillStyle = '#2d5a25';
  ctx.globalAlpha = 0.25;
  ctx.fillRect(ox + 14, oy + 4, 2, 2);
  ctx.fillRect(ox + 28, oy + 18, 2, 2);

  ctx.globalAlpha = 1;
}

/**
 * 绘制静态地图层到离屏缓存（完全同步，无 Image 加载）
 * 层级：草地纹理（最底层）→ 跑道
 */
function drawStaticMap(path: Path): void {
  const canvas = getCacheCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = CONFIG.WORLD_WIDTH;
  const H = CONFIG.WORLD_HEIGHT;
  const pts = path.points;

  ctx.clearRect(0, 0, W, H);

  // 草地纹理：同步平铺 32x32 单元（棋盘明暗交替）
  const tile = 32;
  let row = 0;
  for (let y = 0; y < H; y += tile) {
    let col = 0;
    for (let x = 0; x < W; x += tile) {
      drawGrassTile(ctx, x, y, col, row);
      col++;
    }
    row++;
  }

  // 跑道：三层结构
  if (pts.length > 1) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 深色描边
    ctx.strokeStyle = COLOR_PATH_DARK;
    ctx.lineWidth = CONFIG.PATH_WIDTH + 6;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // 主路径色
    ctx.strokeStyle = COLOR_PATH_MAIN;
    ctx.lineWidth = CONFIG.PATH_WIDTH;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // 浅色中线
    ctx.strokeStyle = COLOR_PATH_LIGHT;
    ctx.lineWidth = Math.max(2, CONFIG.PATH_WIDTH - 14);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/**
 * 绘制出怪口 Portal（动态）
 */
function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const time = Date.now() / 300;
  ctx.save();
  const pulse = 0.5 + 0.5 * Math.sin(time);
  ctx.strokeStyle = `rgba(255,82,82,${0.4 + pulse * 0.4})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 14 + pulse * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = COLOR_PORTAL;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(time);
  ctx.fillStyle = COLOR_PORTAL_GLOW;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 8, (i * Math.PI) / 2, (i * Math.PI) / 2 + Math.PI / 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 绘制终点基地（动态）
 */
function drawBase(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
  ctx.save();
  ctx.strokeStyle = `rgba(100,181,246,${0.3 + pulse * 0.3})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 16 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = COLOR_BASE;
  ctx.beginPath();
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x + 10, y - 2);
  ctx.lineTo(x, y + 12);
  ctx.lineTo(x - 10, y - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLOR_BASE_GLOW;
  ctx.beginPath();
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x + 4, y - 6);
  ctx.lineTo(x, y);
  ctx.lineTo(x - 4, y - 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * 绘制放置提示：仅显示鼠标悬停的格子
 * - 可放置：绿色半透明填充 + 绿色边框
 * - 不可放置：红色半透明填充 + 红色边框
 */
function drawPlacementHint(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  mouseWorld?: Vec2,
): void {
  const base = CONFIG.TOWER_BASE;
  const mx = mouseWorld?.x ?? -1;
  const my = mouseWorld?.y ?? -1;
  if (mx < 0 || my < 0) return;

  const col = Math.floor(mx / base);
  const row = Math.floor(my / base);
  const cells = state.buildCells;
  if (col < 0 || col >= cells.length) return;
  const column = cells[col];
  if (!column || row < 0 || row >= column.length) return;
  const cell = column[row];
  if (!cell) return;

  const cx = col * base;
  const cy = row * base;
  const ok = cell.buildable && !cell.occupied;

  ctx.save();
  ctx.fillStyle = ok ? COLOR_PLACE_OK : COLOR_PLACE_NO;
  ctx.fillRect(cx, cy, base, base);
  ctx.strokeStyle = ok ? COLOR_PLACE_OK_BORDER : COLOR_PLACE_NO_BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx + 1, cy + 1, base - 2, base - 2);
  ctx.restore();
}

/**
 * 绘制地图
 * 层级（从底到顶）：
 *   1. 静态缓存（草地纹理 + 跑道）
 *   2. 出怪口 Portal
 *   3. 终点基地
 *   4. 放置提示（仅悬停格子）
 */
export function drawMap(ctx: CanvasRenderingContext2D, state: GameState, mouseWorld?: Vec2): void {
  // 路径变化时重建静态缓存
  const key = pathKey(state.path.points);
  if (key !== cachedPathKey) {
    drawStaticMap(state.path);
    cachedPathKey = key;
  }

  // 1. 静态地图（最底层）
  const cache = getCacheCanvas();
  ctx.drawImage(cache, 0, 0);

  const pts = state.path.points;

  // 2. 出怪口 Portal
  if (pts.length > 0) {
    drawPortal(ctx, pts[0].x, pts[0].y);
  }

  // 3. 终点基地
  if (pts.length > 1) {
    const ep = pts[pts.length - 1];
    drawBase(ctx, ep.x, ep.y);
  }

  // 4. 放置提示（仅悬停格子，最顶层）
  if (state.pendingBuildTowerId !== null) {
    drawPlacementHint(ctx, state, mouseWorld);
  }
}
