# Plan 007: 技能系统与投射物溅射接入 Quadtree

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bc95bc..HEAD -- src/systems/SkillSystem.ts src/systems/CombatSystem.ts src/systems/TowerAISystem.ts src/utils/Quadtree.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 004（测试基线兜底），006（光环缓存完成后 TowerAISystem 已稳定）
- **Category**: perf
- **Planned at**: commit `7bc95bc`, 2026-06-20

## Why this matters

`TowerAISystem` 已用 Quadtree 加速索敌，但 `SkillSystem` 的三个范围查询函数（`findStrongestInRange`/`findAllInRange`/`findNearestExcept`）和 `CombatSystem` 的溅射命中仍线性遍历全部敌人。在无尽模式后期（同屏 20 敌人 + 多座成长塔），每帧每塔多次全量扫描成为性能热点。将 Quadtree 实例提升为帧级共享，让技能系统和战斗系统复用，消除重复线性扫描。

## Current state

`src/systems/TowerAISystem.ts:122-129` — 每帧新建 Quadtree：

```ts
export function update(state: GameState, dt: number): void {
  // 构建敌人四叉树，加速范围查询
  const qt = new Quadtree({ x: 0, y: 0, w: CONFIG.WORLD_WIDTH, h: CONFIG.WORLD_HEIGHT });
  for (const e of state.enemies) {
    if (e.alive) {
      qt.insert({ x: e.x, y: e.y, ref: e });
    }
  }
```

`src/systems/SkillSystem.ts:48-100` — 三个线性遍历函数：

```ts
function findStrongestInRange(state: GameState, tower: Tower, range: number): Enemy | undefined {
  const range2 = range * range;
  let best: Enemy | undefined;
  for (const e of state.enemies) {  // ← 线性遍历
    if (!e.alive) continue;
    // ...
  }
  return best;
}

function findAllInRange(state: GameState, tower: Tower, range: number): Enemy[] {
  const range2 = range * range;
  const result: Enemy[] = [];
  for (const e of state.enemies) {  // ← 线性遍历
    // ...
  }
  return result;
}

function findNearestExcept(
  state: GameState, x: number, y: number, range2: number, excluded: Set<number>,
): Enemy | undefined {
  // ...
  for (const e of state.enemies) {  // ← 线性遍历
    // ...
  }
  return best;
}
```

`src/systems/CombatSystem.ts:72-90` — 投射物目标死亡时溅射线性遍历：

```ts
      if (proj.splashRadius > 0) {
        const r2 = proj.splashRadius * proj.splashRadius;
        for (const e of state.enemies) {  // ← 线性遍历
          if (!e.alive) continue;
          const dx = e.x - proj.x;
          const dy = e.y - proj.y;
          if (dx * dx + dy * dy <= r2) {
            applyDamage(state, e, proj.damage * 0.6, ...);
          }
        }
```

`src/systems/CombatSystem.ts:117-134` — 投射物命中时溅射线性遍历（同上模式）。

### 系统调度顺序（Game.ts:170-177）

```
WaveSystem → AuraSystem → MovementSystem → TowerAISystem → CombatSystem → SkillSystem → EffectSystem → EconomySystem
```

关键：TowerAISystem 在 CombatSystem 和 SkillSystem 之前运行，且 TowerAISystem 已构建 Quadtree。如果将 Quadtree 提升到 State 上共享，CombatSystem 和 SkillSystem 可复用。

### Quadtree API（src/utils/Quadtree.ts）

```ts
qt.insert({ x: number, y: number, ref: any }): void
qt.retrieve(x: number, y: number, radius: number): any[]  // 返回圆形范围内所有 ref
qt.clear(): void
```

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npm run typecheck`    | exit 0              |
| Tests     | `npm test`             | all pass            |
| Build     | `npm run build`        | exit 0              |

## Scope

**In scope**:
- `src/game/State.ts` — 新增 `enemyQuadtree` 共享字段
- `src/systems/TowerAISystem.ts` — 改为写入 `state.enemyQuadtree` 而非局部变量
- `src/systems/SkillSystem.ts` — 三个查询函数改用 `state.enemyQuadtree.retrieve`
- `src/systems/CombatSystem.ts` — 溅射命中改用 `state.enemyQuadtree.retrieve`

**Out of scope**:
- `src/utils/Quadtree.ts` — 不改（API 已满足需求）
- `src/systems/AuraSystem.ts` — 敌方光环遍历塔而非敌人，且光环塔数量少，不需要 Quadtree
- 伤害计算逻辑、技能效果数值

## Steps

### Step 1: 在 GameState 新增共享 Quadtree 字段

打开 `src/game/State.ts`，在 `allyAuraCache` 字段附近（或 `enemies` 字段附近），新增：

```ts
  // ===== 帧级共享四叉树（每帧由 TowerAISystem 构建，供 Combat/Skill 复用）=====
  enemyQuadtree: Quadtree = new Quadtree({ x: 0, y: 0, w: CONFIG.WORLD_WIDTH, h: CONFIG.WORLD_HEIGHT });
```

需要在文件顶部 import：

```ts
import { Quadtree } from '../utils/Quadtree';
```

**Verify**: `npm run typecheck` → exit 0

### Step 2: TowerAISystem 改为写入共享 Quadtree

打开 `src/systems/TowerAISystem.ts`，将 `update` 开头的 Quadtree 构建改为清空复用：

将第 123-129 行：

```ts
  const qt = new Quadtree({ x: 0, y: 0, w: CONFIG.WORLD_WIDTH, h: CONFIG.WORLD_HEIGHT });
  for (const e of state.enemies) {
    if (e.alive) {
      qt.insert({ x: e.x, y: e.y, ref: e });
    }
  }
```

改为：

```ts
  // 清空并重建共享四叉树（供本系统 + CombatSystem + SkillSystem 复用）
  state.enemyQuadtree.clear();
  for (const e of state.enemies) {
    if (e.alive) {
      state.enemyQuadtree.insert({ x: e.x, y: e.y, ref: e });
    }
  }
  const qt = state.enemyQuadtree;
```

保留 `const qt = state.enemyQuadtree` 别名，使后续 `selectTarget(qt, ...)` 调用不变。

**Verify**: `npm run typecheck` → exit 0

### Step 3: SkillSystem 改用 Quadtree 查询

打开 `src/systems/SkillSystem.ts`，修改三个查询函数。

**3a.** `findStrongestInRange`（第 48-59 行）改为：

```ts
function findStrongestInRange(state: GameState, tower: Tower, range: number): Enemy | undefined {
  const candidates = state.enemyQuadtree.retrieve(tower.x, tower.y, range);
  let best: Enemy | undefined;
  for (const e of candidates) {
    const enemy = e as Enemy;
    if (!enemy.alive) continue;
    // retrieve 已做圆形过滤，但仍需防御性检查 alive
    if (!best || enemy.hp > best.hp) best = enemy;
  }
  return best;
}
```

**3b.** `findAllInRange`（第 64-74 行）改为：

```ts
function findAllInRange(state: GameState, tower: Tower, range: number): Enemy[] {
  const candidates = state.enemyQuadtree.retrieve(tower.x, tower.y, range);
  const result: Enemy[] = [];
  for (const e of candidates) {
    const enemy = e as Enemy;
    if (!enemy.alive) continue;
    result.push(enemy);
  }
  return result;
}
```

**3c.** `findNearestExcept`（第 79-100 行）改为：

```ts
function findNearestExcept(
  state: GameState,
  x: number,
  y: number,
  range2: number,
  excluded: Set<number>,
): Enemy | undefined {
  const radius = Math.sqrt(range2);
  const candidates = state.enemyQuadtree.retrieve(x, y, radius);
  let best: Enemy | undefined;
  let bestDist = Infinity;
  for (const e of candidates) {
    const enemy = e as Enemy;
    if (!enemy.alive || excluded.has(enemy.instanceId)) continue;
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range2) continue; // retrieve 用圆形相交，需精确过滤
    if (d2 < bestDist) {
      bestDist = d2;
      best = enemy;
    }
  }
  return best;
}
```

注意：`retrieve` 已做精确圆形过滤（Quadtree.ts 第 101 行 `if (dx * dx + dy * dy <= r2)`），`if (d2 > range2) continue;` 是防御性冗余（无害）。与 Step 4a 的溅射保持一致——两处都保留精确过滤作为防御性检查。

**Verify**: `npm run typecheck` → exit 0

### Step 4: CombatSystem 溅射改用 Quadtree

打开 `src/systems/CombatSystem.ts`，修改两处溅射遍历。

**4a.** 目标死亡时溅射（第 72-92 行），将线性遍历改为 `retrieve`。注意：保留第 91 行的 `state.addEffect(createSplashEffect(...))` 行（在 for 循环之后，不在替换范围内）。

```ts
      if (proj.splashRadius > 0) {
        const r2 = proj.splashRadius * proj.splashRadius;
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const dx = e.x - proj.x;
          const dy = e.y - proj.y;
          if (dx * dx + dy * dy <= r2) {
            applyDamage(state, e, proj.damage * 0.6, ...);
          }
        }
```

改为：

```ts
      if (proj.splashRadius > 0) {
        const splashEnemies = state.enemyQuadtree.retrieve(proj.x, proj.y, proj.splashRadius);
        for (const e of splashEnemies) {
          const enemy = e as Enemy;
          if (!enemy.alive) continue;
          applyDamage(state, enemy, proj.damage * 0.6, proj.attackType, proj.sourceTowerId, proj.debuff?.type, proj.debuff?.value, proj.debuff?.duration);
        }
```

**4b.** 命中时溅射（第 117-134 行），将线性遍历改为同样的 `retrieve` 模式：

```ts
        const splashEnemies = state.enemyQuadtree.retrieve(target.x, target.y, proj.splashRadius);
        for (const e of splashEnemies) {
          const enemy = e as Enemy;
          if (!enemy.alive || enemy === target) continue;
          applyDamage(state, enemy, proj.damage * 0.6, proj.attackType, proj.sourceTowerId, proj.debuff?.type, proj.debuff?.value, proj.debuff?.duration);
        }
```

注意：`retrieve` 已做圆形范围过滤，不需要再手动检查 `dx*dx + dy*dy <= r2`。但仍需检查 `alive` 和排除主目标。

**Verify**: `npm run typecheck` → exit 0

### Step 5: 全量验证

**Verify**:
- `npm run typecheck` → exit 0
- `npm test` → all pass
- `npm run build` → exit 0

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0
- [ ] `src/game/State.ts` 有 `enemyQuadtree` 字段
- [ ] `src/systems/TowerAISystem.ts` 使用 `state.enemyQuadtree.clear()` + 复用，不再 `new Quadtree`
- [ ] `src/systems/SkillSystem.ts` 三个查询函数使用 `state.enemyQuadtree.retrieve`
- [ ] `src/systems/CombatSystem.ts` 两处溅射使用 `state.enemyQuadtree.retrieve`
- [ ] `grep -n "for (const e of state.enemies)" src/systems/SkillSystem.ts` → 无匹配
- [ ] `grep -n "for (const e of state.enemies)" src/systems/CombatSystem.ts` → 无匹配（或仅剩非溅射遍历）
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `Quadtree.retrieve` 的返回值类型或过滤精度与预期不符（retrieve 用圆形相交，可能返回略超范围的候选——需在消费方精确过滤）。
- `SkillSystem` 的查询函数在 `update` 之外被调用（如被 `TowerAISystem` 调用），此时 `state.enemyQuadtree` 可能尚未构建——需确认调用时机。
- `CombatSystem` 中有除溅射外的其他敌人遍历不应改动（如投射物移动循环——那是遍历投射物不是敌人）。
- 性能未提升或反而下降（Quadtree retrieve 有开销，敌人很少时可能不如线性——如果敌人始终 < 10，线性可能更快，此时报告并考虑回退）。

## Maintenance notes

- `enemyQuadtree` 在 TowerAISystem 中构建，在 CombatSystem 和 SkillSystem 中消费。系统调度顺序保证 TowerAISystem 先运行。如果未来调整调度顺序，需确保 Quadtree 构建在消费之前。
- Quadtree 的 `clear()` 不释放对象引用（只清空数组），复用同一实例减少 GC。如果敌人数量极大（>1000），可能需要调整 `maxObjects`/`maxLevels` 参数。
- `retrieve` 返回 `any[]`（QuadtreeItem.ref），消费方需 `as Enemy` 转型。这是 Quadtree 的既有设计，不改。
- 如果未来敌人有飞行/地面区分需要不同路径，Quadtree 可能需要分层——本计划不涉及。
