// 移动系统：更新敌人位置、处理 buff/减速
import type { GameState } from '../game/State';
import { clamp } from '../utils/MathUtil';

export function update(state: GameState, dt: number): void {
  const path = state.path;
  const totalLength = path.totalLength;

  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;

    // ===== 计算速度修正 =====
    let slowTotal = 0;
    let hasteTotal = 0;
    let stopped = false;

    for (const buff of enemy.buffs) {
      switch (buff.type) {
        case 'slow':
          slowTotal += buff.value;
          break;
        case 'haste':
          hasteTotal += buff.value;
          break;
        case 'freeze':
        case 'stun':
          stopped = true;
          break;
      }
    }

    // 全局减速技能：额外减速 0.5
    if (state.globalSlowTimer > 0) {
      slowTotal += 0.5;
    }

    // 减速叠加上限 0.8
    slowTotal = Math.min(slowTotal, 0.8);

    let speed: number;
    if (stopped) {
      // 冰冻/眩晕：完全停止
      speed = 0;
    } else {
      speed = enemy.speed * (1 - slowTotal) * (1 + hasteTotal);
      speed = clamp(speed, 0, enemy.speed * 2);
    }

    // ===== 更新路径进度 =====
    if (speed > 0 && totalLength > 0) {
      enemy.pathProgress += (speed * dt) / totalLength;
      if (enemy.pathProgress >= 1) {
        enemy.pathProgress %= 1;
      }
      const pos = path.getPosition(enemy.pathProgress);
      enemy.x = pos.x;
      enemy.y = pos.y;
    }

    // ===== 更新 buff 剩余时间（反向遍历删除）=====
    for (let i = enemy.buffs.length - 1; i >= 0; i--) {
      const buff = enemy.buffs[i];
      buff.remaining -= dt;
      if (buff.remaining <= 0) {
        enemy.buffs.splice(i, 1);
      }
    }

    // ===== 更新受击闪烁 =====
    if (enemy.hitFlash > 0) {
      enemy.hitFlash -= dt;
      if (enemy.hitFlash < 0) enemy.hitFlash = 0;
    }
  }
}
