import { createArchiveService, REFRESH_MS } from '../../shared/zonerama.mjs';
const readArchive = createArchiveService();
export async function onRequestGet({ request, waitUntil }) {
  const cache = caches.default;
  const key = new Request(new URL('/api/zonerama', request.url));
  const previous = await cache.match(key);
  if (previous) return previous;
  try {
    const data = await readArchive();
    const response = Response.json(data, { headers: { 'Cache-Control': data.stale ? 'no-store' : `public, max-age=${REFRESH_MS / 1000}` } });
    if (!data.stale) waitUntil(cache.put(key, response.clone()));
    return response;
  } catch { return Response.json({ error: 'Zonerama is temporarily unavailable. Please retry shortly.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } }); }
}
