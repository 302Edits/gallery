import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ZONERAMA_ORIGIN = 'https://eu.zonerama.com';
const BOT_PLACEHOLDER_SHA256 = '2e0f3e25b34514b1a639c1c079c5b405304f20806feb779f12255d6e2bcf1d0b';
const snapshotRoot = path.resolve(process.env.ZONERAMA_SNAPSHOT_ROOT || 'frontend/public/api/zonerama');
const concurrency = Math.max(1, Math.min(12, Number(process.env.ZONERAMA_VERIFY_CONCURRENCY || 6)));
const referrer = process.env.ZONERAMA_VERIFY_REFERRER || 'https://302edits.github.io/gallery/';

function assertion(condition, message) {
  if (!condition) throw new Error(message);
}

function parsePublicImageUrl(value, expectedPath, label) {
  const url = new URL(value);
  assertion(url.origin === ZONERAMA_ORIGIN, `${label} must use ${ZONERAMA_ORIGIN}`);
  assertion(!url.username && !url.password && !url.hash, `${label} contains credentials or a fragment`);
  assertion(url.pathname === expectedPath, `${label} must use ${expectedPath}`);
  assertion([...url.searchParams.keys()].sort().join(',') === 'height,width', `${label} has unexpected query parameters`);
  for (const dimension of ['width', 'height']) {
    const value = url.searchParams.get(dimension);
    assertion(/^\d{1,4}$/.test(value || '') && Number(value) > 0, `${label} has an invalid ${dimension}`);
  }
  return url;
}

export function validateCoverUrl(value, albumId) {
  return parsePublicImageUrl(value, `/Social/AlbumCover/${albumId}`, `Album ${albumId} cover`);
}

export function validatePhotoUrl(value, photoId, variant) {
  return parsePublicImageUrl(value, `/Social/Photo/${photoId}`, `Photo ${photoId} ${variant}`);
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid snapshot file ${path.relative(process.cwd(), file)}: ${error.message}`);
  }
}

async function inspectImage(check) {
  const response = await fetch(check.url, {
    headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', Referer: referrer },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  assertion(response.ok, `Photo ${check.photo.id} returned HTTP ${response.status}`);
  assertion((response.headers.get('Content-Type') || '').startsWith('image/'), `Photo ${check.photo.id} did not return an image`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assertion(bytes.length > 1024 && bytes.length <= 10 * 1024 * 1024, `Photo ${check.photo.id} returned an invalid image size`);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  assertion(hash !== BOT_PLACEHOLDER_SHA256, `Photo ${check.photo.id} returned Zonerama's Bot Detected placeholder`);
  const metadata = await sharp(bytes).metadata();
  assertion(metadata.width && metadata.height, `Photo ${check.photo.id} could not be decoded`);
  const expectedRatio = check.photo.width / check.photo.height;
  const actualRatio = metadata.width / metadata.height;
  assertion(Math.abs(actualRatio / expectedRatio - 1) <= 0.02, `Photo ${check.photo.id} returned unexpected ${metadata.width}x${metadata.height} dimensions`);
  assertion(metadata.width <= check.requestedWidth + 1 && metadata.height <= check.requestedHeight + 1,
    `Photo ${check.photo.id} exceeded its requested dimensions`);
  return hash;
}

export async function verifySnapshot() {
  const archive = await readJson(path.join(snapshotRoot, 'index.json'));
  assertion(Array.isArray(archive.albums) && archive.albums.length > 0, 'The Zonerama snapshot contains no albums');
  const albumIds = new Set();
  const checks = [];
  let photoCount = 0;

  for (const summary of archive.albums) {
    const albumId = String(summary.id || '');
    assertion(/^\d+$/.test(albumId) && !albumIds.has(albumId), `Invalid or duplicate album id ${albumId || '(empty)'}`);
    albumIds.add(albumId);
    validateCoverUrl(summary.cover, albumId);
    const album = await readJson(path.join(snapshotRoot, 'albums', `${albumId}.json`));
    assertion(String(album.id) === albumId, `Album ${albumId} manifest id does not match its filename`);
    assertion(album.cover === summary.cover, `Album ${albumId} cover differs between archive and album manifests`);
    assertion(Array.isArray(album.photos), `Album ${albumId} has no photo list`);
    const photoIds = new Set();

    for (const photo of album.photos) {
      const photoId = String(photo.id || '');
      assertion(/^\d+$/.test(photoId) && !photoIds.has(photoId), `Album ${albumId} has an invalid or duplicate photo id`);
      assertion(Number.isFinite(photo.width) && photo.width > 0 && Number.isFinite(photo.height) && photo.height > 0,
        `Photo ${photoId} has invalid dimensions`);
      photoIds.add(photoId);
      validatePhotoUrl(photo.thumbnailUrl, photoId, 'thumbnail');
      validatePhotoUrl(photo.previewUrl, photoId, 'preview');
    }

    photoCount += album.photos.length;
    const sample = album.photos.find(photo => Math.abs(photo.width / photo.height - 1) > 0.05) || album.photos[0];
    if (sample) {
      const url = validatePhotoUrl(sample.thumbnailUrl, sample.id, 'thumbnail');
      checks.push({ albumId, photo: sample, url, requestedWidth: Number(url.searchParams.get('width')),
        requestedHeight: Number(url.searchParams.get('height')) });
    } else {
      assertion(Number(summary.photoCount || 0) === 0, `Album ${albumId} unexpectedly has no photographs`);
    }
  }

  let cursor = 0;
  const hashes = [];
  async function worker() {
    while (cursor < checks.length) {
      const check = checks[cursor++];
      try {
        hashes.push(await inspectImage(check));
      } catch (error) {
        throw new Error(`Album ${check.albumId} image verification failed: ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  assertion(new Set(hashes).size >= Math.min(3, hashes.length), 'Multiple albums returned the same placeholder image');
  console.log(`Verified ${archive.albums.length} Zonerama albums, ${photoCount} photo URLs, and ${checks.length} live image responses`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  verifySnapshot().catch(error => { console.error(`Zonerama snapshot verification failed: ${error.message}`); process.exitCode = 1; });
}
