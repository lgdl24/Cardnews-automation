// 작업실 위 '진행 중 작업' 띠 — 담당 이규동
// 작업은 이 컴퓨터에서 한 번에 하나씩 돌고, 나머지는 대기열에서 차례를 기다림. 어느 화면에서든 지금 무엇이 도는지 보이게
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { JOB_LABEL, studioFetch, usePolling, useStudioStatus, type JobsOverview } from '../../studio/api';
import './studio.css';

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function StudioJobBar() {
  const { pathname } = useLocation();
  const { status } = useStudioStatus();
  if (!status || !pathname.startsWith('/studio')) return null;
  return <JobBar />;
}

function JobBar() {
  // 작업이 있으면 2초, 없으면 5초마다 확인 (다른 창에서 시작한 작업도 보이게)
  const { data } = usePolling(() => studioFetch<JobsOverview>('/jobs'), [], (d) => (d && (d.running || d.queue?.length) ? 2000 : 5000));
  const r = data?.running ?? null;
  // 예전 서버·잘못된 응답이어도 화면이 깨지지 않게
  const queue = Array.isArray(data?.queue) ? data.queue : [];
  const now = useNow(Boolean(r));
  if (!r && queue.length === 0) return null;
  const sec = r ? Math.max(0, Math.round((now - Date.parse(r.started_at)) / 1000)) : 0;
  return (
    <div className="job-bar" role="status" aria-live="polite">
      <div className="job-bar-inner">
        {r && (
          <Link to={`/studio/${r.product_id}`} className="job-bar-now">
            <span className="spinner spinner-sm" aria-hidden="true" />
            <span>
              <strong>{r.name}</strong> {JOB_LABEL[r.kind]} 중
            </span>
            <span className="job-bar-time">
              {Math.floor(sec / 60)}분 {String(sec % 60).padStart(2, '0')}초
            </span>
          </Link>
        )}
        {queue.length > 0 && (
          <div className="job-bar-queue">
            <span className="job-bar-label">대기 {queue.length}</span>
            <ol>
              {queue.map((q) => (
                <li key={q.product_id}>
                  <Link to={`/studio/${q.product_id}`}>
                    {q.position}. {q.name} <span className="muted">{JOB_LABEL[q.kind]}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
