---
title: 'AGENTS.md — 用规则文件定义你的 Loop 行为'
description: 'AGENTS.md / CLAUDE.md / .cursorrules 是 Loop Engineering 的核心配置文件。本文对比三大工具的规则文件格式，并手把手教你为一个真实项目编写高质量的 AGENTS.md。'
pubDate: 2026-06-20
category: 'AI 工程'
tags: ['Loop Engineering', 'AGENTS.md', 'CLAUDE.md', 'Cursor Rules', 'Harness Engineering']
series: 'Loop Engineering 实战'
seriesOrder: 2
draft: false
---

> **系列导航**：本文是 "Loop Engineering 实战" 系列第 2 篇。
> - 第 1 篇：什么是 Loop Engineering
> - **第 2 篇：AGENTS.md — 用规则文件定义你的 Loop 行为（本文）**
> - 第 3 篇：Skills 与 Memory — Agent 的长期记忆
> - 第 4 篇：Worktrees 与沙箱 — 安全隔离的并发执行环境
> - 第 5 篇：Sub-agents 与 Automation — 任务分发与自动化调度
> - 第 6 篇：构建你的第一个 Loop — 从零搭建自主循环系统

---

在第 1 篇中，我们建立了 Loop Engineering 的核心认知：Agent 的智能来自模型，但 Agent 的**可靠性**来自 Harness（脚手架）。Harness 的五大组件中，有一个看似不起眼、却直接决定了 Agent "做事风格" 的部分——**规则文件**。

你可能已经见过它们的不同名字：Claude Code 叫 `CLAUDE.md`，Cursor 叫 `.cursorrules`，GitHub Copilot 叫 `copilot-instructions.md`。但本质上，它们都是同一件事：**用一份文本文件，告诉 AI Agent "在这个项目里，你应该怎么干活"**。

Martin Fowler 在 [Harness Engineering](https://martinfowler.com/articles/harness-engineering.html) 一文中给了一个精准的定义——**前馈引导（feedforward guides）**。它不是 prompt（prompt 是一次性的指令输入），而是 Agent 在整个会话期间持续遵守的行为规范。就像公司的开发规范手册，Agent 每次"上班"都要先读一遍。

本文将解决四个问题：

1. AGENTS.md 在 Loop 中扮演什么角色？
2. 三大工具的规则文件有什么区别？
3. 一份好的 AGENTS.md 应该长什么样？
4. 如何从零为一个真实项目编写高质量的规则文件？

## 一、AGENTS.md 在 Loop 中的位置

先看全局。一个简化的 Agent Loop 运行流程：

```
┌─────────────────────────────────────────────────────────┐
│  人类工程师                                               │
│    │                                                      │
│    ├── 编写 AGENTS.md（规则文件）                           │
│    ├── 提交任务指令（prompt）                               │
│    │                                                      │
│    ▼                                                      │
│  Loop System                                             │
│    │                                                      │
│    ├── 1. 读取 AGENTS.md ──→ 注入上下文                    │
│    ├── 2. 组装完整上下文（规则 + prompt + 工具定义 + 历史）   │
│    ├── 3. 调用模型                                         │
│    ├── 4. 模型输出 ──→ 工具调用？                            │
│    │         │                                            │
│    │    Yes ──┤── No ──→ 输出文本，循环结束                  │
│    │         │                                            │
│    │         ▼                                            │
│    ├── 5. 执行工具（权限检查 → 执行 → 返回结果）              │
│    ├── 6. 将结果注入上下文                                  │
│    └── 回到步骤 3                                          │
└─────────────────────────────────────────────────────────┘
```

注意两个关键点：

**AGENTS.md 在步骤 1 被读取，之后在整个循环中持续生效。** 它不像 prompt 那样只作用于一次调用，而是作为"常驻记忆"注入到每一轮模型调用中。在 Claude Code 的实际实现中，CLAUDE.md 的内容会在"组装上下文"（Assemble Context）阶段被加载，成为系统消息的一部分。

**AGENTS.md 是"前馈"而非"反馈"。** 反馈是根据执行结果来调整行为（比如测试失败了就修 bug），前馈是提前告诉 Agent 应该怎么做。好的前馈引导可以大幅减少"试错循环"的次数——Agent 一开始就知道"不要直接 push 到 main"，就不会犯这个错误然后等你纠正。

这就是为什么规则文件是 Harness 中最"便宜"的优化手段：**零运行时开销，只需一个文本文件，就能显著改变 Agent 的行为模式。**

## 二、三大工具对比：CLAUDE.md vs Cursor Rules vs Copilot Instructions

目前主流的三大 AI 编码工具都实现了规则文件机制，但设计哲学和具体格式各有差异。以下是基于各工具官方文档的一手对比。

### Claude Code 的 CLAUDE.md

Claude Code 采用了最灵活的**三层配置体系**（据 [Claude Code 官方文档](https://code.claude.com/docs/en/memory)）：

| 层级 | 路径 | 用途 | 是否入版本控制 |
|------|------|------|---------------|
| 用户级 | `~/.claude/CLAUDE.md` | 个人全局偏好 | 否 |
| 项目级 | `CLAUDE.md`（仓库根目录）| 团队共享规范 | **是** |
| 本地级 | `CLAUDE.local.md` | 个人实验性配置 | 否（.gitignore）|
| 目录级 | 子目录下的 `CLAUDE.md` | 模块特定规则 | 是 |
| 组织级 | 系统管理目录 | 企业统一策略 | N/A |

**目录级规则是 Claude Code 的杀手特性。** 当 Agent 访问某个子目录的文件时，该目录的 CLAUDE.md 会被动态注入上下文。这意味着你可以为 `src/api/` 和 `src/frontend/` 定义不同的编码规范，Agent 会根据当前操作的文件自动切换上下文。

Claude Code 还支持 **`@` 文件导入**（最多 4 层递归），以及 `.claude/rules/` 目录下的模块化规则文件，规则文件支持 YAML frontmatter 来限定作用范围。

### Cursor 的 Rules 系统

Cursor 经历了从单文件到目录化的演进（据 [Cursor 官方文档](https://cursor.com/docs/context/rules)）：

| 版本 | 路径 | 说明 |
|------|------|------|
| 旧版（遗留）| `.cursorrules`（项目根目录）| 单一规则文件 |
| 新版 | `.cursor/rules/*.mdc` | 模块化规则目录 |

新版系统的核心是 `.mdc` 文件（Markdown with Configuration），每个文件包含 YAML frontmatter 和规则正文。最关键的设计是**四种触发类型**：

1. **Always（始终）**：注入到每一次对话
2. **Auto Attached（自动附加）**：通过 glob 模式匹配文件，编辑匹配文件时自动生效
3. **Agent Requested（Agent 请求）**：Agent 根据规则摘要自主判断是否需要加载
4. **Manual（手动）**：只有用户在聊天中显式 @引用时才生效

```yaml
---
description: TypeScript 编码规范
globs: "**/*.ts,**/*.tsx"
alwaysApply: false
---

- 使用 2 空格缩进
- 函数名用 camelCase，类型名用 PascalCase
- 优先使用 interface 而非 type
```

**Agent Requested 是最有创意的设计。** 你可以写 20 条规则，但不必全部加载到上下文（会浪费 token），而是让 Agent 自己判断"这个任务需要参考哪些规则"。这是规则粒度管理的优雅解法。

### GitHub Copilot Instructions

GitHub Copilot 的规则体系分为两层（据 [GitHub 官方文档](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot)）：

1. **全局指令**：`.github/copilot-instructions.md`——适用于所有交互
2. **定向规则**：`.github/instructions/*.instructions.md`——通过 YAML 中的 `applyTo` 字段匹配特定文件

```yaml
---
applyTo: "**/*.ts"
excludeAgent: "code-reviewer"
---

所有 API 调用必须使用 fetch 封装，不要直接用 axios。
错误处理统一使用 AppError 类。
```

Copilot 的一个独特特性是**优先级体系**：个人指令 > 仓库指令 > 组织指令。另外，Copilot 的自主 Agent 模式（autonomous workers）还会自动识别项目中的 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md` 文件。

### 横向对比总结

| 对比维度 | Claude Code (CLAUDE.md) | Cursor Rules | GitHub Copilot |
|----------|------------------------|--------------|----------------|
| 作用范围 | 用户/项目/本地/目录/组织 五层 | 项目/用户/组织 三层 | 个人/仓库/组织 三层 |
| 继承机制 | 目录级动态注入 | .mdc 模块化 | applyTo glob 匹配 |
| 条件触发 | 目录访问时自动加载 | Always/Auto/Agent/Manual 四种模式 | applyTo + excludeAgent |
| 模块化 | .claude/rules/ 目录 + @ 导入 | .cursor/rules/*.mdc | .github/instructions/*.instructions.md |
| 社区生态 | 开放标准，多工具兼容 | Cursor 专属 | GitHub 生态集成 |
| 格式 | 纯 Markdown + 可选 frontmatter | .mdc（Markdown + YAML） | Markdown + YAML frontmatter |
| 建议长度 | < 200 行 | < 500 行/每规则 | < 2 页 |

一个值得注意的趋势：**AGENTS.md 正在成为跨工具的事实标准。** GitHub Copilot 的 Agent 模式会自动读取它，Cursor 也支持它作为 `.cursor/rules` 的简化替代。如果你的项目需要同时支持多个 AI 工具，一份 AGENTS.md 是性价比最高的选择。

## 三、AGENTS.md 的结构模板

经过对多个开源项目的 CLAUDE.md 分析和实际使用经验，我推荐以下六段式结构：

```markdown
# Project Overview
# Coding Conventions
# Architecture Rules
# Testing Requirements
# Common Pitfalls
# Build & Deploy
```

下面逐一拆解每个 section 应该写什么、不该写什么。

### 1. Project Overview（项目概览）

**好的写法**——告诉 Agent 这个项目是什么、用了什么技术栈、面向什么用户：

```markdown
# Project Overview
这是一个基于 Astro 4.x 的技术博客，部署在 Cloudflare Pages。
- 模板引擎：Astro（SSG 模式，不使用 SSR）
- UI 组件：Astro 组件 + 少量 React 岛屿（仅用于交互组件）
- 样式：Tailwind CSS 3.x，不使用 CSS Modules
- 内容管理：Markdown 文件 + frontmatter，无 CMS
- 部署目标：Cloudflare Pages（静态构建）
```

**反面示例**：

```markdown
# Project Overview
这是一个博客项目。请遵循最佳实践。
```

问题在于"请遵循最佳实践"等于什么都没说。Agent 已经知道"最佳实践"是什么，它需要的是**你的项目特有的**上下文。

### 2. Coding Conventions（编码规范）

**好的写法**——用具体的例子而非抽象描述：

```markdown
# Coding Conventions

## 命名
- 组件文件名：PascalCase（`BlogPost.astro`，非 `blog-post.astro`）
- 工具函数文件名：camelCase（`formatDate.ts`）
- CSS 类名：kebab-case（`blog-card`，由 Tailwind 的 `@apply` 生成）

## 导入顺序
1. Node 内置模块
2. 第三方包（按字母序）
3. 项目内部模块（用 `@/` 别名，如 `@/components`）
4. 相对路径导入

## 样式
- 优先使用 Tailwind utility class
- 需要复杂样式时，用 `<style>` 标签内的 `@apply` 组合
- 禁止写裸 CSS 文件
```

**反面示例**：

```markdown
# Coding Conventions
- 遵循项目现有的命名规范
- 保持代码整洁
- 使用有意义的变量名
```

这些都是 Agent 的"出厂设置"，写上去不但不提供增量信息，还会浪费宝贵的上下文 token。

### 3. Architecture Rules（架构规则）

**好的写法**——定义模块边界和依赖方向：

```markdown
# Architecture Rules

## 目录职责
- `src/content/` — Markdown 博客文章，每篇一个 .md 文件
- `src/components/` — 可复用 UI 组件（Astro 组件和 React 岛屿）
- `src/layouts/` — 页面布局模板
- `src/pages/` — 路由定义，每个 .astro 文件对应一个 URL
- `src/utils/` — 纯函数工具，不依赖 Astro 运行时

## 依赖方向
- pages → layouts → components → utils（单向依赖）
- utils 不得导入 components 或 pages
- 组件不得直接访问文件系统（这是 Astro 的 SSG 限制）

## 内容管理
- 所有文章必须包含 frontmatter：title, pubDate, description
- 文章分类通过 frontmatter 的 category 字段，不使用目录分类
- 图片放在 `src/assets/` 下，通过 Astro 的 Image 组件引用
```

**反面示例**：

```markdown
# Architecture Rules
- 代码要模块化
- 关注点分离
- 使用清晰的分层架构
```

### 4. Testing Requirements（测试要求）

**好的写法**——说明测试工具、运行方式和覆盖要求：

```markdown
# Testing Requirements

## 工具
- 单元测试：Vitest
- 组件测试：@testing-library/react（仅用于 React 岛屿组件）
- E2E：暂不要求

## 运行测试
- 全部测试：`pnpm test`
- 单文件：`pnpm test -- src/utils/formatDate.test.ts`
- 覆盖率：`pnpm test -- --coverage`

## 规则
- 新增的 utils 函数必须有对应的 .test.ts
- 测试文件放在被测文件同级目录（如 `formatDate.test.ts` 与 `formatDate.ts` 同目录）
- 不要 mock Astro 的 content collection API——如果需要，写集成测试
```

### 5. Common Pitfalls（常见陷阱）

**这是最有价值的 section。** 它直接减少 Agent 犯错的概率——因为这些都是你踩过的坑：

```markdown
# Common Pitfalls

- **不要使用 `new Date()` 解析日期字符串**：Safari 对 `YYYY-MM-DD` 格式的支持不一致，
  始终使用 `src/utils/parseDate.ts` 中的解析函数。
- **不要在 React 岛屿组件中使用 `window` 对象做 SSR 判断**：Astro 的岛屿架构已经
  处理了 hydration，直接用 `client:load` 指令即可。
- **Cloudflare Pages 不支持 Node.js 原生模块**：如果需要图片处理等能力，必须使用
  Cloudflare Workers 兼容的 API 或在构建时完成。
- **content collection 的 schema 定义在 `src/content/config.ts`**：修改 frontmatter
  字段时，必须同步更新此文件的 zod schema。
```

### 6. Build & Deploy（构建部署）

```markdown
# Build & Deploy

## 本地开发
- 启动开发服务器：`pnpm dev`
- 构建预览：`pnpm build && pnpm preview`

## 部署
- 自动部署：push 到 main 分支触发 Cloudflare Pages 构建
- 预览环境：每个 PR 自动生成预览 URL
- 手动触发：Cloudflare Dashboard → Deployments → Retry

## 构建注意事项
- 构建产物在 `dist/` 目录
- 不要修改 `wrangler.toml`（除非修改部署配置）
- RSS feed 由 `@astrojs/rss` 自动生成，路径为 `/rss.xml`
```

## 四、实操：为 Astro 博客编写 AGENTS.md

理论讲完了，我们来实战。假设你有一个基于 Astro + Cloudflare Pages 的技术博客项目，我们从零开始编写 AGENTS.md，经历三轮迭代。

### 初版：过于简略（别这么写）

```markdown
# AGENTS.md

这是一个 Astro 博客项目。

- 使用 TypeScript
- 使用 Tailwind CSS
- 部署到 Cloudflare Pages
- 请遵循最佳实践
```

**问题诊断**：这份文件对 Agent 的行为几乎没有任何引导。"使用 TypeScript" 和 "请遵循最佳实践" 不提供任何增量信息——Agent 在看到你的 `tsconfig.json` 和 `tailwind.config.ts` 后就已经知道了这些。这份 AGENTS.md 的**有效信息量为零**。

### 改进版：加入具体规则

```markdown
# AGENTS.md

## 项目概述
基于 Astro 4.x 的技术博客，SSG 模式，部署到 Cloudflare Pages。
包管理器：pnpm（不要用 npm 或 yarn）。

## 编码规范
- 组件用 PascalCase 文件名（BlogCard.astro）
- 工具函数用 camelCase 文件名（formatDate.ts）
- 优先使用 Astro 组件，只在需要客户端交互时用 React 岛屿
- 样式用 Tailwind utility class，复杂样式用 <style> 内的 @apply
- 导入顺序：Node 内置 → 第三方 → @/ 别名 → 相对路径

## 架构
- src/content/ — Markdown 文章
- src/components/ — 可复用组件
- src/layouts/ — 页面布局
- src/pages/ — 路由
- src/utils/ — 纯函数工具（不得导入 Astro 运行时）

## 构建
- pnpm dev — 开发服务器
- pnpm build — 构建
- pnpm test — 运行测试（Vitest）
```

这版好多了——Agent 已经知道用什么包管理器、文件怎么命名、目录怎么组织。但还缺少**错误预防**和**测试要求**。

### 最终版：加入测试要求和陷阱提示

```markdown
# AGENTS.md

## 项目概述
基于 Astro 4.x 的技术博客，SSG 模式，部署到 Cloudflare Pages。
- 包管理器：pnpm
- 模板引擎：Astro（纯静态生成，不使用 SSR adapter）
- UI：Astro 组件 + React 岛屿（仅交互组件，如搜索框、评论组件）
- 样式：Tailwind CSS 3.x
- 内容：Markdown + frontmatter，无 CMS

## 编码规范

### 命名
- 组件文件：PascalCase（`BlogCard.astro`）
- 工具文件：camelCase（`formatDate.ts`）
- 路由页面：kebab-case 目录名（`src/pages/about-me/`）
- CSS 类名：Tailwind utility 或 @apply 生成的 kebab-case

### 导入
1. Node 内置（`import { readFile } from 'node:fs/promises'`）
2. 第三方包（按字母序）
3. 项目内 `@/` 别名（`import { BlogCard } from '@/components/BlogCard'`）
4. 相对路径

### 组件编写
- Astro 组件优先，只在需要 `useState`/`useEffect` 等 hooks 时用 React 岛屿
- React 岛屿必须标注 client 指令（`client:load`、`client:visible` 或 `client:only`）
- 优先使用 `client:visible`（延迟加载），除非组件必须在首屏交互

## 架构规则

### 目录职责
- `src/content/blog/` — 博客文章（.md 文件）
- `src/content/config.ts` — frontmatter 的 zod schema 定义（改 frontmatter 必须同步更新）
- `src/components/` — 可复用组件
- `src/layouts/` — 布局（BaseLayout.astro、PostLayout.astro）
- `src/pages/` — 路由定义
- `src/utils/` — 纯函数（禁止导入 Astro API）

### 依赖方向
pages → layouts → components → utils（单向，不可逆）

## 测试要求
- 工具：Vitest
- 运行：`pnpm test`，单文件：`pnpm test -- path/to/test.test.ts`
- 新增 utils 函数必须有同目录下的 `.test.ts`
- 测试文件命名：`[被测文件名].test.ts`（如 `formatDate.test.ts`）
- 不 mock Astro content collection API

## 常见陷阱

1. **日期解析**：不要用 `new Date('YYYY-MM-DD')`，Safari 行为不一致。
   用 `src/utils/parseDate.ts` 的 `parseDate()` 函数。

2. **Cloudflare 限制**：Pages 环境不支持 Node.js 原生模块（如 sharp、canvas）。
   图片优化必须在构建时完成，或通过 Cloudflare Images 服务。

3. **内容 schema**：修改文章 frontmatter 字段时，**必须同步更新**
   `src/content/config.ts` 中的 zod schema，否则构建会报类型错误。

4. **React 岛屿的 hydration**：不要在岛屿组件的顶层代码中访问 `window`。
   如果确实需要，用 `typeof window !== 'undefined'` 守卫或 `useEffect`。

5. **Tailwind 的 content 配置**：新增组件目录时检查 `tailwind.config.mjs` 的
   `content` 数组，确保新路径被覆盖，否则样式可能不生效。

## 构建与部署
- `pnpm dev` — 本地开发（http://localhost:4321）
- `pnpm build` — 静态构建到 `dist/`
- `pnpm preview` — 预览构建结果
- 部署：push 到 main 自动触发 Cloudflare Pages 构建
- PR 自动生成预览 URL
- `wrangler.toml` 仅在修改部署配置时改动
```

对比三个版本的差异：

| 维度 | 初版 | 改进版 | 最终版 |
|------|------|--------|--------|
| 有效信息量 | 几乎为零 | 中等 | 丰富 |
| 错误预防 | 无 | 无 | 5 条具体陷阱 |
| 可测试性 | 未提及 | 提到工具 | 明确规范和文件命名 |
| 上下文成本 | ~50 token | ~200 token | ~500 token（合理范围）|
| Agent 遵循率 | 低（没有可执行的规则）| 中 | 高（规则具体且可验证）|

## 五、规则设计的最佳实践

### Do：用具体示例而非抽象描述

```markdown
# Good ✅
- 函数名用 camelCase：`calculateTotal`，不要 `CalculateTotal` 或 `calculate-total`
- 错误处理用自定义 AppError 类：`throw new AppError('USER_NOT_FOUND', 404)`

# Bad ❌
- 遵循命名规范
- 做好错误处理
```

Agent 看到具体示例后，能立即应用到当前任务。抽象描述则需要 Agent "猜测"你的标准是什么——猜错的概率很高。

### Do：说明"为什么"

```markdown
# Good ✅
- 不要在 utils 中导入 Astro API（因为 utils 会被 Vitest 直接运行，
  导入 Astro API 会导致测试环境报错 "Cannot resolve astro:content"）

# Bad ❌
- utils 中不要导入 Astro API
```

Anthropic 在 [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) 中强调，模型在理解了**原因**后能更好地泛化到新场景。当你告诉 Agent "不要在 utils 里导入 Astro API"，它只知道这一条规则。但当你解释了"因为 Vitest 环境下 Astro API 无法解析"，Agent 就能推导出：任何测试文件可达的代码都不应该依赖 Astro 运行时。

### Don't：列出所有文件路径

```markdown
# Bad ❌
- 项目文件清单：
  - src/pages/index.astro — 首页
  - src/pages/about.astro — 关于页
  - src/pages/blog/index.astro — 博客列表
  - src/pages/blog/[...slug].astro — 文章详情
  ...（200 行后）

# Good ✅
- src/pages/ — 路由定义，文件名即 URL 路径
- [...slug] 模式用于动态路由（如博客文章详情页）
```

文件路径会随项目演进不断变化，AGENTS.md 里的硬编码路径很快就会过时。描述**组织原则**比描述**当前状态**更有持久价值。

### Don't：写"请遵守最佳实践"

```markdown
# Bad ❌
- 请遵守 TypeScript 最佳实践
- 写清晰的注释
- 保持代码质量

# Good ✅
- 不使用 any 类型，必要时用 unknown + 类型守卫
- 公开 API 函数必须有 JSDoc 注释（包含 @param 和 @returns）
- 每个函数不超过 30 行，超过则拆分为子函数
```

"请遵守最佳实践" 的问题是：Agent 的"最佳实践"训练数据来自整个互联网，可能和你团队的实践相冲突。你需要的是**你的**最佳实践，不是互联网的。

### 额外建议：控制总长度

Claude Code 官方建议 CLAUDE.md **不超过 200 行**，Cursor 建议每个规则文件**不超过 500 行**，GitHub Copilot 建议**不超过 2 页**。原因很简单：规则文件本身会消耗上下文窗口。如果你的 AGENTS.md 写了 1000 行，Agent 在实际任务上可用的上下文就被压缩了，反而降低工作质量。

**经验法则**：一份好的 AGENTS.md 应该在 50-200 行之间。如果超过 200 行，考虑使用模块化规则（Cursor 的 .mdc 目录、Claude Code 的 .claude/rules/）来按需加载，而不是一次性全部注入。

### 额外建议：定期维护

AGENTS.md 不是写完就扔的。每次 Agent 犯了一个你没想到它会犯的错误，都是更新 AGENTS.md 的好时机。把这个过程看作**持续调参**——你在调整的不是模型的权重，而是它的行为规范的权重。

## 小结

AGENTS.md（及其变体 CLAUDE.md、.cursorrules）是 Loop Engineering 中成本最低、回报最高的优化手段。回顾本文的核心要点：

1. **AGENTS.md 是前馈引导**，不是 prompt。它在整个 Agent Loop 期间持续生效，定义 Agent 的行为规范。
2. **三大工具各有特色**：Claude Code 的目录级动态注入最灵活，Cursor 的四种触发模式最精细，Copilot 的优先级体系最规范。AGENTS.md 正在成为跨工具的事实标准。
3. **好的规则文件有六段结构**：项目概览、编码规范、架构规则、测试要求、常见陷阱、构建部署。
4. **具体胜于抽象**：用示例和"为什么"来引导 Agent，而非用抽象描述和"最佳实践"来糊弄它。

> **下一篇预告**：[第 3 篇 — Skills 与 Memory](/posts/loop-eng-03-skills-memory)：Agent 不只是一次性的执行循环，它也需要"记忆"。我们将探讨如何让 Agent 在多次会话之间积累知识，以及 Skills 机制如何让 Agent 学会"新技能"。

---

## 参考资料

- [Claude Code Memory / CLAUDE.md 文档](https://code.claude.com/docs/en/memory) — Anthropic 官方文档
- [Cursor Rules 文档](https://cursor.com/docs/context/rules) — Cursor 官方文档
- [Adding Custom Instructions for GitHub Copilot](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot) — GitHub 官方文档
- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Anthropic 研究博客
- [Harness Engineering](https://martinfowler.com/articles/harness-engineering.html) — Martin Fowler
- [Agent Loop 深度调研（一）：核心概念与设计原理](/posts/agent-loop-research-part1-concepts) — 本站前置调研
