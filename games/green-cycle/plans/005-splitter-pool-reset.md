# Plan 005: `resetEnemy` clears `_splitChild` so pooled splitters split correctly

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 2fbd773..HEAD -- src/entities/Enemy.ts src/systems/CombatSystem.ts src/entities/Enemy.test.ts
> ```
> If any in-scope file changed, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `2fbd773`, 2026-06-21
- **Issue**: (not published)

## Why this matters

`resetEnemy` in [src/entities/Enemy.ts:58-68](file:///Users/doer/dev/yoo/games/green-cycle/src/entities/Enemy.ts#L58-L68) clears the runtime fields the `Enemy` interface declares, but it does **not** clear the optional `_splitChild` flag. When a splitter enemy dies, `applyDamage` in [src/systems/CombatSystem.ts:46-59](file:///Users/doer/dev/yoo/games/green-cycle/src/systems/CombatSystem.ts#L46-L59) spawns 2 children that are flagged `_splitChild = true` (so they don't recursively split). Those children are released to `state.enemyPool` shortly after, and the same `Enemy` object may later be re-acquired by `createEnemy` to satisfy a future `spawnQueue` task — including another wave's `splitter` spawns.

When that recycled object comes back with `_splitChild` still `true` from its previous life, the `!enemy._splitChild` guard in `applyDamage` causes the new splitter to **not split on death**. From the player's perspective, the second batch of splitter enemies through the loop deals the same damage as ordinary grunts instead of doubling — silently breaking the wave 20/23/27/... design. This bug is invisible during the first 50-wave clear (first batch of each pool acquire is fresh), but bites anyone who plays long enough for the enemy pool to recycle, including endless mode from cycle 2 onward.

## Current state

- **Files and roles**:
  - `src/entities/Enemy.ts` — `createEnemy` (factory) and `resetEnemy` (pool-reset hook). `createEnemy` assigns every field from `ENEMIES[defId]` via `Object.assign` plus runtime fields; it does **not** reset `_splitChild` because the field is not in `EnemyDef`.
  - `src/systems/CombatSystem.ts` — `applyDamage` checks `enemy.abilities.includes('split') && !enemy._splitChild` before spawning children.
  - `src/entities/Enemy.ts:19-52` — `createEnemy` initializes `abilities` from `def.abilities` on every acquire, so a reused `splitter` correctly re-acquires the `split` ability. The bug is solely that `_splitChild` is not reset between lifecycles.
  - `src/game/State.ts:120-140` — `enemyPool` initial-size 20. Across a 50-wave clear, splitters total well over 20 spawned (waves 20/23/27/32/34/39/41/44/47/49 each spawn 8–20 splitters), so pool recycling is guaranteed.
- **Repo conventions** (verified):
  - Pool reset functions live alongside their `create*` factory in `src/entities/*` and are called by `State` pool initializers. See `resetEffect` in [src/entities/Effect.ts:8-18](file:///Users/doer/dev/yoo/games/green-cycle/src/entities/Effect.ts#L8-L18) as the canonical pattern.
  - Tests live in `src/entities/*.test.ts` or `src/utils/*.test.ts` for utilities; system tests live in `src/systems/*.test.ts`. CombatSystem already has a splitter test at [src/systems/CombatSystem.test.ts:48-54](file:///Users/doer/dev/yoo/games/green-cycle/src/systems/CombatSystem.test.ts#L48-L54) that the new test should mirror.
  - Test helper: `createEnemy(defId, path, difficulty, pool?)` accepts a pool; without a pool, it allocates a fresh object each time, so the existing splitter test passes today (no recycling). The new test must exercise the **pool** path.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Tests | `npm test -- --run Enemy CombatSystem` | all pass (existing + new) |
| Lint | `npm run lint` | exit 0 |
| Format | `npm run format:check` | exit 0 |

## Suggested executor toolkit

None required — the change is a one-line fix + a test. The executor should not invoke other skills.

## Scope

**In scope** (the only files you may modify):
- `src/entities/Enemy.ts` — add the `_splitChild` reset to `resetEnemy`
- `src/entities/Enemy.test.ts` — create this test file with a regression test for the bug

**Out of scope** (do NOT touch, even though they look related):
- `src/systems/CombatSystem.ts` — the guard is correct; the bug is upstream in the pool hygiene
- `src/game/State.ts` — the pool initializer and factory shape are fine
- `src/data/enemies.ts` — `splitter` def is correct
- Any other entity reset function (`resetEffect`, etc.)

## Git workflow

- Branch: `advisor/005-splitter-pool-reset`
- Commit per logical unit: one commit for the fix, one for the test. Conventional commits — recent examples: `fix(combat): verify wood reward on enemy kill`, `refactor(ui): cache DOM rewrites in Game.syncUI`. Match that style:
  - `fix(enemy): clear _splitChild flag in resetEnemy to prevent pool reuse leak`
  - `test(enemy): verify pooled splitter retains split ability on reuse`

## Steps

### Step 1: Add the one-line fix in `resetEnemy`

In `src/entities/Enemy.ts`, locate the `resetEnemy` function (lines 58–68). Add a single line to clear `_splitChild` so that a recycled `Enemy` object never carries a stale split-child flag from its previous lifecycle.

The target shape of the function (line numbers shift by 1):

```typescript
export function resetEnemy(e: Enemy): void {
  e.alive = false;
  e.hp = 0;
  e.maxHp = 0;
  e.pathProgress = 0;
  e.speed = 0;
  e.x = 0;
  e.y = 0;
  e.buffs.length = 0;
  e.auraFlags = 0;
  e.hitFlash = 0;
  e._splitChild = undefined; // <-- add this line
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Write a regression test that exercises the pool path

Create `src/entities/Enemy.test.ts` (does not exist yet). The test must:
1. Acquire a `splitter` via the pool, mark it `_splitChild = true`, release it back to the pool.
2. Re-acquire from the same pool (or force a second `createEnemy` to draw the recycled object).
3. Assert the new enemy is a `splitter` and `_splitChild` is falsy.

The structural pattern to follow is the existing helper-based style in [src/systems/CombatSystem.test.ts:48-54](file:///Users/doer/dev/yoo/games/green-cycle/src/systems/CombatSystem.test.ts#L48-L54) and the pool usage in [src/systems/EffectSystem.test.ts:39-44](file:///Users/doer/dev/yoo/games/green-cycle/src/systems/EffectSystem.test.ts#L39-L44).

Test skeleton (use the existing test helpers in `src/test-helpers.ts:11-30`; do NOT add new helpers):

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from './game/State';
import { Path } from './utils/Path';
import { createEnemy, resetEnemy } from './entities/Enemy';
import { CONFIG } from './config';

describe('Enemy pool hygiene', () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState(Path.createLoopPath(1280, 720, 80, 320));
  });

  it('resetEnemy clears _splitChild so recycled splitters can split again', () => {
    // Step 1: get a splitter, mark as child, release
    const a = createEnemy('splitter', state.path, 'normal', state.enemyPool);
    a._splitChild = true;
    state.enemyPool.release(a);

    // Step 2: re-acquire — pool returns the same object
    const b = createEnemy('splitter', state.path, 'normal', state.enemyPool);
    expect(b).toBe(a); // pool returned the recycled object
    expect(b.abilities).toContain('split');
    expect(b._splitChild).toBeFalsy();
  });

  it('resetEnemy is a no-op safety net even when called directly', () => {
    const e = createEnemy('splitter', state.path, 'normal', state.enemyPool);
    e._splitChild = true;
    resetEnemy(e);
    expect(e._splitChild).toBeUndefined();
  });
});
```

Notes for the executor:
- `state.enemyPool` is a `Pool<Enemy>` with `initialSize=20`; the first 20 acquires are fresh and only #21+ returns a recycled object. With `initialSize=20` and only 1 prior acquire in test 1, the second `createEnemy` call returns the freshly-recycled object. If the test ever fails with `b !== a`, you may have miscounted: use `state.enemyPool.acquire()` directly to verify, then `state.enemyPool.release(b)` to clean up.
- The CONFIG import is optional; remove it if unused.
- The test must be deterministic and not depend on `Math.random()` or other non-seeded sources.

**Verify**: `npm test -- --run Enemy` → both new tests pass, plus all pre-existing 113 tests still pass.

### Step 3: Full verification matrix

Run the full gate set. Every command must exit 0.

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run format:check
```

**Verify**: All four exit 0. (Note: `format:check` is expected to still report 6 files as failing — that is plan-006's scope, not this plan. Do not touch those files here.)

## Test plan

- 2 new tests in `src/entities/Enemy.test.ts`:
  1. **Pool recycling regression**: a recycled splitter from the pool must have `_splitChild` falsy.
  2. **Direct `resetEnemy` safety net**: calling `resetEnemy(e)` directly clears the flag.
- No new test in `src/systems/CombatSystem.test.ts` is needed — the existing splitter test continues to pass (it allocates a fresh object, so the flag was never set in the first place).
- Verification: `npm test -- --run Enemy CombatSystem` → 115 total tests pass.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test -- --run` exits 0; both new `Enemy.test.ts` tests pass
- [ ] `grep -n "e._splitChild" src/entities/Enemy.ts` shows the new reset line
- [ ] Only `src/entities/Enemy.ts` and `src/entities/Enemy.test.ts` are modified (verify with `git status`)
- [ ] `plans/README.md` status row for 005 updated to `DONE`

## STOP conditions

Stop and report back (do not improvise) if:
- The current `resetEnemy` (Enemy.ts:58-68) does not match the excerpt above (drift).
- A test fails twice in a row after a reasonable fix attempt.
- The fix appears to require touching `src/systems/CombatSystem.ts`, `src/game/State.ts`, or `src/data/enemies.ts` — it does not; revisit scope.
- The pool does not return the same object on re-acquire (`b !== a` after release) — investigate whether `Pool` semantics differ from documented behavior in [src/utils/Pool.ts](file:///Users/doer/dev/yoo/games/green-cycle/src/utils/Pool.ts); that's plan-007 territory, not this plan.

## Maintenance notes

- The pattern "reset function clears all optional flag fields" is the safe default for any future `Enemy` runtime field added to the interface. A reviewer on this PR should check that `Enemy.abilities` reassignment in `createEnemy` and `Enemy.buffs` clearing in `resetEnemy` remain the only places that mutate those fields, and that the type signature `Enemy extends EnemyDef` does not introduce new optional runtime fields without a corresponding reset line.
- If a future plan introduces a pooled `Boss` with its own one-shot flag (e.g. `enraged`), the same rule applies: clear it in `resetEnemy` and add a regression test.
- Deferred follow-ups (out of this plan):
  - Whether `resetEnemy` should also clear `rewardGold` and `rewardWood` is moot because `createEnemy` re-derives them on every acquire. No change needed.
  - Auditing other entity resets (`resetEffect`) for the same class of leak is plan-007's scope.
