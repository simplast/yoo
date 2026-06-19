# Plan 001: Remove dead speed toggle from Breakout

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 6782e71..HEAD -- public/games/breakout/index.html`
> If `index.html` changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `6782e71`, 2026-06-19

## Why this matters

The `Shift` key currently does two things: it cycles an unused `gameSpeedIdx` through `CFG.GAME_SPEEDS`, and it activates boost mode. The speed index is never read, so the speed toggle has no player-visible effect. This dead state is confusing for maintenance and creates a surprising control where one key performs two unrelated actions.

## Current state

- `public/games/breakout/index.html` — the only file to change.
- Relevant excerpts today:
  - Line 60 defines the unused list: `GAME_SPEEDS: [1, 1.5, 2],`
  - Line 168 declares the dead state: `let gameSpeedIdx=0;`
  - Line 453 declares a helper only for the dead toggle: `let shiftPressed=false;`
  - Lines 457–462 toggle the speed index when Shift is pressed:
    ```js
    if(e.key==='Shift'&&!shiftPressed){
      shiftPressed=true;
      if(state==='PLAYING'||state==='PAUSED'){
        gameSpeedIdx=(gameSpeedIdx+1)%CFG.GAME_SPEEDS.length;
        speedPopupTimer=1.0;
      }
    }
    ```
  - Line 472 resets the helper: `if(e.key==='Shift')shiftPressed=false;`
  - Lines 624–626 still use Shift for boost (this must keep working):
    ```js
    const kbBoost=keys['Shift'];
    if(kbBoost&&boostEnergy>0){boostMode=true;}
    ```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Build | `npm run build` | exit 0 |
| Verify removal | `grep -n "GAME_SPEEDS\|gameSpeedIdx\|shiftPressed" public/games/breakout/index.html` | no matches |

## Scope

**In scope**:
- `public/games/breakout/index.html`

**Out of scope**:
- Any behavior change to boost mode.
- Any other files in the repo.

## Git workflow

- Branch: `advisor/001-remove-dead-speed-toggle`
- Commit message style: match repo, e.g. `fix(breakout): remove dead speed toggle`
- Do NOT push unless instructed.

## Steps

### Step 1: Remove the unused speed configuration

Delete the `GAME_SPEEDS` entry from the `CFG` object.

**Current** (around line 60):
```js
  GAME_SPEEDS: [1, 1.5, 2],
```
**Change**: remove that line.

**Verify**: `grep -n "GAME_SPEEDS" public/games/breakout/index.html` → no output.

### Step 2: Remove the dead state variable

Delete `let gameSpeedIdx=0;`.

**Verify**: `grep -n "gameSpeedIdx" public/games/breakout/index.html` → no output.

### Step 3: Remove the Shift speed-toggle code

Delete the `shiftPressed` declaration, the keydown Shift block, and the keyup Shift reset.

**Current** (around lines 453–473):
```js
let shiftPressed=false; // prevent repeat toggles

document.addEventListener('keydown',e=>{
  keys[e.key]=true;
  if(e.key==='Shift'&&!shiftPressed){
    shiftPressed=true;
    if(state==='PLAYING'||state==='PAUSED'){
      gameSpeedIdx=(gameSpeedIdx+1)%CFG.GAME_SPEEDS.length;
      speedPopupTimer=1.0;
    }
  }
  ...
});
document.addEventListener('keyup',e=>{
  keys[e.key]=false;
  if(e.key==='Shift')shiftPressed=false;
});
```

**Change**: keep the keydown/keyup listeners, but remove only:
- `let shiftPressed=false;`
- the entire `if(e.key==='Shift'&&!shiftPressed){...}` block
- the `if(e.key==='Shift')shiftPressed=false;` line

The remaining keydown listener must still handle START/GAME_OVER/PAUSED/launch logic.

**Verify**: `grep -n "shiftPressed" public/games/breakout/index.html` → no output.

### Step 4: Build and smoke test

Run the Astro build and a quick manual check.

**Verify**: `npm run build` → exit 0.

**Manual check** (use `npm run dev` or open the built file):
1. Start the game.
2. Press and hold Shift.
3. Expected: boost energy bar drains, paddle glows orange, ball speeds up. No console errors.

## Test plan

- No automated test framework exists for the game. Verify by manual keyboard play.
- Regression cases:
  - Shift still activates boost.
  - Space/ArrowUp still launches the ball.
  - P/Escape still pauses.

## Done criteria

- [ ] `grep -n "GAME_SPEEDS\|gameSpeedIdx\|shiftPressed" public/games/breakout/index.html` returns no matches.
- [ ] `npm run build` exits 0.
- [ ] Shift key still activates boost mode.
- [ ] `plans/README.md` status row updated to DONE.

## STOP conditions

Stop and report back if:
- The excerpts in "Current state" do not match the live file.
- Removing the Shift block breaks the remaining keydown listener (e.g., syntax error).
- Boost mode stops working after the change.

## Maintenance notes

- If a real speed toggle is added later, use a separate key (e.g., `1`/`2`/`3` or a UI button) and wire the multiplier into the `dt` application in `update()`.
- `speedPopupTimer` can also be removed unless it is used for something else; check before keeping it.
