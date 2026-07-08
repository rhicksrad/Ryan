# Project City

An explorable 3D night city where every building is a real project from
[github.com/rhicksrad](https://github.com/rhicksrad). Built with Three.js, Vite, and
TypeScript; deployed to GitHub Pages.

**Live:** https://rhicksrad.github.io/Ryan/

## How it works

A gridded night city with streets, a river with bridges, trees, street lamps, and
four districts around a central spire:

- **Arcade District** — playable browser games (SuperSolitaire, Choppa, Dot Souls, …)
- **Data Observatory** — data visualizations and dashboards (NASA hub, WAR atlas, …)
- **Creative Quarter** — music machines and art explorers (8Beat, Art API Explorer, …)
- **Web Works** — practical apps and sites (ECC Scheduler, Food Roulette, …)

**Commits are square footage.** Every building is generated procedurally from the
project's real commit count in [`content/projects.json`](content/projects.json):

| Commits | You get |
| --- | --- |
| 1–5 | a leaning shack with a crate out front |
| 6–19 | a modest house with a pitched roof and a chimney |
| 20–39 | a townhouse with lit windows and a neon awning |
| 40–99 | a McMansion — portico columns, hedges, a wing |
| 100+ | a skyscraper with Times-Square billboards advertising the project |

The more you commit to a project, the taller its tower grows (NBA's 907 commits
tops the skyline). **The citizens are READMEs** — every project spawns one to three
locals who stroll around its lot; click one and they quote a line from their
project's documentation. Click a building to fly in and open its panel with live
demo and source links; the central spire opens the about panel.

## Controls

- **Drag** to orbit, **scroll / pinch** to zoom, **click / tap** a building to select
- **Esc** closes the panel and returns to the overview
- **Project index** button lists every project as a clickable grid (also the fallback
  when WebGL is unavailable)
- District chips at the bottom fly the camera to each district
- Deep links: `#/p/<project-id>` and `#/d/<district-id>`

## Development

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run typecheck  # tsc --noEmit
npm run build      # production bundle in dist/
npm run test:e2e   # Playwright smoke test (requires npx playwright install)
```

## Adding a project

Add an entry to `content/projects.json` with an `id`, `title`, `repo`, `district`
(`arcade` | `data` | `creative` | `web`), `lang`, `commits` (real count — decides
the building tier and height), `blurb`, `quotes` (README lines the citizens recite),
and `demo` URL (or `null`). The city rebuilds itself from the data — no scene code
changes needed. To make a building grow, do more work on the project and bump its
commit count.

## Deployment

Pushes to `main` run `.github/workflows/pages.yml`: typecheck → build → size budget →
deploy to GitHub Pages.
