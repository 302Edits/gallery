const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { randomUUID, randomBytes, timingSafeEqual } = require('node:crypto');
const { openDatabase } = require('./database');
const { normalizeDate, hashFile, inspectImage, preparePreviews } = require('./images');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const fail = (status, message, code = 'INVALID_REQUEST') => Object.assign(new Error(message), { status, code });
function text(value, limit = 200) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > limit) throw fail(400, 'Text must be at most ' + limit + ' characters.');
  return value.trim();
}
function checkedDate(value) {
  if (!value) return '';
  const result = normalizeDate(value);
  if (!result) throw fail(400, 'Use a valid date in YYYY-MM-DD format.');
  return result;
}
function checkedExternalUrl(value) {
  const raw = text(value, 500);
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw fail(400, 'Use a valid Zonerama album or profile link.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !(host === 'zonerama.com' || host.endsWith('.zonerama.com')) || url.username || url.password) {
    throw fail(400, 'Use an HTTPS link hosted on Zonerama.');
  }
  url.hash = '';
  return url.href;
}

function createApp(options = {}) {
  const dataDir = path.resolve(options.dataDir || path.join(__dirname, 'data'));
  for (const subdir of ['incoming', 'originals', 'previews', 'thumbnails', 'backups']) fs.mkdirSync(path.join(dataDir, subdir), { recursive: true });
  const db = options.db || openDatabase(options.dbPath || path.join(__dirname, 'gallery.db'), path.join(dataDir, 'backups'));
  const token = randomBytes(32).toString('hex');
  const app = express();
  const allowedOrigins = new Set(options.origins || [5001, 5173, 4173].flatMap(port => ['http://127.0.0.1:' + port, 'http://localhost:' + port]));
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, strictTransportSecurity: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    let host, hostUrl;
    try { hostUrl = new URL('http://' + req.get('host')); host = hostUrl.hostname; } catch { return next(fail(403, 'Local computer access only.', 'FORBIDDEN')); }
    const allowedHostHeaders = new Set([...allowedOrigins].map(origin => new URL(origin).host));
    for (const name of ['127.0.0.1', 'localhost', '[::1]']) allowedHostHeaders.add(name + ':' + req.socket.localPort);
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (!local || !['127.0.0.1', 'localhost', '[::1]'].includes(host) || !allowedHostHeaders.has(req.get('host')) || hostUrl.username || hostUrl.password || req.get('sec-fetch-site') === 'cross-site' || (req.get('origin') && !allowedOrigins.has(req.get('origin')))) return next(fail(403, 'Local computer access only. Open the owner manager on localhost.', 'FORBIDDEN'));
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/zonerama', require('./zonerama-handler').serveZonerama);
  app.get('/api/v1/session', (req, res) => res.json({ token }));
  app.use('/api', (req, res, next) => {
    const given = req.get('authorization') || '';
    const expected = 'Bearer ' + token;
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return next(fail(401, 'Reopen the owner manager to reconnect your session.', 'UNAUTHORIZED'));
    next();
  });

  function photoView(photo) {
    return { id: photo.id, galleryId: photo.galleryId, fileName: photo.fileName, mimeType: photo.mimeType,
      width: photo.width, height: photo.height, dateTaken: photo.dateTaken, sport: photo.sport, location: photo.location,
      capturedAt: photo.capturedAt, sizeBytes: photo.sizeBytes || 0, sha256: photo.sha256,
      hasGps: Boolean(photo.hasGps), metadataSource: photo.metadataSource,
      thumbnailUrl: '/media/' + photo.id + '/thumbnail', previewUrl: '/media/' + photo.id + '/preview', originalUrl: '/media/' + photo.id + '/original' };
  }
  function galleryRow(id) {
    const row = db.prepare('SELECT * FROM galleries WHERE id=?').get(id);
    if (!row) throw fail(404, 'Album not found.', 'NOT_FOUND');
    return row;
  }
  function galleryView(row) {
    const cover = db.prepare('SELECT * FROM photos WHERE galleryId=? ORDER BY (id=?) DESC,dateTaken DESC,id LIMIT 1').get(row.id, row.coverPhotoId || '');
    const { publishedPhotoIds, ...publicFields } = row;
    return { ...publicFields, photoCount: db.prepare('SELECT COUNT(*) AS n FROM photos WHERE galleryId=?').get(row.id).n,
      cover: cover ? photoView(cover) : null };
  }
  function galleryFields(input, previous = {}) {
    const value = { ...previous, ...input };
    const name = text(value.name, 120);
    if (!name) throw fail(400, 'Give your album a name.');
    const themePreset = value.themePreset || 'editorial';
    if (!['editorial', 'courtside', 'ocean', 'forest', 'monochrome'].includes(themePreset)) throw fail(400, 'Choose an available album theme.');
    const accents = { editorial: '#a74425', courtside: '#9a4b12', ocean: '#24628c', forest: '#30694d', monochrome: '#5f5f5f' };
    const themeColor = text(value.themeColor || accents[themePreset], 7);
    if (!/^#[\da-f]{6}$/i.test(themeColor)) throw fail(400, 'Choose a six-digit hex theme color.');
    return { name, description: text(value.description, 2000), sport: text(value.sport, 100), location: text(value.location),
      eventDate: checkedDate(value.eventDate), themeColor, themePreset, coverPhotoId: value.coverPhotoId ? text(value.coverPhotoId, 100) : null,
      externalUrl: checkedExternalUrl(value.externalUrl) };
  }

  app.get('/api/v1/galleries', (req, res) => res.json(db.prepare("SELECT * FROM galleries ORDER BY COALESCE(NULLIF(eventDate,''),createdAt) DESC,id").all().map(galleryView)));
  app.post('/api/v1/galleries', (req, res) => {
    const fields = galleryFields(req.body);
    if (fields.coverPhotoId) throw fail(400, 'Create the album and upload its photos before choosing a cover.');
    const id = randomUUID();
    db.prepare('INSERT INTO galleries(id,name,description,sport,location,eventDate,themeColor,themePreset,externalUrl,createdAt) VALUES(@id,@name,@description,@sport,@location,@eventDate,@themeColor,@themePreset,@externalUrl,@createdAt)').run({ ...fields, id, createdAt: new Date().toISOString() });
    res.status(201).json(galleryView(galleryRow(id)));
  });
  app.patch('/api/v1/galleries/:id', (req, res) => {
    const fields = galleryFields(req.body, galleryRow(req.params.id));
    if (fields.coverPhotoId && !db.prepare('SELECT id FROM photos WHERE id=? AND galleryId=?').get(fields.coverPhotoId, req.params.id)) throw fail(400, 'Choose a cover from this album.');
    db.prepare('UPDATE galleries SET name=@name,description=@description,sport=@sport,location=@location,eventDate=@eventDate,themeColor=@themeColor,themePreset=@themePreset,coverPhotoId=@coverPhotoId,externalUrl=@externalUrl WHERE id=@id').run({ ...fields, id: req.params.id });
    res.json(galleryView(galleryRow(req.params.id)));
  });
  app.get('/api/v1/galleries/:id/photos', (req, res) => {
    galleryRow(req.params.id);
    res.json(db.prepare("SELECT * FROM photos WHERE galleryId=? ORDER BY COALESCE(NULLIF(dateTaken,''),capturedAt) DESC,id").all(req.params.id).map(photoView));
  });

  const multipart = multer({ dest: path.join(dataDir, 'incoming'), limits: { fileSize: 100 * 1024 ** 2, files: 1, fields: 20, fieldSize: 4096 } }).single('photo');
  let activeProcessing = 0;
  const processingLane = (req, res, next) => {
    if (activeProcessing >= 2) return next(fail(429, 'Two photos are already being prepared. Please wait and retry.', 'BUSY'));
    activeProcessing++;
    let released = false;
    const release = () => { if (!released) { activeProcessing--; released = true; } };
    res.once('finish', release);
    // Do not release on client disconnect while image processing is still running.
    req.processingRelease = release;
    next();
  };
  app.post('/api/v1/metadata-inspections', processingLane, multipart, async (req, res) => {
    if (!req.file) { req.processingRelease(); throw fail(400, 'Choose a photo to inspect.'); }
    try { res.json(await inspectImage(req.file.path, req.body.lastModified)); }
    finally { await fsp.unlink(req.file.path).catch(() => {}); req.processingRelease(); }
  });
  app.post('/api/v1/photos', processingLane, multipart, async (req, res) => {
    if (!req.file) { req.processingRelease(); throw fail(400, 'Choose a photo to upload.'); }
    const paths = [req.file.path];
    let saved = false;
    try {
      const gallery = galleryRow(text(req.body.galleryId, 100));
      const uploadKey = text(req.body.uploadKey, 100) || null;
      const existing = uploadKey && db.prepare('SELECT * FROM photos WHERE uploadKey=? AND galleryId=?').get(uploadKey, gallery.id);
      if (existing) { res.json(photoView(existing)); return; }
      const metadata = await inspectImage(req.file.path, req.body.lastModified);
      const override = checkedDate(req.body.dateTaken || req.body.date);
      const id = randomUUID();
      const filePath = path.join(dataDir, 'originals', id);
      const thumbnailPath = path.join(dataDir, 'thumbnails', id + '.webp');
      const previewPath = path.join(dataDir, 'previews', id + '.webp');
      paths.push(filePath, thumbnailPath, previewPath);
      const sha256 = await hashFile(req.file.path);
      await fsp.rename(req.file.path, filePath);
      await preparePreviews(filePath, thumbnailPath, previewPath);
      const record = { id, galleryId: gallery.id, filePath, thumbnailPath, previewPath,
        fileName: path.basename(req.file.originalname).replace(/[\x00-\x1f]/g, '').slice(0, 200) || 'photo',
        mimeType: metadata.mimeType, width: metadata.width, height: metadata.height,
        dateTaken: override || metadata.dateTaken,
        metadataSource: override ? req.body.metadataSource === 'batch' ? 'Batch' : ['manual', 'batch'].includes(req.body.metadataSource) || override !== metadata.dateTaken ? 'Manual' : metadata.metadataSource : metadata.metadataSource,
        sport: text(req.body.sport, 100) || gallery.sport, location: text(req.body.location) || gallery.location,
        capturedAt: new Date().toISOString(), sizeBytes: req.file.size, sha256, hasGps: Number(metadata.hasGps), uploadKey };
      const columns = Object.keys(record);
      db.prepare('INSERT INTO photos(' + columns.join(',') + ') VALUES(' + columns.map(column => '@' + column).join(',') + ')').run(record);
      saved = true;
      res.status(201).json(photoView(record));
    } finally {
      for (const filename of saved ? [req.file.path] : paths) await fsp.unlink(filename).catch(() => {});
      req.processingRelease();
    }
  });
  app.patch('/api/v1/photos/:id', (req, res) => {
    const previous = db.prepare('SELECT * FROM photos WHERE id=?').get(req.params.id);
    if (!previous) throw fail(404, 'Photo not found.', 'NOT_FOUND');
    db.prepare('UPDATE photos SET sport=?,location=?,dateTaken=?,metadataSource=? WHERE id=?').run(
      text(req.body.sport ?? previous.sport, 100), text(req.body.location ?? previous.location),
      checkedDate(req.body.dateTaken ?? previous.dateTaken), req.body.dateTaken === undefined ? previous.metadataSource : 'Manual', previous.id);
    res.json(photoView(db.prepare('SELECT * FROM photos WHERE id=?').get(previous.id)));
  });
  app.get('/media/:id/:variant', (req, res, next) => {
    const photo = db.prepare('SELECT * FROM photos WHERE id=?').get(req.params.id);
    if (!photo) return next(fail(404, 'Photo not found.', 'NOT_FOUND'));
    const variants = { original: photo.filePath, thumbnail: photo.thumbnailPath, preview: photo.previewPath };
    const filename = Object.hasOwn(variants, req.params.variant) ? variants[req.params.variant] : null;
    if (!filename) return next(fail(404, 'Preview is unavailable. Re-upload this legacy photo before publishing.', 'NOT_FOUND'));
    const absolute = path.isAbsolute(filename) ? filename : path.resolve(__dirname, filename);
    const permitted = [dataDir, path.join(__dirname, 'uploads')].some(base => absolute.startsWith(base + path.sep));
    if (!permitted) return next(fail(404, 'Photo file is unavailable.', 'NOT_FOUND'));
    if (req.params.variant === 'original') res.download(absolute, photo.fileName, error => { if (error) next(error); });
    else res.type('webp').sendFile(absolute, error => { if (error) next(error); });
  });
  let exporting = false;
  app.post('/api/v1/galleries/:id/publication', async (req, res) => {
    const gallery = galleryRow(req.params.id);
    const external = Boolean(gallery.externalUrl);
    if (external ? req.body.acknowledgeExternalGallery !== true : req.body.acknowledgePublicOriginals !== true) {
      throw fail(400, external ? 'Confirm that this public Zonerama link is ready to share.' : 'Confirm publication rights and public access to unchanged originals and their embedded metadata.');
    }
    const photos = db.prepare('SELECT * FROM photos WHERE galleryId=? ORDER BY id').all(req.params.id);
    if (!external && !photos.length) throw fail(400, 'Add at least one photo before publishing.');
    if (!external) {
      const { checkPhotoAssets } = require('./export-site');
      for (const photo of photos) await checkPhotoAssets(photo);
    }
    const previous = galleryRow(req.params.id);
    const publishedAt = new Date().toISOString();
    db.prepare('UPDATE galleries SET publishedAt=?,publishedPhotoIds=? WHERE id=?').run(publishedAt, JSON.stringify(external ? [] : photos.map(photo => photo.id)), req.params.id);
    try {
      await db.backup(path.join(dataDir, 'backups', 'published-' + randomUUID() + '.sqlite'));
    } catch {
      db.prepare('UPDATE galleries SET publishedAt=?,publishedPhotoIds=? WHERE id=?').run(previous.publishedAt, previous.publishedPhotoIds, req.params.id);
      throw fail(500, 'Publication settings backup failed. Album publication was not changed.', 'BACKUP_FAILED');
    }
    res.json(galleryView(galleryRow(req.params.id)));
  });
  app.post('/api/v1/exports', async (req, res) => {
    if (exporting) throw fail(409, 'An export is already being prepared. Please wait.', 'BUSY');
    exporting = true;
    try { res.json(await require('./export-site').exportSite({ db, projectRoot: options.projectRoot || PROJECT_ROOT, outputPath: options.outputPath || path.join(PROJECT_ROOT, 'site-output') })); }
    finally { exporting = false; }
  });
  app.use((req, res, next) => next(fail(404, 'Page not found.', 'NOT_FOUND')));
  app.use((error, req, res, next) => {
    req.processingRelease?.();
    if (res.headersSent) return next(error);
    const status = error instanceof multer.MulterError ? error.code === 'LIMIT_FILE_SIZE' ? 413 : 400 : error.status || 500;
    res.status(status).json({ error: { code: error.code || (status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST'),
      message: error instanceof multer.MulterError ? 'Upload one photo at a time, up to 100 MiB.' : status === 500 ? 'The operation failed. Your existing albums are unchanged; please retry.' : error.message } });
  });
  app.locals.db = db;
  app.locals.dataDir = dataDir;
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 5001);
  createApp().listen(port, '127.0.0.1', () => console.log('Private owner manager listening on http://127.0.0.1:' + port + '. Do not expose this service publicly.'));
}
module.exports = { createApp };
