---
title: 'Agent Loop 深度调研（二）：主流框架实操拆解'
description: '逐一拆解 Claude Code、OpenAI Agents SDK、Google ADK、LangGraph 四大框架的 Agent Loop 实现，含代码示例与关键设计差异。'
pubDate: 2026-06-19
category: 'AI 工程'
tags: ['Agent Loop', 'Claude Code', 'OpenAI Agents SDK', 'Google ADK', 'LangGraph']
series: 'Agent Loop 深度调研'
seriesOrder: 2
draft: false
---

本文逐一拆解四大主流 Agent Loop 框架的实现细节。每个框架都从执行循环、工具调用、上下文管理、多 Agent 协作四个维度分析，并附可运行代码。

## 一、Claude Code：工业级 Agent Loop 标杆

Claude Code 是当前最成熟的 Agent Loop 实现之一。其源码虽未公开，但 VILA-Lab 的 [Dive-into-Claude-Code](https://github.com/VILA-Lab/Dive-into-Claude-Code) 项目对其做了完整逆向分析，Anthropic 也发布了 [Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview) 提供编程接口。

### 1.1 执行循环核心

Claude Code 的 Agent Loop 实现为一个 **AsyncGenerator**，yield 出流式事件。核心伪代码：

```python
async def agent_loop(messages, tools, config):
    turn = 0
    while True:
        # 1. 解析配置
        resolved_config = resolve_config(config)
        
        # 2. 初始化轮次状态
        state = init_turn_state(turn)
        
        # 3. 组装上下文（9 个有序来源）
        context = assemble_context(
            system_prompt,
            memory_files,      # CLAUDE.md / AGENTS.md
            project_config,
            tool_definitions,
            conversation_history,
            # ... 更多来源
        )
        
        # 4. 应用五级压缩（最廉价优先）
        context = apply_compaction_shapers(context, [
            budget_reduction,
            snipping,
            micro_compaction,
            context_collapsing,
            auto_compaction,     # 最后手段：调用模型做全量摘要
        ])
        
        # 5. 调用模型
        response = await call_model(context)
        
        # 6. 分派工具调用
        tool_calls = extract_tool_calls(response)
        
        if not tool_calls:
            # 终止条件 1：无工具调用
            yield FinalResult(response.text)
            break
        
        # 7. 权限门控
        approved = await permission_gate(tool_calls, config.permission_mode)
        
        # 8. 执行工具（两条路径）
        # 路径 A：流式执行（低延迟）
        results = await streaming_tool_executor(approved)
        # 路径 B：降级执行（并发安全分类）
        results = await fallback_run_tools(approved)
        
        # 9. 评估终止条件
        if should_stop(turn, context, hooks):
            break
        
        # 将工具结果追加到消息历史
        messages.append(tool_results(results))
        turn += 1
```

### 1.2 工具系统

工具通过五步组装流程确定可用集：枚举基础能力 → 按模式过滤 → 应用黑名单 → 集成外部协议（MCP）→ 去重。

工具执行有两条路径：

- **StreamingToolExecutor**：工具在模型流式生成时就开始执行，不等全部输出完毕。这是延迟优化的关键。
- **Fallback runTools**：二级分类器评估工具是否可以安全并发，或需要独占执行。

### 1.3 上下文压缩的五级策略

```
Level 1: Budget Reduction    → 删除已知低价值 token（最廉价）
Level 2: Snipping            → 截断过长的工具输出（保留首尾）
Level 3: Micro-compaction    → 合并相邻相似消息
Level 4: Context Collapsing  → 折叠早期对话轮次
Level 5: Auto-compaction     → 调用模型做全量摘要（最昂贵，最后手段）
```

恢复机制包括：三次重试时逐步增加 max_tokens、每轮一次反应式压缩、超长提示降级、流式降级、辅助模型兜底。

### 1.4 子代理委托

子代理运行在隔离的 sidechain 上下文中（可以是独立 worktree 或远程环境），完成后只返回摘要 transcript，保护主上下文窗口不被膨胀。

### 1.5 使用 Agent SDK 编程调用

Anthropic 的 [Agent SDK for Python](https://docs.claude.com/docs/en/agent-sdk/python) 提供两种模式：

**一次性任务（standalone 函数）**

```python
from claude_code import query

async def main():
    async for message in query(
        prompt="用 Python 写一个 Web 服务器",
        system_prompt="你是一个高级后端工程师",
        cwd="/path/to/project",
        max_turns=10,
    ):
        if hasattr(message, 'content'):
            for block in message.content:
                if hasattr(block, 'text'):
                    print(block.text)
```

**连续对话（client 类）**

```python
from claude_code import ClaudeCodeClient

async def main():
    async with ClaudeCodeClient() as client:
        # 第一轮
        async for msg in client.query("分析一下这个项目的架构"):
            print(msg)
        
        # 第二轮（保持上下文）
        async for msg in client.query("针对你发现的性能问题给出优化方案"):
            print(msg)
```

**自定义工具 + 权限控制**

```python
from claude_code import query, tool

@tool(read_only=True)
def search_docs(query: str) -> str:
    """搜索项目文档"""
    # ... 实现搜索逻辑
    return results

@tool()
def run_tests(test_path: str) -> str:
    """运行测试"""
    import subprocess
    result = subprocess.run(
        ["pytest", test_path], capture_output=True, text=True
    )
    return result.stdout

async def main():
    async for message in query(
        prompt="运行所有单元测试并修复失败的",
        tools=[search_docs, run_tests],
        permission_mode="acceptEdits",  # 自动批准文件编辑
        max_turns=20,
    ):
        pass
```

### 1.6 Claude Code 的关键设计决策

- **基于文件的记忆系统**：用 CLAUDE.md / AGENTS.md 而非向量数据库，可版本控制
- **指令作为概率性上下文注入**：而非确定性系统提示
- **deny-first 权限模型**：七种权限模式，默认拒绝
- **append-only 日志**：会话状态通过追加式 JSONL 日志持久化，恢复时丢弃授权状态以确保审计链

## 二、OpenAI Agents SDK：极简 Agent Loop

OpenAI 的 [Agents SDK](https://openai.github.io/openai-agents-python/) 代表了另一种设计哲学——最小化抽象，让开发者直接控制循环。

### 2.1 核心执行循环

Runner 类驱动 Agent Loop，核心逻辑非常直接：

```python
# Runner 内部的简化伪代码
async def run(agent, input, max_turns=10):
    messages = [{"role": "user", "content": input}]
    
    for turn in range(max_turns):
        # 1. 调用模型
        response = await model.chat(messages, tools=agent.tools)
        
        # 2. 判断下一步
        if response.has_text and not response.has_tool_calls:
            # 终止：模型输出文本，无工具调用
            return RunResult(final_output=response.text)
        
        if response.has_handoff:
            # 切换：控制权转移到另一个 Agent
            agent = response.handoff_target
            messages = update_context(messages, agent)
            continue
        
        if response.has_tool_calls:
            # 继续：执行工具，结果回传模型
            tool_results = await execute_tools(response.tool_calls)
            messages.extend(tool_results)
            continue
    
    # 超过最大轮次
    raise MaxTurnsExceeded(f"Exceeded {max_turns} turns")
```

### 2.2 最小可运行示例

```python
from agents import Agent, Runner, function_tool

@function_tool
def get_weather(city: str) -> str:
    """获取指定城市的天气信息"""
    # 模拟天气 API 调用
    weather_data = {"北京": "晴 25°C", "上海": "多云 22°C"}
    return weather_data.get(city, "未知城市")

agent = Agent(
    name="WeatherAssistant",
    instructions="你是一个天气助手，用 get_weather 工具查询天气。",
    tools=[get_weather],
)

# 同步执行
result = Runner.run_sync(agent, "北京今天天气怎么样？")
print(result.final_output)
# → "北京今天天气晴朗，气温 25°C。"
```

### 2.3 多 Agent 协作：Handoffs

OpenAI Agents SDK 用 **Handoff（交接）** 而非子代理来实现多 Agent 协作：

```python
from agents import Agent, Runner

# 专门的工具集
triage_agent = Agent(
    name="TriageAgent",
    instructions="分析用户问题类型，转交给对应专家。",
    handoffs=[],  # 运行时注入
)

billing_agent = Agent(
    name="BillingAgent",
    instructions="处理账单和支付相关问题。",
    tools=[refund_tool, query_invoice_tool],
)

tech_agent = Agent(
    name="TechAgent",
    instructions="处理技术问题和故障排查。",
    tools=[diagnose_tool, restart_service_tool],
)

# 设置交接关系
triage_agent.handoffs = [billing_agent, tech_agent]

# 运行：triage_agent 会根据问题自动 handoff 到对应专家
result = Runner.run_sync(triage_agent, "我的信用卡被重复扣款了")
```

### 2.4 Guardrails（护栏）

护栏与 Agent 执行并行运行，快速失败：

```python
from agents import Agent, Runner, InputGuardrail, GuardrailFunctionOutput

async def check_for_jailbreak(ctx, agent, input):
    # 自定义安全检查
    result = await safety_model.evaluate(input)
    return GuardrailFunctionOutput(
        output_info=result,
        tripwire_triggered=result.is_unsafe,
    )

agent = Agent(
    name="SafeAgent",
    instructions="You are a helpful assistant.",
    input_guardrails=[
        InputGuardrail(guardrail_function=check_for_jailbreak)
    ],
)
```

### 2.5 工具配置

```python
from agents import RunConfig, ToolExecutionConfig

result = await Runner.run(
    agent,
    "执行所有必要的操作",
    run_config=RunConfig(
        tool_execution=ToolExecutionConfig(
            max_function_tool_concurrency=2,  # 限制并发
            pre_approval_tool_input_guardrails=True,  # 工具执行前审批
        ),
    ),
)
```

### 2.6 OpenAI Agents SDK 的关键设计决策

- **极简抽象**：Runner + Agent + Tool 三个核心概念，没有复杂的图结构
- **Handoff 而非子代理**：Agent 间是平等交接，不是层级委派
- **并行 Guardrails**：安全检查不阻塞主循环
- **MCP 原生支持**：MCP 服务器工具与函数工具无差异使用

## 三、Google ADK：多 Agent 拓扑优先

Google 的 [Agent Development Kit](https://adk.dev/) 从多 Agent 拓扑设计出发，Agent Loop 是拓扑中的一个节点行为。

### 3.1 核心执行模型

```python
from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

def search_database(query: str) -> str:
    """搜索内部数据库"""
    # ... 实现
    return results

# 创建 Agent
agent = LlmAgent(
    model="gemini-2.0-flash",
    name="research_agent",
    instruction="你是一个研究助手。使用 search_database 工具查找信息。",
    tools=[search_database],
    description="专门负责信息检索和数据分析的 Agent",  # 用于多 Agent 路由
)

# 执行
async def main():
    session_service = InMemorySessionService()
    runner = Runner(
        agent=agent,
        app_name="research_app",
        session_service=session_service,
    )
    
    content = types.Content(
        role='user',
        parts=[types.Part(text='查找最近一季度的销售数据')]
    )
    
    async for event in runner.run_async(
        user_id="user1",
        session_id="session1",
        new_message=content,
    ):
        if event.is_final_response() and event.content:
            print(event.content.parts[0].text)
```

### 3.2 多 Agent 拓扑模式

Google ADK 原生支持四种拓扑：

**Sequential（顺序）** — Agent A → Agent B → Agent C

```python
from google.adk.agents import SequentialAgent

pipeline = SequentialAgent(
    name="content_pipeline",
    sub_agents=[research_agent, writer_agent, editor_agent],
)
```

**Parallel（并行）** — Agent A || Agent B

```python
from google.adk.agents import ParallelAgent

fan_out = ParallelAgent(
    name="parallel_research",
    sub_agents=[web_search_agent, db_query_agent, doc_search_agent],
)
```

**Loop（循环）** — Agent A → Agent B → 评估 → 回到 A

```python
from google.adk.agents import LoopAgent

improvement_loop = LoopAgent(
    name="code_improvement",
    sub_agents=[code_generator, code_reviewer],
    # 循环直到 reviewer 认为代码合格
)
```

**Routing（路由）** — 根据输入选择不同 Agent

```python
# 通过 Agent 的 description 字段实现自动路由
# 当多个 Agent 注册在同一 Runner 中时，
# 系统根据用户意图和 Agent 描述匹配最佳执行者
```

### 3.3 回调系统

Google ADK 提供 Agent 生命周期的细粒度回调：

```python
agent = LlmAgent(
    name="callback_agent",
    model="gemini-2.0-flash",
    instruction="...",
    tools=[...],
    # 回调钩子
    before_model_callback=on_before_model,    # 模型调用前
    after_model_callback=on_after_model,      # 模型调用后
    before_tool_callback=on_before_tool,      # 工具执行前
    after_tool_callback=on_after_tool,        # 工具执行后
)
```

### 3.4 Google ADK 的关键设计决策

- **多语言支持**：Python / TypeScript / Go / Java / Kotlin
- **拓扑优先**：先定义 Agent 间的协作模式，再定义单个 Agent 的行为
- **事件流驱动**：Runner 产出事件流而非阻塞结果
- **Session 服务抽象**：可插拔的会话存储后端

## 四、LangGraph：图结构 Agent Loop

LangGraph 将 Agent Loop 建模为 **有向图**，节点是计算步骤，边是控制流。

### 4.1 核心概念

```
StateGraph = 有向图
  ├── State（状态）= 类型化的消息列表 + 自定义字段
  ├── Nodes（节点）= 处理函数
  ├── Edges（边）= 节点间的转移
  └── Conditional Edges（条件边）= 动态路由
```

### 4.2 ReAct Agent 实现

```python
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
import operator

# 1. 定义状态
class AgentState(TypedDict):
    messages: Annotated[list, operator.add]  # 消息列表，自动追加

# 2. 定义工具
def search(query: str) -> str:
    """搜索互联网"""
    return f"搜索结果：{query} 的相关信息..."

def calculator(expression: str) -> str:
    """计算数学表达式"""
    return str(eval(expression))

tools = [search, calculator]
model = ChatOpenAI(model="gpt-4o").bind_tools(tools)

# 3. 定义节点
def agent_node(state: AgentState):
    """Agent 决策节点：调用模型"""
    response = model.invoke(state["messages"])
    return {"messages": [response]}

tool_node = ToolNode(tools)

# 4. 定义条件边
def should_continue(state: AgentState):
    """判断是否需要继续工具调用"""
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"    # 有工具调用 → 执行工具
    return END            # 无工具调用 → 结束

# 5. 构建图
graph = StateGraph(AgentState)

# 添加节点
graph.add_node("agent", agent_node)
graph.add_node("tools", tool_node)

# 添加边
graph.add_edge(START, "agent")              # 入口 → Agent
graph.add_conditional_edges("agent", should_continue)  # Agent → 工具 or 结束
graph.add_edge("tools", "agent")             # 工具 → Agent（回到循环）

# 6. 编译并运行
app = graph.compile()

result = app.invoke({
    "messages": [("user", "搜索一下 Python 3.12 有什么新特性")]
})

for msg in result["messages"]:
    print(f"[{msg.type}] {msg.content}")
```

### 4.3 状态检查点

LangGraph 的核心优势是 **持久化检查点**，支持长时间运行的 Agent：

```python
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
app = graph.compile(checkpointer=checkpointer)

# 第一轮
config = {"configurable": {"thread_id": "user-123"}}
result1 = app.invoke(
    {"messages": [("user", "帮我分析这个项目的依赖")]},
    config,
)

# 第二轮（自动恢复上下文）
result2 = app.invoke(
    {"messages": [("user", "根据刚才的分析，生成一份报告")]},
    config,  # 同一个 thread_id，自动拼接历史
)
```

### 4.4 人机协作断点

```python
from langgraph.types import interrupt, Command

def sensitive_tool_node(state):
    """需要人工审批的工具执行"""
    tool_calls = state["messages"][-1].tool_calls
    
    for tc in tool_calls:
        if tc["name"] == "delete_record":
            # 中断执行，等待人工审批
            decision = interrupt({
                "question": f"确认删除记录 {tc['args']['id']}？",
                "tool_call": tc,
            })
            if decision != "approved":
                return {"messages": [{"role": "tool", "content": "操作被取消"}]}
    
    # 审批通过，执行工具
    return execute_tools(tool_calls)

# 恢复中断的执行
app.invoke(
    Command(resume="approved"),
    config,
)
```

### 4.5 LangGraph 的关键设计决策

- **图即程序**：Agent Loop 是显式的图结构，控制流可视化
- **类型化状态**：State 是 TypedDict，编译时检查
- **条件边**：动态路由决策，而非固定转移
- **检查点持久化**：任意时刻可暂停/恢复，支持人机协作

## 五、框架对比总结

| 维度 | Claude Code | OpenAI SDK | Google ADK | LangGraph |
|------|-----------|------------|------------|-----------|
| **循环实现** | AsyncGenerator while-loop | Runner for-loop | Event Loop | 有向图遍历 |
| **工具系统** | 5 步组装 + MCP | @function_tool + MCP | 函数/OpenAPI/MCP | LangChain Tools |
| **上下文压缩** | 5 级渐进压缩 | 开发者自行实现 | Session 服务管理 | Checkpoint + 手动 |
| **多 Agent** | 子代理 sidechain | Handoff 交接 | 4 种拓扑模式 | 图嵌套/子图 |
| **安全检查** | deny-first 7 模式 | 并行 Guardrails | 回调钩子 | 人机断点 |
| **状态持久化** | JSONL append-only | 可插拔 Session | Session 服务 | 检查点系统 |
| **抽象程度** | 高（完整 Harness） | 低（最小 SDK） | 中（拓扑框架） | 中（图引擎） |
| **适用场景** | 编码 Agent | 通用 Agent | 企业多 Agent | 复杂工作流 |

### 如何选择

- **要开箱即用的编码 Agent** → Claude Code + Agent SDK
- **要最小化依赖、完全控制** → OpenAI Agents SDK
- **要构建企业级多 Agent 系统** → Google ADK
- **要精确控制执行流、需要人机协作** → LangGraph
- **要自建生产级 Harness** → 下一篇详述

## 参考资料

- [Dive-into-Claude-Code](https://github.com/VILA-Lab/Dive-into-Claude-Code) — Claude Code 18 章架构分析
- [Claude Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview) — Anthropic 官方文档
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) — OpenAI 官方文档
- [Google ADK](https://adk.dev/) — Google 官方文档
- [LangGraph Concepts](https://langchain-ai.github.io/langgraph/concepts/) — LangChain 官方文档
- [awesome-harness-engineering](https://github.com/ai-boost/awesome-harness-engineering) — 综合资源列表
- [The Coding Harness Behind GitHub Copilot](https://code.visualstudio.com/blogs/2026/05/15/agent-harnesses-github-copilot-vscode) — VS Code 博客
- [Improving Deep Agents with Harness Engineering](https://blog.langchain.com/improving-deep-agents-with-harness-engineering/) — LangChain 博客
