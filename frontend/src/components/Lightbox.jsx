import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Download, X } from 'lucide-react';
import { formatBytes } from '../utils/api.js';

// Native dialogs make the page inert; the explicit trap also handles dynamically
// enabled controls. Cleanup returns to the exact opener and browsing position.
// oxlint-disable-next-line react/only-export-components -- Shared hook is kept in the permitted UI file, not a new utility.
export function useDialogLifecycle(dialogRef, onClose) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const position = { x: window.scrollX, y: window.scrollY };
    document.body.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('[data-initial-focus]')?.focus({ preventScroll: true });
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
        .filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
    dialog.addEventListener('keydown', handleKey);
    return () => {
      dialog.removeEventListener('keydown', handleKey);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      window.scrollTo(position.x, position.y);
    };
  }, [dialogRef]);
}

function dateLabel(value) {
  if (!value) return 'Date not recorded';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? 'Date not recorded' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Lightbox({ photo, photos, currentIndex, onClose, onNext, onPrev,
  onSelect, selected, onDownload, downloadBusy, downloadFeedback }) {
  const dialogRef = useRef(null);
  const touch = useRef(null);
  const [failedUrl, setFailedUrl] = useState(null);
  useDialogLifecycle(dialogRef, onClose);
  const failed = failedUrl === photo.previewUrl || !photo.previewUrl;

  function handleKey(event) {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); onNext(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); onPrev(); }
  }

  return (
    <dialog ref={dialogRef} className="viewer-dialog" aria-labelledby="viewer-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={handleKey}>
      <header className="viewer-header">
        <div className="viewer-heading"><span className="eyebrow">A closer look</span>
          <h2 id="viewer-title">{photo.sport || 'From the field'}</h2></div>
        <span className="viewer-count" aria-live="polite">{currentIndex + 1} / {photos.length}</span>
        <button className="icon-button" data-initial-focus onClick={onClose} aria-label="Close photograph"><X size={22} /></button>
      </header>
      <div className="viewer-stage"
        onTouchStart={(event) => { touch.current = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }; }}
        onTouchEnd={(event) => {
          if (!touch.current) return;
          const dx = event.changedTouches[0].clientX - touch.current.x;
          const dy = event.changedTouches[0].clientY - touch.current.y;
          touch.current = null;
          if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) onNext(); else onPrev(); }
        }}>
        {failed ? <div className="viewer-image-error" role="status"><p>This preview couldn’t be loaded.</p>
          {photo.previewUrl && <button className="button button-secondary" onClick={() => setFailedUrl(null)}>Try preview again</button>}</div>
          : <img key={photo.id} src={photo.previewUrl} alt={photo.fileName || `${photo.sport || 'Sports'} photograph`}
            width={photo.width || undefined} height={photo.height || undefined} decoding="async"
            onError={() => setFailedUrl(photo.previewUrl)} />}
      </div>
      <div className="viewer-navigation">
        <button className="button button-secondary" onClick={onPrev} disabled={photos.length < 2}><ArrowLeft size={18} /> Previous</button>
        <span className="eyebrow">{dateLabel(photo.dateTaken)}</span>
        <button className="button button-secondary" onClick={onNext} disabled={photos.length < 2}>Next <ArrowRight size={18} /></button>
      </div>
      <footer className="viewer-footer">
        <div className="viewer-caption"><p>{photo.location || 'Location not recorded'}</p>
          <span>{photo.fileName} · {formatBytes(Number(photo.sizeBytes) || 0)} original</span></div>
        <div className="viewer-actions">
          <button className="button button-secondary" aria-pressed={selected} onClick={() => onSelect(photo.id)}>
            {selected && <Check size={17} />}{selected ? 'Selected' : 'Select photo'}</button>
          <button className="button button-primary" onClick={() => onDownload([photo])} disabled={downloadBusy || !photo.originalUrl}>
            <Download size={17} /> Save original</button>
        </div>
      </footer>
      {downloadFeedback && <div className="viewer-transfer">{downloadFeedback}</div>}
    </dialog>
  );
}
