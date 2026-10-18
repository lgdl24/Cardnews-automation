// V1 프로젝트 목록 — 담당 이규동
// 읽는 데이터: index.json (projects[], labels, exported_at)
import { useId } from 'react';
import { Link } from 'react-router';
import { useIndex, dataUrl } from '../../data/load';
import { formatDate, formatPercent } from '../../data/format';
import type { Labels, ProjectSummary } from '../../data/types';
import { KindBadge, StageBadge } from '../../components/Badge';
import { EmptyState, ErrorState, Loading } from '../../components/StateView';
import './project-list.css';

export function ProjectListPage() {
  const index = useIndex();

  return (
    <div className="page">
      <h1 className="page-title">프로젝트</h1>
      <p className="page-desc">로컬 Claude Code로 만든 카드뉴스 결과예요. 카드를 누르면 카드·구성안·제작 과정을 볼 수 있어요.</p>

      {index.status === 'loading' && <Loading />}
      {index.status === 'error' && <ErrorState error={index.error} />}
      {index.status === 'ready' && <ProjectGroups projects={index.data.projects} labels={index.data.labels} />}
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
