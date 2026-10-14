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
