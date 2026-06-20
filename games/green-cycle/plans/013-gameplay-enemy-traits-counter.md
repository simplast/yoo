# Plan 013: 敌人特性与塔克制体系（里程碑二）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.

## Status

- **Priority**: P1 (高)
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: 004（测试基线），012（经济-合成打磨）
- **Category**: gameplay
- **Planned at**: commit `b1ec2db`, 2026-06-21

## Why this matters

当前 `invisible`、`flying`、`split` 三种敌人能力仅在 `EnemyDef.abilities` 中声明，代码中完全未实现机制。幽灵（ghost）和普通怪一样被所有塔攻击，飞龙（wyvern）和地面怪一样被地面塔命中，分裂怪（splitter）死亡后不会分裂。这导致第 16-24 波、31-48 波的"隐形/飞行/分裂"提示形同虚设，玩家无需针对这些特性做任何战术调整。

本计划将三个特性从"贴图差异"变为"战术差异"，迫使玩家针对性部署塔组。

## Current state analysis

### 1. 隐形机制（现状）

**声明**：`ghost.abilities = ['invisible']`，`dragonBoss.abilities = ['boss', 'flying', 'magicImmune']`（不含 invisible）。

**代码缺失**：
- `TowerAISystem.selectTarget()` 完全不检查 `invisible` 能力
- 无 `trueSight` 机制（塔属性中无此字段）
- 第 17 波 hint 写"需真视"，但代码中不存在真视

**目标**：无 `trueSight` 的塔无法将 `invisible` 敌人作为索敌目标。混乱攻击（chaos）和神圣攻击（holy）塔天然拥有真视能力。

### 2. 飞行机制（现状）

**声明**：`wyvern.abilities = ['flying']`，`dragonBoss.abilities = ['boss', 'flying', 'magicImmune']`。

**代码缺失**：
- `TowerAISystem.selectTarget()` 完全不检查 `flying` 能力
- `CombatSystem` 投射物命中不检查目标是否飞行
- 无 `antiAir` 机制（塔属性中无此字段）

**目标**：无 `antiAir` 的塔无法索敌/命中 `flying` 敌人。即时命中塔（projectileSpeed=0，如闪电塔、眩晕塔、电法）天然对空，因为它们是"魔法能量"而非"地面投射物"。投射物塔需要 `antiAir` 属性。

### 3. 分裂机制（现状）

**声明**：`splitter.abilities = ['split']`。

**代码缺失**：
- `CombatSystem.applyDamage()` 中死亡处理不检查 `split` 能力
- 无子怪生成逻辑

**目标**：splitter 死亡时生成 2 个子怪（继承路径进度、护甲类型，血量减半），子怪不再分裂（避免无限分裂）。

### 4. 真视/对空辅助塔

**现状**：15 座塔中，哪些应该有 trueSight/antiAir？

**设计原则**：
- **攻击类型决定真视**：混乱（chaos）和神圣（holy）攻击天然破隐。即 chaos（混乱塔）、tianshen（天神）自动拥有 trueSight。
- **投射物类型决定对空**：即时命中塔（projectileSpeed=0）天然对空。即 lightning（闪电塔）、stun（眩晕塔）、dianfa（电法）自动拥有 antiAir。
- **辅助塔赋予能力**：部分 support/special 塔可添加 trueSight/antiAir 作为辅助能力。
- **光环塔可选**：可给某些光环塔增加 aura 形式的 trueSight/antiAir 赋予。

**具体分配**：

| 塔 | trueSight | antiAir | 理由 |
|-----|-----------|---------|------|
| arrow（箭塔） | - | - | 基础穿刺塔 |
| cannon（破坏塔） | - | - | 基础单体塔 |
| splash（群攻塔） | - | - | 基础溅射塔 |
| chaos（混乱塔） | 天然 | - | 混乱攻击无视护甲，理应破隐 |
| lightning（闪电塔） | - | 天然 | 即时命中，闪电从天空劈下 |
| frost（冰霜塔） | - | - | 投射物减速 |
| corrosive（腐蚀塔） | - | - | 投射物减甲 |
| stun（眩晕塔） | - | 天然 | 即时命中 |
| freeze（冰冻塔） | - | - | 投射物控制 |
| auraHaste（加速光环） | - | - | 纯光环 |
| auraDamage（加攻光环） | - | - | 纯光环 |
| auraSlow（减速光环） | - | - | 纯光环 |
| tianshen（天神） | 天然 | - | 神圣攻击 |
| jianfa（剑圣） | - | - | 物理攻击，投射物 |
| dianfa（电法） | - | 天然 | 即时命中 |

### 5. 索敌策略扩展

**现状**：`TargetStrategy` 支持 nearest/first/strongest/weakest/priority 五种。

**目标**：扩展 `priority` 策略，使其能针对飞行、隐形、分裂等关键特性集火。当前 priority 策略仅优先 boss/auraHaste，扩展为：
- 优先 boss
- 其次 flying（飞行单位威胁大，需优先处理）
- 再次 invisible（隐形单位漏过去就找不到）
- 再次 split（分裂怪需尽快击杀防止分裂）
- 再次 auraHaste（光环怪）
- 同优先级取最近

## Scope

**In scope**:
- `src/types.ts` — TowerDef 新增 `trueSight`/`antiAir` 字段，TargetStrategy 逻辑扩展
- `src/data/towers.ts` — 为相关塔添加 `trueSight`/`antiAir` 属性
- `src/systems/TowerAISystem.ts` — selectTarget 增加 invisible/flying 过滤，扩展 priority 策略
- `src/systems/CombatSystem.ts` — applyDamage 增加 split 分裂逻辑，投射物命中增加 flying 检查
- `src/entities/Enemy.ts` — createEnemy 支持创建子怪（分裂用）
- `src/game/State.ts` — 添加 `addEnemy` 方法（如果尚未存在）用于分裂时动态添加敌人

**Out of scope**:
- 新增塔类型（除非现有塔不足以覆盖克制需求）
- 护甲系统修改
- 渲染修改（隐形/飞行敌人视觉差异已有或后续处理）
- 光环塔的 trueSight/antiAir 光环赋予（后续扩展）
- 分裂怪的子怪视觉精灵

## Steps

### Step 1: 类型扩展

**文件**: `src/types.ts`

#### 1a: TowerDef 新增字段

```typescript
export interface TowerDef {
  // ... 现有字段
  // 真视：可索敌隐形敌人
  trueSight?: boolean;
  // 对空：可索敌/命中飞行敌人
  antiAir?: boolean;
}
```

#### 1b: TargetStrategy 不变，但 priority 逻辑扩展

`TargetStrategy` 类型不变，但 `priority` 策略的实现逻辑需要扩展（见 Step 3）。

**验证**: `npm run typecheck` → exit 0

### Step 2: 塔属性配置

**文件**: `src/data/towers.ts`

为以下塔添加属性：

```typescript
// chaos: 混乱攻击，破隐
chaos: { ... trueSight: true, ... }

// lightning: 即时命中，对空
lightning: { ... antiAir: true, ... }

// stun: 即时命中，对空
stun: { ... antiAir: true, ... }

// tianshen: 神圣攻击，破隐
tianshen: { ... trueSight: true, ... }

// dianfa: 即时命中，对空
dianfa: { ... antiAir: true, ... }
```

**验证**: `npm run typecheck` → exit 0

### Step 3: 索敌系统改造

**文件**: `src/systems/TowerAISystem.ts`

#### 3a: selectTarget 增加 invisible 过滤

在 `selectTarget()` 的候选敌人筛选中，增加 invisible 检查：

```typescript
// 隐形敌人：无 trueSight 的塔不可索敌
if (e.abilities.includes('invisible') && !tower.trueSight) continue;
```

#### 3b: selectTarget 增加 flying 过滤

在 `selectTarget()` 的候选敌人筛选中，增加 flying 检查：

```typescript
// 飞行敌人：无 antiAir 且非即时命中的塔不可索敌
if (e.abilities.includes('flying') && !tower.antiAir && tower.projectileSpeed > 0) continue;
```

注意：即时命中塔（projectileSpeed=0）天然对空，即使没有 `antiAir` 属性。但为了清晰，给即时命中塔也显式设置 `antiAir: true`。

#### 3c: priority 策略扩展

修改 `selectTarget` 中 `priority` 策略的优先级计算：

```typescript
case 'priority': {
  const getPriority = (enemy: Enemy): number => {
    if (enemy.abilities.includes('boss')) return 5;
    if (enemy.abilities.includes('flying')) return 4;
    if (enemy.abilities.includes('invisible')) return 3;
    if (enemy.abilities.includes('split')) return 2;
    if (enemy.abilities.includes('auraHaste')) return 1;
    return 0;
  };
  const ePri = getPriority(e);
  const bestPri = getPriority(best);
  if (ePri !== bestPri) {
    replace = ePri > bestPri;
  } else {
    replace = dist2(tower.x, tower.y, e.x, e.y) < dist2(tower.x, tower.y, best.x, best.y);
  }
  break;
}
```

**验证**: `npm run typecheck` → exit 0

### Step 4: 战斗系统改造 — 飞行 + 分裂

**文件**: `src/systems/CombatSystem.ts`

#### 4a: 投射物命中增加 flying 检查

在 `update()` 的投射物命中逻辑中，如果目标有 flying 能力且投射物来源塔没有 antiAir 且非即时命中，投射物应穿过目标（不命中）。

但更简单的实现：在 TowerAISystem 索敌阶段已经过滤了 flying 目标，投机物不会以 flying 敌人为目标。然而，如果敌人在投射物飞行过程中获得 flying 能力（目前没有这种情况），会造成问题。

**结论**：索敌阶段过滤即可，CombatSystem 不需要额外检查。但为安全起见，在投射物命中时加上防御性检查。

#### 4b: split 分裂逻辑

在 `applyDamage()` 的死亡处理中，增加分裂逻辑：

```typescript
// 分裂处理
if (enemy.abilities.includes('split') && !enemy._splitChild) {
  // 生成 2 个子怪，继承路径进度，血量减半，标记为子怪（不再分裂）
  for (let i = 0; i < 2; i++) {
    const child = createEnemy(enemy.id, state.path, state.difficulty, state.enemyPool);
    child.hp = Math.floor(enemy.maxHp * 0.5);
    child.maxHp = child.hp;
    child.pathProgress = enemy.pathProgress;
    child._splitChild = true; // 子怪不再分裂
    // 子怪位置在父怪附近偏移
    child.x = enemy.x + (Math.random() - 0.5) * 20;
    child.y = enemy.y + (Math.random() - 0.5) * 20;
    state.addEnemy(child);
  }
}
```

需要在 `Enemy` 类型中添加 `_splitChild` 标记（或使用另一种方式避免无限分裂）。

**文件**: `src/types.ts`

```typescript
export interface Enemy extends EnemyDef {
  // ... 现有字段
  // 分裂子怪标记（避免无限分裂）
  _splitChild?: boolean;
}
```

**验证**: 
- `npm run typecheck` → exit 0
- 逻辑：splitter 死亡时生成 2 个子怪，子怪血量减半，不再分裂

### Step 5: 全量验证

**验证**:
- `npm run typecheck` → exit 0
- `npm run build` → exit 0
- `npm test` → 全部通过

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] 无 trueSight 的塔无法索敌 ghost（隐形幽灵）
- [ ] chaos（混乱塔）和 tianshen（天神）可正常索敌/攻击 ghost
- [ ] 无 antiAir 的投射物塔无法索敌 wyvern（飞龙）
- [ ] lightning（闪电塔）、stun（眩晕塔）、dianfa（电法）可正常索敌/攻击 wyvern
- [ ] dragonBoss（飞行+魔免）可被 antiAir 塔攻击，但魔法攻击伤害为 0
- [ ] splitter 死亡时生成 2 个子怪，子怪继承路径进度
- [ ] 子怪血量 = 父怪 maxHp * 0.5
- [ ] 子怪不再分裂（_splitChild 标记）
- [ ] priority 索敌策略按 boss > flying > invisible > split > auraHaste 排序
- [ ] 所有现有测试通过

## STOP conditions

- typecheck 或 build 失败
- 索敌逻辑变更后，现有关卡（如 Boss 波）出现无法攻击 Boss 的情况
- 分裂逻辑导致性能问题（大量子怪）
- 子怪继承路径进度后出现在不可达位置
- 投射物在飞行过程中目标变为不可索敌状态（边界情况）

## Maintenance notes

- `trueSight` 和 `antiAir` 是 TowerDef 上的可选布尔字段，默认 undefined（等同于 false）
- 即时命中塔（projectileSpeed=0）天然对空，但为清晰仍显式设置 `antiAir: true`
- 分裂子怪使用 `_splitChild` 标记避免无限分裂，不使用 `abilities` 字段（因为 `abilities` 是 EnemyDef 的只读属性）
- 如果未来需要光环塔赋予 trueSight/antiAir，可在 AuraSystem 中拓展 allyAuraCache 的计算逻辑
- 第 17 波 hint "需真视" 现在有了实际意义——玩家需要部署 chaos 或 tianshen 才能有效应对幽灵波