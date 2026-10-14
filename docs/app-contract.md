# Application contract

Private owner manager: Express binds 127.0.0.1:5001. Frontend Vite proxies
`/api` and `/media`. Owner writes require a session token from a same-origin,
loopback-only `/api/v1/session` response. Do not deploy this local service.
Public deployment contains static published data/assets only; no owner token,
private database, draft images, upload endpoints, or raw EXIF JSON.

Frontend utilities expose:

- `getSession()` → `{admin: boolean}`; obtains local token internally. Static
  builds return `{admin:false}` without an API request.
- `getGalleries({signal}={})` → gallery array.
- `getPhotos(galleryId,{signal}={})` → photo array; album-level cached fetch.
- `createGallery(fields)`, `updateGallery(id,fields)` → saved gallery.
- `uploadPhoto(file,fields,{onProgress,signal}={})` → saved photo, one per request.
- `inspectPhoto(file,{signal}={})` → detected metadata; no persistent upload.
- `publishGallery(id,{acknowledgePublicOriginals:true})` → saved local-photo
  gallery; external Zonerama galleries use `{acknowledgeExternalGallery:true}`.
- `exportSite()` → `{outputPath,fileCount,totalBytes}`; prepares public site,
  does not deploy or create provider accounts.
- `downloadOriginals(photos,{onProgress,signal,part=0}={})` →
  `{nextPart:null|number,totalParts,downloadedCount}`; streamed ZIP on desktop
  browsers with a file picker, bounded 64 MiB ZIP parts on other browsers.
- `formatBytes(bytes)`; `THEME_PRESETS` array `{id,name,accent}`.
- `applyAlbumTheme(gallery,mode)` updates runtime CSS tokens.

Gallery fields: `{id,name,description,sport,location,eventDate,themePreset,
themeColor,coverPhotoId,externalUrl,publishedAt,createdAt,photoCount,cover}`.
Photo fields: `{id,galleryId,fileName,mimeType,width,height,dateTaken,sport,
location,capturedAt,sizeBytes,sha256,thumbnailUrl,previewUrl,originalUrl,
hasGps,metadataSource}`. Date precedence: explicit individual override,
explicit batch date, that photo's EXIF date, file last-modified fallback.
Missing dates are never silently replaced with another photo's date.

Inspect response: `{dateTaken,metadataSource,width,height,hasGps,camera}`.
JPEG, PNG, WebP, AVIF, TIFF accepted (first frame). SVG, GIF, HEIC and RAW
are unsupported initially and produce clear errors. Originals remain unchanged.
Each request max 100 MiB; previews prepared locally. Static export rejects
individual originals above 25 MiB and output above 20,000 files.

Owner uploads add draft photos. Public manifests expose only the photo IDs
present at the last deliberate album publication. Public URLs use immutable
photo IDs. Edits to gallery metadata take effect on next static export.
An HTTPS `*.zonerama.com` `externalUrl` creates a curated external collection:
its public manifest contains no copied photo files, and Zonerama remains the
source for viewing, metadata and downloads.
