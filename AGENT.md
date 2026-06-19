# Yoo 博客代理指南

## 项目概述

一个极简风格的个人博客，基于 [Astro](https://astro.build) 构建，部署于 Cloudflare Pages。内容优先，零客户端 JS，纯静态 HTML。

## 代理角色

作为本项目的开发代理，负责：

- 文章撰写与编辑
- 样式调整与主题优化
- 功能扩展与 Bug 修复
- 部署与配置管理

## 技术栈

| 项目 | 技术 | 版本 |
|------|------|------|
| 框架 | Astro | ^4.16.0 |
| 语言 | TypeScript | - |
| 构建工具 | Vite | - |
| 部署平台 | Cloudflare Pages | - |

## 目录结构

```
├── public/                    # 静态资源（原样对外提供）
│   ├── games/                # 游戏构建产物（green-cycle 为生成物，gitignore）
│   │   ├── breakout/         # 打砖块（纯 HTML/JS，无构建）
│   │   └── green-cycle/      # ← vite build 生成
│   └── favicon.svg
├── games/                     # 游戏源码项目（不对外提供）
│   ├── green-cycle/          # TypeScript + Vite 塔防游戏
│   │   ├── src/  docs/  AGENT.md  package.json  vite.config.ts
│   │   └── 构建输出 → ../../public/games/green-cycle/
│   ├── green-cycle-plan.md   # 规划文档
│   ├── green-cycle-prd.md
│   └── green-cycle-research.md
├── src/
│   ├── content/
│   │   ├── config.ts        # 内容集合 schema
│   │   └── posts/           # Markdown 文章（核心）
│   ├── layouts/             # 页面布局组件
│   │   ├── BaseLayout.astro
│   │   └── PostLayout.astro
│   ├── pages/               # 路由页面
│   │   ├── index.astro      # 首页（文章列表）
│   │   ├── games/
│   │   │   └── index.astro  # 游戏大厅页
│   │   ├── posts/[...slug].astro
│   │   └── category/
│   │       ├── index.astro
│   │       └── [category].astro
│   ├── consts.ts            # 站点常量
│   └── styles/
│       └── global.css       # 全局样式与主题变量
├── astro.config.mjs         # Astro 配置
├── package.json             # build 脚本编排：build:games && astro build
├── tsconfig.json
└── wrangler.toml            # Cloudflare Pages 配置
```

## 常用命令

```bash
npm install                  # 安装博客依赖
npm run dev                  # 博客开发服务器 http://localhost:4321
npm run build                # 构建游戏 + 博客到 dist/
npm run preview              # 预览构建结果
npx wrangler pages deploy dist  # CLI 部署到 Cloudflare Pages
```

### 游戏开发

游戏源码在 `games/` 目录，独立于博客构建：

```bash
# green-cycle 塔防游戏
cd games/green-cycle
npm install              # 安装游戏依赖
npx vite                 # 游戏开发服务器 http://localhost:5173
npm run build            # 构建到 public/games/green-cycle/
npx tsc --noEmit         # 类型检查
```

## 写作规范

### 新建文章

在 `src/content/posts/` 目录下新建 `.md` 文件：

```markdown
---
title: '文章标题'
description: '文章摘要'
pubDate: 2026-06-17
category: '随笔'
tags: ['标签1', '标签2']
draft: false
---

正文内容...
```

### Frontmatter 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `title` | string | 是 | - | 文章标题 |
| `description` | string | 否 | - | 摘要，显示在列表 |
| `pubDate` | date | 是 | - | 发布日期 |
| `updatedDate` | date | 否 | - | 更新日期 |
| `category` | string | 否 | `未分类` | 分类 |
| `tags` | string[] | 否 | `[]` | 标签 |
| `draft` | boolean | 否 | `false` | 草稿不发布 |

## 配置项

| 配置项 | 文件 | 说明 |
|--------|------|------|
| 站点标题 | `src/consts.ts` | `SITE_TITLE` |
| 站点描述 | `src/consts.ts` | `SITE_DESCRIPTION` |
| 站点 URL | `astro.config.mjs` | `site` 字段 |
| 主题颜色 | `src/styles/global.css` | CSS 变量 |
| 代码高亮 | `astro.config.mjs` | `shikiConfig.theme` |

## 部署流程

### Git 自动部署（推荐）

1. 推送代码到 GitHub / GitLab
2. Cloudflare Dashboard → Pages → Create a project → Connect to Git
3. 构建配置：
   - **Framework preset**: `Astro`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variable**: `NODE_VERSION` = `18`
4. Save and Deploy

### Wrangler CLI 部署

```bash
npm run build
npx wrangler pages deploy dist
```

## 常见任务

### 添加新页面

1. 在 `src/pages/` 下创建 `.astro` 文件
2. 使用 `BaseLayout` 作为布局组件
3. 导出页面内容

### 修改主题样式

1. 编辑 `src/styles/global.css`
2. 修改 CSS 变量
3. 运行 `npm run dev` 预览效果

### 添加新分类

文章的 `category` 字段自动生成分类页面，无需额外配置。

### 添加新游戏

1. 在 `games/` 下创建游戏项目（如 `games/my-game/`）
2. 配置构建输出到 `public/games/my-game/`（Vite 项目设 `outDir`，纯 HTML 直接放 `public/games/`）
3. 在 `src/pages/games/index.astro` 的 `games` 数组中添加入口
4. 若游戏有构建步骤，在根 `package.json` 的 `build:games` 脚本中追加
5. 若构建产物在 `public/games/` 下，在 `.gitignore` 中添加忽略规则

### 调试构建问题

```bash
npm run build 2>&1 | head -100
```

## 注意事项

- 文章的 `draft: true` 不会在生产构建中输出
- 确保 `pubDate` 格式正确（YYYY-MM-DD）
- 分类名称建议使用中文，避免特殊字符
- 部署前确保 `astro.config.mjs` 的 `site` 配置正确