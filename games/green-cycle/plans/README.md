# 实施计划

由 `improve` 技能于 2026-06-21 基于 commit `aca6de9` 生成（第二轮基于 `2fbd773` 追加 005-008b；第三轮基于 `329df77` 追加 009-014）。除非有依赖关系声明，按下表顺序执行。每个执行者：开始前完整阅读对应 plan 文件，遵守 STOP 条件，完成后更新本表对应行的状态。

## 执行顺序 & 状态

| Plan | 标题                                                     | 优先级 | 投入 | 依赖           | 状态                  |
| ---- | -------------------------------------------------------- | ------ | ---- | -------------- | --------------------- |
| 001  | 为 8 个核心系统补单元测试                                | P1     | M    | —              | DONE (merged 9279d40) |
| 002  | 修复 Game.syncUI 每帧 60Hz DOM 重写                      | P1     | M    | 001 (强烈建议) | DONE (merged 67a66d5) |
| 003  | 清理 4 个小型技术债                                      | P1     | S    | —              | DONE (merged 8ac84a8) |
| 004  | 加 GitHub Actions CI 与 pre-commit 钩子                  | P2     | S    | —              | DONE (merged d671d85) |
| 005  | resetEnemy 清除 `_splitChild` 以让池化 splitter 正常分裂 | P1     | S    | —              | DONE (merged e239449) |
| 006  | 修复 6 个文件的 prettier --check                         | P1     | S    | —              | DONE (merged 6fc5b92) |
| 007  | 提取 resetProjectile 工厂函数                            | P1     | S    | —              | DONE (merged 0ff5f71) |
| 008  | 设置 UI（音量/画质）— spike + 接线                       | P2     | S    | —              | DONE (merged ffd7515) |
| 008b | 设置 UI 落地：overlay 音量+画质控件 + 画质运行时分支     | P2     | M    | 008            | DONE (merged b6f1840) |
| 009  | 实现敌方光环（auraHaster 加速友方怪）                    | P1     | M    | —              | DONE                  |
| 010  | 新游戏（startGame）重置相机到默认视角                    | P1     | S    | —              | DONE                  |
| 011  | CI 增加 format:check 步骤                                | P1     | S    | —              | DONE                  |
| 012  | lastSync 声明 auraKey 字段，移除 4 处 (as any)           | P1     | S    | —              | DONE                  |
| 013  | 删除或修正 Renderer.setView 陷阱方法                     | P2     | S    | —              | DONE                  |
| 014  | 小 cleanup 集合：splitter 偏移/死字段 leaks/AGENT/Aura   | P2     | S    | —              | DONE                  |

状态取值：`TODO` | `IN PROGRESS` | `DONE` | `BLOCKED`（附一行原因）| `REJECTED`（附一行理由 —— 发现被独立修复或方案放弃）

## 推荐执行顺序

小而独立的 P1 先行：011 (CI) → 010 (camera reset) → 012 (auraKey 类型) → 013 (setView) → 014 (cleanups)；最后执行 009（中号工作量，含平衡考量）。011 最先落地后，后续 plan 的 PR 都能被 format gate 守护。

## 依赖说明

- **002 强烈建议依赖 001**：002 是性能重构，会触碰 `Game.ts` 中 `syncUI` / `showTowerInfo` / `showGrowthInfo` / `renderSkillTree` / `showCombineInfo` 整片逻辑；001 落地的 8 个系统测试不会直接覆盖这些 UI 方法（行为对玩家无变化是计划前提），但能保证本次重构不会意外破坏 Combat/Aura/Skill 等系统的副作用。**如果没有 001 的安全网，002 必须额外做至少 30 分钟手动回归测试**。
- 003 独立：4 个 Step 互相独立，可单独执行任一步。
- 004 独立：纯新增基础设施，与 001-003 互不干扰。
- 005 / 006 / 007 互相独立，互不依赖；任何一个单独执行都是安全的。
- **008b 依赖 008**：008 负责把 `SaveData.settings.volume` 接到 `Audio`（添加 `applySettings` 辅助并在 `startGame` 调用）；008b 在这个接线上方构建真正的 UI（音量滑块 + 画质下拉）和 `quality: 'low'` 运行时分支。**如果只执行 008b 而跳过 008，滑块改音量不会生效**。
- 005-008（不含 008b）已在审计中通过 `improve` 之外的人工核对完成，不需要重做。
- **009–014 全部互相独立**（第三轮，基于 `329df77`）。009 是 M 号工作量且涉及数值平衡，建议最后执行；其他都是 S 号可随意顺序。

## 审计摘要

完整审计见对话记录。要点：

- **测试覆盖**：001 已完成，13 文件 / 118 测试全部通过
- **性能**：002 已完成，`Game.syncUI` 使用 hot/cold 分层和 `lastSync` 缓存
- **技术债**：003/005/007 已完成主要清理；012/014 继续处理新发现的小项
- **DX**：004 已完成 CI + husky；011 补 CI 的 format:check 缺口（006 之后再次回退的防御）
- **第二轮（2026-06-21，基于 `2fbd773`）**：005/006/007/008/008b 已完成
- **第三轮（2026-06-22，基于 `329df77`）**：
  - 009 敌⽅ auraHaster 光环仅有 target priority、无实际 buff 应用（后期波次过易）
  - 010 新游戏开始时相机不重置（zoom/pan 状态残留）
  - 011 CI 缺 format:check（漂移已发生过两次）
  - 012 新引入的 `(this.lastSync as any).auraKey` 破坏类型安全
  - 013 Renderer.setView 公开但会破坏相机不变量，零调用方
  - 014 四个小项：splitter 子怪随机偏移 1 帧被覆盖 / `state.leaks` 死字段 / AGENT.md 数字与目录过期 / AuraSystem 文件头注释误导

## 已考虑但未规划（避免下一轮重复审计）

### 性能

- **`Quadtree.retrieve` 每帧分配新数组**（[Quadtree.ts:85](file:///Users/doer/dev/yoo/games/green-cycle/src/utils/Quadtree.ts#L85)）+ `any` 类型化 — 第三轮确认：改为 `Quadtree<T>` 泛型 + scratch buffer 是 M 号工作，需要改所有调用点签名；当前 GC 压力可接受（约 100 个小数组/秒），暂缓
- **`getEnemyById` 每次投射物命中 O(N) 扫描**（[State.ts:181-186](file:///Users/doer/dev/yoo/games/green-cycle/src/game/State.ts#L181-L186)）— 投射物通常 < 20，用 per-frame Map 收益小 → 暂不规划
- **`imageSmoothingEnabled` 每次 resize 都设**（[Renderer.ts](file:///Users/doer/dev/yoo/games/green-cycle/src/render/Renderer.ts)）— 构造时设一次即可（very minor） → 暂不规划
- **每帧 `state.enemies.find(isBoss)`**（[UIRenderer.ts:66-73](file:///Users/doer/dev/yoo/games/green-cycle/src/render/UIRenderer.ts#L66-L73)）— 同屏仅 1 boss，O(N) 可忽略 → 暂不规划
- **hexToRgba / brighten 每帧解析**（PixelArt.ts）— 色彩字符串构建量不大，不是瓶颈 → 暂不规划
- **InputManager.clientToCanvas 每帧调用 getBoundingClientRect** — 单次调用 <0.01ms，且仅在 pointer 事件触发，微优化 → 暂不规划
- **TowerAISystem.selectTarget 每塔每帧分配 Set+array** — 约 30 塔/s 下 60fps 产生 1800 小对象/秒，Set 去重是防御性代码，暂缓
- **AuraSystem O(auraTowers × enemies)** — 通常 1-3 光环塔 × <100 怪 = 几百次距离计算/帧，可忽略 → 暂不规划
- **N×speed 多步进下 Aura/Quadtree 在加速模式重复计算** — speed≤3 且帧预算充足 → 暂不规划

### 测试

- **Renderer / InputManager / Game 类测试** — 单测需要 mock DOM/Canvas/事件，引入 jsdom 收益小；保持手测 → 暂不规划

### 安全

- 纯客户端游戏，仅 localStorage，无 XSS 表面（`innerHTML` 全部由 `data/*.ts` 静态表驱动）— 无发现

### 已证伪的"发现"（By design）

- **敌人永远循环不 leak**（MovementSystem `pathProgress %= 1`）— 游戏名为"绿色循环圈"，路径闭合循环是核心设计；游戏失败走压力机制（EconomySystem pressure>=1 判负），不走 leaks → 不是 bug，相关死字段 `state.leaks` 已列入 014 删除
- **非 Boss 波全部出生即结算**（WaveSystem `endWave()` 在 allSpawned 时触发）— 设计如此：未清场则 `waveStartEnemiesEmpty=false` 拒绝 PF，clearBonusTimer 提供清场窗口，残留敌人累积压力 → 不是 bug
- **出售只返还建造本金**（`getSellRefund` 只用 `levels[0].upgradeCost`）— JSDoc 明确说"仅返还建造资金...不含升级投入" → 不是 bug
- **HeroTower skillLevels/skillCds/shieldBonus 未初始化** — 字段类型为 optional，所有访问用 `?.`/`??` 防御 → 不是 bug

### 方向

未选入本轮 plan 的方向发现，由维护者决定是否独立成 plan：

- D1 相机重置热键（F/Home）+ HUD 缩放百分比指示
- D2 敌方 `auraHeal` / `auraDamage` 能力补完（在 009 落地后扩展）
- D3 存档槽位（多 save slot）
- D4 本地化
- D5 多路径 / 地图变体

## Reconcile 记录

- **2026-06-21 (HEAD `8d91c07`)**：spot-check 001-004 的 done criteria。
  - `npm run typecheck`：通过
  - `npm run lint`：通过
  - `npm test`：113 个测试全部通过
  - `npm run format:check`：**未通过**，6 个文件漂移（后续 006 修复）
- **2026-06-21 (HEAD `2fbd773`，第二轮)**：补写 005-008 + 008b；005/006/007 在 git 历史已合并，008 spike 已落地，008b 留 TODO 后已完成。
- **2026-06-22 (HEAD `329df77`，第三轮)**：基于相机/光环面板提交做新一轮审计，验证门禁全绿（118 tests / typecheck / lint / format 全过），写入 009-014 共 6 个 plan。

## 给执行者的统一提示

- **每个 plan 的第一步都是"漂移检查"**：`git diff --stat <planned-at SHA>..HEAD -- <in-scope paths>`。如果发现 plan 中引用的代码位置已变，对照 "Current state" 与现行代码比较；不一致按 STOP 处理。
- **不要 push 或开 PR**，除非操作员明确指示。Plan 完成后在 PR 描述里写明手动验证范围。
- **不要扩大 scope**：如果发现 plan 范围之外的修改需求（例如修了一个未在 plan 里的 bug），先停下报告，而不是顺手改了。
- **测试与 lint 必须 exit 0**：`npm test` / `npm run lint` / `npm run typecheck` / `npm run format:check` 是所有 plan 的统一门禁。

## 验证矩阵（每个 plan 都跑）

| 命令                   | 用途                                     |
| ---------------------- | ---------------------------------------- |
| `npm run typecheck`    | TS 严格模式无错                          |
| `npm run lint`         | ESLint 0 警告                            |
| `npm test`             | 单元测试全过                             |
| `npm run format:check` | Prettier 格式无差                        |
| `npm run build`        | singlefile 产物能生成（仅 004/011 必跑） |
| `npm run dev`          | 本地服务器可启动（手测步骤需要时）       |
