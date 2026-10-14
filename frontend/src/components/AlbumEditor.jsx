import { useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { createGallery, updateGallery } from '../utils/api.js';
import { THEME_PRESETS } from '../utils/themes.js';
import { useDialogLifecycle } from './Lightbox';

export default function AlbumEditor({ gallery, photos = [], onClose, onSaved }) {
  const dialogRef = useRef(null);
  const originalPreset = THEME_PRESETS.find((item) => item.id === gallery?.themePreset) || THEME_PRESETS[0];
  const [fields, setFields] = useState(() => ({
    name: gallery?.name || '', description: gallery?.description || '',
    sport: gallery?.sport || '', location: gallery?.location || '',
    eventDate: gallery?.eventDate?.slice(0, 10) || '',
    themePreset: gallery?.themePreset || THEME_PRESETS[0]?.id || '',
    themeColor: gallery?.themeColor || '', coverPhotoId: gallery?.coverPhotoId || '',
    externalUrl: gallery?.externalUrl || '',
  }));
  const [customAccent, setCustomAccent] = useState(() => Boolean(gallery?.themeColor) &&
    gallery.themeColor.toLowerCase() !== originalPreset?.accent.toLowerCase());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useDialogLifecycle(dialogRef, () => { if (!saving) onClose(); });
  const set = (key, value) => setFields((current) => ({ ...current, [key]: value }));
  const preset = THEME_PRESETS.find((item) => item.id === fields.themePreset);
  const accent = customAccent && /^#[\da-f]{6}$/i.test(fields.themeColor) ? fields.themeColor : preset?.accent || '#b64e27';

  async function save(event) {
    event.preventDefault();
    if (!fields.name.trim()) { setError('Give this album a name before saving.'); return; }
    if (customAccent && !/^#[\da-f]{6}$/i.test(fields.themeColor)) {
      setError('Enter a six-digit hex color, such as #B64E27.'); return;
    }
    setSaving(true); setError('');
    try {
      const payload = { ...fields, name: fields.name.trim(), themeColor: customAccent ? fields.themeColor : preset?.accent || '#a74425',
        coverPhotoId: fields.coverPhotoId || null, eventDate: fields.eventDate || null };
      const saved = gallery ? await updateGallery(gallery.id, payload) : await createGallery(payload);
      onSaved(saved);
    } catch (failure) { setError(failure?.message || 'This album couldn’t be saved. Your changes are still here.'); }
    finally { setSaving(false); }
  }

  return (
    <dialog ref={dialogRef} className="editor-dialog" aria-labelledby="editor-title"
      onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}>
      <header className="dialog-header"><div><span className="eyebrow">Owner studio</span>
        <h2 id="editor-title">{gallery ? 'Edit the collection.' : 'A new collection.'}</h2></div>
        <button className="icon-button" data-initial-focus aria-label="Close album editor" onClick={onClose} disabled={saving}><X size={21} /></button>
      </header>
      <form onSubmit={save} className="editor-form">
        <fieldset disabled={saving} className="editor-fields">
          <label className="field-label">Album name <input value={fields.name} onChange={(event) => set('name', event.target.value)}
            required maxLength={120} placeholder="An event, a place, a moment" /></label>
          <label className="field-label">Description <textarea rows={3} value={fields.description} maxLength={2000}
            onChange={(event) => set('description', event.target.value)} placeholder="A little context for the photographs." /></label>
          <div className="field-grid"><label className="field-label">Sport <input value={fields.sport} maxLength={100}
            onChange={(event) => set('sport', event.target.value)} placeholder="e.g. Basketball" /></label>
            <label className="field-label">Event date <input type="date" value={fields.eventDate}
              onChange={(event) => set('eventDate', event.target.value)} /></label></div>
          <label className="field-label">Location <input value={fields.location} maxLength={200}
            onChange={(event) => set('location', event.target.value)} placeholder="Venue or city" /></label>
          <label className="field-label">Zonerama gallery link <input type="url" value={fields.externalUrl} maxLength={500}
            onChange={(event) => set('externalUrl', event.target.value)}
            placeholder="https://eu.zonerama.com/302Edits/Album/…" /></label>
          <p className="field-hint external-source-hint">Optional. When supplied, Zonerama hosts the photographs and downloads while 302 Edits presents this collection.</p>
          {gallery && <label className="field-label">Cover photograph
            <select value={fields.coverPhotoId} onChange={(event) => set('coverPhotoId', event.target.value)}>
              <option value="">Automatic cover</option>
              {photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.fileName}</option>)}
            </select><span className="field-hint">Upload photographs first to choose a specific cover.</span></label>}
          <section className="theme-section" aria-labelledby="theme-heading">
            <div className="section-label"><h3 id="theme-heading">Collection theme</h3><span>Light & dark friendly</span></div>
            <div className="theme-options">
              {THEME_PRESETS.map((item) => <button key={item.id} type="button" className={`theme-option ${fields.themePreset === item.id ? 'is-active' : ''}`}
                aria-pressed={fields.themePreset === item.id} onClick={() => set('themePreset', item.id)}>
                <span className="theme-dot" style={{ background: item.accent }} aria-hidden="true" />{item.name}
                {fields.themePreset === item.id && <Check size={15} />}</button>)}
            </div>
            <label className="checkbox-label"><input type="checkbox" checked={customAccent} onChange={(event) => {
              setCustomAccent(event.target.checked);
              if (event.target.checked && !fields.themeColor) set('themeColor', accent);
            }} />Use a custom accent</label>
            {customAccent && <div className="accent-inputs"><label className="field-label">Choose color
              <input type="color" value={accent} onChange={(event) => set('themeColor', event.target.value)} /></label>
              <label className="field-label">Hex color <input value={fields.themeColor} maxLength={7} spellCheck={false}
                placeholder="#B64E27" onChange={(event) => set('themeColor', event.target.value)} /></label></div>}
            <p className="field-hint">An accent changes the details, not the legibility of your photographs or controls.</p>
          </section>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="dialog-footer"><span className="field-hint">{gallery ? 'Export again to update the public site.' : 'New albums start as private drafts.'}</span>
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : gallery ? 'Save changes' : 'Create album'}</button></footer>
      </form>
    </dialog>
  );
}
