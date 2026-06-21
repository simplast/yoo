// 调试/测试用辅助脚本（仅开发阶段使用）
// 通过 window.__cheat 暴露一系列便于复现 bug 的快捷函数

import type { Game } from '../game/Game';
import { addExp } from '../entities/HeroTower';

interface CheatApi {
  addGold(amount: number): number;
  setSpeed(speed: number): number;
  buildTower(towerId: string, x: number, y: number): unknown;
  upgradeSelected(times?: number): { id: string; level: number } | null;
  levelTowerTo(
    instanceId: number,
    level: number,
  ): { id: string; level: number; maxLevel: number } | null;
  selectTower(instanceId: number): { selected: number };
  killAllEnemies(): number;
  reproduceBlackscreen(): { tower: { id: string; level: number; exp: number }; selected: number };
}

export function attachCheatHelpers(game: Game): void {
  // debug helper 需要访问 Game 的私有字段，使用 any 简化类型处理
  const g = game as any;
  const w = window as unknown as { __cheat?: CheatApi };

  const api: CheatApi = {
    /** 增加金币 */
    addGold(amount: number) {
      g.state.gold += amount;
      return g.state.gold;
    },

    /** 设置游戏速度（1/2/3） */
    setSpeed(speed: number) {
      g.setSpeed(Math.max(1, Math.min(3, speed)));
      return g.state.speed;
    },

    /** 在指定世界坐标建造指定塔 */
    buildTower(towerId: string, x: number, y: number) {
      g.state.pendingBuildTowerId = towerId;
      g.tryBuild(x, y);
      return g.state.towers.map(
        (t: { id: string; instanceId: number; level: number; x: number; y: number }) => ({
          id: t.id,
          instanceId: t.instanceId,
          level: t.level,
          x: t.x,
          y: t.y,
        }),
      );
    },

    /** 将当前选中塔升级指定次数 */
    upgradeSelected(times = 1) {
      for (let i = 0; i < times; i++) {
        g.upgradeSelected();
      }
      const t = g.state.getTowerById(g.state.selectedTowerId);
      return t ? { id: t.id, level: t.level } : null;
    },

    /** 将指定塔升到目标等级（主要用于成长塔复现） */
    levelTowerTo(instanceId: number, level: number) {
      const t = g.state.getTowerById(instanceId);
      if (!t) return null;
      t.level = Math.min(level, t.maxLevel);
      return { id: t.id, level: t.level, maxLevel: t.maxLevel };
    },

    /** 选中指定 instanceId 的塔 */
    selectTower(instanceId: number) {
      g.state.selectedTowerId = instanceId;
      g.state.selectedTowerIds = [];
      const t = g.state.getTowerById(instanceId);
      if (t) g.showTowerInfo(t);
      return { selected: g.state.selectedTowerId };
    },

    /** 立即清屏：秒杀所有敌人 */
    killAllEnemies() {
      let count = 0;
      for (const e of [...g.state.enemies]) {
        if (e.alive) {
          e.alive = false;
          count++;
        }
      }
      return count;
    },

    /** 一键复现：开始游戏→建剑圣塔→升3级→加速→等待经验→选中查看 */
    reproduceBlackscreen() {
      g.startGame('normal', false);
      api.buildTower('jianfa', 640, 360);
      const t = g.state.towers[0];
      api.selectTower(t.instanceId);
      api.upgradeSelected(2); // 1->3
      g.setSpeed(3);
      // 手动给成长塔灌经验，使其自动升到 6 级以上
      t.exp = 1000;
      addExp(t, 0);
      api.selectTower(t.instanceId);
      return { tower: { id: t.id, level: t.level, exp: t.exp }, selected: g.state.selectedTowerId };
    },
  };

  w.__cheat = api;
}
