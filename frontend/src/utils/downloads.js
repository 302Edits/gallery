import { Zip, ZipPassThrough } from 'fflate';
export { formatBytes } from './api.js';
const PART_LIMIT = 64 * 1024 ** 2;

export function downloadParts(photos) {
  const parts = [];
  let current = [], bytes = 0;
  for (const photo of photos) {
    const size = Number(photo.sizeBytes);
    if (!Number.isFinite(size) || size <= 0 || size > PART_LIMIT) throw new Error('This photo has no safe download-size estimate. Download it individually.');
    if (bytes + size > PART_LIMIT && current.length) { parts.push(current); current = []; bytes = 0; }
    current.push(photo); bytes += size;
  }
  if (current.length) parts.push(current);
  return parts;
}

function zipName(photo, index) {
  // eslint-disable-next-line no-control-regex -- ZIP entry names must exclude control bytes.
  const safe = (photo.fileName || 'photo.jpg').replace(/[\\/\x00-\x1f]/g, '_');
  return `${String(index + 1).padStart(4, '0')}-${safe}`;
}

export async function downloadOriginals(photos, { onProgress, signal, part = 0 } = {}) {
  if (!photos.length) throw new Error('Select at least one photo.');
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  // File picker must be called before the first await to retain user activation.
  let writable;
  if (typeof window.showSaveFilePicker === 'function') {
    const handle = await window.showSaveFilePicker({ suggestedName: '302-edits-originals.zip', types: [{ description: 'Original photos ZIP', accept: { 'application/zip': ['.zip'] } }] });
    writable = await handle.createWritable();
  }
  const groups = writable ? [photos] : downloadParts(photos);
  const selected = groups[part];
  if (!selected) throw new Error('This download part is unavailable.');
  const chunks = [];
  let outputBytes = 0, written = Promise.resolve(), streamError, transferred = 0, completed = 0;
  const totalBytes = selected.reduce((sum, photo) => sum + photo.sizeBytes, 0);
  const zip = new Zip((error, chunk) => {
    if (error) { streamError = error; return; }
    outputBytes += chunk.length;
    if (writable) written = written.then(() => writable.write(chunk)).catch(error => { streamError = error; });
    else {
      if (outputBytes > PART_LIMIT + 1024 ** 2) { streamError = new Error('The archive exceeded this browser’s memory-safe part size.'); return; }
      chunks.push(chunk);
    }
  });
  try {
    for (let index = 0; index < selected.length; index++) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const photo = selected[index];
      const response = await fetch(photo.originalUrl, { signal });
      if (!response.ok || !response.body) throw new Error(`${photo.fileName}: download failed. Please retry.`);
      const file = new ZipPassThrough(zipName(photo, index));
      zip.add(file);
      const reader = response.body.getReader();
      let fileBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
          fileBytes += value.length;
          if (fileBytes > photo.sizeBytes) throw new Error(`${photo.fileName}: original-size verification failed.`);
          file.push(value);
          transferred += value.length;
          await written;
          if (streamError) throw streamError;
          onProgress?.({ completed, total: selected.length, loaded: transferred, totalBytes, progress: transferred / totalBytes, fileName: photo.fileName });
        }
      } finally { await reader.cancel().catch(() => {}); }
      if (fileBytes !== photo.sizeBytes) throw new Error(`${photo.fileName}: incomplete original. Please retry.`);
      file.push(new Uint8Array(), true);
      completed++;
      onProgress?.({ completed, total: selected.length, loaded: transferred, totalBytes, progress: transferred / totalBytes, fileName: photo.fileName });
    }
    zip.end();
    await written;
    if (streamError) throw streamError;
    if (writable) await writable.close();
    else {
      const url = URL.createObjectURL(new Blob(chunks, { type: 'application/zip' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `302-edits-originals${groups.length > 1 ? `-part-${part + 1}-of-${groups.length}` : ''}.zip`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    return { nextPart: part + 1 < groups.length ? part + 1 : null, totalParts: groups.length, downloadedCount: selected.length };
  } catch (error) {
    zip.terminate();
    if (writable) await writable.abort().catch(() => {});
    throw error;
  }
}
