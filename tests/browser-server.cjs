// Every browser test uses generated fixtures, never the owner's database/photos.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const backendRequire = require('node:module').createRequire(path.join(__dirname, '../backend/package.json'));
const sharp = backendRequire('sharp');
const express = backendRequire('express');
const { createApp } = require('../backend/index');
const { exportSite } = require('../backend/export-site');
const { hashFile, preparePreviews } = require('../backend/images');

(async () => {
  const project = path.resolve(__dirname, '..');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sideline-browser-'));
  await fs.mkdir(path.join(root, 'frontend'), { recursive: true });
  await fs.cp(path.join(project, 'frontend', 'dist-public'), path.join(root, 'frontend', 'dist-public'), { recursive: true });
  const app = createApp({ dataDir: path.join(root, 'data'), dbPath: path.join(root, 'gallery.sqlite'), projectRoot: root, outputPath: path.join(root, 'site-output') });
  const db = app.locals.db;
  const original = path.join(root, 'data', 'originals', 'fixture');
  const thumbnail = path.join(root, 'data', 'thumbnails', 'fixture.webp');
  const preview = path.join(root, 'data', 'previews', 'fixture.webp');
  await sharp({ create: { width: 900, height: 600, channels: 3, background: '#3d6751' } }).jpeg().withExif({ IFD2: { DateTimeOriginal: '2025:06:01 17:12:00' } }).toFile(original);
  await preparePreviews(original, thumbnail, preview);
  const stat = await fs.stat(original);
  const sha256 = await hashFile(original);
  const ids = Array.from({ length: 40 }, (_, index) => 'fixture-' + String(index + 1).padStart(2, '0'));
  db.prepare('INSERT INTO galleries(id,name,description,sport,location,eventDate,themePreset,themeColor,createdAt,publishedAt,publishedPhotoIds) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
    'fixture-gallery', 'Track studies', 'Generated test images, not real sports photography.', 'Track', 'Home field', '2025-06-01', 'forest', '#30694d', '2025-06-01', '2025-06-01', JSON.stringify(ids));
  const insert = db.prepare('INSERT INTO photos(id,galleryId,filePath,thumbnailPath,previewPath,fileName,mimeType,width,height,dateTaken,sport,location,capturedAt,sizeBytes,sha256,metadataSource) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const id of [...ids, 'private-draft']) insert.run(id, 'fixture-gallery', original, thumbnail, preview, 'same-name.jpg', 'image/jpeg', 900, 600, '2025-06-01T17:12:00', 'Track', 'Home field', '2025-06-01', stat.size, sha256, 'EXIF');
  await exportSite({ db, projectRoot: root, outputPath: path.join(root, 'site-output') });
  const apiServer = app.listen(5001, '127.0.0.1');
  const publicApp = express();
  publicApp.use((req, res, next) => {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    next();
  });
  publicApp.use(express.static(path.join(root, 'site-output')));
  const publicServer = publicApp.listen(4173, '127.0.0.1');
  const vite = spawn('npm', ['run', 'dev', '--workspace', 'frontend', '--', '--port', '5173', '--strictPort'], { cwd: project, stdio: 'inherit' });
  let stopping = false;
  async function stop() {
    if (stopping) return; stopping = true;
    vite.kill('SIGTERM'); apiServer.close(); publicServer.close(); db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
  process.on('SIGTERM', () => stop().then(() => process.exit()));
  process.on('SIGINT', () => stop().then(() => process.exit()));
  vite.on('exit', () => stop());
})().catch(error => { console.error(error); process.exit(1); });
