import { describe, it, expect, beforeEach } from 'vitest';
import { update } from './AuraSystem';
import { makeState, makeEnemy, addEnemy, makeTower, addTower } from '../test-helpers';

describe('AuraSystem.update', () => {
  let state: ReturnType<typeof makeState>;

  beforeEach(() => {
    state = makeState();
  });

  it('敌方光环塔给范围内敌人添加/刷新 auraType buff', () => {
    const aura = makeTower('auraSlow', 100, 100);
    addTower(state, aura);
    const enemy = addEnemy(state, makeEnemy(state, 'grunt', { x: 110, y: 100 }));
    update(state, 0);
    expect(enemy.buffs).toHaveLength(1);
    expect(enemy.buffs[0].type).toBe('slow');
    expect(enemy.buffs[0].value).toBe(0.25);

    enemy.buffs[0].remaining = 0.1;
    update(state, 0);
    expect(enemy.buffs[0].remaining).toBe(1.0);
  });

  it('友方光环塔不会给敌人加 buff', () => {
    const aura = makeTower('auraDamage', 100, 100);
    addTower(state, aura);
    const enemy = addEnemy(state, makeEnemy(state, 'grunt', { x: 110, y: 100 }));
    update(state, 0);
    expect(enemy.buffs).toHaveLength(0);
  });

  it('auraDamage 给范围内塔增加 damageMult', () => {
    const arrow = makeTower('arrow', 110, 100);
    addTower(state, arrow);
    const aura = makeTower('auraDamage', 100, 100);
    addTower(state, aura);
    update(state, 0);
    expect(state.allyAuraCache.get(arrow.instanceId)?.damageMult).toBeCloseTo(1.2, 10);
  });

  it('auraHaste 给范围内塔增加 speedMult', () => {
    const arrow = makeTower('arrow', 110, 100);
    addTower(state, arrow);
    const aura = makeTower('auraHaste', 100, 100);
    addTower(state, aura);
    update(state, 0);
    expect(state.allyAuraCache.get(arrow.instanceId)?.speedMult).toBeCloseTo(1.2, 10);
  });

  it('多个友方光环重叠时倍数相乘', () => {
    const arrow = makeTower('arrow', 110, 100);
    addTower(state, arrow);
    addTower(state, makeTower('auraDamage', 100, 100));
    addTower(state, makeTower('auraDamage', 105, 100));
    update(state, 0);
    const cache = state.allyAuraCache.get(arrow.instanceId)!;
    expect(cache.damageMult).toBeCloseTo(1.44, 10);
  });

  it('光环塔自身不受加成', () => {
    const aura = makeTower('auraDamage', 100, 100);
    addTower(state, aura);
    update(state, 0);
    expect(state.allyAuraCache.has(aura.instanceId)).toBe(false);
  });

  it('半径外的塔不进 allyAuraCache', () => {
    const arrow = makeTower('arrow', 300, 100);
    addTower(state, arrow);
    addTower(state, makeTower('auraDamage', 100, 100));
    update(state, 0);
    expect(state.allyAuraCache.has(arrow.instanceId)).toBe(false);
  });

  it('auraHaster 给范围内友方施加 haste buff', () => {
    const caster = addEnemy(state, makeEnemy(state, 'auraHaster', { x: 100, y: 100 }));
    const grunt = addEnemy(state, makeEnemy(state, 'grunt', { x: 110, y: 100 }));
    update(state, 0);
    // caster 自己不被加 buff；范围内 grunt 有 haste
    expect(caster.buffs.filter((b) => b.type === 'haste')).toHaveLength(0);
    const hasteBuffs = grunt.buffs.filter((b) => b.type === 'haste');
    expect(hasteBuffs).toHaveLength(1);
    expect(hasteBuffs[0].value).toBeCloseTo(0.3, 5);
    expect(hasteBuffs[0].source).toMatch(/^enemy-aura:/);
  });

  it('范围外敌人不受敌方光环影响', () => {
    addEnemy(state, makeEnemy(state, 'auraHaster', { x: 100, y: 100 }));
    const far = addEnemy(state, makeEnemy(state, 'grunt', { x: 300, y: 100 }));
    update(state, 0);
    expect(far.buffs.filter((b) => b.type === 'haste')).toHaveLength(0);
  });

  it('死亡 caster 不施加敌方光环', () => {
    const caster = addEnemy(state, makeEnemy(state, 'auraHaster', { x: 100, y: 100 }));
    caster.alive = false;
    const grunt = addEnemy(state, makeEnemy(state, 'grunt', { x: 110, y: 100 }));
    update(state, 0);
    expect(grunt.buffs.filter((b) => b.type === 'haste')).toHaveLength(0);
  });

  it('敌方光环持续刷新 remaining 不重复叠加', () => {
    addEnemy(state, makeEnemy(state, 'auraHaster', { x: 100, y: 100 }));
    const grunt = addEnemy(state, makeEnemy(state, 'grunt', { x: 110, y: 100 }));
    update(state, 0);
    update(state, 0);
    // 同一 source 不应重复叠加
    expect(grunt.buffs.filter((b) => b.type === 'haste')).toHaveLength(1);
    expect(grunt.buffs[0].remaining).toBe(1.0);
  });
});
