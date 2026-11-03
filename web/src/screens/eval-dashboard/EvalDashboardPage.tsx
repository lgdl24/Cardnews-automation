import { Link, useSearchParams } from 'react-router';
import { useIndex } from '../../data/load';
import { formatPercent, formatDate } from '../../data/format';
import { MetricCard, MetricGrid } from '../../components/MetricCard';
import { Loading, ErrorState, EmptyState } from '../../components/StateView';
export function EvalDashboardPage() {
  const index = useIndex(); const [params, setParams] = useSearchParams(); const version = params.get('version') ?? '';
  if (index.status === 'loading') return <div className="page"><Loading /></div>;
  if (index.status === 'error') return <div className="page"><ErrorState error={index.error} /></div>;
  const all = index.data.projects.filter(p => p.kind === 'eval'); const rows = all.filter(p => !version || p.skill_version === version);
  const passes = rows.filter(p => p.summary.first_pass !== null); const coverage = rows.flatMap(p => p.summary.coverage === null ? [] : [p.summary.coverage]); const times = rows.flatMap(p => p.summary.total_minutes === null ? [] : [p.summary.total_minutes]);
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">QUALITY OVERVIEW</p><h1 className="page-title">평가 대시보드</h1><p className="page-desc">내보낸 평가 결과의 품질과 처리 기록을 확인하세요.</p></div><Link className="btn" to="/compare">결과 비교 →</Link></div>
    <div className="toolbar"><span className="results-count">내보낸 평가 결과 기준 · {formatDate(index.data.exported_at)}</span><select aria-label="평가 규칙 버전" value={version} onChange={e => setParams(e.target.value ? { version: e.target.value } : {})}><option value="">모든 규칙 버전</option>{[...new Set(all.map(p => p.skill_version).filter(Boolean))].map(v => <option key={v} value={v!}>{v}</option>)}</select></div>
    <MetricGrid><MetricCard label="내보낸 평가 실행" value={rows.length} hint="실패·미내보내기 실행은 포함하지 않음" /><MetricCard label="첫 검사 통과율" value={formatPercent(passes.length ? passes.filter(p => p.summary.first_pass).length / passes.length : null)} hint={`첫 검사 기록이 있는 ${passes.length}건 기준`} /><MetricCard label="평균 원문 커버리지" value={formatPercent(coverage.length ? coverage.reduce((a, b) => a + b, 0) / coverage.length : null)} hint="문자열 기반 근사 지표" /><MetricCard label="평균 AI 작업 시간" value={times.length ? `${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}분` : '—'} hint={`시간 기록이 있는 ${times.length}건 기준`} /></MetricGrid>
    <section className="section"><h2 className="section-title">평가 실행별 결과</h2>{!rows.length ? <EmptyState title="내보낸 평가 결과가 없어요"><p>평가를 실행하고 결과를 내보내면 이곳에서 비교할 수 있어요.</p><Link className="btn" to="/">제작 결과 살펴보기</Link></EmptyState> : <div className="table-wrap"><table className="table"><thead><tr><th>평가 입력</th><th>규칙</th><th>반복</th><th>첫 검사</th><th>커버리지</th><th>수정</th><th>결과</th></tr></thead><tbody>{rows.map(p => <tr key={p.id}><td>{p.product_name}<br /><span className="muted">{p.eval?.input_id}</span></td><td>{p.skill_version ?? '—'}</td><td>{p.eval?.repeat ?? '—'}</td><td>{p.summary.first_pass === null ? '기록 없음' : p.summary.first_pass ? '통과' : '수정 후 통과'}</td><td>{formatPercent(p.summary.coverage)}</td><td>{p.summary.revision_rounds}회</td><td><Link to={`/projects/${p.id}`}>상세 보기 →</Link></td></tr>)}</tbody></table></div>}</section>
    <p className="page-desc section">이 화면은 공개된 평가 결과만 요약합니다. 전체 실행의 성공률·안전성·핵심 정보 포함률은 이 데이터만으로 판단할 수 없어요.</p></div>;
}
