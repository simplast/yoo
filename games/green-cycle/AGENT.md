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

## 执行约定

- 不使用 worktree isolation，所有改动直接在主工作区 main 分支上完成
