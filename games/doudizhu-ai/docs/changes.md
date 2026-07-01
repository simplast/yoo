## Change Impact List — 3D AI Doudizhu Game

> Based on `CLAUDE.md` project context and `docs/superpowers/specs/2026-06-30-doudizhu-ai-design.md` requirements analysis.

### New Files

| File Path | Purpose | Key Dependencies |
|-----------|---------|------------------|
| `games/doudizhu-ai/package.json` | Define the Vite game sub-project scripts and dependencies. | Vite, TypeScript, Three.js, Vitest, vite-plugin-singlefile |
| `games/doudizhu-ai/tsconfig.json` | TypeScript config for the game sub-project. | TypeScript |
| `games/doudizhu-ai/vite.config.ts` | Build config that outputs a single-file game to `../../public/games/doudizhu-ai/`. | Vite, vite-plugin-singlefile |
| `games/doudizhu-ai/index.html` | Game host HTML and root containers for Three.js canvas and DOM HUD. | Vite entry script |
| `games/doudizhu-ai/CLAUDE.md` | Game-specific agent guide documenting architecture, commands, and constraints. | Root `CLAUDE.md` |
| `games/doudizhu-ai/src/main.ts` | Game bootstrap: initialize state, renderer, HUD, and turn flow. | `game/state`, `game/turnFlow`, `render/Scene`, `ui/Hud` |
| `games/doudizhu-ai/src/config.ts` | Central constants for providers, models, gameplay defaults, and UI limits. | None |
| `games/doudizhu-ai/src/types.ts` | Shared domain types for players, roles, moves, LLM providers, and UI state. | None |
| `games/doudizhu-ai/src/game/state.ts` | Initial state creation, player setup, landlord assignment, utility functions. | `types.ts`, rules modules |
| `games/doudizhu-ai/src/game/turnFlow.ts` | Applies validated moves, advances turns, handles pass streaks, and ends rounds. | `moveValidator`, `scoring` |
| `games/doudizhu-ai/src/rules/card.ts` | Card IDs, ranks, suits, display labels, ordering, and serialization helpers. | None |
| `games/doudizhu-ai/src/rules/deck.ts` | Create, shuffle, and deal the 54-card deck; assign landlord bottom cards. | `card.ts` |
| `games/doudizhu-ai/src/rules/handAnalyzer.ts` | Identify supported Doudizhu hand patterns. | `card.ts` |
| `games/doudizhu-ai/src/rules/compare.ts` | Compare valid hand patterns and apply bomb/rocket precedence. | `handAnalyzer.ts` |
| `games/doudizhu-ai/src/rules/moveValidator.ts` | Validate play/pass actions against ownership, turn, pattern, and previous move. | `handAnalyzer.ts`, `compare.ts`, `GameState` |
| `games/doudizhu-ai/src/rules/legalMoveGenerator.ts` | Generate AI legal action hints for prompt context and validation retries. | `moveValidator.ts`, `handAnalyzer.ts` |
| `games/doudizhu-ai/src/rules/scoring.ts` | Track multipliers and compute landlord/farmer settlement. | `types.ts` |
| `games/doudizhu-ai/src/ai/personas.ts` | Fixed AI personas: calm mathematical and aggressive pressure style. | `types.ts` |
| `games/doudizhu-ai/src/ai/promptBuilder.ts` | Build system, persona, game-state, and validation-error prompts. | `personas.ts`, rules summaries |
| `games/doudizhu-ai/src/ai/llmClient.ts` | Frontend client for calling the configurable LLM proxy URL. | Browser `fetch` |
| `games/doudizhu-ai/src/ai/responseParser.ts` | Parse strict JSON tool-call responses and validate schema shape. | `types.ts` |
| `games/doudizhu-ai/src/ai/decisionLoop.ts` | Run AI decision attempts, local validation, retry injection, and forced-loss handling. | `llmClient`, `promptBuilder`, `responseParser`, `moveValidator` |
| `games/doudizhu-ai/src/render/Scene.ts` | Initialize Three.js scene, renderer, lights, resize behavior, and render loop. | Three.js |
| `games/doudizhu-ai/src/render/Camera.ts` | Configure fixed cyber hologram table camera. | Three.js |
| `games/doudizhu-ai/src/render/CardMesh.ts` | Create and update 3D card meshes, selection state, and card text/labels. | Three.js, `card.ts` |
| `games/doudizhu-ai/src/render/Table.ts` | Build holographic table, central play area, bottom-card display, and lighting accents. | Three.js |
| `games/doudizhu-ai/src/render/PlayerSeats.ts` | Render three seat positions, active-player rings, hand counts, and AI avatar anchors. | Three.js |
| `games/doudizhu-ai/src/render/animations.ts` | Lightweight tweens for dealing, selecting, playing, bomb/rocket effects, and turn highlights. | Three.js, requestAnimationFrame |
| `games/doudizhu-ai/src/render/three-shim.d.ts` | Hand-written Three.js type shim for the subset of types used. | None |
| `games/doudizhu-ai/src/styles.css` | All DOM HUD styling. | None |
| `games/doudizhu-ai/src/ui/Hud.ts` | DOM HUD controller for buttons, status labels, multiplier, role, and dialogs. | Browser DOM |
| `games/doudizhu-ai/src/ui/ConfigPanel.ts` | Pre-game configuration for two AI providers, models, keys, remember options, and proxy URL. | `settingsStore.ts` |
| `games/doudizhu-ai/src/ui/Toast.ts` | User-facing validation, API, and status messages. | Browser DOM |
| `games/doudizhu-ai/src/ui/SettlementModal.ts` | End-round result, score delta, forced-loss reason, and new-round action. | `scoring.ts` |
| `games/doudizhu-ai/src/storage/settingsStore.ts` | Load/save non-secret settings and optionally save API keys in localStorage only after explicit opt-in. | Browser localStorage |
| `games/doudizhu-ai/tests/handAnalyzer.test.ts` | Unit tests for all supported hand-pattern recognition. | Vitest, rules modules |
| `games/doudizhu-ai/tests/compare.test.ts` | Unit tests for hand comparison, bombs, and rocket precedence. | Vitest, rules modules |
| `games/doudizhu-ai/tests/decisionLoop.ai.test.ts` | Unit tests for AI decision loop with mock LLM client. | Vitest, AI modules |
| `games/doudizhu-ai/tests/response-parser.test.ts` | Unit tests for JSON tool-call response parsing. | Vitest, AI modules |
| `games/doudizhu-ai/src/rules/index.ts` | Barrel re-export for rules module. | Rules modules |
| `games/doudizhu-ai/src/ai/index.ts` | Barrel re-export for AI module. | AI modules |
| `games/doudizhu-ai/src/game/index.ts` | Barrel re-export for game module. | Game modules |
| `functions/api/llm.ts` | Cloudflare Pages Function: Vercel AI SDK proxy that calls DeepSeek/Spark MaaS with native tool calling and server-side `validateMove`. | Cloudflare Pages Functions runtime, `ai`, `@ai-sdk/openai`, `zod` |

### Modified Files

| File Path | Change Type | What Changes | Risk Level |
|-----------|-------------|--------------|------------|
| `package.json` | add | Update `build:games` to build both `games/green-cycle` and `games/doudizhu-ai`; ensure root `npm run build` includes the new game before Astro build. | low |
| `package-lock.json` | add | Reflect root or workspace dependency changes if Three.js/Vitest/vite-plugin-singlefile are installed at the root; avoid unnecessary churn if dependencies are isolated in the game sub-project. | low |
| `.gitignore` | add | Add `public/games/doudizhu-ai/` so generated game output is not committed. Add `.superpowers/` for brainstorming artifacts. | low |
| `src/pages/games/index.astro` | add | Add a new game card for AI 斗地主 with route `/games/doudizhu-ai/`, cyber/AI description, and card-game tag. | low |
| `wrangler.toml` | add | Confirm or adjust Pages Functions compatibility only if required by Cloudflare local/deploy behavior. | medium |
| `docs/superpowers/specs/2026-06-30-doudizhu-ai-design.md` | add | Preserve the approved design spec for implementation reference. | low |

### Deleted Files

| File Path | Reason |
|-----------|--------|
| None | No deletions are required for this feature. |

### API Changes

| Endpoint | Method | Change | Notes |
|----------|--------|--------|-------|
| `/api/llm` | `POST` | New Pages Function endpoint. | Accepts provider, API key, model, messages, temperature, maxTokens, and toolContext; returns normalized success (with optional toolResult) / error shape. Uses Vercel AI SDK with native tool calling. Does not store API keys. |

### Dependency / Config Changes

| Item | Change | Notes |
|------|--------|-------|
| `three` | Add to `games/doudizhu-ai` dependencies. | Required for 3D cyber hologram scene. |
| `vite` | Add or reuse in `games/doudizhu-ai` devDependencies. | Required for game sub-project build/dev server. |
| `typescript` | Add or reuse in `games/doudizhu-ai` devDependencies. | Required for typecheck. |
| `vitest` | Add to `games/doudizhu-ai` devDependencies. | Required for rules-module tests. |
| `vite-plugin-singlefile` | Add or reuse in `games/doudizhu-ai` devDependencies. | Keeps built game as a self-contained static artifact like `green-cycle`. |
| `ai` (Vercel AI SDK) | Root-only dependency for `functions/api/llm.ts`. | Not in game sub-project; used by Pages Function. |
| `@ai-sdk/openai` | Root-only dependency for `functions/api/llm.ts`. | Enables OpenAI-compatible client for both DeepSeek and Spark MaaS. |
| `zod` | Root-only dependency for `functions/api/llm.ts`. | Schema validation for tool input. Not in game sub-project. |
| Cloudflare Pages Functions | Add `functions/api/llm.ts`. | Enables same-site `/api/llm` proxy deployment with Pages. |
| Local storage schema | Add `doudizhu-ai.settings` and optional key fields. | API keys are saved only if the user explicitly opts in. |
