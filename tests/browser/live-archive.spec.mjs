import { test, expect } from '@playwright/test';
const album = (id, name = 'Soccer 9.15.26') => ({ id, name, category: 'Soccer', date: '2026-09-15', dateLabel: 'Sep 15, 2026', photoCount: 117, cover: '/favicon.svg', url: `https://eu.zonerama.com/302Edits/Album/${id}` });
const archive = albums => ({ albums, updatedAt: '2026-10-13T12:00:00Z', stale: false });
test('live homepage searches, paginates and refreshes without owner APIs', async ({ page }) => {
  let reads = 0;
  const ownerRequests = [];
  page.on('request', request => { if (request.url().includes('/api/v1/')) ownerRequests.push(request.url()); });
  await page.route('**/api/zonerama', route => { reads++; return route.fulfill({ json: archive(Array.from({ length: reads > 1 ? 21 : 20 }, (_, i) => album(String(i), `Soccer event ${i}`))) }); });
  await page.goto('/');
  await expect(page.locator('.live-card')).toHaveCount(18);
  await page.getByRole('button', { name: 'More from the archive' }).click();
  await expect(page.locator('.live-card')).toHaveCount(20);
  await page.getByRole('searchbox').fill('event 19');
  await expect(page.locator('.live-card')).toHaveCount(1);
  await expect(page.locator('.live-card a')).toHaveAttribute('href', /\?collection=19$/);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('button', { name: 'Refresh collections' }).click();
  await expect(page.locator('.live-totals')).toContainText('21');
  for (const width of [360, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  expect(ownerRequests).toEqual([]);
});
test('automatic polling preserves the grid during an outage and recovers', async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  await page.route('**/api/zonerama', route => { reads++; return reads === 2 ? route.fulfill({ status: 502, json: {} }) : route.fulfill({ json: archive([album('1', reads > 2 ? 'Updated event' : 'Original event')]) }); });
  await page.goto('/');
  await expect(page.locator('.live-card')).toHaveCount(1);
  await page.clock.fastForward(300001);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.live-card h3')).toHaveText('Original event');
  await page.clock.fastForward(300001);
  await expect(page.locator('.live-card h3')).toHaveText('Updated event');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('initial feed failure offers source access and retry; empty results are usable', async ({ page }) => {
  await page.route('**/api/zonerama', route => route.fulfill({ status: 502, json: {} }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Zonerama', exact: true })).toHaveAttribute('href', 'https://eu.zonerama.com/302Edits/2037673');
  await page.route('**/api/zonerama', route => route.fulfill({ json: archive([album('1')]) }));
  await page.getByRole('button', { name: 'Refresh collections' }).click();
  await expect(page.locator('.live-card')).toHaveCount(1);
  await page.getByRole('searchbox').fill('not an event');
  await expect(page.getByRole('heading', { name: 'No moments found.' })).toBeVisible();
});

test('six gallery themes preview, apply and persist with readable contrast', async ({ page }) => {
  await page.route('**/api/zonerama', route => route.fulfill({ json: archive([album('1')]) }));
  await page.goto('/');
  const picker = page.getByRole('button', { name: 'Choose site theme' });
  await picker.click();
  const themes = ['Paper', 'Stone', 'Sage', 'Midnight', 'Charcoal', 'Forest'];
  for (const name of themes) await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  for (const name of themes) {
    if (!(await page.getByRole('button', { name: new RegExp(`^${name}`) }).isVisible())) await picker.click();
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    const contrast = await page.locator('.live-site').evaluate(element => {
      const rgb = value => value.match(/\d+/g).slice(0, 3).map(Number);
      const luminance = value => rgb(value).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
      const style = getComputedStyle(element), a = luminance(style.color), b = luminance(style.backgroundColor);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest');
  expect(await page.evaluate(() => localStorage.getItem('still.appearance'))).toBe('forest');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest');
});

test('system appearance uses sage and charcoal and keeps the site icon in sync', async ({ page }) => {
  await page.route('**/api/zonerama', route => route.fulfill({ json: archive([album('1')]) }));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sage');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon-light.svg');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'carbon');
  await expect(page.locator('.live-site')).toHaveCSS('background-color', 'rgb(36, 36, 36)');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon-dark.svg');
  await page.getByRole('button', { name: 'Choose site theme' }).click();
  await page.getByRole('button', { name: /^Sage/ }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sage');
});

test('reduced motion keeps scrolled collections visible without animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/zonerama', route => route.fulfill({ json: archive(Array.from({ length: 18 }, (_, i) => album(String(i)))) }));
  await page.goto('/');
  const card = page.locator('.live-card').last();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test('collection previews preserve the complete cover image', async ({ page }) => {
  await page.route('**/api/zonerama', route => route.fulfill({ json: archive([album('1')]) }));
  await page.goto('/');
  const preview = page.locator('.live-card-image');
  await expect(preview.locator('img')).toHaveCSS('object-fit', 'contain');
  const ratio = await preview.evaluate(element => element.getBoundingClientRect().width / element.getBoundingClientRect().height);
  expect(ratio).toBeCloseTo(2, 1);
});

test('scroll reveals settle and respond to reduced-motion changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/api/zonerama', route => route.fulfill({ json: archive(Array.from({ length: 18 }, (_, i) => album(String(i)))) }));
  await page.goto('/');
  const card = page.locator('.live-card').last();
  await expect(card).toBeAttached();
  await card.evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await expect.poll(() => card.evaluate(element => element.getAnimations().length)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(card).toHaveCSS('opacity', '1');
  await expect(card).toHaveCSS('transform', 'none');
});
