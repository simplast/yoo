# Plan 002: 召唤炮台改用游戏内计时器替代 setTimeout

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bc95bc..HEAD -- src/game/Game.ts src/game/State.ts src/systems/EconomySystem.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `7bc95bc`, 2026-06-20

## Why this matters

"召唤支援"全局技能用真实时间 `setTimeout` 移除临时炮台，但游戏使用固定步长循环并支持暂停和 1x/2x/3x 加速。这导致：暂停时炮台仍会到期消失；加速时炮台持续时间不随倍速缩短；切后台回来炮台可能已消失。应改为游戏内计时器，由 `EconomySystem` 在 `update(state, dt)` 中递减，与游戏速度和暂停状态一致。

## Current state

`src/game/Game.ts:511-529` — 召唤技能当前实现：

```ts
} else if (type === 'summon' && state.skillSummonCd <= 0) {
    state.skillSummonCd = CONFIG.SKILL_SUMMON_CD;
    // 在路径中点召唤临时高伤炮台
    const pos = state.path.getPosition(0.5);
    const t = createTower('cannon', pos.x, pos.y);
    t.instanceId = Math.floor(Math.random() * -100000) - 1; // 负 id 标记临时
    t.levels = [{ level: 1, damage: 200, attackSpeed: 2, range: 150, upgradeCost: 0 }];
    t.maxLevel = 1;
    t.popCost = 0;
    state.summonTowerId = t.instanceId;
    state.towers.push(t);
    // 简化：定时移除由 EconomySystem 或这里处理
    setTimeout(() => {
        const idx = state.towers.indexOf(t);
        if (idx >= 0) state.towers.splice(idx, 1);
        if (state.summonTowerId === t.instanceId) state.summonTowerId = -1;
    }, CONFIG.SKILL_SUMMON_DURATION * 1000);
    audio.playSkillSummon();
}
```

`src/game/State.ts:76-77` — 已有相关状态字段：

```ts
globalSlowTimer = 0; // 全屏减速剩余秒
summonTowerId = -1; // 召唤的临时炮台 instanceId，-1=无
```

`src/systems/EconomySystem.ts:4-37` — 已有全局计时器 tick 模式（技能 CD、全局减速）：

```ts
export function update(state: GameState, dt: number): void {
  // ===== 更新全局技能 CD =====
  if (state.skillBlastCd > 0) {
    state.skillBlastCd = Math.max(0, state.skillBlastCd - dt);
  }
  // ...
  // ===== 全局减速计时 =====
  if (state.globalSlowTimer > 0) {
    state.globalSlowTimer = Math.max(0, state.globalSlowTimer - dt);
  }
```

`src/config.ts:41` — `SKILL_SUMMON_DURATION: 15`（秒）

### 项目约定

- 所有系统签名为 `update(state: GameState, dt: number): void`，由 `Game.ts:167-179` 的步进循环调度，`dt` 已是固定步长 `1/60`，加速时多次步进。
- 系统调度顺序（`Game.ts:170-177`）：Wave → Aura → Movement → TowerAI → Combat → Skill → Effect → Economy。
- 状态字段原则：`types.ts`/`config.ts` 只增不改（见 `docs/progress/roadmap.md:119-120`）。

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npm run typecheck`    | exit 0, no errors   |
| Build     | `npm run build`        | exit 0              |

## Scope

**In scope**:
- `src/game/State.ts` — 新增 `summonTimer` 字段
- `src/game/Game.ts` — 召唤技能改用 `state.summonTimer`，移除 `setTimeout`
- `src/systems/EconomySystem.ts` — 在 `update` 中递减 `summonTimer`，到期移除炮台

**Out of scope**:
- `src/types.ts` — 不改（State 类内部字段，非类型契约）
- `src/config.ts` — 不改（`SKILL_SUMMON_DURATION` 已存在）
- 召唤炮台的战斗逻辑、属性数值

## Steps

### Step 1: 在 GameState 新增 summonTimer 字段

打开 `src/game/State.ts`，在第 77 行 `summonTowerId = -1;` 下方新增一行：

```ts
summonTowerId = -1; // 召唤的临时炮台 instanceId，-1=无
summonTimer = 0; // 召唤炮台剩余持续时间秒，0=无活跃召唤
```

**Verify**: `npm run typecheck` → exit 0

### Step 2: EconomySystem 中递减计时器并移除到期炮台

打开 `src/systems/EconomySystem.ts`，在 `update` 函数中，全局减速计时块之后（约第 19 行后），新增召唤炮台计时逻辑：

```ts
  // ===== 全局减速计时 =====
  if (state.globalSlowTimer > 0) {
    state.globalSlowTimer = Math.max(0, state.globalSlowTimer - dt);
  }

  // ===== 召唤炮台计时 =====
  if (state.summonTimer > 0) {
    state.summonTimer = Math.max(0, state.summonTimer - dt);
    if (state.summonTimer <= 0 && state.summonTowerId !== -1) {
      // 到期移除临时炮台（使用 removeTower 确保选中状态清理）
      const tower = state.towers.find((t) => t.instanceId === state.summonTowerId);
      if (tower) state.removeTower(tower);
      state.summonTowerId = -1;
    }
  }
```

注意：改用 `state.removeTower(tower)` 而非 `splice`，好处是 `removeTower` 会自动清理 `selectedTowerId`/`selectedTowerIds` 和 `markCell`。召唤炮台 `popCost=0`，`removeTower` 的 `pop -= 0` 无害。`markCell` 有边界检查（`if (this.buildCells[col] && this.buildCells[col][row])`），不会对非 buildCell 上的炮台出错。额外防御 `state.summonTowerId !== -1` 检查避免多帧竞态。

**Verify**: `npm run typecheck` → exit 0

### Step 3: Game.ts 召唤技能改用 summonTimer，移除 setTimeout

打开 `src/game/Game.ts`，找到第 511-529 行的 summon 分支。将整个 `setTimeout` 块替换为设置 `summonTimer`：

修改前：

```ts
    state.summonTowerId = t.instanceId;
    state.towers.push(t);
    // 简化：定时移除由 EconomySystem 或这里处理
    setTimeout(() => {
        const idx = state.towers.indexOf(t);
        if (idx >= 0) state.towers.splice(idx, 1);
        if (state.summonTowerId === t.instanceId) state.summonTowerId = -1;
    }, CONFIG.SKILL_SUMMON_DURATION * 1000);
    audio.playSkillSummon();
```

修改后：

```ts
    state.summonTowerId = t.instanceId;
    state.summonTimer = CONFIG.SKILL_SUMMON_DURATION;
    state.towers.push(t);
    audio.playSkillSummon();
```

**Verify**: `npm run typecheck` → exit 0

### Step 4: 确认无残留 setTimeout

搜索项目中是否还有其他 `setTimeout` 引用召唤炮台逻辑：

**Verify**: `grep -n "setTimeout" src/game/Game.ts` → 无匹配（或仅剩不相关的）

### Step 5: 构建验证

**Verify**: `npm run build` → exit 0，产物生成到 `../../public/games/green-cycle/`

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] `src/game/Game.ts` 中不再有 `setTimeout` 处理召唤炮台移除
- [ ] `src/game/State.ts` 有 `summonTimer` 字段
- [ ] `src/systems/EconomySystem.ts` 在 `update` 中递减 `summonTimer` 并在到期时移除炮台
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `EconomySystem.ts` 的 `update` 函数签名或结构与上述 excerpt 不符。
- `Game.ts` 中 summon 分支的代码结构与 excerpt 不符（已被重构）。
- `State.ts` 中已存在 `summonTimer` 字段（可能已被其他人添加）。
- 移除炮台时 `state.towers.findIndex` 找不到对应 instanceId（说明临时炮台已被其他逻辑移除，需调查）。

## Maintenance notes

- 召唤炮台用负 instanceId 标记临时性。如果未来有其他临时实体，应考虑统一的临时实体管理机制。
- EconomySystem 现在负责三种全局计时器：技能 CD、全局减速、召唤炮台。如果继续增加，考虑提取为独立的 TimerSystem。
- 暂停时 EconomySystem 不被调用（Game.ts:163 `if (state.phase === 'battling')`