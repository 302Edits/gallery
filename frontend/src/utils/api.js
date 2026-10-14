const staticSite = import.meta.env.VITE_PUBLIC_STATIC === 'true';
let sessionToken = '';
let sessionPromise;
const albumCache = new Map();
const sessionListeners = new Set();
export function subscribeSession(listener) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

async function request(path, { method = 'GET', body, signal } = {}) {
  if (path !== '/session' && !sessionToken) {
    const session = await getSession();
    if (!session.admin) throw new Error('The owner manager is unavailable. Start it on your computer, then retry.');
  }
  const headers = {};
  if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api/v1${path}`, { method, headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, signal });
  const result = await response.json().catch(() => { throw new Error('Unexpected server response. Please retry.'); });
  if (!response.ok) {
    if (response.status === 401) { sessionToken = ''; sessionPromise = undefined; }
    throw Object.assign(new Error(result.error?.message || result.error || `Request failed (${response.status})`), { status: response.status });
  }
  return result;
}

export function getSession() {
  if (staticSite) return Promise.resolve({ admin: false });
  sessionPromise ||= request('/session').then(result => {
    if (!/^[a-f\d]{64}$/.test(result.token || '')) throw new Error('Invalid owner session.');
    sessionToken = result.token;
    for (const listener of sessionListeners) listener({ admin: true });
    return { admin: true };
  }).catch(() => { sessionPromise = undefined; return { admin: false }; });
  return sessionPromise;
}

export async function getGalleries({ signal } = {}) {
  if (!staticSite) return request('/galleries', { signal });
  const response = await fetch('/data/galleries.json', { signal });
  if (!response.ok) throw new Error('The gallery archive could not be loaded. Please try again.');
  return response.json();
}

export async function getPhotos(galleryId, { signal } = {}) {
  if (!staticSite) return request(`/galleries/${encodeURIComponent(galleryId)}/photos`, { signal });
  if (albumCache.has(galleryId)) return albumCache.get(galleryId);
  const response = await fetch(`/data/albums/${encodeURIComponent(galleryId)}.json`, { signal });
  if (!response.ok) throw new Error('This album could not be loaded. Please try again.');
  const photos = await response.json();
  albumCache.set(galleryId, photos);
  return photos;
}

export const createGallery = fields => request('/galleries', { method: 'POST', body: fields });
export const updateGallery = (id, fields) => request(`/galleries/${encodeURIComponent(id)}`, { method: 'PATCH', body: fields });
export const publishGallery = (id, fields) => request(`/galleries/${encodeURIComponent(id)}/publication`, { method: 'POST', body: fields });
export const exportSite = () => request('/exports', { method: 'POST', body: {} });

export async function uploadPhoto(file, fields, { onProgress, signal } = {}) {
  const session = await getSession();
  if (!session.admin) throw new Error('Reopen the owner manager to reconnect your session.');
  const form = new FormData();
  form.append('photo', file);
  for (const [key, value] of Object.entries(fields)) if (value !== undefined && value !== null) form.append(key, value);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    xhr.open('POST', '/api/v1/photos');
    xhr.setRequestHeader('Authorization', `Bearer ${sessionToken}`);
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    xhr.onload = () => {
      cleanup();
      let data;
      try { data = JSON.parse(xhr.responseText); } catch { reject(new Error('Unexpected upload response. Check the album before retrying.')); return; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        if (xhr.status === 401) { sessionToken = ''; sessionPromise = undefined; }
        reject(Object.assign(new Error(data.error?.message || 'Upload failed. Please try again.'), { status: xhr.status }));
      }
    };
    xhr.onerror = () => { cleanup(); reject(new Error('Connection lost. This photo may have saved; check the album before retrying.')); };
    xhr.onabort = () => { cleanup(); reject(new DOMException('Upload cancelled. This photo may have saved; check the album.', 'AbortError')); };
    if (signal?.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    signal?.addEventListener('abort', abort, { once: true });
    xhr.send(form);
  });
}

export function inspectPhoto(file, { signal } = {}) {
  const form = new FormData();
  form.append('photo', file);
  form.append('lastModified', file.lastModified);
  return request('/metadata-inspections', { method: 'POST', body: form, signal });
}

export function formatBytes(bytes = 0) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}
