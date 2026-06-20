# Yoo — Agent Guidelines

> Single-file agent briefing for the Yoo blog and its embedded games.
> Keep commands copy-paste ready and examples concrete.

## Project Overview

Yoo is a minimal, content-first personal blog built with Astro 4 + TypeScript, deployed as static HTML to Cloudflare Pages. Hosts two embedded games: a Vite-built tower defense (`green-cycle`) and a pure HTML/JS Breakout (`breakout`).

## Quick Commands

```bash
npm install          # Install deps
npm run dev          # Astro dev server → http://localhost:4321
npm run build        # Build games + Astro → dist/
npm run preview      # Preview production build
npm run build && npx wrangler pages deploy dist  # Deploy manually
```

## Project Structure

```
├── public/                     # Static assets (favicon, games)
│   └── games/
│       ├── breakout/           # Pure HTML/JS (no build)
│       └── green-cycle/        # Vite build output (gitignored)
├── games/green-cycle/          # Vite + TS tower defense sub-project
│   ├── src/                    # ECS-lite: State + 8 systems + data tables
│   ├── docs/                   # Completed milestones & roadmap
│   ├── plans/                  # Implementation plans (001-013, all DONE)
│   └── AGENT.md                # Game-specific agent guide
├── src/
│   ├── consts.ts               # SITE_TITLE, SITE_DESCRIPTION
│   ├── content/posts/          # Markdown articles
│   ├── layouts/                # BaseLayout, PostLayout
│   ├── pages/                  # index, posts, category, series, games
│   └── styles/global.css       # Theme variables + all styles
├── astro.config.mjs
├── package.json                # build = build:games + astro build
└── wrangler.toml               # Cloudflare Pages config
```

## Writing Posts

Create `.md` in `src/content/posts/`:

```markdown
---
title: '文章标题'
description: '显示在列表的摘要'
pubDate: 2026-06-20
updatedDate: 2026-06-21
category: 'AI 工程'
tags: ['Agent', 'LLM']
series: 'Agent 工程实战'
seriesOrder: 1
draft: false
---
```

| Field | Required | Default | Note |
|-------|----------|---------|------|
| `title` | yes | — | — |
| `description` | no | — | List view summary |
| `pubDate` | yes | — | `YYYY-MM-DD` |
| `updatedDate` | no | — | Shown next to pubDate |
| `category` | no | `未分类` | Links to `/category/<name>` |
| `tags` | no | `[]` | Inline tags |
| `series` | no | — | Groups at `/series/<name>` |
| `seriesOrder` | no | — | Enables prev/next nav |
| `draft` | no | `false` | Excluded from build |

## Routing

| Route | File | Purpose |
|-------|------|---------|
| `/` | `pages/index.astro` | Post list |
| `/posts/<slug>/` | `pages/posts/[...slug].astro` | Article |
| `/category/` `/category/<name>/` | `pages/category/` | Category index + detail |
| `/series/` `/series/<name>/` | `pages/series/` | Series index + detail |
| `/games/` | `pages/games/index.astro` | Game lobby |
| `/games/green-cycle/` | `public/games/green-cycle/` | Built TD game |
| `/games/breakout/` | `public/games/breakout/` | Static Breakout |

## Game Development

### Green Cycle (Tower Defense)

Sub-project at `games/green-cycle/`. See [games/green-cycle/AGENT.md](games/green-cycle/AGENT.md) for architecture, milestones, and execution plans.

```bash
cd games/green-cycle
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run build        # → public/games/green-cycle/
```

### Breakout

Static files at `public/games/breakout/`. No build step. Edit directly.

### Adding a Game

1. Static → `public/games/<name>/`; built → sub-project under `games/<name>/` with `outDir` pointing to `../../public/games/<name>/`.
2. Add entry to `src/pages/games/index.astro`.
3. If build step, append to root `build:games` script.
4. Gitignore the generated `public/games/<name>/`.

## Theme & Styling

- All styles in `src/styles/global.css`. CSS variables drive light/dark mode via `prefers-color-scheme: dark`.
- Key variables: `--color-bg`, `--color-text`, `--color-border`, `--color-accent`, `--max-width`.
- Copy button in `PostLayout.astro` is the only intentional client JS.

## Deployment

Push to GitHub → Cloudflare Dashboard → Pages.
- Framework preset: `Astro`
- Build command: `npm run build`
- Output dir: `dist`
- Env: `NODE_VERSION=18`

## Conventions

- **No client JS unless necessary.** Astro outputs static HTML.
- **One CSS file.** Add `<style>` blocks in `.astro` only when unavoidable.
- **Absolute paths** for assets: `/favicon.svg`, `/games/breakout/`.
- **Chinese category names** where content is Chinese; avoid special chars in URLs.
- **Validate dates:** `pubDate` must be `YYYY-MM-DD`.
- **Do not commit build outputs.** `public/games/green-cycle/` is gitignored.
- **Run `npm run build` before finishing** non-trivial changes.

## Common Tasks

| Task | Steps |
|------|-------|
| Add a post | Create `.md` in `src/content/posts/`; verify with `npm run dev` |
| Change site title/desc | Edit `src/consts.ts` |
| Change site URL | Edit `astro.config.mjs` `site` |
| Change theme | Edit CSS variables in `src/styles/global.css` |
| Update game lobby | Edit `games` array in `src/pages/games/index.astro` |
| Update green-cycle | Work in `games/green-cycle/`, run `npm run build` at root |

## Troubleshooting

- **Build fails after adding a post:** Check date format and required fields in `src/content/config.ts`.
- **Game not showing:** Ensure listed in `src/pages/games/index.astro` and output exists in `public/games/`.
- **green-cycle changes not reflected:** Run `npm run build:games` (or `npm run build`).