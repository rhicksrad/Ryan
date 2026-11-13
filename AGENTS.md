This codebase is yours; what it's for and how it's built are your call, and you'll keep building on it.

# Project City runbook

Project City is Ryan Hicks's portfolio drawn as a small 3D town: every building is
one of his GitHub repos and its size is the real commit count. It exists to show
off, so the bar is: it looks good, it runs smoothly, and it is clever. Measure
frame rate and look at screenshots instead of assuming.

## Standing rules

- CI is yours. Keep `.github/workflows/ci.yml` green and fix what breaks. It runs
  on Ryan's PCs when the repo variable `CI_RUNNER` is `local`, otherwise on
  GitHub's machines. Read `tools/ci/README.md` before touching a workflow.
- Merge on green. Merging to `main` deploys the site.
- Never skip or disable a test to get green.
- Look: a modern city-builder, not a low-poly toy. Low warm sun, long shadows,
  haze on the horizon, real materials. Project buildings carry the color, signs,
  and name plates; the unnamed town (`fabric.ts`) stays quiet stone and brick so
  the projects read first. District accent color is a thin line, never a slab.
- Frame rate budget: 60 fps at 1440 x 900 on Intel integrated graphics. Measure
  with `node scripts/fps.mjs <url>` after any rendering change. Known costs:
  MSAA on the half-float target (minus a third, so it is off and FXAA is on),
  full-resolution bloom, a shadow map that redraws. Triangle count is not the
  bottleneck; filled pixels are.
- Cold start budget: the town on screen about 2 s after navigation on this PC with
  an empty shader cache, and no freeze much over 1 s. Measure with
  `node scripts/load-audit.mjs <preview url>`. Two things keep it there: shaders
  are compiled with `compileAsync` against the composer's HDR target (compile for
  the screen and every program is rebuilt on the first draw), and `weather()`
  takes its settings as uniforms so weathered materials share programs.
- Avoid the generic "AI look": no glass blur, gradient text, pill buttons, neon
  glow, emoji icons, or card grids. The interface is road signage: Overpass type,
  solid enamel plates, road-paint yellow for the one primary action, sentence case,
  specific numbers, no em dashes in copy.
- Art for posters, emblems, and backgrounds may be generated with Codex CLI on
  Ryan's machine. Style: screen-printed poster, 3 to 5 flat inks, paper grain, no
  text in the image. Pipe the prompt through stdin and tell Codex to pass it to the
  image tool word for word, or it rewrites the prompt.
- Every project has a poster: 1024 x 512 webp, a flat empty band along the bottom
  third (tower billboards letter the title there), the district color as one ink.
  `python tools/art/posters.py <raw png>` crops to 2:1 and encodes it under about
  56 KB. Raw art and the prompts used live outside the repo, in
  `..\_project-city-art\`.
- Size budget rule (`scripts/size-budget.mjs`): everything a cold visit can fetch,
  including the posters on tower billboards (projects with 150 or more commits),
  must fit in 2,000 KB gzip. Panel art, the poster of every project that is not a
  tower, is only requested when its panel opens, so it is counted apart: 80 KB per
  poster, 2,400 KB for all of it. Never move something that loads at startup into
  the panel-art bucket to make room; check with `scripts/load-audit.mjs` that a
  cold visit's transfer did not grow.

## Setup

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

## Checks (all run in CI on every pull request: `gate` then `e2e`)

```bash
npm run typecheck    # tsc --noEmit
npm test             # vitest: city plan and stats script
npm run build        # production bundle in dist/
npm run check:size   # gzip budget: 400 KB per file, 2 MB initial load, panel art apart
npm run test:e2e     # Playwright, desktop and phone, against the built site
```

`npm run ci` runs all five in order. For e2e in a sandbox with a preinstalled
Chromium, set `PW_CHROMIUM` to its path (Edge works). If port 4173 or 5173 is
already taken on a shared PC, set `E2E_PORT`, or start the dev server with
`npx vite --port <free port> --strictPort`.

Judge the look from real screenshots, by day and by night, at the opening view, at
street level, with a project panel open, and at phone size. The Claude desktop
app's browser pane stops animating when the app window is not on screen, so its
screenshots can be stale; `scripts/probe.mjs` is the reliable way to look.

## Where things live

- `content/projects.json`: profile, districts, projects, and the `ignore` list.
  The town is generated entirely from this file.
- `scripts/update-stats.mjs`: refreshes commit counts and push dates from the
  GitHub API and adds repos it has not seen (`auto: true`). Runs weekly
  (`update-stats.yml`) and at every deploy (`pages.yml`). Repos matching `ignore`
  are skipped. Entries marked `estimated: true` hold placeholder counts until the
  script replaces them.
- `src/world/cityplan.ts`: pure layout. Grid size follows the project count,
  districts are wedges around the plaza, spare blocks become parks. The project
  grid (`plan.core`) is wrapped in one ring of `fabric` blocks, and `plan.fillers`
  lists every unnamed building.
- `src/world/buildings.ts`: one builder per commit tier; towers have five crowns.
- `src/world/fabric.ts`: the unnamed town, drawn from `plan.fillers` with a
  handful of shared materials.
- `src/world/walkers.ts`: pedestrians lapping their block's sidewalk, one
  instanced mesh. The README-quoting citizens in `people.ts` are separate.
- The hills are not geometry: three ridgelines are painted in the sky shader
  (`rangeOver` in `environment.ts`), and the terrain fades into the fog color
  before its edge. The sky dome is drawn last (`renderOrder`) so covered pixels
  are skipped; keep it that way, the sky shader is the costliest per pixel.
- Growth: every baked vertex carries a `grow` attribute (0 for the standing town,
  otherwise when its project was created along the town's history) and the shared
  `growClock` in `surface.ts` raises buildings as it passes. Any new material used
  on a project building must be weathered or wrapped in `growable()`, or it will
  float while the building is still flat. `CityWorld.playGrowth` runs the clock.
- `src/world/surface.ts`: `weather(material, opts)` gives any standard material
  world-space grain, patches, darker wall bases, and roof courses from one shared
  noise tile. Use it instead of adding textures. Not for things that move.
- `src/assets/sky/`: the painted sky strips (azimuth across, elevation +90 at the
  top row to -10 at the bottom), taken from `Choppa2/assets/generated/sky`. Fog,
  image-based lighting, and water colors in `CityWorld.ts` are sampled from them;
  change the painting and those must follow. The painting never lights the town;
  only tower glass mirrors it.
- `src/world/environment.ts`: painted sky dome, painted countryside, blocks, roads,
  water shader, trees, town hall, lamps. `textures.ts`: facades, posters, signs, labels.
- `src/world/bake.ts`: merges static meshes into a few draw calls, including each
  material group of a multi-material mesh. Mark anything that moves with
  `userData.dynamic`; it is also kept out of the static shadow map.
- `src/world/CityWorld.ts`: renderer, lighting constants (`DAY`, `NIGHT`), camera,
  day and night, labels, picking, adaptive resolution.
- `scripts/sweep.mjs <url> <dir> [day|night] [desktop|phone]`: one screenshot of
  every project's close-up. Run it after touching the camera, the plan, or any
  building, and look at all forty: a click lands a visitor on one of these, and the
  small ones break first. `CityWorld.focusProject` picks the bearing by scoring
  sight lines against `this.obstacles`; anything tall and new belongs in that list.
- `scripts/shots.mjs`, `probe.mjs`, `fps.mjs`: screenshots and frame rate through
  the system Edge. `probe.mjs` runs a snippet against the live world first, for
  example to move the camera with `debug.view(...)`.
- `src/ui.ts`, `css/styles.css`, `index.html`: the signage interface.
- `tools/ci/`: runner setup script, the hook that refuses fork pull requests,
  and the CI manual.
- `src/assets/art/`: `poster-<project id>.webp` appears on that tower's billboards
  and panel; `emblem-<district id>.webp` appears on district signs and chips. Files
  are found by name, no code change needed.

## Deploy

Merge to `main`. `.github/workflows/pages.yml` refreshes stats, typechecks, tests,
builds, checks the size budget, and publishes `dist/` to GitHub Pages at
https://rhicksrad.github.io/Ryan/.
