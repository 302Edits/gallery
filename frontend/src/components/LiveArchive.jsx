import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Camera, Palette, RefreshCw, Search, X } from 'lucide-react';
import './live-archive.css';
const LiveAlbum = lazy(() => import('./LiveAlbum'));
import { isStaticSnapshot, siteHome, zoneramaUrl } from '../utils/zonerama-url';
const source = 'https://eu.zonerama.com/302Edits/2037673';
const interval = 5 * 60 * 1000;
const manifesto = 'A match is more than the result. It is pressure, release, recovery, and the glance before the whistle. 302 Edits keeps the seconds that make the score matter.';
const themes = [
  { id: 'paper', name: 'Paper', colors: ['#f1f1ef', '#e5e5e1', '#1c1c1c'] },
  { id: 'stone', name: 'Stone', colors: ['#dedbd3', '#cbc7bc', '#24231f'] },
  { id: 'sage', name: 'Sage', colors: ['#dfe6dd', '#cbd6ca', '#17221a'] },
  { id: 'midnight', name: 'Midnight', colors: ['#11161e', '#1e2631', '#edf0ec'] },
  { id: 'carbon', name: 'Charcoal', colors: ['#242424', '#303030', '#f1f1ef'] },
  { id: 'forest', name: 'Forest', colors: ['#101a14', '#1c2921', '#edf0ec'] },
];
function Cover({ album, eager = false, decorative = false }) {
  const [failedUrl, setFailedUrl] = useState('');
  return failedUrl === album.cover ? <span className="live-cover-fallback" aria-hidden={decorative || undefined}><Camera size={32} />Preview unavailable</span> : <img src={album.cover} alt={decorative ? '' : `${album.name} contact sheet`} width="1600" height="800" loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} decoding={eager ? 'sync' : 'async'} referrerPolicy="no-referrer" onError={() => setFailedUrl(album.cover)} />;
}
export default function LiveArchive({ mode, onAppearanceChange }) {
  const [collectionId, setCollectionId] = useState(() => new URLSearchParams(window.location.search).get('collection') || '');
  const archiveScroll = useRef(0);
  const site = useRef(null);
  const themePicker = useRef(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [dispatchIndex, setDispatchIndex] = useState(0);
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
  const photoCount = albums.reduce((total, album) => total + album.photoCount, 0);
  const featured = albums[0];
  const bento = albums.slice(0, 4);
  const dispatches = albums.slice(0, 5);
  const safeDispatchIndex = dispatches.length ? dispatchIndex % dispatches.length : 0;
  const activeDispatch = dispatches[safeDispatchIndex] || featured;
  const marqueeItems = categories.slice(1);
  useEffect(() => {
    const root = site.current;
    if (collectionId || !root || !archive) return undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    let context = null;
    let generation = 0;
    const clear = () => { context?.revert(); context = null; };
    const enhance = async () => {
      const current = ++generation;
      clear();
      if (reducedMotion.matches) return;
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
      if (disposed || reducedMotion.matches || current !== generation) return;
      gsap.registerPlugin(ScrollTrigger);
      context = gsap.context(() => {
        gsap.utils.toArray('.live-motion-image').forEach(element => {
          gsap.timeline({ scrollTrigger: { trigger: element, start: 'top 94%', end: 'bottom 6%', scrub: 0.7 } })
            .fromTo(element, { scale: 0.82, opacity: 0.35, filter: 'brightness(0.55)' }, { scale: 1, opacity: 1, filter: 'brightness(1)', duration: 0.45, ease: 'none' })
            .to(element, { scale: 0.96, opacity: 0.22, filter: 'brightness(0.48)', duration: 0.55, ease: 'none' });
        });
        const words = gsap.utils.toArray('.live-manifesto-word');
        if (words.length) gsap.fromTo(words, { opacity: 0.1 }, { opacity: 1, stagger: 0.035, ease: 'none', scrollTrigger: { trigger: '.live-manifesto-statement', start: 'top 78%', end: 'bottom 42%', scrub: 0.8 } });
      }, root);
    };
    const update = () => { enhance().catch(() => clear()); };
    update();
    reducedMotion.addEventListener('change', update);
    return () => { disposed = true; generation++; reducedMotion.removeEventListener('change', update); clear(); };
  }, [collectionId, archive]);
  function filter(setter, value) { setter(value); setLimit(18); }
  return <div className="live-site" ref={site}>
    <a className="skip-link" href={collectionId ? "#collection-top" : "#collections"}>Skip to collections</a>
    <header className="live-header live-width">
      <a className="live-brand" href={siteHome()} onClick={event => openCollection(event, '')} aria-label="302 Edits home"><span>302</span><span>Edits</span></a>
      <nav aria-label="Main navigation"><a className="live-work-link" href={collectionId ? `${siteHome()}#collections` : "#collections"} onClick={event => { if (collectionId) openCollection(event, ''); }}>Work{albums.length ? ` (${albums.length})` : ''}</a>
        <div className="live-nav-actions"><a className="live-source-link" href={source} target="_blank" rel="noopener noreferrer">Full archive <ArrowUpRight size={15} /></a>
          <div className="live-theme-wrap" ref={themePicker}><button className="live-theme" aria-label="Choose site theme" aria-expanded={themeOpen} onClick={() => setThemeOpen(value => !value)}><Palette size={19} /><span>Theme</span></button>{themeOpen && <div className="live-theme-panel" aria-label="Site themes"><p>Choose a theme</p><div>{themes.map(theme => <button key={theme.id} className={mode === theme.id ? 'is-active' : ''} aria-pressed={mode === theme.id} onClick={() => { onAppearanceChange(theme.id); setThemeOpen(false); }}><span className="live-theme-swatch" aria-hidden="true" style={{ '--swatch-bg': theme.colors[0], '--swatch-surface': theme.colors[1], '--swatch-ink': theme.colors[2] }}><i /><i /><i /></span><strong>{theme.name}</strong></button>)}</div></div>}</div>
        </div></nav>
    </header>
    {collectionId ? <Suspense fallback={<main className="loading-state" role="status">Loading collection…</main>}><LiveAlbum key={collectionId} id={collectionId} onBack={() => navigateCollection()} /></Suspense> : <main className="live-main overflow-x-hidden w-full max-w-full">
      <section className="live-intro" aria-labelledby="portfolio-title">
        <div className="live-intro-layout live-width">
          <div className="live-hero-copy">
            <h1 id="portfolio-title" className="max-w-6xl w-full">Hold the <span className="live-inline-image" aria-hidden="true">{featured && <Cover album={featured} eager decorative />}</span> game still.</h1>
            <p className="live-intro-lead">Independent sports photography built around movement, pressure, and the quiet after the play.</p>
            <div className="live-intro-actions">
              <a className="live-primary" href={featured ? `?collection=${featured.id}` : '#collections'} onClick={featured ? event => openCollection(event, featured.id) : undefined}>{featured ? 'View the latest game' : 'Browse the archive'} <ArrowUpRight size={18} /></a>
              <a className="live-secondary" href="#collections">Explore all work <ArrowDown size={18} /></a>
            </div>
          </div>
          <div className="live-featured">{featured ? <a className="live-featured-link" href={`?collection=${featured.id}`} onClick={event => openCollection(event, featured.id)} aria-label={`View featured collection ${featured.name}`}>
            <div className="live-featured-image"><Cover album={featured} eager /></div>
            <div className="live-featured-caption"><strong>{featured.name}</strong><span>{featured.category}</span><span>{featured.dateLabel || 'From the archive'}</span></div>
          </a> : <div className="live-featured-placeholder" aria-hidden="true"><span>Connecting to the live archive</span></div>}</div>
        </div>
      </section>

      {bento.length === 4 && <section className="live-interest" aria-labelledby="interest-title">
        <div className="live-interest-heading live-width"><h2 id="interest-title">The game, from every angle.</h2><p>Four recent contact sheets. One live archive. Nothing staged.</p></div>
        <div className="live-bento live-width">{bento.map((album, index) => <article className={`live-bento-card live-bento-card-${index + 1}`} key={album.id}><a href={`?collection=${album.id}`} onClick={event => openCollection(event, album.id)} aria-label={`View ${album.name}`}><div className="live-bento-image live-motion-image"><Cover album={album} eager={index < 2} /></div><div className="live-bento-copy"><h3>{album.name}</h3><p>{album.category}<span>{album.dateLabel || `${album.photoCount} photographs`}</span></p><ArrowUpRight size={20} aria-hidden="true" /></div></a></article>)}</div>
      </section>}

      {marqueeItems.length > 0 && <div className="live-marquee" aria-label={`Sports photographed: ${marqueeItems.join(', ')}`}><div className="live-marquee-track" aria-hidden="true">{[...marqueeItems, ...marqueeItems].map((item, index) => <span key={`${item}-${index}`}>{item}<i /></span>)}</div></div>}

      {activeDispatch && <section className="live-dispatch live-width" aria-labelledby="dispatch-title">
        <div className="live-dispatch-heading"><h2 id="dispatch-title">From the touchline</h2><div className="live-dispatch-controls"><button aria-label="Previous featured game" disabled={dispatches.length < 2} onClick={() => setDispatchIndex(index => (index - 1 + dispatches.length) % dispatches.length)}><ArrowLeft size={19} /></button><span>{safeDispatchIndex + 1} / {dispatches.length}</span><button aria-label="Next featured game" disabled={dispatches.length < 2} onClick={() => setDispatchIndex(index => (index + 1) % dispatches.length)}><ArrowRight size={19} /></button></div></div>
        <div className="live-dispatch-stage"><div className="live-dispatch-image live-motion-image" key={activeDispatch.id}><Cover album={activeDispatch} /></div><div className="live-dispatch-copy"><h3>{activeDispatch.name}</h3><p>{activeDispatch.category} · {activeDispatch.photoCount} photographs · {activeDispatch.dateLabel || 'From the archive'}</p><a className="live-primary" href={`?collection=${activeDispatch.id}`} onClick={event => openCollection(event, activeDispatch.id)}>Open this collection <ArrowUpRight size={18} /></a></div></div>
        <div className="live-dispatch-thumbs" aria-label="Choose a featured game">{dispatches.map((album, index) => <button key={album.id} className={index === safeDispatchIndex ? 'is-active' : ''} aria-label={`Show ${album.name}`} aria-pressed={index === safeDispatchIndex} onClick={() => setDispatchIndex(index)}><Cover album={album} decorative /></button>)}</div>
      </section>}

      <section id="collections" className="live-collections live-width" aria-labelledby="collections-title">
        <div className="live-collection-title"><h2 id="collections-title">The live archive</h2><p className="live-totals">{archive ? `${albums.length} collections, ${photoCount.toLocaleString()} photographs` : 'Connecting to the archive'}</p></div>
        <div className="live-toolbar">
          <div className="live-search-sort"><label className="live-search"><Search size={20} /><input aria-label="Search collections" type="search" placeholder="Find an event or date" value={query} onChange={event => filter(setQuery, event.target.value)} /></label><select className="live-mobile-sport" aria-label="Filter by sport" value={category} onChange={event => filter(setCategory, event.target.value)}>{categories.map(item => <option key={item} value={item}>{item === 'All' ? 'All sports' : item}</option>)}</select><select aria-label="Sort collections" value={sort} onChange={event => filter(setSort, event.target.value)}><option value="source">Source order</option><option value="oldest">Oldest first</option><option value="name">A–Z</option></select></div>
          <div className="live-tabs" aria-label="Filter by sport">{categories.map(item => <button key={item} aria-pressed={category === item} className={category === item ? 'active' : ''} onClick={() => filter(setCategory, item)}>{item === 'All' ? 'All collections' : item}</button>)}</div>
        </div>
        {error && <div className="live-error" role="alert"><p>{error} {archive ? 'Your last loaded collections are still available.' : 'You can still visit the complete archive on Zonerama.'}</p><a href={source} target="_blank" rel="noopener noreferrer">Open Zonerama <ArrowUpRight size={18} /></a></div>}
        {(query || category !== 'All') && <div className="live-result-count">{filtered.length} collections found<button onClick={() => { setQuery(''); setCategory('All'); setLimit(18); }}>Clear filters <X size={18} /></button></div>}
        {!archive && busy ? <div className="live-grid" aria-label="Loading collections" aria-busy="true">{[1, 2, 3, 4, 5, 6].map(i => <div className="live-skeleton" key={i} />)}</div> : <div className="live-grid">{filtered.slice(0, limit).map((album, index) => <article key={album.id} className="live-card" data-reveal-delay={Math.min(index % 4, 3) * 45}><a href={`?collection=${album.id}`} onClick={event => openCollection(event, album.id)} aria-label={`View ${album.name}`}><div className="live-card-image"><Cover album={album} eager={index < 4} /><span className="live-card-arrow"><ArrowUpRight size={17} /></span></div><h3>{album.name}</h3><div className="live-card-meta"><span>{album.category}</span><span>{album.photoCount} photographs</span><span>{album.dateLabel || 'From the archive'}</span></div></a></article>)}</div>}
        {archive && !filtered.length && <div className="live-empty"><h3>{albums.length ? 'No moments found.' : 'Your first collection awaits'}</h3><p>{albums.length ? 'Try a different event, date or sport.' : 'Public albums will appear here when they are added to Zonerama.'}</p></div>}
        {filtered.length > limit && <div className="live-more"><span>Showing {Math.min(limit, filtered.length)} of {filtered.length} collections</span><button onClick={() => setLimit(value => value + 18)}>More from the archive <ArrowDown size={18} /></button></div>}
        <div className="live-sync" role="status"><div><span>{error ? 'Waiting to reconnect' : archive ? (isStaticSnapshot ? 'Synced from Zonerama' : 'Live from Zonerama') : 'Connecting to Zonerama'}</span>{archive && <span>Updated {new Date(archive.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}<span className="live-refresh-note">{isStaticSnapshot ? 'Published hourly' : 'Refreshes every 5 minutes'}</span></div><button onClick={load} disabled={busy} aria-label="Refresh collections"><RefreshCw size={18} className={busy ? 'live-spinning' : ''} />{busy ? 'Refreshing' : 'Refresh'}</button></div>
      </section>
      <section className="live-manifesto" aria-labelledby="approach-title"><div className="live-manifesto-inner live-width"><h2 id="approach-title">What the score cannot hold.</h2><p className="live-manifesto-statement" aria-label={manifesto}>{manifesto.split(' ').map((word, index) => <span className="live-manifesto-word" aria-hidden="true" key={`${word}-${index}`}>{word}{' '}</span>)}</p><div className="live-manifesto-foot"><p>The archive holds sport as it felt, not only how it finished.</p><a href={source} target="_blank" rel="noopener noreferrer">Enter the complete archive <ArrowUpRight size={17} /></a></div></div></section>
    </main>}
    <footer className="live-footer"><div className="live-footer-inner live-width"><div className="live-footer-cta"><h2>Keep the whole game.</h2><a className="live-primary" href={source} target="_blank" rel="noopener noreferrer">Open full archive <ArrowUpRight size={18} /></a></div><nav aria-label="Footer navigation"><a href={collectionId ? `${siteHome()}#collections` : '#collections'} onClick={event => { if (collectionId) openCollection(event, ''); }}>Search work</a><a href={source} target="_blank" rel="noopener noreferrer">Zonerama</a><button onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>Back to top <ArrowUp size={16} /></button></nav></div><div className="live-footer-meta live-width"><p>Independent sports photography. The moment stays.</p><span>302 Edits</span></div><a className="live-footer-name" href={siteHome()} onClick={event => openCollection(event, '')} aria-label="302 Edits home">302 Edits</a></footer>
  </div>;
}
