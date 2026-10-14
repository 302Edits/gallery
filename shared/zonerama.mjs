// Read-only adapter for the public 302 Edits collection. No arbitrary upstream URLs.
export const PROFILE_URL = 'https://eu.zonerama.com/302Edits/2037673';
const ENDPOINT = 'https://eu.zonerama.com/JSON/FlowLayout_AlbumsInTab?tabId=2037673';
export const REFRESH_MS = 5 * 60 * 1000;
const decode = value => value.replace(/&(?:amp|quot|apos|lt|gt|#39|#(\d+)|#x([\da-f]+));/gi, (match, decimal, hex) => {
  if (decimal || hex) { const n = parseInt(decimal || hex, hex ? 16 : 10); return n <= 0x10ffff ? String.fromCodePoint(n) : ''; }
  return ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>' })[match.toLowerCase()] || match;
});
export function parseAlbum(html) {
  const id = html.match(/data-album-id="(\d+)"/)?.[1];
  if (!id) return null; // Zonerama inserts advertising tiles between albums.
  const name = decode(html.match(/class="thumbnail"\s+title="([^"]*)"/)?.[1] || '').trim();
  const pattern = decode(html.match(/data-pattern="([^"]*)"/)?.[1] || '');
  const cover = new URL(pattern.replaceAll('{width}', '1000').replaceAll('{height}', '760'), PROFILE_URL);
  if (cover.protocol !== 'https:' || !cover.hostname.endsWith('.zonerama.com') || !name) throw new Error('Unexpected album markup');
  cover.searchParams.set('topStrip', 'False');
  const dateLabel = decode(html.match(/<p>\s*([^<|]+)\|/)?.[1] || '').trim();
  const date = Date.parse(dateLabel);
  const photoCount = Number(html.match(/<span>(\d+)<\/span>\s*<i class="za-icon icon-images"/)?.[1] || 0);
  const category = /FHOCK|field hockey/i.test(name) ? 'Field hockey' : /soccer/i.test(name) ? 'Soccer' : /football/i.test(name) ? 'Football' : /basketball|\bBBALL\b/i.test(name) ? 'Basketball' : /lacrosse|\bLAX\b/i.test(name) ? 'Lacrosse' : /volleyball/i.test(name) ? 'Volleyball' : 'Other';
  return { id, name, cover: cover.href, photoCount, date: Number.isFinite(date) ? new Date(date).toISOString().slice(0, 10) : '', dateLabel, category, url: `https://eu.zonerama.com/302Edits/Album/${id}` };
}
export async function fetchArchive(fetcher = fetch) {
  const albums = new Map();
  let offset = 0;
  for (let page = 0; page < 30; page++) {
    const response = await fetcher(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ startIndex: String(offset), count: '200' }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Zonerama is unavailable');
    const data = await response.json();
    if (!Array.isArray(data.items) || typeof data.isEnd !== 'boolean') throw new Error('Unexpected Zonerama response');
    for (const item of data.items) { const album = parseAlbum(item.html || ''); if (album) albums.set(album.id, album); }
    if (data.isEnd) return { albums: [...albums.values()], source: PROFILE_URL, updatedAt: new Date().toISOString(), stale: false };
    if (!data.items.length) throw new Error('Incomplete Zonerama response');
    offset += data.items.length;
  }
  throw new Error('Zonerama pagination limit reached');
}
export function createArchiveService(fetcher = fetch, now = Date.now) {
  let cached, checkedAt = 0, pending;
  return async () => {
    if (cached && now() - checkedAt < REFRESH_MS) return cached;
    pending ||= fetchArchive(fetcher).then(data => { cached = data; checkedAt = now(); return data; })
      .catch(error => { if (cached) return { ...cached, stale: true }; throw error; }).finally(() => { pending = null; });
    return pending;
  };
}

export function parsePhoto(item) {
  if (!/^\d+$/.test(String(item.photoId || ''))) return null;
  if (!Number.isFinite(item.width) || !Number.isFinite(item.height) || item.width <= 0 || item.height <= 0) throw new Error('Unexpected photo dimensions');
  const image = new URL(item.image);
  if (image.protocol !== 'https:' || !image.hostname.endsWith('.zonerama.com') || image.username || image.password) throw new Error('Unexpected photo image');
  const sized = size => {
    const ratio = Math.min(1, size / Math.max(item.width, item.height));
    return item.image.replaceAll('{width}', String(Math.round(item.width * ratio))).replaceAll('{height}', String(Math.round(item.height * ratio)));
  };
  return { id: String(item.photoId), width: item.width, height: item.height, thumbnailUrl: sized(900), previewUrl: sized(2400) };
}
export async function fetchAlbum(album, fetcher = fetch) {
  const page = await fetcher(album.url, { signal: AbortSignal.timeout(15000) });
  if (!page.ok) throw new Error('Album is unavailable');
  const html = await page.text();
  const downloadable = /<meta\s+property="znrm:downloadable"\s+content="true"\s*\/>/.test(html);
  const photos = new Map();
  let offset = 0;
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const response = await fetcher(`https://eu.zonerama.com/JSON/FlowLayout_PhotosInAlbum?albumId=${album.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ startIndex: String(offset), count: '200' }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Album is unavailable');
    const data = await response.json();
    if (!Array.isArray(data.items) || typeof data.isEnd !== 'boolean') throw new Error('Unexpected album response');
    for (const item of data.items) { const photo = parsePhoto(item); if (photo) photos.set(photo.id, photo); }
    if (data.isEnd) return { ...album, photos: [...photos.values()], downloadable, updatedAt: new Date().toISOString(), stale: false };
    if (!data.items.length) throw new Error('Incomplete album response');
    offset += data.items.length;
  }
  throw new Error('Album pagination limit reached');
}

// All three runtimes use this same route handler. It only accepts known public
// albums and their photo IDs; callers cannot supply an upstream URL.
export function createZoneramaHandler(fetcher = fetch, now = Date.now) {
  const readArchive = createArchiveService(fetcher, now);
  const albums = new Map();
  async function readAlbum(id) {
    const archive = await readArchive();
    const album = archive.albums.find(item => item.id === id);
    if (!album) throw Object.assign(new Error('Collection not found.'), { status: 404 });
    let entry = albums.get(id);
    if (!entry) {
      if (albums.size >= 30) {
        const oldest = [...albums].find(([, value]) => !value.pending);
        if (oldest) albums.delete(oldest[0]);
        else throw Object.assign(new Error('Please retry shortly.'), { status: 503 });
      }
      entry = {}; albums.set(id, entry);
    }
    if (entry.data && now() - entry.checkedAt < REFRESH_MS) return entry.data;
    entry.pending ||= fetchAlbum(album, fetcher).then(data => { entry.data = data; entry.checkedAt = now(); return data; })
      .catch(error => { if (entry.data) return { ...entry.data, stale: true }; throw error; }).finally(() => { entry.pending = null; });
    return entry.pending;
  }
  return async request => {
    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\/api\/zonerama\/?/, '').split('/').filter(Boolean);
    const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    try {
      if (!parts.length) return json(await readArchive());
      if (parts[0] !== 'albums' || !/^\d+$/.test(parts[1] || '') || ![2, 4].includes(parts.length)) return json({ error: 'Not found.' }, 404);
      if (parts.length === 4 && (parts[2] !== 'download' || !/^\d+$/.test(parts[3]))) return json({ error: 'Not found.' }, 404);
      const album = await readAlbum(parts[1]);
      if (parts.length === 2) return json(album);
      if (!album.downloadable) return json({ error: 'Downloads are disabled for this collection.' }, 403);
      if (!album.photos.some(photo => photo.id === parts[3])) return json({ error: 'Photograph not found.' }, 404);
      const upstream = await fetcher(`https://eu.zonerama.com/Download/Photo/?id=${parts[3]}&original=true`, { signal: AbortSignal.timeout(60000), redirect: 'error' });
      const type = upstream.headers.get('Content-Type') || '';
      if (!upstream.ok || !type.startsWith('image/') || type.includes('svg')) {
        await upstream.body?.cancel();
        return json({ error: 'This download is unavailable. The photographer may have changed download permissions.' }, 502);
      }
      // Stream the unchanged file. Do not forward upstream cookies or cache originals.
      const headers = new Headers({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename="302-edits-${parts[3]}.jpg"` });
      const originalName = upstream.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1];
      if (originalName) headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(originalName.replace(/[\/\\\x00-\x1f]/g, '_'))}`);
      const length = upstream.headers.get('Content-Length');
      if (length) headers.set('Content-Length', length);
      return new Response(upstream.body, { headers });
    } catch (error) { return json({ error: error.status === 404 ? error.message : 'The live gallery is temporarily unavailable. Please try again.' }, error.status || 502); }
  };
}
