# Plan 009: 为普通波增加时间压力与清场奖励

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bc95bc..HEAD -- src/systems/WaveSystem.ts src/systems/EconomySystem.ts src/game/State.ts src/game/Game.ts src/config.ts src/render/UIRenderer.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: 004（测试基线兜底）
- **Category**: direction (gameplay)
- **Planned at**: commit `7bc95bc`, 2026-06-20

## Why this matters

当前循环路径设计下，敌人无限跑动不会"到达终点"，失败仅靠压力条（同屏敌人超上限）。普通波没有时间压力，玩家可以被动挂机让怪一直转圈。非 Boss 波全部生成即结束，残留怪无直接惩罚，连续几波没清完压力快速叠加容易突然崩盘。本计划增加"波次限时清场奖励"机制：在波次间隔内清空所有敌人给予额外金币奖励，引导玩家主动清怪，增加紧迫感和策略深度。

## Current state

`src/systems/WaveSystem.ts:155-170` — 非 Boss 波全部生成即结束：

```ts
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
```

`src/systems/WaveSystem.ts:81-120` — `endWave` 发放奖励和 PF 判定：

```ts
function endWave(state: GameState): void {
  const wave = state.currentWave;
  if (!wave) return;

  // 发放波次奖励
  state.gold += wave.rewardGold;
  state.wood += wave.rewardWood;

  // PF 判定：波次开始时 enemies 为空则 PF
  if (waveStartEnemiesEmpty) {          // ← 模块级变量，不是 state 属性
    state.pf++;                         // ← 字段名是 pf，不是 perfectWaves
    state.perfectStreak++;
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
  // ...
  state.waveTimer = CONFIG.WAVE_INTERVAL;
}
```

`src/game/State.ts:60-63` — 压力条是字段 + 方法，不是 getter：

```ts
  maxEnemies: number = CONFIG.MAX_ENEMIES_NORMAL;
  pressure = 0; // 0~1

  updatePressure() {
    const count = this.enemies.length;
    this.pressure = count / this.maxEnemies;
  }
```

`src/game/Game.ts:577-583` — 波次计时器在 DOM 中（`syncUI`），不在 Canvas 中：

```ts
    if (state.currentWave) {
      ui.nextWaveInfo.textContent = `当前: ${state.currentWave.hint}`;
    } else if (state.waveIndex < CONFIG.TOTAL_WAVES) {
      ui.nextWaveInfo.textContent = state.waveActive ? '波次进行中' : `下波倒计时: ${Math.ceil(state.waveTimer)}s`;
    } else {
      ui.nextWaveInfo.textContent = '已完成';
    }
```

`src/render/UIRenderer.ts` — Canvas 内绘制建造预览、Boss 血条（y=12-34）、漏怪警报、框选矩形。**无 waveTimer 渲染**。

### 设计约束

- 循环路径是核心特色，不应改为线性路径。
- 压力条机制保留，作为硬性失败条件。
- Boss 波已有 `bossTimer` 限时，本计划只针对普通波。
- PF 判定已存在：波次开始时 enemies 为空则 `state.pf++`。
- 波次计时器在 DOM 中渲染（`ui.nextWaveInfo`），清场倒计时也应放在 DOM 中。

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npm run typecheck`    | exit 0, no errors   |
| Build     | `npm run build`        | exit 0              |

## Scope

**In scope**:
- `src/config.ts` — 新增清场奖励常量
- `src/game/State.ts` — 新增 `clearBonusTimer` 字段
- `src/systems/WaveSystem.ts` — `endWave` 后启动清场倒计时（**仅普通波**）
- `src/systems/EconomySystem.ts` — 递减 `clearBonusTimer`，到期或清空时处理
- `src/game/Game.ts` — `syncUI` 中显示清场倒计时到 DOM

**Out of scope**:
- `src/render/UIRenderer.ts` — 不改（清场 UI 放 DOM 而非 Canvas）
- `src/data/waves.ts` — 不改波次数据
- Boss 波逻辑
- 压力条机制

## Steps

### Step 1: config.ts 新增清场奖励常量

打开 `src/config.ts`，在 `WAVE_INTERVAL` 附近新增：

```ts
  WAVE_INTERVAL: 12,
  // 清场奖励：波次结束后，在 WAVE_INTERVAL 内清空所有残留敌人给予额外金币
  CLEAR_BONUS_TIME: 8, // 清场倒计时秒数（小于 WAVE_INTERVAL，留 4 秒缓冲）
  CLEAR_BONUS_GOLD: 30, // 清场奖励金币（每波固定）
```

**Verify**: `npm run typecheck` → exit 0

### Step 2: State.ts 新增清场倒计时字段

打开 `src/game/State.ts`，在 `waveTimer` 字段（第 47 行）附近新增：

```ts
  waveTimer = 0; // 下波倒计时秒
  clearBonusTimer = 0; // 清场奖励倒计时，>0 表示有奖励机会，0 表示无活跃倒计时
```

**Verify**: `npm run typecheck` → exit 0

### Step 3: WaveSystem endWave 启动清场倒计时（仅普通波）

打开 `src/systems/WaveSystem.ts`，修改 `endWave` 函数（第 81-120 行）。在 `state.waveTimer = CONFIG.WAVE_INTERVAL` 之前，新增清场倒计时逻辑：

```ts
  // 设置下一波倒计时
  // 清场奖励：普通波结束后，如果场上有残留敌人，启动清场倒计时
  if (!wave.isBoss && state.enemies.length > 0) {
    state.clearBonusTimer = CONFIG.CLEAR_BONUS_TIME;
  }
  state.waveTimer = CONFIG.WAVE_INTERVAL;
```

注意：`!wave.isBoss` 显式排除 Boss 波。Boss 波在 `enemies.length === 0` 时才调用 `endWave`，理论上不会触发，但显式守卫更安全。

**Verify**: `npm run typecheck` → exit 0

### Step 4: EconomySystem 处理清场倒计时

打开 `src/systems/EconomySystem.ts`，在 `update` 函数的合适位置（全局技能 CD 递减区域之后），新增清场倒计时逻辑：

```ts
  // ===== 清场奖励倒计时 =====
  if (state.clearBonusTimer > 0) {
    state.clearBonusTimer = Math.max(0, state.clearBonusTimer - dt);
    // 倒计时内清空所有敌人 → 发放奖励
    if (state.enemies.length === 0) {
      state.gold += CONFIG.CLEAR_BONUS_GOLD;
      state.clearBonusTimer = 0;
    }
    // 倒计时到期未清空 → 无奖励，倒计时归零（Math.max 已处理）
  }
```

注意：EconomySystem 在 `state.phase === 'battling'` 时运行（由 Game.ts 调度），波次间隔期 phase 是 battling，所以倒计时会正确递减。如果 `enemies.length === 0` 在倒计时内成立，立即发奖励并归零。

**Verify**: `npm run typecheck` → exit 0

### Step 5: Game.ts syncUI 显示清场倒计时到 DOM

打开 `src/game/Game.ts`，在 `syncUI` 方法中（第 577-583 行，"下波信息"区域），当 `state.clearBonusTimer > 0` 时追加清场倒计时显示。

在第 583 行 `} else {` 分支之后，新增：

```ts
    // 清场奖励倒计时（覆盖下波信息显示）
    if (state.clearBonusTimer > 0) {
      ui.nextWaveInfo.textContent = `清场奖励 ${Math.ceil(state.clearBonusTimer)}s +${CONFIG.CLEAR_BONUS_GOLD}G`;
      ui.nextWaveInfo.style.color = '#FFD700';
    }
```

注意：清场倒计时显示时，会覆盖原有的"下波倒计时"文字。当 `clearBonusTimer` 归零后，`syncUI` 的下一次调用会恢复正常显示。

**Verify**: `npm run typecheck` → exit 0

### Step 6: 确认 EconomySystem 在波次间隔期运行

打开 `src/game/Game.ts`，确认 `EconomySystem.update` 的调用条件。找到 `update` 循环（约第 160-180 行），确认 EconomySystem 在 `state.phase === 'battling'` 时被调用。波次间隔期 `phase` 保持 `battling`，所以 `clearBonusTimer` 会正确递减。

**Verify**: 阅读 `Game.ts` 中 `EconomyModule.update` 的调用位置，确认其在 `phase === 'battling'` 分支内。

### Step 7: 全量验证

**Verify**:
- `npm run typecheck` → exit 0
- `npm run build` → exit 0

### Step 8: 手动验证（dev 服务器）

启动 `npm run dev`，在浏览器中验证：
1. 普通波结束后，如果场上有残留敌人，DOM 显示金色"清场奖励 Xs +30G"。
2. 在倒计时内击杀所有敌人，获得 30 金币奖励，倒计时文本消失，恢复正常显示。
3. 倒计时到期未清空，倒计时文本消失，无奖励。
4. 波次开始时 enemies 为空（PF），不启动清场倒计时（因为 `endWave` 时 `enemies.length === 0`）。
5. Boss 波不受影响（`!wave.isBoss` 守卫排除）。

**Verify**: 上述 5 个场景均符合预期。

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] `src/config.ts` 有 `CLEAR_BONUS_TIME` 和 `CLEAR_BONUS_GOLD` 常量
- [ ] `src/game/State.ts` 有 `clearBonusTimer` 字段
- [ ] `src/systems/WaveSystem.ts` 的 `endWave` 在 **普通波** 且有残留敌人时启动 `clearBonusTimer`
- [ ] `src/systems/EconomySystem.ts` 递减 `clearBonusTimer` 并在清空时发奖励
- [ ] `src/game/Game.ts` 的 `syncUI` 在 `clearBonusTimer > 0` 时显示金色倒计时
- [ ] 手动验证 5 个场景均通过
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `endWave` 函数结构或 `waveStartEnemiesEmpty` 的模块级变量声明与上述 excerpt 不符（可能已被其他计划修改）。
- `EconomySystem.update` 的运行条件不包含 `state.phase === 'battling'`（如果波次间隔期 phase 不是 battling，倒计时不递减，需在 Game.ts 中调整 EconomySystem 调度条件）。
- 清场奖励与 PF 判定逻辑冲突（PF 是"波次开始时 enemies 为空"，清场是"波次结束后清空"——两者独立，但如果设计要求统一，需讨论）。
- `CLEAR_BONUS_GOLD: 30` 数值过高/过低，影响经济平衡——先实现机制，数值后续调优。
- DOM 中 `ui.nextWaveInfo` 元素不存在或 ID 不同（需检查 `index.html` 确认实际 DOM id）。

## Maintenance notes

- 清场倒计时在 DOM 中显示，会覆盖正常的"下波倒计时"文本。当 `clearBonusTimer` 归零后，`syncUI` 恢复正常逻辑。
- 清场倒计时与波次间隔（12 秒）重叠：清场 8 秒 + 4 秒缓冲。如果玩家在清场倒计时内清空，仍有 4 秒等待下一波。
- 如果未来增加"加速召唤下一波"功能，`clearBonusTimer` 应在提前召唤时归零（新波开始，旧清场机会消失）。
- PF 判定和清场奖励是独立的：PF 鼓励"波次开始前清空"，清场鼓励"波次结束后快速清空"。两者可叠加。