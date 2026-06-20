---
title: '动手构建你的第一个 Agent Loop'
description: '从零实现一个可运行的 Agent Loop，包含工具注册、上下文管理和终止条件，用 Python 和 TypeScript 双语实现。'
pubDate: 2026-06-19
category: 'AI 工程'
tags: ['Agent Loop', 'ReAct', 'Python', 'TypeScript', '实操']
series: 'Agent 工程实战'
seriesOrder: 2
draft: false
---

上一篇我们聊了[为什么需要 Agent](/posts/agent-arch-01-why-agent)——单次 LLM 调用无法处理需要多步推理和外部交互的任务。这篇直接动手：从零开始，逐步构建一个可运行的 Agent Loop。

读完这篇，你将拥有一个能自动 clone GitHub 仓库、分析文件结构、总结技术栈的"代码分析 Agent"。

所有代码双语实现（Python + TypeScript），每一步都可以独立运行。

## Agent Loop 的骨架：一个 while 循环

先忘掉所有框架和抽象。一个 Agent Loop 的最小形态只有 5 行伪代码：

```
while not done:
    response = call_llm(messages)
    if response.has_tool_calls:
        results = execute_tools(response.tool_calls)
        messages.append(results)
    else:
        done = true  # 模型认为任务完成
```

这就是全部。一个 while 循环，三个动作：调用模型、执行工具、判断是否结束。接下来我们一步步把这个骨架变成真正能用的系统。

## Step 1：最小循环 + 硬编码工具

### 目标

让 Agent 能调用预定义的工具，并将结果回传给模型进行下一步推理。

### Python 实现

安装依赖：

```bash
pip install openai
```

```python
import json
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

# ---- 两个硬编码的工具函数 ----
def calculator(expression: str) -> str:
    """计算数学表达式"""
    try:
        result = eval(expression, {"__builtins__": {}})
        return str(result)
    except Exception as e:
        return f"计算错误: {e}"

def get_weather(city: str) -> str:
    """查询天气（模拟数据）"""
    data = {"北京": "晴，26°C", "上海": "多云，22°C", "深圳": "阵雨，28°C"}
    return data.get(city, f"未知城市: {city}")

# OpenAI function calling schema——告诉模型有哪些工具可用
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "计算数学表达式，如 '2 + 3 * 4'",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {"type": "string", "description": "数学表达式"}
                },
                "required": ["expression"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "查询指定城市的天气",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名称"}
                },
                "required": ["city"],
            },
        },
    },
]

# ---- Agent Loop ----
def agent_loop(user_message: str, max_turns: int = 10) -> str:
    messages = [
        {"role": "system", "content": "你是一个有帮助的助手。善用工具来回答问题。"},
        {"role": "user", "content": user_message},
    ]

    for turn in range(max_turns):
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )
        message = response.choices[0].message

        # 终止条件：模型返回纯文本，没有工具调用
        if not message.tool_calls:
            return message.content

        # 将模型的 assistant 消息加入历史
        messages.append(message)

        # 执行工具调用，将结果回传
        for tool_call in message.tool_calls:
            name = tool_call.function.name
            args = json.loads(tool_call.function.arguments)

            # 硬编码分发（Step 2 会改进）
            if name == "calculator":
                result = calculator(**args)
            elif name == "get_weather":
                result = get_weather(**args)
            else:
                result = f"错误：未知工具 {name}"

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": str(result),
            })

    return "未能在限定轮次内完成任务。"


if __name__ == "__main__":
    answer = agent_loop("北京现在天气如何？顺便算一下 123 * 456 等于多少。")
    print(answer)
```

运行这段代码，你会看到模型先调用 `get_weather("北京")` 和 `calculator("123 * 456")`，拿到结果后生成一段自然语言总结。整个过程自动完成，不需要你手动编排调用顺序。

### TypeScript 实现

安装依赖：

```bash
npm install ai @ai-sdk/openai zod
```

```typescript
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// ---- 工具定义 ----
const tools = {
  calculator: tool({
    description: '计算数学表达式，如 "2 + 3 * 4"',
    parameters: z.object({
      expression: z.string().describe('数学表达式'),
    }),
    execute: async ({ expression }) => {
      try {
        // 安全起见用 Function 构造器，生产环境请用 mathjs
        const result = new Function(`return ${expression}`)();
        return String(result);
      } catch (e) {
        return `计算错误: ${e}`;
      }
    },
  }),

  getWeather: tool({
    description: '查询指定城市的天气',
    parameters: z.object({
      city: z.string().describe('城市名称'),
    }),
    execute: async ({ city }) => {
      const data: Record<string, string> = {
        '北京': '晴，26°C',
        '上海': '多云，22°C',
        '深圳': '阵雨，28°C',
      };
      return data[city] ?? `未知城市: ${city}`;
    },
  }),
};

// ---- Agent Loop（Vercel AI SDK 的 maxSteps 自动驱动循环）----
async function agentLoop(userMessage: string) {
  const result = await generateText({
    model: openai('gpt-4o'),
    system: '你是一个有帮助的助手。善用工具来回答问题。',
    prompt: userMessage,
    tools,
    maxSteps: 10, // 框架自动执行循环，最多 10 步
  });

  return result.text;
}

agentLoop('北京现在天气如何？顺便算一下 123 * 456 等于多少。')
  .then(console.log)
  .catch(console.error);
```

Vercel AI SDK 的 `generateText` + `maxSteps` 帮你封装了 while 循环——当 `maxSteps > 1` 时，SDK 会自动把工具执行结果回传模型，直到模型不再请求工具调用或达到步数上限。

**这一步的关键收获：** Agent Loop 的本质就是"模型输出 → 工具执行 → 结果回传 → 模型再输出"的循环。Python 版本显式写了 `for` 循环，TypeScript 版本由 SDK 内部管理循环，但底层逻辑完全一致。

## Step 2：工具注册表 + 动态分发

Step 1 的问题是硬编码的 `if/elif` 分发——每加一个工具就要改循环代码。我们需要一个注册表，让工具的添加和循环逻辑解耦。

### Python：装饰器注册

```python
from dataclasses import dataclass
from typing import Callable, Any
import json

@dataclass
class Tool:
    name: str
    description: str
    parameters: dict  # JSON Schema
    fn: Callable

class ToolRegistry:
    """工具注册表：名称 → 工具对象"""

    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, description: str, parameters: dict | None = None):
        """装饰器：将函数注册为 Agent 工具"""
        def decorator(fn: Callable):
            tool = Tool(
                name=fn.__name__,
                description=description or fn.__doc__ or "",
                parameters=parameters or {"type": "object", "properties": {}},
                fn=fn,
            )
            self._tools[tool.name] = tool
            return fn
        return decorator

    def execute(self, name: str, args: dict) -> str:
        """动态分发：从注册表查找并执行工具，隔离错误"""
        if name not in self._tools:
            return json.dumps({"error": f"未知工具: {name}"})
        try:
            result = self._tools[name].fn(**args)
            return json.dumps({"result": result}, ensure_ascii=False)
        except Exception as e:
            # 关键：工具错误不终止循环，而是作为结果返回给模型
            return json.dumps({"error": f"{type(e).__name__}: {e}"})

    def get_openai_schemas(self) -> list[dict]:
        """生成 OpenAI function calling 所需的 schema 列表"""
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            }
            for t in self._tools.values()
        ]


# ---- 使用 ----
registry = ToolRegistry()

@registry.register(
    description="计算数学表达式",
    parameters={
        "type": "object",
        "properties": {"expression": {"type": "string"}},
        "required": ["expression"],
    },
)
def calculator(expression: str) -> str:
    return str(eval(expression, {"__builtins__": {}}))

@registry.register(
    description="查询指定城市的天气",
    parameters={
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"],
    },
)
def get_weather(city: str) -> str:
    data = {"北京": "晴，26°C", "上海": "多云，22°C"}
    return data.get(city, f"未知城市: {city}")

# Agent Loop 不再硬编码工具名——完全通过注册表驱动
def agent_loop_v2(user_message: str, max_turns: int = 10) -> str:
    messages = [
        {"role": "system", "content": "你是一个有帮助的助手。"},
        {"role": "user", "content": user_message},
    ]

    for turn in range(max_turns):
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=registry.get_openai_schemas(),
            tool_choice="auto",
        )
        message = response.choices[0].message

        if not message.tool_calls:
            return message.content

        messages.append(message)

        for tool_call in message.tool_calls:
            # 动态分发：一行代码处理所有工具
            result = registry.execute(
                tool_call.function.name,
                json.loads(tool_call.function.arguments),
            )
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result,
            })

    return "未能在限定轮次内完成任务。"
```

### TypeScript：对象即注册表

TypeScript 版本天然不需要额外的注册表——`tools` 对象本身就是注册表：

```typescript
import { generateText, tool, type ToolSet } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// tools 对象本身就是注册表，每个 key 就是工具名
const toolRegistry = {
  calculator: tool({
    description: '计算数学表达式',
    parameters: z.object({ expression: z.string() }),
    execute: async ({ expression }) => {
      try {
        return String(new Function(`return ${expression}`)());
      } catch (e) {
        return `计算错误: ${e}`;
      }
    },
  }),
  getWeather: tool({
    description: '查询指定城市的天气',
    parameters: z.object({ city: z.string() }),
    execute: async ({ city }) => {
      const data: Record<string, string> = {
        '北京': '晴，26°C',
        '上海': '多云，22°C',
      };
      return data[city] ?? `未知城市: ${city}`;
    },
  }),
} satisfies ToolSet;

async function agentLoopV2(userMessage: string) {
  const result = await generateText({
    model: openai('gpt-4o'),
    system: '你是一个有帮助的助手。',
    prompt: userMessage,
    tools: toolRegistry,
    maxSteps: 10,
  });
  return result.text;
}
```

**这一步的关键收获：** 工具注册表将"有哪些工具"和"循环怎么跑"彻底解耦。添加新工具只需要注册，不需要改动循环代码。这也是所有主流 Agent 框架（OpenAI Agents SDK、LangGraph、Claude Code）的共同设计。

## Step 3：上下文管理

每轮循环都在往 `messages` 数组追加消息。如果不加控制，上下文会无限膨胀，最终导致 API 报错或费用飙升。

### 问题有多严重

假设一个 Agent 执行了 8 轮，每轮工具返回 3000 字符。仅工具结果就有 24000 字符（约 6000 tokens），加上模型自身的推理输出，很容易突破上下文窗口限制。

### Python：三级截断策略

```python
class ContextManager:
    """管理消息历史的 token 预算"""

    def __init__(self, max_tokens: int = 128_000, reserve: int = 16_000):
        self.max_tokens = max_tokens
        self.reserve = reserve

    def estimate_tokens(self, messages: list[dict]) -> int:
        """粗略估算：1 token ≈ 4 个英文字符 / 1.5 个中文字符"""
        total_chars = sum(len(json.dumps(m, ensure_ascii=False)) for m in messages)
        return int(total_chars / 3.5)

    def manage(self, messages: list[dict]) -> list[dict]:
        """
        三级策略：
        1. 截断过长的单条工具输出
        2. 丢弃早期对话的中间消息（保留 system + 最近 N 轮）
        3. 用模型摘要压缩旧历史
        """
        messages = self._truncate_long_outputs(messages)

        if self.estimate_tokens(messages) <= self.max_tokens - self.reserve:
            return messages

        messages = self._keep_recent(messages, keep_recent=12)

        if self.estimate_tokens(messages) <= self.max_tokens - self.reserve:
            return messages

        messages = self._summarize_old(messages)
        return messages

    def _truncate_long_outputs(
        self, messages: list[dict], max_chars: int = 2000
    ) -> list[dict]:
        """Level 1: 截断过长的工具输出，保留首尾"""
        result = []
        for msg in messages:
            if msg["role"] == "tool" and len(msg.get("content", "")) > max_chars:
                content = msg["content"]
                half = max_chars // 2
                msg = {
                    **msg,
                    "content": (
                        content[:half]
                        + f"\n...[截断 {len(content) - max_chars} 字符]...\n"
                        + content[-half:]
                    ),
                }
            result.append(msg)
        return result

    def _keep_recent(self, messages: list[dict], keep_recent: int) -> list[dict]:
        """Level 2: 保留 system 消息 + 最近 N 条"""
        system_msgs = [m for m in messages if m["role"] == "system"]
        other_msgs = [m for m in messages if m["role"] != "system"]
        return system_msgs + other_msgs[-keep_recent:]

    def _summarize_old(self, messages: list[dict]) -> list[dict]:
        """Level 3: 将旧消息交给模型生成摘要"""
        system_msgs = [m for m in messages if m["role"] == "system"]
        other_msgs = [m for m in messages if m["role"] != "system"]

        if len(other_msgs) <= 6:
            return messages  # 太短，不值得压缩

        old = other_msgs[:-6]
        recent = other_msgs[-6:]

        # 用小模型做摘要，控制成本
        conv_text = "\n".join(
            f"[{m['role']}] {json.dumps(m.get('content', ''), ensure_ascii=False)}"
            for m in old
        )
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": (
                    "请用 200 字以内总结以下对话历史的关键信息，"
                    "保留重要的工具调用结果和决策结论：\n\n" + conv_text
                ),
            }],
            max_tokens=500,
        )
        summary = resp.choices[0].message.content

        return system_msgs + [
            {"role": "system", "content": f"[之前的对话摘要]\n{summary}"}
        ] + recent
```

在循环中使用：

```python
ctx = ContextManager()

def agent_loop_v3(user_message: str, max_turns: int = 10) -> str:
    messages = [
        {"role": "system", "content": "你是一个有帮助的助手。"},
        {"role": "user", "content": user_message},
    ]

    for turn in range(max_turns):
        # 每轮开始前管理上下文
        messages = ctx.manage(messages)

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=registry.get_openai_schemas(),
        )
        message = response.choices[0].message

        if not message.tool_calls:
            return message.content

        messages.append(message)
        for tc in message.tool_calls:
            result = registry.execute(tc.function.name, json.loads(tc.function.arguments))
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })

    return "未能在限定轮次内完成任务。"
```

### TypeScript：prepareStep 钩子

Vercel AI SDK v6 的 `ToolLoopAgent` 提供 `prepareStep` 钩子，在每步执行前动态调整上下文：

```typescript
import { ToolLoopAgent, tool, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const agent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  system: '你是一个有帮助的助手。',
  tools: toolRegistry,
  stopWhen: stepCountIs(10),

  // prepareStep: 每步执行前的上下文管理钩子
  prepareStep: async ({ messages, stepCount }) => {
    // 策略 1: 截断过长的工具输出
    const managed = messages.map((msg) => {
      if (
        msg.role === 'tool' &&
        typeof msg.content === 'string' &&
        msg.content.length > 2000
      ) {
        const half = 1000;
        return {
          ...msg,
          content:
            msg.content.slice(0, half) +
            '\n...[已截断]...\n' +
            msg.content.slice(-half),
        };
      }
      return msg;
    });

    // 策略 2: 步数过多时，只保留最近的上下文
    if (stepCount > 5) {
      const systemMsgs = managed.filter((m) => m.role === 'system');
      const recentMsgs = managed.filter((m) => m.role !== 'system').slice(-8);
      return { messages: [...systemMsgs, ...recentMsgs] };
    }

    return { messages: managed };
  },
});

const result = await agent.generate({ prompt: '你的任务描述' });
console.log(result.text);
```

**这一步的关键收获：** 上下文是有限资源，必须主动管理。核心策略就三个：截断单条过长输出、丢弃早期消息、摘要压缩旧历史。生产系统（如 Claude Code）会做到五级压缩，但三级已经足够覆盖绝大多数场景。

## Step 4：终止条件

循环什么时候结束？这个问题比看起来复杂。至少有三种终止路径：

1. **正常终止**：模型认为任务完成，返回纯文本（无工具调用）
2. **保护终止**：达到最大步数限制，防止无限循环
3. **异常终止**：API 调用失败、工具崩溃、上下文溢出

### Python：完整的终止处理

```python
import time

class AgentError(Exception):
    """Agent 执行异常"""
    pass

def agent_loop_v4(
    user_message: str,
    max_turns: int = 15,
    max_retries: int = 3,
    max_consecutive_errors: int = 3,
) -> str:
    messages = [
        {"role": "system", "content": "你是一个有帮助的助手。完成任务后直接回复结果即可。"},
        {"role": "user", "content": user_message},
    ]

    consecutive_errors = 0

    for turn in range(max_turns):
        # ---- 上下文管理 ----
        messages = ctx.manage(messages)

        # ---- 调用模型（带重试） ----
        response = None
        for attempt in range(max_retries):
            try:
                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    tools=registry.get_openai_schemas(),
                    tool_choice="auto",
                )
                consecutive_errors = 0  # 成功则重置
                break
            except Exception as e:
                if attempt < max_retries - 1:
                    wait = 2 ** attempt  # 指数退避：1s, 2s, 4s
                    print(f"API 调用失败，{wait}s 后重试: {e}")
                    time.sleep(wait)
                else:
                    raise AgentError(f"API 调用连续失败 {max_retries} 次: {e}")

        message = response.choices[0].message

        # ---- 终止条件 1: 模型不再请求工具调用 ----
        if not message.tool_calls:
            return message.content

        messages.append(message)

        # ---- 执行工具（带错误隔离） ----
        for tc in message.tool_calls:
            try:
                result = registry.execute(
                    tc.function.name,
                    json.loads(tc.function.arguments),
                )
                consecutive_errors = 0
            except Exception as e:
                consecutive_errors += 1
                result = json.dumps({"error": f"工具执行异常: {e}"})

                if consecutive_errors >= max_consecutive_errors:
                    return (
                        f"连续 {max_consecutive_errors} 次工具执行失败，"
                        f"Agent 提前终止。最后错误: {result}"
                    )

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })

    # ---- 终止条件 2: 达到最大步数 ----
    return (
        f"任务在 {max_turns} 轮后仍未完成，已强制终止。"
        f"最后一条消息: {messages[-1].get('content', '')[:200]}"
    )
```

### TypeScript：stopWhen + 错误处理

```typescript
import { ToolLoopAgent, tool, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const robustAgent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  system: '你是一个有帮助的助手。完成任务后直接回复结果即可。',
  tools: toolRegistry,

  // 组合多个终止条件
  stopWhen: [
    stepCountIs(15),  // 保护终止：最多 15 步
    // 自定义终止条件：检测到特定工具被调用时停止
    (step) => {
      return step.toolCalls.some(
        (call) => call.toolName === 'taskComplete'
      );
    },
  ],
});

// 用 try/catch 处理异常终止
async function runAgent(userMessage: string) {
  try {
    const result = await robustAgent.generate({ prompt: userMessage });
    return result.text;
  } catch (error) {
    if (error instanceof Error && error.message.includes('maxSteps')) {
      return '任务在限定步数内未能完成，请简化需求或增加步数限制。';
    }
    throw error;
  }
}
```

**这一步的关键收获：** `max_turns` 不是可选项——它是防止 Agent 进入无限循环的最后一道防线。生产环境中你还需要：指数退避重试、连续错误计数器、以及优雅的提前终止机制。

## Step 5：ReAct 格式——让模型"想清楚再动手"

ReAct（Reasoning + Acting）是 Agent Loop 的学术基础，来自 2022 年的论文 [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)。

核心思想是让模型在调用工具之前，先输出一段 **思考过程**（Thought），然后再决定 **行动**（Action）。工具返回的结果作为 **观察**（Observation），供下一轮思考使用。

```
Thought:  用户想知道这个 GitHub 仓库用的什么技术栈。我应该先 clone 仓库，
          然后查看目录结构。
Action:   shell_exec("git clone https://github.com/user/repo /tmp/repo")
Observation: Cloning into '/tmp/repo'... done.

Thought:  Clone 成功了。接下来看看根目录有哪些文件。
Action:   shell_exec("ls -la /tmp/repo")
Observation: total 48
             drwxr-xr-x  package.json
             drwxr-xr-x  tsconfig.json
             drwxr-xr-x  src/
             ...

Thought:  看到有 package.json 和 tsconfig.json，这是一个 TypeScript 项目。
          让我读一下 package.json 确认依赖。
Action:   read_file("/tmp/repo/package.json")
Observation: { "name": "my-app", "dependencies": { "next": "^14.0.0", ... } }

Thought:  这是一个基于 Next.js 14 的项目，使用 TypeScript，依赖包括...
          我已经收集到足够信息，可以总结了。
Action:   summarize(...)
```

在现代 Agent 框架中，ReAct 的 Thought 部分通常由模型的 system prompt 引导产生，而 Action/Observation 则由 function calling 机制自动处理。你不需要手动解析文本格式的 Thought/Action——但通过 prompt 引导模型"先想后做"仍然非常有效。

### Python：通过 System Prompt 实现 ReAct 引导

```python
REACT_SYSTEM_PROMPT = """你是一个代码分析 Agent。在调用工具之前，先简要说明你的思考过程。

你的工作流程：
1. 思考（Thought）：分析当前状态，决定下一步做什么
2. 行动（Action）：调用工具执行
3. 观察（Observation）：阅读工具返回结果

可用工具：
- shell_exec: 执行 shell 命令（clone 仓库、ls、find 等）
- read_file: 读取文件内容
- summarize: 对收集到的信息生成最终报告

规则：
- 每次只调用一个工具（除非两个操作完全独立）
- 工具返回出错时，分析原因再决定重试还是换方案
- 收集到足够信息后，调用 summarize 生成最终报告
- 报告应该包含：技术栈、目录结构概述、关键依赖"""

def agent_loop_react(user_message: str, max_turns: int = 15) -> str:
    messages = [
        {"role": "system", "content": REACT_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    for turn in range(max_turns):
        messages = ctx.manage(messages)

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=registry.get_openai_schemas(),
            tool_choice="auto",
        )
        message = response.choices[0].message

        if not message.tool_calls:
            return message.content

        # 打印模型的思考过程（如果有文本输出伴随工具调用）
        if message.content:
            print(f"[Thought] {message.content}")

        messages.append(message)

        for tc in message.tool_calls:
            name = tc.function.name
            args = json.loads(tc.function.arguments)
            print(f"[Action] {name}({json.dumps(args, ensure_ascii=False)})")

            result = registry.execute(name, args)
            print(f"[Observation] {result[:200]}...")

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })

    return "任务未能在限定轮次内完成。"
```

### TypeScript：ToolLoopAgent + prepareStep 日志

```typescript
const reactAgent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  system: `你是一个代码分析 Agent。在调用工具之前，先简要说明你的思考过程。

你的工作流程：
1. 思考（Thought）：分析当前状态，决定下一步做什么
2. 行动（Action）：调用工具执行
3. 观察（Observation）：阅读工具返回结果

规则：
- 每次只调用一个工具（除非两个操作完全独立）
- 工具返回出错时，分析原因再决定重试还是换方案
- 收集到足够信息后，调用 summarize 生成最终报告`,
  tools: toolRegistry,
  stopWhen: stepCountIs(15),

  prepareStep: async ({ stepCount }) => {
    // 可以在这里动态调整 prompt 或工具集
    if (stepCount > 10) {
      return {
        system: '你已经执行了很多步。请尽快总结已有信息，调用 summarize 结束任务。',
      };
    }
    return {};
  },
});
```

**这一步的关键收获：** ReAct 不是要求你手动解析文本格式的 "Thought: ... Action: ..."。现代实现通过 system prompt 引导模型先思考后行动，通过 function calling 机制自动处理 Action/Observation 的传递。关键是在 prompt 中明确告诉模型"先想后做"的工作流程。

## 实操案例：代码分析 Agent

现在把前 5 步的所有知识组装起来，构建一个真正有用的 Agent——给它一个 GitHub 仓库 URL，它自动 clone、分析文件结构、总结技术栈。

### Python 完整版

```bash
pip install openai
```

```python
"""
代码分析 Agent —— 给定 GitHub repo URL，自动 clone、分析结构、总结技术栈。

依赖: pip install openai
运行: export OPENAI_API_KEY="sk-..." && python code_analyzer.py
"""

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Callable

from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])


# =============================================================
# 1. 工具注册表
# =============================================================

@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    fn: Callable


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, description: str, parameters: dict | None = None):
        def decorator(fn):
            self._tools[fn.__name__] = Tool(
                name=fn.__name__,
                description=description or fn.__doc__ or "",
                parameters=parameters or {"type": "object", "properties": {}},
                fn=fn,
            )
            return fn
        return decorator

    def execute(self, name: str, args: dict) -> str:
        if name not in self._tools:
            return json.dumps({"error": f"未知工具: {name}"})
        try:
            result = self._tools[name].fn(**args)
            return json.dumps({"result": result}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": f"{type(e).__name__}: {e}"})

    def schemas(self) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            }
            for t in self._tools.values()
        ]


# =============================================================
# 2. 工具定义
# =============================================================

# 安全沙箱：所有命令限定在临时目录内
_work_dir = tempfile.mkdtemp(prefix="agent_repo_")

registry = ToolRegistry()


@registry.register(
    description="执行 shell 命令。命令会在隔离的临时目录中运行。用于 git clone、ls、find、wc 等操作。",
    parameters={
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": "要执行的 shell 命令",
            }
        },
        "required": ["command"],
    },
)
def shell_exec(command: str) -> str:
    """执行 shell 命令，带超时和输出截断"""
    result = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True,
        timeout=60,
        cwd=_work_dir,
    )
    output = result.stdout + result.stderr
    # 截断过长的输出，防止上下文爆炸
    if len(output) > 4000:
        output = output[:2000] + f"\n...[截断 {len(output) - 4000} 字符]...\n" + output[-2000:]
    return output


@registry.register(
    description="读取指定文件的完整内容。路径相对于仓库根目录。",
    parameters={
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "文件路径，如 'package.json' 或 'src/main.py'",
            }
        },
        "required": ["path"],
    },
)
def read_file(path: str) -> str:
    """读取文件内容"""
    full_path = os.path.join(_work_dir, path)
    if not os.path.exists(full_path):
        return f"文件不存在: {path}"
    with open(full_path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    if len(content) > 6000:
        content = content[:3000] + f"\n...[文件过长，截断 {len(content) - 6000} 字符]...\n" + content[-3000:]
    return content


@registry.register(
    description="当你收集到足够信息后，调用此工具生成最终分析报告。输入是你收集的所有信息的汇总。",
    parameters={
        "type": "object",
        "properties": {
            "findings": {
                "type": "string",
                "description": "你收集到的所有信息，包括目录结构、关键文件内容、技术栈等",
            }
        },
        "required": ["findings"],
    },
)
def summarize(findings: str) -> str:
    """将收集到的信息交给模型做最终总结"""
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "你是一个资深技术分析师。根据以下收集到的信息，生成一份结构化报告，包含：\n"
                    "1. 项目概述（一句话说明项目做什么）\n"
                    "2. 技术栈（语言、框架、构建工具）\n"
                    "3. 目录结构（关键目录和文件的作用）\n"
                    "4. 代码规模（文件数量、代码行数估算）\n"
                    "5. 亮点或值得注意的设计\n\n"
                    "报告用中文撰写，技术术语保留英文。"
                ),
            },
            {"role": "user", "content": findings},
        ],
        max_tokens=2000,
    )
    return resp.choices[0].message.content


# =============================================================
# 3. 上下文管理器
# =============================================================

class ContextManager:
    def __init__(self, max_tokens: int = 128_000, reserve: int = 16_000):
        self.max_tokens = max_tokens
        self.reserve = reserve

    def estimate_tokens(self, messages: list[dict]) -> int:
        total = sum(len(json.dumps(m, ensure_ascii=False)) for m in messages)
        return int(total / 3.5)

    def manage(self, messages: list[dict]) -> list[dict]:
        # Level 1: 截断单条过长输出
        managed = []
        for msg in messages:
            if msg["role"] == "tool" and len(msg.get("content", "")) > 3000:
                c = msg["content"]
                msg = {**msg, "content": c[:1500] + f"\n...[截断]...\n" + c[-1500:]}
            managed.append(msg)

        if self.estimate_tokens(managed) <= self.max_tokens - self.reserve:
            return managed

        # Level 2: 只保留 system + 最近消息
        system = [m for m in managed if m["role"] == "system"]
        other = [m for m in managed if m["role"] != "system"]
        return system + other[-12:]


# =============================================================
# 4. Agent Loop（带完整终止条件）
# =============================================================

SYSTEM_PROMPT = """你是一个代码分析 Agent。你的任务是分析给定的 GitHub 仓库。

工作流程：
1. 先 clone 仓库到临时目录（git clone <url> .）
2. 查看目录结构（ls -la, find 等）
3. 阅读关键配置文件（package.json, pyproject.toml, Cargo.toml, go.mod 等）
4. 统计代码规模（find + wc）
5. 收集完毕后，调用 summarize 工具生成最终报告

注意事项：
- 先想清楚再看，不要盲目读取所有文件
- 优先读取配置文件来判断技术栈
- 每个步骤先说明你的思考（Thought）
- 如果遇到错误，分析原因并尝试替代方案"""


def analyze_repo(repo_url: str, max_turns: int = 15) -> str:
    ctx = ContextManager()
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"请分析这个 GitHub 仓库: {repo_url}"},
    ]

    for turn in range(max_turns):
        messages = ctx.manage(messages)

        # 调用模型（带重试）
        response = None
        for attempt in range(3):
            try:
                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    tools=registry.schemas(),
                    tool_choice="auto",
                )
                break
            except Exception as e:
                if attempt == 2:
                    return f"API 调用失败: {e}"
                import time
                time.sleep(2 ** attempt)

        message = response.choices[0].message

        # 打印思考过程
        if message.content:
            print(f"\n[Thought - Turn {turn + 1}] {message.content}")

        # 终止条件：无工具调用
        if not message.tool_calls:
            return message.content

        messages.append(message)

        # 执行工具
        for tc in message.tool_calls:
            name = tc.function.name
            args = json.loads(tc.function.arguments)
            print(f"[Action] {name}({json.dumps(args, ensure_ascii=False)[:100]})")

            result = registry.execute(name, args)
            print(f"[Observation] {result[:300]}...")

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })

    return f"分析在 {max_turns} 轮后未能完成。"


# =============================================================
# 5. 运行
# =============================================================

if __name__ == "__main__":
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else "https://github.com/vercel/next.js"
    print(f"分析仓库: {url}")
    print("=" * 60)

    report = analyze_repo(url)

    print("\n" + "=" * 60)
    print("最终报告:")
    print("=" * 60)
    print(report)
```

运行：

```bash
python code_analyzer.py https://github.com/fastapi/fastapi
```

### TypeScript 完整版

```bash
npm install ai @ai-sdk/openai zod
```

```typescript
/**
 * 代码分析 Agent —— TypeScript 版本
 *
 * 依赖: npm install ai @ai-sdk/openai zod
 * 运行: OPENAI_API_KEY="sk-..." npx tsx code-analyzer.ts
 */

import { ToolLoopAgent, tool, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { execSync } from 'child_process';
import { readFileSync, existsSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// =============================================================
// 1. 安全沙箱
// =============================================================

const workDir = mkdtempSync(join(tmpdir(), 'agent-repo-'));

// =============================================================
// 2. 工具定义
// =============================================================

const tools = {
  shellExec: tool({
    description:
      '执行 shell 命令。用于 git clone、ls、find、wc 等操作。命令在隔离的临时目录中运行。',
    parameters: z.object({
      command: z.string().describe('要执行的 shell 命令'),
    }),
    execute: async ({ command }) => {
      try {
        const output = execSync(command, {
          cwd: workDir,
          encoding: 'utf-8',
          timeout: 60_000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        // 截断过长输出
        if (output.length > 4000) {
          return (
            output.slice(0, 2000) +
            `\n...[截断 ${output.length - 4000} 字符]...\n` +
            output.slice(-2000)
          );
        }
        return output;
      } catch (e: any) {
        const stderr = e.stderr?.toString() ?? '';
        const stdout = e.stdout?.toString() ?? '';
        return `命令执行失败:\n${stdout}${stderr}`.slice(0, 4000);
      }
    },
  }),

  readFile: tool({
    description: '读取指定文件的完整内容。路径相对于仓库根目录。',
    parameters: z.object({
      path: z.string().describe("文件路径，如 'package.json'"),
    }),
    execute: async ({ path: filePath }) => {
      const fullPath = join(workDir, filePath);
      if (!existsSync(fullPath)) return `文件不存在: ${filePath}`;
      try {
        let content = readFileSync(fullPath, 'utf-8');
        if (content.length > 6000) {
          content =
            content.slice(0, 3000) +
            `\n...[截断 ${content.length - 6000} 字符]...\n` +
            content.slice(-3000);
        }
        return content;
      } catch (e) {
        return `读取失败: ${e}`;
      }
    },
  }),

  summarize: tool({
    description:
      '收集到足够信息后，调用此工具生成最终分析报告。传入你收集到的所有信息。',
    parameters: z.object({
      findings: z.string().describe('收集到的所有信息汇总'),
    }),
    execute: async ({ findings }) => {
      const { generateText } = await import('ai');
      const result = await generateText({
        model: openai('gpt-4o'),
        system: `你是一个资深技术分析师。根据以下信息生成结构化报告：
1. 项目概述
2. 技术栈（语言、框架、构建工具）
3. 目录结构
4. 代码规模
5. 亮点设计
报告用中文撰写，技术术语保留英文。`,
        prompt: findings,
        maxTokens: 2000,
      });
      return result.text;
    },
  }),
};

// =============================================================
// 3. Agent 定义
// =============================================================

const agent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  system: `你是一个代码分析 Agent。你的任务是分析给定的 GitHub 仓库。

工作流程：
1. 先 clone 仓库（git clone <url> .）
2. 查看目录结构
3. 阅读关键配置文件
4. 统计代码规模
5. 调用 summarize 生成最终报告

注意：先想清楚再操作，优先读取配置文件判断技术栈。`,
  tools,
  stopWhen: stepCountIs(15),

  prepareStep: async ({ stepCount }) => {
    if (stepCount > 10) {
      return {
        system:
          '你已经执行了很多步。请尽快汇总已有信息，调用 summarize 结束任务。',
      };
    }
    return {};
  },
});

// =============================================================
// 4. 运行
// =============================================================

async function analyzeRepo(repoUrl: string) {
  console.log(`分析仓库: ${repoUrl}`);
  console.log('='.repeat(60));

  const result = await agent.generate({
    prompt: `请分析这个 GitHub 仓库: ${repoUrl}`,
  });

  console.log('\n' + '='.repeat(60));
  console.log('最终报告:');
  console.log('='.repeat(60));
  console.log(result.text);
}

const url = process.argv[2] ?? 'https://github.com/vercel/next.js';
analyzeRepo(url).catch(console.error);
```

## 三个常见陷阱（以及怎么避开）

### 陷阱 1：无限循环

**症状：** Agent 反复调用同一个工具，或者在两个工具之间来回跳转，永远不停。

**原因：** 没有 `max_turns` 保护，或者模型陷入了"工具返回错误 → 重试 → 又错误 → 又重试"的死循环。

**解法：**
- 设置 `max_turns`（推荐 10-20）
- 添加连续错误计数器——连续 3 次失败就提前终止
- 在 system prompt 中明确告诉模型"如果连续失败，总结已有信息并结束"

### 陷阱 2：上下文爆炸

**症状：** 跑到第 5、6 轮时 API 报 `context_length_exceeded` 错误，或者费用异常高。

**原因：** 工具返回了大量文本（比如 `ls -la` 一个大型仓库的结果可能有几万字符），全部塞进消息历史。

**解法：**
- 每条工具输出设置截断上限（推荐 2000-4000 字符）
- 实现 Step 3 中的三级上下文管理
- 在工具的 `execute` 函数中就做截断，不要等到上下文管理阶段

### 陷阱 3：工具返回太长

**症状：** 模型"看到了"工具返回的全部内容，但因为信息过多而"迷失"，给出低质量的回复。

**原因：** LLM 对超长上下文中的信息检索能力有限（"Lost in the Middle" 问题）。

**解法：**
- 工具内部做智能截断——不是简单裁剪首尾，而是提取关键信息
- 比如 `shell_exec("find . -type f")` 返回 5000 个文件名时，改为只返回目录树的前 3 层
- 在 prompt 中引导模型"按需查看"而非"全部读完再决策"

## 总结：我们构建了什么

回顾一下这篇文章的路线图：

| Step | 添加的能力 | 解决的问题 |
|------|-----------|-----------|
| 骨架 | while 循环 | Agent Loop 的核心结构 |
| Step 1 | 最小循环 + 硬编码工具 | 让模型能调用工具 |
| Step 2 | 工具注册表 | 工具与循环逻辑解耦 |
| Step 3 | 上下文管理 | 防止 token 溢出 |
| Step 4 | 终止条件 | 防止无限循环和崩溃 |
| Step 5 | ReAct 格式 | 引导模型先思考后行动 |
| 案例 | 代码分析 Agent | 把所有组件组装成完整应用 |

你现在拥有的是一个**可以实际运行**的 Agent Loop，具备：
- 动态工具注册与分发
- 三级上下文压缩
- 多种终止条件保护
- ReAct 推理引导
- Python / TypeScript 双语实现

这些不是玩具代码——它们覆盖了生产级 Agent Loop 的核心模式。Claude Code、OpenAI Agents SDK、LangGraph 等框架的底层逻辑就是这些，只是在此基础上添加了更丰富的基础设施（权限系统、子代理委托、持久化检查点等）。

## 下一步：深入工具系统

这篇文章里我们用一个简单的注册表解决了工具分发问题，但生产环境的工具系统要复杂得多：

- 如何设计好的工具描述（让模型准确理解什么时候该用这个工具）？
- 工具的参数校验怎么做（Pydantic / Zod 集成）？
- 如何处理工具间的依赖关系（工具 A 的输出是工具 B 的输入）？
- MCP（Model Context Protocol）是什么，它怎么统一了工具协议？

下一篇[《工具系统设计：让你的 Agent 拥有可靠的双手》](/posts/agent-arch-03-tool-design)将深入这些问题。我们会用实际案例对比"好的工具设计"和"糟糕的工具设计"对 Agent 表现的巨大影响，并实现一个支持动态加载、权限控制、MCP 协议的工具系统。

---

**参考资料：**
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) —— Agent Loop 的理论基础
- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) —— Anthropic 的 Agent 设计指南
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling) —— function calling 官方文档
- [Vercel AI SDK](https://ai-sdk.dev/docs) —— TypeScript Agent 开发框架
- [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) —— Anthropic 上下文管理最佳实践
