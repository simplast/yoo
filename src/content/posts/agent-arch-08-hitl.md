---
title: 'Human-in-the-Loop：让 Agent 在关键时刻请示你'
description: 'Agent 不应该在所有情况下都自主行动。本文讲解如何在 Agent 工作流中设置"检查点"，让人类在关键决策点介入审批、修改或拒绝 Agent 的动作。'
pubDate: 2026-06-19
category: 'AI 工程'
tags: ['Human-in-the-Loop', 'HITL', 'interrupt', 'LangGraph', 'Agent']
draft: false
---

## 为什么 Agent 需要"请示领导"

在第 7 篇中，我们让 Agent 拥有了状态持久化能力——它可以跨多轮对话记住自己的工作进展。但有一个问题我们刻意回避了：**Agent 真的应该在所有情况下都自主行动吗？**

考虑几个真实场景：

- Agent 准备把一篇营销邮件发送给 10 万个客户——发出去就收不回来了
- Agent 要执行一条 `DROP TABLE` 语句来清理数据库——万一删错了呢
- Agent 起草了一份合同条款——法律合规性人能放心让 AI 自己拍板吗

这些场景的共同特点：**操作不可逆，或者后果很严重**。在这些节点上，我们需要一个机制让 Agent 暂停执行，把决策权交给人类，等人类审批后再继续。

这就是 **Human-in-the-Loop（HITL）** 模式——不是不信任 Agent，而是在关键节点设置安全检查。就像公司的审批流程一样：你可以自主完成日常工作，但重大决策需要签字确认。

## 三种 HITL 模式

在实际项目中，人类介入的方式不止一种。根据介入目的不同，我将其归纳为三种模式：

### 审批门（Approval Gate）

Agent 生成方案后暂停，等待人类做出二元决策：**通过（approve）** 或 **拒绝（reject）**。

典型场景：
- 发布内容前的最终审核
- 执行高风险操作前的授权
- 资金转账的审批确认

```
Agent 工作流: [生成方案] → ⏸️ 等待审批 → [人类: approve/reject] → [执行/终止]
```

### 纠错门（Correction Gate）

Agent 输出结果后暂停，人类不仅可以 approve/reject，还可以 **直接修改内容**。修改后的内容会作为 Agent 后续执行的依据。

典型场景：
- 文案撰写后的人工润色
- 代码生成后的 review 与修正
- 报告生成后的数据校验

```
Agent 工作流: [生成内容] → ⏸️ 等待审阅 → [人类: 修改/通过] → [基于修改后内容继续]
```

### 确认门（Confirmation Gate）

Agent 在执行高风险操作前，主动向人类展示即将执行的操作详情，要求 **明确确认**。与审批门的区别在于：确认门更侧重于"你确定要这么做吗？"的安全确认，而非内容审批。

典型场景：
- 删除资源前的二次确认
- 批量操作前的范围确认
- 不可逆操作的风险告知

```
Agent 工作流: [准备操作] → ⏸️ 展示操作详情 → [人类: 确认/取消] → [执行/中止]
```

> **选择原则**：如果内容可能被修改，用纠错门；如果只需要是/否判断，用审批门；如果是安全防护，用确认门。三者也可以组合使用。

## interrupt() 机制详解

LangGraph 提供了一个优雅的 HITL 实现机制：**`interrupt()` 函数**。它的核心思想非常简单——在 graph 的任何节点中调用 `interrupt()`，graph 就会暂停执行，等待外部通过 `Command({ resume })` 注入人类的决策后继续。

### 基本工作原理

```
graph 执行 → 某节点调用 interrupt(value) → graph 暂停，状态自动保存
                                                    ↓
外部调用 Command({ resume: humanDecision }) → graph 从暂停处恢复
                                                    ↓
interrupt() 的返回值 = humanDecision → 节点继续执行
```

关键点在于：`interrupt()` 既是一个 **暂停信号**（告诉 graph "停在这里"），又是一个 **数据接口**（恢复时接收人类的输入）。

### 最小示例

```typescript
import { interrupt } from "@langchain/langgraph";

function approvalNode(state: { draft: string }) {
  console.log("📝 草稿内容：", state.draft);

  // interrupt 暂停 graph，value 是展示给人类的信息
  // 返回值是恢复时人类传入的数据
  const humanResponse = interrupt({
    question: "这份草稿可以发布吗？",
    content: state.draft,
    options: ["approve", "reject", "revise"],
  });

  // humanResponse 就是 Command({ resume: ... }) 传入的值
  return {
    approved: humanResponse.approved,
    feedback: humanResponse.feedback ?? null,
  };
}
```

当这个节点执行到 `interrupt()` 时，graph 会暂停并将 `{ question, content, options }` 作为中断值返回给调用者。调用者拿到这个值后，展示给人类，收集反馈，然后通过 `Command({ resume })` 恢复执行。

### 恢复执行的 Command API

```typescript
import { Command } from "@langchain/langgraph";

// 方式 1：直接 resume，传入 interrupt() 的返回值
await graph.invoke(
  new Command({ resume: { approved: true, feedback: "看起来不错" } }),
  config
);

// 方式 2：如果 graph 有多个 interrupt 点，可以指定恢复哪个
// LangGraph 会按 interrupt 的顺序依次恢复
```

### interrupt 的底层原理

理解底层原理有助于你排查问题：

1. **状态快照**：调用 `interrupt()` 时，LangGraph 会将当前 graph 的完整状态序列化并保存（这就是第 7 篇讲的状态持久化在发挥作用）
2. **暂停语义**：`interrupt()` 之后的代码不会执行，graph 的 `invoke()` 调用会返回，返回值中包含 `__interrupt__` 字段
3. **恢复语义**：`Command({ resume })` 触发时，LangGraph 反序列化状态快照，将 resume 的值作为 `interrupt()` 的返回值，然后继续执行当前节点的剩余代码
4. **幂等性**：同一个 interrupt 只能被 resume 一次，多次 resume 会报错

```typescript
// invoke 的返回值中包含 interrupt 信息
const result = await graph.invoke(input, config);
console.log(result.__interrupt__);
// [{ value: { question: "...", content: "..." }, id: "xxx-xxx" }]
```

## 实操：构建一个文档审批 Agent

理论讲完了，让我们动手构建一个完整的文档审批 Agent。这个 Agent 的工作流如下：

```
[接收主题] → [生成草稿] → ⏸️ 审批门 → [approved?]
                                          ├─ Yes → [发布文档]
                                          └─ No  → [根据反馈修改] → ⏸️ 再次审批 → ...
```

### 第一步：定义状态和工具

```typescript
import { Annotation, StateGraph, END, interrupt, Command } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

// 定义 graph 的状态结构
const DocState = Annotation.Root({
  topic: Annotation<string>({ reducer: (_, b) => b }),
  draft: Annotation<string>({ reducer: (_, b) => b }),
  approved: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  feedback: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  revisionCount: Annotation<number>({
    reducer: (_, b) => b,
    default: () => 0,
  }),
  published: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
});

const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0.7 });
```

### 第二步：实现各节点

```typescript
// 节点 1：生成草稿
async function generateDraft(state: typeof DocState.State) {
  console.log(`\n🤖 正在为「${state.topic}」生成草稿...`);

  const response = await model.invoke([
    {
      role: "system",
      content:
        "你是一位专业的技术博客作者。根据给定主题撰写一篇简洁的博客草稿，200 字以内。",
    },
    { role: "user", content: `主题：${state.topic}` },
  ]);

  const draft = response.content as string;
  console.log("📝 草稿生成完毕");
  return { draft };
}

// 节点 2：审批门（interrupt 暂停点）
function waitForApproval(state: typeof DocState.State) {
  console.log(`\n⏸️  等待审批（第 ${state.revisionCount + 1} 版）...`);

  const humanResponse = interrupt({
    type: "approval_gate",
    question: "请审阅以下草稿，选择操作：",
    options: ["approve - 批准发布", "reject - 打回修改", "quit - 放弃"],
    content: state.draft,
    revisionCount: state.revisionCount,
  });

  return {
    approved: humanResponse.action === "approve",
    feedback: humanResponse.feedback ?? null,
    revisionCount: state.revisionCount + 1,
  };
}

// 节点 3：根据反馈修改草稿
async function reviseDraft(state: typeof DocState.State) {
  console.log(`\n🔧 正在根据反馈修改草稿...`);

  const response = await model.invoke([
    {
      role: "system",
      content: "你是一位技术博客作者。根据审稿反馈修改草稿，保持简洁。直接输出修改后的全文。",
    },
    { role: "user", content: `原始草稿：\n${state.draft}` },
    { role: "user", content: `审稿反馈：${state.feedback}` },
  ]);

  return { draft: response.content as string };
}

// 节点 4：发布文档
function publishDoc(state: typeof DocState.State) {
  console.log("\n🚀 文档已发布！");
  console.log(`最终版本：\n${state.draft}`);
  return { published: true };
}
```

### 第三步：构建 Graph 并定义路由

```typescript
// 路由函数：根据审批结果决定下一步
function routeAfterApproval(state: typeof DocState.State) {
  if (state.approved) {
    return "publish";
  }
  if (state.revisionCount >= 3) {
    console.log("\n⚠️ 已修改 3 次仍未通过，自动终止。");
    return END;
  }
  return "revise";
}

// 构建 graph
const workflow = new StateGraph(DocState)
  .addNode("generate", generateDraft)
  .addNode("review", waitForApproval)
  .addNode("revise", reviseDraft)
  .addNode("publish", publishDoc)
  .addEdge("__start__", "generate")
  .addEdge("generate", "review")
  .addConditionalEdges("review", routeAfterApproval, {
    publish: "publish",
    revise: "revise",
    [END]: END,
  })
  .addEdge("revise", "review") // 修改后再次进入审批
  .addEdge("publish", END);

const checkpointer = new MemorySaver();
const graph = workflow.compile({ checkpointer });
```

### 第四步：CLI 模拟交互

这是让整个流程跑起来的关键部分。我们用 Node.js 的 `readline` 模块实现命令行交互：

```typescript
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const rl = readline.createInterface({ input, output });

async function runDocApprovalAgent() {
  const topic = await rl.question("请输入博客主题: ");

  const config = { configurable: { thread_id: `doc-${Date.now()}` } };

  // 第一次 invoke：执行到 interrupt 暂停
  console.log("\n--- 启动文档审批流程 ---");
  let result = await graph.invoke({ topic, draft: "", approved: false }, config);

  // 进入审批循环
  while (result.__interrupt__) {
    const interruptData = result.__interrupt__[0];
    const info = interruptData.value;

    // 展示审批界面
    console.log("\n" + "=".repeat(50));
    console.log("📋 文档审批");
    console.log("=".repeat(50));
    console.log(`版本：第 ${info.revisionCount + 1} 版`);
    console.log(`\n${info.content}`);
    console.log(`\n选项：${info.options.join(" | ")}`);
    console.log("=".repeat(50));

    // 读取用户操作
    const action = await rl.question("\n你的选择 (approve/reject/quit): ");

    if (action === "quit") {
      console.log("已放弃发布。");
      break;
    }

    let feedback: string | undefined;
    if (action === "reject") {
      feedback = await rl.question("请输入修改意见: ");
    }

    // 通过 Command({ resume }) 恢复 graph 执行
    result = await graph.invoke(
      new Command({
        resume: {
          action,
          feedback: feedback ?? null,
        },
      }),
      config
    );
  }

  rl.close();
}

runDocApprovalAgent().catch(console.error);
```

### 运行效果

一次典型的交互过程：

```
请输入博客主题: TypeScript 5.0 的装饰器

--- 启动文档审批流程 ---

🤖 正在为「TypeScript 5.0 的装饰器」生成草稿...
📝 草稿生成完毕

==================================================
📋 文档审批
==================================================
版本：第 1 版

TypeScript 5.0 引入了对 ECMAScript 装饰器提案的原生支持...（草稿内容）

选项：approve - 批准发布 | reject - 打回修改 | quit - 放弃
==================================================

你的选择 (approve/reject/quit): reject
请输入修改意见: 加上一个实际的代码示例，读者更容易理解

🔧 正在根据反馈修改草稿...

==================================================
📋 文档审批
==================================================
版本：第 2 版

TypeScript 5.0 引入了对 ECMAScript 装饰器提案的原生支持...
（修改后的草稿，包含了代码示例）

选项：approve - 批准发布 | reject - 打回修改 | quit - 放弃
==================================================

你的选择 (approve/reject/quit): approve

🚀 文档已发布！
```

## Web UI 实现思路

CLI 适合开发调试，但生产环境通常需要 Web UI。下面是一个完整的架构设计。

### 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│  ┌──────────┐  ┌────────────┐  ┌─────────────────┐  │
│  │ 审批队列  │  │  审批详情   │  │ 操作面板         │  │
│  │          │  │            │  │ approve/reject   │  │
│  │          │  │            │  │ + 反馈输入框      │  │
│  └──────────┘  └────────────┘  └─────────────────┘  │
│                      ↕ WebSocket                     │
├─────────────────────────────────────────────────────┤
│                    Backend (Node.js)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Agent Runner  │  │ WS Hub       │  │ Queue Mgr │  │
│  │ (LangGraph)   │→ │ (广播审批请求) │  │ (审批队列) │  │
│  └──────────────┘  └──────────────┘  └───────────┘  │
│         ↕                                            │
│  ┌──────────────┐                                    │
│  │ Checkpointer │  ← 第 7 篇讲的状态持久化            │
│  │ (PostgreSQL)  │                                    │
│  └──────────────┘                                    │
└─────────────────────────────────────────────────────┘
```

### 后端：Agent Runner 与 WebSocket 集成

```typescript
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuid } from "uuid";

const wss = new WebSocketServer({ port: 8080 });
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));

  // 接收前端的审批操作
  ws.on("message", async (data) => {
    const { threadId, action, feedback } = JSON.parse(data.toString());
    await handleApproval(threadId, action, feedback);
  });
});

// 广播审批请求给所有连接的客户端
function broadcastApproval(threadId: string, interruptData: any) {
  const message = JSON.stringify({
    type: "approval_request",
    threadId,
    ...interruptData,
    timestamp: new Date().toISOString(),
  });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// 处理审批操作
async function handleApproval(
  threadId: string,
  action: string,
  feedback?: string
) {
  const config = { configurable: { thread_id: threadId } };

  const result = await graph.invoke(
    new Command({
      resume: { action, feedback: feedback ?? null },
    }),
    config
  );

  // 如果恢复后又遇到了新的 interrupt，再次广播
  if (result.__interrupt__) {
    broadcastApproval(threadId, result.__interrupt__[0].value);
  } else {
    // 流程结束，通知前端
    const message = JSON.stringify({
      type: "workflow_complete",
      threadId,
      published: result.published,
    });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}

// Agent 执行入口
async function startAgent(topic: string) {
  const threadId = `doc-${uuid()}`;
  const config = { configurable: { thread_id: threadId } };

  const result = await graph.invoke({ topic, draft: "", approved: false }, config);

  if (result.__interrupt__) {
    broadcastApproval(threadId, result.__interrupt__[0].value);
  }

  return threadId;
}
```

### 前端：React 审批组件（关键逻辑）

```typescript
// useApprovalSocket.ts — 自定义 Hook 管理 WebSocket 连接
import { useState, useEffect, useCallback } from "react";

interface ApprovalRequest {
  threadId: string;
  type: string;
  question: string;
  content: string;
  options: string[];
  revisionCount: number;
  timestamp: string;
}

export function useApprovalSocket(url: string) {
  const [queue, setQueue] = useState<ApprovalRequest[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(url);
    setWs(socket);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "approval_request") {
        setQueue((prev) => [...prev, data]);
      }
      if (data.type === "workflow_complete") {
        setQueue((prev) => prev.filter((item) => item.threadId !== data.threadId));
      }
    };

    return () => socket.close();
  }, [url]);

  const approve = useCallback(
    (threadId: string) => {
      ws?.send(JSON.stringify({ threadId, action: "approve" }));
    },
    [ws]
  );

  const reject = useCallback(
    (threadId: string, feedback: string) => {
      ws?.send(JSON.stringify({ threadId, action: "reject", feedback }));
    },
    [ws]
  );

  return { queue, approve, reject };
}
```

### API 设计总结

| 端点 | 方法 | 说明 |
|------|------|------|
| `POST /api/agent/start` | POST | 启动一个新的 Agent 任务，返回 threadId |
| `GET /api/agent/:threadId/status` | GET | 查询某个 Agent 的当前状态（运行中 / 等待审批 / 已完成） |
| `WS /ws` | WebSocket | 实时推送审批请求，接收审批操作 |
| `GET /api/agent/:threadId/history` | GET | 获取审批历史记录 |

## 生产环境的最佳实践

上面的示例演示了核心机制，但生产环境还需要考虑以下几个方面。

### 超时处理

人类可能忘记审批，或者审批人下班了。你需要一个超时机制：

```typescript
// 带超时的 interrupt 封装
function interruptWithTimeout(
  value: any,
  timeoutMs: number = 30 * 60 * 1000, // 默认 30 分钟
  defaultAction: "approve" | "reject" | "escalate" = "escalate"
) {
  const timeoutAt = Date.now() + timeoutMs;

  const humanResponse = interrupt({
    ...value,
    timeoutAt,
    defaultAction,
  });

  // 恢复后检查是否超时
  // 实际实现中，可以由外部定时器触发一个 resume({ action: defaultAction })
  return humanResponse;
}

// 外部超时守卫（在 Agent Runner 中）
function startTimeoutGuard(threadId: string, timeoutMs: number) {
  return setTimeout(async () => {
    const config = { configurable: { thread_id: threadId } };
    console.log(`⏰ 审批超时，自动升级处理: ${threadId}`);

    // 超时后可以选择：
    // 1. 自动 approve（不推荐，失去了 HITL 的意义）
    // 2. 自动 reject
    // 3. escalate：通知更高级别的审批人
    await graph.invoke(
      new Command({
        resume: { action: "escalate", reason: "审批超时" },
      }),
      config
    );
  }, timeoutMs);
}
```

### 审批队列

当多个 Agent 同时等待审批时，需要一个集中管理的审批队列：

```typescript
interface ApprovalItem {
  threadId: string;
  interruptId: string;
  type: "approval_gate" | "correction_gate" | "confirmation_gate";
  content: any;
  priority: number; // 优先级
  createdAt: Date;
  timeoutAt: Date;
  assignee?: string; // 指定审批人
}

class ApprovalQueue {
  private queue: ApprovalItem[] = [];

  enqueue(item: ApprovalItem) {
    this.queue.push(item);
    // 按优先级排序（高优先级在前），同优先级按创建时间排序
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    this.notifySubscribers();
  }

  dequeue(assignee: string): ApprovalItem | undefined {
    // 优先返回分配给该审批人的，否则返回队列头部
    const assigned = this.queue.find((item) => item.assignee === assignee);
    if (assigned) return assigned;
    return this.queue.find((item) => !item.assignee);
  }

  remove(threadId: string) {
    this.queue = this.queue.filter((item) => item.threadId !== threadId);
    this.notifySubscribers();
  }

  // 获取即将超时的审批项
  getUrgent(): ApprovalItem[] {
    const now = Date.now();
    const threshold = 5 * 60 * 1000; // 5 分钟内超时视为紧急
    return this.queue.filter(
      (item) => item.timeoutAt.getTime() - now < threshold
    );
  }

  private notifySubscribers() {
    // 通过 WebSocket 推送队列变更
  }
}
```

### 审批历史

每次人类决策都应该被记录，用于审计和回溯：

```typescript
interface ApprovalRecord {
  id: string;
  threadId: string;
  interruptId: string;
  gateType: string;
  content: string;       // Agent 提交的内容快照
  action: string;        // 人类的决策
  feedback?: string;     // 人类的反馈
  decidedBy: string;     // 审批人
  decidedAt: Date;
  revisionNumber: number;
}

class ApprovalHistory {
  private records: ApprovalRecord[] = [];

  // 也可以存到数据库
  async log(record: ApprovalRecord) {
    this.records.push(record);
    // await db.insert("approval_history", record);
  }

  getByThread(threadId: string): ApprovalRecord[] {
    return this.records.filter((r) => r.threadId === threadId);
  }

  getByUser(userId: string): ApprovalRecord[] {
    return this.records.filter((r) => r.decidedBy === userId);
  }

  // 生成审批统计报告
  summary() {
    const total = this.records.length;
    const approved = this.records.filter((r) => r.action === "approve").length;
    const rejected = this.records.filter((r) => r.action === "reject").length;
    const avgResponseTime = this.calculateAvgResponseTime();

    return { total, approved, rejected, avgResponseTime };
  }
}
```

## 何时该设置 HITL 检查点

不是所有节点都需要人类介入。过度使用 HITL 会让 Agent 变得毫无意义——你只是在给一个自动化工具加手动审批。

**需要 HITL 的场景**：

| 特征 | 示例 |
|------|------|
| 操作不可逆 | 发送邮件、删除数据、发布内容 |
| 影响范围大 | 批量操作、公开操作、涉及资金 |
| 需要领域专业知识 | 法律条款审核、医学内容审核 |
| 合规要求 | 金融交易审批、数据隐私合规 |
| Agent 信心不足 | 让 Agent 自我评估，信心低时主动上报 |

**不需要 HITL 的场景**：

| 特征 | 示例 |
|------|------|
| 操作完全可逆 | 写入临时文件、生成中间结果 |
| 影响范围小 | 读取数据、生成报告草稿 |
| 有自动化校验 | 格式验证、单元测试通过 |
| 高频低价值 | 每条日志都审批就没意义了 |

一个实用的经验法则：**如果你的 Agent 犯了错，你需要多长时间来修复？** 如果修复成本远高于等待审批的成本，那就加一个 HITL 检查点。

## 小结

本文介绍了在 Agent 工作流中引入 Human-in-the-Loop 的完整方案：

1. **三种 HITL 模式**：审批门（二元决策）、纠错门（可修改内容）、确认门（安全确认）
2. **核心机制**：LangGraph 的 `interrupt()` 暂停 graph 并等待，`Command({ resume })` 注入人类决策并恢复执行
3. **实操项目**：一个完整的文档审批 Agent，包含 CLI 和 Web UI 两种交互方式
4. **生产实践**：超时处理、审批队列、审批历史——这些是把 HITL 从 demo 带到生产的关键

HITL 不是对 Agent 的不信任，而是对 **风险的管理**。一个好的 Agent 系统知道什么时候该自主行动，什么时候该请示人类。这种判断力本身就是 Agent 架构设计的一部分。

---

**下一篇预告**：到目前为止，我们构建的都是单个 Agent。但现实中的复杂任务往往需要多个 Agent 协同工作——一个负责调研，一个负责撰写，一个负责审核。第 9 篇《多 Agent 编排：让多个 Agent 协同完成复杂任务》将探讨如何设计 Agent 之间的协作模式、通信机制和任务分配策略。
