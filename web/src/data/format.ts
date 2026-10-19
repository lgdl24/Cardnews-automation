// 화면 공통 표시 형식
import type { LabelMap, Rate } from './types';

const dateTime = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Seoul',
});
const dateOnly = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul' });

/** 2026. 10. 17. 14:05 */
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : '—');
/** 2026. 10. 17. */
export const formatDate = (iso: string | null | undefined) => (iso ? dateOnly.format(new Date(iso)) : '—');

/** 0.857 → 86% */
export const formatPercent = (rate: Rate | undefined) => (rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)}%`);

/** 0.7 → 42초, 2.8 → 2분 48초, 12.4 → 12분, 75 → 1시간 15분 (짧은 작업도 0분으로 보이지 않게) */
export function formatMinutes(min: number | null | undefined) {
  if (min === null || min === undefined) return '—';
  const sec = Math.round(min * 60);
  if (sec < 60) return `${sec}초`;
  if (sec < 600) return `${Math.floor(sec / 60)}분${sec % 60 ? ` ${sec % 60}초` : ''}`;
  const m = Math.round(min);
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`;
}

/** 이름표가 없으면 코드를 그대로 보여준다 */
export const label = (map: LabelMap | undefined, code: string | null | undefined) => (code ? (map?.[code] ?? code) : '—');
