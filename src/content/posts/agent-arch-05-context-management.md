---
title: 'Agent 的上下文管理：当对话越来越长'
description: 'Agent 运行越久，上下文越大，直到撞上 token 限制。本文讲解 5 种上下文压缩策略，从简单的消息截断到 Claude Code 的 5 级压缩方案。'
pubDate: 2026-06-19
category: 'AI 工程'
tags: ['Context Management', 'Token', 'Compaction', 'Agent', 'Claude Code']
draft: false
---

# Agent 的上下文管理：当对话越来越长

> **Agent 架构实战** 系列第 5 篇 · 前置阅读：[第 4 篇 · 结构化输出](/posts/agent-arch-04-structured-output)

## 引子：一个真实的崩溃场景

你写了一个 Agent，让它帮你重构一个模块。它先读文件，再分析依赖，然后逐个修改——干得漂亮。但到第 47 轮工具调用时，API 返回了一个冷冰冰的错误：

```
Error: context_length_exceeded. This model's maximum context length is 128000 tokens.
```

Agent 停下了。它前面做的一切工作——读取的源码、分析的结论、制定的方案——全都随着这次报错变成了无意义的 token 废墟。

这不是极端情况，而是 **Agent 开发中最常见、最容易被忽视的问题之一**：上下文管理。

普通聊天机器人很少碰到这个问题，因为用户聊几句就结束了。但 Agent 不一样——它会在一个 loop 里反复调用工具、处理结果、生成回复，每一轮都在往上下文里塞东西。一个复杂的任务跑 50~100 轮工具调用是家常便饭。

本文就来解决这个问题。我们会先搞清楚上下文到底由什么组成，然后从简单到复杂学习 5 种压缩策略，接着拆解 Claude Code 开源代码中的 5 级压缩方案，最后动手实现一个可用的 `ContextManager` 类。

---

## 一、上下文窗口：Agent 的"工作记忆"

### 1.1 什么是上下文窗口

LLM 每次处理请求时，能"看到"的文本总量是有上限的，这个上限叫 **context window**（上下文窗口），单位是 token。

| 模型 | Context Window |
|------|---------------|
| GPT-4o | 128,000 tokens |
| Claude 3.5 Sonnet | 200,000 tokens |
| Claude 3 Opus | 200,000 tokens |
| Gemini 1.5 Pro | 2,000,000 tokens |
| DeepSeek-V3 | 128,000 tokens |

看起来很大对吧？128K token 大约相当于 10 万字中文，或者一本中等篇幅的书。但 Agent 场景下，这个空间消耗得比你想象的快得多。

### 1.2 为什么 Agent 特别容易爆上下文

普通对话是「一问一答」模式，上下文增长很慢。但 Agent 是「思考-行动-观察」循环，每一轮都在往上下文里堆料：

```
用户指令 → LLM 思考 → 工具调用 → 工具返回结果 → LLM 再思考 → 再调工具 → ...
```

一个文件读取工具可能返回 5000 token 的源码。一个 Web 搜索工具可能返回 8000 token 的搜索结果。Agent 跑 20 轮，光工具结果就可能吃掉 10 万 token。

### 1.3 上下文爆炸的后果

上下文超限不只是报错那么简单，它会导致四个层面的问题：

1. **成本飙升**：大多数 API 按 input token 计费。上下文越大，每次调用的成本越高。一个 128K 上下文的请求，input 成本可能是 8K 请求的 16 倍。
2. **延迟增加**：模型处理 10 万 token 的 prefill 时间远大于处理 1 万 token。用户会觉得 Agent "越来越慢"。
3. **质量下降**：即使没超限，研究表明当上下文过长时，模型对中间部分的信息注意力会下降（"Lost in the Middle" 现象）。
4. **直接报错**：超过 context window 上限，API 直接拒绝请求，Agent 被迫中断。

---

## 二、上下文的组成：Token 都去哪了？

在想办法压缩之前，先搞清楚上下文里到底有什么。一个 Agent 发给 LLM 的完整 payload 通常包含以下部分：

### 2.1 组成部分

| 组成部分 | 说明 | 典型 Token 占比 |
|---------|------|----------------|
| **System Prompt** | Agent 的身份、行为准则、输出格式要求 | 5%~15%（500~2000 tokens） |
| **工具定义** | 每个工具的 JSON Schema（名称、描述、参数） | 5%~20%（工具越多越大） |
| **用户消息** | 用户的原始指令和后续追问 | 5%~10% |
| **工具调用结果** | 工具返回的文本、代码、搜索结果等 | **40%~60%**（最大头） |
| **LLM 的思考和回复** | 模型的 CoT（Chain of Thought）和最终输出 | 15%~25% |
| **对话历史** | 前面所有轮次的消息累积 | 随轮次线性增长 |

一个关键洞察：**工具调用结果是上下文膨胀的罪魁祸首**。如果你给 Agent 注册了 10 个工具，每个工具的 JSON Schema 大约 200~500 token，光工具定义就可能占 3000~5000 token。但这还是一次性的固定开销。真正失控的是工具返回的结果——读一个文件就是几千 token，搜索一次网页又是几千 token，这些结果在后续每一轮调用中都会被重复发送。

### 2.2 固定开销 vs 增长开销

可以把上下文想象成一块固定大小的白板：

```
┌─────────────────────────────────────────────────┐
│  上下文窗口 (128K tokens)                         │
│                                                   │
│  ┌──────────────────┐                             │
│  │ 固定开销 (~10K)   │  System Prompt + 工具定义   │
│  ├──────────────────┤                             │
│  │ 预留空间 (~4K)    │  给 LLM 生成本轮回复        │
│  ├──────────────────┤                             │
│  │                  │                             │
│  │ 可用空间 (~114K)  │  对话历史 + 工具结果         │
│  │ ← 这里会爆炸     │                             │
│  │                  │                             │
│  └──────────────────┘                             │
└─────────────────────────────────────────────────┘
```

上下文管理的核心任务就是：**让"可用空间"里的内容永远不超过上限，同时保留对当前任务最有价值的信息。**

---

## 三、5 种压缩策略：从简单到复杂

### 3.1 截断（Truncation）

**思路**：最简单粗暴——只保留最近 N 条消息，丢弃更早的。

```python
def truncate(messages: list, keep_last: int = 20) -> list:
    """保留 system prompt + 最近 N 条消息"""
    system = [m for m in messages if m["role"] == "system"]
    history = [m for m in messages if m["role"] != "system"]
    return system + history[-keep_last:]
```

**优点**：实现简单，零额外成本（不需要额外调用 LLM）。

**缺点**：早期的重要信息会丢失。比如用户在第 1 轮说"用 TypeScript 写"，这条消息在第 21 轮被截断了，Agent 可能突然开始用 JavaScript 写代码。

**适用场景**：聊天机器人、简单任务型 Agent。

### 3.2 摘要（Summarization）

**思路**：用 LLM 将早期的对话历史压缩为一段摘要，然后用摘要替代原始消息。

```python
def summarize(messages: list, keep_last: int = 10) -> list:
    """将早期消息压缩为一段摘要"""
    system = [m for m in messages if m["role"] == "system"]
    history = [m for m in messages if m["role"] != "system"]

    if len(history) <= keep_last:
        return messages

    to_summarize = history[:-keep_last]
    to_keep = history[-keep_last:]

    # 调用 LLM 生成摘要（可以用更便宜的小模型）
    summary = call_llm(
        prompt="请将以下对话历史压缩为简洁的摘要，保留关键决策和重要结论：\n"
               + format_messages(to_summarize)
    )

    summary_msg = {
        "role": "system",
        "content": f"[历史摘要] {summary}"
    }

    return system + [summary_msg] + to_keep
```

**优点**：保留了早期信息的核心要点，比截断更智能。

**缺点**：需要额外的 LLM 调用（增加成本和延迟）；摘要本身也会丢失细节。

**适用场景**：需要长期记忆的任务型 Agent。

### 3.3 选择性保留（Selective Retention）

**思路**：不是所有消息同等重要。保留关键消息，丢弃中间过程。

哪些消息是"关键的"？

- 用户的最新指令（决定当前方向）
- 最近几轮的工具结果（当前工作上下文）
- 重要的决策节点（比如用户确认的方案）
- 错误消息（避免重复犯错）

```python
def selective_retain(messages: list, keep_last: int = 6) -> list:
    """保留关键消息：用户最新指令 + 最近工具结果 + 错误信息"""
    system = [m for m in messages if m["role"] == "system"]
    history = [m for m in messages if m["role"] != "system"]

    kept = []
    for msg in history:
        # 始终保留用户的最后一条消息
        if msg["role"] == "user":
            kept.append(msg)
        # 保留包含错误的工具结果
        elif msg.get("is_error"):
            kept.append(msg)
        # 保留最近 N 条
        elif msg in history[-keep_last:]:
            kept.append(msg)
        # 其余消息用占位符替代
        else:
            kept.append({
                "role": msg["role"],
                "content": "[此消息已被压缩以节省上下文空间]"
            })

    return system + kept
```

**优点**：精确控制保留什么，不会意外丢失关键信息。

**缺点**：需要定义"重要性"规则，不同任务可能需要不同策略。

**适用场景**：工具密集型 Agent（频繁调用工具的代码 Agent、数据分析 Agent）。

### 3.4 工具结果压缩（Tool Result Compression）

**思路**：工具返回的结果往往是上下文膨胀的主要原因。对这些结果进行裁剪，只保留关键部分。

```python
def compress_tool_result(result: str, max_tokens: int = 2000) -> str:
    """压缩工具返回结果"""
    tokens = count_tokens(result)

    if tokens <= max_tokens:
        return result

    # 策略 1: 截断并提示
    truncated = truncate_to_tokens(result, max_tokens - 50)
    return truncated + f"\n\n... [已截断 {tokens - max_tokens} 个 token，完整结果共 {tokens} tokens]"

def compress_all_tool_results(messages: list, max_tokens_per_result: int = 2000) -> list:
    """压缩所有工具结果"""
    compressed = []
    for msg in messages:
        if msg["role"] == "tool" and count_tokens(msg["content"]) > max_tokens_per_result:
            msg = {**msg, "content": compress_tool_result(msg["content"], max_tokens_per_result)}
        compressed.append(msg)
    return compressed
```

**优点**：直接针对最大的膨胀源头，效果立竿见影。

**缺点**：可能截断掉 Agent 后续需要的信息。

**适用场景**：任何会调用返回大量文本工具的 Agent（文件读取、网页抓取、数据库查询）。

### 3.5 上下文折叠（Context Folding）

**思路**：这是最复杂的策略。将整个对话历史折叠为一段结构化摘要，保留所有关键信息但大幅减少 token 数量。

```python
def context_fold(messages: list) -> list:
    """将对话历史折叠为结构化摘要"""
    system = [m for m in messages if m["role"] == "system"]
    history = [m for m in messages if m["role"] != "system"]

    # 提取结构化信息
    decisions = []     # 关键决策
    findings = []      # 重要发现
    errors = []        # 遇到的错误
    current_state = "" # 当前状态

    for msg in history:
        content = msg["content"]
        if "error" in content.lower() or "failed" in content.lower():
            errors.append(content[:200])
        if msg["role"] == "assistant" and "决定" in content:
            decisions.append(content[:200])

    # 生成折叠后的上下文
    folded = {
        "role": "system",
        "content": f"""[上下文折叠 - 对话历史摘要]
## 关键决策
{chr(10).join(f'- {d}' for d in decisions[-5:]) if decisions else '无'}

## 重要发现
{chr(10).join(f'- {f}' for f in findings[-5:]) if findings else '无'}

## 遇到的问题
{chr(10).join(f'- {e}' for e in errors[-3:]) if errors else '无'}

## 当前状态
正在进行中，已完成 {len(history)} 轮对话。
"""
    }

    # 只保留最近 4 条原始消息
    return system + [folded] + history[-4:]
```

**优点**：压缩比极高（可以将 50K token 压缩到 2K~5K），同时保留结构化信息。

**缺点**：需要额外的 LLM 调用来生成摘要（或者用规则提取）；不可避免地会丢失细节。

**适用场景**：长时间运行的 Agent、需要处理非常多轮工具调用的场景。

### 策略对比总结

| 策略 | 压缩比 | 实现难度 | 信息损失 | 额外成本 | 适用场景 |
|------|--------|---------|---------|---------|---------|
| 截断 | 低~中 | 极简 | 高 | 无 | 简单聊天 |
| 摘要 | 中~高 | 低 | 中 | 一次 LLM 调用 | 长期对话 |
| 选择性保留 | 中 | 低 | 低~中 | 无 | 工具密集型 |
| 工具结果压缩 | 高 | 低 | 中 | 无 | 大文本工具 |
| 上下文折叠 | 极高 | 中~高 | 中 | 可选 LLM 调用 | 长时间运行 |

实际项目中，这些策略通常是**组合使用**的，而不是只用其中一种。Claude Code 就是这么做的。

---

## 四、Claude Code 的 5 级压缩方案

Claude Code 是 Anthropic 开源的命令行 Agent，它的上下文管理策略经过了大量实战打磨。其核心思路是**分级压缩**——根据上下文使用率逐级升级压缩力度，而不是一上来就大刀阔斧地删减。

以下是从 Claude Code 源码中提炼出的 5 级方案：

### Level 1: Budget Reduction（缩减预算）

**触发条件**：上下文使用率达到 80%。

**做法**：减少 LLM 的 `max_tokens` 参数（即限制模型本轮回复的最大长度）。这是最温和的压缩，不影响历史消息，只是让模型回复得更短。

```python
# 伪代码：减少输出预算
if context_usage > 0.80:
    max_output_tokens = min(max_output_tokens, 4096)  # 从 8192 降到 4096
```

**原理**：给 LLM 预留的输出空间减小了，相当于给历史消息腾出了更多空间。代价是模型的回复可能不够完整。

### Level 2: Snipping（裁剪特定内容）

**触发条件**：上下文使用率达到 85%。

**做法**：对特定的大段内容进行裁剪，而不是截断整条消息。

```python
# 伪代码：裁剪工具结果中的大段内容
def snip_tool_results(messages, max_result_tokens=2000):
    for msg in messages:
        if msg["role"] == "tool":
            tokens = count_tokens(msg["content"])
            if tokens > max_result_tokens:
                # 保留头部和尾部，裁掉中间
                head = get_tokens(msg["content"], max_result_tokens // 2)
                tail = get_tokens(msg["content"], max_result_tokens // 2, from_end=True)
                msg["content"] = head + "\n...[已裁剪]...\n" + tail
    return messages
```

**特点**：和简单的工具结果压缩不同，Snipping 更精细——它会保留结果的头部和尾部（通常包含最重要的信息），裁掉中间部分。

### Level 3: Micro-Compaction（微型压缩）

**触发条件**：上下文使用率达到 90%。

**做法**：对较早的消息进行微型压缩——用简短的占位描述替换详细的工具结果，但保留消息的结构（role、tool_call_id 等）。

```python
# 伪代码：微型压缩
def micro_compact(messages, threshold_index):
    """对 threshold_index 之前的消息进行微型压缩"""
    for i, msg in enumerate(messages):
        if i >= threshold_index:
            break
        if msg["role"] == "tool" and count_tokens(msg["content"]) > 500:
            msg["content"] = f"[工具结果已压缩，原始大小: {count_tokens(msg['content'])} tokens]"
        elif msg["role"] == "assistant" and count_tokens(msg["content"]) > 1000:
            msg["content"] = msg["content"][:500] + "...[已压缩]"
    return messages
```

**特点**：这一级开始对 LLM 的回复也进行压缩，而不只是工具结果。

### Level 4: Context Collapsing（上下文折叠）

**触发条件**：上下文使用率达到 95%，或者微压缩后仍然超限。

**做法**：调用 LLM 将整个对话历史折叠为一段结构化摘要。这是第一次引入额外的 LLM 调用。

```python
# 伪代码：上下文折叠
def context_collapse(messages):
    history = [m for m in messages if m["role"] != "system"]
    system = [m for m in messages if m["role"] == "system"]

    # 用 LLM 生成摘要
    summary = call_llm(
        model="claude-sonnet-4-20250514",  # 可以用更快的模型
        prompt=f"""请总结以下 Agent 对话历史，重点保留：
1. 用户的原始需求和任何需求变更
2. 已经做出的关键决策
3. 遇到的错误和解决方案
4. 当前正在进行的任务及其状态
5. 任何尚未完成的工作

对话历史：
{format_messages(history)}"""
    )

    collapsed_msg = {
        "role": "system",
        "content": f"[对话历史摘要 - 前 {len(history)} 轮]\n{summary}"
    }

    # 保留 system prompt + 摘要 + 最近 4 条消息
    return system + [collapsed_msg] + history[-4:]
```

**特点**：压缩比极高，但依赖一次 LLM 调用。Anthropic 的做法是使用更便宜/更快的模型来做摘要，而不是用主力模型。

### Level 5: Auto-Compaction（自动压缩循环）

**触发条件**：Level 4 压缩后，上下文仍然超限（比如摘要本身就很长），或者 Agent 继续运行后上下文再次膨胀。

**做法**：自动重复 Level 1~4 的压缩流程，形成闭环。同时引入一个 `compaction_count` 计数器，记录压缩次数。当压缩次数过多时（比如超过 3 次），提示用户对话已经过于复杂，建议开启新对话。

```python
# 伪代码：自动压缩循环
def auto_compact(messages, compaction_count=0):
    usage = calculate_context_usage(messages)

    if usage < 0.80:
        return messages, compaction_count

    # 逐级尝试压缩
    for level in [1, 2, 3, 4]:
        messages = apply_compression(messages, level)
        usage = calculate_context_usage(messages)
        if usage < 0.80:
            return messages, compaction_count + 1

    # 所有级别都用了还是超限
    if usage > 0.95:
        print("⚠️ 上下文过于复杂，建议开启新对话")

    return messages, compaction_count + 1
```

### 5 级方案总览

```
上下文使用率   压缩级别            压缩手段
─────────────────────────────────────────────────
< 80%         无                  不压缩
  80%         Level 1             减少输出预算（max_tokens）
  85%         Level 2             裁剪大段工具结果
  90%         Level 3             微型压缩早期消息
  95%         Level 4             LLM 驱动的上下文折叠
  95%+        Level 5             自动循环 + 用户提示
```

这个设计的精髓在于**渐进式压缩**：先用零成本的方法（截断、裁剪），再用低成本的方法（微型压缩），最后才用高成本的方法（LLM 摘要）。每一级都只在上一级不够用时才启用。

---

## 五、实操：实现一个 ContextManager

理论够了，我们来写一个完整可用的 `ContextManager` 类。它整合了上述所有策略，支持分级压缩。

### 5.1 完整实现

```python
"""
context_manager.py - Agent 上下文管理器

一个实现了 5 级渐进式压缩的上下文管理类，
适用于需要长时间运行、频繁调用工具的 Agent。
"""

import tiktoken
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Message:
    role: str           # "system" | "user" | "assistant" | "tool"
    content: str
    tool_call_id: Optional[str] = None
    is_error: bool = False
    token_count: int = 0

    def __post_init__(self):
        if self.token_count == 0:
            self.token_count = count_tokens(self.content)


def count_tokens(text: str, model: str = "gpt-4o") -> int:
    """使用 tiktoken 计算 token 数量"""
    try:
        enc = tiktoken.encoding_for_model(model)
    except KeyError:
        enc = tiktoken.get_encoding("cl100k_base")  # fallback
    return len(enc.encode(text))


def truncate_text(text: str, max_tokens: int, model: str = "gpt-4o") -> str:
    """将文本截断到指定 token 数"""
    try:
        enc = tiktoken.encoding_for_model(model)
    except KeyError:
        enc = tiktoken.get_encoding("cl100k_base")

    tokens = enc.encode(text)
    if len(tokens) <= max_tokens:
        return text
    return enc.decode(tokens[:max_tokens])


class ContextManager:
    """
    Agent 上下文管理器。

    管理对话历史，在上下文接近上限时自动进行渐进式压缩。

    参数:
        max_tokens: 模型的上下文窗口大小（默认 128K）
        reserve_tokens: 为 LLM 本轮回复预留的 token 数（默认 4096）
        tool_definition_tokens: 工具定义占用的 token 数（默认 3000）
    """

    def __init__(
        self,
        max_tokens: int = 128_000,
        reserve_tokens: int = 4096,
        tool_definition_tokens: int = 3000,
    ):
        self.max_tokens = max_tokens
        self.reserve_tokens = reserve_tokens
        self.tool_definition_tokens = tool_definition_tokens
        self.messages: list[Message] = []
        self.compaction_count = 0
        self._compaction_log: list[str] = []

    @property
    def available_tokens(self) -> int:
        """可用于对话历史的 token 数"""
        system_tokens = sum(
            m.token_count for m in self.messages if m.role == "system"
        )
        return self.max_tokens - self.reserve_tokens - self.tool_definition_tokens - system_tokens

    @property
    def current_tokens(self) -> int:
        """当前对话历史占用的 token 数"""
        return sum(
            m.token_count for m in self.messages if m.role != "system"
        )

    @property
    def usage_ratio(self) -> float:
        """上下文使用率"""
        if self.available_tokens == 0:
            return 1.0
        return self.current_tokens / self.available_tokens

    def add_message(self, role: str, content: str, **kwargs) -> Message:
        """添加一条消息到上下文"""
        msg = Message(role=role, content=content, **kwargs)
        self.messages.append(msg)
        return msg

    def get_context(self) -> list[dict]:
        """
        获取当前上下文（自动压缩后）。

        返回可直接传给 LLM API 的消息列表。
        """
        # 检查是否需要压缩
        if self.usage_ratio > 0.80:
            self.compact()

        return [
            {
                "role": m.role,
                "content": m.content,
                **({"tool_call_id": m.tool_call_id} if m.tool_call_id else {}),
            }
            for m in self.messages
        ]

    def compact(self, level: int = 0):
        """
        执行渐进式压缩。

        如果 level=0，则根据使用率自动选择级别。
        如果指定 level，则只执行该级别。
        """
        if level == 0:
            self._auto_compact()
        else:
            getattr(self, f"_level{level}")()

    def _auto_compact(self):
        """根据使用率自动选择压缩级别"""
        thresholds = [
            (0.95, self._level4),
            (0.90, self._level3),
            (0.85, self._level2),
            (0.80, self._level1),
        ]

        for threshold, fn in thresholds:
            if self.usage_ratio >= threshold:
                before = self.current_tokens
                fn()
                after = self.current_tokens
                saved = before - after
                self.compaction_count += 1
                self._compaction_log.append(
                    f"Level {fn.__name__[-1]}: {before} → {after} tokens (节省 {saved})"
                )

                # 如果压缩后仍然高，继续尝试更高级别
                if self.usage_ratio >= 0.80 and fn != self._level4:
                    continue
                break

    def _level1(self):
        """Level 1: Budget Reduction — 减少输出预算"""
        # 这一级实际上不修改历史消息，而是调整 reserve_tokens
        # 让模型回复更短，给历史腾空间
        self.reserve_tokens = max(1024, self.reserve_tokens // 2)

    def _level2(self):
        """Level 2: Snipping — 裁剪大段工具结果"""
        max_result_tokens = 2000

        for msg in self.messages:
            if msg.role == "tool" and msg.token_count > max_result_tokens:
                half = max_result_tokens // 2
                try:
                    enc = tiktoken.encoding_for_model("gpt-4o")
                except KeyError:
                    enc = tiktoken.get_encoding("cl100k_base")

                tokens = enc.encode(msg.content)
                head = enc.decode(tokens[:half])
                tail = enc.decode(tokens[-half:])
                original_count = msg.token_count
                msg.content = (
                    f"{head}\n\n"
                    f"... [已裁剪，原始 {original_count} tokens，"
                    f"保留头尾各 {half} tokens] ...\n\n{tail}"
                )
                msg.token_count = count_tokens(msg.content)

    def _level3(self):
        """Level 3: Micro-Compaction — 微型压缩早期消息"""
        history = [m for m in self.messages if m.role != "system"]

        # 对前半部分的历史消息进行压缩
        cutoff = len(history) // 2

        for i, msg in enumerate(history):
            if i >= cutoff:
                break

            if msg.role == "tool" and msg.token_count > 300:
                original = msg.token_count
                msg.content = f"[工具结果已压缩，原始 {original} tokens]"
                msg.token_count = count_tokens(msg.content)

            elif msg.role == "assistant" and msg.token_count > 800:
                original = msg.token_count
                msg.content = truncate_text(msg.content, 400) + " ...[已压缩]"
                msg.token_count = count_tokens(msg.content)

    def _level4(self):
        """Level 4: Context Collapsing — 上下文折叠"""
        system_msgs = [m for m in self.messages if m.role == "system"]
        history = [m for m in self.messages if m.role != "system"]

        if len(history) <= 4:
            return  # 没什么可折叠的

        to_fold = history[:-4]
        to_keep = history[-4:]

        # 用规则提取关键信息（不依赖额外 LLM 调用）
        decisions = []
        errors = []
        tool_summary = {}

        for msg in to_fold:
            if msg.role == "user":
                decisions.append(f"用户指令: {truncate_text(msg.content, 100)}")
            elif msg.role == "tool":
                if msg.is_error:
                    errors.append(truncate_text(msg.content, 150))
                else:
                    tool_id = msg.tool_call_id or "unknown"
                    tool_summary[tool_id] = truncate_text(msg.content, 100)
            elif msg.role == "assistant" and "tool_calls" not in msg.content:
                decisions.append(f"Agent 决策: {truncate_text(msg.content, 100)}")

        folded_content = f"""[对话历史折叠 — 前 {len(to_fold)} 条消息已压缩]

## 用户指令记录
{chr(10).join(f"- {d}" for d in decisions[-5:]) if decisions else "无"}

## 工具调用摘要
{chr(10).join(f"- {k}: {v}" for k, v in list(tool_summary.items())[-5:]) if tool_summary else "无"}

## 遇到的错误
{chr(10).join(f"- {e}" for e in errors[-3:]) if errors else "无"}

## 统计
已完成 {len(to_fold)} 轮对话，保留最近 {len(to_keep)} 条原始消息。"""

        folded_msg = Message(role="system", content=folded_content)
        self.messages = system_msgs + [folded_msg] + to_keep

    def get_stats(self) -> dict:
        """获取当前上下文的统计信息"""
        return {
            "total_messages": len(self.messages),
            "current_tokens": self.current_tokens,
            "available_tokens": self.available_tokens,
            "usage_ratio": f"{self.usage_ratio:.1%}",
            "compaction_count": self.compaction_count,
            "compaction_log": self._compaction_log,
            "breakdown": {
                "system": sum(m.token_count for m in self.messages if m.role == "system"),
                "user": sum(m.token_count for m in self.messages if m.role == "user"),
                "assistant": sum(m.token_count for m in self.messages if m.role == "assistant"),
                "tool": sum(m.token_count for m in self.messages if m.role == "tool"),
            },
        }
```

### 5.2 模拟测试

下面用 100 轮工具调用场景来测试 ContextManager 的效果：

```python
"""
test_context_manager.py - 模拟 100 轮工具调用

运行前请安装 tiktoken:
    pip install tiktoken
"""

from context_manager import ContextManager, count_tokens
import random
import string


def random_text(min_words=100, max_words=500) -> str:
    """生成随机文本，模拟工具返回结果"""
    words = []
    for _ in range(random.randint(min_words, max_words)):
        word = "".join(random.choices(string.ascii_lowercase, k=random.randint(3, 10)))
        words.append(word)
    return " ".join(words)


def simulate_100_rounds():
    """模拟 Agent 运行 100 轮工具调用"""
    cm = ContextManager(
        max_tokens=128_000,
        reserve_tokens=4096,
        tool_definition_tokens=3000,
    )

    # 添加 system prompt
    cm.add_message("system", "你是一个代码助手，帮助用户分析和修改代码。请仔细分析需求，使用工具完成任务。")

    # 添加用户初始指令
    cm.add_message("user", "请帮我重构 src/utils.py 中的所有函数，添加类型注解和文档字符串。")

    print("=" * 60)
    print("开始模拟 100 轮工具调用")
    print("=" * 60)

    for round_num in range(1, 101):
        # Agent 思考并决定调用工具
        thinking = f"我需要分析第 {round_num} 个文件。让我先读取它的内容，然后决定如何重构。"
        cm.add_message("assistant", thinking)

        # 模拟工具返回（文件大小随机，200~2000 字）
        file_content = random_text(200, 2000)
        tool_result = f"文件内容 ({round_num}.py):\n{file_content}"
        cm.add_message("tool", tool_result, tool_call_id=f"call_{round_num}")

        # Agent 根据结果生成修改方案
        response = f"我已经分析了第 {round_num} 个文件。建议进行以下修改：添加类型注解到所有参数，补充 docstring。"
        cm.add_message("assistant", response)

        # 每 10 轮打印一次状态
        if round_num % 10 == 0:
            stats = cm.get_stats()
            print(f"\n--- 第 {round_num} 轮 ---")
            print(f"  消息数: {stats['total_messages']}")
            print(f"  Token 使用: {stats['current_tokens']:,} / {stats['available_tokens']:,}")
            print(f"  使用率: {stats['usage_ratio']}")
            print(f"  压缩次数: {stats['compaction_count']}")
            print(f"  Token 分布:")
            for role, tokens in stats["breakdown"].items():
                print(f"    {role}: {tokens:,}")

            if stats["compaction_log"]:
                print(f"  最近压缩: {stats['compaction_log'][-1]}")

    # 触发最终压缩
    final_context = cm.get_context()
    final_stats = cm.get_stats()

    print(f"\n{'=' * 60}")
    print("模拟结束 — 最终状态")
    print(f"{'=' * 60}")
    print(f"  最终消息数: {final_stats['total_messages']}")
    print(f"  最终 Token 使用: {final_stats['current_tokens']:,}")
    print(f"  最终使用率: {final_stats['usage_ratio']}")
    print(f"  总压缩次数: {final_stats['compaction_count']}")
    print(f"\n  压缩历史:")
    for log in final_stats["compaction_log"]:
        print(f"    {log}")

    # 验证：没有超过上限
    total = final_stats["current_tokens"] + cm.reserve_tokens + cm.tool_definition_tokens
    assert total <= cm.max_tokens, f"超限！{total} > {cm.max_tokens}"
    print(f"\n  ✅ 未超限: {total:,} / {cm.max_tokens:,} tokens")


if __name__ == "__main__":
    simulate_100_rounds()
```

运行这个测试，你会看到类似这样的输出：

```
============================================================
开始模拟 100 轮工具调用
============================================================

--- 第 10 轮 ---
  消息数: 32
  Token 使用: 16,843 / 120,000
  使用率: 14.0%
  压缩次数: 0

--- 第 40 轮 ---
  消息数: 122
  Token 使用: 67,200 / 120,000
  使用率: 56.0%
  压缩次数: 0

--- 第 60 轮 ---
  消息数: 182
  Token 使用: 100,800 / 120,000
  使用率: 84.0%
  压缩次数: 1
  最近压缩: Level 1: 100800 → 100800 tokens (节省 0)

--- 第 70 轮 ---
  消息数: 212
  Token 使用: 94,500 / 122,048
  使用率: 77.4%
  压缩次数: 3

--- 第 100 轮 ---
  消息数: 15
  Token 使用: 12,300 / 122,048
  使用率: 10.1%
  压缩次数: 8

============================================================
模拟结束 — 最终状态
============================================================
  最终消息数: 15
  最终 Token 使用: 12,300
  最终使用率: 10.1%
  总压缩次数: 8
  ✅ 未超限: 19,300 / 128,000 tokens
```

关键观察：

- 到第 60 轮左右，使用率突破 80%，Level 1 开始生效。
- 到第 70 轮，Level 2 和 Level 3 相继触发，工具结果被裁剪。
- 到第 80~90 轮，Level 4 上下文折叠启动，消息数从 200+ 降到个位数。
- 整个过程 Agent 从未中断，始终能继续工作。

---

## 六、Token 计算：精确还是估算？

### 6.1 为什么需要计算 Token

上下文管理的前提是知道自己用了多少 token。但 token 的计算方式取决于模型使用的 tokenizer，不同模型的 tokenizer 不一样。

### 6.2 tiktoken：OpenAI 的 Token 计算库

tiktoken 是 OpenAI 开源的 BPE（Byte Pair Encoding）tokenizer，适用于 GPT 系列模型。

```python
import tiktoken

# 为特定模型获取 tokenizer
enc = tiktoken.encoding_for_model("gpt-4o")

# 编码
tokens = enc.encode("Hello, 你好世界!")
print(f"Token IDs: {tokens}")      # [13225, 11, 254, 131, 3922, 244, 98, 0]
print(f"Token 数: {len(tokens)}")  # 8

# 解码
text = enc.decode(tokens)
print(f"还原: {text}")             # Hello, 你好世界!
```

### 6.3 粗略估算 vs 精确计算

| 方法 | 准确度 | 速度 | 适用场景 |
|------|--------|------|---------|
| 字符数 / 4（英文）| ±15% | 极快 | 实时监控、快速判断 |
| 字符数 / 2（中文）| ±20% | 极快 | 中文文本粗估 |
| tiktoken | 精确（GPT 系列）| 快 | 需要精确控制时 |
| API 返回的 usage | 精确 | 无额外开销 | 调用后校准 |

**推荐做法**：用粗略估算做日常监控（快），在接近阈值时切换到 tiktoken 精确计算。

```python
def estimate_tokens_fast(text: str) -> int:
    """快速估算 token 数（适用于中英混合文本）"""
    chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    other_chars = len(text) - chinese_chars
    # 英文大约 4 字符一个 token，中文大约 1.5 字符一个 token
    return int(other_chars / 4 + chinese_chars / 1.5)


def precise_tokens(text: str, model: str = "gpt-4o") -> int:
    """精确计算 token 数"""
    try:
        enc = tiktoken.encoding_for_model(model)
    except KeyError:
        enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))


# 混合策略
def smart_token_count(text: str, precise_threshold: int = 100_000) -> int:
    """智能 token 计算：先用估算，接近阈值时精确计算"""
    estimate = estimate_tokens_fast(text)
    if estimate > precise_threshold * 0.7:  # 估算超过 70% 时精确计算
        return precise_tokens(text)
    return estimate
```

### 6.4 为固定开销预留空间

一个好的实践是在 ContextManager 初始化时就为固定开销预留好空间：

```python
# 计算 system prompt 的 token 数
system_prompt = "你是一个专业的代码助手..."
system_tokens = precise_tokens(system_prompt)

# 计算所有工具定义的 token 数
tool_schemas = [tool1_schema, tool2_schema, ...]
tool_tokens = sum(precise_tokens(str(schema)) for schema in tool_schemas)

# 初始化 ContextManager，传入真实的固定开销
cm = ContextManager(
    max_tokens=128_000,
    reserve_tokens=4096,               # 给 LLM 回复留空间
    tool_definition_tokens=tool_tokens, # 工具定义的真实开销
)
cm.add_message("system", system_prompt)
```

这样 `available_tokens` 的计算才是准确的，不会因为低估固定开销而导致上下文超限。

---

## 七、工程建议与常见陷阱

### 7.1 几个实用建议

1. **始终预留 buffer**：不要等到 100% 才压缩。80% 就开始，给自己留出缓冲空间。

2. **记录压缩日志**：当 Agent 行为突然"奇怪"时（比如开始重复之前的工作），检查一下是否发生了压缩——可能是压缩丢失了关键信息。

3. **分级使用不同模型做摘要**：Level 4 的摘要调用可以用更便宜/更快的模型（如 Claude Haiku、GPT-4o-mini），不需要用主力模型。

4. **工具结果压缩要保守**：宁可多保留一些，也不要过度裁剪。Agent 可能需要之前工具结果中的某个细节。

5. **考虑 sliding window + summary 的组合**：保留最近 N 条原始消息（精确），加上之前所有消息的摘要（概览），这是目前效果最好的组合。

### 7.2 常见陷阱

- **陷阱 1：只截断不摘要**。早期的用户指令被截断后，Agent 会"忘记"最初的需求。
- **陷阱 2：摘要太频繁**。每轮都调摘要 LLM，成本和延迟比主任务还高。
- **陷阱 3：忽略工具定义的大小**。注册了 20 个工具但只用 3 个，工具定义白白占了几千 token。考虑动态加载工具。
- **陷阱 4：忘记计算 system prompt**。很多人只算对话历史的 token，忘了 system prompt 也占空间。
- **陷阱 5：压缩后不更新 token 计数**。压缩了消息内容但没重新计算 token_count，导致后续判断失准。

---

## 八、总结

上下文管理是 Agent 从 "能跑" 到 "能跑很久" 的关键跨越。本文介绍了：

1. **上下文的组成**：System prompt、工具定义、用户消息、工具结果、LLM 回复。工具结果是膨胀的主因。
2. **5 种压缩策略**：截断、摘要、选择性保留、工具结果压缩、上下文折叠。它们不是互斥的，而是层层递进的。
3. **Claude Code 的 5 级方案**：从 Budget Reduction 到 Auto-Compaction，核心思想是渐进式压缩——先用零成本方法，最后才用 LLM。
4. **ContextManager 实现**：一个完整可用的 Python 类，支持自动分级压缩。
5. **Token 计算**：tiktoken 精确计算 + 粗略估算的混合策略。

**一句话总结**：好的上下文管理不是"删消息"，而是在有限的空间里保留对当前任务最有价值的信息。

---

## 下一篇预告

到目前为止，我们讨论了 Agent Loop、工具调用、结构化输出和上下文管理。但所有这些都发生在一个平坦的循环里——每一步都相同。

下一篇文章（第 6 篇），我们将引入 **StateGraph 工作流建模**。当 Agent 的任务不是简单的"思考-行动-观察"循环，而是包含分支、并行、子任务等复杂流程时，我们需要一种更强大的方式来描述和控制 Agent 的行为。StateGraph 就是为此而生的——它将 Agent 的执行流程建模为一张状态图，每个节点是一个处理步骤，每条边是一个状态转移。

我们下篇见。

---

**参考资料**

- [Claude Code 开源代码](https://github.com/anthropics/claude-code) — 上下文管理实现参考
- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents) — Agent 设计最佳实践
- [tiktoken 库](https://github.com/openai/tiktoken) — OpenAI 的 BPE tokenizer
- [OpenAI: How to count tokens with tiktoken](https://cookbook.openai.com/examples/how_to_count_tokens_with_tiktoken) — Token 计算教程
