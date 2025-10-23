# Ryan 3D World Runbook

## Setup
1. Install dependencies: `npm install`
2. Install Playwright browsers: `npx playwright install --with-deps`

## Test & Build Checks
1. Run the Playwright smoke test and generate the screenshot: `npm run test:ci`
2. Validate the screenshot size budget explicitly: `npm run verify:screenshot`

## Success Evidence
![Dev server home](artifacts/dev-home.png)

> The screenshot is produced by running `npm run test:ci` and is intentionally not committed to the repository.

## Checklist
- [ ] `artifacts/dev-home.png` exists after tests finish
- [ ] `artifacts/dev-home.png` is larger than 40 KB (automatically enforced by `npm run verify:screenshot`)
- [ ] `npm run verify:screenshot` exits with code 0

> ⚠️ Fail the run if the screenshot is missing or smaller than 40 KB.
