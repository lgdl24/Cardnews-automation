// V4 버전 비교 (권장) — 담당 이용석
// 읽는 데이터: 같은 평가 입력(eval.input_id·repeat)의 project.json 두 개 — /compare?a=<제품ID>&b=<제품ID>
import { Link, useSearchParams } from 'react-router';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder';

export function VersionComparePage() {
  const [params] = useSearchParams();
  const a = params.get('a');
  const b = params.get('b');
  return (
    <div className="page">
      <Link to="/" className="back-link">
        ← 프로젝트 목록
      </Link>
      <h1 className="page-title">버전 비교</h1>
      <p className="page-desc">같은 입력으로 만든 규칙(Skill) v1·v2 카드와 지표를 나란히 봐요.</p>
      <div className="section">
        <ScreenPlaceholder
          title="V4 버전 비교"
          owner="이용석"
          folder="screens/version-compare/"
          reads="같은 평가 입력의 project.json 두 개 (index.json eval.input_id · repeat가 같고 skill_version이 다름)"
          todo={['주소: /compare?a=<제품ID>&b=<제품ID>', '카드 PNG를 번호별로 나란히', '품질 지표·오류 코드 비교', 'V2 구성안·근거의 ‘이전 버전과 비교’에서 연결']}
        >
          <p className="muted">
            선택: a = {a ?? '없음'}, b = {b ?? '없음'}
          </p>
        </ScreenPlaceholder>
      </div>
    </div>
  );
}
