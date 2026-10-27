// 작업실 화면 공통 조각 — 담당 이규동
import type { ClaudeInfo } from '../../studio/api';

/** 로컬 제작 API가 꺼져 있을 때 (배포된 사이트, 또는 npm run web:dev 대신 build/preview) */
export function StudioOff() {
  return (
    <div className="page">
      <h1 className="page-title">제작</h1>
      <div className="section panel studio-off">
        <p className="state-title">제작은 내 컴퓨터에서 켰을 때만 할 수 있어요</p>
        <p>이 사이트는 결과 보기 전용이에요. 카드를 만들려면 저장소 폴더에서 아래 명령으로 켜고 열린 주소에서 작업하세요.</p>
        <pre className="code-block">npm run studio{'\n'}# → http://127.0.0.1:5173/studio</pre>
        <p className="muted">Claude Code가 설치·로그인돼 있어야 해요 (claude auth status).</p>
      </div>
    </div>
  );
}

export function ClaudeStatus({ info }: { info: ClaudeInfo }) {
  if (!info.installed) {
    return (
      <p className="notice notice-error" role="alert">
        Claude Code(<code>claude</code>)를 찾을 수 없어요. 설치하고 <code>claude</code>로 로그인한 뒤 화면을 새로 고치세요.
      </p>
    );
  }
  if (info.logged_in === false) {
    return (
      <p className="notice notice-error" role="alert">
        Claude Code {info.version}에 로그인돼 있지 않아요. 터미널에서 <code>claude</code>를 한 번 실행해 로그인하세요.
      </p>
    );
  }
  return <p className="notice">Claude Code {info.version} · 이 컴퓨터에서 실행 · 작업은 한 번에 하나씩 (나머지는 차례로 대기)</p>;
}
