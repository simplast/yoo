# Yoo

一个极简风格的个人博客，基于 [Astro](https://astro.build) 构建，部署于 Cloudflare Pages。

## 特性

- **极简风格**：内容优先，零客户端 JS，纯静态 HTML
- **Markdown 写作**：所有文章以 Markdown 存放于 `src/content/posts/`
- **分类预览**：按分类聚合浏览文章
- **明暗自适应**：跟随系统主题
- **自动部署**：Git push 即触发 Cloudflare Pages 构建
- **响应式**：适配桌面与移动端

## 本地开发

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 输出到 dist/
npm run preview
```

## 写作

在 `src/content/posts/` 目录下新建 `.md` 文件：

```markdown
---
title: '文章标题'
description: '文章摘要'
pubDate: 2026-06-17
category: '随笔'
tags: ['标签1']
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

## 部署到 Cloudflare Pages

### Git 自动部署（推荐）

1. 推送代码到 GitHub / GitLab
2. Cloudflare Dashboard → Pages → Create a project → Connect to Git
3. 选择仓库，构建配置：
   - **Framework preset**: `Astro`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variable**: `NODE_VERSION` = `18`
4. Save and Deploy

之后每次 `git push` 自动触发部署。

### Wrangler CLI 部署

```bash
npm run build
npx wrangler pages deploy dist
```

## 项目结构

```
├── public/favicon.svg
├── src/
│   ├── content/
│   │   ├── config.ts          # 内容集合 schema
│   │   └── posts/             # Markdown 文章
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   └── PostLayout.astro
│   ├── pages/
│   │   ├── index.astro         # 首页（文章列表）
│   │   ├── posts/[...slug].astro
│   │   └── category/
│   │       ├── index.astro     # 分类总览
│   │       └── [category].astro
│   ├── consts.ts
│   └── styles/global.css
├── astro.config.mjs
├── package.json
└── wrangler.toml
```

## 自定义

- 站点标题/描述：`src/consts.ts`
- 站点 URL：`astro.config.mjs` 的 `site` 字段
- 主题颜色：`src/styles/global.css` 的 CSS 变量
