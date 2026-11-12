# Project City

An explorable 3D town where every building is a real project from
[github.com/rhicksrad](https://github.com/rhicksrad). Built with Three.js, Vite, and
TypeScript; deployed to GitHub Pages.

**Live:** https://rhicksrad.github.io/Ryan/

## How it works

A small river town, generated from [`content/projects.json`](content/projects.json).
Four districts sit around a central plaza, the grid grows with the number of
projects, and any block without a project becomes a park. Outside town there is a
ring road, forest, hills, and ponds. Traffic runs, residents walk, and the whole
place works by day or by night.

- **Arcade District**: playable browser games
- **Data Observatory**: data visualizations and dashboards
- **Creative Quarter**: music machines and art explorers
- **Web Works**: practical apps and sites

**Commits are square footage.** Each building comes from its repo's real commit count:

| Commits | You get |
| --- | --- |
| 1 to 5 | a leaning wooden shack with junk in the yard |
| 6 to 24 | a modest house with a porch and a garage |
| 25 to 59 | a large two-story house with a portico |
| 60 to 149 | a brick mid-rise with a storefront and a water tower |
| 150+ | a downtown tower, one of four designs, with billboards |

Tower height follows the logarithm of the commit count, so the busiest repo owns
the skyline without flattening everything else. **The citizens are READMEs**: each
project has one to three residents who quote its documentation when clicked.
**Recently pushed repos are under construction**, with a crane on towers and
scaffolding on houses. Empty lots carry a "Lot for sale, `$ git init`" board.

**The town keeps itself current.** A GitHub Action
([`update-stats.yml`](.github/workflows/update-stats.yml)) runs weekly, and again on
every deploy, to refresh commit counts and to add any new public repo as a building,
with a title, blurb, and district drafted from its README. Repos listed under
`ignore` in `projects.json` stay out.

## Controls

- **Drag** to orbit, **scroll or pinch** to zoom, **click or tap** a building to visit
- **Esc** closes the panel and returns to the overview
- **Tour** flies through the twelve biggest projects
- **Directory** lists every project (also the fallback when WebGL is unavailable)
- District chips fly the camera to each district; the city-limit sign opens the about panel
- Deep links: `#/p/<project-id>` and `#/d/<district-id>`

## Rendering and performance

Soft sun shadows, HDR bloom through an MSAA half-float `EffectComposer`, image-based
lighting, and distance fog scaled to the size of the town. Static geometry is merged
at load (`src/world/bake.ts`), which cut draw calls from about 5,400 to about 800.
Trees, lamps, and crosswalks are instanced, shadows update every other frame, and
the renderer lowers its resolution if the frame rate sags.

## Design

The interface borrows from road signage instead of app chrome: a city-limit sign
for a masthead, Overpass (the open highway-sign typeface), solid enamel plates, and
road-paint yellow for the one primary action. The posters on the big towers, the
district emblems, and the loading-screen blueprint are screen-print style art in
`src/assets/art/`. Name a file `poster-<project id>.webp` or
`emblem-<district id>.webp` and it is picked up automatically.

## Development

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run typecheck  # tsc --noEmit
npm test           # unit tests (vitest)
npm run build      # production bundle in dist/
npm run check:size # gzip size budget
npm run test:e2e   # Playwright on desktop and phone (npx playwright install chromium)
npm run stats      # refresh projects.json from the GitHub API
```

Every pull request runs all of the above in [`ci.yml`](.github/workflows/ci.yml),
on self-hosted runners when they are switched on. See [`tools/ci/README.md`](tools/ci/README.md).

## Adding a project

Push a public repo and wait for the next refresh, or add an entry to
`content/projects.json` by hand with an `id`, `title`, `repo`, `district`
(`arcade` | `data` | `creative` | `web`), `lang`, `commits`, `blurb`, `quotes`
(README lines the residents recite), and `demo` URL (or `null`). No scene code
changes are needed.

## Deployment

Merging to `main` runs `.github/workflows/pages.yml`: refresh stats, typecheck,
test, build, size budget, deploy to GitHub Pages.
