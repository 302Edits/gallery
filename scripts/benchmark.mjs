import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const express = requireBackend('express');
const directory = fileURLToPath(new URL('../frontend/dist-public/', import.meta.url));
const assets = await fs.readdir(path.join(directory, 'assets'));
const resources = ['/index.html', '/test-manifest.json',
  '/assets/' + assets.find(file => /^index-.*\.js$/.test(file)), '/assets/' + assets.find(file => /^index-.*\.css$/.test(file))];
const manifest = Array.from({ length: 500 }, (_, index) => ({ id: `benchmark-${index}`, fileName: `frame-${index}.jpg`, dateTaken: '2025-06-01', sport: 'Track', location: 'Test venue', width: 6000, height: 4000, sizeBytes: 20 * 1024 ** 2, thumbnailUrl: `/images/benchmark-${index}/thumbnail.webp`, previewUrl: `/images/benchmark-${index}/preview.webp`, originalUrl: `/originals/benchmark-${index}.jpg` }));
const app = express();
app.get('/test-manifest.json', (req, res) => res.json(manifest));
app.use(express.static(directory));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const latencies = [], failures = [];
try {
  for (const resource of resources) await (await fetch(base + resource)).arrayBuffer();
  const start = performance.now();
  await Promise.all(Array.from({ length: 1000 }, (_, index) => new Promise(resolve => setTimeout(resolve, index * 5)).then(async () => {
    const before = performance.now();
    try {
      const response = await fetch(base + resources[index % resources.length]);
      latencies.push(performance.now() - before);
      if (!response.ok) failures.push(response.status);
      await response.arrayBuffer();
    } catch (error) { failures.push(error.message); }
  })));
  latencies.sort((a, b) => a - b);
  const percentile = q => Math.round(latencies[Math.ceil(q * latencies.length) - 1] * 100) / 100;
  const result = { scenario: 'Synthetic warmed localhost static delivery; NOT Cloudflare or production performance',
    requestCount: 1000, scheduledRequestsPerSecond: 200, durationSeconds: Math.round((performance.now() - start) / 10) / 100,
    syntheticAlbumPhotoCount: 500, manifestBytes: Buffer.byteLength(JSON.stringify(manifest)), failures: failures.length,
    ttfbMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) },
    scope: 'HTML, JS, CSS and synthetic album metadata; excludes original photo transfers, browser rendering and 30-day SLO' };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length || result.ttfbMs.p50 > 150 || result.ttfbMs.p95 > 500 || result.ttfbMs.p99 > 750) process.exitCode = 1;
} finally { await new Promise(resolve => server.close(resolve)); }
