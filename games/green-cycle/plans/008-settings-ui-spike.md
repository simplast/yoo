# Plan 008: Settings UI for volume and quality (design / spike plan)

> **Executor instructions**: This is a **design / spike plan**, not a build-everything plan. The goal is to (a) confirm the data layer is sufficient, (b) prototype the UI surface in 1–2 plausible shapes, and (c) exit with a small follow-up build plan that the operator can choose to schedule. Do not ship a polished settings UI in this plan. When done, update the status row for this plan in `plans/README.md` to `DONE` and link the spike findings inline.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 2fbd773..HEAD -- src/audio/Audio.ts src/types.ts src/utils/SaveManager.ts src/main.ts index.html
> ```
> If the data layer or DOM structure has changed, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S (spike) → M (follow-up build)
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `2fbd773`, 2026-06-21
- **Issue**: (not published)

## Why this matters

The audio and save layers are both **fully prepared** for user-facing settings today — but no UI surfaces them.

- `audio.setVolume(v)` and `audio.setMuted(m)` are complete and runtime-callable ([src/audio/Audio.ts:38-61](file:///Users/doer/dev/yoo/games/green-cycle/src/audio/Audio.ts#L38-L61)).
- `SaveData.settings: { volume: number; quality: 'low' | 'high' }` is part of the persisted shape ([src/types.ts:291-292](file:///Users/doer/dev/yoo/games/green-cycle/src/types.ts#L291-L292)).
- `SaveManager.getDefault()` seeds `volume: 1, quality: 'high'` ([src/utils/SaveManager.ts:66-74](file:///Users/doer/dev/yoo/games/green-cycle/src/utils/SaveManager.ts#L66-L74)).
- The `audio.volume` field is **not** wired to `SaveData.settings.volume` anywhere in the code: on `init`, `Game` calls `audio.init()` and `audio.resume()` but never `audio.setVolume(this.saveData.settings.volume)`. So the persisted volume is loaded but ignored; the user has no way to change it from inside the game; and on a fresh start it is `0.5` (the field default in `Audio.ts:11`) rather than the `1` in the save default.

This is a **stale-but-undelivered** state ([reference](file:///Users/doer/.trae-cn/skills/improve/references/audit-playbook.md) — "Stated-but-undelivered: README/docs/roadmap promises with no corresponding code"). The data layer says one thing, the runtime does another, and the player has no recourse. This plan does not build the UI; it (1) wires the existing field so the gap stops being silent, (2) prototypes the UI shape in 1–2 directions, and (3) hands off a tight build plan for the operator to schedule.

## Current state

- **Files and roles**:
  - `src/audio/Audio.ts` — singleton `audio`. Internal defaults: `volume: 0.5`, `muted: false`. Public API: `init()`, `resume()`, `setVolume(v)`, `setMuted(m)`, plus the play methods. No `applySettings()` aggregator.
  - `src/utils/SaveManager.ts:43-49` — `SaveManager.save(data)` writes the full `SaveData` object to `localStorage`; `load()` returns `null` for missing or version-mismatched entries and merges with defaults.
  - `src/main.ts:107-109` — the start button click handler calls `game.startGame(selectedDiff, endlessMode)` and does not touch settings.
  - `src/game/Game.ts:146-174` — `startGame` calls `audio.init()` and `audio.resume()` but no `setVolume` / `setMuted`.
  - `src/game/Game.ts:492-498` — `saveProgress` is the only call to `SaveManager.save` in the game layer (called from `recordResult`).
  - `index.html` — single static HTML; the settings hook is in the `#overlay` element which doubles as the start menu and the win/lose screen ([main.ts:111-140](file:///Users/doer/dev/yoo/games/green-cycle/src/main.ts#L111-L140)).
- **SaveData shape** (verified):
  ```typescript
  export interface SaveData {
    version: number;
    settings: { volume: number; quality: 'low' | 'high' };
    unlocks: { difficulties: Difficulty[]; endlessUnlocked: boolean };
    leaderboard: { endless: { wave: number; score: number; date: number }[] };
    bestPf: number;
  }
  ```
- **Repo conventions**:
  - Settings persistence: the `SaveData` shape is the single source of truth; no `localStorage` direct calls outside `SaveManager`. Any new persisted field must be added to `SaveData` and `getDefault()` together, then merged on `load`.
  - DOM wiring: `main.ts:21-70` builds a `UIElements` object that the `Game` constructor consumes; new UI elements follow the same pattern.
  - `quality: 'low' | 'high'` is currently unused at runtime — no code path reads `state.saveData.settings.quality`. The "low" branch (presumably: reduce particle counts, skip non-essential effects) does not exist yet. This plan's spike should propose a concrete low-quality branch before recommending the build.
- **What this plan delivers vs. defers**:
  - Delivers: runtime wire (`audio.setVolume`/`setMuted` on start), UI prototype (1–2 mockup sketches in this file), and a 1-screen UI spec ready to be turned into a follow-up build plan.
  - Defers: production settings UI, `quality: 'low'` runtime branch, M-key keyboard binding for mute, save-migration of the existing `version: 1` save (since `version` is unchanged, no migration is needed; flag this in the follow-up).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test -- --run SaveManager` | all pass |
| Lint | `npm run lint` | exit 0 |
| Format | `npm run format:check` | exit 0 |

## Suggested executor toolkit

- A `use brainstorming` skill is **not** required here — the spike is well-bounded.
- Read [src/audio/Audio.ts](file:///Users/doer/dev/yoo/games/green-cycle/src/audio/Audio.ts) (full file) and [src/main.ts](file:///Users/doer/dev/yoo/games/green-cycle/src/main.ts) (lines 1-180) before writing the prototype sketches; the spike must respect the existing single-canvas / overlay DOM pattern.

## Scope

**In scope** (the only files you may modify in this plan):
- `src/audio/Audio.ts` — add a `applySettings(settings: { volume: number; muted?: boolean })` helper that calls `setVolume` and `setMuted`
- `src/game/Game.ts` — call `audio.applySettings(this.saveData.settings)` in `startGame`
- `plans/008b-settings-ui-build.md` — write the follow-up build plan based on spike findings (this is a **plan file**, not source code)
- `plans/README.md` — add a one-line status for plan 008b (TODO) and link to it from the dependency table

**Out of scope** (do NOT touch in this plan):
- `index.html` — UI implementation is plan-008b's work
- `src/main.ts` — UI binding is plan-008b's work
- `src/utils/SaveManager.ts` — the shape and merge logic are correct
- `src/render/*` — the `quality: 'low'` runtime branch is plan-008b's work
- `src/types.ts` — no shape change needed
- `src/game/State.ts` — settings live on `SaveData`, not `GameState`; do not migrate

## Git workflow

- Branch: `advisor/008-settings-ui-spike`
- Two commits. Conventional commits:
  - `chore(audio): add applySettings helper and wire SaveData.settings.volume on startGame`
  - `docs(plans): add plan-008b for settings UI build, based on 008 spike findings`

## Steps

### Step 1: Add `applySettings` to `Audio.ts`

In [src/audio/Audio.ts:8-12](file:///Users/doer/dev/yoo/games/green-cycle/src/audio/Audio.ts#L8-L12), the class already has `setVolume` and `setMuted` (lines 38-61). Add a thin aggregator that the rest of the game can call without knowing the internals. Place it after `setMuted` (after line 61) so the public API stays grouped.

```typescript
/**
 * 应用持久化设置（在 startGame 入口调用一次，确保 audio 启动后立即符合用户偏好）
 * - volume 范围 [0, 1]
 * - muted 为可选；若未提供则保持当前静音状态
 */
applySettings(settings: { volume: number; muted?: boolean }): void {
  this.setVolume(settings.volume);
  if (settings.muted !== undefined) {
    this.setMuted(settings.muted);
  }
}
```

Notes for the executor:
- `setVolume` already clamps to `[0, 1]` and short-circuits if `masterGain` is null (Audio.ts:38-47); no additional guarding needed.
- The `muted` field is optional in the helper but not in `SaveData.settings`. That is intentional: today's `SaveData` shape has no `muted` field; the spike sets it up so a future version that adds `muted` to the save shape does not have to revisit this method.

**Verify**: `npm run typecheck` exits 0.

### Step 2: Wire `applySettings` into `startGame`

In [src/game/Game.ts:152-174](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L152-L174), the start method calls `audio.init()` and `audio.resume()`. Add `audio.applySettings(this.saveData.settings)` immediately after `audio.resume()`.

Before:

```typescript
startGame(difficulty: Difficulty, endless = false) {
  audio.init();
  audio.resume();
  resetEntityId();
  // ...
}
```

After:

```typescript
startGame(difficulty: Difficulty, endless = false) {
  audio.init();
  audio.resume();
  audio.applySettings(this.saveData.settings);
  resetEntityId();
  // ...
}
```

Notes for the executor:
- The constructor at [src/game/Game.ts:110-137](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L110-L137) calls `syncUI()` for the menu render. Apply the same call in the constructor so the menu's volume state (if plan-008b adds one) reflects the saved value on first paint:
  - After `this.state = new GameState(path);` add `audio.applySettings(this.saveData.settings);`.
  - The order matters: `audio.applySettings` calls `setVolume` which dereferences `this.masterGain`, which is only created by `audio.init()`. So **also call `audio.init()` once at the top of the constructor** before `applySettings`. Be careful: `audio.init()` requires a user gesture in modern browsers; calling it on constructor is acceptable (it will silently no-op until the first click, exactly as today).
  - Suggested edit to the constructor: insert `audio.init(); audio.applySettings(this.saveData.settings);` near line 119, before `this.state = new GameState(path);`. Then remove the `audio.init()` and `audio.resume()` from `startGame` (lines 153-154) — keep them or keep just `audio.resume()`, whichever is more conservative. Default to: keep both for behavior preservation, since `init()` is idempotent (it short-circuits on second call at [Audio.ts:19](file:///Users/doer/dev/yoo/games/green-cycle/src/audio/Audio.ts#L19)) and `resume()` is what actually unblocks playback.

**Verify**: `npm run typecheck` exits 0; `grep -n "applySettings" src/game/Game.ts` shows 2 matches (constructor + startGame).

### Step 3: Verify runtime + persist

The wire must round-trip: change `saveData.settings.volume`, start a new game, and confirm the audio engine is at the new level. There is no headless hook for "play a sound and read back the level", so this is verified by reading the code, not by an automated test.

- Read [src/audio/Audio.ts:18-32](file:///Users/doer/dev/yoo/games/green-cycle/src/audio/Audio.ts#L18-L32) (`init`) and lines 38-47 (`setVolume`).
- Confirm: `applySettings` is called from the constructor, and again from `startGame`. `setVolume` writes to `this.masterGain.gain`; `setMuted` overrides it to 0 if muted.
- `saveData.settings` is loaded once in the constructor ([Game.ts:112](file:///Users/doer/dev/yoo/games/green-cycle/src/game/Game.ts#L112)); `applySettings` reads from the same instance, so the wire is consistent for the lifetime of the `Game`.

**Verify**: `npm run typecheck` and `npm test -- --run SaveManager` both exit 0. No new test is required for the wire — `SaveManager` is already covered at [src/utils/SaveManager.test.ts](file:///Users/doer/dev/yoo/games/green-cycle/src/utils/SaveManager.test.ts), and the audio runtime is platform-bound (Web Audio API) and exercised by the existing `Game` integration.

### Step 4: Write the spike findings as `plans/008b-settings-ui-build.md`

This is a **plan-in-a-plan**: the spike produces the design doc the operator needs to schedule the actual UI work. The skeleton (write to `plans/008b-settings-ui-build.md`):

```markdown
# Plan 008b: Settings UI build (follow-up to spike 008)

> Generated by plan-008. Treat the design choices in this plan as informed
> by the spike but feel free to override based on playtest feedback. Read
> the "Open questions" section before estimating effort.

## Goal

Surface two settings on the start-menu overlay and let the player change
them at any time:
- Volume (slider 0..1, persisted as `saveData.settings.volume`).
- Quality ('low' | 'high', persisted as `saveData.settings.quality`).

Both fields already exist in `SaveData`; plan-008 wired the volume side to
the audio engine. The build must:

1. Add DOM (slider + select) to `index.html` inside `#overlay`.
2. Bind change handlers in `main.ts` that update `saveData.settings` in
   memory, call `audio.applySettings(...)` for the volume change, and
   call `SaveManager.save(game.getSaveData())` for persistence.
3. Implement the `quality: 'low'` branch in `Renderer`:
   - Skip `drawEffect` for `damageText` (already in a separate pass).
   - Cap particle counts: 4 per effect (vs. 4-6 / 8 / 12 in
     `src/entities/Effect.ts`).
   - Skip `drawBossBar` vignette.
   - Keep gameplay unaffected; only visuals degrade.
4. Add a smoke test for the settings round-trip: change settings in a
   minimal Game harness, call `SaveManager.save`, then `load`, confirm
   the values match.

## Out of scope (this plan)

- M-key keyboard binding for mute.
- Audio balance / per-channel volume.
- Migrating existing v1 saves (no shape change, none needed).

## Open questions for the operator

- **Layout**: side panel on the overlay (preferred; matches the existing
  difficulty / endless / leaderboard stack) vs. a separate "Settings"
  modal triggered by a gear icon. The spike sketches the side panel;
  the modal is a small follow-up if the side panel feels cramped on
  small windows.
- **Defaults**: `volume: 1` is the saved default but `Audio.ts` defaults
  to `0.5`. Plan-008 wired the saved value through on first paint, so
  the mismatch is resolved at runtime. Question for the operator: do we
  want `volume: 0.5` as the saved default for new players (gentler
  intro), or `volume: 1` (existing behavior for any player whose save
  predates this change)? Default recommendation: `1`, matching
  `SaveManager.getDefault()` today.
- **Quality `'low'` behavior**: the spike proposes 3 visual cuts. The
  operator should playtest on a low-end device (or simulate by
  throttling in DevTools) before signing off on the exact set of cuts.
```

When writing this file, populate the design choices with whatever feels right for the repo; the executor of THIS plan (008) is also authoring 008b, so the design tension is resolved at write time.

**Verify**: `plans/008b-settings-ui-build.md` exists and contains the four sections above (Goal, Out of scope, Open questions, plus a brief design sketch of the DOM / binding).

### Step 5: Update `plans/README.md`

Add the new plans (005, 006, 007, 008) to the execution table. The current table at [plans/README.md:7-12](file:///Users/doer/dev/yoo/games/green-cycle/plans/README.md#L7-L12) ends at row 004. Append:

```
| 005  | resetEnemy clears _splitChild so pooled splitters split | P1 | S | — | DONE (this audit) |
| 006  | Restore prettier --check on 6 files | P1 | S | — | DONE (this audit) |
| 007  | Extract resetProjectile factory | P1 | S | — | DONE (this audit) |
| 008  | Settings UI (volume/quality) — spike + wire | P2 | S | — | DONE (this audit) |
```

Then add a one-line entry to the "Dependency notes" section:
- 005, 006, 007 are independent; safe to execute in any order or in parallel.
- 008b (when scheduled) is a follow-up build plan produced by 008's spike; not in the same session.

**Verify**: `grep -n "008" plans/README.md` returns at least 2 matches (one in the table, one in the dependency notes).

## Test plan

- No new test in this plan. The wire is pure (read `SaveData.settings`, call `setVolume`); `SaveManager` is already covered; `Audio` is platform-bound.
- Plan-008b is responsible for the smoke test of the settings round-trip.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test -- --run` exits 0 (no new tests, all 113/115 pass)
- [ ] `npm run format:check` exits 0
- [ ] `grep -n "applySettings" src/audio/Audio.ts src/game/Game.ts` shows ≥ 1 match in each file (1 in Audio = the new method; ≥ 1 in Game = the constructor + startGame call)
- [ ] `plans/008b-settings-ui-build.md` exists and contains the four sections (Goal, Out of scope, Open questions, plus a design sketch)
- [ ] `plans/README.md` has rows 005-008 added to the execution table
- [ ] Only `src/audio/Audio.ts`, `src/game/Game.ts`, `plans/008b-settings-ui-build.md`, `plans/README.md` are modified (verify with `git status`)

## STOP conditions

Stop and report back (do not improvise) if:
- The data layer drift check shows changes to `SaveData` or `SaveManager` since this plan was written. The wire is shape-dependent; re-derive the call site.
- `audio.setVolume` is no longer idempotent or its clamping behavior changed.
- The "open questions" in plan-008b expand to 5+ items; that means the design is under-baked and 008b should be re-scoped as a separate spike.
- A reasonable answer to "where in the DOM does the slider live?" is not forthcoming from the existing overlay structure. If `#overlay` does not have room for two new controls without breaking the start menu, escalate before building.

## Maintenance notes

- The `Audio.applySettings` aggregator is the only runtime consumer of `SaveData.settings` for now. When plan-008b adds a UI for `quality`, the same aggregator should grow a `quality` branch (no-op for now, hook for plan-008b to register the visual cuts).
- The split between "spike" (this plan) and "build" (008b) is intentional: the spike keeps the data-layer wire in scope and defers UI until a design decision is made. Future similar "data ready, UI missing" findings should follow the same shape: minimal wire + a handoff plan, not a one-shot UI build.
- Deferred follow-ups (out of this plan):
  - M-key / keyboard binding for mute is a small follow-up that can land with plan-008b or as a one-line addition later.
  - Save-migration: the current `SAVE_VERSION = 1` ([SaveManager.ts:6](file:///Users/doer/dev/yoo/games/green-cycle/src/utils/SaveManager.ts#L6)) is unchanged by this plan; no migration is needed. If plan-008b adds new persisted fields, bump the version and add a migration path.
  - The `quality: 'low'` runtime branch is not implemented in this plan. Plan-008b owns it; until then, the `quality` field is dead weight in `SaveData`. A reviewer on this plan should flag (not block) that fact in the PR.
