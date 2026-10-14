import { useEffect, useId, useRef, useState } from 'react';
import { getSession, inspectPhoto, uploadPhoto, formatBytes } from '../utils/api.js';
import './upload-modal.css';

const MIB = 1024 * 1024;
const ACCEPT = '.jpg,.jpeg,.png,.webp,.avif,.tif,.tiff,image/jpeg,image/png,image/webp,image/avif,image/tiff';
const EXTENSIONS = /\.(jpe?g|png|webp|avif|tiff?)$/i;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff', 'image/x-tiff']);
const GENERIC_TYPES = new Set(['', 'application/octet-stream']);
const RETRYABLE = new Set(['ready', 'upload-error']);
const STATUS_LABELS = {
  queued: 'Waiting for inspection', inspecting: 'Inspecting metadata', ready: 'Ready',
  'inspect-error': 'Inspection failed', uploading: 'Uploading', saved: 'Saved as draft',
  'upload-error': 'Upload failed', uncertain: 'Outcome unknown',
};

// The server verifies the image itself; this is an early convenience check.
function validateUploadFile(file) {
  if (!EXTENSIONS.test(file.name) || (!GENERIC_TYPES.has(file.type) && !TYPES.has(file.type))) {
    return 'Unsupported format. Choose JPEG, PNG, WebP, AVIF or TIFF. HEIC, RAW, GIF and SVG are not supported.';
  }
  if (file.size === 0) return 'This file is empty.';
  if (file.size > 100 * MIB) return 'This original exceeds the 100 MiB upload limit.';
  return '';
}

function lastModifiedDate(file) {
  if (!Number.isFinite(file.lastModified) || file.lastModified <= 0) return '';
  const date = new Date(file.lastModified);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function isFileDate(source) {
  return /last.?modified|file.?modified|file.?date|filesystem/i.test(String(source || ''));
}

function buildUploadFields(item, galleryId, useLastModified) {
  const detectedDate = isFileDate(item.detected.metadataSource) && !useLastModified ? '' : item.detected.dateTaken;
  const fallback = useLastModified ? lastModifiedDate(item.file) : '';
  const dateTaken = item.dateOverride || item.batchDate || detectedDate || fallback;
  const metadataSource = item.dateOverride ? 'manual' : item.batchDate ? 'batch'
    : detectedDate ? item.detected.metadataSource || 'EXIF'
      : fallback ? 'file-last-modified' : 'none';
  return {
    galleryId, sport: item.sport, location: item.location, dateTaken, metadataSource,
    lastModified: useLastModified ? item.file.lastModified : '', uploadKey: item.uploadKey,
  };
}

function readableDate(value) {
  // Camera dates have no reliable timezone. Preserve their calendar date.
  return value ? String(value).slice(0, 10) : 'No date detected';
}

function sourceLabel(source) {
  if (isFileDate(source)) return 'File last modified';
  if (/exif/i.test(String(source || ''))) return 'Camera / EXIF';
  return source || 'Embedded metadata';
}

function errorMessage(error) {
  return error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Please try again.';
}

function uploadOutcomeUnknown(error, signal) {
  const status = error?.response?.status || error?.status;
  return signal.aborted || !status || status >= 500;
}

export default function UploadModal({ isOpen, onClose, onUploadSuccess, galleries = [], defaultGallery }) {
  if (!isOpen) return null;
  return <DesktopUploadDialog onClose={onClose} onUploadSuccess={onUploadSuccess} galleries={galleries} defaultGallery={defaultGallery} />;
}

function DesktopUploadDialog({ onClose, onUploadSuccess, galleries, defaultGallery }) {
  const uid = useId();
  const dialogRef = useRef(null);
  const fileInputRef = useRef(null);
  const stopFocusRef = useRef(null);
  const queueRef = useRef([]);
  const counterRef = useRef(0);
  const controllerRef = useRef(null);
  const busyRef = useRef(false);
  const confirmRef = useRef(false);
  const closeRef = useRef(onClose);
  const successRef = useRef(onUploadSuccess);
  const dragDepthRef = useRef(0);
  const [items, setItems] = useState([]);
  const [galleryId, setGalleryId] = useState(() => String(defaultGallery?.id ?? galleries[0]?.id ?? ''));
  const [access, setAccess] = useState('checking');
  const [operation, setOperation] = useState('idle');
  const [notice, setNotice] = useState('');
  const [rejections, setRejections] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [useLastModified, setUseLastModified] = useState(false);
  const [batch, setBatch] = useState({ date: '', sport: '', location: '' });
  const [apply, setApply] = useState({ date: false, sport: false, location: false });
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });

  useEffect(() => {
    closeRef.current = onClose;
    successRef.current = onUploadSuccess;
    confirmRef.current = confirmStop;
  }, [onClose, onUploadSuccess, confirmStop]);

  function changeItems(updater) {
    const next = updater(queueRef.current);
    queueRef.current = next;
    setItems(next);
  }

  function patchItem(id, patch) {
    changeItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function requestClose() {
    if (busyRef.current) setConfirmStop(true);
    else closeRef.current?.();
  }

  useEffect(() => {
    let active = true;
    getSession().then(session => {
      if (active) setAccess(session.admin === true ? 'allowed' : 'denied');
    }).catch(() => { if (active) setAccess('denied'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = (scrollbar + parseFloat(getComputedStyle(body).paddingRight || '0')) + 'px';
    dialogRef.current?.focus();
    function trapFocus(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (confirmRef.current) {
          setConfirmStop(false);
          dialogRef.current?.focus();
        } else if (busyRef.current) setConfirmStop(true);
        else closeRef.current?.();
      }
      if (event.key !== 'Tab') return;
      const scope = confirmRef.current ? dialogRef.current?.querySelector('.owner-upload__confirmation') : dialogRef.current;
      const focusable = [...(scope?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
      ) || [])].filter(element => element.getClientRects().length && !element.hidden);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
    function keepFocus(event) {
      if (!dialogRef.current?.contains(event.target)) dialogRef.current?.focus();
    }
    document.addEventListener('keydown', trapFocus, true);
    document.addEventListener('focusin', keepFocus);
    return () => {
      controllerRef.current?.abort();
      busyRef.current = false;
      document.removeEventListener('keydown', trapFocus, true);
      document.removeEventListener('focusin', keepFocus);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (confirmStop) stopFocusRef.current?.focus();
  }, [confirmStop]);

  async function inspectItems(ids) {
    if (busyRef.current || !ids.length || access !== 'allowed') return;
    const controller = new AbortController();
    controllerRef.current = controller;
    busyRef.current = true;
    setOperation('inspecting');
    setNotice('');
    setProgress({ current: 0, total: ids.length, percent: 0 });
    try {
      for (let index = 0; index < ids.length; index += 1) {
        if (controller.signal.aborted) break;
        const item = queueRef.current.find(candidate => candidate.id === ids[index]);
        if (!item || item.status === 'saved') continue;
        patchItem(item.id, { status: 'inspecting', error: '' });
        setProgress({ current: index + 1, total: ids.length, percent: 0 });
        try {
          const detected = await inspectPhoto(item.file, { signal: controller.signal });
          if (controller.signal.aborted) { patchItem(item.id, { status: 'queued' }); break; }
          patchItem(item.id, { status: 'ready', detected, error: '' });
        } catch (error) {
          patchItem(item.id, {
            status: controller.signal.aborted ? 'queued' : 'inspect-error',
            error: controller.signal.aborted ? '' : errorMessage(error),
          });
          if (controller.signal.aborted) break;
        }
      }
      if (controller.signal.aborted) setNotice('Inspection stopped. No photos were saved by inspection. Resume when you are ready.');
    } finally {
      busyRef.current = false;
      controllerRef.current = null;
      setOperation('idle');
      setConfirmStop(false);
    }
  }

  function addFiles(selected) {
    if (busyRef.current || access !== 'allowed') return;
    const rejected = [];
    const added = [];
    const keys = new Set(queueRef.current.map(item => item.key));
    for (const file of Array.from(selected || [])) {
      const error = validateUploadFile(file);
      if (error) { rejected.push(file.name + ': ' + error); continue; }
      const key = JSON.stringify([file.name, file.size, file.lastModified]);
      if (keys.has(key)) { rejected.push(file.name + ': already in this batch; not added twice.'); continue; }
      keys.add(key);
      counterRef.current += 1;
      added.push({ id: counterRef.current, key, file, detected: {}, status: 'queued',
        uploadKey: crypto.randomUUID(), dateOverride: '', batchDate: '', sport: '', location: '', error: '' });
    }
    setRejections(rejected);
    if (added.length) {
      changeItems(current => [...current, ...added]);
      setNotice('');
      void inspectItems(added.map(item => item.id));
    }
  }

  function applyBatch() {
    changeItems(current => current.map(item => item.status === 'saved' || item.status === 'uncertain' ? item : {
      ...item,
      ...(apply.date ? { batchDate: batch.date } : {}),
      ...(apply.sport ? { sport: batch.sport.trim() } : {}),
      ...(apply.location ? { location: batch.location.trim() } : {}),
    }));
    setNotice('Checked batch fields applied to unsaved photos. Individual date overrides still take priority.');
  }

  async function savePhotos() {
    if (busyRef.current || access !== 'allowed' || !acknowledged || !galleryId
      || !galleries.some(gallery => String(gallery.id) === galleryId)) return;
    const pending = queueRef.current.filter(item => RETRYABLE.has(item.status));
    if (!pending.length) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    busyRef.current = true;
    setOperation('uploading');
    setNotice('');
    setProgress({ current: 0, total: pending.length, percent: 0 });
    let saved = 0;
    let unknown = false;
    try {
      for (let index = 0; index < pending.length; index += 1) {
        if (controller.signal.aborted) break;
        const item = pending[index];
        patchItem(item.id, { status: 'uploading', error: '' });
        setProgress({ current: index + 1, total: pending.length, percent: 0 });
        try {
          const fields = buildUploadFields(item, galleryId, useLastModified);
          const photo = await uploadPhoto(item.file, fields, {
            signal: controller.signal,
            onProgress: event => {
              if (controller.signal.aborted) return;
              const percent = typeof event === 'number' ? (event <= 1 ? event * 100 : event)
                : Number.isFinite(event?.progress) ? event.progress * 100
                  : event?.total ? event.loaded / event.total * 100 : 0;
              setProgress({ current: index + 1, total: pending.length, percent: Math.min(100, Math.max(0, percent)) });
            },
          });
          patchItem(item.id, { status: 'saved', photo, error: '', savedGalleryId: galleryId,
            savedFields: { ...fields, dateTaken: photo.dateTaken ?? fields.dateTaken,
              metadataSource: photo.metadataSource || fields.metadataSource } });
          saved += 1;
        } catch (error) {
          // A lost response is not proof that the original was not saved.
          const uncertain = uploadOutcomeUnknown(error, controller.signal);
          unknown ||= uncertain;
          patchItem(item.id, {
            status: uncertain ? 'uncertain' : 'upload-error',
            error: uncertain ? 'This photo may have saved. Check the gallery before retrying; another upload could create a duplicate.' : errorMessage(error),
          });
          if (controller.signal.aborted) break;
        }
      }
      setNotice(controller.signal.aborted
        ? 'Upload stopped. ' + saved + ' photo' + (saved === 1 ? '' : 's') + ' saved as drafts in this run. The active photo may have saved; check the gallery before retrying.'
        : saved + ' photo' + (saved === 1 ? '' : 's') + ' saved as drafts in this run. Nothing was published. Review the gallery, then publish deliberately.');
    } finally {
      busyRef.current = false;
      controllerRef.current = null;
      setOperation('idle');
      setConfirmStop(false);
      if (saved || unknown) {
        try { await successRef.current?.(); }
        catch { setNotice(current => current + ' Gallery refresh failed; close and reopen the gallery to check the saved drafts.'); }
      }
    }
  }

  function stopWork() {
    controllerRef.current?.abort();
    setConfirmStop(false);
    setNotice('Stopping after the current request…');
    dialogRef.current?.focus();
  }

  const busy = operation !== 'idle';
  const savedCount = items.filter(item => item.status === 'saved').length;
  const failedCount = items.filter(item => item.status === 'upload-error').length;
  const uncertainCount = items.filter(item => item.status === 'uncertain').length;
  const needsInspection = items.filter(item => item.status === 'queued' || item.status === 'inspect-error');
  const pendingCount = items.filter(item => RETRYABLE.has(item.status)).length;
  const oversized = items.filter(item => item.file.size > 25 * MIB).length;
  const selectedGalleryExists = galleries.some(gallery => String(gallery.id) === galleryId);

  return (
    <div className="owner-upload-overlay" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={dialogRef} className="owner-upload" role="dialog" aria-modal="true" aria-labelledby={uid + '-title'} aria-describedby={uid + '-intro'} tabIndex={-1}>
        <header className="owner-upload__header">
          <div><p className="owner-upload__eyebrow">Private owner studio · Desktop upload</p><h2 id={uid + '-title'}>Add to the archive</h2></div>
          <button className="owner-upload__close" type="button" aria-label="Close upload dialog" onClick={requestClose}>×</button>
        </header>
        <div className="owner-upload__body">
          <p id={uid + '-intro'} className="owner-upload__muted">Original quality. Thoughtfully organized. Photos are saved as private drafts until you review and publish the gallery.</p>
          {access === 'checking' && <p role="status">Checking local owner access…</p>}
          {access === 'denied' && <p className="owner-upload__message" role="alert">Uploading is available only in the private local owner manager on your computer. Public visitors cannot upload.</p>}
          {access === 'allowed' && <>
            <div className={'owner-upload__dropzone' + (dragging ? ' owner-upload__dropzone--active' : '') + (busy ? ' owner-upload__dropzone--disabled' : '')}
              onDragEnter={event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files') && !busy) { dragDepthRef.current += 1; setDragging(true); } }}
              onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; }}
              onDragLeave={event => { event.preventDefault(); dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (!dragDepthRef.current) setDragging(false); }}
              onDrop={event => { event.preventDefault(); dragDepthRef.current = 0; setDragging(false); if (!busy) addFiles(event.dataTransfer.files); }}>
              <span className="owner-upload__drop-symbol" aria-hidden="true">↥</span>
              <h3>Drop your photographs here</h3>
              <p className="owner-upload__muted">JPEG, PNG, WebP, AVIF and TIFF · Multiple files · Up to 100 MiB each</p>
              <button className="owner-upload__button" type="button" disabled={busy} onClick={() => fileInputRef.current?.click()}>Choose photos from computer</button>
              <input ref={fileInputRef} type="file" multiple accept={ACCEPT} tabIndex={-1} className="owner-upload__file-input" aria-label="Choose photographs" disabled={busy}
                onChange={event => { addFiles(event.target.files); event.target.value = ''; }} />
              <p className="owner-upload__small">Files are inspected and uploaded one at a time, not loaded into browser memory as a full batch.</p>
            </div>
            {rejections.length > 0 && <div className="owner-upload__message" role="alert"><strong>Some files weren’t added</strong><ul>{rejections.map((message, index) => <li key={index + '-' + message}>{message}</li>)}</ul></div>}
            {items.length > 0 && <>
              <div className="owner-upload__summary"><strong>{items.length} photo{items.length === 1 ? '' : 's'} · {formatBytes(items.reduce((sum, item) => sum + item.file.size, 0))}</strong><span>{savedCount} saved · {pendingCount} ready{failedCount > 0 ? ' · ' + failedCount + ' failed' : ''}{uncertainCount > 0 ? ' · ' + uncertainCount + ' unknown' : ''}</span></div>
              {oversized > 0 && <p className="owner-upload__message" role="alert">{oversized} original{oversized === 1 ? ' is' : 's are'} larger than 25 MiB. Local upload is supported, but zero-cost static publishing cannot include these originals. Originals will not be resized or silently omitted.</p>}
              <label className="owner-upload__field" htmlFor={uid + '-gallery'}><span>Destination gallery</span><select id={uid + '-gallery'} value={galleryId} disabled={busy} onChange={event => setGalleryId(event.target.value)}><option value="">Choose a gallery</option>{galleries.map(gallery => <option value={String(gallery.id)} key={gallery.id}>{gallery.name}</option>)}</select></label>
              {!galleries.length && <p className="owner-upload__message">Create a gallery in the owner manager first, then return here to upload.</p>}
              <fieldset className="owner-upload__batch" disabled={busy}>
                <legend>Optional batch details</legend><p className="owner-upload__small">Check only the fields you want to apply, then select Apply. Camera dates stay separate unless you explicitly apply a batch date. Individual dates always win. Apply a blank field to clear that batch detail.</p>
                <div className="owner-upload__batch-grid">
                  {['date', 'sport', 'location'].map(field => <div key={field}>
                    <label className="owner-upload__check" htmlFor={uid + '-apply-' + field}><input id={uid + '-apply-' + field} type="checkbox" checked={apply[field]} onChange={event => setApply(current => ({ ...current, [field]: event.target.checked }))} />Apply {field} to batch</label>
                    <input className="owner-upload__input" aria-label={'Batch ' + field} type={field === 'date' ? 'date' : 'text'} maxLength={field === 'date' ? undefined : 200} value={batch[field]} placeholder={field === 'sport' ? 'e.g. Basketball' : field === 'location' ? 'e.g. Home court' : undefined} onChange={event => setBatch(current => ({ ...current, [field]: event.target.value }))} />
                  </div>)}
                </div>
                <button className="owner-upload__button owner-upload__button--quiet" type="button" disabled={!Object.values(apply).some(Boolean)} onClick={applyBatch}>Apply checked fields to unsaved photos</button>
              </fieldset>
              <label className="owner-upload__check"><input type="checkbox" checked={useLastModified} disabled={busy} onChange={event => setUseLastModified(event.target.checked)} />Use each file’s last-modified date only when no camera or entered date exists</label>
              <ol className="owner-upload__photos" aria-label="Photos and individual metadata">
                {items.map(item => {
                  const effective = item.status === 'saved' && item.savedFields
                    ? item.savedFields : buildUploadFields(item, galleryId, useLastModified);
                  const readOnly = busy || item.status === 'saved' || item.status === 'uncertain';
                  return <li className="owner-upload__photo" key={item.id}>
                    <div className="owner-upload__photo-heading"><div><strong>{item.file.name}</strong><span className="owner-upload__small">{formatBytes(item.file.size)}{item.detected.width && item.detected.height ? ' · ' + item.detected.width.toLocaleString() + ' × ' + item.detected.height.toLocaleString() + ' px' : ''}</span></div><span className={'owner-upload__state owner-upload__state--' + item.status}>{STATUS_LABELS[item.status]}</span></div>
                    <p className="owner-upload__small">Detected: {readableDate(item.detected.dateTaken)}{item.detected.dateTaken ? ' · ' + sourceLabel(item.detected.metadataSource) : ''}{item.detected.camera ? ' · ' + item.detected.camera : ''}</p>
                    {item.detected.hasGps && <p className="owner-upload__gps">GPS detected. Downloading the unchanged original can reveal its exact capture location.</p>}
                    {['ready', 'upload-error', 'saved', 'uncertain', 'uploading'].includes(item.status) && <>
                      <label className="owner-upload__field owner-upload__field--date" htmlFor={uid + '-date-' + item.id}><span>Date for this photo · editing overrides detection</span><input id={uid + '-date-' + item.id} type="date" value={String(item.dateOverride || effective.dateTaken || '').slice(0, 10)} disabled={readOnly} onChange={event => patchItem(item.id, { dateOverride: event.target.value })} /></label>
                      {item.dateOverride && item.status !== 'saved' && <button type="button" className="owner-upload__remove" disabled={readOnly} onClick={() => patchItem(item.id, { dateOverride: '' })}>Reset individual date to batch / detected date</button>}
                      <p className="owner-upload__small">{item.status === 'saved' ? 'Saved date: ' : 'Will use: '}{effective.dateTaken ? readableDate(effective.dateTaken) + ' · ' + sourceLabel(effective.metadataSource) : 'No date — add an individual date or enable file last-modified fallback.'}</p>
                      {(item.sport || item.location || item.batchDate) && <p className="owner-upload__small">Batch: {[item.sport, item.location, item.batchDate && 'date ' + readableDate(item.batchDate)].filter(Boolean).join(' · ')}</p>}
                    </>}
                    {item.error && <p className="owner-upload__error">{item.error}</p>}
                    {item.status === 'uncertain' && <button type="button" className="owner-upload__button owner-upload__button--quiet" disabled={busy} onClick={() => { patchItem(item.id, { status: 'upload-error', error: 'You confirmed this original was not saved. It can now be retried with the same upload key.' }); setNotice('Only retry after checking the gallery. Confirmed successful photos will not upload again.'); }}>Checked gallery: not saved — allow retry</button>}
                    {item.status !== 'saved' && <button className="owner-upload__remove" type="button" disabled={busy} aria-label={'Remove ' + item.file.name + ' from upload queue'} onClick={() => changeItems(current => current.filter(candidate => candidate.id !== item.id))}>Remove from queue</button>}
                  </li>;
                })}
              </ol>
              {needsInspection.length > 0 && <button className="owner-upload__button owner-upload__button--quiet" type="button" disabled={busy} onClick={() => void inspectItems(needsInspection.map(item => item.id))}>Resume / retry inspection ({needsInspection.length})</button>}
              <label className="owner-upload__check owner-upload__acknowledge"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} /><span>I understand that originals remain unaltered and, after deliberate publication, anyone can view and download them. Embedded camera and GPS metadata may be public. I have permission to share these photos.</span></label>
            </>}
          </>}
          {notice && <p className="owner-upload__message" role="status" aria-live="polite">{notice}</p>}
          {confirmStop && <div className="owner-upload__confirmation" role="alert" aria-labelledby={uid + '-stop-title'}><h3 id={uid + '-stop-title'}>Stop {operation === 'uploading' ? 'uploading' : 'inspection'}?</h3><p>{operation === 'uploading' ? 'Completed photos stay saved as drafts. The active photo may have saved even if its response is cancelled. Check the gallery before retrying.' : 'No photographs are saved during inspection. You can resume the remaining inspections.'}</p><div className="owner-upload__actions"><button ref={stopFocusRef} type="button" className="owner-upload__button" onClick={() => { setConfirmStop(false); dialogRef.current?.focus(); }}>Keep going</button><button type="button" className="owner-upload__button owner-upload__button--quiet" onClick={stopWork}>Stop and keep this dialog open</button></div></div>}
        </div>
        <footer className="owner-upload__footer">
          {busy ? <><div className="owner-upload__progress"><p role="status" aria-live="polite">{operation === 'uploading' ? 'Uploading' : 'Inspecting'} {progress.current} of {progress.total}{operation === 'uploading' ? ' · ' + Math.round(progress.percent) + '% transferred' : ''}</p><progress aria-label={operation === 'uploading' ? 'Current file transfer progress' : 'Batch inspection progress'} max={operation === 'uploading' ? 100 : progress.total || 1} value={operation === 'uploading' ? progress.percent : Math.max(0, progress.current - 1)} /><span className="owner-upload__small">{operation === 'uploading' ? 'Transfer completion is not saved confirmation; the server still prepares previews.' : 'Reading this photo’s metadata on your computer.'}</span></div><button type="button" className="owner-upload__button owner-upload__button--quiet" onClick={() => setConfirmStop(true)}>Cancel {operation === 'uploading' ? 'upload' : 'inspection'}</button></>
            : <><p className="owner-upload__small">{savedCount > 0 ? savedCount + ' saved as drafts. Review and publish in the gallery.' : 'Nothing becomes public automatically.'}</p><div className="owner-upload__actions"><button type="button" className="owner-upload__button owner-upload__button--quiet" onClick={requestClose}>{savedCount > 0 ? 'Done — review gallery' : 'Close'}</button>{access === 'allowed' && <button type="button" className="owner-upload__button" disabled={!pendingCount || !acknowledged || !selectedGalleryExists || needsInspection.length > 0} onClick={() => void savePhotos()}>{failedCount > 0 && pendingCount === failedCount ? 'Retry ' + failedCount + ' failed photo' + (failedCount === 1 ? '' : 's') : 'Save ' + pendingCount + ' photo' + (pendingCount === 1 ? '' : 's') + ' as drafts'}</button>}</div></>}
        </footer>
      </section>
    </div>
  );
}
