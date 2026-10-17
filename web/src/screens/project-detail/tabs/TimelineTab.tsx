// V2 제작 과정 — 담당 이규동
// 읽는 데이터: timeline.json (summary · jobs · events)
// 골격 단계: 요약 숫자만. 타임라인·단계별 시간 막대는 'V2 제작 과정' 작업에서
import { useTimeline } from '../../../data/load';
import { formatMinutes } from '../../../data/format';
import { useProjectContext } from '../ProjectDetailPage';
import { MetricCard, MetricGrid } from '../../../components/MetricCard';
import { ErrorState, Loading } from '../../../components/StateView';
import { ScreenPlaceholder } from '../../../components/ScreenPlaceholder';

export function TimelineTab() {
  const { project } = useProjectContext();
  const timeline = useTimeline(project.id);

  if (timeline.status === 'loading') return <Loading />;
  if (timeline.status === 'error') return <ErrorState error={timeline.error} />;

  const s = timeline.data.summary;
  return (
    <>
      <MetricGrid>
        <MetricCard label="전체 소요 시간" value={formatMinutes(s.total_minutes)} hint={`AI 처리 ${formatMinutes(s.ai_minutes)} · 사람 검토 ${formatMinutes(s.human_minutes)}`} />
        <MetricCard label="수정 요청" value={`${s.revision_rounds}회`} hint={`구성안 수정 ${s.plan_revisions}회`} />
        <MetricCard label="자동 수정" value={`${s.auto_fix_total}회`} />
        <MetricCard label="1회 통과" value={s.first_pass === null ? '—' : s.first_pass ? '예' : '아니요'} />
      </MetricGrid>
      <div className="section">
        <ScreenPlaceholder
          title="V2 제작 과정"
          owner="이규동"
          folder="screens/project-detail/tabs/TimelineTab.tsx"
          reads="timeline.json — summary · jobs · events"
          todo={[
            '단계 표시 줄 (입력 → 구성안 작업 → 구성안 확인 → 문구·출력 → 최종 검토)',
            '단계별 소요 시간 막대 (AI 처리 / 사람 검토)',
            '이벤트 타임라인: 작업 시작·끝, 검증 결과, 승인(사람/평가), 수정 요청(유형·메모)',
            '작업별 자동 수정 횟수·오류 코드',
          ]}
        />
      </div>
    </>
  );
}
