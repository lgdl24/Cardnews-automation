// 화면 이동 — 노션 '웹 화면 설계' 화면 흐름
//   V1 /                         프로젝트 목록 (이규동)
//   V2 /projects/:id             프로젝트 상세 탭 틀 (이규동)
//        (첫 탭)                  카드 결과 (이규동)
//        /plan                   구성안·근거 (이용석)
//        /timeline               제작 과정 (이규동)
//   V3 /eval                     평가 대시보드 (이용석)
//   V4 /compare?a=<id>&b=<id>    버전 비교 (이용석, 권장)
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './components/Layout';
import { ProjectListPage } from './screens/project-list/ProjectListPage';
import { ProjectDetailPage } from './screens/project-detail/ProjectDetailPage';
import { CardResultTab } from './screens/project-detail/tabs/CardResultTab';
import { PlanEvidenceTab } from './screens/project-detail/tabs/PlanEvidenceTab';
import { TimelineTab } from './screens/project-detail/tabs/TimelineTab';
import { EvalDashboardPage } from './screens/eval-dashboard/EvalDashboardPage';
import { VersionComparePage } from './screens/version-compare/VersionComparePage';
import { NotFoundPage } from './screens/NotFoundPage';

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { index: true, element: <ProjectListPage /> },
        {
          path: 'projects/:id',
          element: <ProjectDetailPage />,
          children: [
            { index: true, element: <CardResultTab /> },
            { path: 'plan', element: <PlanEvidenceTab /> },
            { path: 'timeline', element: <TimelineTab /> },
          ],
        },
        { path: 'eval', element: <EvalDashboardPage /> },
        { path: 'compare', element: <VersionComparePage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
);

export function App() {
  return <RouterProvider router={router} />;
}
