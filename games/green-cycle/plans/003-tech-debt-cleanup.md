# Plan 003: 清理 4 个小型技术债

> **执行者须知**：本计划是 4 个**互相独立**的小清理，按步执行，每步独立验证。任一步骤的失败不影响其他步骤继续（按本计划要做的就回滚那一小步，停止并报告，不要扩大到其他步骤）。完成后请在 `plans/README.md` 更新本计划的状态行。
>
> **漂移检查（先跑）**：`git diff --stat aca6de9..HEAD -- src/game/Game.ts src/game/State.ts src/main.ts src/systems/EconomySystem.ts src/types.ts`
> 若上述文件有变更，对照 "Current state" 的代码片段与现行代码比较；不一致即按 STOP 处理。

## Status

- **Priority**: P1（召唤塔重构） + P3（其余 3 项）
- **Effort**: S（4 项合计不到 1 个工作日）
- **Risk**: LOW
- **Depends on**: 无
- **Category**: tech-debt
- **Planned at**: commit `aca6de9`, 2026-06-21

## Why this matters

4 个小问题，没有一个是阻塞性 bug，但合在一起让代码"不干净"，是后人改/重构时的陷阱：

1. **召唤塔负数 ID 约定** — 依赖全局随机负数空间 + 手动 `state.towers.push`（绕开 `state.addTower` 的格子占用 / 人口逻辑）。一旦未来 `nextEntityId` 改为可能返回负数（不太可能但语义脆弱），会冲突。
2. **死字段 `state.accumulator`** — 注释指向 `Loop.accumulator`，TS 没抓到是因为 class field 不被 `noUnusedLocals` 覆盖。
3. **排行榜标签/内容不一致** — UI 永远显示"无尽排行榜"，但代码在非无尽胜负也写入。
4. **无变更写入** — `recordResult` 每次胜/负都覆盖写 localStorage（即使没变化）。

## Current state

**关键代码位置**：

[Game.ts:521-534](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L521-L534)（召唤塔）：
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
  state.summonTimer = CONFIG.SKILL_SUMMON_DURATION;
  state.towers.push(t);   // ← 绕开 state.addTower（不占格子/不加人口）
  audio.playSkillSummon();
}
```

[EconomySystem.ts:23-31](file:///Users/doer/dev/yoo/games/green-cycle/src/systems/EconomySystem.ts#L23-L31)（召唤到期清理）：
```ts
if (state.summonTimer > 0) {
  state.summonTimer = Math.max(0, state.summonTimer - dt);
  if (state.summonTimer <= 0 && state.summonTowerId !== -1) {
    const tower = state.towers.find((t) => t.instanceId === state.summonTowerId);
    if (tower) state.removeTower(tower);
    state.summonTowerId = -1;
  }
}
```

[State.ts:113](file:///Users/doer/dev/yoo/games/green-cycle/src/game/State.ts#L113)（死字段）：
```ts
// ===== 游戏速度 =====
speed = 1; // 1/2/3
accumulator = 0; // 固定步长累加
```

[Game.ts:486-501](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L486-L501)（排行榜写入）：
```ts
// 无尽模式记录排行榜
if (state.endless || won) {
  const score = state.endless ? state.waveIndex * 100 + state.pf * 10 : state.pf * 100;
  this.saveData.leaderboard.endless.push({
    wave: state.waveIndex,
    score,
    date: Date.now(),
  });
  // 按分数降序保留前 10
  this.saveData.leaderboard.endless.sort((a, b) => b.score - a.score);
  this.saveData.leaderboard.endless = this.saveData.leaderboard.endless.slice(0, 10);
}

this.saveProgress();
```

[main.ts:124-139](file:///Users/doer/dev/yoo/games/green-cycle/src/main.ts#L124-L139)（UI 固定标签）：
```ts
ui.leaderboard.innerHTML =
  '<div class="lb-title">无尽排行榜</div>' +
  records.map(...).join('');
```

**项目约定**：
- 中文注释
- 严格 TS，不开新依赖
- 现有测试 44 个（`vitest run`）；本计划可以补 1-2 个单测，但**不强制**

## Commands you will need

| 用途 | 命令 | 期望结果 |
|------|------|---------|
| 类型检查 | `npm run typecheck` | exit 0 |
| 测试 | `npm test` | exit 0 |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope**（每个步骤都是独立子集）：

- Step 1：`src/game/Game.ts` + `src/systems/EconomySystem.ts`（召唤塔重构）
- Step 2：`src/game/State.ts`（删死字段）
- Step 3：`src/game/Game.ts`（修排行榜条件） + `src/main.ts`（加注释说明标题与内容一致）
- Step 4：`src/game/Game.ts`（save 写入去抖）

**Out of scope**：
- `src/entities/Tower.ts` / `HeroTower.ts`（不改实体工厂与属性计算）
- 任何其他文件

> 注：`src/types.ts` 在 Step 1 中需新增可选字段 `isTemporary`；AGENT.md 约定 "types.ts 只增不改现有字段"，新增可选字段符合该约定。

## Git workflow

- 分支：`advisor/003-tech-debt-cleanup`
- 每个 Step 一个 commit：`refactor(summon): use isTemporary flag instead of negative id`
- 完成后 push 或开 PR 由操作员决定

## Steps

### Step 1：召唤塔用 `isTemporary` 标记替换负数 ID

**A. 在 `src/types.ts` 的 `Tower` interface 末尾加一个字段**（types.ts 已有"只增不改"约定，参考 [types.ts:151-176](file:///Users/doer/dev/yoo/games/green-cycle/src/types.ts#L151-L176)）：

```ts
/** 临时塔标记（召唤技能等），到期自动移除，不占人口/格子 */
isTemporary?: boolean;
```

> 注意：types.ts 已有"types.ts 只增不改现有字段"约定（AGENT.md 提）；新增字段符合此约定。

**B. 重构 `Game.useSkill('summon')`（[Game.ts:521-534](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L521-L534)）**：

```ts
} else if (type === 'summon' && state.skillSummonCd <= 0) {
  state.skillSummonCd = CONFIG.SKILL_SUMMON_CD;
  const pos = state.path.getPosition(0.5);
  const t = createTower('cannon', pos.x, pos.y);
  // 临时塔：覆盖默认 level 配置为高伤单体炮台
  t.levels = [{ level: 1, damage: 200, attackSpeed: 2, range: 150, upgradeCost: 0 }];
  t.maxLevel = 1;
  t.popCost = 0;
  t.isTemporary = true;  // ← 替换负数 ID
  state.addTower(t);     // ← 走 addTower（自动 pop 累加 + markCell），popCost=0 安全
  state.summonTowerId = t.instanceId;  // 仍然记下来用于到期清理
  state.summonTimer = CONFIG.SKILL_SUMMON_DURATION;
  audio.playSkillSummon();
}
```

> 注意：原代码手动 `push` 是不想 `addTower` 累加人口 / 占用格子。现在 `popCost=0` 不会累加人口；至于格子，`markCell` 会把路径格子的 `occupied` 设为 `true`，但该格子的 `buildable=false`，建造判定会同时检查二者，因此不影响实际建造。安全。

**C. 更新到期清理（[EconomySystem.ts:23-31](file:///Users/doer/dev/yoo/games/green-cycle/src/systems/EconomySystem.ts#L23-L31)）**：用 `isTemporary` 替代按 ID 查找：

```ts
if (state.summonTimer > 0) {
  state.summonTimer = Math.max(0, state.summonTimer - dt);
  if (state.summonTimer <= 0 && state.summonTowerId !== -1) {
    const tower = state.towers.find((t) => t.instanceId === state.summonTowerId);
    if (tower && tower.isTemporary) {
      state.removeTower(tower);
    }
    state.summonTowerId = -1;
  }
}
```

> 这里仍然按 `instanceId` 找，但额外校验 `isTemporary`，避免误删正常塔（防御性）。

**D. （可选）补一个测试** `src/systems/EconomySystem.test.ts`（如果 001 已落地）：

```ts
it('removes temporary summon tower on timer expiry', () => {
  const state = makeState();
  const t = createTower('cannon', 100, 100);
  t.isTemporary = true;
  state.addTower(t);
  state.summonTowerId = t.instanceId;
  state.summonTimer = 0.01;
  EconomySystem.update(state, 0.02);
  expect(state.towers).toHaveLength(0);
  expect(state.summonTowerId).toBe(-1);
});
```

> 若 001 尚未完成（未建 EconomySystem.test.ts），可跳过此步；本计划不强制要求新增测试。

**Verify**：
- `npm run typecheck` → exit 0
- `npm test` → exit 0
- `grep -n "Math.random.*-100000" src/game/Game.ts` → 无匹配（确认负数 ID 已删）
- `grep -n "isTemporary" src/` 至少 3 处（types / Game.ts / EconomySystem.ts）

### Step 2：删除死字段 `state.accumulator`

**A. 在 [State.ts:108-113](file:///Users/doer/dev/yoo/games/green-cycle/src/game/State.ts#L108-L113) 区域**：

```ts
// ===== 游戏速度 =====
speed = 1; // 1/2/3
accumulator = 0; // 固定步长累加  ← 删除此行
```

> 验证：搜 `accumulator` 在 src/ 的引用（已知 `Loop.ts` 有自己的 `accumulator`，与 state 无关）。

**Verify**：
- `grep -n "state.accumulator\|this.accumulator" src/game/State.ts` → 无匹配
- `npm run typecheck` → exit 0
- `npm test` → exit 0

### Step 3：修排行榜条件 + 标签一致性注释

**A. 在 [Game.ts:486-499](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L486-L499)**，把"非无尽胜负"也写入排行榜的逻辑收紧：

原：
```ts
if (state.endless || won) {
  const score = state.endless ? state.waveIndex * 100 + state.pf * 10 : state.pf * 100;
  ...
}
```

改为（**只**在无尽模式写入，因为 UI 标"无尽排行榜"）：

```ts
if (state.endless) {
  const score = state.waveIndex * 100 + state.pf * 10;
  this.saveData.leaderboard.endless.push({
    wave: state.waveIndex,
    score,
    date: Date.now(),
  });
  this.saveData.leaderboard.endless.sort((a, b) => b.score - a.score);
  this.saveData.leaderboard.endless = this.saveData.leaderboard.endless.slice(0, 10);
}
```

> 这是行为变更（"非无尽胜利"不再写排行榜）。从审计角度看是修 bug；从玩家角度看可能让"通关普通难度的成绩"消失。`SaveManager.test.ts` 没有相关断言，所以不会破坏测试。若需要保留原行为，更安全的做法是**只**在 `won && !endless` 时插入"普通胜利榜"，并加新字段 `leaderboard.normal: { wave, score, date }[]` —— 但本计划走"只修 bug"路线。

**B. 在 [main.ts:124-139](file:///Users/doer/dev/yoo/games/green-cycle/src/main.ts#L124-L139)**：

`syncMenu` 只有 `save` 数据、拿不到当前对局 `state.endless`。Step 3 A 已把排行榜写入收敛到仅无尽模式，因此标题与内容天然一致，只需加注释说明：

```ts
// 渲染排行榜（仅写入无尽记录，标题与内容一致）
const records = save.leaderboard.endless.slice(0, 5);
if (records.length === 0) {
  ui.leaderboard.innerHTML =
    '<div class="lb-title">无尽排行榜</div><div class="lb-empty">暂无记录</div>';
} else {
  ui.leaderboard.innerHTML =
    '<div class="lb-title">无尽排行榜</div>' +
    records
      .map((r, i) => {
        const date = new Date(r.date);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
        return `<div class="lb-row">${i + 1}. ${r.wave}波 / ${r.score}分 — ${dateStr}</div>`;
      })
      .join('');
}
```

> 保守方案：保持标题 "无尽排行榜" 不变，仅添加注释说明与 Step 3 A 的收敛逻辑一致。不要引入 `records[0].wave >= 51` 之类的启发式标题切换。

**Verify**：
- `grep -n "leaderboard.endless.push" src/game/Game.ts` 应只出现在 `if (state.endless)` 块内
- `npm run typecheck` → exit 0
- `npm test` → exit 0

### Step 4：save 写入去抖

**A. 在 [Game.ts:457-460](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L457-L460)**：

```ts
/** 保存当前存档（仅在数据有变化时写入） */
private saveProgress(): void {
  // 去抖：上次序列化结果相同则跳过
  const serialized = JSON.stringify(this.saveData);
  if (serialized === this.lastSaved) return;
  this.lastSaved = serialized;
  SaveManager.save(this.saveData);
}
```

**B. 在 `Game` 类加 `private lastSaved = '';` 字段**（[Game.ts:62-72](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L62-L72) 区域附近）。

**Verify**：
- `npm run typecheck` → exit 0
- `npm test` → exit 0
- `grep -n "lastSaved" src/game/Game.ts` 至少 2 处（字段 + 方法内引用）

### Step 5：跑全套并自检

```bash
npm run typecheck
npm run lint
npm test
```

**Verify**：三个命令全部 exit 0。

## Test plan

- Step 1 可选测试（若 001 落地了 EconomySystem.test.ts）
- 其余 Step 无新测试需求（行为变化已用 typecheck + 现有测试覆盖）

## Done criteria

机器可验证，**全部**必须满足：

- [ ] `npm run typecheck` exit 0
- [ ] `npm run lint` exit 0
- [ ] `npm test` exit 0
- [ ] `git status` 仅显示本计划范围内的文件改动
- [ ] `grep -n "Math.random.*-100000" src/` 无匹配
- [ ] `grep -n "accumulator = 0" src/game/State.ts` 无匹配
- [ ] `grep -n "leaderboard.endless.push" src/game/Game.ts` 只在 `if (state.endless)` 分支
- [ ] `grep -n "lastSaved" src/game/Game.ts` 至少 2 处
- [ ] `plans/README.md` 第 003 行状态更新为 DONE

## STOP conditions

立即停下并汇报，不要自行发挥：

- "Current state" 中列出的代码位置或行号与现行不一致
- Step 1 改动破坏 `addTower` 行为（如测试中 `addTower` 真的累加人口导致 `pop > popMax` 报错）→ 回滚 Step 1
- 验证连续失败 2 次且修复尝试合理后仍失败
- Step 3 排行榜条件改动触发 `SaveManager.test.ts` 失败 → 回滚 Step 3
- 任何步骤扩展到 out-of-scope 文件

## Maintenance notes

- `isTemporary` 字段是 `Tower` 公共类型的一部分；未来其他临时效果（"幻影塔"、"测试沙盒"）可以复用
- 排行榜拆分为 `endless` / `normal` / `hard` 三个榜单是 D3 方向发现的具体化；本计划只是把 `endless` 收敛干净
- `lastSaved` 字段在 `startGame` 重置时**不**需要重置（`saveData` 替换时序列化结果会自动变化）；但若未来引入"热重载存档"功能，需要重新审视

<!-- review-passed: true, reviewer: subagent-plan-review, at: 2026-06-21T02:16:55+08:00 -->
