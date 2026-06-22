# Plan 010: Reset camera when starting a new game

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 329df77..HEAD -- src/game/Game.ts src/render/Renderer.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (one-line call addition + verification)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `329df77`, 2026-06-22

## Why this matters

Commit `329df77` added camera zoom/pan (mouse-wheel zoom anchored at cursor,
middle-drag pan) but did not wire `resetCamera()` into the game lifecycle.
`Renderer.resetCamera()` exists and correctly returns the camera to
`camZoom=1, camX=camY=world center` (letterbox-fitted), but nothing calls it:
not `startGame()`, not when returning to the overlay menu. If a player zooms
in during a game, dies or wins, then clicks "再来一局" (new game), the next
game starts at the previous zoom/pan position — disorienting and inconsistent
with the fact that state/enemies/towers are all reset.

## Current state

- `src/render/Renderer.ts:141-146` defines `resetCamera()`:
  ```ts
  resetCamera(): void {
    this.camZoom = MIN_ZOOM;
    this.camX = CONFIG.WORLD_WIDTH / 2;
    this.camY = CONFIG.WORLD_HEIGHT / 2;
    this.recomputeTransform();
  }
  ```
- `src/game/Game.ts:155-180` `startGame()` resets state, pools, speed, build
  cells, overlays, and calls `syncUI()`/`syncTowerPanel()` but never calls
  `this.renderer.resetCamera()`.
- The overlay-menu transition (won/lost → menu, lines 802-820) also does
  not reset camera. It's better to reset on `startGame` (when new game
  begins) rather than on death/win (so the player can still see their
  defeat up close) — consistent with other reset actions (pool release,
  entityId reset) all happening in `startGame`.

## Commands you will need

| Purpose      | Command                        | Expected on success           |
|--------------|--------------------------------|-------------------------------|
| Typecheck    | `npm run typecheck`            | exit 0                        |
| Tests        | `npm test`                     | all pass                      |
| Lint         | `npm run lint`                 | exit 0                        |
| Format check | `npm run format:check`         | all formatted                 |

## Scope

**In scope**:

- `src/game/Game.ts` — one-line addition in `startGame()`

**Out of scope**:

- No new keybindings for manual camera reset (that's a direction/DX
  enhancement, not a bug fix; see D1 in audit findings).
- No changes to Renderer.ts.
- No changes to InputManager.
- No changes to game state / balance.

## Git workflow

- Branch: `advisor/010-camera-reset`
- Commit: `fix(green-cycle): reset camera to default when starting a new game`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Invoke resetCamera in startGame

In `src/game/Game.ts`, inside `startGame()` (after the existing resets and
before/after `render()` would normally run — i.e. during the next frame's
render call it will pick up the new transform). Place the call right after
`this.state.initDifficulty(difficulty, endless)` and before
`this.state.phase = 'battling'`, alongside the other state resets:

```ts
this.state.initDifficulty(difficulty, endless);
this.renderer.resetCamera(); // 新游戏恢复默认视角
this.state.phase = 'battling';
```

Placing it here ensures that when the next frame renders (update() runs
render() at line 230), the camera is already at identity and the first
frame of gameplay is letterbox-centered, matching how the game looked on
first page load.

**Verify**: `npm run typecheck && npm run lint` → both exit 0.

### Step 2: Sanity test that resetCamera affects InputManager's world-coordinate conversion

The next call to `updateCamera()` (line 206 in update, running every frame)
will pull fresh offset/scale via `renderer.getView()` and call
`input.setView(...)`, so mouse world coordinates will correctly align with
the reset camera. No additional wiring is required. Confirm by reading
`updateCamera`: lines 264-266 sync the latest view to input every frame.

**Verify**: `npm test` → all tests pass.

## Test plan

This is a one-line wiring fix. No unit tests needed (Renderer/InputManager
are DOM-coupled and per existing convention not unit-tested, as documented
in plans/README.md "considered and rejected"). Manual verification
sufficient:

1. `npm run dev`, start a game.
2. Scroll wheel to zoom in, middle-drag to pan off-center.
3. Let enemies overrun pressure cap (or use debug cheat) to trigger game over.
4. Click "再来一局" → camera should be zoomed-out, centered on the world.
5. Start another game, zoom in again, win via cheat (or lose), click new
   game again → camera resets consistently.

If you can't run a dev server, rely on code reading: confirm
`resetCamera()` is called from `startGame()` before the first frame of the
new game renders, and that `updateCamera()` syncs the reset view to
InputManager on the next frame.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run format:check` passes
- [ ] `npm test` exits 0
- [ ] `grep -n "resetCamera" src/game/Game.ts` shows the call inside
      `startGame()`
- [ ] Only `src/game/Game.ts` is modified (`git status --porcelain`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- If adding the resetCamera call breaks existing tests (unlikely — tests
  don't exercise rendering), report which tests fail.
- If `startGame()` is called before the Renderer is constructed (check
  Game constructor ordering); if so move the call to right after
  `this.renderer` is assigned and report in PR.

## Maintenance notes

- If a "reset camera" hotkey (`F`/`Home`) is added later (direction
  finding D1), it should also call `this.renderer.resetCamera()` followed
  by `this.input.setView(...)` — same as startGame does implicitly via
  updateCamera().
- The camera starts at identity because Renderer's field initializers set
  `camX=WORLD_WIDTH/2`, `camY=WORLD_HEIGHT/2`, `camZoom=1`, and
  `resize()` calls `recomputeTransform()` on startup — so first-load camera
  is correct without an explicit resetCamera() call.
