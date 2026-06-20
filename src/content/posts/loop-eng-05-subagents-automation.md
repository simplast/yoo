---
title: 'Sub-agents 与 Automation — 任务分发与自动化调度'
description: 'Loop Engineering 的核心是让 Agent 自动发现和分配任务。本文讲解 Sub-agents 的角色拆分和 Automation 的调度机制，并实现一个自动化 CI 修复流水线。'
pubDate: 2026-06-20
category: 'AI 工程'
tags: ['Loop Engineering', 'Sub-agents', 'Automation', '调度', 'CI/CD']
series: 'Loop Engineering 实战'
seriesOrder: 5
draft: false
---

> **系列导航**：本文是 "Loop Engineering 实战" 系列第 5 篇。
> - 第 1 篇：什么是 Loop Engineering
> - 第 2 篇：AGENTS.md — 用规则文件定义你的 Loop 行为
> - 第 3 篇：Skills 与 Memory — Agent 的长期记忆
> - 第 4 篇：Worktrees — 隔离执行环境
> - **第 5 篇：Sub-agents 与 Automation — 任务分发与自动化调度（本文）**
> - 第 6 篇：构建你的第一个 Loop — 从零搭建自主循环系统

---

前 4 篇我们解决了单个 Agent 的核心问题：用 AGENTS.md 定义行为边界，用 Skills 注入过程化知识，用 Memory 实现跨会话记忆，用 Worktrees 隔离执行环境。但一个真正的 Loop 系统不可能只有一个 Agent——就像一家公司不可能只有一个人。

你需要**分工**。

Addy Osmani 在 [Loop Engineering](https://addyosmani.com/blog/loop-engineering/) 一文中特别强调了 Sub-agents 的价值：

> "The most effective agent systems don't have one monolithic agent doing everything. They decompose work across specialized sub-agents, each with a focused role and constrained scope."
>
> （最有效的 Agent 系统不是让一个巨型 Agent 包办一切，而是把工作分解到专职的 Sub-agent 上，每个角色聚焦且约束。）

Anthropic 在 [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) 中也区分了两种编排模式：**Workflow（工作流）** 由预定义代码路径编排多个 Agent；**Autonomous Agent（自主智能体）** 由模型动态决定调用谁。两者的区别不是"谁更智能"，而是"谁控制流程"。

本文解决三个问题：

1. **怎么拆**——Sub-agents 的角色拆分模式
2. **怎么调**——Automation 的调度机制
3. **怎么落地**——实现一个自动化 CI 修复流水线

---

## 一、Sub-agents 角色拆分：为什么不能让一个 Agent 包办一切

### 1.1 单 Agent 的三个致命问题

一个 Agent 同时负责"生成方案"和"验证方案"，会遇到三个结构性问题：

**自评偏差（Self-evaluation Bias）**。让同一个 Agent 既写代码又评审代码，它天然倾向于认为自己写的代码是对的。这不是模型"不够聪明"，而是 Transformer 的注意力机制在生成代码后，上下文中已经充满了"为什么这样写是对的"的推理链条。让它回头挑错，等于让它否定自己刚刚建立的逻辑——这在概率上极其困难。

**上下文污染（Context Pollution）**。一个 Agent 同时处理多个职责时，上下文窗口会被不同角色的信息塞满。修复 CI 失败的 Agent 需要看错误日志、源码、测试报告；如果它还要负责开 PR、写描述、选 reviewer，上下文就会被不相关的信息稀释，导致核心任务质量下降。

**爆炸半径不可控（Uncontrolled Blast Radius）**。一个拥有全部权限的 Agent 一旦出错，影响范围是全局的。它可能在修复一个测试时不小心删掉另一个模块的文件，因为它同时拥有"读任何文件"和"写任何文件"的权限。

解决思路很直接：**拆分职责，限制权限，互不信任**。

### 1.2 三种拆分模式

根据任务复杂度和协作需求，Sub-agents 有三种典型的拆分模式。

#### 模式一：Creator-Reviewer 模式

最经典的双角色设计——一个负责生成，一个负责审查。

```
┌──────────────────────────────────────────────────────┐
│                 Creator-Reviewer 模式                  │
│                                                      │
│  ┌─────────────┐     ┌─────────────┐                 │
│  │   Creator    │────→│   Reviewer   │                │
│  │   Agent      │     │   Agent      │                │
│  │              │     │              │                 │
│  │ 职责：       │     │ 职责：       │                 │
│  │ - 生成代码    │     │ - 审查代码    │                │
│  │ - 修复 Bug   │     │ - 跑测试      │                │
│  │ - 写文档     │     │ - 安全扫描    │                │
│  │              │     │ - 提出修改意见 │                │
│  │ 权限：       │     │              │                 │
│  │ - 读写源码    │     │ 权限：       │                 │
│  │ - 读测试文件  │     │ - 只读源码    │                │
│  │              │     │ - 执行测试    │                │
│  └─────────────┘     │ - 读写 PR     │                │
│         ↑            └──────┬───────┘                 │
│         │                   │                         │
│         └───── 修改建议 ─────┘                         │
│                (最多 3 轮)                              │
└──────────────────────────────────────────────────────┘
```

这个模式的核心是**不信任**。Creator 不知道 Reviewer 会怎么审，Reviewer 不关心 Creator 为什么这样写——它只看结果。这种刻意的信息隔离，反而能产出更高质量的代码。

#### 模式二：Specialist Team 模式

当任务涉及多个专业领域时，按领域拆分成专家组。

```
┌──────────────────────────────────────────────────────────────┐
│                  Specialist Team 模式                          │
│                                                              │
│  ┌────────────────┐                                          │
│  │  Orchestrator   │ ← 只负责分配任务和汇总结果                  │
│  │  (协调者)        │                                          │
│  └───┬────┬────┬──┘                                          │
│      │    │    │                                              │
│      ▼    ▼    ▼                                              │
│  ┌──────┐┌──────┐┌──────┐                                    │
│  │前端   ││后端   ││数据库 │                                    │
│  │Agent  ││Agent  ││Agent  │                                   │
│  │       ││       ││       │                                    │
│  │React  ││Python ││SQL    │                                   │
│  │CSS    ││API    ││迁移   │                                    │
│  └──────┘└──────┘└──────┘                                    │
└──────────────────────────────────────────────────────────────┘
```

每个 Specialist 只看到与自己领域相关的上下文。前端 Agent 不需要知道数据库 schema，数据库 Agent 不需要知道 CSS 变量命名规范。这种隔离不仅节省 token，更重要的是**防止跨域干扰**——一个同时看到 React 组件和 SQL 查询的 Agent，很容易在修改前端时"顺手"改一条它不完全理解的 SQL。

#### 模式三：Pipeline Chain 模式

当任务是一系列严格顺序的步骤时，按流水线拆分。

```
┌──────────────────────────────────────────────────────────────┐
│                  Pipeline Chain 模式                           │
│                                                              │
│  ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐       │
│  │ Stage 1 │───→│ Stage 2 │───→│ Stage 3 │───→│ Stage 4 │      │
│  │ 分析    │    │ 编码    │    │ 测试    │    │ 部署    │       │
│  │         │    │         │    │         │    │         │       │
│  │ 读代码  │    │ 改代码   │    │ 跑测试  │    │ 发 PR   │       │
│  │ 读日志  │    │ 写测试   │    │ 检查覆盖 │    │ 更新文档 │       │
│  └────────┘    └────────┘    └────────┘    └────────┘       │
│       │              │              │              │           │
│       └──── 每个 Stage 的输出是下一个 Stage 的输入 ────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

Pipeline 模式的关键约束是**单向数据流**：每个 Stage 只接收上一个 Stage 的输出，不允许回头修改。这保证了每一步的输入都是确定的，出了问题可以精确定位到是哪个 Stage 的锅。

### 1.3 Python 实现 Creator-Reviewer

下面用 Python 实现一个可运行的 Creator-Reviewer 系统。这里用 `openai` SDK 作为 LLM 接口（你可以替换成任何兼容的 API），核心逻辑不依赖特定供应商。

```python
"""
creator_reviewer.py — Creator-Reviewer 模式的 Sub-agent 实现

用法：
    pip install openai
    export OPENAI_API_KEY="sk-..."
    python creator_reviewer.py
"""

import json
import os
from dataclasses import dataclass, field
from openai import OpenAI

client = OpenAI()

# ──────────────────────────────────────────────
# 数据结构
# ──────────────────────────────────────────────

@dataclass
class ReviewResult:
    approved: bool
    issues: list[str] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)


@dataclass
class TaskContext:
    """在 Creator 和 Reviewer 之间传递的任务上下文"""
    task_description: str
    source_files: dict[str, str]       # {filename: content}
    test_files: dict[str, str]         # {filename: content}
    created_code: dict[str, str] = field(default_factory=dict)
    review_rounds: int = 0
    max_rounds: int = 3


# ──────────────────────────────────────────────
# Creator Agent
# ──────────────────────────────────────────────

CREATOR_SYSTEM = """You are a Creator Agent. Your job is to write or fix code based on the task description.

Rules:
- Only output the complete file contents, no explanations
- Use JSON format: {"filename": "full file content"}
- Follow existing code style and conventions in the source files
- If responding to review feedback, address EVERY issue listed
- Do NOT modify files that are not related to the task
"""


def creator_agent(ctx: TaskContext, review_feedback: str | None = None) -> dict[str, str]:
    """Creator Agent：生成或修复代码"""
    messages = [
        {"role": "system", "content": CREATOR_SYSTEM},
    ]

    # 注入当前源码作为上下文
    user_msg = f"## Task\n{ctx.task_description}\n\n"
    user_msg += "## Current Source Files\n"
    for fname, content in ctx.source_files.items():
        user_msg += f"### {fname}\n```python\n{content}\n```\n\n"

    if review_feedback:
        user_msg += f"## Review Feedback (MUST address all)\n{review_feedback}\n\n"

    user_msg += "Output the updated files as JSON."
    messages.append({"role": "user", "content": user_msg})

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    return json.loads(response.choices[0].message.content)


# ──────────────────────────────────────────────
# Reviewer Agent
# ──────────────────────────────────────────────

REVIEWER_SYSTEM = """You are a Reviewer Agent. Your job is to review code changes for correctness,
security, and quality.

You are deliberately skeptical. Assume the Creator made mistakes until proven otherwise.

Review checklist:
1. Does the code actually solve the stated task?
2. Are there any bugs, edge cases, or off-by-one errors?
3. Are there security issues (injection, path traversal, etc.)?
4. Does the code follow the existing style in the source files?
5. Are tests included or updated?

Output JSON:
{
  "approved": true/false,
  "issues": ["critical issue 1", ...],
  "suggestions": ["nice-to-have 1", ...]
}
"""


def reviewer_agent(ctx: TaskContext) -> ReviewResult:
    """Reviewer Agent：审查 Creator 生成的代码"""
    messages = [
        {"role": "system", "content": REVIEWER_SYSTEM},
    ]

    user_msg = f"## Task\n{ctx.task_description}\n\n"

    user_msg += "## Original Source Files\n"
    for fname, content in ctx.source_files.items():
        user_msg += f"### {fname}\n```python\n{content}\n```\n\n"

    user_msg += "## Creator's Output (files to review)\n"
    for fname, content in ctx.created_code.items():
        user_msg += f"### {fname}\n```python\n{content}\n```\n\n"

    user_msg += "Review the Creator's output against the task and original files."
    messages.append({"role": "user", "content": user_msg})

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.1,  # Reviewer 用低温度，更严格、更确定
        response_format={"type": "json_object"},
    )

    data = json.loads(response.choices[0].message.content)
    return ReviewResult(
        approved=data.get("approved", False),
        issues=data.get("issues", []),
        suggestions=data.get("suggestions", []),
    )


# ──────────────────────────────────────────────
# 编排循环
# ──────────────────────────────────────────────

def run_creator_reviewer(task: str, source_files: dict[str, str]) -> dict:
    """
    运行 Creator-Reviewer 循环，最多 max_rounds 轮。
    返回最终结果和审查历史。
    """
    ctx = TaskContext(
        task_description=task,
        source_files=source_files,
    )

    history = []
    feedback = None

    while ctx.review_rounds < ctx.max_rounds:
        ctx.review_rounds += 1
        print(f"\n{'='*60}")
        print(f"  Round {ctx.review_rounds}/{ctx.max_rounds}")
        print(f"{'='*60}")

        # Step 1: Creator 生成代码
        print("\n[Creator] Generating code...")
        ctx.created_code = creator_agent(ctx, feedback)
        print(f"[Creator] Produced {len(ctx.created_code)} file(s): {list(ctx.created_code.keys())}")

        # Step 2: Reviewer 审查代码
        print("[Reviewer] Reviewing code...")
        review = reviewer_agent(ctx)
        history.append({
            "round": ctx.review_rounds,
            "approved": review.approved,
            "issues": review.issues,
            "suggestions": review.suggestions,
        })

        if review.approved:
            print(f"[Reviewer] ✅ APPROVED (round {ctx.review_rounds})")
            if review.suggestions:
                print(f"[Reviewer] Suggestions: {review.suggestions}")
            return {
                "status": "approved",
                "code": ctx.created_code,
                "rounds": ctx.review_rounds,
                "history": history,
            }

        # Step 3: 未通过，构造反馈给 Creator
        print(f"[Reviewer] ❌ REJECTED — {len(review.issues)} issue(s)")
        for issue in review.issues:
            print(f"  - {issue}")

        feedback = "## Issues to Fix\n"
        for i, issue in enumerate(review.issues, 1):
            feedback += f"{i}. {issue}\n"
        if review.suggestions:
            feedback += "\n## Suggestions (optional)\n"
            for s in review.suggestions:
                feedback += f"- {s}\n"

    # 超过最大轮次
    return {
        "status": "max_rounds_exceeded",
        "code": ctx.created_code,
        "rounds": ctx.review_rounds,
        "history": history,
    }


# ──────────────────────────────────────────────
# 示例运行
# ──────────────────────────────────────────────

if __name__ == "__main__":
    # 模拟一个简单的源码文件
    source = {
        "calculator.py": '''
def add(a, b):
    return a + b

def divide(a, b):
    return a / b  # Bug: no zero-division check
''',
    }

    task = """
Fix the divide function to handle division by zero.
Add a multiply function.
Add unit tests for all functions.
"""

    result = run_creator_reviewer(task, source)

    print(f"\n{'='*60}")
    print(f"  Final Result: {result['status']}")
    print(f"  Rounds used: {result['rounds']}")
    print(f"{'='*60}")

    if result["code"]:
        for fname, content in result["code"].items():
            print(f"\n--- {fname} ---")
            print(content[:500])
```

这段代码有几个值得注意的设计决策：

**温度分离**。Creator 用 `temperature=0.3`（允许一定创造性），Reviewer 用 `temperature=0.1`（更严格、更确定）。这不是随意选的——Reviewer 需要的是稳定性和严格性，而非创造性。

**结构化通信**。两个 Agent 之间通过 JSON 传递数据，不用自然语言"聊天"。这避免了上下文膨胀，也让每一轮的输入/输出可以被程序化地解析和存储。

**最大轮次限制**。`max_rounds=3` 是硬上限。超过 3 轮还没通过，说明任务本身可能定义不清、或者 Creator 能力不足。无限循环是最大的浪费。

---

## 二、Automation 调度机制：Agent 什么时候该工作

Sub-agents 解决了"谁做什么"，Automation 解决"什么时候做"。

在 Loop Engineering 中，Agent 不应该只在人类敲键盘时才工作。理想状态是：**Agent 像一个 7×24 值班的工程师，自动发现任务、自动执行、自动汇报**。但"自动"不等于"失控"——你需要精确控制触发的时机和条件。

### 2.1 四种调度模式对比

| 维度 | Cron 定时 | 事件驱动 | 条件触发 | 手动触发 |
|------|-----------|----------|----------|----------|
| **触发源** | 时间到达 | 外部事件（Webhook、消息） | 内部状态变化 | 人类指令 |
| **典型场景** | 每天 9 点检查 CI | GitHub PR 创建时自动 review | 测试覆盖率 < 80% 时生成测试 | `/fix-ci` 命令 |
| **延迟** | 分钟级（取决于 Cron 间隔） | 秒级（事件推送） | 取决于检查频率 | 人类决定 |
| **可预测性** | 高（固定时间表） | 中（取决于事件频率） | 低（取决于系统状态） | 最高（人类完全控制） |
| **资源消耗** | 低（空闲时不消耗） | 中（需要常驻监听） | 中（需要定期轮询） | 最低（按需启动） |
| **适用风险等级** | 低-中风险 | 低-中风险 | 中-高风险 | 高风险 |
| **实现复杂度** | 低 | 中 | 中-高 | 最低 |

在生产系统中，这四种模式通常**混合使用**。一个典型的 Loop 系统可能同时有：

- Cron 每天凌晨检查依赖是否有安全漏洞
- 事件驱动监听 GitHub Webhook，PR 创建时自动触发 Review Agent
- 条件触发在测试覆盖率下降时自动生成测试用例
- 手动触发用于高风险操作（如数据库迁移、生产部署）

### 2.2 Node.js 事件驱动调度器

下面实现一个基于 Node.js 的事件驱动调度器。它监听 GitHub Webhook 事件，根据事件类型将任务分发给不同的 Sub-agent。

```typescript
/**
 * scheduler.ts — 事件驱动的 Agent 调度器
 *
 * 用法：
 *   npm install express @octokit/rest
 *   npx tsx scheduler.ts
 *
 * 配置 GitHub Webhook 指向 http://your-server:3000/webhook
 */

import express from "express";
import crypto from "crypto";

// ──────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────

interface AgentTask {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: "low" | "medium" | "high";
  createdAt: Date;
  status: "pending" | "running" | "completed" | "failed";
  assignedAgent?: string;
  result?: Record<string, unknown>;
}

interface AgentDefinition {
  name: string;
  handles: string[];           // 能处理的事件类型
  maxConcurrent: number;       // 最大并发数
  currentLoad: number;         // 当前负载
}

// ──────────────────────────────────────────────
// Agent 注册表
// ──────────────────────────────────────────────

const agents: AgentDefinition[] = [
  {
    name: "review-agent",
    handles: ["pull_request.opened", "pull_request.synchronize"],
    maxConcurrent: 3,
    currentLoad: 0,
  },
  {
    name: "ci-fix-agent",
    handles: ["check_suite.completed"],
    maxConcurrent: 2,
    currentLoad: 0,
  },
  {
    name: "security-agent",
    handles: ["dependabot_alert.created"],
    maxConcurrent: 1,
    currentLoad: 0,
  },
];

// ──────────────────────────────────────────────
// 任务队列
// ──────────────────────────────────────────────

class TaskQueue {
  private queue: AgentTask[] = [];
  private running = new Map<string, AgentTask>();

  enqueue(task: AgentTask): void {
    this.queue.push(task);
    // 按优先级排序：high > medium > low
    this.queue.sort((a, b) => {
      const priority = { high: 3, medium: 2, low: 1 };
      return priority[b.priority] - priority[a.priority];
    });
    console.log(
      `[Queue] Enqueued task ${task.id} (${task.type}), ` +
      `queue size: ${this.queue.length}`
    );
  }

  /** 找到能处理该事件类型且负载最低的 Agent */
  findAgent(eventType: string): AgentDefinition | null {
    const candidates = agents.filter(
      (a) =>
        a.handles.includes(eventType) &&
        a.currentLoad < a.maxConcurrent
    );
    if (candidates.length === 0) return null;
    // 选负载最低的
    return candidates.reduce((min, a) =>
      a.currentLoad < min.currentLoad ? a : min
    );
  }

  /** 尝试调度队列中的任务 */
  async dispatch(): Promise<void> {
    for (const task of [...this.queue]) {
      const agent = this.findAgent(task.type);
      if (!agent) {
        console.log(`[Queue] No available agent for ${task.type}, waiting...`);
        continue;
      }

      // 分配任务
      task.status = "running";
      task.assignedAgent = agent.name;
      agent.currentLoad++;
      this.running.set(task.id, task);
      this.queue = this.queue.filter((t) => t.id !== task.id);

      console.log(
        `[Queue] Dispatched ${task.id} → ${agent.name} ` +
        `(load: ${agent.currentLoad}/${agent.maxConcurrent})`
      );

      // 异步执行
      this.executeTask(task, agent);
    }
  }

  private async executeTask(task: AgentTask, agent: AgentDefinition): Promise<void> {
    try {
      // 这里是实际调用 Agent 逻辑的地方
      // 例如调用 Claude API / OpenAI API，传入任务 payload
      console.log(`[${agent.name}] Executing task ${task.id}...`);

      // 模拟 Agent 执行
      await new Promise((resolve) => setTimeout(resolve, 2000));

      task.status = "completed";
      task.result = { message: "Task completed successfully" };
      console.log(`[${agent.name}] ✅ Task ${task.id} completed`);
    } catch (error) {
      task.status = "failed";
      console.error(`[${agent.name}] ❌ Task ${task.id} failed:`, error);
    } finally {
      agent.currentLoad--;
      this.running.delete(task.id);
      // 完成后尝试调度下一个
      this.dispatch();
    }
  }

  getStats() {
    return {
      pending: this.queue.length,
      running: this.running.size,
      agents: agents.map((a) => ({
        name: a.name,
        load: `${a.currentLoad}/${a.maxConcurrent}`,
      })),
    };
  }
}

// ──────────────────────────────────────────────
// Webhook 服务器
// ──────────────────────────────────────────────

const app = express();
app.use(express.json());

const queue = new TaskQueue();
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "your-secret";

/** 验证 GitHub Webhook 签名 */
function verifySignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expected}`)
  );
}

/** 从 GitHub 事件中提取任务信息 */
function extractTask(eventType: string, body: Record<string, unknown>): AgentTask | null {
  const id = crypto.randomUUID();

  switch (eventType) {
    case "pull_request": {
      const action = body.action as string;
      if (!["opened", "synchronize"].includes(action)) return null;
      const pr = body.pull_request as Record<string, unknown>;
      return {
        id,
        type: `pull_request.${action}`,
        payload: {
          repo: (body.repository as Record<string, unknown>)?.full_name,
          prNumber: pr.number,
          prTitle: pr.title,
          prUrl: pr.html_url,
        },
        priority: "medium",
        createdAt: new Date(),
        status: "pending",
      };
    }

    case "check_suite": {
      const suite = body.check_suite as Record<string, unknown>;
      if (suite.conclusion !== "failure") return null; // 只处理失败的
      return {
        id,
        type: "check_suite.completed",
        payload: {
          repo: (body.repository as Record<string, unknown>)?.full_name,
          suiteId: suite.id,
          conclusion: suite.conclusion,
          headBranch: suite.head_branch,
        },
        priority: "high",
        createdAt: new Date(),
        status: "pending",
      };
    }

    default:
      return null;
  }
}

// Webhook 端点
app.post("/webhook", (req, res) => {
  const signature = req.headers["x-hub-signature-256"] as string;
  const eventType = req.headers["x-github-event"] as string;

  // 验证签名
  const rawBody = JSON.stringify(req.body);
  if (!verifySignature(rawBody, signature)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // 提取任务
  const task = extractTask(eventType, req.body);
  if (task) {
    queue.enqueue(task);
    queue.dispatch();
  }

  res.status(200).json({ received: true, task: task?.id ?? null });
});

// 状态端点
app.get("/status", (_req, res) => {
  res.json(queue.getStats());
});

// 启动
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Scheduler] Listening on port ${PORT}`);
  console.log(`[Scheduler] Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`[Scheduler] Status URL:  http://localhost:${PORT}/status`);
});
```

这个调度器的核心设计：

**优先级队列**。high 优先级任务（CI 失败修复）排在 medium（PR review）前面。当一个 Agent 空闲出来时，它总是先拿队列中优先级最高的任务。

**负载均衡**。`findAgent()` 在所有能处理该事件类型的 Agent 中，选择当前负载最低的。这避免了某个 Agent 被塞满而其他 Agent 空闲的情况。

**背压控制**。每个 Agent 有 `maxConcurrent` 上限。当所有能处理某类事件的 Agent 都满载时，新任务留在队列中等待，而不是创建更多 Agent 实例（那会导致 token 成本失控）。

---

## 三、实战：自动化 CI 修复流水线

理论讲够了。下面实现一个完整的自动化 CI 修复流水线——当 GitHub Actions 的 CI 失败时，自动创建 worktree、分析错误、修复代码、审查验证、开 PR。

### 3.1 全流程概览

```
┌──────────────────────────────────────────────────────────────────┐
│                  自动化 CI 修复流水线                                │
│                                                                  │
│  ① 定时检查 CI           ② 创建 Worktree         ③ Fix Agent      │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐ │
│  │ Cron / 每 10  │──────→│ git worktree │──────→│ 分析错误日志  │ │
│  │ 分钟扫描一次  │       │ add fix/ci-* │       │ 读取相关源码  │ │
│  └──────────────┘       └──────────────┘       │ 生成修复补丁  │ │
│                                                 └──────┬───────┘ │
│                                                        │         │
│  ⑥ 更新 Memory        ⑤ 自动开 PR           ④ Review Agent      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │ 记录修复模式  │←────│ gh pr create │←────│ 审查代码变更  │     │
│  │ 更新成功率    │     │ --auto-fix   │     │ 跑测试验证    │     │
│  │ 下次更快定位  │     └──────────────┘     │ 安全检查      │     │
│  └──────────────┘                          └──────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 完整实现

```python
"""
ci_fix_pipeline.py — 自动化 CI 修复流水线

完整流程：
  1. 定时检查 CI 状态
  2. 为失败任务创建隔离 worktree
  3. Fix Agent 分析错误并修复
  4. Review Agent 验证修复
  5. 自动开 PR
  6. 更新 Memory

依赖：
  pip install openai pyyaml
  # 需要系统安装 git 和 gh (GitHub CLI)
"""

import json
import os
import subprocess
import time
import yaml
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from openai import OpenAI

client = OpenAI()

# ──────────────────────────────────────────────
# 配置
# ──────────────────────────────────────────────

@dataclass
class PipelineConfig:
    repo_path: str = "."
    poll_interval_seconds: int = 600  # 10 分钟
    max_fix_attempts: int = 3
    auto_merge: bool = False          # 低风险可开启
    memory_path: str = ".ci-fix-memory.yaml"
    token_budget: int = 50_000        # 单次流水线最大 token
    model_tier: str = "gpt-4o"       # 默认用强模型
    model_tier_fallback: str = "gpt-4o-mini"  # 简单任务用便宜模型


# ──────────────────────────────────────────────
# 步骤 1：检查 CI 状态
# ──────────────────────────────────────────────

@dataclass
class CIFailure:
    """一次 CI 失败的信息"""
    run_id: str
    run_url: str
    branch: str
    commit_sha: str
    failed_jobs: list[dict]
    error_logs: str


def check_ci_status(repo_path: str) -> list[CIFailure]:
    """通过 GitHub CLI 检查最近的 CI 失败"""
    try:
        result = subprocess.run(
            ["gh", "run", "list", "--status", "failure",
             "--limit", "5", "--json",
             "databaseId,headBranch,headSha,url,jobs"],
            capture_output=True, text=True, cwd=repo_path,
        )
        if result.returncode != 0:
            print(f"[CI Check] gh command failed: {result.stderr}")
            return []

        runs = json.loads(result.stdout)
        failures = []

        for run in runs:
            # 获取失败 job 的详细日志
            run_id = str(run["databaseId"])
            log_result = subprocess.run(
                ["gh", "run", "view", run_id, "--log-failed"],
                capture_output=True, text=True, cwd=repo_path,
            )
            error_logs = log_result.stdout[:8000]  # 截断，防止 token 爆炸

            failed_jobs = [
                j for j in run.get("jobs", [])
                if j.get("conclusion") == "failure"
            ]

            failures.append(CIFailure(
                run_id=run_id,
                run_url=run["url"],
                branch=run["headBranch"],
                commit_sha=run["headSha"],
                failed_jobs=failed_jobs,
                error_logs=error_logs,
            ))

        print(f"[CI Check] Found {len(failures)} failed run(s)")
        return failures

    except Exception as e:
        print(f"[CI Check] Error: {e}")
        return []


# ──────────────────────────────────────────────
# 步骤 2：创建 Worktree
# ──────────────────────────────────────────────

def create_worktree(repo_path: str, branch: str, run_id: str) -> str:
    """为修复任务创建隔离的 git worktree"""
    worktree_branch = f"auto-fix/ci-{run_id}"
    worktree_path = os.path.join(repo_path, "..", f".worktrees/{worktree_branch}")

    os.makedirs(os.path.dirname(worktree_path), exist_ok=True)

    # 基于失败分支创建 worktree
    subprocess.run(
        ["git", "worktree", "add", "-b", worktree_branch,
         worktree_path, branch],
        capture_output=True, text=True, cwd=repo_path,
    )

    print(f"[Worktree] Created at {worktree_path}")
    return worktree_path


# ──────────────────────────────────────────────
# 步骤 3：Fix Agent
# ──────────────────────────────────────────────

FIX_AGENT_SYSTEM = """You are a CI Fix Agent. Your sole purpose is to fix CI failures.

Rules:
- Analyze the error logs carefully
- Read the relevant source files to understand the code
- Make MINIMAL changes to fix the failure — do not refactor or improve unrelated code
- If the failure is a test failure, check if the test or the source code is wrong
- Output a JSON patch: {"files": {"path/to/file": "full updated content"}}
- If you cannot fix it confidently, output {"files": {}, "reason": "explanation"}
"""


def fix_agent(worktree_path: str, failure: CIFailure, memory: dict) -> dict:
    """Fix Agent：分析 CI 错误并修复代码"""
    messages = [
        {"role": "system", "content": FIX_AGENT_SYSTEM},
    ]

    # 注入历史修复模式（来自 Memory）
    patterns = memory.get("fix_patterns", [])
    pattern_hints = ""
    if patterns:
        pattern_hints = "\n## Historical Fix Patterns\n"
        for p in patterns[-5:]:  # 最近 5 个
            pattern_hints += f"- {p['pattern']}: {p['solution']}\n"

    user_msg = f"""## CI Failure Info
- Run: {failure.run_url}
- Branch: {failure.branch}
- Failed Jobs: {json.dumps(failure.failed_jobs, indent=2)}

## Error Logs
```
{failure.error_logs}
```
{pattern_hints}
Read the relevant source files, then output the fix as JSON.
"""
    messages.append({"role": "user", "content": user_msg})

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    result = json.loads(response.choices[0].message.content)

    # 将修复写入 worktree
    files_written = 0
    for filepath, content in result.get("files", {}).items():
        full_path = os.path.join(worktree_path, filepath)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w") as f:
            f.write(content)
        files_written += 1

    print(f"[Fix Agent] Written {files_written} file(s)")
    return result


# ──────────────────────────────────────────────
# 步骤 4：Review Agent
# ──────────────────────────────────────────────

REVIEW_AGENT_SYSTEM = """You are a CI Review Agent. Verify that a proposed fix is correct and safe.

Checklist:
1. Does the fix actually address the CI failure?
2. Are there any introduced bugs or regressions?
3. Does the fix follow the project's coding conventions?
4. Is the change minimal? (no scope creep)
5. Run tests if possible: `cd <worktree> && npm test` or `pytest`

Output JSON: {"approved": bool, "issues": [...], "test_result": "pass|fail|skipped"}
"""


def review_agent(worktree_path: str, failure: CIFailure, fix_result: dict) -> dict:
    """Review Agent：验证修复的正确性"""

    # 先跑测试
    test_result = run_tests(worktree_path)

    messages = [
        {"role": "system", "content": REVIEW_AGENT_SYSTEM},
        {"role": "user", "content": f"""## CI Failure
{failure.error_logs[:3000]}

## Proposed Fix
Changed files: {list(fix_result.get('files', {}).keys())}
Fix reason: {fix_result.get('reason', 'auto-fix')}

## Test Result
{test_result}

Review the changes in the worktree at {worktree_path}.
Use `git diff` to see the actual changes.
"""},
    ]

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.1,
        response_format={"type": "json_object"},
    )

    return json.loads(response.choices[0].message.content)


def run_tests(worktree_path: str) -> str:
    """在 worktree 中运行测试"""
    # 检测项目类型并运行对应测试
    test_commands = [
        (["npm", "test"], "package.json"),
        (["pytest", "-x", "--tb=short"], "pytest.ini"),
        (["pytest", "-x", "--tb=short"], "setup.py"),
        (["pytest", "-x", "--tb=short"], "pyproject.toml"),
        (["go", "test", "./..."], "go.mod"),
    ]

    for cmd, marker in test_commands:
        if os.path.exists(os.path.join(worktree_path, marker)):
            result = subprocess.run(
                cmd, capture_output=True, text=True,
                cwd=worktree_path, timeout=120,
            )
            return f"Exit code: {result.returncode}\n{result.stdout[-2000:]}\n{result.stderr[-1000:]}"

    return "No test runner detected, skipped."


# ──────────────────────────────────────────────
# 步骤 5：自动开 PR
# ──────────────────────────────────────────────

def create_pull_request(worktree_path: str, failure: CIFailure, fix_result: dict) -> str | None:
    """提交修复并创建 Pull Request"""
    branch = f"auto-fix/ci-{failure.run_id}"

    # Git commit
    subprocess.run(["git", "add", "-A"], cwd=worktree_path)
    commit_msg = f"fix: auto-fix CI failure in run {failure.run_id}\n\n{fix_result.get('reason', '')}"
    result = subprocess.run(
        ["git", "commit", "-m", commit_msg],
        capture_output=True, text=True, cwd=worktree_path,
    )
    if "nothing to commit" in result.stdout:
        print("[PR] No changes to commit")
        return None

    # Push
    subprocess.run(
        ["git", "push", "-u", "origin", branch],
        capture_output=True, text=True, cwd=worktree_path,
    )

    # Create PR
    pr_title = f"[Auto-fix] CI failure in {failure.branch} (run {failure.run_id})"
    pr_body = f"""## Automated CI Fix

**Failed Run**: [{failure.run_id}]({failure.run_url})
**Branch**: `{failure.branch}`
**Commit**: `{failure.commit_sha[:8]}`

### What was fixed
{fix_result.get('reason', 'Automated fix based on error log analysis')}

### Changed files
{chr(10).join(f'- `{f}`' for f in fix_result.get('files', {}).keys())}

---
*This PR was created automatically by the CI Fix Pipeline.*
*Please review carefully before merging.*
"""

    pr_result = subprocess.run(
        ["gh", "pr", "create",
         "--title", pr_title,
         "--body", pr_body,
         "--label", "auto-fix,ci"],
        capture_output=True, text=True, cwd=worktree_path,
    )

    pr_url = pr_result.stdout.strip()
    print(f"[PR] Created: {pr_url}")
    return pr_url


# ──────────────────────────────────────────────
# 步骤 6：更新 Memory
# ──────────────────────────────────────────────

def load_memory(path: str) -> dict:
    if os.path.exists(path):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {"fix_patterns": [], "stats": {"total": 0, "success": 0, "failed": 0}}


def save_memory(path: str, memory: dict) -> None:
    with open(path, "w") as f:
        yaml.dump(memory, f, default_flow_style=False, allow_unicode=True)


def update_memory(memory: dict, failure: CIFailure, success: bool, fix_result: dict) -> dict:
    """记录修复结果，积累模式知识"""
    memory["stats"]["total"] += 1
    if success:
        memory["stats"]["success"] += 1
    else:
        memory["stats"]["failed"] += 1

    # 提取修复模式（用于未来加速定位）
    if success and fix_result.get("files"):
        error_signature = failure.error_logs[:200]
        pattern = {
            "pattern": error_signature,
            "solution": f"Modified: {list(fix_result['files'].keys())}",
            "timestamp": datetime.now().isoformat(),
            "branch": failure.branch,
        }
        memory["fix_patterns"].append(pattern)
        # 只保留最近 50 个模式
        memory["fix_patterns"] = memory["fix_patterns"][-50:]

    return memory


# ──────────────────────────────────────────────
# 主流水线
# ──────────────────────────────────────────────

def run_pipeline(config: PipelineConfig):
    """执行一轮完整的 CI 修复流水线"""
    memory = load_memory(config.memory_path)

    print(f"\n{'='*60}")
    print(f"  CI Fix Pipeline — {datetime.now().isoformat()}")
    print(f"{'='*60}")

    # Step 1: 检查 CI
    failures = check_ci_status(config.repo_path)
    if not failures:
        print("[Pipeline] No CI failures found. All good!")
        return

    for failure in failures[:3]:  # 每轮最多处理 3 个
        print(f"\n[Pipeline] Processing failure: run {failure.run_id}")

        # Step 2: 创建 Worktree
        worktree_path = create_worktree(
            config.repo_path, failure.branch, failure.run_id
        )

        try:
            # Step 3: Fix Agent 修复
            fix_result = fix_agent(worktree_path, failure, memory)
            if not fix_result.get("files"):
                print(f"[Pipeline] Fix Agent could not fix: {fix_result.get('reason')}")
                memory = update_memory(memory, failure, False, fix_result)
                continue

            # Step 4: Review Agent 验证（最多 2 轮）
            approved = False
            for review_round in range(2):
                review = review_agent(worktree_path, failure, fix_result)
                if review.get("approved"):
                    approved = True
                    break
                print(f"[Pipeline] Review round {review_round + 1} rejected: {review.get('issues')}")
                # 如果有问题，让 Fix Agent 再修一次
                fix_result = fix_agent(worktree_path, failure, memory)

            if not approved:
                print("[Pipeline] Review did not pass after 2 rounds, skipping")
                memory = update_memory(memory, failure, False, fix_result)
                continue

            # Step 5: 自动开 PR
            pr_url = create_pull_request(worktree_path, failure, fix_result)
            if pr_url:
                print(f"[Pipeline] ✅ PR created: {pr_url}")

            # Step 6: 更新 Memory
            memory = update_memory(memory, failure, True, fix_result)

        finally:
            # 清理 worktree（可选，保留用于调试）
            # subprocess.run(["git", "worktree", "remove", worktree_path, "--force"],
            #               capture_output=True, cwd=config.repo_path)
            pass

    save_memory(config.memory_path, memory)
    print(f"\n[Pipeline] Memory saved. Stats: {memory['stats']}")


# ──────────────────────────────────────────────
# 入口
# ──────────────────────────────────────────────

if __name__ == "__main__":
    config = PipelineConfig(
        repo_path=os.environ.get("REPO_PATH", "."),
        poll_interval_seconds=int(os.environ.get("POLL_INTERVAL", "600")),
    )

    mode = os.environ.get("MODE", "once")

    if mode == "daemon":
        print(f"[Pipeline] Starting daemon mode (interval: {config.poll_interval_seconds}s)")
        while True:
            run_pipeline(config)
            time.sleep(config.poll_interval_seconds)
    else:
        run_pipeline(config)
```

这个流水线有几个值得强调的工程细节：

**Worktree 隔离**。每次修复在独立的 worktree 中进行，即使 Fix Agent 搞砸了，也不会影响主分支。这对应了第 4 篇讲的环境隔离策略。

**Memory 积累**。`fix_patterns` 记录了每次修复的"错误特征 → 解决方案"映射。下次遇到类似的 CI 失败，Fix Agent 可以直接参考历史模式，跳过试错阶段。这就是第 3 篇讲的 Memory 机制在实际场景中的应用。

**错误日志截断**。`error_logs[:8000]` 是故意的。完整的 CI 日志可能有几万行，全部塞进上下文会耗尽 token 预算，而且大部分是无用的框架输出。截断到 8000 字符，保留了关键错误信息，又控制了成本。

---

## 四、成本控制：Agent 不是免费的

一个不加限制的 Agent 系统可以在几小时内烧掉你一个月的预算。Loop Engineering 必须内置成本控制机制。

### 4.1 Token 预算

每个 Agent 调用都有 token 上限。这不是"建议"，而是硬限制：

```python
class TokenBudget:
    """追踪和限制单次任务的 token 消耗"""

    def __init__(self, max_tokens: int = 50_000):
        self.max_tokens = max_tokens
        self.used = 0

    def record(self, prompt_tokens: int, completion_tokens: int):
        self.used += prompt_tokens + completion_tokens
        if self.used > self.max_tokens:
            raise BudgetExceeded(
                f"Token budget exceeded: {self.used}/{self.max_tokens}"
            )

    @property
    def remaining(self) -> int:
        return max(0, self.max_tokens - self.used)

    @property
    def usage_pct(self) -> float:
        return (self.used / self.max_tokens) * 100
```

在上面的 CI 修复流水线中，`PipelineConfig.token_budget = 50_000` 就是一次完整流水线（Fix Agent + Review Agent + 可能的重试）的总预算。超过这个数，流水线自动终止，避免无限消耗。

### 4.2 模型分级

不是所有任务都需要最强的模型。合理分级可以节省 60%-80% 的成本：

| 任务类型 | 推荐模型 | 原因 |
|----------|---------|------|
| 代码生成/修复 | Claude Sonnet / GPT-4o | 需要强推理能力 |
| 代码审查 | Claude Sonnet / GPT-4o | 需要深度理解 |
| 日志分析/分类 | GPT-4o-mini / Claude Haiku | 模式匹配，不需要强推理 |
| PR 描述生成 | GPT-4o-mini | 文本生成，相对简单 |
| 任务路由/分发 | GPT-4o-mini | 分类任务，token 少 |

在 CI 修复流水线中，可以这样实现分级：

```python
def select_model(task_type: str) -> str:
    """根据任务类型选择模型"""
    tier_map = {
        "fix": "gpt-4o",           # 修复需要强推理
        "review": "gpt-4o",        # 审查需要深度理解
        "classify": "gpt-4o-mini", # 分类用便宜模型
        "describe": "gpt-4o-mini", # 描述生成不需要强模型
        "route": "gpt-4o-mini",    # 路由决策很简单
    }
    return tier_map.get(task_type, "gpt-4o")
```

### 4.3 早停机制

当 Agent 在原地打转时，及时止损：

```python
class EarlyStopper:
    """检测 Agent 是否在无效循环中"""

    def __init__(self, patience: int = 3):
        self.patience = patience
        self.history: list[str] = []

    def check(self, output: str) -> bool:
        """返回 True 表示应该停止"""
        self.history.append(output[:200])  # 取前 200 字符做指纹

        if len(self.history) < self.patience:
            return False

        # 如果最近 N 次输出高度相似，说明 Agent 在打转
        recent = self.history[-self.patience:]
        if len(set(recent)) <= 1:
            return True

        return False
```

### 4.4 成本看板

把成本数据可视化，让团队知道钱花在哪了：

```python
@dataclass
class CostDashboard:
    """简单的成本追踪看板"""
    daily_costs: dict[str, float] = field(default_factory=dict)
    agent_costs: dict[str, float] = field(default_factory=dict)
    task_costs: dict[str, float] = field(default_factory=dict)

    def record(self, agent: str, task_type: str, cost_usd: float):
        today = datetime.now().strftime("%Y-%m-%d")
        self.daily_costs[today] = self.daily_costs.get(today, 0) + cost_usd
        self.agent_costs[agent] = self.agent_costs.get(agent, 0) + cost_usd
        self.task_costs[task_type] = self.task_costs.get(task_type, 0) + cost_usd

    def summary(self) -> str:
        today = datetime.now().strftime("%Y-%m-%d")
        lines = [
            f"=== Cost Dashboard ({today}) ===",
            f"Today: ${self.daily_costs.get(today, 0):.2f}",
            "",
            "By Agent:",
        ]
        for agent, cost in sorted(self.agent_costs.items(), key=lambda x: -x[1]):
            lines.append(f"  {agent}: ${cost:.2f}")
        lines.append("")
        lines.append("By Task Type:")
        for task, cost in sorted(self.task_costs.items(), key=lambda x: -x[1]):
            lines.append(f"  {task}: ${cost:.2f}")
        return "\n".join(lines)
```

---

## 五、人类兜底：信任的分级

自动化不是"全有或全无"。最成熟的 Loop 系统会根据风险等级，给人类留不同程度的控制权。

### 5.1 三级信任模型

```
┌─────────────────────────────────────────────────────────────┐
│                    三级信任模型                                │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Level 1: 全自动 (低风险)                              │   │
│  │  ─────────────────────────────                       │   │
│  │  Agent 自主完成全流程，事后通知人类                      │   │
│  │  适用：lint 修复、格式调整、文档 typo、依赖更新          │   │
│  │  条件：变更 < 3 个文件，不涉及核心逻辑                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Level 2: 半自动 (中风险)                              │   │
│  │  ─────────────────────────────                       │   │
│  │  Agent 生成修复 + PR，人类审批后合并                     │   │
│  │  适用：测试修复、Bug 修复、小型重构                      │   │
│  │  条件：变更 < 10 个文件，测试全部通过                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Level 3: 仅建议 (高风险)                              │   │
│  │  ─────────────────────────────                       │   │
│  │  Agent 只生成分析报告和修复方案，不写代码                 │   │
│  │  适用：架构变更、安全漏洞、数据库迁移、生产事故           │   │
│  │  条件：涉及核心模块 / 安全 / 数据                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 风险自动评估

```python
def assess_risk_level(files_changed: list[str], repo_path: str) -> int:
    """
    自动评估变更的风险等级。
    返回 1（低）、2（中）、3（高）。
    """
    HIGH_RISK_PATTERNS = [
        "migrations/", "schema", "auth", "security",
        "config/production", "Dockerfile", "docker-compose",
        ".env", "credentials", "secrets",
        "__init__.py", "main.py", "app.py",
    ]

    risk_score = 0

    # 文件数量
    if len(files_changed) > 10:
        risk_score += 2
    elif len(files_changed) > 5:
        risk_score += 1

    # 文件类型
    for f in files_changed:
        for pattern in HIGH_RISK_PATTERNS:
            if pattern in f.lower():
                risk_score += 2
                break

    # 涉及目录数量
    dirs = set(os.path.dirname(f) for f in files_changed)
    if len(dirs) > 5:
        risk_score += 1

    if risk_score >= 4:
        return 3  # 高风险
    elif risk_score >= 2:
        return 2  # 中风险
    return 1      # 低风险


def decide_action(risk_level: int) -> str:
    """根据风险等级决定 Agent 的行动范围"""
    actions = {
        1: "auto_fix_and_merge",   # 全自动
        2: "auto_fix_create_pr",   # 自动修复，人工审批
        3: "report_only",          # 只生成报告
    }
    return actions[risk_level]
```

这个设计的哲学是：**自动化程度应该和风险成反比**。风险越低，Agent 的自主权越大；风险越高，人类的参与度越高。这不是对 Agent 的不信任——而是因为高风险操作的错误成本太高，需要人类的判断力作为最后一道防线。

---

## 小结

本文讲了 Loop Engineering 中两个让 Agent 从"单次工具"变成"持续系统"的关键机制：

**Sub-agents** 解决"谁做什么"：
- Creator-Reviewer 模式防止自评偏差
- Specialist Team 模式按领域隔离
- Pipeline Chain 模式按流程串行
- 核心原则是**不信任、限权限、结构化通信**

**Automation** 解决"什么时候做"：
- Cron 定时适合可预测的周期任务
- 事件驱动适合实时响应
- 条件触发适合状态监控
- 手动触发适合高风险操作
- 生产系统通常混合使用四种模式

**成本控制**和**人类兜底**是自动化的安全网：
- Token 预算、模型分级、早停机制控制成本
- 三级信任模型让自动化程度与风险匹配

下一篇，我们将把前 5 篇的所有组件——AGENTS.md、Skills、Memory、Worktrees、Sub-agents——组装成一个完整的、可运行的 Loop 系统。从"理论"到"跑起来"，只差最后一篇。

---

> **参考资源**
> - Addy Osmani, [Loop Engineering](https://addyosmani.com/blog/loop-engineering/)
> - Anthropic, [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
> - Martin Fowler, [Harness Engineering](https://martinfowler.com/articles/harness-engineering.html)
