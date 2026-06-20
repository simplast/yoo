import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from './State';
import { Path } from '../utils/Path';
import { createTower } from '../entities/Tower';
import { CONFIG } from '../config';
import type { BuildCell } from './State';

function makeState(): GameState {
  return new GameState(Path.createLoopPath(1280, 720, 80, 320));
}

function initBuildCells(state: GameState, cols = 4, rows = 4): BuildCell[][] {
  state.buildCells = Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (_, r) => ({
      x: c * CONFIG.TILE,
      y: r * CONFIG.TILE,
      occupied: false,
      buildable: true,
    })),
  );
  return state.buildCells;
}

describe('initDifficulty', () => {
  it('initializes easy difficulty correctly', () => {
    const state = makeState();
    state.initDifficulty('easy', false);
    expect(state.gold).toBe(350);
    expect(state.popMax).toBe(CONFIG.START_POP.easy + CONFIG.DIFF_POP.easy);
    expect(state.popMax).toBe(22);
    expect(state.maxEnemies).toBe(CONFIG.MAX_ENEMIES_BY_DIFF.easy);
  });

  it('initializes normal difficulty correctly', () => {
    const state = makeState();
    state.initDifficulty('normal', false);
    expect(state.gold).toBe(250);
    expect(state.popMax).toBe(CONFIG.START_POP.normal + CONFIG.DIFF_POP.normal);
    expect(state.popMax).toBe(10);
    expect(state.maxEnemies).toBe(CONFIG.MAX_ENEMIES_BY_DIFF.normal);
  });

  it('initializes hard difficulty correctly', () => {
    const state = makeState();
    state.initDifficulty('hard', false);
    expect(state.gold).toBe(180);
    expect(state.popMax).toBe(CONFIG.START_POP.hard + CONFIG.DIFF_POP.hard);
    expect(state.popMax).toBe(8);
    expect(state.maxEnemies).toBe(CONFIG.MAX_ENEMIES_BY_DIFF.hard);
  });

  it('uses endless max enemies in endless mode', () => {
    const state = makeState();
    state.initDifficulty('normal', true);
    expect(state.maxEnemies).toBe(CONFIG.ENDLESS_MAX_ENEMIES);
  });
});

describe('resource operations', () => {
  let state: GameState;

  beforeEach(() => {
    state = makeState();
    state.initDifficulty('normal', false);
    state.gold = 100;
    state.wood = 10;
    state.pop = 2;
  });

  it('canAfford checks gold, wood and population', () => {
    expect(state.canAfford(50, 5, 3)).toBe(true);
    expect(state.canAfford(150, 5, 3)).toBe(false);
    expect(state.canAfford(50, 15, 3)).toBe(false);
    expect(state.canAfford(50, 5, 9)).toBe(false);
  });

  it('spend reduces gold and wood', () => {
    state.spend(30, 4);
    expect(state.gold).toBe(70);
    expect(state.wood).toBe(6);
  });
});

describe('tower management', () => {
  it('addTower increases population and marks cell occupied', () => {
    const state = makeState();
    state.initDifficulty('normal', false);
    initBuildCells(state);

    const tower = createTower('arrow', CONFIG.TILE / 2, CONFIG.TILE / 2);
    state.addTower(tower);

    expect(state.pop).toBe(tower.popCost);
    expect(state.buildCells[0][0].occupied).toBe(true);
  });

  it('removeTower decreases population and frees cell', () => {
    const state = makeState();
    state.initDifficulty('normal', false);
    initBuildCells(state);

    const tower = createTower('arrow', CONFIG.TILE / 2, CONFIG.TILE / 2);
    state.addTower(tower);
    state.removeTower(tower);

    expect(state.pop).toBe(0);
    expect(state.buildCells[0][0].occupied).toBe(false);
    expect(state.towers).toHaveLength(0);
  });
});
