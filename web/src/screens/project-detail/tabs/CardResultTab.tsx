// V2 카드 결과 — 담당 이규동
// 읽는 데이터: project.json cards[].png · layout, images
// 골격 단계: 카드 미리보기만. 크게 보기·PNG/ZIP 다운로드·이미지 출처는 'V2 카드 결과' 작업에서
import { projectFileUrl } from '../../../data/load';
import { label } from '../../../data/format';
import { useProjectContext } from '../ProjectDetailPage';
import { ScreenPlaceholder } from '../../../components/ScreenPlaceholder';
import './tabs.css';

export function CardResultTab() {
  const { project, labels } = useProjectContext();
  return (
    <>
      <ul className="card-strip" aria-label="카드 미리보기">
        {project.cards.map((c) => (
          <li key={c.no}>
            <img src={projectFileUrl(project.id, c.png)} alt={`${c.no}번 카드 (${label(labels.roles, c.role)})`} loading="lazy" width={1080} height={1080} />
            <span className="card-strip-no">
              {c.no} · {label(labels.roles, c.role)}
            </span>
          </li>
        ))}
      </ul>
      <div className="section">
        <ScreenPlaceholder
          title="V2 카드 결과"
          owner="이규동"
          folder="screens/project-detail/tabs/CardResultTab.tsx"
          reads="project.json — cards[].png · layout, images"
          todo={['카드 크게 보기 (앞뒤 넘기기)', 'PNG 개별 다운로드, 묶음(ZIP) 다운로드(권장)', '이미지 출처 표기 (images[].source)', '레이아웃 겹침 경고 표시 (layout.overlaps)']}
        />
      </div>
    </>
  );
}
