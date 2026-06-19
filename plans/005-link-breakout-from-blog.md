# Plan 005: Link Breakout from the blog navigation

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 6782e71..HEAD -- src/layouts/BaseLayout.astro`
> If `BaseLayout.astro` changed since this plan was written, compare the "Current state" excerpt against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `6782e71`, 2026-06-19

## Why this matters

The Breakout game exists at `/games/breakout/` and is copied to the build output, but no page in the blog links to it. Visitors have no way to discover the game unless they guess the URL. Adding a small navigation link surfaces the feature without changing the blog's minimalist design.

## Current state

- `src/layouts/BaseLayout.astro` — the site layout used by every page.
- Relevant excerpt today (lines 24–27):
  ```astro
  <nav class="site-nav">
    <a href="/">文章</a>
    <a href="/category">分类</a>
  </nav>
  ```
- `public/games/breakout/index.html` — the game is already built and deployed at `/games/breakout/`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Build | `npm run build` | exit 0 |
| Verify link | `grep -n "games/breakout" src/layouts/BaseLayout.astro` | shows the new link |

## Scope

**In scope**:
- `src/layouts/BaseLayout.astro`

**Out of scope**:
- The game itself (`public/games/breakout/index.html`).
- Creating a `/games/` index page.
- Any styling changes beyond what is needed for the new link to render correctly.

## Git workflow

- Branch: `advisor/005-link-breakout-from-blog`
- Commit message style: `feat(blog): add Breakout link to site navigation`
- Do NOT push unless instructed.

## Steps

### Step 1: Add the game link to the site nav

Open `src/layouts/BaseLayout.astro` and add a new anchor inside `<nav class="site-nav">`.

**Current** (lines 24–27):
```astro
<nav class="site-nav">
  <a href="/">文章</a>
  <a href="/category">分类</a>
</nav>
```
**Change**:
```astro
<nav class="site-nav">
  <a href="/">文章</a>
  <a href="/category">分类</a>
  <a href="/games/breakout/">游戏</a>
</nav>
```

**Verify**: `grep -n "games/breakout" src/layouts/BaseLayout.astro` → shows the new link.

### Step 2: Build and verify

**Verify**: `npm run build` → exit 0.

**Manual check**:
1. Run `npm run dev`.
2. Open the home page.
3. Expected: the top navigation shows 文章, 分类, 游戏.
4. Click 游戏.
5. Expected: the browser navigates to `/games/breakout/` and the game loads.

## Test plan

- No automated test framework exists. Verify by manual inspection.
- Regression cases:
  - The link appears on the home page, category pages, and post pages.
  - The link does not break the existing layout or wrapping on mobile widths.

## Done criteria

- [ ] A link to `/games/breakout/` with label `游戏` appears in `BaseLayout.astro` nav.
- [ ] `npm run build` exits 0.
- [ ] The link is visible on every page and navigates to the game.
- [ ] `plans/README.md` status row updated to DONE.

## STOP conditions

Stop and report back if:
- The excerpt in "Current state" does not match the live file.
- The link breaks the site header layout on desktop or mobile.
- The game is not reachable at `/games/breakout/` after the build.

## Maintenance notes

- If more games are added later, consider replacing the single `游戏` link with a `/games/` index page or a dropdown.
- Keep the link label short to preserve the minimalist header style.
