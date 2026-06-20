---
title: 'Agent Loop 深度调研（三）：从零构建生产级 Agent Loop'
description: '基于前两篇的调研结论，手把手实现一个生产级 Agent Loop。涵盖核心循环、工具系统、上下文压缩、权限控制、子代理委托的完整代码实现。'
pubDate: 2026-06-19
category: 'AI 工程'
tags: ['Agent Loop', '实操', 'Python', '自建 Agent', 'Harness']
series: 'Agent Loop 深度调研'
seriesOrder: 3
draft: false
---

前两篇梳理了 Agent Loop 的核心概念和主流框架实现。这篇直接动手：从零构建一个可用于生产的 Agent Loop，逐步加入工具系统、上下文管理、权限控制、子代理等关键组件。

所有代码可直接运行，依赖 `openai` 或 `anthropic` SDK 之一即可。

## 第一步：最小 Agent Loop

一个 Agent Loop 的最小可行实现只需要三样东西：消息列表、模型调用、工具执行。

```python
import json
from openai import OpenAI

client = OpenAI()

# ---- 工具定义 ----
def calculator(expression: str) -> str:
    """计算数学表达式并返回结果"""
    try:
        result = eval(expression, {"__builtins__": {}})
        return str(result)
    except Exception as e:
        return f"计算错误: {e}"

def get_time() -> str:
    """返回当前时间"""
    from datetime import datetime
    return datetime.now().isoformat()

# 工具注册表：名称 → 函数
TOOL_REGISTRY = {
    "calculator": calculator,
    "get_time": get_time,
}

# OpenAI function calling schema
TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "计算数学表达式并返回结果",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "要计算的数学表达式，如 '2 + 3 * 4'"
                    }
                },
                "required": ["expression"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_time",
            "description": "返回当前时间",
            "parameters": {"type": "object", "properties": {}}
        }
    }
]

# ---- Agent Loop 核心 ----
def agent_loop(user_message: str, max_turns: int = 10) -> str:
    """
    最小 Agent Loop 实现。
    
    循环逻辑：
    1. 发送消息给模型
    2. 如果模型请求工具调用 → 执行工具 → 结果回传 → 回到 1
    3. 如果模型返回纯文本 → 结束循环，返回结果
    """
    messages = [
        {
            "role": "system",
            "content": "你是一个有帮助的助手。使用工具来获取信息和执行计算。"
        },
        {"role": "user", "content": user_message}
    ]
    
    for turn in range(max_turns):
        print(f"\n--- Turn {turn + 1} ---")
        
        # 调用模型
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOLS_SCHEMA,
            tool_choice="auto",
        )
        
        message = response.choices[0].message
        
        # 终止条件：模型返回纯文本，无工具调用
        if not message.tool_calls:
            print(f"[Agent] {message.content}")
            return message.content
        
        # 将模型的 assistant 消息加入历史
        messages.append(message)
        
        # 执行所有工具调用
        for tool_call in message.tool_calls:
            func_name = tool_call.function.name
            func_args = json.loads(tool_call.function.arguments)
            
            print(f"[Tool Call] {func_name}({func_args})")
            
            # 从注册表查找并执行工具
            if func_name in TOOL_REGISTRY:
                result = TOOL_REGISTRY[func_name](**func_args)
            else:
                result = f"错误：未知工具 {func_name}"
            
            print(f"[Tool Result] {result}")
            
            # 将工具结果回传给模型
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": str(result),
            })
    
    raise RuntimeError(f"Agent Loop 在 {max_turns} 轮后仍未完成")

# ---- 运行 ----
if __name__ == "__main__":
    result = agent_loop("现在是几点？另外帮我算一下 (123 * 456) / 7 等于多少")
    print(f"\n最终结果: {result}")
```

**这个最小循环已经包含了 Agent Loop 的全部核心逻辑**：消息构建 → 模型调用 → 工具分发 → 结果回传 → 循环或终止。接下来的步骤都是围绕这个核心添加生产级基础设施。

## 第二步：添加工具系统

生产环境的工具系统需要解决三个问题：动态注册、错误隔离、安全沙箱。

```python
import functools
import traceback
from dataclasses import dataclass, field
from typing import Callable, Any

@dataclass
class Tool:
    """工具定义"""
    name: str
    description: str
    parameters: dict  # JSON Schema
    fn: Callable
    requires_approval: bool = False  # 是否需要用户审批
    read_only: bool = True           # 是否只读操作

class ToolRegistry:
    """工具注册表"""
    
    def __init__(self):
        self._tools: dict[str, Tool] = {}
        self._schemas: list[dict] = []
    
    def register(
        self,
        description: str = "",
        parameters: dict | None = None,
        requires_approval: bool = False,
        read_only: bool = True,
    ):
        """装饰器：将函数注册为 Agent 工具"""
        def decorator(fn):
            name = fn.__name__
            tool = Tool(
                name=name,
                description=description or fn.__doc__ or "",
                parameters=parameters or {"type": "object", "properties": {}},
                fn=fn,
                requires_approval=requires_approval,
                read_only=read_only,
            )
            self._tools[name] = tool
            self._schemas.append({
                "type": "function",
                "function": {
                    "name": name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                }
            })
            return fn
        return decorator
    
    def execute(self, name: str, args: dict) -> str:
        """安全执行工具，隔离错误"""
        if name not in self._tools:
            return json.dumps({"error": f"未知工具: {name}"})
        
        tool = self._tools[name]
        try:
            result = tool.fn(**args)
            return json.dumps({"result": result}, ensure_ascii=False)
        except TypeError as e:
            return json.dumps({"error": f"参数错误: {e}"})
        except Exception as e:
            # 错误隔离：工具崩溃不应终止 Agent Loop
            return json.dumps({
                "error": f"工具执行失败: {type(e).__name__}: {e}",
                "traceback": traceback.format_exc(),
            })
    
    def get_schemas(self) -> list[dict]:
        return self._schemas
    
    def requires_approval(self, name: str) -> bool:
        return self._tools.get(name, Tool("", "", {}, lambda: None)).requires_approval


# ---- 使用 ----
registry = ToolRegistry()

@registry.register(
    description="读取文件内容",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "文件路径"}
        },
        "required": ["path"]
    },
    read_only=True,
)
def read_file(path: str) -> str:
    with open(path, 'r') as f:
        return f.read()

@registry.register(
    description="写入文件（需要审批）",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "文件路径"},
            "content": {"type": "string", "description": "文件内容"},
        },
        "required": ["path", "content"]
    },
    requires_approval=True,
    read_only=False,
)
def write_file(path: str, content: str) -> str:
    with open(path, 'w') as f:
        f.write(content)
    return f"成功写入 {path}，共 {len(content)} 字节"

@registry.register(
    description="执行 shell 命令（需要审批）",
    parameters={
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "要执行的命令"}
        },
        "required": ["command"]
    },
    requires_approval=True,
    read_only=False,
)
def run_shell(command: str) -> str:
    import subprocess
    result = subprocess.run(
        command, shell=True, capture_output=True, text=True, timeout=30
    )
    output = result.stdout + result.stderr
    return output[:5000]  # 截断过长输出
```

## 第三步：上下文压缩

上下文窗口是有限资源。参考 Claude Code 的五级策略，实现一个简化版的三级压缩。

```python
from dataclasses import dataclass

@dataclass
class ContextManager:
    """上下文管理器：管理消息历史的 token 预算"""
    
    max_tokens: int = 100_000     # 上下文窗口上限
    reserve_tokens: int = 20_000  # 为模型输出预留的空间
    compaction_threshold: float = 0.7  # 使用率达到 70% 时触发压缩
    
    def estimate_tokens(self, messages: list[dict]) -> int:
        """粗略估算 token 数（1 token ≈ 4 字符 for English）"""
        total_chars = sum(len(json.dumps(m)) for m in messages)
        return total_chars // 4
    
    def should_compact(self, messages: list[dict]) -> bool:
        """判断是否需要压缩"""
        used = self.estimate_tokens(messages)
        budget = self.max_tokens - self.reserve_tokens
        return used / budget > self.compaction_threshold
    
    def compact(self, messages: list[dict], client: OpenAI) -> list[dict]:
        """
        三级压缩策略：
        Level 1: 截断工具输出（保留首尾各 500 字符）
        Level 2: 折叠早期对话（保留 system + 最近 N 轮）
        Level 3: 模型摘要（调用模型生成历史摘要）
        """
        budget = self.max_tokens - self.reserve_tokens
        
        # Level 1: 截断过长的工具结果
        messages = self._truncate_tool_outputs(messages, max_chars=1000)
        if self.estimate_tokens(messages) <= budget:
            return messages
        
        # Level 2: 保留 system + 最近消息，折叠中间部分
        system_msgs = [m for m in messages if m["role"] == "system"]
        non_system = [m for m in messages if m["role"] != "system"]
        
        # 保留最近 10 条消息
        keep_recent = 10
        if len(non_system) > keep_recent:
            old = non_system[:-keep_recent]
            recent = non_system[-keep_recent:]
            
            # Level 3: 调用模型摘要旧消息
            summary = self._summarize(client, old)
            
            return system_msgs + [
                {"role": "system", "content": f"[历史摘要]\n{summary}"}
            ] + recent
        
        return messages
    
    def _truncate_tool_outputs(
        self, messages: list[dict], max_chars: int = 1000
    ) -> list[dict]:
        """Level 1: 截断过长的工具输出"""
        result = []
        for msg in messages:
            if msg["role"] == "tool" and len(msg.get("content", "")) > max_chars:
                content = msg["content"]
                msg = {**msg, "content": (
                    content[:max_chars // 2]
                    + f"\n\n... [截断 {len(content) - max_chars} 字符] ...\n\n"
                    + content[-max_chars // 2:]
                )}
            result.append(msg)
        return result
    
    def _summarize(self, client: OpenAI, messages: list[dict]) -> str:
        """Level 3: 调用模型生成摘要"""
        conv_text = "\n".join(
            f"[{m['role']}] {json.dumps(m.get('content', ''), ensure_ascii=False)}"
            for m in messages
        )
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # 用便宜模型做摘要
            messages=[{
                "role": "user",
                "content": (
                    "请为以下对话历史生成简洁摘要，保留关键决策、工具调用结果、"
                    "和当前任务状态。丢弃冗余的中间过程。\n\n"
                    f"{conv_text}"
                )
            }],
            max_tokens=2000,
        )
        return response.choices[0].message.content
```

## 第四步：权限控制系统

参考 Claude Code 的 deny-first 模型，实现一个基于规则的权限门控。

```python
from enum import Enum
from dataclasses import dataclass

class PermissionMode(Enum):
    """权限模式"""
    DENY_ALL = "deny_all"         # 拒绝所有写操作
    ASK = "ask"                   # 每次询问用户
    ACCEPT_EDITS = "accept_edits" # 自动批准文件编辑，shell 仍需审批
    AUTO = "auto"                 # 自动批准所有操作

@dataclass
class PermissionGate:
    """权限门控"""
    
    mode: PermissionMode = PermissionMode.ASK
    
    # 危险模式列表（可配置）
    blocked_commands: list[str] = None  # 绝对禁止的命令
    
    def __post_init__(self):
        if self.blocked_commands is None:
            self.blocked_commands = [
                "rm -rf",
                "sudo",
                "chmod 777",
                ":(){",  # fork bomb
            ]
    
    async def check(
        self,
        tool_name: str,
        tool_args: dict,
        tool: Tool,
    ) -> tuple[bool, str]:
        """
        返回 (approved, reason)
        """
        # 硬编码黑名单：绝对拒绝
        if tool_name == "run_shell":
            cmd = tool_args.get("command", "")
            for blocked in self.blocked_commands:
                if blocked in cmd:
                    return False, f"命令被安全策略阻止: {blocked}"
        
        # 按模式处理
        if self.mode == PermissionMode.DENY_ALL:
            if not tool.read_only:
                return False, "当前模式禁止所有写操作"
            return True, ""
        
        if self.mode == PermissionMode.AUTO:
            return True, ""
        
        if self.mode == PermissionMode.ACCEPT_EDITS:
            if tool_name == "write_file":
                return True, ""
            if not tool.read_only:
                return await self._ask_user(tool_name, tool_args)
            return True, ""
        
        # ASK 模式：非只读操作需要审批
        if not tool.read_only:
            return await self._ask_user(tool_name, tool_args)
        
        return True, ""
    
    async def _ask_user(
        self, tool_name: str, tool_args: dict
    ) -> tuple[bool, str]:
        """
        在真实应用中，这里会弹出 UI 对话框或发送审批通知。
        这里简化为终端交互。
        """
        print(f"\n⚠️  工具 '{tool_name}' 需要审批")
        print(f"   参数: {json.dumps(tool_args, ensure_ascii=False, indent=2)}")
        
        answer = input("   批准执行？[y/n]: ").strip().lower()
        if answer in ("y", "yes"):
            return True, ""
        return False, "用户拒绝执行"
```

## 第五步：子代理委托

参考 Claude Code 的 sidechain 模式，子代理在隔离上下文中运行，只返回摘要。

```python
@dataclass
class SubAgent:
    """子代理：在隔离上下文中执行特定任务"""
    
    name: str
    system_prompt: str
    tools: ToolRegistry
    max_turns: int = 5  # 子代理通常任务更聚焦
    
    async def run(self, task: str, client: OpenAI) -> str:
        """
        运行子代理，返回摘要结果。
        子代理的完整对话历史不会回传给主代理，
        只返回最终结果以保护主上下文窗口。
        """
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": task},
        ]
        
        for turn in range(self.max_turns):
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                tools=self.tools.get_schemas(),
                tool_choice="auto",
            )
            
            message = response.choices[0].message
            
            if not message.tool_calls:
                # 子代理完成，返回最终结果
                return message.content
            
            messages.append(message)
            
            for tool_call in message.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)
                result = self.tools.execute(fn_name, fn_args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result,
                })
        
        return "子代理未在限定轮次内完成任务"
```

## 第六步：完整的 Agent Loop 组装

将以上所有组件组装为完整的生产级 Agent Loop。

```python
import asyncio
import json
from dataclasses import dataclass, field

@dataclass
class AgentConfig:
    """Agent 配置"""
    model: str = "gpt-4o"
    system_prompt: str = "你是一个有帮助的 AI 助手。"
    max_turns: int = 20
    max_output_tokens: int = 4096
    permission_mode: PermissionMode = PermissionMode.ASK

@dataclass
class AgentHarness:
    """
    完整的 Agent Harness 实现。
    
    核心循环：
    1. 组装上下文
    2. 压缩（如需要）
    3. 调用模型
    4. 权限门控
    5. 执行工具
    6. 评估终止条件
    """
    
    config: AgentConfig
    tools: ToolRegistry
    context_mgr: ContextManager
    permission_gate: PermissionGate
    client: OpenAI = field(default_factory=OpenAI)
    
    # 子代理注册表
    sub_agents: dict[str, SubAgent] = field(default_factory=dict)
    
    # 执行日志（append-only）
    execution_log: list[dict] = field(default_factory=list)
    
    async def run(self, user_message: str) -> str:
        """执行完整的 Agent Loop"""
        
        messages = [
            {"role": "system", "content": self.config.system_prompt},
            {"role": "user", "content": user_message},
        ]
        
        turn = 0
        while turn < self.config.max_turns:
            turn += 1
            self._log("turn_start", {"turn": turn})
            
            # ---- 阶段 1: 上下文压缩 ----
            if self.context_mgr.should_compact(messages):
                original_count = len(messages)
                messages = self.context_mgr.compact(messages, self.client)
                self._log("compaction", {
                    "before": original_count,
                    "after": len(messages),
                })
            
            # ---- 阶段 2: 调用模型 ----
            try:
                response = self.client.chat.completions.create(
                    model=self.config.model,
                    messages=messages,
                    tools=self.tools.get_schemas(),
                    tool_choice="auto",
                    max_tokens=self.config.max_output_tokens,
                )
            except Exception as e:
                # 恢复策略：增大 max_tokens 重试
                self.config.max_output_tokens = min(
                    self.config.max_output_tokens * 2, 16384
                )
                self._log("model_error", {"error": str(e)})
                continue
            
            message = response.choices[0].message
            self._log("model_response", {
                "has_tool_calls": bool(message.tool_calls),
                "usage": response.usage.model_dump() if response.usage else None,
            })
            
            # ---- 阶段 3: 终止检查 ----
            if not message.tool_calls:
                self._log("complete", {"turns_used": turn})
                return message.content
            
            # ---- 阶段 4: 分派和执行工具 ----
            messages.append(message)
            
            for tool_call in message.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)
                
                self._log("tool_call", {"name": fn_name, "args": fn_args})
                
                # 检查是否是子代理委托
                if fn_name.startswith("delegate_to_"):
                    agent_name = fn_name.replace("delegate_to_", "")
                    if agent_name in self.sub_agents:
                        task = fn_args.get("task", "")
                        result = await self.sub_agents[agent_name].run(
                            task, self.client
                        )
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps({
                                "sub_agent": agent_name,
                                "result": result,
                            }),
                        })
                        continue
                
                # 权限门控
                tool = self.tools._tools.get(fn_name)
                if tool:
                    approved, reason = await self.permission_gate.check(
                        fn_name, fn_args, tool
                    )
                    if not approved:
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps({
                                "error": f"权限被拒绝: {reason}"
                            }),
                        })
                        self._log("permission_denied", {
                            "tool": fn_name, "reason": reason
                        })
                        continue
                
                # 执行工具（错误隔离）
                result = self.tools.execute(fn_name, fn_args)
                self._log("tool_result", {"name": fn_name, "result_len": len(result)})
                
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result,
                })
        
        # 超过最大轮次
        self._log("max_turns_exceeded", {"turns": turn})
        return "任务未能在限定轮次内完成。最后状态已保存。"
    
    def _log(self, event: str, data: dict):
        """Append-only 执行日志"""
        import time
        self.execution_log.append({
            "timestamp": time.time(),
            "event": event,
            **data,
        })
    
    def save_log(self, path: str):
        """持久化执行日志"""
        with open(path, 'w') as f:
            json.dump(self.execution_log, f, ensure_ascii=False, indent=2)


# =============================================
# 完整使用示例
# =============================================

async def main():
    # 1. 创建工具注册表
    tools = ToolRegistry()
    
    @tools.register(
        description="读取文件内容",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "文件路径"}
            },
            "required": ["path"]
        },
        read_only=True,
    )
    def read_file(path: str) -> str:
        with open(path, 'r') as f:
            return f.read()
    
    @tools.register(
        description="创建或覆盖文件",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"]
        },
        requires_approval=True,
        read_only=False,
    )
    def write_file(path: str, content: str) -> str:
        with open(path, 'w') as f:
            f.write(content)
        return f"写入成功: {path}"
    
    @tools.register(
        description="执行 shell 命令",
        parameters={
            "type": "object",
            "properties": {
                "command": {"type": "string"}
            },
            "required": ["command"]
        },
        requires_approval=True,
        read_only=False,
    )
    def run_shell(command: str) -> str:
        import subprocess
        r = subprocess.run(
            command, shell=True, capture_output=True, text=True, timeout=30
        )
        return (r.stdout + r.stderr)[:5000]
    
    # 2. 创建子代理
    research_agent = SubAgent(
        name="researcher",
        system_prompt="你是一个研究员。分析代码库并给出结构化报告。",
        tools=tools,
        max_turns=5,
    )
    
    # 3. 注册子代理为工具
    @tools.register(
        description="委托研究任务给研究员子代理",
        parameters={
            "type": "object",
            "properties": {
                "task": {"type": "string", "description": "研究任务描述"}
            },
            "required": ["task"]
        },
        read_only=True,
    )
    def delegate_to_researcher(task: str) -> str:
        return ""  # 实际执行由 AgentHarness 拦截
    
    # 4. 组装 Harness
    harness = AgentHarness(
        config=AgentConfig(
            model="gpt-4o",
            system_prompt=(
                "你是一个高级软件工程助手。你可以读写文件、执行命令。\n"
                "对于复杂分析任务，使用 delegate_to_researcher 委托给研究员。\n"
                "始终先阅读文件再修改，执行命令前确认安全。"
            ),
            max_turns=20,
            permission_mode=PermissionMode.ASK,
        ),
        tools=tools,
        context_mgr=ContextManager(max_tokens=100_000),
        permission_gate=PermissionGate(mode=PermissionMode.ASK),
        sub_agents={"researcher": research_agent},
    )
    
    # 5. 运行
    result = await harness.run(
        "分析当前目录下的 Python 项目结构，找出所有超过 100 行的函数，"
        "并给出具体的重构建议。将结果保存到 refactor_suggestions.md"
    )
    
    print(f"\n{'='*60}")
    print(f"Agent 完成。结果:\n{result}")
    
    # 6. 保存执行日志
    harness.save_log("execution_log.json")
    print(f"\n执行日志已保存，共 {len(harness.execution_log)} 条记录")


if __name__ == "__main__":
    asyncio.run(main())
```

## 第七步：关键生产化检查清单

将自建 Agent Loop 投入生产前，逐项检查：

### 循环健壮性

- 设置合理的 `max_turns` 防止无限循环（推荐 10-30）
- 模型调用失败时有重试策略（指数退避，最多 3 次）
- 工具执行超时保护（建议 30s 单次上限）
- 工具错误隔离：单个工具崩溃不终止整个循环
- 五个终止条件全部实现（无工具调用、最大轮次、上下文溢出、Hook 干预、外部中断）

### 上下文管理

- 实现至少两级压缩（截断 + 摘要）
- 工具输出截断：单次工具输出超过阈值时自动裁剪
- 系统提示词与用户消息分离
- Token 使用量实时监控

### 安全

- 写操作默认需要审批（deny-first）
- 危险命令硬编码黑名单
- 工具参数校验（用 JSON Schema 或 Pydantic）
- 沙箱执行环境（Docker / VM / 受限 shell）
- 敏感信息过滤（API Key、密码等不进入消息历史）

### 可观测性

- Append-only 执行日志（JSONL 格式）
- 每轮记录：模型 token 使用、工具调用链、耗时、权限决策
- 支持日志回放和调试
- 异常检测和自动告警

### 多 Agent

- 子代理使用隔离上下文（不共享主消息历史）
- 子代理只返回摘要结果
- 子代理有独立的 max_turns 限制（通常更小）
- Handoff 场景需要明确的上下文交接协议

## 延伸阅读与参考实现

如果你想进一步深入研究或参考更成熟的实现，以下开源项目值得细看：

- [Dive-into-Claude-Code](https://github.com/VILA-Lab/Dive-into-Claude-Code) — 最详细的 Claude Code Agent Loop 逆向分析
- [deepclaude](https://github.com/aattaran/deepclaude) — 将 Agent Loop 架构移植到其他模型后端
- [statewright](https://github.com/statewright/statewright) — 用状态机约束工具调用的护栏框架
- [OpenViking](https://github.com/volcengine/OpenViking) — 基于文件系统范式的上下文数据库
- [context-mode](https://github.com/mksglu/context-mode) — 将大块数据隔离在活动窗口之外的沙箱工具
- [harness-experimental](https://github.com/hoangnb24/harness-experimental) — 仓库级别的 Agent 运行脚手架
- [TaskWeaver](https://github.com/microsoft/TaskWeaver) — Microsoft 的 code-first 规划/执行分离框架
- [LLMLingua](https://github.com/microsoft/LLMLingua) — Microsoft 的提示压缩工具包

官方文档：

- [Anthropic Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)
- [Google ADK](https://adk.dev/)
- [LangGraph](https://langchain-ai.github.io/langgraph/)
- [Anthropic Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Anthropic Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [LangChain: The Anatomy of an Agent Harness](https://blog.langchain.com/the-anatomy-of-an-agent-harness/)
- [Martin Fowler: Harness Engineering](https://martinfowler.com/articles/harness-engineering.html)
- [awesome-harness-engineering](https://github.com/ai-boost/awesome-harness-engineering) — 最全面的资源汇总
