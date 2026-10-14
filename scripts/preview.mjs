import adapter from '../backend/zonerama-handler.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('../site-output/', import.meta.url));
if (!fs.existsSync(path.join(directory, 'index.html'))) { console.error('Prepare a public export first: npm run export'); process.exit(1); }
const types = { '.woff2': 'font/woff2', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.tiff': 'image/tiff', '.avif': 'image/avif' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/zonerama' || url.pathname.startsWith('/api/zonerama/')) {
    await adapter.serveZonerama(req, res); return;
  }
  let file;
  try { file = path.resolve(directory, '.' + decodeURIComponent(url.pathname)); } catch { res.writeHead(400).end(); return; }
  if (url.pathname === '/') file = path.join(directory, 'index.html');
  if (!file.startsWith(directory)) { res.writeHead(403).end(); return; }
  if (url.pathname.startsWith('/api/')) { res.writeHead(404).end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(4173, '127.0.0.1', () => console.log('Public gallery preview: http://127.0.0.1:4173'));
