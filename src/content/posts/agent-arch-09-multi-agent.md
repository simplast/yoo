---
title: '多 Agent 编排：Supervisor、Worker 与协作模式'
description: '当一个 Agent 无法胜任所有工作时，你需要多个 Agent 协作。本文讲解 Supervisor-Worker、Handoff、Pipeline 三种编排模式，并用 LangGraph 实现并行执行。'
pubDate: 2026-06-19
category: 'AI 工程'
tags: ['Multi-Agent', 'Supervisor', 'Handoff', 'LangGraph', '编排']
draft: false
---

前八篇文章中，我们构建了一个完整的单 Agent 系统：从核心循环、工具系统、上下文管理、安全权限到 Human-in-the-Loop。但现实中，很多任务不是一个 Agent 能独立完成的——你需要一个 Agent 去搜索网络，另一个分析代码，第三个撰写报告。

这篇文章进入多 Agent 编排的世界：什么时候需要拆分、怎么拆分、拆分后如何协调。

## 为什么需要多个 Agent

一个常见的疑问是：既然 LLM 本身就很通用，为什么不把所有工具都塞给一个 Agent，让它自己决定调用哪个？

三个理由：

**1. 能力边界（Context Overload）**

单 Agent 的上下文窗口是有限的。当你给它注册 30 个工具、5 种人格、10 套 Prompt 时，模型的注意力会被稀释。实践中，工具数量超过 15-20 个后，模型选择工具的准确率会明显下降。把不同职责拆给不同的 Worker，每个 Worker 只需要关注自己的 3-5 个工具，效果更好。

**2. 并行加速（Parallel Execution）**

一个调研任务需要同时搜索网络、分析代码、查阅数据库。串行执行需要 3 倍时间，并行执行只需要 1 倍。多 Agent 天然是并行的。

**3. 职责分离（Separation of Concerns）**

不同 Worker 可以用不同的模型（大模型做决策，小模型做执行）、不同的权限级别（只有特定 Worker 能写数据库）、不同的温度参数（创意 Worker 用高温，分析 Worker 用低温）。这种异构配置在单 Agent 中很难实现。

Anthropic 在 [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) 中特别强调：

> 多 Agent 系统增加了复杂度和不透明性。只在真正需要时才引入。如果你的单 Agent 已经够用，不要为了"架构优美"而拆分。

## 三种编排模式

在动手写代码之前，先搞清楚三种主流编排模式的区别。

### 模式对比

| 模式 | 结构 | 适用场景 | 复杂度 | 典型例子 |
|------|------|---------|--------|---------|
| Supervisor-Worker | 中央调度 | 任务分发 + 汇总 | 中 | 调研团队、代码审查 |
| Handoff | Agent 链式交接 | 客服转接、流程传递 | 低 | 客服系统、审批流 |
| Pipeline | 固定流水线 | ETL、数据处理 | 低 | 数据清洗管道 |

### Supervisor-Worker：中央调度

Supervisor 是一个"大脑"节点。它分析任务、拆分需求、分发给专业 Worker、收集结果、综合输出。Worker 之间没有直接通信，所有协调都通过 Supervisor 进行。

```
                ┌──────────────┐
                │  Supervisor  │
                └──────┬───────┘
                       │ 分发任务
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ Worker A │  │ Worker B │  │ Worker C │
   │ 网络搜索  │  │ 代码分析  │  │ 数据分析  │
   └──────────┘  └──────────┘  └──────────┘
         │             │             │
         └─────────────┼─────────────┘
                       ▼
                ┌──────────────┐
                │    Writer    │
                └──────────────┘
```

**优势**：Supervisor 拥有全局视图，可以动态调整任务分配。Worker 之间无耦合，可以并行执行。

**劣势**：Supervisor 是单点，如果它的决策能力不足（比如分发逻辑写死），整个系统就退化成串行流水线。

### Handoff：链式交接

Agent 之间直接交接控制权，没有中央调度者。每个 Agent 决定自己完成任务后，把对话上下文"扔"给下一个 Agent。

```
用户 ──→ Triage Agent ──→ Technical Agent ──→ Senior Agent
              │                  │
              │    handoff       │   handoff
              └──────────────────┘
```

**优势**：简单直接，每个 Agent 只需知道自己能做什么、什么时候该交出去。OpenAI Agents SDK 原生支持这种模式。

**劣势**：没有全局协调者，复杂任务需要多轮交接时容易丢失上下文。

### Pipeline：固定流水线

每个阶段处理固定的一步，输出直接流入下一阶段。没有动态调度，流程在编译时就已经确定。

```
Raw Data ──→ Extract ──→ Transform ──→ Load ──→ Report
```

**优势**：可预测、易调试、每步可独立测试。

**劣势**：不灵活。如果任务结构变化，Pipeline 需要重新设计。

选择建议：如果你的任务需要动态决策（比如"根据搜索结果决定是否需要补充调研"），用 Supervisor-Worker。如果任务是固定的流程传递（比如客服分流），用 Handoff。如果任务是确定性的数据处理，用 Pipeline。

## Supervisor-Worker 实操

这是最通用、也最复杂的模式。我们用 LangGraph（TypeScript）实现一个完整的 Supervisor-Worker 系统，包含并行执行。

### 整体架构

我们要构建一个"技术调研团队"：

- **Supervisor**：分析调研需求，拆分子任务，分发给 Worker
- **WebResearcher**：搜索网络获取信息
- **CodeAnalyst**：分析代码仓库
- **Writer**：汇总所有 Worker 的产出，生成最终报告

### 状态定义

多 Agent 系统的 state 比单 Agent 复杂，因为需要承载多个 Worker 的并行输出。

```typescript
import { StateGraph, END, Send } from "@langchain/langgraph";

// Worker 产出的单条结果
interface WorkerResult {
  worker: string;       // Worker 名称
  task: string;         // 被分配的子任务
  content: string;      // 产出内容
  confidence: number;   // 0-1 的置信度
}

// Supervisor 拆分的子任务
interface SubTask {
  id: string;
  worker: string;       // 分配给哪个 Worker
  description: string;  // 任务描述
}

// 全局 State
interface ResearchState {
  query: string;                    // 原始调研问题
  subtasks: SubTask[];              // Supervisor 拆分的子任务
  workerResults: WorkerResult[];    // Worker 们的产出（Reducer 合并）
  report: string;                   // 最终报告
  currentPhase: string;             // 当前阶段
}
```

### Reducer：多个 Worker 的结果如何合并

这是多 Agent 系统最关键的设计之一。当多个 Worker 并行执行、同时返回结果时，如何把它们合并到同一个 state 字段？

LangGraph 的 Reducer 机制就是为了解决这个问题。它类似 Redux 的 reducer 概念——每个 Worker 产出一个 `WorkerResult`，reducer 负责把它追加到数组中：

```typescript
// Reducer 函数：把新的 WorkerResult 追加到已有数组
function workerResultsReducer(
  existing: WorkerResult[],
  update: WorkerResult[]
): WorkerResult[] {
  return [...existing, ...update];
}
```

在创建 StateGraph 时，你需要把 reducer 注册到对应的 channel：

```typescript
const graph = new StateGraph<ResearchState>({
  channels: {
    query: { value: null },
    subtasks: { value: null },
    // 关键：workerResults 使用 reducer 合并
    workerResults: {
      value: workerResultsReducer,
      default: () => [],
    },
    report: { value: null },
    currentPhase: { value: null },
  },
});
```

如果不指定 reducer，后写入的值会覆盖先写入的值——这在并行 Worker 场景下会导致数据丢失。

### Worker 节点实现

每个 Worker 是一个独立节点，接收子任务、执行工作、返回结果。

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// WebResearcher Worker
async function webResearcherNode(
  state: ResearchState & { sendTask: SubTask }
): Promise<Partial<ResearchState>> {
  const task = state.sendTask;
  
  const model = new ChatOpenAI({
    model: "gpt-4o-mini",  // Worker 用小模型，省成本
    temperature: 0.3,
  });

  const response = await model.invoke([
    new SystemMessage(`你是一个网络调研专家。针对给定的子任务，搜索并整理相关信息。
输出格式：结构化的调研摘要，包含关键发现和来源。`),
    new HumanMessage(`调研任务：${task.description}\n\n整体调研主题：${state.query}`),
  ]);

  return {
    workerResults: [{
      worker: "WebResearcher",
      task: task.description,
      content: response.content as string,
      confidence: 0.8,
    }],
  };
}

// CodeAnalyst Worker
async function codeAnalystNode(
  state: ResearchState & { sendTask: SubTask }
): Promise<Partial<ResearchState>> {
  const task = state.sendTask;
  
  const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0.1,  // 代码分析需要更确定性的输出
  });

  const response = await model.invoke([
    new SystemMessage(`你是一个代码分析专家。分析给定项目的代码架构、设计模式和技术实现。
输出格式：代码结构分析，包含关键模块、依赖关系和设计决策。`),
    new HumanMessage(`分析任务：${task.description}\n\n整体调研主题：${state.query}`),
  ]);

  return {
    workerResults: [{
      worker: "CodeAnalyst",
      task: task.description,
      content: response.content as string,
      confidence: 0.85,
    }],
  };
}
```

### Supervisor 节点：任务分析与分发

Supervisor 是整个系统的核心。它用大模型分析调研需求，决定需要哪些 Worker、每个 Worker 做什么。

```typescript
async function supervisorNode(
  state: ResearchState
): Promise<Partial<ResearchState>> {
  const model = new ChatOpenAI({
    model: "gpt-4o",  // Supervisor 用大模型做决策
    temperature: 0.2,
  });

  const response = await model.invoke([
    new SystemMessage(`你是一个技术调研团队的 Supervisor。
分析调研需求，将其拆分为子任务并分配给合适的 Worker。

可用 Worker：
- WebResearcher：负责搜索网络信息、查找文档和博客
- CodeAnalyst：负责分析代码仓库、理解技术实现

输出 JSON 数组，每个元素是一个子任务：
[
  {"id": "t1", "worker": "WebResearcher", "description": "搜索 XX 的最新论文"},
  {"id": "t2", "worker": "CodeAnalyst", "description": "分析 XX 仓库的架构"}
]

只输出 JSON，不要其他内容。`),
    new HumanMessage(`调研主题：${state.query}`),
  ]);

  const subtasks: SubTask[] = JSON.parse(response.content as string);

  return {
    subtasks,
    currentPhase: "dispatching",
  };
}
```

### 并行分发：LangGraph Send API

这是实现并行执行的关键。LangGraph 的 `Send` 对象允许一个节点向多个下游节点同时发送消息，每个消息携带不同的数据。

```typescript
// Router 函数：根据 Supervisor 拆分的子任务，生成 Send 对象
function routeToWorkers(state: ResearchState): Send[] {
  return state.subtasks.map((task) => {
    // 根据 Worker 名称决定路由到哪个节点
    const nodeName = task.worker === "WebResearcher"
      ? "web_researcher"
      : "code_analyst";
    
    // Send(nodeName, data) —— data 会被合并到下游节点的 state
    return new Send(nodeName, {
      ...state,
      sendTask: task,  // 把当前子任务注入 state
    });
  });
}
```

`Send` 的工作原理：当 router 返回多个 `Send` 对象时，LangGraph 会自动并行执行它们指向的节点。所有并行节点完成后，它们的输出通过 reducer 合并回全局 state，然后继续执行下一个节点。

### Writer 节点：汇总报告

Writer 在所有 Worker 完成后运行，汇总所有结果。

```typescript
async function writerNode(
  state: ResearchState
): Promise<Partial<ResearchState>> {
  const model = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0.4,
  });

  // 把所有 Worker 的结果拼接成上下文
  const workerContext = state.workerResults
    .map((r) => `### ${r.worker}（置信度: ${r.confidence}）\n任务：${r.task}\n${r.content}`)
    .join("\n\n---\n\n");

  const response = await model.invoke([
    new SystemMessage(`你是一个技术报告撰写专家。
根据多位调研员的工作结果，撰写一份结构化的技术调研报告。

要求：
1. 综合所有调研结果，提取核心发现
2. 如果不同调研员给出矛盾结论，分析原因并给出你的判断
3. 标注各部分的置信度来源
4. 输出 Markdown 格式`),
    new HumanMessage(`调研主题：${state.query}\n\n各调研员结果：\n${workerContext}`),
  ]);

  return {
    report: response.content as string,
    currentPhase: "completed",
  };
}
```

### 组装 StateGraph

现在把所有节点和边组装起来：

```typescript
const researchGraph = new StateGraph<ResearchState>({
  channels: {
    query: { value: null },
    subtasks: { value: null },
    workerResults: {
      value: workerResultsReducer,
      default: () => [],
    },
    report: { value: null },
    currentPhase: { value: null },
  },
});

// 添加节点
researchGraph.addNode("supervisor", supervisorNode);
researchGraph.addNode("web_researcher", webResearcherNode);
researchGraph.addNode("code_analyst", codeAnalystNode);
researchGraph.addNode("writer", writerNode);

// 添加边
researchGraph.setEntryPoint("supervisor");

// Supervisor → Router → Workers（并行）
researchGraph.addConditionalEdges("supervisor", routeToWorkers);

// 所有 Worker → Writer
researchGraph.addEdge("web_researcher", "writer");
researchGraph.addEdge("code_analyst", "writer");

// Writer → END
researchGraph.addEdge("writer", END);

// 编译
const app = researchGraph.compile();
```

执行图的流程：

```
START → supervisor → routeToWorkers
                       ├─ Send("web_researcher", task1) ─┐
                       ├─ Send("code_analyst", task2)     ├─→ writer → END
                       └─ Send("web_researcher", task3) ─┘
```

### 运行与并行验证

```typescript
async function runResearch() {
  const startTime = Date.now();

  const result = await app.invoke({
    query: "调研 LangGraph 的 Multi-Agent 架构设计，对比 CrewAI 和 AutoGen",
    subtasks: [],
    workerResults: [],
    report: "",
    currentPhase: "init",
  });

  const elapsed = Date.now() - startTime;
  console.log(`总耗时: ${elapsed}ms`);
  console.log(`Worker 数量: ${result.workerResults.length}`);
  console.log(`\n=== 最终报告 ===\n${result.report}`);
}

runResearch();
```

### 并行 vs 串行：耗时对比

为了验证并行的加速效果，我们可以对比两种执行模式：

```typescript
// 串行版本：不使用 Send，逐个执行 Worker
async function runSerialResearch(query: string) {
  const startTime = Date.now();
  const results: WorkerResult[] = [];

  // 模拟 3 个子任务
  const subtasks: SubTask[] = [
    { id: "t1", worker: "WebResearcher", description: "搜索 LangGraph 文档" },
    { id: "t2", worker: "CodeAnalyst", description: "分析 LangGraph 仓库" },
    { id: "t3", worker: "WebResearcher", description: "搜索 CrewAI 对比" },
  ];

  for (const task of subtasks) {
    const state = { query, sendTask: task } as any;
    if (task.worker === "WebResearcher") {
      const r = await webResearcherNode(state);
      results.push(...(r.workerResults ?? []));
    } else {
      const r = await codeAnalystNode(state);
      results.push(...(r.workerResults ?? []));
    }
  }

  const elapsed = Date.now() - startTime;
  return { results, elapsed };
}

// 对比测试
async function benchmark() {
  const query = "调研 LangGraph Multi-Agent";

  const parallelStart = Date.now();
  await app.invoke({
    query, subtasks: [], workerResults: [], report: "", currentPhase: "init",
  });
  const parallelElapsed = Date.now() - parallelStart;

  const { elapsed: serialElapsed } = await runSerialResearch(query);

  console.log(`并行耗时: ${parallelElapsed}ms`);
  console.log(`串行耗时: ${serialElapsed}ms`);
  console.log(`加速比: ${(serialElapsed / parallelElapsed).toFixed(2)}x`);
}
```

在典型场景下（3 个 Worker、每个耗时 3-5 秒），并行模式的加速比通常在 **2.0x - 2.8x** 之间。达不到理论上的 3x，是因为 Supervisor 分析、Writer 汇总、以及 LangGraph 的调度开销占了部分时间。

## Handoff 模式实操

Handoff 模式的典型实现来自 OpenAI Agents SDK。它的核心思想很简单：一个 Agent 可以声明"我搞不定这件事，交给别人来"，然后把整个对话上下文转给另一个 Agent。

### Python 实现（OpenAI Agents SDK）

```python
from agents import Agent, Runner, handoff

# 专业 Agent 定义
technical_agent = Agent(
    name="Technical Specialist",
    instructions="""你是一个技术专家。处理技术类问题，包括代码调试、架构设计、
性能优化等。如果问题不是技术类的，说明这不在你的专业范围内。""",
    model="gpt-4o",
)

sales_agent = Agent(
    name="Sales Specialist",
    instructions="""你是一个销售顾问。处理产品咨询、价格报价、合同条款等问题。
如果问题不是销售相关的，说明这不在你的专业范围内。""",
    model="gpt-4o-mini",  # 销售对话用小模型就够了
)

billing_agent = Agent(
    name="Billing Specialist",
    instructions="""你是一个账单专家。处理账单查询、退款申请、发票问题等。""",
    model="gpt-4o-mini",
)

# Triage Agent：分流入口
triage_agent = Agent(
    name="Triage",
    instructions="""你是一个客服分流员。分析用户的问题类型，然后转接给合适的专业 Agent。

转接规则：
- 技术问题（代码、架构、Bug） → Technical Specialist
- 销售问题（价格、产品、合同） → Sales Specialist
- 账单问题（发票、退款、付款） → Billing Specialist

如果无法判断，询问用户更多信息。""",
    model="gpt-4o-mini",
    handoffs=[
        handoff(technical_agent, description="转接给技术专家"),
        handoff(sales_agent, description="转接给销售顾问"),
        handoff(billing_agent, description="转接给账单专家"),
    ],
)

# 运行
async def main():
    result = await Runner.run(
        triage_agent,
        input="我们的 API 返回 500 错误，日志显示 database connection timeout",
    )
    print(f"最终处理 Agent: {result.last_agent.name}")
    print(f"回复: {result.final_output}")

import asyncio
asyncio.run(main())
```

### Handoff 的上下文传递

Handoff 的关键在于上下文如何传递。OpenAI Agents SDK 的做法是：把整个对话历史（包含用户消息和之前 Agent 的回复）原封不动地传给下一个 Agent。

这意味着：

1. **下一个 Agent 能看到完整的对话历史**——包括用户最初说了什么、Triage 做了什么判断
2. **前一个 Agent 的内部推理不会泄露**——只有最终的工具调用结果和回复文本会被传递
3. **Handoff 是单向的**——一旦交出去，前一个 Agent 就不再参与（除非被再次 handoff 回来）

```python
# Handoff 可以链式传递
senior_technical = Agent(
    name="Senior Technical",
    instructions="""你是高级技术专家。处理复杂的技术问题。
如果问题太简单，不需要你介入时，可以转回给 Technical Specialist。""",
    handoffs=[handoff(technical_agent, description="问题不够复杂，转回给普通技术专家")],
)

# 现在 technical_agent 也可以 escalate 到 senior
technical_agent.handoffs.append(
    handoff(senior_technical, description="问题太复杂，转给高级专家")
)
```

### 用 LangGraph 实现 Handoff

如果你不想依赖 OpenAI SDK，也可以用 LangGraph 实现 Handoff。思路是把每个 Agent 做成一个节点，Handoff 就是节点之间的边：

```typescript
import { StateGraph, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

interface HandoffState {
  messages: Array<{ role: string; content: string; agent?: string }>;
  currentAgent: string;
  handoffTarget: string | null;
}

// Triage 节点
async function triageNode(state: HandoffState): Promise<Partial<HandoffState>> {
  const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
  
  const lastMessage = state.messages[state.messages.length - 1];
  
  const response = await model.invoke([
    { role: "system", content: `分析用户消息，判断应该由哪个 Agent 处理。
可选：technical, sales, billing。只回复 Agent 名称。` },
    { role: "user", content: lastMessage.content },
  ]);

  const target = (response.content as string).trim().toLowerCase();

  return {
    currentAgent: "triage",
    handoffTarget: target,
    messages: [
      ...state.messages,
      { role: "assistant", content: `转接给 ${target} 专家`, agent: "triage" },
    ],
  };
}

// Technical Agent 节点
async function technicalNode(state: HandoffState): Promise<Partial<HandoffState>> {
  const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0.3 });
  
  const response = await model.invoke([
    { role: "system", content: "你是技术专家，回答技术问题。" },
    ...state.messages.map((m) => ({ role: m.role, content: m.content })),
  ]);

  return {
    currentAgent: "technical",
    handoffTarget: null,
    messages: [
      ...state.messages,
      { role: "assistant", content: response.content as string, agent: "technical" },
    ],
  };
}

// Router：根据 handoffTarget 决定下一个节点
function handoffRouter(state: HandoffState): string {
  if (!state.handoffTarget) return END;
  
  const routes: Record<string, string> = {
    technical: "technical",
    sales: "sales",
    billing: "billing",
  };
  
  return routes[state.handoffTarget] ?? END;
}

// 组装图
const handoffGraph = new StateGraph<HandoffState>({
  channels: {
    messages: { value: (a: any[], b: any[]) => [...a, ...b], default: () => [] },
    currentAgent: { value: null },
    handoffTarget: { value: null },
  },
});

handoffGraph.addNode("triage", triageNode);
handoffGraph.addNode("technical", technicalNode);

handoffGraph.setEntryPoint("triage");
handoffGraph.addConditionalEdges("triage", handoffRouter);
handoffGraph.addEdge("technical", END);

const handoffApp = handoffGraph.compile();
```

## 共享状态设计

多 Agent 系统中最容易出错的部分就是状态共享。几个关键问题需要明确回答。

### Worker 的输出如何合并到 Supervisor 的 state

前面已经展示了 reducer 的基本用法。更完整的模式是这样的：

```typescript
// 每个 Worker 的输出结构
interface WorkerOutput {
  worker: string;
  taskId: string;
  content: string;
  confidence: number;
  metadata: Record<string, unknown>;  // Worker 特有的附加信息
}

// 全局 state 中的 Worker 结果通道
interface SharedState {
  // ... 其他字段
  workerOutputs: WorkerOutput[];  // 使用 reducer 合并
}

// Reducer：追加而非覆盖
function appendOutputs(
  existing: WorkerOutput[],
  incoming: WorkerOutput[]
): WorkerOutput[] {
  return [...existing, ...incoming];
}
```

### 冲突处理：两个 Worker 给出矛盾结论

这是多 Agent 系统的常见场景。WebResearcher 说"这个技术已经过时了"，CodeAnalyst 说"这个技术正在被广泛使用"。

解决方案是在 Writer 节点做冲突检测和仲裁：

```typescript
async function writerWithConflictResolution(
  state: SharedState
): Promise<Partial<SharedState>> {
  const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0.3 });

  // 检测潜在冲突
  const resultsSummary = state.workerOutputs.map((o) => ({
    worker: o.worker,
    confidence: o.confidence,
    summary: o.content.substring(0, 200),  // 取前 200 字做冲突检测
  }));

  const conflictCheck = await model.invoke([
    { role: "system", content: `分析以下调研结果，找出可能的矛盾之处。
输出 JSON：{"hasConflict": boolean, "conflicts": [{ "parties": [...], "issue": "..." }]}` },
    { role: "user", content: JSON.stringify(resultsSummary) },
  ]);

  const conflicts = JSON.parse(conflictCheck.content as string);

  // 如果有冲突，在最终报告中明确标注
  let conflictNote = "";
  if (conflicts.hasConflict) {
    conflictNote = `\n\n## 矛盾分析\n${
      conflicts.conflicts
        .map((c: any) => `- **${c.issue}**：${c.parties.join(" vs ")} 的结论存在矛盾`)
        .join("\n")
    }\n\n基于置信度加权分析：${
      state.workerOutputs
        .sort((a, b) => b.confidence - a.confidence)[0].worker
    } 的结论置信度更高。`;
  }

  // 生成最终报告（包含冲突分析）
  const response = await model.invoke([
    { role: "system", content: "撰写综合报告，如果存在矛盾结论，需要明确分析。" },
    { role: "user", content: `调研结果：\n${
      state.workerOutputs.map((o) => `[${o.worker}] ${o.content}`).join("\n\n")
    }\n\n冲突分析：${JSON.stringify(conflicts)}` },
  ]);

  return {
    report: (response.content as string) + conflictNote,
  };
}
```

### 状态隔离原则

一个好的实践是：Worker 只读不写全局 state，它们把自己的输出通过 reducer 追加到指定通道。Worker 之间不应该直接读取彼此的中间结果。

```
全局 State
├── query（只读）      ← 所有 Worker 可读
├── subtasks（只读）   ← 所有 Worker 可读
├── workerResults（写）← Worker 通过 reducer 追加
└── report（写）       ← 只有 Writer 写
```

这种单向数据流避免了 Worker 之间的隐式依赖，也让系统更容易调试。

## 多 Agent 的 Middleware

在之前的文章中，我们给单 Agent 实现了 Middleware（MetricsCollector、安全策略等）。多 Agent 系统需要两层 Middleware：Worker 级别的和 Supervisor 级别的。

### Worker 级别的 MetricsCollector

每个 Worker 独立收集自己的运行指标：

```typescript
interface WorkerMetrics {
  workerName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  toolCalls: number;
  success: boolean;
}

function withMetrics(
  workerName: string,
  fn: (state: any) => Promise<Partial<ResearchState>>
) {
  return async (state: any): Promise<Partial<ResearchState>> => {
    const start = Date.now();
    
    try {
      const result = await fn(state);
      const latency = Date.now() - start;
      
      console.log(`[${workerName}] 完成，耗时 ${latency}ms`);
      
      // 可以写入外部监控系统
      // metricsCollector.record({ workerName, latency, success: true });
      
      return result;
    } catch (error) {
      const latency = Date.now() - start;
      console.error(`[${workerName}] 失败，耗时 ${latency}ms`, error);
      
      // 返回一个表示失败的 WorkerResult
      return {
        workerResults: [{
          worker: workerName,
          task: state.sendTask?.description ?? "unknown",
          content: `Worker 执行失败: ${error}`,
          confidence: 0,
        }],
      };
    }
  };
}

// 使用
researchGraph.addNode("web_researcher", withMetrics("WebResearcher", webResearcherNode));
researchGraph.addNode("code_analyst", withMetrics("CodeAnalyst", codeAnalystNode));
```

### Supervisor 级别的全局安全策略

Supervisor 作为全局入口，可以实施所有 Worker 共享的安全策略：

```typescript
function withGlobalSafety(
  fn: (state: ResearchState) => Promise<Partial<ResearchState>>
) {
  return async (state: ResearchState): Promise<Partial<ResearchState>> => {
    // 1. 输入过滤：检查调研主题是否合规
    const forbidden = ["武器制造", "毒品合成", "恶意软件"];
    if (forbidden.some((kw) => state.query.includes(kw))) {
      throw new Error("调研主题包含禁止内容");
    }

    // 2. 执行 Worker
    const result = await fn(state);

    // 3. 输出审核：检查 Worker 结果是否包含敏感信息
    if (result.workerResults) {
      for (const r of result.workerResults) {
        if (r.content.includes("API_KEY") || r.content.includes("password")) {
          r.content = "[REDACTED: 敏感信息已过滤]";
          console.warn(`[${r.worker}] 输出包含敏感信息，已过滤`);
        }
      }
    }

    // 4. 成本限制：检查总 token 使用量
    // const totalTokens = metricsCollector.getTotalTokens();
    // if (totalTokens > MAX_TOKENS) throw new Error("超出 token 预算");

    return result;
  };
}
```

### 成本分摊：大小模型搭配

多 Agent 系统的一个核心优势是：不同的 Worker 可以用不同的模型。

```typescript
// 模型配置策略
const MODEL_CONFIG = {
  // Supervisor 需要强推理能力，用大模型
  supervisor: { model: "gpt-4o", temperature: 0.2 },
  
  // Worker 执行具体任务，小模型够用
  webResearcher: { model: "gpt-4o-mini", temperature: 0.3 },
  codeAnalyst: { model: "gpt-4o-mini", temperature: 0.1 },
  
  // Writer 需要高质量综合，用大模型
  writer: { model: "gpt-4o", temperature: 0.4 },
};

// 成本估算
// gpt-4o:        $2.50 / 1M input, $10.00 / 1M output
// gpt-4o-mini:   $0.15 / 1M input, $0.60 / 1M output
// 
// 如果所有节点都用 gpt-4o：
//   3 Worker × 2K tokens ≈ 6K input + 输出 ≈ $0.05
//
// 大小模型搭配：
//   Supervisor (gpt-4o): 2K tokens ≈ $0.01
//   2 Worker (gpt-4o-mini): 4K tokens ≈ $0.003
//   Writer (gpt-4o): 3K tokens ≈ $0.015
//   总计 ≈ $0.028 —— 节省约 44%
```

这种搭配在生产环境中差异更大。当 Worker 数量多、每个 Worker 的调用频繁时，小模型做执行、大模型做调度可以显著降低成本，同时保持决策质量。

## 实战案例：完整的"技术调研团队"

把前面所有组件组合起来，构建一个完整的、可运行的多 Agent 调研系统。

```typescript
import { StateGraph, END, Send } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// ========== 类型定义 ==========

interface SubTask {
  id: string;
  worker: string;
  description: string;
}

interface WorkerResult {
  worker: string;
  task: string;
  content: string;
  confidence: number;
}

interface ResearchState {
  query: string;
  subtasks: SubTask[];
  workerResults: WorkerResult[];
  report: string;
  currentPhase: string;
  sendTask?: SubTask;  // Send 注入的子任务
}

// ========== Reducer ==========

function workerResultsReducer(
  existing: WorkerResult[],
  update: WorkerResult[]
): WorkerResult[] {
  return [...existing, ...update];
}

// ========== Nodes ==========

async function supervisorNode(state: ResearchState): Promise<Partial<ResearchState>> {
  console.log("[Supervisor] 分析调研需求...");
  
  const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0.2 });
  const response = await model.invoke([
    new SystemMessage(`你是技术调研团队的 Supervisor。分析调研需求并拆分子任务。

可用 Worker：
- WebResearcher：搜索网络信息、文档、博客、论文
- CodeAnalyst：分析代码仓库、技术实现、架构设计

输出 JSON 数组（2-4 个子任务）：
[{"id": "t1", "worker": "WebResearcher", "description": "..."}]
只输出 JSON。`),
    new HumanMessage(state.query),
  ]);

  const subtasks: SubTask[] = JSON.parse(response.content as string);
  console.log(`[Supervisor] 拆分为 ${subtasks.length} 个子任务`);
  subtasks.forEach((t) => console.log(`  → ${t.worker}: ${t.description}`));

  return { subtasks, currentPhase: "dispatching" };
}

async function webResearcherNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const task = state.sendTask!;
  console.log(`[WebResearcher] 执行: ${task.description}`);

  const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.3 });
  const response = await model.invoke([
    new SystemMessage("你是网络调研专家。整理结构化信息，包含关键发现和来源链接。"),
    new HumanMessage(`调研：${task.description}\n主题：${state.query}`),
  ]);

  console.log(`[WebResearcher] 完成（${(response.content as string).length} 字符）`);
  return {
    workerResults: [{
      worker: "WebResearcher",
      task: task.description,
      content: response.content as string,
      confidence: 0.8,
    }],
  };
}

async function codeAnalystNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const task = state.sendTask!;
  console.log(`[CodeAnalyst] 执行: ${task.description}`);

  const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.1 });
  const response = await model.invoke([
    new SystemMessage("你是代码分析专家。分析代码架构、设计模式和关键实现。"),
    new HumanMessage(`分析：${task.description}\n主题：${state.query}`),
  ]);

  console.log(`[CodeAnalyst] 完成（${(response.content as string).length} 字符）`);
  return {
    workerResults: [{
      worker: "CodeAnalyst",
      task: task.description,
      content: response.content as string,
      confidence: 0.85,
    }],
  };
}

async function writerNode(state: ResearchState): Promise<Partial<ResearchState>> {
  console.log("[Writer] 汇总报告...");
  
  const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0.4 });
  
  const sections = state.workerResults
    .map((r) => `### ${r.worker}（${r.task}）\n置信度: ${r.confidence}\n${r.content}`)
    .join("\n\n---\n\n");

  const response = await model.invoke([
    new SystemMessage(`你是技术报告撰写专家。综合多位调研员的输出，生成结构化报告。

要求：
1. 提取核心发现，去除重复
2. 矛盾之处需要分析并给出判断
3. 按"背景 → 核心发现 → 技术细节 → 结论"的结构组织
4. Markdown 格式`),
    new HumanMessage(`调研主题：${state.query}\n\n调研结果：\n${sections}`),
  ]);

  console.log("[Writer] 报告完成");
  return { report: response.content as string, currentPhase: "completed" };
}

// ========== Router ==========

function routeToWorkers(state: ResearchState): Send[] {
  console.log(`[Router] 分发 ${state.subtasks.length} 个并行任务`);
  return state.subtasks.map((task) => {
    const nodeName = task.worker === "WebResearcher" ? "web_researcher" : "code_analyst";
    return new Send(nodeName, { ...state, sendTask: task });
  });
}

// ========== Graph Assembly ==========

const researchGraph = new StateGraph<ResearchState>({
  channels: {
    query: { value: null },
    subtasks: { value: null },
    workerResults: { value: workerResultsReducer, default: () => [] },
    report: { value: null },
    currentPhase: { value: null },
    sendTask: { value: null },
  },
});

researchGraph.addNode("supervisor", supervisorNode);
researchGraph.addNode("web_researcher", webResearcherNode);
researchGraph.addNode("code_analyst", codeAnalystNode);
researchGraph.addNode("writer", writerNode);

researchGraph.setEntryPoint("supervisor");
researchGraph.addConditionalEdges("supervisor", routeToWorkers);
researchGraph.addEdge("web_researcher", "writer");
researchGraph.addEdge("code_analyst", "writer");
researchGraph.addEdge("writer", END);

const researchApp = researchGraph.compile();

// ========== 执行 ==========

async function main() {
  console.log("=== 技术调研团队 ===\n");
  
  const start = Date.now();
  
  const result = await researchApp.invoke({
    query: "调研 LangGraph 的 Multi-Agent 编排能力，与 CrewAI、AutoGen 做对比分析",
    subtasks: [],
    workerResults: [],
    report: "",
    currentPhase: "init",
  });

  const elapsed = Date.now() - start;
  
  console.log(`\n=== 执行完成 ===`);
  console.log(`总耗时: ${elapsed}ms`);
  console.log(`Worker 产出数: ${result.workerResults.length}`);
  console.log(`\n${"=".repeat(60)}`);
  console.log(result.report);
}

main().catch(console.error);
```

### 执行流程可视化

运行这段代码，你会看到如下的执行日志：

```
=== 技术调研团队 ===

[Supervisor] 分析调研需求...
[Supervisor] 拆分为 3 个子任务
  → WebResearcher: 搜索 LangGraph Multi-Agent 文档
  → CodeAnalyst: 分析 LangGraph 仓库的 multi-agent 示例
  → WebResearcher: 对比 CrewAI 和 AutoGen 的多 Agent 能力
[Router] 分发 3 个并行任务
[WebResearcher] 执行: 搜索 LangGraph Multi-Agent 文档
[CodeAnalyst] 执行: 分析 LangGraph 仓库的 multi-agent 示例
[WebResearcher] 执行: 对比 CrewAI 和 AutoGen 的多 Agent 能力
[WebResearcher] 完成（1247 字符）
[CodeAnalyst] 完成（983 字符）
[WebResearcher] 完成（1156 字符）
[Writer] 汇总报告...
[Writer] 报告完成

=== 执行完成 ===
总耗时: 8234ms
Worker 产出数: 3
```

注意三个 Worker 的日志是交错输出的——它们确实在并行执行。如果是串行模式，总耗时大约是 3 × 单个 Worker 耗时 = 15-20 秒，而并行模式只用了约 8 秒。

## 从 Google ADK 看多 Agent 拓扑

值得一提的是 Google ADK（Agent Development Kit）提出了四种多 Agent 拓扑模式，可以作为架构选择的参考：

1. **Sequential（顺序）**：Agent 按固定顺序依次执行，类似 Pipeline
2. **Parallel（并行）**：Agent 同时执行，结果合并——就是本文的 Supervisor 并行模式
3. **Loop（循环）**：Agent 在循环中反复执行直到满足条件——适合需要迭代的场景，如代码生成 → 测试 → 修复
4. **Hierarchical（层级）**：Supervisor 管理 Sub-Supervisor，形成树状结构——适合大型系统

我们的 Supervisor-Worker 模式对应的是 Parallel + Hierarchical 的组合。在实际项目中，如果任务复杂度足够高（比如一个 Supervisor 管理超过 5 个 Worker），可以考虑引入二级 Supervisor 来降低单个节点的认知负担。

## 总结与决策指南

回到文章开头的核心问题：

**什么时候需要多个 Agent？**
当单 Agent 的工具超过 15 个、上下文经常被撑满、或者任务天然可以并行时。

**选哪种编排模式？**
- 需要动态决策 → Supervisor-Worker
- 简单流程传递 → Handoff
- 确定性流水线 → Pipeline

**状态怎么管？**
Worker 只写自己的通道（通过 reducer 合并），不直接读写其他 Worker 的状态。冲突由 Writer 或 Supervisor 仲裁。

**成本怎么控？**
大模型做调度和综合（Supervisor、Writer），小模型做执行（Worker）。生产环境中这个策略可以节省 40-50% 的 API 成本。

多 Agent 系统不是银弹。Anthropic 的建议值得重复：**如果你的单 Agent 已经够用，不要为了架构优美而拆分。** 多 Agent 带来的复杂度（状态同步、调试困难、成本增加）是实实在在的。只在真正需要时才引入。

---

**下一篇预告**：系列第 10 篇《Agent 系统的测试与评估》——Agent 的输出是非确定性的，传统测试方法不够用。我们将探讨如何为 Agent 编写 Eval、如何做回归测试、以及如何建立一套可靠的评估体系。
