// S3 제작 진행 (웹 모드) — 담당 이규동
// 입력 확인 → 구성안 작업 → 구성안 검토(승인/수정 요청) → 문구·출력 작업 → 카드 검토(최종 승인/수정 요청) → 결과 보기 웹에 내보내기
// 작업이 도는 동안 2초마다 상태를 다시 불러옴. 실행은 이 컴퓨터의 Claude Code. 진행 표시는 서버가 준 실제 단계·시각만 씀
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import {
  JOB_LABEL, aiBgUrl, aiCardUrl, brandShotUrl, describeProgress, figmaEditedUrl, imageUrl, pngUrl, studioFetch, usePolling, useStudioStatus,
  type ProductDetail, type Report, type Revision, type RevisionType, type StudioJob,
} from '../../studio/api';
import { STEP_NAMES, errorInfo, formatAgo, formatElapsed, stepStates, workStatus, type StepState } from '../../studio/status';
import { useIndex } from '../../data/load';
import { buildZip } from '../../lib/zip';
import { downloadBlob } from '../../lib/download';
import { formatDateTime, formatPercent, label } from '../../data/format';
import type { Labels } from '../../data/types';
import { ErrorState, Loading } from '../../components/StateView';
import { Icon } from '../../components/Icon';
import { ClaudeStatus, StudioOff } from './StudioCommon';
import { PublishPanel } from './PublishPanel';
import './studio.css';

export function StudioProductPage() {
  const { status } = useStudioStatus();
  const { id = '' } = useParams();
  if (status === undefined) return <div className="page"><Loading /></div>;
  if (status === null) return <StudioOff />;
  // key: 다른 제품으로 넘어가면 화면을 새로 그림 (이전 제품 내용이 새 데이터가 올 때까지 남아 보이지 않게)
  return <StudioProduct key={id} id={id} revisionTypes={status.revision_types} />;
}

type RevisionDraft = { types: string[]; cards: number[]; memo: string };

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function StudioProduct({ id, revisionTypes }: { id: string; revisionTypes: RevisionType[] }) {
  const { status } = useStudioStatus();
  const index = useIndex();
  const labels = index.status === 'ready' ? index.data.labels : undefined;
  const { data, error, refresh, setData } = usePolling(
    () => studioFetch<ProductDetail>(`/products/${id}`),
    [id],
    (d) => (d && (d.actions.running || d.ai_card?.running || d.ai_bg?.running || d.figma?.push?.running) ? 2000 : null),
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // 수정 요청 폼: 열림 여부와 시작 값 (실패한 수정 요청을 다시 보낼 때 이전 내용으로 채움)
  const [revision, setRevision] = useState<RevisionDraft | null>(null);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([1]));
  const formRef = useRef<HTMLDivElement>(null);

  if (error && !data) return <div className="page"><BackLink /><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><Loading /></div>;
  const p = data;
  const a = p.actions;
  const steps = stepStates(p);
  const job = p.job;
  const failed = !a.running && job?.status === 'done' && job.ok === false ? job : null;
  const ws = failed && p.stage !== 'approved' ? { tone: 'failed', label: `${JOB_LABEL[failed.kind]} 실패` } : workStatus(p);
  const cardCount = p.cards?.cards.length ?? p.input.card_count ?? 0;

  const act = async (path: string, body?: unknown, method: 'POST' | 'PUT' | 'DELETE' = 'POST') => {
    setBusy(true);
    setActionError(null);
    try {
      const r = await studioFetch<Partial<ProductDetail> & { job?: StudioJob; product?: ProductDetail }>(path, { method, body });
      if (r.product) setData(r.product);
      else if (r.id) setData(r as ProductDetail);
      refresh();
      // 작업을 시작·예약한 요청이면 진행 상태가 보이는 맨 위로 (검토하던 위치에 머물면 진행이 안 보임)
      if (/\/(jobs|approve|revisions|render)$/.test(path) && method === 'POST') window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return true;
    } catch (e) {
      setActionError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const openRevision = (draft?: Revision | null) => {
    setRevision({ types: draft?.types ?? [], cards: draft?.cards ?? [], memo: draft?.memo ?? '' });
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };
  const revisionStage: 'plan' | 'final' | null = a.can_revise_plan ? 'plan' : a.can_revise_final ? 'final' : null;
  const revisionForm = revision && revisionStage && (
    <div ref={formRef}>
      <RevisionForm
        key={revisionStage}
        stage={revisionStage}
        initial={revision}
        revisionTypes={revisionTypes}
        cardCount={cardCount}
        busy={busy}
        onCancel={() => setRevision(null)}
        onSubmit={async (b) => {
          const ok = await act(`/products/${id}/revisions`, b);
          if (ok) setRevision(null);
          return ok;
        }}
      />
    </div>
  );

  return (
    <div className="page studio-detail">
      <BackLink />
      <header className="studio-detail-head">
        <div className="studio-detail-title">
          <h1 className="page-title">{p.name}</h1>
          <p className="page-desc">{[p.brand, p.id].filter(Boolean).join(' · ')}</p>
        </div>
        <span className={`pill pill-${ws.tone}`}>{ws.label}</span>
      </header>

      <Stepper states={steps} />

      {error && <p className="notice notice-warn" role="status">작업실과 연결이 잠시 끊겼어요. 마지막으로 받은 화면을 보여주고 있고, 5초마다 다시 연결해요.</p>}
      {status && (!status.claude.installed || status.claude.logged_in === false) && <ClaudeStatus info={status.claude} />}
      {actionError && <p className="notice notice-error" role="alert">{actionError}</p>}

      {/* 지금 상태: 대기 · 진행 · 실패 */}
      {job?.status === 'queued' && <QueuedPanel job={job} busy={busy} onCancel={() => act(`/products/${id}/queue`, undefined, 'DELETE')} />}
      {job?.status === 'running' && <JobProgress job={job} />}
      {failed && (
        <FailurePanel job={failed} detail={p} busy={busy}
          onRetry={(kind) => act(`/products/${id}/jobs`, { kind })}
          onRevise={() => openRevision(failed.revision)}
        />
      )}

      {/* 입력 단계 */}
      {p.stage === 'input' && <InputStage detail={p} busy={busy} hideStart={Boolean(failed) || a.running} onPlan={() => act(`/products/${id}/jobs`, { kind: 'plan' })} />}

      {/* 구성안 검토 */}
      {p.cards && p.stage === 'plan' && (
        <section className="section" aria-labelledby="plan-title">
          <div className="section-head">
            <h2 className="section-title" id="plan-title">구성안 검토</h2>
            <p className="muted">카드마다 담을 내용과 연결된 원문을 확인하세요. 승인하면 문구·카드 만들기가 바로 시작돼요.</p>
          </div>
          <JobNotes job={job} />
          <PlanReview detail={p} labels={labels} />
          <div className="fold-group">
            <DesignPanel detail={p} busy={busy} canChange={Boolean(a.can_select_design) && p.design?.source !== 'input'} onChange={(designId) => act(`/products/${id}/design`, { id: designId }, 'PUT')} />
            {(p.brand_page || p.cards?.brand_mood) && <BrandPanel detail={p} />}
            <ValidationPanel validation={p.validation} />
          </div>
          {revisionForm}
          {!a.running && (a.can_approve_plan || a.can_copy || a.can_revise_plan) && (
            <ReviewBar
              waitAhead={a.wait_ahead ?? 0}
              note={a.can_copy ? '구성안은 승인됐어요. 카드 만들기를 다시 시작할 수 있어요.' : '승인 전에는 다음 단계로 넘어가지 않아요.'}
            >
              {a.can_revise_plan && !revision && <button className="btn" type="button" disabled={busy} onClick={() => openRevision()}>구성안 수정 요청</button>}
              {a.can_approve_plan && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => act(`/products/${id}/approve`, { stage: 'plan' })}><Icon name="check" size={18} /> 구성안 승인하고 카드 만들기</button>}
              {a.can_copy && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => act(`/products/${id}/jobs`, { kind: 'copy' })}><Icon name="refresh" size={18} /> 카드 만들기 다시 시작</button>}
            </ReviewBar>
          )}
        </section>
      )}

      {/* 카드 검토 · 최종 카드 */}
      {p.cards && (p.stage === 'copy' || p.stage === 'approved') && (
        <section className="section" aria-labelledby="cards-title">
          <div className="section-head">
            <h2 className="section-title" id="cards-title">{p.stage === 'approved' ? '최종 카드' : '카드 검토'}</h2>
            <p className="muted">{p.stage === 'approved' ? '승인된 카드예요. 결과 보기 웹에 내보내면 PNG·ZIP으로 받을 수 있어요.' : '한 장씩 문구와 원문 근거를 확인하고, 고칠 카드만 수정 요청하세요.'}</p>
          </div>
          {p.stage === 'approved' && <ExportPanel detail={p} busy={busy} onExport={() => act(`/products/${id}/export`)} />}
          {p.stage === 'approved' && p.pngs.length > 0 && <PublishPanel detail={p} />}
          <JobNotes job={job} />
          {p.pngs.length === 0 && (
            <div className="notice notice-warn" role="status">
              <p>카드 이미지(PNG)가 이 컴퓨터에 없어요. 카드 이미지는 git에 올라가지 않아서 새 폴더나 다른 컴퓨터에서는 다시 만들어야 해요. 문구는 그대로 두고 이미지만 다시 만들어요.</p>
              <div className="action-bar">
                <button className="btn btn-primary" type="button" disabled={busy || !a.can_render} onClick={() => act(`/products/${id}/render`)}>카드 이미지 다시 만들기</button>
              </div>
            </div>
          )}
          <CardReview detail={p} labels={labels} onSeen={(n) => setSeen((s) => (s.has(n) ? s : new Set(s).add(n)))} />
          <div className="fold-group">
            {p.ai_card && <AiCardPanel detail={p} busy={busy || a.running} onMake={(card) => act(`/products/${id}/ai-card`, card ? { card } : {})} />}
            {p.ai_bg && <AiBgPanel detail={p} busy={busy || a.running} onMake={(card) => act(`/products/${id}/ai-bg`, card ? { card } : { stale: true })} onUpload={(card, data) => act(`/products/${id}/ai-bg/upload`, { card, data })} />}
            {p.figma && p.pngs.length > 0 && (
              <FigmaPanel
                detail={p}
                busy={busy || a.running}
                onPrepare={() => {
                  // 팝업 차단을 피하려고 클릭하자마자 피그마 파일을 엶 (준비는 그 뒤에 진행)
                  if (p.figma?.file_url) window.open(p.figma.file_url, '_blank', 'noopener');
                  act(`/products/${id}/figma`);
                }}
              />
            )}
            <DesignPanel detail={p} busy={busy} canChange={false} onChange={() => undefined} />
            {(p.brand_page || p.cards?.brand_mood) && <BrandPanel detail={p} />}
            <ValidationPanel validation={p.validation} />
          </div>
          {revisionForm}
          {p.stage === 'copy' && !a.running && (
            <ReviewBar
              waitAhead={a.wait_ahead ?? 0}
              note={p.ai_card?.running || p.ai_bg?.running ? 'AI 이미지를 만드는 중이라 끝난 뒤 승인할 수 있어요.' : `${Math.min(seen.size, cardCount)}/${cardCount}장 확인함 · 승인하면 카드가 확정돼요.`}
            >
              {a.can_revise_final && !revision && <button className="btn" type="button" disabled={busy} onClick={() => openRevision()}>카드 수정 요청</button>}
              <button className="btn btn-primary" type="button" disabled={!a.can_approve_final || busy} onClick={() => act(`/products/${id}/approve`, { stage: 'final' })}><Icon name="check" size={18} /> 최종 승인</button>
            </ReviewBar>
          )}
        </section>
      )}

      <EventLog events={p.events} labels={labels} />
    </div>
  );
}

function BackLink() {
  return <Link to="/studio" className="back-link"><Icon name="back" size={16} /> 작업실</Link>;
}

// ── 단계 표시: 입력 → 구성안 검토 → 카드 만들기 → 카드 검토 → 승인·내보내기
const STEP_STATE_TEXT: Record<StepState, string> = { done: '완료', current: '지금 할 일', running: '진행 중', queued: '대기 중', failed: '실패', todo: '' };
function Stepper({ states }: { states: StepState[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const live = states.findIndex((s) => s === 'current' || s === 'running' || s === 'queued' || s === 'failed');
  // 좁은 화면에서 가로로 넘기는 단계 표시: 지금 단계가 보이게 맞춤 (세로 스크롤은 건드리지 않음)
  useEffect(() => {
    const list = ref.current;
    const item = list?.children[live] as HTMLElement | undefined;
    if (list && item && list.scrollWidth > list.clientWidth) list.scrollLeft = item.offsetLeft - list.offsetLeft - 16;
  }, [live]);
  return (
    <ol className="stepper" aria-label="제작 단계" ref={ref}>
      {STEP_NAMES.map((name, i) => {
        const s = states[i] ?? 'todo';
        const live = s === 'current' || s === 'running' || s === 'queued' || s === 'failed';
        return (
          <li key={name} className={`step step-${s}`} aria-current={live ? 'step' : undefined}>
            <span className="step-dot" aria-hidden="true">
              {s === 'done' ? <Icon name="check" size={14} /> : s === 'failed' ? <Icon name="x" size={14} /> : s === 'running' ? <span className="spinner spinner-xs" /> : i + 1}
            </span>
            <span className="step-text">
              <span className="step-name">{name}</span>
              {STEP_STATE_TEXT[s] && <span className="step-state">{STEP_STATE_TEXT[s]}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// 검토 단계의 결정 막대: 화면 아래에 붙어 있어 긴 검토 중에도 승인·수정 요청이 보임
function ReviewBar({ children, note, waitAhead }: { children: ReactNode; note: string; waitAhead: number }) {
  return (
    <div className="review-bar" role="region" aria-label="검토 결정">
      <p className="review-bar-note">
        {note}
        {waitAhead > 0 && <span className="review-bar-wait"> 다른 제품 작업이 있어 앞 작업 {waitAhead}개가 끝난 뒤 자동으로 시작돼요.</span>}
      </p>
      <div className="review-bar-actions">{children}</div>
    </div>
  );
}

// ── 작업 대기·진행·실패
function QueuedPanel({ job, busy, onCancel }: { job: StudioJob; busy: boolean; onCancel: () => void }) {
  const now = useNow(true);
  const waited = job.queued_at ? (now - Date.parse(job.queued_at)) / 1000 : null;
  return (
    <section className="job-card tone-queued" aria-live="polite" aria-labelledby="job-title">
      <div className="job-card-head">
        <span className="job-card-icon" aria-hidden="true"><Icon name="clock" size={20} /></span>
        <div className="job-card-title">
          <h2 id="job-title">{JOB_LABEL[job.kind]} 대기 중 · {job.position}번째</h2>
          <p className="muted">
            {job.ahead ? <>지금 <Link to={`/studio/${job.ahead.product_id}`}>{job.ahead.name}</Link>의 {JOB_LABEL[job.ahead.kind]}이 돌고 있어요. </> : null}
            앞 작업이 끝나면 자동으로 시작해요. 이 화면을 닫아도 돼요.
          </p>
        </div>
        {waited !== null && <span className="job-card-time num">대기 {formatElapsed(waited)}</span>}
      </div>
      {job.revision && <p className="job-memo"><span className="muted">수정 요청</span> {job.revision.memo}</p>}
      <div className="action-bar">
        <button className="btn btn-small" type="button" disabled={busy} onClick={onCancel}>대기 취소</button>
      </div>
    </section>
  );
}

function JobProgress({ job }: { job: StudioJob }) {
  const now = useNow(true);
  const elapsed = (now - Date.parse(job.started_at)) / 1000;
  const steps = job.progress.filter((x) => x.type !== 'text');
  const lastText = [...job.progress].reverse().find((x) => x.type === 'text');
  const lastTs = job.progress.length ? Date.parse(job.progress[job.progress.length - 1]!.ts) : Date.parse(job.started_at);
  const quiet = (now - lastTs) / 1000;
  const shown = steps.slice(-6);
  const hidden = steps.length - shown.length;
  return (
    <section className="job-card tone-running" aria-labelledby="job-title">
      <div className="job-card-head">
        <span className="job-card-icon" aria-hidden="true"><span className="spinner spinner-sm" /></span>
        <div className="job-card-title">
          <h2 id="job-title">{JOB_LABEL[job.kind]} 진행 중</h2>
          <p className="sr-only" role="status">{JOB_LABEL[job.kind]} 진행 중{shown.length ? ` · 지금: ${describeProgress(shown[shown.length - 1]!)}` : ''}</p>
          <p className="muted">이 컴퓨터의 Claude Code가 작업하고 있어요. 화면을 닫아도 계속되고, 끝나면 여기서 결과를 확인할 수 있어요.</p>
        </div>
        <dl className="job-card-time">
          <div><dt>경과</dt><dd className="num">{formatElapsed(elapsed)}</dd></div>
          <div><dt>마지막 활동</dt><dd className="num">{formatAgo(quiet)}</dd></div>
        </dl>
      </div>
      {job.revision && <p className="job-memo"><span className="muted">수정 요청</span> {job.revision.memo}</p>}
      {steps.length > 0 ? (
        <ol className="job-timeline" aria-label="지금까지 한 일">
          {hidden > 0 && <li className="job-timeline-more muted">앞선 단계 {hidden}개</li>}
          {shown.map((s, i) => {
            const last = i === shown.length - 1;
            return (
              <li key={`${s.ts}-${i}`} className={last ? 'is-now' : undefined}>
                <span className="job-timeline-dot" aria-hidden="true">{last ? <span className="spinner spinner-xs" /> : <Icon name="check" size={12} />}</span>
                <span>{describeProgress(s)}</span>
                {last && <span className="sr-only"> (지금 하는 일)</span>}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted job-wait">Claude Code를 시작하고 있어요.</p>
      )}
      {lastText?.text && <p className="job-say"><span className="muted">Claude</span> “{lastText.text}”</p>}
    </section>
  );
}

function FailurePanel({ job, detail, busy, onRetry, onRevise }: { job: StudioJob; detail: ProductDetail; busy: boolean; onRetry: (kind: 'plan' | 'copy') => void; onRevise: () => void }) {
  const a = detail.actions;
  const info = errorInfo(job.error_code);
  const finished = job.finished_at ?? job.started_at;
  const sec = (Date.parse(finished) - Date.parse(job.started_at)) / 1000;
  return (
    <section className="job-card tone-failed" role="alert" aria-labelledby="fail-title">
      <div className="job-card-head">
        <span className="job-card-icon" aria-hidden="true"><Icon name="alert" size={20} /></span>
        <div className="job-card-title">
          <p className="job-kind">{JOB_LABEL[job.kind]} · 끝나지 못했어요</p>
          <h2 id="fail-title">{info.title}</h2>
          <p>{info.hint}</p>
        </div>
        <span className="job-card-time num">{formatDateTime(finished)} · {formatElapsed(sec)}</span>
      </div>
      <dl className="fail-facts">
        {job.error_code && <div><dt>오류 코드</dt><dd><code>{job.error_code}</code></dd></div>}
        {job.crash && <div><dt>실행 오류</dt><dd>{job.crash}</dd></div>}
        {job.verify && !job.verify.ok && job.verify.reasons.length > 0 && <div><dt>재검증</dt><dd>{job.verify.reasons.join(', ')}</dd></div>}
        {job.revision && <div><dt>수정 요청</dt><dd>{job.revision.memo}</dd></div>}
      </dl>
      {job.report && (job.report.오류.length > 0 || job.report.알림.length > 0) && (
        <ul className="fail-report">
          {job.report.오류.map((e) => <li key={`e-${e}`} className="is-error">{e}</li>)}
          {job.report.알림.filter((n) => n !== '없음').map((n) => <li key={`n-${n}`}>{n}</li>)}
        </ul>
      )}
      <p className="muted fail-safe">이번 작업 결과는 반영하지 않았어요. 기존 입력·구성안·카드는 그대로예요.</p>
      <div className="action-bar">
        {job.kind === 'plan' && a.can_plan && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => onRetry('plan')}><Icon name="refresh" size={18} /> 구성안 다시 만들기</button>}
        {job.kind === 'copy' && a.can_copy && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => onRetry('copy')}><Icon name="refresh" size={18} /> 카드 만들기 다시 시작</button>}
        {job.kind === 'revise' && (a.can_revise_plan || a.can_revise_final) && <button className="btn btn-primary" type="button" disabled={busy} onClick={onRevise}><Icon name="edit" size={18} /> 수정 요청 다시 보내기</button>}
        {a.can_edit_input && <Link className="btn" to={`/studio/${detail.id}/edit`}><Icon name="edit" size={18} /> 입력 고치기</Link>}
        {(a.wait_ahead ?? 0) > 0 && <span className="muted">다시 시작하면 앞 작업 {a.wait_ahead}개가 끝난 뒤 시작해요.</span>}
      </div>
    </section>
  );
}

// 끝난 작업이 남긴 알림 ([경고]·[주의]·[참고]) — 승인 전에 사람이 읽어야 해서 검토 영역 위에 둠
function JobNotes({ job }: { job: StudioJob | null }) {
  if (!job || job.status !== 'done' || !job.ok || !job.report) return null;
  const notes = job.report.알림.filter((n) => n && n !== '없음');
  if (!notes.length) return null;
  return (
    <div className="job-notes" role="note">
      <p className="job-notes-title"><Icon name="alert" size={16} /> 마지막 {JOB_LABEL[job.kind]}이 남긴 알림</p>
      <ul>{notes.map((n) => <li key={n} className={/\[경고\]/.test(n) ? 'is-warn' : undefined}>{n}</li>)}</ul>
    </div>
  );
}

// ── 입력 단계: 입력 확인 결과와 자료·이미지 상태, 구성안 만들기
function InputStage({ detail, busy, hideStart, onPlan }: { detail: ProductDetail; busy: boolean; hideStart: boolean; onPlan: () => void }) {
  const a = detail.actions;
  const v = detail.input.values;
  const text = (k: string) => { const x = v[k]; return Array.isArray(x) ? x.join(', ') : x ?? ''; };
  const errors = detail.check.errors.length;
  return (
    <section className="section" aria-labelledby="input-title">
      <div className="section-head">
        <h2 className="section-title" id="input-title">입력 확인</h2>
        <p className="muted">저장한 자료가 제작 조건을 갖췄는지 확인했어요. 문제가 없으면 구성안을 만들 수 있어요.</p>
      </div>
      <div className="input-overview">
        <div className="panel">
          <CheckPanel check={detail.check} />
          <dl className="input-facts">
            <div><dt>제품명</dt><dd>{text('제품명') || '—'}</dd></div>
            <div><dt>콘텐츠 목적</dt><dd>{text('콘텐츠 목적') || '—'}</dd></div>
            <div><dt>카드 수</dt><dd className="num">{detail.input.card_count ?? '—'}</dd></div>
            <div><dt>무드</dt><dd>{text('무드') || '기본'}</dd></div>
          </dl>
        </div>
        <div className="panel">
          <h3 className="panel-title">이미지 {detail.input.images.length}장</h3>
          {detail.input.images.length ? (
            <ul className="input-images">
              {detail.input.images.map((img) => (
                <li key={img.file}>
                  <img src={imageUrl(detail.id, img.file)} alt="" width={64} height={64} loading="lazy" />
                  <span className="keep"><strong>{img.kind || '제품'}</strong> · {img.desc || img.file}<span className={`usage usage-${img.usage === '가능' ? 'ok' : 'no'}`}>{img.usage}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">등록된 이미지가 없어요.</p>}
        </div>
      </div>
      {!hideStart && (
        <ReviewBar waitAhead={a.wait_ahead ?? 0} note={errors ? `입력 확인 오류 ${errors}개를 먼저 고쳐 주세요.` : '구성안 작업은 보통 몇 분 걸려요. 끝나면 검토를 요청해요.'}>
          {a.can_edit_input && <Link className="btn" to={`/studio/${detail.id}/edit`}><Icon name="edit" size={18} /> 입력 고치기</Link>}
          <button className="btn btn-primary" type="button" disabled={!a.can_plan || busy} onClick={onPlan}>구성안 만들기</button>
        </ReviewBar>
      )}
    </section>
  );
}

function CheckPanel({ check }: { check: Report }) {
  return (
    <div className="check-panel">
      {check.errors.length === 0 && check.warnings.length === 0 && <p className="ok-text"><Icon name="check" size={16} /> 필수 항목·이미지·지시문 검사를 모두 통과했어요.</p>}
      <IssueList items={check.errors} tone="error" />
      <IssueList items={check.warnings} tone="warn" />
    </div>
  );
}

function ValidationPanel({ validation }: { validation: ProductDetail['validation'] }) {
  if (!validation) return null;
  const q = validation.quality;
  const e = validation.errors.length, c = validation.cautions.length, w = validation.warnings.length;
  return (
    <details className="fold" open={e > 0}>
      <summary>
        <span className="fold-title">검증 결과</span>
        <span className="fold-meta">
          <span className={`pill ${e ? 'pill-failed' : 'pill-done'}`}>{e ? `오류 ${e}` : '오류 없음'}</span>
          {c > 0 && <span className="pill pill-queued">[주의] {c}</span>}
          {w > 0 && <span className="pill">참고 {w}</span>}
        </span>
      </summary>
      <div className="fold-body">
        {q && <p className="muted">원문 커버리지 {formatPercent(q.coverage)} · 근거 연결률 {formatPercent(q.evidence_rate)} · [주의] {q.caution ? q.caution.total : 0}개</p>}
        {e === 0 && <p className="ok-text"><Icon name="check" size={16} /> 검증 오류 없음</p>}
        <IssueList items={validation.errors} tone="error" />
        <IssueList items={validation.cautions} tone="warn" prefix="[주의]" />
        <IssueList items={validation.warnings} tone="info" />
      </div>
    </details>
  );
}

function IssueList({ items, tone, prefix }: { items: { code?: string; where: string; message: string }[]; tone: 'error' | 'warn' | 'info'; prefix?: string }) {
  if (!items.length) return null;
  return (
    <ul className={`issues issues-${tone}`}>
      {items.map((it, i) => (
        <li key={i}>
          {prefix ? <span className="issue-tag">{prefix}</span> : it.code ? <code>{it.code}</code> : null} <span className="muted">{it.where}</span> {it.message}
        </li>
      ))}
    </ul>
  );
}

// ── 디자인 묶음 (#74): 지금 쓰는 묶음·정한 곳·이유, 구성안 승인 전에는 다른 묶음으로 바꾸기
const DESIGN_SOURCE: Record<string, string> = { input: '입력에서 직접 고름', default: '기본값' };
const NEEDS_TEXT: Record<string, string> = { required: '필수', optional: '있으면 좋음', none: '안 씀' };
function DesignPanel({ detail, busy, canChange, onChange }: { detail: ProductDetail; busy: boolean; canChange: boolean; onChange: (id: string) => void }) {
  const d = detail.design;
  const [pick, setPick] = useState(d?.id ?? '');
  if (!d) return null;
  const current = d.catalog.find((x) => x.id === d.id);
  const by = d.source === 'cards' ? (d.selected?.selected_by === 'human' ? '사람이 고름' : 'Claude 추천') : DESIGN_SOURCE[d.source];
  const picked = d.catalog.find((x) => x.id === pick);
  return (
    <details className="fold">
      <summary>
        <span className="fold-title">디자인 묶음</span>
        <span className="fold-meta"><strong>{current?.name ?? d.id}</strong><span className="muted">{by}{d.auto ? ' · 무드 자동 추천' : ''}</span></span>
      </summary>
      <div className="fold-body">
        {current && <p>{current.summary} <span className="muted">v{current.version}</span></p>}
        {d.source === 'cards' && d.selected && <p className="muted">이유: “{d.selected.reason}”</p>}
        {canChange && (
          <div className="design-change">
            <label>
              <span className="field-label">다른 묶음으로 바꾸기</span>
              <select value={pick} disabled={busy} onChange={(e) => setPick(e.target.value)}>
                {d.catalog.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <button className="btn" type="button" disabled={busy || pick === d.id} onClick={() => onChange(pick)}>바꾸기</button>
            {picked && pick !== d.id && <p className="muted">{picked.summary} · 어울림: {picked.fits.join(' / ')} · 제품 사진 {NEEDS_TEXT[picked.needs.product] ?? picked.needs.product}</p>}
          </div>
        )}
      </div>
    </details>
  );
}

// ── 구성안 검토: 왼쪽 카드 목록, 오른쪽 고른 카드의 내용과 원문 근거
function PlanReview({ detail, labels }: { detail: ProductDetail; labels?: Labels }) {
  const c = detail.cards!;
  const [selected, setSelected] = useState(c.cards[0]?.no ?? 1);
  const card = c.cards.find((x) => x.no === selected) ?? c.cards[0];
  const quotes = new Map(c.sources.map((s) => [s.id, s]));
  const used = new Set(c.cards.flatMap((x) => x.evidence ?? []));
  return (
    <div className="plan-review">
      <div className="core-card">
        <p className="core-label">핵심 메시지</p>
        <p className="core-message keep">{c.analysis.core_message}</p>
        {c.analysis.core_evidence?.length ? <p className="chips">{c.analysis.core_evidence.map((sid) => <span key={sid} className="chip" title={quotes.get(sid as never)?.quote}>{sid}</span>)}</p> : null}
      </div>
      <div className="plan-split">
        <ol className="plan-list" aria-label="카드 구성">
          {c.cards.map((x) => (
            <li key={x.no}>
              <button type="button" className="plan-item" aria-pressed={x.no === card?.no} onClick={() => setSelected(x.no)}>
                <span className="plan-no num">{x.no}</span>
                <span className="plan-item-body">
                  <span className="plan-role">{label(labels?.roles, x.role)} <span className="muted">· {label(labels?.templates, x.template)}</span></span>
                  <span className="plan-intent keep">{x.intent}</span>
                </span>
                <span className="plan-ev muted num">{x.evidence?.length ? `근거 ${x.evidence.length}` : '근거 없음'}</span>
              </button>
            </li>
          ))}
        </ol>
        {card && (
          <div className="plan-detail" aria-live="polite">
            <p className="core-label">{card.no}번 카드 · {label(labels?.roles, card.role)}</p>
            <p className="plan-detail-intent keep">{card.intent}</p>
            <h3 className="panel-subtitle">연결된 원문</h3>
            {card.evidence?.length ? (
              <ul className="quote-list">
                {card.evidence.map((sid) => {
                  const s = quotes.get(sid);
                  return <li key={sid}><span className="chip">{sid}</span><span className="keep">{s ? <>“{s.quote}”<span className="muted"> · {s.section}</span></> : '원문을 찾을 수 없어요'}</span></li>;
                })}
              </ul>
            ) : (
              <p className="muted">연결된 원문 인용이 없어요. {card.role === 'cover' || card.role === 'closing' ? '표지·마무리 카드는 근거 없이도 돼요.' : '내용이 원문에 있는지 확인해 주세요.'}</p>
            )}
          </div>
        )}
      </div>
      <details className="fold">
        <summary><span className="fold-title">전체 원문 인용 {c.sources.length}개</span><span className="fold-meta muted">카드에 쓰인 {c.sources.filter((s) => used.has(s.id)).length}개</span></summary>
        <ul className="quote-list fold-body">
          {c.sources.map((s) => <li key={s.id} className={used.has(s.id) ? undefined : 'is-unused'}><span className="chip">{s.id}</span><span className="keep">“{s.quote}”<span className="muted"> · {s.section}{used.has(s.id) ? '' : ' · 카드에 안 쓰임'}</span></span></li>)}
        </ul>
      </details>
    </div>
  );
}

// ── 카드 검토: 필름 스트립 + 큰 미리보기 + 문구·근거·이 카드의 검증 결과
const COPY_KEY: Record<string, string> = { badge: '배지', title: '제목', subtitle: '부제', caption: '설명', body: '본문', items: '항목', note: '참고', image: '이미지' };
function CardReview({ detail, labels, onSeen }: { detail: ProductDetail; labels?: Labels; onSeen: (no: number) => void }) {
  const c = detail.cards!;
  const [selected, setSelected] = useState(c.cards[0]?.no ?? 1);
  const [view, setView] = useState<'focus' | 'flow'>('focus');
  const idx = Math.max(0, c.cards.findIndex((x) => x.no === selected));
  const card = c.cards[idx];
  const pick = (no: number) => { setSelected(no); onSeen(no); };
  if (!card) return <p className="muted">검토할 카드가 없어요.</p>;
  const fileOf = (no: number) => `card-${String(no).padStart(2, '0')}.png`;
  const pngOf = (no: number) => detail.pngs.find((x) => x.file === fileOf(no));
  const png = pngOf(card.no);
  const evidence = c.sources.filter((s) => card.evidence?.includes(s.id));
  const where = new RegExp(`^${card.no}번 카드`);
  const issues = detail.validation ? [...detail.validation.errors.map((x) => ({ ...x, tone: 'error' })), ...detail.validation.cautions.map((x) => ({ ...x, tone: 'warn' }))].filter((x) => where.test(x.where)) : [];
  const aiApplied = detail.ai_card?.applied.includes(card.no);
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'ArrowRight' && idx < c.cards.length - 1) { e.preventDefault(); pick(c.cards[idx + 1]!.no); }
    if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); pick(c.cards[idx - 1]!.no); }
  };
  return (
    <div className="card-review-area" onKeyDown={onKey}>
      <div className="review-toolbar">
        <div className="filmstrip" role="group" aria-label="검토할 카드">
          {c.cards.map((x) => {
            const t = pngOf(x.no);
            return (
              <button key={x.no} type="button" className="film" aria-label={`${x.no}번 카드`} aria-pressed={view === 'focus' && x.no === card.no} onClick={() => { pick(x.no); setView('focus'); }}>
                {t ? <img src={pngUrl(detail.id, t.file, t.v)} alt="" width={1080} height={1080} loading="lazy" /> : <span className="film-empty" />}
                <span className="film-no num" aria-hidden="true">{x.no}</span>
              </button>
            );
          })}
        </div>
        <div className="view-toggle" role="group" aria-label="보기 방식">
          <button type="button" aria-pressed={view === 'focus'} onClick={() => setView('focus')}><Icon name="image" size={16} /> 한 장씩</button>
          <button type="button" aria-pressed={view === 'flow'} onClick={() => { setView('flow'); c.cards.forEach((x) => onSeen(x.no)); }}><Icon name="grid" size={16} /> 전체 흐름</button>
        </div>
      </div>

      {view === 'flow' ? (
        <ol className="flow-grid" aria-label="카드 전체 흐름">
          {c.cards.map((x) => {
            const t = pngOf(x.no);
            return (
              <li key={x.no}>
                <button type="button" className="flow-item" onClick={() => { pick(x.no); setView('focus'); }} aria-label={`${x.no}번 카드 자세히 보기`}>
                  {t ? <img src={pngUrl(detail.id, t.file, t.v)} alt="" width={1080} height={1080} loading="lazy" /> : <span className="card-missing">이미지 없음</span>}
                  <span className="flow-caption"><span className="num">{x.no}</span> {label(labels?.roles, x.role)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="review-focus">
          <div className="review-stage">
            {png ? (
              <a href={pngUrl(detail.id, png.file, png.v)} target="_blank" rel="noreferrer" className="review-image" aria-label={`${card.no}번 카드 원본 새 창에서 보기`}>
                <img src={pngUrl(detail.id, png.file, png.v)} alt={`${card.no}번 카드 미리보기`} width={1080} height={1080} />
              </a>
            ) : <div className="card-missing">아직 출력된 이미지가 없어요</div>}
            <div className="review-nav">
              <button type="button" className="btn btn-small" disabled={idx === 0} onClick={() => pick(c.cards[idx - 1]!.no)} aria-label="이전 카드"><Icon name="left" size={16} /></button>
              <span className="num muted">{card.no} / {c.cards.length}</span>
              <button type="button" className="btn btn-small" disabled={idx >= c.cards.length - 1} onClick={() => pick(c.cards[idx + 1]!.no)} aria-label="다음 카드"><Icon name="right" size={16} /></button>
            </div>
          </div>
          <div className="review-copy">
            <p className="core-label">{card.no}번 카드 · {label(labels?.roles, card.role)} <span className="muted">· {label(labels?.templates, card.template)}</span></p>
            {aiApplied && <p className="notice notice-warn">[주의] 이 카드는 AI가 이미지로 그린 문구예요. 아래 승인 문구와 같은지 확인해 주세요.</p>}
            {issues.length > 0 && <ul className="issues card-issues">{issues.map((x, i) => <li key={i} className={`issues-${x.tone}`}>{x.code ? <code>{x.code}</code> : <span className="issue-tag">[주의]</span>} {x.message}</li>)}</ul>}
            <dl className="copy-lines">
              {card.copy && Object.entries(card.copy).filter(([k]) => k !== 'image').map(([k, val]) => (
                <div className="copy-line" key={k}><dt>{COPY_KEY[k] ?? k}</dt><dd className="keep">{Array.isArray(val) ? val.join(' / ') : String(val)}</dd></div>
              ))}
            </dl>
            <div className="review-evidence">
              <strong>이 카드의 원문 근거</strong>
              {evidence.length ? <ul className="quote-list">{evidence.map((s) => <li key={s.id}><span className="chip">{s.id}</span><span className="keep">{s.quote}</span></li>)}</ul> : <p className="muted">이 카드에 연결된 원문 인용이 없어요. 내용과 제품 정보를 함께 확인해 주세요.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 수정 요청 (실패해도 입력한 내용은 그대로 둠 — 성공 응답 뒤에만 닫힘)
function RevisionForm({ stage, initial, revisionTypes, cardCount, busy, onSubmit, onCancel }: {
  stage: 'plan' | 'final';
  initial: RevisionDraft;
  revisionTypes: RevisionType[];
  cardCount: number;
  busy: boolean;
  onSubmit: (body: { stage: string; types: string[]; cards: number[]; memo: string }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [types, setTypes] = useState<string[]>(initial.types);
  const [cards, setCards] = useState<number[]>(initial.cards);
  const [memo, setMemo] = useState(initial.memo);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit({ stage, types, cards, memo });
  };
  const title = stage === 'plan' ? '구성안 수정 요청' : '카드 수정 요청';
  return (
    <form className="panel revision-form" onSubmit={submit} aria-labelledby="revision-title">
      <h3 className="panel-title" id="revision-title">{title}</h3>
      <p className="muted">요청한 범위만 고치고 다시 검증해요. {stage === 'final' ? '고른 카드만 다시 출력하고 나머지 카드는 그대로예요.' : ''}</p>
      {stage === 'final' && (
        <fieldset>
          <legend>고칠 카드 <span className="muted">안 고르면 전체</span></legend>
          <div className="check-row">
            {Array.from({ length: cardCount }, (_, i) => i + 1).map((n) => (
              <label key={n} className="check"><input type="checkbox" checked={cards.includes(n)} onChange={() => setCards((c) => toggle(c, n))} />{n}번</label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend>수정 유형 <span className="muted">하나 이상</span></legend>
        <div className="check-row">
          {revisionTypes.map((t) => (
            <label key={t.code} className="check" title={t.example}><input type="checkbox" checked={types.includes(t.code)} onChange={() => setTypes((x) => toggle(x, t.code))} />{t.label}</label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span className="field-label">요청 내용</span>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={500} required placeholder="예: 3번 카드 제목을 더 짧게" />
        <span className="field-guide">원문에 없는 효능·수치를 넣어 달라는 요청은 반영되지 않아요. <span className="num">{memo.length}/500</span></span>
      </label>
      <div className="action-bar">
        <button type="submit" className="btn btn-primary" disabled={busy || !types.length || !memo.trim()}>{busy ? '보내는 중…' : '수정 요청 보내기'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>닫기</button>
        {(!types.length || !memo.trim()) && <span className="muted">{!types.length ? '수정 유형을 골라 주세요.' : '요청 내용을 적어 주세요.'}</span>}
      </div>
    </form>
  );
}

// ── 브랜드 무드: 상세페이지 스냅샷(구성안 작업 전 자동)과 구성안 작업이 정한 brand_mood(색·분위기·배경 장면·근거)
function BrandPanel({ detail }: { detail: ProductDetail }) {
  const b = detail.brand_page;
  const snap = b?.snapshot;
  const mood = detail.cards?.brand_mood;
  return (
    <details className="fold" open={Boolean(snap?.warnings.length)}>
      <summary>
        <span className="fold-title">브랜드 무드</span>
        <span className="fold-meta">
          {mood ? <span className="brand-swatches" aria-hidden="true">{Object.values(mood.palette).slice(0, 5).map((hex) => <i key={hex} style={{ background: hex }} />)}</span> : null}
          <span className="muted">{mood ? (mood.source === 'snapshot' ? '브랜드 페이지 기준' : '제품 사진 기준') : '구성안에서 정해요'}</span>
        </span>
      </summary>
      <div className="fold-body">
        {b && (
          <p className="muted keep">
            브랜드 페이지: <a href={b.url} target="_blank" rel="noreferrer noopener">{b.url}</a>
            {!b.url_ok && ' · 쓸 수 없는 주소라 제품 사진으로 무드를 정해요'}
            {b.url_ok && !snap && ' · 구성안 작업을 시작하면 페이지를 한 번 캡처해요'}
            {snap && (snap.ok ? ` · ${formatDateTime(snap.fetched_at)} 캡처` : ` · 캡처 실패: ${snap.error ?? ''} (제품 사진으로 무드)`)}
          </p>
        )}
        {snap?.warnings.map((w) => <p className="notice notice-warn" key={w}>[경고] {w}</p>)}
        {snap?.ok && snap.shots.length > 0 && (
          <div className="brand-shots">
            {snap.shots.slice(0, 4).map((s) => <img key={s.file} src={brandShotUrl(detail.id, s.file, s.v)} alt={`브랜드 페이지 화면 ${s.file}`} loading="lazy" />)}
          </div>
        )}
        {mood ? (
          <>
            <ul className="brand-palette" aria-label="브랜드 색">
              {Object.entries(mood.palette).map(([k, hex]) => <li key={k}><i style={{ background: hex }} aria-hidden="true" />{k} <code>{hex}</code></li>)}
            </ul>
            <p className="keep">{mood.summary}</p>
            <p className="muted keep">말투 {mood.tone} · 사진 {mood.photo_style}</p>
            <p className="muted keep">배경 장면(GPT에 보냄, 글자·제품 없음): {mood.scene}</p>
            <details><summary>근거 {mood.evidence.length}개</summary><ul>{mood.evidence.map((e) => <li key={e}>{e}</li>)}</ul></details>
          </>
        ) : (
          <p className="muted">구성안 작업에서 Claude가 브랜드 색·분위기·배경 장면을 정해요.</p>
        )}
      </div>
    </details>
  );
}

// AI 배경 (무드 '브랜드', A안): 문구·출력 작업이 끝나면 카드마다 GPT가 글자·제품 없는 배경을 만들고, 출력이 그 위에 실제 제품 사진과 문구를 얹음
function AiBgPanel({ detail, busy, onMake, onUpload }: { detail: ProductDetail; busy: boolean; onMake: (card?: number) => void; onUpload: (card: number, data: string) => void }) {
  const bg = detail.ai_bg!;
  const [copied, setCopied] = useState<number | null>(null);
  const copy = async (no: number, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(no); } catch { setCopied(null); } };
  const upload = (no: number, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onUpload(no, String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  };
  const can = Boolean(detail.actions.can_ai_bg) && !busy && bg.has_mood;
  const png = (no: number) => detail.pngs.find((x) => x.file === `card-${String(no).padStart(2, '0')}.png`);
  const failedRun = bg.run?.ok === false;
  return (
    <details className="fold" open={bg.running || failedRun || bg.stale.length > 0}>
      <summary>
        <span className="fold-title">AI 배경 · {bg.cards.length}장</span>
        <span className="fold-meta">
          {bg.running ? <span className="pill pill-running">만드는 중</span> : failedRun ? <span className="pill pill-failed">실패</span> : bg.stale.length ? <span className="pill pill-queued">{bg.stale.join('·')}번 필요</span> : <span className="pill pill-done">준비됨</span>}
        </span>
      </summary>
      <div className="fold-body">
        <p className="muted">카드마다 GPT 이미지({bg.backend === 'openai' ? 'OpenAI 이미지 API, 장당 요금' : '내 컴퓨터의 Codex, ChatGPT 요금제 사용량'})가 브랜드 무드에 맞는 <strong>배경만</strong> 만들어요. 카드 글자와 제품 사진은 코드가 얹어서 문구 검증을 그대로 거쳐요. 무드가 그대로면 문구를 고쳐도 배경은 다시 만들지 않아요.</p>
        <p className="muted">자동 생성이 사용량 한도에 걸리면: 카드마다 <strong>요청문 복사</strong> → <a href="https://chatgpt.com/" target="_blank" rel="noreferrer noopener">ChatGPT 채팅</a>에 붙여 넣기 → 받은 이미지를 <strong>이미지 올리기</strong>로 넣으면 같은 방식으로 카드에 들어가요.</p>
        {bg.running && <p className="notice notice-info" role="status">AI 배경을 만드는 중이에요 ({bg.run?.card ? `${bg.run.card}번` : '전체'}, 한 장에 1~2분). 끝나면 카드를 다시 출력해요.</p>}
        {bg.run && (bg.running || failedRun) && bg.run.progress.length > 0 && <pre className={`ai-card-log${failedRun ? ' is-error' : ''}`}>{bg.run.progress.join('\n')}</pre>}
        {!bg.running && bg.stale.length > 0 && (
          <div className="action-bar">
            <button className="btn btn-primary" type="button" disabled={!can} onClick={() => onMake()}>{bg.stale.join('·')}번 AI 배경 만들기</button>
            <span className="muted">{bg.has_mood ? '아직 없거나 무드가 바뀐 카드예요.' : '구성안에서 정한 브랜드 무드가 없어요.'}</span>
          </div>
        )}
        {bg.cards.some((c) => c.ok) && <p className="notice notice-warn">[참고] 배경에 글자·로고가 섞였는지 눈으로 확인해 주세요. 섞였으면 그 카드만 다시 만들어요.</p>}
        <div className="ai-card-grid">
          {bg.cards.map((c) => {
            const card = png(c.no);
            const last = c.tries[c.tries.length - 1];
            return (
              <div className="ai-card-item" key={c.no}>
                <div className="ai-card-pair">
                  <figure>
                    {c.ok && c.file ? <img src={aiBgUrl(detail.id, c.file, c.v)} alt={`${c.no}번 AI 배경`} loading="lazy" /> : <div className="ai-card-empty">{c.tries.length ? '만들지 못했어요' : '아직 없음'}</div>}
                    <figcaption>AI 배경{c.ok && !c.current ? ' · 무드가 바뀜' : ''}</figcaption>
                  </figure>
                  <figure>
                    {card ? <img src={pngUrl(detail.id, card.file, card.v)} alt={`${c.no}번 최종 카드`} loading="lazy" /> : <div className="ai-card-empty">카드</div>}
                    <figcaption>최종 카드</figcaption>
                  </figure>
                </div>
                <div className="ai-card-meta">
                  <strong>{c.no}번</strong>
                  {last?.error && <span className="muted">{last.error}</span>}
                  {c.ok && <span className="muted">{c.source === 'chat' ? 'ChatGPT 채팅' : c.source === 'openai' ? 'OpenAI API' : 'Codex 자동'}</span>}
                  <button className="btn btn-small" type="button" disabled={!can} onClick={() => onMake(c.no)}>이 배경 다시 만들기</button>
                  {c.prompt && <button type="button" className="btn btn-small" onClick={() => copy(c.no, c.prompt!)}>{copied === c.no ? '복사했어요' : '요청문 복사'}</button>}
                  <label className={`btn btn-small file-btn${can ? '' : ' is-disabled'}`}>
                    이미지 올리기
                    <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" disabled={!can} onChange={(e) => { upload(c.no, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}

// AI 디자인 카드: 문구·출력 작업이 끝나면 첫·마지막 카드를 GPT 이미지로 자동으로 만들어 최종 카드에 넣음 (제품은 원본 사진 잠금)
function AiCardPanel({ detail, busy, onMake }: { detail: ProductDetail; busy: boolean; onMake: (card?: number) => void }) {
  const ai = detail.ai_card!;
  const can = Boolean(detail.actions.can_ai_card) && !busy;
  const nos = ai.targets;
  const missing = nos.filter((n) => !ai.applied.includes(n));
  const failedRun = ai.run?.ok === false;
  return (
    <details className="fold" open={ai.running || failedRun}>
      <summary>
        <span className="fold-title">AI 디자인 카드 · {nos.join('·')}번</span>
        <span className="fold-meta">
          {ai.running ? <span className="pill pill-running">만드는 중</span> : failedRun ? <span className="pill pill-failed">실패</span> : missing.length ? <span className="pill pill-queued">{missing.join('·')}번 템플릿 사용 중</span> : <span className="pill pill-done">최종 카드에 적용</span>}
        </span>
      </summary>
      <div className="fold-body">
        <p className="muted">첫 카드와 마지막 카드를 GPT 이미지(내 컴퓨터의 Codex)로 만들어 최종 카드에 넣어요. 제품은 원본 사진 그대로예요. 문구를 고치면 그 카드만 다시 만들어요.</p>
        {ai.running && <p className="notice notice-info" role="status">AI 디자인 카드를 만드는 중이에요 ({ai.run?.card ? `${ai.run.card}번` : `${nos.join('·')}번`}). 끝날 때까지 최종 승인·내보내기·피그마는 잠시 기다려요.</p>}
        {ai.run && (ai.running || failedRun) && ai.run.progress.length > 0 && <pre className={`ai-card-log${failedRun ? ' is-error' : ''}`}>{ai.run.progress.join('\n')}</pre>}
        {!ai.running && missing.length > 0 && (
          <div className="action-bar">
            <button className="btn btn-primary" type="button" disabled={!can} onClick={() => onMake()}>{missing.join('·')}번 AI 디자인 카드 만들기</button>
            <span className="muted">{ai.cards.length ? '문구가 바뀌었거나 만들지 못한 카드예요.' : '이 제품은 아직 AI 디자인 카드가 없어요.'}</span>
          </div>
        )}
        {ai.cards.length > 0 && (
          <div className="ai-card-grid">
            {nos.map((no) => {
              const r = ai.cards.find((x) => x.no === no);
              const last = r?.tries[r.tries.length - 1];
              return (
                <div className="ai-card-item" key={no}>
                  <div className="ai-card-pair">
                    <figure>
                      {r?.template ? <img src={aiCardUrl(detail.id, r.template.file, r.template.v)} alt={`${no}번 템플릿 카드`} loading="lazy" /> : <div className="ai-card-empty">템플릿</div>}
                      <figcaption>템플릿</figcaption>
                    </figure>
                    <figure>
                      {r?.ok && r.file ? <img src={aiCardUrl(detail.id, r.file, r.v)} alt={`${no}번 AI 디자인 카드`} loading="lazy" /> : <div className="ai-card-empty">{r ? '만들지 못했어요' : '아직 없음'}</div>}
                      <figcaption>AI 디자인{r?.applied ? ' · 사용 중' : r?.stale ? ' · 문구가 바뀜' : ''}</figcaption>
                    </figure>
                  </div>
                  <div className="ai-card-meta">
                    <strong>{no}번</strong>
                    {r && <span className="muted">시도 {r.tries.length}번{last?.diff != null ? ` · 제품 차이 ${last.diff}` : ''}{last?.error ? ` · ${last.error}` : ''}</span>}
                    <button className="btn btn-small" type="button" disabled={!can} onClick={() => onMake(no)}>이 카드 다시 만들기</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}

// ── 피그마에서 편집 (사람이 직접 고치기)
function FigmaPanel({ detail, busy, onPrepare }: { detail: ProductDetail; busy: boolean; onPrepare: () => void }) {
  const f = detail.figma!;
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(false);
  const edited = f.edited;
  const changedCards = edited ? edited.cards.filter((c) => c.changed.length) : [];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(f.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 복사 못 하면 보이는 코드를 직접 입력 */
    }
  };
  const downloadEdited = async () => {
    if (!edited) return;
    setZipping(true);
    try {
      const blob = await buildZip(edited.cards.map((c) => ({ name: `${detail.id}-figma-${c.png}`, url: figmaEditedUrl(detail.id, c.png, c.v) })));
      downloadBlob(blob, `${detail.id}-figma.zip`);
    } finally {
      setZipping(false);
    }
  };
  return (
    <details className="fold" open={Boolean(f.push?.running || f.push?.ok === false || changedCards.length)}>
      <summary>
        <span className="fold-title">피그마에서 편집</span>
        <span className="fold-meta">
          {f.push?.running ? <span className="pill pill-running">넣는 중</span> : f.push?.ok === false ? <span className="pill pill-failed">실패</span> : f.push?.ok ? <span className="pill pill-done">넣음</span> : <span className="muted">선택 기능</span>}
          {changedCards.length > 0 && <span className="pill pill-queued">문구 바뀐 카드 {changedCards.length}</span>}
        </span>
      </summary>
      <div className="fold-body">
        <p className="muted">
          {f.auto_push
            ? '누르면 최종 카드를 피그마 파일의 새 페이지(제품명 · 날짜 시각)에 넣어요. 글자·도형·사진 레이어로 들어가고, AI 디자인 카드는 완성 이미지로 들어가요.'
            : '카드를 피그마 레이어(글자·도형·사진)로 보내 직접 고칠 수 있어요. 고친 카드는 피그마 플러그인에서 다시 이 화면으로 보내요.'}
        </p>
        <div className="action-bar">
          <button className="btn" type="button" disabled={busy || Boolean(f.push?.running)} onClick={onPrepare}>
            <Icon name="external" size={16} /> {f.push?.running ? '피그마에 넣는 중…' : f.prepared_at ? '피그마에 다시 넣기 (새 페이지)' : '피그마에서 편집'}
          </button>
          {f.push?.ok && f.push.page_url && <a className="btn btn-ghost" href={f.push.page_url} target="_blank" rel="noreferrer">넣은 페이지 열기</a>}
          {f.file_url && <a className="btn btn-ghost" href={f.file_url} target="_blank" rel="noreferrer">피그마 파일 열기</a>}
        </div>
        {f.push && (
          <div className={`notice${f.push.ok === false ? ' notice-error' : f.push.running ? ' notice-info' : ''}`} role="status">
            {f.push.running && <p>피그마에 카드를 넣는 중이에요 · 페이지 '{f.push.page_name}'. 피그마 파일을 열어 두면 카드가 생기는 걸 바로 볼 수 있어요.</p>}
            {f.push.ok && <p>피그마에 넣었어요 · 페이지 '{f.push.page_name}' · {formatDateTime(f.push.finished_at ?? f.push.started_at)}</p>}
            {f.push.ok === false && <p>피그마에 넣지 못했어요: {f.push.error} — 다시 누르거나, 아래 플러그인으로 가져올 수 있어요.</p>}
          </div>
        )}
        {f.prepared_at && (
          <details className="figma-manual" open={!f.auto_push}>
            <summary>플러그인으로 직접 가져오기·고친 카드 보내기 (피그마 데스크톱)</summary>
            <ol className="figma-steps">
              <li>피그마 데스크톱에서 <strong>플러그인 › 개발 › 카드뉴스 작업실 연결</strong> 실행 (처음 한 번은 <code>figma-plugin/manifest.json</code> 등록)</li>
              <li>
                연결 코드 <button type="button" className="figma-code" onClick={copy} title="눌러서 복사">{f.code}</button>
                {copied && <span className="muted" role="status"> 복사했어요</span>} → 연결 → <strong>{detail.name}</strong> → 가져오기. 가져올 때마다 새 페이지가 생겨 이전에 고친 페이지는 그대로 남아요.
              </li>
              <li>다 고쳤으면 그 페이지를 연 채로 <strong>고친 카드를 웹으로 보내기</strong>를 누르면 아래에 나와요.</li>
            </ol>
            <p className="muted">준비한 시각 {formatDateTime(f.prepared_at)} · 작업실을 다시 켜면 연결 코드가 바뀌어요.</p>
          </details>
        )}
        {edited && (
          <div className="figma-edited">
            <h4 className="panel-subtitle">피그마에서 고친 카드 · {formatDateTime(edited.received_at)}{edited.page && <span className="muted"> · 페이지 '{edited.page}'</span>}</h4>
            {changedCards.length > 0 ? (
              <div className="notice notice-warn" role="status">
                <p>[주의] 피그마에서 문구가 바뀐 카드가 있어요. 이 문구는 원문 근거 검증을 거치지 않았어요. 문구를 바꾸려면 작업실의 수정 요청으로 고치는 게 원칙이에요.</p>
                <ul>
                  {changedCards.flatMap((c) =>
                    c.changed.map((x) => (
                      <li key={`${c.file}-${x.name}`}>
                        {c.file} · {x.name.replace(/ \(글자\)$/, '')}: {x.before === null ? '(새 글자)' : `“${x.before.replace(/\n/g, ' ')}”`} → {x.after === null ? '(지움)' : `“${x.after.replace(/\n/g, ' ')}”`}
                      </li>
                    )),
                  )}
                </ul>
              </div>
            ) : (
              <p className="muted">문구는 승인본과 같아요 (디자인만 바뀜).</p>
            )}
            <ul className="card-review">
              {edited.cards.map((c) => (
                <li key={c.file} className="card-review-item">
                  <a href={figmaEditedUrl(detail.id, c.png, c.v)} target="_blank" rel="noreferrer">
                    <img src={figmaEditedUrl(detail.id, c.png, c.v)} alt={`피그마에서 고친 ${c.file}`} width={1080} height={1080} loading="lazy" />
                  </a>
                  <p className="card-review-text">{c.file}</p>
                </li>
              ))}
            </ul>
            <div className="action-bar">
              <button className="btn" type="button" disabled={zipping} onClick={downloadEdited}><Icon name="download" size={16} /> {zipping ? 'ZIP 만드는 중…' : '고친 카드 ZIP 받기'}</button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

// ── 내보내기 (승인 완료 뒤 주 행동)
function ExportPanel({ detail, busy, onExport }: { detail: ProductDetail; busy: boolean; onExport: () => void }) {
  const done = Boolean(detail.export.exported_at);
  return (
    <div className={`export-panel${done ? ' is-done' : ''}`}>
      <div>
        <h3 className="panel-title">{done ? '결과 보기 웹에 내보냈어요' : '결과 보기 웹에 내보내기'}</h3>
        <p className="muted keep">
          {done
            ? `${formatDateTime(detail.export.exported_at)} · 배포하려면 web/public/data/와 config/export.json을 커밋하세요.`
            : '최종 카드와 제작 과정을 결과 보기 웹 데이터(web/public/data/)로 만들어요. 내보낸 뒤 PNG·ZIP으로 받을 수 있어요.'}
        </p>
      </div>
      <div className="action-bar">
        {done && <Link className="btn" to={`/projects/${detail.id}`}>결과 보기에서 열기 <Icon name="arrow" size={16} /></Link>}
        <button className={`btn${done ? '' : ' btn-primary'}`} type="button" disabled={!detail.actions.can_export || busy} onClick={onExport}>
          {done ? '다시 내보내기' : '내보내기'}
        </button>
      </div>
    </div>
  );
}

// ── 기록
const EVENT_TEXT: Record<string, string> = {
  input_submitted: '제작 요청',
  job_started: '작업 시작',
  job_finished: '작업 끝',
  validate_result: '검증',
  plan_approved: '구성안 승인',
  final_approved: '최종 승인',
  revision_requested: '수정 요청',
  design_selected: '디자인 묶음 변경',
  published: '인스타 게시',
};
function EventLog({ events, labels }: { events: ProductDetail['events']; labels?: Labels }) {
  if (!events.length) return null;
  return (
    <details className="fold section event-log">
      <summary><span className="fold-title">제작 기록</span><span className="fold-meta muted num">{events.length}개</span></summary>
      <ol className="fold-body">
        {[...events].reverse().map((e, i) => (
          <li key={i} className={e.ok === false ? 'is-fail' : undefined}>
            <span className="muted num">{formatDateTime(e.ts)}</span>
            <span>
              {EVENT_TEXT[e.event] ?? e.event}
              {e.kind ? ` · ${JOB_LABEL[e.kind]}` : ''}
              {e.check ? ` · ${e.check === 'layout' ? '레이아웃' : '데이터'}` : ''}
              {e.ok === false ? ` · 실패${e.error_code ? ` ${e.error_code}` : ''}${e.error_codes?.length ? ` ${e.error_codes.join(', ')}` : ''}` : e.ok ? ' · 통과' : ''}
              {e.types?.length ? ` · ${e.types.map((t) => label(labels?.revision_types, t)).join(', ')}` : ''}
              {e.memo ? ` · “${e.memo}”` : ''}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
