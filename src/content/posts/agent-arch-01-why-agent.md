---
title: '为什么需要 Agent？从 API 调用到自主循环'
description: '从一次真实的 LLM API 调用失败说起，理解 Agent 解决了什么问题，以及 Agent Loop 的核心思想。'
pubDate: 2026-06-19
category: 'AI 工程'
tags: ['Agent', 'LLM', 'Agent Loop', '架构设计']
draft: false
---

> **Agent 架构实战**系列第 1 篇。本系列面向有编程基础但没开发过 Agent 的程序员，侧重实操而非概念。

## 一次真实的"API 调用不够用"

你接到一个需求：做一个技术调研助手，输入一个技术主题（比如"React Server Components vs Islands Architecture"），助手需要：

1. 搜索相关网页
2. 读取搜索到的文档内容
3. 对比不同方案的优劣，输出结构化报告

你打开编辑器，调了 OpenAI API：

```python
import openai

client = openai.OpenAI()

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "你是一个技术调研助手。"},
        {"role": "user", "content": "帮我调研 React Server Components vs Islands Architecture，搜索网页，阅读文档，给出对比报告。"}
    ],
)

print(response.choices[0].message.content)
```

模型返回了一段看起来很有道理的分析。但问题是——**它没有真正搜索任何网页**。它只是基于训练数据中的知识，"编"了一篇对比文章。如果 RSC 上个月刚发布了新特性，模型完全不知道。

你可能会想：那我把搜索工具给它？OpenAI 支持 Tool Calling，我在 API 参数里声明一个 `web_search` 工具不就行了？

```python
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[...],
    tools=[{
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "搜索网页",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"}
                },
                "required": ["query"]
            }
        }
    }]
)
```

这次模型返回了一个 Tool Call：`web_search({"query": "React Server Components vs Islands Architecture 2026"})`。

然后呢？**API 调用结束了。** 模型告诉你"我想搜索这个"，但搜索这件事得你自己来。你得：

1. 解析 Tool Call，执行搜索
2. 把搜索结果塞回 messages，再调一次 API
3. 模型说"我想读这个网页"，你再执行一次读取，再调 API
4. 模型终于有了足够信息，输出报告

整个过程中，**你就是一个手动的人肉 Agent Loop**——每一步都需要你写代码来编排。

这就是"API 调用"和"Agent"之间的分水岭。

## API 调用的 3 个瓶颈

上面的例子暴露了直接调用 LLM API 的三个根本性局限：

### 1. 无执行能力

LLM 是一个纯文本的函数：输入 tokens，输出 tokens。它不能发 HTTP 请求、不能读文件、不能查数据库、不能执行代码。即使你在 prompt 里说"请搜索一下"，它也只能**假装搜索**——基于训练数据编造一个看起来像搜索结果的东西。

Tool Calling 机制让模型能**表达意图**（"我想调用 `web_search`"），但真正执行工具的是你的代码。API 本身不负责执行。

### 2. 无记忆

每次 API 调用都是一次无状态的 HTTP 请求。模型不记得你上一轮问了什么。所谓的"多轮对话"其实是你在每次调用时，把完整的历史 messages 数组重新发一遍：

```python
messages = [
    {"role": "user", "content": "调研 RSC vs Islands"},
    {"role": "assistant", "tool_calls": [...]},        # 第 1 轮
    {"role": "tool", "content": "搜索结果..."},         # 你塞回去的
    {"role": "assistant", "tool_calls": [...]},        # 第 2 轮
    {"role": "tool", "content": "网页内容..."},         # 你又塞回去的
    # 第 3 轮调用时，上面所有消息都要带上
]
```

对话越长，messages 数组越大，token 消耗越高，延迟也越大。而 API 本身对此毫无感知——它只是忠实地处理你传过来的文本。

### 3. 无自主决策

最核心的问题：**谁来决定下一步做什么？**

在上面的调研场景中，一个有经验的调研员会自然地做出判断：搜索结果够不够？要不要换个关键词再搜？这篇文档是否值得细读？要不要去找原作者的博客？

但 API 调用不会做这些判断。每一步的决策权都在写代码的你手里。你硬编码了"先搜索 → 再读取 → 再总结"的流程，模型只是每一步的执行者，不是流程的控制者。

## Agent 的本质：LLM + Tools + Loop

理解了上面三个瓶颈，Agent 的定义就水到渠成了：

**Agent = LLM（推理引擎） + Tools（执行能力） + Loop（自主决策循环）**

用 4 行伪代码概括整个 Agent 架构的核心：

```
while not done:
    action = llm.decide(context)
    result = execute(action)
    context.append(result)
```

LLM 根据当前上下文决定下一步做什么（调用工具还是输出最终结果），你的代码执行这个动作并把结果喂回上下文，然后循环继续——直到 LLM 认为任务完成。

这正是 ReAct 论文（[Yao et al., 2022](https://arxiv.org/abs/2210.03629)）提出的核心范式：**推理（Reasoning）和行动（Acting）交替进行**。模型先思考"我应该搜索什么"，然后执行搜索，看到搜索结果后再思考"这些结果够不够，要不要再搜"，如此循环。相比纯推理（Chain-of-Thought 容易产生幻觉）或纯行动（没有思考指导的盲目操作），ReAct 的优势在于每一步行动都有推理支撑，每一步推理都有行动结果作为依据。

Anthropic 在 ["Building effective agents"](https://www.anthropic.com/research/building-effective-agents)（2024.12）中也强调了这一点：真正的 Agent "dynamically direct their own processes"——动态地指导自身的流程，而非沿着预定义的路径执行。Agent 通过持续的循环，从执行结果中获取"ground truth"来评估进展。

主流框架对这个模式的封装也高度一致：

- **OpenAI Agents SDK**：Agent 是"配备指令和工具的 LLM"，内置 Agent Loop "处理工具调用、将结果发送回 LLM，并持续运行直到任务完成"。
- **Vercel AI SDK**：Agents 的定义直接就是"large language models (LLMs) that use tools in a loop to accomplish tasks"。

不同的框架，同一个核心模式。

## 实操：手动编排 vs Agent Loop

下面用两种方式完成同一个任务：给定一个 GitHub 仓库地址，获取仓库信息、最近 5 个 issue 的标题，然后生成一份简报。

### 方式一：手动编排（3 次 API 调用）

```python
# pip install openai httpx
import openai, httpx, json

client = openai.OpenAI()
repo = "facebook/react"

# 第 1 步：让模型决定要获取什么信息
resp1 = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "你是一个 GitHub 分析助手。"},
        {"role": "user", "content": f"分析仓库 {repo}，告诉我它的基本信息和最近 5 个 issue。"}
    ],
    tools=[
        {
            "type": "function",
            "function": {
                "name": "get_repo_info",
                "description": "获取 GitHub 仓库信息",
                "parameters": {
                    "type": "object",
                    "properties": {"repo": {"type": "string"}},
                    "required": ["repo"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_recent_issues",
                "description": "获取最近的 issue 列表",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "repo": {"type": "string"},
                        "count": {"type": "integer"}
                    },
                    "required": ["repo", "count"]
                }
            }
        }
    ]
)

# 手动解析 tool calls 并执行
messages = [
    {"role": "system", "content": "你是一个 GitHub 分析助手。"},
    {"role": "user", "content": f"分析仓库 {repo}，告诉我它的基本信息和最近 5 个 issue。"},
    resp1.choices[0].message
]

for tool_call in resp1.choices[0].message.tool_calls or []:
    if tool_call.function.name == "get_repo_info":
        # 实际项目中这里应该调用 GitHub API
        result = json.dumps({"stars": 228000, "language": "JavaScript", "description": "A declarative, efficient, and flexible JavaScript library for building user interfaces."})
    elif tool_call.function.name == "get_recent_issues":
        result = json.dumps({"issues": [
            {"title": "Fix hydration mismatch in Server Components"},
            {"title": "Improve Suspense boundary handling"},
            {"title": "Memory leak in concurrent mode"},
            {"title": "TypeScript types missing for use()"},
            {"title": "Docs: Update hooks FAQ"}
        ]})
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": result
    })

# 第 2 步：带上工具结果，再调一次 API
resp2 = client.chat.completions.create(
    model="gpt-4o",
    messages=messages,
)

print(resp2.choices[0].message.content)
```

这段代码的问题一目了然：**你在手动编排每一步**。如果模型第一次决定只调一个工具怎么办？如果它需要追加调用第三个工具怎么办？如果某个工具调用失败了要重试怎么办？这些情况你都得用 if/else 和 try/catch 手动处理。

### 方式二：最简 Agent Loop

```python
# pip install openai
import openai, json

client = openai.OpenAI()

# 定义工具的实际执行函数
TOOLS = {
    "get_repo_info": lambda args: json.dumps({
        "stars": 228000, "language": "JavaScript",
        "description": "A declarative, efficient, and flexible JavaScript library."
    }),
    "get_recent_issues": lambda args: json.dumps({
        "issues": [
            {"title": "Fix hydration mismatch"},
            {"title": "Improve Suspense boundary"},
            {"title": "Memory leak in concurrent mode"},
            {"title": "TypeScript types missing for use()"},
            {"title": "Docs: Update hooks FAQ"}
        ]
    }),
}

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_repo_info",
            "description": "获取 GitHub 仓库信息",
            "parameters": {
                "type": "object",
                "properties": {"repo": {"type": "string"}},
                "required": ["repo"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_issues",
            "description": "获取最近的 issue 列表",
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {"type": "string"},
                    "count": {"type": "integer"}
                },
                "required": ["repo", "count"]
            }
        }
    }
]

def run_agent(user_message: str, max_turns: int = 10) -> str:
    """一个最小但完整的 Agent Loop。"""
    messages = [
        {"role": "system", "content": "你是一个 GitHub 分析助手。你可以使用工具来获取信息。"},
        {"role": "user", "content": user_message}
    ]

    for turn in range(max_turns):
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOL_SCHEMAS,
        )

        msg = response.choices[0].message
        messages.append(msg)

        # 如果没有 tool calls，说明模型认为任务完成了
        if not msg.tool_calls:
            return msg.content

        # 执行所有 tool calls，把结果喂回上下文
        for tool_call in msg.tool_calls:
            fn = TOOLS.get(tool_call.function.name)
            if fn:
                args = json.loads(tool_call.function.arguments)
                result = fn(args)
            else:
                result = json.dumps({"error": f"Unknown tool: {tool_call.function.name}"})
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result
            })

    return "达到最大轮次限制，任务未完成。"

# 一行调用，Agent 自主完成所有步骤
result = run_agent("分析仓库 facebook/react，告诉我它的基本信息和最近 5 个 issue，生成简报。")
print(result)
```

核心差异在哪？

**手动编排**的代码量随任务复杂度**线性增长**。每多一步，你就要多写一段解析、执行、拼接的代码。而且流程是**硬编码**的——如果模型想换个思路，你的代码不支持。

**Agent Loop** 的代码量是**常量级**的。不管任务需要 2 步还是 20 步，循环体都是那段代码。流程由模型**动态决定**——它可以先查仓库信息，再查 issue，也可以反过来，甚至在看到 issue 后决定再去查 PR。你不需要为每种路径写代码。

### TypeScript 版本

如果你更熟悉 Node.js/TypeScript 生态，下面是等价的 Agent Loop 实现：

```typescript
// npm install openai
import OpenAI from "openai";

const client = new OpenAI();

type ToolFn = (args: Record<string, unknown>) => string;

const tools: Record<string, ToolFn> = {
  get_repo_info: () =>
    JSON.stringify({
      stars: 228000,
      language: "JavaScript",
      description: "A declarative, efficient, and flexible JavaScript library.",
    }),
  get_recent_issues: () =>
    JSON.stringify({
      issues: [
        { title: "Fix hydration mismatch" },
        { title: "Improve Suspense boundary" },
        { title: "Memory leak in concurrent mode" },
        { title: "TypeScript types missing for use()" },
        { title: "Docs: Update hooks FAQ" },
      ],
    }),
};

const toolSchemas: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_repo_info",
      description: "获取 GitHub 仓库信息",
      parameters: {
        type: "object",
        properties: { repo: { type: "string" } },
        required: ["repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_issues",
      description: "获取最近的 issue 列表",
      parameters: {
        type: "object",
        properties: {
          repo: { type: "string" },
          count: { type: "integer" },
        },
        required: ["repo", "count"],
      },
    },
  },
];

async function runAgent(userMessage: string, maxTurns = 10): Promise<string> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: "你是一个 GitHub 分析助手。你可以使用工具来获取信息。" },
    { role: "user", content: userMessage },
  ];

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: toolSchemas,
    });

    const msg = response.choices[0].message;
    messages.push(msg);

    // 没有 tool calls → 任务完成
    if (!msg.tool_calls) {
      return msg.content ?? "";
    }

    // 执行所有 tool calls
    for (const toolCall of msg.tool_calls) {
      const fn = tools[toolCall.function.name];
      const result = fn
        ? fn(JSON.parse(toolCall.function.arguments))
        : JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` });

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  return "达到最大轮次限制，任务未完成。";
}

// 使用
const result = await runAgent(
  "分析仓库 facebook/react，告诉我它的基本信息和最近 5 个 issue，生成简报。"
);
console.log(result);
```

结构和 Python 版本完全一致——循环、判断、执行、追加结果。Agent Loop 的核心思想与语言无关。

## 决策指南：什么时候该用 Agent，什么时候不该

不是所有场景都需要 Agent。Anthropic 在博客中明确建议"maintain simplicity"——先尝试最简单的方案，只在必要时引入 Agent。过度工程化是 Agent 开发中最常见的反模式。

下面是一个实用的判断矩阵：

| 判断维度 | 简单 API 调用 | Agent |
|---------|-------------|-------|
| **任务步骤** | 固定 1-2 步，流程可预测 | 步骤数不确定，依赖中间结果 |
| **是否需要工具** | 不需要，或只需 1 个固定工具 | 需要多个工具，且调用顺序不固定 |
| **状态保持** | 单轮交互即可，无需跨轮次记忆 | 需要跨轮次积累信息，逐步收敛到答案 |
| **容错要求** | 失败了重试整个请求即可 | 某一步失败后需要根据错误信息调整策略 |
| **输出确定性** | 相同输入期望相同输出格式 | 输出格式和内容随执行路径变化 |

**该用简单 API 调用的场景：**

- 文本分类、情感分析——一次调用，输入明确，输出固定
- 翻译、摘要——不需要外部信息，不需要多步推理
- 格式转换（Markdown → HTML）——确定性任务，没有分支

**该用 Agent 的场景：**

- 技术调研——搜索 → 筛选 → 阅读 → 对比 → 总结，步骤数不确定
- 代码调试——读代码 → 定位问题 → 尝试修复 → 运行测试 → 验证，可能需要反复迭代
- 数据分析——查询数据库 → 观察结果 → 调整查询 → 可视化，路径由数据驱动
- 自动化运维——监控指标 → 发现异常 → 诊断原因 → 执行修复，每步都可能触发不同工具

**一条经验法则：** 如果你在写编排代码时发现自己写了超过 2 层嵌套的 if/else 来处理不同路径，那大概率应该用 Agent Loop 替代手写编排。

## 小结

回到开头的三个瓶颈，Agent 分别解决了：

| 瓶颈 | Agent 的解法 |
|------|------------|
| 无执行能力 | 通过 Tools 赋予 LLM 与外部世界交互的能力 |
| 无记忆 | 通过 Loop 中的 context 累积维护对话状态 |
| 无自主决策 | 将决策权从人类代码移交给 LLM，由模型根据上下文动态选择下一步 |

但 Agent 不是银弹。它引入了新的复杂度：循环可能失控（死循环或无限调用工具）、token 消耗不可预测、调试更困难（模型的决策路径不透明）。这就是为什么本系列后续会花大量篇幅讨论 **Guardrails**、**成本控制**、**可观测性** 和 **测试**——这些才是把 Agent 从 demo 搬到生产环境的关键。

## 下一步

你已经理解了 Agent 的核心思想：LLM + Tools + Loop。在第 2 篇 **《构建你的第一个 Agent Loop》** 中，我们会把这个最小循环扩展成一个可用的 Agent 框架——加入错误处理、工具注册机制、最大步数限制、以及让 Agent 输出"思考过程"的能力。

---

**参考资料：**

- Anthropic, ["Building effective agents"](https://www.anthropic.com/research/building-effective-agents), 2024.12
- Yao et al., ["ReAct: Synergizing Reasoning and Acting in Language Models"](https://arxiv.org/abs/2210.03629), arXiv:2210.03629
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/zh/) — Agent Loop 与 Runner 设计
- [Vercel AI SDK — Agents](https://ai-sdk.dev/docs/foundations/agents) — LLM + Tools + Loop 的定义
