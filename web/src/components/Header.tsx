import { Link, useLocation } from 'react-router';
import { useStudioStatus } from '../studio/api';
import { ThemeControl } from './ThemeControl';
import { Icon } from './Icon';
const menu = [
  { to: '/studio', label: '제작 작업실', icon: 'studio' as const, match: (p: string) => p.startsWith('/studio') },
  { to: '/', label: '콘텐츠 라이브러리', icon: 'grid' as const, match: (p: string) => p === '/' || p.startsWith('/projects') },
  { to: '/eval', label: '평가 대시보드', icon: 'chart' as const, match: (p: string) => p.startsWith('/eval') },
  { to: '/compare', label: '결과 비교', icon: 'compare' as const, match: (p: string) => p.startsWith('/compare') },
];
export function Header() {
  const { pathname } = useLocation(); const { status } = useStudioStatus();
  const visible = menu.filter(m => m.to !== '/studio' || status || pathname.startsWith('/studio'));
  const current = menu.find(m => m.match(pathname))?.label ?? '이용 가이드';
  return <>
    <a href="#main" className="skip-link">본문으로 건너뛰기</a>
    <aside className="sidebar">
      <Link to="/" className="brand"><span className="brand-symbol" aria-hidden="true"><Icon name="studio" size={22} /></span><span>Cardnews<span className="brand-sub">CREATIVE WORKSPACE</span></span></Link>
      <div className="nav-label">워크스페이스</div>
      <nav className="side-nav" aria-label="주 메뉴">{visible.map(m => <Link key={m.to} to={m.to} aria-current={m.match(pathname) ? 'page' : undefined} className={m.match(pathname) ? 'active' : undefined}><Icon name={m.icon} /><span>{m.label}</span></Link>)}<Link to="/guide" className={`mobile-guide${pathname === '/guide' ? ' active' : ''}`} aria-current={pathname === '/guide' ? 'page' : undefined}><Icon name="help"/><span>이용 가이드</span></Link></nav>
      <div className="sidebar-bottom"><Link to="/guide" className="guide-link" aria-current={pathname === '/guide' ? 'page' : undefined}><Icon name="help" /> 이용 가이드</Link><div className="workspace-status"><span className={status ? 'online-dot' : 'offline-dot'} />{status ? '로컬 작업실 연결됨' : '결과 보기 워크스페이스'}</div></div>
    </aside>
    <header className="header"><div className="header-inner"><div className="header-context"><span className="muted">워크스페이스</span><span className="muted">/</span><strong>{current}</strong></div><ThemeControl /></div></header>
  </>;
}
