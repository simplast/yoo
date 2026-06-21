import { describe, it, expect, beforeEach } from 'vitest';
import { update } from './TowerAISystem';
import {
  makeState,
  makeEnemy,
  addEnemy,
  makeTower,
  makeHeroTower,
  addTower,
} from '../test-helpers';

describe('TowerAISystem.update', () => {
  let state: ReturnType<typeof makeState>;

  beforeEach(() => {
    state = makeState();
  });

  it('光环塔不攻击', () => {
    const aura = makeTower('auraDamage', 100, 100);
    addTower(state, aura);
    addEnemy(state, makeEnemy(state, 'grunt', { x: 110, y: 100 }));
    update(state, 0);
    expect(state.projectiles).toHaveLength(0);
    expect(state.effects).toHaveLength(0);
  });

  it('冷却未就绪时不攻击', () => {
    const tower = makeTower('arrow', 100, 100);
    tower.cooldown = 1;
    addTower(state, tower);
    addEnemy(state, makeEnemy(state, 'grunt', { x: 110, y: 100 }));
    update(state, 0);
    expect(state.projectiles).toHaveLength(0);
  });

  it('范围内有敌人时生成投射物并指向目标', () => {
    const tower = makeTower('arrow', 100, 100);
    addTower(state, tower);
    const enemy = addEnemy(state, makeEnemy(state, 'grunt', { x: 110, y: 100 }));
    update(state, 0);
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0].targetId).toBe(enemy.instanceId);
  });

  it('隐形敌人需要 trueSight 才能索敌', () => {
    const arrow = makeTower('arrow', 100, 100);
    addTower(state, arrow);
    const ghost = addEnemy(state, makeEnemy(state, 'ghost', { x: 110, y: 100 }));
    update(state, 0);
    expect(state.projectiles).toHaveLength(0);

    const chaos = makeTower('chaos', 100, 100);
    state.towers = [];
    addTower(state, chaos);
    addEnemy(state, ghost);
    update(state, 0);
    expect(state.projectiles).toHaveLength(1);
  });

  it('飞行敌人需要 antiAir 才能索敌', () => {
    const arrow = makeTower('arrow', 100, 100);
    addTower(state, arrow);
    const wyvern = addEnemy(
      state,
      makeEnemy(state, 'wyvern', { x: 110, y: 100, hp: 1000, maxHp: 1000 }),
    );
    update(state, 0);
    expect(state.projectiles).toHaveLength(0);
    expect(wyvern.hp).toBe(1000);

    const lightning = makeTower('lightning', 100, 100);
    state.towers = [];
    addTower(state, lightning);
    addEnemy(state, wyvern);
    update(state, 0);
    expect(wyvern.hp).toBeLessThan(1000);
  });

  it('nearest 策略选择最近敌人', () => {
    const splash = makeTower('splash', 100, 100);
    splash.targetStrategy = 'nearest';
    addTower(state, splash);
    const near = addEnemy(state, makeEnemy(state, 'grunt', { x: 105, y: 100 }));
    addEnemy(state, makeEnemy(state, 'brute', { x: 150, y: 100 }));
    update(state, 0);
    expect(state.projectiles[0].targetId).toBe(near.instanceId);
  });

  it('first 策略选择 pathProgress 最大的敌人', () => {
    const arrow = makeTower('arrow', 100, 100);
    addTower(state, arrow);
    const front = addEnemy(state, makeEnemy(state, 'grunt', { x: 110, y: 100, pathProgress: 0.6 }));
    addEnemy(state, makeEnemy(state, 'grunt', { x: 105, y: 100, pathProgress: 0.3 }));
    update(state, 0);
    expect(state.projectiles[0].targetId).toBe(front.instanceId);
  });

  it('strongest 策略选择 hp 最高的敌人', () => {
    const cannon = makeTower('cannon', 100, 100);
    addTower(state, cannon);
    addEnemy(state, makeEnemy(state, 'grunt', { x: 105, y: 100 }));
    const brute = addEnemy(state, makeEnemy(state, 'brute', { x: 110, y: 100 }));
    update(state, 0);
    expect(state.projectiles[0].targetId).toBe(brute.instanceId);
  });

  it('weakest 策略选择 hp 最低的敌人', () => {
    const arrow = makeTower('arrow', 100, 100);
    arrow.targetStrategy = 'weakest';
    addTower(state, arrow);
    addEnemy(state, makeEnemy(state, 'brute', { x: 110, y: 100 }));
    const grunt = addEnemy(state, makeEnemy(state, 'grunt', { x: 105, y: 100 }));
    update(state, 0);
    expect(state.projectiles[0].targetId).toBe(grunt.instanceId);
  });

  it('priority 策略优先 boss/飞行/隐形/分裂/auraHaste', () => {
    const lightning = makeTower('lightning', 100, 100);
    lightning.targetStrategy = 'priority';
    addTower(state, lightning);
    const grunt = addEnemy(
      state,
      makeEnemy(state, 'grunt', { x: 102, y: 100, hp: 1000, maxHp: 1000 }),
    );
    const wyvern = addEnemy(
      state,
      makeEnemy(state, 'wyvern', { x: 120, y: 100, hp: 1000, maxHp: 1000 }),
    );
    update(state, 0);
    expect(wyvern.hp).toBeLessThan(1000);
    expect(grunt.hp).toBe(1000);
  });

  it('即时命中塔直接造成伤害和特效', () => {
    const lightning = makeTower('lightning', 100, 100);
    addTower(state, lightning);
    const enemy = addEnemy(
      state,
      makeEnemy(state, 'grunt', { x: 110, y: 100, hp: 1000, maxHp: 1000 }),
    );
    const prevHp = enemy.hp;
    update(state, 0);
    expect(state.projectiles).toHaveLength(0);
    expect(enemy.hp).toBeLessThan(prevHp);
    expect(state.effects.length).toBeGreaterThanOrEqual(2);
  });

  it('allyAuraCache 的 damageMult 会放大伤害', () => {
    const arrow = makeTower('arrow', 100, 100);
    addTower(state, arrow);
    const aura = makeTower('auraDamage', 100, 100);
    addTower(state, aura);
    state.allyAuraCache.set(arrow.instanceId, { damageMult: 1.2, speedMult: 1, hasAura: true });
    addEnemy(state, makeEnemy(state, 'grunt', { x: 110, y: 100 }));
    update(state, 0);
    const baseDamage = arrow.levels[0].damage;
    expect(state.projectiles[0].damage).toBeCloseTo(baseDamage * 1.2, 10);
  });

  it('成长塔护盾被动附加伤害', () => {
    const hero = makeHeroTower('tianshen', 100, 100);
    hero.shieldBonus = 30;
    addTower(state, hero);
    addEnemy(state, makeEnemy(state, 'grunt', { x: 110, y: 100 }));
    update(state, 0);
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0].damage).toBeCloseTo(
      hero.levels[0].damage + 30 + hero.str! * 0.5,
      10,
    );
  });
});
