import { describe, it, expect, beforeEach } from 'vitest';
import { applyDamage, update } from './CombatSystem';
import { makeState, makeEnemy, addEnemy, makeProjectile, addProjectile } from '../test-helpers';
import { applyBuff } from '../utils/BuffUtil';

describe('CombatSystem.applyDamage', () => {
  let state: ReturnType<typeof makeState>;

  beforeEach(() => {
    state = makeState();
  });

  it('普通伤害按护甲类型计算', () => {
    const enemy = addEnemy(state, makeEnemy(state, 'grunt', { hp: 200, maxHp: 200 }));
    applyDamage(state, enemy, 50, 'normal', -1);
    expect(enemy.hp).toBe(150);
  });

  it('魔免敌人免疫魔法攻击及附带 debuff', () => {
    const enemy = addEnemy(state, makeEnemy(state, 'golem', { hp: 500, maxHp: 500 }));
    applyDamage(state, enemy, 100, 'magic', -1, 'slow', 0.3, 2);
    expect(enemy.hp).toBe(500);
    expect(enemy.buffs).toHaveLength(0);
  });

  it('减甲 buff 累加提升伤害', () => {
    const enemy = addEnemy(state, makeEnemy(state, 'grunt', { hp: 200, maxHp: 200 }));
    applyBuff(enemy, 'armorBreak', 3, 2, 'tower_1');
    applyDamage(state, enemy, 100, 'normal', -1);
    // 100 * 1 * (1 + 3 * 0.1) = 130
    expect(enemy.hp).toBeCloseTo(70, 10);
  });

  it('击杀敌人发放 gold/wood 并统计 kills', () => {
    state = makeState('hard');
    const enemy = addEnemy(state, makeEnemy(state, 'grunt'));
    const expectedGold = enemy.rewardGold;
    const prevGold = state.gold;
    applyDamage(state, enemy, 999, 'normal', -1);
    expect(enemy.alive).toBe(false);
    expect(state.kills).toBe(1);
    expect(state.gold).toBe(prevGold + expectedGold);
    expect(state.wood).toBe(state.wood);
  });

  it('分裂怪死亡生成 2 个子怪', () => {
    const enemy = addEnemy(state, makeEnemy(state, 'splitter', { hp: 100, maxHp: 100 }));
    applyDamage(state, enemy, 200, 'normal', -1);
    const children = state.enemies.filter((e) => e._splitChild);
    expect(children).toHaveLength(2);
    expect(enemy.alive).toBe(false);
  });

  it('applyDamage 接受并写入 debuff', () => {
    const enemy = addEnemy(state, makeEnemy(state, 'grunt'));
    applyDamage(state, enemy, 1, 'normal', 1, 'slow', 0.4, 1.5);
    expect(enemy.buffs).toHaveLength(1);
    expect(enemy.buffs[0].type).toBe('slow');
    expect(enemy.buffs[0].value).toBe(0.4);
  });
});

describe('CombatSystem.update', () => {
  let state: ReturnType<typeof makeState>;

  beforeEach(() => {
    state = makeState();
  });

  it('投射物命中存活的近距离目标', () => {
    const enemy = addEnemy(state, makeEnemy(state, 'grunt', { x: 5, y: 0, hp: 200, maxHp: 200 }));
    const proj = addProjectile(
      state,
      makeProjectile({
        x: 0,
        y: 0,
        targetId: enemy.instanceId,
        speed: 100,
        damage: 50,
        sourceTowerId: -1,
      }),
    );
    update(state, 1);
    expect(proj.alive).toBe(false);
    expect(enemy.hp).toBeLessThan(200);
    expect(state.projectiles).toHaveLength(0);
  });

  it('目标已死且为溅射弹时在当前位置造成范围伤害', () => {
    const dead = makeEnemy(state, 'grunt', { x: 0, y: 0, hp: 0, maxHp: 100, alive: false });
    const nearby = addEnemy(state, makeEnemy(state, 'grunt', { x: 20, y: 0, hp: 200, maxHp: 200 }));
    state.addEnemy(dead);
    const proj = addProjectile(
      state,
      makeProjectile({
        x: 0,
        y: 0,
        targetId: dead.instanceId,
        speed: 100,
        damage: 100,
        splashRadius: 50,
        sourceTowerId: -1,
      }),
    );
    update(state, 1);
    expect(proj.alive).toBe(false);
    expect(nearby.hp).toBeLessThan(200);
  });

  it('未命中时投射物按方向移动', () => {
    const enemy = addEnemy(state, makeEnemy(state, 'grunt', { x: 100, y: 0, hp: 200, maxHp: 200 }));
    const proj = addProjectile(
      state,
      makeProjectile({
        x: 0,
        y: 0,
        targetId: enemy.instanceId,
        speed: 10,
        damage: 50,
        sourceTowerId: -1,
      }),
    );
    update(state, 1);
    expect(proj.alive).toBe(true);
    expect(proj.x).toBeCloseTo(10, 10);
    expect(proj.y).toBe(0);
  });

  it('击杀后清理死亡敌人并回收对象池', () => {
    const enemy = addEnemy(state, makeEnemy(state, 'grunt', { hp: 10, maxHp: 10 }));
    applyDamage(state, enemy, 20, 'normal', -1);
    expect(state.enemies).toHaveLength(1);
    update(state, 0);
    expect(state.enemies).toHaveLength(0);
  });
});
