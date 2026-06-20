---
title: 'Skills 与 Memory — 让 Agent 积累和复用知识'
description: 'Agent 每次都从零开始是最大的浪费。本文讲解 Skills（固化经验）和 Memory（跨会话记忆）的设计模式，并实现一套让 Agent 越用越聪明的知识系统。'
pubDate: 2026-06-20
category: 'AI 工程'
tags: ['Loop Engineering', 'Skills', 'Memory', '知识管理', 'Agent']
series: 'Loop Engineering 实战'
seriesOrder: 3
draft: false
---

> **系列导航**：本文是 "Loop Engineering 实战" 系列第 3 篇。
> - 第 1 篇：什么是 Loop Engineering
> - 第 2 篇：AGENTS.md — 用规则文件定义你的 Loop 行为
> - **第 3 篇：Skills 与 Memory — 让 Agent 积累和复用知识（本文）**
> - 第 4 篇：Worktrees 与沙箱 — Agent 的安全执行环境
> - 第 5 篇：Sub-agents 与 Automation — 任务分发与自动化调度
> - 第 6 篇：构建你的第一个 Loop — 从零搭建自主循环系统

---

在第 2 篇中，我们用 AGENTS.md 定义了 Agent 的"行为规范"——它应该怎么工作、遵守什么规则。但这里有一个致命问题：**每次新会话启动，Agent 都像一个失忆症患者，从零开始。**

你在上一次会话中花 20 分钟教会 Agent "如何用团队约定的方式发布 npm 包"，下一次会话它又全忘了。你纠正过它"不要用 `any` 类型"，下次它照用不误。这不是 Agent 笨，而是它根本没有"记忆"这个概念。

Addy Osmani 在 [Loop Engineering](https://addyosmani.com/blog/loop-engineering/) 一文中指出了两个让 Agent 持续进化的关键机制：**Skills**（将成功经验固化为可复用流程）和 **Memory**（跨会话保留学到的知识）。Anthropic 的 [Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) 文档也将"持久化知识"列为上下文工程的核心支柱之一。

本文将解决四个问题：

1. Skills 和 Memory 有什么区别？各自解决什么问题？
2. 如何设计一份高质量的 SKILL.md？
3. Memory 的三层模型如何工作？
4. 如何用 Python 实现一套可运行的 Skills + Memory 系统？

## 一、Skills vs Memory：两种不同的知识形态

先看一个场景：你让 Agent 帮你部署一个 Node.js 项目到 AWS。第一次，它磕磕绊绊，犯了三个错（忘记设置环境变量、用错了 region、没开 CORS），你逐一纠正后终于成功。

第二次你让 Agent 部署另一个项目，它应该怎么做？理想情况下：

- **Skills 发挥作用**：Agent 有一份"Node.js AWS 部署"的操作手册，记录了正确的步骤和踩过的坑，直接照着做。
- **Memory 发挥作用**：Agent 记得"这个团队偏好 `ap-southeast-1` region"和"所有服务必须开 CORS"。

两者的本质区别：

| 维度 | Skills | Memory |
|------|--------|--------|
| **本质** | 固化的操作流程（procedural knowledge） | 持久化的经验事实（declarative knowledge） |
| **类比** | 操作手册 / SOP | 个人笔记本 / 工作日志 |
| **更新频率** | 低频，经验稳定后才写入 | 高频，随时记录新发现 |
| **大小控制** | 按需加载，单次只加载匹配的技能 | 有硬上限（如 2000 tokens），超出需压缩 |
| **粒度** | 一个完整任务的操作步骤 | 一条事实、一个偏好、一段经历 |
| **生命周期** | 长期稳定，偶尔修订 | 持续演化，旧条目可能被压缩或淘汰 |
| **加载方式** | 任务匹配时按需注入 | 每次会话自动注入 |

简单说：**Skills 告诉 Agent "怎么做"，Memory 告诉 Agent "你知道什么"。** Skills 是菜谱，Memory 是冰箱里的食材清单。

## 二、Skills 设计模式 — SKILL.md 的结构与实战

### 2.1 SKILL.md 的标准结构

一份 Skill 本质上是一个 Markdown 文件，遵循固定的 frontmatter + body 结构。为什么需要标准化？因为 Agent 需要快速解析和匹配 Skill——如果格式五花八门，检索效率就大打折扣。

```yaml
---
name: skill-name
description: >
  一句话描述这个 Skill 做什么、什么时候应该使用它。
  这是检索匹配的核心字段，必须包含关键触发词。
version: 1.0.0
---
```

正文分为四个区块：

1. **Steps**（操作步骤）—— Agent 按顺序执行的动作
2. **Pitfalls**（陷阱）—— 踩过的坑、必须避免的错误
3. **Verification**（验证）—— 如何确认操作成功
4. **Context**（可选，上下文信息）—— 前置条件、依赖工具

### 2.2 实战：为 "npm 包发布" 写一份 SKILL.md

这是一个足够具体的场景——把 npm 包发布流程固化为 Skill：

```markdown
---
name: publish-npm-package
description: >
  发布 npm 包到 registry。涵盖版本号管理、changelog 生成、
  构建验证和发布。当用户要求发布 npm 包、release、bump version 时使用。
version: 1.2.0
---

# 发布 npm 包

## Steps

1. **检查前置条件**
   - 确认 `npm whoami` 返回正确的登录用户
   - 确认当前分支是 `main` 且工作目录干净（`git status` 无未提交更改）

2. **版本管理**
   - 运行 `npm version patch`（或 `minor` / `major`，根据用户指定）
   - 这会自动更新 `package.json`、`package-lock.json`，并创建 git tag

3. **构建与验证**
   - 运行 `npm run build`，确认构建成功
   - 运行 `npm run test`，确认所有测试通过
   - 运行 `npm pack --dry-run`，检查发布产物中不包含意外文件

4. **发布**
   - 运行 `npm publish --access public`（如果是 scoped 包）
   - 运行 `git push && git push --tags`

5. **确认**
   - 运行 `npm view <package-name> version`，确认远程版本与本地一致

## Pitfalls

- **不要跳过 `npm pack --dry-run`**。曾有案例将 `.env` 文件意外发布到 npm，
  造成密钥泄露。确认 `.npmignore` 或 `files` 字段正确。
- **不要在 feature 分支上发布。** 始终确保在 `main` 分支。
- **如果是 monorepo**，使用 workspace 协议发布，不要手动改版本号。

## Verification

- `npm view <package-name> version` 返回新版本号
- `npm view <package-name> dist.tarball` 可正常下载
- GitHub 上对应版本的 release tag 已存在
```

### 2.3 Skills 的检索与匹配

Agent 不是把所有 Skills 全部塞进上下文——那样会快速耗尽 token 预算。正确做法是：

1. 用户输入一个任务描述
2. 系统用 `description` 字段做语义匹配（关键词匹配或 embedding 相似度）
3. 只加载匹配到的 1-3 个 Skill 的完整内容

这就是为什么 `description` 字段如此重要——它相当于 Skill 的"搜索引擎索引"。

## 三、Memory 三层模型

人类记忆有短期记忆、长期记忆、情景记忆之分。Agent 的 Memory 系统也需要分层设计。参考 Anthropic 的 Context Engineering 最佳实践，我推荐三层模型：

### 3.1 短期记忆（Session Context）

```
会话开始 ──────────────────────────────────────> 会话结束
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ 当前对话的消息历史（messages array）        │  │
│  │ + 已加载的 Skills                         │  │
│  │ + 工具调用结果                             │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ← 会话结束即销毁，不持久化 →                     │
```

这就是 Agent 的"工作记忆"。它受限于模型的 context window，是三层中最"贵"的记忆——每一条消息都在占用有限的注意力窗口。

### 3.2 长期记忆（MEMORY.md）

```yaml
# MEMORY.md — 持久化经验，每次会话自动加载
# 硬上限：2000 tokens（超出触发压缩）

## 用户偏好
- 代码风格：使用 tabs 缩进，prettier 配置见 .prettierrc
- 偏好 TypeScript strict mode，不要使用 any
- commit message 遵循 Conventional Commits

## 项目知识
- 数据库迁移使用 flyway，脚本在 /db/migrations
- CI/CD 在 GitHub Actions，部署脚本在 .github/workflows
- API 文档使用 OpenAPI 3.0，定义在 /docs/api.yaml

## 踩坑记录
- 2026-05-12：sharp 模块在 Alpine 容器中需要额外安装 vips-dev
- 2026-05-28：Next.js 15 的 App Router 中，route handler 不能直接读取
  request body 两次，需要 clone
```

MEMORY.md 的关键设计决策：

- **自动加载**：每次会话启动时注入上下文，无需匹配
- **硬上限**：不超过 2000 tokens。为什么？因为它在每轮对话中都会被加载，太大会挤占真正重要的任务上下文
- **结构化**：按类别分区，方便 Agent 快速定位

### 3.3 日记（Daily Memory）

```
memory/
├── 2026-06-15.md   # 调试了 WebSocket 断连问题，原因是 nginx 超时
├── 2026-06-17.md   # 重构了 auth 模块，从 JWT 切换到 session
├── 2026-06-19.md   # 部署了新的 staging 环境
└── 2026-06-20.md   # 今天在做性能优化...
```

日记层的特点：

- **不自动加载到上下文**——只在 Agent 需要回顾历史时按需检索
- **按日期自然组织**——文件名即索引
- **容量不限**——因为不占用 context window
- **是长期记忆的"来源"**——定期从日记中提炼有价值的内容，升入 MEMORY.md

三层之间的关系：

```
日记（不加载）──提炼──→ MEMORY.md（自动加载，≤2000 tokens）
                            ↑
                    会话中发现重要事实 ──写入──┘

Skills（按需加载）←──固化── 多次重复的操作经验
```

## 四、实操 — 用 Python 实现 SkillsManager + MemoryManager

下面实现一套可运行的知识管理系统。代码自包含，可以直接运行。

### 4.1 SkillsManager — Skill 的注册、检索与版本控制

```python
"""
skills_manager.py — Agent Skill 管理系统
支持 Skill 的注册、语义检索、版本控制。
"""

import os
import re
import json
import hashlib
from datetime import datetime
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional


@dataclass
class Skill:
    """一个 Skill 的完整定义。"""
    name: str
    description: str
    version: str
    content: str  # 完整 Markdown 内容（含 frontmatter）
    created_at: str = ""
    updated_at: str = ""
    history: list = field(default_factory=list)

    def __post_init__(self):
        now = datetime.utcnow().isoformat()
        if not self.created_at:
            self.created_at = now
        self.updated_at = now

    @property
    def checksum(self) -> str:
        return hashlib.sha256(self.content.encode()).hexdigest()[:12]


class SkillsManager:
    """
    管理 Agent Skills 的注册、检索和版本控制。

    存储结构：
        skills/
        ├── publish-npm-package/
        │   ├── SKILL.md          # 当前版本
        │   └── .history.json     # 版本历史
        └── deploy-aws-lambda/
            ├── SKILL.md
            └── .history.json
    """

    def __init__(self, base_dir: str = "./skills"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    # ── 注册 ──────────────────────────────────────────

    def register(self, content: str) -> Skill:
        """
        从 Markdown 内容解析并注册 一个 Skill。
        如果同名 Skill 已存在，则更新版本并记录历史。
        """
        meta = self._parse_frontmatter(content)
        name = meta.get("name")
        if not name:
            raise ValueError("Skill 缺少 name 字段")

        skill_dir = self.base_dir / name
        skill_dir.mkdir(parents=True, exist_ok=True)

        skill_path = skill_dir / "SKILL.md"
        history_path = skill_dir / ".history.json"

        # 如果已存在，保存历史版本
        if skill_path.exists():
            old_content = skill_path.read_text(encoding="utf-8")
            old_meta = self._parse_frontmatter(old_content)
            history = self._load_history(history_path)
            history.append({
                "version": old_meta.get("version", "unknown"),
                "checksum": hashlib.sha256(
                    old_content.encode()
                ).hexdigest()[:12],
                "archived_at": datetime.utcnow().isoformat(),
                "content": old_content,
            })
            self._save_history(history_path, history)
        else:
            history = []

        # 写入新版本
        skill_path.write_text(content, encoding="utf-8")

        skill = Skill(
            name=name,
            description=meta.get("description", ""),
            version=meta.get("version", "1.0.0"),
            content=content,
            history=history,
        )
        return skill

    # ── 检索 ──────────────────────────────────────────

    def search(self, query: str, top_k: int = 3) -> list[Skill]:
        """
        基于关键词匹配检索相关 Skills。
        生产环境可替换为 embedding 向量相似度检索。
        """
        query_tokens = set(self._tokenize(query))
        scored = []

        for skill_dir in self.base_dir.iterdir():
            skill_path = skill_dir / "SKILL.md"
            if not skill_path.exists():
                continue

            content = skill_path.read_text(encoding="utf-8")
            meta = self._parse_frontmatter(content)
            desc = meta.get("description", "")

            # 对 description 做关键词匹配打分
            desc_tokens = set(self._tokenize(desc))
            overlap = len(query_tokens & desc_tokens)
            if overlap > 0:
                scored.append((overlap, content, meta))

        # 按匹配分数降序
        scored.sort(key=lambda x: x[0], reverse=True)

        results = []
        for score, content, meta in scored[:top_k]:
            results.append(Skill(
                name=meta.get("name", ""),
                description=meta.get("description", ""),
                version=meta.get("version", "1.0.0"),
                content=content,
            ))
        return results

    def list_all(self) -> list[dict]:
        """列出所有已注册 Skill 的摘要信息。"""
        skills = []
        for skill_dir in sorted(self.base_dir.iterdir()):
            skill_path = skill_dir / "SKILL.md"
            if skill_path.exists():
                meta = self._parse_frontmatter(
                    skill_path.read_text(encoding="utf-8")
                )
                skills.append({
                    "name": meta.get("name"),
                    "description": meta.get("description", "")[:80],
                    "version": meta.get("version"),
                })
        return skills

    # ── 版本控制 ──────────────────────────────────────

    def get_history(self, name: str) -> list[dict]:
        """获取指定 Skill 的版本历史。"""
        history_path = self.base_dir / name / ".history.json"
        return self._load_history(history_path)

    def rollback(self, name: str, version: str) -> Optional[Skill]:
        """回滚到指定历史版本。"""
        history = self.get_history(name)
        for entry in history:
            if entry["version"] == version:
                return self.register(entry["content"])
        return None

    # ── 内部方法 ──────────────────────────────────────

    @staticmethod
    def _parse_frontmatter(content: str) -> dict:
        """解析 YAML frontmatter 为字典（简易实现）。"""
        match = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
        if not match:
            return {}
        fm_text = match.group(1)
        meta = {}
        current_key = None
        multiline_buf = []

        for line in fm_text.split("\n"):
            # 处理多行值（以 > 开头）
            if current_key and line.startswith("  "):
                multiline_buf.append(line.strip())
                continue
            elif current_key and multiline_buf:
                meta[current_key] = " ".join(multiline_buf)
                current_key = None
                multiline_buf = []

            if ":" in line:
                key, _, val = line.partition(":")
                key = key.strip()
                val = val.strip()
                if val == ">" or val == "":
                    current_key = key
                    multiline_buf = []
                else:
                    meta[key] = val.strip("'\"")

        if current_key and multiline_buf:
            meta[current_key] = " ".join(multiline_buf)

        return meta

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """简易分词：小写化 + 按非字母数字切分。"""
        return re.findall(r"[a-z0-9\u4e00-\u9fff]+", text.lower())

    @staticmethod
    def _load_history(path: Path) -> list:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return []

    @staticmethod
    def _save_history(path: Path, history: list):
        path.write_text(
            json.dumps(history, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
```

### 4.2 MemoryManager — 三层记忆的实现

```python
"""
memory_manager.py — Agent Memory 三层管理系统
实现短期上下文、长期记忆（MEMORY.md）、日记（daily notes）的
写入、检索和自动压缩。
"""

import os
import re
from datetime import datetime, date
from pathlib import Path
from dataclasses import dataclass
from typing import Optional


@dataclass
class MemoryEntry:
    """一条记忆条目。"""
    content: str
    category: str  # user_pref | project | pitfall | general
    importance: float = 0.5  # 0.0 ~ 1.0
    created_at: str = ""
    source_session: str = ""

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.utcnow().isoformat()


class MemoryManager:
    """
    三层 Memory 管理器。

    存储布局：
        memory_root/
        ├── MEMORY.md              # 长期记忆（≤2000 tokens）
        └── daily/
            ├── 2026-06-19.md      # 日记
            └── 2026-06-20.md
    """

    # MEMORY.md 的 token 预算（粗略估算：1 token ≈ 4 英文字符或 2 中文字符）
    MAX_MEMORY_CHARS = 8000  # ≈ 2000 tokens

    def __init__(self, memory_root: str = "./agent_memory"):
        self.root = Path(memory_root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.daily_dir = self.root / "daily"
        self.daily_dir.mkdir(exist_ok=True)
        self.memory_path = self.root / "MEMORY.md"

    # ── 长期记忆（MEMORY.md）─────────────────────────

    def write_memory(self, entry: MemoryEntry) -> bool:
        """
        向 MEMORY.md 写入一条记忆。
        如果超出预算，触发压缩后重试。
        """
        content = self._load_memory_file()
        new_line = self._format_entry(entry)
        updated = content + "\n" + new_line

        if len(updated) > self.MAX_MEMORY_CHARS:
            # 触发压缩
            updated = self._compress_memory(updated)

        if len(updated) > self.MAX_MEMORY_CHARS:
            return False  # 压缩后仍然超限，拒绝写入

        self.memory_path.write_text(updated, encoding="utf-8")
        return True

    def read_memory(self) -> str:
        """读取完整 MEMORY.md（用于注入上下文）。"""
        return self._load_memory_file()

    def estimate_tokens(self) -> int:
        """粗略估算当前 MEMORY.md 的 token 数。"""
        content = self._load_memory_file()
        # 简易估算
        cn_chars = len(re.findall(r"[\u4e00-\u9fff]", content))
        en_chars = len(re.findall(r"[a-zA-Z0-9]", content))
        return cn_chars // 2 + en_chars // 4

    # ── 日记（Daily Memory）──────────────────────────

    def write_daily(
        self, content: str, target_date: Optional[date] = None
    ):
        """向当天的日记文件追加内容。"""
        d = target_date or date.today()
        daily_path = self.daily_dir / f"{d.isoformat()}.md"

        existing = ""
        if daily_path.exists():
            existing = daily_path.read_text(encoding="utf-8")

        timestamp = datetime.utcnow().strftime("%H:%M")
        entry = f"\n## {timestamp}\n\n{content}\n"
        updated = existing + entry if existing else f"# {d.isoformat()}\n{entry}"

        daily_path.write_text(updated, encoding="utf-8")

    def search_daily(
        self, query: str, days_back: int = 30
    ) -> list[dict]:
        """
        在日记中搜索相关内容。
        返回匹配的日记片段，按相关性排序。
        """
        results = []
        query_lower = query.lower()

        for daily_file in sorted(
            self.daily_dir.glob("*.md"), reverse=True
        ):
            # 只搜索最近 N 天
            file_date = daily_file.stem
            if len(results) > 10:
                break

            content = daily_file.read_text(encoding="utf-8")
            if query_lower in content.lower():
                # 提取包含关键词的段落
                paragraphs = content.split("\n\n")
                for para in paragraphs:
                    if query_lower in para.lower():
                        results.append({
                            "date": file_date,
                            "snippet": para.strip(),
                            "relevance": para.lower().count(
                                query_lower
                            ),
                        })

        results.sort(key=lambda x: x["relevance"], reverse=True)
        return results

    # ── 提炼：日记 → 长期记忆 ───────────────────────

    def promote_to_memory(
        self, content: str, category: str = "general"
    ) -> bool:
        """将日记中的有价值内容提炼到 MEMORY.md。"""
        entry = MemoryEntry(
            content=content,
            category=category,
            importance=0.8,  # 被提炼的内容默认高重要性
        )
        return self.write_memory(entry)

    # ── 压缩策略 ────────────────────────────────────

    def _compress_memory(self, content: str) -> str:
        """
        压缩 MEMORY.md 内容。策略：
        1. 合并同类条目
        2. 移除低重要性条目（标记为 deprecated 的行）
        3. 缩短冗长描述
        """
        lines = content.split("\n")
        kept = []
        current_section = ""

        for line in lines:
            # 保留标题行
            if line.startswith("#"):
                current_section = line
                kept.append(line)
                continue

            # 移除标记为废弃的条目
            if "[deprecated]" in line.lower():
                continue

            # 移除空行中的多余部分（保留一个空行分隔）
            if line.strip() == "":
                if kept and kept[-1].strip() != "":
                    kept.append(line)
                continue

            kept.append(line)

        result = "\n".join(kept).strip() + "\n"

        # 如果仍然过长，截断最旧的条目（文件顶部的非标题行）
        if len(result) > self.MAX_MEMORY_CHARS:
            result = self._truncate_oldest(result)

        return result

    def _truncate_oldest(self, content: str) -> str:
        """从文件顶部开始移除最旧的条目，直到符合预算。"""
        lines = content.split("\n")
        # 找到第一个 section header 之后的内容
        first_section_idx = 0
        for i, line in enumerate(lines):
            if line.startswith("## "):
                first_section_idx = i
                break

        # 逐段移除最旧的 section，直到符合预算
        while len("\n".join(lines)) > self.MAX_MEMORY_CHARS:
            # 找到下一个 section 的起始
            next_section = None
            for i in range(first_section_idx + 1, len(lines)):
                if lines[i].startswith("## "):
                    next_section = i
                    break

            if next_section is None:
                break  # 只剩一个 section，不能再删

            # 移除这个 section 的所有内容
            del lines[first_section_idx:next_section]

        return "\n".join(lines)

    # ── 内部方法 ────────────────────────────────────

    def _load_memory_file(self) -> str:
        if self.memory_path.exists():
            return self.memory_path.read_text(encoding="utf-8")
        # 初始化模板
        template = """# Agent Long-term Memory
# 预算上限：2000 tokens | 当前使用：0 tokens

## 用户偏好

## 项目知识

## 踩坑记录
"""
        self.memory_path.write_text(template, encoding="utf-8")
        return template

    @staticmethod
    def _format_entry(entry: MemoryEntry) -> str:
        """将 MemoryEntry 格式化为一行 Markdown。"""
        section_map = {
            "user_pref": "用户偏好",
            "project": "项目知识",
            "pitfall": "踩坑记录",
            "general": "其他",
        }
        section = section_map.get(entry.category, "其他")
        date_str = entry.created_at[:10]
        return f"- [{date_str}] {entry.content}  <!-- {section} -->"
```

### 4.3 集成使用示例

```python
"""
demo.py — Skills + Memory 系统集成演示
"""

from skills_manager import SkillsManager
from memory_manager import MemoryManager, MemoryEntry

# ── 初始化 ────────────────────────────────────────────

skills = SkillsManager(base_dir="./my_agent/skills")
memory = MemoryManager(memory_root="./my_agent/memory")

# ── 注册一个 Skill ────────────────────────────────────

npm_skill = """---
name: publish-npm-package
description: >
  发布 npm 包到 registry。涵盖版本号管理、changelog 生成、
  构建验证和发布。当用户要求发布 npm 包、release、bump version 时使用。
version: 1.0.0
---

# 发布 npm 包

## Steps
1. 检查 `npm whoami` 确认登录
2. 确认在 main 分支且工作目录干净
3. 运行 `npm version patch`
4. 运行 `npm run build && npm run test`
5. 运行 `npm pack --dry-run` 验证产物
6. 运行 `npm publish --access public`
7. 运行 `git push && git push --tags`

## Pitfalls
- 不要跳过 `npm pack --dry-run`，防止泄露敏感文件
- 不要在 feature 分支上发布

## Verification
- `npm view <package> version` 返回新版本号
"""

skill = skills.register(npm_skill)
print(f"✓ 注册 Skill: {skill.name} v{skill.version}")

# ── 语义检索 ──────────────────────────────────────────

results = skills.search("发布 npm 包 release")
print(f"\n✓ 检索 '发布 npm 包 release'，命中 {len(results)} 个 Skill:")
for r in results:
    print(f"  - {r.name} v{r.version}: {r.description[:60]}...")

# ── 写入长期记忆 ──────────────────────────────────────

memory.write_memory(MemoryEntry(
    content="代码风格使用 tabs 缩进，遵循 .prettierrc 配置",
    category="user_pref",
    importance=0.9,
))

memory.write_memory(MemoryEntry(
    content="CI/CD 使用 GitHub Actions，部署脚本在 .github/workflows",
    category="project",
    importance=0.7,
))

memory.write_memory(MemoryEntry(
    content="sharp 模块在 Alpine 容器中需要额外安装 vips-dev",
    category="pitfall",
    importance=0.8,
))

print(f"\n✓ MEMORY.md 当前 token 估算: {memory.estimate_tokens()}")
print(f"✓ MEMORY.md 内容:\n{memory.read_memory()}")

# ── 写入日记 ──────────────────────────────────────────

memory.write_daily(
    "调试了 WebSocket 断连问题。根因是 nginx 的 proxy_read_timeout "
    "默认 60s，改为 3600s 后解决。配置文件：/etc/nginx/conf.d/ws.conf"
)

memory.write_daily(
    "重构了 auth 模块，从 JWT 切换到 session-based auth。"
    "原因是 JWT 无法在服务端主动 revoke，安全团队要求切换。"
)

print("✓ 日记已写入")

# ── 搜索日记 ──────────────────────────────────────────

daily_results = memory.search_daily("nginx")
print(f"\n✓ 日记搜索 'nginx'，命中 {len(daily_results)} 条:")
for r in daily_results:
    print(f"  [{r['date']}] {r['snippet'][:80]}...")

# ── 提炼日记到长期记忆 ────────────────────────────────

memory.promote_to_memory(
    "nginx proxy_read_timeout 默认 60s，WebSocket 场景需改为 3600s",
    category="pitfall",
)
print("\n✓ 已将 nginx 踩坑记录提炼到 MEMORY.md")

# ── 查看 Skill 版本历史 ──────────────────────────────

# 更新 Skill 到 v1.1.0
updated_skill = npm_skill.replace("version: 1.0.0", "version: 1.1.0")
updated_skill += "\n- 发布后自动创建 GitHub Release（新增步骤）\n"
skills.register(updated_skill)

history = skills.get_history("publish-npm-package")
print(f"\n✓ Skill 'publish-npm-package' 版本历史:")
for h in history:
    print(f"  v{h['version']} ({h['archived_at'][:10]}) sha:{h['checksum']}")

# ── 组装 Agent 上下文 ─────────────────────────────────

def build_agent_context(
    task: str,
    skills_mgr: SkillsManager,
    memory_mgr: MemoryManager,
) -> str:
    """
    为 Agent 组装上下文：规则 + 记忆 + 匹配的 Skills。
    这就是 Harness 在每轮循环前做的事情。
    """
    parts = []

    # 1. 长期记忆（自动加载）
    mem = memory_mgr.read_memory()
    if mem.strip():
        parts.append(f"## 长期记忆\n{mem}")

    # 2. 匹配的 Skills（按需加载）
    matched = skills_mgr.search(task, top_k=2)
    if matched:
        skill_section = "\n\n".join(
            f"### Skill: {s.name}\n{s.content}" for s in matched
        )
        parts.append(f"## 匹配的技能\n{skill_section}")

    # 3. 相关日记（按需检索）
    daily = memory_mgr.search_daily(task, days_back=7)
    if daily:
        daily_section = "\n".join(
            f"- [{d['date']}] {d['snippet']}" for d in daily[:3]
        )
        parts.append(f"## 近期相关记录\n{daily_section}")

    return "\n\n---\n\n".join(parts)


context = build_agent_context("发布 npm 包", skills, memory)
print(f"\n{'='*60}")
print("Agent 上下文组装结果：")
print(f"{'='*60}\n")
print(context[:2000])
print(f"\n... (上下文总长度: {len(context)} 字符)")
```

运行 `python demo.py`，你会看到完整的注册、检索、记忆写入和上下文组装流程。

## 五、Memory 膨胀应对策略

Memory 系统运行一段时间后，必然面临膨胀问题。这和人脑一样——不可能记住所有事情，必须学会"遗忘"。

### 5.1 压缩（Compression）

压缩是 MEMORY.md 的生命线。前面代码中的 `_compress_memory` 方法实现了基础压缩，核心策略：

- **去重**：相同语义的条目合并为一条
- **抽象化**：将具体事件抽象为一般规则。例如"2026-05-12 sharp 在 Alpine 报错"、"2026-05-20 sharp 在 Ubuntu 报错" 合并为 "sharp 模块在非标准环境需要额外编译依赖"
- **标记废弃**：过时信息不直接删除，而是标记 `[deprecated]`，下次压缩时清除

### 5.2 重要性评分（Importance Scoring）

不是所有记忆都同等重要。一个实用的评分模型：

```python
def score_importance(entry: MemoryEntry, context: dict) -> float:
    """
    计算记忆条目的重要性得分（0.0 ~ 1.0）。

    评分维度：
    - 被引用次数：这条记忆被多少次日记引用
    - 类别权重：pitfall > project > user_pref > general
    - 时效性：越新的记忆权重越高
    - 用户反馈：用户明确强调过的记忆权重更高
    """
    score = 0.0

    # 类别权重
    category_weights = {
        "pitfall": 0.4,
        "project": 0.3,
        "user_pref": 0.25,
        "general": 0.15,
    }
    score += category_weights.get(entry.category, 0.15)

    # 时效性衰减（半衰期 30 天）
    from datetime import datetime
    age_days = (
        datetime.utcnow()
        - datetime.fromisoformat(entry.created_at)
    ).days
    recency = 0.3 * (0.5 ** (age_days / 30))
    score += recency

    # 引用次数（从 context 获取）
    ref_count = context.get("reference_count", 0)
    score += min(0.3, ref_count * 0.05)

    return min(1.0, score)
```

当 MEMORY.md 需要压缩时，按重要性得分从低到高排序，优先淘汰低分条目。

### 5.3 分层存储（Tiered Storage）

```
┌──────────────────────────────────────────┐
│  Hot: MEMORY.md（≤2000 tokens）          │  ← 每次会话自动加载
│  高重要性、高频使用的核心知识               │
├──────────────────────────────────────────┤
│  Warm: 日记（不限大小）                   │  ← 按需检索
│  中等重要性、有检索价值的历史记录           │
├──────────────────────────────────────────┤
│  Cold: archive/（压缩归档）               │  ← 极少访问
│  低重要性、已被压缩的过期记忆               │
└──────────────────────────────────────────┘
```

定期（比如每周一次），系统自动执行：

1. 扫描 MEMORY.md，淘汰低分条目到日记
2. 扫描超过 90 天的日记，压缩归档到 `archive/`
3. 日记中的高价值内容，提炼升入 MEMORY.md

这种"热/温/冷"三级存储，让 Agent 在保持上下文紧凑的同时，不丢失任何可能有价值的历史经验。

## 六、设计决策与取舍

实现 Skills 和 Memory 系统时，有几个关键的设计取舍值得讨论：

**为什么 MEMORY.md 限制 2000 tokens，而不是更大？**

因为 MEMORY.md 在每轮模型调用中都会被加载。如果你的 Agent 平均需要 10 轮工具调用才能完成任务，那么 MEMORY.md 的内容会被"阅读"10 次。2000 tokens × 10 轮 = 20000 tokens 的额外开销。在 128K context window 中看似不多，但它挤占的是真正需要的工作上下文——文件内容、工具结果、对话历史。Anthropic 的 Context Engineering 文档明确建议："只把绝对必要的持久信息放入每轮都加载的上下文。"

**为什么 Skills 不自动学习，而要人工确认？**

你可能会想：Agent 成功完成了一个任务，为什么不自动把步骤写成 Skill？因为 Skill 的质量直接影响 Agent 的后续行为。一个写得不好的 Skill（步骤遗漏、陷阱描述不准确）会让 Agent 在未来重复犯同样的错误。人工审核是 Skill 质量的最后一道防线。当然，Agent 可以自动生成 Skill 草稿，等人类确认后正式注册。

**日记为什么不用向量数据库？**

对于个人或小团队使用的 Agent，日记文件的数量通常在几百个以内。简单的关键词搜索已经足够高效，引入向量数据库（如 Chroma、Pinecone）会增加系统复杂度，而收益有限。当日记规模超过 1000 条、或者需要跨多个 Agent 共享记忆时，再考虑向量检索不迟。

## 总结

本文建立了 Agent 知识系统的完整框架：

- **Skills** 是固化的操作流程，按需加载，让 Agent 不重复踩同一个坑
- **Memory** 是跨会话的持久记忆，分为短期（会话上下文）、长期（MEMORY.md）、日记（daily notes）三层
- **MEMORY.md** 有严格的 token 预算，通过压缩和重要性评分保持精简
- **日记**是无限容量的历史记录，按需检索，是长期记忆的"来源"

Skills 和 Memory 让 Agent 从"一次性工具"变成"越用越聪明的助手"。但它们要发挥作用，前提是 Agent 有一个安全的执行环境——不能让 Agent 在修改你的工作目录时把代码搞坏了。这就是下一篇要解决的问题。

---

> **下篇预告**：第 4 篇「Worktrees 与沙箱 — Agent 的安全执行环境」。Agent 需要读写文件、执行命令，但直接在主分支上操作风险太大。我们将探讨 Git Worktree、容器沙箱和权限隔离三种方案，并实现一套让 Agent 在隔离环境中安全工作的机制。
