// V2 프로젝트 상세 — 탭 틀: 담당 이규동 (공통)
// 탭 내용은 화면별 담당: 카드 결과·제작 과정 = 이규동, 구성안·근거 = 이용석
import { Link, Outlet, useOutletContext, useParams } from 'react-router';
import { useIndex, useProject, type Loadable } from '../../data/load';
import { formatDateTime } from '../../data/format';
import type { Labels, Project, WebIndex } from '../../data/types';
import { KindBadge, StageBadge } from '../../components/Badge';
import { EmptyState, ErrorState, Loading } from '../../components/StateView';
import { Tabs } from '../../components/Tabs';
import './project-detail.css';

/** 탭 화면이 받는 값 (useProjectContext로 꺼냄) */
export interface ProjectContext {
  project: Project;
  labels: Labels;
}

export const useProjectContext = () => useOutletContext<ProjectContext>();

export const PROJECT_TABS = [
  { to: '', label: '카드 결과' },
  { to: 'plan', label: '구성안·근거' },
  { to: 'timeline', label: '제작 과정' },
];

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const index = useIndex();
  // 목록(index.json)에 없는 제품은 불러오지 않음 — 검증 오류로 제외된 제품도 여기서 걸러짐
  const listed = index.status === 'ready' && index.data.projects.some((p) => p.id === id);
  if (index.status === 'ready' && !listed) {
    return (
      <div className="page">
        <BackLink />
        <EmptyState title="이 프로젝트는 내보낸 결과에 없어요">
          <p>
            주소의 제품ID(<code>{id}</code>)를 확인하거나, 로컬에서 <code>npm run export</code>로 다시 내보내세요.
          </p>
        </EmptyState>
      </div>
    );
  }
  return <ProjectDetail id={id} index={index} />;
}

function ProjectDetail({ id, index }: { id: string; index: Loadable<WebIndex> }) {
  const project = useProject(id);

  if (project.status === 'loading' || index.status === 'loading') {
    return (
      <div className="page">
        <Loading />
      </div>
    );
  }
  if (project.status === 'error' || index.status === 'error') {
    const error = project.status === 'error' ? project.error : (index as { error: Error }).error;
    return (
      <div className="page">
        <BackLink />
        <ErrorState error={error} />
      </div>
    );
  }

  const p = project.data;
  const labels = index.data.labels;
  const context: ProjectContext = { project: p, labels };

  return (
    <div className="page">
      <BackLink />
      <header className="detail-head">
        <div className="detail-badges">
          <StageBadge stage={p.stage} labels={labels} />
          <KindBadge kind={p.kind} labels={labels} />
          {p.skill_version && <span className="badge badge-kind">규칙 {p.skill_version}</span>}
        </div>
        <h1 className="page-title">{p.product.name}</h1>
        <p className="page-desc">
          {[p.product.brand, p.product.category, p.label].filter(Boolean).join(' · ')}
          {p.updated_at && <span className="detail-updated"> · 최근 제작 {formatDateTime(p.updated_at)}</span>}
        </p>
      </header>

      <Tabs items={PROJECT_TABS} label="프로젝트 상세 탭" />
      <div className="detail-body">
        <Outlet context={context} />
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/" className="back-link">
      ← 프로젝트 목록
    </Link>
  );
}
