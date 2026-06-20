// 入口：初始化游戏、绑定 UI、启动主循环
import { Game } from './game/Game';
import type { UIElements } from './game/Game';
import type { Difficulty } from './config';
import { getIconSvg, preloadImages } from './utils/AssetLoader';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

function $btn(id: string): HTMLButtonElement {
  return $(id) as HTMLButtonElement;
}

function init(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const ui: UIElements = {
    overlay: $('overlay'),
    overlayTitle: $('overlay').querySelector('h1') as HTMLElement,
    overlaySub: $('overlay-sub'),
    diffRow: $('diff-row'),
    endlessBtn: $btn('endless-btn'),
    leaderboard: $('leaderboard'),
    startBtn: $btn('start-btn'),
    statGold: $('stat-gold'),
    statWood: $('stat-wood'),
    statPop: $('stat-pop'),
    statWave: $('stat-wave'),
    statPf: $('stat-pf'),
    pressureFill: $('pressure-fill'),
    nextWaveInfo: $('next-wave-info'),
    waveBanner: $('wave-banner'),
    towerPanel: $('tower-panel'),
    towerInfo: $('tower-info'),
    tiName: $('ti-name'),
    tiLevel: $('ti-level'),
    tiDmg: $('ti-dmg'),
    tiAs: $('ti-as'),
    tiRange: $('ti-range'),
    tiType: $('ti-type'),
    tiUpgrade: $btn('ti-upgrade'),
    tiSell: $btn('ti-sell'),
    tiExpSection: $('ti-exp-section'),
    tiExp: $('ti-exp'),
    tiExpFill: $('ti-exp-fill'),
    tiAttrSection: $('ti-attr-section'),
    tiAttrPts: $('ti-attr-pts'),
    tiStr: $('ti-str'),
    tiAgi: $('ti-agi'),
    tiInt: $('ti-int'),
    tiAddStr: $btn('ti-add-str'),
    tiAddAgi: $btn('ti-add-agi'),
    tiAddInt: $btn('ti-add-int'),
    tiSkillSection: $('ti-skill-section'),
    tiSkillPts: $('ti-skill-pts'),
    tiSkillList: $('ti-skill-list'),
    tiCombineSection: $('ti-combine-section'),
    tiCombineInfo: $('ti-combine-info'),
    tiCombineBtn: $btn('ti-combine-btn'),
    skillBlast: $btn('skill-blast'),
    skillSlow: $btn('skill-slow'),
    skillSummon: $btn('skill-summon'),
    speedBtns: Array.from(document.querySelectorAll<HTMLButtonElement>('.speed-btn[data-speed]')),
    pauseBtn: $btn('pause-btn'),
  };

  const game = new Game(canvas, ui);

  // 技能按钮替换为 SVG 图标
  function setSkillIcon(btn: HTMLButtonElement, iconId: string) {
    const svg = getIconSvg(iconId);
    if (svg) {
      btn.innerHTML = `<span class="svg-icon">${svg}</span><span class="cd"></span>`;
    }
  }
  setSkillIcon(ui.skillBlast, 'blast');
  setSkillIcon(ui.skillSlow, 'slowGlobal');
  setSkillIcon(ui.skillSummon, 'summon');

  // 当前选择的难度与无尽模式
  let selectedDiff: Difficulty = 'normal';
  let endlessMode = false;

  // 难度选择
  ui.diffRow.querySelectorAll<HTMLButtonElement>('.diff-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.diffRow.querySelectorAll('.diff-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDiff = btn.dataset.diff as Difficulty;
    });
  });

  // 无尽模式切换
  ui.endlessBtn.addEventListener('click', () => {
    if (ui.endlessBtn.disabled) return;
    endlessMode = !endlessMode;
    ui.endlessBtn.textContent = `无尽模式: ${endlessMode ? '开' : '关'}`;
    ui.endlessBtn.classList.toggle('active', endlessMode);
  });

  // 开始按钮
  ui.startBtn.addEventListener('click', () => {
    game.startGame(selectedDiff, endlessMode);
  });

  // 同步菜单解锁/排行榜状态
  function syncMenu() {
    const save = game.getSaveData();
    const unlocked = save.unlocks.difficulties;
    ui.diffRow.querySelectorAll<HTMLButtonElement>('.diff-btn').forEach((btn) => {
      const diff = btn.dataset.diff as Difficulty;
      btn.disabled = !unlocked.includes(diff);
    });
    const endlessUnlocked = save.unlocks.endlessUnlocked;
    ui.endlessBtn.disabled = !endlessUnlocked;
    ui.endlessBtn.textContent = `无尽模式: ${endlessMode && endlessUnlocked ? '开' : '关'}`;
    ui.endlessBtn.classList.toggle('active', endlessMode && endlessUnlocked);

    // 渲染排行榜
    const records = save.leaderboard.endless.slice(0, 5);
    if (records.length === 0) {
      ui.leaderboard.innerHTML = '<div class="lb-title">无尽排行榜</div><div class="lb-empty">暂无记录</div>';
    } else {
      ui.leaderboard.innerHTML = '<div class="lb-title">无尽排行榜</div>' +
        records.map((r, i) => {
          const date = new Date(r.date);
          const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
          return `<div class="lb-row">${i + 1}. ${r.wave}波 / ${r.score}分 — ${dateStr}</div>`;
        }).join('');
    }
  }

  syncMenu();
  game.onShowMenu = syncMenu;

  // 速度控制
  ui.speedBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      game.setSpeed(Number(btn.dataset.speed));
    });
  });

  // 暂停
  ui.pauseBtn.addEventListener('click', () => game.togglePause());

  // 技能按钮
  ui.skillBlast.addEventListener('click', () => game.useSkill('blast'));
  ui.skillSlow.addEventListener('click', () => game.useSkill('slow'));
  ui.skillSummon.addEventListener('click', () => game.useSkill('summon'));

  // 塔信息面板按钮
  ui.tiUpgrade.addEventListener('click', () => game.upgradeSelected());
  ui.tiSell.addEventListener('click', () => game.sellSelected());

  // 成长塔属性加点按钮
  ui.tiAddStr.addEventListener('click', () => game.addAttrSelected('str'));
  ui.tiAddAgi.addEventListener('click', () => game.addAttrSelected('agi'));
  ui.tiAddInt.addEventListener('click', () => game.addAttrSelected('int'));

  // 合成按钮
  ui.tiCombineBtn.addEventListener('click', () => game.combineSelected());

  // 启动主循环（菜单状态也运行，处理输入与渲染背景）
  game.start();

  // 预加载 SVG 资源，确保 canvas 绘制与 UI 图标可用
  preloadImages().catch(() => {
    // 忽略预加载错误，回退逻辑会处理
  });
}

init();
