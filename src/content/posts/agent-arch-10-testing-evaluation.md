---
title: 'Agent 的测试与评估：如何证明你的 Agent 靠谱'
description: 'Agent 是非确定性的，传统单元测试不够用。本文讲解 Agent 的 3 层测试策略（工具单元 → 工作流集成 → 端到端评估），以及 pass@k、LLM 评分等评估指标。'
pubDate: 2026-06-19
category: 'AI 工程'
tags: ['Testing', 'Evaluation', 'Agent', 'pass@k', '可观测性']
draft: false
---

> 本文是"Agent 架构实战"系列的第 10 篇（完结篇）。前置阅读：[第 9 篇：多 Agent 编排](/posts/agent-arch-9-multi-agent)。

## 为什么 Agent 难测试

你写了一个 Agent，它能搜索网页、读取文件、调用 API，看起来运行正常。但你怎么证明它**靠谱**？

传统软件测试的假设在 Agent 场景下几乎全部失效：

| 传统假设 | Agent 现实 |
|---------|-----------|
| 相同输入 → 相同输出 | LLM 输出是非确定性的 |
| 步骤有限且可预测 | Agent 可能走任意路径完成任务 |
| 外部依赖可以 mock | LLM 本身就是最难 mock 的依赖 |
| 测试跑一次就够 | 同一个 case 跑 10 次可能过 7 次挂 3 次 |

Anthropic 在其 [Agent 评估指南](https://www.anthropic.com/engineering/evaluating-ai-agents) 中明确指出：

> "Evals for agents are fundamentally different from evals for models. You're not just testing whether the model gives the right answer — you're testing whether the entire system reaches the right outcome."

你需要测试的不是"模型回答对不对"，而是"整个系统能不能把事情办成"。

## Agent 的 3 层测试金字塔

软件工程中经典的测试金字塔在 Agent 场景下依然适用，但每一层的含义变了：

```
        /  E2E Eval  \        ← 最慢，最贵，最真实
       / Integration   \      ← 中速，测试工作流
      /   Unit Tests     \    ← 最快，最便宜，测试工具
```

- **Unit Tests（单元测试）**：测试单个工具函数的正确性。不涉及 LLM。
- **Integration Tests（集成测试）**：测试 Agent 的工作流编排。用 mock LLM 替代真实模型。
- **E2E Eval（端到端评估）**：用真实 LLM 运行完整任务，用指标衡量质量。

下面逐层展开。

---

## 第一层：工具单元测试

工具（Tool）是 Agent 与外部世界交互的接口。每个工具本质上就是一个函数——接收参数，返回结果。测试工具不需要 LLM，只需要验证：

1. 参数校验：非法参数是否正确报错
2. 返回值格式：返回结构是否符合 schema
3. 错误处理：网络超时、API 限流等异常是否被正确捕获
4. 副作用：写文件、发消息等操作是否按预期执行

### 实操：用 Vitest 测试一个搜索工具

假设我们有一个 `webSearch` 工具：

```typescript
// tools/webSearch.ts
import { z } from 'zod';

export const webSearchSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().min(1).max(10).default(5),
});

export async function webSearch(input: z.infer<typeof webSearchSchema>) {
  const params = webSearchSchema.parse(input);
  const response = await fetch(`https://api.search.example.com/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Search API failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    results: data.results.map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
    })),
  };
}
```

对应的测试：

```typescript
// tools/__tests__/webSearch.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webSearch } from '../webSearch';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('webSearch tool', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('应该返回结构化的搜索结果', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { title: 'Test', url: 'https://example.com', snippet: 'A test result' },
        ],
      }),
    });

    const result = await webSearch({ query: 'test', maxResults: 5 });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toHaveProperty('title');
    expect(result.results[0]).toHaveProperty('url');
    expect(result.results[0]).toHaveProperty('snippet');

    // 验证请求参数正确传递
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.search.example.com/search',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('应该拒绝空查询', async () => {
    await expect(webSearch({ query: '' })).rejects.toThrow();
  });

  it('应该处理 API 错误', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });

    await expect(webSearch({ query: 'test' })).rejects.toThrow(
      'Search API failed: 429'
    );
  });

  it('应该限制 maxResults 在 1-10 之间', async () => {
    await expect(webSearch({ query: 'test', maxResults: 99 })).rejects.toThrow();
  });
});
```

**要点**：这些测试跑得飞快（毫秒级），不调用任何外部服务。你的每个工具都应该都有这样的测试。

### Python 版本（pytest）

```python
# tools/test_web_search.py
import pytest
from unittest.mock import patch, AsyncMock
from tools.web_search import web_search

@pytest.mark.asyncio
async def test_web_search_returns_structured_results():
    mock_response = AsyncMock()
    mock_response.ok = True
    mock_response.json = AsyncMock(return_value={
        "results": [
            {"title": "Test", "url": "https://example.com", "snippet": "A test"}
        ]
    })

    with patch("tools.web_search.aiohttp.ClientSession.post", return_value=mock_response):
        result = await web_search(query="test", max_results=5)

    assert len(result["results"]) == 1
    assert "title" in result["results"][0]
    assert "url" in result["results"][0]

@pytest.mark.asyncio
async def test_web_search_rejects_empty_query():
    with pytest.raises(ValueError):
        await web_search(query="")

@pytest.mark.asyncio
async def test_web_search_handles_api_error():
    mock_response = AsyncMock()
    mock_response.ok = False
    mock_response.status = 500

    with patch("tools.web_search.aiohttp.ClientSession.post", return_value=mock_response):
        with pytest.raises(Exception, match="Search API failed: 500"):
            await web_search(query="test")
```

---

## 第二层：工作流集成测试

工具测试通过后，下一步是验证 **Agent 的工作流编排是否正确**。这一层的核心思路：**用确定性的 mock 替代 LLM，测试系统的编排逻辑**。

你需要验证的是：

1. 节点执行顺序是否正确
2. 条件路由是否按预期分支
3. 状态（State）在节点间是否正确传递
4. Middleware 的 before / after / onError 钩子是否触发
5. 重试和错误恢复逻辑是否工作

### 实操：Mock LLM + 测试 StateGraph

假设我们有一个 RAG Agent，使用第 3 篇介绍的 StateGraph 模式：

```typescript
// agent/ragAgent.ts
interface AgentState {
  query: string;
  documents: string[];
  answer: string;
  sources: { url: string; title: string }[];
  iteration: number;
}

interface Model {
  generateText(prompt: string): Promise<{ text: string }>;
}

function createRagGraph(model: Model) {
  const graph = new StateGraph<AgentState>();

  // 节点 1：检索文档
  graph.addNode('retrieve', async (state) => {
    const docs = await searchDocuments(state.query);
    return { ...state, documents: docs.map(d => d.content), sources: docs };
  });

  // 节点 2：生成回答
  graph.addNode('generate', async (state) => {
    const prompt = `Based on these documents:\n${state.documents.join('\n')}\n\nAnswer: ${state.query}`;
    const { text } = await model.generateText(prompt);
    return { ...state, answer: text };
  });

  // 节点 3：质量检查
  graph.addNode('qualityCheck', async (state) => {
    const { text } = await model.generateText(
      `Rate this answer 1-5: "${state.answer}" for query: "${state.query}"`
    );
    const score = parseInt(text);
    return { ...state, iteration: state.iteration + 1, _score: score };
  });

  // 路由：质量不达标且未超过 3 次迭代则重新生成
  graph.addEdge('retrieve', 'generate');
  graph.addEdge('generate', 'qualityCheck');
  graph.addConditionalEdge('qualityCheck', (state: any) => {
    if (state._score >= 4 || state.iteration >= 3) return 'end';
    return 'generate';
  });

  graph.setEntryPoint('retrieve');
  return graph.compile();
}
```

集成测试：

```typescript
// agent/__tests__/ragAgent.test.ts
import { describe, it, expect } from 'vitest';
import { createRagGraph } from '../ragAgent';

// 确定性 mock LLM——根据 prompt 内容返回不同预设响应
function createMockModel(responses: Record<string, string>): Model {
  return {
    generateText: async (prompt: string) => {
      // 根据 prompt 关键词匹配返回
      for (const [key, value] of Object.entries(responses)) {
        if (prompt.includes(key)) return { text: value };
      }
      return { text: 'default response' };
    },
  };
}

describe('RAG Agent workflow', () => {
  it('应该在质量达标时正常结束', async () => {
    const model = createMockModel({
      'Based on these documents': 'The answer is 42.',
      'Rate this answer': '5', // 高分，直接通过
    });

    const graph = createRagGraph(model);
    const result = await graph.invoke({
      query: 'What is the meaning of life?',
      documents: [],
      answer: '',
      sources: [],
      iteration: 0,
    });

    expect(result.answer).toBe('The answer is 42.');
    expect(result.iteration).toBe(1); // 只迭代了一次
  });

  it('应该在质量不达标时重试，但不超过 3 次', async () => {
    let generateCallCount = 0;
    const model: Model = {
      generateText: async (prompt: string) => {
        if (prompt.includes('Based on these documents')) {
          generateCallCount++;
          return { text: `Attempt ${generateCallCount}` };
        }
        if (prompt.includes('Rate this answer')) {
          // 前两次给低分，触发重试
          return { text: generateCallCount < 3 ? '2' : '4' };
        }
        return { text: '' };
      },
    };

    const graph = createRagGraph(model);
    const result = await graph.invoke({
      query: 'Explain quantum computing',
      documents: [],
      answer: '',
      sources: [],
      iteration: 0,
    });

    expect(generateCallCount).toBe(3); // 重试了 3 次
    expect(result.iteration).toBe(3);
  });

  it('应该正确传递 sources 信息', async () => {
    const model = createMockModel({
      'Based on these documents': 'Answer based on docs.',
      'Rate this answer': '5',
    });

    const graph = createRagGraph(model);
    const result = await graph.invoke({
      query: 'test',
      documents: [],
      answer: '',
      sources: [],
      iteration: 0,
    });

    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0]).toHaveProperty('url');
  });
});
```

### 测试 Middleware 钩子

第 7 篇介绍了 Middleware 模式。集成测试中需要验证 Middleware 的生命周期钩子是否正确触发：

```typescript
// agent/__tests__/middleware.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('Agent Middleware', () => {
  it('应该按顺序触发 before → execute → after', async () => {
    const callOrder: string[] = [];

    const loggingMiddleware = {
      before: async (input: any) => {
        callOrder.push('before');
        return input;
      },
      after: async (output: any) => {
        callOrder.push('after');
        return output;
      },
      onError: async (error: Error) => {
        callOrder.push('onError');
        throw error;
      },
    };

    const agent = createAgent({
      model: mockModel,
      middleware: [loggingMiddleware],
      execute: async (input: any) => {
        callOrder.push('execute');
        return { result: 'done' };
      },
    });

    await agent.run('test input');

    expect(callOrder).toEqual(['before', 'execute', 'after']);
  });

  it('应该在执行出错时触发 onError 而非 after', async () => {
    const callOrder: string[] = [];

    const errorMiddleware = {
      before: async (input: any) => {
        callOrder.push('before');
        return input;
      },
      after: async (output: any) => {
        callOrder.push('after');
        return output;
      },
      onError: async (error: Error) => {
        callOrder.push(`onError:${error.message}`);
        throw error;
      },
    };

    const agent = createAgent({
      model: mockModel,
      middleware: [errorMiddleware],
      execute: async () => {
        throw new Error('tool timeout');
      },
    });

    await expect(agent.run('test')).rejects.toThrow('tool timeout');
    expect(callOrder).toEqual(['before', 'onError:tool timeout']);
    expect(callOrder).not.toContain('after');
  });
});
```

**集成测试的核心原则**：LLM 被完全替换为确定性 mock。你测试的是**编排逻辑**，不是模型能力。如果 mock LLM 返回正确的数据，graph 就应该走正确的路径。

---

## 第三层：端到端评估

端到端评估是唯一使用**真实 LLM** 的测试层。它回答的问题不是"代码有没有 bug"，而是"Agent 能不能把事情办成"。

这一层有三个核心指标：

### 指标 1：pass@k —— "能不能做到"

> 运行 k 次，**至少一次**成功就算通过。

pass@k 衡量的是 Agent 的**能力上限**。如果 k=10 时 pass@10 = 80%，意味着 Agent 在 10 次尝试中至少有 8 次能完成任务。

计算公式（来自 OpenAI Codex 论文）：

```
pass@k = 1 - C(n-c, k) / C(n, k)
```

其中 n 是总运行次数，c 是成功次数。

适用场景：评估 Agent 是否具备完成某类任务的能力。

```typescript
// evals/passAtK.ts
async function evaluatePassAtK(
  agent: Agent,
  testCase: TestCase,
  k: number = 10,
  totalRuns: number = 20
): Promise<{ passAtK: number; rawPassRate: number }> {
  let successes = 0;

  for (let i = 0; i < totalRuns; i++) {
    const result = await agent.run(testCase.input);
    if (testCase.check(result)) {
      successes++;
    }
  }

  const rawPassRate = successes / totalRuns;

  // 使用无偏估计公式
  const passAtK = 1 - comb(totalRuns - successes, k) / comb(totalRuns, k);

  return { passAtK, rawPassRate };
}

// 辅助：组合数计算
function comb(n: number, k: number): number {
  if (k > n) return 0;
  if (k === 0) return 1;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result *= (n - i) / (i + 1);
  }
  return result;
}
```

### 指标 2：pass^k —— "稳不稳定"

> 运行 k 次，**必须每次都成功**才算通过。

pass^k 衡量的是 Agent 的**可靠性下限**。这是回归测试的核心指标。如果你的 Agent 在 10 次运行中有 1 次会删除生产数据库——pass^10 = 0，不管其他 9 次表现多好。

```
pass^k = C(c, k) / C(n, k)
```

适用场景：CI/CD 中的回归测试，确保修改没有引入不稳定性。

```typescript
async function evaluatePassPowK(
  agent: Agent,
  testCase: TestCase,
  k: number = 5
): Promise<number> {
  let successes = 0;

  for (let i = 0; i < k; i++) {
    const result = await agent.run(testCase.input);
    if (testCase.check(result)) {
      successes++;
    }
  }

  // pass^k: 必须全部通过
  return successes === k ? 1 : 0;
}
```

### 指标 3：LLM-as-Judge —— "回答质量如何"

有些任务没有二元的"对/错"判断。比如"写一份代码审查报告"——怎么算好，怎么算差？

**LLM-as-Judge** 的思路是用另一个 LLM（通常是更强的模型）来打分。你需要设计一个评分标准（Rubric）：

```typescript
// evals/llmJudge.ts
interface Rubric {
  criteria: {
    name: string;
    description: string;
    scaleMin: number;   // 例如 1
    scaleMax: number;   // 例如 5
  }[];
}

async function llmJudge(
  judgeModel: Model,
  input: string,
  output: string,
  rubric: Rubric
): Promise<{ scores: Record<string, number>; reasoning: string }> {
  const rubricText = rubric.criteria
    .map(c => `- ${c.name} (${c.scaleMin}-${c.scaleMax}): ${c.description}`)
    .join('\n');

  const prompt = `You are an expert evaluator. Rate the following agent output.

## Input
${input}

## Agent Output
${output}

## Rubric
${rubricText}

Respond in JSON format:
{
  "scores": { "criterion_name": score },
  "reasoning": "brief explanation"
}`;

  const { text } = await judgeModel.generateText(prompt);
  return JSON.parse(text);
}
```

使用示例：

```typescript
const codeReviewRubric: Rubric = {
  criteria: [
    {
      name: 'correctness',
      description: '是否正确识别了代码中的真实问题',
      scaleMin: 1,
      scaleMax: 5,
    },
    {
      name: 'completeness',
      description: '是否覆盖了所有主要问题，没有遗漏关键 bug',
      scaleMin: 1,
      scaleMax: 5,
    },
    {
      name: 'actionability',
      description: '是否给出了具体的修复建议，而不只是指出问题',
      scaleMin: 1,
      scaleMax: 5,
    },
  ],
};

const result = await llmJudge(
  gpt4Model,
  'Review this function for bugs',
  agentOutput,
  codeReviewRubric
);

console.log(result.scores);
// { correctness: 4, completeness: 3, actionability: 5 }
```

**LLM-as-Judge 的注意事项**：

- **Judge 模型要强于被测 Agent 的模型**。用 GPT-4o 评价 Claude Haiku 的输出是合理的，反过来则不行。
- **Rubric 要具体**。"回答是否好"是垃圾评分标准；"是否正确指出了 N+1 查询问题"才是有效的。
- **多次运行取均值**。单次 LLM 评分有随机性，建议每个 case 评 3 次取平均。

---

## 评估数据集设计

你需要一个精心设计的评估数据集。这不是"随便写几个 input"，而是覆盖 Agent 核心能力的系统性测试集。

### 一个 10 case 的代码分析 Agent 评估集

```json
[
  {
    "id": "perf-001",
    "input": "分析这段代码的性能问题：function findDuplicates(arr) { let result = []; for(let i=0; i<arr.length; i++) { for(let j=0; j<arr.length; j++) { if(i!==j && arr[i]===arr[j]) result.push(arr[i]); } } return result; }",
    "expected_tools": ["read_file", "analyze_performance"],
    "expected_output_contains": ["O(n²)", "时间复杂度", "Set", "哈希"],
    "rubric": {
      "correctness": "输出是否正确识别了 O(n²) 的性能瓶颈",
      "completeness": "是否同时给出了时间复杂度和空间复杂度分析",
      "actionability": "是否给出了用 Set 或排序优化的具体代码"
    },
    "difficulty": "easy"
  },
  {
    "id": "security-001",
    "input": "审查这个 API 端点的安全问题：app.get('/user/:id', (req, res) => { const user = db.query('SELECT * FROM users WHERE id = ' + req.params.id); res.json(user); });",
    "expected_tools": ["read_file", "security_scan"],
    "expected_output_contains": ["SQL 注入", "参数化查询", "prepared statement"],
    "rubric": {
      "correctness": "是否正确识别了 SQL 注入漏洞",
      "completeness": "是否还检查了其他安全问题（如未鉴权）",
      "actionability": "是否给出了参数化查询的具体改写代码"
    },
    "difficulty": "easy"
  },
  {
    "id": "refactor-001",
    "input": "重构这个 300 行的函数，使其符合单一职责原则",
    "expected_tools": ["read_file", "write_file"],
    "expected_output_contains": ["拆分", "职责", "函数"],
    "rubric": {
      "correctness": "拆分后的函数是否仍然保持原有功能",
      "completeness": "是否所有职责都被正确识别和拆分",
      "actionability": "重构后的代码是否可以直接使用"
    },
    "difficulty": "medium"
  },
  {
    "id": "debug-001",
    "input": "这个测试用例偶尔失败，帮我排查原因：test('user creation', async () => { const user = await createUser({ name: 'test' }); expect(await getUser(user.id)).toBeDefined(); await deleteUser(user.id); });",
    "expected_tools": ["read_file", "run_test", "analyze_logs"],
    "expected_output_contains": ["竞态", "清理", "隔离"],
    "rubric": {
      "correctness": "是否正确识别了测试隔离或竞态问题",
      "completeness": "是否分析了所有可能导致偶发失败的原因",
      "actionability": "是否给出了修复方案（如 beforeEach/afterEach 清理）"
    },
    "difficulty": "hard"
  },
  {
    "id": "arch-001",
    "input": "我们的微服务系统响应变慢了。服务 A 调用 B，B 调用 C 和 D，D 还回调 B。帮我分析可能的瓶颈。",
    "expected_tools": ["read_file", "analyze_architecture"],
    "expected_output_contains": ["循环依赖", "级联故障", "超时", "熔断"],
    "rubric": {
      "correctness": "是否正确识别了 B↔D 的循环调用风险",
      "completeness": "是否提到了超时、重试风暴、级联故障等问题",
      "actionability": "是否给出了具体的架构改进建议"
    },
    "difficulty": "hard"
  }
]
```

（此处展示 5 个 case，实际建议 10 个以上，覆盖 easy / medium / hard 三个难度。）

### 评估运行器

把上面三个指标和评估集串起来：

```typescript
// evals/runner.ts
interface EvalResult {
  caseId: string;
  passAtK: number;
  passPowK: number;
  judgeScores: Record<string, number>;
  latency: number;
  tokenUsage: number;
}

async function runEvalSuite(
  agent: Agent,
  dataset: TestCase[],
  judgeModel: Model
): Promise<EvalResult[]> {
  const results: EvalResult[] = [];

  for (const testCase of dataset) {
    console.log(`Running eval: ${testCase.id}`);
    const start = Date.now();

    // pass@k: 跑 10 次
    const { passAtK, rawPassRate } = await evaluatePassAtK(agent, testCase, 10, 20);

    // pass^k: 跑 5 次，必须全部通过
    const passPowK = await evaluatePassPowK(agent, testCase, 5);

    // LLM Judge: 取一次运行的结果评分
    const agentResult = await agent.run(testCase.input);
    const judgeResult = await llmJudge(
      judgeModel,
      testCase.input,
      agentResult.output,
      { criteria: Object.entries(testCase.rubric).map(([name, desc]) => ({
        name, description: desc, scaleMin: 1, scaleMax: 5,
      }))}
    );

    results.push({
      caseId: testCase.id,
      passAtK,
      passPowK,
      judgeScores: judgeResult.scores,
      latency: Date.now() - start,
      tokenUsage: agentResult.tokenUsage || 0,
    });
  }

  return results;
}

// 生成报告
function printEvalReport(results: EvalResult[]) {
  console.log('\n=== Agent Eval Report ===\n');

  for (const r of results) {
    console.log(`[${r.caseId}]`);
    console.log(`  pass@10: ${(r.passAtK * 100).toFixed(1)}%`);
    console.log(`  pass^5:  ${r.passPowK === 1 ? 'PASS' : 'FAIL'}`);
    console.log(`  Judge:   ${JSON.stringify(r.judgeScores)}`);
    console.log(`  Latency: ${r.latency}ms`);
    console.log();
  }

  // 汇总
  const avgPassAtK = results.reduce((sum, r) => sum + r.passAtK, 0) / results.length;
  const allPassPowK = results.every(r => r.passPowK === 1);
  console.log(`Overall pass@10: ${(avgPassAtK * 100).toFixed(1)}%`);
  console.log(`Overall pass^5:  ${allPassPowK ? 'ALL PASS' : 'SOME FAILED'}`);
}
```

---

## 生产监控：上线之后怎么办

测试和评估在部署前进行。但 Agent 上线后，你还需要**持续监控**，因为：

- 真实用户的输入比评估集更刁钻
- LLM 提供商会更新模型，可能影响输出质量
- 外部 API 的延迟和可用性会变化

### Tracing：记录每一步

Tracing 是最基础的可观测性能力。你需要记录 Agent 执行的每一个步骤：

```typescript
// monitoring/tracing.ts
import { performance } from 'perf_hooks';

interface TraceSpan {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  input?: any;
  output?: any;
  error?: string;
  children: TraceSpan[];
}

class Tracer {
  private spans: TraceSpan[] = [];
  private stack: TraceSpan[] = [];

  async trace<T>(name: string, fn: () => Promise<T>, input?: any): Promise<T> {
    const span: TraceSpan = {
      name,
      startTime: performance.now(),
      input: input ? this.sanitize(input) : undefined,
      children: [],
    };

    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1].children.push(span);
    } else {
      this.spans.push(span);
    }

    this.stack.push(span);

    try {
      const result = await fn();
      span.output = this.sanitize(result);
      span.endTime = performance.now();
      span.duration = span.endTime - span.startTime;
      return result;
    } catch (error: any) {
      span.error = error.message;
      span.endTime = performance.now();
      span.duration = span.endTime - span.startTime;
      throw error;
    } finally {
      this.stack.pop();
    }
  }

  getTrace(): TraceSpan[] {
    return this.spans;
  }

  private sanitize(data: any): any {
    // 移除敏感信息，截断过长的内容
    const str = JSON.stringify(data);
    if (str.length > 1000) return str.slice(0, 1000) + '...[truncated]';
    return data;
  }
}
```

与 Agent Middleware 集成（参考第 7 篇的 Middleware 模式）：

```typescript
const tracingMiddleware = {
  before: async (input: any) => {
    // 开始一个新的 trace
    return input;
  },
  wrapToolCall: async (toolName: string, args: any, next: () => Promise<any>) => {
    return tracer.trace(`tool:${toolName}`, next, args);
  },
  wrapLLMCall: async (prompt: string, next: () => Promise<any>) => {
    return tracer.trace('llm:generate', next, { promptLength: prompt.length });
  },
};
```

生产环境中，trace 数据通常发送到 [LangSmith](https://docs.smith.langchain.com)、[Langfuse](https://langfuse.com) 或基于 OpenTelemetry 的自建系统。

### Metrics：量化运行状况

你需要持续追踪的核心指标：

| 指标 | 含义 | 告警阈值建议 |
|------|------|------------|
| Latency P50 | 中位延迟 | > 10s |
| Latency P95 | 95 分位延迟 | > 30s |
| Latency P99 | 99 分位延迟 | > 60s |
| Success Rate | 任务成功率 | < 95% |
| Tool Error Rate | 工具调用失败率 | > 5% |
| Token Usage | 每次任务的 token 消耗 | > 50k tokens |
| Cost per Task | 每次任务的 LLM 成本 | > $0.50 |
| Loop Iterations | Agent 循环次数 | > 10 次 |

用 Middleware 模式收集 Metrics：

```typescript
// monitoring/metricsCollector.ts
interface MetricsData {
  latencies: number[];
  successes: number;
  failures: number;
  tokenUsages: number[];
  toolErrors: Record<string, number>;
  loopIterations: number[];
}

class MetricsCollector {
  private data: MetricsData = {
    latencies: [],
    successes: 0,
    failures: 0,
    tokenUsages: [],
    toolErrors: {},
    loopIterations: [],
  };

  // 作为 Middleware 注入 Agent
  createMiddleware() {
    const startTime = new WeakMap<object, number>();

    return {
      before: async (input: any) => {
        startTime.set(input, Date.now());
        return input;
      },
      after: async (output: any, input: any) => {
        const duration = Date.now() - (startTime.get(input) || Date.now());
        this.data.latencies.push(duration);
        this.data.successes++;

        if (output.tokenUsage) {
          this.data.tokenUsages.push(output.tokenUsage);
        }
        if (output.iterations) {
          this.data.loopIterations.push(output.iterations);
        }

        return output;
      },
      onError: async (error: Error) => {
        this.data.failures++;
        const toolName = (error as any).toolName || 'unknown';
        this.data.toolErrors[toolName] = (this.data.toolErrors[toolName] || 0) + 1;
        throw error;
      },
    };
  }

  getSummary() {
    const sorted = [...this.data.latencies].sort((a, b) => a - b);
    const total = this.data.successes + this.data.failures;

    return {
      successRate: total > 0 ? this.data.successes / total : 0,
      latencyP50: percentile(sorted, 50),
      latencyP95: percentile(sorted, 95),
      latencyP99: percentile(sorted, 99),
      avgTokenUsage: average(this.data.tokenUsages),
      avgLoopIterations: average(this.data.loopIterations),
      toolErrors: { ...this.data.toolErrors },
      totalRequests: total,
    };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
```

### Alerting：及时发现问题

基于 metrics 设定告警规则：

```typescript
// monitoring/alerter.ts
interface AlertRule {
  name: string;
  check: (summary: MetricsSummary) => boolean;
  severity: 'warning' | 'critical';
  message: string;
}

const alertRules: AlertRule[] = [
  {
    name: 'high-error-rate',
    check: (s) => s.successRate < 0.95,
    severity: 'critical',
    message: `Agent 成功率低于 95%: 当前 ${(s) => (s.successRate * 100).toFixed(1)}%`,
  },
  {
    name: 'high-latency-p95',
    check: (s) => s.latencyP95 > 30000,
    severity: 'warning',
    message: `Agent P95 延迟超过 30s: 当前 ${s.latencyP95}ms`,
  },
  {
    name: 'excessive-tokens',
    check: (s) => s.avgTokenUsage > 50000,
    severity: 'warning',
    message: `平均 token 消耗超过 50k: 当前 ${s.avgTokenUsage}`,
  },
  {
    name: 'infinite-loop-risk',
    check: (s) => s.avgLoopIterations > 10,
    severity: 'critical',
    message: `平均循环次数超过 10: 当前 ${s.avgLoopIterations}`,
  },
];

function evaluateAlerts(collector: MetricsCollector): AlertRule[] {
  const summary = collector.getSummary();
  return alertRules.filter(rule => rule.check(summary));
}

// 定期运行（例如每 5 分钟）
setInterval(() => {
  const alerts = evaluateAlerts(metricsCollector);
  for (const alert of alerts) {
    sendAlert({
      severity: alert.severity,
      message: alert.message,
      timestamp: new Date().toISOString(),
      metrics: metricsCollector.getSummary(),
    });
  }
}, 5 * 60 * 1000);
```

---

## 把三层测试串起来：CI/CD 中的 Agent 测试策略

一个实际项目中的推荐配置：

```yaml
# .github/workflows/agent-tests.yml
name: Agent Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test -- --filter='tools/**'
    # 每次 push 都跑，耗时 < 30s

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test -- --filter='agent/**'
    # 每次 push 都跑，耗时 < 2min

  e2e-eval:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - run: npm run eval
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    # 只在 PR 时跑（因为要花钱），耗时 10-30min
```

**策略总结**：

| 层 | 频率 | 耗时 | 成本 | 何时阻断 |
|----|------|------|------|---------|
| Unit | 每次 push | < 30s | $0 | 工具测试失败 |
| Integration | 每次 push | < 2min | $0 | 工作流测试失败 |
| E2E Eval | 每次 PR | 10-30min | $1-10 | pass^5 < 80% |

---

## 系列完结：回顾与展望

这是"Agent 架构实战"系列的最后一篇。让我们回顾整个系列的知识图谱：

```
第 1 篇  Agent 架构概览：从 Prompt 到自主系统
第 2 篇  工具系统：让 Agent 拥有双手
第 3 篇  Agent Loop：while 循环里的智能
第 4 篇  上下文工程：有限窗口的无限智慧
第 5 篇  错误处理与恢复：构建韧性 Agent
第 6 篇  安全与权限：给 Agent 装上护栏
第 7 篇  Middleware 模式：Agent 的可插拔架构
第 8 篇  人机协作：Human-in-the-Loop
第 9 篇  多 Agent 编排：从单兵到团队
第 10 篇 测试与评估：证明 Agent 靠谱 ← 你在这里
```

这 10 篇文章覆盖了从**单个工具**到**多 Agent 系统**、从**开发**到**测试运维**的完整链路。但 Agent 领域仍在快速演进，以下是值得继续深入的方向：

**短期（1-3 个月）**：
- **MCP 协议**：Model Context Protocol 正在成为 Agent 工具调用的标准协议，值得深入理解其 client-server 架构。
- **Agent SDK 实践**：Anthropic 的 Agent SDK、OpenAI 的 Agents SDK 等官方框架正在快速成熟。

**中期（3-6 个月）**：
- **Context Engineering**：随着 Agent 任务复杂度提升，上下文管理将成为核心瓶颈。关注 compaction、summarization、memory 等技术。
- **Evaluation 体系建设**：Anthropic 和 OpenAI 都在推动 Agent eval 标准化，这是保证 Agent 质量的关键基础设施。

**长期（6-12 个月）**：
- **Agent 操作系统**：当 Agent 成为主流计算范式，围绕它的进程管理、资源调度、安全隔离等系统层问题将催生新的基础设施。
- **多 Agent 经济**：当多个 Agent 可以互相调用、谈判、交易，我们将看到一个全新的"Agent 经济"生态。

> 技术在变，但工程原则不变：**简单优于复杂，显式优于隐式，可测试优于不可测试**。这些原则在第 1 篇适用，在第 10 篇适用，在未来的第 100 篇也适用。

感谢阅读这个系列。如果你在实践中有任何心得，欢迎交流。

---

**参考资料**：
- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/evaluating-ai-agents)
- [LangSmith Documentation](https://docs.smith.langchain.com)
- [Vercel AI SDK: Observability](https://sdk.vercel.ai/docs/ai-sdk-core/observability)
- [OpenAI Evals](https://github.com/openai/evals)
- [Langfuse: Open Source LLM Observability](https://langfuse.com)
