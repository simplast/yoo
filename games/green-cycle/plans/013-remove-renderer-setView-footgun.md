# Plan 013: Make Renderer.setView maintain camera invariants or remove it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 329df77..HEAD -- src/render/Renderer.ts src/game/Game.ts src/input/InputManager.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (method has zero current callers; fix is either deletion or making it safe)
- **Depends on**: none
- **Category**: bug (latent footgun)
- **Planned at**: commit `329df77`, 2026-06-22

## Why this matters

`Renderer.setView(offsetX, offsetY, scale)` directly writes `this.offsetX`,
`this.offsetY`, `this.scale` without updating `this.camX`, `this.camY`,
`this.camZoom`, and without calling `recomputeTransform()`. After the
camera refactor in commit `329df77`, all camera control goes through
`setCamera`/`zoomAt`/`resetCamera`, which maintain the invariant that
`camX/camY/camZoom` match the derived `offsetX/offsetY/scale`. If any
future code calls `setView` (it's public, and its doc comment says "由
Game 同步给 InputManager 做坐标转换"), the next camera operation will
compute from a stale `camX/camY/camZoom` and produce a visible jump.

Code search confirms no callers in the current codebase (`grep -rn
"renderer.setView" src/` returns nothing); `InputManager.setView` is a
separate method on InputManager and is what Game actually uses. So this
is dead public API that's a footgun, not an active bug.

## Current state

`src/render/Renderer.ts:148-153`:

```ts
/** 设置视图变换参数（由 Game 同步给 InputManager 做坐标转换） */
setView(offsetX: number, offsetY: number, scale: number): void {
  this.offsetX = offsetX;
  this.offsetY = offsetY;
  this.scale = scale;
}
```

This sits between `resetCamera()` and `getView()`. The comment is
misleading: Game does NOT sync view via Renderer.setView; it calls
`InputManager.setView` (separate class) with values from
`renderer.getView()`.

Searches for callers:

```
$ grep -rn "\.setView(" src/ --include="*.ts"
src/game/Game.ts:266:    input.setView(v.offsetX, v.offsetY, v.scale);
src/game/Game.ts:649:    this.input.setView(v.offsetX, v.offsetY, v.scale);
src/input/InputManager.ts:140:setView(offsetX: number, offsetY: number, scale: number): void {
```

No `renderer.setView(` calls anywhere.

## Commands you will need

| Purpose      | Command                 | Expected on success           |
|--------------|-------------------------|-------------------------------|
| Search       | `grep -rn "renderer.setView\|\.setView(" src/` | no renderer.setView callers after fix |
| Typecheck    | `npm run typecheck`     | exit 0                        |
| Tests        | `npm test`              | all pass                      |
| Lint         | `npm run lint`          | exit 0                        |

## Scope

**In scope**:

- `src/render/Renderer.ts` — remove `setView` method (preferred) or make
  it recompute cam state from provided offset/scale.

**Out of scope**:

- InputManager.setView (different class, works correctly).
- Any change to Game.ts (no callers to remove).
- Any other Renderer refactoring.

## Git workflow

- Branch: `advisor/013-remove-renderer-setView`
- Commit: `refactor(green-cycle): remove unused Renderer.setView footgun`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Delete the setView method (preferred approach)

Delete lines 148-153 of `src/render/Renderer.ts` (the entire method
including its JSDoc comment). Do not delete or modify `getView()` or any
other method.

Why delete instead of fix:

- Zero callers today.
- The method's intended use ("Game syncs to InputManager") is already
  served by `getView()` + `input.setView()`.
- Making it maintain camera invariants would require inverting the
  transform (recovering camX/camY/camZoom from offset/scale), which is
  possible but non-trivial and YAGNI.

If for some reason a future feature needs it, it can be reintroduced
with correct semantics (e.g., `applyTransform(offset, scale)` that
recomputes camX/camY from the inverse transform).

**Verify**:
```
grep -rn "renderer.setView" src/
```
→ no matches.
```
npm run typecheck && npm run lint && npm test
```
→ all pass.

### Step 2 (alternative): If you believe the method has value, fix it instead

If you find that deleting the method breaks something the drift check
didn't surface (e.g., a plugin/debug tool calls it via `any` cast), then
keep the method but have it recompute camera state from the provided
offset/scale:

```ts
/**
 * 直接设置视图变换参数（从外部源恢复视图时使用）。
 * 会根据传入的 offset/scale 反推 camX/camY/camZoom 并保持边界夹紧。
 * 注意：日常相机操作应使用 setCamera/zoomAt/resetCamera，而非此方法。
 */
setView(offsetX: number, offsetY: number, scale: number): void {
  // 反解 camZoom = scale / fitScale
  // 反解 camX = (cw/2 - offsetX) / scale
  // 反解 camY = (ch/2 - offsetY) / scale
  // 然后通过 recomputeTransform 重新夹紧
  this.camZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale / this.fitScale));
  // 反推后走 recomputeTransform 完成边界夹紧（recomputeTransform 会
  // 用 clamp 后的 ox/oy 回写 camX/camY，所以这里只给初始估计）
  const cw = this.canvas.width;
  const ch = this.canvas.height;
  const viewScale = this.fitScale * this.camZoom;
  this.camX = (cw / 2 - offsetX) / viewScale;
  this.camY = (ch / 2 - offsetY) / viewScale;
  this.recomputeTransform();
}
```

Only take this alternative if step 1 breaks something; otherwise prefer
deletion.

**Verify**: same as step 1.

## Test plan

No new tests. The method has no callers, and `getView()` (the companion
accessor) is unchanged and is exercised by `Game.updateCamera` every
frame. Manual sanity:

1. `npm run dev`, start a game.
2. Zoom with wheel, pan with middle drag.
3. Confirm camera still works (no console errors, no jump on first zoom).

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` passes
- [ ] `npm run format:check` passes
- [ ] `grep -n "setView" src/render/Renderer.ts` returns nothing (or returns
      a fixed version per Step 2 with a clear doc comment)
- [ ] Camera still works manually (zoom/pan/reset on new game)
- [ ] Only `src/render/Renderer.ts` is modified (plus any format-only
      changes, which should be none)
- [ ] `plans/README.md` status row updated

## STOP conditions

- If deleting setView causes typecheck failures because something
  references it that `grep` missed (e.g., bracket access, `as any`
  callsite, or reflection-like code), take Step 2 instead.
- If Step 2's fix causes camera jumps when called from existing code
  (it shouldn't — there are no callers), revert to Step 1 and report.

## Maintenance notes

- If any future feature needs to teleport/restore the camera (e.g.,
  saved camera bookmarks, follow-selected-tower mode), implement that
  as a dedicated method on top of `setCamera`/`zoomAt`, not by
  bypassing the camera state and writing offsets directly.
- Keep the invariant: all public Renderer methods that change the view
  must either call `recomputeTransform()` or update camX/camY/camZoom
  together — never write offset/scale directly without recomputing.
