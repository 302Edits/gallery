import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Check, CheckCheck, Download, ExternalLink, FolderPlus,
  MapPin, Monitor, Moon, Search, Share2, SlidersHorizontal, Sun, Upload, X } from 'lucide-react';
import { exportSite, formatBytes, getGalleries, getPhotos, publishGallery } from '../utils/api.js';
import { applyAlbumTheme } from '../utils/themes.js';
import { downloadOriginals } from '../utils/downloads.js';
import Lightbox, { useDialogLifecycle } from './Lightbox';
import AlbumEditor from './AlbumEditor';

const UploadModal = lazy(() => import('./UploadModal'));
const pageSize = 36;
const emptyPhotos = Object.freeze([]);
const ZONERAMA_PROFILE_URL = 'https://eu.zonerama.com/302Edits/2037673';
const albumFromUrl = () => new URL(window.location.href).searchParams.get('album') || '';
const messageOf = (error, fallback) => error?.message || fallback;
const photoBytes = (photos) => photos.reduce((total, photo) => total + (Number(photo.sizeBytes) || 0), 0);

function readableDate(value, short = false) {
  if (!value) return 'Date not recorded';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return 'Date not recorded';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: short ? 'short' : 'long', year: 'numeric' });
}

function dayKey(value) {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value)) ? value.slice(0, 10) : 'unknown';
}

function MotionMark({ small = false }) {
  return <svg className={small ? 'motion-mark small' : 'motion-mark'} viewBox="0 0 360 240" fill="none" aria-hidden="true">
    <path d="M-60 215h260c70 0 110-42 110-105S267 5 200 5H-60" />
    <path d="M-60 190h260c53 0 85-31 85-80s-32-80-85-80H-60" />
    <path d="M-60 165h260c37 0 60-23 60-55s-23-55-60-55H-60" />
    <path d="M-60 140h260c21 0 35-12 35-30s-14-30-35-30H-60" />
    <path d="M-60 115h260" /><circle cx="235" cy="110" r="5" className="motion-point" />
  </svg>;
}

function AlbumCard({ gallery, index, onOpen, admin }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const cover = typeof gallery.cover === 'string' ? gallery.cover : gallery.cover?.thumbnailUrl || gallery.cover?.previewUrl;
  const href = new URL(window.location.href);
  href.searchParams.set('album', gallery.id);
  return <article className="album-card">
    <a className="album-link" href={`${href.pathname}${href.search}${href.hash}`} onClick={(event) => {
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault(); onOpen(gallery.id);
      }
    }}>
      <div className="album-cover">
        {cover && failedUrl !== cover ? <img src={cover} alt="" loading={index < 2 ? 'eager' : 'lazy'}
          decoding="async" onError={() => setFailedUrl(cover)} /> : <div className="album-cover-empty"><MotionMark small /><span>{cover ? 'Preview unavailable' : 'Awaiting its first moment'}</span></div>}
        <span className="album-number">{String(index + 1).padStart(2, '0')}</span>
        <span className="album-open" aria-hidden="true"><ArrowRight size={20} /></span>
        {admin && <span className="album-state">{gallery.publishedAt ? 'Published' : 'Private draft'}</span>}
      </div>
      <div className="album-card-meta"><span className="eyebrow">{gallery.sport || 'Collection'}</span>
        <span>{gallery.externalUrl ? 'Live on Zonerama' : `${Number(gallery.photoCount) || 0} photographs`}</span></div>
      <h3>{gallery.name}</h3>
      <p className="album-card-location">{gallery.eventDate ? readableDate(gallery.eventDate, true) : 'Undated collection'}
        {gallery.location && <> <span aria-hidden="true">/</span> {gallery.location}</>}</p>
    </a>
  </article>;
}

function PhotoCard({ photo, selecting, selected, onOpen, onSelect }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const url = photo.thumbnailUrl || photo.previewUrl;
  return <article className={`photo-card ${selected ? 'is-selected' : ''}`}>
    <button className="photograph" style={{ aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : '4 / 3' }}
      onClick={() => selecting ? onSelect(photo.id) : onOpen(photo.id)}
      aria-label={`${selecting ? selected ? 'Deselect' : 'Select' : 'View'} ${photo.fileName || 'photograph'}`}
      aria-pressed={selecting ? selected : undefined}>
      {url && failedUrl !== url ? <img src={url} alt={photo.fileName || 'Sports photograph'}
        width={photo.width || undefined} height={photo.height || undefined} loading="lazy" decoding="async"
        onError={() => setFailedUrl(url)} /> : <span className="photo-preview-error">Preview unavailable<br /><span>{selecting ? 'Select photo' : 'Open photograph'}</span></span>}
      {(selecting || selected) && <span className={`photo-check ${selected ? 'checked' : ''}`} aria-hidden="true">{selected ? <Check size={18} /> : <span />}</span>}
      {!selecting && <span className="photo-expand" aria-hidden="true"><ArrowRight size={18} /></span>}
    </button>
    <div className="photo-caption"><span>{photo.sport || 'From the field'}</span><span>{photo.location || photo.fileName}</span></div>
  </article>;
}

function PublishDialog({ gallery, photos, onClose, onPublished }) {
  const dialogRef = useRef(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useDialogLifecycle(dialogRef, () => { if (!busy) onClose(); });
  async function publish(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { onPublished(await publishGallery(gallery.id, gallery.externalUrl ? { acknowledgeExternalGallery: true } : { acknowledgePublicOriginals: true })); }
    catch (failure) { setError(messageOf(failure, 'Publication failed. Your draft is still available.')); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialogRef} className="editor-dialog publish-dialog" aria-labelledby="publish-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="dialog-header"><div><span className="eyebrow">A deliberate next step</span><h2 id="publish-title">Ready to share?</h2></div>
      <button className="icon-button" data-initial-focus onClick={onClose} disabled={busy} aria-label="Close publish confirmation"><X size={21} /></button></header>
    <form className="editor-form" onSubmit={publish}>
      <p>{gallery.externalUrl ? <>Publish <strong>{gallery.name}</strong> as a curated link to its live Zonerama gallery.</> : <>Publish <strong>{gallery.name}</strong> with {photos.length} photographs.</>} Export the site afterward to update the public archive.</p>
      <div className="publish-warning">{gallery.externalUrl ? <>
        <p>Photographs and downloads stay on Zonerama. Visitors will leave 302 Edits when they open the live gallery.</p>
        <p>Make sure the Zonerama album is public and its download controls match what you want visitors to receive.</p>
      </> : <><p>Originals will be fully public, at their uploaded quality.</p>
        <p>Original files may include camera information, capture dates and GPS coordinates. Check permissions and metadata before sharing.</p>
        {photos.some((photo) => photo.hasGps) && <p><strong>GPS metadata was detected in this album.</strong></p>}</>}</div>
      <label className="checkbox-label"><input type="checkbox" required checked={acknowledged} disabled={busy}
        onChange={(event) => setAcknowledged(event.target.checked)} />{gallery.externalUrl ? 'I have checked this public Zonerama gallery and am ready to share its link.' : 'I have reviewed the photos and agree to make their originals public.'}</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="dialog-footer"><button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Keep as draft</button>
        <button className="button button-primary" disabled={!acknowledged || busy || (!gallery.externalUrl && photos.length === 0)}>{busy ? 'Publishing…' : 'Publish album'}</button></footer>
    </form>
  </dialog>;
}

function DownloadFeedback({ job, onCancel, onRetry, onContinue, onDismiss }) {
  if (!job) return null;
  const progress = job.progress;
  const fraction = typeof progress === 'number' ? progress : progress?.progress ?? progress?.fraction ??
    (progress?.totalBytes > 0 ? (progress.loadedBytes ?? progress.loaded ?? 0) / progress.totalBytes : undefined);
  const percent = Number.isFinite(fraction) ? Math.min(100, Math.max(0, Math.round(fraction * 100))) : undefined;
  return <div className="download-feedback">
    <div className="download-feedback-copy" role={job.status === 'error' ? 'alert' : 'status'}>
      {job.status === 'working' && <><p>Preparing originals{job.totalParts > 1 ? ` · part ${job.part + 1} of ${job.totalParts}` : ''}{percent !== undefined ? ` · ${percent}%` : '…'}</p>
        <progress max="100" value={percent} aria-label="Original download progress" /></>}
      {job.status === 'next' && <><p>Part {job.part + 1} is ready in your browser.</p><span>Save each part to receive all selected originals.</span></>}
      {job.status === 'done' && <><p>Original files sent to your browser.</p><span>Check your downloads to finish saving.</span></>}
      {job.status === 'error' && <><p>{job.error}</p><span>Your selection is kept. Retry this part without starting earlier parts again.</span></>}
      {job.status === 'cancelled' && <><p>Download cancelled.</p><span>Completed parts are kept. You can retry the current part.</span></>}
    </div>
    <div className="download-feedback-actions">
      {job.status === 'working' && <button className="button button-secondary" onClick={onCancel}>Cancel</button>}
      {job.status === 'next' && <button className="button button-primary" onClick={onContinue}><Download size={16} />Save part {job.nextPart + 1}{job.totalParts ? ` of ${job.totalParts}` : ''}</button>}
      {['error', 'cancelled'].includes(job.status) && <button className="button button-primary" onClick={onRetry}>Retry part</button>}
      {job.status !== 'working' && <button className="icon-button" onClick={onDismiss} aria-label="Dismiss download message"><X size={18} /></button>}
    </div>
  </div>;
}

export default function Gallery({ admin = false, sessionError = '', mode = 'light', appearance = 'system', onAppearanceChange }) {
  const [albumId, setAlbumId] = useState(albumFromUrl);
  const [galleries, setGalleries] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [archiveError, setArchiveError] = useState('');
  const [archiveRevision, setArchiveRevision] = useState(0);
  const [photoResult, setPhotoResult] = useState({ key: '', items: [], error: '' });
  const [photoRevision, setPhotoRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState('');
  const [sort, setSort] = useState('newest');
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [viewerId, setViewerId] = useState(null);
  const [editor, setEditor] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [job, setJob] = useState(null);
  const downloadController = useRef(null);
  const headingRef = useRef(null);
  const trayRef = useRef(null);
  const album = galleries.find((item) => String(item.id) === albumId) || null;
  const albumExists = Boolean(album);
  const externalAlbum = Boolean(album?.externalUrl);
  const photoLoadKey = `${albumId}:${photoRevision}`;
  const photos = externalAlbum ? emptyPhotos : photoResult.key === photoLoadKey ? photoResult.items : emptyPhotos;
  const photoError = externalAlbum ? '' : photoResult.key === photoLoadKey ? photoResult.error : '';
  const photosLoading = Boolean(albumId && albumExists && !externalAlbum && !archiveLoading && photoResult.key !== photoLoadKey);

  const resetAlbumState = useCallback(() => {
    setPhotoResult({ key: '', items: [], error: '' }); setViewerId(null); setSelectedIds(new Set());
    setSelectionMode(false); setQuery(''); setSport(''); setVisibleCount(pageSize);
    setJob(null); downloadController.current?.abort(); downloadController.current = null;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getGalleries({ signal: controller.signal }).then((items) => {
      if (!Array.isArray(items)) throw new Error('The archive returned an unexpected response. Please try again.');
      if (!controller.signal.aborted) setGalleries(items);
    }).catch((error) => {
      if (!controller.signal.aborted) setArchiveError(messageOf(error, 'The archive couldn’t be loaded. Check your connection and try again.'));
    }).finally(() => { if (!controller.signal.aborted) setArchiveLoading(false); });
    return () => controller.abort();
  }, [archiveRevision]);

  useEffect(() => {
    applyAlbumTheme(album, mode);
  }, [album, mode]);

  useEffect(() => {
    document.title = album ? `${album.name} — 302 Edits` : '302 Edits — Sports photography';
  }, [album]);

  useEffect(() => {
    const pop = () => { resetAlbumState(); setAlbumId(albumFromUrl()); setNotice(null); };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [resetAlbumState]);

  useEffect(() => {
    const controller = new AbortController();
    if (!albumId || !albumExists || archiveLoading) return () => controller.abort();
    if (externalAlbum) return () => controller.abort();
    getPhotos(albumId, { signal: controller.signal }).then((items) => {
      if (!Array.isArray(items)) throw new Error('This collection returned an unexpected response. Please try again.');
      if (!controller.signal.aborted) {
        setPhotoResult({ key: photoLoadKey, items, error: '' });
        const validIds = new Set(items.map((photo) => photo.id));
        setSelectedIds((previous) => new Set([...previous].filter((id) => validIds.has(id))));
      }
    }).catch((error) => {
      if (!controller.signal.aborted) setPhotoResult({ key: photoLoadKey, items: [], error: messageOf(error, 'This collection couldn’t be loaded. Check your connection and try again.') });
    });
    return () => controller.abort();
    // Theme/editor object updates deliberately do not re-fetch photographs.
  }, [albumId, albumExists, externalAlbum, archiveLoading, photoLoadKey]);

  useEffect(() => () => downloadController.current?.abort(), []);

  const sports = useMemo(() => [...new Set((albumId ? photos : galleries).map((item) => item.sport).filter(Boolean))].sort(), [albumId, photos, galleries]);
  const filteredPhotos = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return photos.filter((photo) => (!sport || photo.sport === sport) &&
      (!search || [photo.fileName, photo.sport, photo.location, photo.dateTaken].filter(Boolean).join(' ').toLocaleLowerCase().includes(search)))
      .sort((a, b) => {
        const aDate = Number.isNaN(Date.parse(a.dateTaken)) ? 0 : Date.parse(a.dateTaken);
        const bDate = Number.isNaN(Date.parse(b.dateTaken)) ? 0 : Date.parse(b.dateTaken);
        if (!aDate && bDate) return 1;
        if (aDate && !bDate) return -1;
        return (sort === 'oldest' ? aDate - bDate : bDate - aDate) || String(a.fileName).localeCompare(String(b.fileName)) || String(a.id).localeCompare(String(b.id));
      });
  }, [photos, query, sport, sort]);
  const filteredAlbums = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return galleries.filter((item) => (!sport || item.sport === sport) &&
      (!search || [item.name, item.description, item.sport, item.location, item.eventDate].filter(Boolean).join(' ').toLocaleLowerCase().includes(search)))
      .sort((a, b) => {
        const aDate = Date.parse(a.eventDate || a.createdAt) || 0;
        const bDate = Date.parse(b.eventDate || b.createdAt) || 0;
        return (sort === 'oldest' ? aDate - bDate : bDate - aDate) || String(a.name).localeCompare(String(b.name));
      });
  }, [galleries, query, sport, sort]);
  const groups = useMemo(() => {
    const result = [];
    const byDate = new Map();
    for (const photo of filteredPhotos.slice(0, visibleCount)) {
      const key = dayKey(photo.dateTaken);
      if (!byDate.has(key)) { const group = { key, photos: [] }; byDate.set(key, group); result.push(group); }
      byDate.get(key).photos.push(photo);
    }
    return result;
  }, [filteredPhotos, visibleCount]);
  const selectedPhotos = useMemo(() => photos.filter((photo) => selectedIds.has(photo.id)), [photos, selectedIds]);
  const trayVisible = selectedPhotos.length > 0 || Boolean(job);
  useEffect(() => {
    if (!trayVisible || !trayRef.current) return undefined;
    const tray = trayRef.current;
    const update = () => document.documentElement.style.setProperty('--download-tray-height', `${tray.offsetHeight}px`);
    const observer = new ResizeObserver(update);
    observer.observe(tray); update();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--download-tray-height'); };
  }, [trayVisible]);
  const viewerIndex = filteredPhotos.findIndex((photo) => photo.id === viewerId);
  const viewerPhoto = filteredPhotos[viewerIndex];
  const downloadBusy = job?.status === 'working';

  function navigate(id) {
    const next = new URL(window.location.href);
    if (id) next.searchParams.set('album', id); else next.searchParams.delete('album');
    if (next.href === window.location.href) return;
    window.history.pushState({}, '', `${next.pathname}${next.search}${next.hash}`);
    resetAlbumState();
    setAlbumId(String(id || '')); setNotice(null);
    window.requestAnimationFrame(() => { window.scrollTo(0, 0); headingRef.current?.focus({ preventScroll: true }); });
  }

  function toggleSelected(id) {
    setSelectedIds((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function setFilter(setter, value) { setter(value); setVisibleCount(pageSize); }

  function saveAlbum(saved) {
    setGalleries((previous) => previous.some((item) => item.id === saved.id) ? previous.map((item) => item.id === saved.id ? saved : item) : [...previous, saved]);
    setEditor(null); navigate(saved.id);
    setNotice({ type: 'success', text: 'Album saved locally. Export the site when you’re ready to update the public archive.' });
  }

  async function shareAlbum() {
    const url = new URL(window.location.href);
    url.searchParams.set('album', album.id);
    if (admin && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      setNotice({ type: 'info', text: 'This is a local preview link. After deployment, share the album link from your hosted site instead.', link: url.href });
      return;
    }
    try {
      if (navigator.share) await navigator.share({ title: album.name, url: url.href });
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url.href); setNotice({ type: 'success', text: 'Album link copied.' }); }
      else setNotice({ type: 'info', text: 'Copy this album link:', link: url.href });
    } catch (error) {
      if (error.name !== 'AbortError') setNotice({ type: 'error', text: 'Sharing wasn’t available. Copy this album link:', link: url.href });
    }
  }

  async function prepareExport() {
    setExporting(true); setNotice(null);
    try {
      const result = await exportSite();
      setNotice({ type: 'success', text: `Public site prepared: ${result.fileCount} files · ${formatBytes(result.totalBytes)}. This exports files only; it does not deploy the website.`, path: result.outputPath });
    } catch (error) { setNotice({ type: 'error', text: messageOf(error, 'Export failed. Your local albums are safe; fix the issue and try again.') }); }
    finally { setExporting(false); }
  }

  async function startDownload(items, part = 0, totalParts = 0) {
    if (!items.length || downloadController.current) return;
    const controller = new AbortController();
    downloadController.current = controller;
    const transfer = { photos: items, part, totalParts, status: 'working', progress: null };
    setJob(transfer);
    try {
      const result = await downloadOriginals(items, { part, signal: controller.signal, onProgress: (progress) => {
        if (!controller.signal.aborted) setJob((previous) => ({ ...previous, progress }));
      } });
      if (!controller.signal.aborted) setJob({ ...transfer, ...result, status: result.nextPart != null ? 'next' : 'done' });
    } catch (error) {
      if (!controller.signal.aborted) setJob({ ...transfer, status: error?.name === 'AbortError' ? 'cancelled' : 'error', error: messageOf(error, 'These originals couldn’t be downloaded. Check your connection and retry.') });
    } finally { if (downloadController.current === controller) downloadController.current = null; }
  }

  function cancelDownload() {
    downloadController.current?.abort(); downloadController.current = null;
    setJob((previous) => previous ? { ...previous, status: 'cancelled' } : null);
  }

  const transferFeedback = job && <DownloadFeedback job={job} onCancel={cancelDownload}
    onRetry={() => startDownload(job.photos, job.part, job.totalParts)}
    onContinue={() => startDownload(job.photos, job.nextPart, job.totalParts)} onDismiss={() => setJob(null)} />;
  const AppearanceIcon = appearance === 'dark' ? Moon : appearance === 'light' ? Sun : Monitor;
  const showFilters = album ? photos.length > 0 && !photoError : galleries.length > 0 && !archiveError;

  return (
    <div className={`archive-shell ${selectedPhotos.length || job ? 'has-download-tray' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to photographs</a>
      <header className="site-header page-width">
        <a className="wordmark" href={window.location.pathname} onClick={(event) => {
          if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(''); }
        }} aria-label="302 Edits, all collections">302<span className="wordmark-stop">.</span><span className="wordmark-sub">EDITS</span></a>
        <div className="header-right"><span className="header-caption">SPORT / IN FOCUS</span>
          <label className="appearance-control"><AppearanceIcon size={17} aria-hidden="true" /><span className="sr-only">Appearance</span>
            <select aria-label="Appearance" value={appearance} onChange={(event) => onAppearanceChange?.(event.target.value)}>
              <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
            </select></label></div>
      </header>

      <main id="main-content" className="page-width">
        {sessionError && <div className="notice notice-error" role="alert">{sessionError}</div>}
        {notice && <div className={`notice notice-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          <div><p>{notice.text}</p>{notice.path && <code className="export-path">{notice.path}</code>}
            {notice.link && <label className="field-label share-field">Album link<input readOnly value={notice.link} onFocus={(event) => event.target.select()} /></label>}</div>
          <button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={18} /></button></div>}

        {!albumId ? <section className="archive-hero" aria-labelledby="archive-heading">
          <div><p className="eyebrow hero-kicker"><span className="accent-dash" />An independent sports photo archive</p>
            <h1 id="archive-heading" ref={headingRef} tabIndex={-1}>The game moves.<br /><em>The moment stays.</em></h1></div>
          <div className="hero-note"><span className="hero-note-number" aria-hidden="true">↘</span><p>The effort. The stillness.<br />Everything in between.</p>
            <p className="muted">Stories from the sidelines,<br />one photograph at a time.</p>
            <a className="button button-primary hero-live-link" href={ZONERAMA_PROFILE_URL} target="_blank" rel="noopener noreferrer">View live galleries <ExternalLink size={17} /></a></div>
        </section> : album ? <section className="album-hero" aria-labelledby="album-heading">
          <button className="back-link" onClick={() => navigate('')}><ArrowLeft size={17} />All collections</button>
          <div className="album-title-row"><div><p className="eyebrow hero-kicker"><span className="accent-dash" />{album.sport || 'A photographic collection'}
            {admin && <span className="inline-state">{album.publishedAt ? 'Published locally' : 'Private draft'}</span>}</p>
            <h1 id="album-heading" ref={headingRef} tabIndex={-1}>{album.name}</h1></div>
            <div className="album-title-actions">{album.externalUrl && <a className="button button-primary" href={album.externalUrl} target="_blank" rel="noopener noreferrer">Open live gallery <ExternalLink size={17} /></a>}
              <button className="button button-secondary" onClick={shareAlbum}><Share2 size={17} />Share album</button></div></div>
          {album.description && <p className="album-description">{album.description}</p>}
          <div className="album-facts"><span>{album.eventDate ? readableDate(album.eventDate) : 'Undated collection'}</span>
            {album.location && <span><MapPin size={14} />{album.location}</span>}
            <span>{album.externalUrl ? 'Hosted on Zonerama' : photosLoading ? 'Loading photographs…' : `${photos.length} photographs`}</span>
            <span>{album.externalUrl ? 'Downloads managed by Zonerama' : 'Original-quality downloads'}</span></div>
        </section> : null}

        {admin && <section className="owner-bar" aria-label="Local owner controls"><div><span className="owner-dot" aria-hidden="true" />Local owner studio<span className="owner-note">Not part of your public site</span></div>
          <div className="owner-actions"><button className="button button-small button-secondary" onClick={() => setEditor({ gallery: null })}><FolderPlus size={16} />New album</button>
            {album && <><button className="button button-small button-secondary" onClick={() => setEditor({ gallery: album })}><SlidersHorizontal size={16} />Edit album</button>
              {album.externalUrl ? <a className="button button-small button-secondary" href={album.externalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Open Zonerama</a>
                : <button className="button button-small button-secondary" onClick={() => setUploadOpen(true)}><Upload size={16} />Add photos</button>}
              <button className="button button-small button-secondary" onClick={() => setPublishOpen(true)} disabled={photosLoading || !!photoError || (!album.externalUrl && photos.length === 0)}>{album.publishedAt ? 'Review & republish' : 'Review & publish'}</button></>}
            <button className="button button-small button-primary" onClick={prepareExport} disabled={exporting}>{exporting ? 'Preparing export…' : 'Export public site'}<ArrowRight size={15} /></button></div></section>}

        {archiveLoading ? <section className="loading-state" role="status"><span className="loading-line" />Opening the archive…</section>
          : archiveError ? <section className="empty-state error-state"><span className="eyebrow">A pause, not the end</span><h2>The archive couldn’t be loaded.</h2>
            <p role="alert">{archiveError}</p><button className="button button-primary" onClick={() => {
              setArchiveLoading(true); setArchiveError(''); setArchiveRevision((value) => value + 1);
            }}>Try again <ArrowRight size={17} /></button></section>
          : albumId && !album ? <section className="empty-state"><span className="eyebrow">Collection unavailable</span><h1 ref={headingRef} tabIndex={-1}>This album isn’t here.</h1>
            <p>The link may be outdated, or the collection hasn’t been published yet.</p><button className="button button-primary" onClick={() => navigate('')}>Browse collections <ArrowRight size={17} /></button></section>
          : <>
            <div className="collection-heading"><h2>{album?.externalUrl ? 'The live archive' : album ? 'The photographs' : 'The collections'}<span className="collection-dot" aria-hidden="true"> / </span></h2>
              <span className="eyebrow">{album?.externalUrl ? 'Zonerama hosted' : album ? `${filteredPhotos.length} ${filteredPhotos.length === 1 ? 'moment' : 'moments'}` : `${filteredAlbums.length} ${filteredAlbums.length === 1 ? 'collection' : 'collections'}`}</span></div>
            {showFilters && <section className="browse-toolbar" aria-label={album ? 'Filter photographs' : 'Filter collections'}>
              <label className="search-field"><Search size={17} aria-hidden="true" /><span className="sr-only">{album ? 'Search photographs' : 'Search collections'}</span>
                <input type="search" value={query} placeholder={album ? 'Search location, sport, filename…' : 'Find an event, sport or place…'}
                  onChange={(event) => setFilter(setQuery, event.target.value)} /></label>
              <label className="filter-field"><span>Sport</span><select value={sport} onChange={(event) => setFilter(setSport, event.target.value)}><option value="">All sports</option>
                {sports.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="filter-field"><span>Order</span><select value={sort} onChange={(event) => setFilter(setSort, event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
              {album && <button className={`button button-secondary select-mode-button ${selectionMode ? 'is-active' : ''}`} aria-pressed={selectionMode} onClick={() => setSelectionMode((previous) => !previous)}>
                <CheckCheck size={17} />{selectionMode ? 'Done selecting' : 'Select photos'}</button>}
            </section>}
            {album && selectionMode && filteredPhotos.length > 0 && <div className="selection-options"><p>Select photographs to save their original files.</p>
              <button className="text-button" onClick={() => setSelectedIds((previous) => new Set([...previous, ...filteredPhotos.map((photo) => photo.id)]))}>Select all {filteredPhotos.length}{filteredPhotos.length !== photos.length ? ' matching' : ''}</button>
              {selectedIds.size > 0 && <button className="text-button" onClick={() => setSelectedIds(new Set())}>Clear selection</button>}</div>}

            {!album && galleries.length === 0 ? <section className="first-collection">
              <div className="first-collection-art"><span className="eyebrow">The live archive</span><MotionMark /><span className="art-footnote">HOSTED IN ORIGINAL QUALITY</span></div>
              <div className="first-collection-copy"><span className="eyebrow">302 Edits on Zonerama</span><h2>Every gallery.<br />One live collection.</h2>
                <p>Explore the complete 302 Edits archive on Zonerama. New events appear there as soon as they are published, with viewing and download controls managed at the source.</p>
                <div className="live-archive-actions"><a className="button button-primary" href={ZONERAMA_PROFILE_URL} target="_blank" rel="noopener noreferrer">Enter live galleries <ExternalLink size={18} /></a>
                  {admin && <button className="button button-secondary" onClick={() => setEditor({ gallery: null })}>Add a curated album</button>}</div></div>
            </section> : !album ? filteredAlbums.length ? <section className="album-grid" aria-label="Collections">
              {filteredAlbums.map((item, index) => <AlbumCard key={item.id} gallery={item} index={index} onOpen={navigate} admin={admin} />)}
            </section> : <section className="empty-state compact"><h2>No collections match.</h2><p>Try another event, sport or location.</p>
              <button className="button button-secondary" onClick={() => { setQuery(''); setSport(''); }}>Clear filters</button></section>
              : album?.externalUrl ? <section className="external-gallery-panel" aria-label="Live Zonerama gallery">
                <div><span className="eyebrow">Connected collection</span><h2>Continue into the live gallery.</h2>
                  <p>Photographs, metadata, and original-quality downloads are served directly by Zonerama. This keeps the 302 Edits experience fast without copying the archive.</p></div>
                <a className="button button-primary" href={album.externalUrl} target="_blank" rel="noopener noreferrer">View {album.name} <ExternalLink size={18} /></a>
              </section>
              : photosLoading ? <section className="loading-state" role="status"><span className="loading-line" />Hanging the photographs…</section>
              : photoError ? <section className="empty-state compact"><h2>The photographs couldn’t be loaded.</h2><p role="alert">{photoError}</p>
                <button className="button button-primary" onClick={() => setPhotoRevision((value) => value + 1)}>Try again</button></section>
              : photos.length === 0 ? <section className="empty-state album-empty"><MotionMark small /><span className="eyebrow">A little room for anticipation</span><h2>The first frame is still to come.</h2>
                <p>{admin ? 'Add photos from your computer, review their dates and details, then publish when the collection feels right.' : 'This collection has no published photographs yet. Come back after the next update.'}</p>
                {admin && <button className="button button-primary" onClick={() => setUploadOpen(true)}><Upload size={17} />Add photographs</button>}</section>
              : filteredPhotos.length === 0 ? <section className="empty-state compact"><h2>No photographs match.</h2><p>Your selection is kept while you search.</p>
                <button className="button button-secondary" onClick={() => { setQuery(''); setSport(''); setVisibleCount(pageSize); }}>Clear filters</button></section>
              : <section className="photo-collection" aria-label="Photographs grouped by capture date">
                {groups.map((group) => <section key={group.key} className="date-group" aria-label={group.key === 'unknown' ? 'Date not recorded' : readableDate(group.key)}>
                  <div className="date-heading"><h3>{group.key === 'unknown' ? 'Date not recorded' : readableDate(group.key)}</h3><span className="date-rule" /></div>
                  <div className="photo-grid">{group.photos.map((photo) => <PhotoCard key={photo.id} photo={photo} selecting={selectionMode}
                    selected={selectedIds.has(photo.id)} onSelect={toggleSelected} onOpen={setViewerId} />)}</div>
                </section>)}
                <div className="load-more"><p>Showing {Math.min(visibleCount, filteredPhotos.length)} of {filteredPhotos.length} photographs</p>
                  {visibleCount < filteredPhotos.length && <button className="button button-secondary" onClick={() => setVisibleCount((value) => value + pageSize)}>Load {Math.min(pageSize, filteredPhotos.length - visibleCount)} more <ArrowDown size={17} /></button>}
                  <span className="field-hint">Select all includes photographs not yet shown.</span></div>
              </section>}
          </>}

        <section className="archive-notes" aria-label="How to enjoy the archive"><div><span className="eyebrow">01 / Explore</span><p>Find your event.<br />Take your time.</p></div>
          <div><span className="eyebrow">02 / Look closer</span><p>A quiet moment.<br />A different perspective.</p></div>
          <div><span className="eyebrow">03 / Keep it</span><p>Select your photographs.<br />Save the original files.</p></div></section>
      </main>

      <footer className="site-footer page-width"><span className="footer-wordmark">302 EDITS</span><p>For the moments worth keeping.</p><span className="eyebrow">SPORTS PHOTOGRAPHY</span></footer>

      {trayVisible && <aside ref={trayRef} className="download-tray" aria-label="Selected photographs and downloads"><div className="download-tray-inner">
        {selectedPhotos.length > 0 && <div className="download-selection"><div><strong>{selectedPhotos.length} selected</strong><span>{formatBytes(photoBytes(selectedPhotos))} · Original quality</span></div>
          <div className="download-selection-actions"><button className="text-button" onClick={() => setSelectedIds(new Set())} disabled={downloadBusy}>Clear</button>
            <button className="button button-primary" onClick={() => startDownload(selectedPhotos)} disabled={downloadBusy}><Download size={17} />Save originals</button></div></div>}
        {transferFeedback}</div></aside>}

      {viewerPhoto && <Lightbox photo={viewerPhoto} photos={filteredPhotos} currentIndex={viewerIndex} onClose={() => setViewerId(null)}
        onNext={() => setViewerId(filteredPhotos[(viewerIndex + 1) % filteredPhotos.length].id)}
        onPrev={() => setViewerId(filteredPhotos[(viewerIndex - 1 + filteredPhotos.length) % filteredPhotos.length].id)}
        onSelect={toggleSelected} selected={selectedIds.has(viewerPhoto.id)} onDownload={startDownload}
        downloadBusy={downloadBusy} downloadFeedback={transferFeedback} />}
      {admin && editor && <AlbumEditor gallery={editor.gallery} photos={editor.gallery ? photos : []} onClose={() => setEditor(null)} onSaved={saveAlbum} />}
      {admin && album && publishOpen && <PublishDialog gallery={album} photos={photos} onClose={() => setPublishOpen(false)} onPublished={(saved) => {
        setGalleries((previous) => previous.map((item) => item.id === saved.id ? saved : item)); setPublishOpen(false);
        setNotice({ type: 'success', text: 'Album publication saved locally. Export the public site to make this collection available to visitors.' });
      }} />}
      {admin && uploadOpen && <Suspense fallback={<div className="modal-loading" role="status">Opening your photo workspace…</div>}>
        <UploadModal isOpen onClose={() => setUploadOpen(false)} galleries={galleries} defaultGallery={album}
          onUploadSuccess={() => { setPhotoRevision((value) => value + 1); setArchiveRevision((value) => value + 1); }} /></Suspense>}
    </div>
  );
}
