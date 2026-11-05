import { Link, useSearchParams } from 'react-router';
import { useIndex, useProject, projectFileUrl } from '../../data/load';
import { formatPercent } from '../../data/format';
import { Loading, ErrorState, EmptyState } from '../../components/StateView';
import type { ProjectSummary } from '../../data/types';
export function VersionComparePage() {
  const index = useIndex(); const [params, setParams] = useSearchParams();
  if (index.status === 'loading') return <div className="page"><Loading /></div>;
  if (index.status === 'error') return <div className="page"><ErrorState error={index.error} /></div>;
  const projects = index.data.projects;
  const a = projects.find(p => p.id === params.get('a')); const b = projects.find(p => p.id === params.get('b'));
  const select = (key: string, id: string) => setParams(prev => { const p = new URLSearchParams(prev); if (id) p.set(key, id); else p.delete(key); return p; });
  const comparable = a && b && a.eval && b.eval && a.eval.input_id === b.eval.input_id && a.eval.repeat === b.eval.repeat && a.skill_version !== b.skill_version;
  return <div className="page"><p className="eyebrow">SIDE BY SIDE</p><h1 className="page-title">결과 비교</h1><p className="page-desc">두 프로젝트를 골라 카드와 제작 지표를 나란히 살펴보세요.</p>
    <div className="comparison-controls">{[['a', '비교할 첫 번째 결과'], ['b', '비교할 두 번째 결과']].map(([key = "", title = ""]) => <label key={key}>{title}<select aria-label={title} value={params.get(key) ?? ''} onChange={e => select(key, e.target.value)}><option value="">프로젝트 선택</option>{projects.map(p => <option key={p.id} value={p.id}>{p.product_name} · {p.skill_version ?? '버전 없음'}{p.eval ? ` · 반복 ${p.eval.repeat}` : ''} · {p.id}</option>)}</select></label>)}</div>
    {a && b ? a.id === b.id ? <EmptyState title="서로 다른 두 결과를 선택해주세요" /> : <><p className="notice">{comparable ? '같은 평가 입력·반복의 서로 다른 규칙 버전입니다.' : '자유 비교입니다. 입력·반복·제작 조건이 다르면 규칙 버전의 효과로 해석하지 마세요.'}</p><div className="compare-grid">{[a, b].map(p => <Summary key={p.id} project={p} />)}</div><ComparedCards key={`${a.id}:${b.id}`} a={a.id} b={b.id} /></> : <EmptyState title="비교할 결과 두 개를 선택하세요"><p>서로 다른 버전의 결과를 고르면 변경 전후를 확인하기 좋아요.</p><Link to="/">라이브러리에서 결과 살펴보기 →</Link></EmptyState>}
  </div>;
}
function Summary({ project: p }: { project: ProjectSummary }) {
  return <section className="panel"><p className="eyebrow">{p.skill_version ?? 'RESULT'}</p><h2>{p.product_name}</h2><p className="muted">{p.brand ?? p.id}</p><dl><dt>원문 커버리지</dt><dd>{formatPercent(p.summary.coverage)}</dd><dt>근거 연결률</dt><dd>{formatPercent(p.summary.evidence_rate)}</dd><dt>카드 수</dt><dd>{p.card_count}장</dd><dt>수정 요청</dt><dd>{p.summary.revision_rounds}회</dd><dt>AI 작업 시간</dt><dd>{p.summary.total_minutes === null ? '—' : `${p.summary.total_minutes}분`}</dd></dl><Link to={`/projects/${p.id}`}>프로젝트 상세 →</Link></section>;
}
function ComparedCards({ a, b }: { a: string; b: string }) {
  const left = useProject(a); const right = useProject(b);
  if (left.status === 'loading' || right.status === 'loading') return <Loading />;
  if (left.status === 'error') return <ErrorState error={left.error} />;
  if (right.status === 'error') return <ErrorState error={right.error} />;
  const numbers = [...new Set([...left.data.cards, ...right.data.cards].map(c => c.no))].sort((a, b) => a - b);
  return <section className="section"><h2 className="section-title">카드별 비교</h2>{numbers.map(no => <div className="comparison-pair" key={no}><h3>{no}번 카드</h3><div className="compare-grid">{[left.data, right.data].map(p => { const c = p.cards.find(c => c.no === no); return <div key={p.id}>{c ? <img src={projectFileUrl(p.id, c.png)} alt={`${p.product.name} ${no}번 카드`} loading="lazy" width={1080} height={1080} /> : <div className="panel muted">이 번호의 카드가 없어요</div>}</div> })}</div></div>)}</section>;
}
