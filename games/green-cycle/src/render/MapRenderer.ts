// 地图渲染：草地 + 跑道 + 出怪口 + 可建造区高亮
import type { GameState } from '../game/State';
import { CONFIG } from '../config';

// 颜色常量（复用）
const COLOR_GRASS_DARK = '#1a3a1a';
const COLOR_GRASS_LIGHT = '#2a5a2a';
const COLOR_PATH_DARK = '#3a2a1a';
const COLOR_PATH_LIGHT = '#5a4a2a';
const COLOR_BUILD_OK = 'rgba(80,255,80,0.25)';
const COLOR_BUILD_NO = 'rgba(255,80,80,0.25)';

/**
 * 绘制地图
 * - 草地背景：深绿底 + 浅绿棋盘格
 * - 跑道：粗深棕线 + 浅棕中线
 * - 出怪口：路径起点画黑色漩涡
 * - 可建造区高亮：pendingBuildTowerId 非 null 时显示
 */
export function drawMap(
  ctx: CanvasRenderingContext2D,
  state: GameState,
): void {
  const W = CONFIG.WORLD_WIDTH;
  const H = CONFIG.WORLD_HEIGHT;
  const TILE = CONFIG.TILE;

  // 草地背景
  ctx.fillStyle = COLOR_GRASS_DARK;
  ctx.fillRect(0, 0, W, H);

  // 棋盘格子（浅绿）
  ctx.fillStyle = COLOR_GRASS_LIGHT;
  for (let y = 0; y < H; y += TILE) {
    for (let x = 0; x < W; x += TILE) {
      if (((x / TILE) + (y / TILE)) % 2 === 0) {
        ctx.fillRect(x, y, TILE, TILE);
      }
    }
  }

  // 跑道
  const pts = state.path.points;
  if (pts.length > 0) {
    // 粗深棕线
    ctx.strokeStyle = COLOR_PATH_DARK;
    ctx.lineWidth = CONFIG.PATH_WIDTH;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // 浅棕中线
    ctx.strokeStyle = COLOR_PATH_LIGHT;
    ctx.lineWidth = Math.max(2, CONFIG.PATH_WIDTH - 10);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // 出怪口：路径起点画黑色漩涡（同心圆）
  if (pts.length > 0) {
    const sp = pts[0];
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    for (let r = 8; r >= 2; r -= 3) {
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 可建造区高亮
  if (state.pendingBuildTowerId !== null) {
    const cells = state.buildCells;
    const tileSize = CONFIG.TILE;
    for (let col = 0; col < cells.length; col++) {
      const column = cells[col];
      if (!column) continue;
      for (let row = 0; row < column.length; row++) {
        const cell = column[row];
        if (!cell) continue;
        const cx = col * tileSize;
        const cy = row * tileSize;
        // 可建造且未占用 → 绿色；否则 → 红色
        ctx.fillStyle =
          cell.buildable && !cell.occupied ? COLOR_BUILD_OK : COLOR_BUILD_NO;
        ctx.fillRect(cx, cy, tileSize, tileSize);
      }
    }
  }
}
