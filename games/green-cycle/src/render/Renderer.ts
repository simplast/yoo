// 渲染总入口：管理 canvas、视图变换、调用各子渲染器
import type { GameState } from '../game/State';
import type { Vec2 } from '../types';
import { CONFIG } from '../config';
import { drawMap } from './MapRenderer';
import { drawEntities } from './EntityRenderer';
import { drawBuildPreview, drawBossBar, drawAlert, drawSelectBox } from './UIRenderer';

/**
 * 渲染器：管理 Canvas 2D 上下文与视图变换
 * - 构造时获取 ctx，设置 imageSmoothingEnabled=false 保持像素感
 * - resize 根据窗口尺寸计算缩放，letterbox 居中显示世界
 * - render 应用 offset+scale 变换后依次绘制各层
 */
export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offsetX = 0;
  private offsetY = 0;
  private scale = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** 设置视图变换参数（由 Game 同步给 InputManager 做坐标转换） */
  setView(offsetX: number, offsetY: number, scale: number): void {
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.scale = scale;
  }

  /** 获取当前视图变换参数 */
  getView(): { offsetX: number; offsetY: number; scale: number } {
    return { offsetX: this.offsetX, offsetY: this.offsetY, scale: this.scale };
  }

  /**
   * 主渲染：清屏 → drawMap → drawEntities → drawBuildPreview → drawBossBar → drawAlert
   * 先清屏黑色（覆盖 letterbox 区域），再应用 offset+scale 变换绘制世界
   */
  render(state: GameState, mouseWorld: Vec2): void {
    const ctx = this.ctx;
    ctx.save();
    // 清屏黑色（覆盖整个 canvas，含 letterbox 黑边）
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // 应用 offset + scale 变换
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    // 绘制各层
    drawMap(ctx, state);
    drawEntities(ctx, state);
    drawBuildPreview(ctx, state, mouseWorld);
    drawSelectBox(ctx, state);
    drawBossBar(ctx, state);
    drawAlert(ctx, state);
    ctx.restore();
  }

  /**
   * 调整 canvas 尺寸（响应式，保持世界比例，letterbox）
   * - 根据 window 内尺寸计算缩放
   * - 设置 canvas.width/height 为物理像素
   * - 记录 scale/offset 供渲染与坐标转换使用
   */
  resize(): void {
    const worldW = CONFIG.WORLD_WIDTH;
    const worldH = CONFIG.WORLD_HEIGHT;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    // 计算缩放，使世界居中显示
    const scaleX = winW / worldW;
    const scaleY = winH / worldH;
    const scale = Math.min(scaleX, scaleY);
    // 设置物理像素
    this.canvas.width = winW;
    this.canvas.height = winH;
    // letterbox 居中
    const scaledW = worldW * scale;
    const scaledH = worldH * scale;
    this.offsetX = (winW - scaledW) / 2;
    this.offsetY = (winH - scaledH) / 2;
    this.scale = scale;
    // 保持像素感
    this.ctx.imageSmoothingEnabled = false;
  }
}
