import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Camera, Palette, RefreshCw, Search, X } from 'lucide-react';
import './live-archive.css';
const LiveAlbum = lazy(() => import('./LiveAlbum'));
import { isStaticSnapshot, siteHome, zoneramaUrl } from '../utils/zonerama-url';
const source = 'https://eu.zonerama.com/302Edits/2037673';
const interval = 5 * 60 * 1000;
const themes = [
  { id: 'paper', name: 'Paper', colors: ['#f1f1ef', '#e5e5e1', '#1c1c1c'] },
  { id: 'stone', name: 'Stone', colors: ['#dedbd3', '#cbc7bc', '#24231f'] },
  { id: 'sage', name: 'Sage', colors: ['#dfe6dd', '#cbd6ca', '#17221a'] },
  { id: 'midnight', name: 'Midnight', colors: ['#11161e', '#1e2631', '#edf0ec'] },
  { id: 'carbon', name: 'Charcoal', colors: ['#242424', '#303030', '#f1f1ef'] },
  { id: 'forest', name: 'Forest', colors: ['#101a14', '#1c2921', '#edf0ec'] },
];
function Cover({ album, eager = false }) {
  const [failedUrl, setFailedUrl] = useState('');
  return failedUrl === album.cover ? <span className="live-cover-fallback"><Camera size={32} />Preview unavailable</span> : <img src={album.cover} alt={`${album.name} contact sheet`} width="1600" height="800" loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} decoding={eager ? 'sync' : 'async'} referrerPolicy="no-referrer" onError={() => setFailedUrl(album.cover)} />;
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
      root.querySelectorAll('.live-story, .live-card, .live-collection-title, .live-manifesto-copy, .live-footer-inner').forEach(node => { if (!revealed.current.has(node)) observer.observe(node); });
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
  const featured = albums[0];
  const recent = albums.slice(0, 3);
  function filter(setter, value) { setter(value); setLimit(18); }
  return <div className="live-site" ref={site}>
    <a className="skip-link" href={collectionId ? "#collection-top" : "#collections"}>Skip to collections</a>
    <header className="live-header live-width">
      <a className="live-brand" href={siteHome()} onClick={event => openCollection(event, '')} aria-label="302 Edits home"><span>302</span><span>Edits</span></a>
      <nav aria-label="Main navigation"><a href={collectionId ? `${siteHome()}#collections` : "#collections"} onClick={event => { if (collectionId) openCollection(event, ''); }}>Work{albums.length ? ` (${albums.length})` : ''}</a>
        <a className="live-source-link" href={source} target="_blank" rel="noopener noreferrer">Full archive <ArrowUpRight size={15} /></a>
        <div className="live-theme-wrap" ref={themePicker}><button className="live-theme" aria-label="Choose site theme" aria-expanded={themeOpen} onClick={() => setThemeOpen(value => !value)}><Palette size={19} /><span>Theme</span></button>{themeOpen && <div className="live-theme-panel" aria-label="Site themes"><p>Choose a theme</p><div>{themes.map(theme => <button key={theme.id} className={mode === theme.id ? 'is-active' : ''} aria-pressed={mode === theme.id} onClick={() => { onAppearanceChange(theme.id); setThemeOpen(false); }}><span className="live-theme-swatch" aria-hidden="true" style={{ '--swatch-bg': theme.colors[0], '--swatch-surface': theme.colors[1], '--swatch-ink': theme.colors[2] }}><i /><i /><i /></span><strong>{theme.name}</strong></button>)}</div></div>}</div></nav>
    </header>
    {collectionId ? <Suspense fallback={<main className="loading-state" role="status">Loading collection…</main>}><LiveAlbum key={collectionId} id={collectionId} onBack={() => navigateCollection()} /></Suspense> : <main>
      <section className="live-intro" aria-labelledby="portfolio-title">
        <div className="live-intro-layout live-width">
          <div className="live-intro-copy">
            <h1 id="portfolio-title"><span>302</span><span>Edits</span></h1>
            <p className="live-intro-lead">Independent sports photography. The seconds around the score, held still.</p>
            <div className="live-hero-stats" aria-label="Archive status">
              <span>{archive ? `${albums.length} collections` : 'Connecting to the archive'}</span>
              {archive && <span>{photoCount.toLocaleString()} photographs</span>}
              <span>{error ? 'Showing the last successful edit' : archive ? 'Live and current' : 'Synchronizing'}</span>
            </div>
            <div className="live-intro-actions">
              {featured && <a className="live-primary" href={`?collection=${featured.id}`} onClick={event => openCollection(event, featured.id)}>Open featured game <ArrowUpRight size={18} /></a>}
              <a className="live-text-link" href="#collections">Search the archive <ArrowDown size={18} /></a>
            </div>
          </div>
          <div className="live-featured">{featured ? <a className="live-featured-link" href={`?collection=${featured.id}`} onClick={event => openCollection(event, featured.id)} aria-label={`View featured collection ${featured.name}`}>
            <div className="live-featured-image"><Cover album={featured} eager /></div>
            <div className="live-featured-caption"><strong>{featured.name}</strong><span>{featured.category}</span><span>{featured.photoCount} photographs</span><span>{featured.dateLabel || 'From the archive'}</span></div>
          </a> : <div className="live-featured-placeholder" aria-hidden="true"><span>Connecting to the live archive</span></div>}</div>
        </div>
      </section>

      {recent.length > 0 && <section className="live-stories" aria-labelledby="stories-title">
        <div className="live-stories-inner live-width">
          <div className="live-stories-copy"><h2 id="stories-title">Latest games</h2><p>Three recent contact sheets from the field. Each one opens into its complete collection.</p><a href="#collections">Search every game <ArrowDown size={18} /></a></div>
          <div className="live-story-list">{recent.map((album, index) => <article className="live-story" key={album.id} data-reveal-delay={index * 70}><a href={`?collection=${album.id}`} onClick={event => openCollection(event, album.id)} aria-label={`View ${album.name}`}><div className="live-story-image"><Cover album={album} eager={index === 0} /></div><div className="live-story-copy"><h3>{album.name}</h3><p>{album.category} · {album.photoCount} photographs · {album.dateLabel || 'From the archive'}</p><span aria-hidden="true"><ArrowUpRight size={20} /></span></div></a></article>)}</div>
        </div>
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
      <section className="live-manifesto" aria-labelledby="approach-title"><div className="live-manifesto-inner live-width"><h2 id="approach-title">Beyond the score</h2><div className="live-manifesto-copy"><p>302 Edits follows the split seconds around the score: the release, the recovery, and the glance before the whistle.</p><p>The archive holds sport as it felt, not only how it finished.</p><a href={source} target="_blank" rel="noopener noreferrer">Enter the complete archive <ArrowUpRight size={17} /></a></div></div></section>
    </main>}
    <footer className="live-footer"><div className="live-footer-inner live-width"><div className="live-footer-cta"><h2>See every game</h2><a className="live-primary" href={source} target="_blank" rel="noopener noreferrer">Open full archive <ArrowUpRight size={18} /></a></div><nav aria-label="Footer navigation"><a href={collectionId ? `${siteHome()}#collections` : '#collections'} onClick={event => { if (collectionId) openCollection(event, ''); }}>Search work</a><a href={source} target="_blank" rel="noopener noreferrer">Zonerama</a><button onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>Back to top <ArrowUp size={16} /></button></nav></div><div className="live-footer-meta live-width"><p>Independent sports photography. The moment stays.</p><span>302 Edits</span></div><a className="live-footer-name" href={siteHome()} onClick={event => openCollection(event, '')} aria-label="302 Edits home">302 Edits</a></footer>
  </div>;
}
