// 光环系统：处理敌方光环（减速/加速敌人）
// 友方光环（auraDamage/auraHaste）由 TowerAISystem 内部查询应用
import type { GameState } from '../game/State';
import type { Enemy, Buff, BuffType } from '../types';

/**
 * 查找敌人身上指定类型和来源的 buff
 */
function findBuff(enemy: Enemy, type: BuffType, source: string): Buff | undefined {
  return enemy.buffs.find((b) => b.type === type && b.source === source);
}

export function update(state: GameState, _dt: number): void {
  for (const tower of state.towers) {
    // 只处理光环塔
    if (tower.category !== 'aura') continue;
    // 只处理敌方光环（友方光环由 TowerAISystem 处理）
    if (tower.auraTarget !== 'enemy') continue;
    if (tower.auraType == null || tower.auraRadius == null || tower.auraValue == null) continue;

    const radius2 = tower.auraRadius * tower.auraRadius;
    const source = String(tower.instanceId);
    const auraType = tower.auraType;
    const auraValue = tower.auraValue;

    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.x - tower.x;
      const dy = enemy.y - tower.y;
      if (dx * dx + dy * dy > radius2) continue;

      // 刷新或添加 buff（每次施加刷新 remaining=1.0，持续刷新）
      const existing = findBuff(enemy, auraType, source);
      if (existing) {
        existing.remaining = 1.0;
        existing.value = auraValue;
      } else {
        enemy.buffs.push({
          type: auraType,
          value: auraValue,
          remaining: 1.0,
          source,
        });
      }
    }
  }

  // ===== 预计算友方光环加成缓存（供 TowerAISystem 和渲染层共用）=====
  state.allyAuraCache.clear();

  // 收集所有友方光环塔
  const allyAuras = state.towers.filter(
    (t) => t.category === 'aura' && t.auraTarget === 'ally' && t.auraRadius != null && t.auraValue != null,
  );

  if (allyAuras.length === 0) return; // 无友方光环塔，缓存为空 Map（敌方光环已在前面处理完毕，安全退出）

  for (const tower of state.towers) {
    if (tower.category === 'aura') continue; // 光环塔自身不受加成
    let damageMult = 1;
    let speedMult = 1;
    let hasAura = false;
    for (const aura of allyAuras) {
      const dx = aura.x - tower.x;
      const dy = aura.y - tower.y;
      if (dx * dx + dy * dy > (aura.auraRadius as number) * (aura.auraRadius as number)) continue;
      hasAura = true;
      if (aura.id === 'auraDamage') {
        damageMult *= 1 + (aura.auraValue as number);
      } else if (aura.id === 'auraHaste') {
        speedMult *= 1 + (aura.auraValue as number);
      }
    }
    if (hasAura) {
      state.allyAuraCache.set(tower.instanceId, { damageMult, speedMult, hasAura });
    }
  }
}
