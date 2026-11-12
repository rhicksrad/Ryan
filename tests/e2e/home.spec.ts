import { test, expect, type Page } from '@playwright/test';
import fs from 'fs/promises';
import raw from '../../content/projects.json' assert { type: 'json' };

const projects = raw.projects;

async function ready(page: Page, hash = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`/${hash}`);
  await page.waitForFunction(() => document.documentElement.dataset.testReady === '1', null, { timeout: 90_000 });
  return errors;
}

test('the town renders with its sign, controls, and no errors', async ({ page }, testInfo) => {
  const errors = await ready(page);

  await expect(page.locator('canvas[data-test="world-canvas"]')).toBeVisible();
  await expect(page.locator('[data-test="hud"]')).toBeVisible();
  await expect(page).toHaveTitle(/Project City/);
  await expect(page.locator('#brand-stats')).toContainText(`Pop. ${projects.length} projects`);
  await expect(page.locator('#legend .chip')).toHaveCount(raw.districts.length + 1);

  // Nothing may spill past the viewport, on a phone least of all.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const id of ['btn-about', 'btn-daynight', 'btn-tour', 'btn-list']) {
    const box = await page.locator(`#${id}`).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }

  // The scene actually drew something: a blank canvas compresses to almost nothing.
  await page.waitForTimeout(1500);
  await fs.mkdir('artifacts', { recursive: true });
  const shot = await page.screenshot({ path: `artifacts/home-${testInfo.project.name}.png` });
  expect(shot.byteLength).toBeGreaterThan(60_000);

  expect(errors).toEqual([]);
});

test('a deep link opens that project with real links', async ({ page }) => {
  const project = projects.find((p) => p.demo) ?? projects[0];
  await ready(page, `#/p/${project.id}`);

  const panel = page.locator('#panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('h2')).toHaveText(project.title);
  await expect(panel.getByRole('link', { name: /Read the source/ })).toHaveAttribute(
    'href',
    `https://github.com/rhicksrad/${project.repo}`
  );
  if (project.demo) {
    await expect(panel.getByRole('link', { name: /Open it/ })).toHaveAttribute('href', project.demo);
  }

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  expect(new URL(page.url()).hash).toBe('');
});

test('the directory lists every project and flies to the one you pick', async ({ page }) => {
  await ready(page);
  await page.locator('#btn-list').click();
  const rows = page.locator('.list-row');
  await expect(rows).toHaveCount(projects.length);

  const tallest = [...projects].sort((a, b) => b.commits - a.commits)[0];
  await rows.filter({ hasText: tallest.title }).first().click();
  await expect(page.locator('#list-overlay')).toBeHidden();
  await expect(page.locator('#panel h2')).toHaveText(tallest.title);
  expect(new URL(page.url()).hash).toBe(`#/p/${tallest.id}`);
});

test('day/night, the tour, and the about sign all respond', async ({ page }) => {
  await ready(page);

  const wasDay = await page.evaluate(() => document.body.classList.contains('is-day'));
  await page.locator('#btn-daynight').click();
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('is-day'))).toBe(!wasDay);

  const tour = page.locator('#btn-tour');
  await tour.click();
  await expect(tour).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#panel')).toBeVisible();
  await tour.click();
  await expect(tour).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#btn-about').click();
  await expect(page.locator('#panel h2')).toHaveText(raw.profile.name);
  await expect(page.locator('#panel')).toContainText(`${projects.length} projects`);
});

test('the directory filters as you type, and the keyboard drives the town', async ({ page }) => {
  await ready(page);
  const bySize = [...projects].sort((a, b) => b.commits - a.commits);

  // Type to narrow the directory; Enter flies to the first match.
  await page.locator('#btn-list').click();
  const filter = page.locator('.list-filter');
  const wanted = bySize[3];
  await filter.fill(wanted.title);
  const visible = page.locator('.list-row:visible');
  await expect(visible.first()).toContainText(wanted.title);
  expect(await visible.count()).toBeLessThan(projects.length);
  await filter.press('Enter');
  await expect(page.locator('#list-overlay')).toBeHidden();
  await expect(page.locator('#panel h2')).toHaveText(wanted.title);

  // Nothing matching is said plainly, and clearing the box brings every row back.
  await page.locator('#btn-list').click();
  await filter.fill('zzzz no such project');
  await expect(page.locator('.list-empty')).toBeVisible();
  await filter.fill('');
  await expect(page.locator('.list-row:visible')).toHaveCount(projects.length);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel')).toBeHidden();

  // Arrow keys step through projects from the biggest down; N flips night and day.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#panel h2')).toHaveText(bySize[0].title);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#panel h2')).toHaveText(bySize[1].title);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#panel h2')).toHaveText(bySize[0].title);
  const wasDay = await page.evaluate(() => document.body.classList.contains('is-day'));
  await page.keyboard.press('n');
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('is-day'))).toBe(!wasDay);
});
