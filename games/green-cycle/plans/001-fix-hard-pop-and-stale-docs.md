# Plan 001: 修复 hard 难度人口上限为负数 + 纠正过时文档

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bc95bc..HEAD -- src/config.ts src/game/State.ts AGENT.md docs/progress/completed.md docs/proposal/original-design.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug + docs
- **Planned at**: commit `7bc95bc`, 2026-06-20

## Why this matters

hard 难度人口上限计算结果为 -2，导致玩家通关 normal 解锁 hard 后完全无法建造任何塔（所有塔 popCost >= 1），整个 hard 模式不可玩。同时 AGENT.md 声称"M7 完成，M8-M9 待开发"，而实际 M8/M9/M10 均已完成，会误导后续开发者误判项目基线。这两项都是极低成本的基线纠正，应最先落地。

## Current state

### BUG: hard 人口上限为负

`src/config.ts:21-29` — 起始人口与难度调整常量：

```ts
START_POP: { easy: 12, normal: 10, hard: 8 },
// ...
DIFF_POP: { easy: 10, normal: 0, hard: -10 },
```

`src/game/State.ts:176-185` — `initDifficulty` 计算人口上限：

```ts
initDifficulty(diff: Difficulty, endless = false) {
    this.difficulty = diff;
    this.endless = endless;
    this.gold = CONFIG.START_GOLD[diff];
    this.wood = CONFIG.START_WOOD[diff];
    this.popMax = CONFIG.START_POP[diff] + CONFIG.DIFF_POP[diff];
    // hard: 8 + (-10) = -2  ← BUG
```

三种难度的 popMax 计算结果：
- easy: 12 + 10 = 22
- normal: 10 + 0 = 10
- hard: 8 + (-10) = **-2** ← BUG

### DOCS: AGENT.md 进度过时

`AGENT.md:13` — 当前内容：

```
| 当前进度 | M7 完成（合成系统），M8-M9 待开发 |
```

而 `docs/progress/completed.md:8-16` 显示：

```
| M8 | 存档与难度 | ✅ 完成 |
| M9 | 音效/UI/性能 | ✅ 完成 |
| M10 | UI 资源优化（SVG） | ✅ 完成 |
```

### DOCS: 构建产物路径不一致

`vite.config.ts:10` 实际输出路径为 `../../public/games/green-cycle/`，但：
- `docs/progress/completed.md:25` 写 `vite build 输出 dist/index.html`
- `docs/proposal/original-design.md:17` 写 `输出 dist/index.html（79KB...）`
- `docs/proposal/original-design.md:55` 验证状态写 `dist/index.html`

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npm run typecheck`    | exit 0, no errors   |
| Build     | `npm run build`        | exit 0,产物生成     |

## Scope

**In scope**:
- `src/config.ts` — 修正 DIFF_POP.hard
- `AGENT.md` — 更新当前进度
- `docs/progress/completed.md` — 修正构建产物路径描述
- `docs/proposal/original-design.md` — 标注历史路径（归档文档，加注释说明）

**Out of scope**:
- `src/game/State.ts` — initDifficulty 逻辑本身正确，只是输入常量有误，不改 State
- `vite.config.ts` — 实际输出路径正确，不改
- 任何玩法数值调整

## Steps

### Step 1: 修复 DIFF_POP.hard

打开 `src/config.ts`，将 `DIFF_POP` 的 hard 值从 `-10` 改为 `0`。

修正后应为：

```ts
DIFF_POP: { easy: 10, normal: 0, hard: 0 },
```

设计意图：`START_POP` 已经体现了难度差异（easy 12 / normal 10 / hard 8），`DIFF_POP` 是额外调整。hard 不应再额外扣减到负数。如果后续测试发现 hard 太简单，可将 `DIFF_POP.hard` 设置为 `-2`（得到 popMax=6），或直接调整 `START_POP.hard`。

**跨计划行号偏移**：如果 Plan 003 已执行（在 `config.ts` 第 17 行后新增了 `MAX_ENEMIES_BY_DIFF`），本计划 Step 1 引用的 `DIFF_POP` 行号从 29 变为 30。执行前用 `grep -n "DIFF_POP" src/config.ts` 确认实际行号。

**Verify**: `npm run typecheck` → exit 0

### Step 2: 更新 AGENT.md 当前进度

打开 `AGENT.md`，找到第 13 行：

```
| 当前进度 | M7 完成（合成系统），M8-M9 待开发 |
```

替换为：

```
| 当前进度 | M10 完成（UI 资源 SVG 化），后续优化见 plans/ |
```

**Verify**: 用 Read 工具确认 `AGENT.md` 第 13 行已更新。

### Step 3: 修正 completed.md 构建产物路径

打开 `docs/progress/completed.md`，找到第 25 行附近：

```
- **单文件产物**：`vite build` 输出 `dist/index.html`（JS/CSS 全内联）
```

替换为：

```
- **单文件产物**：`vite build` 输出 `../../public/games/green-cycle/index.html`（JS/CSS 全内联）
```

注意：各里程碑验证状态中引用的 `dist/index.html` 是历史记录（早期确实输出到 dist），保留不动。只修正 M0-M4 概述中描述当前构建行为的这一行。

**Verify**: 用 Read 工具确认该行已更新。

### Step 4: 标注 original-design.md 为历史归档

打开 `docs/proposal/original-design.md`，该文件开头已有归档说明（第 1-5 行）。在第 17 行 `单文件产物` 描述前添加历史标注，将：

```
- **单文件产物**：`vite build` 输出 `dist/index.html`（79KB，JS/CSS 全内联）
```

改为：

```
- **单文件产物**（历史）：`vite build` 输出 `dist/index.html`（79KB，JS/CSS 全内联）。当前输出路径已改为 `../../public/games/green-cycle/`，见 vite.config.ts
```

**Verify**: 用 Read 工具确认该行已更新。

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] `src/config.ts` 中 `DIFF_POP.hard` 不再为负数
- [ ] `AGENT.md` 当前进度行反映 M10 已完成
- [ ] `docs/progress/completed.md` 概述行构建路径与 `vite.config.ts` 一致
- [ ] `docs/proposal/original-design.md` 构建路径标注为历史
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `src/config.ts` 或 `src/game/State.ts` 的代码结构与上述 excerpt 不符（已漂移）。
- 修正 `DIFF_POP.hard` 后 typecheck 报错（说明有其他代码硬依赖了 -10 这个值）。
- `AGENT.md` 的表格结构与 excerpt 不符（已被重构）。

## Maintenance notes

- 后续难度调优应统一在 `config.ts` 的 `START_POP` / `DIFF_POP` / `DIFF_HP` 等常量上操作，不要在 State.ts 中硬编码。
- `docs/proposal/` 是归档目录，记录历史设计决策，不应删除——只标注历史即可。
