// 작업실 화면 공통 조각 — 담당 이규동
import { Link } from 'react-router';
import type { ClaudeInfo } from '../../studio/api';
import { Icon } from '../../components/Icon';

/** 로컬 제작 API가 꺼져 있을 때 (배포된 사이트, 또는 npm run web:dev 대신 build/preview) */
export function StudioOff() {
  return (
    <div className="page page-narrow">
      <h1 className="page-title">제작 작업실</h1>
      <div className="section panel studio-off">
        <p className="state-title">제작은 내 컴퓨터에서 작업실을 켰을 때만 할 수 있어요</p>
        <p className="muted">이 사이트는 결과 보기 전용이에요. 카드를 만들려면 저장소 폴더에서 아래 명령으로 켜고, 열린 주소에서 작업하세요.</p>
        <pre className="code-block">npm run studio{'\n'}# → http://127.0.0.1:5173/studio</pre>
        <p className="muted">Claude Code가 설치·로그인돼 있어야 해요 (<code>claude auth status</code>).</p>
        <div className="action-bar">
          <Link className="btn" to="/">콘텐츠 라이브러리 보기</Link>
          <Link className="btn btn-ghost" to="/guide">이용 가이드</Link>
        </div>
      </div>
    </div>
  );
}

export function ClaudeStatus({ info }: { info: ClaudeInfo }) {
  if (!info.installed) {
    return (
      <p className="notice notice-error claude-status" role="alert">
        <Icon name="alert" size={18} /> Claude Code(<code>claude</code>)를 찾을 수 없어요. 설치하고 <code>claude</code>로 로그인한 뒤 화면을 새로 고치세요.
      </p>
    );
  }
  if (info.logged_in === false) {
    return (
      <p className="notice notice-error claude-status" role="alert">
        <Icon name="alert" size={18} /> Claude Code {info.version}에 로그인돼 있지 않아요. 터미널에서 <code>claude</code>를 한 번 실행해 로그인하세요.
      </p>
    );
  }
  return (
    <p className="claude-ready">
      <span className="online-dot" aria-hidden="true" /> 제작 준비 완료 · Claude Code {info.version ?? ''} · 작업은 한 번에 하나씩, 나머지는 대기열에서 차례로 시작해요.
    </p>
  );
}
