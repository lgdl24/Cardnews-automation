// S1 작업실 (웹 모드 · 로컬 실행) — 담당 이규동
// 로컬 제작 API(npm run studio)가 켜져 있을 때만 쓸 수 있음. 제품 목록과 Claude Code 상태
import { Link, useSearchParams } from 'react-router';
import { Icon } from '../../components/Icon';
import { MetricCard, MetricGrid } from '../../components/MetricCard';
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
  const [params, setParams] = useSearchParams();
  const filter = params.get('stage') ?? 'all'; const query = params.get('q') ?? '';
  const change = (key: string, value: string) => setParams(prev => { const p = new URLSearchParams(prev); p.set(key, value); return p; }, { replace: true });
  const { status } = useStudioStatus();
  const list = usePolling(() => studioFetch<{ products: ProductSummary[] }>('/products'), [], (d) => (d && d.products.some((p) => p.running || p.queued) ? 2000 : null));

  const products = list.data?.products ?? [];
  const visible = products.filter(p => (filter === 'all' || (filter === 'review' ? !p.running && !p.queued && (p.stage === 'plan' || p.stage === 'copy') : filter === 'running' ? p.running || p.queued : p.stage === 'approved')) && `${p.name} ${p.id}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  return (
    <div className="page">
      <div className="studio-head">
        <div>
          <p className="eyebrow">CREATIVE STUDIO</p><h1 className="page-title">제작 작업실</h1>
          <p className="page-desc">제품 자료를 준비하고, 구성안과 카드를 검토해 완성해보세요.</p>
        </div>
        <Link to="/studio/new" className="btn btn-primary">
          + 새 제작
        </Link>
      </div>
      {status && <ClaudeStatus info={status.claude} />}
      {list.data && <div className="studio-overview"><MetricGrid><MetricCard label="전체 제품" value={products.length} /><MetricCard label="검토할 제품" value={products.filter(p => !p.running && !p.queued && (p.stage === 'plan' || p.stage === 'copy')).length} hint="구성안 또는 카드 승인 대기" /><MetricCard label="진행·대기 중" value={products.filter(p => p.running || p.queued).length} /><MetricCard label="승인 완료" value={products.filter(p => p.stage === 'approved').length} /></MetricGrid></div>}
      <div className="toolbar"><div className="filter-tabs" aria-label="제작 상태">{[['all', '전체'], ['review', '검토 필요'], ['running', '진행·대기'], ['approved', '승인 완료']].map(([key = "", title = ""]) => <button key={key} aria-pressed={filter === key} onClick={() => change('stage', key)}>{title}</button>)}</div><label className="toolbar-search"><Icon name="search" size={18} /><input aria-label="제작 제품 검색" type="search" placeholder="제품 이름으로 검색" value={query} onChange={e => change('q', e.target.value)} /></label></div>

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
            {visible.map((p) => (
              <li key={p.id}>
                <Link to={`/studio/${p.id}`} className="studio-row">
                  <span className={`badge badge-stage-${p.stage === 'input' ? 'plan' : p.stage}`}>{STAGE_LABEL[p.stage]}</span>
                  <span className="studio-row-name">
                    <strong>{p.name}</strong>
                    <span className="muted"> · {p.id}</span>
                  </span>
                  {p.running && <span className="tag-running">작업 중</span>}
                  {p.queued && <span className="tag-queued">대기 {p.queue_position}번째</span>}
                  <span className="studio-row-date muted">{formatDateTime(p.updated_at)}</span><span className="next-action">{p.running ? '진행 확인' : p.queued ? '대기 확인' : p.stage === 'plan' ? '구성안 검토' : p.stage === 'copy' ? '카드 검토' : p.stage === 'approved' ? '완성 결과' : '입력 확인'}</span><span className="row-arrow"><Icon name="arrow" size={17} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {list.data && products.length > 0 && visible.length === 0 && <EmptyState title="이 조건에 해당하는 제품이 없어요"><button className="btn" onClick={() => setParams({})}>전체 제품 보기</button></EmptyState>}
      </section>
    </div>
  );
}
