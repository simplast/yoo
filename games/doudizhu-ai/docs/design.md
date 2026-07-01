# AI 斗地主 3D 浏览器游戏设计

日期：2026-06-30

## 背景与目标

在现有 Yoo 博客的游戏区新增一个浏览器端斗地主游戏。玩家与两个预设 AI 玩家进行单局斗地主。AI 玩家后台调用不同 LLM 厂商模型，MVP 首批支持 DeepSeek 与星火 MaaS。游戏保留传统斗地主核心规则，但视觉风格显著区别于传统斗地主，采用赛博全息 3D 牌桌。

核心目标：

- 完成一个可玩的 3 人斗地主单局闭环。
- 真人玩家对战两个 LLM 驱动的预设 AI 玩家。
- AI 决策必须经过本地规则校验，LLM 不能直接改变游戏状态。
- 支持用户为每个 AI 选择 DeepSeek 或星火 MaaS，并输入自己的 API Key。
- API Key 默认只保存在内存，用户可选择保存到本机 `localStorage`。
- 使用 Cloudflare Pages Functions 代理 LLM 请求，避免浏览器直连厂商 API 和 CORS 问题。
- 以 Three.js 实现赛博全息风格的 3D 牌桌体验。

非目标：

- MVP 不做多人联网。
- MVP 不做叫地主/抢地主，地主每局随机。
- MVP 不做账号系统、排行榜、长期战绩。
- MVP 不保存或托管用户 API Key。
- MVP 不优先追求完整商业级 3D 资产，先用程序化几何、材质、光效完成风格闭环。

## 现有项目接入方式

项目当前是 Astro 4 + TypeScript 静态博客，已有 built game 模式：`games/green-cycle/` 通过 Vite 构建到 `public/games/green-cycle/`，游戏大厅在 `src/pages/games/index.astro` 维护入口。

新增游戏沿用相同模式：

- 新子项目：`games/doudizhu-ai/`
- 构建输出：`public/games/doudizhu-ai/`
- 游戏入口：`/games/doudizhu-ai/`
- 游戏大厅新增卡片。
- 根脚本 `build:games` 更新为同时构建 `green-cycle` 与 `doudizhu-ai`。
- `.gitignore` 忽略 `public/games/doudizhu-ai/` 构建产物。

## 推荐方案

采用”玩法优先的 3D MVP”：

- 前端：`Vite + TypeScript + Three.js`。
- 后端代理：Cloudflare Pages Function `functions/api/llm.ts`，使用 Vercel AI SDK + `@ai-sdk/openai`。
- 斗地主规则、状态管理、结算全部在前端本地 TypeScript 中实现。
- LLM 只做 AI 玩家出牌/跳过决策。
- AI SDK 原生 tool calling：SDK 定义 `validateMove` 工具，模型必须调用该工具一次，校验在服务端执行。
- `toolResult` 随响应返回；前端优先使用 server-validated 结果。
- 如模型返回纯文本（fallback），前端走 JSON 解析 + 本地 `validateMove`。
- 校验失败时把错误注入下一轮 LLM 调用，最多 3 次。
- 同一 AI 决策连续 3 次仍非法时，该 AI 所在阵营直接判负。

选择该方案是因为斗地主游戏体验的根基是规则稳定和回合流转可靠；视觉和 LLM 个性可以迭代增强，但规则裁判和 AI 决策边界必须从第一版就清晰。

## 系统架构

```mermaid
flowchart TD
    User[真人玩家] --> GameUI[3D 游戏 UI]
    GameUI --> GameState[本地 GameState]
    GameState --> Rules[斗地主规则引擎]
    Rules --> Validator[validateMove 校验工具]
    Rules --> LegalMoves[合法动作生成器]

    GameState --> AITurn[AI 回合编排器]
    AITurn --> PromptBuilder[Prompt 构造器]
    PromptBuilder --> LlmClient[前端 LLM Client]
    LlmClient --> Proxy[/api/llm Pages Function]
    Proxy --> DeepSeek[DeepSeek API]
    Proxy --> Spark[星火 MaaS API]
    DeepSeek --> Proxy
    Spark --> Proxy
    Proxy --> LlmClient
    LlmClient --> Parser[结构化响应解析]
    Parser --> Validator
    Validator --> GameState
    Validator --> AITurn
```

### 前端职责

- 洗牌、发牌、随机地主。
- 维护 3 名玩家手牌、当前轮次、上一手牌、倍数、已出牌历史。
- 识别牌型、比较牌力、校验动作是否合法。
- 生成 AI 可用的局势摘要与候选合法动作摘要。
- 编排 AI 决策、重试、失败判负。
- 渲染 3D 场景和交互 UI。
- 管理模型厂商、模型名、API Key、本地保存偏好。

### Pages Function 职责

- 接收统一 LLM 请求（含 `toolContext`）。
- 使用 Vercel AI SDK + `@ai-sdk/openai` 调用厂商 API。
- 转发用户提供的 API Key。
- AI SDK 原生 tool calling：`validateMove` 在服务端执行。
- 返回统一格式（含 `toolResult`）。
- 不保存 API Key，不记录 API Key。

### LLM 职责

- 阅读规则、人设和当前局势。
- 在当前规则约束下提出一个动作：`play` 或 `pass`。
- 输出一句个性化中文台词。
- 不负责校验规则，不直接改变游戏状态。

## 技术栈

### 游戏前端

- Vite
- TypeScript
- Three.js
- 原生 DOM/CSS HUD
- Vitest 用于规则模块测试

Three.js 负责场景、牌桌、卡牌、灯光、镜头和动画；DOM/CSS 负责配置面板、按钮、提示、错误信息和结算弹窗。这样可避免把所有 UI 都做成 3D 交互导致 MVP 复杂度过高。

### LLM 代理

使用 Vercel AI SDK 在 Pages Function 端统一处理 LLM 调用和 tool calling：

- 依赖 `ai`（Vercel AI SDK 7）、`@ai-sdk/openai`（兼容 OpenAI 协议的客户端）、`zod`。
- 两个厂商（DeepSeek、星火 MaaS）均通过 `createOpenAI()` 以不同 `baseURL` 接入，复用统一的 OpenAI-compatible client。
- AI SDK 原生 `tool()` 定义 `validateMove`，SDK 保证模型必须调用该工具一次。
- `validateMove` 在服务端执行，`toolResult` 随响应返回。
- 前端 `decisionLoop` 优先使用 `toolResult`；如模型返回纯文本（fallback），则走本地 JSON 解析 + `validateMove` 路径。
- 这三个依赖（`ai`、`@ai-sdk/openai`、`zod`）安装在根 `node_modules` 供 Pages Function 使用，不在游戏子项目的 `package.json` 中。

## 游戏规则范围

MVP 是单局斗地主核心玩法：

- 3 人局：1 名真人玩家 + 2 名 AI 玩家。
- 使用 54 张牌。
- 每局随机地主。
- 地主获得 3 张底牌。
- 地主先出。
- 地主阵营：地主 1 人。
- 农民阵营：另外 2 人。
- 任一玩家手牌出完，单局结束。
- 地主先出完：地主胜。
- 任一农民先出完：农民阵营胜。

### 支持牌型

- 单张
- 对子
- 三张
- 三带一
- 三带二
- 顺子
- 连对
- 飞机
- 飞机带单
- 飞机带对
- 四带二
- 炸弹
- 火箭

### 不支持或暂缓

- 叫地主/抢地主。
- 加倍/超级加倍按钮。
- 明牌。
- 托管。
- 复杂赛事积分。

### 倍数与结算

- 基础分默认 1。
- 初始倍数默认 1。
- 每个炸弹使倍数翻倍。
- 火箭使倍数翻倍。
- 结算展示胜负阵营、最终倍数和每名玩家本局得分变化。
- MVP 实现简单计分：
  - 地主胜：地主 `+2 * 倍数`，每个农民 `-1 * 倍数`。
  - 农民胜：地主 `-2 * 倍数`，每个农民 `+1 * 倍数`。

## 状态机

```mermaid
stateDiagram-v2
    [*] --> config
    config --> dealing
    dealing --> playing
    playing --> awaiting-human
    playing --> awaiting-ai
    awaiting-human --> playing: valid
    awaiting-human --> playing: pass
    awaiting-ai --> requesting-llm
    requesting-llm --> playing: valid (toolResult or local validateMove)
    requesting-llm --> requesting-llm: invalid and retries left
    requesting-llm --> forced-loss: invalid after 3 attempts
    requesting-llm --> paused-for-config: auth or provider config error
    paused-for-config --> requesting-llm
    playing --> round-over: any player empty hand
    forced-loss --> round-over
    round-over --> settlement
    settlement --> config: new round
```

### 回合规则

- 当前玩家如果是新一轮领出者，不能 `pass`。
- 当前玩家如果需要跟牌，可以 `play` 合法压过上一手，也可以 `pass`。
- 连续两个玩家 `pass` 后，上一手出牌者成为新一轮领出者。
- 出牌后如果手牌为空，立即进入 `roundOver`。

## 规则模块设计

规则模块必须是纯 TypeScript，不依赖 Three.js、DOM、网络。

建议模块：

- `src/rules/card.ts`
  - `Card`、`Suit`、`Rank` 类型。
  - 牌序列化，例如 `S3`、`H10`、`BJ`、`RJ`。
  - 排序与展示名称。
- `src/rules/deck.ts`
  - 创建 54 张牌。
  - 洗牌。
  - 发牌。
- `src/rules/handAnalyzer.ts`
  - 输入一组牌，输出 `HandPattern`。
  - 无法识别时返回 invalid。
- `src/rules/compare.ts`
  - 判断一个有效牌型能否压过另一个。
- `src/rules/moveValidator.ts`
  - 校验玩家是否拥有这些牌。
  - 校验是否轮到该玩家。
  - 校验是否允许 pass。
  - 校验出牌是否为合法牌型。
  - 校验是否能压过上一手。
- `src/rules/legalMoveGenerator.ts`
  - 生成 AI 的候选合法动作。
  - 输出给 prompt 使用的摘要。
- `src/rules/scoring.ts`
  - 维护倍数。
  - 单局结算。

核心类型示例：

```ts
type PlayerId = 'human' | 'ai-calm' | 'ai-aggressive';
type Role = 'landlord' | 'farmer';
type Action = 'play' | 'pass';

interface MoveProposal {
  playerId: PlayerId;
  action: Action;
  cards: CardId[];
}

interface ValidationResult {
  ok: boolean;
  code?: string;
  message?: string;
  normalizedMove?: NormalizedMove;
  allowedActionsHint?: LegalActionHint[];
}
```

## AI 玩家设计

MVP 两个预设 AI：

1. **冷静数学派**
   - 稳健、重视牌型结构和剩余牌数。
   - 倾向保留炸弹/高牌到关键时刻。
   - 台词短、冷静、有计算感。

2. **激进压迫派**
   - 更主动压制节奏。
   - 更愿意拆牌和使用炸弹。
   - 台词更强势、更有攻击性。

用户可以为每个 AI 配置：

- 厂商：DeepSeek / 星火 MaaS。
- 模型名：提供默认值，可高级编辑。
- API Key。
- 是否记住本机密钥。

人设本身 MVP 固定，不提供自由编辑，避免 prompt 注入和 UI 复杂度过高。

## LLM Prompt 设计

每次 AI 需要决策时调用一次 LLM。Prompt 由三部分组成：

### 固定系统规则

包含：

- 你正在玩中国斗地主。
- 当前游戏地主随机产生，不存在叫抢地主阶段。
- 你只能从自己手牌中选择牌。
- 如果你是领出者，不能跳过。
- 如果你是跟牌者，可以跳过，或者出合法且能压过上一手的牌。
- 你必须输出严格 JSON。
- 你必须调用 `validateMove`。
- 你必须包含一句中文短台词。
- 不要输出 Markdown、解释段落或多余文本。

### 人设提示

按 AI 玩家注入固定人设。

### 动态局势

包含：

- 当前 AI 是地主还是农民。
- 队友信息。
- 自己手牌。
- 三名玩家剩余牌数。
- 当前上一手牌：玩家、牌、牌型。
- 当前是否为新一轮领出。
- 当前倍数。
- 已出关键牌摘要。
- 本地生成的候选合法动作摘要。
- 如果是重试，包含上一次校验失败结果。

## AI 决策工具调用协议

服务端使用 Vercel AI SDK 原生 tool calling。模型必须调用 `validateMove` 工具一次。工具由 Zod schema 定义：

```ts
const validateMoveInputSchema = z.object({
  action: z.enum(["play", "pass"]),
  cards: z.array(z.string()).default([]),
  reason: z.string().max(200).optional(),
  speech: z.string().min(1).max(80),
});
```

工具在服务端执行，返回 `ToolValidationOutput`：

```ts
interface ToolValidationOutput {
  action: Action;
  cards: CardId[];
  speech: string;
  reason?: string;
  validation: ValidationResult;
}
```

### Fallback 路径

如模型未使用 tool call（返回纯文本），前端仍可解析严格 JSON：

```json
{
  "tool": "validateMove",
  "arguments": {
    "action": "play",
    "cards": ["S3", "H3"],
    "reason": "用小对子试探，保留高牌压制后续。"
  },
  "speech": "先探探你们的火力。"
}
```

跳过：

```json
{
  "tool": "validateMove",
  "arguments": {
    "action": "pass",
    "cards": [],
    "reason": "当前牌型不值得消耗高牌。"
  },
  "speech": "这一手我先让你过。"
}
```

### 响应解析约束

- 优先使用 `toolResult`（服务端 AI SDK 原生 tool calling 结果）。
- Fallback：解析文本 JSON，接受 `tool === "validateMove"`、`action` 是 `play` 或 `pass`、`cards` 是数组、`speech` 是非空字符串（最多 80 字）。

## AI 决策循环

每次 AI 回合：

1. 从当前 `GameState` 生成 `DecisionContext`。
2. 生成合法动作摘要。
3. 构造 prompt。
4. 调用 `/api/llm`（携带 `toolContext`）。
5. 优先使用返回的 `toolResult`（AI SDK 服务端 validateMove）。
6. `toolResult.validation.ok` → 应用动作并展示 `speech`。
7. 无 `toolResult` → fallback 解析文本 JSON → 本地 `validateMove`。
8. 非法 → 把校验错误注入下一轮 prompt，最多 3 次。
9. 3 次仍非法 → 该 AI 所在阵营判负。

### 失败判负细节

- 如果 AI 是地主：地主阵营判负，农民胜。
- 如果 AI 是农民：农民阵营判负，地主胜。
- 结算页说明失败原因，例如“激进压迫派连续 3 次提交非法动作”。

### API 错误与非法动作的区别

- 鉴权失败、余额不足、模型不存在等配置问题：暂停游戏并提示用户修正，不直接判负。
- 网络短暂失败：可作为当前决策失败重试，但应显示状态。
- LLM 返回格式错误、选择不存在的牌、牌型非法、无法压过上一手：计入 3 次 tool 校验失败。

## `/api/llm` 代理设计

### 请求格式

```json
{
  "provider": "deepseek",
  "apiKey": "用户输入的 key",
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "temperature": 0.4,
  "maxTokens": 600,
  "toolContext": {
    "state": { /* GameState */ },
    "playerId": "ai-calm"
  }
}
```

`provider` 可为：

- `deepseek`
- `spark-maas`

`toolContext` 是必填项，包含当前完整 `GameState` 和 AI 玩家 ID，供服务端执行 `validateMove` 使用。

### 返回格式

成功（AI SDK tool call 命中）：

```json
{
  "ok": true,
  "text": "...",
  "toolResult": {
    "action": "play",
    "cards": ["S3", "H3"],
    "speech": "先探探你们的火力。",
    "validation": {
      "ok": true,
      "normalizedMove": {
        "playerId": "ai-calm",
        "action": "play",
        "cards": ["S3", "H3"],
        "pattern": { "type": "pair", "cards": ["S3", "H3"], ... }
      }
    }
  },
  "usage": {
    "promptTokens": 1200,
    "completionTokens": 80
  }
}
```

成功（无 tool call，仅纯文本，fallback）：

```json
{
  "ok": true,
  "text": "{\"tool\":\"validateMove\",...}",
  "usage": { "promptTokens": 1200, "completionTokens": 80 }
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "PROVIDER_AUTH_FAILED",
    "message": "DeepSeek API Key 无效或余额不足。"
  }
}
```

### 安全约束

- 不在仓库、前端代码、Pages Function 环境变量中硬编码用户 API Key。
- Pages Function 不持久化请求体。
- 错误日志不得包含 `apiKey`。
- 前端 localStorage 保存必须由用户显式勾选。
- 密钥输入区域明确提示：密钥仅用于本次游戏调用厂商 API；勾选保存时仅保存于本机浏览器。

## 3D 视觉与交互设计

视觉方向：**赛博全息牌局**。

### 场景元素

- 深色虚拟空间背景。
- 半透明全息圆形牌桌。
- 三个玩家座位围绕牌桌分布。
- 真人玩家在下方，两个 AI 位于左上和右上。
- 卡牌以 3D 平面网格渲染，带轻微厚度或边框发光。
- 当前出牌区位于牌桌中央。
- 底牌以悬浮小卡牌形式展示。
- 当前行动玩家有环形光效。
- 炸弹/火箭触发短暂冲击波或粒子闪光。
- AI 台词以头像旁 hologram 气泡展示。

### 镜头

- 固定斜俯视相机。
- 不做自由旋转，避免用户迷失。
- 可有轻微开局推进和出牌时镜头微动。

### 玩家交互

- 玩家手牌位于屏幕底部，以 3D 卡牌扇形或横向弧形排列。
- 点击卡牌选中/取消选中。
- 选中牌上浮并增强描边。
- `出牌` 按钮：提交选中牌。
- `跳过` 按钮：仅在允许 pass 时可用。
- 非法选择时即时提示原因。
- 当前上一手牌在中央展示。
- 每个玩家剩余牌数常驻展示。
- 当前倍数和阵营角色常驻展示。

### HUD

使用 DOM/CSS 而不是 Three.js 实现：

- 开始前配置面板。
- AI 厂商/API Key 输入。
- 游戏状态提示。
- 出牌/跳过按钮。
- 错误 toast。
- LLM 调用状态：思考中、校验失败重试中、等待用户修正 key。
- 结算弹窗。

### 性能策略

- 卡牌使用共享几何体与材质变体。
- 文本可先使用 DOM overlay，避免复杂 3D 字体。
- 动画用 requestAnimationFrame 内的轻量 tween。
- MVP 不引入大型 glTF 资产。

## 前端目录建议

```text
games/doudizhu-ai/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.ts
│   ├── config.ts
│   ├── types.ts
│   ├── styles.css
│   ├── game/
│   │   ├── state.ts
│   │   ├── turnFlow.ts
│   │   └── index.ts
│   ├── rules/
│   │   ├── card.ts
│   │   ├── deck.ts
│   │   ├── handAnalyzer.ts
│   │   ├── compare.ts
│   │   ├── moveValidator.ts
│   │   ├── legalMoveGenerator.ts
│   │   ├── scoring.ts
│   │   └── index.ts
│   ├── ai/
│   │   ├── personas.ts
│   │   ├── promptBuilder.ts
│   │   ├── llmClient.ts
│   │   ├── responseParser.ts
│   │   ├── decisionLoop.ts
│   │   └── index.ts
│   ├── render/
│   │   ├── Scene.ts
│   │   ├── Camera.ts
│   │   ├── CardMesh.ts
│   │   ├── Table.ts
│   │   ├── PlayerSeats.ts
│   │   ├── animations.ts
│   │   └── three-shim.d.ts
│   ├── ui/
│   │   ├── Hud.ts
│   │   ├── ConfigPanel.ts
│   │   ├── Toast.ts
│   │   └── SettlementModal.ts
│   ├── storage/
│   │   └── settingsStore.ts
└── tests/
    ├── handAnalyzer.test.ts
    ├── compare.test.ts
    ├── decisionLoop.ai.test.ts
    └── response-parser.test.ts
```

## Pages Function 目录建议

```text
functions/
└── api/
    └── llm.ts
```

如果 Pages Functions 类型支持需要额外配置，可增加轻量类型声明或把实现写成兼容 Cloudflare Pages Functions 的标准签名。

## 配置面板设计

开局前显示配置：

- AI 1：冷静数学派
  - 厂商选择：DeepSeek / 星火 MaaS
  - 模型名：默认值，可编辑
  - API Key 输入
  - 记住本机密钥 checkbox
- AI 2：激进压迫派
  - 同上
- 高级设置：
  - LLM 代理 URL，默认 `/api/llm`
  - temperature，默认 0.4，可后续隐藏

开始按钮校验：

- 两个 AI 都必须选择厂商。
- 两个 AI 都必须有 API Key。
- 代理 URL 不为空。

## 错误处理

### 配置错误

- 缺 API Key：阻止开始。
- Provider 不支持：阻止开始。
- 模型名为空：使用默认模型或阻止开始。

### LLM 调用错误

- 鉴权失败：暂停游戏，提示修正 key，然后可重试当前 AI 回合。
- 余额/限流：暂停并展示厂商错误。
- 网络失败：允许重试，仍失败则暂停提示。

### LLM 内容错误

计入 tool 校验失败次数：

- 非 JSON。
- JSON schema 不合法。
- tool 名称不是 `validateMove`。
- action 非法。
- cards 非数组。
- 牌不在自己手里。
- 牌型不合法。
- 不能压过上一手。
- 领出时选择 pass。

### 规则错误

规则模块应返回可显示的中文错误，不抛出未捕获异常。

## 测试计划

### 单元测试

重点覆盖规则模块：

- 牌型识别：每种支持牌型至少 2-3 个正例和反例。
- 大小比较：同牌型比较、炸弹压制、火箭压制、不同普通牌型不能比较。
- 出牌校验：
  - 没有这些牌。
  - 牌型非法。
  - 领出 pass。
  - 跟牌 pass。
  - 跟牌不能压过上一手。
- AI 决策循环：mock 有效响应、JSON 解析失败重试、连续 3 次非法判负。
- 响应解析：合法/非法 JSON、Markdown 包裹提取。

### 集成测试/手动验证

- 无 LLM 时可用 mock provider 跑通一局。
- DeepSeek key 配置后 AI 能出牌。
- 星火 MaaS key 配置后 AI 能出牌。
- LLM 返回非法 JSON 时触发重试。
- LLM 连续 3 次非法时触发阵营判负。
- 鉴权失败时暂停而非判负。
- 构建产物能在 Astro `/games/doudizhu-ai/` 访问。

### 构建验证

完成实现后运行：

```bash
npm run build
```

如果只改游戏子项目，可先运行：

```bash
cd games/doudizhu-ai
npm run typecheck
npm run test
npm run build
```

## 交付切片建议

1. 创建 `games/doudizhu-ai/` Vite + TypeScript + Three.js 基础项目，输出到 `public/games/doudizhu-ai/`。
2. 实现纯规则模块和测试。
3. 实现本地单局状态机，先用 mock AI 跑通回合。
4. 实现基础 3D 牌桌、卡牌和真人交互。
5. 实现配置面板和 API Key 本地保存选项。
6. 实现 `/api/llm` Pages Function 和 Provider Adapter。
7. 实现 Prompt、响应解析、tool 校验重试循环。
8. 接入 DeepSeek 与星火 MaaS。
9. 加入赛博视觉动效、AI 台词、结算弹窗。
10. 接入游戏大厅和根构建脚本。
11. 运行测试与 `npm run build`。

## 风险与缓解

### LLM 输出不可控

缓解：严格 JSON 协议、本地 schema 解析、本地规则校验、最多 3 次失败判负。

### 厂商 API 兼容差异

缓解：Provider Adapter 隔离差异，前端只依赖统一 `/api/llm`。

### 用户 API Key 安全

缓解：默认内存保存；localStorage 仅用户显式选择；代理不存储、不记录 key。

### 规则复杂度高

缓解：规则模块纯函数化、优先测试牌型识别和比较；MVP 不做叫抢地主。

### 3D 实现拖慢玩法

缓解：Three.js 只负责核心场景和卡牌；HUD 用 DOM；不引入大型资产。

## 验收标准

- 游戏大厅出现 AI 斗地主入口。
- 打开 `/games/doudizhu-ai/` 后能配置两个 AI 的厂商、模型和 API Key。
- 能开始一局，随机地主并正确发牌。
- 真人玩家能选择手牌、出牌、跳过。
- 两个 AI 能通过 LLM 决策出牌或跳过。
- AI 决策必须经过本地 `validateMove` 校验。
- AI 校验失败会携带错误重试，最多 3 次。
- 连续 3 次非法动作会触发该 AI 阵营判负。
- 炸弹/火箭会影响倍数。
- 任一玩家出完牌后结算胜负和得分。
- DeepSeek 与星火 MaaS 至少各能完成一次 AI 决策调用。
- API Key 默认不持久化；勾选后才保存到本机 localStorage。
- `npm run build` 成功。
