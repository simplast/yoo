# Plan 003: Fix bomb-chain scoring to use combo multiplier

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

Bomb bricks destroy adjacent bricks in a chain reaction, but those adjacent bricks score a flat `ROW_SCORES[nb.row]`. Directly hit bricks use the same base score multiplied by `Math.min(combo,10)`. This makes bomb-chain destruction less rewarding than identical direct hits and the scoring feels inconsistent.

## Current state

- `public/games/breakout/index.html` — the only file to change.
- Relevant excerpts today:
  - Lines 779–783 score a direct brick hit with combo multiplier:
    ```js
    const mult=Math.min(combo,10);
    const pts=(br.gold?GOLD_SCORE*level:ROW_SCORES[br.row])*mult;
    score+=pts;
    ```
  - Lines 760–778 handle the bomb chain. Adjacent bricks that are destroyed score flatly:
    ```js
    if(Math.abs(nb.row-br.row)<=1&&Math.abs(nb.col-br.col)<=1){
      nb.hp--;
      if(nb.hp<=0){
        deadBricks.add(k);
        spawnParticles(nb.x+nb.w/2,nb.y+nb.h/2,nb.color,8);
        score+=ROW_SCORES[nb.row];
        addPopup(nb.x+nb.w/2,nb.y,'💥','#ff4400');
      }
    }
    ```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Build | `npm run build` | exit 0 |
| Verify scoring | `grep -n "score+=" public/games/breakout/index.html` | shows two uses of the combo-multiplied formula |

## Scope

**In scope**:
- `public/games/breakout/index.html`

**Out of scope**:
- Any other scoring rules.
- Any other files in the repo.

## Git workflow

- Branch: `advisor/003-fix-bomb-chain-scoring`
- Commit message style: `fix(breakout): apply combo multiplier to bomb-chain bricks`
- Do NOT push unless instructed.

## Steps

### Step 1: Move the combo multiplier before the bomb chain

The `mult` constant is currently declared after the bomb-chain block. Move it before that block so the chain can use it.

**Current** (around lines 757–783):
```js
            if(br.isBomb){
              triggerShake(0.25,15);
              spawnParticles(br.x+br.w/2,br.y+br.h/2,'#ff4400',20);
              SND.bomb();
              for(let k=bricks.length-1;k>=0;k--){ ... }
            }
            const mult=Math.min(combo,10);
            const pts=(br.gold?GOLD_SCORE*level:ROW_SCORES[br.row])*mult;
```

**Change**: move `const mult=Math.min(combo,10);` to immediately before the `if(br.isBomb){` block. The surrounding code should look like:
```js
          if(br.hp<=0){
            deadBricks.add(j);
            const mult=Math.min(combo,10);
            if(br.isBomb){
              ...
            }
            const pts=(br.gold?GOLD_SCORE*level:ROW_SCORES[br.row])*mult;
            ...
          }
```

**Verify**: `grep -n "const mult=Math.min(combo,10)" public/games/breakout/index.html` → shows the line inside the `hp<=0` block, before the bomb chain.

### Step 2: Apply the multiplied formula to bomb-chain bricks

Inside the bomb-chain loop, replace the flat score with the combo-multiplied formula. Treat adjacent bricks the same as direct hits, including gold bricks.

**Current** (around line 773):
```js
        score+=ROW_SCORES[nb.row];
        addPopup(nb.x+nb.w/2,nb.y,'💥','#ff4400');
```
**Change**:
```js
        score+=(nb.gold?GOLD_SCORE*level:ROW_SCORES[nb.row])*mult;
        addPopup(nb.x+nb.w/2,nb.y,combo>1?`💥 x${mult}`:'💥','#ff4400');
```

**Verify**: `grep -n "score+=" public/games/breakout/index.html` → shows two lines using the `( ... )*mult` pattern.

### Step 3: Build and smoke test

**Verify**: `npm run build` → exit 0.

**Manual check**:
1. Start the game and build a combo of 2 or more by hitting regular bricks.
2. Hit a bomb brick (red brick that explodes).
3. Expected: the popup for adjacent destroyed bricks shows a multiplied value (e.g., `💥 x2`) and the score jump matches the direct-hit formula.

## Test plan

- No automated test framework exists for the game. Verify by manual play.
- Regression cases:
  - A bomb brick with no combo still scores adjacent bricks normally.
  - A gold brick destroyed by a bomb scores `GOLD_SCORE*level*mult`.
  - Direct-hit scoring remains unchanged.

## Done criteria

- [ ] `const mult=Math.min(combo,10);` is inside the `hp<=0` block and before the bomb-chain loop.
- [ ] Bomb-chain brick scoring uses `(nb.gold?GOLD_SCORE*level:ROW_SCORES[nb.row])*mult`.
- [ ] `npm run build` exits 0.
- [ ] Manual test confirms bomb-chain popup reflects the multiplier when combo > 1.
- [ ] `plans/README.md` status row updated to DONE.

## STOP conditions

Stop and report back if:
- The excerpts in "Current state" do not match the live file.
- Moving `mult` causes a ReferenceError because it is used before declaration.
- Bomb bricks stop destroying adjacent bricks after the change.

## Maintenance notes

- If scoring rules change (e.g., per-level multipliers), update both direct-hit and bomb-chain formulas together. Consider extracting a `scoreForBrick(brick, mult)` helper in Plan 004 to prevent this duplication.
