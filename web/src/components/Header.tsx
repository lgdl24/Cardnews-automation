import { Link, useLocation } from 'react-router';
import { useStudioStatus } from '../studio/api';
import { ThemeControl } from './ThemeControl';
import { Icon, type IconName } from './Icon';

const menu: { to: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { to: '/studio', label: '제작 작업실', icon: 'studio', match: (p) => p.startsWith('/studio') },
  { to: '/', label: '콘텐츠 라이브러리', icon: 'grid', match: (p) => p === '/' || p.startsWith('/projects') },
  { to: '/eval', label: '평가 대시보드', icon: 'chart', match: (p) => p.startsWith('/eval') },
  { to: '/compare', label: '결과 비교', icon: 'compare', match: (p) => p.startsWith('/compare') },
];

export function Header() {
  const { pathname } = useLocation();
  const { status } = useStudioStatus();
  // 작업실 메뉴는 로컬 제작 API가 켜져 있을 때(또는 그 화면에 있을 때)만
  const visible = menu.filter((m) => m.to !== '/studio' || status || pathname.startsWith('/studio'));
  const current = menu.find((m) => m.match(pathname))?.label ?? (pathname === '/guide' ? '이용 가이드' : '');
  const guideActive = pathname === '/guide';
  return (
    <>
      <a href="#main" className="skip-link">본문으로 건너뛰기</a>
      <aside className="sidebar">
        <Link to={status ? '/studio' : '/'} className="brand" aria-label="Cardnews Studio 홈">
          <span className="brand-symbol" aria-hidden="true"><Icon name="layers" size={18} /></span>
          <span className="brand-text">Cardnews<span className="brand-sub">카드뉴스 작업실</span></span>
        </Link>
        <nav className="side-nav" aria-label="주 메뉴">
          {visible.map((m) => (
            <Link key={m.to} to={m.to} aria-current={m.match(pathname) ? 'page' : undefined} className={m.match(pathname) ? 'active' : undefined}>
              <Icon name={m.icon} size={18} />
              <span>{m.label}</span>
            </Link>
          ))}
          <Link to="/guide" className={`mobile-guide${guideActive ? ' active' : ''}`} aria-current={guideActive ? 'page' : undefined}>
            <Icon name="help" size={18} />
            <span>이용 가이드</span>
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <Link to="/guide" className={`guide-link${guideActive ? ' active' : ''}`} aria-current={guideActive ? 'page' : undefined}>
            <Icon name="help" size={18} /> 이용 가이드
          </Link>
          <p className="workspace-status">
            <span className={status ? 'online-dot' : 'offline-dot'} aria-hidden="true" />
            {status === undefined ? '연결 확인 중' : status ? '로컬 작업실 연결됨' : '결과 보기 전용'}
          </p>
        </div>
      </aside>
      <header className="header">
        <div className="header-inner">
          <p className="header-context">{current}</p>
          <ThemeControl />
        </div>
      </header>
    </>
  );
}
