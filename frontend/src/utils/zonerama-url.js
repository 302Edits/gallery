const staticSnapshot = import.meta.env.VITE_STATIC_ZONERAMA === 'true';
const base = import.meta.env.BASE_URL;

export function zoneramaUrl(path = '') {
  if (!staticSnapshot) return `/api/zonerama${path}`;
  const file = path ? `api/zonerama${path}.json` : 'api/zonerama/index.json';
  return `${base}${file}`.replace(/\/{2,}/g, '/');
}

export function siteHome() {
  return base;
}

export function originalDownloadUrl(photoId) {
  return staticSnapshot ? `https://eu.zonerama.com/Download/Photo/?id=${photoId}&original=true` : '';
}

