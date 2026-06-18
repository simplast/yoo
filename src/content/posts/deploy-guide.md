---
title: 'Astro 与 Cloudflare Pages 部署指南'
description: '介绍如何将 Astro 博客部署到 Cloudflare Pages，并配置 Git 自动部署。'
pubDate: 2026-06-16
category: '技术'
tags: ['Astro', 'Cloudflare', '部署']
---

本文介绍如何将这个博客部署到 Cloudflare Pages，并启用 Git 自动部署。

## 前置准备

1. 一个 [Cloudflare](https://dash.cloudflare.com) 账号
2. 一个 Git 仓库（GitHub / GitLab 均可）
3. 本地安装 Node.js 18+

## 本地开发

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 输出到 dist/
npm run preview
```

## 部署到 Cloudflare Pages

### 方式一：Git 自动部署（推荐）

1. 将代码推送到 GitHub / GitLab 仓库
2. 登录 Cloudflare Dashboard → Pages → Create a project → Connect to Git
3. 选择你的仓库
4. 填写构建配置：
   - **Framework preset**: `Astro`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variable**: `NODE_VERSION` = `18`
5. 点击 Save and Deploy

完成后，每次 `git push` 都会自动触发构建部署。

### 方式二：Wrangler CLI 直接部署

```bash
npm install -g wrangler
wrangler login
npm run build
wrangler pages deploy dist
```

## 自定义域名

在 Cloudflare Pages 项目设置 → Custom domains 中添加你的域名，按提示配置 DNS 即可。

---

享受你的博客！
