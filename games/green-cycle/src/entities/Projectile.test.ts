import { describe, it, expect } from 'vitest';
import { createProjectile, resetProjectile } from './Projectile';

describe('Projectile pool hygiene', () => {
  it('createProjectile + resetProjectile round-trip leaves a clean shell', () => {
    const p = createProjectile({
      x: 10,
      y: 20,
      targetId: 5,
      speed: 300,
      damage: 50,
      attackType: 'magic',
      splashRadius: 40,
      sourceTowerId: 7,
      color: '#FF0000',
      size: 6,
      debuffType: 'slow',
      debuffValue: 0.3,
      debuffDuration: 1.5,
    });
    expect(p.alive).toBe(true);
    expect(p.debuff).toBeDefined();

    resetProjectile(p);
    expect(p.alive).toBe(false);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
    expect(p.targetId).toBe(0);
    expect(p.speed).toBe(0);
    expect(p.damage).toBe(0);
    expect(p.attackType).toBe('normal');
    expect(p.splashRadius).toBe(0);
    expect(p.sourceTowerId).toBe(0);
    expect(p.color).toBe('');
    expect(p.size).toBe(0);
    expect(p.debuff).toBeUndefined();
  });

  it('a recycled projectile re-acquired via the pool carries no stale fields', () => {
    const a = createProjectile({
      x: 1,
      y: 1,
      targetId: 1,
      speed: 1,
      damage: 1,
      sourceTowerId: 1,
      attackType: 'normal',
      splashRadius: 0,
      color: '#FFF',
      size: 4,
    });
    a.damage = 999;
    a.attackType = 'chaos';
    resetProjectile(a);
    expect(a.damage).toBe(0);
    expect(a.attackType).toBe('normal');
  });
});
