# Plan 012: 经济-合成循环打磨（里程碑一）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.

## Status

- **Priority**: P1 (高)
- **Effort**: L
- **Risk**: MED
- **Depends on**: 004（测试基线），010（木材经济），011（配方扩充）
- **Category**: gameplay
- **Planned at**: commit `b1ec2db`, 2026-06-21

## Why this matters

Hard/无尽模式下木材稀缺，合成路线单一，普通波缺乏时间压力。本计划通过清场奖励提速、精英木材掉落、配方预览和成本调优，让经济-合成循环更紧凑、更具策略深度。

## Current state analysis

### 1. 清场奖励机制（现状）

**现状**：`WaveSystem.ts:endWave()` 中，普通波结束后如果场上有残留敌人，启动 `clearBonusTimer = 8` 秒倒计时。倒计时内清空则发 30 金币（`EconomySystem.ts:34-42`）。

**问题**：奖励触发在波次"结束后"，而非波次"生成完成后"。玩家没有动力快速清场，因为倒计时从波次结束才开始。

**目标**：改为"非 Boss 波所有敌人生成完毕后 8 秒内清场"奖励金币。在 `WaveSystem.ts` 中，当 `allSpawned` 为 true 且非 Boss 波时，启动 `clearBonusTimer`，而非等到 `endWave()`。

### 2. 精英木材掉落

**现状**：`enemies.ts` 中：
- `golem`：rewardWood = 1
- `auraHaster`：rewardWood = 1
- 第 30 波经济波：`rewardWood = 2`（已为 2）

**目标**：
- `golem` 和 `auraHaster` 的 `rewardWood` 从 1 提升到 2
- 第 30 波 `rewardWood` 已经是 2，无需修改

### 3. 合成配方扩充

**现状**：plans/011 已执行完毕，`recipes.ts` 中已有 7 条配方（含 frost→freeze, lightning→dianfa, stun→jianfa, corrosive→tianshen）。

**freeze 塔 category 问题**：`towers.ts` 中 `freeze.category = 'special'`，但 plans/011 假设它是 growth。当前 `executeCombine` 中 `resultDef.category === 'growth'` 判断决定是否调用 `createHeroTower`。freeze 作为 special 塔，调用 `createTower` 而非 `createHeroTower`，这意味着合成产物 freeze 不能获得经验、不能学技能、不能加点。

**决策**：将 freeze 的 `category` 从 `'special'` 改为 `'growth'`，使其成为真正的成长塔。同时为其添加合适的成长塔属性（str/agi/int 初始值、技能槽位）。或者保持 `'special'` 但让 `executeCombine` 也支持 special 塔作为产物。这里选择改为 growth，因为"冰冻塔"作为控制成长塔在塔防中很常见。

**目标**：无需新增配方（已存在），但需要：
- 将 freeze 塔的 category 改为 `'growth'`
- 为其添加成长塔必需字段（`str`, `agi`, `int`, `attrPoints`, `skillPoints`, `skills`, `skillLevels`, `skillCds` 初始值在 `createHeroTower` 中处理）
- 为 freeze 设计 1-2 个成长技能（可选，可后续扩展）

### 4. 合成配方解锁预览

**现状**：`showCombineInfo()` 仅显示当前选中塔匹配到的配方，未匹配时显示"未匹配到可用配方"。

**目标**：在右侧面板显示所有配方列表，已解锁（当前选中塔可匹配）高亮显示，未解锁灰色显示并提示条件（如 "需要 2 座 3 级冰霜塔"）。

### 5. 配方成本调优

**现状**：Hard 模式下木材总量分析：
- 初始木材：2
- Boss 波木材奖励：15波(1) + 25波(2) + 35波(2) + 45波(3) + 50波(5) = 13
- 精英怪木材：golem(每只1木)、auraHaster(每只1木)、economyRabbit(每只1木)
- 第30波经济波：rewardWood = 2 + 15只兔子 = 17 木
- 总计约 35-40 木材（含击杀精英）

**当前配方木材成本**：
- cannon→chaos: 5 木
- 成长塔融合: 10 木
- frost→freeze: 2 木
- lightning→dianfa: 3 木
- stun→jianfa: 2 木
- corrosive→tianshen: 3 木

**分析**：精英木材提升后（golem/auraHaster 从1→2），总木材增加约 10-15。中阶配方成本（2-3 木）合理，但 growth_fuse（10 木）偏高。建议调整为：
- growth_fuse: 10 → 8 木

## Scope

**In scope**:
- `src/systems/WaveSystem.ts` — 清场奖励计时改为波次生成完成后启动
- `src/data/enemies.ts` — golem/auraHaster rewardWood 提升
- `src/data/towers.ts` — freeze 塔 category 改为 growth
- `src/data/recipes.ts` — 配方成本微调
- `src/game/Game.ts` — 合成配方预览面板（showCombineInfo 扩展）
- `index.html` — 配方预览面板 DOM 结构
- `src/main.ts` — 配方预览面板事件绑定

**Out of scope**:
- freeze 成长技能设计（后续扩展）
- 新增塔类型
- 新增配方

## Steps

### Step 1: 清场奖励 — 改为波次生成完成后 8 秒内清场

**文件**: `src/systems/WaveSystem.ts`

在 `update()` 中，当 `allSpawned && !wave.isBoss && !wave.isEconomy` 时，启动 `clearBonusTimer`。同时修改 `endWave()` 逻辑：非 Boss 波不再在 endWave 时启动清场倒计时，因为倒计时已在生成完成时启动。

关键改动：
1. 在 `update()` 的 `allSpawned` 判断后，对非 Boss 非经济波启动 `clearBonusTimer`
2. 在 `endWave()` 中移除 `clearBonusTimer` 的启动逻辑

**验证**: 
- `npm run typecheck` → exit 0
- 逻辑：普通波所有敌人生成后立即开始 8 秒倒计时，非等到波次结束

### Step 2: 精英木材掉落提升

**文件**: `src/data/enemies.ts`

- `golem.rewardWood`: 1 → 2
- `auraHaster.rewardWood`: 1 → 2

**验证**: `npm run typecheck` → exit 0

### Step 3: freeze 塔改为 growth 类别

**文件**: `src/data/towers.ts`

将 `freeze` 的 `category` 从 `'special'` 改为 `'growth'`。

注意：`createHeroTower` 会为 growth 塔设置初始属性（str/agi/int/attrPoints/skillPoints 等），popCost 需改为 2（与其他 growth 塔一致），levels 需要扩展为 30 级（当前只有 3 级）。

改动：
- `category: 'growth'`
- `popCost: 2`
- `maxLevel: 30`
- `levels` 扩展：前 5 级填具体数值，6-30 级用公式生成（或保持前 3 级不变，4-5 级补充）
- 移除 `special` 分类（如果 freeze 是唯一 special 且 category 类型不再需要）

**验证**: 
- `npm run typecheck` → exit 0
- freeze 合成产物可通过 `createHeroTower` 正确创建

### Step 4: 配方成本调优

**文件**: `src/data/recipes.ts`

- `recipe_growth_fuse.cost.wood`: 10 → 8

**验证**: `npm run typecheck` → exit 0

### Step 5: 合成配方预览面板

**文件**: `index.html`, `src/game/Game.ts`, `src/main.ts`

#### 5a: HTML 结构

在 `ti-combine-section` 内添加配方列表区域：

```html
<div id="ti-combine-section" class="combine-section" style="display:none">
  <div class="section-title">合成</div>
  <div id="ti-combine-info">未匹配到可用配方</div>
  <div id="ti-recipe-list"></div>
  <button id="ti-combine-btn">合成</button>
</div>
```

#### 5b: Game.ts — showCombineInfo 扩展

`showCombineInfo` 中：
1. 保持现有匹配逻辑
2. 新增：遍历所有 RECIPES，为每个配方生成预览条目
3. 已匹配的配方高亮显示
4. 未匹配的配方灰色显示，显示条件文本（如 "需要 2 座 3 级冰霜塔"）

条件文本生成逻辑：
- 遍历 `recipe.ingredients`，按 `towerId#level` 分组
- 格式："N 座 L 级 {塔名} + M 座 L 级 {塔名} → {产物名}"

#### 5c: CSS 样式

在 `index.html` 的 `<style>` 中添加配方列表样式：
- `.recipe-item` 条目样式
- `.recipe-item.unlocked` 可合成样式（金色边框）
- `.recipe-item.locked` 不可合成样式（灰色半透明）
- `.recipe-item .recipe-name` 配方名
- `.recipe-item .recipe-condition` 条件文本
- `.recipe-item .recipe-cost` 费用

#### 5d: main.ts 事件绑定

无需额外事件绑定（配方预览是纯展示，合成按钮已有事件）。

**验证**: 
- `npm run typecheck` → exit 0
- `npm run build` → exit 0
- 手动验证：选中 2 座 3 级 frost 时，frost→freeze 配方高亮，其他配方灰色显示

### Step 6: 全量验证

**验证**:
- `npm run typecheck` → exit 0
- `npm run build` → exit 0
- `npm test` → 全部通过

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] 普通波清场奖励在敌人生成完毕时启动（非波次结束后）
- [ ] golem 和 auraHaster 的 rewardWood = 2
- [ ] freeze 塔 category = 'growth'，合成产物正确创建为 HeroTower
- [ ] growth_fuse 配方木材成本 = 8
- [ ] 合成面板显示所有配方预览，已解锁/未解锁状态正确
- [ ] 未解锁配方显示清晰的条件文本

## STOP conditions

- freeze 塔改为 growth 后，`createHeroTower` 无法正确初始化（缺少 levels 数据等）
- 清场奖励计时逻辑与现有 Boss 波/经济波逻辑冲突
- 配方预览面板影响现有合成匹配逻辑
- 类型检查失败