# Yoo — Agent Guidelines

> Single-file agent briefing for the Yoo blog and its embedded games.
> Keep commands copy-paste ready and examples concrete.

## Project Overview

Yoo is a minimal, content-first personal blog built with Astro 4 and TypeScript, deployed as static HTML to Cloudflare Pages. It also hosts two small games: a Vite-built tower defense (`green-cycle`) and a pure HTML/JS Breakout (`breakout`).

## Agent Role

You are the primary maintainer for this repo. Expect to:

- Write and edit Markdown posts in `src/content/posts/`
- Adjust styles/theme in `src/styles/global.css`
- Extend pages under `src/pages/` using Astro content collections
- Maintain the Breakout game in `public/games/breakout/`
- Maintain the Green Cycle tower defense in `games/green-cycle/`
- Deploy via Cloudflare Pages

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Framework | Astro `^4.16.0` | Static site, zero client JS by default |
| Language | TypeScript `^5.4.0` | Strict Astro tsconfig |
| Styling | Plain CSS | Theme variables in `src/styles/global.css` |
| Build tool | Vite `^5.2.0` | Used for the green-cycle game sub-project |
| Deploy | Cloudflare Pages | `dist/` output, see `wrangler.toml` |

## Quick Commands

```bash
# Install dependencies
npm install

# Start blog dev server
npm run dev          # http://localhost:4321

# Build everything (games + blog)
npm run build        # outputs to dist/

# Preview production build
npm run preview

# Deploy manually
npm run build && npx wrangler pages deploy dist
```

## Project Structure

```
├── public/                         # Static assets served as-is
│   ├── favicon.svg
│   └── games/
│       ├── breakout/               # Pure HTML/JS game (no build step)
│       └── green-cycle/            # vite build output (gitignored)
├── games/
│   └── green-cycle/                # Vite + TypeScript tower defense
│       ├── src/
│       ├── docs/
│       ├── AGENT.md                # Game-specific agent guide
│       ├── package.json
│       └── vite.config.ts
├── plans/                          # Implementation plan files
├── src/
│   ├── consts.ts                   # SITE_TITLE, SITE_DESCRIPTION
│   ├── content/
│   │   ├── config.ts               # Posts collection schema
│   │   └── posts/                  # Markdown articles
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   └── PostLayout.astro
│   ├── pages/
│   │   ├── index.astro             # Home / post list
│   │   ├── posts/[...slug].astro   # Article pages
│   │   ├── category/               # Category index + detail
│   │   ├── series/                 # Series index + detail
│   │   └── games/index.astro       # Game lobby
│   └── styles/global.css           # Theme variables + all styles
├── astro.config.mjs                # site URL, Shiki theme
├── package.json                    # build = build:games + astro build
├── tsconfig.json
└── wrangler.toml                   # Cloudflare Pages config
```

## Writing Posts

Create a `.md` file in `src/content/posts/`:

```markdown
---
title: '文章标题'
description: '显示在列表的摘要'
pubDate: 2026-06-20
updatedDate: 2026-06-21
category: 'AI 工程'
tags: ['Agent', 'LLM']
series: 'Agent 工程实战'   # optional
seriesOrder: 1             # optional, used for prev/next navigation
draft: false
---

正文内容…
```

Frontmatter schema is enforced in `src/content/config.ts`.

| Field | Required | Default | Note |
|-------|----------|---------|------|
| `title` | yes | — | Article title |
| `description` | no | — | Shown in list views |
| `pubDate` | yes | — | `YYYY-MM-DD` |
| `updatedDate` | no | — | Shown next to publish date |
| `category` | no | `未分类` | Links to `/category/<name>` |
| `tags` | no | `[]` | Inline tags in post header |
| `series` | no | — | Groups articles at `/series/<name>` |
| `seriesOrder` | no | — | Sort order within a series; enables prev/next nav |
| `draft` | no | `false` | Drafts are excluded from build |

## Routing & Pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `src/pages/index.astro` | Post list, newest first |
| `/posts/<slug>/` | `src/pages/posts/[...slug].astro` | Article detail |
| `/category/` | `src/pages/category/index.astro` | All categories |
| `/category/<name>/` | `src/pages/category/[category].astro` | Posts in one category |
| `/series/` | `src/pages/series/index.astro` | All series |
| `/series/<name>/` | `src/pages/series/[series].astro` | Ordered posts in one series |
| `/games/` | `src/pages/games/index.astro` | Game lobby |
| `/games/green-cycle/` | `public/games/green-cycle/index.html` | Built tower defense |
| `/games/breakout/` | `public/games/breakout/index.html` | Static Breakout |

## Game Development

### Green Cycle (Tower Defense)

Source lives in `games/green-cycle/`. It is a separate npm project.

```bash
cd games/green-cycle
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run build        # outputs single-file to public/games/green-cycle/
```

The Vite config (`vite.config.ts`) bundles everything into one inlined `index.html` at `public/games/green-cycle/`. That directory is gitignored.

See `games/green-cycle/AGENT.md` for game-specific architecture and roadmap.

### Breakout

Source is the static files under `public/games/breakout/`:

```
public/games/breakout/
├── index.html
└── js/
    ├── audio.js
    ├── config.js
    ├── entities.js
    ├── game.js
    ├── input.js
    └── state.js
```

No build step. Edit directly. Keep it dependency-free.

### Adding or Updating a Game

1. Place static games under `public/games/<name>/`.
2. For built games, create a sub-project under `games/<name>/` and configure `outDir` to `../../public/games/<name>/`.
3. Add the entry to `src/pages/games/index.astro`.
4. If the game has a build step, append it to the root `build:games` script.
5. Gitignore the generated `public/games/<name>/` directory.

## Theme & Styling

- All styles are in `src/styles/global.css`.
- CSS variables drive light/dark mode via `prefers-color-scheme: dark`.
- Key variables: `--color-bg`, `--color-text`, `--color-border`, `--color-accent`, `--max-width`.
- The copy button in `PostLayout.astro` is the only intentional client-side script on article pages.

## Deployment

### Git Auto Deploy (Preferred)

Push to GitHub/GitLab and connect the repo in Cloudflare Dashboard → Pages.

Build settings:

- Framework preset: `Astro`
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `NODE_VERSION=18`

### Wrangler CLI

```bash
npm run build
npx wrangler pages deploy dist
```

`wrangler.toml` already sets `pages_build_output_dir = "dist"`.

## Conventions & Guardrails

- **No client JS on pages unless necessary.** Astro outputs static HTML by default.
- **Keep styles in one file.** Add page-specific styles via `<style>` blocks in `.astro` files only when unavoidable.
- **Use absolute paths for assets.** e.g. `/favicon.svg`, `/games/breakout/`.
- **Category names in Chinese** where the content is Chinese; avoid special characters in URLs.
- **Validate dates:** `pubDate` must be `YYYY-MM-DD`.
- **Do not commit build outputs.** `public/games/green-cycle/` and Astro outputs are gitignored.
- **Run `npm run build` before finishing** any non-trivial change to catch Astro/Vite errors early.

## Common Tasks

| Task | Steps |
|------|-------|
| Add a post | Create `.md` in `src/content/posts/` with frontmatter; verify with `npm run dev` |
| Add a category | Set `category` in post frontmatter; pages are generated automatically |
| Add a series | Set `series` + `seriesOrder` on related posts; pages are generated automatically |
| Change site title/description | Edit `src/consts.ts` |
| Change site URL | Edit `astro.config.mjs` `site` field |
| Change theme colors | Edit CSS variables in `src/styles/global.css` |
| Update game lobby | Edit the `games` array in `src/pages/games/index.astro` |
| Update green-cycle | Work in `games/green-cycle/`, then run `npm run build` at repo root |

## Troubleshooting

- **Build fails after adding a post:** Check frontmatter date format and required fields in `src/content/config.ts`.
- **Game not showing:** Ensure it is listed in `src/pages/games/index.astro` and the output directory exists under `public/games/`.
- **green-cycle changes not reflected:** Remember to run `npm run build:games` (or `npm run build`) so the built output is regenerated.
