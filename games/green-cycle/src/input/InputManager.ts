// 输入管理器：封装鼠标/触摸/键盘事件，处理 Canvas 坐标变换

import type { Vec2 } from '../types';

/** 输入状态 */
export interface InputState {
  /** 鼠标在世界坐标的位置 */
  mouseWorld: Vec2;
  /** 鼠标在屏幕坐标的位置 */
  mouseScreen: Vec2;
  mouseDown: boolean;
  mouseRightDown: boolean;
  shiftDown: boolean;
  ctrlDown: boolean;
  /** 本帧左键按下（消费后清除） */
  justClicked: boolean;
  /** 本帧右键按下（消费后清除） */
  justRightClicked: boolean;
  wheelDelta: number;
  /** 框选：拖拽起点（世界坐标），非拖拽时为 null */
  dragStartWorld: Vec2 | null;
  /** 框选：是否处于拖拽状态（移动超过阈值） */
  isDragging: boolean;
  /** 本帧刚完成框选（消费后清除） */
  justFinishedSelectBox: boolean;
}

/**
 * 输入管理器
 * 监听 canvas 的 pointer 事件和 window 的键盘事件
 * 负责屏幕坐标到世界坐标的转换
 */
export class InputManager {
  private canvas: HTMLCanvasElement;
  private offsetX = 0;
  private offsetY = 0;
  private scale = 1;

  // 视图变换前的屏幕坐标（CSS 像素）
  private rawX = 0;
  private rawY = 0;

  // 本帧内发生的 pointerdown 标记（update 时转为 justClicked）
  private pointerDownThisFrame = false;
  private pointerRightDownThisFrame = false;
  // 本帧完成的框选标记（update 时转为 justFinishedSelectBox）
  private selectBoxFinishedThisFrame = false;

  // 拖拽起点（世界坐标）
  private dragStartWorld: Vec2 | null = null;

  // 拖拽判定阈值（世界坐标像素）
  private static readonly DRAG_THRESHOLD = 8;

  // 按键集合
  private keysDown: Set<string> = new Set();
  // 本帧新按下的键（用于触发 onKeyPress）
  private keysPressedThisFrame: Set<string> = new Set();

  /** 键盘按键回调（每帧每个新按下的键触发一次） */
  public onKeyPress: ((key: string) => void) | null = null;

  /** 输入状态（只读引用） */
  public readonly state: InputState;

  // 保存监听器引用以便 dispose
  private readonly boundPointerDown: (e: PointerEvent) => void;
  private readonly boundPointerMove: (e: PointerEvent) => void;
  private readonly boundPointerUp: (e: PointerEvent) => void;
  private readonly boundContextMenu: (e: Event) => void;
  private readonly boundWheel: (e: WheelEvent) => void;
  private readonly boundKeyDown: (e: KeyboardEvent) => void;
  private readonly boundKeyUp: (e: KeyboardEvent) => void;
  private readonly boundBlur: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.state = {
      mouseWorld: { x: 0, y: 0 },
      mouseScreen: { x: 0, y: 0 },
      mouseDown: false,
      mouseRightDown: false,
      shiftDown: false,
      ctrlDown: false,
      justClicked: false,
      justRightClicked: false,
      wheelDelta: 0,
      dragStartWorld: null,
      isDragging: false,
      justFinishedSelectBox: false,
    };

    // 绑定监听器
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundContextMenu = this.handleContextMenu.bind(this);
    this.boundWheel = this.handleWheel.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundBlur = this.handleBlur.bind(this);

    // 注册监听
    canvas.addEventListener('pointerdown', this.boundPointerDown);
    canvas.addEventListener('pointermove', this.boundPointerMove);
    canvas.addEventListener('pointerup', this.boundPointerUp);
    canvas.addEventListener('contextmenu', this.boundContextMenu);
    canvas.addEventListener('wheel', this.boundWheel, { passive: false });
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('blur', this.boundBlur);
  }

  /**
   * 设置视图变换
   * 世界坐标 = (屏幕坐标 - offset) / scale
   */
  setView(offsetX: number, offsetY: number, scale: number): void {
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.scale = scale === 0 ? 1 : scale;
    // 立即刷新一次世界坐标
    this.updateMouseWorld();
  }

  /**
   * 每帧调用：刷新 justClicked / justRightClicked / wheelDelta / onKeyPress
   */
  update(): void {
    // 将本帧的 pointerdown 转为 justClicked
    this.state.justClicked = this.pointerDownThisFrame;
    this.state.justRightClicked = this.pointerRightDownThisFrame;
    this.state.justFinishedSelectBox = this.selectBoxFinishedThisFrame;
    this.pointerDownThisFrame = false;
    this.pointerRightDownThisFrame = false;
    this.selectBoxFinishedThisFrame = false;

    // 触发按键回调
    if (this.onKeyPress && this.keysPressedThisFrame.size > 0) {
      this.keysPressedThisFrame.forEach((key) => {
        try {
          this.onKeyPress?.(key);
        } catch {
          // 忽略回调异常
        }
      });
    }
    this.keysPressedThisFrame.clear();

    // 刷新世界坐标
    this.updateMouseWorld();
  }

  /**
   * 消费左键点击：返回是否有点击并清除标记
   */
  consumeClick(): boolean {
    if (this.state.justClicked) {
      this.state.justClicked = false;
      return true;
    }
    return false;
  }

  /**
   * 消费右键点击：返回是否有点击并清除标记
   */
  consumeRightClick(): boolean {
    if (this.state.justRightClicked) {
      this.state.justRightClicked = false;
      return true;
    }
    return false;
  }

  /**
   * 消费框选结束事件：返回框选起点/终点（世界坐标）并清除标记
   */
  consumeSelectBox(): { start: Vec2; end: Vec2 } | null {
    if (this.state.justFinishedSelectBox && this.dragStartWorld) {
      const start = { ...this.dragStartWorld };
      const end = { ...this.state.mouseWorld };
      this.state.justFinishedSelectBox = false;
      this.state.dragStartWorld = null;
      this.dragStartWorld = null;
      return { start, end };
    }
    this.state.justFinishedSelectBox = false;
    return null;
  }

  /**
   * 消费滚轮 delta：返回累计 delta 并清零
   */
  consumeWheel(): number {
    const d = this.state.wheelDelta;
    this.state.wheelDelta = 0;
    return d;
  }

  /**
   * 移除所有监听器
   */
  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    this.canvas.removeEventListener('pointermove', this.boundPointerMove);
    this.canvas.removeEventListener('pointerup', this.boundPointerUp);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
    this.canvas.removeEventListener('wheel', this.boundWheel);
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('blur', this.boundBlur);
    this.keysDown.clear();
    this.keysPressedThisFrame.clear();
    this.onKeyPress = null;
  }

  // ===== 内部方法 =====

  /**
   * 将客户端坐标转换为 canvas 内屏幕坐标（CSS 像素 → canvas 逻辑像素）
   */
  private clientToCanvas(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    // CSS 像素到 canvas 逻辑像素的缩放比
    const scaleX = this.canvas.width / (rect.width || 1);
    const scaleY = this.canvas.height / (rect.height || 1);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  /**
   * 根据当前 rawX/rawY 更新 mouseScreen 和 mouseWorld
   */
  private updateMouseWorld(): void {
    const screen = this.clientToCanvas(this.rawX, this.rawY);
    this.state.mouseScreen = screen;
    // 世界坐标 = (屏幕坐标 - offset) / scale
    this.state.mouseWorld = {
      x: (screen.x - this.offsetX) / this.scale,
      y: (screen.y - this.offsetY) / this.scale,
    };
  }

  private handlePointerDown(e: PointerEvent): void {
    // 只处理左键和右键
    if (e.button === 0) {
      this.state.mouseDown = true;
      this.pointerDownThisFrame = true;
      this.state.isDragging = false;
      this.rawX = e.clientX;
      this.rawY = e.clientY;
      this.updateMouseWorld();
      this.dragStartWorld = { ...this.state.mouseWorld };
      this.state.dragStartWorld = this.dragStartWorld;
    } else if (e.button === 2) {
      this.state.mouseRightDown = true;
      this.pointerRightDownThisFrame = true;
      this.rawX = e.clientX;
      this.rawY = e.clientY;
      this.updateMouseWorld();
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    this.rawX = e.clientX;
    this.rawY = e.clientY;
    this.updateMouseWorld();
    // 拖拽检测
    if (this.state.mouseDown && this.dragStartWorld) {
      const dx = this.state.mouseWorld.x - this.dragStartWorld.x;
      const dy = this.state.mouseWorld.y - this.dragStartWorld.y;
      if (Math.hypot(dx, dy) > InputManager.DRAG_THRESHOLD) {
        this.state.isDragging = true;
      }
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.button === 0) {
      this.state.mouseDown = false;
      // 若处于拖拽状态，本帧标记框选结束，并取消点击
      if (this.state.isDragging && this.dragStartWorld) {
        this.selectBoxFinishedThisFrame = true;
        this.pointerDownThisFrame = false;
        this.state.justClicked = false;
      }
      this.state.isDragging = false;
      this.dragStartWorld = null;
      this.state.dragStartWorld = null;
    } else if (e.button === 2) {
      this.state.mouseRightDown = false;
    }
    this.rawX = e.clientX;
    this.rawY = e.clientY;
    this.updateMouseWorld();
  }

  private handleContextMenu(e: Event): void {
    // 阻止右键菜单弹出
    e.preventDefault();
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    // 累加 wheelDelta（向上为正，向下为负）
    this.state.wheelDelta += e.deltaY;
    this.rawX = e.clientX;
    this.rawY = e.clientY;
    this.updateMouseWorld();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const key = e.key;
    if (!this.keysDown.has(key)) {
      // 新按下
      this.keysPressedThisFrame.add(key);
    }
    this.keysDown.add(key);
    // 更新修饰键状态
    if (key === 'Shift') this.state.shiftDown = true;
    if (key === 'Control') this.state.ctrlDown = true;
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const key = e.key;
    this.keysDown.delete(key);
    if (key === 'Shift') this.state.shiftDown = false;
    if (key === 'Control') this.state.ctrlDown = false;
  }

  /**
   * 窗口失焦时清除所有按下状态，避免卡键
   */
  private handleBlur(): void {
    this.state.mouseDown = false;
    this.state.mouseRightDown = false;
    this.state.shiftDown = false;
    this.state.ctrlDown = false;
    this.state.isDragging = false;
    this.state.dragStartWorld = null;
    this.dragStartWorld = null;
    this.keysDown.clear();
    this.keysPressedThisFrame.clear();
  }
}
