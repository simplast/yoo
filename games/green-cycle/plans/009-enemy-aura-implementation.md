# Plan 009: Implement enemy aura abilities (auraHaster haste buff)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 329df77..HEAD -- src/systems/AuraSystem.ts src/systems/MovementSystem.ts src/data/enemies.ts src/types.ts src/systems/AuraSystem.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (game balance — auraHaster appears in 8 waves starting wave 26; enemies buffed to double speed will surprise players)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `329df77`, 2026-06-22

## Why this matters

The `auraHaster` enemy (环光怪, `src/data/enemies.ts:150`) is declared with
`abilities: ['auraHaste']` and appears in late-game waves 26/28/31/34/38/42/44/48.
It is prioritized by tower targeting (`TowerAISystem.ts:90` gives it priority 1
— just below split enemies), but no system actually applies a haste buff to
nearby allied enemies. As a result, late-game waves with auraHasters play
identically to normal grunt waves, making them easier than designed and the
targeting priority meaningless.

This plan adds enemy-to-enemy aura application (initially for `auraHaste`,
with a switch scaffold for future `auraHeal`/`auraDamage`) in AuraSystem,
mirroring the existing tower→enemy debuff pattern. Buffs already support
`haste` type and MovementSystem already sums `hasteTotal`.

## Current state

Relevant files:

- `src/types.ts:50-59` — `EnemyAbility` union lists `'auraHaste' | 'auraHeal' | 'auraDamage'`
- `src/types.ts:97-103` — `BuffType` already includes `'haste'`
- `src/data/enemies.ts:150-162` — `auraHaster` definition, no aura radius/value fields yet
- `src/systems/AuraSystem.ts` — two passes: tower→enemy debuffs (lines 13-46),
  tower→tower ally buff cache (lines 48-81). No enemy→enemy pass.
- `src/systems/MovementSystem.ts:17-30` — sums `haste` from `enemy.buffs`,
  clamps speed to `enemy.speed * 2` (line 46)
- `src/utils/BuffUtil.ts` — existing `applyBuff` / `sumBuffValue` helpers used
  by CombatSystem for on-hit debuffs

Current `auraHaster` def (at `src/data/enemies.ts:150`):

```ts
auraHaster: {
  id: 'auraHaster',
  name: '光环怪',
  baseHp: 120,
  baseSpeed: 45,
  armor: 'physical',
  abilities: ['auraHaste'],
  rewardGold: 20,
  rewardWood: 2,
  rewardExp: 15,
  size: 24,
  color: '#FF5555',
},
```

Note there are no `auraRadius` / `auraValue` fields on EnemyDef; the plan adds
optional fields and only aura-ability enemies need them.

Conventions to match:

- Buff refresh pattern follows existing AuraSystem tower→enemy loop
  (`findBuff` by `(type, source)`, refresh `remaining=1.0`, push new buff
  otherwise — see `src/systems/AuraSystem.ts:33-44`).
- System signature is `update(state: GameState, dt: number): void` (all systems
  match this; see `src/systems/MovementSystem.ts:5`).
- Test style: `describe(...)/it(...)/expect(...)` with `makeState`/`makeEnemy`
  helpers from `src/test-helpers.ts`; model after
  `src/systems/AuraSystem.test.ts`.

## Commands you will need

| Purpose      | Command                        | Expected on success           |
|--------------|--------------------------------|-------------------------------|
| Typecheck    | `npm run typecheck`            | exit 0, "TypeScript: No errors found" |
| Tests        | `npm test`                     | PASS all, 0 failures          |
| Lint         | `npm run lint`                 | exit 0, "ESLint: No issues found" |
| Format check | `npm run format:check`         | "Prettier: All files formatted correctly" |
| Build        | `npm run build`                | exit 0, produces `dist/`      |

(Run from `games/green-cycle/`.)

## Scope

**In scope**:

- `src/types.ts` — add optional aura fields to `EnemyDef`
- `src/data/enemies.ts` — add radius/value to `auraHaster`
- `src/systems/AuraSystem.ts` — add enemy→enemy aura pass
- `src/render/PixelArt.ts` (optional, see step 3) — draw faint aura ring
  under enemy aura casters so players see why nearby enemies are faster
- `src/systems/AuraSystem.test.ts` — add tests for new behavior

**Out of scope**:

- Implementing `auraHeal` / `auraDamage` enemy abilities — scaffolded with a
  TODO comment and a switch branch that throws "not implemented" so a future
  wave that uses them fails loudly instead of silently no-op-ing.
- Changing tower targeting priority values (already prioritized correctly).
- Adding new aura types beyond `haste`.
- Any change to tower aura logic (tower→enemy and tower→ally).
- Any balance tuning beyond sensible defaults (see step 2); if playtesting
  shows the values are wrong that's a separate balance pass.

## Git workflow

- Branch: `advisor/009-enemy-aura`
- Conventional commits, e.g. `feat(green-cycle): implement auraHaster enemy auras`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add enemy aura fields to the type and data table

1. In `src/types.ts`, add to `EnemyDef` interface (after existing fields at
   lines 61-74):
   ```ts
   auraRadius?: number; // 光环半径（像素）；仅 abilities 含 auraXxx 时使用
   auraValue?: number;  // 光环强度：haste 为加速比例（0.3 = +30% 速度）
   ```
2. In `src/data/enemies.ts`, update `auraHaster` to include:
   ```ts
   auraRadius: 100, // 影响半径（略大于普通塔最小 range=120 的 80%）
   auraValue: 0.3,  // 范围内友方速度 +30%
   ```
   Rationale: 30% speed buff is moderate and matches the existing
   `auraHaste` tower's value (verify: `src/data/towers.ts` for auraHaste
   tower's `auraValue` — if it's different, use the same magnitude for
   consistency).

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Implement enemy→enemy aura pass in AuraSystem

Add a new section to `src/systems/AuraSystem.ts` between the enemy-debuff
loop (line 46 ends the for-const-tower loop) and the ally-aura cache
(line 48). It should mirror the existing tower→enemy debuff pattern:

1. Iterate `state.enemies` once and collect "caster" enemies (alive AND
   has an aura ability AND has auraRadius/auraValue defined). This is the
   outer loop.
2. For each caster, iterate all OTHER alive enemies and:
   - Skip self (same instanceId)
   - Distance check `(dx*dx + dy*dy) <= radius2`
   - Skip enemies already dead
   - Apply the appropriate buff depending on the ability:
     - `auraHaste`: buff type `'haste'`, value = `caster.auraValue`
     - `auraHeal` / `auraDamage`: throw new Error(
       `[AuraSystem] enemy aura ${ability} not implemented`)
       — loud failure instead of silent no-op
3. Buff source string: use `'enemy-aura:' + caster.instanceId` so auras from
   different enemy casters stack (different source → different buff entry,
   additive) while the same caster's buff is refreshed each frame.
4. Buff `remaining` = 1.0 just like tower auras, so if the caster dies or
   moves out of range, the buff expires within ~1 second.

The speed clamping in MovementSystem.ts:46 already caps at `enemy.speed * 2`,
so stacking multiple auraHasters won't make enemies impossibly fast.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: (Optional) Draw aura radius under enemy aura casters

In `src/render/PixelArt.ts` function `drawEnemy`, if the enemy has
`auraRadius` and an aura ability, draw a faint dashed ring similar to the
tower aura circle (use `hexToRgba(enemy.color, 0.05)` fill and
`hexToRgba(enemy.color, 0.18)` dashed stroke, matching the tower aura
style added in commit `329df77`). Place it before drawing the enemy body so
it doesn't occlude the enemy sprite.

If you can find `drawEnemy` easily (search for `export function drawEnemy`)
do this in ≤20 lines; otherwise skip this step and note "visualization
deferred" in the commit message.

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Add tests

Add to `src/systems/AuraSystem.test.ts` (model after existing tests):

1. `'auraHaster 给范围内友方施加 haste buff'`: create state, add one
   auraHaster and one grunt within 100px, call AuraSystem.update, assert
   `grunt.buffs` contains a `{type:'haste', value:0.3, source: expect.stringMatching(/^enemy-aura:/)}`.
2. `'范围外敌人不受光环影响'`: grunt placed >100px away → no haste buff.
3. `'死亡 caster 不施加光环'`: caster.alive=false → no buff.
4. `'第二帧刷新 buff 持续时间，不重复叠加'`: run update twice, assert
   buffs.length === 1 (same source refreshes, not stacks).
5. `'未实现的 aura 能力抛错'`: if time permits, add a test enemy with
   abilities:['auraHeal'] and assert update throws; otherwise leave for
   future.

Use `makeState('normal', false)` from `src/test-helpers.ts`, place enemies
with explicit coordinates, and run the AuraSystem update followed by
MovementSystem update (to verify speed is actually affected) in at least
one test.

**Verify**: `npm test` → all pass including the new tests. Total test
count should rise by 4-5.

### Step 5: Final verification

Run all gates:

```
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

All must exit 0.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run format:check` passes
- [ ] `npm test` exits 0; new aura tests exist and pass
- [ ] `npm run build` produces dist/ successfully
- [ ] When an auraHaster is alive on screen, enemies within 100px of it
      have `speed > baseSpeed` (verified via debug inspector or new test)
- [ ] `grep -rn "auraHeal\|auraDamage" src/systems/ --include="*.ts"` does
      not silently no-op — either implemented or throws a loud error
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated to `DONE (merge <sha>)`

## STOP conditions

Stop and report back if:

- The code at the cited locations doesn't match the excerpts (drift).
- Two attempts to add the buff pass produce double-stacking or runaway
  speed in tests.
- The optional visual aura step in PixelArt.ts takes more than ~20 lines
  — skip it and note the deferral instead of spending time.
- Adding auraRadius/auraValue to EnemyDef causes a cascade of type errors
  at existing enemy creation sites (it should be optional and safe, but
  verify).

## Maintenance notes

- If `auraHeal` or `auraDamage` enemy abilities are added later, they must
  extend the switch in Step 2. The thrown Error guards against silent
  no-ops.
- Balance: 30%/100px is a starting point. If playtesting shows late waves
  become too hard (pressure caps too quickly) or too easy (still trivial),
  tune `auraValue`/`auraRadius` directly in `enemies.ts` — no code changes
  needed.
- The `source: 'enemy-aura:X'` naming convention prevents enemy auras from
  colliding with tower auras (which use `String(tower.instanceId)` as
  source, numeric strings without prefix).
