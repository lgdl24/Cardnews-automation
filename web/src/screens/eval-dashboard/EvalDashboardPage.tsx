// V3 평가 대시보드 — 담당 이용석
// 읽는 데이터: eval/ (docs/eval-spec.md, 10.24 초안), index.json의 kind: "eval" 프로젝트
// 구성: 노션 '데이터 분석 설계'의 대시보드 구성 (요약 숫자 4개, 차트 4칸)
import { useIndex } from '../../data/load';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder';

export function EvalDashboardPage() {
  const index = useIndex();
  const evalCount = index.status === 'ready' ? index.data.projects.filter((p) => p.kind === 'eval').length : null;
  return (
    <div className="page">
      <h1 className="page-title">평가 대시보드</h1>
      <p className="page-desc">평가용 입력 세트를 반복 실행한 결과로 품질·일관성·안전성과 규칙 버전 효과를 봐요.</p>
      <div className="section">
        <ScreenPlaceholder
          title="V3 평가 대시보드"
          owner="이용석"
          folder="screens/eval-dashboard/"
          reads="eval/ (docs/eval-spec.md), index.json의 kind: eval 프로젝트"
          todo={[
            '요약 숫자: 평가 실행 수 · 1회 통과율 · 평균 핵심 정보 포함률 · 안전성 충족률',
            '입력별 품질 지표 표(히트맵), 오류 코드별 v1 vs v2 막대',
            '반복 일관성 · 안전성(입력 누락·지시문) 칸',
            '아래쪽: 실제 제작 사례 표 (단계별 소요 시간·수정 유형)',
          ]}
        >
          {evalCount !== null && <p className="muted">현재 내보낸 평가 실행 프로젝트: {evalCount}개</p>}
        </ScreenPlaceholder>
      </div>
    </div>
  );
}
