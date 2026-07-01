# AI 斗地主 · 空当接龙

TypeScript + Vite browser game, 2D DOM + CSS rendering (经典空当接龙风格, performance-first). Built output goes to `../../public/games/doudizhu-ai/` and is ignored by git.

Read `docs/understanding.md` for the full module walkthrough and dataflow diagrams.

## Commands

```bash
npm install
npm run dev          # http://localhost:5173 (?mockAi=1 for local-only testing)
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run build        # → ../../public/games/doudizhu-ai/
```

## Architecture

```
src/rules/   → pure TS Doudizhu rules. No DOM / network imports.
src/game/    → state.ts (new round) + turnFlow.ts (apply moves, advance turns).
src/ai/      → personas → promptBuilder → llmClient → responseParser → decisionLoop.
               decisionLoop prefers AI SDK toolResult; falls back to JSON parse + local validateMove.
src/render/  → 2D DOM + CSS scene (Scene → cardDom + layout). Classic FreeCell-style cards.
src/ui/      → DOM HUD (ConfigPanel / Toast / SettlementModal), no framework.
src/storage/ → settingsStore: API keys persisted only after explicit opt-in.
```

## Key Facts

- **2D 渲染** (`src/render/`): DOM + CSS, 无 WebGL。每张牌一个 `<div>`, 用 `Map<CardId, HTMLElement>` 增量同步。经典空当接龙扑克牌外观（白底、红黑花色、圆角）。布局为列式堆叠：AI 牌背竖排、中央出牌区横排、真人底部手牌横排（选中上浮）。
- **LLM proxy** (`functions/api/llm.ts`): Vercel AI SDK + `@ai-sdk/openai` + `zod`. `validateMove` runs **server-side** as an AI SDK tool. Both providers use `createOpenAI()` with different `baseURL`.
- **validateMove** is the single source of truth for rule enforcement.
- **No `Game` class** — `main.ts` uses `AppModel` + closures for orchestration.
- **Mock AI**: append `?mockAi=1` to dev URL to play without LLM keys.
- **CORS**: `Access-Control-Allow-Origin: *` is always sent (supports custom proxy URLs).
- **AI retry**: 3 invalid responses → forced loss for that AI's side. Auth/config errors pause instead.
- **Phase names** are kebab-case: `awaiting-human`, `requesting-llm`, `paused-for-config` etc.
