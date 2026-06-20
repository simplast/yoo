// 集中式游戏状态：所有系统读写此状态，所有渲染器读取此状态
import type {
  Enemy,
  Tower,
  Projectile,
  Effect,
  WaveDef,
  Difficulty,
  GamePhase,
  Resources,
  Vec2,
} from '../types';
import { CONFIG } from '../config';
import { Path } from '../utils/Path';

/** 待出生的敌人队列项 */
export interface SpawnTask {
  enemyId: string;
  spawnAt: number; // 游戏时间秒
  spawned: boolean;
}

/** 可建造格子状态 */
export interface BuildCell {
  x: number;
  y: number;
  occupied: boolean;
  buildable: boolean;
}

export class GameState {
  // ===== 实体集合 =====
  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  effects: Effect[] = [];

  // ===== 资源 =====
  gold = 0;
  wood = 0;
  pop = 0;
  popMax = 0;
  pf = 0;

  // ===== 波次 =====
  waveIndex = 0; // 当前波次（1-based，0=未开始）
  waveTimer = 0; // 下波倒计时秒
  waveActive = false; // 当前波是否还有未出生/未清完的怪
  currentWave: WaveDef | null = null;
  spawnQueue: SpawnTask[] = [];
  waveStartTime = 0;
  gameTime = 0; // 累计游戏时间秒

  // ===== 状态机 =====
  phase: GamePhase = 'menu';
  difficulty: Difficulty = 'normal';
  endless = false; // 是否无尽模式

  // ===== 压力/上限 =====
  maxEnemies: number = CONFIG.MAX_ENEMIES_NORMAL;
  pressure = 0; // 0~1

  // ===== 选中/建造 =====
  selectedTowerId = -1;
  selectedTowerIds: number[] = []; // 多选合成用（保持 selectedTowerId 为最后主选）
  pendingBuildTowerId: string | null = null; // 选中要建造的塔 def id
  buildCells: BuildCell[][] = []; // [col][row]

  // ===== 框选 =====
  selectBox: { start: Vec2; end: Vec2 } | null = null; // 世界坐标，仅绘制用

  // ===== 全局技能 CD =====
  skillBlastCd = 0;
  skillSlowCd = 0;
  skillSummonCd = 0;
  globalSlowTimer = 0; // 全屏减速剩余秒
  summonTowerId = -1; // 召唤的临时炮台 instanceId，-1=无
  summonTimer = 0; // 召唤炮台剩余持续时间秒，0=无活跃召唤

  // ===== 路径 =====
  path: Path;

  // ===== 统计 =====
  kills = 0;
  leaks = 0;
  perfectStreak = 0;
  bossTimer = 0; // Boss 波击杀限时，0=无
  bossAlive = false;

  // 波次 PF 判定：记录当前波次开始时 enemies 是否为空
  waveStartEnemiesEmpty = true;

  // ===== 游戏速度 =====
  speed = 1; // 1/2/3
  accumulator = 0; // 固定步长累加

  constructor(path: Path) {
    this.path = path;
  }

  // ===== 实体增删 =====
  addEnemy(e: Enemy) { this.enemies.push(e); }
  addTower(t: Tower) {
    this.towers.push(t);
    this.pop += t.popCost;
    // 标记格子占用
    this.markCell(t.x, t.y, true);
  }
  addProjectile(p: Projectile) { this.projectiles.push(p); }
  addEffect(e: Effect) { this.effects.push(e); }

  removeEnemy(e: Enemy) {
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
  }
  removeTower(t: Tower) {
    const i = this.towers.indexOf(t);
    if (i >= 0) {
      this.towers.splice(i, 1);
      this.pop -= t.popCost;
      this.markCell(t.x, t.y, false);
      if (this.selectedTowerId === t.instanceId) this.selectedTowerId = -1;
      const multiIdx = this.selectedTowerIds.indexOf(t.instanceId);
      if (multiIdx >= 0) this.selectedTowerIds.splice(multiIdx, 1);
    }
  }

  /** 判断塔是否处于多选列表中 */
  isTowerSelected(id: number): boolean {
    return this.selectedTowerId === id || this.selectedTowerIds.includes(id);
  }

  /** 标记/解除格子占用 */
  private markCell(x: number, y: number, occupied: boolean) {
    const col = Math.floor(x / CONFIG.TILE);
    const row = Math.floor(y / CONFIG.TILE);
    if (this.buildCells[col] && this.buildCells[col][row]) {
      this.buildCells[col][row].occupied = occupied;
    }
  }

  getEnemyById(id: number): Enemy | undefined {
    return this.enemies.find((e) => e.instanceId === id);
  }
  getTowerById(id: number): Tower | undefined {
    return this.towers.find((t) => t.instanceId === id);
  }
  getTowerAt(x: number, y: number): Tower | undefined {
    return this.towers.find(
      (t) => Math.abs(t.x - x) < t.size && Math.abs(t.y - y) < t.size,
    );
  }

  // ===== 资源操作 =====
  canAfford(gold: number, wood = 0, pop = 0): boolean {
    return this.gold >= gold && this.wood >= wood && this.pop + pop <= this.popMax;
  }
  spend(gold: number, wood = 0) {
    this.gold -= gold;
    this.wood -= wood;
  }

  // ===== 压力更新 =====
  updatePressure() {
    const count = this.enemies.length;
    this.pressure = count / this.maxEnemies;
  }

  /** 是否处于危险状态（>=80%） */
  get isDanger(): boolean {
    return this.pressure >= CONFIG.PRESSURE_WARN;
  }

  /** 是否失败（>=100%） */
  get isLost(): boolean {
    return this.pressure >= 1;
  }

  // ===== 初始化难度 =====
  initDifficulty(diff: Difficulty, endless = false) {
    this.difficulty = diff;
    this.endless = endless;
    this.gold = CONFIG.START_GOLD[diff];
    this.wood = CONFIG.START_WOOD[diff];
    this.popMax = CONFIG.START_POP[diff] + CONFIG.DIFF_POP[diff];
    this.maxEnemies = endless
      ? CONFIG.ENDLESS_MAX_ENEMIES
      : CONFIG.MAX_ENEMIES_BY_DIFF[diff];
  }

  /** 获取资源快照 */
  getResources(): Resources {
    return {
      gold: this.gold,
      wood: this.wood,
      pop: this.pop,
      popMax: this.popMax,
      pf: this.pf,
    };
  }
}
