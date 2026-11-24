import { useIndex } from '../data/load';
import { formatDateTime } from '../data/format';
import { useStudioStatus, type DeployStatus } from '../studio/api';

// 하단: 마지막 내보내기 시각과 제작 기준 — 웹이 보여주는 결과가 언제 것인지 알림
// KT 팀 작업실에서는 서버에 배포된 버전도 함께 보여줌 (#120)
export function Footer() {
  const index = useIndex();
  const { status } = useStudioStatus();
  return (
    <footer className="footer">
      <div className="footer-inner">
        {index.status === 'ready' ? (
          <>
            <span>마지막 내보내기 {formatDateTime(index.data.exported_at)}</span>
            <span>제작 기준 {index.data.skill_version}</span>
          </>
        ) : (
          <span>카드뉴스 제작 자동화 · 결과 보기</span>
        )}
        {status?.deploy && <DeployInfo deploy={status.deploy} />}
      </div>
    </footer>
  );
}

const LAST_TEXT: Record<string, string> = { failed: '최근 배포 실패', skipped: '배포 건너뜀', waiting: '다음 배포 대기', building: '새 버전 준비 중' };

function DeployInfo({ deploy }: { deploy: DeployStatus }) {
  const { deployed, last } = deploy;
  const pending = last && last.result && last.result !== 'ok' && last.sha !== deployed?.sha;
  return (
    <>
      {deployed?.sha && (
        <span>
          서버 배포 <code>{deployed.sha}</code>
          {deployed.at ? ` · ${formatDateTime(deployed.at)}` : ''}
        </span>
      )}
      {pending && last.result && (
        <span className={last.result === 'failed' ? 'footer-warn' : undefined} title={last.message ?? undefined}>
          {LAST_TEXT[last.result]} <code>{last.sha}</code>
          {last.message ? ` · ${last.message}` : ''}
        </span>
      )}
    </>
  );
}
