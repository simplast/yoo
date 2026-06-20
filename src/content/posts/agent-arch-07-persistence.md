---
title: 'Agent 状态持久化：Checkpointing 与故障恢复'
description: 'Agent 运行到一半崩溃了怎么办？本文讲解 LangGraph 的 Checkpointing 机制，实现跨进程的状态恢复，让你的 Agent 具备生产级可靠性。'
pubDate: 2026-06-19
category: 'AI 工程'
tags: ['Checkpointing', 'Persistence', 'LangGraph', 'MemorySaver', 'Agent']
series: 'Agent 工程实战'
seriesOrder: 7
draft: false
---

> **Agent 工程实战** 系列第 7 篇。前置阅读：[第 6 篇：StateGraph 工作流建模](/posts/agent-arch-06-stategraph)。

## 一个让人崩溃的场景

假设你构建了一个 Research Agent，它的工作流程是：

1. 接收用户的研究课题
2. 搜索 10 篇相关论文
3. 逐篇提取关键观点
4. 交叉比对，生成综述
5. 输出结构化报告

整个流程大约需要 30 分钟，涉及数十次 LLM 调用和外部 API 请求。一切看起来很顺利——直到第 15 步，某个 API 返回了 `429 Too Many Requests`，紧接着 LLM 调用超时，进程抛出一个未捕获的异常，整个 Agent 挂了。

没有持久化的话，你只有一个选择：**从头再来**。30 分钟的进度、已经花掉的 API 费用、好不容易搜集到的中间结果，全部归零。

这不是假设。在生产环境中，Agent 面临的故障场景包括：

- **API 超时 / 限流**：LLM 服务不稳定，或触发了 rate limit
- **进程重启**：部署新版本、OOM 被系统 kill、服务器维护
- **网络故障**：调用外部工具时连接中断
- **逻辑错误**：某个 Node 的 reducer 抛异常，图执行中断
- **用户中断**：用户关掉了浏览器，但希望下次回来继续

传统 Web 应用的解决方案很简单：把数据存到数据库。但 Agent 的"状态"比一条用户记录复杂得多——它包含当前的消息历史、工具调用结果、中间推理链、图的当前位置，甚至可能包含二进制数据（比如生成的图片）。

LangGraph 给出的答案是 **Checkpointing**：在每个 Node 执行完成后，自动对整个 State 做快照并持久化。下次用相同的 thread_id 调用时，自动从最近的 checkpoint 恢复，而不是从头开始。

## Checkpointing 的核心原理

### 每个 Node 执行后自动保存快照

在 LangGraph 中，Checkpointing 的工作方式非常直接：

```
Node A 执行完成 → 保存 State 快照（Checkpoint #1）
Node B 执行完成 → 保存 State 快照（Checkpoint #2）
Node C 执行完成 → 保存 State 快照（Checkpoint #3）
...
```

每个 Checkpoint 包含：

- **完整的 State 快照**：该 Node 执行完毕后 State 的所有字段值
- **元数据**：checkpoint_id、parent_checkpoint_id、创建时间等
- **写入记录**：本次 Node 对 State 做了哪些修改（writes）

注意一个关键点：**Checkpoint 保存的是完整的 State，而不是增量**。这意味着即使 State 很大，每个 Checkpoint 也是自包含的，恢复时只需要读取最新的那一个。

### Checkpoint 链与历史

每个 Checkpoint 通过 `parent_checkpoint_id` 指向它的父 Checkpoint，形成一条链：

```
Checkpoint #1 (parent: null)
    ↓
Checkpoint #2 (parent: #1)
    ↓
Checkpoint #3 (parent: #2)
    ↓
Checkpoint #4 (parent: #3)  ← 最新
```

这条链的意义不仅仅是"备份"——它让你可以**回溯到任意历史状态**，从那个点重新执行。这就是所谓的"时间旅行"（Time Travel），后面会详细讲。

### thread_id：隔离不同的对话

Checkpoint 是按 `thread_id` 隔离的。不同的 thread_id 对应不同的对话 / 执行流，彼此独立：

```
thread-1: Checkpoint A1 → A2 → A3 → A4
thread-2: Checkpoint B1 → B2 → B3
thread-3: Checkpoint C1 → C2
```

你可以把 thread_id 理解为"会话 ID"。同一个用户的同一次对话用同一个 thread_id，不同对话用不同的 thread_id。

## 实操 Step 1：用 MemorySaver 实现基本的 Checkpointing

MemorySaver 是 LangGraph 内置的最简单的 Checkpoint Saver，数据存在内存中。它适合开发和测试，但不适合生产（进程重启后数据就丢了）。我们先用它来理解机制。

### 完整示例：一个带状态计数的 Agent

```typescript
import { StateGraph, Annotation, MemorySaver } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

// 1. 定义 State
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  counter: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  log: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

// 2. 定义节点
const stepA = (state: typeof AgentState.State) => {
  console.log(`[Step A] counter was: ${state.counter}`);
  return {
    messages: [new AIMessage(`Step A processed, counter=${state.counter + 1}`)],
    counter: state.counter + 1,
    log: [`Step A: ${state.counter} → ${state.counter + 1}`],
  };
};

const stepB = (state: typeof AgentState.State) => {
  console.log(`[Step B] counter was: ${state.counter}`);
  return {
    messages: [new AIMessage(`Step B processed, counter=${state.counter + 1}`)],
    counter: state.counter + 1,
    log: [`Step B: ${state.counter} → ${state.counter + 1}`],
  };
};

const stepC = (state: typeof AgentState.State) => {
  console.log(`[Step C] counter was: ${state.counter}`);
  return {
    messages: [new AIMessage(`Step C processed, counter=${state.counter + 1}`)],
    counter: state.counter + 1,
    log: [`Step C: ${state.counter} → ${state.counter + 1}`],
  };
};

// 3. 构建图
const workflow = new StateGraph(AgentState)
  .addNode("stepA", stepA)
  .addNode("stepB", stepB)
  .addNode("stepC", stepC)
  .addEdge("__start__", "stepA")
  .addEdge("stepA", "stepB")
  .addEdge("stepB", "stepC")
  .addEdge("stepC", "__end__");

// 4. 编译时注入 checkpointer
const checkpointer = new MemorySaver();
const graph = workflow.compile({ checkpointer });

// 5. 第一次调用
const config = { configurable: { thread_id: "thread-1" } };

console.log("=== 第一次调用 ===");
const result1 = await graph.invoke(
  {
    messages: [new HumanMessage("开始执行")],
    counter: 0,
    log: [],
  },
  config
);

console.log("第一次结果:", {
  counter: result1.counter,
  log: result1.log,
});
// 输出: { counter: 3, log: ['Step A: 0 → 1', 'Step B: 1 → 2', 'Step C: 2 → 3'] }
```

到目前为止，这和没有 checkpointer 的图没有区别。但接下来我们看第二次调用：

```typescript
// 6. 第二次调用——使用相同的 thread_id
console.log("\n=== 第二次调用（相同 thread_id）===");
const result2 = await graph.invoke(
  {
    messages: [new HumanMessage("继续执行")],
    counter: 0,  // 注意：即使传入 0，也会被忽略
    log: [],
  },
  config
);

console.log("第二次结果:", {
  counter: result2.counter,
  log: result2.log,
});
// 输出: { counter: 6, log: [...之前的 log..., 'Step A: 3 → 4', 'Step B: 4 → 5', 'Step C: 5 → 6'] }
```

关键发现：**counter 从 3 继续增长到 6，而不是从 0 重新开始**。log 数组也保留了之前的所有记录。

这是因为第二次调用时，LangGraph 检测到 config 中的 `thread_id` 与已有的 checkpoint 匹配，于是自动从最新的 checkpoint（counter=3）恢复状态，而不是使用传入的初始值。传入的 `counter: 0` 和 `log: []` 被忽略了——checkpoint 中保存的值优先级更高。

不过，`messages` 字段是个例外：因为我们使用了 `reducer: (prev, next) => [...prev, ...next]`，新的 HumanMessage 会被追加到已有的消息列表中，而不是替换。

### 不同的 thread_id 完全隔离

```typescript
// 7. 使用不同的 thread_id——完全独立
const config2 = { configurable: { thread_id: "thread-2" } };

console.log("\n=== 使用 thread-2 ===");
const result3 = await graph.invoke(
  {
    messages: [new HumanMessage("新线程开始")],
    counter: 0,
    log: [],
  },
  config2
);

console.log("thread-2 结果:", {
  counter: result3.counter,
  log: result3.log,
});
// 输出: { counter: 3, log: ['Step A: 0 → 1', 'Step B: 1 → 2', 'Step C: 2 → 3'] }
// 从 0 开始，与 thread-1 完全独立
```

## 实操 Step 2：State History 与时间旅行

Checkpointing 最强大的特性之一是**时间旅行**：你可以查看 Agent 的完整执行历史，并回到任意历史状态重新执行。

### 查看 State History

```typescript
// 查看 thread-1 的完整历史
const history = await graph.getStateHistory(config);

console.log(`\n=== thread-1 历史（共 ${history.length} 个 checkpoint）===`);
for (const [i, state] of history.entries()) {
  console.log(`Checkpoint ${i}:`, {
    checkpointId: state.config.configurable.checkpoint_id,
    counter: state.values.counter,
    next: state.next,  // 下一个要执行的 node
    metadata: state.metadata,
  });
}
```

输出类似：

```
Checkpoint 0: { counter: 6, next: [], metadata: { ... } }   // 最终状态
Checkpoint 1: { counter: 5, next: ['stepC'], metadata: { ... } }
Checkpoint 2: { counter: 4, next: ['stepB'], metadata: { ... } }
Checkpoint 3: { counter: 3, next: ['stepA'], metadata: { ... } }  // 第二轮开始
Checkpoint 4: { counter: 2, next: ['stepC'], metadata: { ... } }
Checkpoint 5: { counter: 1, next: ['stepB'], metadata: { ... } }
Checkpoint 6: { counter: 0, next: ['stepA'], metadata: { ... } }  // 初始状态
```

注意：`getStateHistory` 返回的是**从新到旧**的排序，`history[0]` 是最新的 checkpoint。

### 回到历史状态重新执行

假设你发现 Agent 在第 4 步（counter=3）做了一个错误的决策，你想回到那个状态，换一条路径重新执行。

```typescript
// 找到 counter=3 的 checkpoint
const targetCheckpoint = history.find(
  (h) => h.values.counter === 3
);

if (targetCheckpoint) {
  console.log("\n=== 从 counter=3 重新执行 ===");

  // 使用历史 checkpoint 的 config
  const replayConfig = targetCheckpoint.config;

  // 从这里重新执行图
  const replayResult = await graph.invoke(null, replayConfig);

  console.log("重放结果:", {
    counter: replayResult.counter,
    log: replayResult.log,
  });
}
```

这里 `invoke(null, replayConfig)` 的含义是：不传入新的输入，直接从 `replayConfig` 指向的 checkpoint 状态继续执行剩余的 Node。

### 分支执行：从历史状态走不同的路

更高级的用法是：回到历史状态后，通过修改 State 来走一条完全不同的执行路径。

```typescript
// 从 counter=3 的 checkpoint 创建一个分支
const branchConfig = {
  ...targetCheckpoint.config,
  configurable: {
    ...targetCheckpoint.config.configurable,
    thread_id: "thread-1-branch",  // 新的 thread_id，不影响原线程
  },
};

// 用修改后的状态从分支点继续
const branchResult = await graph.invoke(
  {
    messages: [new HumanMessage("我选择另一条路")],
    counter: 100,  // 手动覆盖 counter
  },
  branchConfig
);

console.log("分支结果:", {
  counter: branchResult.counter,
});
```

这种"分支执行"在调试场景中非常有用：你可以在 Agent 出错的地方回退，修改某些参数，然后重新运行来验证修复方案。

## 实操 Step 3：获取当前 State 与条件判断

在恢复执行之前，你可能需要先检查当前的 State，决定是否需要继续执行。

```typescript
// 获取当前 State（不执行任何 Node）
const currentState = await graph.getState(config);

console.log("当前 State:", {
  counter: currentState.values.counter,
  next: currentState.next,  // 下一个要执行的 Node（空数组表示已结束）
  metadata: currentState.metadata,
});

// 判断图是否已经执行完毕
if (currentState.next.length === 0) {
  console.log("图已经执行完毕，无需继续");
} else {
  console.log(`图在 ${currentState.next[0]} 处中断，可以继续执行`);
  // 从断点继续
  await graph.invoke(null, config);
}
```

`getState` 和 `invoke` 的区别在于：`getState` 只读取 checkpoint 中保存的 State，不会执行任何 Node。这在实现"断点续传"逻辑时很关键——先读取状态，判断是否需要恢复，再决定是否调用 `invoke`。

## Checkpoint Saver 对比与选择

MemorySaver 只是 LangGraph 提供的多种 Saver 之一。在生产环境中，你需要根据场景选择合适的 Saver。

| Saver | 存储后端 | 适用场景 | 优点 | 注意事项 |
|-------|---------|---------|------|---------|
| **MemorySaver** | 进程内存 | 开发、测试、原型 | 零配置、速度快 | 进程重启即丢失，无法跨进程共享 |
| **SqliteSaver** | SQLite 文件 | 单机生产环境 | 持久化到磁盘、单文件易迁移 | 不支持并发写入，不适合多实例 |
| **PostgresSaver** | PostgreSQL | 分布式生产环境 | 支持并发、成熟稳定 | 需要部署和维护数据库 |
| **自定义 Saver** | 任意（Redis、S3 等） | 特殊需求 | 灵活适配现有基础设施 | 需要实现 `BaseCheckpointSaver` 接口 |

### SqliteSaver：单机生产的首选

```typescript
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

// 创建 SQLite Saver（数据持久化到文件）
const sqliteSaver = SqliteSaver.fromConnString("./checkpoints.db");

const graph = workflow.compile({ checkpointer: sqliteSaver });

// 使用方式和 MemorySaver 完全一致
const config = { configurable: { thread_id: "thread-1" } };
await graph.invoke({ messages: [new HumanMessage("开始")], counter: 0 }, config);
```

SqliteSaver 的好处是**零额外依赖**——数据存在一个 `.db` 文件中，进程重启后依然可用。对于单机部署的 Agent 应用（比如一个 CLI 工具或单机 Web 服务），这是最简单的生产方案。

### PostgresSaver：分布式生产

```typescript
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

// 连接到 PostgreSQL
const postgresSaver = PostgresSaver.fromConnString(
  "postgresql://user:password@localhost:5432/agent_db"
);

// 首次使用需要创建表
await postgresSaver.setup();

const graph = workflow.compile({ checkpointer: postgresSaver });
```

PostgresSaver 适合多实例部署——多个 Agent 进程可以共享同一个数据库，实现真正的分布式状态管理。

### 自定义 Saver

如果你的基础设施有特殊的存储需求（比如用 Redis 做缓存、用 S3 做归档），可以实现自定义的 Checkpoint Saver。核心是实现 `BaseCheckpointSaver` 接口的三个方法：

```typescript
import { BaseCheckpointSaver, Checkpoint, CheckpointMetadata } from "@langchain/langgraph";

class MyCustomSaver extends BaseCheckpointSaver {
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    // 根据 config.configurable.thread_id 和 checkpoint_id 读取 checkpoint
    // 返回 { config, checkpoint, metadata, parentConfig }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    // 保存 checkpoint 到自定义存储
    // 返回包含新 checkpoint_id 的 config
  }

  async list(config: RunnableConfig, limit?: number): Promise<CheckpointTuple[]> {
    // 列出指定 thread 的所有 checkpoint（从新到旧排序）
    // 可选实现 limit 参数限制返回数量
  }
}
```

## 实际生产中的已知坑

### 坑 1：MemorySaver 的内存泄漏

MemorySaver 将 checkpoint 存在内存中，长时间运行会持续占用内存。如果你在生产环境不小心使用了 MemorySaver：

- 每个 thread 的每个 Node 执行都会产生一个 checkpoint
- 一个运行 100 步的 Agent，如果 State 包含大量消息，checkpoint 可能占用数百 MB
- 进程不会主动清理旧的 checkpoint

**解决方案**：生产环境务必使用持久化 Saver（SqliteSaver 或 PostgresSaver）。如果必须用 MemorySaver 做测试，确保有定期重启或手动清理机制。

### 坑 2：State 膨胀

Checkpoint 保存的是完整 State 快照。如果你的 State 中包含大文件、长消息历史或复杂的嵌套对象，checkpoint 的体积会快速增长。

```typescript
// 不好的做法：在 State 中存大量原始数据
const BadState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: msgReducer }),
  rawDocuments: Annotation<Document[]>({ reducer: docReducer }),  // 可能很大
  embeddings: Annotation<Float32Array[]>({ reducer: embReducer }),  // 非常大
});

// 更好的做法：State 中只存引用，数据放在外部存储
const BetterState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: msgReducer }),
  documentIds: Annotation<string[]>({ reducer: idReducer }),  // 只存 ID
  embeddingIndex: Annotation<string>({ reducer: strReducer }),  // 存向量库索引名
});
```

**经验法则**：State 中只存"指针"和"摘要"，大块数据放外部存储（数据库、文件系统、对象存储）。

### 坑 3：thread_id 命名不规范

thread_id 是你管理对话的唯一标识。如果没有统一的命名规范，后期排查问题会非常痛苦。

**建议的命名规范**：

```
{user_id}:{session_type}:{timestamp}

// 示例
user-12345:chat:20260619T103000
user-12345:research:20260619T140000
user-67890:support:20260619T091500
```

这样你可以：
- 按 user_id 前缀查询某个用户的所有对话
- 按 session_type 区分不同类型的 Agent 会话
- 按 timestamp 排序找到最近的对话

### 坑 4：Checkpoint 清理策略

长时间运行的系统会产生大量 checkpoint 数据。你需要一个清理策略来避免存储爆炸。

一种常见的做法是**按 TTL 清理**：保留最近 N 天的 checkpoint，删除更早的。

```typescript
// 伪代码：清理 7 天前的 checkpoint
async function cleanupOldCheckpoints(saver, maxAgeDays = 7) {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  // 获取所有 thread
  const threads = await saver.listThreads();

  for (const thread of threads) {
    const history = await saver.list({ configurable: { thread_id: thread.id } });

    for (const checkpoint of history) {
      if (checkpoint.metadata.timestamp < cutoff) {
        await saver.deleteCheckpoint(checkpoint.config);
      }
    }
  }
}
```

具体的清理 API 取决于你使用的 Saver 实现。PostgresSaver 可以直接用 SQL 清理：

```sql
DELETE FROM checkpoints
WHERE thread_id IN (
  SELECT thread_id FROM checkpoints
  GROUP BY thread_id
  HAVING MAX(created_at) < NOW() - INTERVAL '7 days'
);
```

### 坑 5：并发写入冲突

如果你使用 SqliteSaver 并且有多个进程（或同一个进程中的多个 Promise）同时写入同一个 thread_id，可能会遇到 SQLite 的写入锁冲突。

**解决方案**：
- 确保同一个 thread_id 在同一时间只有一个进程在写入
- 如果需要并发，切换到 PostgresSaver（它支持行级锁）
- 或者给不同的并发任务分配不同的 thread_id

## 一个完整的故障恢复示例

把上面学到的东西串起来，实现一个带故障恢复的 Agent 执行器：

```typescript
import { StateGraph, Annotation, MemorySaver } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

// 定义 State
const ResearchState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  currentStep: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  results: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

// 模拟可能失败的 API 调用
async function callExternalAPI(step: number): Promise<string> {
  // 模拟 30% 的失败率
  if (Math.random() < 0.3) {
    throw new Error(`API timeout at step ${step}`);
  }
  return `Result from step ${step}`;
}

// 定义节点
const researchStep = async (state: typeof ResearchState.State) => {
  const step = state.currentStep + 1;
  console.log(`  → 执行研究步骤 ${step}...`);

  const result = await callExternalAPI(step);

  return {
    messages: [new AIMessage(`研究步骤 ${step} 完成: ${result}`)],
    currentStep: step,
    results: [result],
  };
};

// 条件边：判断是否继续
const shouldContinue = (state: typeof ResearchState.State) => {
  if (state.currentStep >= 5) {
    return "summarize";
  }
  return "research";
};

// 汇总节点
const summarize = (state: typeof ResearchState.State) => {
  const summary = `研究完成，共 ${state.currentStep} 步，收集 ${state.results.length} 条结果`;
  console.log(`  → ${summary}`);
  return {
    messages: [new AIMessage(summary)],
  };
};

// 构建图
const workflow = new StateGraph(ResearchState)
  .addNode("research", researchStep)
  .addNode("summarize", summarize)
  .addConditionalEdges("__start__", shouldContinue)
  .addConditionalEdges("research", shouldContinue)
  .addEdge("summarize", "__end__");

const checkpointer = new MemorySaver();
const graph = workflow.compile({ checkpointer });

// 带重试的执行器
async function runWithRecovery(
  threadId: string,
  maxRetries = 3
) {
  const config = { configurable: { thread_id: threadId } };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 检查当前状态
      const currentState = await graph.getState(config);

      if (currentState.next.length === 0 && currentState.values.currentStep > 0) {
        console.log(`[线程 ${threadId}] 已经执行完毕，无需重试`);
        return currentState.values;
      }

      if (attempt > 1) {
        console.log(`[线程 ${threadId}] 第 ${attempt} 次重试，从步骤 ${currentState.values.currentStep} 恢复`);
      } else {
        console.log(`[线程 ${threadId}] 首次执行`);
      }

      // 执行图（如果有 checkpoint，会自动恢复）
      const result = await graph.invoke(
        {
          messages: attempt === 1 ? [new HumanMessage("开始研究")] : [],
          currentStep: 0,
          results: [],
        },
        config
      );

      console.log(`[线程 ${threadId}] 执行成功！`);
      return result;
    } catch (error) {
      console.error(`[线程 ${threadId}] 执行失败: ${error.message}`);

      if (attempt === maxRetries) {
        console.error(`[线程 ${threadId}] 已达最大重试次数，放弃执行`);

        // 打印最后的状态用于调试
        const lastState = await graph.getState(config);
        console.error(`最后状态: step=${lastState.values.currentStep}`);
        throw error;
      }

      // 等待后重试（指数退避）
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`  等待 ${delay}ms 后重试...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// 运行
const result = await runWithRecovery("research-session-001");
console.log("\n最终结果:", result.results);
```

这个执行器的工作流程：

1. 首次执行：从头开始运行研究步骤
2. 如果在步骤 3 时 API 超时：catch 到异常，等待 2 秒
3. 第二次执行：自动从步骤 3 的 checkpoint 恢复，继续执行步骤 4
4. 如果步骤 4 又失败了：等待 4 秒，第三次执行从步骤 4 恢复
5. 三次都失败：打印最后的 State 用于调试，抛出异常

注意 `graph.getState(config)` 在重试逻辑中的作用：它让我们可以在不执行任何 Node 的情况下，检查 Agent 当前的进度，从而决定是否需要继续。

## Checkpointing 与 Streaming 的配合

在实际应用中，Agent 通常是通过 streaming 向前端推送结果的。Checkpointing 和 streaming 可以无缝配合：

```typescript
const config = { configurable: { thread_id: "stream-thread-1" } };

// 使用 stream 代替 invoke
const stream = await graph.stream(
  { messages: [new HumanMessage("开始")], currentStep: 0, results: [] },
  { ...config, streamMode: "updates" }
);

for await (const update of stream) {
  const [nodeName, nodeOutput] = Object.entries(update)[0];
  console.log(`[${nodeName}]`, nodeOutput);
  // 每个 Node 完成后，checkpoint 会自动保存
  // 即使 stream 中途断开，下次用相同 thread_id 可以恢复
}
```

stream 模式下，每产出一个 Node 的更新，对应的 checkpoint 就会被保存。如果 stream 连接断开（比如用户的浏览器关闭了），服务端可以在用户回来时用相同的 thread_id 恢复执行，从断点继续 stream。

## 小结与回顾

本文覆盖了 LangGraph Checkpointing 的核心知识点：

| 概念 | 要点 |
|------|------|
| **Checkpointing 原理** | 每个 Node 执行后自动保存完整 State 快照 |
| **thread_id** | 隔离不同对话 / 执行流的标识符 |
| **checkpoint 链** | 通过 parent_checkpoint_id 形成历史链，支持回溯 |
| **MemorySaver** | 内存存储，零配置，适合开发测试 |
| **SqliteSaver** | 文件存储，适合单机生产 |
| **PostgresSaver** | 数据库存储，适合分布式生产 |
| **时间旅行** | 通过 getStateHistory 查看历史，从任意 checkpoint 重新执行 |
| **故障恢复** | 结合 getState + invoke 实现断点续传 |
| **State 设计** | 避免在 State 中存大对象，用引用代替 |

Checkpointing 把一个原本很复杂的问题（Agent 状态持久化与恢复）变成了几行配置代码。但它的价值不仅仅是"方便"——它让 Agent 具备了生产级的可靠性。一个没有 Checkpointing 的 Agent 在 demo 中看起来很好，但上生产的第一天就会被各种故障教做人。

下一篇，我们将进入 Agent 架构中另一个至关重要的话题：**Human-in-the-Loop（人机协作）**。即使 Agent 能自主运行，很多关键决策仍然需要人类参与——审批、纠偏、提供额外信息。LangGraph 提供了 `interrupt_before` 和 `interrupt_after` 机制，让你可以在图的任意节点暂停执行，等待人类输入后再继续。这和 Checkpointing 紧密结合：暂停时的 State 被保存为 checkpoint，人类回复后从 checkpoint 恢复。

---

*继续阅读：[第 8 篇：Human-in-the-Loop 人机协作](/posts/agent-arch-08-hitl) | 返回：[Agent 工程实战系列目录](/posts/agent-arch-overview)*
