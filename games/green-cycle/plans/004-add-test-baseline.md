# Plan 004: 建立测试基线（Vitest + 核心纯逻辑覆盖）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bc95bc..HEAD -- package.json package-lock.json tsconfig.json src/utils/RecipeUtil.ts src/utils/BuffUtil.ts src/utils/Path.ts src/utils/Quadtree.ts src/utils/SaveManager.ts src/game/State.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 001（修复 hard 人口 bug 后，测试才能断言正确的人口值）
- **Category**: tests
- **Planned at**: commit `7bc95bc`, 2026-06-20

## Why this matters

项目当前零测试，所有验证仅靠 `tsc --noEmit` 和 `vite build`。核心纯逻辑模块（配方匹配、buff 叠加、路径插值、四叉树查询、存档读写、难度初始化）没有任何回归保护。后续性能优化和玩法调优会改动这些模块，没有测试兜底风险极高。本计划引入 Vitest 并为最关键的纯逻辑模块编写 characterization tests，锁定当前正确行为。

## Current state

`package.json:6-17` — 当前 scripts 和 devDependencies，无测试框架：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vite-plugin-singlefile": "^2.0.0"
  }
}
```

`tsconfig.json` — `include` 仅 `src`，测试文件需纳入。

需要覆盖的纯逻辑模块（无 DOM/Canvas 依赖，可直接单测）：

| 模块 | 文件 | 关键函数 | 优先级 |
|------|------|----------|--------|
| 配方匹配 | `src/utils/RecipeUtil.ts` | `matchRecipe`, `executeCombine` | 高 |
| Buff 工具 | `src/utils/BuffUtil.ts` | `applyBuff`, `sumBuffValue` | 高 |
| 路径插值 | `src/utils/Path.ts` | `getPosition`, `getDirection`, `createLoopPath`（`findSegmentIndex` 是 private 辅助方法，通过 `getPosition` 间接覆盖） | 高 |
| 四叉树 | `src/utils/Quadtree.ts` | `insert`, `retrieve`, `clear` | 中 |
| 存档管理 | `src/utils/SaveManager.ts` | `load`, `save`, `getDefault` | 中 |
| 难度初始化 | `src/game/State.ts` | `initDifficulty`, `canAfford`, `spend` | 中 |

### 项目约定

- TypeScript ESM 项目（`"type": "module"`）。
- 纯函数系统签名：`update(state, dt)`。
- 实体工厂：`createEnemy/createTower/...`。
- 类型契约：`types.ts` 只增不改。

## Commands you will need

| Purpose   | Command                    | Expected on success |
|-----------|----------------------------|---------------------|
| Install   | `npm install`              | exit 0              |
| Typecheck | `npm run typecheck`        | exit 0              |
| Tests     | `npm test`                 | all pass            |
| Build     | `npm run build`            | exit 0              |

## Scope

**In scope**:
- `package.json` — 新增 vitest 依赖和 test 脚本
- `tsconfig.json` — 调整 include 或新增 tsconfig 覆盖测试
- `vitest.config.ts`（新建）— Vitest 配置
- `src/utils/RecipeUtil.test.ts`（新建）
- `src/utils/BuffUtil.test.ts`（新建）
- `src/utils/Path.test.ts`（新建）
- `src/utils/Quadtree.test.ts`（新建）
- `src/utils/SaveManager.test.ts`（新建）
- `src/game/State.test.ts`（新建）

**Out of scope**:
- 任何 `src/` 下现有源码文件（不修改逻辑，只加测试）
- 渲染层测试（需 Canvas mock，成本高）
- 系统集成测试（后续计划）

## Steps

### Step 1: 安装 Vitest 并配置

**1a.** 安装依赖：

```bash
npm install -D vitest
```

**1b.** 在 `package.json` 的 `scripts` 中新增：

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

**1c.** 创建 `vitest.config.ts`（项目根目录）：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

**Verify**: `npx vitest run` → 输出 "No test files found" 或类似（尚未写测试），exit 0

### Step 2: 确保测试文件被 TypeScript 覆盖

检查 `tsconfig.json` 的 `include` 是否包含 `src`。如果测试文件在 `src/` 下，它们已被覆盖。如果 `tsconfig.json` 排除了 `*.test.ts`，需移除排除。

确认 `npm run typecheck` 仍 exit 0。

**Verify**: `npm run typecheck` → exit 0

### Step 3: 编写 RecipeUtil 测试

创建 `src/utils/RecipeUtil.test.ts`，覆盖以下场景：

- `matchRecipe`：空数组返回 null
- `matchRecipe`：3 座 3 级箭塔匹配 `recipe_arrow_to_splash`
- `matchRecipe`：2 座 5 级破坏塔匹配 `recipe_cannon_to_chaos`
- `matchRecipe`：材料等级不匹配返回 null（如 2 级箭塔不匹配需 3 级的配方）
- `matchRecipe`：材料不足返回 null（只有 2 座箭塔但配方需 3 座）
- `matchRecipe`：多配方时优先返回数组靠前的
- `executeCombine`：成功合成扣除资源、移除材料、生成产物
- `executeCombine`：木材不足返回 false（配方 `recipe_cannon_to_chaos` 需 5 木）
- `executeCombine`：金币不足返回 false
- `executeCombine`：人口空间不足返回 false

参考 `src/utils/RecipeUtil.ts` 的函数签名和 `src/data/recipes.ts` 的配方数据。需要构造 `Tower` 和 `GameState` 测试数据——可以手动构造最小 mock 对象，或调用 `createTower`/`new GameState(path)` 工厂。

**Verify**: `npm test -- RecipeUtil` → all pass

### Step 4: 编写 BuffUtil 测试

创建 `src/utils/BuffUtil.test.ts`，覆盖：

- `applyBuff`：首次施加新增 buff
- `applyBuff`：同类型同来源刷新持续时间和数值
- `applyBuff`：同类型不同来源新增层
- `sumBuffValue`：多来源减速叠加求和
- `sumBuffValue`：无该类型 buff 返回 0
- `isCrowdControlled`：有指定类型控制 buff（如 stun）返回 true
- `isCrowdControlled`：无该类型控制 buff 返回 false

需要构造 `Enemy` mock 对象（只需 `buffs: Buff[]` 字段）。

**Verify**: `npm test -- BuffUtil` → all pass

### Step 5: 编写 Path 测试

创建 `src/utils/Path.test.ts`，覆盖：

- `createLoopPath`：生成非空路径，points 数量 > 8
- `getPosition(0)`：返回起点
- `getPosition(0.5)`：返回路径中点附近
- `getPosition(1)`：等价于 `getPosition(0)`（取模）
- `getPosition(-0.1)`：归一化到 [0,1)
- `totalLength` > 0
- `getDirection`：返回单位向量（长度为 1）
- 闭合性：`getPosition(0)` 和 `getPosition(~1)` 接近相同

**Verify**: `npm test -- Path` → all pass

### Step 6: 编写 Quadtree 测试

创建 `src/utils/Quadtree.test.ts`，覆盖：

- `insert` + `retrieve`：单点查询返回该点
- `retrieve`：范围外查询返回空
- `retrieve`：多点查询返回范围内所有点
- `retrieve`：边界上的点被包含
- `clear`：清空后查询返回空
- 容量超限触发分裂后仍正确查询

**Verify**: `npm test -- Quadtree` → all pass

### Step 7: 编写 SaveManager 测试

创建 `src/utils/SaveManager.test.ts`，覆盖（需 mock `localStorage`）：

- `getDefault`：返回正确默认值（difficulties 含 easy，endlessUnlocked false）
- `save` + `load`：写入后读取返回相同数据
- `load`：无存档返回 null
- `load`：版本不匹配返回 null
- `load`：部分字段缺失时合并默认值

mock localStorage 方式：`SaveManager.ts` 直接使用裸名 `localStorage`（非 `globalThis.localStorage`）。在 vitest 中需确保 mock 生效。推荐方式：在 vitest 配置中设置 `globals: true`，或使用 `vi.stubGlobal('localStorage', mock)`。在 `beforeEach` 中设置 mock，`afterEach` 中调用 `vi.unstubAllGlobals()` 恢复。

**Verify**: `npm test -- SaveManager` → all pass

### Step 8: 编写 State 难度初始化测试

创建 `src/game/State.test.ts`，覆盖：

- `initDifficulty('easy', false)`：gold=350, popMax=22, maxEnemies=50
- `initDifficulty('normal', false)`：gold=250, popMax=10, maxEnemies=40
- `initDifficulty('hard', false)`：gold=180, popMax=8, maxEnemies=35（**此测试在 001 修复后应通过**）
- `initDifficulty('normal', true)`：maxEnemies=ENDLESS_MAX_ENEMIES(20)
- `canAfford`：金币/木材/人口检查
- `spend`：扣减资源
- `addTower` / `removeTower`：pop 增减、格子占用

需要构造 `Path` 对象——调用 `Path.createLoopPath(1280, 720, 80, 320)`。

**Verify**: `npm test -- State` → all pass

### Step 9: 全量测试验证

**Verify**: `npm test` → all pass，无失败

### Step 10: 构建验证

**Verify**: `npm run build` → exit 0（确认测试文件不影响构建产物）

## Done criteria

ALL must hold:

- [ ] `npm install` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0，至少 6 个测试文件，覆盖 RecipeUtil/BuffUtil/Path/Quadtree/SaveManager/State
- [ ] `npm run build` exits 0
- [ ] `package.json` 有 `test` 和 `test:watch` 脚本
- [ ] `vitest.config.ts` 存在且配置正确
- [ ] No source files (non-test) are modified (`git status` — only new test files + config)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `npm install -D vitest` 失败（网络问题或版本冲突）。
- 某个纯逻辑模块有隐藏的 DOM/Canvas 依赖，无法在 node 环境单测（如 SaveManager 直接调用 `localStorage` 而非通过注入——需用 mock 而非跳过）。
- `Path.createLoopPath` 的参数或返回值与 excerpt 不符。
- 测试中发现某个模块的当前行为与预期不符（说明发现了新 bug——记录并跳过该断言，不要修改源码）。

## Maintenance notes

- 测试文件放在 `src/` 下与源码同目录，遵循就近原则。如果项目后续偏好独立 `test/` 目录，可批量移动。
- 这些是 characterization tests——锁定当前行为，不是断言"正确"行为。如果后续有意改数值（如调整难度），需同步更新测试断言。
- 后续应为系统层（WaveSystem/CombatSystem 等）编写集成测试，但需要构造更完整的 GameState，成本更高，留作后续计划。
- 渲染层测试需要 Canvas mock（如 `happy-dom` 或 `jsdom` + canvas polyfill），本计划不涉及。
