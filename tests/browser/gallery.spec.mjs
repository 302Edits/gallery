import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { unzipSync } = createRequire(new URL('../../frontend/package.json', import.meta.url))('fflate');

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
test('public gallery works at phone/tablet/desktop widths without owner APIs', async ({ page }) => {
  const apiRequests = [], errors = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/?album=fixture-gallery');
  await expect(page.getByRole('heading', { name: 'Track studies', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Local owner controls' })).toHaveCount(0);
  await expect(page.locator('.photo-card')).toHaveCount(36);
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(apiRequests).toEqual([]); expect(errors).toEqual([]);
});

test('appearance persists and does not refetch album data or lose selection', async ({ page }) => {
  let reads = 0;
  page.on('request', request => { if (request.url().includes('/data/albums/')) reads++; });
  await page.goto('http://127.0.0.1:4173/?album=fixture-gallery');
  await expect(page.locator('.photo-card')).toHaveCount(36);
  await page.getByRole('button', { name: 'Select photos', exact: true }).click();
  await page.locator('.photo-card').first().getByRole('button').first().click();
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
  const before = reads;
  await page.getByLabel('Appearance', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
  expect(reads).toBe(before);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('viewer has visible phone navigation, keyboard close and restored focus', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/?album=fixture-gallery');
  const opener = page.locator('.photo-card').first().getByRole('button').first();
  await opener.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('multiple original downloads preserve both duplicate-named source files', async ({ page, request }) => {
  await page.addInitScript(() => { window.showSaveFilePicker = undefined; });
  const data = await (await request.get('http://127.0.0.1:4173/data/albums/fixture-gallery.json')).json();
  await page.goto('http://127.0.0.1:4173/?album=fixture-gallery');
  await page.getByRole('button', { name: 'Select photos', exact: true }).click();
  for (let index = 0; index < 2; index++) await page.locator('.photo-card').nth(index).getByRole('button').first().click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save originals', exact: true }).click();
  const download = await pending;
  const bytes = await fs.readFile(await download.path());
  const files = unzipSync(bytes);
  expect(Object.keys(files)).toHaveLength(2);
  for (const file of Object.values(files)) expect(digest(file)).toBe(data[0].sha256);
});

test('desktop manager creates themed album and uploads multiple drafts for review', async ({ page }) => {
  await page.goto('/?studio=1');
  await page.getByRole('button', { name: 'New album', exact: true }).click();
  await page.getByLabel('Album name', { exact: true }).fill('Browser upload ' + Date.now());
  await page.getByLabel('Sport', { exact: true }).fill('Soccer');
  await page.getByLabel('Location', { exact: true }).fill('Stadium');
  await page.getByRole('button', { name: 'Blue hour', exact: true }).click();
  await page.getByRole('button', { name: 'Create album', exact: true }).click();
  await page.getByRole('button', { name: 'Add photos', exact: true }).click();
  const source = await (await page.request.get('http://127.0.0.1:4173/originals/fixture-01.jpg')).body();
  await page.getByLabel('Choose photographs', { exact: true }).setInputFiles([
    { name: 'browser-one.jpg', mimeType: 'image/jpeg', buffer: source },
    { name: 'browser-two.jpg', mimeType: 'image/jpeg', buffer: source },
  ]);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Ready', { exact: true })).toHaveCount(2);
  await dialog.getByRole('checkbox', { name: /I understand that originals/ }).check();
  await dialog.getByRole('button', { name: 'Save 2 photos as drafts', exact: true }).click();
  await expect(dialog.getByText('Saved as draft', { exact: true })).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Done — review gallery', exact: true }).click();
  await expect(page.locator('.photo-card')).toHaveCount(2);
  await expect(page.getByText('Private draft', { exact: true })).toBeVisible();
});

test('owner can publish a curated Zonerama collection without local photo copies', async ({ page }) => {
  await page.goto('/?studio=1');
  await page.getByRole('button', { name: 'New album', exact: true }).click();
  await page.getByLabel('Album name', { exact: true }).fill('Live Zonerama collection ' + Date.now());
  await page.getByLabel('Sport', { exact: true }).fill('Field hockey');
  await page.getByLabel('Zonerama gallery link', { exact: true }).fill('https://eu.zonerama.com/302Edits/Album/16333720');
  await page.getByRole('button', { name: 'Create album', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open live gallery', exact: true })).toHaveAttribute('href', 'https://eu.zonerama.com/302Edits/Album/16333720');
  await expect(page.getByRole('button', { name: 'Add photos', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review & publish', exact: true }).click();
  await page.getByRole('checkbox', { name: /checked this public Zonerama gallery/ }).check();
  await page.getByRole('button', { name: 'Publish album', exact: true }).click();
  await expect(page.getByText('Published locally', { exact: true })).toBeVisible();
});

test('500-photo metadata stays windowed and select-all includes unrendered photos', async ({ page, request }) => {
  const original = await (await request.get('http://127.0.0.1:4173/data/albums/fixture-gallery.json')).json();
  const fixtures = Array.from({ length: 500 }, (_, index) => ({ ...original[index % original.length], id: `large-${index}`, fileName: `frame-${index}.jpg` }));
  await page.route('**/data/albums/fixture-gallery.json', route => route.fulfill({ json: fixtures }));
  await page.goto('http://127.0.0.1:4173/?album=fixture-gallery');
  await expect(page.locator('.photo-card')).toHaveCount(36);
  await page.getByRole('button', { name: 'Select photos', exact: true }).click();
  await page.getByRole('button', { name: 'Select all 500', exact: true }).click();
  await expect(page.getByText('500 selected', { exact: true })).toBeVisible();
  await expect(page.locator('.photo-card')).toHaveCount(36);
  await page.getByRole('button', { name: 'Load 36 more', exact: true }).click();
  await expect(page.locator('.photo-card')).toHaveCount(72);
});

test('theme presets maintain readable contrast and honor reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?studio=1');
  await expect(page.getByRole('button', { name: 'New album', exact: true })).toBeVisible();
  const results = await page.evaluate(async () => {
    const { THEME_PRESETS, applyAlbumTheme } = await import('/src/utils/themes.js');
    function luminance(hex) {
      const values = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
    }
    function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
    const scores = [];
    for (const preset of THEME_PRESETS) for (const mode of ['light', 'dark']) {
      applyAlbumTheme({ themePreset: preset.id, themeColor: '#ffffff' }, mode);
      const styles = getComputedStyle(document.documentElement);
      const value = name => styles.getPropertyValue(name).trim();
      scores.push({ preset: preset.id, mode, text: contrast(value('--text'), value('--bg')),
        muted: contrast(value('--muted'), value('--bg')), button: contrast(value('--accent'), value('--accent-ink')) });
    }
    applyAlbumTheme(null, 'light');
    return scores;
  });
  for (const score of results) { expect(score.text).toBeGreaterThanOrEqual(4.5); expect(score.muted).toBeGreaterThanOrEqual(4.5); expect(score.button).toBeGreaterThanOrEqual(4.5); }
  expect(await page.locator('.button-primary').first().evaluate(button => getComputedStyle(button).transitionDuration)).toBe('0s');
});

test('download grouping bounds phone memory without dropping selected originals', async ({ page }) => {
  await page.goto('/?studio=1');
  const parts = await page.evaluate(async () => {
    const { downloadParts } = await import('/src/utils/downloads.js');
    const photos = Array.from({ length: 9 }, (_, index) => ({ id: index, sizeBytes: 20 * 1024 ** 2 }));
    return downloadParts(photos).map(part => part.map(photo => photo.id));
  });
  expect(parts).toEqual([[0, 1, 2], [3, 4, 5], [6, 7, 8]]);
});

test('public archive failure shows an actionable retry and recovers', async ({ page }) => {
  await page.route('**/data/galleries.json', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.goto('http://127.0.0.1:4173/?studio=1');
  await expect(page.getByRole('heading', { name: 'The archive couldn’t be loaded.', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.unroute('**/data/galleries.json');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Track studies', exact: true })).toBeVisible();
});

test('owner bootstrap failure can recover without losing management controls', async ({ page }) => {
  await page.route('**/api/v1/session', route => route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } }));
  await page.goto('/?studio=1');
  await expect(page.getByRole('heading', { name: 'The archive couldn’t be loaded.', exact: true })).toBeVisible();
  await page.unroute('**/api/v1/session');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New album', exact: true })).toBeVisible();
});
