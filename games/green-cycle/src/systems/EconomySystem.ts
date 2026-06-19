// 经济系统：技能 CD、全局减速、压力、失败/Boss 超时判定
import type { GameState } from '../game/State';

export function update(state: GameState, dt: number): void {
  // ===== 更新全局技能 CD =====
  if (state.skillBlastCd > 0) {
    state.skillBlastCd = Math.max(0, state.skillBlastCd - dt);
  }
  if (state.skillSlowCd > 0) {
    state.skillSlowCd = Math.max(0, state.skillSlowCd - dt);
  }
  if (state.skillSummonCd > 0) {
    state.skillSummonCd = Math.max(0, state.skillSummonCd - dt);
  }

  // ===== 全局减速计时 =====
  if (state.globalSlowTimer > 0) {
    state.globalSlowTimer = Math.max(0, state.globalSlowTimer - dt);
  }

  // ===== 更新压力 =====
  state.updatePressure();

  // ===== 失败判定（压力 >= 100%）=====
  if (state.isLost) {
    state.phase = 'lost';
    return;
  }

  // ===== Boss 超时判定 =====
  if (state.bossAlive && state.bossTimer > 0) {
    state.bossTimer -= dt;
    if (state.bossTimer <= 0) {
      state.bossTimer = 0;
      state.phase = 'lost';
    }
  }
}
