# 绿色循环圈

塔防游戏《绿色循环圈》— HTML5 Canvas 2D + TypeScript + Vite，单文件构建产物。

## 项目信息

| 项 | 值 |
|----|----|
| 位置 | `/Users/doer/dev/yoo/games/green-cycle/` |
| 技术栈 | TypeScript + Vite + Canvas 2D + Web Audio |
| 架构 | ECS-lite（集中式 State + 8 纯函数系统） |
| 产物 | `public/games/green-cycle/index.html` 单文件（JS/CSS 全内联） |
| 当前进度 | M10 + 里程碑一·二（plans/012-013）完成 |

## 快速开始

```bash
cd games/green-cycle
npm install          # 安装依赖
npm run dev          # dev 服务器 → http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run test         # vitest run (6 files, 44 tests)
npm run build        # 单文件 → ../../public/games/green-cycle/
npm run lint         # ESLint 检查
```
## 目录结构

```
green-cycle/
├── AGENT.md                  # 本文件
├── assets/                   # SVG 精灵（towers/icons/projectiles/tiles）
├── docs/
│   ├── proposal/             # 初始设计归档
│   └── progress/             # completed.md + roadmap.md
├── plans/                    # 001-013 实施计划（全部 DONE）
├── src/
│   ├── config.ts             # 全局常量（50 波、难度系数、经济配置）
│   ├── types.ts              # 类型契约（Tower/Enemy/Projectile/Recipe 等）
│   ├── main.ts               # 入口，DOM 绑定与事件
│   ├── game/                 # State.ts / Game.ts / Loop.ts
│   ├── entities/             # 实体工厂（Enemy/Tower/HeroTower/Projectile/Effect）
│   ├── systems/              # 8 系统（Wave/Movement/TowerAI/Combat/Aura/Skill/Economy/Effect）
│   ├── data/                 # 数据表（towers/enemies/waves/recipes/skills/armor）
│   ├── render/               # 像素风渲染（Entity/Map/UIRenderer + PixelArt）
│   ├── utils/                # 工具（Path/Quadtree/Pool/BuffUtil/RecipeUtil/SaveManager）
│   ├── audio/                # 8-bit 程序化音效
│   └── input/                # 输入管理（点击/拖拽/框选/右键）
├── index.html                # 游戏 HTML + CSS
├── package.json
└── vite.config.ts            # vite-plugin-singlefile 内联打包
```

## 已实现里程碑

| 阶段 | 内容 | 计划 |
|------|------|------|
| M0-M4 | MVP 核心玩法（8 系统、50 波、护甲克制、塔系统） | — |
| M5 | 成长塔技能系统（4 主动 + 2 被动技能） | — |
| M6 | 辅助/光环/控制塔（冰霜/腐蚀/眩晕/冰冻） | — |
| M7 | 合成系统（多选/配方匹配/差价返还） | — |
| M8 | 存档与难度（localStorage/难度解锁/无尽模式） | — |
| M9 | 音效/UI/性能（Quadtree 索敌/离屏缓存/专属音效） | — |
| M10 | UI 资源 SVG 化（塔/技能/地块/图标） | — |
| 里程碑一 | 经济-合成打磨（清场提速/精英木材/freeze改growth/配方预览） | plans/012 |
| 里程碑二 | 敌人特性克制（隐形/飞行/分裂机制实装） | plans/013 |

## 关键契约

- 系统签名：`update(state: GameState, dt: number): void`
- 即时命中：`CombatSystem.applyDamage(state, enemy, damage, attackType, sourceTowerId)`
- 实体工厂：`createEnemy` / `createTower` / `createHeroTower` / `createProjectile`
- 状态机：`menu | ready | battling | paused | won | lost`
- 塔属性：普通塔 `getTowerStat(t)`，成长塔 `getHeroStat(t)`
- 类型扩展：`types.ts` 只增不改现有字段