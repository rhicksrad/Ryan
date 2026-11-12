# Project City

An explorable 3D town where every named building is a real project from
[github.com/rhicksrad](https://github.com/rhicksrad). Built with Three.js, Vite, and
TypeScript; deployed to GitHub Pages.

**Live:** https://rhicksrad.github.io/Ryan/

## How it works

A river town, generated from [`content/projects.json`](content/projects.json).
Four districts sit around a central plaza and its clock tower, the grid grows with
the number of projects, and any block without a project becomes a park. Every
building with a name plate is a real project. The quiet stone and brick buildings
around them, and the ring of neighbourhood blocks at the edge, are the ordinary
town that grew up around the projects: no sign, no label, not clickable. Beyond
that are farm fields, woods, a ring road, and painted ranges of hills fading into
the haze. Traffic runs, a couple of hundred pedestrians walk their blocks, the town hall clock keeps your local time, and the whole
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
| 150+ | a downtown tower, one of five designs, on a stone podium with rooftop posters |

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
- **Directory** lists every project; type to filter it, Enter flies to the first match
  (it is also the fallback when WebGL is unavailable)
- **Keyboard**: Left and Right step through projects from the biggest down, **T** tour,
  **N** night and day, **D** directory, **H** whole town
- District chips fly the camera to each district; the city-limit sign opens the about panel
- Deep links: `#/p/<project-id>` and `#/d/<district-id>`

## Rendering and performance

A low afternoon sun with long shadows under a painted sky: two panoramas from
PERSIAN STRIKE (one of the projects in the town) wrap the dome by day and by
night, dissolve into haze at the horizon, and are mirrored in the towers' glass.
Flat colors are weathered in world space by one shared noise tile
(`src/world/surface.ts`): grain, broad patches, darker wall bases, roof courses.
There is a shared water shader and HDR bloom through a half-float `EffectComposer`. It holds 60 frames a second at 1440 x 900 on Intel
integrated graphics, because:

- Static geometry is merged at load (`src/world/bake.ts`): about 300 draw calls.
- The sun never moves, so the 4096 shadow map is drawn at load and then left alone.
- Anti-aliasing is FXAA on the finished image. Multisampling the HDR target cost a
  third of the frame rate.
- Bloom runs at a quarter of the pixels.
- Trees, lamps, and crosswalks are instanced; the countryside is one painted texture.
- If the frame rate still sags, the renderer steps its resolution down.

## Design

The interface borrows from road signage instead of app chrome: a city-limit sign
for a masthead, white regulatory plates for actions, green street blades for the
districts, Overpass (the open highway-sign typeface), and road-paint yellow for the
one primary action. The posters on the big towers, the
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

Three small tools help when working on the look (they drive the system Edge, so
nothing is downloaded):

```bash
node scripts/shots.mjs <url> <out dir> <prefix>   # opening view, day and night, desktop and phone
node scripts/probe.mjs <url> <out.png> [day|night] [desktop|phone] ["js run against world"]
node scripts/fps.mjs <url>                        # real frame rate in a visible window
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
