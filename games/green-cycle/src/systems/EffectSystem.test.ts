import { describe, it, expect, beforeEach } from 'vitest';
import { update } from './EffectSystem';
import { makeState } from '../test-helpers';
import { createDamageText, createHitEffect } from '../entities/Effect';

describe('EffectSystem.update', () => {
  let state: ReturnType<typeof makeState>;

  beforeEach(() => {
    state = makeState();
  });

  it('damageText 受重力影响并随时间消失', () => {
    const e = createDamageText(0, 0, '10', '#FFFFFF', state.effectPool);
    state.addEffect(e);
    update(state, 0.1);
    expect(e.y).toBeCloseTo(-3, 10); // vy=-30 * 0.1
    expect(e.vy).toBeCloseTo(-26, 10); // -30 + 40*0.1
    expect(e.remaining).toBeCloseTo(0.7, 10);
    update(state, 0.8);
    expect(e.alive).toBe(false);
    expect(state.effects).toHaveLength(0);
  });

  it('粒子特效更新位置与生命', () => {
    const e = createHitEffect(0, 0, '#FFFFFF', state.effectPool);
    state.addEffect(e);
    const p = e.particles![0];
    p.vx = 10;
    p.vy = 10;
    p.life = 1;
    update(state, 0.1);
    expect(p.x).toBeCloseTo(1, 10);
    expect(p.y).toBeCloseTo(1, 10);
    expect(p.vy).toBeCloseTo(30, 10); // 10 + 200*0.1
    expect(p.life).toBeCloseTo(0.9, 10);
  });

  it('过期的特效被清理并回收到对象池', () => {
    const e = createHitEffect(0, 0, '#FFFFFF', state.effectPool);
    state.addEffect(e);
    update(state, 0.5);
    expect(state.effects).toHaveLength(0);
  });

  it('duration=0.5 的特效在 0.5s 后被移除', () => {
    const e = createHitEffect(0, 0, '#FFFFFF', state.effectPool);
    e.remaining = 0.5;
    e.duration = 0.5;
    state.addEffect(e);
    update(state, 0.5);
    expect(state.effects).toHaveLength(0);
  });
});
