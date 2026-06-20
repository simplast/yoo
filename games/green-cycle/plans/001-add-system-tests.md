# Plan 001: 为 8 个核心系统补单元测试

> **执行者须知**：按步执行，每一步都跑验证命令并确认结果再继续。若触发 "STOP 条件" 中的任何一条，立即停止并汇报，不要自行发挥。完成后请在 `plans/README.md` 更新本计划的状态行。
>
> **漂移检查（先跑）**：`git diff --stat aca6de9..HEAD -- src/systems src/entities`
> 若上述路径有变更，对照 "Current state" 的代码片段与现行代码比较；不一致即按 STOP 处理。

## Status

- **Priority**: P1
- **Effort**: M（约 1 个工作日）
- **Risk**: LOW（纯新增，不改生产逻辑）
- **Depends on**: 无
- **Category**: tests
- **Planned at**: commit `aca6de9`, 2026-06-21

## Why this matters

8 个系统（Wave/Movement/TowerAI/Combat/Aura/Skill/Effect/Economy）承担整个游戏玩法的正确性（伤害结算、索敌、波次、buff 叠加、技能自动释放、Boss 超时、清场奖励等），但**完全没有任何单元测试**。`vitest.config.ts` 已就位，`State.test.ts` 等 6 个测试文件已建立结构范式。补齐系统测试可以在后续重构/性能优化（如本批的 002、003）落地时立即捕获回归。

## Current state

- 项目根：`/Users/doer/dev/yoo/games/green-cycle/`
- 测试运行命令：`npm test` → `vitest run`（CI 友好，无 watch）
- 现有测试（结构范式）：`src/game/State.test.ts`、`src/utils/BuffUtil.test.ts`、`src/utils/Path.test.ts`、`src/utils/Quadtree.test.ts`、`src/utils/RecipeUtil.test.ts`、`src/utils/SaveManager.test.ts`
- 测试模式：vitest `describe / it / expect`，无第三方 mock 库（手写 stub 或 `vi.stubGlobal`）
- 严格 TS 配置：`tsconfig.json` 启用 `strict`、`noUnusedLocals`、`noUnusedParameters`
- 系统代码位置与行数（要测的代码）：
  - `src/systems/WaveSystem.ts` — 172 行；导出 `update(state, dt)`；内部 `startNextWave` / `endWave` / `generateEndlessWave`
  - `src/systems/MovementSystem.ts` — 75 行；导出 `update(state, dt)`
  - `src/systems/TowerAISystem.ts` — 195 行；导出 `update(state, dt)`；内部 `getStat` / `getHitDebuff` / `selectTarget`（私有）
  - `src/systems/CombatSystem.ts` — 184 行；导出 `applyDamage` 与 `update`
  - `src/systems/AuraSystem.ts` — 78 行；导出 `update`
  - `src/systems/SkillSystem.ts` — 226 行；导出 `applyPassiveOnAttack` 与 `update`
  - `src/systems/EffectSystem.ts` — 45 行；导出 `update`
  - `src/systems/EconomySystem.ts` — 61 行；导出 `update`

**关键共享类型**（`src/types.ts`）：
- `Enemy`、`Tower`、`Projectile`、`Effect`、`Buff`、`Recipe`、`SkillDef` 等

**共享工厂与表**（测试需要引用）：
- `createEnemy(defId, path, difficulty, pool?)`、`createTower(defId, x, y)`、`createProjectile(opts, pool?)`、`createHeroTower(defId, x, y)`
- `ENEMIES`（`src/data/enemies.ts`）、`TOWERS`（`src/data/towers.ts`）、`WAVES`（`src/data/waves.ts`）、`SKILLS`（`src/data/skills.ts`）、`HERO_SKILLS`（同文件）
- `CONFIG`（`src/config.ts`）
- `Path.createLoopPath(1280, 720, 80, 320)` — 标准的环形路径工厂

**项目约定**（从现有测试与代码风格总结）：
- 测试文件命名 `<subject>.test.ts`，与被测文件同目录
- 测试中用本地 helper（如 `makeState()`、`initBuildCells()`）创建最小状态，不要从全局 import state
- 不使用 `vi.mock` 整个模块；只 `vi.fn()` 替换具体方法（如 `vi.stubGlobal('localStorage', ...)`）
- 中文注释；测试描述可用中文或英文，保持风格一致

## Commands you will need

| 用途 | 命令 | 期望结果 |
|------|------|---------|
| 安装 | `npm install` | exit 0 |
| 类型检查 | `npm run typecheck` | exit 0，0 errors |
| 运行单个测试文件 | `npx vitest run src/systems/WaveSystem.test.ts` | exit 0，所有用例通过 |
| 跑全套 | `npm test` | exit 0；之前 44 + 新增用例全通过 |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope**（只新增测试文件，不要改生产代码）：
- `src/systems/WaveSystem.test.ts`（新建）
- `src/systems/MovementSystem.test.ts`（新建）
- `src/systems/TowerAISystem.test.ts`（新建）
- `src/systems/CombatSystem.test.ts`（新建）
- `src/systems/AuraSystem.test.ts`（新建）
- `src/systems/SkillSystem.test.ts`（新建）
- `src/systems/EffectSystem.test.ts`（新建）
- `src/systems/EconomySystem.test.ts`（新建）
- 必要的 helper 文件 `src/test-helpers.ts`（新建，可选；如果每个测试文件都重写 makeState 太多，可以提到一个共享 helper）

**Out of scope**（不要碰，即使看起来相关）：
- 任何 `src/systems/*.ts` 生产文件
- 任何 `src/entities/*.ts` 与 `src/utils/*.ts`
- Renderer / InputManager / Game（已超出本计划范围；如需覆盖可另立计划）
- 删除/重命名现有 6 个测试文件

## Git workflow

- 分支：`advisor/001-add-system-tests`（或仓库主分支名）
- 提交风格（参考 `git log --oneline -20`）：conventional commits 风格，如 `test(systems): add WaveSystem / MovementSystem coverage`
- 每完成一个系统文件就提交一次，commit message 形如 `test(combat): add applyDamage and projectile hit cases`
- **不要** push 或开 PR，除非操作员明确要求

## Steps

### Step 1：建立共享测试 helper（可选）

如果决定把 `makeState()`、`makeEnemy()`、`makeTower()` 等提到 `src/test-helpers.ts`：

```ts
// src/test-helpers.ts —— 仅为测试提供工厂，禁止在生产代码 import
import { GameState } from './game/State';
import { Path } from './utils/Path';
import { CONFIG } from './config';
import { ENEMIES } from './data/enemies';
import { nextEntityId } from './entities/Entity';
import type { Tower, Enemy, Projectile, Effect } from './types';

export function makeState(endless = false): GameState {
  const s = new GameState(Path.createLoopPath(1280, 720, 80, 320));
  s.initDifficulty('normal', endless);
  s.phase = 'battling';
  return s;
}

export function makeEnemy(overrides: Partial<Enemy> = {}): Enemy {
  // 基于 ENEMIES.grunt 提供默认值，并补齐 Enemy 运行时字段
  const def = ENEMIES['grunt'];
  return {
    ...def,
    abilities: [...def.abilities],
    instanceId: nextEntityId(),
    hp: def.baseHp,
    maxHp: def.baseHp,
    pathProgress: 0,
    speed: def.baseSpeed,
    x: 0,
    y: 0,
    alive: true,
    buffs: [],
    auraFlags: 0,
    hitFlash: 0,
    ...overrides,
  } as Enemy;
}
// ... 类似的 makeTower / makeProjectile / makeEffect
```

> 若选此路径：确保 `tsconfig.json` 排除 `src/test-helpers.ts` 不影响生产 bundle（Vite 默认只 import 图可达的；helper 只被 `*.test.ts` import 即可）。
> 也可以**不**抽 helper，让每个测试文件自己写 makeXxx，参考 `src/game/State.test.ts:8-22` 的风格。

**Verify**：`npm run typecheck` → exit 0；若建了 helper，`grep -rn "test-helpers" src/systems/*.test.ts` 至少有 1 个引用。

### Step 2：WaveSystem.test.ts

覆盖（最少 8 个用例）：
- 非 `battling` 阶段：即使 `waveActive=false`、`waveTimer=0` 也不启动波次
- `battling` 阶段且 `waveActive=false`：`waveTimer>0` 时逐帧递减，归零后触发 `startNextWave`
- 倒计时归零触发 `startNextWave`，`waveIndex=1`，`waveActive=true`
- 全部 spawn 后 `waveActive` 保持到 `enemies.length===0`（Boss 波）或立即置 false（普通波）
- 非 Boss 波：spawn 完触发 `endWave` 发放 `rewardGold`/`rewardWood`，PF+1（`waveStartEnemiesEmpty=true`）
- 非 Boss 波：spawn 完启动 `clearBonusTimer = CONFIG.CLEAR_BONUS_TIME`
- 经济波不启动 `clearBonusTimer`
- 无尽模式：第 51 波用 `WAVES[0]` 模板 + `ENDLESS_COUNT_SCALE` 倍数
- `waveIndex >= TOTAL_WAVES` 且非无尽 → `phase='won'`

**Verify**：`npx vitest run src/systems/WaveSystem.test.ts` → exit 0，所有用例 pass。

### Step 3：MovementSystem.test.ts

覆盖：
- 正常速度：speed=60，`pathProgress` 按 `speed*dt/totalLength` 推进
- 减速叠加：3 个不同源各 0.3 的 slow 累加为 0.9，被 `Math.min(0.8)` 截到 0.8
- `stopped`（freeze/stun buff）→ `speed=0` 不推进
- 全局减速（`globalSlowTimer>0`）额外加 0.5
- haste 叠加：`1+hasteTotal` 倍数
- `pathProgress>=1` 折回到 [0,1)
- `hitFlash` 倒计时归零
- buff `remaining<=0` 被从 `enemy.buffs` 移除

**Verify**：`npx vitest run src/systems/MovementSystem.test.ts` → exit 0。

### Step 4：TowerAISystem.test.ts

覆盖：
- 光环塔（category==='aura'）跳过攻击
- 冷却 > 0 跳过
- 索敌：1 敌在范围内 → 返回该敌
- 索敌：敌人含 `invisible` 能力 + 塔无 `trueSight` → 跳过
- 索敌：敌人含 `flying` + 塔无 `antiAir` → 跳过
- `selectTarget` 策略：nearest / first / strongest / weakest / priority 各一个用例
- 即时命中（`projectileSpeed<=0`）：调用 `applyDamage`、创建 hit effect、创建 damage text
- 生成投射物：`projectileSpeed>0` 时调用 `createProjectile`，`targetId` 等于敌人 `instanceId`
- `allyAuraCache` 命中时 `damage *= damageMult`
- 成长塔 `applyPassiveOnAttack`：护盾附加值

> 注意：直接调用 `TowerAISystem.update(state, dt)` 即可；不需要导出私有 `selectTarget`。
> 如果某个分支难以覆盖（如 priority 排序），就在 `state.enemies` 里塞 2-3 个不同 priority 标签的敌人。

**Verify**：`npx vitest run src/systems/TowerAISystem.test.ts` → exit 0。

### Step 5：CombatSystem.test.ts

`applyDamage` 必须覆盖（核心 bug 风险点）：
- 普通伤害：基础伤害 × 护甲倍数
- 魔免敌人受魔法攻击：早返回（hp 不变）
- 减甲 buff 累加：`armorBreak=3` → `actualDamage = damage * multiplier * 1.3`
- 死亡处理：hp<=0 时 `alive=false`、奖励 `gold/wood`、`kills+1`
- 击杀奖励按难度缩放：`createEnemy` 已根据 `state.difficulty` 将 `rewardGold` 乘以 `DIFF_GOLD`（hard 为 0.9）
- 分裂：敌人含 `split` 能力且非 `_splitChild` 时创建 2 个子怪
- debuff 施加：`applyDamage` 接受 debuff 参数，写入 `enemy.buffs`

`update`（投射物）：
- 目标仍存活且距离 ≤ `moveDist`（或 ≤ 6 像素早命中阈值）→ 命中，调用 `applyDamage`，`proj.alive=false`
- 目标已死/不存在且 `splashRadius>0` → 在当前位置溅射
- 投射物移动：`proj.x` / `proj.y` 按方向推进
- 已死亡投射物/敌人反向遍历 release 到池

**Verify**：`npx vitest run src/systems/CombatSystem.test.ts` → exit 0。

### Step 6：AuraSystem.test.ts

覆盖：
- 敌方光环塔：每帧在范围内的敌人获得/刷新对应 `auraType` buff
- 友方光环塔：不直接给敌人加 buff
- `allyAuraCache`：在 `auraDamage` 范围内的塔获得 `damageMult = 1+0.2`
- `allyAuraCache`：在 `auraHaste` 范围内的塔获得 `speedMult = 1+0.2`
- 多个友方光环重叠：倍数相乘
- 自身（category==='aura'）不会被加成
- 半径外的塔不进 cache

**Verify**：`npx vitest run src/systems/AuraSystem.test.ts` → exit 0。

### Step 7：SkillSystem.test.ts

`applyPassiveOnAttack`：
- 无技能 → 返回 `{ damage, isCrit: false }`
- `shieldBonus` 存在 → damage += shieldBonus
- `jianfa_crit` 触发（用 `vi.spyOn(Math, 'random')`）→ 暴击，damage 倍增
- 暴击但不满足概率 → 不暴击

`update`（主动技能 CD 与自动释放）：
- CD > 0 不释放
- CD = 0 且范围内有敌人 → 释放，`skillCds[skillId] = def.cooldown`
- `holyDamage`：找到 hp 最高敌人造成 `value` 神圣伤害
- `aoeDamage`：范围内全部敌人受 `value` 普通伤害
- `chainLightning`：按弹射数 + 衰减 0.85 倍，跳过已命中
- `stormStun`：造成 `value` 魔法伤害 + 眩晕 buff

**Verify**：`npx vitest run src/systems/SkillSystem.test.ts` → exit 0。

### Step 8：EffectSystem.test.ts

覆盖：
- `damageText`：vy 累加（重力），剩余时间归零后 alive=false
- 粒子特效：`p.x += p.vx*dt`，`p.life -= dt`
- 反向遍历清理已死亡 effect release 到池
- duration=0.5 的 effect 在 0.5s dt 内被标为 alive=false 并被 release

**Verify**：`npx vitest run src/systems/EffectSystem.test.ts` → exit 0。

### Step 9：EconomySystem.test.ts

覆盖：
- 3 个全局技能 CD 各自按 dt 递减，clamp 到 0
- `globalSlowTimer` 递减，clamp 到 0
- `summonTimer` 到期移除临时塔（`summonTowerId` 重置为 -1，towers 数组少 1）
- `clearBonusTimer` 到期归零（不发放奖励）
- 倒计时内清空敌人 → 发放 `CLEAR_BONUS_GOLD` 并归零
- `state.pressure >= 1` → `phase = 'lost'`
- `bossAlive && bossTimer <= 0` → `phase = 'lost'`

**Verify**：`npx vitest run src/systems/EconomySystem.test.ts` → exit 0。

### Step 10：跑全套并自检

```bash
npm run typecheck
npm run lint
npm test
```

**Verify**：
- `npm run typecheck` → exit 0
- `npm run lint` → exit 0
- `npm test` → 全部用例通过；用例总数 ≥ 80（之前 44 + 新增 ≥ 36）

## Test plan

- 在每个 `*.test.ts` 中，按以下结构：
  - `describe('update', () => { it('...', () => { ... }) })`
  - 用 `beforeEach` 创建干净的 `GameState`，避免用例间污染
  - 对随机性（`Math.random`、骰子）用 `vi.spyOn(Math, 'random').mockReturnValue(0.5)` 之类
  - 对 `nextEntityId` 不需要 mock（单测内 ID 不会冲突）
- 模式参考：`src/utils/Quadtree.test.ts:1-56`（用局部 `qt` 实例 + `expect().toContain`）

## Done criteria

机器可验证，**全部**必须满足：

- [ ] `npm run typecheck` exit 0
- [ ] `npm run lint` exit 0
- [ ] `npm test` exit 0；测试总数 ≥ 80
- [ ] `src/systems/*.test.ts` 8 个新文件全部存在
- [ ] `git status` 仅显示新增测试文件 + 可能的新 helper；生产代码（`src/systems/*.ts` 等）零改动
- [ ] `plans/README.md` 第 001 行状态更新为 DONE

## STOP conditions

立即停下并汇报，不要自行发挥：

- "Current state" 中列出的代码位置或行号与现行不一致
- 任何生产系统被改了（哪怕只删 1 行注释）→ 回滚
- 验证连续失败 2 次且修复尝试合理后仍失败
- 某个分支必须有 renderer / InputManager 配合才能测到（说明测试设计越界，应拆分到辅助测试而不是 mock 一切）
- 发现 "8 个系统" 的实际数量已经增加（如果出现 `src/systems/` 下新文件，应在本计划中追加步骤而不是直接改）

## Maintenance notes

- 这 8 个测试是后续性能/重构计划（002、003）的安全网。任何对系统的改动**必须**先跑 `npm test` 确认全绿
- 若 `src/entities/HeroTower.ts` 未来给成长塔加新字段（例如 `critChance` 之类），`SkillSystem.test.ts` 的 `applyPassiveOnAttack` 用例要追加
- 测试 helper（若建了 `test-helpers.ts`）应保持纯函数 / 无副作用；不要在那里挂任何全局状态

<!-- review-passed: true, reviewer: plan-review-subagent, at: 2026-06-21T02:18:48+08:00 -->
