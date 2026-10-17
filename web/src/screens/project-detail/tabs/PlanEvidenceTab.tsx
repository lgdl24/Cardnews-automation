// V2 구성안·근거 — 담당 이용석
// 읽는 데이터: project.json analysis · sources · cards[](intent · evidence · copy · chars · cautions · revisions) · plan_revisions · quality
// 레이아웃: 노션 '웹 화면 설계' 'V2 구성안·근거 레이아웃' (왼쪽 60% 카드 PNG, 오른쪽 40% 문구↔원문)
import { useProjectContext } from '../ProjectDetailPage';
import { ScreenPlaceholder } from '../../../components/ScreenPlaceholder';

export function PlanEvidenceTab() {
  const { project } = useProjectContext();
  return (
    <ScreenPlaceholder
      title="V2 구성안·근거"
      owner="이용석"
      folder="screens/project-detail/tabs/PlanEvidenceTab.tsx"
      reads="project.json — analysis · sources · cards[] · plan_revisions · quality"
      todo={[
        '상단: 핵심 메시지와 근거 칩(S1, S2…), 카드 번호 탭',
        '왼쪽: 선택한 카드 PNG / 오른쪽: 역할·템플릿·담을 내용 → 문구 → 원문 인용',
        '[주의] 표현(원문 포함 여부), 글자 수 활용률 막대',
        '카드별 수정 요청 이력(유형 칩·메모), [참고] 카드에 쓰이지 않은 원문',
      ]}
    >
      <p className="muted">
        데이터 확인: 핵심 메시지 “{project.analysis.core_message}” · 원문 항목 {project.sources.length}개 · 카드 {project.cards.length}장
      </p>
    </ScreenPlaceholder>
  );
}
