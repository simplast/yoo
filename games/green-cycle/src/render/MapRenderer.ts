// 地图渲染：草地 + 跑道 + 出怪口 + 可建造区高亮
import type { GameState } from '../game/State';
import type { Path } from '../utils/Path';
import { CONFIG } from '../config';

// 颜色常量（复用）
const COLOR_GRASS_DARK = '#1a3a1a';
const COLOR_GRASS_LIGHT = '#2a5a2a';
const COLOR_PATH_DARK = '#3a2a1a';
const COLOR_PATH_LIGHT = '#5a4a2a';
const COLOR_BUILD_OK = 'rgba(80,255,80,0.25)';
const COLOR_BUILD_NO = 'rgba(255,80,80,0.25)';

// 离屏 canvas 缓存静态地图层
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
 * 绘制静态地图层到离屏缓存
 * - 草地背景：深绿底 + 浅绿棋盘格
 * - 跑道：粗深棕线 + 浅棕中线
 * - 出怪口：路径起点画黑色漩涡
 */
function drawStaticMap(path: Path): void {
  const canvas = getCacheCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = CONFIG.WORLD_WIDTH;
  const H = CONFIG.WORLD_HEIGHT;
  const TILE = CONFIG.TILE;
  const pts = path.points;

  ctx.clearRect(0, 0, W, H);

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
}

/**
 * 绘制地图
 * - 优先使用离屏缓存绘制静态层
 * - 动态内容（可建造区高亮）在主 canvas 实时绘制
 */
export function drawMap(
  ctx: CanvasRenderingContext2D,
  state: GameState,
): void {
  const key = pathKey(state.path.points);
  if (key !== cachedPathKey) {
    drawStaticMap(state.path);
    cachedPathKey = key;
  }

  // 绘制静态缓存
  const cache = getCacheCanvas();
  ctx.drawImage(cache, 0, 0);

  // 可建造区高亮（动态）
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
