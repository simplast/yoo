# 实施计划

由 `improve` 技能于 2026-06-21 基于 commit `aca6de9` 生成。除非有依赖关系声明，按下表顺序执行。每个执行者：开始前完整阅读对应 plan 文件，遵守 STOP 条件，完成后更新本表对应行的状态。

## 执行顺序 & 状态

| Plan | 标题                                    | 优先级 | 投入 | 依赖           | 状态 |
| ---- | --------------------------------------- | ------ | ---- | -------------- | ---- |
| 001  | 为 8 个核心系统补单元测试               | P1     | M    | —              | IN PROGRESS |
| 002  | 修复 Game.syncUI 每帧 60Hz DOM 重写     | P1     | M    | 001 (强烈建议) | TODO |
| 003  | 清理 4 个小型技术债                     | P1     | S    | —              | TODO |
| 004  | 加 GitHub Actions CI 与 pre-commit 钩子 | P2 | S | — | DONE (merged d671d85) |

状态取值：`TODO` | `IN PROGRESS` | `DONE` | `BLOCKED`（附一行原因）| `REJECTED`（附一行理由 —— 发现被独立修复或方案放弃）

## 依赖说明

- **002 强烈建议依赖 001**：002 是性能重构，会触碰 `Game.ts` 中 `syncUI` / `showTowerInfo` / `showGrowthInfo` / `renderSkillTree` / `showCombineInfo` 整片逻辑；001 落地的 8 个系统测试不会直接覆盖这些 UI 方法（行为对玩家无变化是计划前提），但能保证本次重构不会意外破坏 Combat/Aura/Skill 等系统的副作用。**如果没有 001 的安全网，002 必须额外做至少 30 分钟手动回归测试**。
- 003 独立：4 个 Step 互相独立，可单独执行任一步。
- 004 独立：纯新增基础设施，与 001-003 互不干扰。**建议最先执行 004**：CI 落地后，所有后续 001-003 的 PR 都有自动化门禁。

## 审计摘要

完整审计见对话记录。要点：

- **测试覆盖**：`src/systems/*.ts` 8 个核心系统零测试（5 个测试文件覆盖 `State` / `BuffUtil` / `Path` / `Quadtree` / `RecipeUtil` / `SaveManager`）
- **性能**：`Game.syncUI` 每帧 60Hz 写 25+ 个 DOM 节点；`showTowerInfo` + `renderSkillTree` 每帧重建技能树列表
- **技术债**：召唤塔用负数 ID 标记临时性 + 死字段 `state.accumulator` + 排行榜标签/内容不一致 + 无变更也写 localStorage
- **DX**：无 CI、无 pre-commit、5 个 plan 文档被一次性删除无任何拦截
- **方向**：多路径地图 / 设置 UI（数据结构已就绪）/ 存档槽位 / 本地化

## 已考虑但未规划（避免下一轮重复审计）

### 性能

- **`Quadtree.retrieve` 每帧分配新数组**（[Quadtree.ts:85](file:///Users/doer/dev/yoo/games/green-cycle/src/utils/Quadtree.ts#L85)）— 改用 scratch 缓冲收益小，技能门槛高 → 暂不规划
- **`getEnemyById` 每次投射物命中 O(N) 扫描**（[State.ts:181-186](file:///Users/doer/dev/yoo/games/green-cycle/src/game/State.ts#L181-L186)）— 投射物通常 < 20，用 per-frame Map 收益小 → 暂不规划
- **`imageSmoothingEnabled` 每次 resize 都设**（[Renderer.ts:90](file:///Users/doer/dev/yoo/games/green-cycle/src/render/Renderer.ts#L90)）— 构造时设一次即可（very minor） → 暂不规划
- **每帧 `state.enemies.find(isBoss)`**（[UIRenderer.ts:66-73](file:///Users/doer/dev/yoo/games/green-cycle/src/render/UIRenderer.ts#L66-L73)）— 同屏仅 1 boss，O(N) 可忽略 → 暂不规划

### 测试

- **Renderer / InputManager / Game 类测试** — 单测需要 mock DOM/Canvas/事件，引入 jsdom 收益小；保持手测 → 暂不规划

### 安全

- 纯客户端游戏，仅 localStorage，无 XSS 表面（`innerHTML` 全部由 `data/*.ts` 静态表驱动）— 无发现

### 方向

未选入本次 plan 的方向发现（D1-D4），由维护者决定是否独立成 plan：

- D1 多路径 / 地图变体
- D2 设置 UI（音量/画质）— 与 #9 对称
- D3 存档槽位
- D4 本地化

## 给执行者的统一提示

- **每个 plan 的第一步都是"漂移检查"**：`git diff --stat <planned-at SHA>..HEAD -- <in-scope paths>`。如果发现 plan 中引用的代码位置已变，对照 "Current state" 与现行代码比较；不一致按 STOP 处理。
- **不要 push 或开 PR**，除非操作员明确指示。Plan 完成后在 PR 描述里写明手动验证范围。
- **不要扩大 scope**：如果发现 plan 范围之外的修改需求（例如修了一个未在 plan 里的 bug），先停下报告，而不是顺手改了。
- **测试与 lint 必须 exit 0**：`npm test` / `npm run lint` / `npm run typecheck` / `npm run format:check` 是所有 plan 的统一门禁。

## 验证矩阵（每个 plan 都跑）

| 命令                   | 用途                                   |
| ---------------------- | -------------------------------------- |
| `npm run typecheck`    | TS 严格模式无错                        |
| `npm run lint`         | ESLint 0 警告                          |
| `npm test`             | 单元测试全过                           |
| `npm run format:check` | Prettier 格式无差                      |
| `npm run build`        | singlefile 产物能生成（仅 004 必须跑） |
| `npm run dev`          | 本地服务器可启动（手测步骤需要时）     |
