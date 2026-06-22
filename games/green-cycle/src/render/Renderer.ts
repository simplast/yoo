// 渲染总入口：管理 canvas、视图变换、调用各子渲染器
import type { GameState } from '../game/State';
import type { Vec2 } from '../types';
import { CONFIG } from '../config';
import { drawMap } from './MapRenderer';
import { drawEntities } from './EntityRenderer';
import { drawBuildPreview, drawBossBar, drawAlert, drawSelectBox } from './UIRenderer';

/** 相机缩放范围（相对 letterbox 自适应缩放的倍率；1=完整显示世界，>1 放大） */
const MIN_ZOOM = 1.0;
const MAX_ZOOM = 3.0;
/** 滚轮灵敏度：deltaY=100（标准一格）时的缩放因子为 1/ZOOM_STEP（缩小）或 ZOOM_STEP（放大） */
const ZOOM_SENSITIVITY = Math.log(1.15) / 100;

/**
 * 渲染器：管理 Canvas 2D 上下文与视图变换（含相机缩放/平移）
 * - 构造时获取 ctx，设置 imageSmoothingEnabled=false 保持像素感
 * - resize 根据窗口尺寸计算 letterbox 自适应缩放，同时重置相机
 * - 相机 (camX, camY, camZoom)：camX/camY 是世界坐标焦点，camZoom 是相对缩放
 * - render 应用 offset+scale 变换后依次绘制各层
 * - 世界边界自动夹紧：放大时拖到地图边缘会停住，不会露出黑边
 */
export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offsetX = 0;
  private offsetY = 0;
  private scale = 1;

  // letterbox 自适应基准缩放（窗口尺寸变化时更新）
  private fitScale = 1;
  // 相机状态：世界坐标焦点 + 缩放倍率
  private camX = CONFIG.WORLD_WIDTH / 2;
  private camY = CONFIG.WORLD_HEIGHT / 2;
  private camZoom = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** 根据 camX/camY/camZoom + 当前 canvas 尺寸/letterbox 重新计算 offsetX/Y/scale（边界夹紧） */
  private recomputeTransform(): void {
    const worldW = CONFIG.WORLD_WIDTH;
    const worldH = CONFIG.WORLD_HEIGHT;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const viewScale = this.fitScale * this.camZoom;

    // 以相机焦点为屏幕中心计算 offset
    let ox = cw / 2 - this.camX * viewScale;
    let oy = ch / 2 - this.camY * viewScale;

    const scaledW = worldW * viewScale;
    const scaledH = worldH * viewScale;

    // 边界夹紧：当地图某一轴比屏幕大时，不能露出黑边（edge 到 edge）；
    // 当比屏幕小时，强制居中
    if (scaledW <= cw) {
      ox = (cw - scaledW) / 2;
    } else {
      ox = Math.min(0, Math.max(cw - scaledW, ox));
    }
    if (scaledH <= ch) {
      oy = (ch - scaledH) / 2;
    } else {
      oy = Math.min(0, Math.max(ch - scaledH, oy));
    }

    this.scale = viewScale;
    this.offsetX = ox;
    this.offsetY = oy;

    // 从夹紧后的 offset 反推 camX/camY，保证后续基于 cam 的计算一致
    this.camX = (cw / 2 - ox) / viewScale;
    this.camY = (ch / 2 - oy) / viewScale;
  }

  /** 设置相机位置（世界坐标，自动边界夹紧） */
  setCamera(x: number, y: number): void {
    this.camX = x;
    this.camY = y;
    this.recomputeTransform();
  }

  /** 获取当前相机世界坐标位置 */
  getCamera(): { x: number; y: number; zoom: number } {
    return { x: this.camX, y: this.camY, zoom: this.camZoom };
  }

  /**
   * 以屏幕坐标为锚点进行缩放（滚轮用）
   * 保证缩放前后该屏幕点对应的世界点不变
   * deltaY 为正（向下滚）→ 缩小；为负（向上滚）→ 放大
   * 支持连续小值（触控板）与每格 ±100（鼠标滚轮）
   */
  zoomAt(screenX: number, screenY: number, deltaY: number): void {
    if (deltaY === 0) return;
    // 当前屏幕点对应的世界点
    const worldX = (screenX - this.offsetX) / this.scale;
    const worldY = (screenY - this.offsetY) / this.scale;

    // 指数映射：deltaY=-100 → factor≈1.15（放大）；deltaY=100 → factor≈1/1.15（缩小）
    const factor = Math.exp(-deltaY * ZOOM_SENSITIVITY);
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.camZoom * factor));
    if (newZoom === this.camZoom) return;
    this.camZoom = newZoom;

    const viewScale = this.fitScale * this.camZoom;

    // 让 worldX/worldY 仍落在 screenX/screenY
    let ox = screenX - worldX * viewScale;
    let oy = screenY - worldY * viewScale;

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const scaledW = CONFIG.WORLD_WIDTH * viewScale;
    const scaledH = CONFIG.WORLD_HEIGHT * viewScale;
    if (scaledW <= cw) {
      ox = (cw - scaledW) / 2;
    } else {
      ox = Math.min(0, Math.max(cw - scaledW, ox));
    }
    if (scaledH <= ch) {
      oy = (ch - scaledH) / 2;
    } else {
      oy = Math.min(0, Math.max(ch - scaledH, oy));
    }

    this.scale = viewScale;
    this.offsetX = ox;
    this.offsetY = oy;
    this.camX = (cw / 2 - ox) / viewScale;
    this.camY = (ch / 2 - oy) / viewScale;
  }

  /** 重置相机到初始视角（世界完整居中显示） */
  resetCamera(): void {
    this.camZoom = MIN_ZOOM;
    this.camX = CONFIG.WORLD_WIDTH / 2;
    this.camY = CONFIG.WORLD_HEIGHT / 2;
    this.recomputeTransform();
  }

  /** 获取当前视图变换参数（用于同步给 InputManager 做坐标转换） */
  getView(): { offsetX: number; offsetY: number; scale: number } {
    return { offsetX: this.offsetX, offsetY: this.offsetY, scale: this.scale };
  }

  /**
   * 主渲染：清屏 → drawMap → drawEntities → drawBuildPreview → drawBossBar → drawAlert
   * 先清屏黑色（覆盖 letterbox 区域），再应用 offset+scale 变换绘制世界
   */
  render(state: GameState, mouseWorld: Vec2): void {
    const ctx = this.ctx;
    const isHighQuality = state.saveData?.settings.quality !== 'low';
    ctx.save();
    // 清屏黑色（覆盖整个 canvas，含 letterbox 黑边）
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // 应用 offset + scale 变换
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    // 绘制各层
    drawMap(ctx, state, mouseWorld);
    drawEntities(ctx, state, isHighQuality);
    drawBuildPreview(ctx, state, mouseWorld);
    drawSelectBox(ctx, state);
    if (isHighQuality) drawBossBar(ctx, state);
    if (isHighQuality) drawAlert(ctx, state);
    ctx.restore();
  }

  /**
   * 调整 canvas 尺寸（响应式，保持世界比例，letterbox）
   * - 根据 window 内尺寸计算自适应基准缩放
   * - 设置 canvas.width/height 为物理像素
   * - 若当前 zoom=1（未手动缩放），保持完整居中；否则维持 camZoom 重新夹紧
   */
  resize(): void {
    const worldW = CONFIG.WORLD_WIDTH;
    const worldH = CONFIG.WORLD_HEIGHT;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    this.fitScale = Math.min(winW / worldW, winH / worldH);
    this.canvas.width = winW;
    this.canvas.height = winH;
    // 重新按相机状态计算变换（第一次时 camZoom=1 等价于 letterbox 居中）
    this.recomputeTransform();
    this.ctx.imageSmoothingEnabled = false;
  }
}
