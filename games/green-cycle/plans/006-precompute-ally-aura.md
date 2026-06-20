# Plan 006: 预计算友方光环加成，消除每帧 O(towers²) 重复扫描

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bc95bc..HEAD -- src/systems/TowerAISystem.ts src/render/EntityRenderer.ts src/game/State.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 004（测试基线兜底）
- **Category**: perf
- **Planned at**: commit `7bc95bc`, 2026-06-20

## Why this matters

友方光环加成（auraDamage 加攻击、auraHaste 加攻速）目前在 `TowerAISystem` 中每塔每帧遍历所有塔计算一次（O(towers²)），`EntityRenderer` 渲染时又遍历一次判断是否显示光环高亮。两处重复计算且复杂度随塔数平方增长。虽然当前塔数不多（人口上限 8-22），但可预计算一次"哪些塔在哪个友方光环内"，供系统和渲染共用，消除重复并降低复杂度。

## Current state

`src/systems/TowerAISystem.ts:26-45` — 每塔每帧遍历所有光环塔：

```ts
function getAllyAuraBonus(
  state: GameState,
  tower: Tower,
): { damageMult: number; speedMult: number } {
  let damageMult = 1;
  let speedMult = 1;
  for (const aura of state.towers) {
    if (aura.category !== 'aura' || aura.auraTarget !== 'ally') continue;
    if (aura.auraRadius == null || aura.auraValue == null) continue;
    const dx = aura.x - tower.x;
    const dy = aura.y - tower.y;
    if (dx * dx + dy * dy > aura.auraRadius * aura.auraRadius) continue;
    if (aura.id === 'auraDamage') {
      damageMult *= 1 + aura.auraValue;
    } else if (aura.id === 'auraHaste') {
      speedMult *= 1 + aura.auraValue;
    }
  }
  return { damageMult, speedMult };
}
```

在 `update` 中每塔调用一次（第 140 行）：

```ts
const auraBonus = getAllyAuraBonus(state, tower);
```

`src/render/EntityRenderer.ts:10-21` — 渲染层重复遍历：

```ts
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
```

在 `drawEntities` 中每塔调用一次（第 39 行）：

```ts
drawTower(ctx, t, hasAllyAura(state, t));
```

### 项目约定

- 系统签名：`update(state: GameState, dt: number): void`，纯函数，不持有跨帧状态。
- 渲染器只读 `state`，不修改。
- `AuraSystem` 已处理敌方光环（每帧刷新 buff），友方光环由 `TowerAISystem` 内联查询。
- 系统调度顺序：Aura → Movement → TowerAI → ... → 渲染。AuraSystem 在 TowerAISystem 之前运行。

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npm run typecheck`    | exit 0              |
| Tests     | `npm test`             | all pass            |
| Build     | `npm run build`        | exit 0              |

## Scope

**In scope**:
- `src/game/State.ts` — 新增 `allyAuraCache` 缓存字段
- `src/systems/AuraSystem.ts` — 在 `update` 中预计算友方光环缓存
- `src/systems/TowerAISystem.ts` — 改用缓存替代内联遍历
- `src/render/EntityRenderer.ts` — 改用缓存替代 `hasAllyAura`

**Out of scope**:
- `src/types.ts` — 不改（缓存是 State 内部字段）
- 敌方光环逻辑（已在 AuraSystem 中正确实现）
- 光环塔的数值调整

## Steps

### Step 1: 在 GameState 新增友方光环缓存字段

打开 `src/game/State.ts`，在 `buildCells` 字段附近（约第 67 行后）新增：

```ts
  // ===== 友方光环缓存（每帧由 AuraSystem 预计算）=====
  /** 每座塔的友方光环加成：instanceId → { damageMult, speedMult, hasAura } */
  allyAuraCache: Map<number, { damageMult: number; speedMult: number; hasAura: boolean }> = new Map();
```

**Verify**: `npm run typecheck` → exit 0

### Step 2: AuraSystem 中预计算友方光环缓存

打开 `src/systems/AuraSystem.ts`，在 `update` 函数末尾（敌方光环处理之后），新增友方光环预计算：

```ts
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
```

注意：AuraSystem 在 TowerAISystem 之前运行（Game.ts:171-173），所以缓存先于消费方更新。

**Verify**: `npm run typecheck` → exit 0

### Step 3: TowerAISystem 改用缓存

打开 `src/systems/TowerAISystem.ts`，删除 `getAllyAuraBonus` 函数（第 26-45 行），在 `update` 中替换调用：

将第 140 行：

```ts
    const auraBonus = getAllyAuraBonus(state, tower);
```

改为：

```ts
    const auraBonus = state.allyAuraCache.get(tower.instanceId) ?? { damageMult: 1, speedMult: 1 };
```

**Verify**: `npm run typecheck` → exit 0

### Step 4: EntityRenderer 改用缓存

打开 `src/render/EntityRenderer.ts`，删除 `hasAllyAura` 函数（第 10-21 行），在 `drawEntities` 中替换调用：

将第 39 行：

```ts
    drawTower(ctx, t, hasAllyAura(state, t));
```

改为：

```ts
    drawTower(ctx, t, state.allyAuraCache.has(t.instanceId));
```

**Verify**: `npm run typecheck` → exit 0

### Step 5: 确认无残留引用

**Verify**:
- `grep -rn "getAllyAuraBonus" src/` → 无匹配
- `grep -rn "hasAllyAura" src/` → 无匹配

### Step 6: 全量验证

**Verify**:
- `npm run typecheck` → exit 0
- `npm test` → all pass
- `npm run build` → exit 0

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0
- [ ] `src/systems/TowerAISystem.ts` 中不再有 `getAllyAuraBonus` 函数
- [ ] `src/render/EntityRenderer.ts` 中不再有 `hasAllyAura` 函数
- [ ] `src/game/State.ts` 有 `allyAuraCache` 字段
- [ ] `src/systems/AuraSystem.ts` 在 `update` 中预计算 `allyAuraCache`
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `AuraSystem.ts` 的 `update` 签名或调度顺序与上述不符（如果 AuraSystem 不在 TowerAISystem 之前运行，缓存会过期）。
- `allyAuraCache` 的类型与 TowerAISystem/EntityRenderer 的消费方式不匹配。
- 光环塔自身是否应受友方光环加成——当前假设不受（`if (tower.category === 'aura') continue`），如果设计要求光环塔也受加成，需同时修改 AuraSystem 预计算块和 TowerAISystem 的 `if (tower.category === 'aura') continue` 跳过逻辑（两处需同步）。

## Maintenance notes

- 缓存每帧清空重建，因为塔可能被建造/出售/合成，位置可能变化。如果未来塔位置变为静态（不可移动），可改为增量更新。
- `allyAuraCache` 只缓存有光环加成的塔（无加成的塔不在 Map 中，消费方用 `??` 默认值处理）。这避免了存储大量 `hasAura: false` 条目。
- 如果未来新增其他友方光环类型（如减伤光环），在 AuraSystem 预计算块中扩展 `damageMult`/`speedMult` 逻辑，或扩展缓存结构。
