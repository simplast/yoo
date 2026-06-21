// 特效工厂：创建各种视觉特效（伤害文字、命中、死亡、建造、升级、溅射）
// 特效包含粒子系统，由渲染层按 remaining/duration 插值播放

import type { Effect, Vec2 } from '../types';
import type { Pool } from '../utils/Pool';
import { nextEntityId } from './Entity';

/** 重置特效对象（对象池复用时调用） */
export function resetEffect(e: Effect): void {
  e.alive = false;
  e.remaining = 0;
  e.particles = undefined;
  e.points = undefined;
  e.text = undefined;
  e.color = undefined;
  e.vy = undefined;
  e.radius = undefined;
}

/** 粒子结构 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

/**
 * 创建伤害飘字特效
 * - type='damageText'，duration=0.8s，向上飘动（vy=-30）
 */
export function createDamageText(
  x: number,
  y: number,
  text: string,
  color: string,
  pool?: Pool<Effect>,
): Effect {
  const e = pool ? pool.acquire() : ({} as Effect);
  e.instanceId = nextEntityId();
  e.type = 'damageText';
  e.x = x;
  e.y = y;
  e.remaining = 0.8;
  e.duration = 0.8;
  e.alive = true;
  e.text = text;
  e.color = color;
  e.vy = -30;
  return e;
}

/**
 * 创建命中特效
 * - type='hit'，duration=0.2s，4-6 个随机方向小粒子
 */
export function createHitEffect(x: number, y: number, color: string, pool?: Pool<Effect>): Effect {
  const duration = 0.2;
  const count = 4 + Math.floor(Math.random() * 3); // 4-6
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 50;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: duration,
      color,
    });
  }
  const e = pool ? pool.acquire() : ({} as Effect);
  e.instanceId = nextEntityId();
  e.type = 'hit';
  e.x = x;
  e.y = y;
  e.remaining = duration;
  e.duration = duration;
  e.alive = true;
  e.particles = particles;
  return e;
}

/**
 * 创建死亡特效
 * - type='death'，duration=0.5s，8 个向外扩散粒子
 */
export function createDeathEffect(
  x: number,
  y: number,
  color: string,
  pool?: Pool<Effect>,
): Effect {
  const duration = 0.5;
  const count = 8;
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = 60 + Math.random() * 40;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: duration,
      color,
    });
  }
  const e = pool ? pool.acquire() : ({} as Effect);
  e.instanceId = nextEntityId();
  e.type = 'death';
  e.x = x;
  e.y = y;
  e.remaining = duration;
  e.duration = duration;
  e.alive = true;
  e.particles = particles;
  return e;
}

/**
 * 创建建造特效
 * - type='build'，duration=0.4s，金色向上粒子
 */
export function createBuildEffect(x: number, y: number, pool?: Pool<Effect>): Effect {
  const duration = 0.4;
  const color = '#FFD700';
  const count = 6;
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    // 向上扇形扩散（-π/2 为正上方）
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.5;
    const speed = 40 + Math.random() * 60;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: duration,
      color,
    });
  }
  const e = pool ? pool.acquire() : ({} as Effect);
  e.instanceId = nextEntityId();
  e.type = 'build';
  e.x = x;
  e.y = y;
  e.remaining = duration;
  e.duration = duration;
  e.alive = true;
  e.particles = particles;
  return e;
}

/**
 * 创建升级特效
 * - type='upgrade'，duration=0.5s，金色光环粒子（环形扩散）
 */
export function createUpgradeEffect(x: number, y: number, pool?: Pool<Effect>): Effect {
  const duration = 0.5;
  const color = '#FFD700';
  const count = 8;
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = 50;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: duration,
      color,
    });
  }
  const e = pool ? pool.acquire() : ({} as Effect);
  e.instanceId = nextEntityId();
  e.type = 'upgrade';
  e.x = x;
  e.y = y;
  e.remaining = duration;
  e.duration = duration;
  e.alive = true;
  e.particles = particles;
  return e;
}

/**
 * 创建溅射特效
 * - type='splash'，duration=0.3s，圆形扩散
 * - 粒子在 duration 内扩散到 radius 距离
 */
export function createSplashEffect(
  x: number,
  y: number,
  radius: number,
  color: string,
  pool?: Pool<Effect>,
): Effect {
  const duration = 0.3;
  const count = 8;
  const speed = radius / duration; // 在 duration 秒内扩散到 radius
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: duration,
      color,
    });
  }
  const e = pool ? pool.acquire() : ({} as Effect);
  e.instanceId = nextEntityId();
  e.type = 'splash';
  e.x = x;
  e.y = y;
  e.remaining = duration;
  e.duration = duration;
  e.alive = true;
  e.particles = particles;
  return e;
}

// ===== 技能特效 =====

/**
 * 创建闪电链特效
 * - type='lightning'，duration=0.4s
 * - points 为折线顶点序列（塔→敌人1→敌人2...）
 */
export function createLightningEffect(points: Vec2[], color: string, pool?: Pool<Effect>): Effect {
  const duration = 0.4;
  const e = pool ? pool.acquire() : ({} as Effect);
  e.instanceId = nextEntityId();
  e.type = 'lightning';
  e.x = points[0]?.x ?? 0;
  e.y = points[0]?.y ?? 0;
  e.remaining = duration;
  e.duration = duration;
  e.alive = true;
  e.color = color;
  e.points = points;
  return e;
}

/**
 * 创建审判之光特效（单体闪电从天而降）
 * - type='lightning'，单段竖直折线
 */
export function createJudgeEffect(
  x: number,
  y: number,
  color: string,
  pool?: Pool<Effect>,
): Effect {
  const duration = 0.4;
  const e = pool ? pool.acquire() : ({} as Effect);
  e.instanceId = nextEntityId();
  e.type = 'lightning';
  e.x = x;
  e.y = y;
  e.remaining = duration;
  e.duration = duration;
  e.alive = true;
  e.color = color;
  e.points = [
    { x, y: y - 60 },
    { x, y },
  ];
  return e;
}

/**
 * 创建冲击波特效（剑刃风暴/雷暴）
 * - type='shockwave'，duration=0.5s，扩散到 radius
 */
export function createShockwaveEffect(
  x: number,
  y: number,
  radius: number,
  color: string,
  pool?: Pool<Effect>,
): Effect {
  const duration = 0.5;
  const e = pool ? pool.acquire() : ({} as Effect);
  e.instanceId = nextEntityId();
  e.type = 'shockwave';
  e.x = x;
  e.y = y;
  e.remaining = duration;
  e.duration = duration;
  e.alive = true;
  e.color = color;
  e.radius = radius;
  return e;
}

/**
 * 创建合成成功特效
 * - type='combine'，duration=0.6s，金色+青色旋转星光粒子
 */
export function createCombineEffect(x: number, y: number, pool?: Pool<Effect>): Effect {
  const duration = 0.6;
  const colors = ['#FFD700', '#00FFFF', '#7CFC00', '#FFFFFF'];
  const count = 12;
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = 60 + Math.random() * 40;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: duration,
      color: colors[i % colors.length],
    });
  }
  const e = pool ? pool.acquire() : ({} as Effect);
  e.instanceId = nextEntityId();
  e.type = 'combine';
  e.x = x;
  e.y = y;
  e.remaining = duration;
  e.duration = duration;
  e.alive = true;
  e.color = '#FFD700';
  e.particles = particles;
  return e;
}
