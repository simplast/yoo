// 泛型对象池：复用对象，减少 GC 压力
// 适用于投射物、特效、粒子等高频创建/销毁的对象

/**
 * 对象池
 *
 * 用法：
 * ```ts
 * const pool = new Pool<Projectile>(
 *   () => ({ instanceId: 0, x: 0, y: 0, ... }),  // 工厂
 *   (p) => { p.alive = false; p.x = 0; p.y = 0; }, // 重置
 *   50  // 初始预分配数量
 * );
 * const p = pool.acquire();
 * // ... 使用 p
 * pool.release(p);
 * ```
 */
export class Pool<T> {
  private factory: () => T;
  private reset: (obj: T) => void;
  /** 空闲对象列表 */
  private free: T[] = [];
  /** 正在使用的对象集合（用于 releaseAll） */
  private active: Set<T> = new Set();

  constructor(factory: () => T, reset: (obj: T) => void, initialSize?: number) {
    this.factory = factory;
    this.reset = reset;
    if (initialSize && initialSize > 0) {
      for (let i = 0; i < initialSize; i++) {
        this.free.push(factory());
      }
    }
  }

  /**
   * 取出一个对象。优先从空闲列表取，没有则新建。
   */
  acquire(): T {
    let obj: T;
    if (this.free.length > 0) {
      obj = this.free.pop()!;
    } else {
      obj = this.factory();
    }
    this.active.add(obj);
    return obj;
  }

  /**
   * 归还单个对象到池中。重复归还会被忽略。
   */
  release(obj: T): void {
    if (this.active.delete(obj)) {
      this.reset(obj);
      this.free.push(obj);
    }
  }

  /**
   * 归还所有正在使用的对象。常用于场景重置。
   */
  releaseAll(): void {
    for (const obj of this.active) {
      this.reset(obj);
      this.free.push(obj);
    }
    this.active.clear();
  }

  /**
   * 当前正在使用的对象数量
   */
  get activeCount(): number {
    return this.active.size;
  }

  /**
   * 空闲对象数量（调试用）
   */
  get freeCount(): number {
    return this.free.length;
  }
}
