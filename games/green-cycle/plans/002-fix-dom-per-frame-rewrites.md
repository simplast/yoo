# Plan 002: 修复 Game.syncUI 每帧 60Hz DOM 重写

> **执行者须知**：按步执行，每一步都跑验证命令并确认结果再继续。若触发 "STOP 条件" 中的任何一条，立即停止并汇报，不要自行发挥。完成后请在 `plans/README.md` 更新本计划的状态行。
>
> **漂移检查（先跑）**：`git diff --stat aca6de9..HEAD -- src/game/Game.ts`
> 若 Game.ts 有变更，对照 "Current state" 的代码片段与现行代码比较；不一致即按 STOP 处理。

## Status

- **Priority**: P1
- **Effort**: M（约 1 个工作日）
- **Risk**: LOW（重构同步逻辑，不改游戏行为）
- **Depends on**: 无（但若 001 系统测试尚未落地，强烈建议先完成 001）
- **Category**: perf
- **Planned at**: commit `aca6de9`, 2026-06-21

## Why this matters

`Game.syncUI()` 在每帧的 `update()` 末尾被无条件调用（[Game.ts:188](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L188)）。它对 ~25 个 DOM 节点做 `textContent`/`style` 写入，其中最贵的是选中塔信息面板的 `showTowerInfo(tower)`：

- 即使是普通塔，60Hz 重写 `tower-info` 内部 7 个 `<span>` 的 `textContent` 也不便宜
- 对成长塔，60Hz 调 `renderSkillTree(tower)` 每次都 `ui.tiSkillList.innerHTML = ''` 再 append 4-8 个新 `<div>`（[Game.ts:807-838](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L807-L838)）
- 多选合成时 `ui.tiRecipeList.innerHTML = ''` + N 个 `<div>` 同样 60Hz 重写

DOM 反复 innerHTML='' 在大量敌人 + 选中成长塔时会让输入延迟明显（特别是雷电塔 / 暴风雨塔每次攻击伴随 `createDamageText`，CD 数字一直在变）。本计划将"高频小变化"和"低频大变化"分离，保留视觉更新但减少写入。

## Current state

**关键文件**：`src/game/Game.ts`

调用关系：
- `update(dt)` → `this.render()` → `this.syncUI()` ([Game.ts:187-188](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L187-L188))
- `syncUI()` ([Game.ts:571-638](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L571-L638))：
  - 写 5 个 `<span>` 数值（gold/wood/pop/wave/pf）
  - 写 pressure bar width
  - 写 next-wave-info 文字 + 颜色
  - 写 wave-banner 文字 + class
  - 写 3 个技能按钮的 CD 文字 + disabled
  - 写 pause 按钮 text
  - **如果选中了塔**：调 `showTowerInfo(tower)`（每帧）

`showTowerInfo` ([Game.ts:652-692](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L652-L692))：
- 写 6 个 `<span>` (tiName / tiLevel / tiDmg / tiAs / tiRange / tiType)
- 写 tiUpgrade textContent + disabled + style.display
- 写 tiSell style.display
- 写 tiCombineSection style.display
- 若成长塔：调 `showGrowthInfo` → `renderSkillTree`（`innerHTML = ''` + N 个新节点）

`renderSkillTree` ([Game.ts:805-839](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L805-L839))：每帧重建整个技能列表 DOM。

`showCombineInfo` ([Game.ts:695-775](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L695-L775))：每帧重建 `tiRecipeList`（7 个配方 × N 节点）。

**项目约定**：
- DOM 节点引用集中在 `UIElements` interface ([Game.ts:877-928](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L877-L928))，由 `main.ts` 注入
- 中文注释风格（保持一致）
- 严格 TS；不开新依赖
- `vitest` 已就位（虽然本计划不写新测试，但不要破坏现有 44 个测试）

## Commands you will need

| 用途 | 命令 | 期望结果 |
|------|------|---------|
| 安装 | `npm install` | exit 0 |
| 类型检查 | `npm run typecheck` | exit 0 |
| 测试 | `npm test` | exit 0，所有用例通过 |
| Lint | `npm run lint` | exit 0 |
| 格式检查 | `npm run format:check` | exit 0 |
| Dev 服务器（手测） | `npm run dev` | localhost:5173 可访问 |

## Scope

**In scope**：
- `src/game/Game.ts`（**唯一**生产代码改动）
  - 重构 `syncUI` / `showTowerInfo` / `showGrowthInfo` / `renderSkillTree` / `showCombineInfo`
  - 引入"上次同步值"快照（在 `Game` 类私有字段或 `GameState` 中）
  - 拆分"低频同步"（技能树 / 配方列表 / 升级按钮）和"高频同步"（CD 数字 / 经验条 / 伤害数字）

**Out of scope**（不要碰）：
- 任何 `src/render/*.ts`（Canvas 绘制，不在 DOM 优化范围）
- `src/input/InputManager.ts`、`src/main.ts`（只读）
- 任何 `src/systems/*.ts` 与 `src/entities/*.ts`
- 不引入新依赖（如 lit / preact / morphdom）

## Git workflow

- 分支：`advisor/002-fix-dom-per-frame-rewrites`
- 提交风格：conventional commits，例：`perf(ui): cache skill-tree DOM rebuilds in Game.syncUI`
- 一次性提交或按"快照字段 + 高频同步 / 低频同步拆分"分两次提交
- **不要** push 或开 PR

## Steps

### Step 1：在 `Game` 类加"上次同步值"快照字段

在 `private ui: UIElements;` 后面、`private saveData: SaveData;` 前面，加：

```ts
// 上次同步快照（避免 60Hz 不必要 DOM 写入）
private lastSync = {
  gold: -1, wood: -1, pop: -1, popMax: -1, pf: -1, waveIndex: -1, endless: false,
  pressurePct: -1,
  nextWaveText: '', nextWaveColor: '',
  waveBanner: '',
  skillBlastCd: -1, skillSlowCd: -1, skillSummonCd: -1,
  phase: '' as GamePhase,
  selectedTowerId: -2, // 哨兵：与 selectedTowerId=-1 区分
  growthRenderKey: '',  // 由 (tower.instanceId, tower.level, tower.attrPoints, skillPoints, skillLevels) 拼成；不含 exp
  combineRenderKey: '', // 由 selectedTowerIds 排序后拼成
  popText: '',          // 完整的 pop/popMax 字符串
};
```

> 关键：`selectedTowerId === -1` 表示无选，`-2` 表示"从未同步过"，强制首次重建技能树/合成面板

**Verify**：`npm run typecheck` → exit 0。

### Step 2：拆分 `syncUI` 为"低频"与"高频"两段

把现在的 `syncUI()` 拆成两个方法：

```ts
/** 60Hz：只更新会变动的数值/进度条/CD 文字 / 经验条 */
private syncUIHot() {
  // gold / wood / pop / popMax / pf / waveIndex / endless / pressure
  // nextWaveText / nextWaveColor / waveBanner
  // skillBlast / skillSlow / skillSummon 的 CD 文字
  // pause 按钮 text
  // 成长塔经验条 / 经验数字（growthRenderKey 不变时仍然要更新）
}

/** 低频（事件驱动）：技能树 / 合成面板 / 升级按钮 / 选中塔静态信息 / 结束遮罩 */
private syncUICold() {
  // 选中塔切换、合成面板的 selectedTowerIds 变化、波次横幅出现/消失
  // 升级按钮 text、disabled 状态
  // 塔分类色 / 名称 / 等级
  // 游戏结束遮罩（phase 变为 won/lost）
}
```

保留 `syncUI()` 作为入口，避免 constructor / startGame / togglePause 等现有调用点失效：

```ts
private syncUI() {
  this.syncUIHot();
  this.syncUICold();
}
```

`update(dt)` 末尾保持：

```ts
this.syncUI();
```

并在每个 `syncUIHot` / `syncUICold` 内部对每个写入用 `if (this.lastSync.X !== newX) { ...; this.lastSync.X = newX; }` 守护。

**Verify**：`npm run typecheck` → exit 0；`npm test` → exit 0（确保没破坏既有测试）。

### Step 3：缓存 `showTowerInfo` 的"重渲染键"

塔静态信息（名字 / 等级 / 伤害 / 攻速 / 射程 / 类型）只在该塔的 `(instanceId, level, isGrowth, attrPoints, skillPoints, skillLevels)` 变化时重写。`exp`  intentionally 不包含在键中，因为经验条/经验数字由 `syncUIHot` 每帧单独更新。重渲染键：

```ts
function makeGrowthKey(t: Tower): string {
  return [t.level, t.attrPoints, t.skillPoints, ...Object.entries(t.skillLevels ?? {}).sort()].join('|');
}
```

在 `syncUICold` 内：

```ts
const t = state.getTowerById(state.selectedTowerId);
if (t) {
  const key = `${t.instanceId}:${t.isGrowth ? makeGrowthKey(t) : 'static'}`;
  if (this.lastSync.selectedTowerId !== t.instanceId || this.lastSync.growthRenderKey !== key) {
    this.showTowerInfo(t);
    this.lastSync.selectedTowerId = t.instanceId;
    this.lastSync.growthRenderKey = key;
  }
} else if (this.lastSync.selectedTowerId !== -1) {
  this.ui.towerInfo.classList.remove('show');
  this.lastSync.selectedTowerId = -1;
}
```

> 注意：`showGrowthInfo` 中的经验条（`tiExp` / `tiExpFill`）要抽离到 `syncUIHot`，因为 `growthRenderKey` 不再随 `exp` 变化而触发重建。

**Verify**：`npm run typecheck` → exit 0；`npm test` → exit 0。

### Step 4：缓存 `renderSkillTree` 与 `showCombineInfo`

`renderSkillTree` 的整表重建逻辑保持不变，但调用由 `syncUICold` 控制：只有 `growthRenderKey` 变化时才调用；键不变时**什么都不做**。

> 实现方式：在 `syncUICold` 中比较 `lastSync.growthRenderKey`；只有变化时才调用 `this.showTowerInfo(t)`。`showTowerInfo` 内部按现状调用 `showGrowthInfo` → `renderSkillTree(tower)`。`growthRenderKey` 已包含 `skillLevels`，因此技能等级变化会正确触发重建。

`showCombineInfo` 同理：在 `syncUICold` 中比较 `combineRenderKey = selectedTowerIds.slice().sort((a, b) => a - b).join(',')`；当 `selectedTowerId` 变化、`growthRenderKey` 变化或 `combineRenderKey` 变化时，才调用 `this.showTowerInfo(t)`（内部会进入 `showCombineInfo`）。

**Verify**：`npm run typecheck` → exit 0；`npm test` → exit 0。

### Step 5：手测验证视觉无回退

1. 启动 dev 服务器：`npm run dev`
2. 开游戏 → 选"普通" → 开始
3. 场景：
   - 选一座普通塔：升级按钮、攻速、伤害应正确刷新
   - 选一座成长塔：技能列表出现，加技能点后 `+` 按钮应可用
   - Shift+点多个塔：合成面板出现，配方列表出现
   - 拖动框选：选中塔变化时面板正确切换
4. 长时间运行（5+ 分钟）观察：
   - 浏览器开发者工具 → Performance → 录制 5 秒
   - "Scripting" + "Rendering" 总和应显著低于重构前（粗略量级 < 30% 改善即可接受）

**Verify**：
- 视觉与重构前一致（无回退）
- 经验条、CD 数字仍然每帧流畅更新
- 选中塔属性 / 技能等级 / 配方列表的事件驱动更新仍然正确
- `npm run lint` → exit 0

### Step 6：跑全套并自检

```bash
npm run typecheck
npm run lint
npm test
npm run format:check
```

**Verify**：四个命令全部 exit 0。

## Test plan

本计划**不新增测试**（行为对玩家无变化，是性能优化）。但要确保：

- 现有 44 个测试全过
- 任何手工手测步骤发现的行为回退，按发现的具体场景添加最小测试到 `src/game/Game.test.ts`（新建）或在 `syncUI` 抽离出可测纯函数后写

> 如果发现 `showTowerInfo` / `showGrowthInfo` 的某些分支难以靠手动验证，可在重构过程中把这些方法改为"输入 state + ui 引用，输出 {updates: [...]} 纯函数"，再加单测。

## Done criteria

机器可验证，**全部**必须满足：

- [ ] `npm run typecheck` exit 0
- [ ] `npm run lint` exit 0
- [ ] `npm test` exit 0（44 个老测试 + 任何 001 阶段新增测试）
- [ ] `npm run format:check` exit 0
- [ ] `src/game/Game.ts` 是本计划唯一改动的生产文件（`git status`）
- [ ] `syncUIHot` / `syncUICold` 内所有 DOM 写入都包了"上次值"对比（grep 验证）
- [ ] 手动 5 分钟游戏运行无视觉回退（依赖手测；记录在 PR 描述里）
- [ ] `plans/README.md` 第 002 行状态更新为 DONE

## STOP conditions

立即停下并汇报，不要自行发挥：

- "Current state" 中列出的代码位置或行号与现行不一致
- 重构过程中发现 `syncUI` 内部逻辑和 `showTowerInfo` 之外的私有方法有强耦合（如读 `state` 而非 `ui`），先把耦合解掉再继续
- 性能优化破坏视觉（如升级按钮没禁用、CD 数字不更新）
- 验证连续失败 2 次且修复尝试合理后仍失败
- 发现需要 mock 整个 DOM（jsdom）才能写单测的——这是设计问题，先停下报告而不是引依赖

## Maintenance notes

- `lastSync` 字段是 Game 实例的私有状态；如果未来加多人模式（房间共享状态），需重新审视
- 任何新增的"动态" UI 字段（如新增资源、新增 CD 数字），要在 `lastSync` 加对应字段并在 `syncUIHot` 守护
- `growthRenderKey`  intentionally 不包含 `exp`；经验条由 `syncUIHot` 单独更新。若未来需要在经验条变化时也重建技能树，再把 `exp` 加入键中
- 若把 `showTowerInfo` 抽成纯函数（建议的后续工作），可单测覆盖各种 tower 状态

<!-- review-passed: true, reviewer: subagent-002-reviewer, at: 2026-06-21T02:19:19+08:00 -->
