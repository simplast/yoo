import { describe, it, expect, beforeEach } from 'vitest';
import { update } from './MovementSystem';
import { makeState, makeEnemy, addEnemy } from '../test-helpers';

describe('MovementSystem.update', () => {
  let state: ReturnType<typeof makeState>;

  beforeEach(() => {
    state = makeState();
  });

  it('正常速度按 speed * dt / totalLength 推进', () => {
    const enemy = makeEnemy(state, 'grunt', { speed: 60, pathProgress: 0 });
    addEnemy(state, enemy);
    const totalLength = state.path.totalLength;
    update(state, 1);
    expect(enemy.pathProgress).toBeCloseTo(60 / totalLength, 10);
    expect(enemy.x).not.toBe(0);
    expect(enemy.y).not.toBe(0);
  });

  it('减速叠加被 0.8 上限截断', () => {
    const enemy = makeEnemy(state, 'grunt', {
      speed: 100,
      buffs: [
        { type: 'slow', value: 0.3, remaining: 1 },
        { type: 'slow', value: 0.3, remaining: 1 },
        { type: 'slow', value: 0.3, remaining: 1 },
      ],
    });
    addEnemy(state, enemy);
    const totalLength = state.path.totalLength;
    update(state, 1);
    // 0.9 截断到 0.8，实际速度 = 100 * 0.2 = 20
    expect(enemy.pathProgress).toBeCloseTo(20 / totalLength, 10);
  });

  it('freeze / stun 让敌人完全停止', () => {
    const frozen = makeEnemy(state, 'grunt', {
      speed: 100,
      pathProgress: 0.1,
      buffs: [{ type: 'freeze', value: 1, remaining: 1 }],
    });
    const stunned = makeEnemy(state, 'grunt', {
      speed: 100,
      pathProgress: 0.2,
      buffs: [{ type: 'stun', value: 1, remaining: 1 }],
    });
    addEnemy(state, frozen);
    addEnemy(state, stunned);
    update(state, 1);
    expect(frozen.pathProgress).toBe(0.1);
    expect(stunned.pathProgress).toBe(0.2);
  });

  it('全局减速额外增加 0.5', () => {
    const enemy = makeEnemy(state, 'grunt', { speed: 100 });
    addEnemy(state, enemy);
    state.globalSlowTimer = 5;
    const totalLength = state.path.totalLength;
    update(state, 1);
    expect(enemy.pathProgress).toBeCloseTo(50 / totalLength, 10);
  });

  it('haste 按 1 + hasteTotal 倍加速', () => {
    const enemy = makeEnemy(state, 'grunt', {
      speed: 100,
      buffs: [{ type: 'haste', value: 0.5, remaining: 1 }],
    });
    addEnemy(state, enemy);
    const totalLength = state.path.totalLength;
    update(state, 1);
    expect(enemy.pathProgress).toBeCloseTo(150 / totalLength, 10);
  });

  it('pathProgress >= 1 时折回到 [0,1)', () => {
    const totalLength = state.path.totalLength;
    const enemy = makeEnemy(state, 'grunt', {
      speed: totalLength, // 1 秒刚好走一圈
      pathProgress: 0.9,
    });
    addEnemy(state, enemy);
    update(state, 0.5);
    expect(enemy.pathProgress).toBeCloseTo(0.4, 10);
  });

  it('hitFlash 倒计时归零', () => {
    const enemy = makeEnemy(state, 'grunt', { hitFlash: 0.5 });
    addEnemy(state, enemy);
    update(state, 0.5);
    expect(enemy.hitFlash).toBe(0);
  });

  it('到期的 buff 被移除', () => {
    const enemy = makeEnemy(state, 'grunt', {
      buffs: [
        { type: 'slow', value: 0.3, remaining: 0.2 },
        { type: 'haste', value: 0.5, remaining: 2 },
      ],
    });
    addEnemy(state, enemy);
    update(state, 0.5);
    expect(enemy.buffs).toHaveLength(1);
    expect(enemy.buffs[0].type).toBe('haste');
  });
});
