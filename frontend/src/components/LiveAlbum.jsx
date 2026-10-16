import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, Check, ChevronLeft, ChevronRight, Download, Grid2X2, Maximize, Minimize, RefreshCw, Share2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useDialogLifecycle } from './Lightbox';
import { photoRows } from '../utils/photo-layout';
import { originalDownloadUrl, zoneramaUrl } from '../utils/zonerama-url';
import './live-album.css';
import PhotoSaveDialog from './PhotoSaveDialog';

function Photograph({ photo, name, preview = false, eager = false }) {
  const [failed, setFailed] = useState('');
  const url = preview ? photo.previewUrl : photo.thumbnailUrl;
  return failed === url ? <span className="collection-image-error">This photograph couldn’t load.{preview ? <button onClick={() => setFailed('')}>Retry image</button> : <span>Open to try the larger preview</span>}</span> : <img src={url} alt={name} width={photo.width} height={photo.height} loading={preview || eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(url)} />;
}
function Viewer({ photos, photoId, onChange, onClose, onDownload, downloadable, saving, downloadError, albumName }) {
  const dialog = useRef(null), touch = useRef(null), stage = useRef(null);
  const [zoomed, setZoomed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const index = photos.findIndex(photo => photo.id === photoId);
  const photo = photos[index];
  useDialogLifecycle(dialog, onClose);
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => { document.removeEventListener('fullscreenchange', update); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
  }, []);
  function move(delta) { setZoomed(false); onChange(photos[(index + delta + photos.length) % photos.length].id); }
  async function toggleFullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await dialog.current.requestFullscreen(); setFullscreenError(''); }
    catch { setFullscreenError('Full screen is unavailable in this browser. The expanded viewer is still available.'); }
  }
  return <dialog ref={dialog} className="collection-viewer" aria-label={`${albumName} photograph viewer`} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
  }}>
    <header className="collection-viewer-header"><div><h2>{albumName}</h2></div><button data-initial-focus aria-label="Close photograph" onClick={onClose}><X size={23} /></button></header>
    <div ref={stage} className={`collection-viewer-stage ${zoomed ? 'is-zoomed' : ''}`} onDoubleClick={() => setZoomed(value => !value)} onTouchStart={event => { if (event.touches.length === 1) touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; else touch.current = null; }} onTouchEnd={event => {
      if (!touch.current || zoomed) return;
      const dx = event.changedTouches[0].clientX - touch.current.x, dy = event.changedTouches[0].clientY - touch.current.y;
      touch.current = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
    }}><Photograph key={photo.id} photo={photo} name={`${albumName}, photograph ${index + 1}`} preview /></div>
    <footer className="collection-viewer-footer"><div className="collection-viewer-navigation"><button aria-label="Previous photograph" onClick={() => move(-1)} disabled={photos.length < 2}><ChevronLeft size={22} /></button><span className="collection-viewer-count" aria-live="polite" aria-atomic="true">Photo {index + 1} of {photos.length}</span><button aria-label="Next photograph" onClick={() => move(1)} disabled={photos.length < 2}><ChevronRight size={22} /></button></div>
      <div className="collection-viewer-actions"><button aria-label={zoomed ? 'Zoom out' : 'Zoom in'} aria-pressed={zoomed} onClick={() => setZoomed(value => !value)}>{zoomed ? <ZoomOut size={19} /> : <ZoomIn size={19} />}</button>{document.fullscreenEnabled && <button aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'} onClick={toggleFullscreen}>{fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}</button>}<button className="collection-save" disabled={!downloadable || saving} onClick={() => onDownload(photo)}><Download size={18} /><span>{saving ? 'Preparing…' : downloadable ? 'Download' : 'Downloads disabled'}</span></button></div>
    </footer>
    {(downloadError || fullscreenError) && <p className="collection-viewer-error" role="alert">{downloadError || fullscreenError}</p>}
    <p className="collection-viewer-hint">{zoomed ? 'Scroll to explore · Double-click to fit' : 'Swipe or use arrow keys to explore · Esc to close'}</p>
  </dialog>;
}

export default function LiveAlbum({ id, onBack }) {
  const [album, setAlbum] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(true);
  const [limit, setLimit] = useState(36), [compact, setCompact] = useState(false), [width, setWidth] = useState(0);
  const [viewerId, setViewerId] = useState(() => new URLSearchParams(window.location.search).get('photo')), [saving, setSaving] = useState(false), [downloadError, setDownloadError] = useState('');
  const [savePhoto, setSavePhoto] = useState(null);
  const [shareMessage, setShareMessage] = useState('');
  const request = useRef(null), grid = useRef(null), sentinel = useRef(null), saveController = useRef(null);
  const load = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 90000);
    setBusy(true);
    try {
      const response = await fetch(zoneramaUrl(`/albums/${id}`), { signal: controller.signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.photos)) throw new Error(data.error || 'This collection could not be loaded.');
      setAlbum(data); setError(data.stale ? 'Showing the last successful update. Reconnecting automatically.' : '');
      setViewerId(current => data.photos.some(photo => photo.id === current) ? current : null);
    } catch (failure) { if (request.current === controller) setError(failure.name === 'AbortError' ? 'This collection took too long to load. Please retry.' : failure.message); }
    finally { clearTimeout(timeout); if (request.current === controller) { request.current = null; setBusy(false); } }
  }, [id]);
  useEffect(() => {
    const initial = setTimeout(load, 0);
    const timer = setInterval(() => { if (!document.hidden) load(); }, 300000);
    const visible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(initial); clearInterval(timer); document.removeEventListener('visibilitychange', visible); const active = request.current; request.current = null; active?.abort(); saveController.current?.abort(); };
  }, [load]);
  useEffect(() => { if (album) document.title = `${album.name} — 302 Edits`; }, [album]);
  const hasAlbum = Boolean(album);
  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(element);
    return () => observer.disconnect();
  }, [hasAlbum]);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !album || limit >= album.photos.length) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setLimit(value => Math.min(value + 24, album.photos.length)); }, { rootMargin: '700px' });
    observer.observe(element); return () => observer.disconnect();
  }, [album, limit]);
  const rows = useMemo(() => photoRows(album?.photos.slice(0, limit) || [], width, width < 600 ? compact ? 145 : 245 : compact ? 210 : 340, width < 600 ? 8 : 12, width < 600 ? compact ? 3 : 2 : Infinity), [album, limit, width, compact]);
  const photoNumbers = useMemo(() => new Map((album?.photos || []).map((photo, index) => [photo.id, index + 1])), [album]);
  async function download(photo) {
    if (saving || !album?.downloadable) return;
    if (/Instagram/i.test(navigator.userAgent)) { setSavePhoto(photo); return; }
    const direct = originalDownloadUrl(photo.id);
    if (direct) {
      const link = document.createElement('a');
      link.href = direct; link.target = '_blank'; link.rel = 'noopener';
      document.body.append(link); link.click(); link.remove();
      return;
    }
    const controller = new AbortController(); saveController.current = controller;
    setSaving(true); setDownloadError('');
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(zoneramaUrl(`/albums/${id}/download/${photo.id}`), { signal: controller.signal });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Download unavailable. Please retry.'); }
      if (!(response.headers.get('content-type') || '').startsWith('image/')) throw new Error('The download returned an unexpected response.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      const filename = response.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      link.href = url; link.download = filename ? decodeURIComponent(filename) : `302-edits-${id}-${photo.id}.jpg`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (failure) { if (saveController.current === controller) setDownloadError(failure.name === 'AbortError' ? 'Download timed out. Please retry.' : failure.message); }
    finally { clearTimeout(timeout); if (saveController.current === controller) { setSaving(false); saveController.current = null; } }
  }
  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setShareMessage('Collection link copied.'); }
    catch { setShareMessage('Copy the collection link from your address bar.'); }
  }
  return <main className="collection-page" id="collection-top">
    <section className="collection-intro live-width"><button className="collection-back" onClick={onBack}><ArrowLeft size={16} />All collections</button>
      <div className="collection-title"><h1 className={album?.name.length > 30 ? 'long-title' : undefined}>{album?.name || (busy ? 'Into the moment.' : 'Collection unavailable.')}</h1><button className="collection-share" onClick={share}><Share2 size={16} />Share collection</button></div>
      <div className="collection-details">{album && <><span>{album.dateLabel}</span><span>{album.photos.length} photographs</span><span>{album.downloadable ? 'Downloads available' : 'Viewing collection'}</span></>}<span role="status">{shareMessage}</span></div>
    </section>
    <div className="collection-toolbar"><div className="live-width"><p>{album ? 'Open a photo to view or download.' : 'Loading photographs…'}</p><div><button className={compact ? 'is-active' : ''} aria-label="Compact photo layout" aria-pressed={compact} onClick={() => setCompact(value => !value)}><Grid2X2 size={17} /><span>{compact ? 'Compact' : 'Comfortable'}</span></button><button aria-label="Refresh photographs" onClick={load} disabled={busy}><RefreshCw size={16} className={busy ? 'live-spinning' : ''} /></button></div></div></div>
    {error && <div className="collection-notice live-width" role="alert"><p>{error}</p><button onClick={load} disabled={busy}>Try again <RefreshCw size={15} /></button></div>}
    {downloadError && !viewerId && <div className="collection-notice live-width" role="alert">{downloadError}</div>}
    {!album && busy && <div className="collection-loading live-width" role="status"><div /><div /><div /><span className="sr-only">Loading photographs</span></div>}
    {album && <><section ref={grid} className="collection-photos live-width" aria-label="Photographs"><div className="collection-rows">{rows.map(row => <div className="collection-row" key={row.photos[0].id} style={{ height: row.height, gap: width < 600 ? 8 : 12 }}>{row.photos.map((photo, rowIndex) => {
      const number = photoNumbers.get(photo.id);
      return <article className="collection-frame" key={photo.id} style={{ width: row.height * photo.width / photo.height, '--arrival': `${Math.min(rowIndex, 3) * 70}ms` }}>
        <button className="collection-open" onClick={() => { setDownloadError(''); setViewerId(photo.id); }} aria-label={`Maximize photograph ${number}`}><Photograph photo={photo} eager={number <= 6} name={`${album.name}, photograph ${number}`} /><span className="collection-frame-expand" aria-hidden="true"><Maximize size={18} /></span></button>
        {album.downloadable && <button className="collection-frame-download" aria-label={`Download photograph ${number}`} onClick={() => download(photo)} disabled={saving}><Download size={17} /></button>}
      </article>;
    })}</div>)}</div></section>
      {!album.photos.length && <div className="live-empty"><h2>This collection is waiting for its first photograph.</h2><p>New photographs will appear here automatically.</p></div>}
      <div ref={sentinel} className="collection-end live-width">{limit < album.photos.length ? <><p>{Math.min(limit, album.photos.length)} of {album.photos.length} photographs</p><button onClick={() => setLimit(value => value + 24)}>Continue exploring <ArrowRight size={16} /></button></> : <><Check size={20} /><p>All {album.photos.length} photographs</p><button onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>Back to top <ArrowUp size={16} /></button></>}</div>
    </>}
    <div className="collection-bottom live-width"><button onClick={onBack}><ArrowLeft size={17} />All collections</button><p>Updated from Zonerama</p></div>
    {viewerId && album?.photos.some(photo => photo.id === viewerId) && <Viewer photos={album.photos} photoId={viewerId} onChange={setViewerId} onClose={() => setViewerId(null)} onDownload={download} downloadable={album.downloadable} saving={saving} downloadError={downloadError} albumName={album.name} />}
    {savePhoto && album?.downloadable && <PhotoSaveDialog photo={savePhoto} albumId={id} onClose={() => setSavePhoto(null)} />}
  </main>;
}
