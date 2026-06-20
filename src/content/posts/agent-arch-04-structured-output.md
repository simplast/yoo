---
title: '结构化输出：让 LLM 返回你需要的数据类型'
description: 'LLM 默认返回自由文本，但你的应用需要 JSON、需要类型安全。本文讲解 4 种结构化输出方案的原理、优劣和实战用法。'
pubDate: 2026-06-19
category: 'AI 工程'
tags: ['Structured Output', 'Zod', 'Pydantic', 'JSON Schema', 'Agent']
series: 'Agent 工程实战'
seriesOrder: 4
draft: false
---

> **Agent 工程实战**系列第 4 篇。前置阅读：[第 3 篇：Agent 的工具系统](/posts/agent-arch-03-tool-design)。

## 为什么不能让 LLM 直接返回 JSON

在第 2 篇的 Agent Loop 实现中，模型返回的是 Tool Call 格式——OpenAI SDK 帮我们处理了结构化解析。但很多场景下，你需要模型直接返回结构化数据，而不是调用工具。比如：

- 对一段代码做静态分析，返回 `{ severity, message, line }` 的问题列表
- 让 Agent 做出决策，返回 `{ action: "search", query: "..." }`
- 从非结构化文本中提取实体，返回类型安全的对象

最直觉的做法是在 prompt 里写"请返回 JSON"，然后 `JSON.parse`：

```typescript
// ❌ 看似可行，实则脆弱
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: "你是一个代码审查助手。请以 JSON 格式返回分析结果。" },
    { role: "user", content: codeSnippet }
  ],
});

const text = response.choices[0].message.content;
const result = JSON.parse(text); // 💥 随时可能炸
```

这段代码至少会在三种情况下出问题：

**1. 格式不稳定。** 模型可能返回 ` ```json\n{...}\n``` `（带 Markdown 代码块标记），也可能返回 `{\n "summary": ...`（前导空格或换行不一致），甚至可能在 JSON 前后附加解释性文字。`JSON.parse` 遇到任何一种都会抛异常。

**2. 字段缺失。** 你期望返回 `{ summary, riskLevel, issues }`，但模型有时漏掉了 `issues` 字段，或者把 `riskLevel` 写成了 `risk_level`。没有 schema 约束，模型不会知道这是"必填"的。

**3. 类型不匹配。** 你期望 `line` 是 `number`，模型可能返回 `"line": "第 42 行"`。你期望 `severity` 只有 `info | warning | error` 三种值，模型可能给你造一个 `"critical"`。

这些问题在生产环境中不是"偶尔遇到"，而是"一定会遇到"。解决方案就是 **结构化输出（Structured Output）**——用 schema 约束模型的返回格式，保证输出符合你定义的数据结构。

## 四种方案：从简单到复杂

结构化输出有四种渐进式方案，每种在可靠性和复杂度上递增。

### 方案一：Prompt Engineering——"请返回 JSON"

最简单的方式：在 prompt 里详细描述你期望的 JSON 格式。

```typescript
const systemPrompt = `你是一个代码审查助手。请以下面的 JSON 格式返回分析结果：
{
  "summary": "总体评价（字符串）",
  "riskLevel": "风险等级，只能是 low、medium、high 之一",
  "issues": [
    {
      "severity": "严重程度，只能是 info、warning、error 之一",
      "message": "问题描述（字符串）",
      "line": 42
    }
  ],
  "recommendation": "改进建议（字符串）"
}
不要返回任何其他文字，只返回 JSON。`;
```

**优点**：通用性最强，任何模型、任何 API 都能用。
**缺点**：完全没有保障。模型可能遵守，也可能不遵守。你只能在拿到结果后做运行时校验，然后重试或兜底。

适用场景：原型验证、对输出格式要求不严格的场景、使用不支持结构化输出的模型时。

### 方案二：JSON Mode——保证输出是合法 JSON

OpenAI 和多数主流模型提供商都支持 JSON Mode。开启后，模型保证输出是 **合法的 JSON**（能通过 `JSON.parse`），但不保证符合特定 schema。

```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: systemPrompt }, // 仍然需要在 prompt 中描述格式
    { role: "user", content: codeSnippet }
  ],
  response_format: { type: "json_object" },  // ← 开启 JSON Mode
});

const result = JSON.parse(response.choices[0].message.content);
// ✅ 至少不会 JSON.parse 报错了
// ❌ 但字段名、类型、枚举值仍然不可靠
```

**优点**：消除了格式解析问题，一行配置即可开启。
**缺点**：只管"是合法 JSON"，不管"JSON 长什么样"。你仍然需要在代码中做 schema 校验。

适用场景：你需要 JSON 但不想写完整 schema 的中间方案，或者模型不支持更高级的结构化输出时。

### 方案三：Structured Output with Schema——精确到字段的约束

这是 OpenAI 在 2024 年 8 月推出的能力（目前 Anthropic 和 Google 也已支持各自的版本）。你传入一个 JSON Schema，模型保证输出 **严格符合** 这个 schema。

```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: "你是一个代码审查助手。" },
    { role: "user", content: codeSnippet }
  ],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "code_review",
      strict: true,
      schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          riskLevel: { type: "string", enum: ["low", "medium", "high"] },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                severity: { type: "string", enum: ["info", "warning", "error"] },
                message: { type: "string" },
                line: { type: "number" }
              },
              required: ["severity", "message"],
              additionalProperties: false
            }
          },
          recommendation: { type: "string" }
        },
        required: ["summary", "riskLevel", "issues", "recommendation"],
        additionalProperties: false
      }
    }
  }
});

const result = JSON.parse(response.choices[0].message.content);
// ✅ 格式合法、字段完整、类型正确、枚举值受约束
```

**优点**：模型层面的强约束。`strict: true` 时，OpenAI 使用 constrained decoding（约束解码），从 token 采样层面保证输出符合 schema，而不是"先生成再校验"。
**缺点**：手写 JSON Schema 非常繁琐；对 schema 有一些限制（比如 `strict: true` 模式下所有字段都是 required，不支持 `anyOf` 的某些组合）；会增加一些 token 消耗。

适用场景：需要可靠的结构化输出，且愿意投入写 schema 的成本。

### 方案四：Tool Calling as Structured Output——用工具参数做格式约束

这是很多开发者忽略的一个事实：**Tool Calling 本身就是一种结构化输出**。当你定义一个 tool 的 `parameters` schema 时，模型返回的 tool call arguments 就已经是符合该 schema 的结构化数据了。

```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: "你是一个代码审查助手。" },
    { role: "user", content: codeSnippet }
  ],
  tools: [{
    type: "function",
    function: {
      name: "submit_review",
      description: "提交代码审查结果",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
          riskLevel: { type: "string", enum: ["low", "medium", "high"] },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                severity: { type: "string", enum: ["info", "warning", "error"] },
                message: { type: "string" },
                line: { type: "number" }
              },
              required: ["severity", "message"]
            }
          },
          recommendation: { type: "string" }
        },
        required: ["summary", "riskLevel", "issues", "recommendation"]
      }
    }
  }],
  tool_choice: { type: "function", function: { name: "submit_review" } },
  // ↑ tool_choice 强制模型必须调用这个 tool，从而返回结构化数据
});

const args = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
// ✅ 与方案三效果相同，而且 tool_choice 可以精确控制
```

**优点**：复用 tool calling 机制，不需要额外的 API 支持；`tool_choice` 可以强制模型返回特定结构；在 Anthropic 的 Claude 模型上，这是目前获取结构化输出的 **推荐方式**（Claude 没有 `response_format: json_schema`）。
**缺点**：语义上有些别扭——你并没有真的在"调用工具"，只是借用了它的参数格式；需要手动解析 `tool_calls[0].function.arguments`。

适用场景：使用 Anthropic Claude 等不支持 `json_schema` 的模型时，或者你已经在用 tool calling 体系、想保持一致性时。

### 四种方案对比

| 维度 | Prompt Engineering | JSON Mode | JSON Schema | Tool Calling |
|------|-------------------|-----------|-------------|--------------|
| 格式保障 | 无 | 合法 JSON | 严格符合 schema | 严格符合 schema |
| 字段约束 | 无 | 无 | 强约束 | 强约束 |
| 实现复杂度 | 最低 | 低 | 中 | 中 |
| 模型支持 | 所有模型 | 主流模型 | OpenAI / Google | 所有支持 tool 的模型 |
| Token 开销 | 最低 | 低 | 中（schema 描述占 token） | 中 |
| 流式支持 | 支持 | 支持 | 部分限制 | 支持 |

**实际选型建议**：如果用 OpenAI 且需要精确控制输出，优先用 JSON Schema；如果用 Anthropic，用 Tool Calling；如果追求开发效率和类型安全，用 Vercel AI SDK 或 Pydantic 等框架封装（下面实操部分会讲）。

## 实操：TypeScript + Zod + Vercel AI SDK

手写 JSON Schema 是苦力活。在 TypeScript 生态中，[Zod](https://zod.dev/) + [Vercel AI SDK](https://ai-sdk.dev/) 的组合可以大幅简化这个过程：用 Zod 定义 schema，用 AI SDK 的 `generateObject` 自动完成转换和解析。

### 安装依赖

```bash
npm install zod ai @ai-sdk/openai
```

### 定义 Schema

```typescript
import { z } from "zod";

// 单个问题的 schema
const IssueSchema = z.object({
  severity: z.enum(["info", "warning", "error"]),
  message: z.string().describe("问题描述"),
  line: z.number().optional().describe("问题所在的行号"),
});

// 完整审查结果的 schema
const AnalysisResultSchema = z.object({
  summary: z.string().describe("对代码的总体评价"),
  riskLevel: z.enum(["low", "medium", "high"]).describe("风险等级"),
  issues: z.array(IssueSchema).describe("发现的问题列表"),
  recommendation: z.string().describe("改进建议"),
});

// 从 Zod schema 推导 TypeScript 类型
type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
```

注意 `.describe()` 的使用——这些描述会被转换为 JSON Schema 的 `description` 字段，帮助模型理解每个字段的含义。这和写工具描述是一样的道理：**描述越清晰，模型输出越准确**。

### 调用 generateObject

```typescript
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

async function analyzeCode(codeSnippet: string): Promise<AnalysisResult> {
  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: AnalysisResultSchema,
    schemaName: "code_review",
    system: "你是一个资深代码审查助手。分析用户提供的代码片段，返回结构化的审查结果。",
    prompt: `请分析以下代码：\n\n\`\`\`\n${codeSnippet}\n\`\`\``,
  });

  // object 已经是 AnalysisResult 类型，TypeScript 完全类型安全
  return object;
}

// 使用
const result = await analyzeCode(`
  function getUserData(id) {
    const data = fetch('/api/users/' + id);
    return data.json();
  }
`);

console.log(result.riskLevel);  // "high" — 类型安全，不会是 string
console.log(result.issues[0].severity);  // "warning" | "info" | "error"
```

`generateObject` 在底层做了三件事：

1. 将 Zod schema 转换为 JSON Schema，传入 `response_format`
2. 调用模型获取响应
3. 解析返回的 JSON 并用 Zod 做运行时校验，保证类型与 TypeScript 一致

这意味着你获得了 **编译期类型安全**（TypeScript 类型推断）和 **运行时数据校验**（Zod validate）的双重保障。

### 流式输出

`generateObject` 也支持流式，使用 `streamObject`：

```typescript
import { streamObject } from "ai";

const { partialObjectStream } = await streamObject({
  model: openai("gpt-4o"),
  schema: AnalysisResultSchema,
  system: "你是一个代码审查助手。",
  prompt: "分析以下代码...",
});

// 逐步渲染部分结果（适合 UI 场景）
for await (const partial of partialObjectStream) {
  console.log(partial);
  // 第 1 次迭代: { summary: "代码存在", ... }
  // 第 2 次迭代: { summary: "代码存在以下问题", riskLevel: "high", ... }
  // ...逐步补全直到完整对象
}
```

**注意**：流式输出时，`partial` 是一个 **可能不完整** 的对象。中间状态的字段可能是 `undefined`，嵌套数组可能只有部分元素。只有流结束后拿到的完整对象才保证通过 Zod 校验。

## 实操：Python + Pydantic + OpenAI SDK

Python 生态的等价方案是 Pydantic + OpenAI SDK 的 `beta.chat.completions.parse` 方法。

### 安装依赖

```bash
pip install pydantic openai
```

### 定义 Schema

```python
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Issue(BaseModel):
    severity: Severity = Field(description="问题严重程度")
    message: str = Field(description="问题描述")
    line: Optional[int] = Field(default=None, description="问题所在的行号")


class AnalysisResult(BaseModel):
    summary: str = Field(description="对代码的总体评价")
    risk_level: RiskLevel = Field(description="风险等级")
    issues: list[Issue] = Field(description="发现的问题列表")
    recommendation: str = Field(description="改进建议")
```

Pydantic 的 `Field(description=...)` 和 Zod 的 `.describe()` 作用相同——都会映射到 JSON Schema 的 `description`。

### 调用 parse

```python
from openai import OpenAI

client = OpenAI()


def analyze_code(code_snippet: str) -> AnalysisResult:
    completion = client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": "你是一个资深代码审查助手。分析用户提供的代码片段，返回结构化的审查结果。",
            },
            {
                "role": "user",
                "content": f"请分析以下代码：\n\n```python\n{code_snippet}\n```",
            },
        ],
        response_format=AnalysisResult,  # ← 直接传 Pydantic model
    )

    result: AnalysisResult = completion.choices[0].message.parsed
    return result


# 使用
result = analyze_code("""
def get_user_data(user_id):
    data = requests.get(f'/api/users/{user_id}')
    return data.json()
""")

print(result.risk_level)  # RiskLevel.HIGH — 枚举类型
print(result.issues[0].severity)  # Severity.WARNING
for issue in result.issues:
    print(f"  [{issue.severity.value}] line {issue.line}: {issue.message}")
```

`parse` 方法在底层自动将 Pydantic model 转换为 JSON Schema、传入 `response_format`、解析返回的 JSON 并构建 Pydantic 实例。整个过程对你来说就是 **传入 model，拿回 typed object**。

### 错误处理

模型有时无法满足 schema 约束（比如内容安全过滤触发了拒绝回复）。`parse` 方法会在 `refusal` 时抛出异常，需要处理：

```python
from openai import LengthFinishReasonError, ContentFilterFinishReasonError

try:
    result = analyze_code(code_snippet)
except ContentFilterFinishReasonError:
    print("模型回复被内容安全策略拦截")
except LengthFinishReasonError:
    print("输出长度超出限制，尝试缩短输入或使用更大 context 的模型")
except Exception as e:
    print(f"解析失败: {e}")
```

## Agent 决策中的结构化输出

结构化输出不只是用来"提取数据"。在 Agent 系统中，它还有一个更关键的应用：**让模型的决策过程本身也是结构化的**。

### 问题：自由文本决策的困境

回顾第 2 篇的最小 Agent Loop，模型的决策是通过 tool calling 实现的——如果返回 tool call 就执行工具，如果返回纯文本就结束循环。这在简单场景下够用，但当你需要更精细的控制时，问题就来了：

```python
# 自由文本决策 —— 解析噩梦
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "帮我查一下北京明天的天气"}],
)

text = response.choices[0].message.content
# 模型可能返回：
# "我需要搜索北京明天的天气"
# "让我调用天气查询工具"
# "好的，我来帮你查。search_weather({city: '北京'})"
# "根据我的了解，北京明天..."（直接编答案，不调工具）

# 你怎么判断它是要调工具还是直接回答？
# 正则？关键词匹配？都不靠谱。
```

### 解决方案：结构化决策

让模型返回一个固定格式的 **决策对象**，用 `action` 字段区分行为：

```typescript
import { z } from "zod";

// 定义 Agent 的决策空间
const AgentDecisionSchema = z.discriminatedUnion("action", [
  // 动作 1：搜索信息
  z.object({
    action: z.literal("search"),
    query: z.string().describe("搜索关键词"),
    reasoning: z.string().describe("为什么要搜索这个信息"),
  }),
  // 动作 2：执行计算
  z.object({
    action: z.literal("calculate"),
    expression: z.string().describe("数学表达式"),
    reasoning: z.string().describe("为什么需要计算"),
  }),
  // 动作 3：直接回答（任务完成）
  z.object({
    action: z.literal("answer"),
    result: z.string().describe("最终回答"),
    confidence: z.enum(["low", "medium", "high"]).describe("对回答的信心"),
  }),
  // 动作 4：请求澄清
  z.object({
    action: z.literal("clarify"),
    question: z.string().describe("需要用户澄清的问题"),
  }),
]);
```

Agent Loop 变成一个干净的 switch：

```typescript
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

async function agentLoop(userMessage: string, maxTurns = 5): Promise<string> {
  const context: string[] = [];  // 积累中间结果

  for (let turn = 0; turn < maxTurns; turn++) {
    const { object: decision } = await generateObject({
      model: openai("gpt-4o"),
      schema: AgentDecisionSchema,
      system: `你是一个智能助手。根据用户问题和已有信息，决定下一步动作。
        已有信息：${context.length > 0 ? context.join("\n") : "无"}`,
      prompt: userMessage,
    });

    switch (decision.action) {
      case "search": {
        const searchResult = await performSearch(decision.query);
        context.push(`搜索 "${decision.query}" 的结果：${searchResult}`);
        break;  // 继续循环
      }
      case "calculate": {
        const calcResult = eval(decision.expression);
        context.push(`计算 ${decision.expression} = ${calcResult}`);
        break;  // 继续循环
      }
      case "clarify":
        return `我需要更多信息：${decision.question}`;
      case "answer":
        return decision.result;  // 结束循环
    }
  }

  return "抱歉，我未能在限定轮次内完成任务。";
}
```

### 对比：结构化决策 vs Tool Calling

你可能会问：这不就是 tool calling 的翻版吗？为什么不直接用 tool calling？

两者确实能达到类似的效果，但有关键区别：

| 维度 | 结构化决策（generateObject） | Tool Calling |
|------|---------------------------|--------------|
| 决策显式性 | 每次调用返回一个明确的决策对象 | 模型可能同时返回多个 tool call |
| 控制粒度 | 你可以精确定义决策空间（discriminated union） | 模型可能"创造性地"组合工具 |
| reasoning 字段 | 可以强制要求模型解释决策理由 | tool call 没有内置的 reasoning 字段 |
| 循环控制 | 开发者完全控制循环逻辑 | 循环逻辑依赖模型是否继续返回 tool call |
| 模型兼容性 | 需要支持 json_schema | 需要支持 function calling |
| 适用场景 | 决策空间明确、有限的 Agent | 工具集丰富、组合灵活的 Agent |

**经验法则**：如果你的 Agent 主要是在"选择下一步做什么"（路由/编排型），结构化决策更清晰；如果你的 Agent 主要是在"执行具体操作"（工具密集型），tool calling 更直接。很多生产系统会 **混合使用**——用结构化决策做顶层路由，用 tool calling 做底层执行。

## 已知坑与解决方案

### 坑一：Zod v4 的 `z.email()` 与 OpenAI 不兼容

Zod v4 引入了 `z.email()`、`z.uuid()`、`z.url()` 等便利方法，它们底层生成的 JSON Schema 包含 `pattern`（正则表达式）约束。这在纯 Zod 校验时没问题，但与 OpenAI 的 Structured Output 结合时会出问题：

```typescript
// ❌ 会报错
const UserSchema = z.object({
  name: z.string(),
  email: z.email(),      // 生成 { type: "string", format: "email", pattern: "..." }
  id: z.uuid(),          // 生成 { type: "string", format: "uuid", pattern: "..." }
});

const { object } = await generateObject({
  model: openai("gpt-4o"),
  schema: UserSchema,
  prompt: "生成一个用户信息",
});
// Error: OpenAI does not support `pattern` in strict mode
```

OpenAI 的 `strict: true` 模式不支持 `pattern` 和 `format` 约束（因为 constrained decoding 无法处理正则级别的约束）。

**解决方案**：降级为 `z.string()` + `.describe()`，把格式要求写在描述里，让模型"理解"而非"强制"：

```typescript
// ✅ 兼容方案
const UserSchema = z.object({
  name: z.string(),
  email: z.string().describe("用户的邮箱地址，格式如 user@example.com"),
  id: z.string().describe("用户的 UUID，格式如 550e8400-e29b-41d4-a716-446655440000"),
});
```

如果你一定要做格式校验，可以在拿到结果后用 Zod 的 `.refine()` 做后验证：

```typescript
const UserSchema = z.object({
  name: z.string(),
  email: z.string().describe("邮箱地址"),
}).refine(
  (data) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email),
  { message: "email 格式不正确" }
);
```

但这意味着如果校验失败，你需要重试整个请求，不如直接在 prompt 中描述清楚来得高效。

### 坑二：流式输出时的 schema 验证时机

使用 `streamObject` 时，一个常见的误解是每次 `partialObjectStream` 产出的对象都符合 schema。实际上，流式过程中产出的是 **部分对象**——字段可能缺失、数组可能不完整。

```typescript
// ❌ 错误用法：在流式过程中做 schema 校验
for await (const partial of partialObjectStream) {
  const validated = AnalysisResultSchema.parse(partial);  // 必然失败
}

// ✅ 正确用法：只在流结束后使用完整对象
let finalObject;
for await (const partial of partialObjectStream) {
  // 只做 UI 渲染，不做校验
  renderPartialUI(partial);
}
// streamObject 内部会在流结束后做最终校验
// 如果校验失败，会在流结束时抛出异常
```

Vercel AI SDK 的 `streamObject` 返回的 `object` promise 会在流结束后给出最终校验过的完整对象：

```typescript
const { object: objectPromise, partialObjectStream } = await streamObject({
  model: openai("gpt-4o"),
  schema: AnalysisResultSchema,
  prompt: "...",
});

// 用于 UI：流式渲染
for await (const partial of partialObjectStream) {
  renderPartialUI(partial);
}

// 用于业务逻辑：等待完整校验结果
const finalResult = await objectPromise;
// finalResult 保证通过 Zod 校验
```

### 坑三：嵌套 Schema 的 Token 消耗

JSON Schema 本身会消耗 token。一个深层嵌套的 schema（比如包含 5 层嵌套对象、20 个字段的定义）可能会额外消耗数百个 token。更麻烦的是，OpenAI 会对 schema 做预处理（构建约束解码的状态机），这个过程也有延迟。

```typescript
// ❌ 过度嵌套，schema 本身很庞大
const DeepSchema = z.object({
  metadata: z.object({
    author: z.object({ name: z.string(), email: z.string() }),
    timestamps: z.object({ created: z.string(), updated: z.string() }),
    tags: z.object({ primary: z.array(z.string()), secondary: z.array(z.string()) }),
  }),
  // ... 还有更多层级
});
```

**优化建议**：

1. **展平结构**。能用扁平字段就不用深层嵌套：

```typescript
// ✅ 更扁平的结构
const FlatSchema = z.object({
  authorName: z.string(),
  authorEmail: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  primaryTags: z.array(z.string()),
  secondaryTags: z.array(z.string()),
});
```

2. **限制数组长度**。在 schema 中用 `maxItems` 约束数组，避免模型生成长列表消耗大量 output token：

```typescript
const AnalysisResultSchema = z.object({
  issues: z.array(IssueSchema).max(10).describe("最多返回 10 个最重要的问题"),
});
```

3. **按需精简 schema**。如果一个 schema 有 30 个字段但你的业务只用其中 5 个，就只定义这 5 个。模型返回的数据越少，出错概率越低，延迟也越低。

### 坑四：strict mode 下的额外约束

OpenAI 的 `strict: true` 模式有几个容易踩的限制：

- **所有属性都必须在 `required` 中**（不支持可选字段）。如果你的 Zod schema 有 `.optional()` 字段，AI SDK 在转换时可能报错。解决方案：用 `z.string().nullable()` 代替 `z.string().optional()`，让字段始终存在但值可以为 `null`。
- **不支持 `additionalProperties: true`**。schema 必须明确列出所有字段，不允许额外属性。
- **`anyOf` / `oneOf` 有限制**。不能用于顶层，嵌套使用时也有约束。如果你用 `z.discriminatedUnion`，AI SDK 通常能正确转换，但复杂 union 可能需要手动调整。

## 小结

结构化输出是 Agent 系统从"玩具"走向"生产"的基础设施之一。核心选择逻辑：

1. **快速原型**：Prompt Engineering + JSON Mode，够用就行
2. **TypeScript 生产环境**：Zod + Vercel AI SDK 的 `generateObject`，类型安全 + schema 约束一步到位
3. **Python 生产环境**：Pydantic + OpenAI SDK 的 `parse`，同样优雅
4. **使用 Anthropic Claude**：Tool Calling as Structured Output，用 `tool_choice` 强制返回结构化数据
5. **Agent 决策**：考虑用 `discriminatedUnion` 定义决策空间，让循环控制逻辑清晰可控

无论选哪种方案，记住三个实践原则：**schema 描述要清晰**（`describe` / `Field(description=...)` 不是装饰，是给模型的指令）、**结构要尽量扁平**（减少嵌套、限制数组长度）、**格式约束靠描述而非正则**（`pattern` 在 strict mode 下不可用）。

---

> **下一篇预告**：Agent 有了工具调用和结构化输出的能力后，下一个挑战是 **上下文管理**——如何在有限的 context window 中塞入足够的信息，同时不让模型"迷失"。第 5 篇将深入 Context Engineering 的三种核心策略：摘要压缩、外部笔记、子代理委托。
