---
title: '构建你的第一个 Loop — 从零搭建自主循环系统'
description: '将前 5 篇的组件（AGENTS.md、Skills、Memory、Worktrees、Sub-agents）组装成一个完整的 Loop 系统。本文用 Python 实现一个可运行的自主循环原型，覆盖任务发现、分配、执行、验证、存档全流程。'
pubDate: 2026-06-20
category: 'AI 工程'
tags: ['Loop Engineering', 'Agent', '自主循环', '实战', '系统设计']
series: 'Loop Engineering 实战'
seriesOrder: 6
draft: false
---

前 5 篇我们拆解了 Loop Engineering 的全部关键组件：

| 篇目 | 组件 | 作用 |
|------|------|------|
| 01 | AGENTS.md | 声明式规则注入，定义 Agent 的行为边界 |
| 02 | Skills | 可复用的过程化知识，让 Agent "学过"某件事 |
| 03 | Memory | 跨会话持久状态，让 Agent 记住做过什么 |
| 04 | Worktrees | 隔离执行环境，让多个 Agent 并行工作互不干扰 |
| 05 | Sub-agents | 关注点分离，Creator 和 Reviewer 各司其职 |

这篇把它们全部组装起来，构建一个完整可运行的 Loop 系统。文章的最终产物是一个 `LoopSystem` 类，它能自主发现任务、分配给隔离环境中的 Agent、验证执行结果、存档并推进下一步。

## 全局架构

先看完整系统的全貌。一个 Loop 系统分四层：

```
┌─────────────────────────────────────────────────────────┐
│                      Loop System                        │
│                                                         │
│  Automation Layer (触发源)                               │
│  ┌──────────┐   ┌───────────┐   ┌──────────────┐       │
│  │  Cron    │   │  Events   │   │  /goal cmd   │       │
│  │  定时扫描 │   │  CI/Webhook│  │  人工下达目标  │       │
│  └────┬─────┘   └─────┬─────┘   └──────┬───────┘       │
│       └───────────────┼────────────────┘                │
│                       ▼                                 │
│  Task Queue (任务队列)                                    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  [Fix CI] [Review PR #42] [Add unit tests]      │    │
│  └───────────────────────┬─────────────────────────┘    │
│                          ▼                              │
│  Dispatcher (调度器)                                     │
│  ┌─────────────────────────────────────────────────┐    │
│  │  1. 为任务创建 Worktree (隔离分支)                │    │
│  │  2. 根据任务类型选择 Agent 配置                   │    │
│  │  3. 注入 AGENTS.md + 相关 Skills                  │    │
│  └───────────────────────┬─────────────────────────┘    │
│                          ▼                              │
│  Execution Layer (执行层)                                │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐         │
│  │  Agent A  │   │  Agent B  │   │  Agent C  │         │
│  │ (Creator) │   │ (Creator) │   │ (Reviewer)│         │
│  │ Worktree1 │   │ Worktree2 │   │ Worktree3 │         │
│  └─────┬─────┘   └─────┬─────┘   └─────┬─────┘         │
│        └───────────────┼───────────────┘                │
│                        ▼                                │
│  State & Memory (状态层)                                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │  completed tasks · logs · next steps · metrics   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

每一层对应系列中一篇的内容。Automation Layer 对应 Cron / Events 触发；Task Queue 和 Dispatcher 读取 AGENTS.md 并匹配 Skills；Execution Layer 在 Worktree 中运行 Agent，Creator 和 Reviewer 作为 Sub-agents 协作；State & Memory 负责存档和反馈。

接下来用 7 步渐进式构建这个系统。每一步都产生可运行代码，你可以在任意一步停下来验证。

## Step 1：最小 Loop — 一个 Agent + 一个 while 循环

最简版本：单个 Agent 在循环中发现并执行任务，没有任何外部组件。

```python
"""step1_minimal_loop.py — 最小可运行 Loop"""
import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime
from openai import AsyncOpenAI

client = AsyncOpenAI()

@dataclass
class Task:
    id: str
    title: str
    status: str = "pending"  # pending | running | done | failed
    result: str = ""

@dataclass
class LoopState:
    tasks_completed: int = 0
    tasks_failed: int = 0
    started_at: datetime = field(default_factory=datetime.now)

async def agent_run(task_prompt: str, system: str = "") -> str:
    """单次 Agent 调用：发送任务，返回模型回复。"""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": task_prompt})

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
    )
    return response.choices[0].message.content

async def discover_tasks() -> list[Task]:
    """
    模拟任务发现。
    真实场景中这里会扫描 CI 状态、GitHub Issues、代码质量报告等。
    """
    return [
        Task(id="t1", title="修复 README 中的过时安装说明"),
        Task(id="t2", title="为 utils.py 补充 docstring"),
    ]

async def run_loop():
    state = LoopState()

    while True:
        tasks = await discover_tasks()
        if not tasks:
            print("[Loop] 没有待处理任务，退出循环")
            break

        for task in tasks:
            task.status = "running"
            print(f"[Loop] 执行: {task.title}")

            result = await agent_run(
                task_prompt=f"请完成以下任务并输出具体修改方案：\n{task.title}",
                system="你是一个高效的开发助手，输出简洁可执行的方案。",
            )

            task.result = result
            task.status = "done"
            state.tasks_completed += 1
            print(f"[Loop] 完成: {task.id} — {result[:80]}...")

        # 简化：只跑一轮就退出
        break

    print(f"\n[Loop] 循环结束 — 完成 {state.tasks_completed}, 失败 {state.tasks_failed}")

if __name__ == "__main__":
    asyncio.run(run_loop())
```

这个最小版本已经展示了 Loop 的核心节奏：**发现 → 执行 → 记录**。但所有任务串行执行、共享同一个上下文、没有规则约束、没有状态持久化。接下来逐步补齐。

## Step 2：加入 AGENTS.md — 规则注入

把 Agent 的行为约束从硬编码的 system prompt 改为从文件读取。这样你可以在不改代码的情况下调整 Agent 行为。

```python
"""step2_agents_md.py — 从 AGENTS.md 读取规则"""
from pathlib import Path

class AgentsConfig:
    """解析 AGENTS.md，提取规则注入 Agent 的 system prompt。"""

    def __init__(self, path: str = "AGENTS.md"):
        self.path = Path(path)
        self._rules: dict[str, list[str]] = {}
        self._parse()

    def _parse(self):
        if not self.path.exists():
            return
        text = self.path.read_text(encoding="utf-8")
        current_section = "general"
        self._rules[current_section] = []

        for line in text.splitlines():
            if line.startswith("## "):
                current_section = line[3:].strip().lower()
                self._rules[current_section] = []
            elif line.startswith("- "):
                self._rules[current_section].append(line[2:].strip())

    def build_system_prompt(
        self, task_type: str = "general", extra: str = ""
    ) -> str:
        """为特定任务类型构建 system prompt。"""
        parts = []

        # 通用规则
        general = self._rules.get("general", [])
        if general:
            parts.append("## 通用规则")
            parts.extend(f"- {r}" for r in general)

        # 任务特定规则
        task_rules = self._rules.get(task_type, [])
        if task_rules:
            parts.append(f"\n## {task_type} 规则")
            parts.extend(f"- {r}" for r in task_rules)

        if extra:
            parts.append(f"\n{extra}")

        return "\n".join(parts) if parts else "你是一个高效的开发助手。"


# ---- 用法 ----
# AGENTS.md 示例内容：
# ## General
# - 使用中文回复
# - 输出可直接执行的代码
# - 修改前先说明理由
#
# ## fix
# - 先复现问题，再修复
# - 修复后给出验证步骤
#
# ## review
# - 检查代码风格一致性
# - 检查错误处理是否完整
# - 输出 PASS 或 NEEDS_CHANGES + 具体修改建议

config = AgentsConfig("AGENTS.md")
fix_prompt = config.build_system_prompt("fix")
review_prompt = config.build_system_prompt("review")
```

AGENTS.md 让规则和代码解耦。团队成员可以像编辑文档一样调整 Agent 行为，不需要碰 Python 代码。

## Step 3：加入 Memory — 状态持久化

让 Loop 记住"做过什么"和"学到什么"，避免重复劳动。

```python
"""step3_memory.py — 跨循环的状态持久化"""
import json
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, field, asdict

@dataclass
class TaskRecord:
    task_id: str
    title: str
    status: str          # done | failed | skipped
    result_summary: str
    completed_at: str = ""
    tokens_used: int = 0

    def __post_init__(self):
        if not self.completed_at:
            self.completed_at = datetime.now().isoformat()

@dataclass
class LoopMemory:
    """Loop 的持久化状态。"""

    memory_path: str = "loop_memory.json"
    records: list[dict] = field(default_factory=list)
    lessons: list[str] = field(default_factory=list)
    total_tokens: int = 0
    last_run: str = ""

    def __post_init__(self):
        self._load()

    def _load(self):
        p = Path(self.memory_path)
        if p.exists():
            data = json.loads(p.read_text(encoding="utf-8"))
            self.records = data.get("records", [])
            self.lessons = data.get("lessons", [])
            self.total_tokens = data.get("total_tokens", 0)
            self.last_run = data.get("last_run", "")

    def save(self):
        self.last_run = datetime.now().isoformat()
        Path(self.memory_path).write_text(
            json.dumps(asdict(self), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    def has_done(self, task_id: str) -> bool:
        """检查任务是否已经成功完成过。"""
        return any(
            r["task_id"] == task_id and r["status"] == "done"
            for r in self.records
        )

    def add_record(self, record: TaskRecord):
        self.records.append(asdict(record))
        self.total_tokens += record.tokens_used
        self.save()

    def add_lesson(self, lesson: str):
        """记录一条经验教训（Agent 犯错后总结）。"""
        if lesson not in self.lessons:
            self.lessons.append(lesson)
            self.save()

    def get_context_summary(self) -> str:
        """构建注入 system prompt 的记忆摘要。"""
        lines = ["## 历史记忆"]
        recent = self.records[-10:]  # 最近 10 条
        if recent:
            lines.append("最近完成的任务：")
            for r in recent:
                lines.append(f"- [{r['status']}] {r['title']}")
        if self.lessons:
            lines.append("\n经验教训：")
            for lesson in self.lessons[-5:]:
                lines.append(f"- {lesson}")
        lines.append(f"\n累计 token 消耗：{self.total_tokens:,}")
        return "\n".join(lines)
```

Memory 解决两个问题：**去重**（已完成的任务不重复执行）和**学习**（失败经验写入 lessons，下次注入 prompt 避免重蹈覆辙）。

## Step 4：加入 Worktrees — 隔离执行环境

多个任务并行执行时，它们不能修改同一份代码。Worktree 为每个任务创建独立的 Git 工作区。

```python
"""step4_worktrees.py — 为每个任务创建隔离的 Git 工作区"""
import subprocess
import tempfile
import shutil
from pathlib import Path
from dataclasses import dataclass

@dataclass
class Worktree:
    """一个隔离的 Git 工作区。"""

    branch: str
    path: Path
    base_branch: str = "main"

    @classmethod
    def create(cls, repo_root: str, task_id: str, base: str = "main") -> "Worktree":
        """在 repo 旁创建一个 worktree + 新分支。"""
        repo = Path(repo_root)
        branch = f"loop/{task_id}"
        wt_path = repo.parent / f"wt_{task_id}"

        subprocess.run(
            ["git", "worktree", "add", "-b", branch, str(wt_path), base],
            cwd=repo,
            check=True,
            capture_output=True,
        )
        return cls(branch=branch, path=wt_path, base_branch=base)

    def diff_summary(self) -> str:
        """返回此 worktree 相对于 base 的 diff 摘要。"""
        result = subprocess.run(
            ["git", "diff", f"{self.base_branch}...{self.branch}", "--stat"],
            cwd=self.path,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()

    def commit(self, message: str):
        """提交所有改动。"""
        subprocess.run(["git", "add", "-A"], cwd=self.path, check=True)
        subprocess.run(
            ["git", "commit", "-m", message],
            cwd=self.path,
            check=True,
            capture_output=True,
        )

    def cleanup(self):
        """清理 worktree（任务完成或失败后调用）。"""
        subprocess.run(
            ["git", "worktree", "remove", str(self.path), "--force"],
            capture_output=True,
        )
        subprocess.run(
            ["git", "branch", "-D", self.branch],
            capture_output=True,
        )


class WorktreePool:
    """管理 worktree 生命周期，避免泄露。"""

    def __init__(self, repo_root: str, max_concurrent: int = 3):
        self.repo_root = repo_root
        self.max_concurrent = max_concurrent
        self._active: list[Worktree] = []

    async def acquire(self, task_id: str) -> Worktree:
        if len(self._active) >= self.max_concurrent:
            raise RuntimeError(
                f"已达最大并发 worktree 数 ({self.max_concurrent})，请等待或扩容"
            )
        wt = Worktree.create(self.repo_root, task_id)
        self._active.append(wt)
        return wt

    async def release(self, wt: Worktree, keep_branch: bool = False):
        if keep_branch:
            # 保留分支供后续合并
            subprocess.run(
                ["git", "worktree", "remove", str(wt.path), "--force"],
                capture_output=True,
            )
        else:
            wt.cleanup()
        self._active = [w for w in self._active if w.branch != wt.branch]

    def cleanup_all(self):
        """紧急清理所有 worktree。"""
        for wt in self._active:
            wt.cleanup()
        self._active.clear()
```

Worktree 让并行执行成为可能。三个任务同时在三个隔离目录中工作，互不影响。任务完成后，分支可以合并回主分支或直接丢弃。

## Step 5：加入 Sub-agents — Creator 和 Reviewer 分离

让"做事的人"和"检查的人"分开。Creator 负责执行，Reviewer 负责验证。

```python
"""step5_sub_agents.py — Creator/Reviewer 分离的 Sub-agent 系统"""
import json
from dataclasses import dataclass
from openai import AsyncOpenAI

client = AsyncOpenAI()

@dataclass
class TaskResult:
    task_id: str
    changes_description: str
    files_modified: list[str]
    diff: str
    success: bool

@dataclass
class ReviewResult:
    approved: bool
    feedback: str
    severity: str = "none"  # none | minor | major | blocker

class CreatorAgent:
    """Creator：执行任务，产出代码变更。"""

    def __init__(self, system_prompt: str, skills: list[str] | None = None):
        self.system_prompt = system_prompt
        self.skills = skills or []

    async def execute(self, task_title: str, worktree_path: str) -> TaskResult:
        """在指定 worktree 中执行任务。"""
        skill_context = ""
        if self.skills:
            skill_context = "\n\n相关 Skills 知识：\n" + "\n".join(
                f"- {s}" for s in self.skills
            )

        messages = [
            {"role": "system", "content": self.system_prompt + skill_context},
            {
                "role": "user",
                "content": (
                    f"任务：{task_title}\n\n"
                    f"工作目录：{worktree_path}\n"
                    "请分析问题、制定方案、执行修改。\n"
                    "完成后用 JSON 格式返回：\n"
                    '{"changes_description": "...", "files_modified": [...], "success": true}'
                ),
            },
        ]

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            response_format={"type": "json_object"},
        )

        raw = json.loads(response.choices[0].message.content)
        return TaskResult(
            task_id="",
            changes_description=raw.get("changes_description", ""),
            files_modified=raw.get("files_modified", []),
            diff="",  # 实际场景中从 worktree.diff_summary() 获取
            success=raw.get("success", False),
        )


class ReviewerAgent:
    """Reviewer：审查 Creator 的产出。"""

    def __init__(self, system_prompt: str):
        self.system_prompt = system_prompt

    async def review(self, task_title: str, result: TaskResult) -> ReviewResult:
        """审查任务执行结果。"""
        messages = [
            {"role": "system", "content": self.system_prompt},
            {
                "role": "user",
                "content": (
                    f"任务：{task_title}\n\n"
                    f"Creator 的变更说明：{result.changes_description}\n"
                    f"修改文件：{result.files_modified}\n"
                    f"Diff 摘要：\n{result.diff}\n\n"
                    "请审查并返回 JSON：\n"
                    '{"approved": bool, "feedback": "...", "severity": "none|minor|major|blocker"}'
                ),
            },
        ]

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            response_format={"type": "json_object"},
        )

        raw = json.loads(response.choices[0].message.content)
        return ReviewResult(
            approved=raw.get("approved", False),
            feedback=raw.get("feedback", ""),
            severity=raw.get("severity", "none"),
        )
```

Creator/Reviewer 分离是 Loop 系统的关键架构决策。它实现了：

1. **对抗性验证** — Reviewer 没有参与创建过程，天然倾向于找问题
2. **职责单一** — Creator 的 prompt 聚焦"怎么做"，Reviewer 的 prompt 聚焦"做得对不对"
3. **可独立迭代** — 你可以单独优化 Reviewer 的审查标准，不影响 Creator

## Step 6：加入 Automation — Cron 定时触发

让 Loop 不需要人工启动，自己定时醒来扫描任务。

```python
"""step6_automation.py — 定时任务发现"""
import asyncio
from datetime import datetime
from dataclasses import dataclass

@dataclass
class CronConfig:
    """Loop 的调度配置。"""

    interval_seconds: int = 300        # 扫描间隔（默认 5 分钟）
    max_runtime_hours: float = 4.0     # 最大运行时长
    quiet_hours: tuple[int, int] = (0, 7)  # 静默时段（凌晨不跑）
    max_tokens_per_run: int = 500_000  # 单次运行的 token 预算

class TaskSource:
    """
    任务来源聚合器。
    真实场景中对接 GitHub API、CI 系统、lint 工具等。
    """

    def __init__(self, github_repo: str = "", ci_endpoint: str = ""):
        self.github_repo = github_repo
        self.ci_endpoint = ci_endpoint

    async def scan(self) -> list[dict]:
        """扫描所有来源，返回原始任务数据。"""
        tasks = []

        # 来源 1：CI 失败的 pipeline
        ci_tasks = await self._scan_ci()
        tasks.extend(ci_tasks)

        # 来源 2：GitHub Issues 中标记为 "auto-fix" 的
        issue_tasks = await self._scan_issues()
        tasks.extend(issue_tasks)

        # 来源 3：代码质量扫描（lint 错误、过时依赖等）
        quality_tasks = await self._scan_quality()
        tasks.extend(quality_tasks)

        return tasks

    async def _scan_ci(self) -> list[dict]:
        """模拟 CI 扫描。"""
        # 真实实现：调用 GitHub Actions API / GitLab API
        return []

    async def _scan_issues(self) -> list[dict]:
        """模拟 Issue 扫描。"""
        # 真实实现：gh issue list --label "auto-fix" --state open
        return []

    async def _scan_quality(self) -> list[dict]:
        """模拟代码质量扫描。"""
        # 真实实现：运行 ruff / mypy / eslint，解析输出
        return []


class Automation:
    """Loop 的自动化调度层。"""

    def __init__(self, config: CronConfig, source: TaskSource):
        self.config = config
        self.source = source
        self._running = False
        self._started_at: datetime | None = None

    def is_quiet_hours(self) -> bool:
        hour = datetime.now().hour
        start, end = self.config.quiet_hours
        return start <= hour < end

    def is_runtime_exceeded(self) -> bool:
        if not self._started_at:
            return False
        elapsed = (datetime.now() - self._started_at).total_seconds()
        return elapsed > self.config.max_runtime_hours * 3600

    async def tick(self) -> list[dict]:
        """单次扫描，返回发现的任务。"""
        if self.is_quiet_hours():
            print(f"[Automation] 静默时段，跳过扫描")
            return []
        if self.is_runtime_exceeded():
            print(f"[Automation] 已达最大运行时长，停止")
            self._running = False
            return []

        return await self.source.scan()

    async def run_forever(self, on_tasks_found):
        """持续运行：扫描 → 处理 → 等待 → 重复。"""
        self._running = True
        self._started_at = datetime.now()

        while self._running:
            tasks = await self.tick()
            if tasks:
                await on_tasks_found(tasks)

            print(
                f"[Automation] 等待 {self.config.interval_seconds}s 后下次扫描..."
            )
            await asyncio.sleep(self.config.interval_seconds)
```

Automation 层将 Loop 从"手动运行脚本"变成"自主运行的后台服务"。它负责回答一个问题：**什么时候醒来，扫描什么**。

## Step 7：完整组装 — LoopSystem

把所有组件装进一个类。这是本文的核心产物。

```python
"""loop_system.py — 完整的 Loop 系统"""
import asyncio
import json
import signal
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional

from openai import AsyncOpenAI

# ---- 前置组件（Step 1-6 中定义） ----
# 实际使用时从各自模块 import

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("LoopSystem")


# ==================================================================
#  数据结构
# ==================================================================

@dataclass
class Task:
    id: str
    title: str
    source: str = "manual"       # ci | issue | quality | manual
    priority: int = 0            # 越高越优先
    status: str = "pending"
    assigned_worktree: str = ""
    result: Optional["TaskResult"] = None
    review: Optional["ReviewResult"] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: str = ""

@dataclass
class TaskResult:
    task_id: str
    changes_description: str
    files_modified: list[str]
    diff: str
    tokens_used: int = 0
    success: bool = False

@dataclass
class ReviewResult:
    approved: bool
    feedback: str
    severity: str = "none"

@dataclass
class LoopMetrics:
    """单次 Loop 运行的指标。"""
    tasks_discovered: int = 0
    tasks_completed: int = 0
    tasks_failed: int = 0
    tasks_skipped: int = 0
    tokens_used: int = 0
    started_at: str = field(default_factory=lambda: datetime.now().isoformat())
    ended_at: str = ""


# ==================================================================
#  终止条件
# ==================================================================

@dataclass
class StopConditions:
    """Loop 的终止/暂停条件。"""

    max_runtime_seconds: int = 14_400       # 4 小时
    max_tokens: int = 2_000_000             # 单次运行 token 上限
    max_consecutive_failures: int = 3       # 连续失败 N 次后暂停
    pause_signal_path: str = ".loop_pause"  # 文件信号：存在则暂停
    stop_signal_path: str = ".loop_stop"    # 文件信号：存在则终止

    _consecutive_failures: int = 0
    _started_at: datetime = field(default_factory=datetime.now)
    _tokens_used: int = 0

    def should_stop(self) -> tuple[bool, str]:
        """检查所有终止条件，返回 (是否停止, 原因)。"""
        # 文件信号：人工干预
        if Path(self.stop_signal_path).exists():
            return True, "收到停止信号 (.loop_stop 文件存在)"

        if Path(self.pause_signal_path).exists():
            return True, "收到暂停信号 (.loop_pause 文件存在)"

        # 运行时长
        elapsed = (datetime.now() - self._started_at).total_seconds()
        if elapsed > self.max_runtime_seconds:
            return True, f"已达最大运行时长 ({self.max_runtime_seconds}s)"

        # Token 预算
        if self._tokens_used > self.max_tokens:
            return True, f"已超 token 预算 ({self._tokens_used:,} > {self.max_tokens:,})"

        # 连续失败
        if self._consecutive_failures >= self.max_consecutive_failures:
            return True, f"连续失败 {self._consecutive_failures} 次"

        return False, ""

    def record_success(self):
        self._consecutive_failures = 0

    def record_failure(self):
        self._consecutive_failures += 1

    def record_tokens(self, tokens: int):
        self._tokens_used += tokens


# ==================================================================
#  核心：LoopSystem
# ==================================================================

class LoopSystem:
    """
    完整的 Loop 系统。

    组装 AGENTS.md、Skills、Memory、Worktrees、Sub-agents，
    实现任务的自主发现、分配、执行、验证、存档。
    """

    def __init__(
        self,
        repo_root: str,
        agents_md_path: str = "AGENTS.md",
        skills_dir: str = ".loop/skills",
        memory_path: str = ".loop/memory.json",
        interval_seconds: int = 300,
        max_concurrent: int = 3,
    ):
        self.repo_root = Path(repo_root)
        self.client = AsyncOpenAI()
        self.interval = interval_seconds
        self.max_concurrent = max_concurrent

        # 组件初始化
        self.agents_config = AgentsConfig(agents_md_path)
        self.skills_dir = Path(skills_dir)
        self.memory = LoopMemory(memory_path=memory_path)
        self.stop = StopConditions()
        self.metrics = LoopMetrics()

        # Worktree 池
        self._active_worktrees: list[Worktree] = []

        # Sub-agents
        self.creator = CreatorAgent(
            system_prompt=self.agents_config.build_system_prompt("fix"),
            skills=self._load_skills(),
        )
        self.reviewer = ReviewerAgent(
            system_prompt=self.agents_config.build_system_prompt("review"),
        )

        # 优雅退出
        self._shutdown = asyncio.Event()

    # ----------------------------------------------------------
    #  初始化辅助
    # ----------------------------------------------------------

    def _load_skills(self) -> list[str]:
        """从 skills 目录加载所有 skill 摘要。"""
        skills = []
        if self.skills_dir.exists():
            for f in self.skills_dir.glob("*.md"):
                content = f.read_text(encoding="utf-8")
                # 取第一行作为 skill 摘要
                first_line = content.split("\n")[0].strip("# ").strip()
                skills.append(first_line)
        return skills

    # ----------------------------------------------------------
    #  Phase 1: 任务发现
    # ----------------------------------------------------------

    async def discover_tasks(self) -> list[Task]:
        """
        扫描待处理任务。

        来源：CI 失败、open issues (auto-fix 标签)、代码质量扫描。
        过滤掉已完成的任务（查 Memory）。
        """
        raw_tasks = []

        # 1. CI 失败
        raw_tasks.extend(await self._scan_ci_failures())

        # 2. GitHub Issues
        raw_tasks.extend(await self._scan_issues())

        # 3. 代码质量
        raw_tasks.extend(await self._scan_quality())

        # 过滤 + 转换
        tasks = []
        for raw in raw_tasks:
            task = Task(
                id=raw["id"],
                title=raw["title"],
                source=raw.get("source", "unknown"),
                priority=raw.get("priority", 0),
            )
            # 去重：跳过已完成的任务
            if self.memory.has_done(task.id):
                self.metrics.tasks_skipped += 1
                log.info(f"跳过已完成任务: {task.id}")
                continue
            tasks.append(task)

        # 按优先级排序
        tasks.sort(key=lambda t: t.priority, reverse=True)
        self.metrics.tasks_discovered += len(tasks)
        return tasks

    async def _scan_ci_failures(self) -> list[dict]:
        """
        扫描 CI 失败。
        真实实现：调用 GitHub Actions API 或解析 CI webhook 数据。
        """
        # 占位实现
        return []

    async def _scan_issues(self) -> list[dict]:
        """
        扫描标记为 auto-fix 的 GitHub Issues。
        真实实现：subprocess.run(["gh", "issue", "list", ...])
        """
        return []

    async def _scan_quality(self) -> list[dict]:
        """
        代码质量扫描。
        真实实现：运行 ruff check --output-format json
        """
        return []

    # ----------------------------------------------------------
    #  Phase 2: 任务分配
    # ----------------------------------------------------------

    async def dispatch(self, task: Task) -> Worktree:
        """为任务创建隔离的 worktree，分配 Agent 配置。"""
        if len(self._active_worktrees) >= self.max_concurrent:
            raise RuntimeError("Worktree 池已满")

        wt = Worktree.create(str(self.repo_root), task.id)
        self._active_worktrees.append(wt)
        task.assigned_worktree = wt.branch
        task.status = "dispatched"

        log.info(f"分配任务 {task.id} → worktree {wt.branch}")
        return wt

    # ----------------------------------------------------------
    #  Phase 3: 执行
    # ----------------------------------------------------------

    async def execute(self, task: Task, worktree: Worktree) -> TaskResult:
        """Creator Agent 在隔离 worktree 中执行任务。"""
        task.status = "running"
        log.info(f"执行任务: {task.title}")

        try:
            result = await self.creator.execute(task.title, str(worktree.path))
            result.task_id = task.id
            result.diff = worktree.diff_summary()

            self.stop.record_tokens(result.tokens_used)
            task.result = result

            if result.success:
                # 提交变更到 worktree 分支
                worktree.commit(f"[loop] {task.id}: {task.title}")
                log.info(f"任务 {task.id} 执行成功")
            else:
                self.stop.record_failure()
                log.warning(f"任务 {task.id} 执行失败: {result.changes_description}")

            return result

        except Exception as e:
            self.stop.record_failure()
            log.error(f"任务 {task.id} 异常: {e}")
            return TaskResult(
                task_id=task.id,
                changes_description=f"异常: {e}",
                files_modified=[],
                diff="",
                success=False,
            )

    # ----------------------------------------------------------
    #  Phase 4: 验证
    # ----------------------------------------------------------

    async def review(self, task: Task, result: TaskResult) -> ReviewResult:
        """Reviewer Agent 审查执行结果。"""
        log.info(f"审查任务: {task.id}")

        review = await self.reviewer.review(task.title, result)
        task.review = review

        if review.approved:
            log.info(f"任务 {task.id} 审查通过")
            self.stop.record_success()
        else:
            log.warning(
                f"任务 {task.id} 审查未通过 [{review.severity}]: {review.feedback}"
            )
            self.stop.record_failure()

            # 将失败原因写入 lessons，供后续循环学习
            self.memory.add_lesson(
                f"任务 {task.title} 审查未通过: {review.feedback}"
            )

        return review

    # ----------------------------------------------------------
    #  Phase 5: 存档
    # ----------------------------------------------------------

    async def archive(self, task: Task, result: TaskResult):
        """存档任务结果，更新 Memory。"""
        task.status = "done"
        task.completed_at = datetime.now().isoformat()

        # 写入 Memory
        self.memory.add_record(TaskRecord(
            task_id=task.id,
            title=task.title,
            status="done",
            result_summary=result.changes_description,
            tokens_used=result.tokens_used,
        ))

        self.metrics.tasks_completed += 1

        # 清理 worktree（保留分支供合并）
        for wt in self._active_worktrees:
            if wt.branch == task.assigned_worktree:
                await self._release_worktree(wt, keep_branch=True)
                break

        log.info(f"归档任务 {task.id}，分支 {task.assigned_worktree} 待合并")

    async def _release_worktree(self, wt: Worktree, keep_branch: bool = False):
        if keep_branch:
            import subprocess
            subprocess.run(
                ["git", "worktree", "remove", str(wt.path), "--force"],
                capture_output=True,
            )
        else:
            wt.cleanup()
        self._active_worktrees = [
            w for w in self._active_worktrees if w.branch != wt.branch
        ]

    # ----------------------------------------------------------
    #  主循环
    # ----------------------------------------------------------

    async def run(self):
        """
        主循环。

        流程：发现 → 分配 → 执行 → 验证 → 存档 → 等待 → 重复
        """
        log.info("=" * 60)
        log.info("Loop System 启动")
        log.info(f"  仓库: {self.repo_root}")
        log.info(f"  扫描间隔: {self.interval}s")
        log.info(f"  最大并发: {self.max_concurrent}")
        log.info(f"  Token 预算: {self.stop.max_tokens:,}")
        log.info("=" * 60)

        # 注册信号处理：Ctrl+C 优雅退出
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, self._shutdown.set)

        try:
            while not self._shutdown.is_set():
                # 检查终止条件
                should_stop, reason = self.stop.should_stop()
                if should_stop:
                    log.info(f"Loop 终止: {reason}")
                    break

                # Phase 1: 发现任务
                tasks = await self.discover_tasks()

                if not tasks:
                    log.info("没有待处理任务")
                else:
                    log.info(f"发现 {len(tasks)} 个任务")

                    for task in tasks:
                        # 再次检查终止条件（任务执行期间可能触发）
                        should_stop, reason = self.stop.should_stop()
                        if should_stop:
                            log.info(f"Loop 终止: {reason}")
                            break

                        try:
                            # Phase 2: 分配
                            wt = await self.dispatch(task)

                            # Phase 3: 执行
                            result = await self.execute(task, wt)

                            # Phase 4: 验证
                            review = await self.review(task, result)

                            # Phase 5: 存档（仅通过审查的任务）
                            if review.approved:
                                await self.archive(task, result)
                            else:
                                task.status = "failed"
                                self.metrics.tasks_failed += 1
                                self.memory.add_record(TaskRecord(
                                    task_id=task.id,
                                    title=task.title,
                                    status="failed",
                                    result_summary=review.feedback,
                                ))
                                # 清理失败的 worktree
                                await self._release_worktree(wt, keep_branch=False)

                        except Exception as e:
                            log.error(f"任务 {task.id} 处理异常: {e}")
                            task.status = "failed"
                            self.metrics.tasks_failed += 1
                            self.stop.record_failure()

                # 等待下一轮
                try:
                    await asyncio.wait_for(
                        self._shutdown.wait(),
                        timeout=self.interval,
                    )
                except asyncio.TimeoutError:
                    pass  # 正常超时，继续下一轮

        finally:
            await self._shutdown_cleanup()

    async def _shutdown_cleanup(self):
        """优雅退出：清理所有 worktree，保存指标。"""
        log.info("正在清理...")

        # 清理残留 worktree
        for wt in self._active_worktrees:
            try:
                await self._release_worktree(wt, keep_branch=False)
            except Exception as e:
                log.warning(f"清理 worktree {wt.branch} 失败: {e}")

        # 保存运行指标
        self.metrics.ended_at = datetime.now().isoformat()
        metrics_path = self.repo_root / ".loop" / "last_run_metrics.json"
        metrics_path.parent.mkdir(parents=True, exist_ok=True)
        metrics_path.write_text(
            json.dumps(asdict(self.metrics), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        log.info(f"运行指标已保存: {metrics_path}")
        log.info(
            f"本次运行 — "
            f"发现: {self.metrics.tasks_discovered}, "
            f"完成: {self.metrics.tasks_completed}, "
            f"失败: {self.metrics.tasks_failed}, "
            f"跳过: {self.metrics.tasks_skipped}, "
            f"Token: {self.metrics.tokens_used:,}"
        )


# ==================================================================
#  启动入口
# ==================================================================

if __name__ == "__main__":
    system = LoopSystem(
        repo_root="/path/to/your/repo",
        agents_md_path="AGENTS.md",
        skills_dir=".loop/skills",
        memory_path=".loop/memory.json",
        interval_seconds=300,
        max_concurrent=3,
    )
    asyncio.run(system.run())
```

## 任务生命周期详解

一个任务从发现到归档的完整路径：

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Discover │────▶│ Dispatch │────▶│ Execute  │────▶│  Review  │────▶│ Archive  │
│          │     │          │     │          │     │          │     │          │
│ 扫描来源  │     │ 创建 WT  │     │ Creator  │     │ Reviewer │     │ 写 Memory │
│ 去重过滤  │     │ 注入规则  │     │ Agent    │     │ Agent    │     │ 清理 WT   │
│ 优先级排  │     │ 分配池   │     │ 提交代码  │     │ PASS/FAIL│     │ 合并分支  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
      │                                              │                    │
      │ 已完成的任务                                   │ FAIL               │ 下一步
      │ → 跳过 (Memory)                              │ → 写 lesson         │ → 发现新任务
      │                                              │ → 清理 WT           │   或等待
```

**Discover** 阶段做三件事：扫描多个来源、用 Memory 去重、按优先级排序。这里的设计要点是**来源可插拔** — 你可以随时添加新的扫描源（比如 Sentry 错误、用户反馈），只需在 `discover_tasks` 中增加一个 `_scan_xxx` 方法。

**Dispatch** 阶段的核心约束是并发上限。`max_concurrent` 控制同时运行的 worktree 数量，避免资源耗尽。在团队共享的开发机上，这个数字通常设为 2-3。

**Execute** 阶段 Creator 在隔离环境中工作。Worktree 保证了即使 Creator 把代码改坏了，也不影响主分支和其他任务。

**Review** 阶段 Reviewer 拿到 Creator 的 diff 和变更说明，独立判断是否合格。审查未通过时，失败原因会写入 Memory 的 lessons，下一轮 Creator 的 prompt 中会包含这些教训。

**Archive** 阶段将通过审查的分支保留（等待人工或自动合并），失败的 worktree 直接清理。

## 终止条件与人类兜底

自主系统必须有明确的"刹车"。LoopSystem 实现了四层终止条件：

**1. 时间墙**：`max_runtime_seconds = 14_400`（4 小时）。无论任务完成多少，到时强制暂停。这防止了凌晨无人值守时 Agent 失控运行。

**2. Token 预算**：`max_tokens = 2_000_000`。每次模型调用都累加 token 消耗，超预算立即停止。这是成本控制的核心防线。

**3. 连续失败熔断**：连续 3 个任务失败后暂停。连续失败通常意味着系统性问题（环境异常、模型退化），继续运行只会浪费资源。

**4. 文件信号**：最灵活的人工干预入口。

```bash
# 暂停 Loop（当前任务完成后停止，不删除）
touch .loop_pause

# 完全停止并退出
touch .loop_stop

# 恢复运行
rm .loop_pause
```

文件信号的好处是**不需要暴露 API 端口**，适合在开发机上使用。在生产环境中，你可以把这个机制替换为 Redis key、数据库 flag 或者 HTTP endpoint。

## 生产部署清单

将 Loop 系统从原型推向生产，需要补齐以下能力：

### 监控与告警

```python
# metrics_exporter.py — 将 Loop 指标导出到 Prometheus
from prometheus_client import Counter, Gauge, Histogram

loop_tasks_total = Counter(
    "loop_tasks_total", "Total tasks processed", ["status"]
)
loop_tokens_used = Counter(
    "loop_tokens_used_total", "Total tokens consumed"
)
loop_task_duration = Histogram(
    "loop_task_duration_seconds", "Time per task", ["phase"]
)
loop_active_worktrees = Gauge(
    "loop_active_worktrees", "Currently active worktrees"
)

# 在 LoopSystem 的各个 phase 中调用：
# loop_tasks_total.labels(status="completed").inc()
# loop_tokens_used.inc(result.tokens_used)
# loop_task_duration.labels(phase="execute").observe(elapsed)
```

需要告警的异常场景：

| 指标 | 阈值 | 含义 |
|------|------|------|
| 任务失败率 | > 50% 滚动窗口 | 系统性问题，可能是模型退化 |
| 单任务 token 消耗 | > 100,000 | Agent 可能陷入循环 |
| Worktree 泄漏 | active > max_concurrent | 清理逻辑有 bug |
| 总 token / 小时 | > 预算的 80% | 即将撞预算墙 |
| 连续失败 | >= 3 | 触发熔断 |

### 日志与追踪

每次 Loop 运行应该生成完整的 trace，包含每个任务的完整生命周期。推荐结构化日志：

```json
{
  "run_id": "2026-06-20T10:00:00",
  "task_id": "fix-ci-42",
  "phase": "execute",
  "worktree": "loop/fix-ci-42",
  "tokens_used": 12340,
  "duration_seconds": 45.2,
  "status": "success",
  "diff_files": ["src/utils.py", "tests/test_utils.py"]
}
```

这些 trace 既用于事后分析（"为什么这个任务失败了"），也用于持续优化（"哪类任务 token 消耗最高"）。

### 回滚机制

Loop 系统的所有变更都在 worktree 分支上，这天然提供了回滚能力：

```bash
# 撤销某个任务的所有修改
git branch -D loop/fix-ci-42

# 撤销最近一轮 Loop 的所有分支
for branch in $(git branch --list 'loop/*' --sort=-committerdate | head -10); do
    git branch -D "$branch"
done

# 紧急停止 + 回滚：在 LoopSystem 中添加 emergency_stop 方法
```

```python
async def emergency_stop(self):
    """紧急停止：终止所有任务，清理所有 worktree 和分支。"""
    log.warning("紧急停止！清理所有 worktree 和分支...")
    self._shutdown.set()

    for wt in self._active_worktrees:
        wt.cleanup()  # 同时删除 worktree 和分支

    self._active_worktrees.clear()
    log.warning("紧急停止完成")
```

### 渐进式启用

不要一开始就让 Loop 处理所有任务。推荐的启用路径：

**阶段 1（第 1-2 周）**：只处理低风险任务
- 文档修正、docstring 补充、过时依赖更新
- Reviewer 设置为严格模式（任何变更都需要人工确认合并）
- 全程观察 token 消耗和任务质量

**阶段 2（第 3-4 周）**：加入中等风险任务
- 简单 bug 修复、lint 错误修复、测试补充
- Reviewer 自动 PASS 低风险变更，高风险变更仍需人工确认

**阶段 3（第 5 周+）**：扩大覆盖范围
- 性能优化建议、重构建议
- 与 CI/CD 深度集成，通过审查的变更自动合并

## 将 Loop 接入你的项目

一个最小化的接入清单：

```bash
# 1. 初始化 Loop 目录结构
mkdir -p .loop/skills
touch AGENTS.md

# 2. 编写 AGENTS.md（至少包含通用规则）
cat > AGENTS.md << 'EOF'
## General
- 使用项目现有的代码风格
- 修改前先阅读相关文件
- 输出可执行的修改方案
- 所有改动必须有对应测试

## fix
- 先复现问题
- 修复后添加回归测试

## review
- 检查代码风格一致性
- 检查错误处理完整性
- 检查是否有安全漏洞
EOF

# 3. 添加项目特有的 Skills（可选）
# 将常见操作的步骤写入 .loop/skills/ 下的 .md 文件

# 4. 配置 .gitignore
echo ".loop/memory.json" >> .gitignore
echo ".loop_pause" >> .gitignore
echo ".loop_stop" >> .gitignore

# 5. 启动
python loop_system.py
```

## 系列回顾与知识图谱

6 篇文章构成了一个从概念到实践的完整路径：

```
Loop Engineering 实战 — 知识图谱

01 AGENTS.md          声明式规则，定义 Agent 行为边界
       │
02 Skills             过程化知识，让 Agent "学过"某件事
       │
03 Memory             持久状态，跨会话记忆 + 经验学习
       │
04 Worktrees          隔离执行，并行安全 + 天然回滚
       │
05 Sub-agents         关注点分离，Creator ↔ Reviewer
       │
06 Loop System        ← 你在这里
     组装全部组件，形成自主循环
```

每篇的核心理念浓缩为一句话：

- **01**：规则与代码解耦 — AGENTS.md 让行为约束像文档一样维护
- **02**：经验可以编码 — Skills 把"做过某件事"变成可复用的知识
- **03**：Agent 需要记忆 — Memory 让每次运行不是从零开始
- **04**：隔离是并行的前提 — Worktree 让多个 Agent 安全地同时工作
- **05**：做事和检查要分开 — Sub-agents 通过角色分离实现对抗性验证
- **06**：组件的价值在于组装 — 单独的组件是工具，组装起来才是系统

## 继续深入的方向

这篇文章构建了一个可运行的原型，但距离生产级的 Loop 系统还有几个维度可以深入：

**多 Agent 协作的高级模式**：本文只有 Creator 和 Reviewer 两个角色。更复杂的系统可能需要 Planner（规划任务拆解）、Tester（运行测试套件）、Deployer（处理发布流程）等更多角色，以及它们之间的通信和协调机制。

**自定义 Skill 生态**：Skills 可以发展成一个共享市场 — 团队成员贡献自己领域的 Skill，其他人按需引用。类似 IDE 插件生态，但面向的是 Agent 的过程化知识。

**与 CI/CD 深度集成**：Loop 可以作为 CI pipeline 的一环。例如：PR 提交 → CI 检测问题 → Loop 自动修复 → 生成新的 commit → 重新跑 CI。形成"CI 发现问题 → Loop 修复 → CI 验证"的闭环。

**成本优化**：用更便宜的模型处理简单任务（如 gpt-4o-mini），只在复杂任务上使用高端模型。根据任务类型和复杂度动态选择模型，可以将总 token 成本降低 60-80%。

**Loop Engineering 作为一个领域还在快速发展**。Anthropic 的 Harness Design 文档、Addy Osmani 的系列文章、以及开源社区的实践都在持续演进。建议关注以下资源：

- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents) — Agent 设计的基本原则
- [Anthropic: Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) — 长时间运行应用的 Harness 设计
- [Addy Osmani: Loop Engineering](https://addyosmani.com/blog/loop-engineering/) — Loop Engineering 概念的系统阐述

---

这是 "Loop Engineering 实战" 系列的最后一篇。感谢读到这里。如果你在实际项目中搭建了自己的 Loop 系统，欢迎分享你的经验 — 这个领域需要更多一线实践来推动。

## 参考资料

1. Addy Osmani, "Loop Engineering" — https://addyosmani.com/blog/loop-engineering/
2. Anthropic, "Building effective agents" — https://www.anthropic.com/research/building-effective-agents
3. Anthropic, "Harness Design for Long-Running Apps" — https://www.anthropic.com/engineering/harness-design-long-running-apps
4. Martin Fowler, "Harness Engineering" — https://martinfowler.com/articles/harness-engineering.html
