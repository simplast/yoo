# Plan 012: Add auraKey to lastSync type; remove (as any) casts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 329df77..HEAD -- src/game/Game.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (pure type-safety tightening; no behavior change)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `329df77`, 2026-06-22

## Why this matters

The tower info panel (added in commit `329df77`) introduced a new cache key
`auraKey` on `this.lastSync` to detect when tower aura buffs change (so the
panel re-renders the gold "+X%" bonus text). The field was never declared in
the `lastSync` object literal type, so all four uses go through
`(this.lastSync as any).auraKey`. This defeats TypeScript's typo-checking
(typing `auraKay` would silently create an unrelated property and never
refresh the panel) and is the only `as any` cast in the hot syncUI path.
The fix is a one-line addition to the `lastSync` initializer and removing
the casts.

## Current state

In `src/game/Game.ts`:

- Lines 78-99 declare `private lastSync = { ... }` without an `auraKey` field.
- Line 842: `(this.lastSync as any).auraKey !== auraKey` (dirty check)
- Line 848: `(this.lastSync as any).auraKey = auraKey;` (update cache)
- Line 855: `(this.lastSync as any).auraKey = '';` (clear on selected-tower missing)
- Line 862: `(this.lastSync as any).auraKey = '';` (clear on no selection)

Other `as any` usages in the codebase (a grep confirms): none besides
Quadtree `ref: any` (out of scope for this plan; documented as considered-
and-rejected in plans/README because genericizing Quadtree is M-effort).

Conventions: all other `lastSync` fields are typed by inference from the
initializer; follow the same pattern (no explicit interface needed — just
add `auraKey: ''` to the object literal).

## Commands you will need

| Purpose      | Command                 | Expected on success           |
|--------------|-------------------------|-------------------------------|
| Search casts | `grep -n "as any" src/ -r` | outputs only Quadtree (after fix) |
| Typecheck    | `npm run typecheck`     | exit 0                        |
| Tests        | `npm test`              | all pass                      |
| Lint         | `npm run lint`          | exit 0                        |
| Format check | `npm run format:check`  | all formatted                 |

## Scope

**In scope**:

- `src/game/Game.ts` — one field added to `lastSync`; four casts replaced
  with normal property access

**Out of scope**:

- Quadtree `ref: any` / `retrieve: any[]` (separate larger refactor)
- Any other `as any` casts that may exist elsewhere (this plan only
  addresses the newly introduced `auraKey` cast)
- Any behavior change to how auraKey is computed or compared

## Git workflow

- Branch: `advisor/012-lastSync-auraKey-type`
- Commit: `refactor(green-cycle): type auraKey on lastSync, remove (as any) casts`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add auraKey field to lastSync initializer

In `src/game/Game.ts`, at lines 78-99, add `auraKey: ''` to the `lastSync`
object literal. Place it alongside the other render keys, e.g. after
`combineRenderKey`:

```ts
growthRenderKey: '',
combineRenderKey: '',
auraKey: '', // 光环加成缓存 key（damageMult:speedMult）
popText: '',
```

Initial value `''` matches the "no aura" sentinel used at lines 855/862.

**Verify**: `npm run typecheck` → exit 0. (TypeScript may already flag the
  `as any` casts as redundant after adding the field — it will not error,
  but lint may prefer no `as any`.)

### Step 2: Replace all four (this.lastSync as any).auraKey with this.lastSync.auraKey

On lines 842, 848, 855, 862, replace `(this.lastSync as any).auraKey` with
`this.lastSync.auraKey`. Keep the surrounding logic and whitespace
unchanged.

**Verify**: `npm run typecheck && npm run lint` → both exit 0. No
  "unnecessary any" warnings if the lint config detects them (ESLint
  `no-explicit-any` is on by default in @typescript-eslint recommended
  but verify).

### Step 3: Verify no other casts were introduced

Run:

```
grep -rn "as any" src/
```

Expected: no matches referencing `lastSync`. The Quadtree `ref: any` matches
are expected and out of scope.

**Verify**: `npm run format:check && npm test` → both pass.

## Test plan

No new tests (type-level fix; behavior is identical). The existing
syncUI/tower-info behavior is covered by any manual testing of the aura
tower info panel (hover/select an auraDamage tower → nearby towers show
gold "+X%"; moving out of range removes it). The existing 118 tests must
continue to pass.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run format:check` passes
- [ ] `npm test` passes
- [ ] `grep -n "(this.lastSync as any)" src/game/Game.ts` returns nothing
- [ ] `grep -n "auraKey" src/game/Game.ts` shows the field declared + 4 uses
- [ ] Only `src/game/Game.ts` is modified (except possibly Prettier
      touching other files — it shouldn't, since baseline is clean)
- [ ] `plans/README.md` status row updated

## STOP conditions

- If adding the field surfaces other compilation errors (unlikely since
  the field only adds a declared property for something that already
  existed at runtime), investigate before adding more changes.
- If another `as any` exists in Game.ts besides the 4 auraKey sites, do
  NOT fix it in this plan (out of scope) — note it for future cleanup.

## Maintenance notes

- When adding future dirty-check keys to `lastSync`, always declare them
  in the object literal initializer. This plan should serve as the
  precedent: the existing tests + typecheck keep this enforced.
- If a separate plan generifies Quadtree, that would remove the other
  `as any`/`any` usages in the codebase.
