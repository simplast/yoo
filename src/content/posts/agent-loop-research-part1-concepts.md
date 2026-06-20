---
title: 'Agent Loop 深度调研（一）：核心概念与设计原理'
description: '从 ReAct 到 Harness Engineering，拆解现代 AI Agent 循环架构的核心设计思想，基于一手资料梳理 Agent Loop 的本质、模式与工程原则。'
pubDate: 2026-06-19
category: 'AI 工程'
tags: ['Agent Loop', 'Harness Engineering', 'ReAct', 'LLM Agent', '架构设计']
series: 'Agent Loop 深度调研'
seriesOrder: 1
draft: false
---

## 什么是 Agent Loop

Agent Loop（智能体循环）是当前 AI Agent 系统的核心执行引擎。它本质上是一个 **while 循环**：模型接收输入 → 决定是否调用工具 → 执行工具 → 将结果回传模型 → 模型再次判断 → 直到任务完成或触发终止条件。

这个循环看似简单，但围绕它构建的 **基础设施（Harness）** 才是区分玩具和生产系统的关键。VILA-Lab 的 [Dive-into-Claude-Code](https://github.com/VILA-Lab/Dive-into-Claude-Code) 项目对 Claude Code 源码的分析揭示了一个惊人比例：**98.4% 的代码是确定性基础设施，仅 1.6% 是 AI 推理逻辑**。模型负责"想"，Harness 负责"做"。

用 LangChain 博客的总结来说：

> "The model contains the intelligence and the harness makes that intelligence useful."

## 理论根源：ReAct 模式

Agent Loop 的学术基础来自 2022 年的 [ReAct 论文](https://arxiv.org/abs/2210.03629)（Reasoning and Acting）。该论文提出了一个三阶段循环：

1. **Thought（思考）**：模型分析当前状态，规划下一步行动
2. **Action（行动）**：调用外部工具执行操作
3. **Observation（观察）**：接收工具返回结果，作为下一轮思考的输入

现代 Agent Loop 将 ReAct 的 Thought/Action/Observation 循环封装为工程化的执行管道。不同框架的实现细节各异，但核心模式一致。

## Harness Engineering：从 Prompt 到 Loop 的范式跃迁

2025 年下半年，业界出现了一个关键术语转向：**Harness Engineering（脚手架工程）**。OpenAI、Anthropic、Martin Fowler 等多方同时推动了这个概念。

### 三次范式演进

| 阶段 | 核心方法 | 关注点 |
|------|---------|--------|
| Prompt Engineering | 精心设计单次提示词 | 一次对话的输入质量 |
| Context Engineering | 动态管理上下文窗口 | 多轮对话的信息投喂 |
| Loop Engineering | 构建完整的执行循环 | 自主多步任务的全生命周期 |

Martin Fowler 在 [Harness Engineering](https://martinfowler.com/articles/harness-engineering.html) 一文中将脚手架定义为 **前馈引导（feedforward guides）**——不是限制模型行为，而是为模型提供执行框架。Anthropic 的 [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) 则强调：

> 顶级部署避免使用重型库，偏好"简单、可组合的模式"。重型框架添加抽象层会"遮蔽底层提示词"，增加调试复杂度。

### Harness 的五大核心组件

综合 [awesome-harness-engineering](https://github.com/ai-boost/awesome-harness-engineering) 的梳理和各厂商文档，一个完整的 Agent Harness 包含：

**1. 执行循环（Agent Loop）**
while 循环本体。控制何时调用模型、何时执行工具、何时终止。

**2. 工具系统（Tool System）**
Agent 与外部世界交互的接口。包括函数工具、MCP 协议工具、Bash 执行等。Anthropic 在工具设计上有专门的指导文档 [Writing Effective Tools for Agents](https://www.anthropic.com/engineering/writing-effective-tools-for-agents)。

**3. 上下文管理（Context Management）**
管理上下文窗口的有限资源。Anthropic 的 [Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) 提出了三大策略：摘要压缩（Compaction）、外部笔记（External Note-Taking）、子代理委托（Sub-Agent Delegation）。

**4. 安全与权限（Safety & Permissions）**
deny-first 的权限模型、沙箱执行、审批流。Claude Code 有七种权限模式，OpenAI Codex 有独立的审批协议。

**5. 文件系统（Filesystem）**
LangChain 称其为"最基础的 Harness 原语"。用于卸载中间结果、跨会话持久化、多 Agent 协作的共享工作区。Microsoft 的 Azure SRE Agent 实践表明，[基于文件系统的上下文管理优于专用工具](https://techcommunity.microsoft.com/blog/appsonazureblog/context-engineering-lessons-from-building-azure-sre-agent/4481200/)。

## Agent Loop 的九阶段管道

根据 Dive-into-Claude-Code 对 Claude Code 的源码分析，每一轮 Agent Loop 交互严格遵循九个阶段：

```
1. 解析配置（Resolve Configs）
2. 初始化状态（Init State）
3. 组装上下文（Assemble Context）— 从 9 个有序来源注入
4. 应用压缩整形器（Apply 5 Pre-model Shapers）
5. 调用模型（Call Model）
6. 分派工具（Dispatch Tools）
7. 权限门控（Permission Gate）
8. 执行工具（Execute Tools）
9. 评估终止条件（Evaluate Stop Conditions）
```

### 五个终止条件

循环在以下任一条件下结束：
- 模型输出纯文本，无工具调用请求
- 达到最大轮次限制
- 上下文窗口溢出
- 生命周期 Hook 干预
- 外部显式中断

### 五级压缩策略

在每次调用模型前，系统依次执行五个压缩阶段（从最廉价到最昂贵）：

1. **Budget Reduction** — 裁剪已知低价值内容
2. **Snipping** — 截断过长工具输出
3. **Micro-compaction** — 合并相邻的相似消息
4. **Context Collapsing** — 折叠早期对话轮次
5. **Auto-compaction** — 调用模型进行全量摘要（最后手段）

## Anthropic 定义的五种工作流模式

Anthropic 在 [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) 中区分了五种预定义工作流和一种自主模式：

### 预定义工作流（Structured Workflows）

**Prompt Chaining（提示链）**
任务被顺序拆分，"每次 LLM 调用处理前一次的输出"。适合固定子任务。

**Routing（路由）**
输入被分类后发送到专门处理器。不同类型查询使用不同 prompt。

**Parallelization（并行化）**
模型并发工作。两种方式：切片（独立子任务）和投票（多视角共识）。

**Orchestrator-Workers（编排者-工人）**
主模型动态拆分任务，分配给辅助模型，合并结果。

**Evaluator-Optimizer（评估者-优化者）**
一个模型生成，另一个评估，循环迭代。适合"迭代改进能提供可衡量价值"的场景。

### 自主 Agent（Autonomous Agent）

与结构化工作流不同，自主 Agent 动态管理自己的工具使用。它们需要环境中的"真实反馈"（如测试执行结果）来跟踪进度。因为独立运作，需要严格的护栏和沙箱测试以防止错误累积。

## "Harness 成为差异化因素"

随着基础模型能力趋同，[Dive-into-Claude-Code](https://github.com/VILA-Lab/Dive-into-Claude-Code) 的核心结论是：

> "As models converge in capability, the harness becomes the differentiator."

Meta 的 [Ranking Engineer Agent](https://engineering.fb.com/2026/03/17/developer-tools/ranking-engineer-agent-rea-autonomous-ai-system-accelerating-meta-ads-ranking-innovation/) 采用休眠-唤醒检查点机制（hibernate-and-wake checkpointing），Microsoft 的 Azure SRE Agent 用文件系统上下文取代专用工具提升了"意图满足"指标，GitHub Copilot 的 [Coding Harness](https://code.visualstudio.com/blogs/2026/05/15/agent-harnesses-github-copilot-vscode) 围绕上下文组装做文章——这些都印证了同一个趋势：**模型是引擎，Harness 是整车**。

## 参考资料

一手资料（本次调研的核心来源）：

- [Dive-into-Claude-Code](https://github.com/VILA-Lab/Dive-into-Claude-Code) — GitHub 开源的 Claude Code 架构 18 章深度拆解
- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Anthropic 官方博客
- [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Anthropic 工程博客
- [Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) — Anthropic 工程博客
- [The Anatomy of an Agent Harness](https://blog.langchain.com/the-anatomy-of-an-agent-harness/) — LangChain 博客
- [Harness Engineering](https://martinfowler.com/articles/harness-engineering.html) — Martin Fowler
- [awesome-harness-engineering](https://github.com/ai-boost/awesome-harness-engineering) — GitHub 资源汇总
- [ReAct: Reasoning and Acting](https://arxiv.org/abs/2210.03629) — 原始论文
