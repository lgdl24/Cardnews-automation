// V1 프로젝트 목록 — 담당 이규동
// 읽는 데이터: index.json (projects[], labels, exported_at)
import { useId } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '../../components/Icon';
import { useStudioStatus } from '../../studio/api';
import { useIndex, dataUrl } from '../../data/load';
import { formatDate, formatPercent } from '../../data/format';
import type { Labels, ProjectSummary } from '../../data/types';
import { KindBadge, StageBadge } from '../../components/Badge';
import { EmptyState, ErrorState, Loading } from '../../components/StateView';
import './project-list.css';

export function ProjectListPage() {
  const index = useIndex();
  const { status } = useStudioStatus();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const kind = params.get('kind') ?? 'all';
  const sort = params.get('sort') ?? 'recent';
  const change = (key: string, value: string) => setParams(prev => { const p = new URLSearchParams(prev); if (value) p.set(key, value); else p.delete(key); return p; }, { replace: true });
  const all = index.status === 'ready' ? index.data.projects : [];
  const projects = all.filter(p => (kind === 'all' || (kind === 'eval' ? p.kind === 'eval' : p.kind !== 'eval')) && [p.product_name, p.brand, p.category, p.id].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'name' ? a.product_name.localeCompare(b.product_name, 'ko') : (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));

  return (
    <div className="page">
      <div className="page-heading library-hero"><div><p className="eyebrow">CONTENT LIBRARY</p><h1>완성된 콘텐츠,<br />한눈에 모아보세요.</h1><p>카드부터 원문 근거까지, 제작의 모든 결과를 한곳에서.</p><Link to={status ? '/studio/new' : '/guide'} className="btn btn-primary">{status ? '새 카드뉴스 만들기' : '제작 방법 알아보기'} <Icon name="arrow" size={16} /></Link></div><div className="hero-count"><div><strong>{index.status === 'ready' ? all.filter(p => p.kind !== 'eval').length : '—'}</strong><span>제작 프로젝트</span></div><div><strong>{index.status === 'ready' ? all.reduce((n, p) => n + p.card_count, 0) : '—'}</strong><span>전체 카드</span></div></div></div>
      <div className="toolbar"><div className="filter-tabs" aria-label="결과 종류">{[['all', '전체'], ['production', '제작 결과'], ['eval', '평가 결과']].map(([key = "", title = ""]) => <button key={key} aria-pressed={kind === key} onClick={() => change('kind', key)}>{title}</button>)}</div><label className="toolbar-search"><Icon name="search" size={18} /><input type="search" aria-label="프로젝트 검색" placeholder="제품명, 브랜드로 검색" value={query} onChange={e => change('q', e.target.value)} /></label><select aria-label="프로젝트 정렬" value={sort} onChange={e => change('sort', e.target.value)}><option value="recent">최근 제작순</option><option value="name">이름순</option></select></div>
      {index.status === 'ready' && <p className="results-count" role="status">{projects.length}개의 프로젝트{query ? ` · “${query}” 검색 결과` : ''}</p>}
      {index.status === 'ready' && all.length > 0 && projects.length === 0 && <EmptyState title="검색 조건에 맞는 프로젝트가 없어요"><button className="btn" onClick={() => setParams({})}>검색·필터 초기화</button></EmptyState>}

      {index.status === 'loading' && <Loading />}
      {index.status === 'error' && <ErrorState error={index.error} />}
      {index.status === 'ready' && (projects.length > 0 || all.length === 0) && <ProjectGroups projects={projects} labels={index.data.labels} />}
    </div>
  );
}

// 실제 제작(예시 포함)과 평가 실행 결과를 나눠 보여줌
function ProjectGroups({ projects, labels }: { projects: ProjectSummary[]; labels: Labels }) {
  if (projects.length === 0) {
    return (
      <EmptyState title="아직 내보낸 프로젝트가 없어요">
        <p>
          승인된 제작 결과를 <code>npm run export</code>로 내보내면 여기에 보여요.
        </p>
      </EmptyState>
    );
  }
  const made = projects.filter((p) => p.kind !== 'eval');
  const evals = projects.filter((p) => p.kind === 'eval');
  return (
    <>
      <ProjectSection title="제작 결과" projects={made} labels={labels} empty="실제 제작 결과가 아직 없어요." />
      {evals.length > 0 && <ProjectSection title="평가 실행 결과" projects={evals} labels={labels} />}
    </>
  );
}

function ProjectSection({ title, projects, labels, empty }: { title: string; projects: ProjectSummary[]; labels: Labels; empty?: string }) {
  const headingId = useId();
  return (
    <section className="section" aria-labelledby={headingId}>
      <h2 className="section-title" id={headingId}>
        {title} <span className="muted">{projects.length}</span>
      </h2>
      {projects.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="project-grid">
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} labels={labels} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectCard({ project: p, labels }: { project: ProjectSummary; labels: Labels }) {
  return (
    <Link to={`/projects/${p.id}`} className="project-card">
      <img className="project-thumb" src={dataUrl(p.thumbnail)} alt={`${p.product_name} 대표 카드`} loading="lazy" width={1080} height={1080} />
      <div className="project-body">
        <div className="project-badges">
          <StageBadge stage={p.stage} labels={labels} />
          <KindBadge kind={p.kind} labels={labels} />
        </div>
        <h3 className="project-name">{p.product_name}</h3>
        <p className="project-meta">{[p.brand, p.category].filter(Boolean).join(' · ') || '—'}</p>
        {p.label && <p className="project-label">{p.label}</p>}
        <dl className="project-facts">
          <div>
            <dt>최근 제작</dt>
            <dd>{formatDate(p.updated_at)}</dd>
          </div>
          <div>
            <dt>카드</dt>
            <dd>{p.card_count}장</dd>
          </div>
          <div>
            <dt>원문 근거</dt>
            <dd>{formatPercent(p.summary.evidence_rate)}</dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}
