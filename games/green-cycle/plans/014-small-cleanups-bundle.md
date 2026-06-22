# Plan 014: Small cleanups bundle — splitter offset, dead leaks field, stale AGENT.md and AuraSystem comment

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 329df77..HEAD -- src/systems/CombatSystem.ts src/systems/MovementSystem.ts src/game/State.ts AGENT.md src/systems/AuraSystem.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding.

## Status

- **Priority**: P2
- **Effort**: S (bundle of 4 micro-fixes, each 1–10 lines)
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt / docs / minor visual bug
- **Planned at**: commit `329df77`, 2026-06-22

## Why this matters

This plan bundles four LOW-impact cleanups that are too small to deserve
their own plans but worth fixing to avoid them being re-audited forever:

1. **Splitter children snap to path** (visual glitch) — random offset
   applied on split is overwritten by MovementSystem on the next frame,
   so the "burst out of parent" effect never shows.
2. **`state.leaks` is dead code** — declared at `State.ts:114`, never read
   or written; leftover from an earlier leak-based game-over design. The
   game actually uses pressure-based loss (see EconomySystem.ts:50-52),
   not a leak counter.
3. **`AGENT.md` stale** — says tests are 44 (now 118), says 6 test files
   (now 13), references non-existent plans 012-013, and omits
   `debug/cheat.ts`, `render/UIRenderer.ts`, `utils/AssetLoader.ts` from
   the directory listing.
4. **Misleading AuraSystem file-header comment** — line 2 says "友方光环
   由 TowerAISystem 内部查询应用" but they are actually handled right
   here via `allyAuraCache` (lines 48-81).

## Current state

### Fix 1 — splitter child offset

`src/systems/CombatSystem.ts:47-58` (split logic):

```ts
if (enemy.abilities.includes('split') && !enemy._splitChild) {
  for (let i = 0; i < 2; i++) {
    const child = createEnemy(enemy.id, state.path, state.difficulty, state.enemyPool);
    child.hp = Math.floor(enemy.maxHp * 0.5);
    child.maxHp = child.hp;
    child.pathProgress = enemy.pathProgress;
    child._splitChild = true;
    // 子怪位置在父怪附近偏移，避免重叠
    child.x = enemy.x + (Math.random() - 0.5) * 20;
    child.y = enemy.y + (Math.random() - 0.5) * 20;
    state.addEnemy(child);
  }
}
```

`src/systems/MovementSystem.ts:49-58` unconditionally overwrites x/y from
`path.getPosition(pathProgress)` every frame, including the frame after
split, so the random offset is lost after one frame (one render).

### Fix 2 — dead `leaks` field

`src/game/State.ts:114`:

```ts
kills = 0;
leaks = 0;
perfectStreak = 0;
```

`grep -rn "\bleaks\b" src/` returns only the declaration line. No tests
reference it. No UI references it. (Game over uses `state.isLost` /
pressure from EconomySystem.)

### Fix 3 — AGENT.md stale

`AGENT.md:13`:
```
| 当前进度 | M10 + 里程碑一·二（plans/012-013）完成 |
```
plans/ contains 001–008b at this commit; no 012-013.

`AGENT.md:23`:
```
npm run test         # vitest run (6 files, 44 tests)
```
Actual: 13 test files, 118 tests (verified at HEAD `329df77`).

Directory tree (lines 30-45) omits:
- `src/debug/` (cheat.ts)
- `src/render/UIRenderer.ts`
- `src/utils/AssetLoader.ts`

### Fix 4 — misleading AuraSystem comment

`src/systems/AuraSystem.ts:1-2`:
```ts
// 光环系统：处理敌方光环（减速/加速敌人）
// 友方光环（auraDamage/auraHaste）由 TowerAISystem 内部查询应用
```

Lines 48-81 of the same file build `state.allyAuraCache`, and
TowerAISystem reads that cache — it does NOT "apply" ally auras itself.
TowerAISystem's only aura role is to apply `aura.damageMult/speedMult`
when computing damage/fire-rate for its own target selection/shots.

## Commands you will need

| Purpose      | Command                 | Expected on success           |
|--------------|-------------------------|-------------------------------|
| Typecheck    | `npm run typecheck`     | exit 0                        |
| Tests        | `npm test`              | all pass                      |
| Lint         | `npm run lint`          | exit 0                        |
| Format check | `npm run format:check`  | all formatted                 |
| Dead-code    | `grep -rn "\bleaks\b" src/` | after fix: zero code references |

## Scope

**In scope**:

- `src/systems/CombatSystem.ts` — splitter child initial position
- `src/systems/MovementSystem.ts` — respect a child's initial position
  for one frame (preferred approach) OR remove offset from CombatSystem
  and add a position offset field on Enemy (alternative; see steps)
- `src/game/State.ts` — delete `leaks` field
- `AGENT.md` — update numbers and directory tree
- `src/systems/AuraSystem.ts` — fix header comment

**Out of scope**:

- Adding an "enemies leaked" mechanic back (that would be a design
  change, not a cleanup).
- Adding splash/particle effects for split (nice to have, not this plan).
- Any changes to tower logic, balance, or damage.
- Generating plans/012-013 or any other plans referenced by the old
  AGENT.md line — just remove the reference.

## Git workflow

- Branch: `advisor/014-small-cleanups`
- Can be one commit: `chore(green-cycle): splitter offset fix, remove dead leaks, doc cleanups`
  or split into 4 micro-commits (preferred for bisectability):
  - `fix(green-cycle): splitter children retain spawn offset`
  - `refactor: remove unused state.leaks counter`
  - `docs: refresh AGENT.md test count, plan progress, directory tree`
  - `docs: fix stale ally-aura comment in AuraSystem`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Fix splitter child offset

Choose option A (simpler, recommended).

**Option A (recommended)**: compute path position then apply offset. In
`src/systems/CombatSystem.ts`, replace the split block lines 52-56:

```ts
child.pathProgress = enemy.pathProgress;
child._splitChild = true;
// 子怪从路径位置偏移，避免重叠；下一帧 MovementSystem 会拉回路径上
const spawnPos = state.path.getPosition(child.pathProgress);
child.x = spawnPos.x + (Math.random() - 0.5) * 20;
child.y = spawnPos.y + (Math.random() - 0.5) * 20;
```

Wait — reading MovementSystem lines 49-58 more carefully, it always sets
x/y from getPosition(pathProgress) when speed>0. This means even after
spawning, position is overwritten next frame. The "burst out" visual
needs either:
- A one-frame position offset that MovementSystem does not overwrite, or
- Accepting the offset only lasts one frame (which is what happens today
  — the offset is applied but the render at line 230 runs AFTER
  MovementSystem's update in that same frame, so the offset is
  overwritten BEFORE the first render. That's the bug.)

Look at Game.ts update order (lines 215-222): MovementSystem runs before
render. So on the spawn frame, split happens in CombatSystem (which runs
AFTER MovementSystem) — wait, let's re-read: WaveSystem → AuraSystem →
MovementSystem → TowerAISystem → CombatSystem → SkillSystem → EffectSystem.
CombatSystem runs AFTER MovementSystem. So on split frame, after
CombatSystem sets child.x/y = parent ± offset, the frame renders with
children at offset. Next frame MovementSystem sets x/y = path position.
So children DO appear offset for exactly one rendered frame. At 60fps
that's ~16ms — essentially invisible, which matches the report "random
offset is lost after one frame."

To make the offset visible for longer, either:
- **A1 (recommended, ~3 lines)**: Let newly split children NOT be
  moved by MovementSystem for `SPLIT_KNOCKBACK_TIME = 0.2` seconds. Add
  a field `splitFreeze: number = 0` to Enemy init (in createEnemy /
  reset enemy), set to 0.2 on split, decrement in MovementSystem, skip
  position overwrite while > 0. This makes the split visually pop.
  But adding a field to Enemy is more than "small cleanup."
- **A2 (simpler, recommended for THIS plan)**: Remove the random offset
  lines entirely and rely on `pathProgress` position. The "burst out"
  visual isn't critical; what's critical is that the current code
  pretends to offset but doesn't. Simpler code wins over a misleading
  no-op. Apply this option.

For this plan, choose **A2**: In CombatSystem.ts, remove (or comment out
with a "would be nice" comment) the two offset lines and replace them
with x/y set from path position, so child.x/y are consistent with
pathProgress from the start:

```ts
child.pathProgress = enemy.pathProgress;
child._splitChild = true;
const spawnPos = state.path.getPosition(child.pathProgress);
child.x = spawnPos.x;
child.y = spawnPos.y;
```

This removes the "offset that doesn't work" without adding new enemy
fields/state. If a visual burst is desired later, add it as a particle
effect (death-poof style) rather than as a position hack.

**Verify**: `npm run typecheck && npm test` → pass.

### Step 2: Remove dead `leaks` field

In `src/game/State.ts`, delete the `leaks = 0;` line (line 114). Do not
add a replacement; the pressure-based game over is the canonical loss
condition (EconomySystem.ts:50-52).

Check if the test helpers or any test initializes a `leaks` field:

```
grep -rn "leaks" src/ --include="*.ts"
```

After deletion, this must return zero matches (except possibly in
comments about removed code — if any comment references `leaks`, update
it too).

**Verify**: `npm run typecheck && npm test` → pass.

### Step 3: Update AGENT.md

Edit `AGENT.md`:

1. Line 13 (current progress): replace with
   `| 当前进度 | 008b 完成；009-014 已规划待执行 |`
   (Or, to avoid staleness from future plan numbers, replace with
   `| 当前进度 | 见 plans/README.md 状态表 |` — this is MORE durable and
   the recommended option since the status table is the source of truth.)
2. Line 23 (test command comment): change `(6 files, 44 tests)` to
   `(13 files, 118 tests)` (or `npm test` 会报告当前数量).
3. Directory tree (lines 30-45): add:
   - after `│   ├── game/                 # State.ts / Game.ts / Loop.ts`, add no change (Loop.ts may or may not exist; don't add it if it doesn't)
   - add `│   ├── debug/                # 开发者作弊 (cheat.ts)`
   - change render line to include UIRenderer: `│   ├── render/               # 像素风渲染（Entity/Map/UI/PixelArt）`
   - change utils line to include AssetLoader: `│   ├── utils/                # 工具（Path/Quadtree/Pool/AssetLoader/...）`
4. After updating, verify by `ls src/debug src/render src/utils` and
   confirm the files exist.

Do NOT over-reformat AGENT.md (keep the existing markdown table and
tree); only update the stale values.

**Verify**: visually re-read the changed AGENT.md sections; `npm run lint`
should not complain about markdown (no lint rule for it); test counts
referenced match current `npm test` output.

### Step 4: Fix AuraSystem header comment

In `src/systems/AuraSystem.ts`, replace line 2:

```ts
// 友方光环（auraDamage/auraHaste）由 TowerAISystem 内部查询应用
```

with:

```ts
// 友方光环（auraDamage/auraHaste）在此计算为 allyAuraCache，由 TowerAISystem 与 UI 读取
```

Keep line 1 as-is.

**Verify**: the comment now matches the code at lines 48-81.

### Step 5: Final verification

```
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

All exit 0.

## Test plan

No new tests (cleanups only). Existing 118 tests continue to pass. The
CombatSystem splitter tests (if any exist — check
`src/systems/CombatSystem.test.ts`) should still pass. If there's a test
that asserts split-child positions, update it to expect children at the
path position rather than at the random offset.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run format:check` passes
- [ ] `npm test` exits 0 with all 118 tests passing (or more if new tests added)
- [ ] `npm run build` succeeds
- [ ] `grep -rn "\bleaks\b" src/ --include="*.ts"` returns zero matches
- [ ] Splitter children in CombatSystem.ts have x/y set from path
      position (no more misleading random offset that gets overwritten)
- [ ] AGENT.md references accurate test count and directory entries
- [ ] AuraSystem.ts:2 comment describes allyAuraCache correctly
- [ ] Only the 5 files listed in Scope are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- If removing the random offset causes a CombatSystem splitter test to
  fail (one that asserts spawn position offset), either update the test
  to match new behavior or report back.
- If deleting `leaks` causes type errors anywhere (find all references
  first with `grep`), check whether SaveManager serializes it — if it
  does, remove it from the SaveData type too. (Inspecting
  `src/utils/SaveManager.ts` and `src/types.ts` SaveData shape before
  deleting is recommended.)
- If AGENT.md has drifted beyond what this plan describes (new sections
  added), only update the specific lines listed and leave new content
  alone.

## Maintenance notes

- When adding new test files, update the "Current progress" section in
  AGENT.md — or better, don't list counts there at all (this is why
  option "see plans/README.md" is recommended in step 3.1).
- If a proper "burst out of parent" particle/offset effect is ever
  desired, do it via EffectSystem with a short-lived visual, not by
  mutating enemy x/y on spawn.
- `state.leaks` should not be reintroduced; if a leak mechanic is added
  back, it should be its own plan that also redesigns loss conditions.
