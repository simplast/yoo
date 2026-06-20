# Plan 010: 扩展木材获取渠道（精英敌人掉落 + 经济波加成）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bc95bc..HEAD -- src/data/waves.ts src/data/enemies.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 004（测试基线兜底）
- **Category**: direction (gameplay)
- **Planned at**: commit `7bc95bc`, 2026-06-20

## Why this matters

木材获取渠道已有坚实基础：Boss 敌人击杀掉落 3/5/10 木 + 波次奖励 1-5 木 + economyRabbit 掉落 1 木 + 第 30 波经济波奖励 1 木。但 hard 模式下经济兔速度快、数量少，玩家可能漏掉大部分木材。本计划小幅增加木材获取：给精英敌人（golem/auraHaster）增加木材掉落，并将第 30 波经济波的木材奖励从 1 提升到 2，让合成系统在 hard 模式也有更多可用机会。

## Current state

`src/types.ts:61-74` — `EnemyDef` 已有 `rewardWood: number`（必填字段）：

```ts
export interface EnemyDef {
  id: string;
  name: string;
  // ...
  rewardGold: number;
  rewardWood: number;       // ← 已存在，必填
  rewardExp: number;
  // ...
}
```

`src/data/enemies.ts` — 当前敌人木材掉落情况：

| 敌人 | rewardWood | 说明 |
|------|-----------|------|
| 普通敌人（grunt/runner/brute/mage/priest/dragonkin/ghost/wyvern/splitter） | 0 | 不掉木 |
| **golem**（魔像，高HP魔免） | **0** | ← 应给木 |
| **auraHaster**（光环怪） | **0** | ← 应给木 |
| economyRabbit | 1 | 已掉木 |
| chimeraBoss | 3 | 已掉木 |
| dragonBoss | 5 | 已掉木 |
| finalBoss | 10 | 已掉木 |

`src/systems/CombatSystem.ts:43-50` — 击杀时已实现木材掉落：

```ts
  // 死亡处理
  if (enemy.hp <= 0) {
    enemy.alive = false;
    state.addEffect(createDeathEffect(enemy.x, enemy.y, enemy.color));
    // 击杀奖励
    state.gold += enemy.rewardGold;
    state.wood += enemy.rewardWood;  // ← 已存在！
    state.kills++;
```

`src/data/waves.ts:369` — 第 30 波经济波当前 `rewardWood: 1`。

`src/data/recipes.ts` — 两个配方需要木材（`cost.wood`）：

```ts
{ id: 'recipe_cannon_to_chaos', ..., cost: { gold: 200, wood: 5 } }
{ id: 'recipe_growth_fuse', ..., cost: { gold: 500, wood: 10 } }
```

### 设计约束

- 木材是稀缺资源，不应泛滥。Boss 仍是主要来源。
- 精英敌人（golem/auraHaster）是高威胁单位，给木材奖励符合"高回报"逻辑。
- 经济波（第 30 波）定位为"刷资源"，小幅提升木材合理。

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npm run typecheck`    | exit 0, no errors   |
| Build     | `npm run build`        | exit 0              |

## Scope

**In scope**:
- `src/data/enemies.ts` — 给 golem 和 auraHaster 增加 `rewardWood: 1`
- `src/data/waves.ts` — 第 30 波 `rewardWood` 从 1 改为 2

**Out of scope**:
- `src/types.ts` — 不改（`rewardWood` 已存在）
- `src/systems/CombatSystem.ts` — 不改（木材掉落已实现）
- `src/entities/Enemy.ts` — 不改（`...def` 展开已拷贝 `rewardWood`）
- Boss 敌人的木材掉落
- 合成配方木材消耗

## Steps

### Step 1: 给精英敌人增加木材掉落

打开 `src/data/enemies.ts`，修改以下两个敌人：

**golem**（魔像，第 122-134 行）：将 `rewardWood: 0` 改为 `rewardWood: 1`。

**auraHaster**（光环怪，第 150-162 行）：将 `rewardWood: 0` 改为 `rewardWood: 1`。

设计理由：golem 是高 HP 魔免精英，auraHaster 是光环精英，击杀难度高于普通敌人，给 1 木合理。

**Verify**: `npm run typecheck` → exit 0

### Step 2: 提升第 30 波经济波木材奖励

打开 `src/data/waves.ts`，找到第 30 波（搜索 `index: 30`），将 `rewardWood: 1` 改为 `rewardWood: 2`。

**Verify**: `npm run typecheck` → exit 0

### Step 3: 全量验证

**Verify**:
- `npm run typecheck` → exit 0
- `npm run build` → exit 0

### Step 4: 手动验证

启动 `npm run dev`，验证：
1. 击杀 golem 时木材 +1。
2. 击杀 auraHaster 时木材 +1。
3. 第 30 波经济波结束后获得 2 木材（波次奖励）。
4. 普通敌人（grunt/runner 等）不掉木材。

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] `src/data/enemies.ts` 中 golem 的 `rewardWood` 为 1
- [ ] `src/data/enemies.ts` 中 auraHaster 的 `rewardWood` 为 1
- [ ] `src/data/waves.ts` 第 30 波 `rewardWood` 为 2
- [ ] 手动验证 4 个场景均通过
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- golem 或 auraHaster 的敌人 ID 与上述不符（已被重命名）。
- `EnemyDef.rewardWood` 类型发生变更（不再是 `number`）。
- 第 30 波 `rewardWood` 当前值不是 1（已被其他计划修改）。

## Maintenance notes

- 木材总量估算：Boss 掉落 3+5+10=18 + Boss 波次奖励 1+2+3+4+5=15 + 经济波 2 + economyRabbit 约 10-20 只（取决于玩家击杀率）≈ 45-60 木 + 新增精英掉落 2-4 木。两个配方共需 15 木，木材充裕度合理。
- `rewardWood` 是 `EnemyDef` 的必填字段，所有敌人定义必须有此字段。新增敌人时不要遗漏。
- 木材掉落逻辑在 `CombatSystem.applyDamage` 中，已正确实现，无需修改。