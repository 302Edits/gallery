const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { hashFile } = require('./images');

const MAX_ASSET_BYTES = 25 * 1024 ** 2;
const MAX_FILES = 20000;
const error = (message, status = 409) => Object.assign(new Error(message), { status, code: 'EXPORT_BLOCKED' });
const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif', 'image/tiff': '.tiff' };

async function checkPhotoAssets(photo) {
  if (!photo.sha256 || !photo.thumbnailPath || !photo.previewPath) throw error(`${photo.fileName}: this legacy photo needs previews and a verified original. Re-upload it before publishing.`);
  for (const filename of [photo.filePath, photo.thumbnailPath, photo.previewPath]) {
    let stat;
    try { stat = await fs.stat(filename); } catch { throw error(`${photo.fileName}: a photo file is missing. Restore it from your separate backup.`); }
    if (!stat.isFile()) throw error(`${photo.fileName}: invalid photo asset.`);
    if (stat.size > MAX_ASSET_BYTES) throw error(`${photo.fileName} exceeds the free host's 25 MiB per-file limit. Your original is unchanged. Choose a different hosting plan or keep this photo unpublished.`);
  }
  if (await hashFile(photo.filePath) !== photo.sha256) throw error(`${photo.fileName}: original integrity check failed. Restore the unchanged original from your backup.`);
}

async function walk(directory, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw error('The public build must not contain symbolic links.');
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function publicPhoto(photo) {
  const directory = '/images/' + photo.id;
  return { id: photo.id, galleryId: photo.galleryId, fileName: photo.fileName, mimeType: photo.mimeType,
    width: photo.width, height: photo.height, dateTaken: photo.dateTaken, sport: photo.sport,
    location: photo.location, capturedAt: photo.capturedAt, sizeBytes: photo.sizeBytes, sha256: photo.sha256,
    thumbnailUrl: directory + '/thumbnail.webp', previewUrl: directory + '/preview.webp',
    originalUrl: '/originals/' + photo.id + (extensions[photo.mimeType] || '') };
}

async function exportSite({ db, projectRoot, outputPath }) {
  const buildPath = path.join(projectRoot, 'frontend', 'dist-public');
  let buildInfo;
  try { buildInfo = JSON.parse(await fs.readFile(path.join(buildPath, 'build-info.json'), 'utf8')); }
  catch { throw error('Build the public website first with npm run build. Your current public export is unchanged.', 503); }
  if (buildInfo.staticSite !== true) throw error('This is an owner-manager build, not a public build. Run npm run build first.', 503);
  const buildFiles = await walk(buildPath);
  const forbidden = /(^|\/)(?:\.env(?:\..*)?|.*\.(?:db|sqlite|sqlite3)|_worker\.js|functions)$/i;
  for (const file of buildFiles) {
    if (forbidden.test(file)) throw error('Private or executable server files were found in the public build.');
    if ((await fs.stat(path.join(buildPath, file))).size > MAX_ASSET_BYTES) throw error('An application asset exceeds the 25 MiB host limit.');
  }
  // Freeze the selection/metadata before async copies. New uploads stay draft.
  const albums = db.prepare('SELECT * FROM galleries WHERE publishedAt IS NOT NULL ORDER BY eventDate DESC,createdAt DESC,id').all().map(gallery => {
    const ids = new Set(JSON.parse(gallery.publishedPhotoIds || '[]'));
    const photos = db.prepare("SELECT * FROM photos WHERE galleryId=? ORDER BY COALESCE(NULLIF(dateTaken,''),capturedAt) DESC,id").all(gallery.id).filter(photo => ids.has(photo.id));
    if (photos.length !== ids.size) throw error(`${gallery.name}: a published photo record is missing. Restore the metadata backup.`);
    return { gallery, photos };
  });
  const predictedCount = buildFiles.length + albums.length + albums.reduce((sum, album) => sum + album.photos.length * 3, 0) + 3;
  if (predictedCount > MAX_FILES) throw error(`This export needs ${predictedCount.toLocaleString()} files; the free host allows 20,000. Existing albums and originals are unchanged. No albums have been deleted.`);
  for (const { photos } of albums) for (const photo of photos) await checkPhotoAssets(photo);

  const staging = path.join(projectRoot, '.publish-staging-' + randomUUID());
  await fs.mkdir(staging);
  await fs.cp(buildPath, staging, { recursive: true });
  await fs.mkdir(path.join(staging, 'data', 'albums'), { recursive: true });
  const galleries = [];
  for (const { gallery, photos } of albums) {
    const views = photos.map(publicPhoto);
    const cover = views.find(photo => photo.id === gallery.coverPhotoId) || views[0] || null;
    galleries.push({ id: gallery.id, name: gallery.name, description: gallery.description,
      sport: gallery.sport, location: gallery.location, eventDate: gallery.eventDate,
      themeColor: gallery.themeColor, themePreset: gallery.themePreset,
      externalUrl: gallery.externalUrl || '',
      createdAt: gallery.createdAt, publishedAt: gallery.publishedAt,
      coverPhotoId: cover?.id || null, photoCount: views.length, cover });
    await fs.writeFile(path.join(staging, 'data', 'albums', gallery.id + '.json'), JSON.stringify(views));
    for (let index = 0; index < photos.length; index++) {
      const photo = photos[index];
      const view = views[index];
      const destination = path.join(staging, 'images', photo.id);
      await fs.mkdir(destination, { recursive: true });
      for (const [source, url] of [[photo.filePath, view.originalUrl], [photo.thumbnailPath, view.thumbnailUrl], [photo.previewPath, view.previewUrl]]) {
        const target = path.join(staging, url.slice(1));
        await fs.mkdir(path.dirname(target), { recursive: true });
        // Originals are immutable. Hard links avoid duplicating a 120 GB archive
        // on the owner's disk; copy fallback supports different filesystems.
        try { await fs.link(source, target); }
        catch { await fs.copyFile(source, target); }
      }
    }
  }
  await fs.writeFile(path.join(staging, 'data', 'galleries.json'), JSON.stringify(galleries));
  await fs.writeFile(path.join(staging, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.zonerama.com; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'\n/data/*\n  Cache-Control: public, max-age=0, must-revalidate\n/images/*\n  Cache-Control: public, max-age=31536000, immutable\n/originals/*\n  Cache-Control: public, max-age=31536000, immutable\n  Content-Disposition: attachment\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
  await fs.writeFile(path.join(staging, '_redirects'), '/api/v1/* /not-found 404\n');
  const files = await walk(staging);
  let totalBytes = 0;
  for (const file of files) {
    const stat = await fs.stat(path.join(staging, file));
    if (stat.size > MAX_ASSET_BYTES) throw error('A generated manifest exceeds the per-file host limit. The last public export is unchanged.');
    totalBytes += stat.size;
  }
  if (files.length > MAX_FILES) throw error('The generated site exceeds 20,000 files. The last public export is unchanged.');
  let previousOutputPath = null;
  try {
    await fs.lstat(outputPath);
    previousOutputPath = outputPath + '-previous-' + randomUUID();
    await fs.rename(outputPath, previousOutputPath);
  } catch (err) { if (err.code !== 'ENOENT') throw err; }
  try { await fs.rename(staging, outputPath); }
  catch (err) { if (previousOutputPath) await fs.rename(previousOutputPath, outputPath); throw err; }
  return { outputPath, fileCount: files.length, totalBytes, galleryCount: galleries.length, previousOutputPath };
}

module.exports = { exportSite, checkPhotoAssets, publicPhoto, MAX_ASSET_BYTES, MAX_FILES };
