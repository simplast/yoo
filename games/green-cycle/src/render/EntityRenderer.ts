// 实体渲染：按顺序绘制所有实体 + 选中塔射程圈
import type { GameState } from '../game/State';
import type { Tower } from '../types';
import { getTowerStat } from '../entities/Tower';
import { drawEnemy, drawTower, drawProjectile, drawEffect } from './PixelArt';

/**
 * 判断塔是否处于任意友方光环加成范围内
 */
function hasAllyAura(state: GameState, tower: Tower): boolean {
  for (const aura of state.towers) {
    if (aura.category !== 'aura' || aura.auraTarget !== 'ally') continue;
    if (aura.auraRadius == null || aura.auraValue == null) continue;
    const dx = aura.x - tower.x;
    const dy = aura.y - tower.y;
    if (dx * dx + dy * dy <= aura.auraRadius * aura.auraRadius) {
      return true;
    }
  }
  return false;
}

/**
 * 绘制所有实体
 * 顺序：enemies → towers → projectiles → hit/death/splash effects → damageText
 */
export function drawEntities(ctx: CanvasRenderingContext2D, state: GameState): void {
  // 敌人
  for (const e of state.enemies) {
    if (!e.alive) continue;
    drawEnemy(ctx, e);
  }

  // 塔（光环范围圈由 drawTower 内部处理）
  for (const t of state.towers) {
    drawTower(ctx, t, hasAllyAura(state, t));
    // 选中塔：主选显示射程圈，所有选中塔高亮边框
    if (state.isTowerSelected(t.instanceId)) {
      const isMain = state.selectedTowerId === t.instanceId;
      drawSelectionRing(ctx, t, isMain);
    }
  }

  // 投射物（按来源塔的 def id 选择 SVG 精灵）
  for (const p of state.projectiles) {
    if (!p.alive) continue;
    const tower = state.getTowerById(p.sourceTowerId);
    drawProjectile(ctx, p, tower?.id);
  }

  // 特效（非 damageText，粒子在实体之上）
  for (const e of state.effects) {
    if (!e.alive) continue;
    if (e.type === 'damageText') continue;
    drawEffect(ctx, e);
  }

  // 伤害文字（最顶层）
  for (const e of state.effects) {
    if (!e.alive) continue;
    if (e.type === 'damageText') drawEffect(ctx, e);
  }
}

/**
 * 画选中塔的射程圈（虚线圆，半径=getTowerStat(t).range）+ 高亮边框
 * - showRange=true 时画射程圈（主选塔）
 * - 多选塔仅画高亮边框，颜色用青色区分
 */
function drawSelectionRing(ctx: CanvasRenderingContext2D, tower: Tower, showRange: boolean): void {
  const stat = getTowerStat(tower);
  const range = stat.range;
  ctx.save();
  // 射程圈（白色虚线）
  if (showRange) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // 高亮边框：主选白色，多选青色
  const half = Math.floor(tower.size / 2);
  ctx.strokeStyle = showRange ? '#FFFFFF' : '#00FFFF';
  ctx.lineWidth = 2;
  ctx.strokeRect(tower.x - half - 2, tower.y - half - 2, tower.size + 4, tower.size + 4);
  ctx.restore();
}
