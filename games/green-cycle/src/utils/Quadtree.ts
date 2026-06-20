// 四叉树空间划分：加速塔索敌时的范围查询
// 将二维空间递归划分为四个象限，减少碰撞/范围检测的遍历次数

/** 四叉树存储的条目：坐标 + 任意引用 */
export interface QuadtreeItem {
  x: number;
  y: number;
  ref: any;
}

/** 矩形边界 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 四叉树
 *
 * 用法：
 * ```ts
 * const qt = new Quadtree({ x: 0, y: 0, w: 1280, h: 720 });
 * qt.insert({ x: 100, y: 200, ref: enemy });
 * const candidates = qt.retrieve(tower.x, tower.y, tower.range);
 * ```
 */
export class Quadtree {
  private bounds: Rect;
  private maxObjects: number;
  private maxLevels: number;
  private level: number;
  /** 当前节点直接存储的对象（未下推到子节点） */
  private objects: QuadtreeItem[] = [];
  /** 四个子节点：[nw, ne, sw, se]，未分裂时为 null */
  private nodes: Quadtree[] | null = null;

  constructor(bounds: Rect, maxObjects = 10, maxLevels = 5, level = 0) {
    this.bounds = bounds;
    this.maxObjects = maxObjects;
    this.maxLevels = maxLevels;
    this.level = level;
  }

  /**
   * 插入一个条目。超过容量时自动分裂并下推。
   */
  insert(item: QuadtreeItem): void {
    // 已分裂则下推到子节点
    if (this.nodes) {
      const index = this.getIndex(item.x, item.y);
      if (index !== -1) {
        this.nodes[index].insert(item);
        return;
      }
    }

    this.objects.push(item);

    // 超过容量且未达最大深度则分裂
    if (this.objects.length > this.maxObjects && this.level < this.maxLevels) {
      if (!this.nodes) {
        this.split();
      }
      // 将能归入子节点的对象下推
      const remaining: QuadtreeItem[] = [];
      for (const obj of this.objects) {
        const index = this.getIndex(obj.x, obj.y);
        if (index !== -1 && this.nodes) {
          this.nodes[index].insert(obj);
        } else {
          remaining.push(obj);
        }
      }
      this.objects = remaining;
    }
  }

  /**
   * 返回与圆形区域 (x, y, radius) 相交的所有 item.ref。
   * 结果可能包含重复引用（同一对象被多次插入时），调用方自行去重。
   */
  retrieve(x: number, y: number, radius: number): any[] {
    const result: any[] = [];
    this.retrieveHelper(x, y, radius, result);
    return result;
  }

  private retrieveHelper(x: number, y: number, radius: number, result: any[]): void {
    // 圆形区域与当前节点边界不相交则跳过
    if (!this.intersectsCircle(x, y, radius)) {
      return;
    }

    // 检查当前节点直接存储的对象
    const r2 = radius * radius;
    for (const obj of this.objects) {
      const dx = obj.x - x;
      const dy = obj.y - y;
      if (dx * dx + dy * dy <= r2) {
        result.push(obj.ref);
      }
    }

    // 递归检查子节点
    if (this.nodes) {
      for (const node of this.nodes) {
        node.retrieveHelper(x, y, radius, result);
      }
    }
  }

  /** 圆形区域是否与当前节点矩形边界相交 */
  private intersectsCircle(x: number, y: number, radius: number): boolean {
    const closestX = Math.max(this.bounds.x, Math.min(x, this.bounds.x + this.bounds.w));
    const closestY = Math.max(this.bounds.y, Math.min(y, this.bounds.y + this.bounds.h));
    const dx = x - closestX;
    const dy = y - closestY;
    return dx * dx + dy * dy <= radius * radius;
  }

  /** 将当前节点四分为 nw/ne/sw/se */
  private split(): void {
    const { x, y, w, h } = this.bounds;
    const hw = w / 2;
    const hh = h / 2;
    const nextLevel = this.level + 1;

    this.nodes = [
      // nw：左上
      new Quadtree({ x, y, w: hw, h: hh }, this.maxObjects, this.maxLevels, nextLevel),
      // ne：右上
      new Quadtree({ x: x + hw, y, w: hw, h: hh }, this.maxObjects, this.maxLevels, nextLevel),
      // sw：左下
      new Quadtree({ x, y: y + hh, w: hw, h: hh }, this.maxObjects, this.maxLevels, nextLevel),
      // se：右下
      new Quadtree(
        { x: x + hw, y: y + hh, w: hw, h: hh },
        this.maxObjects,
        this.maxLevels,
        nextLevel,
      ),
    ];
  }

  /**
   * 判断坐标所属象限。
   * @returns 0=nw, 1=ne, 2=sw, 3=se；不在边界内返回 -1
   */
  getIndex(x: number, y: number): number {
    const { x: bx, y: by, w, h } = this.bounds;
    // 点不在边界内
    if (x < bx || x >= bx + w || y < by || y >= by + h) {
      return -1;
    }
    const mx = bx + w / 2;
    const my = by + h / 2;
    if (y < my) {
      return x < mx ? 0 : 1; // nw / ne
    }
    return x < mx ? 2 : 3; // sw / se
  }

  /**
   * 清空整棵树，释放子节点引用
   */
  clear(): void {
    this.objects = [];
    if (this.nodes) {
      for (const node of this.nodes) {
        node.clear();
      }
      this.nodes = null;
    }
  }
}
