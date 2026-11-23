import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ZONERAMA_ORIGIN = 'https://eu.zonerama.com';
const BOT_PLACEHOLDER_SHA256 = '2e0f3e25b34514b1a639c1c079c5b405304f20806feb779f12255d6e2bcf1d0b';
const snapshotRoot = path.resolve(process.env.ZONERAMA_SNAPSHOT_ROOT || 'frontend/public/api/zonerama');
const concurrency = Math.max(1, Math.min(12, Number.parseInt(process.env.ZONERAMA_VERIFY_CONCURRENCY, 10) || 6));
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
  return parsePublicImageUrl(value, `/social/img/album-cover/${albumId}`, `Album ${albumId} cover`);
}

export function validatePhotoUrl(value, photoId, variant) {
  return parsePublicImageUrl(value, `/social/img/photo/${photoId}`, `Photo ${photoId} ${variant}`);
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid snapshot file ${path.relative(process.cwd(), file)}: ${error.message}`);
  }
}

async function inspectImage({ url, photo }, fetcher) {
  const response = await fetcher(url, {
    headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', Referer: referrer },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  assertion(response.ok, `Image returned HTTP ${response.status}`);
  assertion((response.headers.get('Content-Type') || '').startsWith('image/'), `Image did not return an image`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assertion(bytes.length > 1024 && bytes.length <= 10 * 1024 * 1024, `Image returned an invalid image size`);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  assertion(hash !== BOT_PLACEHOLDER_SHA256, `Image returned Zonerama's Bot Detected placeholder`);
  const metadata = await sharp(bytes).metadata();
  assertion(metadata.width && metadata.height, `Image could not be decoded`);
  if (photo) {
    const expectedRatio = photo.width / photo.height;
    const actualRatio = metadata.width / metadata.height;
    assertion(Math.abs(actualRatio / expectedRatio - 1) <= 0.02, `Image returned unexpected ${metadata.width}x${metadata.height} dimensions`);
  }
  assertion(metadata.width <= Number(url.searchParams.get('width')) + 1 && metadata.height <= Number(url.searchParams.get('height')) + 1,
    `Image exceeded its requested dimensions`);
  await sharp(bytes).resize(1, 1).raw().toBuffer();
  return hash;
}

export async function verifySnapshot(root = snapshotRoot, fetcher = fetch) {
  const archive = await readJson(path.join(root, 'index.json'));
  assertion(Array.isArray(archive.albums) && archive.albums.length > 0, 'The Zonerama snapshot contains no albums');
  const albumIds = new Set();
  const checks = [];
  let photoCount = 0;

  for (const summary of archive.albums) {
    const albumId = String(summary.id || '');
    assertion(/^\d+$/.test(albumId) && !albumIds.has(albumId), `Invalid or duplicate album id ${albumId || '(empty)'}`);
    albumIds.add(albumId);
    const cover = validateCoverUrl(summary.cover, albumId);
    const album = await readJson(path.join(root, 'albums', `${albumId}.json`));
    assertion(String(album.id) === albumId, `Album ${albumId} manifest id does not match its filename`);
    assertion(album.cover === summary.cover, `Album ${albumId} cover differs between archive and album manifests`);
    assertion(Array.isArray(album.photos), `Album ${albumId} has no photo list`);
    assertion(summary.photoCount === album.photos.length && album.photoCount === album.photos.length,
      `Album ${albumId} count differs from its ${album.photos.length} published photographs`);
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
      checks.push({ albumId, variant: 'cover', url: cover });
      for (const variant of ['thumbnail', 'preview']) {
        checks.push({ albumId, variant, photo: sample, url: new URL(sample[`${variant}Url`]) });
      }
    }
  }

  let cursor = 0;
  const hashes = [];
  async function worker() {
    while (cursor < checks.length) {
      const check = checks[cursor++];
      try {
        const hash = await inspectImage(check, fetcher);
        if (check.variant === 'thumbnail') hashes.push(hash);
      } catch (error) {
        throw new Error(`Album ${check.albumId} ${check.variant} ${check.photo?.id || ''} verification failed: ${error.message}`);
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
