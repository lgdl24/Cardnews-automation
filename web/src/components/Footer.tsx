import { useIndex } from '../data/load';
import { formatDateTime } from '../data/format';

// 하단: 마지막 내보내기 시각과 규칙(Skill) 버전 — 웹이 보여주는 결과가 언제 것인지 알림
export function Footer() {
  const index = useIndex();
  return (
    <footer className="footer">
      <div className="footer-inner">
        {index.status === 'ready' ? (
          <>
            <span>마지막 내보내기 {formatDateTime(index.data.exported_at)}</span>
            <span>규칙(Skill) 버전 {index.data.skill_version}</span>
            <span>웹 데이터 규격 v{index.data.spec_version}</span>
          </>
        ) : (
          <span>카드뉴스 제작 자동화 · 결과 보기</span>
        )}
      </div>
    </footer>
  );
}
