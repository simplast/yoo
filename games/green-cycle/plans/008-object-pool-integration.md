# Plan 008: 接入对象池减少 GC 压力

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bc95bc..HEAD -- src/utils/Pool.ts src/entities/Enemy.ts src/entities/Projectile.ts src/entities/Effect.ts src/systems/CombatSystem.ts src/systems/EffectSystem.ts src/systems/WaveSystem.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED
- **Depends on**: 004（测试基线兜底），007（Quadtree 共享完成后实体生命周期稳定）
- **Category**: perf
- **Planned at**: commit `7bc95bc`, 2026-06-20

## Why this matters

项目已有 `Pool<T>` 泛型对象池和 `Enemy.resetEnemy` 重置函数，但从未接入。敌人、投射物、特效每波 new + 死亡后 splice，无尽模式长时间游玩时 GC 压力持续累积。接入对象池可复用对象，减少分配/回收开销。但此改动涉及实体生命周期管理，风险中等，需测试基线兜底。

## Current state

`src/utils/Pool.ts` — 完整的泛型对象池，有 `acquire`/`release`/`releaseAll`/`activeCount`/`freeCount`，但全项目无调用方。

`src/entities/Enemy.ts:56-67` — `resetEnemy` 已实现但无调用方：

```ts
export function resetEnemy(e: Enemy): void {
  e.alive = false;
  e.hp = 0;
  e.maxHp = 0;
  e.pathProgress = 0;
  e.speed = 0;
  e.x = 0;
  e.y = 0;
  e.buffs.length = 0;
  e.auraFlags = 0;
  e.hitFlash = 0;
}
```

`src/entities/Effect.ts` — 特效工厂每次 `new Effect`，`EffectSystem` 死亡后 splice。

`src/entities/Projectile.ts` — 投射物工厂每次 `new Projectile`，`CombatSystem` 死亡后 splice。

### 当前实体生命周期

| 实体 | 创建 | 死亡 | 清理 |
|------|------|------|------|
| Enemy | `WaveSystem.update` → `createEnemy` → `state.addEnemy` | `CombatSystem.applyDamage` 设 `alive=false` | `CombatSystem.update` 末尾反向 splice |
| Projectile | `TowerAISystem.update` → `createProjectile` → `state.addProjectile` | `CombatSystem.update` 设 `alive=false` | `CombatSystem.update` 末尾反向 splice |
| Effect | 各系统 → `createXxxEffect` → `state.addEffect` | `EffectSystem.update` 设 `alive=false` | `EffectSystem.update` 末尾反向 splice |

### 项目约定

- 实体有 `instanceId`（由 `nextEntityId()` 分配），对象池复用时需重新分配 id。
- 实体有 `alive: boolean` 标记，死亡后不立即删除，由所属系统在 update 末尾批量清理。
- `resetEnemy` 已存在但只重置运行时字段，不重置定义字段（`...def` 展开的字段）——复用时需重新展开 def。

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npm run typecheck`    | exit 0              |
| Tests     | `npm test`             | all pass            |
| Build     | `npm run build`        | exit 0              |

## Scope

**In scope**:
- `src/game/State.ts` — 新增对象池实例字段
- `src/entities/Enemy.ts` — `createEnemy` 改为从池获取，新增 `releaseEnemy`
- `src/entities/Projectile.ts` — `createProjectile` 改为从池获取，新增 `releaseProjectile`
- `src/entities/Effect.ts` — 特效工厂改为从池获取，新增 `releaseEffect`
- `src/systems/CombatSystem.ts` — 死亡清理改为 release 到池
- `src/systems/EffectSystem.ts` — 死亡清理改为 release 到池
- `src/game/Game.ts` — `startGame` 时 `releaseAll` 清空池

**Out of scope**:
- `src/utils/Pool.ts` — 不改（API 已满足）
- `src/types.ts` — 不改
- 实体的战斗逻辑、属性数值

## Steps

### Step 1: 在 GameState 新增对象池字段

打开 `src/game/State.ts`，在文件顶部新增 import（注意：`Enemy` 当前仅作为 type import，需改为值 import 以使用 `ENEMIES` 和 `resetEnemy`）：

```ts
import { Pool } from '../utils/Pool';
import { ENEMIES } from '../data/enemies';
import { resetEnemy } from '../entities/Enemy';
```

在 `enemyQuadtree` 字段附近新增对象池字段：

```ts
  // ===== 对象池（减少 GC 压力）=====
  enemyPool: Pool<Enemy>;
  projectilePool: Pool<Projectile>;
  effectPool: Pool<Effect>;
```

在构造函数中初始化：

```ts
  constructor(path: Path) {
    this.path = path;
    this.enemyPool = new Pool<Enemy>(
      () => ({ ...ENEMIES['grunt'], instanceId: 0, hp: 0, maxHp: 0, pathProgress: 0, speed: 0, x: 0, y: 0, alive: false, buffs: [], auraFlags: 0, hitFlash: 0, rewardGold: 0 }),
      (e) => resetEnemy(e),
      20,
    );
    this.projectilePool = new Pool<Projectile>(
      () => ({ instanceId: 0, x: 0, y: 0, targetId: 0, speed: 0, damage: 0, attackType: 'normal', splashRadius: 0, sourceTowerId: 0, alive: false, color: '', size: 0 }),
      (p) => { p.alive = false; p.x = 0; p.y = 0; p.targetId = 0; p.debuff = undefined; },
      30,
    );
    this.effectPool = new Pool<Effect>(
      () => ({ instanceId: 0, type: 'hit', x: 0, y: 0, remaining: 0, duration: 0, alive: false }),
      (e) => resetEffect(e),
      30,
    );
  }
```

**重要**：Projectile 的 reset 函数包含 `p.debuff = undefined`，防止池中复用的旧 debuff 残留。Effect 的 reset 使用 `resetEffect` 函数（将在 Step 7 中新增到 `Effect.ts`）。

**Verify**: `npm run typecheck` → exit 0

### Step 2: Enemy 工厂改为从池获取

打开 `src/entities/Enemy.ts`，修改 `createEnemy`：

```ts
export function createEnemy(defId: string, path: Path, difficulty: Difficulty, pool?: Pool<Enemy>): Enemy {
  const def = ENEMIES[defId];
  if (!def) {
    throw new Error(`[createEnemy] 未找到敌人定义: ${defId}`);
  }

  const hpMul = CONFIG.DIFF_HP[difficulty];
  const goldMul = CONFIG.DIFF_GOLD[difficulty];
  const pos = path.getPosition(0);
  const hp = def.baseHp * hpMul;

  // 从池获取或新建
  const enemy = pool ? pool.acquire() : {} as Enemy;

  // 拷贝定义字段
  Object.assign(enemy, def);
  enemy.abilities = [...def.abilities];
  // 运行时字段
  enemy.instanceId = nextEntityId();
  enemy.hp = hp;
  enemy.maxHp = hp;
  enemy.pathProgress = 0;
  enemy.speed = def.baseSpeed;
  enemy.x = pos.x;
  enemy.y = pos.y;
  enemy.alive = true;
  enemy.buffs = [];
  enemy.auraFlags = 0;
  enemy.hitFlash = 0;
  enemy.rewardGold = def.rewardGold * goldMul;

  return enemy;
}
```

关键变化：用 `Object.assign(enemy, def)` 替代 `{ ...def }` 展开到新对象，使池中复用的对象被重新填充。`pool` 参数可选，向后兼容。

**Verify**: `npm run typecheck` → exit 0

### Step 3: WaveSystem 传池给 createEnemy

打开 `src/systems/WaveSystem.ts`，找到第 142 行的 `createEnemy` 调用：

```ts
      const enemy = createEnemy(task.enemyId, state.path, state.difficulty);
```

改为：

```ts
      const enemy = createEnemy(task.enemyId, state.path, state.difficulty, state.enemyPool);
```

**Verify**: `npm run typecheck` → exit 0

### Step 4: CombatSystem 死亡敌人 release 到池

打开 `src/systems/CombatSystem.ts`，找到末尾的敌人清理（第 167-172 行）：

```ts
  // ===== 清理已死亡敌人（反向遍历）=====
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    if (!state.enemies[i].alive) {
      state.enemies.splice(i, 1);
    }
  }
```

改为：

```ts
  // ===== 清理已死亡敌人（反向遍历，release 到池）=====
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (!e.alive) {
      state.enemies.splice(i, 1);
      state.enemyPool.release(e);
    }
  }
```

同样，投射物清理（第 160-165 行）改为：

```ts
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    if (!p.alive) {
      state.projectiles.splice(i, 1);
      state.projectilePool.release(p);
    }
  }
```

**Verify**: `npm run typecheck` → exit 0

### Step 5: Projectile 工厂改为从池获取

打开 `src/entities/Projectile.ts`，修改 `createProjectile` 函数。当前函数接收 `CreateProjectileOpts` 对象：

```ts
export function createProjectile(opts: CreateProjectileOpts, pool?: Pool<Projectile>): Projectile {
  const proj = pool ? pool.acquire() : {} as Projectile;
  // 重新分配 id
  proj.instanceId = nextEntityId();
  // 填充所有字段
  proj.x = opts.x;
  proj.y = opts.y;
  proj.targetId = opts.targetId;
  proj.speed = opts.speed;
  proj.damage = opts.damage;
  proj.attackType = opts.attackType ?? 'normal';
  proj.splashRadius = opts.splashRadius ?? 0;
  proj.sourceTowerId = opts.sourceTowerId ?? 0;
  proj.alive = true;
  proj.color = opts.color ?? '#FFFFFF';
  proj.size = opts.size ?? 4;
  // debuff 字段：显式设置（覆盖池中旧值）
  if (opts.debuffType != null) {
    proj.debuff = { type: opts.debuffType, value: opts.debuffValue ?? 0, duration: opts.debuffDuration ?? 1 };
  } else {
    proj.debuff = undefined;
  }
  return proj;
}
```

关键：`pool` 参数可选，向后兼容。`debuff` 字段显式设为 `undefined` 当 `opts.debuffType == null`，防止池中复用对象的旧 debuff 残留。

**Verify**: `npm run typecheck` → exit 0

### Step 6: TowerAISystem 传池给 createProjectile

打开 `src/systems/TowerAISystem.ts`，找到 `createProjectile` 调用（第 186 行），传入 `state.projectilePool`。

**Verify**: `npm run typecheck` → exit 0

### Step 7: Effect 工厂改为从池获取 + 新增 resetEffect

打开 `src/entities/Effect.ts`，在文件顶部新增导出函数：

```ts
export function resetEffect(e: Effect): void {
  e.alive = false;
  e.remaining = 0;
  e.particles = undefined;
  e.points = undefined;
  e.text = undefined;
  e.color = undefined;
  e.vy = undefined;
  e.radius = undefined;
}
```

修改各 `createXxxEffect` 函数（共 10 个），每个函数接受可选 `pool?: Pool<Effect>` 参数。模式统一：

```ts
export function createHitEffect(x: number, y: number, pool?: Pool<Effect>): Effect {
  const e = pool ? pool.acquire() : {} as Effect;
  e.instanceId = nextEntityId();
  e.type = 'hit';
  e.x = x;
  e.y = y;
  e.remaining = 0.15;
  e.duration = 0.15;
  e.alive = true;
  // ... 其他字段
  return e;
}
```

**需要修改的 10 个工厂函数及调用点**：

| 工厂函数 | 调用文件 | 调用位置 |
|---------|---------|---------|
| `createHitEffect` | TowerAISystem.ts, CombatSystem.ts | TowerAISystem:175-183, CombatSystem:47,136 |
| `createDeathEffect` | CombatSystem.ts | CombatSystem:47 |
| `createSplashEffect` | CombatSystem.ts | CombatSystem:91,150 |
| `createDamageText` | TowerAISystem.ts, SkillSystem.ts | TowerAISystem:183, SkillSystem:134-135,145 |
| `createBuildEffect` | Game.ts | Game.ts:364 |
| `createUpgradeEffect` | Game.ts | Game.ts:382 |
| `createLightningEffect` | SkillSystem.ts | SkillSystem:178 |
| `createJudgeEffect` | SkillSystem.ts | SkillSystem:134-135 |
| `createShockwaveEffect` | SkillSystem.ts | SkillSystem:166 |
| `createCombineEffect` | Game.ts（合成逻辑处） | 搜索 `createCombineEffect` 调用 |

**Verify**: `npm run typecheck` → exit 0

### Step 8: EffectSystem 死亡特效 release 到池

打开 `src/systems/EffectSystem.ts`，找到末尾清理（第 38-42 行）：

```ts
  for (let i = state.effects.length - 1; i >= 0; i--) {
    if (!state.effects[i].alive) {
      state.effects.splice(i, 1);
    }
  }
```

改为：

```ts
  for (let i = state.effects.length - 1; i >= 0; i--) {
    const e = state.effects[i];
    if (!e.alive) {
      state.effects.splice(i, 1);
      state.effectPool.release(e);
    }
  }
```

各系统调用 `createXxxEffect` 时传入 `state.effectPool`。

**Verify**: `npm run typecheck` → exit 0

### Step 9: 确认 Game.startGame 不会残留旧池

打开 `src/game/Game.ts`，在 `startGame` 方法中，`this.state = new GameState(path)` 创建新 GameState，其池默认是空的（`releaseAll` 在新池上是 no-op）。**不需要额外操作**。

如果未来改为复用 GameState 实例（不 new），则需在 `this.state = new GameState(path)` 之前对旧 state 调用 `releaseAll`。当前代码不需要改动。

**Verify**: `npm run typecheck` → exit 0

### Step 10: 全量验证

**Verify**:
- `npm run typecheck` → exit 0
- `npm test` → all pass
- `npm run build` → exit 0

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0
- [ ] `src/game/State.ts` 有 `enemyPool`/`projectilePool`/`effectPool` 字段
- [ ] `src/entities/Enemy.ts` 的 `createEnemy` 接受可选 `pool` 参数
- [ ] `src/systems/CombatSystem.ts` 死亡清理调用 `pool.release`
- [ ] `src/systems/EffectSystem.ts` 死亡清理调用 `pool.release`
- [ ] `src/game/Game.ts` 的 `startGame` 调用 `releaseAll`
- [ ] `grep -n "new Pool" src/game/State.ts` → 有 3 个匹配
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `Object.assign(enemy, def)` 无法正确覆盖池中旧对象的定义字段（如果 def 有可选字段而旧对象有值，可能残留）——需确认 `resetEnemy` 清空了所有字段，或改用完整重赋值。
- 池化后实体出现"幽灵"行为（已死亡的敌人仍被渲染/攻击）——说明 release 时机或 alive 标记有误。
- `instanceId` 冲突（池中复用的对象保留了旧 id）——确认 `createEnemy` 总是重新分配 `nextEntityId()`。
- 性能未提升（浏览器 V8 的年轻代 GC 已经很快，池化可能无明显收益）——如果 profiling 显示无改善，记录并考虑回退。

## Maintenance notes

- 对象池的初始大小（20/30）是保守估计，可根据实际同屏实体数调整。池不会自动收缩，如果峰值后空闲对象多，内存会略增。
- `Object.assign` 比 `{ ...def }` 略慢（覆盖而非新建），但省去了对象分配。对于高频创建的投射物/特效，净收益为正。
- 特效的 `particles`/`points` 数组在 release 时设为 `undefined` 而非 `[]`，让 GC 回收大数组。acquire 时由工厂重新赋值。
- 如果未来引入 TypeScript 严格模式（`exactOptionalPropertyTypes`），需确认 `undefined` 赋值与类型定义兼容。
- 此计划风险中等，建议在 dev 服务器中长时间游玩无尽模式验证无异常后再合并。
