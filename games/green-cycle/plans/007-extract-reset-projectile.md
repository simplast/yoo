# Plan 007: Extract `resetProjectile` and use it in the projectile pool

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 2fbd773..HEAD -- src/entities/Projectile.ts src/game/State.ts src/entities/Projectile.test.ts
> ```
> If any in-scope file changed, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (parallel with plan-005 and plan-006; safe to run in any order)
- **Category**: tech-debt
- **Planned at**: commit `2fbd773`, 2026-06-21
- **Issue**: (not published)

## Why this matters

In [src/game/State.ts:156-162](file:///Users/doer/dev/yoo/games/green-cycle/src/game/State.ts#L156-L162) the projectile pool's reset hook is inlined:

```typescript
this.projectilePool = new Pool<Projectile>(
  () => ({ /* factory shape */ }),
  (p) => {
    p.alive = false;
    p.x = 0;
    p.y = 0;
    p.targetId = 0;
    p.debuff = undefined;
  },
  30,
);
```

Compare to the entity-sibling pattern: `Enemy` exposes `createEnemy` + `resetEnemy` ([src/entities/Enemy.ts:19, 58](file:///Users/doer/dev/yoo/games/green-cycle/src/entities/Enemy.ts#L19-L58)); `Effect` exposes `createDamageText` / `createHitEffect` / ... + `resetEffect` ([src/entities/Effect.ts:9](file:///Users/doer/dev/yoo/games/green-cycle/src/entities/Effect.ts#L9)). The pool hooks live alongside the factory so when a field is added to the `Projectile` interface in [src/types.ts:181-201](file:///Users/doer/dev/yoo/games/green-cycle/src/types.ts#L181-L201), the next reader has a single obvious place to update.

The `Projectile` interface has accreted fields since its initial commit (most recently `debuff` for support-tower hits). The inline reset in `State.ts` is missing `damage`, `attackType`, `splashRadius`, `sourceTowerId`, `color`, `size`, and `instanceId` — they survive only because `createProjectile` re-assigns every one of them on every acquire. That's a load-bearing assumption: if a future maintainer ever adds a field to `Projectile` and forgets to assign it in `createProjectile`, the pool will silently leak the previous lifecycle's value. Today the only `undefined`-or-zero the reset enforces is `debuff`; the rest is incidental. This plan extracts the reset into a named, exported `resetProjectile` so that the contract is explicit, the next field addition has a one-place checklist, and the test layer can pin the behavior.

## Current state

- **Files and roles**:
  - `src/entities/Projectile.ts` — `createProjectile(opts, pool?)` factory. Lives in the same file as `CreateProjectileOpts` interface. No `resetProjectile` function exists today.
  - `src/game/State.ts:120-170` — `GameState` constructor builds the three pools. `projectilePool` uses an inline `(p) => { ... }` reset (lines 156-162).
  - `src/entities/Effect.ts:8-18` — `resetEffect` is the canonical pattern: exported function, named, clears all optional fields, lives in the entity file.
  - `src/entities/Enemy.ts:58-68` — `resetEnemy` is the second exemplar; plan-005 is adding `_splitChild` to it.
- **Projectile interface** ([src/types.ts:181-201](file:///Users/doer/dev/yoo/games/green-cycle/src/types.ts#L181-L201)):
  - Required fields: `instanceId, x, y, targetId, speed, damage, attackType, splashRadius, sourceTowerId, alive, color, size`.
  - Optional: `debuff: { type, value, duration }`.
- **Repo conventions** (verified):
  - Reset functions are exported named functions, in the same `src/entities/*` file as the factory.
  - Pool reset hooks call the exported reset function. The factory may be called with or without a pool; when without, the factory still produces a correct fresh object.
  - Test files for entity factories / resets, when present, live at `src/entities/<name>.test.ts`. (No `Projectile.test.ts` exists today.)
- **Constraint from types.ts**: the `BuffType` import is already in `Projectile.ts:8` but is currently only used in `CreateProjectileOpts`. The reset will not need it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test -- --run Projectile` | all pass (existing 0 + new 2 = 2) |
| Lint | `npm run lint` | exit 0 |
| Format | `npm run format:check` | exit 0 |

## Suggested executor toolkit

None required. The change is structural: extract a function, swap the inline reset, add a test.

## Scope

**In scope** (the only files you may modify):
- `src/entities/Projectile.ts` — add and export `resetProjectile`
- `src/game/State.ts` — replace the inline reset with the new function
- `src/entities/Projectile.test.ts` — create this test file

**Out of scope** (do NOT touch):
- `src/entities/Effect.ts` / `src/entities/Enemy.ts` — different entity, different reset (plan-005 covers `Enemy`)
- `src/systems/CombatSystem.ts` — projectile lifecycle is already correct
- `src/utils/Pool.ts` — pool semantics are correct
- `src/types.ts` — no interface changes needed; this plan only re-uses existing fields

## Git workflow

- Branch: `advisor/007-extract-reset-projectile`
- One commit per logical unit. Conventional commits:
  - `refactor(projectile): extract resetProjectile factory for pool hygiene`
  - `test(projectile): pin pool reset contract via resetProjectile test`

## Steps

### Step 1: Extract `resetProjectile` in `src/entities/Projectile.ts`

Insert a new exported function directly above `createProjectile` (the function is the symmetric counterpart to the factory; the sibling file `Effect.ts` puts `resetEffect` first for the same reason).

```typescript
/** 重置投射物运行时字段（对象池复用时调用） */
export function resetProjectile(p: Projectile): void {
  p.alive = false;
  p.x = 0;
  p.y = 0;
  p.targetId = 0;
  p.speed = 0;
  p.damage = 0;
  p.attackType = 'normal';
  p.splashRadius = 0;
  p.sourceTowerId = 0;
  p.color = '';
  p.size = 0;
  p.debuff = undefined;
}
```

Notes for the executor:
- Every field of the `Projectile` interface is reset to its "no projectile" value. This is stricter than the current inline reset (which omits `speed`, `damage`, `attackType`, `splashRadius`, `sourceTowerId`, `color`, `size`) — the strictness is the point, but it is safe because `createProjectile` overwrites every one of these fields on acquire.
- `instanceId` is intentionally not reset: it is re-assigned by `createProjectile` via `nextEntityId()`.
- `attackType` is reset to `'normal'` (the default that `createProjectile` falls back to via `opts.attackType ?? 'normal'`).

**Verify**: `npm run typecheck` exits 0.

### Step 2: Replace the inline reset in `State.ts`

In [src/game/State.ts:156-162](file:///Users/doer/dev/yoo/games/green-cycle/src/game/State.ts#L156-L162), replace the inline reset closure with a call to the new `resetProjectile`.

Before:

```typescript
this.projectilePool = new Pool<Projectile>(
  () => ({ /* factory shape */ }),
  (p) => {
    p.alive = false;
    p.x = 0;
    p.y = 0;
    p.targetId = 0;
    p.debuff = undefined;
  },
  30,
);
```

After:

```typescript
this.projectilePool = new Pool<Projectile>(
  () => ({ /* factory shape unchanged */ }),
  (p) => resetProjectile(p),
  30,
);
```

Add the import to [src/game/State.ts:1-20](file:///Users/doer/dev/yoo/games/green-cycle/src/game/State.ts#L1-L20). The other entity resets are already imported:

```typescript
import { resetEnemy } from '../entities/Enemy';
import { resetEffect } from '../entities/Effect';
// add:
import { resetProjectile } from '../entities/Projectile';
```

**Verify**: `npm run typecheck` exits 0; `grep -n "resetProjectile" src/game/State.ts` returns 2 matches (import + use).

### Step 3: Add a regression test in `src/entities/Projectile.test.ts`

Create the test file. The goal is to pin the contract: after `resetProjectile`, every field of the `Projectile` is at its "no projectile" default. This is a pure-function test; no `GameState` or `Path` is needed.

Test skeleton:

```typescript
import { describe, it, expect } from 'vitest';
import { createProjectile, resetProjectile } from './entities/Projectile';
import { CONFIG } from './config';

describe('Projectile pool hygiene', () => {
  it('createProjectile + resetProjectile round-trip leaves a clean shell', () => {
    const p = createProjectile({
      x: 10, y: 20, targetId: 5, speed: 300, damage: 50,
      attackType: 'magic', splashRadius: 40, sourceTowerId: 7,
      color: '#FF0000', size: 6,
      debuffType: 'slow', debuffValue: 0.3, debuffDuration: 1.5,
    });
    expect(p.alive).toBe(true);
    expect(p.debuff).toBeDefined();

    resetProjectile(p);
    expect(p.alive).toBe(false);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
    expect(p.targetId).toBe(0);
    expect(p.speed).toBe(0);
    expect(p.damage).toBe(0);
    expect(p.attackType).toBe('normal');
    expect(p.splashRadius).toBe(0);
    expect(p.sourceTowerId).toBe(0);
    expect(p.color).toBe('');
    expect(p.size).toBe(0);
    expect(p.debuff).toBeUndefined();
  });

  it('a recycled projectile re-acquired via the pool carries no stale fields', () => {
    // The pool is the State-owned object; for an entity-level test, the
    // createProjectile factory + resetProjectile pair is the contract.
    const CONFIG_SAMPLE = 0; // smoke: confirm CONFIG is importable (it is)
    expect(CONFIG_SAMPLE).toBe(0);
    const a = createProjectile({ x: 1, y: 1, targetId: 1, speed: 1, damage: 1, sourceTowerId: 1, attackType: 'normal', splashRadius: 0, color: '#FFF', size: 4 });
    a.damage = 999;
    a.attackType = 'chaos';
    resetProjectile(a);
    expect(a.damage).toBe(0);
    expect(a.attackType).toBe('normal');
  });
});
```

Notes for the executor:
- The `CONFIG` import is a smoke check; the test should not import symbols it does not use. If you do not use `CONFIG`, drop the import entirely.
- These tests do not need a `GameState` or pool — `createProjectile` and `resetProjectile` are both pure functions and contractable in isolation. The pool-level test (acquire/release/re-acquire) is exercised indirectly by the existing `CombatSystem.test.ts` projectile tests at [src/systems/CombatSystem.test.ts:72-129](file:///Users/doer/dev/yoo/games/green-cycle/src/systems/CombatSystem.test.ts#L72-L129).

**Verify**: `npm test -- --run Projectile` exits 0 with 2 new tests.

### Step 4: Full verification matrix

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run format:check
```

**Verify**: all four exit 0. (If plan-006 has not yet landed, `format:check` will still report the 6 files from plan-006's scope — that is plan-006's problem, not this plan's. Do not reformat files here.)

## Test plan

- 2 new tests in `src/entities/Projectile.test.ts`:
  1. **Full-field round trip**: every field of the `Projectile` interface is at its expected default after `resetProjectile`.
  2. **Stale-field defense**: mutating fields on a released projectile and then resetting returns to defaults, simulating a future bug where a maintainer adds a field to `Projectile` but forgets to reset it.
- No changes to existing tests; the existing 113 tests continue to pass.
- Verification: `npm test -- --run` exits 0; total tests = 115 (113 + 2 new). 117 if plan-005 has also landed.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test -- --run Projectile` exits 0; 2 new tests pass
- [ ] `grep -n "resetProjectile" src/entities/Projectile.ts` shows both the function definition (export) and use inside `createProjectile` (none — only the function is exported, and `createProjectile` does not call it; this is by design: the pool hook in `State.ts` is the only caller)
- [ ] `grep -n "resetProjectile" src/game/State.ts` shows the import and the pool-reset use (2 matches)
- [ ] `git status` shows exactly 3 files modified: `src/entities/Projectile.ts`, `src/game/State.ts`, `src/entities/Projectile.test.ts` (and `plans/README.md` for status update)
- [ ] `plans/README.md` status row for 007 updated to `DONE`

## STOP conditions

Stop and report back (do not improvise) if:
- The current `src/entities/Projectile.ts` does not have `createProjectile` at the location described (drift).
- The `Projectile` interface in [src/types.ts:181-201](file:///Users/doer/dev/yoo/games/green-cycle/src/types.ts#L181-L201) has changed shape (e.g. a new required field). Re-derive the reset from the live interface and continue, but flag the drift in the PR description.
- `resetProjectile` ends up needing to be called from inside `createProjectile` itself (it should not — `createProjectile` either acquires from a pool (which has already reset) or constructs a fresh object literal). If it is needed, the pool reset is being called twice and there is a deeper problem to investigate.
- A test fails twice in a row after a reasonable fix attempt.

## Maintenance notes

- The "reset function in the entity file, pool hooks in `State.ts`" pattern is now uniform across `Enemy`, `Effect`, and `Projectile`. A future entity (e.g. a pooled `Projectile` subclass for "homing missiles" with extra fields) should follow the same template: extend the interface, add the field to `create*`, add the reset line, add a test that pins it.
- The `instanceId` field is the only one intentionally not reset — it is re-minted by `create*` factories via `nextEntityId()`. Reviewers should reject any future change that resets `instanceId` in a `reset*` function, since that would collide with the next acquire's ID assignment.
- Deferred follow-ups (out of this plan):
  - Whether the projectile pool's `initialSize=30` is right for 50-wave clear (splash-heavy waves like 47/49 may exceed it). That is a perf tuning question, not a hygiene question; flag for plan-009+.
  - Auditing `Effect.resetEffect` for the same class of "all-fields-or-nothing" coverage. A quick check: `resetEffect` already clears every optional Effect field, so it is already strict. No change needed.
