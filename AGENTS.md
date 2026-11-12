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
- Avoid the generic "AI look": no glass blur, gradient text, pill buttons, neon
  glow, emoji icons, or card grids. The interface is road signage: Overpass type,
  solid enamel plates, road-paint yellow for the one primary action, sentence case,
  specific numbers, no em dashes in copy.
- Art for posters, emblems, and backgrounds may be generated with Codex CLI on
  Ryan's machine. Style: screen-printed poster, 3 to 5 flat inks, paper grain, no
  text in the image. Pipe the prompt through stdin and tell Codex to pass it to the
  image tool word for word, or it rewrites the prompt.

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
npm run check:size   # gzip budget: 400 KB per file, 2 MB total
npm run test:e2e     # Playwright, desktop and phone, against the built site
```

`npm run ci` runs all five in order. For e2e in a sandbox with a preinstalled
Chromium, set `PW_CHROMIUM` to its path.

## Where things live

- `content/projects.json`: profile, districts, projects, and the `ignore` list.
  The town is generated entirely from this file.
- `scripts/update-stats.mjs`: refreshes commit counts and push dates from the
  GitHub API and adds repos it has not seen (`auto: true`). Runs weekly
  (`update-stats.yml`) and at every deploy (`pages.yml`). Repos matching `ignore`
  are skipped. Entries marked `estimated: true` hold placeholder counts until the
  script replaces them.
- `src/world/cityplan.ts`: pure layout. Grid size follows the project count,
  districts are wedges around the plaza, spare blocks become parks.
- `src/world/buildings.ts`, `environment.ts`, `textures.ts`: procedural geometry
  and canvas textures.
- `src/world/bake.ts`: merges static meshes into a few draw calls. Mark anything
  that moves with `userData.dynamic`.
- `src/world/CityWorld.ts`: renderer, camera, day and night, labels, picking,
  adaptive resolution.
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
