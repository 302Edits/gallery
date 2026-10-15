import { useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useDialogLifecycle } from './Lightbox';
import { originalDownloadUrl, zoneramaUrl } from '../utils/zonerama-url';

export default function PhotoSaveDialog({ photo, albumId, onClose }) {
  const dialog = useRef(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  useDialogLifecycle(dialog, onClose);
  const link = new URL(window.location.href);
  link.searchParams.set('collection', albumId);
  link.searchParams.set('photo', photo.id);
  link.hash = '';
  const original = originalDownloadUrl(photo.id) || zoneramaUrl(`/albums/${albumId}/download/${photo.id}`);
  async function copy() {
    try { await navigator.clipboard.writeText(link.href); setMessage('Link copied. Paste it in Safari or Chrome to open this photo.'); }
    catch { setMessage('Touch and hold the link below, then choose Copy.'); }
  }
  return <dialog ref={dialog} className="photo-save-dialog" aria-labelledby="photo-save-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id="photo-save-title">Save this photo</h2><button data-initial-focus aria-label="Close save options" onClick={onClose}><X size={22} /></button></header>
    <p>For full quality, download the original.</p>
    <a className="photo-save-original" href={original}><Download size={18} />Download original</a>
    <p>Instagram may keep downloads inside the app. If saving doesn’t work, use Instagram’s browser menu to open this page in your browser, or copy the photo link into Safari or Chrome.</p>
    <button className="photo-save-copy" onClick={copy}>Copy photo link</button>
    <p role="status">{message}</p>
    <input aria-label="Photo link" readOnly value={link.href} onFocus={event => event.target.select()} />
    <div className="photo-save-preview">
      <h3>Quick save preview</h3>
      <p>Touch and hold the image, then choose Save Image if offered. This saves the preview; use the original above for full quality.</p>
      {failed ? <p role="status">Preview unavailable. You can still try the original download.</p> : <img src={photo.previewUrl} alt="Photo preview to save" onError={() => setFailed(true)} />}
    </div>
  </dialog>;
}
