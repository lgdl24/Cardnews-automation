// SVG 아이콘 (24×24, 선 1.7) — 이모지 대신 이것만 씀. 장식이라 항상 aria-hidden
const PATHS = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  studio: 'M14 3l7 7-11 11H3v-7L14 3z M11 6l7 7',
  chart: 'M4 4v16h17 M9 16v-5 M14 16V6 M19 16v-8',
  compare: 'M3 5h7v14H3z M14 5h7v14h-7z M12 2v20',
  help: 'M9 9a3 3 0 116 0c0 2-3 2-3 5 M12 17v.1 M22 12a10 10 0 11-20 0 10 10 0 0120 0',
  sun: 'M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1 M16 12a4 4 0 11-8 0 4 4 0 018 0',
  moon: 'M21 13a9 9 0 11-10-10 7 7 0 0010 10',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  back: 'M19 12H5 M11 6l-6 6 6 6',
  search: 'M21 21l-5-5 M18 10a8 8 0 11-16 0 8 8 0 0116 0',
  plus: 'M12 5v14 M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7',
  x: 'M6 6l12 12 M18 6L6 18',
  alert: 'M12 8v5 M12 16.5v.1 M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  clock: 'M12 7v5l3 2 M21 12a9 9 0 11-18 0 9 9 0 0118 0',
  refresh: 'M20 11a8 8 0 10-2.3 5.7 M20 4v7h-7',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15 9.5v.1',
  layers: 'M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3.5 6v.1 M3.5 12v.1 M3.5 18v.1',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  download: 'M12 4v11 M7 10l5 5 5-5 M4 20h16',
  doc: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h5',
  monitor: 'M3 4h18v12H3z M8 20h8 M12 16v4',
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
