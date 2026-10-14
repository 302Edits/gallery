const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { createApp } = require('../index');
const { normalizeDate } = require('../images');
const { exportSite, MAX_ASSET_BYTES } = require('../export-site');
const { openDatabase } = require('../database');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sideline-test-'));
  const build = path.join(root, 'frontend', 'dist-public');
  await fs.mkdir(build, { recursive: true });
  await fs.writeFile(path.join(build, 'index.html'), '<!doctype html><title>Public gallery</title>');
  await fs.writeFile(path.join(build, 'build-info.json'), '{"staticSite":true}');
  const app = createApp({ dataDir: path.join(root, 'data'), dbPath: path.join(root, 'gallery.db'), projectRoot: root, outputPath: path.join(root, 'site-output') });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const token = (await (await fetch(base + '/api/v1/session')).json()).token;
  const request = async (url, options = {}) => {
    const response = await fetch(base + url, { ...options, headers: { Authorization: 'Bearer ' + token, ...options.headers } });
    const result = await response.json();
    return { response, result };
  };
  const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const album = async (name = 'Track studies') => (await request('/api/v1/galleries', json('POST', { name, sport: 'Track', location: 'Home field', themePreset: 'forest', themeColor: '#30694d' }))).result;
  const upload = async (galleryId, bytes, fields = {}) => {
    const form = new FormData();
    form.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'same-name.jpg');
    form.append('galleryId', galleryId);
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return request('/api/v1/photos', { method: 'POST', body: form });
  };
  const publish = galleryId => request('/api/v1/galleries/' + galleryId + '/publication', json('POST', { acknowledgePublicOriginals: true }));
  const exportOptions = { db: app.locals.db, projectRoot: root, outputPath: path.join(root, 'site-output') };
  t.after(async () => { await new Promise(resolve => server.close(resolve)); app.locals.db.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, app, base, request, json, album, upload, publish, exportOptions };
}
async function image(date = '2025:06:01 17:12:00') {
  return sharp({ create: { width: 120, height: 80, channels: 3, background: '#417d55' } })
    .jpeg().withExif({ IFD0: { DateTime: date }, IFD2: { DateTimeOriginal: date } }).toBuffer();
}

test('date normalization preserves floating EXIF time and rejects impossible dates', () => {
  assert.equal(normalizeDate('2025:06:01 17:12:00'), '2025-06-01T17:12:00');
  assert.equal(normalizeDate('2024-02-29'), '2024-02-29');
  assert.equal(normalizeDate('2025-02-29'), '');
  assert.equal(normalizeDate('2025-13-01'), '');
});

test('per-photo EXIF, manual overrides, dimensions and unchanged original bytes', async t => {
  const f = await fixture(t);
  const gallery = await f.album();
  assert.equal(gallery.themePreset, 'forest');
  const firstBytes = await image('2025:06:01 17:12:00');
  const first = await f.upload(gallery.id, firstBytes, { uploadKey: 'first' });
  assert.equal(first.response.status, 201);
  assert.equal(first.result.dateTaken, '2025-06-01T17:12:00');
  assert.equal(first.result.metadataSource, 'EXIF');
  assert.equal(first.result.width, 120);
  assert.equal(first.result.height, 80);
  assert.equal(first.result.sha256, hash(firstBytes));
  const downloaded = await fetch(f.base + first.result.originalUrl);
  assert.equal(hash(Buffer.from(await downloaded.arrayBuffer())), hash(firstBytes));
  const preview = await fetch(f.base + first.result.previewUrl);
  assert.equal((await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).exif, undefined);
  const second = await f.upload(gallery.id, await image('2025:06:03 09:00:00'));
  assert.equal(second.result.dateTaken, '2025-06-03T09:00:00');
  const manual = await f.upload(gallery.id, await image(), { date: '2025-05-20', sport: 'Soccer', location: 'Away ground' });
  assert.equal(manual.result.dateTaken, '2025-05-20');
  assert.equal(manual.result.metadataSource, 'Manual');
  assert.equal(manual.result.sport, 'Soccer');
  const duplicate = await f.upload(gallery.id, firstBytes, { uploadKey: 'first' });
  assert.equal(duplicate.result.id, first.result.id);
  assert.equal((await f.request('/api/v1/galleries/' + gallery.id + '/photos')).result.length, 3);
  assert.equal((await fs.readdir(path.join(f.root, 'data', 'incoming'))).length, 0);
});

test('missing EXIF uses that file’s modified date, not another photo', async t => {
  const f = await fixture(t);
  const gallery = await f.album();
  const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: 'blue' } }).png().toBuffer();
  const form = new FormData();
  form.append('photo', new Blob([bytes]), 'image.png');
  form.append('lastModified', String(Date.UTC(2024, 2, 6, 9)));
  const result = await f.request('/api/v1/metadata-inspections', { method: 'POST', body: form });
  assert.equal(result.result.metadataSource, 'File modified');
  assert.equal(result.result.dateTaken, '2024-03-06T09:00:00.000Z');
  assert.equal((await f.request('/api/v1/galleries/' + gallery.id + '/photos')).result.length, 0);
});

test('Zonerama collections publish and export without copying photo files', async t => {
  const f = await fixture(t);
  const created = await f.request('/api/v1/galleries', f.json('POST', {
    name: 'Live field hockey', sport: 'Field hockey', eventDate: '2026-09-15',
    externalUrl: 'https://eu.zonerama.com/302Edits/Album/16333720',
  }));
  assert.equal(created.response.status, 201);
  assert.equal(created.result.externalUrl, 'https://eu.zonerama.com/302Edits/Album/16333720');
  const rejected = await f.request('/api/v1/galleries', f.json('POST', { name: 'Unsafe', externalUrl: 'https://example.com/photos' }));
  assert.equal(rejected.response.status, 400);
  const published = await f.request('/api/v1/galleries/' + created.result.id + '/publication',
    f.json('POST', { acknowledgeExternalGallery: true }));
  assert.equal(published.response.status, 200);
  const summary = await exportSite(f.exportOptions);
  const galleries = JSON.parse(await fs.readFile(path.join(summary.outputPath, 'data/galleries.json')));
  assert.equal(galleries.length, 1);
  assert.equal(galleries[0].externalUrl, created.result.externalUrl);
  assert.equal(galleries[0].photoCount, 0);
  assert.equal(JSON.parse(await fs.readFile(path.join(summary.outputPath, 'data/albums', created.result.id + '.json'))).length, 0);
  await assert.rejects(fs.stat(path.join(summary.outputPath, 'images')));
});

test('20 MiB original survives upload, public export and download byte-for-byte', async t => {
  const f = await fixture(t);
  const gallery = await f.album();
  const jpeg = await image();
  // Valid JPEG with trailing padding exercises the real transfer/storage size;
  // it is a synthetic fixture, not a claim about the owner's image content.
  const bytes = Buffer.concat([jpeg, Buffer.alloc(20 * 1024 ** 2 - jpeg.length)]);
  const photo = (await f.upload(gallery.id, bytes)).result;
  assert.equal(photo.sizeBytes, bytes.length);
  assert.equal(photo.sha256, hash(bytes));
  await f.publish(gallery.id);
  const exported = await exportSite(f.exportOptions);
  const views = JSON.parse(await fs.readFile(path.join(exported.outputPath, 'data/albums', gallery.id + '.json')));
  assert.equal(hash(await fs.readFile(path.join(exported.outputPath, views[0].originalUrl.slice(1)))), hash(bytes));
  assert.equal(hash(Buffer.from(await (await fetch(f.base + photo.originalUrl)).arrayBuffer())), hash(bytes));
});

test('publication snapshot excludes all later drafts and draft covers', async t => {
  const f = await fixture(t);
  const gallery = await f.album();
  const bytes = await image();
  const published = (await f.upload(gallery.id, bytes)).result;
  assert.equal((await f.publish(gallery.id)).response.status, 200);
  const draft = (await f.upload(gallery.id, await image('2025:06:09 16:00:00'))).result;
  const hiddenAlbum = await f.album('Private upcoming event');
  await f.upload(hiddenAlbum.id, await image());
  await f.request('/api/v1/galleries/' + gallery.id, f.json('PATCH', { coverPhotoId: draft.id }));
  const summary = await exportSite(f.exportOptions);
  const galleries = JSON.parse(await fs.readFile(path.join(summary.outputPath, 'data/galleries.json')));
  assert.equal(galleries.length, 1);
  assert.equal(galleries[0].cover.id, published.id);
  const photos = JSON.parse(await fs.readFile(path.join(summary.outputPath, 'data/albums', gallery.id + '.json')));
  assert.equal(photos.length, 1);
  assert.equal(photos[0].id, published.id);
  assert.equal(photos[0].filePath, undefined);
  assert.equal(photos[0].exifRaw, undefined);
  await assert.rejects(fs.stat(path.join(summary.outputPath, 'images', draft.id)));
  await assert.rejects(fs.stat(path.join(summary.outputPath, 'data/albums', hiddenAlbum.id + '.json')));
  const exportedOriginal = await fs.readFile(path.join(summary.outputPath, photos[0].originalUrl.slice(1)));
  assert.equal(hash(exportedOriginal), hash(bytes));
  const backups = await fs.readdir(path.join(f.root, 'data/backups'));
  const restored = openDatabase(path.join(f.root, 'data/backups', backups.find(name => name.startsWith('published-'))));
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM photos').get().n, 1);
  assert.equal(restored.prepare('SELECT sha256 FROM photos').get().sha256, hash(bytes));
  restored.close();
});

test('oversized originals and original-integrity failures block export, preserving prior output', async t => {
  const f = await fixture(t);
  const gallery = await f.album();
  const photo = (await f.upload(gallery.id, await image())).result;
  await f.publish(gallery.id);
  const summary = await exportSite(f.exportOptions);
  const before = await fs.readFile(path.join(summary.outputPath, 'data/galleries.json'), 'utf8');
  const row = f.app.locals.db.prepare('SELECT * FROM photos WHERE id=?').get(photo.id);
  const oversized = path.join(f.root, 'oversized');
  const handle = await fs.open(oversized, 'w');
  await handle.truncate(MAX_ASSET_BYTES + 1); await handle.close();
  f.app.locals.db.prepare('UPDATE photos SET filePath=? WHERE id=?').run(oversized, photo.id);
  await assert.rejects(exportSite(f.exportOptions), /25 MiB/);
  assert.equal(await fs.readFile(path.join(summary.outputPath, 'data/galleries.json'), 'utf8'), before);
  f.app.locals.db.prepare('UPDATE photos SET filePath=?,sha256=? WHERE id=?').run(row.filePath, 'bad-hash', photo.id);
  await assert.rejects(exportSite(f.exportOptions), /integrity check failed/);
  assert.equal(await fs.readFile(path.join(summary.outputPath, 'data/galleries.json'), 'utf8'), before);
});

test('20,000-file quota is enforced before expensive copying', async t => {
  const f = await fixture(t);
  const gallery = await f.album();
  const db = f.app.locals.db;
  const ids = [];
  const insert = db.prepare('INSERT INTO photos(id,galleryId,filePath,fileName) VALUES(?,?,?,?)');
  db.transaction(() => { for (let i = 0; i < 7000; i++) { const id = 'quota-' + i; ids.push(id); insert.run(id, gallery.id, 'not-copied', 'test.jpg'); } })();
  db.prepare('UPDATE galleries SET publishedAt=?,publishedPhotoIds=? WHERE id=?').run('2025-01-01', JSON.stringify(ids), gallery.id);
  await assert.rejects(exportSite(f.exportOptions), /20,000/);
  await assert.rejects(fs.stat(f.exportOptions.outputPath));
});

test('re-export retains recoverable prior artifact and rejects owner builds', async t => {
  const f = await fixture(t);
  await exportSite(f.exportOptions);
  const next = await exportSite(f.exportOptions);
  assert.ok(next.previousOutputPath);
  assert.ok((await fs.stat(next.previousOutputPath)).isDirectory());
  await fs.writeFile(path.join(f.root, 'frontend/dist-public/build-info.json'), '{"staticSite":false}');
  await assert.rejects(exportSite(f.exportOptions), /not a public build/);
  assert.ok((await fs.stat(next.outputPath)).isDirectory());
});

test('legacy schema migration preserves records and creates a recovery copy', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sideline-migration-'));
  const Database = require('better-sqlite3');
  const filename = path.join(root, 'legacy.sqlite');
  const old = new Database(filename);
  old.exec("CREATE TABLE galleries(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT,createdAt TEXT,themeColor TEXT); CREATE TABLE photos(id TEXT PRIMARY KEY,galleryId TEXT,filePath TEXT NOT NULL,fileName TEXT NOT NULL,mimeType TEXT,width INTEGER,height INTEGER,dateTaken TEXT,sport TEXT,location TEXT,capturedAt TEXT,exifRaw TEXT); INSERT INTO galleries(id,name) VALUES('old','Existing album')");
  old.close();
  const db = openDatabase(filename, path.join(root, 'backups'));
  assert.equal(db.prepare('SELECT name FROM galleries').get().name, 'Existing album');
  assert.equal(db.prepare('SELECT publishedAt FROM galleries').get().publishedAt, null);
  assert.equal((await fs.readdir(path.join(root, 'backups'))).length, 1);
  db.close();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
});
