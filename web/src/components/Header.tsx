import { Link, useLocation } from 'react-router';

// 상단 메뉴: 프로젝트 · 평가 대시보드 (노션 '웹 화면 설계' 공통 규칙)
// 프로젝트 상세(V2)·버전 비교(V4)는 '프로젝트' 메뉴 아래에 있음
const MENU = [
  { to: '/', label: '프로젝트', match: (p: string) => p === '/' || p.startsWith('/projects') || p.startsWith('/compare') },
  { to: '/eval', label: '평가 대시보드', match: (p: string) => p.startsWith('/eval') },
];

export function Header() {
  const { pathname } = useLocation();
  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="header-brand" aria-label="카드뉴스 결과 보기 — 프로젝트 목록">
          <span className="header-mark" aria-hidden="true">
            CN
          </span>
          <span className="header-brand-text">카드뉴스 결과 보기</span>
        </Link>
        <nav className="header-nav" aria-label="주 메뉴">
          {MENU.map((m) => {
            const active = m.match(pathname);
            return (
              <Link key={m.to} to={m.to} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
                {m.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
