import { useEffect, useState } from 'react';
import { Icon } from './Icon';

// 화면 테마: 시스템 설정을 따르거나 밝게/어둡게 고정. 브라우저(cardnews-theme)에 저장 — 카드 PNG 색에는 영향 없음
export type Theme = 'light' | 'dark' | 'system';
const KEY = 'cardnews-theme';
export function readTheme(): Theme {
  try { const value = localStorage.getItem(KEY); if (value === 'light' || value === 'dark') return value; } catch { /* 저장소를 못 쓰는 환경 */ }
  return 'system';
}
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
}
export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [resolved, setResolved] = useState(() => document.documentElement.dataset.theme ?? 'light');
  useEffect(() => {
    applyTheme(theme);
    setResolved(document.documentElement.dataset.theme ?? 'light');
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => { applyTheme(theme); setResolved(document.documentElement.dataset.theme ?? 'light'); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);
  return (
    <label className="theme-control">
      <Icon name={resolved === 'dark' ? 'moon' : 'sun'} size={16} />
      <span className="sr-only">화면 테마</span>
      <select
        aria-label="화면 테마"
        value={theme}
        onChange={(e) => {
          const next = e.target.value as Theme;
          applyTheme(next);
          setTheme(next);
          try { localStorage.setItem(KEY, next); } catch { /* 이번 창에서만 유지 */ }
        }}
      >
        <option value="system">시스템 설정</option>
        <option value="light">밝게</option>
        <option value="dark">어둡게</option>
      </select>
      <Icon name="down" size={14} className="theme-caret" />
    </label>
  );
}
