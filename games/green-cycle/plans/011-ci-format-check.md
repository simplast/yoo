# Plan 011: Add format:check to CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 329df77..HEAD -- ../../.github/workflows/ci.yml package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (one CI step addition; format:check must already pass locally)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `329df77`, 2026-06-22

## Why this matters

Prettier drift has already regressed twice: plans 006 documented that
`npm run format:check` failed in 6 files after plan 004 (CI) landed without
format enforcement, and drift continues to appear when lint-staged is
bypassed (e.g., `git commit --no-verify`, web-editor commits, merges).
Currently `.github/workflows/ci.yml` runs `typecheck`, `lint`, `test`, and
`build`, but not `format:check`. Adding the gate is one step and prevents
future "format 6 files" commits obscuring real changes.

## Current state

CI file at `games/green-cycle/../../.github/workflows/ci.yml` (i.e.
`.github/workflows/ci.yml` from repo root):

```yaml
      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
```

`package.json` script `format:check` exists (line 16):
`"format:check": "prettier --check 'src/**/*.ts' '*.json' '*.js' '*.ts'"`.

`working-directory: games/green-cycle` is set as a job-level default, so
all `run:` steps execute in `games/green-cycle/`.

Baseline status verified: `npm run format:check` currently outputs
"Prettier: All files formatted correctly" on HEAD `329df77`.

## Commands you will need

| Purpose        | Command                 | Expected on success           |
|----------------|-------------------------|-------------------------------|
| Local format   | `npm run format:check`  | "All files formatted correctly" |
| Local format   | `npm run format`        | rewrites files if drift found |
| Typecheck      | `npm run typecheck`     | exit 0                        |

## Scope

**In scope**:

- `.github/workflows/ci.yml` (one step added)

**Out of scope**:

- `package.json` scripts (already correct).
- ESLint / prettier config changes.
- Formatting any source files (baseline is already clean).
- Changes to other CI jobs (only one job `verify` exists).

## Git workflow

- Branch: `advisor/011-ci-format-check`
- Commit: `ci(green-cycle): run prettier format:check in CI`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the Format check step to CI

Insert a Format check step between Lint and Test in
`.github/workflows/ci.yml`, matching the style of the existing steps:

```yaml
      - name: Lint
        run: npm run lint

      - name: Format check
        run: npm run format:check

      - name: Test
        run: npm test
```

The ordering (after lint, before test/build) matches the standard
typecheck→lint→format→test→build progression and fails fast on cheap,
non-destructive checks.

**Verify**: run `npm run format:check` locally → "All files formatted
correctly". Run `npm run typecheck && npm run lint && npm test` → all exit 0.

### Step 2: Verify the YAML is valid

Run a quick YAML parse (use `node -e "console.log(JSON.stringify(require('js-yaml').load(require('fs').readFileSync('../../.github/workflows/ci.yml','utf8')), null, 2))"`
if `js-yaml` is available, otherwise visually inspect that indentation
matches the other steps (2 spaces under `steps:` for `- name:`, 4 spaces
for `run:`).

**Verify**: visually, the new step is a sibling of Typecheck/Lint/Test/Build
and uses the same indentation.

## Test plan

No new tests needed (CI configuration change). To verify CI parses the
file correctly after push/merge, check the Actions tab on the next push.
Pre-merge verification is via running the command locally.

## Done criteria

- [ ] `npm run format:check` exits 0 locally
- [ ] `npm run typecheck && npm run lint && npm test && npm run build` all pass
- [ ] `.github/workflows/ci.yml` has the new Format check step between
      Lint and Test
- [ ] No source files modified (only `ci.yml`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- If `npm run format:check` is NOT currently clean on the working tree
  (i.e., drift exists at time of execution), run `npm run format` to fix
  it, include the formatted files in a separate commit BEFORE the CI
  change commit, and note the files changed in the PR. Do NOT leave a
  red baseline.
- If other CI steps exist that this plan didn't mention (e.g., a future
  deploy job), place format:check in the verify job only — don't add it
  to deploy/release jobs.

## Maintenance notes

- If future file types are added (e.g., `.css`, `.html` source files),
  update the `format:check` script glob in `package.json`, not the CI
  step.
- Developers who hit a CI format failure should run `npm run format`
  locally and commit the result.
