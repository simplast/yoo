// 主循环：固定步长累加 + requestAnimationFrame
import { CONFIG } from '../config';

export class Loop {
  private running = false;
  private lastTime = 0;
  private accumulator = 0;
  private readonly step = 1 / CONFIG.TARGET_FPS; // 固定步长
  private rafId = 0;

  constructor(private readonly onUpdate: (dt: number) => void) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.tick();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private tick = () => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);
    const now = performance.now();
    let frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    // 防止切后台后大跳
    if (frameTime > 0.25) frameTime = 0.25;
    this.accumulator += frameTime;
    // 固定步长更新，避免大 dt 导致物理穿透
    let steps = 0;
    while (this.accumulator >= this.step && steps < 5) {
      this.onUpdate(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    // 若还有剩余（卡顿），丢弃避免死循环
    if (this.accumulator > this.step * 5) this.accumulator = 0;
  };
}
