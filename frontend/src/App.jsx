import { lazy, Suspense, useEffect, useState } from 'react';
const Gallery = lazy(() => import('./components/Gallery'));
import LiveArchive from './components/LiveArchive';
const studio = new URLSearchParams(window.location.search).has('studio') || new URLSearchParams(window.location.search).has('album');
import { getSession, subscribeSession } from './utils/api.js';

const appearanceKey = 'still.appearance';
const publicAppearances = ['system', 'paper', 'stone', 'sage', 'midnight', 'carbon', 'forest'];

function initialAppearance() {
  try {
    const saved = localStorage.getItem(appearanceKey);
    if (studio && ['light', 'dark', 'system'].includes(saved)) return saved;
    if (!studio && publicAppearances.includes(saved)) return saved;
    if (!studio && saved === 'light') return 'sage';
    if (!studio && saved === 'dark') return 'carbon';
  } catch { /* Browsing remains available when storage is disabled. */ }
  return 'system';
}

export default function App() {
  const [appearance, setAppearance] = useState(initialAppearance);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [session, setSession] = useState({ admin: false });
  const [sessionError, setSessionError] = useState('');
  const mode = studio
    ? appearance === 'system' ? (systemDark ? 'dark' : 'light') : appearance
    : appearance === 'system' ? (systemDark ? 'carbon' : 'sage') : appearance;

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const change = (event) => setSystemDark(event.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    const dark = ['dark', 'midnight', 'carbon', 'forest'].includes(mode);
    document.querySelector('link[rel="icon"]').href = `${import.meta.env.BASE_URL}${dark ? 'favicon-dark.svg' : 'favicon-light.svg'}`;
    document.querySelector('meta[name="theme-color"]').content = dark ? '#242424' : '#edf1ec';
  }, [mode]);

  useEffect(() => {
    if (!studio) return;
    let active = true;
    const update = (result) => { if (active) { setSession({ admin: result?.admin === true }); setSessionError(''); } };
    const unsubscribe = subscribeSession(update);
    getSession().then(update).catch((error) => {
      if (active) setSessionError(error?.message || 'Owner session is unavailable. Public browsing is still available.');
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  function changeAppearance(value) {
    setAppearance(value);
    try { localStorage.setItem(appearanceKey, value); } catch { /* Optional persistence. */ }
  }

  if (!studio) return <LiveArchive mode={mode} onAppearanceChange={changeAppearance} />;

  return <Suspense fallback={<div className="loading-state" role="status">Loading studio…</div>}><Gallery admin={session.admin} sessionError={sessionError} mode={mode}
    appearance={appearance} onAppearanceChange={changeAppearance} /></Suspense>;
}
