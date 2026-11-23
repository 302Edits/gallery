import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchAlbum, fetchArchive } from '../shared/zonerama.mjs';

const output = path.resolve('frontend/public/api/zonerama');
const concurrency = Math.max(1, Math.min(6, Number.parseInt(process.env.ZONERAMA_CONCURRENCY, 10) || 4));
const archive = await fetchArchive();
await fs.mkdir(path.join(output, 'albums'), { recursive: true });

let cursor = 0;
let completed = 0;
const published = new Map();
async function snapshotAlbum(album) {
  const filename = path.join(output, 'albums', `${album.id}.json`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await fetchAlbum(album);
      if (album.photoCount > 0 && !data.photos.length) throw new Error('The photo feed unexpectedly returned no photos');
      await fs.writeFile(filename, JSON.stringify(data));
      return data;
    } catch (error) {
      if (attempt === 3) {
        try {
          const previous = JSON.parse(await fs.readFile(filename, 'utf8'));
          if (previous.id === album.id && previous.cover === album.cover && Array.isArray(previous.photos) && (previous.photos.length || !album.photoCount)) {
            console.warn(`Reusing the last snapshot for ${album.id}: ${album.name}`);
            const data = { ...previous, photoCount: previous.photos.length, stale: true };
            await fs.writeFile(filename, JSON.stringify(data));
            return data;
          }
        } catch { /* No previous snapshot is available on the first run. */ }
        console.warn(`Skipping unavailable collection ${album.id} (${album.name}): ${error.message}`);
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
}
async function worker() {
  while (cursor < archive.albums.length) {
    const album = archive.albums[cursor++];
    const data = await snapshotAlbum(album);
    if (data) {
      if (album.photoCount !== data.photos.length) {
        console.warn(`Album ${album.id} (${album.name}) lists ${album.photoCount} items. The photo feed returned ${data.photos.length} distinct photographs.`);
      }
      published.set(album.id, { ...album, photoCount: data.photos.length });
    }
    completed++;
    if (completed % 10 === 0 || completed === archive.albums.length) {
      console.log(`Snapshotted ${completed}/${archive.albums.length} collections`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
archive.albums = archive.albums.filter(album => published.has(album.id)).map(album => published.get(album.id));
await fs.writeFile(path.join(output, 'index.json'), JSON.stringify(archive));
await fs.writeFile(path.resolve('frontend/public/.nojekyll'), '');
console.log(`Zonerama snapshot complete: ${archive.albums.length} collections`);

