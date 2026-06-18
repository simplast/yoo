---
title: '欢迎来到我的博客'
description: '这是一篇示例文章，介绍博客的使用方法与 markdown 写作规范。'
pubDate: 2026-06-17
category: '随笔'
tags: ['公告', '指南']
---

欢迎来到我的博客！这是一个基于 [Astro](https://astro.build) 构建的极简风格博客，部署在 Cloudflare Pages 上。

## 如何写作

所有文章以 Markdown 格式存放在 `src/content/posts/` 目录下。每篇文章的头部使用 YAML frontmatter 定义元信息：

```yaml
---
title: '文章标题'
description: '文章摘要（可选）'
pubDate: 2026-06-17
category: '随笔'
tags: ['标签1', '标签2']
draft: false
---

正文内容...
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 是 | 文章标题 |
| `description` | string | 否 | 文章摘要，显示在列表中 |
| `pubDate` | date | 是 | 发布日期 |
| `updatedDate` | date | 否 | 更新日期 |
| `category` | string | 否 | 分类，默认为"未分类" |
| `tags` | string[] | 否 | 标签数组 |
| `draft` | boolean | 否 | 是否草稿，草稿不会发布 |

## Markdown 支持

支持标准 Markdown 语法，包括：

- **加粗** 与 *斜体*
- [链接](https://astro.build)
- `行内代码`
- 代码块（带语法高亮）
- 列表、引用、表格、图片等

> 这是一个引用块示例。

## 自动部署

提交代码到 Git 仓库后，Cloudflare Pages 会自动触发构建部署，无需手动操作。

开始你的写作之旅吧！
