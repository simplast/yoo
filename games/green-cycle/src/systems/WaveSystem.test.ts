import { describe, it, expect, beforeEach } from 'vitest';
import { update } from './WaveSystem';
import { makeState, makeEnemy, addEnemy } from '../test-helpers';
import { CONFIG } from '../config';
import { WAVES } from '../data/waves';

describe('WaveSystem.update', () => {
  let state: ReturnType<typeof makeState>;

  beforeEach(() => {
    state = makeState('normal', false);
  });

  it('非 battling 阶段不启动波次', () => {
    state.phase = 'ready';
    state.waveActive = false;
    state.waveTimer = 1;
    update(state, 1);
    expect(state.waveActive).toBe(false);
    expect(state.waveIndex).toBe(0);
  });

  it('battling 阶段 waveTimer 倒计时归零后启动下一波', () => {
    state.waveActive = false;
    state.waveTimer = 2;
    update(state, 1);
    expect(state.waveTimer).toBe(1);
    expect(state.waveActive).toBe(false);
    update(state, 1);
    expect(state.waveIndex).toBe(1);
    expect(state.waveActive).toBe(true);
    expect(state.currentWave).not.toBeNull();
    expect(state.spawnQueue.length).toBeGreaterThan(0);
  });

  it('启动波次时记录 waveStartEnemiesEmpty', () => {
    state.waveActive = false;
    state.waveTimer = 0.1;
    expect(state.waveStartEnemiesEmpty).toBe(true);
    addEnemy(state, makeEnemy(state));
    update(state, 0.1);
    expect(state.waveStartEnemiesEmpty).toBe(false);
  });

  it('普通波全部出生后结算并发放奖励 / PF / 清场倒计时', () => {
    state.waveActive = false;
    state.waveTimer = 0.1;
    const prevGold = state.gold;
    update(state, 0.1); // 启动第 1 波
    const wave = state.currentWave!;
    state.gameTime = 20; // 模拟时间走完所有 spawnAt
    update(state, 0);
    expect(state.waveActive).toBe(false);
    expect(state.gold).toBe(prevGold + wave.rewardGold);
    expect(state.pf).toBe(1);
    expect(state.clearBonusTimer).toBe(CONFIG.CLEAR_BONUS_TIME);
  });

  it('普通波残留敌人时不算 PF', () => {
    state.waveActive = false;
    state.waveTimer = 0.1;
    addEnemy(state, makeEnemy(state));
    update(state, 0.1);
    state.gameTime = 20;
    update(state, 0);
    expect(state.pf).toBe(0);
  });

  it('经济波不启动 clearBonusTimer', () => {
    state.waveIndex = 29; // 下一波为第 30 波（经济波）
    state.waveActive = false;
    state.waveTimer = 0.1;
    update(state, 0.1);
    const wave = state.currentWave!;
    expect(wave.isEconomy).toBe(true);
    state.gameTime = 20;
    update(state, 0);
    expect(state.clearBonusTimer).toBe(0);
    expect(state.gold).toBe(CONFIG.START_GOLD.normal + wave.rewardGold);
  });

  it('Boss 波需清空敌人才结算', () => {
    state.waveIndex = 14; // 下一波为第 15 波（Boss）
    state.waveActive = false;
    state.waveTimer = 0.1;
    update(state, 0.1);
    expect(state.bossAlive).toBe(true);
    expect(state.bossTimer).toBe(WAVES[14].bossTimer);
    state.gameTime = 20;
    update(state, 0);
    expect(state.waveActive).toBe(true); // Boss 还活着
    // 手动清空敌人
    state.enemies.length = 0;
    update(state, 0);
    expect(state.waveActive).toBe(false);
    expect(state.bossAlive).toBe(false);
  });

  it('无尽模式第 51 波按 WAVES[0] 模板缩放', () => {
    state = makeState('normal', true);
    state.waveIndex = 50;
    state.waveActive = false;
    state.waveTimer = 0.1;
    update(state, 0.1);
    expect(state.waveIndex).toBe(51);
    const wave = state.currentWave!;
    const template = WAVES[0];
    // cycle = 1, countMul = 1.2, rewardMul = 1.15
    expect(wave.spawns[0].count).toBe(Math.max(1, Math.floor(template.spawns[0].count * 1.2)));
    expect(wave.rewardGold).toBe(Math.floor(template.rewardGold * 1.15));
  });

  it('非无尽模式通关第 50 波后 phase = won', () => {
    state.waveIndex = 49;
    state.waveActive = false;
    state.waveTimer = 0.1;
    update(state, 0.1); // 启动第 50 波
    state.gameTime = 20;
    update(state, 0); // 生成 Boss
    state.enemies.length = 0;
    update(state, 0);
    expect(state.phase).toBe('won');
  });
});
