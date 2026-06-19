# Plan 002: Fix heartbeat timer leak on game over / level clear

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

When a ball enters the danger zone, a low-health heartbeat timer starts beeping every 800 ms. These timers are only cleaned up when the ball recovers, is destroyed, or `startGame()` runs. On `GAME_OVER` and `LEVEL_CLEAR`, the music and drone are stopped but the heartbeat timers are not, so the beeping continues during the end/transition screens.

## Current state

- `public/games/breakout/index.html` — the only file to change.
- Relevant excerpts today:
  - Lines 442–443 already clear timers in `startGame`:
    ```js
    ballHeartbeatTimers.forEach(hb=>clearInterval(hb.id));
    ballHeartbeatTimers=[];
    ```
  - Lines 877–882 create timers inside `update()`:
    ```js
    if(ballHeartbeatTimers.length<3){
      const id=setInterval(()=>{
        if(audioCtx) beep(60,0.1,0.03,'triangle');
      },800);
      ballHeartbeatTimers.push({id,b});
    }
    ```
  - Lines 888–898 clean up only on ball recovery or destruction:
    ```js
    for(let i=ballHeartbeatTimers.length-1;i>=0;i--){
      const hb=ballHeartbeatTimers[i];
      const exists=balls.includes(hb.b);
      if(!exists){
        clearInterval(hb.id); ballHeartbeatTimers.splice(i,1);
      } else if(hb.b.vy<0){
        clearInterval(hb.id); ballHeartbeatTimers.splice(i,1);
        hb.b._hbTriggered=false;
      }
    }
    ```
  - Lines 816–821 handle `GAME_OVER` but do not clear heartbeat timers:
    ```js
    if(lives<=0){
      state='GAME_OVER';
      if(score>highScore){highScore=score;localStorage.setItem('breakout_hi',String(highScore));}
      if(droneOsc){try{droneOsc.stop();droneOsc=null;droneGain=null;}catch(e){}}
      stopMusic();
    }
    ```
  - Line 614 handles `LEVEL_CLEAR` but does not clear heartbeat timers either:
    ```js
    if(levelClearTimer<=0){level++;particles=[];popups=[];initLevel();state='PLAYING';}
    ```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Build | `npm run build` | exit 0 |
| Verify helper | `grep -n "clearBallHeartbeats" public/games/breakout/index.html` | shows the helper definition and at least three calls |

## Scope

**In scope**:
- `public/games/breakout/index.html`

**Out of scope**:
- Any other audio cleanup logic.
- Any other files in the repo.

## Git workflow

- Branch: `advisor/002-fix-heartbeat-timer-leak`
- Commit message style: `fix(breakout): clear heartbeat timers on game over and level clear`
- Do NOT push unless instructed.

## Steps

### Step 1: Add a helper to clear all heartbeat timers

Add a small helper near the existing heartbeat timer code (around line 872).

**Add before the existing heartbeat logic**:
```js
function clearBallHeartbeats(){
  ballHeartbeatTimers.forEach(hb=>clearInterval(hb.id));
  ballHeartbeatTimers=[];
}
```

**Verify**: `grep -n "function clearBallHeartbeats" public/games/breakout/index.html` → shows the helper.

### Step 2: Replace the inline cleanup in startGame with the helper

**Current** (lines 442–443):
```js
  ballHeartbeatTimers.forEach(hb=>clearInterval(hb.id));
  ballHeartbeatTimers=[];
```
**Change**:
```js
  clearBallHeartbeats();
```

**Verify**: `grep -n "clearBallHeartbeats" public/games/breakout/index.html` → shows a call in `startGame`.

### Step 3: Clear timers on GAME_OVER

Inside the `lives<=0` branch, after `stopMusic()`.

**Current** (around line 820–821):
```js
      if(droneOsc){try{droneOsc.stop();droneOsc=null;droneGain=null;}catch(e){}}
      stopMusic();
    }
```
**Change**:
```js
      if(droneOsc){try{droneOsc.stop();droneOsc=null;droneGain=null;}catch(e){}}
      stopMusic();
      clearBallHeartbeats();
    }
```

**Verify**: `grep -n "clearBallHeartbeats" public/games/breakout/index.html` → shows a call near `stopMusic()` in the `GAME_OVER` branch.

### Step 4: Clear timers on LEVEL_CLEAR

Inside the `state==='LEVEL_CLEAR'` branch, before the timer expires or as it expires.

**Current** (line 614):
```js
    if(state==='LEVEL_CLEAR'){
      levelClearTimer-=dt;
      if(levelClearTimer<=0){level++;particles=[];popups=[];initLevel();state='PLAYING';}
    }
```
**Change**:
```js
    if(state==='LEVEL_CLEAR'){
      levelClearTimer-=dt;
      clearBallHeartbeats();
      if(levelClearTimer<=0){level++;particles=[];popups=[];initLevel();state='PLAYING';}
    }
```

Calling it every frame while in `LEVEL_CLEAR` is safe because the helper clears the array; repeated calls are no-ops.

**Verify**: `grep -n "clearBallHeartbeats" public/games/breakout/index.html` → shows a call inside the `LEVEL_CLEAR` branch.

### Step 5: Build and smoke test

**Verify**: `npm run build` → exit 0.

**Manual check**:
1. Start the game and let the ball drop near the paddle danger zone until you hear the heartbeat.
2. Lose all lives.
3. Expected: the heartbeat beeping stops within 1 second of the `GAME OVER` screen appearing.
4. Restart, reach the next level, and confirm the beeping stops when `LEVEL CLEAR` appears.

## Test plan

- No automated test framework exists for the game. Verify by manual play.
- Regression cases:
  - Heartbeat still starts when a ball is in the danger zone.
  - Heartbeat stops when the ball recovers or is lost (existing behavior).
  - Heartbeat stops on game over and level clear (new behavior).

## Done criteria

- [ ] `clearBallHeartbeats()` helper exists.
- [ ] It is called in `startGame`, the `GAME_OVER` branch, and the `LEVEL_CLEAR` branch.
- [ ] `npm run build` exits 0.
- [ ] Manual test confirms beeping stops on game over and level clear.
- [ ] `plans/README.md` status row updated to DONE.

## STOP conditions

Stop and report back if:
- The excerpts in "Current state" do not match the live file.
- `clearBallHeartbeats` is called before `ballHeartbeatTimers` is declared (it must appear after the declaration at line 177).
- A build or runtime error appears after adding the helper.

## Maintenance notes

- Any new state that ends a round (e.g., a quit-to-menu state) should also call `clearBallHeartbeats()`.
- The `_hbTriggered` flag on balls is reset by the existing cleanup loop; make sure `clearBallHeartbeats` does not need to reset it. If future logic depends on the flag being false after a state change, add `hb.b._hbTriggered=false;` inside the helper as well.
