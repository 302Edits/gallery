import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Camera, Palette, RefreshCw, Search, X } from 'lucide-react';
import './live-archive.css';
const LiveAlbum = lazy(() => import('./LiveAlbum'));
import { isStaticSnapshot, siteHome, zoneramaUrl } from '../utils/zonerama-url';
const source = 'https://eu.zonerama.com/302Edits/2037673';
const interval = 5 * 60 * 1000;
const themes = [
  { id: 'paper', name: 'Paper', tone: 'Light', colors: ['#f4f5f7', '#e6e9ef', '#101520'] },
  { id: 'stone', name: 'Stone', tone: 'Light', colors: ['#f3f1ec', '#e4e0d8', '#211f1a'] },
  { id: 'sage', name: 'Sage', tone: 'Light', colors: ['#edf1ec', '#dce4dd', '#15231b'] },
  { id: 'midnight', name: 'Midnight', tone: 'Dark', colors: ['#0a0d14', '#171e2b', '#e9edf3'] },
  { id: 'carbon', name: 'Charcoal', tone: 'Dark', colors: ['#242424', '#303030', '#f3f1ed'] },
  { id: 'forest', name: 'Forest', tone: 'Dark', colors: ['#0c1511', '#18251f', '#edf2ee'] },
];
function Cover({ album, eager = false }) {
  const [failedUrl, setFailedUrl] = useState('');
  return failedUrl === album.cover ? <span className="live-cover-fallback"><Camera size={32} />Preview unavailable</span> : <img src={album.cover} alt={album.name} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(album.cover)} />;
}
export default function LiveArchive({ mode, onAppearanceChange }) {
  const [collectionId, setCollectionId] = useState(() => new URLSearchParams(window.location.search).get('collection') || '');
  const archiveScroll = useRef(0);
  const site = useRef(null);
  const revealed = useRef(new WeakSet());
  const themePicker = useRef(null);
  const [themeOpen, setThemeOpen] = useState(false);
  function navigateCollection(id = '') {
    if (!collectionId) archiveScroll.current = window.scrollY;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('collection', id); else url.searchParams.delete('collection');
    url.searchParams.delete('photo');
    url.hash = '';
    window.history.pushState({}, '', url); setCollectionId(id);
  }
  function openCollection(event, id) {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigateCollection(id); }
  }
  useEffect(() => {
    const pop = () => setCollectionId(new URLSearchParams(window.location.search).get('collection') || '');
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, []);
  useLayoutEffect(() => {
    window.scrollTo({ top: collectionId ? 0 : archiveScroll.current, behavior: 'instant' });
    if (!collectionId) document.title = '302 Edits — The moment stays';
  }, [collectionId]);
  const [archive, setArchive] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('source');
  const [limit, setLimit] = useState(18);
  const request = useRef(null);
  const load = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 25000);
    setBusy(true);
    try {
      const response = await fetch(zoneramaUrl(), { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('The connection to Zonerama is taking a break.');
      const data = await response.json();
      if (!Array.isArray(data.albums) || !data.updatedAt) throw new Error('The live collection is unavailable.');
      setArchive(data); setError(data.stale ? 'Showing the last successful update. We’ll reconnect automatically.' : '');
    } catch (failure) { if (!controller.signal.aborted || request.current === controller) setError(failure.name === 'AbortError' ? 'The connection timed out. Please try again.' : failure.message); }
    finally { clearTimeout(timeout); if (request.current === controller) { request.current = null; setBusy(false); } }
  }, []);
  useEffect(() => {
    document.title = '302 Edits — The moment stays';
    const initial = setTimeout(load, 0);
    const timer = setInterval(() => { if (!document.hidden) load(); }, interval);
    const visible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(initial); clearInterval(timer); document.removeEventListener('visibilitychange', visible); const active = request.current; request.current = null; active?.abort(); };
  }, [load]);
  useEffect(() => { document.documentElement.dataset.theme = mode; }, [mode]);
  useEffect(() => {
    if (!themeOpen) return;
    const close = event => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && themePicker.current?.contains(event.target)) return;
      setThemeOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [themeOpen]);
  const albums = archive?.albums || [];
  const categories = ['All', ...new Set(albums.map(album => album.category))];
  const filtered = useMemo(() => {
    const items = (archive?.albums || []).filter(album => (category === 'All' || album.category === category) && `${album.name} ${album.dateLabel} ${album.category}`.toLowerCase().includes(query.toLowerCase().trim()));
    if (sort !== 'source') items.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : a.date.localeCompare(b.date));
    return items;
  }, [archive, category, query, sort]);
  useEffect(() => {
    const root = site.current;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let cleanup = () => {};
    const setup = () => {
      cleanup();
      if (preference.matches || collectionId || !root || !('IntersectionObserver' in window)) return;
      const animations = new Set();
      const observer = new IntersectionObserver(entries => {
        entries.forEach(({ target, isIntersecting }) => {
          if (!isIntersecting) return;
          revealed.current.add(target);
          const animation = target.animate([
            { transform: 'translateY(20px)', opacity: 0 },
            { transform: 'translateY(0)', opacity: 1 },
          ], { duration: 600, fill: 'backwards', easing: 'cubic-bezier(.22,1,.36,1)', delay: Number(target.dataset.revealDelay || 0) });
          animations.add(animation);
          animation.onfinish = () => { animation.cancel(); animations.delete(animation); };
          observer.unobserve(target);
        });
      }, { threshold: .08, rootMargin: '0px 0px -24px 0px' });
      root.querySelectorAll('.live-card, .live-collection-title, .live-footer-inner').forEach(node => { if (!revealed.current.has(node)) observer.observe(node); });
      cleanup = () => {
        observer.disconnect();
        animations.forEach(animation => animation.cancel());
      };
    };
    setup();
    preference.addEventListener('change', setup);
    return () => { cleanup(); preference.removeEventListener('change', setup); };
  }, [collectionId, filtered, limit]);
  const photoCount = albums.reduce((total, album) => total + album.photoCount, 0);
  function filter(setter, value) { setter(value); setLimit(18); }
  return <div className="live-site" ref={site}>
    <a className="skip-link" href={collectionId ? "#collection-top" : "#collections"}>Skip to collections</a>
    <header className="live-header live-width">
      <a className="live-brand" href={siteHome()} onClick={event => openCollection(event, '')} aria-label="302 Edits home">302 Edits</a>
      <nav aria-label="Main navigation"><a href={collectionId ? `${siteHome()}#collections` : "#collections"} onClick={event => { if (collectionId) openCollection(event, ''); }}>Collections</a>
        <a className="live-source-link" href={source} target="_blank" rel="noopener noreferrer">Source</a>
        <div className="live-theme-wrap" ref={themePicker}><button className="live-theme" aria-label="Choose site theme" aria-expanded={themeOpen} onClick={() => setThemeOpen(value => !value)}><Palette size={19} /><span>Theme</span></button>{themeOpen && <div className="live-theme-panel" aria-label="Site themes"><p>Choose a theme</p><div>{themes.map(theme => <button key={theme.id} className={mode === theme.id ? 'is-active' : ''} aria-pressed={mode === theme.id} onClick={() => { onAppearanceChange(theme.id); setThemeOpen(false); }}><span className="live-theme-swatch" aria-hidden="true" style={{ '--swatch-bg': theme.colors[0], '--swatch-surface': theme.colors[1], '--swatch-ink': theme.colors[2] }}><i /><i /><i /></span><span><strong>{theme.name}</strong><small>{theme.tone}</small></span></button>)}</div></div>}</div></nav>
    </header>
    {collectionId ? <Suspense fallback={<main className="loading-state" role="status">Loading collection…</main>}><LiveAlbum key={collectionId} id={collectionId} onBack={() => navigateCollection()} /></Suspense> : <main>
      <section className="live-intro live-width">
        <h1>302 Edits</h1>
        <div className="live-intro-note"><p>Sports photographs, updated live.</p><a className="live-primary" href="#collections">Browse collections <ArrowDown size={18} /></a></div>
      </section>
      <section id="collections" className="live-collections live-width" aria-labelledby="collections-title">
        <div className="live-collection-title"><h2 id="collections-title">Collections</h2><div className="live-totals">{archive ? <><strong>{albums.length}</strong> collections<span> / </span><strong>{photoCount.toLocaleString()}</strong> photographs</> : 'Connecting to the archive'}</div></div>
        <div className="live-toolbar">
          <div className="live-search-sort"><label className="live-search"><Search size={20} /><input aria-label="Search collections" type="search" placeholder="Find an event or date" value={query} onChange={event => filter(setQuery, event.target.value)} /></label><select className="live-mobile-sport" aria-label="Filter by sport" value={category} onChange={event => filter(setCategory, event.target.value)}>{categories.map(item => <option key={item} value={item}>{item === 'All' ? 'All sports' : item}</option>)}</select><select aria-label="Sort collections" value={sort} onChange={event => filter(setSort, event.target.value)}><option value="source">Source order</option><option value="oldest">Oldest first</option><option value="name">A–Z</option></select></div>
          <div className="live-tabs" aria-label="Filter by sport">{categories.map(item => <button key={item} aria-pressed={category === item} className={category === item ? 'active' : ''} onClick={() => filter(setCategory, item)}>{item === 'All' ? 'All collections' : item}</button>)}</div>
        </div>
        {error && <div className="live-error" role="alert"><p>{error} {archive ? 'Your last loaded collections are still available.' : 'You can still visit the complete archive on Zonerama.'}</p><a href={source} target="_blank" rel="noopener noreferrer">Open Zonerama <ArrowUpRight size={18} /></a></div>}
        {(query || category !== 'All') && <div className="live-result-count">{filtered.length} collections found<button onClick={() => { setQuery(''); setCategory('All'); setLimit(18); }}>Clear filters <X size={18} /></button></div>}
        {!archive && busy ? <div className="live-grid" aria-label="Loading collections" aria-busy="true">{[1, 2, 3, 4, 5, 6].map(i => <div className="live-skeleton" key={i} />)}</div> : <div className="live-grid">{filtered.slice(0, limit).map((album, index) => <article key={album.id} className="live-card" data-reveal-delay={Math.min(index % 4, 3) * 45}><a href={`?collection=${album.id}`} onClick={event => openCollection(event, album.id)} aria-label={`View ${album.name}`}><div className="live-card-image"><Cover album={album} eager={index < 4} /></div><h3>{album.name}</h3><div className="live-card-meta"><span>{album.dateLabel || album.category}</span><span>{album.photoCount} photos</span></div></a></article>)}</div>}
        {archive && !filtered.length && <div className="live-empty"><h3>{albums.length ? 'No moments found.' : 'Your first collection awaits'}</h3><p>{albums.length ? 'Try a different event, date or sport.' : 'Public albums will appear here when they are added to Zonerama.'}</p></div>}
        {filtered.length > limit && <div className="live-more"><span>Showing {Math.min(limit, filtered.length)} of {filtered.length} collections</span><button onClick={() => setLimit(value => value + 18)}>More from the archive <ArrowDown size={18} /></button></div>}
        <div className="live-sync" role="status"><span>{error ? 'Waiting to reconnect' : archive ? (isStaticSnapshot ? 'Synced from Zonerama' : 'Live from Zonerama') : 'Connecting to Zonerama'}{archive && <> · Updated {new Date(archive.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</>}<span className="live-refresh-note"> · {isStaticSnapshot ? 'Published hourly' : 'Refreshes every 5 minutes'}</span></span><button onClick={load} disabled={busy} aria-label="Refresh collections"><RefreshCw size={18} className={busy ? 'live-spinning' : ''} />{busy ? 'Refreshing' : 'Refresh'}</button></div>
      </section>
    </main>}
    <footer className="live-footer"><div className="live-footer-inner live-width"><div className="live-footer-signature"><a className="live-footer-name" href={siteHome()} onClick={event => openCollection(event, '')}>302 Edits</a><p>Sports photography. The moment stays.</p></div><nav aria-label="Footer navigation"><a href={collectionId ? `${siteHome()}#collections` : '#collections'} onClick={event => { if (collectionId) openCollection(event, ''); }}>All collections <ArrowUpRight size={16} /></a><a href={source} target="_blank" rel="noopener noreferrer">Zonerama <ArrowUpRight size={16} /></a><button onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>Back to top <ArrowUp size={16} /></button></nav></div></footer>
  </div>;
}
