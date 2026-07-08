# Project City

An explorable 3D night city where every building is a real project from
[github.com/rhicksrad](https://github.com/rhicksrad). Built with Three.js, Vite, and
TypeScript; deployed to GitHub Pages.

**Live:** https://rhicksrad.github.io/Ryan/

## How it works

A gridded city with streets, traffic, a river with bridges, trees, and street lamps,
set in open countryside — highways lead out to the horizon through a surrounding
forest, hills, and ponds. Four districts ring a central spire, and the whole thing
is explorable in day or night (top-right toggle):

- **Arcade District** — playable browser games (SuperSolitaire, Choppa, Dot Souls, …)
- **Data Observatory** — data visualizations and dashboards (NASA hub, WAR atlas, …)
- **Creative Quarter** — music machines and art explorers (8Beat, Art API Explorer, …)
- **Web Works** — practical apps and sites (ECC Scheduler, Food Roulette, …)

**Commits are square footage.** Every building is generated procedurally from the
project's real commit count in [`content/projects.json`](content/projects.json):

| Commits | You get |
| --- | --- |
| 1–5 | a dilapidated wooden shack — leaning planks, a boarded window, junk in the yard |
| 6–24 | a modest suburban house — gable roof, porch, chimney, garage, mailbox, hedges |
| 25–59 | a large two-story house — cross-gables, a columned portico, bay window, two-car garage, driveway |
| 60–149 | a commercial mid-rise — brick facade, lit storefront and awning, fire escape, rooftop water tower |
| 150+ | a downtown skyscraper — setbacks, a glowing crown, an antenna, and Times-Square billboards |

The more you commit to a project, the taller its tower grows (NBA's 907 commits
tops the skyline). **The citizens are READMEs** — every project spawns one to three
locals who stroll around its lot; click one and they quote a line from their
project's documentation. **Recently active repos are under construction** — projects
pushed in the last 30 days get a rotating tower crane, scaffolding, and traffic
cones. Click a building to fly in and open its panel with live demo and source
links; the central spire opens the about panel.

Stats are refreshed weekly by a GitHub Action ([`update-stats.yml`](.github/workflows/update-stats.yml)),
so the city literally grows as you work.

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
