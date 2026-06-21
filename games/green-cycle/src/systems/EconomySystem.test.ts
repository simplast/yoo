import { describe, it, expect, beforeEach } from 'vitest';
import { update } from './EconomySystem';
import { makeState, makeEnemy, addEnemy, makeTower, addTower } from '../test-helpers';
import { CONFIG } from '../config';

describe('EconomySystem.update', () => {
  let state: ReturnType<typeof makeState>;

  beforeEach(() => {
    state = makeState();
  });

  it('三个全局技能 CD 各自递减并 clamp 到 0', () => {
    state.skillBlastCd = 5;
    state.skillSlowCd = 2;
    state.skillSummonCd = 0;
    update(state, 3);
    expect(state.skillBlastCd).toBe(2);
    expect(state.skillSlowCd).toBe(0);
    expect(state.skillSummonCd).toBe(0);
  });

  it('globalSlowTimer 递减并 clamp 到 0', () => {
    state.globalSlowTimer = 4;
    update(state, 10);
    expect(state.globalSlowTimer).toBe(0);
  });

  it('summonTimer 到期移除临时塔并重置 summonTowerId', () => {
    const tower = makeTower('arrow', 100, 100);
    tower.isTemporary = true;
    addTower(state, tower);
    state.summonTowerId = tower.instanceId;
    state.summonTimer = 1;
    update(state, 1);
    expect(state.summonTimer).toBe(0);
    expect(state.summonTowerId).toBe(-1);
    expect(state.towers).toHaveLength(0);
  });

  it('只移除 isTemporary 标记的召唤塔，不会误删普通塔', () => {
    const normal = makeTower('arrow', 100, 100);
    addTower(state, normal);
    state.summonTowerId = normal.instanceId;
    state.summonTimer = 0.01;
    update(state, 0.02);
    expect(state.summonTowerId).toBe(-1);
    expect(state.towers).toHaveLength(1);
  });

  it('clearBonusTimer 到期未清空则不发放奖励', () => {
    state.clearBonusTimer = 1;
    addEnemy(state, makeEnemy(state, 'grunt'));
    const prevGold = state.gold;
    update(state, 2);
    expect(state.clearBonusTimer).toBe(0);
    expect(state.gold).toBe(prevGold);
  });

  it('clearBonusTimer 倒计时内清空敌人发放 CLEAR_BONUS_GOLD', () => {
    state.clearBonusTimer = 5;
    const prevGold = state.gold;
    update(state, 1);
    expect(state.gold).toBe(prevGold + CONFIG.CLEAR_BONUS_GOLD);
    expect(state.clearBonusTimer).toBe(0);
  });

  it('pressure >= 1 时 phase = lost', () => {
    state.maxEnemies = 1;
    addEnemy(state, makeEnemy(state, 'grunt'));
    addEnemy(state, makeEnemy(state, 'grunt'));
    update(state, 0);
    expect(state.phase).toBe('lost');
  });

  it('bossAlive && bossTimer <= 0 时 phase = lost', () => {
    state.bossAlive = true;
    state.bossTimer = 0.5;
    update(state, 1);
    expect(state.phase).toBe('lost');
    expect(state.bossTimer).toBe(0);
  });
});
