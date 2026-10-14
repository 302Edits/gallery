import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchAlbum, fetchArchive } from '../shared/zonerama.mjs';

const output = path.resolve('frontend/public/api/zonerama');
const concurrency = Math.max(1, Math.min(6, Number(process.env.ZONERAMA_CONCURRENCY || 4)));
const archive = await fetchArchive();
await fs.mkdir(path.join(output, 'albums'), { recursive: true });

let cursor = 0;
let completed = 0;
const published = [];
async function snapshotAlbum(album) {
  const filename = path.join(output, 'albums', `${album.id}.json`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await fetchAlbum(album);
      await fs.writeFile(filename, JSON.stringify(data));
      return data;
    } catch (error) {
      if (attempt === 3) {
        try {
          const previous = JSON.parse(await fs.readFile(filename, 'utf8'));
          if (Array.isArray(previous.photos)) {
            console.warn(`Reusing the last snapshot for ${album.id}: ${album.name}`);
            return { ...previous, stale: true };
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
    if (await snapshotAlbum(album)) published.push(album);
    completed++;
    if (completed % 10 === 0 || completed === archive.albums.length) {
      console.log(`Snapshotted ${completed}/${archive.albums.length} collections`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
archive.albums = archive.albums.filter(album => published.some(item => item.id === album.id));
await fs.writeFile(path.join(output, 'index.json'), JSON.stringify(archive));
await fs.writeFile(path.resolve('frontend/public/.nojekyll'), '');
console.log(`Zonerama snapshot complete: ${archive.albums.length} collections`);

