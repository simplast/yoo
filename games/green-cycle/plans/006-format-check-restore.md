# Plan 006: Restore `prettier --check` to a clean state on 6 files

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 2fbd773..HEAD -- src/entities/Effect.ts src/entities/Enemy.ts src/entities/Projectile.ts src/systems/AuraSystem.ts src/systems/CombatSystem.ts src/systems/SkillSystem.ts
> ```
> If any in-scope file changed, compare the "Current state" list against `npx prettier --list-different src/**/*.ts` before proceeding; on a mismatch (different files flagged), treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `2fbd773`, 2026-06-21
- **Issue**: (not published)

## Why this matters

`npm run format:check` is one of the four gates the executor runs on every plan ([plans/README.md:74-86](file:///Users/doer/dev/yoo/games/green-cycle/plans/README.md#L74-L86)). Today it reports 6 files as failing:

```
src/entities/Effect.ts
src/entities/Enemy.ts
src/entities/Projectile.ts
src/systems/AuraSystem.ts
src/systems/CombatSystem.ts
src/systems/SkillSystem.ts
```

These were introduced by the 3664f7a / abadf08 / f309ad9 / 9102dd9 commits between plans 001–004 and the reconcile ([plans/README.md:60-67](file:///Users/doer/dev/yoo/games/green-cycle/plans/README.md#L60-L67)). The pre-commit hook installed by plan-004 runs `prettier --write` on staged files, but it does **not** retroactively format files already in the working tree, and the GH Actions CI workflow does not currently invoke `format:check` (only `typecheck` + `lint` + `test`). So a PR can land with format drift and the format gate stays red until something else forces a rewrite.

Until this lands, the format gate is silently a no-op for these 6 files: any executor who runs the gate as part of a plan is told the project is broken, even when their own diff is clean. The fix is one command. Doing it now unblocks every subsequent plan from carrying a known red entry in its verification matrix.

## Current state

- **Files and roles** (all flagged by `prettier --check` at the time this plan was written):
  - `src/entities/Effect.ts` — entity factory and effect pool reset (`resetEffect`)
  - `src/entities/Enemy.ts` — entity factory and reset hook (`resetEnemy`); also touched by plan-005
  - `src/entities/Projectile.ts` — projectile factory
  - `src/systems/AuraSystem.ts` — enemy/ally aura application
  - `src/systems/CombatSystem.ts` — damage and projectile system
  - `src/systems/SkillSystem.ts` — passive/active skill application
- **Repo conventions**:
  - `package.json:15-16` defines `format` (write) and `format:check` (read-only) using Prettier 3.x.
  - `.prettierrc` exists (root). Inspect it before running; match its config.
  - The pre-commit hook ([`package.json:19-27`](file:///Users/doer/dev/yoo/games/green-cycle/package.json#L19-L27)) only formats staged files, not the working tree — so a single `npm run format` invocation is needed to sweep.
- **Drift sensitivity**: this plan touches formatting only. No semantic changes, no test impact, no type changes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Format write | `npm run format` | exit 0, no output |
| Format check | `npm run format:check` | exit 0, "All matching files use Prettier code style!" |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test -- --run` | 113 tests pass (or 115 after plan-005 lands) |
| Lint | `npm run lint` | exit 0 |

## Suggested executor toolkit

None required. The executor should not invoke other skills.

## Scope

**In scope** (the only files you may modify):
- `src/entities/Effect.ts`
- `src/entities/Enemy.ts`
- `src/entities/Projectile.ts`
- `src/systems/AuraSystem.ts`
- `src/systems/CombatSystem.ts`
- `src/systems/SkillSystem.ts`
- `plans/README.md` — update the status row for plan 006 only

**Out of scope** (do NOT touch):
- All other `src/**/*.ts` files (Prettier will only touch the 6 listed, by definition; do not pass a different glob)
- `.prettierrc` — do not change the formatting rules
- `package.json` — no script changes needed; `format:check` is already wired
- `eslint.config.js` — ESLint is clean; do not preemptively tweak

## Git workflow

- Branch: `advisor/006-format-check-restore`
- Single commit. Conventional commits. Suggested message:
  - `style: reformat 6 files to satisfy prettier --check`
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Capture the pre-fix state for the post-check

Run Prettier's diff mode so you can confirm post-fix that only the expected files were touched. Save the list as a variable if useful, but the canonical record is `git status` after the fix.

```bash
npx prettier --list-different 'src/**/*.ts' | tee /tmp/prettier-before.txt
```

**Verify**: `/tmp/prettier-before.txt` contains exactly the 6 files listed in "Current state", one per line, with no other output.

### Step 2: Apply Prettier to the working tree

The repo's `npm run format` already targets the right globs:

```bash
npm run format
```

This is the only step that produces diff. Do not pass `--write` flags to a different file set; do not run `prettier --write` on individual files (avoids drift between per-file formatting and the project glob).

**Verify**: `git status` shows exactly 6 modified files matching the list from Step 1. If any other file is modified, STOP (drift — Prettier config or scope changed).

### Step 3: Confirm the format gate is now green

```bash
npm run format:check
```

**Verify**: exit 0, output ends with "All matching files use Prettier code style!" (or the equivalent success line for Prettier 3.x). No `[warn]` lines, no list of files.

### Step 4: Run the rest of the gate suite to prove no semantic regression

Because Prettier only changes whitespace, typecheck/lint/test should be unaffected. This step exists to prove it.

```bash
npm run typecheck
npm run lint
npm test -- --run
```

**Verify**: all four exit 0. If `test` count differs from 113 because plan-005 has also landed in the same branch, that is fine; what matters is "exit 0, no failures, no snapshot churn".

### Step 5: Update `plans/README.md` status row

In [plans/README.md:7-12](file:///Users/doer/dev/yoo/games/green-cycle/plans/README.md#L7-L12), append the new row for plan 006 (and the other 3 plans written in this session — see plan-005/007/008). The order table format is documented in [plans/README.md:7-12](file:///Users/doer/dev/yoo/games/green-cycle/plans/README.md#L7-L12); the new row is added by plan-005/006/007/008 collectively. This plan only updates plan 006's status cell.

**Verify**: `grep -n "006" plans/README.md` returns exactly one match in the table (the new row). The status cell reads `DONE` after this plan is executed (it is `TODO` immediately after writing).

## Test plan

No new tests. This plan is a whitespace-only change; test coverage is unchanged.

## Done criteria

- [ ] `npm run format:check` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test -- --run` exits 0
- [ ] `git status` shows exactly the 6 expected files modified, plus `plans/README.md`
- [ ] `git diff --stat` shows only whitespace/line-break changes (use `--numstat` and confirm no numeric column differs from the original aside from zero changes)
- [ ] `plans/README.md` status row for plan 006 reads `DONE`

## STOP conditions

Stop and report back (do not improvise) if:
- Step 1 lists files other than the 6 expected (config drift or new files added since this plan was written).
- Step 2 modifies files other than the 6 (Prettier scope expanded unexpectedly).
- Step 4 fails for a reason that looks semantic (not a Prettier artifact) — investigate before continuing.
- You feel tempted to "also fix" the `.prettierrc`, the `format:check` script, or the pre-commit hook. Those are out of scope and out of risk budget for this plan.

## Maintenance notes

- After this plan lands, plan-005's executor (or any subsequent one) can rely on `format:check` as a real gate. If a future commit drifts the format again, the pre-commit hook's `lint-staged` config will only fix the staged files; do not assume the hook covers the whole tree.
- The pre-commit hook in [package.json:19-27](file:///Users/doer/dev/yoo/games/green-cycle/package.json#L19-L27) does not currently include `npm run format:check` as a verification step. A follow-up plan could promote the format check into the GH Actions CI workflow so that PRs that drift the format are blocked at the gate. That is out of scope here.
- The reconcile note in [plans/README.md:60-67](file:///Users/doer/dev/yoo/games/green-cycle/plans/README.md#L60-L67) should be updated by a future `reconcile` run to record that the format gate is now green; do not edit that section as part of this plan.
