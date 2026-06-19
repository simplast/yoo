# Plan 004: Modularize the Breakout game file

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 6782e71..HEAD -- public/games/breakout/`
> If any file under `public/games/breakout/` changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: 001, 002, 003
- **Category**: tech-debt
- **Planned at**: commit `6782e71`, 2026-06-19

## Why this matters

`public/games/breakout/index.html` is a 1345-line file that mixes configuration, audio synthesis, state management, input handling, physics, rendering, and the game loop. This makes it hard to test, review, and extend. The file already shows symptoms: dead variables (`gameSpeedIdx`, `shiftPressed`, `brickHitThisFrame`), an empty `mouseleave` handler, and duplicated scoring logic. Splitting it into small ES modules makes each concern independently understandable and reduces the chance that new features reintroduce the same bugs.

## Current state

- `public/games/breakout/index.html` — a single self-contained HTML file with inline CSS and a large inline `<script>`.
- `package.json` shows the project uses Astro; `public/` is copied as static assets, so relative ES module imports will work when served by `npm run dev`, `npm run preview`, or Cloudflare Pages.
- No test framework exists for the game.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm install` | exit 0 |
| Build | `npm run build` | exit 0 |
| Dev smoke test | `npm run dev` | server starts, game loads at `http://localhost:4321/games/breakout/` |

## Scope

**In scope**:
- `public/games/breakout/index.html`
- New files under `public/games/breakout/js/`:
  - `config.js` — constants, color tables, power-up definitions
  - `audio.js` — AudioContext wrapper, `beep`, `SND`, music/drone functions
  - `state.js` — global game state, entities, and pure helpers (clamp, randInt, etc.)
  - `input.js` — keyboard, mouse, touch listeners
  - `entities.js` — ball, brick, particle, popup, ring creation/update helpers
  - `game.js` — `update()`, `draw()`, `loop()`, and the main entry initialization

**Out of scope**:
- Any behavior change. The refactor must be behavior-preserving.
- Any change to the blog (`src/`) or site navigation.
- Moving the CSS out of `index.html` (optional future plan).

## Git workflow

- Branch: `advisor/004-modularize-breakout-game`
- Commit per extracted module, e.g. `refactor(breakout): extract audio module`
- Do NOT push unless instructed.

## Steps

### Step 1: Create the module directory

Create `public/games/breakout/js/`.

**Verify**: `ls public/games/breakout/js` → directory exists and is empty.

### Step 2: Extract configuration

Move the `CFG` object, `ROW_COLORS`, `ROW_SCORES`, `GOLD_COLOR`, `GOLD_SCORE`, `LEVEL_THEMES`, `PU_TYPES`, and helper `getLevelTheme` into `js/config.js`.

- Export `CFG` and the tables as named exports.
- `getLevelTheme` must close over `level`. Since `level` is game state, either pass `level` as an argument (`getLevelTheme(level)`) or move `getLevelTheme` to `state.js`/`game.js`. Recommended: change signature to `export function getLevelTheme(level)`.
- Update `buildBricks` callers accordingly.

**Verify**:
- `grep -n "const CFG" public/games/breakout/index.html` → no match.
- `grep -n "export const CFG" public/games/breakout/js/config.js` → match.
- `npm run build` → exit 0.

### Step 3: Extract audio

Move `AudioCtx`, `audioCtx`, `initAudio`, `beep`, `SND`, the music/drone oscillator state, and all music functions into `js/audio.js`.

- Export `initAudio`, `SND`, `startMusic`, `stopMusic`, and any state references that `game.js` needs to read (e.g., `audioCtx`, `droneGain`).
- Keep the audio module self-contained; it should import nothing from other modules.

**Verify**:
- `grep -n "function beep\|function startMusic\|function stopMusic" public/games/breakout/index.html` → no matches.
- `npm run build` → exit 0.

### Step 4: Extract state and helpers

Move pure helpers (`clamp`, `randInt`, `randFloat`, `triggerShake`, `triggerFlash`, `addPopup`) and the global state variables (`state`, `score`, `lives`, `level`, etc.) into `js/state.js`.

- Use named exports. Avoid exporting mutable objects that encourage cross-module writes; for now, exporting the state object(s) is acceptable because this is a behavior-preserving refactor.
- Keep `pad`, `balls`, `bricks`, `powerups`, etc. in this module.

**Verify**:
- `grep -n "let state =" public/games/breakout/index.html` → no match.
- `npm run build` → exit 0.

### Step 5: Extract input handling

Move all keyboard, mouse, and touch listeners and related state (`keys`, `mouseX`, `useKeyboard`, `isTouching`, etc.) into `js/input.js`.

- The module needs to import `state` and functions like `initAudio`, `startGame`, `launchBall` from other modules. This creates a dependency cycle: `input.js` → `game.js`/`state.js` and `game.js` reads input state from `input.js`.
- Resolve the cycle by keeping input state in `state.js` and only the event listeners in `input.js`, or by making `input.js` export an `initInput()` function that `game.js` calls and passes callbacks (`onStart`, `onLaunch`, etc.). Recommended: callbacks approach.

**Verify**:
- `grep -n "addEventListener('keydown'\|addEventListener('touchstart'" public/games/breakout/index.html` → no matches.
- `npm run build` → exit 0.

### Step 6: Extract entity helpers

Move `createBall`, `getBaseSpeed`, `resetBall`, `launchBall`, `buildBricks`, `spawnParticles`, `applyPowerUp`, and entity update functions (`updateParticles`, `updatePopups`, `updateBrickEnterAnim`) into `js/entities.js`.

- Import needed config and state.
- Keep collision helper `ballRectCollide` here or in a separate `physics.js` if it grows.

**Verify**:
- `grep -n "function buildBricks\|function createBall\|function applyPowerUp" public/games/breakout/index.html` → no matches.
- `npm run build` → exit 0.

### Step 7: Extract the game loop

Move `update()`, `draw()`, `drawPixelRect`, `drawBrickStyle`, `drawText`, `drawPixelHeart`, `drawOverlay`, and `loop()` into `js/game.js`.

- `index.html` becomes a thin shell: canvas element, inline CSS, and `<script type="module" src="js/game.js"></script>`.
- `game.js` imports from the other modules and starts the loop.

**Verify**:
- `public/games/breakout/index.html` no longer contains a `<script>` block longer than a few lines.
- `npm run build` → exit 0.

### Step 8: Smoke test behavior

Run the dev server and play through:
1. Start screen → start game.
2. Launch ball, break bricks, collect power-ups.
3. Lose a life, lose the game, restart.
4. Clear a level.
5. Verify no console errors and no visual/audio regressions.

**Verify**: `npm run dev` starts without error and the game is playable.

## Test plan

- No automated test framework exists. The verification is a full manual smoke test.
- Because this is a behavior-preserving refactor, the smoke test should cover the same paths as before:
  - Start / pause / resume / game over / restart.
  - Mouse, keyboard, and touch input.
  - All power-up types.
  - Bomb and gold bricks.
  - Level clear transition.

## Done criteria

- [ ] `public/games/breakout/js/` contains `config.js`, `audio.js`, `state.js`, `input.js`, `entities.js`, and `game.js`.
- [ ] `index.html` is reduced to markup, CSS, and a module script tag.
- [ ] `npm run build` exits 0.
- [ ] The game is playable at `/games/breakout/` with no console errors.
- [ ] Game behavior matches the pre-refactor version (no new features, no removed features).
- [ ] `plans/README.md` status row updated to DONE.

## STOP conditions

Stop and report back if:
- Any step's verification fails twice.
- The game behavior changes in any noticeable way after a module extraction.
- A circular import causes a runtime error.
- You find yourself changing game logic (not just moving code) to make the refactor work.

## Maintenance notes

- Opening `index.html` directly from the filesystem (`file://`) will not work after this change because ES modules require a same-origin server. This is acceptable because the game is deployed via Astro/Cloudflare Pages and accessed through `npm run dev`/`preview`.
- Future features should be added to the appropriate module instead of expanding `index.html` again.
- Consider extracting the inline CSS to `style.css` in a follow-up plan.
