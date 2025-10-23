# Ryan 3D World

An interactive Three.js portfolio that orbits five themed islands around Ryan's world. The experience is built with Vite, TypeScript, and Playwright smoke tests so it can ship confidently to GitHub Pages.

## Features

- Perspective camera with smooth orbit controls and route-aware camera rig
- Five low-poly islands with custom interactions, instanced details, and responsive HTML labels
- Overlay and HUD fed by `content/profile.json` with accessible navigation and deep links
- Prefers-reduced-motion and mute state persistence
- Automated Playwright smoke test that captures a screenshot artifact
- GitHub Actions workflow that runs tests, checks size budgets, and deploys to Pages

## Getting started

```bash
npm install
npm run dev
```

Visit http://localhost:5173 to explore the world. If WebGL is unavailable, the app redirects to a static fallback page with the same content.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run dev:ci` | Start the dev server on 127.0.0.1:5173 for CI |
| `npm run build` | Build the production bundle |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Run TypeScript in no-emit mode |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run verify:screenshot` | Ensure the Playwright screenshot exists and is > 40 KB |
| `npm run check:size` | Check gzipped bundle sizes against the budget |
| `npm run test:ci` | Run Playwright tests and screenshot verification |
| `npm run ci` | Run tests, build, and size checks sequentially |

## Testing

The Playwright suite spins up the dev server, waits for the scene to announce readiness via `data-test-ready="1"`, asserts key HUD elements, and writes a full-page screenshot to `artifacts/dev-home.png` (generated at test time and omitted from git).

```bash
npm run test:ci
```

After the tests complete you can double-check the screenshot budget enforcement with:

```bash
npm run verify:screenshot
```

## Size budget

`scripts/size-budget.mjs` gzips each built asset in memory and enforces two limits:

- ≤ 400 KB per gzipped file
- ≤ 2 MB total gzipped bundle size

The script prints a report and exits non-zero if the budget is exceeded.

## Continuous integration & deployment

`.github/workflows/ci.yml` defines three jobs:

1. **test** – installs dependencies, runs Playwright (with browsers) and uploads the screenshot/report artifacts
2. **build** – depends on the test job, builds the app, checks size budgets, and uploads the dist folder for Pages
3. **deploy** – runs on pushes to `main` to publish the uploaded build with GitHub Pages

To deploy from your fork, enable GitHub Pages and ensure the workflow has the required permissions (`pages: write`, `id-token: write`).

## Content updates

All overlay and fallback content is sourced from [`content/profile.json`](content/profile.json). Update that single file to change the HUD labels, overlay lists, and fallback page.

## Accessibility & keyboard controls

- Focusable HTML labels mirror every 3D hotspot
- Press `1`–`5` to jump between islands
- Press `H` or `Escape` to return home
- Motion and audio preferences persist between sessions

Enjoy exploring! 🎛️
