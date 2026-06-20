import { describe, it, expect } from 'vitest';
import { applyBuff, sumBuffValue, isCrowdControlled } from './BuffUtil';
import type { Enemy } from '../types';

function makeEnemy(buffs: Enemy['buffs'] = []): Enemy {
  return { buffs } as Enemy;
}

describe('applyBuff', () => {
  it('adds a new buff on first application', () => {
    const enemy = makeEnemy();
    applyBuff(enemy, 'slow', 0.3, 2, 'tower_1');
    expect(enemy.buffs).toHaveLength(1);
    expect(enemy.buffs[0]).toEqual({ type: 'slow', value: 0.3, remaining: 2, source: 'tower_1' });
  });

  it('refreshes duration and value when type and source match', () => {
    const enemy = makeEnemy([{ type: 'slow', value: 0.2, remaining: 0.5, source: 'tower_1' }]);
    applyBuff(enemy, 'slow', 0.4, 3, 'tower_1');
    expect(enemy.buffs).toHaveLength(1);
    expect(enemy.buffs[0].value).toBe(0.4);
    expect(enemy.buffs[0].remaining).toBe(3);
  });

  it('adds a separate layer for same type but different source', () => {
    const enemy = makeEnemy([{ type: 'slow', value: 0.2, remaining: 1, source: 'tower_1' }]);
    applyBuff(enemy, 'slow', 0.3, 2, 'tower_2');
    expect(enemy.buffs).toHaveLength(2);
  });
});

describe('sumBuffValue', () => {
  it('sums values of the requested buff type', () => {
    const enemy = makeEnemy([
      { type: 'slow', value: 0.2, remaining: 1, source: 'a' },
      { type: 'slow', value: 0.3, remaining: 1, source: 'b' },
      { type: 'stun', value: 1, remaining: 1, source: 'c' },
    ]);
    expect(sumBuffValue(enemy, 'slow')).toBeCloseTo(0.5);
  });

  it('returns 0 when enemy has no buff of the requested type', () => {
    const enemy = makeEnemy();
    expect(sumBuffValue(enemy, 'slow')).toBe(0);
  });
});

describe('isCrowdControlled', () => {
  it('returns true when a buff of the type is present and still remaining', () => {
    const enemy = makeEnemy([{ type: 'stun', value: 1, remaining: 1, source: 'a' }]);
    expect(isCrowdControlled(enemy, 'stun')).toBe(true);
  });

  it('returns false when enemy has no buff of the type', () => {
    const enemy = makeEnemy();
    expect(isCrowdControlled(enemy, 'stun')).toBe(false);
  });

  it('returns false when the buff has expired', () => {
    const enemy = makeEnemy([{ type: 'stun', value: 1, remaining: 0, source: 'a' }]);
    expect(isCrowdControlled(enemy, 'stun')).toBe(false);
  });
});
