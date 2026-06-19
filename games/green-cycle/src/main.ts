// 入口：初始化游戏、绑定 UI、启动主循环
import { Game } from './game/Game';
import type { UIElements } from './game/Game';
import type { Difficulty } from './config';

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
    skillBlast: $btn('skill-blast'),
    skillSlow: $btn('skill-slow'),
    skillSummon: $btn('skill-summon'),
    speedBtns: Array.from(document.querySelectorAll<HTMLButtonElement>('.speed-btn[data-speed]')),
    pauseBtn: $btn('pause-btn'),
  };

  const game = new Game(canvas, ui);

  // 当前选择的难度
  let selectedDiff: Difficulty = 'normal';

  // 难度选择
  ui.diffRow.querySelectorAll<HTMLButtonElement>('.diff-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.diffRow.querySelectorAll('.diff-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDiff = btn.dataset.diff as Difficulty;
    });
  });

  // 开始按钮
  ui.startBtn.addEventListener('click', () => {
    game.startGame(selectedDiff);
  });

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

  // 启动主循环（菜单状态也运行，处理输入与渲染背景）
  game.start();
}

init();
