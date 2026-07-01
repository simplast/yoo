# AI 斗地主 · 空当接龙 — 代码理解文档

> 面向首次接触本项目的开发者。建议结合 `docs/design.md` 阅读。

## 一、项目概览

一个浏览器端三人斗地主游戏。真人玩家 vs 两个 LLM 驱动的 AI。2D DOM + CSS 渲染经典空当接龙风格牌桌，Vercel AI SDK 处理 AI 工具调用。

**关键数字：** 54 张牌、3 名玩家、17/17/20 发牌、3 次 AI 重试上限、13 种牌型。

```
真人(你) ←→ 2D 牌桌(DOM HUD + Stage) ←→ /api/llm(Cloudflare Pages Function) ←→ DeepSeek / 星火MaaS
                                 ↕
                    AI 冷静数学派 / AI 激进压迫派
```

## 二、目录结构

```
games/doudizhu-ai/
├── src/
│   ├── main.ts          ← 入口：组装所有模块，驱动主循环
│   ├── config.ts         ← 全局常量（最多重试次数、默认温度等）
│   ├── types.ts          ← 领域类型（CardId、GameState、LLM 请求体等）
│   ├── styles.css        ← 全部 DOM HUD 样式
│   ├── game/
│   │   ├── state.ts      ← 新牌局创建（洗牌、发牌、随机地主）
│   │   └── turnFlow.ts   ← 回合流转引擎（应用动作、推进回合、终局检测）
│   ├── rules/            ← 纯函数规则引擎（不依赖 DOM/Three.js/网络）
│   │   ├── card.ts       ← 卡牌 ID 体系、牌值映射、排序
│   │   ├── deck.ts       ← 创建/洗牌/发牌
│   │   ├── handAnalyzer.ts ← 牌型识别（13 种）
│   │   ├── compare.ts    ← 牌型比较（能否压过上一手）
│   │   ├── moveValidator.ts ← 动作校验（游戏规则的唯一裁判）
│   │   ├── legalMoveGenerator.ts ← 合法动作枚举（给 AI prompt 用）
│   │   └── scoring.ts    ← 计分与结算
│   ├── ai/               ← LLM 决策管线
│   │   ├── personas.ts   ← 两个固定 AI 人设
│   │   ├── promptBuilder.ts ← 构造 system + user prompt
│   │   ├── llmClient.ts  ← fetch 封装调用 /api/llm
│   │   ├── responseParser.ts ← 文本 JSON 解析（fallback 路径）
│   │   └── decisionLoop.ts ← 核心决策循环（含重试和判负）
│   ├── render/           ← 2D DOM + CSS 场景
│   │   ├── Scene.ts      ← 场景总控：同步卡牌、布局、特效
│   │   ├── cardDom.ts    ← 卡牌 DOM 构建（正面/背面、选中态）
│   │   └── layout.ts     ← 布局坐标计算（human/center/ai/bottom）
│   ├── ui/               ← DOM HUD
│   │   ├── Hud.ts        ← HUD 主控制器（顶栏 + 底栏 + 子模块）
│   │   ├── ConfigPanel.ts ← 赛前配置面板
│   │   ├── Toast.ts      ← 浮动提示
│   │   └── SettlementModal.ts ← 结算弹窗
│   └── storage/
│       └── settingsStore.ts ← localStorage 设置持久化
└── functions/api/
    └── llm.ts            ← Cloudflare Pages Function（AI SDK 服务端）
```

## 三、核心数据流

### 3.1 游戏主循环

```
AppModel (单一状态树)
  │
  ├─→ render()
  │     ├─→ scene.update(state)   → 同步 2D 卡牌 DOM / 布局 / 特效
  │     └─→ hud.update(state)     → 更新 DOM 状态 / 按钮
  │
  ├─→ maybeRunAiTurn()
  │     └─→ runAiTurn(playerId)   → LLM 决策 或 Mock AI
  │           ├─→ decideAiMove()  → AI 决策循环
  │           └─→ updateStateAfterMove() → 应用结果 → render()
  │
  └─→ playHumanSelection() / passHuman()
        └─→ submitMove() → validateMove → applyValidatedMove → render()
```

### 3.2 AI 决策完整路径

```
AI 回合触发
  │
  ├─ Mock 模式 (?mockAi=1)
  │     └─ playMockAiTurn() → 选第一个合法 play → 出牌
  │
  └─ LLM 模式
        │
        ├─ 主线（AI SDK tool calling）:
        │   decideAiMove()
        │     → buildDecisionPrompt() 构造 system + user
        │     → llmClient.complete()  发送到 /api/llm
        │     → /api/llm 用 AI SDK generateText() + tool(validateMove)
        │     → validateMove 在服务端执行
        │     → 返回 { ok: true, toolResult: {...} }
        │     → 前端直接使用 toolResult.validation
        │
        └─ Fallback（纯文本路径）:
            /api/llm 返回 { ok: true, text: "{...}" }（无 toolResult）
              → parseToolCallResponse(text)  解析 JSON
              → validateMove()  本地校验
              → 通过 → 应用动作
              → 失败 → 注入错误 → 重试（最多 3 次）
                        → 3 次后 → forcedLoss() → 该 AI 阵营判负
```

## 四、详细模块说明

### 4.1 `types.ts` — 类型系统

所有类型定义。核心类型关系：

```
CardId → Card
HandPattern ← analyzeHand()
MoveProposal → validateMove() → ValidationResult → NormalizedMove
GameState ← createNewRound() → turnFlow 操作
NormalizedLlmRequest ← buildLlmRequest() → /api/llm → NormalizedLlmResponse
                              ↕
                         AiToolContext (包含完整 GameState)
                              ↕
                       ToolValidationOutput (服务端校验结果)
```

关键枚举值：
- `PlayerId`: `"human" | "ai-calm" | "ai-aggressive"`
- `GamePhase`: 10 个阶段，从 `"config"` 到 `"settlement"`
- `HandType`: 14 种（含 `"invalid"`），覆盖斗地主全部牌型

### 4.2 `config.ts` — 常量

| 常量 | 值 | 含义 |
|------|-----|------|
| `MAX_AI_ATTEMPTS` | 3 | AI 最多重试次数 |
| `DEFAULT_TEMPERATURE` | 0.4 | LLM 采样温度 |
| `DEFAULT_MAX_TOKENS` | 600 | LLM 单次输出上限 |
| `BASE_SCORE` | 1 | 基础分 |
| `INITIAL_MULTIPLIER` | 1 | 初始倍数 |
| `SPEECH_MAX_LENGTH` | 40 | AI 台词最大字数 |

### 4.3 `rules/` — 规则引擎（纯函数）

**card.ts**: 卡牌体系。`CardId = "S3".."D2" | "BJ" | "RJ"`，3=3..2=15, BJ=16, RJ=17。

**deck.ts**: Fisher-Yates 洗牌，轮转发牌（每人 17 张 + 3 张底牌）。

**handAnalyzer.ts**: 牌型识别。按张数分类处理：
- 1-3 张：直接判定
- 4 张：bomb 或 triple-single
- 5 张：triple-pair 或 straight
- ≥5 张：尝试 straight / consecutive-pairs / airplane / airplane-singles / airplane-pairs / four-two

核心算法：按牌值分组 → 分析 count 分布 → 判断类型。

**compare.ts**: 火箭无敌 > 炸弹压非炸弹 > 同牌型比主牌值。还需验证张数和 units 一致。

**moveValidator.ts**: 游戏的权威裁判。校验清单：
1. 阶段对（playing / awaiting-*）
2. 轮到该玩家
3. 牌属于该玩家
4. 不含重复 ID
5. Pass：领出者不可 pass
6. Play：牌型必须可识别
7. 非领出时需压过上一手

**legalMoveGenerator.ts**: 从手牌枚举合法出法。策略：
1. 从分组生成 singles/pairs/triples/bombs
2. 检测火箭
3. 组合搜索复杂牌型
4. 上限：80 个候选、6000 次组合检查

**scoring.ts**: 得分公式：地主系数 2、农民系数 1、赢方正分、输方负分，再乘倍数。

### 4.4 `game/` — 游戏状态管理

**state.ts**: `createNewRound()` 的一次性流程：
```
createDeck() → shuffleDeck() → dealCards() → 随机地主 → 分底牌 → GameState
```

**turnFlow.ts**: `applyValidatedMove()` 的回合流转：
```
pass → passCount+1 → 2 连 pass 则重置领出者
play → 移除手牌 → 倍数更新(炸弹/火箭) → 手牌清空? → 结算 : 下一玩家
```

### 4.5 `ai/` — LLM 决策管线

**personas.ts**: 冷静数学派（稳健、保留炸弹）vs 激进压迫派（抢节奏、愿拆牌）。

**promptBuilder.ts**: 两条消息：
- `system`: 规则 + 人设 + 策略 + 格式要求
- `user`: 当前局势 JSON（手牌、剩余数、上一手、合法动作、已出关键牌）

**llmClient.ts**: fetch 封装，30 秒超时，处理网络错误和格式校验。

**responseParser.ts**: 从 LLM 文本提取 JSON（处理 Markdown 包裹），逐字段校验 schema。

**decisionLoop.ts**: 核心循环。两条路径：
1. **主线**：`toolResult` 存在 → 直接用服务端校验结果
2. **Fallback**：纯文本 → JSON 解析 → 本地校验

失败重试最多 3 次。3 次后 `buildForcedLoss()` 判负。

### 4.6 `render/` — 2D DOM + CSS 场景

**Scene.ts**: 场景总控，管理五个区域的卡牌 DOM：
- `humanCards`: 底部横排、可点击选择（选中上浮 18px）
- `centerCards`: 中央出牌区（上一手牌横排展示）
- `bottomCards`: 顶部中央底牌（背面，结算翻面）
- `aiCalmCards` / `aiAggressiveCards`: 顶部左右牌背竖排堆叠

`syncCardMap()` 增量更新卡牌 DOM（增/删），`applyLayout()` 用 `transform: translate3d(x,y,0)` 定位，CSS `transition` 平滑过渡。无每帧重绘、无 RAF 循环。

**cardDom.ts**: 经典空当接龙扑克牌 DOM 构建。白底圆角矩形，左上角点数+花色（红♥♦/黑♠♣），中央大花色符号。大小王用「小王/大王」文字 + 颜色区分。`createCardElement(cardId, faceUp)`、`setFaceUp()`、`setSelected()`。

**layout.ts**: 布局坐标计算。固定卡牌尺寸 56×80px。四个布局函数：`layoutHumanHand`（底部横排，选中上浮）、`layoutCenterCards`（中央横排）、`layoutAiHand`（左右竖排堆叠，最多展示 8 张层叠效果）、`layoutBottomCards`（顶部横排）。返回 `Map<CardId, {x, y, z}>`。

### 4.7 `ui/` — DOM HUD

**Hud.ts**: 整合顶栏（状态 + 元信息 + 配置按钮）+ 底栏（已选牌 + 出牌/跳过）+ 三个子模块。

**ConfigPanel.ts**: innerHTML 模板渲染（零框架）。两个 AI 独立配置厂商/模型/密钥，高级设置折叠。

**Toast.ts**: 浮动提示，4 种类型，2.8 秒自动消失。

**SettlementModal.ts**: 结算弹窗，展示胜方/原因/倍数/分数变化 + 操作按钮。

### 4.8 `functions/api/llm.ts` — LLM 代理

Cloudflare Pages Function。关键架构决策：

- 使用 **Vercel AI SDK 7**（`ai`, `@ai-sdk/openai`, `zod`/v4）
- 两厂商均通过 `createOpenAI()` 以不同 `baseURL` 接入
- `validateMove` 定义为 AI SDK 原生 `tool()`，**在服务端执行**
- `toolContext`（含完整 GameState）从请求传入
- `toolResult` 随响应返回，前端优先使用

请求校验链：provider → apiKey → model → messages → toolContext。

## 五、状态流转

```
config → dealing → playing
                      ├─→ awaiting-human (轮到真人)
                      │     ├─ play(valid) → playing
                      │     └─ pass(valid) → playing
                      │
                      ├─→ awaiting-ai → requesting-llm
                      │     ├─ toolResult 有效 → playing
                      │     ├─ 校验失败 + 重试 → requesting-llm
                      │     ├─ 3 次失败 → forced-loss → round-over → settlement
                      │     └─ 鉴权错误 → paused-for-config
                      │           └─ 修复 → requesting-llm
                      │
                      └─→ round-over (手牌清空) → settlement

settlement → config (再来一局)
```

## 六、关键设计决策

| 决策 | 理由 |
|------|------|
| 不用独立 Game 类 | 30 个文件的小型项目，AppModel + 闭包更轻量 |
| 服务端执行 validateMove | AI SDK 原生 tool calling 比前端 JSON 解析更可靠 |
| 保留 fallback 纯文本路径 | 兼容不支持 tool calling 的模型 |
| 2D DOM + CSS 渲染（无 WebGL） | 性能优先，无 GPU 占用；经典空当接龙风格简洁可读 |
| 增量同步卡牌 DOM（Map<CardId, HTMLElement>） | 避免全量重建，状态变更只增删差异节点 |
| CSS transition 动画 | 无需 JS tween 引擎，浏览器原生加速 |
| innerHTML 模板渲染 | 避免引入框架，减少依赖 |
| 固定卡牌尺寸 56×80px | 跨设备一致观感，坐标计算简单 |
| CORS `*` 始终发送 | 支持用户配置外域代理 URL |

## 七、测试

| 测试文件 | 覆盖 |
|---------|------|
| `handAnalyzer.test.ts` | 13 种牌型正反例 |
| `compare.test.ts` | 牌型比较、炸弹、火箭 |
| `decisionLoop.ai.test.ts` | Mock LLM 的有效/无效/重试/判负 |
| `response-parser.test.ts` | JSON 解析（正常/异常/Markdown 包裹） |

## 八、调试技巧

- **Mock AI 模式**: URL 加 `?mockAi=1`，无需 LLM key，AI 自动出合法牌
- **查看 prompt**: 浏览器 DevTools Network 标签，筛选 `/api/llm` 请求
- **检查状态**: 控制台执行 `model.state` 可查看当前 GameState
- **清除密钥**: 控制台执行 `settingsStore.clearSavedKeys()`
