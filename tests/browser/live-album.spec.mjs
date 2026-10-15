import { test, expect } from '@playwright/test';
const collection = { id:'123', name:'Field hockey / September', category:'Field hockey', dateLabel:'Sep 15, 2026', photoCount:80, cover:'/favicon.png', url:'https://eu.zonerama.com/302Edits/Album/123' };
const photos = Array.from({length:80},(_,i)=>({id:String(100+i),width:i%2 ? 1800:1200,height:i%2 ? 1200:1800,thumbnailUrl:'/favicon.png',previewUrl:'/favicon.png'}));
async function mock(page, downloadable=true) {
  await page.route('**/api/zonerama', route=>route.fulfill({json:{albums:[collection],updatedAt:new Date().toISOString()}}));
  await page.route('**/api/zonerama/albums/123', route=>route.fulfill({json:{...collection,photos,downloadable,updatedAt:new Date().toISOString()}}));
}
test('collection opens internally, adapts without cropping and loads further photographs',async({page})=>{
  await mock(page);await page.goto('/');
  await page.locator('.live-card a').click();
  await expect(page).toHaveURL(/collection=123/);
  await expect(page.getByRole('heading',{name:collection.name,exact:true})).toBeVisible();
  await expect(page.locator('.collection-frame').first()).toBeVisible();
  for(const width of [360,768,1440]) {
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const image=page.locator('.collection-open img').first();
    expect(await image.evaluate(img=>getComputedStyle(img).objectFit)).toBe('contain');
  }
  await page.getByRole('button',{name:'Compact photo layout'}).click();
  await expect(page.getByRole('button',{name:'Compact photo layout'})).toHaveAttribute('aria-pressed','true');
  for(let i=0;i<4;i++) await page.locator('.collection-end').scrollIntoViewIfNeeded();
  await expect(page.locator('.collection-frame')).toHaveCount(80);
  await page.goBack();await expect(page.locator('.live-card')).toHaveCount(1);
  await page.goForward();await expect(page.locator('.collection-frame').first()).toBeVisible();
});
test('expanded viewer navigates, zooms, downloads and restores focus',async({page})=>{
  await mock(page);await page.route('**/albums/123/download/100',route=>route.fulfill({body:Buffer.from([255,216,255,217]),headers:{'Content-Type':'image/jpeg', 'Content-Disposition':"attachment; filename*=UTF-8''original.jpg"}}));
  await page.goto('/?collection=123');
  const opener=page.getByRole('button',{name:'Maximize photograph 1',exact:true});await opener.click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await expect(dialog.locator('.collection-viewer-count')).toHaveText('Photo 1 of 80');
  await page.getByRole('button',{name:'Next photograph',exact:true}).click();
  await expect(dialog.locator('.collection-viewer-count')).toHaveText('Photo 2 of 80');
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(page.locator('.collection-viewer-stage')).toHaveClass(/is-zoomed/);
  await page.getByRole('button',{name:'Zoom out',exact:true}).click();
  const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download',exact:true}).click();const download=await pending;expect(download.suggestedFilename()).toBe('original.jpg');
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
});
test('download restrictions and transient download failures stay inside the gallery',async({page})=>{
  await mock(page,false);await page.goto('/?collection=123');await page.getByRole('button',{name:'Maximize photograph 1',exact:true}).click();
  await expect(page.getByRole('button',{name:'Downloads disabled',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');await mock(page,true);await page.reload();
  await page.route('**/albums/123/download/100',route=>route.fulfill({status:502,json:{error:'Download unavailable. Please retry.'}}));
  await page.getByRole('button',{name:'Maximize photograph 1',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Download',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Download unavailable');await expect(page).toHaveURL(/collection=123/);
});
test('deep link failure can be retried and mobile swipe advances photographs',async({page})=>{
  await mock(page);await page.route('**/api/zonerama/albums/123',route=>route.fulfill({status:502,json:{error:'Temporarily unavailable.'}}));
  await page.goto('/?collection=123');await expect(page.getByRole('alert')).toContainText('Temporarily unavailable');
  await page.unroute('**/api/zonerama/albums/123');await mock(page);
  await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('button',{name:'Maximize photograph 1',exact:true}).click();
  await page.locator('.collection-viewer-stage').evaluate(element => {
    element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [new Touch({ identifier: 1, target: element, clientX: 300, clientY: 150 })] }));
    element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [new Touch({ identifier: 1, target: element, clientX: 100, clientY: 155 })] }));
  });
  await expect(page.locator('.collection-viewer-count')).toHaveText('Photo 2 of 80');
});

test('phone controls stay thumb-sized in both themes and the viewer fits portrait and landscape', async ({ page }, testInfo) => {
  await mock(page);
  await page.goto('/?collection=123');
  await expect(page.locator('.collection-frame').first()).toBeVisible();
  if (testInfo.project.name === 'phone') await expect(page.locator('.collection-frame-download').first()).toBeHidden();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const width of [320, 390, 600]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const controls = await page.locator('.collection-share, .collection-toolbar button, .collection-frame-download').evaluateAll(elements => elements.filter(e => e.getClientRects().length).map(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })));
      for (const control of controls) { expect(Math.round(control.width * 100) / 100).toBeGreaterThanOrEqual(44); expect(Math.round(control.height * 100) / 100).toBeGreaterThanOrEqual(44); }
      expect(await page.locator('.collection-details').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
    }
  }
  await page.getByRole('button', { name: 'Maximize photograph 1', exact: true }).click();
  await expect(page.locator('.collection-viewer .collection-save')).toBeVisible();
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => page.getByRole('dialog').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(size.width);
    const buttons = await page.getByRole('dialog').locator('button').evaluateAll(elements => elements.filter(e => e.getClientRects().length).map(e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; }));
    for (const button of buttons) { expect(button.left).toBeGreaterThanOrEqual(0); expect(button.right).toBeLessThanOrEqual(size.width + 1); expect(button.bottom).toBeLessThanOrEqual(size.height + 1); expect(button.width).toBeGreaterThanOrEqual(44); expect(button.height).toBeGreaterThanOrEqual(44); }
  }
});

test('Instagram save options preserve the photo and offer a same-tab original', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone) Instagram 400.0' });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedPhotoLink = text; } } });
  });
  await mock(page);
  await page.goto('/?collection=123&photo=101');
  await expect(page.locator('.collection-viewer-count')).toHaveText('Photo 2 of 80');
  const download = page.getByRole('button', { name: 'Download', exact: true });
  await download.click();
  const options = page.getByRole('dialog', { name: 'Save this photo' });
  await expect(options).toBeVisible();
  const original = options.getByRole('link', { name: 'Download original' });
  await expect(original).toHaveAttribute('href', '/api/zonerama/albums/123/download/101');
  expect(await original.getAttribute('target')).toBeNull();
  await expect(options.getByAltText('Photo preview to save')).toBeVisible();
  await options.getByRole('button', { name: 'Copy photo link' }).click();
  expect(await page.evaluate(() => window.copiedPhotoLink)).toContain('?collection=123&photo=101');
  await expect(options.getByRole('status')).toContainText('Link copied');
  await page.keyboard.press('Escape');
  await expect(options).toHaveCount(0);
  await expect(download).toBeFocused();
  await expect(page.locator('.collection-viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'All collections', exact: true }).first().click();
  await expect(page).not.toHaveURL(/photo=/);
});

test('Instagram clipboard failure leaves a selectable link and respects disabled downloads', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android) Instagram 400.0' });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Not allowed'); } } });
  });
  await mock(page);
  await page.goto('/?collection=123&photo=100');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const options = page.getByRole('dialog', { name: 'Save this photo' });
  await options.getByRole('button', { name: 'Copy photo link' }).click();
  await expect(options.getByRole('status')).toContainText('Touch and hold the link');
  await expect(options.getByRole('textbox', { name: 'Photo link' })).toHaveValue(/collection=123&photo=100/);
  for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    expect(await options.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await options.evaluate(el => el.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
  }
  await mock(page, false);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Downloads disabled', exact: true })).toBeDisabled();
  await expect(options).toHaveCount(0);
});
