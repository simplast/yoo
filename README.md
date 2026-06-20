# Yoo

一个极简风格的个人博客，基于 [Astro](https://astro.build) 构建，部署于 Cloudflare Pages。

## 特性

- **极简风格**：内容优先，纯静态 HTML
- **Markdown 写作**：文章存放于 `src/content/posts/`
- **分类浏览**：按分类聚合文章
- **系列文章**：支持 `series` 与 `seriesOrder`，自动生成系列页与上下篇导航
- **小游戏大厅**：聚合 `绿色循环圈` 与 `打砖块` 两个游戏
- **明暗自适应**：跟随系统主题
- **代码复制按钮**：文章代码块支持一键复制
- **自动部署**：Git push 触发 Cloudflare Pages 构建
- **响应式**：适配桌面与移动端

## 本地开发

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 构建游戏 + 博客，输出到 dist/
npm run preview  # 预览构建结果
```

## 写作

在 `src/content/posts/` 目录下新建 `.md` 文件：

```markdown
---
title: '文章标题'
description: '文章摘要'
pubDate: 2026-06-20
updatedDate: 2026-06-21
category: '随笔'
tags: ['标签1']
series: '系列名称'
seriesOrder: 1
draft: false
---

正文内容...
```

### Frontmatter 字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `title` | string | 是 | - | 文章标题 |
| `description` | string | 否 | - | 摘要，显示在列表 |
| `pubDate` | date | 是 | - | 发布日期（YYYY-MM-DD） |
| `updatedDate` | date | 否 | - | 更新日期 |
| `category` | string | 否 | `未分类` | 分类 |
| `tags` | string[] | 否 | `[]` | 标签 |
| `series` | string | 否 | - | 系列名称 |
| `seriesOrder` | number | 否 | - | 系列内顺序 |
| `draft` | boolean | 否 | `false` | 草稿不发布 |

## 小游戏

| 游戏 | 路径 | 说明 |
|------|------|------|
| 绿色循环圈 | `/games/green-cycle/` | TypeScript + Vite 塔防游戏，单文件构建产物 |
| 打砖块 | `/games/breakout/` | 经典 Breakout，纯 HTML/JS |

绿色循环圈源码位于 `games/green-cycle/`，构建后输出到 `public/games/green-cycle/`。

```bash
cd games/green-cycle
npm install
npm run dev      # http://localhost:5173
npm run build    # 输出到 public/games/green-cycle/
```

## 部署到 Cloudflare Pages

### Git 自动部署（推荐）

1. 推送代码到 GitHub / GitLab
2. Cloudflare Dashboard → Pages → Create a project → Connect to Git
3. 构建配置：
   - **Framework preset**: `Astro`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variable**: `NODE_VERSION` = `18`
4. Save and Deploy

之后每次 `git push` 自动触发部署。

### Wrangler CLI

```bash
npm run build
npx wrangler pages deploy dist
```

## 项目结构

```
├── public/                    # 静态资源
│   ├── favicon.svg
│   └── games/                 # 游戏入口（green-cycle 为构建产物，gitignore）
├── games/
│   └── green-cycle/           # 塔防游戏源码
├── plans/                     # 项目改进计划
├── src/
│   ├── content/
│   │   ├── config.ts          # 内容集合 schema
│   │   └── posts/             # Markdown 文章
│   ├── layouts/               # 布局组件
│   │   ├── BaseLayout.astro
│   │   └── PostLayout.astro
│   ├── pages/                 # 路由页面
│   │   ├── index.astro        # 首页（文章列表）
│   │   ├── posts/[...slug].astro
│   │   ├── category/          # 分类总览 + 详情
│   │   ├── series/            # 系列总览 + 详情
│   │   └── games/index.astro  # 游戏大厅
│   ├── consts.ts              # 站点常量
│   └── styles/global.css      # 全局样式与主题变量
├── astro.config.mjs
├── package.json
├── tsconfig.json
└── wrangler.toml
```

## 自定义

- 站点标题/描述：`src/consts.ts`
- 站点 URL：`astro.config.mjs` 的 `site` 字段
- 主题颜色：`src/styles/global.css` 的 CSS 变量
- 代码高亮主题：`astro.config.mjs` 的 `shikiConfig.theme`
