// 波次系统：管理波次启动、敌人生成、波次结算
import type { GameState } from '../game/State';
import type { WaveDef } from '../types';
import { WAVES } from '../data/waves';
import { CONFIG } from '../config';
import { createEnemy } from '../entities/Enemy';
import { audio } from '../audio/Audio';

/**
 * 根据当前波次生成无尽模式波次模板
 * - 超过 TOTAL_WAVES 后循环使用 WAVES，每循环一次强度递增
 */
function generateEndlessWave(waveIndex: number): WaveDef {
  const total = CONFIG.TOTAL_WAVES;
  const cycle = Math.floor((waveIndex - 1) / total); // 0,1,2...
  const templateIndex = ((waveIndex - 1) % total) + 1;
  const template = WAVES[templateIndex - 1];

  const countMul = 1 + CONFIG.ENDLESS_COUNT_SCALE * cycle;
  const rewardMul = 1 + CONFIG.ENDLESS_REWARD_SCALE * cycle;

  return {
    ...template,
    index: waveIndex,
    spawns: template.spawns.map((s) => ({
      ...s,
      count: Math.max(1, Math.floor(s.count * countMul)),
      interval: Math.max(0.3, s.interval / (1 + cycle * 0.1)),
    })),
    rewardGold: Math.floor(template.rewardGold * rewardMul),
    rewardWood: Math.floor(template.rewardWood * rewardMul),
    hint: `无尽 ${waveIndex} 波 — ${template.hint}`,
  };
}

/**
 * 启动下一波：waveIndex++，构建 spawnQueue，设置 Boss 计时
 */
function startNextWave(state: GameState): void {
  state.waveIndex++;
  const wave =
    state.endless && state.waveIndex > CONFIG.TOTAL_WAVES
      ? generateEndlessWave(state.waveIndex)
      : WAVES[state.waveIndex - 1];
  if (!wave) return;

  state.currentWave = wave;

  // 构建 spawnQueue：每个 spawn 生成 count 个出生任务
  state.spawnQueue = [];
  for (const spawn of wave.spawns) {
    for (let i = 0; i < spawn.count; i++) {
      state.spawnQueue.push({
        enemyId: spawn.enemyId,
        spawnAt: spawn.startDelay + i * spawn.interval,
        spawned: false,
      });
    }
  }

  state.waveActive = true;
  state.waveStartTime = state.gameTime;

  // 记录波次开始时 enemies 是否为空（用于 PF 判定）
  state.waveStartEnemiesEmpty = state.enemies.length === 0;

  // Boss 波设置击杀限时
  if (wave.isBoss) {
    state.bossTimer = wave.bossTimer ?? 0;
    state.bossAlive = true;
    audio.playBossWarn();
  }
}

/**
 * 结算当前波次：发放奖励、PF 判定、设置下一波倒计时
 */
function endWave(state: GameState): void {
  const wave = state.currentWave;
  if (!wave) return;

  // 发放波次奖励
  state.gold += wave.rewardGold;
  state.wood += wave.rewardWood;

  // PF 判定：波次开始时 enemies 为空则 PF
  if (state.waveStartEnemiesEmpty) {
    state.pf++;
    state.perfectStreak++;
    // PF 连胜奖励：达到 5 次额外金币，重置连胜计数但保留 pf
    if (state.perfectStreak >= 5) {
      state.gold += CONFIG.PF_PERFECT_BONUS;
      state.perfectStreak = 0;
    }
  } else {
    state.perfectStreak = 0;
  }

  // Boss 波结束
  if (wave.isBoss) {
    state.bossAlive = false;
    state.bossTimer = 0;
  }

  state.waveActive = false;
  state.currentWave = null;
  state.spawnQueue = [];

  // 胜利判定（无尽模式继续）
  if (state.waveIndex >= CONFIG.TOTAL_WAVES && !state.endless) {
    state.phase = 'won';
    return;
  }

  // 设置下一波倒计时
  state.waveTimer = CONFIG.WAVE_INTERVAL;
}

export function update(state: GameState, dt: number): void {
  // 非战斗状态不处理
  if (state.phase !== 'battling') return;

  if (!state.waveActive) {
    // 波次间隔倒计时
    if (state.waveTimer > 0) {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        state.waveTimer = 0;
        startNextWave(state);
      }
    }
    return;
  }

  // 波次进行中：按 spawnAt 生成敌人
  const elapsed = state.gameTime - state.waveStartTime;
  for (const task of state.spawnQueue) {
    if (!task.spawned && task.spawnAt <= elapsed) {
      const enemy = createEnemy(task.enemyId, state.path, state.difficulty, state.enemyPool);
      // 无尽模式超过 50 波后应用额外血量加成
      if (state.endless && state.waveIndex > CONFIG.TOTAL_WAVES) {
        const cycle = Math.floor((state.waveIndex - 1) / CONFIG.TOTAL_WAVES);
        const hpMul = 1 + CONFIG.ENDLESS_HP_SCALE * cycle;
        enemy.hp *= hpMul;
        enemy.maxHp *= hpMul;
      }
      state.addEnemy(enemy);
      task.spawned = true;
    }
  }

  // 判断波次结束
  const allSpawned = state.spawnQueue.every((t) => t.spawned);
  if (!allSpawned) return;

  const wave = state.currentWave;
  if (!wave) return;

  if (wave.isBoss) {
    // Boss 波：需要所有敌人被清除才算结束
    if (state.enemies.length === 0) {
      endWave(state);
    }
  } else {
    // 非 Boss 波：全部生成即可结束
    endWave(state);
  }
}
