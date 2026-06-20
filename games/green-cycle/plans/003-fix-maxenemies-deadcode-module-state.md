# Plan 003: 修复 maxEnemies 硬编码、清理 dead code、消除模块级状态

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bc95bc..HEAD -- src/game/State.ts src/systems/WaveSystem.ts src/config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug + tech-debt
- **Planned at**: commit `7bc95bc`, 2026-06-20

## Why this matters

三个小问题合集：`maxEnemies` 在 State.ts 中硬编码，未使用 config.ts 常量，导致配置改了不生效；`generateEndlessWave` 计算了 `hpMul` 变量却从未使用（实际血量加成在 update 中重复计算），是误导性 dead code；`WaveSystem` 用模块级 `let` 变量传递 PF 判定状态，违反纯函数系统契约且不可单测。三者都在同一批文件中，适合一起修。

## Current state

### BUG-03: maxEnemies 硬编码

`src/config.ts:16-17`:

```ts
MAX_ENEMIES_NORMAL: 40, // 单人普通模式同屏上限
MAX_ENEMIES_ENDLESS: 20,
```

`src/game/State.ts:182-184` — 未使用上述常量，硬编码（注意：hard 分支是隐式默认值 35）：

```ts
this.maxEnemies = endless
    ? CONFIG.ENDLESS_MAX_ENEMIES
    : (diff === 'easy' ? 50 : diff === 'normal' ? 40 : 35);
```

注意：`endless` 分支用了 `CONFIG.ENDLESS_MAX_ENEMIES`（即 20），但非 endless 分支完全硬编码，且 easy=50/normal=40/hard=35 这组数值在 config 中不存在。

### BUG-04: generateEndlessWave 中 hpMul 是 dead code

`src/systems/WaveSystem.ts:16-38`:

```ts
function generateEndlessWave(waveIndex: number): WaveDef {
  const total = CONFIG.TOTAL_WAVES;
  const cycle = Math.floor((waveIndex - 1) / total); // 0,1,2...
  const templateIndex = ((waveIndex - 1) % total) + 1;
  const template = WAVES[templateIndex - 1];

  const hpMul = 1 + CONFIG.ENDLESS_HP_SCALE * cycle;  // ← 计算了但返回对象未使用
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
```

实际血量加成在 `src/systems/WaveSystem.ts:144-149` 的 `update` 中单独应用：

```ts
if (state.endless && state.waveIndex > CONFIG.TOTAL_WAVES) {
    const cycle = Math.floor((state.waveIndex - 1) / CONFIG.TOTAL_WAVES);
    const hpMul = 1 + CONFIG.ENDLESS_HP_SCALE * cycle;
    enemy.hp *= hpMul;
    enemy.maxHp *= hpMul;
}
```

### BUG-05: 模块级可变状态

`src/systems/WaveSystem.ts:9-10`:

```ts
// 模块级变量：记录当前波次开始时 enemies 是否为空（用于 PF 判定）
let waveStartEnemiesEmpty = true;
```

在 `startNextWave`（第 68 行）写入，在 `endWave`（第 90 行）读取。

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npm run typecheck`    | exit 0, no errors   |
| Build     | `npm run build`        | exit 0              |

## Scope

**In scope**:
- `src/config.ts` — 新增各难度的 maxEnemies 常量
- `src/game/State.ts` — 使用 config 常量替代硬编码
- `src/systems/WaveSystem.ts` — 删除 dead code hpMul；将模块级变量移入 GameState

**Out of scope**:
- `src/types.ts` — 不改
- 无尽模式血量加成的实际逻辑（已在 update 中正确实现）

## Steps

### Step 1: config.ts 新增各难度同屏上限常量

打开 `src/config.ts`，在 `MAX_ENEMIES_ENDLESS: 20,` 行下方新增：

```ts
  MAX_ENEMIES_NORMAL: 40, // 单人普通模式同屏上限
  MAX_ENEMIES_ENDLESS: 20,
  MAX_ENEMIES_BY_DIFF: { easy: 50, normal: 40, hard: 35 },
```

**Verify**: `npm run typecheck` → exit 0

### Step 2: State.ts 使用 config 常量

打开 `src/game/State.ts`，找到第 182-184 行，将：

```ts
this.maxEnemies = endless
    ? CONFIG.ENDLESS_MAX_ENEMIES
    : (diff === 'easy' ? 50 : diff === 'normal' ? 40 : diff === 'hard' ? 35);
```

替换为：

```ts
this.maxEnemies = endless
    ? CONFIG.ENDLESS_MAX_ENEMIES
    : CONFIG.MAX_ENEMIES_BY_DIFF[diff];
```

**Verify**: `npm run typecheck` → exit 0

### Step 3: WaveSystem.ts 删除 generateEndlessWave 中的 dead code

打开 `src/systems/WaveSystem.ts`，在 `generateEndlessWave` 函数中删除未使用的 `hpMul` 行。

删除这一行（注意：实际源码中该行无注释，注释在 cycle 变量上）：

```ts
  const hpMul = 1 + CONFIG.ENDLESS_HP_SCALE * cycle;
```

保留 `countMul` 和 `rewardMul`（它们被使用了）。

**Verify**: `npm run typecheck` → exit 0

### Step 4: WaveSystem.ts 将模块级变量移入 GameState

**4a.** 打开 `src/game/State.ts`，在 `bossAlive = false;` 行（约第 87 行）下方新增：

```ts
  bossAlive = false;

  // 波次 PF 判定：记录当前波次开始时 enemies 是否为空
  waveStartEnemiesEmpty = true;
```

**4b.** 打开 `src/systems/WaveSystem.ts`，删除第 9-10 行的模块级变量：

```ts
// 模块级变量：记录当前波次开始时 enemies 是否为空（用于 PF 判定）
let waveStartEnemiesEmpty = true;
```

**4c.** 在 `startNextWave` 函数中（约第 68 行），将：

```ts
  waveStartEnemiesEmpty = state.enemies.length === 0;
```

改为：

```ts
  state.waveStartEnemiesEmpty = state.enemies.length === 0;
```

**4d.** 在 `endWave` 函数中（约第 90 行），将：

```ts
  if (waveStartEnemiesEmpty) {
```

改为：

```ts
  if (state.waveStartEnemiesEmpty) {
```

**Verify**: `npm run typecheck` → exit 0

### Step 5: 构建验证

**Verify**: `npm run build` → exit 0

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] `src/game/State.ts` 中 `maxEnemies` 使用 `CONFIG.MAX_ENEMIES_BY_DIFF[diff]`，不再有硬编码数字
- [ ] `src/systems/WaveSystem.ts` 中 `generateEndlessWave` 不再有未使用的 `hpMul` 变量
- [ ] `src/systems/WaveSystem.ts` 顶部不再有模块级 `let waveStartEnemiesEmpty`
- [ ] `src/game/State.ts` 有 `waveStartEnemiesEmpty` 实例字段
- [ ] `grep -n "let waveStartEnemiesEmpty" src/systems/WaveSystem.ts` → 无匹配
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `WaveSystem.ts` 中 `waveStartEnemiesEmpty` 的读写点不止上述两处（可能有其他引用）。
- `State.ts` 中已存在 `waveStartEnemiesEmpty` 字段（已被其他人添加）。
- `config.ts` 中 `MAX_ENEMIES_BY_DIFF` 键名与 `Difficulty` 类型不匹配。

## Maintenance notes

- `waveStartEnemiesEmpty` 移入 GameState 后，未来可以单测 WaveSystem 的 PF 判定逻辑。
- `MAX_ENEMIES_BY_DIFF` 与 `Difficulty` 类型关联，如果新增难度需同步更新此常量。
- 无尽模式血量加成逻辑（update 中）与 generateEndlessWave 的模板缩放是分离的——模板缩放 count/reward，血量在生成时应用。这个分离是有意的，因为敌人 hp 在 createEnemy 时才计算。
