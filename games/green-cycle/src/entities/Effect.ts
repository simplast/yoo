// 特效工厂：创建各种视觉特效（伤害文字、命中、死亡、建造、升级、溅射）
// 特效包含粒子系统，由渲染层按 remaining/duration 插值播放

import type { Effect, Vec2 } from '../types';
import { nextEntityId } from './Entity';

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
export function createDamageText(x: number, y: number, text: string, color: string): Effect {
  return {
    instanceId: nextEntityId(),
    type: 'damageText',
    x,
    y,
    remaining: 0.8,
    duration: 0.8,
    alive: true,
    text,
    color,
    vy: -30,
  };
}

/**
 * 创建命中特效
 * - type='hit'，duration=0.2s，4-6 个随机方向小粒子
 */
export function createHitEffect(x: number, y: number, color: string): Effect {
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
  return {
    instanceId: nextEntityId(),
    type: 'hit',
    x,
    y,
    remaining: duration,
    duration,
    alive: true,
    particles,
  };
}

/**
 * 创建死亡特效
 * - type='death'，duration=0.5s，8 个向外扩散粒子
 */
export function createDeathEffect(x: number, y: number, color: string): Effect {
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
  return {
    instanceId: nextEntityId(),
    type: 'death',
    x,
    y,
    remaining: duration,
    duration,
    alive: true,
    particles,
  };
}

/**
 * 创建建造特效
 * - type='build'，duration=0.4s，金色向上粒子
 */
export function createBuildEffect(x: number, y: number): Effect {
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
  return {
    instanceId: nextEntityId(),
    type: 'build',
    x,
    y,
    remaining: duration,
    duration,
    alive: true,
    particles,
  };
}

/**
 * 创建升级特效
 * - type='upgrade'，duration=0.5s，金色光环粒子（环形扩散）
 */
export function createUpgradeEffect(x: number, y: number): Effect {
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
  return {
    instanceId: nextEntityId(),
    type: 'upgrade',
    x,
    y,
    remaining: duration,
    duration,
    alive: true,
    particles,
  };
}

/**
 * 创建溅射特效
 * - type='splash'，duration=0.3s，圆形扩散
 * - 粒子在 duration 内扩散到 radius 距离
 */
export function createSplashEffect(x: number, y: number, radius: number, color: string): Effect {
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
  return {
    instanceId: nextEntityId(),
    type: 'splash',
    x,
    y,
    remaining: duration,
    duration,
    alive: true,
    particles,
  };
}

// ===== 技能特效 =====

/**
 * 创建闪电链特效
 * - type='lightning'，duration=0.4s
 * - points 为折线顶点序列（塔→敌人1→敌人2...）
 */
export function createLightningEffect(points: Vec2[], color: string): Effect {
  const duration = 0.4;
  return {
    instanceId: nextEntityId(),
    type: 'lightning',
    x: points[0]?.x ?? 0,
    y: points[0]?.y ?? 0,
    remaining: duration,
    duration,
    alive: true,
    color,
    points,
  };
}

/**
 * 创建审判之光特效（单体闪电从天而降）
 * - type='lightning'，单段竖直折线
 */
export function createJudgeEffect(x: number, y: number, color: string): Effect {
  const duration = 0.4;
  return {
    instanceId: nextEntityId(),
    type: 'lightning',
    x,
    y,
    remaining: duration,
    duration,
    alive: true,
    color,
    points: [
      { x, y: y - 60 },
      { x, y },
    ],
  };
}

/**
 * 创建冲击波特效（剑刃风暴/雷暴）
 * - type='shockwave'，duration=0.5s，扩散到 radius
 */
export function createShockwaveEffect(x: number, y: number, radius: number, color: string): Effect {
  const duration = 0.5;
  return {
    instanceId: nextEntityId(),
    type: 'shockwave',
    x,
    y,
    remaining: duration,
    duration,
    alive: true,
    color,
    radius,
  };
}

/**
 * 创建合成成功特效
 * - type='combine'，duration=0.6s，金色+青色旋转星光粒子
 */
export function createCombineEffect(x: number, y: number): Effect {
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
  return {
    instanceId: nextEntityId(),
    type: 'combine',
    x,
    y,
    remaining: duration,
    duration,
    alive: true,
    color: '#FFD700',
    particles,
  };
}
