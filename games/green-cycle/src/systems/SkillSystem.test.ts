import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyPassiveOnAttack, update } from './SkillSystem';
import { makeState, makeEnemy, addEnemy, makeHeroTower, addTower } from '../test-helpers';
import { SKILLS } from '../data/skills';

describe('SkillSystem.applyPassiveOnAttack', () => {
  it('无技能时返回原伤害且不暴击', () => {
    const tower = makeHeroTower('jianfa');
    const result = applyPassiveOnAttack(tower, 100);
    expect(result.damage).toBe(100);
    expect(result.isCrit).toBe(false);
  });

  it('shieldBonus 附加神圣伤害', () => {
    const tower = makeHeroTower('tianshen');
    tower.shieldBonus = 25;
    const result = applyPassiveOnAttack(tower, 100);
    expect(result.damage).toBe(125);
    expect(result.isCrit).toBe(false);
  });

  it('jianfa_crit 触发暴击时伤害倍增', () => {
    const tower = makeHeroTower('jianfa');
    tower.skillLevels = { jianfa_crit: 1 };
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const result = applyPassiveOnAttack(tower, 100);
    expect(result.isCrit).toBe(true);
    expect(result.damage).toBe(150);
    spy.mockRestore();
  });

  it('jianfa_crit 未触发暴击时伤害不变', () => {
    const tower = makeHeroTower('jianfa');
    tower.skillLevels = { jianfa_crit: 1 };
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const result = applyPassiveOnAttack(tower, 100);
    expect(result.isCrit).toBe(false);
    expect(result.damage).toBe(100);
    spy.mockRestore();
  });
});

describe('SkillSystem.update', () => {
  let state: ReturnType<typeof makeState>;

  beforeEach(() => {
    state = makeState();
  });

  it('主动技能 CD > 0 时不释放', () => {
    const hero = makeHeroTower('tianshen', 100, 100);
    hero.skillLevels = { tianshen_judge: 1 };
    hero.skillCds = { tianshen_judge: 2 };
    addTower(state, hero);
    const enemy = addEnemy(
      state,
      makeEnemy(state, 'grunt', { x: 110, y: 100, hp: 1000, maxHp: 1000 }),
    );
    update(state, 1);
    expect(enemy.hp).toBe(1000);
    expect(hero.skillCds!.tianshen_judge).toBe(1);
  });

  it('CD = 0 且范围内有敌人时释放并进入 CD', () => {
    const hero = makeHeroTower('tianshen', 100, 100);
    hero.skillLevels = { tianshen_judge: 1 };
    hero.skillCds = { tianshen_judge: 0 };
    addTower(state, hero);
    const enemy = addEnemy(
      state,
      makeEnemy(state, 'grunt', { x: 110, y: 100, hp: 1000, maxHp: 1000 }),
    );
    update(state, 0);
    expect(enemy.hp).toBeLessThan(1000);
    expect(hero.skillCds!.tianshen_judge).toBe(SKILLS.tianshen_judge.cooldown);
  });

  it('holyDamage 选择 hp 最高的敌人', () => {
    const hero = makeHeroTower('tianshen', 100, 100);
    hero.skillLevels = { tianshen_judge: 1 };
    hero.skillCds = { tianshen_judge: 0 };
    addTower(state, hero);
    const low = addEnemy(state, makeEnemy(state, 'grunt', { x: 105, y: 100, hp: 50, maxHp: 50 }));
    const high = addEnemy(
      state,
      makeEnemy(state, 'brute', { x: 110, y: 100, hp: 500, maxHp: 500 }),
    );
    update(state, 0);
    expect(high.hp).toBeLessThan(500);
    expect(low.hp).toBe(50);
  });

  it('aoeDamage 伤害范围内全部敌人', () => {
    const hero = makeHeroTower('jianfa', 100, 100);
    hero.skillLevels = { jianfa_blade: 1 };
    hero.skillCds = { jianfa_blade: 0 };
    addTower(state, hero);
    const a = addEnemy(state, makeEnemy(state, 'grunt', { x: 110, y: 100, hp: 1000, maxHp: 1000 }));
    const b = addEnemy(state, makeEnemy(state, 'grunt', { x: 120, y: 100, hp: 1000, maxHp: 1000 }));
    update(state, 0);
    expect(a.hp).toBeLessThan(1000);
    expect(b.hp).toBeLessThan(1000);
    expect(hero.skillCds!.jianfa_blade).toBe(SKILLS.jianfa_blade.cooldown);
  });

  it('chainLightning 连锁弹射并衰减', () => {
    const hero = makeHeroTower('dianfa', 100, 100);
    hero.skillLevels = { dianfa_chain: 1 };
    hero.skillCds = { dianfa_chain: 0 };
    addTower(state, hero);
    const a = addEnemy(state, makeEnemy(state, 'grunt', { x: 110, y: 100, hp: 100, maxHp: 100 }));
    const b = addEnemy(state, makeEnemy(state, 'grunt', { x: 130, y: 100, hp: 100, maxHp: 100 }));
    const c = addEnemy(state, makeEnemy(state, 'grunt', { x: 150, y: 100, hp: 100, maxHp: 100 }));
    update(state, 0);
    const hitCount = [a, b, c].filter((e) => e.hp < 100).length;
    expect(hitCount).toBeGreaterThanOrEqual(2);
    expect(hero.skillCds!.dianfa_chain).toBe(SKILLS.dianfa_chain.cooldown);
  });

  it('stormStun 造成魔法伤害并附加眩晕', () => {
    const hero = makeHeroTower('dianfa', 100, 100);
    hero.skillLevels = { dianfa_storm: 1 };
    hero.skillCds = { dianfa_storm: 0 };
    addTower(state, hero);
    const enemy = addEnemy(
      state,
      makeEnemy(state, 'grunt', { x: 110, y: 100, hp: 1000, maxHp: 1000 }),
    );
    update(state, 0);
    expect(enemy.hp).toBeLessThan(1000);
    expect(enemy.buffs.some((b) => b.type === 'stun')).toBe(true);
    expect(hero.skillCds!.dianfa_storm).toBe(SKILLS.dianfa_storm.cooldown);
  });
});
