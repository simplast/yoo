---
title: '用 StateGraph 建模复杂 Agent 工作流'
description: '当简单的 while 循环无法满足需求时，你需要用有向图来建模 Agent 的工作流。本文用 LangGraph 的 StateGraph 讲解线性流程、条件分支、循环和并行执行。'
pubDate: 2026-06-19
category: 'AI 工程'
tags: ['StateGraph', 'LangGraph', '工作流', 'Agent', 'TypeScript']
draft: false
---

# 用 StateGraph 建模复杂 Agent 工作流

> **Agent 架构实战** 系列第 6 篇 · 前置阅读：[第 5 篇 · 上下文管理](/posts/agent-arch-05-context-management)

## 引子：当 while 循环不够用

前面几篇文章中，我们的 Agent 都运行在一个简单的 while 循环里：

```
while (not done) {
  思考 → 行动 → 观察 → 更新状态
}
```

这对 ReAct 风格的 Agent 完全够用。但考虑这样一个场景——你要构建一个**代码审查 Agent**：

1. **分析代码**：读取 PR diff，识别潜在问题
2. **分级处理**：根据问题严重性走不同路径
   - 严重问题（安全漏洞、数据泄露）→ 自动修复 → 重新分析
   - 一般问题（代码风格、命名规范）→ 记录到报告
   - 无问题 → 直接通过
3. **迭代修复**：严重问题修复后，需要重新分析，确认修复有效
4. **汇总报告**：收集所有发现，生成结构化审查报告

用 while 循环来表达这个流程，你会写出类似这样的代码：

```typescript
let issues = await analyze(code);
let report: string[] = [];

while (issues.length > 0) {
  const critical = issues.filter(i => i.severity === "critical");
  const normal = issues.filter(i => i.severity === "normal");

  if (critical.length > 0) {
    await autoFix(critical);
    issues = await analyze(code); // 重新分析
    continue; // 回到 while 开头
  }

  report.push(...normal.map(formatIssue));
  break; // 没有严重问题了，退出循环
}

report.push(await generateSummary(report));
```

能跑，但有几个明显的问题：

- **流程不直观**：分支逻辑和循环逻辑混在 if/else 和 while/continue 里，阅读者需要脑补整个执行路径
- **状态管理混乱**：`issues` 和 `report` 散落在各处，谁在什么时候修改它们？
- **难以扩展**：如果将来要加一个"中等严重"的处理路径，需要改动循环内部逻辑
- **无法可视化**：while 循环是一个线性文本，你无法画出一张流程图来给同事讲解

而如果用图（Graph）来建模，同样的流程变得一目了然：

```
START → analyze → route ───[critical]──→ autoFix → analyze（循环）
                   │
                   ├───[normal]───→ report → summarize → END
                   │
                   └───[clean]────→ summarize → END
```

每个节点（Node）是一个独立的处理步骤，每条边（Edge）是一个明确的流转方向，条件分支是图上标注了条件的连线。整个流程可视化后，即使不看代码也能理解 Agent 的行为。

这就是本文要讲的内容：**用 LangGraph 的 StateGraph 来建模复杂 Agent 工作流**。我们会从一个最简单的线性图开始，逐步加入条件分支、循环和并行执行，最终构建一个完整的 Research Workflow。

---

## 一、核心概念：State、Node、Edge、Reducer

在动手写代码之前，先理解 StateGraph 的四个核心概念。

### 1.1 State（状态）

State 是贯穿整个图的**共享数据结构**。每个节点都能读取 State，每个节点的输出会合并回 State。你可以把 State 想象成一块所有节点共享的白板——节点 A 在上面写了东西，节点 B 就能看到。

在 LangGraph.js 中，State 通过 `Annotation` API 定义：

```typescript
import { Annotation } from "@langchain/langgraph";

const MyState = Annotation.Root({
  messages: Annotation<string[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),
  currentStep: Annotation<string>({
    reducer: (_existing, incoming) => incoming,
    default: () => "",
  }),
});
```

这里有两个关键点：

- **每个字段都有类型**：`messages` 是 `string[]`，`currentStep` 是 `string`
- **每个字段都有 reducer**：决定了当节点返回新值时，如何与旧值合并（后面详解）

### 1.2 Node（节点）

Node 是一个普通函数。它接收当前 State 作为参数，返回 State 的**部分更新**（不需要返回完整 State，只返回你修改的字段）。

```typescript
const analyzeCode = (state: typeof MyState.State) => {
  // 读取 state.messages
  // 做一些处理
  return {
    messages: ["分析完成，发现 3 个问题"],
    currentStep: "analyze",
  };
};
```

注意返回值的结构：你只返回要更新的字段，LangGraph 会自动用该字段的 reducer 把新值和旧值合并。

### 1.3 Edge（边）

Edge 定义节点之间的连接关系。有三种类型：

| 类型 | 方法 | 说明 |
|------|------|------|
| **固定边** | `addEdge("A", "B")` | A 执行完后，总是去 B |
| **入口边** | `addEdge(START, "A")` | 图的起点 |
| **条件边** | `addConditionalEdges("A", fn)` | 根据 State 动态决定下一个节点 |

### 1.4 Reducer（合并策略）

Reducer 是 StateGraph 中最容易让人困惑的概念。它的核心问题是：**当多个节点都要更新同一个 State 字段时，新值应该怎么和旧值合并？**

举个例子：节点 A 返回 `{ messages: ["hello"] }`，节点 B 返回 `{ messages: ["world"] }`。最终 `state.messages` 应该是什么？

答案取决于 reducer：

| Reducer 行为 | 结果 | 适用场景 |
|-------------|------|---------|
| 数组追加 | `["hello", "world"]` | 消息历史、日志 |
| 覆盖 | `["world"]` | 当前状态、最新结果 |
| 自定义 | 取决于你的逻辑 | 计数器、去重集合等 |

如果字段没有定义 reducer，默认行为是**覆盖**（后来的值替换前面的值）。

---

## 二、环境准备

### 2.1 安装依赖

```bash
npm install @langchain/langgraph @langchain/core
```

### 2.2 tsconfig.json

确保你的 TypeScript 配置支持 ESM：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true
  }
}
```

### 2.3 运行方式

本文的所有示例都使用 `tsx` 运行：

```bash
npx tsx src/day11/stategraph-basics.ts
```

---

## 三、Step 1：线性图——最简单的 StateGraph

我们从最简单的场景开始：两个节点，A → B，顺序执行。

### 3.1 完整代码

```typescript
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";

// 1. 定义 State
const LinearState = Annotation.Root({
  messages: Annotation<string[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),
});

// 2. 定义节点
const nodeA = (_state: typeof LinearState.State) => {
  console.log("[Node A] 执行中...");
  return {
    messages: ["Node A 处理完毕"],
  };
};

const nodeB = (state: typeof LinearState.State) => {
  console.log("[Node B] 执行中... 当前 messages:", state.messages);
  return {
    messages: ["Node B 处理完毕"],
  };
};

// 3. 构建图
const graph = new StateGraph(LinearState)
  .addNode("nodeA", nodeA)
  .addNode("nodeB", nodeB)
  .addEdge(START, "nodeA")     // 入口：START → nodeA
  .addEdge("nodeA", "nodeB")   // nodeA → nodeB
  .addEdge("nodeB", END);      // nodeB → END

// 4. 编译并运行
const app = graph.compile();

const result = await app.invoke({ messages: ["用户输入：开始执行"] });

console.log("\n最终状态:");
console.log(result.messages);
// 输出: ["用户输入：开始执行", "Node A 处理完毕", "Node B 处理完毕"]
```

### 3.2 执行流程

```
START ──→ nodeA ──→ nodeB ──→ END
           │          │
           ▼          ▼
     messages +=    messages +=
     "Node A ..."   "Node B ..."
```

这个例子展示了 StateGraph 的最基本用法：

1. **定义 State**：用 `Annotation.Root` 声明数据结构
2. **定义 Node**：普通函数，接收 state，返回部分更新
3. **连接 Edge**：`addEdge` 指定节点之间的固定流转
4. **编译运行**：`compile()` 生成可执行图，`invoke()` 传入初始 state 并获取最终 state

注意 `messages` 字段使用了数组追加 reducer，所以三个来源的消息（初始输入、nodeA、nodeB）都被保留了下来。

---

## 四、Step 2：条件分支——根据状态动态路由

现实中的工作流很少是一条直线。更常见的情况是：根据某些条件走不同的处理路径。

### 4.1 场景：消息分类器

我们构建一个简单的分类器：根据用户输入的长度，路由到不同的处理节点。

- 短消息（< 20 字符）→ `quickReply` 节点，快速回复
- 长消息（>= 20 字符）→ `deepAnalysis` 节点，深度分析

### 4.2 完整代码

```typescript
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";

// State 定义
const RouterState = Annotation.Root({
  input: Annotation<string>({
    reducer: (_existing, incoming) => incoming,
    default: () => "",
  }),
  response: Annotation<string>({
    reducer: (_existing, incoming) => incoming,
    default: () => "",
  }),
  category: Annotation<string>({
    reducer: (_existing, incoming) => incoming,
    default: () => "",
  }),
});

// 节点：快速回复
const quickReply = (state: typeof RouterState.State) => {
  console.log("[quickReply] 短消息，快速处理");
  return {
    response: `快速回复：收到你的短消息「${state.input}」`,
    category: "quick",
  };
};

// 节点：深度分析
const deepAnalysis = (state: typeof RouterState.State) => {
  console.log("[deepAnalysis] 长消息，深度分析中...");
  return {
    response: `深度分析报告：你的消息共 ${state.input.length} 个字符，包含了多个要点...`,
    category: "deep",
  };
};

// 路由函数：根据消息长度决定走哪条路径
const routeBylength = (state: typeof RouterState.State): string => {
  if (state.input.length < 20) {
    return "quick";
  }
  return "deep";
};

// 构建图
const graph = new StateGraph(RouterState)
  .addNode("quickReply", quickReply)
  .addNode("deepAnalysis", deepAnalysis)
  .addEdge(START, "router")              // START → router
  .addConditionalEdges("router", routeBylength, {  // router 的条件分支
    quick: "quickReply",                 // "quick" → quickReply 节点
    deep: "deepAnalysis",               // "deep" → deepAnalysis 节点
  })
  .addEdge("quickReply", END)
  .addEdge("deepAnalysis", END);

// 等一下——我们没有定义 router 节点！
// router 节点可以是一个空操作，它的唯一作用是触发条件路由
const router = (_state: typeof RouterState.State) => {
  console.log("[router] 分析输入长度...");
  return {};  // 不修改任何 state
};

// 重新构建图（加上 router 节点）
const workflow = new StateGraph(RouterState)
  .addNode("router", router)
  .addNode("quickReply", quickReply)
  .addNode("deepAnalysis", deepAnalysis)
  .addEdge(START, "router")
  .addConditionalEdges("router", routeBylength, {
    quick: "quickReply",
    deep: "deepAnalysis",
  })
  .addEdge("quickReply", END)
  .addEdge("deepAnalysis", END);

const app = workflow.compile();

// 测试短消息
console.log("--- 测试短消息 ---");
const result1 = await app.invoke({ input: "你好" });
console.log(`分类: ${result1.category}, 回复: ${result1.response}`);

// 测试长消息
console.log("\n--- 测试长消息 ---");
const result2 = await app.invoke({
  input: "请帮我分析这段代码的性能问题，我觉得这里的循环嵌套层数太多了",
});
console.log(`分类: ${result2.category}, 回复: ${result2.response}`);
```

### 4.3 `addConditionalEdges` 的工作原理

`addConditionalEdges` 接收三个参数：

```typescript
.addConditionalEdges(
  "sourceNode",          // 从哪个节点出发
  routingFunction,       // 路由函数：接收 state，返回一个字符串
  routeMap               // 路由映射：字符串 → 目标节点名
)
```

路由函数返回的字符串会在 `routeMap` 中查找对应的目标节点。如果找不到，图会报错。

你可以把路由函数想象成一个"路标牌"——它不执行任何逻辑，只告诉图"接下来往哪走"。真正的处理逻辑在目标节点里。

### 4.4 执行流程图

```
                ┌─── "quick" ──→ quickReply ──→ END
START → router ─┤
                └─── "deep"  ──→ deepAnalysis ──→ END
```

---

## 五、Step 3：循环——带终止条件的迭代

循环是图建模中最强大的特性之一。很多 Agent 任务本质上是"做 → 检查 → 不够好就再做"的迭代过程。

### 5.1 场景：迭代优化器

我们构建一个模拟的"文案优化器"：

1. `optimize` 节点：对文案做一次优化（模拟），每轮 score +1
2. `evaluate` 节点：评估当前 score
3. 条件路由：score < 5 → 回到 `optimize`（继续迭代）；score >= 5 → 结束

### 5.2 完整代码

```typescript
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";

// State：记录文案内容和优化分数
const LoopState = Annotation.Root({
  content: Annotation<string>({
    reducer: (_existing, incoming) => incoming,  // 覆盖
    default: () => "",
  }),
  score: Annotation<number>({
    reducer: (_existing, incoming) => incoming,  // 覆盖
    default: () => 0,
  }),
  iterations: Annotation<number>({
    reducer: (_existing, incoming) => incoming,  // 覆盖
    default: () => 0,
  }),
  history: Annotation<string[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],  // 追加
    default: () => [],
  }),
});

// 节点：模拟文案优化
const optimize = (state: typeof LoopState.State) => {
  const newScore = state.score + 1;
  const newContent = `${state.content} [第${state.iterations + 1}轮优化]`;
  console.log(`[optimize] score: ${state.score} → ${newScore}`);

  return {
    content: newContent,
    score: newScore,
    iterations: state.iterations + 1,
    history: [`第 ${state.iterations + 1} 轮优化，score 提升至 ${newScore}`],
  };
};

// 节点：评估（这里只做日志，不修改 state）
const evaluate = (state: typeof LoopState.State) => {
  const passed = state.score >= 5;
  console.log(`[evaluate] score=${state.score}, passed=${passed}`);
  return {};
};

// 路由函数：score < 5 继续循环，否则结束
const shouldContinue = (state: typeof LoopState.State): string => {
  if (state.score >= 5) {
    return "done";
  }
  if (state.iterations >= 10) {
    // 安全阀：防止无限循环
    return "done";
  }
  return "continue";
};

// 构建图
const workflow = new StateGraph(LoopState)
  .addNode("optimize", optimize)
  .addNode("evaluate", evaluate)
  .addEdge(START, "optimize")
  .addEdge("optimize", "evaluate")
  .addConditionalEdges("evaluate", shouldContinue, {
    continue: "optimize",  // 回到 optimize，形成循环
    done: END,             // 结束
  });

const app = workflow.compile();

// 运行
console.log("=== 迭代优化器 ===\n");
const result = await app.invoke({
  content: "初始文案：产品很好用",
  score: 0,
  iterations: 0,
  history: [],
});

console.log("\n=== 最终结果 ===");
console.log(`最终 score: ${result.score}`);
console.log(`迭代次数: ${result.iterations}`);
console.log(`最终内容: ${result.content}`);
console.log(`优化历史:`, result.history);
```

### 5.3 执行流程

```
START → optimize → evaluate ───[score < 5]──→ optimize（循环）
                         │
                         └───[score ≥ 5]──→ END
```

运行输出：

```
[optimize] score: 0 → 1
[evaluate] score=1, passed=false
[optimize] score: 1 → 2
[evaluate] score=2, passed=false
[optimize] score: 2 → 3
[evaluate] score=3, passed=false
[optimize] score: 3 → 4
[evaluate] score=4, passed=false
[optimize] score: 4 → 5
[evaluate] score=5, passed=true

最终 score: 5
迭代次数: 5
```

### 5.4 循环的安全阀

注意代码中有一个 `iterations >= 10` 的安全阀检查。这在生产环境中非常重要——你需要防止图进入无限循环。常见的安全阀策略：

- **最大迭代次数**：如上例中的 `iterations >= 10`
- **超时机制**：记录开始时间，超过阈值就终止
- **收敛检测**：如果连续 N 轮 score 没有变化，说明已经收敛，可以终止

---

## 六、Step 4：并行执行——Send API

前面的三种模式（线性、分支、循环）都是串行的：一个节点执行完，再到下一个。但很多场景需要并行处理——比如同时对多个数据源执行搜索，或者把任务分发给多个 worker。

LangGraph 提供了 `Send` API 来实现并行。

### 6.1 场景：并行搜索

假设你需要同时搜索 3 个不同的数据源（Web、论文库、代码库），然后汇总结果。

### 6.2 完整代码

```typescript
import { StateGraph, Annotation, START, END, Send } from "@langchain/langgraph";

// State
const ParallelState = Annotation.Root({
  query: Annotation<string>({
    reducer: (_existing, incoming) => incoming,
    default: () => "",
  }),
  sources: Annotation<string[]>({
    reducer: (_existing, incoming) => incoming,
    default: () => [],
  }),
  results: Annotation<string[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],  // 追加合并
    default: () => [],
  }),
  summary: Annotation<string>({
    reducer: (_existing, incoming) => incoming,
    default: () => "",
  }),
});

// 分发节点：为每个 source 创建一个 Send
const dispatch = (state: typeof ParallelState.State) => {
  console.log(`[dispatch] 分发 ${state.sources.length} 个搜索任务`);
  return state.sources.map(
    (source) => new Send("search", { query: state.query, source })
  );
};

// Worker 节点：模拟对单个数据源的搜索
const search = (state: { query: string; source: string }) => {
  console.log(`[search] 在 ${state.source} 中搜索 "${state.query}"`);
  // 模拟搜索延迟
  const fakeResult = `从 ${state.source} 找到: 关于 "${state.query}" 的 3 条结果`;
  return {
    results: [fakeResult],
  };
};

// 汇总节点
const aggregate = (state: typeof ParallelState.State) => {
  console.log(`[aggregate] 收到 ${state.results.length} 条搜索结果`);
  const summary = `搜索汇总（${state.results.length} 个来源）:\n` +
    state.results.map((r, i) => `  ${i + 1}. ${r}`).join("\n");
  return { summary };
};

// 构建图
const workflow = new StateGraph(ParallelState)
  .addNode("dispatch", dispatch)
  .addNode("search", search)
  .addNode("aggregate", aggregate)
  .addEdge(START, "dispatch")
  .addEdge("dispatch", "search")       // dispatch 通过 Send 并行分发到 search
  .addEdge("search", "aggregate")      // 所有 search 完成后，汇聚到 aggregate
  .addEdge("aggregate", END);

const app = workflow.compile();

// 运行
console.log("=== 并行搜索 ===\n");
const result = await app.invoke({
  query: "LangGraph StateGraph",
  sources: ["Web", "ArXiv", "GitHub"],
  results: [],
  summary: "",
});

console.log("\n=== 汇总结果 ===");
console.log(result.summary);
```

### 6.3 Send API 的工作原理

`Send` 的核心思想是 **Fan-out / Fan-in**（扇出 / 扇入）：

```
                 ┌──→ search(Web)   ──┐
dispatch ────────┼──→ search(ArXiv)  ──┼──→ aggregate
                 └──→ search(GitHub) ──┘
```

1. **Fan-out**：`dispatch` 节点返回一个 `Send` 对象数组。每个 `Send` 指定目标节点名和传递给该节点的参数
2. **并行执行**：LangGraph 自动并行执行所有 `Send` 实例
3. **Fan-in**：所有并行实例完成后，它们的输出通过 reducer 合并，然后流转到下一个节点（`aggregate`）

`Send` 的构造方式：

```typescript
new Send("targetNodeName", { /* 传递给目标节点的 state */ })
```

注意 `Send` 传递的 state 可以是一个自定义对象，不必和图的 State 完全一致。这使得你可以给每个 worker 传递不同的参数（比如不同的 `source`）。

### 6.4 Reducer 在并行中的作用

并行执行时，多个 worker 同时更新 `results` 字段。因为 `results` 的 reducer 是数组追加，所以所有 worker 的结果都会被收集：

```
search(Web)   返回 { results: ["Web 结果"] }
search(ArXiv) 返回 { results: ["ArXiv 结果"] }
search(GitHub) 返回 { results: ["GitHub 结果"] }

合并后: results = ["Web 结果", "ArXiv 结果", "GitHub 结果"]
```

如果 reducer 是覆盖模式，你只会拿到最后完成的那个 worker 的结果——这通常不是你想要的。所以**并行节点的输出字段一定要用追加型 reducer**。

---

## 七、Reducer 详解

前面的例子中已经用到了 reducer，这里做一个系统性的总结。

### 7.1 三种常见模式

```typescript
const State = Annotation.Root({
  // 模式 1：数组追加 —— 所有更新都保留
  messages: Annotation<string[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),

  // 模式 2：覆盖 —— 只保留最新值
  score: Annotation<number>({
    reducer: (_existing, incoming) => incoming,
    default: () => 0,
  }),

  // 模式 3：自定义 —— 按你的逻辑合并
  uniqueTags: Annotation<string[]>({
    reducer: (existing, incoming) => [...new Set([...existing, ...incoming])],
    default: () => [],
  }),
});
```

### 7.2 Reducer 的调用时机

Reducer 在以下场景被调用：

1. **节点返回更新时**：节点的返回值和当前 State 中的旧值通过 reducer 合并
2. **并行节点完成时**：多个并行 worker 的返回值两两通过 reducer 合并
3. **初始值设置时**：`default()` 函数提供字段的初始值

### 7.3 不设置 reducer 会怎样？

如果你只定义了类型而没有指定 reducer：

```typescript
// 没有 reducer
const State = Annotation.Root({
  status: Annotation<string>(),
});
```

默认行为是**覆盖**——新值直接替换旧值。对于标量类型（string、number、boolean），这通常是对的。但对于数组和对象，你可能需要显式定义 reducer 来避免丢失数据。

### 7.4 Reducer 设计原则

| 字段类型 | 推荐 Reducer | 原因 |
|---------|-------------|------|
| 消息历史 / 日志 | 数组追加 | 需要保留完整历史 |
| 当前状态 / 分数 | 覆盖 | 只关心最新值 |
| 集合 / 标签 | 去重追加 | 保留所有不重复项 |
| 计数器 | 累加 | `(prev, next) => prev + next` |
| 最大/最小值 | 取极值 | `(prev, next) => Math.max(prev, next)` |

一个常见的错误是把所有字段都设为覆盖模式，然后在并行场景下发现数据丢失了。记住：**凡是有多个来源同时写入的字段，都需要认真设计 reducer**。

---

## 八、实战案例：Research Workflow

现在我们把前面学到的所有模式组合起来，构建一个完整的 Research Workflow：

```
START → search → collect → [够 5 个源?] → summarize → END
                            [不够] → search（循环）
```

这个工作流模拟了一个研究助手的行为：搜索 → 收集资料 → 检查数量是否足够 → 不够就继续搜索 → 够了就生成摘要。

### 8.1 完整代码

```typescript
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";

// ---- State 定义 ----
const ResearchState = Annotation.Root({
  topic: Annotation<string>({
    reducer: (_existing, incoming) => incoming,
    default: () => "",
  }),
  collectedSources: Annotation<string[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],  // 追加
    default: () => [],
  }),
  searchRound: Annotation<number>({
    reducer: (_existing, incoming) => incoming,  // 覆盖
    default: () => 0,
  }),
  summary: Annotation<string>({
    reducer: (_existing, incoming) => incoming,
    default: () => "",
  }),
  log: Annotation<string[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],  // 追加
    default: () => [],
  }),
});

type ResearchStateType = typeof ResearchState.State;

// ---- 节点定义 ----

// 搜索节点：模拟搜索并返回新发现的数据源
const search = (state: ResearchStateType) => {
  const round = state.searchRound + 1;
  console.log(`[search] 第 ${round} 轮搜索 "${state.topic}"...`);

  // 模拟每轮搜索发现 2 个新数据源
  const newSources = [
    `${state.topic} - 来源 ${state.collectedSources.length + 1}（第 ${round} 轮）`,
    `${state.topic} - 来源 ${state.collectedSources.length + 2}（第 ${round} 轮）`,
  ];

  return {
    collectedSources: newSources,
    searchRound: round,
    log: [`第 ${round} 轮搜索，发现 ${newSources.length} 个新来源`],
  };
};

// 收集节点：整理收集到的数据源
const collect = (state: ResearchStateType) => {
  console.log(`[collect] 当前共 ${state.collectedSources.length} 个数据源`);
  return {
    log: [`收集完毕，共 ${state.collectedSources.length} 个数据源`],
  };
};

// 摘要节点：生成最终摘要
const summarize = (state: ResearchStateType) => {
  console.log(`[summarize] 生成摘要，基于 ${state.collectedSources.length} 个数据源`);
  const summary = `## 研究报告：${state.topic}\n\n` +
    `共收集 ${state.collectedSources.length} 个数据源，经过 ${state.searchRound} 轮搜索。\n\n` +
    `### 数据源列表\n` +
    state.collectedSources.map((s, i) => `${i + 1}. ${s}`).join("\n") +
    `\n\n### 结论\n基于以上数据源的综合分析...（此处省略具体分析）`;

  return {
    summary,
    log: ["摘要生成完毕"],
  };
};

// ---- 路由函数 ----
const checkEnoughSources = (state: ResearchStateType): string => {
  const enough = state.collectedSources.length >= 5;
  console.log(`[route] ${state.collectedSources.length} >= 5 ? ${enough}`);

  if (state.searchRound >= 10) {
    console.log("[route] 安全阀触发：搜索轮次过多，强制结束");
    return "enough";
  }

  return enough ? "enough" : "notEnough";
};

// ---- 构建图 ----
const workflow = new StateGraph(ResearchState)
  .addNode("search", search)
  .addNode("collect", collect)
  .addNode("summarize", summarize)
  .addEdge(START, "search")
  .addEdge("search", "collect")
  .addConditionalEdges("collect", checkEnoughSources, {
    enough: "summarize",
    notEnough: "search",     // 循环回去
  })
  .addEdge("summarize", END);

const app = workflow.compile();

// ---- 运行 ----
console.log("=== Research Workflow ===\n");

const result = await app.invoke({
  topic: "LangGraph 状态图最佳实践",
  collectedSources: [],
  searchRound: 0,
  summary: "",
  log: [],
});

console.log("\n=== 最终结果 ===");
console.log(result.summary);
console.log("\n=== 执行日志 ===");
result.log.forEach((entry) => console.log(`  • ${entry}`));
```

### 8.2 预期输出

```
=== Research Workflow ===

[search] 第 1 轮搜索 "LangGraph 状态图最佳实践"...
[collect] 当前共 2 个数据源
[route] 2 >= 5 ? false
[search] 第 2 轮搜索 "LangGraph 状态图最佳实践"...
[collect] 当前共 4 个数据源
[route] 4 >= 5 ? false
[search] 第 3 轮搜索 "LangGraph 状态图最佳实践"...
[collect] 当前共 6 个数据源
[route] 6 >= 5 ? true
[summarize] 生成摘要，基于 6 个数据源

=== 最终结果 ===
## 研究报告：LangGraph 状态图最佳实践

共收集 6 个数据源，经过 3 轮搜索。

### 数据源列表
1. LangGraph 状态图最佳实践 - 来源 1（第 1 轮）
2. LangGraph 状态图最佳实践 - 来源 2（第 1 轮）
3. LangGraph 状态图最佳实践 - 来源 3（第 2 轮）
4. LangGraph 状态图最佳实践 - 来源 4（第 2 轮）
5. LangGraph 状态图最佳实践 - 来源 5（第 3 轮）
6. LangGraph 状态图最佳实践 - 来源 6（第 3 轮）
```

### 8.3 图的可视化

```
START
  │
  ▼
search ◄──────────────┐
  │                    │
  ▼                    │
collect                │
  │                    │
  ▼                    │
checkEnough ─[不够]────┘
  │
  │ [够了]
  ▼
summarize
  │
  ▼
 END
```

### 8.4 代码回顾：四种模式的组合

这个 Research Workflow 综合运用了本文介绍的四种模式：

| 模式 | 在图中的体现 |
|------|------------|
| **线性** | `START → search → collect` 是固定边 |
| **条件分支** | `collect` 之后根据数据源数量走不同路径 |
| **循环** | 数据源不够时，`notEnough` 路径回到 `search` |
| **Reducer** | `collectedSources` 用追加模式保留所有轮次的结果，`searchRound` 用覆盖模式记录最新轮次 |

---

## 九、进阶技巧与常见陷阱

### 9.1 图的可视化调试

LangGraph 支持将图导出为 Mermaid 图，方便调试和文档化：

```typescript
const app = workflow.compile();
console.log(app.getGraph().drawMermaid());
```

这会输出 Mermaid 格式的图描述，可以粘贴到 [Mermaid Live Editor](https://mermaid.live) 中渲染。

### 9.2 State 的类型安全

TypeScript 的类型推导在 StateGraph 中非常有用。用 `typeof State.State` 获取 State 类型：

```typescript
const myNode = (state: typeof MyState.State) => {
  // state.topic 是 string
  // state.collectedSources 是 string[]
  // state.searchRound 是 number
  // TypeScript 会帮你检查类型
};
```

### 9.3 常见陷阱

**陷阱 1：忘记给并行节点的输出字段设置追加 reducer**

```typescript
// 错误：并行 worker 的结果会互相覆盖
results: Annotation<string[]>({
  reducer: (_existing, incoming) => incoming,  // 只保留最后一个！
  default: () => [],
})

// 正确：追加模式保留所有 worker 的结果
results: Annotation<string[]>({
  reducer: (existing, incoming) => [...existing, ...incoming],
  default: () => [],
})
```

**陷阱 2：循环没有安全阀**

永远为循环添加终止条件。一个 bug 导致的无限循环不仅浪费计算资源，还会让你的 API 账单飙升。

**陷阱 3：Node 函数修改了 State 的原地引用**

Node 函数应该返回新的对象，而不是修改传入的 state：

```typescript
// 错误：原地修改
const badNode = (state: typeof MyState.State) => {
  state.messages.push("new message");  // 直接修改了原数组！
  return { messages: state.messages };
};

// 正确：返回新数组
const goodNode = (state: typeof MyState.State) => {
  return { messages: [...state.messages, "new message"] };
};
```

**陷阱 4：条件路由返回了不存在的节点名**

`addConditionalEdges` 的路由映射必须覆盖路由函数可能返回的所有值。如果路由函数返回了一个不在映射表中的字符串，图会抛出运行时错误。

**陷阱 5：混淆 `START`/`END` 和普通节点名**

`START` 和 `END` 是 LangGraph 的特殊标记，不是普通节点。你不能 `.addNode("START", ...)` 或 `.addNode("END", ...)`。它们只能出现在 `.addEdge()` 的参数中。

---

## 十、总结

StateGraph 把 Agent 的执行流程从隐式的代码逻辑变成了显式的图结构。本文覆盖了四种核心模式：

| 模式 | 关键 API | 适用场景 |
|------|---------|---------|
| **线性流程** | `addEdge(A, B)` | 固定步骤顺序执行 |
| **条件分支** | `addConditionalEdges(A, fn, map)` | 根据状态动态路由 |
| **循环** | 条件边指向已执行过的节点 | 迭代优化、重试、收敛检测 |
| **并行执行** | `Send` + 追加 reducer | Fan-out/Fan-in、多源搜索 |

四种模式可以自由组合，表达任意复杂的工作流。State 贯穿始终，Reducer 确保并发写入的正确性。

回顾一下我们学到的关键 API：

- **`Annotation.Root`**：定义图的共享状态结构
- **`Annotation<T>({ reducer, default })`**：为每个字段指定合并策略和初始值
- **`new StateGraph(State)`**：创建图实例
- **`.addNode(name, fn)`**：添加处理节点
- **`.addEdge(from, to)`**：添加固定边
- **`.addConditionalEdges(from, fn, map)`**：添加条件边
- **`new Send(target, state)`**：创建并行执行实例
- **`.compile()`**：编译图
- **`.invoke(initialState)`**：运行图

图建模的价值不仅仅是"代码更好看"。它让你能够**可视化** Agent 的行为、**推理** 执行路径、**隔离测试** 每个节点、以及在节点之间**灵活重组**流程。当你的 Agent 从单一循环进化为多步骤、多路径的复杂系统时，StateGraph 就是那个让你保持掌控力的工具。

---

## 下一篇预告

到目前为止，我们构建的图都是"一次性"的——`invoke` 调用完毕，状态就消失了。但在生产环境中，你需要 Agent 的状态能够**跨进程持久化**：进程重启后从上次中断的地方继续、支持时间旅行回到任意历史状态、甚至在用户关闭浏览器后下次打开时恢复。

下一篇文章（第 7 篇），我们将深入 **Checkpointing 与状态持久化**。LangGraph 提供了内置的 Checkpointing 机制，在每个节点执行后自动保存状态快照。我们会学习 `MemorySaver`、`SqliteSaver` 和 `PostgresSaver` 三种存储后端，以及如何利用 Checkpoint 实现故障恢复和时间旅行。

---

**参考资料**

- [LangGraph.js 官方文档](https://langchain-ai.github.io/langgraphjs/) — StateGraph API 参考
- [LangGraph.js GitHub 仓库](https://github.com/langchain-ai/langgraphjs) — 源码和示例
- [LangGraph Concepts](https://docs.langchain.com/langgraphjs/concepts) — 核心概念详解
- [LangGraph How-to Guides](https://docs.langchain.com/langgraphjs/how-tos) — 实操指南

*继续阅读：[第 7 篇：Agent 状态持久化与 Checkpointing](/posts/agent-arch-07-persistence) | 返回：[Agent 架构实战系列目录](/posts/agent-arch-overview)*
