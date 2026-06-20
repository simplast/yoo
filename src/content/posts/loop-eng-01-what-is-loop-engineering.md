---
title: '什么是 Loop Engineering？从 Prompt 到 Loop 的思维跃迁'
description: 'AI 编程正从"你写 Prompt"演进到"你设计一个系统，让系统去 Prompt Agent"。本文梳理 Prompt → Agent → Harness → Loop 四个阶段的核心区别，并用 Claude Code 的 AGENTS.md 实操对比手动 Prompt 与自主循环的效率差异。'
pubDate: 2026-06-20
category: 'AI 工程'
tags: ['Loop Engineering', 'Agent', 'Harness Engineering', 'Prompt Engineering', 'Claude Code']
series: 'Loop Engineering 实战'
seriesOrder: 1
draft: false
---

## 你可能已经落后了一个范式

如果你现在的工作流还是「打开 ChatGPT → 粘贴代码 → 写 Prompt → 复制结果 → 粘贴回去」，那你正停留在 2023 年。

如果你已经用上了 Cursor、Claude Code、GitHub Copilot Agent Mode，让 AI 自己去改文件、跑测试、修 Bug——恭喜你，你进入了 Agent 时代。但这也只是第二站。

2025 年下半年以来，Claude Code 团队、Cursor 团队、OpenAI Codex 团队的负责人在不同场合表达了同一个观点：**他们不再亲手写 Prompt 了**。他们做的事情叫 Loop Engineering——设计一个闭环系统，让系统去 Prompt Agent。

Addy Osmani 在 [Loop Engineering](https://addyosmani.com/blog/loop-engineering/) 一文中给出了最精炼的定义：

> "Loop engineering is replacing yourself as the person who prompts the agent. You design the system that does it instead."
>
> （Loop Engineering 就是把你从"给 Agent 写 Prompt 的人"替换掉。你设计一个系统，由系统来做这件事。）

这篇文章是「Loop Engineering 实战」系列 6 篇中的第 1 篇。本文不讲框架源码、不贴 API 文档，只做一件事：**帮你完成从"写 Prompt"到"设计 Loop"的认知跃迁**。

---

## 一、四个阶段：AI 编程的范式演进

要理解 Loop Engineering 的位置，需要先看清整条演进路线。以下四个阶段并非严格的时间线——它们更像是四种思维层级，每一层解决上一层留下的核心痛点。

### 阶段一：Prompt Engineering——你问，它答

**你做什么**：精心编写一条提示词，把需求、上下文、格式要求全塞进去。

**系统做什么**：把你的 Prompt 喂给模型，返回一次文本结果。

**典型工具**：ChatGPT、Claude.ai、Gemini

**核心痛点**：每次交互都是无状态的。你得像保姆一样盯着每一步——分析完结果不对，换个 Prompt 再来；代码有 Bug，复制错误信息再问一遍。所有决策、所有节奏控制，全靠你一个人。

这个阶段的本质是**一问一答**。你是操作员，模型是工具。

### 阶段二：Agent Engineering——你说目标，它自己干

**你做什么**：定义工具（读文件、写文件、跑测试、搜索代码）+ 写一段系统提示词。

**系统做什么**：进入一个 while 循环——调用模型 → 模型决定用哪个工具 → 执行工具 → 把结果喂回模型 → 模型继续决策——直到任务完成。

**典型工具**：LangChain、Vercel AI SDK、OpenAI Agents SDK、Google ADK

**核心痛点**：你有了循环，但循环是"裸奔"的。Agent 可能删掉你的生产数据库，可能在一个 200 行的文件里改出 50 处错误，可能跑 30 轮循环花掉你 50 美元 token 费，而输出的代码根本不能用。

这个阶段的本质是**单次循环执行**。你给了 Agent 自主权，但没给它约束。Anthropic 在 [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) 中区分了两种系统：

- **Workflow（工作流）**：按预定义代码路径编排模型和工具。
- **Agent（智能体）**：模型动态决定自己的执行流程和工具使用。

绝大多数开发者还停留在"给 Agent 写个 Prompt 就放手"的模式，这其实是最脆弱的做法。

### 阶段三：Harness Engineering——你搭脚手架，它安全地跑

**你做什么**：配置文件、规范、权限规则、上下文注入策略。

**系统做什么**：在脚手架（Harness）内安全地执行 Agent——自动注入项目规范、限制文件访问范围、在工具执行前做权限审批、超限时自动压缩上下文。

**典型工具**：AGENTS.md / CLAUDE.md、Claude Code 的权限系统、GitHub Copilot 的 Coding Harness

Martin Fowler 在 [Harness Engineering](https://martinfowler.com/articles/harness-engineering.html) 中给出了精确的定义：

> "The term harness has emerged as a shorthand to mean everything in an AI agent except the model itself."
>
> （Harness 已成为一个术语简称，指 AI Agent 中除了模型本身以外的一切。）

即：**Agent = 模型 + Harness**。模型负责"想"，Harness 负责让"想"变得有用。

VILA-Lab 对 Claude Code 源码的[逆向分析](https://github.com/VILA-Lab/Dive-into-Claude-Code)揭示了一个惊人比例：**98.4% 的代码是确定性基础设施，仅 1.6% 是 AI 推理逻辑**。这 98.4% 就是 Harness。

Harness 的核心机制分两类：

- **前馈引导（Feedforward Guides）**：在 Agent 行动之前注入约束——比如 AGENTS.md 里的编码规范、系统提示词里的角色定义、项目结构说明。
- **反馈传感器（Feedback Sensors）**：在 Agent 行动之后检查结果——比如跑测试、跑 linter、跑类型检查、跑架构守护规则（ArchUnit）。

**核心痛点**：Harness 解决了"安全执行"的问题，但你仍然得亲手启动每一次任务、审查每一个结果、手动决定下一步做什么。

### 阶段四：Loop Engineering——你设计规则，系统自主发现、执行、验证

**你做什么**：设计规则、调度策略、验证标准。

**系统做什么**：自动发现需要处理的任务 → 在隔离环境中执行 → 自行验证结果 → 提交人类审批。

**典型工具**：Claude Code + Automations + Worktrees、QoderWork 的 Cron + Sub-agents

这个阶段的本质是**自主闭环**。你不再是 Agent 的操作员，你是闭环架构师。

### 四阶段对比表

| 维度 | Prompt Engineering | Agent Engineering | Harness Engineering | Loop Engineering |
|------|-------------------|-------------------|--------------------|--------------------|
| **人类角色** | 操作员 | 任务定义者 | 脚手架搭建者 | 闭环架构师 |
| **人类做什么** | 手写提示词 | 定义工具 + 写提示词 | 配置环境和规范 | 设计规则和调度 |
| **系统做什么** | 单次返回 | 单次循环执行 | 安全地执行 Agent | 自主发现、执行、验证 |
| **循环次数** | 0（无循环） | 1（单次循环到完成） | 1（带约束的循环） | N（持续闭环） |
| **触发方式** | 人手动发起 | 人手动发起 | 人手动发起 | 自动 / 定时 / 事件 |
| **验证方式** | 人肉眼看 | 人肉眼看 | 自动测试 + linter | 独立审查 Agent + 测试 |
| **典型工具** | ChatGPT | LangChain, AI SDK | AGENTS.md, Claude Code | Claude Code + Automations |
| **解决的痛点** | 让 AI 理解你的意图 | 让 AI 自主完成多步任务 | 让 AI 安全、可控地执行 | 让 AI 持续自主运转 |

---

## 二、Loop Engineering 的核心思想

### "你不再是写 Prompt 的人"

回到 Addy Osmani 的核心命题：

> "You shouldn't be prompting coding agents anymore. You should be designing loops that prompt your agents."
>
> （你不应该再亲手给编程 Agent 写 Prompt 了。你应该设计循环，由循环去 Prompt 你的 Agent。）

这不是说 Prompt 不重要了——恰恰相反。在 Loop Engineering 中，Prompt 的质量比以往任何时候都重要。区别在于：**你不再为每一次交互写 Prompt，你把 Prompt 固化到系统里，让系统替你在正确的时机发出正确的 Prompt。**

打个比方：

- **手动 Prompt** 像手动挡开车——你得时刻关注转速、手动换挡、踩离合。
- **Loop Engineering** 像设计一辆自动驾驶汽车——你定义交通规则、路线规划算法、安全冗余系统，然后车自己开。

### 从"操作 Agent"到"设计闭环"

一个 Loop 至少包含四个环节：

```
发现（Discovery）→ 执行（Execution）→ 验证（Verification）→ 交付（Delivery）
```

每个环节都可以是自动化的：

1. **发现**：系统自动扫描代码库，找到需要处理的任务（CI 失败、lint 告警、未处理的 TODO 注释、过期的依赖版本）。
2. **执行**：Agent 在隔离环境（Worktree）中执行修改，不影响主分支。
3. **验证**：独立的审查 Agent 或自动化测试验证执行结果——测试是否通过？类型检查是否 OK？架构规则是否被违反？
4. **交付**：通过验证的结果被打包成 Pull Request，等待人类最终审查。

人类只在"交付"环节介入。前三个环节全自动。

### "Agent 会忘记，代码库不会"

Addy Osmani 提出了一个关键洞察：

> "The agent forgets, the repo doesn't."
>
> （Agent 会忘记，代码库不会。）

每次 Agent 会话结束，它的上下文窗口就被清空了。它不记得上一次帮你修了什么 Bug、上次用了什么命名规范、上次讨论出了什么架构决策。

Loop Engineering 的解法是**把一切写进代码库**：

- 编码规范写在 `AGENTS.md` 里
- 架构决策写在 ADR（Architecture Decision Records）里
- 任务状态写在 `TODO.md` 或 issue tracker 里
- 项目知识写在 `docs/` 目录里

这样，无论哪个 Agent 在什么时候被唤起，它都能从代码库中"恢复记忆"。代码库本身就是系统的长期记忆。

---

## 三、实操对比：同一个任务，两种方式的效率差距

理论说够了，来看一个真实的例子。

**任务**：为一个 Express.js 后端项目的所有 API 调用添加统一的错误处理。

### 方式 A：手动 Prompt（传统模式）

```
你：分析一下项目中哪些 API 调用缺少错误处理。
AI：[列出 12 个文件，共 23 处缺失]

你：好的，先修复 src/routes/users.ts 里的问题。
AI：[修改 users.ts，添加了 try-catch]

你：看看改得对不对……[手动审查 diff] 这里应该用 AppError 而不是 Error。
AI：[修改]

你：继续修复 src/routes/orders.ts。
AI：[修改 orders.ts]

你：这次用了 AppError 吗？
AI：是的，但缺少了 timeout 处理。
AI：[补充 timeout 处理]

你：……[重复 10+ 轮]

你：改完了，跑一下测试。
AI：[运行测试，3 个测试失败]

你：修复失败的测试。
AI：[修复，但引入了新 Bug]

你：……[又 3 轮]

你：好了，帮我生成一个 PR。
AI：[生成 PR 描述]

你：[手动 review 所有改动，确认没有遗漏]
```

**耗时**：2-4 小时。你的注意力被完全锁定在终端前。每改一个文件你都得亲自过目。

### 方式 B：Loop Engineering

**第一步**：在项目根目录编写 `AGENTS.md`，固化你的工程规范：

```markdown
# 项目规范

## 错误处理规范

- 所有 API handler 必须使用 asyncHandler 包装
- 使用自定义 AppError 类（定义在 src/utils/errors.ts）
- 错误分类：ValidationError (400), NotFoundError (404), AuthError (401), InternalError (500)
- 每个 handler 必须有对应的错误测试用例
- 禁止 catch(e) {} 空捕获

## 错误处理模式示例

```ts
// 正确
app.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await userService.findById(req.params.id);
  if (!user) throw new NotFoundError('User not found');
  res.json(user);
}));

// 错误
app.get('/users/:id', async (req, res) => {
  try {
    const user = await userService.findById(req.params.id);
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: 'Something went wrong' });
  }
});
```

## 测试规范

- 每个 API endpoint 至少一个错误路径测试
- 使用 supertest 验证 HTTP 状态码
- 测试文件放在 __tests__/ 目录，文件名与源文件对应
```

**第二步**：启动 Agent，设定目标：

```bash
claude "扫描项目中所有 API handler，找出不符合 AGENTS.md 错误处理规范的，
逐一修复并添加对应测试。每修复一个文件就运行相关测试确认通过。
最后生成 PR。"
```

**第三步**：Agent 自主执行：

```
[Agent 内部循环，你不需要介入]

→ 扫描 src/routes/ 下所有文件
→ 识别 12 个文件中 23 处不符合规范的代码
→ 对每个文件：
  → 读取 AGENTS.md 中的错误处理规范
  → 修改代码：添加 asyncHandler 包装 + AppError 分类
  → 生成对应的错误路径测试
  → 运行测试确认通过
  → 如果测试失败，自行修复后重跑
→ 所有文件处理完毕后：
  → 运行全量测试确认无回归
  → 生成结构化的 PR 描述
```

**第四步**：你收到一个 PR 通知，打开浏览器审查：

```
PR #142: Add unified error handling to all API endpoints
- 12 files modified
- 23 error handlers standardized
- 23 new test cases added
- All tests passing ✓
```

你花 20 分钟 review PR，确认逻辑无误，merge。

**耗时**：Agent 执行约 15-25 分钟，你审查 20 分钟。总计约 45 分钟，其中你的主动工作时间只有 20 分钟。

### 对比总结

| 维度 | 方式 A（手动 Prompt） | 方式 B（Loop Engineering） |
|------|---------------------|--------------------------|
| **总耗时** | 2-4 小时 | ~45 分钟 |
| **你的主动工作时间** | 2-4 小时（全程在线） | ~20 分钟（仅审查） |
| **规范一致性** | 取决于你的注意力 | AGENTS.md 保证一致 |
| **错误率** | 高（容易遗漏或前后不一致） | 低（自动验证 + 自修复） |
| **可重复性** | 不可重复（每次 Prompt 不同） | 完全可重复（规范已固化） |
| **你的心理状态** | 疲惫、焦虑、注意力枯竭 | 轻松、聚焦在决策上 |

这就是 Loop Engineering 的威力：**你投入一次时间写好规范，之后每次同类任务都能自动执行。** 而且第 100 次执行的质量和第 1 次完全一样——规范不会疲劳。

---

## 四、Loop Engineering 的 6 大基础设施

一个完整的 Loop 需要 6 个基础设施协同工作。这里只做简要介绍，后续 5 篇文章将逐一深入。

### 1. Automations（自动化触发）

Agent 不会自己醒来。Automations 负责在正确的时机唤起 Agent：

- **定时触发**：每天早上 9 点扫描 CI 失败，自动修复
- **事件触发**：PR 合并后自动运行代码质量检查
- **条件触发**：TODO 注释超过阈值时批量处理

这是从"人启动"到"系统启动"的关键一步。

### 2. Worktrees（隔离执行环境）

多个 Agent 同时修改同一个文件会灾难性地冲突。Git Worktree 为每个 Agent 创建独立的工作目录：

```bash
# Agent A 在 worktree-a 中修复错误处理
# Agent B 在 worktree-b 中更新依赖
# 互不干扰，各自提 PR
```

隔离不只是技术需求——它让你能安全地让 Agent "大胆尝试"，搞砸了也不影响主分支。

### 3. Skills（领域知识固化）

Agent 每次启动都是一张白纸。Skills 把你的项目知识固化成可复用的指令集：

- 项目的编码规范和架构约束
- 常用的工作流（如何添加新的 API endpoint、如何部署）
- 踩过的坑和解决方案

在 Claude Code 中，这对应 `AGENTS.md`（项目级）、`~/.claude/CLAUDE.md`（用户级）等配置文件。

### 4. Plugins & Connectors（外部连接）

Agent 不能只活在代码库里。它需要连接外部世界：

- **GitHub/GitLab**：创建 PR、读取 issue、查看 CI 状态
- **Jira/Linear**：读取任务描述、更新任务状态
- **Slack/飞书**：通知团队、请求审批
- **MCP 协议**：标准化地连接各种外部工具

### 5. Sub-agents（角色拆分）

一个 Agent 既生成代码又审查代码，就像一个人既写文章又给自己打分——往往会放过自己的错误。

Anthropic 在 [Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) 中明确指出：

> 将生成和评估分离到不同的 Agent，能产生更好的结果。让一个独立的审查 Agent 变得严格，比让生成 Agent 自我批评容易得多。

典型的拆分方式：

- **Builder Agent**：负责写代码、改文件
- **Reviewer Agent**：负责审查代码、跑测试、验证架构一致性
- **Planner Agent**：负责把大任务拆分成小任务

### 6. Memory（跨会话状态持久化）

Agent 的上下文窗口是临时的。Memory 系统让 Agent 能跨会话记住关键信息：

- 上次执行到了哪里
- 哪些文件已经处理过
- 项目中有哪些已知问题
- 团队的偏好和决策历史

Addy Osmani 强调：

> "The agent forgets, the repo doesn't."

最有效的 Memory 方案不是向量数据库，而是**代码库本身**——把一切写进文件，Agent 自然就能"记住"。

---

## 五、三个风险：你不能假装看不见

Loop Engineering 很强大，但它有三个真实的危险。Addy Osmani 在文章中用了大量篇幅来警告这些风险，我认为每个从业者都应该认真对待。

### 风险一：Verification（验证责任仍在人类）

> "Automated systems will confidently make unattended errors."
>
> （自动化系统会自信地犯无人看管的错误。）

Agent 不会说"我不确定"。它会用完全自信的语气输出一个有 Bug 的代码，跑通所有测试但遗漏了一个边界条件，然后开一个看起来很专业的 PR。

**如果你不审查，Bug 就会进入生产环境。**

Loop Engineering 减少的是你的操作负担，不是你的判断责任。你是闭环架构师，但你是**对结果负责的**闭环架构师。

### 风险二：Comprehension Debt（理解力债务）

> "Letting AI write all the code rapidly degrades the developer's personal understanding of the software."
>
> （让 AI 写所有代码会迅速降低开发者对软件的个人理解。）

如果你连续三个月只看 PR 不看代码，你会逐渐失去对系统的直觉。当 Agent 犯了一个微妙的架构错误时，你可能根本看不出来——因为你已经不够了解你自己的系统了。

这就像用计算器太久，你会忘记心算。只不过计算器的错误你一眼能看出来，Agent 的架构级错误你可能看不出来。

**解法**：每周至少花一些时间直接阅读 Agent 生成的代码，而不仅仅是看 PR 摘要。保持你对系统的"手感"。

### 风险三：Cognitive Surrender（认知投降）

这是最隐蔽的风险。Cognitive Surrender 不是一个突然的决定，而是一个渐进的过程：

1. 第一周：我仔细审查每一行代码
2. 第一月：我审查关键文件，跳过测试代码
3. 第三月：我只看 PR 摘要和 CI 状态
4. 半年后：我直接点 Approve

你在不知不觉中放弃了判断力。而判断力恰恰是你作为工程师最核心的价值。

Addy Osmani 的忠告值得每个从业者铭记：

> "Build the loop. But build it like someone who intends to stay the engineer, not just the person who presses go."
>
> （去构建循环吧。但要像一个打算继续当工程师的人那样去构建，而不只是一个按启动按钮的人。）

---

## 六、谁应该读这个系列

这个系列面向有编程基础、了解基本 Agent 开发、但还没做过 Loop Engineering 的程序员。如果你正处于以下任一状态，这个系列就是为你写的：

- 你已经在用 Cursor / Claude Code / GitHub Copilot，但觉得效率还不够高
- 你听说过 AGENTS.md，但不确定它到底该怎么写
- 你想让 AI 帮你做更多事，但不确定安全的边界在哪里
- 你对"AI 编程"的未来方向感到好奇，但信息太碎片化

### 系列目录

| 篇目 | 主题 | 核心内容 |
|------|------|---------|
| **第 1 篇（本文）** | 什么是 Loop Engineering | 四阶段演进 + 核心思想 + 实操对比 |
| **第 2 篇** | AGENTS.md 实战指南 | 如何编写项目规范，让 Agent "记住"一切 |
| **第 3 篇** | Skills 与 Memory | 让 Agent 积累和复用知识，越用越聪明 |
| **第 4 篇** | Worktrees 与沙箱 | Git Worktrees + Docker 隔离，安全并发执行 |
| **第 5 篇** | Sub-agents 与 Automation | 角色拆分 + 自动化调度，实现 CI 自动修复流水线 |
| **第 6 篇** | 构建你自己的 Loop | 从零搭建一个完整的 Loop Engineering 系统 |

---

## 七、下一步：从 AGENTS.md 开始

Loop Engineering 不需要你搭建一套复杂的系统才能开始。你只需要做一件事：

**在项目根目录创建一个 `AGENTS.md` 文件，把你脑中的工程规范写下来。**

这个文件就是你 Loop 的第一个前馈引导。它会在每次 Agent 启动时被自动读取，注入到 Agent 的上下文中，引导它按照你的规范行事。

下一篇，我们将深入 AGENTS.md 的实操——从结构设计到内容编写，从项目级规范到用户级偏好，手把手教你写出一个真正好用的 AGENTS.md。

---

## 参考资料

- [Loop Engineering — Addy Osmani](https://addyosmani.com/blog/loop-engineering/) — 本文核心框架的直接来源
- [Building Effective Agents — Anthropic](https://www.anthropic.com/research/building-effective-agents) — Agent 模式与 Workflow 模式的经典定义
- [Harness Engineering — Martin Fowler](https://martinfowler.com/articles/harness-engineering.html) — 前馈引导与反馈传感器的系统化阐述
- [Harness Design for Long-Running Apps — Anthropic](https://www.anthropic.com/engineering/harness-design-long-running-apps) — 生成与评估分离、记忆管理等长时间运行模式
- [Dive-into-Claude-Code — VILA-Lab](https://github.com/VILA-Lab/Dive-into-Claude-Code) — Claude Code 源码 18 章架构分析
- [awesome-harness-engineering — GitHub](https://github.com/ai-boost/awesome-harness-engineering) — Harness Engineering 资源汇总
