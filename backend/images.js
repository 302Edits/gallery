const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const ExifReader = require('exifreader');

sharp.concurrency(2);
sharp.cache({ memory: 32, files: 20, items: 50 });
const FORMATS = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', tiff: 'image/tiff' };
function normalizeDate(value) {
  if (!value) return '';
  const normalized = String(value).trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(normalized)) return '';
  const [year, month, day] = normalized.slice(0, 10).split('-').map(Number);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return '';
  if (normalized.length > 10 && Number.isNaN(new Date(normalized).getTime())) return '';
  return normalized;
}
async function hashFile(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
async function inspectImage(filename, lastModified) {
  let info;
  try { info = await sharp(filename, { limitInputPixels: 60000000, animated: false }).metadata(); }
  catch { throw Object.assign(new Error('This file is not a supported, readable photo. Use JPEG, PNG, WebP, AVIF or TIFF.'), { status: 422 }); }
  if (!FORMATS[info.format]) throw Object.assign(new Error('Unsupported photo format. Use JPEG, PNG, WebP, AVIF or TIFF.'), { status: 422 });
  let tags = {};
  if (info.exif) {
    // Sharp exposes an EXIF block, whereas ExifReader expects a TIFF header.
    const bytes = info.exif.subarray(0, 6).toString('ascii') === 'Exif\0\0' ? info.exif.subarray(6) : info.exif;
    try { tags = ExifReader.load(bytes); } catch { /* Missing EXIF does not invalidate a readable photo. */ }
  }
  const exifDate = normalizeDate((tags.DateTimeOriginal || tags.DateTimeDigitized || tags.DateTime)?.description);
  const modified = Number(lastModified);
  const fallback = Number.isFinite(modified) && modified > 0 && modified < 4133980800000 ? normalizeDate(new Date(modified).toISOString()) : '';
  const rotated = [5, 6, 7, 8].includes(info.orientation);
  return { dateTaken: exifDate || fallback, metadataSource: exifDate ? 'EXIF' : fallback ? 'File modified' : 'Unknown',
    width: rotated ? info.height : info.width, height: rotated ? info.width : info.height,
    hasGps: Boolean(tags.GPSLatitude || tags.GPSLongitude || tags.GPSPosition),
    camera: [tags.Make?.description, tags.Model?.description].filter(Boolean).join(' '), mimeType: FORMATS[info.format] };
}
async function preparePreviews(original, thumbnail, preview) {
  await sharp(original, { limitInputPixels: 60000000 }).rotate().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(thumbnail);
  await sharp(original, { limitInputPixels: 60000000 }).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toFile(preview);
}
module.exports = { normalizeDate, hashFile, inspectImage, preparePreviews };
