# 绿色循环圈

塔防游戏《绿色循环圈》— HTML5 Canvas 2D + TypeScript + Vite，单文件构建产物。

## 项目信息

| 项       | 值                                                            |
| -------- | ------------------------------------------------------------- |
| 位置     | `/Users/doer/dev/yoo/games/green-cycle/`                      |
| 技术栈   | TypeScript + Vite + Canvas 2D + Web Audio                     |
| 架构     | ECS-lite（集中式 State + 8 纯函数系统）                       |
| 产物     | `public/games/green-cycle/index.html` 单文件（JS/CSS 全内联） |
| 当前进度 | 见 plans/README.md 状态表                                     |

## 快速开始

```bash
cd games/green-cycle
npm install          # 安装依赖
npm run dev          # dev 服务器 → http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run test         # vitest run (16 files, 118 tests at 2026-06-22)
npm run build        # 单文件 → ../../public/games/green-cycle/
npm run lint         # ESLint 检查
```

## 目录结构

```
green-cycle/
├── AGENT.md                  # 本文件
├── assets/                   # SVG 精灵（towers/icons/projectiles/tiles）
├── src/
│   ├── config.ts             # 全局常量（50 波、难度系数、经济配置）
│   ├── types.ts              # 类型契约（Tower/Enemy/Projectile/Recipe 等）
│   ├── main.ts               # 入口，DOM 绑定与事件
│   ├── game/                 # State.ts / Game.ts / Loop.ts
│   ├── entities/             # 实体工厂（Enemy/Tower/HeroTower/Projectile/Effect）
│   ├── systems/              # 8 系统（Wave/Movement/TowerAI/Combat/Aura/Skill/Economy/Effect）
│   ├── data/                 # 数据表（towers/enemies/waves/recipes/skills/armor）
│   ├── render/               # 像素风渲染（Entity/Map/UI/PixelArt）
│   ├── utils/                # 工具（Path/Quadtree/Pool/AssetLoader/BuffUtil/RecipeUtil/SaveManager/MathUtil）
│   ├── audio/                # 8-bit 程序化音效
│   ├── debug/                # 开发者作弊（cheat.ts）
│   └── input/                # 输入管理（点击/拖拽/框选/右键/滚轮/中键平移）
├── index.html                # 游戏 HTML + CSS
├── package.json
└── vite.config.ts            # vite-plugin-singlefile 内联打包
```

## 关键契约

- 系统签名：`update(state: GameState, dt: number): void`
- 即时命中：`CombatSystem.applyDamage(state, enemy, damage, attackType, sourceTowerId)`
- 实体工厂：`createEnemy` / `createTower` / `createHeroTower` / `createProjectile`
- 状态机：`menu | ready | battling | paused | won | lost`
- 塔属性：普通塔 `getTowerStat(t)`，成长塔 `getHeroStat(t)`
- 类型扩展：`types.ts` 只增不改现有字段

## 执行约定（串行全自动流程）

当使用 `/improve execute` 或类似指令执行 plan 时，遵循以下流程：

### 基本规则

- **串行执行**：严格按 `plans/README.md` 推荐顺序（先 P1/S 后 P2/M，按依赖顺序）逐个执行状态为 `TODO` 的 plan，不并行
- **禁止 worktree isolation**：所有改动直接在主工作区 main 分支上完成，不创建 worktree、不建临时分支（个人项目无需 PR 流程）
- **主 agent 只做流程把控**：主 agent 不直接修改源码，源码改动交给开发 subagent，验证交给测试 subagent
- **常用命令免审批**：`npm run typecheck` / `npm run lint` / `npm test` / `npm run format:check` / `npm run build` / `git add/commit/push` / `git status/diff/log` 直接执行，不申请权限
- **不扩大 scope**：subagent 只改 plan 里明确列出的文件，发现 plan 范围外的问题停下来报告，不要顺手改
- **遇 STOP 条件或 plan 漂移停下来报告**，等用户决策，不要自行绕过

### 每个 plan 的执行步骤

1. **开发 subagent**：派一个 `general-purpose` subagent（不开 worktree），把 plan 文件全文内联到 prompt 里，让它按 plan 步骤实施源码改动。prompt 里要求：
   - 严格按 plan 的 Steps 实施
   - 跑 plan 中列出的所有验证命令
   - 改动完成后汇报改动文件列表、验证结果、是否有偏离
2. **主 agent 审阅**：查看开发 subagent 的改动和报告，确认范围正确、没有明显问题
3. **测试 subagent**：派另一个 `general-purpose` subagent 独立验证（不开 worktree），要求它：
   - 跑 `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build` 全部门禁
   - 对照 plan 的 Done criteria 逐条核对
   - 读 diff 检查是否有范围外改动或明显逻辑问题
   - 明确返回 `VERIFY: PASS` 或 `VERIFY: FAIL <原因>`
4. **通过则 commit**：验证 PASS 后，主 agent 执行 `git add` + `git commit -m "<plan号>: <简要描述>"`，提交信息遵循 conventional commits
5. **更新 plans/README.md**：把对应行状态改为 `DONE (merged <sha>)`，单独一个 commit
6. **继续下一个 plan**

### 全部完成后

- 最后一次 `git push origin main` 把所有 commit 推上去
- 跑一次 `/improve reconcile` 确认状态一致
- 汇总完成情况（做了哪些 plan、新增测试数、commit 列表）向用户报告

### 用户触发指令示例

用户只要说类似下面的话即可启动全自动流程：

- `/improve execute all TODO plans`
- `帮我把没做的 plan 都做了`
- `/improve execute 009`（执行单个 plan 也走这个流程）
