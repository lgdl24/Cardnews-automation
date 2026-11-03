import { Link } from 'react-router';
import { useStudioStatus } from '../../studio/api';
export function GuidePage() {
  const { status } = useStudioStatus();
  return <div className="page"><p className="eyebrow">WORKSPACE GUIDE</p><h1 className="page-title">첫 카드뉴스, 이렇게 시작하세요.</h1><p className="page-desc">자료 준비부터 최종 다운로드까지. 중요한 결정은 직접 확인하며 진행해요.</p><div className="guide-grid">
    {[
      ['01', '제품 자료 준비', '제품 설명, 주요 특징, 사용 방법을 원문 그대로 준비하세요. 제품 이미지에는 출처와 사용 가능 여부가 필요해요.', '자료 입력하기', '/studio/new'],
      ['02', '구성안 검토', '자료를 저장한 다음 구성안 만들기를 시작하세요. 카드별 역할과 원문 근거, 추천 디자인을 확인한 뒤 승인하면 문구와 이미지를 만들어요.', '작업실 열기', '/studio'],
      ['03', '카드 확인과 수정', '카드를 한 장씩 선택해 문구와 원문 근거를 대조하세요. 수정할 카드와 유형을 골라 요청하고, 결과를 확인한 뒤 최종 승인해요.', '검토할 제품 보기', '/studio?stage=review'],
      ['04', '결과 내보내기·다운로드', '승인한 결과를 라이브러리로 내보내세요. 카드 결과에서 원본 PNG와 전체 ZIP을 받을 수 있고, 구성안·제작 과정도 함께 살펴볼 수 있어요.', '라이브러리 열기', '/'],
    ].map(([n, title, text, cta, to = "/"]) => <section className="panel guide-card" key={n}><p className="eyebrow">STEP {n}</p><h2>{title}</h2><p>{text}</p>{(status || to === '/') && <Link to={to}>{cta} →</Link>}</section>)}</div>
    {!status && <section className="section panel"><h2 className="section-title">내 컴퓨터에서 제작 시작하기</h2><p className="page-desc">현재는 내보낸 결과를 보는 모드예요. 제작하려면 프로젝트 폴더에서 아래 명령으로 로컬 작업실을 열어주세요.</p><pre className="code-block">npm run studio</pre><p className="muted">열린 로컬 주소에서 ‘제작 작업실’ 메뉴를 선택하세요. Claude Code 설치와 로그인이 필요해요.</p></section>}
    <section className="section panel"><h2 className="section-title">작업을 기다리는 동안</h2><p className="page-desc">다른 제품을 열어도 진행 중인 작업은 계속됩니다. 새 작업은 대기열에 추가되며, 시작 전에는 취소할 수 있어요. 로컬 서버를 끄면 대기열이 사라지므로 완료할 때까지 켜두세요.</p></section></div>;
}
