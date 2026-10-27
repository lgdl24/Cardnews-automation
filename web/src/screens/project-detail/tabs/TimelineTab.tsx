// V2 제작 과정 — 담당 이규동
// 읽는 데이터: timeline.json (summary · jobs · events), project.json quality
// 노션 '웹 화면 설계' V2 · 제작 과정: 작업 시작·끝, 구성안 승인, 수정 요청(유형·메모), 검증 결과,
// 작업 종류별 AI 작업 시간, 품질 지표. 실시간 진행이 아니라 끝난 작업의 기록을 보여줌
// 시간은 AI 작업 시간만 (웹 데이터 v1.0): 사람이 확인·대기한 시간은 다른 제품 작업·자리 비움이 섞여 빼요
import type { ReactNode } from 'react';
import { useTimeline } from '../../../data/load';
import { formatDateTime, formatMinutes, formatPercent, label } from '../../../data/format';
import type { Job, JobKind, Labels, Phases, Project, Timeline, TimelineEvent } from '../../../data/types';
import { useProjectContext } from '../ProjectDetailPage';
import { MetricCard, MetricGrid } from '../../../components/MetricCard';
import { ErrorState, Loading } from '../../../components/StateView';
import './timeline.css';

// 작업 종류 순서 — scripts/lib/analysis.js의 PHASES와 같게 유지
const PHASE_ORDER: (keyof Phases)[] = ['plan_job', 'copy_job', 'revise_job'];
const JOB_KIND: Record<JobKind, string> = { plan: '구성안', copy: '문구·출력', revise: '수정' };
const jobKind = (k: JobKind | null | undefined) => (k ? JOB_KIND[k] : '작업');

export function TimelineTab() {
  const { project, labels } = useProjectContext();
  const timeline = useTimeline(project.id);

  if (timeline.status === 'loading') return <Loading />;
  if (timeline.status === 'error') return <ErrorState error={timeline.error} />;

  const t = timeline.data;
  return (
    <>
      <Summary timeline={t} />
      <PhaseBar phases={t.summary.phases} labels={labels} />
      <Quality project={project} />
      <Jobs jobs={t.jobs} />
      <Events events={t.events} labels={labels} />
    </>
  );
}

function Summary({ timeline: { summary: s } }: { timeline: Timeline }) {
  return (
    <MetricGrid>
      <MetricCard
        label="제작 시간 (AI 작업)"
        value={formatMinutes(s.total_minutes)}
        hint={s.complete ? '사람이 확인·대기한 시간은 넣지 않아요' : '최종 승인 전 (진행 중 기록)'}
      />
      <MetricCard label="수정 요청" value={`${s.revision_rounds}회`} hint={`구성안 수정 ${s.plan_revisions}회 · 수정된 카드 ${formatPercent(s.revised_card_ratio)}`} />
      <MetricCard label="자동 수정" value={`${s.auto_fix_total}회`} hint="검증 오류를 Claude가 스스로 고친 횟수" />
      <MetricCard label="1회 통과" value={s.first_pass === null ? '—' : s.first_pass ? '예' : '아니요'} hint="모든 작업이 첫 검증에서 통과" />
    </MetricGrid>
  );
}

// 작업 종류별 AI 작업 시간 막대: 너비 = 시간 비율. 막대만으로 알 수 없게 아래 목록에 글자로도 적음
function PhaseBar({ phases, labels }: { phases: Phases; labels: Labels }) {
  const rows = PHASE_ORDER.map((k) => ({ key: k, name: label(labels.phases, k), min: phases[k] ?? 0 }));
  const total = rows.reduce((a, r) => a + r.min, 0);
  const shown = rows.filter((r) => r.min > 0);
  return (
    <section className="section" aria-labelledby="phase-title">
      <div className="phase-head">
        <h2 className="section-title" id="phase-title">
          작업별 소요 시간
        </h2>
        <p className="muted phase-note">AI 작업 시간만 보여줘요. 사람이 확인·대기한 시간은 넣지 않아요.</p>
      </div>
      {total === 0 ? (
        <p className="muted">기록된 작업 시간이 없어요.</p>
      ) : (
        <div className="phase-bar" role="img" aria-label={shown.map((r) => `${r.name} ${formatMinutes(r.min)}`).join(', ')}>
          {shown.map((r) => (
            <div
              key={r.key}
              className="phase-seg phase-ai"
              style={{ flexGrow: r.min }}
              title={`${r.name} · ${formatMinutes(r.min)} (${Math.round((r.min / total) * 100)}%)`}
            >
              {r.min / total >= 0.12 && <span className="phase-seg-label">{r.name}</span>}
            </div>
          ))}
        </div>
      )}
      <ol className="phase-steps">
        {rows.map((r) => (
          <li key={r.key} className={r.min > 0 ? undefined : 'is-empty'}>
            <span className="phase-dot phase-ai" aria-hidden="true" />
            <span className="phase-step-name">{r.name}</span>
            <span className="phase-step-min">{r.min > 0 ? formatMinutes(r.min) : '—'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Quality({ project }: { project: Project }) {
  const q = project.quality;
  return (
    <section className="section" aria-labelledby="quality-title">
      <h2 className="section-title" id="quality-title">
        품질 지표
      </h2>
      <MetricGrid>
        <MetricCard label="원문 커버리지" value={formatPercent(q.coverage)} hint={`원문 항목 ${q.coverage_detail.covered}/${q.coverage_detail.total}개를 카드에 사용`} />
        <MetricCard label="근거 연결률" value={formatPercent(q.evidence_rate)} hint="전체 카드 중 원문 인용이 1개 이상 붙은 카드 비율 (표지·마무리는 근거가 선택이라 100%가 아닐 수 있음)" />
        <MetricCard label="글자 수 활용률" value={formatPercent(q.char_usage)} hint={`가장 높은 필드 ${formatPercent(q.char_usage_max)}`} />
        <MetricCard
          label="[주의] 표현"
          value={q.caution ? `${q.caution.total}개` : '—'}
          hint={q.caution && q.caution.total > 0 ? `원문에 없음 ${q.caution.not_in_source}개 · 원문에 있음 ${q.caution.in_source}개` : '과장·최상급 표현 검사'}
        />
      </MetricGrid>
    </section>
  );
}

function Jobs({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) return null;
  return (
    <section className="section" aria-labelledby="jobs-title">
      <h2 className="section-title" id="jobs-title">
        작업별 결과
      </h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">작업</th>
              <th scope="col">결과</th>
              <th scope="col">시간</th>
              <th scope="col">1회 통과</th>
              <th scope="col">자동 수정</th>
              <th scope="col">오류 코드</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j, i) => (
              <tr key={j.job_id ?? i}>
                <td>{jobKind(j.kind)}</td>
                <td>
                  <ResultTag ok={j.ok} />
                </td>
                <td>{formatMinutes(j.minutes)}</td>
                <td>{j.first_pass === null ? '—' : j.first_pass ? '예' : '아니요'}</td>
                <td>{j.auto_fix_count}회</td>
                <td>{j.error_code ? <code>{j.error_code}</code> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResultTag({ ok }: { ok: boolean | null | undefined }) {
  if (ok === null || ok === undefined) return <span className="tag">끝나지 않음</span>;
  return ok ? <span className="tag tag-ok">✓ 성공</span> : <span className="tag tag-fail">✕ 중단</span>;
}

// ── 이벤트 타임라인

function Events({ events, labels }: { events: TimelineEvent[]; labels: Labels }) {
  if (events.length === 0) return null;
  const start = Date.parse(events[0]!.ts);
  return (
    <section className="section" aria-labelledby="events-title">
      <h2 className="section-title" id="events-title">
        제작 기록 <span className="muted">{events.length}</span>
      </h2>
      <p className="muted events-desc">처음 기록 {formatDateTime(events[0]!.ts)} 기준 경과 시간</p>
      <ol className="events">
        {events.map((e, i) => {
          const d = describe(e, labels);
          return (
            <li key={i} className={`event event-${d.tone}`}>
              <span className="event-time" title={formatDateTime(e.ts)}>
                {elapsed(Date.parse(e.ts) - start)}
              </span>
              <span className="event-mark" aria-hidden="true" />
              <div className="event-body">
                <p className="event-title">
                  {d.title}
                  {d.badge && <span className={`tag ${d.tone === 'fail' ? 'tag-fail' : d.tone === 'human' ? 'tag-human' : ''}`}>{d.badge}</span>}
                </p>
                {d.detail}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

type Tone = 'info' | 'ok' | 'fail' | 'human';

function describe(e: TimelineEvent, labels: Labels): { title: string; badge?: string; tone: Tone; detail?: ReactNode } {
  switch (e.event) {
    case 'input_submitted':
      return { title: '제작 요청 · 입력 접수', tone: 'human' };
    case 'job_started':
      return { title: `${jobKind(e.kind)} 작업 시작`, tone: 'info' };
    case 'job_finished':
      return e.ok
        ? { title: `${jobKind(e.kind)} 작업 끝`, tone: 'ok' }
        : { title: `${jobKind(e.kind)} 작업 중단`, tone: 'fail', badge: e.error_code ?? '오류' };
    case 'validate_result': {
      const what = e.check === 'layout' ? '출력·레이아웃 점검' : '데이터 검증';
      const rendered = e.rendered_cards?.length ? `${e.rendered_cards.join(', ')}번 카드 출력` : null;
      if (e.ok) return { title: `${what} 통과`, tone: 'ok', detail: rendered && <p className="event-detail">{rendered}</p> };
      return {
        title: `${what} 오류`,
        tone: 'fail',
        badge: `${e.error_codes?.length ?? 0}종`,
        detail: (
          <p className="event-detail">
            {e.error_codes?.map((c) => (
              <code key={c}>{c}</code>
            ))}
            {e.cards_with_errors?.length ? ` · ${e.cards_with_errors.join(', ')}번 카드` : ''}
            {rendered ? ` · ${rendered}` : ''}
          </p>
        ),
      };
    }
    case 'plan_approved':
      return { title: '구성안 승인', tone: 'human', badge: e.approved_by === 'eval' ? '평가 자동 승인' : '사람 승인' };
    case 'final_approved':
      return { title: '최종 승인', tone: 'human', badge: e.approved_by === 'eval' ? '평가 자동 승인' : '사람 승인' };
    case 'design_selected':
      return {
        title: '디자인 묶음 변경',
        tone: 'human',
        badge: '사람',
        detail: <p className="event-detail">{e.from ? `${e.from} → ` : ''}{e.design}</p>,
      };
    case 'revision_requested':
      return {
        title: e.stage === 'plan' ? '구성안 수정 요청' : '카드 수정 요청',
        tone: 'human',
        detail: (
          <div className="event-detail">
            <p className="chips">
              {e.types?.map((t) => (
                <span key={t} className="chip" title={t}>
                  {label(labels.revision_types, t)}
                </span>
              ))}
              {e.cards?.length ? <span className="muted"> {e.cards.join(', ')}번 카드</span> : null}
            </p>
            {e.memo && <p className="event-memo">“{e.memo}”</p>}
          </div>
        ),
      };
    default:
      return { title: e.event, tone: 'info' };
  }
}

/** 경과 시간: +0:34, +12:05, +1:02:10 */
function elapsed(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `+${h}:${String(m).padStart(2, '0')}:${sec}` : `+${m}:${sec}`;
}
