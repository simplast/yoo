// 游戏主控：状态机、系统调度、输入处理、UI 同步
import { CONFIG, type GamePhase } from '../config';
import type { Difficulty, Tower, Vec2, SaveData } from '../types';
import { TOWERS } from '../data/towers';
import { RECIPES } from '../data/recipes';
import { Path } from '../utils/Path';
import { GameState } from './State';
import { Loop } from './Loop';
import { Renderer } from '../render/Renderer';
import { InputManager } from '../input/InputManager';
import { audio } from '../audio/Audio';
import { matchRecipe, executeCombine } from '../utils/RecipeUtil';
import { SaveManager } from '../utils/SaveManager';
import { getTowerSvg } from '../utils/AssetLoader';

import * as WaveSystem from '../systems/WaveSystem';
import * as MovementSystem from '../systems/MovementSystem';
import * as TowerAISystem from '../systems/TowerAISystem';
import * as CombatSystem from '../systems/CombatSystem';
import * as AuraSystem from '../systems/AuraSystem';
import * as EconomySystem from '../systems/EconomySystem';
import * as EffectSystem from '../systems/EffectSystem';
import * as SkillSystem from '../systems/SkillSystem';

import { createTower } from '../entities/Tower';
import {
  createHeroTower,
  getHeroStat,
  addAttr,
  learnSkill,
  canLearnSkill,
  getSkillLevel,
} from '../entities/HeroTower';
import { upgradeTower, getTowerStat, getSellRefund } from '../entities/Tower';
import { createBuildEffect, createUpgradeEffect, setEffectQuality } from '../entities/Effect';
import { resetEntityId } from '../entities/Entity';
import { SKILLS, HERO_SKILLS } from '../data/skills';

/** 成长塔重渲染键（不含 exp，经验条由高频同步单独更新） */
function makeGrowthKey(t: Tower): string {
  return [t.level, t.attrPoints, t.skillPoints, ...Object.entries(t.skillLevels ?? {}).sort()].join(
    '|',
  );
}

/** 判断格子是否可建造（不在路径上） */
function isCellBuildable(path: Path, cx: number, cy: number, pathWidth: number): boolean {
  const half = pathWidth / 2 + 4;
  const pts = path.points;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    // 点到线段距离
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((cx - a.x) * dx + (cy - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const d = Math.hypot(cx - px, cy - py);
    if (d < half) return false;
  }
  return true;
}

export class Game {
  private state: GameState;
  private renderer: Renderer;
  private input: InputManager;
  private loop: Loop;

  // UI 元素引用
  private ui: UIElements;

  // 上次同步快照（避免 60Hz 不必要 DOM 写入）
  private lastSync = {
    gold: -1,
    wood: -1,
    pop: -1,
    popMax: -1,
    pf: -1,
    waveIndex: -1,
    endless: false,
    pressurePct: -1,
    nextWaveText: '',
    nextWaveColor: '',
    waveBanner: '',
    skillBlastCd: -1,
    skillSlowCd: -1,
    skillSummonCd: -1,
    phase: '' as GamePhase,
    pauseText: '',
    selectedTowerId: -2, // 哨兵：与 selectedTowerId=-1 区分
    growthRenderKey: '', // 由 (tower.instanceId, tower.level, tower.attrPoints, skillPoints, skillLevels) 拼成；不含 exp
    combineRenderKey: '', // 由 selectedTowerIds 排序后拼成
    popText: '', // 完整的 pop/popMax 字符串
  };

  // 本地存档
  private saveData: SaveData;

  // 上次序列化存档（避免无变化时重复写入 localStorage）
  private lastSaved = '';

  // 菜单显示时的回调（用于外部同步解锁状态与排行榜）
  onShowMenu?: () => void;

  constructor(canvas: HTMLCanvasElement, ui: UIElements) {
    this.ui = ui;
    this.saveData = SaveManager.load() ?? SaveManager.getDefault();
    const path = Path.createLoopPath(
      CONFIG.WORLD_WIDTH,
      CONFIG.WORLD_HEIGHT,
      CONFIG.OUTER_PAD,
      CONFIG.INNER_SIZE,
    );
    this.state = new GameState(path);
    this.state.saveData = this.saveData;
    audio.init();
    audio.applySettings(this.saveData.settings);
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(canvas);

    this.loop = new Loop((dt) => this.update(dt));

    // 输入回调
    this.input.onKeyPress = (key) => this.handleKey(key);

    // 响应式
    window.addEventListener('resize', () => this.handleResize());
    this.handleResize();

    // 初始化建造格子
    this.initBuildCells();

    // 初始渲染（菜单状态也画地图背景）
    this.syncUI();
  }

  /** 获取当前存档数据（供外部菜单同步解锁状态） */
  getSaveData(): SaveData {
    return this.saveData;
  }

  // ===== 生命周期 =====

  start() {
    this.loop.start();
    this.render();
  }

  /** 开始新对局 */
  startGame(difficulty: Difficulty, endless = false) {
    audio.init();
    audio.resume();
    audio.applySettings(this.saveData.settings);
    resetEntityId();
    const path = this.state.path;
    // 释放旧对象池中的对象，避免旧实体引用残留
    this.state.enemyPool.releaseAll();
    this.state.projectilePool.releaseAll();
    this.state.effectPool.releaseAll();
    this.state = new GameState(path);
    this.state.saveData = this.saveData;
    setEffectQuality(this.saveData.settings.quality);
    this.state.initDifficulty(difficulty, endless);
    this.state.phase = 'battling';
    this.state.waveTimer = 3; // 3 秒后第一波
    this.state.selectedTowerId = -1;
    this.state.selectedTowerIds = [];
    this.state.selectBox = null;
    this.initBuildCells();
    this.state.speed = 1;
    this.ui.overlay.classList.add('hide');
    this.ui.towerInfo.classList.remove('show');
    this.syncTowerPanel();
    this.syncUI();
  }

  togglePause() {
    if (this.state.phase === 'battling') {
      this.state.phase = 'paused';
    } else if (this.state.phase === 'paused') {
      this.state.phase = 'battling';
    }
    this.syncUI();
  }

  setSpeed(s: number) {
    this.state.speed = s;
    this.ui.speedBtns.forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.speed) === s);
    });
  }

  // ===== 主更新 =====

  private update(dt: number) {
    const state = this.state;
    // 输入刷新
    this.input.update();

    // 相机控制（滚轮缩放 / 中键拖拽），在 handleInput 之前同步视图
    this.updateCamera();

    if (state.phase === 'battling') {
      // 应用游戏速度（用多次步进模拟加速）
      const steps = state.speed;
      const subDt = dt;
      for (let i = 0; i < steps; i++) {
        state.gameTime += subDt;
        this.handleInput();
        WaveSystem.update(state, subDt);
        AuraSystem.update(state, subDt);
        MovementSystem.update(state, subDt);
        TowerAISystem.update(state, subDt);
        CombatSystem.update(state, subDt);
        SkillSystem.update(state, subDt);
        EffectSystem.update(state, subDt);
        EconomySystem.update(state, subDt);
        if (state.phase !== 'battling') break; // 已胜利/失败
      }
    } else {
      // 非战斗状态仍处理输入（取消选择等）
      this.handleInput();
    }

    this.render();
    this.syncUI();
  }

  // ===== 相机控制 =====

  /**
   * 每帧处理滚轮缩放 + 中键拖拽平移，并将最新 offset/scale 同步给 InputManager
   * 缩放以鼠标位置为锚点；平移方向与鼠标拖拽方向一致
   */
  private updateCamera() {
    const input = this.input;
    const { mouseScreen } = input.state;

    // 滚轮缩放：deltaY 通常为 ±100（鼠标滚轮一格）或小数（触控板），按比例换算
    const wheel = input.consumeWheel();
    if (wheel !== 0) {
      // 100 单位 delta = 一格 = ZOOM_STEP 倍率
      this.renderer.zoomAt(mouseScreen.x, mouseScreen.y, wheel);
    }

    // 中键拖拽平移：panDelta 是屏幕像素差，转为世界坐标差
    if (input.state.mouseMiddleDown) {
      const pan = input.consumePanDelta();
      if (pan.x !== 0 || pan.y !== 0) {
        const v = this.renderer.getView();
        // 屏幕移动 pan.x 等价于相机世界坐标移动 -pan.x / scale
        const cam = this.renderer.getCamera();
        this.renderer.setCamera(cam.x - pan.x / v.scale, cam.y - pan.y / v.scale);
      }
    } else {
      input.consumePanDelta(); // 清空残留
    }

    // 同步最新视图给输入管理器（鼠标世界坐标转换用）
    const v = this.renderer.getView();
    input.setView(v.offsetX, v.offsetY, v.scale);
  }

  // ===== 输入处理 =====

  private handleInput() {
    const state = this.state;
    const input = this.input;

    // 右键取消建造/选择/多选
    if (input.consumeRightClick()) {
      state.pendingBuildTowerId = null;
      state.selectedTowerId = -1;
      state.selectedTowerIds = [];
      state.selectBox = null;
      this.ui.towerInfo.classList.remove('show');
      this.ui.towerPanel
        .querySelectorAll('.tower-btn')
        .forEach((b) => b.classList.remove('active'));
      return;
    }

    // 框选结束
    const box = input.consumeSelectBox();
    if (box) {
      this.handleSelectBox(box.start, box.end, input.state.shiftDown);
      return;
    }

    // 实时框选矩形（用于渲染）
    if (input.state.isDragging && input.state.dragStartWorld) {
      state.selectBox = {
        start: input.state.dragStartWorld,
        end: input.state.mouseWorld,
      };
    } else {
      state.selectBox = null;
    }

    // 左键点击
    if (input.consumeClick()) {
      const { mouseWorld, shiftDown } = input.state;
      // 优先：正在建造模式 → 尝试建塔
      if (state.pendingBuildTowerId) {
        this.tryBuild(mouseWorld.x, mouseWorld.y);
        // shift 连续建造
        if (!shiftDown) {
          state.pendingBuildTowerId = null;
          this.ui.towerPanel
            .querySelectorAll('.tower-btn')
            .forEach((b) => b.classList.remove('active'));
        }
        return;
      }
      // 否则：选择/多选塔
      const tower = state.getTowerAt(mouseWorld.x, mouseWorld.y);
      if (tower) {
        this.handleTowerClick(tower, shiftDown);
      } else {
        state.selectedTowerId = -1;
        state.selectedTowerIds = [];
        this.ui.towerInfo.classList.remove('show');
      }
    }
  }

  /** 处理点击塔：Shift 多选，普通单选 */
  private handleTowerClick(tower: Tower, shiftDown: boolean) {
    const state = this.state;
    if (shiftDown) {
      const idx = state.selectedTowerIds.indexOf(tower.instanceId);
      if (idx >= 0) {
        state.selectedTowerIds.splice(idx, 1);
        if (state.selectedTowerId === tower.instanceId) {
          state.selectedTowerId =
            state.selectedTowerIds.length > 0
              ? state.selectedTowerIds[state.selectedTowerIds.length - 1]
              : -1;
        }
      } else {
        // 将当前主选移入多选（如果存在）
        if (state.selectedTowerId >= 0 && !state.selectedTowerIds.includes(state.selectedTowerId)) {
          state.selectedTowerIds.push(state.selectedTowerId);
        }
        state.selectedTowerIds.push(tower.instanceId);
        state.selectedTowerId = tower.instanceId;
      }
    } else {
      state.selectedTowerId = tower.instanceId;
      state.selectedTowerIds = [];
    }
    this.showTowerInfo(tower);
  }

  /** 处理框选结束 */
  private handleSelectBox(start: Vec2, end: Vec2, shiftDown: boolean) {
    const state = this.state;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    const boxed = state.towers.filter(
      (t) => t.x >= minX && t.x <= maxX && t.y >= minY && t.y <= maxY,
    );

    if (!shiftDown) {
      state.selectedTowerIds = [];
    }

    for (const t of boxed) {
      if (!state.selectedTowerIds.includes(t.instanceId)) {
        state.selectedTowerIds.push(t.instanceId);
      }
    }

    if (state.selectedTowerIds.length > 0) {
      state.selectedTowerId = state.selectedTowerIds[state.selectedTowerIds.length - 1];
      const main = state.getTowerById(state.selectedTowerId);
      if (main) this.showTowerInfo(main);
    } else {
      state.selectedTowerId = -1;
      this.ui.towerInfo.classList.remove('show');
    }
  }

  private handleKey(key: string) {
    const state = this.state;
    if (state.phase !== 'battling' && state.phase !== 'paused') return;
    switch (key) {
      case ' ':
      case 'Spacebar':
        // 立即召唤下一波
        if (state.phase === 'battling' && !state.waveActive && state.waveTimer > 0) {
          state.waveTimer = 0.01;
        }
        break;
      case 'Escape':
        if (state.pendingBuildTowerId) {
          state.pendingBuildTowerId = null;
        } else {
          this.togglePause();
        }
        break;
      case '1':
      case '2':
      case '3':
        this.setSpeed(Number(key));
        break;
      case 'p':
      case 'P':
        this.togglePause();
        break;
    }
  }

  // ===== 建造逻辑 =====

  private tryBuild(x: number, y: number) {
    const state = this.state;
    const defId = state.pendingBuildTowerId;
    if (!defId) return;
    const def = TOWERS[defId];
    if (!def) return;

    // 对齐到格子中心
    const col = Math.floor(x / CONFIG.TILE);
    const row = Math.floor(y / CONFIG.TILE);
    const cx = col * CONFIG.TILE + CONFIG.TILE / 2;
    const cy = row * CONFIG.TILE + CONFIG.TILE / 2;

    // 检查可建造
    const cell = state.buildCells[col]?.[row];
    if (!cell || !cell.buildable || cell.occupied) {
      return;
    }
    // 检查资源
    const cost = def.levels[0].upgradeCost;
    if (!state.canAfford(cost, 0, def.popCost)) {
      return;
    }

    // 扣资源建塔
    state.spend(cost, 0);
    const tower =
      def.category === 'growth' ? createHeroTower(defId, cx, cy) : createTower(defId, cx, cy);
    state.addTower(tower);
    state.addEffect(createBuildEffect(cx, cy, state.effectPool));
    audio.playBuild();
  }

  // ===== 塔操作 =====

  upgradeSelected() {
    const state = this.state;
    const tower = state.getTowerById(state.selectedTowerId);
    if (!tower) return;
    const nextLevel = tower.level + 1;
    if (nextLevel > tower.maxLevel) return;
    const nextCost = tower.levels[Math.min(nextLevel - 1, tower.levels.length - 1)].upgradeCost;
    if (state.gold < nextCost) return;
    state.gold -= nextCost;
    // 注意：upgradeTower() 内部已累加 totalSpent，此处不要重复累加
    upgradeTower(tower);
    state.addEffect(createUpgradeEffect(tower.x, tower.y, state.effectPool));
    audio.playUpgrade();
    this.showTowerInfo(tower);
  }

  sellSelected() {
    const state = this.state;
    const tower = state.getTowerById(state.selectedTowerId);
    if (!tower) return;
    const refund = getSellRefund(tower);
    state.gold += refund;
    state.removeTower(tower);
    state.selectedTowerId = -1;
    state.selectedTowerIds = [];
    this.ui.towerInfo.classList.remove('show');
    audio.playCoin();
  }

  /** 合成当前选中的塔 */
  combineSelected() {
    const state = this.state;
    if (state.selectedTowerIds.length === 0) return;

    const selectedTowers = state.selectedTowerIds
      .map((id) => state.getTowerById(id))
      .filter((t): t is Tower => t !== undefined);

    const matched = matchRecipe(selectedTowers, RECIPES);
    if (!matched) return;

    const { recipe, materials } = matched;
    if (executeCombine(state, recipe, materials)) {
      audio.playCombine();
      const resultTower = state.getTowerById(state.selectedTowerId);
      if (resultTower) this.showTowerInfo(resultTower);
      this.syncTowerPanel();
    }
  }

  // ===== 成长塔属性/技能 =====

  /** 加点属性 */
  addAttrSelected(attr: 'str' | 'agi' | 'int') {
    const state = this.state;
    const tower = state.getTowerById(state.selectedTowerId);
    if (!tower || !tower.isGrowth) return;
    if (addAttr(tower, attr)) {
      audio.playUpgrade();
      this.showTowerInfo(tower);
    }
  }

  /** 学习/升级技能 */
  learnSkillSelected(skillId: string) {
    const state = this.state;
    const tower = state.getTowerById(state.selectedTowerId);
    if (!tower || !tower.isGrowth) return;
    if (learnSkill(tower, skillId)) {
      audio.playUpgrade();
      this.showTowerInfo(tower);
    }
  }

  // ===== 存档/解锁 =====

  /** 保存当前存档（仅在数据有变化时写入） */
  private saveProgress(): void {
    // 去抖：上次序列化结果相同则跳过
    const serialized = JSON.stringify(this.saveData);
    if (serialized === this.lastSaved) return;
    this.lastSaved = serialized;
    SaveManager.save(this.saveData);
  }

  /**
   * 记录对局结果并保存
   * - 胜利：解锁下一难度 / 无尽模式
   * - 失败/无尽结束：更新排行榜与 bestPf
   */
  private recordResult(won: boolean): void {
    const state = this.state;
    const diff = state.difficulty;

    // 更新 bestPf
    if (state.pf > this.saveData.bestPf) {
      this.saveData.bestPf = state.pf;
    }

    // 解锁下一难度 / 无尽模式
    if (won) {
      const unlocks = this.saveData.unlocks;
      if (diff === 'easy' && !unlocks.difficulties.includes('normal')) {
        unlocks.difficulties.push('normal');
      } else if (diff === 'normal' && !unlocks.difficulties.includes('hard')) {
        unlocks.difficulties.push('hard');
      } else if (diff === 'hard' && !unlocks.endlessUnlocked) {
        unlocks.endlessUnlocked = true;
      }
    }

    // 无尽模式记录排行榜
    if (state.endless) {
      const score = state.waveIndex * 100 + state.pf * 10;
      this.saveData.leaderboard.endless.push({
        wave: state.waveIndex,
        score,
        date: Date.now(),
      });
      // 按分数降序保留前 10
      this.saveData.leaderboard.endless.sort((a, b) => b.score - a.score);
      this.saveData.leaderboard.endless = this.saveData.leaderboard.endless.slice(0, 10);
    }

    this.saveProgress();
  }

  // ===== 全局技能 =====

  useSkill(type: 'blast' | 'slow' | 'summon') {
    const state = this.state;
    if (state.phase !== 'battling') return;
    if (type === 'blast' && state.skillBlastCd <= 0) {
      state.skillBlastCd = CONFIG.SKILL_BLAST_CD;
      // 对全屏敌人造成巨额混乱伤害
      const dmg = 500 + state.waveIndex * 50;
      for (const e of [...state.enemies]) {
        CombatSystem.applyDamage(state, e, dmg, 'chaos', -1);
      }
      audio.playSkillBlast();
    } else if (type === 'slow' && state.skillSlowCd <= 0) {
      state.skillSlowCd = CONFIG.SKILL_SLOW_CD;
      state.globalSlowTimer = CONFIG.SKILL_SLOW_DURATION;
      audio.playSkillSlow();
    } else if (type === 'summon' && state.skillSummonCd <= 0) {
      state.skillSummonCd = CONFIG.SKILL_SUMMON_CD;
      // 在路径中点召唤临时高伤炮台
      const pos = state.path.getPosition(0.5);
      const t = createTower('cannon', pos.x, pos.y);
      // 临时塔：覆盖默认 level 配置为高伤单体炮台
      t.levels = [{ level: 1, damage: 200, attackSpeed: 2, range: 150, upgradeCost: 0 }];
      t.maxLevel = 1;
      t.popCost = 0;
      t.isTemporary = true;
      state.addTower(t);
      state.summonTowerId = t.instanceId;
      state.summonTimer = CONFIG.SKILL_SUMMON_DURATION;
      audio.playSkillSummon();
    }
  }

  // ===== 建造格子初始化 =====

  private initBuildCells() {
    const state = this.state;
    const cols = Math.ceil(CONFIG.WORLD_WIDTH / CONFIG.TILE);
    const rows = Math.ceil(CONFIG.WORLD_HEIGHT / CONFIG.TILE);
    const cells: { x: number; y: number; occupied: boolean; buildable: boolean }[][] = [];
    for (let c = 0; c < cols; c++) {
      cells[c] = [];
      for (let r = 0; r < rows; r++) {
        const cx = c * CONFIG.TILE + CONFIG.TILE / 2;
        const cy = r * CONFIG.TILE + CONFIG.TILE / 2;
        const buildable = isCellBuildable(state.path, cx, cy, CONFIG.PATH_WIDTH);
        cells[c][r] = { x: cx, y: cy, occupied: false, buildable };
      }
    }
    state.buildCells = cells;
  }

  // ===== 渲染 =====

  private render() {
    this.renderer.render(this.state, this.input.state.mouseWorld);
  }

  private handleResize() {
    this.renderer.resize();
    // 同步视图变换给输入管理器
    const v = this.renderer.getView();
    this.input.setView(v.offsetX, v.offsetY, v.scale);
  }

  // ===== UI 同步 =====

  private syncUI() {
    this.syncUIHot();
    this.syncUICold();
  }

  /** 60Hz：只更新会变动的数值/进度条/CD 文字 / 经验条 */
  private syncUIHot() {
    const state = this.state;
    const ui = this.ui;

    // 资源
    const gold = Math.floor(state.gold);
    if (this.lastSync.gold !== gold) {
      ui.statGold.textContent = String(gold);
      this.lastSync.gold = gold;
    }
    const wood = Math.floor(state.wood);
    if (this.lastSync.wood !== wood) {
      ui.statWood.textContent = String(wood);
      this.lastSync.wood = wood;
    }
    const popText = `${state.pop}/${state.popMax}`;
    if (this.lastSync.popText !== popText) {
      ui.statPop.textContent = popText;
      this.lastSync.popText = popText;
    }
    const pf = state.pf;
    if (this.lastSync.pf !== pf) {
      ui.statPf.textContent = String(pf);
      this.lastSync.pf = pf;
    }

    // 波次
    const waveText = state.endless
      ? `无尽 ${state.waveIndex} 波`
      : `${state.waveIndex}/${CONFIG.TOTAL_WAVES}`;
    if (this.lastSync.waveIndex !== state.waveIndex || this.lastSync.endless !== state.endless) {
      ui.statWave.textContent = waveText;
      this.lastSync.waveIndex = state.waveIndex;
      this.lastSync.endless = state.endless;
    }

    // 压力条
    const pressurePct = Math.min(100, state.pressure * 100);
    if (this.lastSync.pressurePct !== pressurePct) {
      ui.pressureFill.style.width = `${pressurePct}%`;
      this.lastSync.pressurePct = pressurePct;
    }

    // 下波信息
    const nextWaveText =
      state.clearBonusTimer > 0
        ? `清场奖励 ${Math.ceil(state.clearBonusTimer)}s +${CONFIG.CLEAR_BONUS_GOLD}G`
        : state.currentWave
          ? `当前: ${state.currentWave.hint}`
          : state.waveIndex < CONFIG.TOTAL_WAVES
            ? state.waveActive
              ? '波次进行中'
              : `下波倒计时: ${Math.ceil(state.waveTimer)}s`
            : '已完成';
    const nextWaveColor = state.clearBonusTimer > 0 ? '#FFD700' : '';
    if (this.lastSync.nextWaveText !== nextWaveText) {
      ui.nextWaveInfo.textContent = nextWaveText;
      this.lastSync.nextWaveText = nextWaveText;
    }
    if (this.lastSync.nextWaveColor !== nextWaveColor) {
      ui.nextWaveInfo.style.color = nextWaveColor || '';
      this.lastSync.nextWaveColor = nextWaveColor;
    }

    // 技能 CD
    this.syncSkillBtnHot(ui.skillBlast, state.skillBlastCd, 'skillBlastCd');
    this.syncSkillBtnHot(ui.skillSlow, state.skillSlowCd, 'skillSlowCd');
    this.syncSkillBtnHot(ui.skillSummon, state.skillSummonCd, 'skillSummonCd');

    // 暂停按钮
    const pauseText = state.phase === 'paused' ? '▶' : '⏸';
    if (this.lastSync.pauseText !== pauseText) {
      ui.pauseBtn.textContent = pauseText;
      this.lastSync.pauseText = pauseText;
    }

    // 成长塔经验条（growthRenderKey 不变时仍然要更新）
    if (state.selectedTowerId >= 0) {
      const tower = state.getTowerById(state.selectedTowerId);
      if (tower && tower.isGrowth) {
        const exp = tower.exp ?? 0;
        const expToNext = tower.expToNext ?? 100;
        const expText = `${Math.floor(exp)}/${expToNext}`;
        const expPct = Math.min(100, (exp / expToNext) * 100);
        if (ui.tiExp.textContent !== expText) {
          ui.tiExp.textContent = expText;
        }
        const expWidth = `${expPct}%`;
        if (ui.tiExpFill.style.width !== expWidth) {
          ui.tiExpFill.style.width = expWidth;
        }
      }

      // 升级按钮禁用状态随金币变动，单独高频守护
      if (tower && state.selectedTowerIds.length === 0) {
        const nextLevel = tower.level + 1;
        if (nextLevel <= tower.maxLevel) {
          const nextCost =
            tower.levels[Math.min(nextLevel - 1, tower.levels.length - 1)].upgradeCost;
          const shouldDisable = state.gold < nextCost;
          if (ui.tiUpgrade.disabled !== shouldDisable) {
            ui.tiUpgrade.disabled = shouldDisable;
          }
        }
      }
    }
  }

  private syncSkillBtnHot(
    btn: HTMLButtonElement,
    cd: number,
    key: 'skillBlastCd' | 'skillSlowCd' | 'skillSummonCd',
  ) {
    if (this.lastSync[key] === cd) return;
    const cdEl = btn.querySelector('.cd');
    btn.disabled = cd > 0;
    if (cdEl) cdEl.textContent = cd > 0 ? Math.ceil(cd) + 's' : '';
    this.lastSync[key] = cd;
  }

  /** 低频（事件驱动）：技能树 / 合成面板 / 升级按钮 / 选中塔静态信息 / 结束遮罩 */
  private syncUICold() {
    const state = this.state;
    const ui = this.ui;

    // 波次横幅
    const currentWave = state.currentWave;
    const showBanner =
      state.waveActive && currentWave !== null && state.gameTime - state.waveStartTime < 3;
    const waveBannerText = showBanner ? `第 ${state.waveIndex} 波 — ${currentWave.hint}` : '';
    if (this.lastSync.waveBanner !== waveBannerText) {
      ui.waveBanner.textContent = waveBannerText;
      if (showBanner) {
        ui.waveBanner.classList.add('show');
      } else {
        ui.waveBanner.classList.remove('show');
      }
      this.lastSync.waveBanner = waveBannerText;
    }

    // 结束遮罩
    const phase = state.phase;
    if ((phase === 'won' || phase === 'lost') && this.lastSync.phase !== phase) {
      const won = phase === 'won';
      this.recordResult(won);
      ui.overlay.classList.remove('hide');
      ui.overlayTitle.textContent = '绿色循环圈';
      const bestPf = this.saveData.bestPf;
      const endlessRecords = this.saveData.leaderboard.endless.slice(0, 3);
      const recordText =
        endlessRecords.length > 0
          ? `\n最佳 PF: ${bestPf} | 无尽榜: ${endlessRecords.map((r) => `${r.wave}波/${r.score}分`).join(', ')}`
          : `\n最佳 PF: ${bestPf}`;
      ui.overlaySub.textContent = (won ? '🎉 通关成功！' : '💀 防线崩溃') + recordText;
      ui.diffRow.style.display = 'flex';
      ui.startBtn.textContent = '再来一局';
      if (won) audio.playWin();
      else audio.playLose();
      state.phase = 'menu'; // 防止重复触发
      this.lastSync.phase = 'menu';
      this.onShowMenu?.();
    } else if (this.lastSync.phase !== phase) {
      this.lastSync.phase = phase;
    }

    // 选中塔信息（含技能树/合成面板缓存）
    if (state.selectedTowerId >= 0) {
      const t = state.getTowerById(state.selectedTowerId);
      if (t) {
        const key = `${t.instanceId}:${t.isGrowth ? makeGrowthKey(t) : 'static'}:${t.level}`;
        const auraKey = (() => {
          const a = state.allyAuraCache.get(t.instanceId);
          return a ? `${a.damageMult.toFixed(2)}:${a.speedMult.toFixed(2)}` : '1:1';
        })();
        const combineKey = state.selectedTowerIds
          .slice()
          .sort((a, b) => a - b)
          .join(',');
        if (
          this.lastSync.selectedTowerId !== t.instanceId ||
          this.lastSync.growthRenderKey !== key ||
          this.lastSync.combineRenderKey !== combineKey ||
          (this.lastSync as any).auraKey !== auraKey
        ) {
          this.showTowerInfo(t);
          this.lastSync.selectedTowerId = t.instanceId;
          this.lastSync.growthRenderKey = key;
          this.lastSync.combineRenderKey = combineKey;
          (this.lastSync as any).auraKey = auraKey;
        }
      } else if (this.lastSync.selectedTowerId !== -1) {
        ui.towerInfo.classList.remove('show');
        this.lastSync.selectedTowerId = -1;
        this.lastSync.growthRenderKey = '';
        this.lastSync.combineRenderKey = '';
        (this.lastSync as any).auraKey = '';
      }
    } else if (this.lastSync.selectedTowerId !== -1) {
      ui.towerInfo.classList.remove('show');
      this.lastSync.selectedTowerId = -1;
      this.lastSync.growthRenderKey = '';
      this.lastSync.combineRenderKey = '';
      (this.lastSync as any).auraKey = '';
    }
  }

  /** 选中塔时显示信息面板 */
  private showTowerInfo(tower: Tower) {
    const ui = this.ui;
    const state = this.state;
    ui.towerInfo.classList.add('show');

    // 多选状态：显示合成面板
    if (state.selectedTowerIds.length > 0) {
      this.showCombineInfo();
      return;
    }

    // 单选：常规塔信息
    ui.tiName.textContent = tower.name;
    ui.tiLevel.textContent = `${tower.level}/${tower.maxLevel}`;
    const stat = tower.isGrowth ? getHeroStat(tower) : getTowerStat(tower);
    if (tower.category === 'aura') {
      // 光环塔：不显示伤害/攻速（它们不攻击），改为显示光环效果
      const val = tower.auraValue != null ? Math.round(tower.auraValue * 100) : 0;
      const radius = tower.auraRadius ?? 0;
      if (tower.auraTarget === 'ally') {
        if (tower.id === 'auraHaste') {
          ui.tiDmg.innerHTML = `<span class="aura-bonus">友方攻速 +${val}%</span>`;
        } else if (tower.id === 'auraDamage') {
          ui.tiDmg.innerHTML = `<span class="aura-bonus">友方攻击 +${val}%</span>`;
        } else {
          ui.tiDmg.innerHTML = `<span class="aura-bonus">友方增益 +${val}%</span>`;
        }
      } else {
        // 敌方光环（如减速）
        const typeName = tower.auraType === 'slow' ? '减速' : tower.auraType === 'freeze' ? '冰冻' : '减益';
        ui.tiDmg.innerHTML = `<span class="aura-bonus">敌方${typeName} ${val}%</span>`;
      }
      ui.tiAs.textContent = '—';
      ui.tiRange.textContent = String(Math.floor(radius));
      ui.tiType.textContent = '光环';
    } else {
      // 普通/成长/辅助塔：应用友方光环加成（与 TowerAISystem 战斗逻辑一致）
      const aura = state.allyAuraCache.get(tower.instanceId);
      const dmgMult = aura?.damageMult ?? 1;
      const spdMult = aura?.speedMult ?? 1;
      const baseDmg = Math.floor(stat.damage);
      const buffedDmg = Math.floor(stat.damage * dmgMult);
      const baseAs = stat.attackSpeed;
      const buffedAs = stat.attackSpeed * spdMult;
      if (dmgMult > 1) {
        ui.tiDmg.innerHTML = `${baseDmg} <span class="aura-bonus">→ ${buffedDmg} (+${Math.round((dmgMult - 1) * 100)}%)</span>`;
      } else {
        ui.tiDmg.textContent = String(baseDmg);
      }
      if (spdMult > 1) {
        ui.tiAs.innerHTML = `${baseAs.toFixed(2)} <span class="aura-bonus">→ ${buffedAs.toFixed(2)} (+${Math.round((spdMult - 1) * 100)}%)</span>`;
      } else {
        ui.tiAs.textContent = baseAs.toFixed(2);
      }
      ui.tiRange.textContent = String(Math.floor(stat.range));
      ui.tiType.textContent = tower.attackType;
    }
    const nextLevel = tower.level + 1;
    if (nextLevel > tower.maxLevel) {
      ui.tiUpgrade.textContent = '已满级';
      ui.tiUpgrade.disabled = true;
    } else {
      const nextCost = tower.levels[Math.min(nextLevel - 1, tower.levels.length - 1)].upgradeCost;
      ui.tiUpgrade.textContent = `升级 (${nextCost}💰)`;
      ui.tiUpgrade.disabled = state.gold < nextCost;
    }
    ui.tiUpgrade.style.display = 'block';
    ui.tiSell.style.display = 'block';
    ui.tiCombineSection.style.display = 'none';

    // 成长塔扩展面板
    if (tower.isGrowth) {
      this.showGrowthInfo(tower);
    } else {
      ui.tiExpSection.style.display = 'none';
      ui.tiAttrSection.style.display = 'none';
      ui.tiSkillSection.style.display = 'none';
    }
  }

  /** 显示合成面板（多选状态） */
  private showCombineInfo() {
    const ui = this.ui;
    const state = this.state;
    const selected = state.selectedTowerIds
      .map((id) => state.getTowerById(id))
      .filter((t): t is Tower => t !== undefined);

    ui.tiName.textContent = `已选中 ${selected.length} 座塔`;
    ui.tiLevel.textContent = '';
    ui.tiDmg.textContent = '';
    ui.tiAs.textContent = '';
    ui.tiRange.textContent = '';
    ui.tiType.textContent = '';
    ui.tiUpgrade.style.display = 'none';
    ui.tiSell.style.display = 'none';
    ui.tiExpSection.style.display = 'none';
    ui.tiAttrSection.style.display = 'none';
    ui.tiSkillSection.style.display = 'none';
    ui.tiCombineSection.style.display = 'block';

    const matched = matchRecipe(selected, RECIPES);
    if (matched) {
      const { recipe, materials } = matched;
      const materialValue = materials.reduce((sum, t) => sum + t.totalSpent, 0);
      const resultDef = TOWERS[recipe.result.towerId];
      const resultLevel = recipe.result.level ?? 1;
      const resultValue =
        resultDef.levels[Math.min(resultLevel, resultDef.levels.length) - 1].upgradeCost;
      const netCost = (recipe.cost?.gold ?? 0) + resultValue - materialValue;
      const costText = netCost > 0 ? `需支付 ${netCost}💰` : `返还 ${-netCost}💰`;
      ui.tiCombineInfo.innerHTML = `可合成：<span style="color:var(--accent)">${recipe.name}</span><br>${resultDef.name} Lv${resultLevel}<br>${costText}${recipe.cost?.wood ? ` / ${recipe.cost.wood}🪵` : ''}`;
      ui.tiCombineBtn.textContent = '合成';
      ui.tiCombineBtn.disabled = false;
    } else {
      ui.tiCombineInfo.textContent = '未匹配到可用配方';
      ui.tiCombineBtn.textContent = '合成';
      ui.tiCombineBtn.disabled = true;
    }

    // 渲染配方列表预览
    ui.tiRecipeList.innerHTML = '';
    for (const recipe of RECIPES) {
      const recipeMatch = matchRecipe(selected, [recipe]);
      const unlocked = recipeMatch !== null;

      // 生成条件文本：按 towerId + level 分组
      const groupMap = new Map<string, { towerId: string; level: number; count: number }>();
      for (const ing of recipe.ingredients) {
        const lv = ing.level ?? 1;
        const key = `${ing.towerId}#${lv}`;
        const existing = groupMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          groupMap.set(key, { towerId: ing.towerId, level: lv, count: 1 });
        }
      }
      const conditionParts: string[] = [];
      for (const g of groupMap.values()) {
        const def = TOWERS[g.towerId];
        const name = def ? def.name : g.towerId;
        conditionParts.push(`${g.count}座 ${g.level}级 ${name}`);
      }
      const conditionText = conditionParts.join(' + ');

      const resultDef = TOWERS[recipe.result.towerId];
      const resultName = resultDef ? resultDef.name : recipe.result.towerId;
      const resultLevel = recipe.result.level ?? 1;
      const resultText = `${resultName} Lv${resultLevel}`;

      const costParts: string[] = [];
      if (recipe.cost?.gold) costParts.push(`${recipe.cost.gold}💰`);
      if (recipe.cost?.wood) costParts.push(`${recipe.cost.wood}🪵`);
      const costText = costParts.length > 0 ? ` [${costParts.join(' ')}]` : '';

      const div = document.createElement('div');
      div.className = `recipe-item ${unlocked ? 'unlocked' : 'locked'}`;
      div.innerHTML = `<span class="recipe-name">${recipe.name}</span>${costText}<br><span class="recipe-condition">${conditionText} → ${resultText}</span>`;
      ui.tiRecipeList.appendChild(div);
    }
  }

  /** 成长塔：属性加点、技能树（经验条由 syncUIHot 单独更新） */
  private showGrowthInfo(tower: Tower) {
    const ui = this.ui;
    // 经验条容器显示（数值由 syncUIHot 每帧更新）
    ui.tiExpSection.style.display = 'block';

    // 属性加点
    ui.tiAttrSection.style.display = 'block';
    ui.tiAttrPts.textContent = String(tower.attrPoints ?? 0);
    ui.tiStr.textContent = String(tower.str ?? 0);
    ui.tiAgi.textContent = String(tower.agi ?? 0);
    ui.tiInt.textContent = String(tower.int ?? 0);
    const hasAttrPts = (tower.attrPoints ?? 0) > 0;
    ui.tiAddStr.disabled = !hasAttrPts;
    ui.tiAddAgi.disabled = !hasAttrPts;
    ui.tiAddInt.disabled = !hasAttrPts;

    // 技能树
    ui.tiSkillSection.style.display = 'block';
    ui.tiSkillPts.textContent = String(tower.skillPoints ?? 0);
    this.renderSkillTree(tower);
  }

  /** 渲染技能树按钮列表 */
  private renderSkillTree(tower: Tower) {
    const ui = this.ui;
    ui.tiSkillList.innerHTML = '';
    const skillIds = HERO_SKILLS[tower.id] ?? [];
    for (const skillId of skillIds) {
      const def = SKILLS[skillId];
      if (!def) continue;
      const lv = getSkillLevel(tower, skillId);
      const can = canLearnSkill(tower, skillId);

      const row = document.createElement('div');
      row.className = 'skill-row';

      const info = document.createElement('div');
      info.className = 'skill-info';
      const reqMet =
        (!def.reqStr || (tower.str ?? 0) >= def.reqStr) &&
        (!def.reqInt || (tower.int ?? 0) >= def.reqInt);
      const lvText = lv > 0 ? `Lv${lv}` : '未学';
      const reqText = !reqMet
        ? ` (需${def.reqStr ? `力${def.reqStr}` : ''}${def.reqInt ? `智${def.reqInt}` : ''})`
        : '';
      info.innerHTML = `<span class="skill-name">${def.name}</span><span class="skill-lv">${lvText}/${def.maxLevel}</span>${reqText ? `<span class="skill-req">${reqText}</span>` : ''}`;

      const btn = document.createElement('button');
      btn.className = 'skill-up-btn';
      btn.textContent = lv >= def.maxLevel ? '满级' : '学习';
      btn.disabled = lv >= def.maxLevel || !can;
      btn.addEventListener('click', () => this.learnSkillSelected(skillId));

      row.appendChild(info);
      row.appendChild(btn);
      ui.tiSkillList.appendChild(row);
    }
  }

  /** 构建底部塔面板按钮 */
  syncTowerPanel() {
    const ui = this.ui;
    const state = this.state;
    ui.towerPanel.innerHTML = '';
    const defIds = Object.keys(TOWERS);
    for (const id of defIds) {
      const def = TOWERS[id];
      const btn = document.createElement('button');
      btn.className = `tower-btn cat-${def.category}`;
      btn.dataset.towerId = id;
      const cost = def.levels[0].upgradeCost;
      const svg = getTowerSvg(id);
      const iconHtml = svg
        ? `<span class="icon svg-icon">${svg}</span>`
        : `<span class="icon">•</span>`;
      btn.innerHTML = `${iconHtml}<span class="name">${def.name}</span><span class="cost">💰${cost}</span><span class="pop">🏠${def.popCost}</span>`;
      btn.disabled = state.gold < cost || state.pop + def.popCost > state.popMax;
      btn.addEventListener('click', () => {
        audio.init();
        if (state.pendingBuildTowerId === id) {
          state.pendingBuildTowerId = null;
          btn.classList.remove('active');
        } else {
          state.pendingBuildTowerId = id;
          ui.towerPanel.querySelectorAll('.tower-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          state.selectedTowerId = -1;
          ui.towerInfo.classList.remove('show');
        }
      });
      ui.towerPanel.appendChild(btn);
    }
  }
}

/** UI 元素引用集合 */
export interface UIElements {
  overlay: HTMLElement;
  overlayTitle: HTMLElement;
  overlaySub: HTMLElement;
  diffRow: HTMLElement;
  endlessBtn: HTMLButtonElement;
  leaderboard: HTMLElement;
  startBtn: HTMLButtonElement;
  statGold: HTMLElement;
  statWood: HTMLElement;
  statPop: HTMLElement;
  statWave: HTMLElement;
  statPf: HTMLElement;
  pressureFill: HTMLElement;
  nextWaveInfo: HTMLElement;
  waveBanner: HTMLElement;
  towerPanel: HTMLElement;
  towerInfo: HTMLElement;
  tiName: HTMLElement;
  tiLevel: HTMLElement;
  tiDmg: HTMLElement;
  tiAs: HTMLElement;
  tiRange: HTMLElement;
  tiType: HTMLElement;
  tiUpgrade: HTMLButtonElement;
  tiSell: HTMLButtonElement;
  // 成长塔扩展面板
  tiExpSection: HTMLElement;
  tiExp: HTMLElement;
  tiExpFill: HTMLElement;
  tiAttrSection: HTMLElement;
  tiAttrPts: HTMLElement;
  tiStr: HTMLElement;
  tiAgi: HTMLElement;
  tiInt: HTMLElement;
  tiAddStr: HTMLButtonElement;
  tiAddAgi: HTMLButtonElement;
  tiAddInt: HTMLButtonElement;
  tiSkillSection: HTMLElement;
  tiSkillPts: HTMLElement;
  tiSkillList: HTMLElement;
  // 合成面板
  tiCombineSection: HTMLElement;
  tiCombineInfo: HTMLElement;
  tiCombineBtn: HTMLButtonElement;
  tiRecipeList: HTMLElement;
  skillBlast: HTMLButtonElement;
  skillSlow: HTMLButtonElement;
  skillSummon: HTMLButtonElement;
  speedBtns: HTMLButtonElement[];
  pauseBtn: HTMLButtonElement;
  volumeSlider: HTMLInputElement;
  volumeValue: HTMLElement;
  qualitySelect: HTMLSelectElement;
}
