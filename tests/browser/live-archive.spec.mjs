import { test, expect } from '@playwright/test';
const album = (id, name = 'Soccer 9.15.26') => ({ id, name, category: 'Soccer', date: '2026-09-15', dateLabel: 'Sep 15, 2026', photoCount: 117, cover: '/favicon.png', url: `https://eu.zonerama.com/302Edits/Album/${id}` });
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

test('system appearance uses sage and charcoal and preserves the supplied logo icon', async ({ page }) => {
  await page.route('**/api/zonerama', route => route.fulfill({ json: archive([album('1')]) }));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sage');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.png');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'carbon');
  await expect(page.locator('.live-site')).toHaveCSS('background-color', 'rgb(36, 36, 36)');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.png');
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

test('landing page keeps photographs and archive controls useful on phones', async ({ page }) => {
  await page.route('**/api/zonerama', route => route.fulfill({ json: archive(Array.from({ length: 18 }, (_, i) => album(String(i), `Soccer event ${i}`))) }));
  await page.goto('/');
  await expect(page.locator('.live-card')).toHaveCount(18);
  for (const width of [320, 390, 600]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const layout = await page.evaluate(() => {
      const featured = document.querySelector('.live-featured').getBoundingClientRect();
      const header = document.querySelector('.live-header').getBoundingClientRect();
      const brand = document.querySelector('.live-brand').getBoundingClientRect();
      const work = document.querySelector('.live-work-link').getBoundingClientRect();
      const theme = document.querySelector('.live-theme').getBoundingClientRect();
      const heading = document.querySelector('#portfolio-title');
      const headingStyle = getComputedStyle(heading);
      const headingBox = heading.getBoundingClientRect();
      const cards = [...document.querySelectorAll('.live-card')].slice(0, 2).map(card => card.getBoundingClientRect());
      const bento = document.querySelector('.live-bento');
      return {
        featuredTop: featured.top,
        featuredWidth: featured.width,
        brandOffset: Math.abs((brand.left + brand.width / 2) - innerWidth / 2),
        headerAlignment: Math.max(
          Math.abs((brand.top + brand.height / 2) - (header.top + header.height / 2)),
          Math.abs((work.top + work.height / 2) - (header.top + header.height / 2)),
          Math.abs((theme.top + theme.height / 2) - (header.top + header.height / 2)),
        ),
        headingLines: headingBox.height / parseFloat(headingStyle.lineHeight),
        headingRight: headingBox.right,
        cardColumns: Math.round(cards[0].top) === Math.round(cards[1].top),
        bentoDense: getComputedStyle(bento).gridAutoFlow === 'dense',
        smallType: Math.min(...[...document.querySelectorAll('.live-card-meta, .live-featured-caption')].map(element => parseFloat(getComputedStyle(element).fontSize))),
      };
    });
    expect(layout.featuredTop).toBeLessThan(844);
    expect(layout.featuredWidth).toBeGreaterThanOrEqual(width - 32);
    expect(layout.brandOffset).toBeLessThanOrEqual(1);
    expect(layout.headerAlignment).toBeLessThanOrEqual(1);
    expect(layout.headingLines).toBeLessThanOrEqual(3.1);
    expect(layout.headingRight).toBeLessThanOrEqual(width);
    expect(layout.cardColumns).toBe(true);
    expect(layout.bentoDense).toBe(true);
    expect(layout.smallType).toBeGreaterThanOrEqual(14);
  }
});

test('touchline carousel advances through live collections with accessible controls', async ({ page }) => {
  await page.route('**/api/zonerama', route => route.fulfill({ json: archive(Array.from({ length: 5 }, (_, i) => album(String(i), `Match dispatch ${i + 1}`))) }));
  await page.goto('/');
  await expect(page.locator('.live-dispatch-copy h3')).toHaveText('Match dispatch 1');
  const next = page.getByRole('button', { name: 'Next featured game' });
  const size = await next.evaluate(element => element.getBoundingClientRect().toJSON());
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
  await next.click();
  await expect(page.locator('.live-dispatch-copy h3')).toHaveText('Match dispatch 2');
  await expect(page.getByRole('button', { name: 'Show Match dispatch 2' })).toHaveAttribute('aria-pressed', 'true');
});

test('scroll reveals settle and respond to reduced-motion changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/api/zonerama', route => route.fulfill({ json: archive(Array.from({ length: 18 }, (_, i) => album(String(i)))) }));
  await page.goto('/');
  const motionImage = page.locator('.live-motion-image').first();
  await expect(motionImage).toBeAttached();
  await expect.poll(() => motionImage.evaluate(element => { const style = getComputedStyle(element); return style.opacity !== '1' || style.transform !== 'none'; })).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(motionImage).toHaveCSS('opacity', '1');
  await expect(motionImage).toHaveCSS('transform', 'none');
  await expect(page.locator('.live-manifesto-word').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('.live-marquee-track')).toHaveCSS('animation-name', 'none');
});
