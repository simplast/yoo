// 特效系统：更新伤害飘字和粒子特效
import type { GameState } from '../game/State';

// 粒子重力加速度（像素/秒²）
const PARTICLE_GRAVITY = 200;
// 伤害飘字重力加速度（像素/秒²，产生下落感）
const TEXT_GRAVITY = 40;

export function update(state: GameState, dt: number): void {
  for (const effect of state.effects) {
    if (!effect.alive) continue;

    effect.remaining -= dt;

    if (effect.type === 'damageText') {
      // 伤害飘字：上浮后下落
      if (effect.vy != null) {
        effect.y += effect.vy * dt;
        effect.vy += TEXT_GRAVITY * dt;
      }
    } else if (effect.particles) {
      // 粒子特效：位置更新 + 重力
      for (const p of effect.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += PARTICLE_GRAVITY * dt;
        p.life -= dt;
      }
    }

    // 剩余时间耗尽则标记死亡
    if (effect.remaining <= 0) {
      effect.alive = false;
    }
  }

  // 清理已死亡/过期的特效（反向遍历，原地删除，release 到池）
  for (let i = state.effects.length - 1; i >= 0; i--) {
    const e = state.effects[i];
    if (!e.alive) {
      state.effects.splice(i, 1);
      state.effectPool.release(e);
    }
  }
}
