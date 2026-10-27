// S1 작업실 (웹 모드 · 로컬 실행) — 담당 이규동
// 로컬 제작 API(npm run studio)가 켜져 있을 때만 쓸 수 있음. 제품 목록과 Claude Code 상태
import { Link } from 'react-router';
import { STAGE_LABEL, studioFetch, usePolling, useStudioStatus, type ProductSummary } from '../../studio/api';
import { formatDateTime } from '../../data/format';
import { EmptyState, ErrorState, Loading } from '../../components/StateView';
import { StudioOff, ClaudeStatus } from './StudioCommon';
import './studio.css';

export function StudioHomePage() {
  const { status } = useStudioStatus();
  if (status === undefined) return <div className="page"><Loading /></div>;
  if (status === null) return <StudioOff />;
  return <StudioHome />;
}

function StudioHome() {
  const { status } = useStudioStatus();
  const list = usePolling(() => studioFetch<{ products: ProductSummary[] }>('/products'), [], (d) => (d && d.products.some((p) => p.running || p.queued) ? 2000 : null));

  return (
    <div className="page">
      <div className="studio-head">
        <div>
          <h1 className="page-title">제작</h1>
          <p className="page-desc">입력·승인·수정 요청은 이 화면에서 하고, 카드는 이 컴퓨터의 Claude Code가 만들어요.</p>
        </div>
        <Link to="/studio/new" className="btn btn-primary">
          + 새 제작
        </Link>
      </div>
      {status && <ClaudeStatus info={status.claude} />}

      <section className="section" aria-labelledby="studio-list">
        <h2 className="section-title" id="studio-list">
          제품 {list.data ? <span className="muted">{list.data.products.length}</span> : null}
        </h2>
        {list.error && <ErrorState error={list.error} />}
        {!list.data && !list.error && <Loading />}
        {list.data && list.data.products.length === 0 && (
          <EmptyState title="아직 만든 제품이 없어요">
            <p>
              <Link to="/studio/new">새 제작</Link>에서 제품 자료를 입력하면 시작돼요.
            </p>
          </EmptyState>
        )}
        {list.data && list.data.products.length > 0 && (
          <ul className="studio-list">
            {list.data.products.map((p) => (
              <li key={p.id}>
                <Link to={`/studio/${p.id}`} className="studio-row">
                  <span className={`badge badge-stage-${p.stage === 'input' ? 'plan' : p.stage}`}>{STAGE_LABEL[p.stage]}</span>
                  <span className="studio-row-name">
                    <strong>{p.name}</strong>
                    <span className="muted"> · {p.id}</span>
                  </span>
                  {p.running && <span className="tag-running">작업 중</span>}
                  {p.queued && <span className="tag-queued">대기 {p.queue_position}번째</span>}
                  <span className="studio-row-date muted">{formatDateTime(p.updated_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
