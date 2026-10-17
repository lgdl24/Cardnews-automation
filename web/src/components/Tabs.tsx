import { NavLink } from 'react-router';

export interface TabItem {
  /** 현재 경로 기준 상대 경로 ('' = 첫 탭) */
  to: string;
  label: string;
}

// 경로로 바뀌는 탭: 새로고침·링크 공유해도 같은 탭이 열림
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav className="tabs" aria-label={label}>
      {items.map((t) => (
        <NavLink key={t.to} to={t.to} end>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
