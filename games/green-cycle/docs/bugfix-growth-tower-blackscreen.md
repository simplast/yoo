# green-cycle 成长塔点击黑屏 Bug 排查与修复报告

## 现象

游戏运行中，对**成长塔（如剑圣塔 `jianfa`）**升级到 3 级并继续运行一段时间后，点击该塔，canvas 游戏区域变黑，仅顶部状态栏与底部塔面板保持显示。

## 复现路径

1. 开始游戏，建造一座成长塔（剑圣塔）。
2. 进行 1-2 波，期间使用清屏、加速。
3. 将塔升级到 3 级。
4. 继续运行，成长塔通过击杀获得经验自动升级。
5. 当成长塔升到 6 级或更高时，点击该塔。
6. 游戏画面变黑。

> 注：由于成长塔自动升级依赖经验积累，触发时机不固定，因此用户感觉“不稳定、无必现流程”。

## 根因分析

### 数据定义

成长塔 `jianfa` 的 `maxLevel = 30`，但 `levels` 数组只有 5 项（对应 1-5 级手动升级属性）：

```typescript
// src/data/towers.ts
{
  id: 'jianfa',
  maxLevel: 30,
  levels: [
    { damage: 15, attackSpeed: 1.2, range: 90, upgradeCost: 120 },  // level 1
    { damage: 22, attackSpeed: 1.2, range: 95, upgradeCost: 160 },  // level 2
    { damage: 30, attackSpeed: 1.3, range: 100, upgradeCost: 220 }, // level 3
    { damage: 40, attackSpeed: 1.3, range: 105, upgradeCost: 300 }, // level 4
    { damage: 55, attackSpeed: 1.4, range: 110, upgradeCost: 0 },   // level 5
  ],
}
```

成长塔 5 级之后通过 [`addExp`](file:///Users/doer/dev/yoo/games/green-cycle/src/entities/HeroTower.ts) 自动升级，最高到 30 级，其战斗属性由 [`getHeroStat`](file:///Users/doer/dev/yoo/games/green-cycle/src/entities/HeroTower.ts) 根据公式动态计算。

### 触发代码

选中塔时，[`EntityRenderer.drawSelectionRing`](file:///Users/doer/dev/yoo/games/green-cycle/src/render/EntityRenderer.ts) 会调用 `getTowerStat` 获取射程：

```typescript
// 修复前
const stat = getTowerStat(tower);
const range = stat.range;
```

而 `getTowerStat` 直接读取 `levels[level - 1]`，没有做成长塔判断：

```typescript
// src/entities/Tower.ts
export function getTowerStat(t: Tower) {
  const lv = t.levels[t.level - 1];
  return {
    damage: lv.damage,
    attackSpeed: lv.attackSpeed,
    range: lv.range,
  };
}
```

当成长塔升到 6 级时，`levels[5]` 为 `undefined`，访问 `undefined.damage` 抛出：

```
TypeError: Cannot read properties of undefined (reading 'damage')
    at getTowerStat (Tower.ts)
    at drawSelectionRing (EntityRenderer.ts)
    at drawEntities (EntityRenderer.ts)
    at Renderer.render (Renderer.ts)
    at Game.render (Game.ts)
    at Game.update (Game.ts)
    at Loop.tick (Loop.ts)
```

异常从渲染主循环抛出，导致 canvas 世界层不再绘制；而顶部/底部为 HTML DOM，仍保持显示，因此出现“仅上下栏可见，其余黑屏”。

### 为何其他系统未崩溃

- `TowerAISystem` 与 `Game.showTowerInfo` 已经区分成长塔与普通塔：
  ```typescript
  const stat = tower.isGrowth ? getHeroStat(tower) : getTowerStat(tower);
  ```
- 只有 `drawSelectionRing` 遗漏了该判断，错误地统一使用 `getTowerStat`。

## 修复方案

在 `EntityRenderer.drawSelectionRing` 中，对成长塔使用 `getHeroStat`，普通塔保持 `getTowerStat`：

```typescript
import { getHeroStat } from '../entities/HeroTower';

function drawSelectionRing(ctx, tower, showRange) {
  const stat = tower.isGrowth ? getHeroStat(tower) : getTowerStat(tower);
  const range = stat.range;
  // ...
}
```

### 修改文件

- [`src/render/EntityRenderer.ts`](file:///Users/doer/dev/yoo/games/green-cycle/src/render/EntityRenderer.ts)

## 验证

### 修复前（pre-fix）

通过浏览器控制台强制将剑圣塔升到 6 级并选中，日志捕获到：

```json
{
  "location": "Tower.ts:getTowerStat",
  "msg": "levels[level-1] is undefined",
  "data": { "level": 6, "levelsLen": 5 }
}
```

紧接着 `Renderer.ts:render` 抛出 `TypeError: Cannot read properties of undefined (reading 'damage')`。

### 修复后（post-fix）

同一复现场景下：

```json
{ "selected": 1, "tower": { "id": "jianfa", "level": 6 } }
```

手动调用 `update(0.016)` + `render()` 成功返回，无异常；普通塔 `arrow` 的选中/渲染流程同样正常。

## 调试辅助脚本

为便于后续复现与测试，按用户建议新增了 [`src/debug/cheat.ts`](file:///Users/doer/dev/yoo/games/green-cycle/src/debug/cheat.ts)，通过 `window.__cheat` 暴露：

- `addGold(amount)` — 加金币
- `setSpeed(speed)` — 设置倍速
- `buildTower(id, x, y)` — 指定位置建塔
- `upgradeSelected(times)` — 升级选中塔
- `levelTowerTo(instanceId, level)` — 直接设置塔等级
- `selectTower(instanceId)` — 选中指定塔
- `killAllEnemies()` — 清屏
- `reproduceBlackscreen()` — 一键复现本次 bug 场景

> 该脚本仅用于开发/测试阶段，开关规则如下：
>
> - **生产构建**（`npm run build`）：默认关闭，如需临时开启可访问 `?cheat=1`
> - **开发构建**（`npm run dev`）：默认开启，如需关闭可访问 `?cheat=0`
>
> 开启后，在浏览器控制台即可调用，例如：
> ```js
> window.__cheat.addGold(9999);
> window.__cheat.setSpeed(3);
> window.__cheat.buildTower('jianfa', 640, 360);
> window.__cheat.reproduceBlackscreen();
> ```

## 结论

- **根因**：成长塔 6 级后 `drawSelectionRing` 错误使用 `getTowerStat` 访问越界 `levels` 数组，导致渲染循环抛出 `TypeError`，canvas 世界层停止绘制。
- **修复**：在 `drawSelectionRing` 中根据 `tower.isGrowth` 选择 `getHeroStat` / `getTowerStat`，与游戏其他子系统保持一致。
- **状态**：已修复并验证，普通塔渲染未受影响。
