# Plan 011: 扩充合成配方系统（基础塔→成长塔中阶合成链）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bc95bc..HEAD -- src/data/recipes.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: 004（测试基线兜底），010（木材获取改善后合成才有意义）
- **Category**: direction (gameplay)
- **Planned at**: commit `7bc95bc`, 2026-06-20

## Why this matters

当前合成系统仅 3 个配方：箭塔→溅射塔（3 座 3 级箭塔）、炮塔→混沌塔（2 座 5 级炮塔）、成长塔融合（天神+剑圣 10 级→天神 15 级）。前两个是基础塔合成，第三个是终局合成，中间缺乏"基础塔→成长塔"的中阶合成链路。本计划新增 4 个中阶合成配方，将低阶基础/辅助塔合成为成长塔，填补策略空间。

## Current state

`src/types.ts:250-256` — `Recipe` 接口（注意：不是 `RecipeDef`）：

```ts
export interface Recipe {
  id: string;
  name: string;
  ingredients: { towerId: string; level?: number }[];  // 每个材料独立条目
  result: { towerId: string; level?: number };
  cost?: { gold?: number; wood?: number };
}
```

`src/data/recipes.ts` — 当前 3 条配方：

```ts
export const RECIPES: Recipe[] = [
  // 3 座 3 级箭塔 → 1 级群攻塔
  {
    id: 'recipe_arrow_to_splash',
    name: '箭塔合群攻',
    ingredients: [
      { towerId: 'arrow', level: 3 },
      { towerId: 'arrow', level: 3 },
      { towerId: 'arrow', level: 3 },
    ],
    result: { towerId: 'splash', level: 1 },
    cost: { gold: 100 },
  },
  // 2 座 5 级破坏塔 → 1 级混乱塔
  {
    id: 'recipe_cannon_to_chaos',
    name: '破坏塔合混乱塔',
    ingredients: [
      { towerId: 'cannon', level: 5 },
      { towerId: 'cannon', level: 5 },
    ],
    result: { towerId: 'chaos', level: 1 },
    cost: { gold: 200, wood: 5 },
  },
  // 天神 + 剑圣 10 级 → 15 级天神
  {
    id: 'recipe_growth_fuse',
    name: '成长塔融合',
    ingredients: [
      { towerId: 'tianshen', level: 10 },
      { towerId: 'jianfa', level: 10 },
    ],
    result: { towerId: 'tianshen', level: 15 },
    cost: { gold: 500, wood: 10 },
  },
];
```

`src/utils/RecipeUtil.ts` — `matchRecipe` 将 `ingredients` 按 `towerId#level` 分组匹配，支持多个同 id 同等级材料。

### 产物塔分析

freeze/dianfa/jianfa/tianshen 都是 **growth 类成长塔**（`category: 'growth'`，`popCost: 2`），能升级、学技能，比材料塔（basic/support 类，`popCost: 1`）长期价值高得多。虽然 Lv1 面板数值较低，但成长潜力是核心价值。

| 配方 | 材料塔 (Lv×N) | 材料伤害 | 产物塔 (Lv1) | 产物伤害 | 产物类型 |
|------|-------------|---------|-------------|---------|---------|
| frost→freeze | frost Lv3 ×2 | 18 | freeze Lv1 | 4 | **growth**（冻结控制） |
| lightning→dianfa | lightning Lv4 ×2 | 48 | dianfa Lv1 | 14 | **growth**（闪电链） |
| stun→jianfa | stun Lv3 ×2 | 12 | jianfa Lv1 | 12 | **growth**（剑刃风暴） |
| corrosive→tianshen | corrosive Lv3 ×2 | 15 | tianshen Lv1 | 15 | **growth**（审判之光） |

**关键**：产物塔是成长塔，可通过经验升级和学技能大幅提升。合成是"牺牲数量换质量+成长潜力"。

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `npm run typecheck`    | exit 0, no errors   |
| Build     | `npm run build`        | exit 0              |

## Scope

**In scope**:
- `src/data/recipes.ts` — 新增 4 个合成配方条目

**Out of scope**:
- `src/data/towers.ts` — 不新增塔类型
- `src/types.ts` — 不改 `Recipe` 接口
- `src/utils/RecipeUtil.ts` — 不改匹配逻辑（已验证支持多材料模式）
- 渲染/UI 改动（合成 UI 遍历 `RECIPES` 数组，自动支持新配方）

## Steps

### Step 1: 在 recipes.ts 新增 4 个配方

打开 `src/data/recipes.ts`，在 `RECIPES` 数组末尾（`recipe_growth_fuse` 之后）新增：

```ts
  // 2 座 3 级冰霜塔 → 1 级冰冻塔（成长塔，冻结控制）
  {
    id: 'recipe_frost_to_freeze',
    name: '冰霜塔合冰冻塔',
    ingredients: [
      { towerId: 'frost', level: 3 },
      { towerId: 'frost', level: 3 },
    ],
    result: { towerId: 'freeze', level: 1 },
    cost: { gold: 120, wood: 2 },
  },
  // 2 座 4 级闪电塔 → 1 级电法塔（成长塔，闪电链）
  {
    id: 'recipe_lightning_to_dianfa',
    name: '闪电塔合电法塔',
    ingredients: [
      { towerId: 'lightning', level: 4 },
      { towerId: 'lightning', level: 4 },
    ],
    result: { towerId: 'dianfa', level: 1 },
    cost: { gold: 180, wood: 3 },
  },
  // 2 座 3 级眩晕塔 → 1 级剑圣塔（成长塔，剑刃风暴）
  {
    id: 'recipe_stun_to_jianfa',
    name: '眩晕塔合剑圣塔',
    ingredients: [
      { towerId: 'stun', level: 3 },
      { towerId: 'stun', level: 3 },
    ],
    result: { towerId: 'jianfa', level: 1 },
    cost: { gold: 150, wood: 2 },
  },
  // 2 座 3 级腐蚀塔 → 1 级天神塔（成长塔，审判之光）
  {
    id: 'recipe_corrosive_to_tianshen',
    name: '腐蚀塔合天神塔',
    ingredients: [
      { towerId: 'corrosive', level: 3 },
      { towerId: 'corrosive', level: 3 },
    ],
    result: { towerId: 'tianshen', level: 1 },
    cost: { gold: 200, wood: 3 },
  },
```

**Verify**: `npm run typecheck` → exit 0

### Step 2: 确认产物塔在 towers.ts 中存在

检查 `src/data/towers.ts`，确认 freeze/dianfa/jianfa/tianshen 四个塔定义存在。

**Verify**: `grep -n "'freeze'\|'dianfa'\|'jianfa'\|'tianshen'" src/data/towers.ts` → 每个 id 有 1 个匹配。

### Step 3: 全量验证

**Verify**:
- `npm run typecheck` → exit 0
- `npm run build` → exit 0

### Step 4: 手动验证

启动 `npm run dev`，验证：
1. 选中 2 座 3 级 frost 塔，合成按钮显示"冰霜塔合冰冻塔"配方。
2. 金币和木材足够时，合成成功，2 座 frost 消失，1 座 freeze 出现（成长塔，可升级）。
3. 选中 2 座 4 级 lightning 塔，显示"闪电塔合电法塔"配方。
4. 材料等级不匹配（如 2 级 frost）时不显示配方。
5. 材料数量不足（只有 1 座 frost）时不显示配方。

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] `src/data/recipes.ts` 的 `RECIPES` 数组有 7 条配方（原 3 + 新 4）
- [ ] 新配方的 `result.towerId` 在 `towers.ts` 中有定义
- [ ] 新配方的 `ingredients[].towerId` 在 `towers.ts` 中有定义
- [ ] 新配方使用正确的 `Recipe` 接口格式（`ingredients` 数组 + `result` 对象 + `cost` 对象）
- [ ] 手动验证 5 个场景均通过
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- 产物塔（freeze/dianfa/jianfa/tianshen）在 `towers.ts` 中不存在或 `category` 不是 `'growth'`。
- 产物塔的 `popCost` 不是 2（如果 popCost 意外变化，合成后人口可能超出预期）。
- `RecipeUtil.matchRecipe` 的匹配逻辑与上述 excerpt 不符（已确认支持多材料模式，但如被修改需重新验证）。
- 合成 UI 对 `RECIPES` 数组有硬编码限制（已确认 `Game.ts` 遍历整个数组，无限制）。
- 木材经济不足以支撑新配方消耗（2-3 木/配方），需在 010 执行后再验证。

## Maintenance notes

- 新配方都是"基础/辅助塔→成长塔"的中阶合成，产物塔 Lv1 面板数值不如材料塔，但可通过经验升级和学技能获得远超材料塔的战斗力。这是有意设计——合成是"投资"而非"立即变强"。
- 配方成本（金币/木材）是初始估计，需实际游玩调优。如果发现木材消耗过高导致配方无人使用，可降低 `cost.wood`。
- `matchRecipe` 按数组顺序返回第一个匹配——如果两组不同材料可能匹配同一配方，需确认 `ingredients[].towerId` 唯一标识配方类型。当前每个配方使用不同的材料塔，无冲突。
- 如果未来新增 `category: 'growth'` 的塔类型，可继续扩展"基础→成长"合成链。