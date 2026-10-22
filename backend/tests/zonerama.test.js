const { test } = require('node:test');
const assert = require('node:assert/strict');
const adapter = import('../../shared/zonerama.mjs');
const tile = (id, name = 'Soccer &amp; friends') => `<li data-album-id="${id}"><a class="thumbnail" title="${name}"><p>Sep 14, 2026 | <span>117</span> <i class="za-icon icon-images"></i></p><img data-pattern="https://eu.zonerama.com/PublicAlbumCover/${id}?width={width}&amp;height={height}"></a></li>`;
test('public album parser decodes titles, validates images and ignores advertisements', async () => {
  const { parseAlbum } = await adapter;
  const album = parseAlbum(tile('123'));
  assert.equal(album.name, 'Soccer & friends');
  assert.equal(album.photoCount, 117);
  assert.equal(album.category, 'Soccer');
  assert.equal(album.date, '2026-09-14');
  assert.equal(album.cover, 'https://eu.zonerama.com/Social/AlbumCover/123?width=1000&height=760');
  assert.equal(parseAlbum('<li data-banner="album">ad</li>'), null);
  assert.throws(() => parseAlbum(tile('123').replace('https://eu.zonerama.com', 'https://evil.test')));
});
test('complete archive follows upstream offsets including ads and deduplicates albums', async () => {
  const { fetchArchive } = await adapter;
  const offsets = [];
  const result = await fetchArchive(async (_, options) => {
    offsets.push(options.body.get('startIndex'));
    return { ok: true, json: async () => offsets.length === 1 ? { items: [{ html: '<li>ad</li>' }, { html: tile('1') }], isEnd: false } : { items: [{ html: tile('1') }, { html: tile('2') }], isEnd: true } };
  });
  assert.deepEqual(offsets, ['0', '2']);
  assert.deepEqual(result.albums.map(a => a.id), ['1', '2']);
});
test('refresh coalesces requests, caches successes and retains last good data on failure', async () => {
  const { createArchiveService, REFRESH_MS } = await adapter;
  let time = 1, calls = 0, fail = false;
  const read = createArchiveService(async () => { calls++; if (fail) throw new Error('offline'); return { ok: true, json: async () => ({ items: [{ html: tile(String(calls)) }], isEnd: true }) }; }, () => time);
  const [first, second] = await Promise.all([read(), read()]);
  assert.equal(calls, 1); assert.deepEqual(first, second);
  await read(); assert.equal(calls, 1);
  time += REFRESH_MS; const refreshed = await read(); assert.equal(refreshed.albums[0].id, '2');
  fail = true; time += REFRESH_MS; const stale = await read(); assert.equal(stale.stale, true); assert.equal(stale.updatedAt, refreshed.updatedAt); assert.equal(stale.albums[0].id, '2');
  await read(); assert.equal(calls, 3);
  fail = false; time += REFRESH_MS; const recovered = await read(); assert.equal(calls, 4); assert.equal(recovered.stale, false);
});
test('malformed and stalled pagination never replace a complete archive', async () => {
  const { fetchArchive } = await adapter;
  for (const value of [{ items: [], isEnd: false }, { unexpected: true }]) {
    await assert.rejects(fetchArchive(async () => ({ ok: true, json: async () => value })));
  }
});

const photoItem = id => ({ photoId: id, width: 1200, height: 1800, image: `https://cache-ny.zonerama.com/photos/public/${id}_{width}x{height}_18.jpg?signature=abc` });
test('photo feed keeps proportions, skips ads and rejects untrusted image hosts', async () => {
  const { parsePhoto, fetchAlbum } = await adapter;
  assert.equal(parsePhoto({ image: 'advert' }), null);
  const photo = parsePhoto(photoItem(42));
  assert.equal(photo.thumbnailUrl, 'https://eu.zonerama.com/Social/Photo/42?width=600&height=900');
  assert.equal(photo.previewUrl, 'https://eu.zonerama.com/Social/Photo/42?width=1200&height=1800');
  assert.doesNotMatch(photo.thumbnailUrl, /signature=/);
  assert.throws(() => parsePhoto({ ...photoItem(42), image: 'https://evil.test/file' }));
  const offsets = [];
  const result = await fetchAlbum({ id: '1', url: 'https://eu.zonerama.com/302Edits/Album/1' }, async (url, options) => {
    if (!options.method) return new Response('<meta property="znrm:downloadable" content="true" />');
    offsets.push(options.body.get('startIndex'));
    return Response.json(offsets.length === 1 ? { items: [{ banner: true }, photoItem(42)], isEnd: false } : { items: [photoItem(43)], isEnd: true });
  });
  assert.deepEqual(offsets, ['0', '2']); assert.equal(result.photos.length, 2); assert.equal(result.downloadable, true);
});
test('deployment verifier rejects signed cache images before publication', async () => {
  const { validateCoverUrl, validatePhotoUrl } = await import('../../scripts/verify-zonerama-snapshot.mjs');
  assert.doesNotThrow(() => validateCoverUrl('https://eu.zonerama.com/Social/AlbumCover/1?width=1000&height=760', '1'));
  assert.doesNotThrow(() => validatePhotoUrl('https://eu.zonerama.com/Social/Photo/42?width=600&height=900', '42', 'thumbnail'));
  assert.throws(() => validatePhotoUrl('https://cache-ny.zonerama.com/photos/public/42_800x800_2.jpg?signature=abc', '42', 'thumbnail'), /must use https:\/\/eu\.zonerama\.com/);
  assert.throws(() => validatePhotoUrl('https://eu.zonerama.com/Social/Photo/99?width=600&height=900', '42', 'thumbnail'), /must use \/Social\/Photo\/42/);
});
test('stale album data is cached during an upstream outage and refreshes after the interval', async () => {
  const { createZoneramaHandler, REFRESH_MS } = await adapter;
  let time = 1, photoCalls = 0, fail = false;
  const handle = createZoneramaHandler(async url => {
    if (url.includes('AlbumsInTab')) return Response.json({ items: [{ html: tile('1') }], isEnd: true });
    if (url.includes('PhotosInAlbum')) {
      photoCalls++;
      if (fail) throw new Error('offline');
      return Response.json({ items: [photoItem(42)], isEnd: true });
    }
    return new Response('<meta property="znrm:downloadable" content="true" />');
  }, () => time);
  const get = () => handle(new Request('https://example.com/api/zonerama/albums/1'));
  assert.equal((await get()).status, 200); assert.equal(photoCalls, 1);
  fail = true; time += REFRESH_MS; assert.equal((await (await get()).json()).stale, true); assert.equal(photoCalls, 2);
  assert.equal((await (await get()).json()).stale, true); assert.equal(photoCalls, 2);
  fail = false; time += REFRESH_MS; assert.equal((await (await get()).json()).stale, false); assert.equal(photoCalls, 3);
});
test('download route validates collection, photo membership and permissions before streaming exact bytes', async () => {
  const { createZoneramaHandler } = await adapter;
  let downloads = 0;
  const bytes = new Uint8Array([255, 216, 1, 2, 3, 255, 217]);
  const fetcher = async url => {
    if (url.includes('AlbumsInTab')) return Response.json({ items: [{ html: tile('1') }], isEnd: true });
    if (url.includes('PhotosInAlbum')) return Response.json({ items: [photoItem(42)], isEnd: true });
    if (url.includes('/Download/')) { downloads++; return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Content-Disposition': 'attachment; filename="original photo.jpg"', 'Set-Cookie': 'secret=no' } }); }
    return new Response('<meta property="znrm:downloadable" content="true" />');
  };
  const handle = createZoneramaHandler(fetcher);
  const get = path => handle(new Request('https://example.com/api/zonerama/' + path));
  assert.equal((await get('albums/2')).status, 404);
  assert.equal((await get('albums/1/download/99')).status, 404);
  assert.equal((await get('albums/1/download/https://evil.test')).status, 404);
  assert.equal(downloads, 0);
  const response = await get('albums/1/download/42');
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match(response.headers.get('content-disposition'), /original%20photo.jpg/);
  const denied = createZoneramaHandler(async url => url.includes('/Album/1') ? new Response('<meta property="znrm:downloadable" content="false" />') : fetcher(url));
  assert.equal((await denied(new Request('https://example.com/api/zonerama/albums/1/download/42'))).status, 403);
  assert.equal(downloads, 1);
});
test('HTML errors from download upstream never become a photo download', async () => {
  const { createZoneramaHandler } = await adapter;
  const handle = createZoneramaHandler(async url => {
    if (url.includes('AlbumsInTab')) return Response.json({ items: [{ html: tile('1') }], isEnd: true });
    if (url.includes('PhotosInAlbum')) return Response.json({ items: [photoItem(42)], isEnd: true });
    if (url.includes('/Download/')) return new Response('<html>Access denied</html>', { headers: { 'Content-Type': 'text/html' } });
    return new Response('<meta property="znrm:downloadable" content="true" />');
  });
  const response = await handle(new Request('https://example.com/api/zonerama/albums/1/download/42'));
  assert.equal(response.status, 502); assert.match((await response.json()).error, /download is unavailable/);
});
test('justified layout fits portrait and landscape frames at every breakpoint', async () => {
  const { photoRows } = await import('../../frontend/src/utils/photo-layout.js');
  const photos = Array.from({ length: 30 }, (_, i) => ({ id: i, width: i % 2 ? 1800 : 1200, height: i % 2 ? 1200 : 1800 }));
  for (const width of [320, 390, 768, 1440]) {
    const rows = photoRows(photos, width, 280, 12);
    assert.deepEqual(rows.flatMap(row => row.photos.map(photo => photo.id)), photos.map(photo => photo.id));
    for (const row of rows) assert.ok(row.photos.reduce((sum, photo) => sum + row.height * photo.width / photo.height, 0) + 12 * (row.photos.length - 1) <= width + 0.01);
  }
});
