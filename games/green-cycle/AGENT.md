# 绿色循环圈

塔防游戏《绿色循环圈》— HTML5 Canvas 2D + TypeScript + Vite，单文件构建产物。

## 项目信息

| 项 | 值 |
|----|----|
| 位置 | `/Users/doer/dev/yoo/games/green-cycle/` |
| 技术栈 | TypeScript + Vite + Canvas 2D + Web Audio |
| 架构 | ECS-lite（集中式状态 + 8 纯函数系统） |
| 产物 | `public/games/green-cycle/index.html` 单文件（JS/CSS 全内联） |
| 当前进度 | M7 完成（合成系统），M8-M9 待开发 |

## 快速开始

```bash
cd games/green-cycle
npm install        # 安装依赖
npx vite           # dev 服务器，端口 5173
npx vite build     # 构建单文件产物到 ../../public/games/green-cycle/
npx tsc --noEmit   # 类型检查
```

## 文档导航

详细文档已按职责拆分至 `docs/` 目录：

| 文档 | 说明 |
|------|------|
| [已完成功能](docs/progress/completed.md) | 已完成阶段实现的功能清单、文件改动、验证状态 |
| [下阶段计划](docs/progress/roadmap.md) | 下阶段任务拆解、涉及文件、关键契约 |
| [原始设计文档](docs/proposal/original-design.md) | 项目初始设计稿归档 |

## 目录结构

```
green-cycle/
├── AGENT.md              # 本文件（项目索引）
├── docs/
│   ├── proposal/         # 设计文档归档
│   │   └── original-design.md
│   └── progress/         # 进度监控
│       ├── completed.md  # 已完成功能
│       └── roadmap.md    # 下阶段计划
├── src/
│   ├── config.ts         # 全局常量
│   ├── types.ts          # 类型契约（只增不改）
│   ├── main.ts           # 入口，绑定 UI
│   ├── game/             # State/Game/Loop
│   ├── entities/         # 实体工厂
│   ├── systems/          # 8 系统
│   ├── render/           # 像素风渲染
│   ├── data/             # 数据表
│   ├── utils/            # 工具
│   ├── audio/            # 8-bit 音效
│   └── input/            # 输入管理
└── package.json          # 项目配置
```

> 构建产物输出到博客目录 `../../public/games/green-cycle/`，由根 `package.json` 的 `build:games` 脚本统一管理。
