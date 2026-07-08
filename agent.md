# Project City Runbook

## Setup
1. Install dependencies: `npm install`
2. (For e2e tests) Install Playwright browsers: `npx playwright install --with-deps`

## Checks
1. `npm run typecheck` — TypeScript in no-emit mode
2. `npm run build` — production bundle
3. `npm run check:size` — gzipped size budget (≤ 400 KB per file, ≤ 2 MB total)
4. `npm run test:e2e` — Playwright smoke test (loads the scene, asserts HUD + canvas,
   writes `artifacts/dev-home.png`)

## Content
All projects and districts live in `content/projects.json`. The 3D city is generated
entirely from that file — see README "Adding a project".

## Deploy
Push to `main`. `.github/workflows/pages.yml` typechecks, builds, checks the size
budget, and deploys `dist/` to GitHub Pages.
