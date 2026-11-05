import { useEffect, useState } from 'react';
export type Theme = 'light' | 'dark' | 'system';
const KEY = 'cardnews-theme';
export function readTheme(): Theme {
  try { const value = localStorage.getItem(KEY); if (value === 'light' || value === 'dark') return value; } catch { /* Storage can be unavailable. */ }
  return 'system';
}
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
}
export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    applyTheme(theme);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(theme);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);
  return <label className="theme-control"><span>화면 테마</span><select aria-label="화면 테마" value={theme} onChange={e => { const next = e.target.value as Theme; applyTheme(next); setTheme(next); try { localStorage.setItem(KEY, next); } catch { /* Keep the current session setting. */ } }}><option value="system">시스템</option><option value="light">밝게</option><option value="dark">어둡게</option></select></label>;
}
