// S3 제작 진행 (웹 모드) — 담당 이규동
// 입력 확인 → 구성안 작업 → 구성안 확인(승인/수정 요청) → 문구·출력 작업 → 카드 확인(최종 승인/수정 요청) → 결과 보기 웹에 내보내기
// 작업이 도는 동안 2초마다 상태를 다시 불러옴. 실행은 이 컴퓨터의 Claude Code
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  JOB_LABEL, STAGE_LABEL, describeProgress, pngUrl, studioFetch, usePolling, useStudioStatus,
  type ProductDetail, type Report, type RevisionType, type StudioJob,
} from '../../studio/api';
import { useIndex } from '../../data/load';
import { formatDateTime, formatPercent, label } from '../../data/format';
import type { Labels } from '../../data/types';
import { ErrorState, Loading } from '../../components/StateView';
import { ClaudeStatus, StudioOff } from './StudioCommon';
import './studio.css';

export function StudioProductPage() {
  const { status } = useStudioStatus();
  const { id = '' } = useParams();
  if (status === undefined) return <div className="page"><Loading /></div>;
  if (status === null) return <StudioOff />;
  // key: 다른 제품으로 넘어가면 화면을 새로 그림 (이전 제품 내용이 새 데이터가 올 때까지 남아 보이지 않게)
  return <StudioProduct key={id} id={id} revisionTypes={status.revision_types} />;
}

function StudioProduct({ id, revisionTypes }: { id: string; revisionTypes: RevisionType[] }) {
  const { status } = useStudioStatus();
  const index = useIndex();
  const labels = index.status === 'ready' ? index.data.labels : undefined;
  const { data, error, refresh, setData } = usePolling(() => studioFetch<ProductDetail>(`/products/${id}`), [id], (d) => (d && d.actions.running ? 2000 : null));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <div className="page"><BackLink /><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><Loading /></div>;
  const p = data;
  const a = p.actions;

  const act = async (path: string, body?: unknown, method: 'POST' | 'PUT' | 'DELETE' = 'POST') => {
    setBusy(true);
    setActionError(null);
    try {
      const r = await studioFetch<Partial<ProductDetail> & { job?: StudioJob; product?: ProductDetail }>(path, { method, body });
      if (r.product) setData(r.product);
      else if (r.id) setData(r as ProductDetail);
      refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <BackLink />
      <header className="detail-head">
        <div className="detail-badges">
          <span className={`badge badge-stage-${p.stage === 'input' ? 'plan' : p.stage}`}>{STAGE_LABEL[p.stage]}</span>
          <span className="badge badge-kind">웹 모드 · 로컬 실행</span>
        </div>
        <h1 className="page-title">{p.name}</h1>
        <p className="page-desc">
          {p.id}
          {p.brand ? ` · ${p.brand}` : ''}
        </p>
      </header>

      <Steps detail={p} />
      {status && !status.claude.installed && <ClaudeStatus info={status.claude} />}
      {actionError && (
        <p className="notice notice-error" role="alert">
          {actionError}
        </p>
      )}

      {p.job && <JobPanel job={p.job} busy={busy} onCancel={() => act(`/products/${id}/queue`, undefined, 'DELETE')} />}
      {!a.running && (a.wait_ahead ?? 0) > 0 && (
        <p className="notice notice-queue">
          다른 제품 작업이 진행 중이에요. 지금 시작하면 차례를 기다렸다가 자동으로 시작해요 (앞에 {a.wait_ahead}개).
        </p>
      )}

      {/* 입력 단계 */}
      {p.stage === 'input' && (
        <section className="section">
          <CheckPanel check={p.check} />
          <div className="action-bar">
            <button className="btn btn-primary" disabled={!a.can_plan || busy} onClick={() => act(`/products/${id}/jobs`, { kind: 'plan' })}>
              {a.last_job_ok === false ? '구성안 다시 만들기' : '구성안 만들기'}
            </button>
            {a.can_edit_input && (
              <Link className="btn" to={`/studio/${id}/edit`}>
                입력 고치기
              </Link>
            )}
            {!a.can_plan && !a.running && p.check.errors.length > 0 && <span className="muted">입력 확인 오류를 먼저 고쳐 주세요.</span>}
          </div>
        </section>
      )}

      {/* 구성안 확인 */}
      {p.cards && p.stage === 'plan' && (
        <section className="section" aria-labelledby="plan-title">
          <h2 className="section-title" id="plan-title">
            구성안 확인
          </h2>
          <DesignPanel
            detail={p}
            busy={busy}
            canChange={Boolean(a.can_select_design) && p.design?.source !== 'input'}
            onChange={(designId) => act(`/products/${id}/design`, { id: designId }, 'PUT')}
          />
          <PlanReview detail={p} labels={labels} />
          <ValidationPanel validation={p.validation} />
          {!a.running && (
            <div className="action-bar">
              {a.can_approve_plan && (
                <button className="btn btn-primary" disabled={busy} onClick={() => act(`/products/${id}/approve`, { stage: 'plan' })}>
                  구성안 승인하고 문구 만들기
                </button>
              )}
              {a.can_copy && (
                <button className="btn btn-primary" disabled={busy} onClick={() => act(`/products/${id}/jobs`, { kind: 'copy' })}>
                  문구·출력 다시 시작
                </button>
              )}
            </div>
          )}
          {a.can_revise_plan && <RevisionForm stage="plan" revisionTypes={revisionTypes} cardCount={p.cards.cards.length} busy={busy} onSubmit={(b) => act(`/products/${id}/revisions`, b)} />}
        </section>
      )}

      {/* 카드 확인 */}
      {p.cards && (p.stage === 'copy' || p.stage === 'approved') && (
        <section className="section" aria-labelledby="cards-title">
          <h2 className="section-title" id="cards-title">
            {p.stage === 'approved' ? '최종 카드' : '카드 확인'}
          </h2>
          <DesignPanel detail={p} busy={busy} canChange={false} onChange={() => undefined} />
          <CardReview detail={p} labels={labels} />
          <ValidationPanel validation={p.validation} />
          {p.stage === 'copy' && !a.running && (
            <div className="action-bar">
              <button className="btn btn-primary" disabled={!a.can_approve_final || busy} onClick={() => act(`/products/${id}/approve`, { stage: 'final' })}>
                최종 승인
              </button>
              <span className="muted">승인하면 카드가 확정되고 결과 보기 웹에 내보낼 수 있어요.</span>
            </div>
          )}
          {a.can_revise_final && <RevisionForm stage="final" revisionTypes={revisionTypes} cardCount={p.cards.cards.length} busy={busy} onSubmit={(b) => act(`/products/${id}/revisions`, b)} />}
          {p.stage === 'approved' && <ExportPanel detail={p} busy={busy} onExport={() => act(`/products/${id}/export`)} />}
        </section>
      )}

      <EventLog events={p.events} labels={labels} />
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/studio" className="back-link">
      ← 작업실
    </Link>
  );
}

// ── 단계 표시
const STEP_LIST = [
  { key: 'input', label: '입력 확인' },
  { key: 'plan', label: '구성안' },
  { key: 'copy', label: '문구·출력' },
  { key: 'approved', label: '최종 승인' },
  { key: 'export', label: '결과 보기 웹' },
];
function Steps({ detail }: { detail: ProductDetail }) {
  const order = ['input', 'plan', 'copy', 'approved'];
  let current = order.indexOf(detail.stage);
  if (detail.stage === 'approved' && detail.export.exported_at) current = 4;
  return (
    <ol className="steps" aria-label="제작 단계">
      {STEP_LIST.map((s, i) => (
        <li key={s.key} className={i < current ? 'done' : i === current ? 'current' : undefined} aria-current={i === current ? 'step' : undefined}>
          <span className="step-no">{i < current ? '✓' : i + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

// ── 작업 진행·결과
function JobPanel({ job, busy, onCancel }: { job: StudioJob; busy: boolean; onCancel: () => void }) {
  if (job.status === 'queued') return <QueuedPanel job={job} busy={busy} onCancel={onCancel} />;
  return <JobProgress job={job} />;
}

// 대기 중: 앞에서 도는 작업과 순서, 취소
function QueuedPanel({ job, busy, onCancel }: { job: StudioJob; busy: boolean; onCancel: () => void }) {
  return (
    <section className="section panel job-panel is-queued" aria-live="polite">
      <div className="job-head">
        <span className="job-icon" aria-hidden="true">
          ⏳
        </span>
        <strong>
          {JOB_LABEL[job.kind]} 대기 중 · {job.position}번째
        </strong>
        {job.revision && <span className="muted">수정 요청: {job.revision.memo}</span>}
      </div>
      <p className="muted job-hint">
        {job.ahead ? (
          <>
            지금 <Link to={`/studio/${job.ahead.product_id}`}>{job.ahead.name}</Link>의 {JOB_LABEL[job.ahead.kind]}이 돌고 있어요.{' '}
          </>
        ) : null}
        앞 작업이 끝나면 자동으로 시작해요. 이 화면을 닫아도 돼요.
      </p>
      <div className="action-bar">
        <button className="btn" disabled={busy} onClick={onCancel}>
          대기 취소
        </button>
      </div>
    </section>
  );
}

function JobProgress({ job }: { job: StudioJob }) {
  const running = job.status === 'running';
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const elapsed = Math.max(0, Math.round(((running ? now : Date.parse(job.finished_at ?? job.started_at)) - Date.parse(job.started_at)) / 1000));
  const steps = job.progress.filter((p) => p.type !== 'text');
  const lastText = [...job.progress].reverse().find((p) => p.type === 'text');
  return (
    <section className={`section panel job-panel ${running ? 'is-running' : job.ok ? 'is-ok' : 'is-fail'}`} aria-live="polite">
      <div className="job-head">
        {running ? <span className="spinner spinner-sm" aria-hidden="true" /> : <span className="job-icon">{job.ok ? '✓' : '✕'}</span>}
        <strong>
          {JOB_LABEL[job.kind]} {running ? '진행 중' : job.ok ? '완료' : '중단'}
        </strong>
        <span className="muted">
          {Math.floor(elapsed / 60)}분 {elapsed % 60}초{job.revision ? ` · 수정 요청: ${job.revision.memo}` : ''}
        </span>
      </div>
      {running && <p className="muted job-hint">이 컴퓨터의 Claude Code가 작업 중이에요. 이 화면을 닫아도 계속 돼요.</p>}
      {steps.length > 0 && (
        <ol className="job-steps">
          {steps.slice(-8).map((s, i) => (
            <li key={i}>{describeProgress(s)}</li>
          ))}
        </ol>
      )}
      {running && lastText && <p className="job-text">“{lastText.text}”</p>}
      {!running && job.report && (job.report.알림.length > 0 || job.report.오류.length > 0) && (
        <div className="job-report">
          {job.report.오류.map((e) => (
            <p key={e} className="notice notice-error">
              오류: {e}
            </p>
          ))}
          {job.report.알림.map((n) => (
            <p key={n} className={`notice ${/\[경고\]/.test(n) ? 'notice-warn' : ''}`}>
              {n}
            </p>
          ))}
        </div>
      )}
      {!running && !job.ok && (
        <p className="notice notice-error">
          {job.crash ? job.crash : `반영하지 않았어요 (${job.error_code ?? '오류'})`}
          {job.verify && !job.verify.ok && job.verify.reasons.length ? ` · 재검증: ${job.verify.reasons.join(', ')}` : ''}
        </p>
      )}
    </section>
  );
}

function CheckPanel({ check }: { check: Report }) {
  return (
    <div className="panel">
      <h3 className="panel-title">입력 확인</h3>
      {check.errors.length === 0 && check.warnings.length === 0 && <p className="ok-text">✓ 필수 항목·이미지·지시문 검사를 모두 통과했어요.</p>}
      <IssueList items={check.errors} tone="error" />
      <IssueList items={check.warnings} tone="warn" />
    </div>
  );
}

function ValidationPanel({ validation }: { validation: ProductDetail['validation'] }) {
  if (!validation) return null;
  const q = validation.quality;
  return (
    <div className="panel validation">
      <h3 className="panel-title">검증</h3>
      {q && (
        <p className="muted">
          원문 커버리지 {formatPercent(q.coverage)} · 근거 연결률 {formatPercent(q.evidence_rate)} · [주의] {q.caution ? q.caution.total : 0}개
        </p>
      )}
      {validation.errors.length === 0 && <p className="ok-text">✓ 검증 오류 없음</p>}
      <IssueList items={validation.errors} tone="error" />
      <IssueList items={validation.cautions} tone="warn" prefix="[주의]" />
      <IssueList items={validation.warnings} tone="info" />
    </div>
  );
}

function IssueList({ items, tone, prefix }: { items: { code?: string; where: string; message: string }[]; tone: 'error' | 'warn' | 'info'; prefix?: string }) {
  if (!items.length) return null;
  return (
    <ul className={`issues issues-${tone}`}>
      {items.map((it, i) => (
        <li key={i}>
          {prefix ?? (it.code ? <code>{it.code}</code> : null)} <span className="muted">{it.where}</span> {it.message}
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
  const by = d.source === 'cards' ? (d.selected?.selected_by === 'human' ? '작업실에서 사람이 고름' : 'Claude 추천') : DESIGN_SOURCE[d.source];
  const picked = d.catalog.find((x) => x.id === pick);
  return (
    <div className="panel design-panel">
      <p className="muted">디자인 묶음{d.auto ? ' · 무드 자동 추천' : ''}</p>
      <p className="design-name">
        <strong>{current?.name ?? d.id}</strong> <span className="chip">{by}</span>
        {current ? <span className="muted"> v{current.version}</span> : null}
      </p>
      {current && <p className="muted">{current.summary}</p>}
      {d.source === 'cards' && d.selected && <p className="design-reason">이유: “{d.selected.reason}”</p>}
      {canChange && (
        <div className="design-change">
          <label>
            다른 묶음으로{' '}
            <select value={pick} disabled={busy} onChange={(e) => setPick(e.target.value)}>
              {d.catalog.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" disabled={busy || pick === d.id} onClick={() => onChange(pick)}>
            바꾸기
          </button>
          {picked && pick !== d.id && (
            <p className="muted">
              {picked.summary} · 어울림: {picked.fits.join(' / ')} · 제품 사진 {NEEDS_TEXT[picked.needs.product] ?? picked.needs.product}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── 구성안 확인
function PlanReview({ detail, labels }: { detail: ProductDetail; labels?: Labels }) {
  const c = detail.cards!;
  const quote = new Map(c.sources.map((s) => [s.id, s]));
  const chips = (ids: string[] | undefined) =>
    !ids || ids.length === 0 ? <span className="muted">—</span> : ids.map((sid) => (
      <span key={sid} className="chip" title={quote.get(sid as never)?.quote}>
        {sid}
      </span>
    ));
  return (
    <div className="plan-review">
      <div className="panel core">
        <p className="muted">핵심 메시지</p>
        <p className="core-message">{c.analysis.core_message}</p>
        <p className="chips">{chips(c.analysis.core_evidence)}</p>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">카드</th>
              <th scope="col">역할 · 템플릿</th>
              <th scope="col">담을 내용</th>
              <th scope="col">근거</th>
            </tr>
          </thead>
          <tbody>
            {c.cards.map((card) => (
              <tr key={card.no}>
                <td>
                  <strong>{card.no}</strong>
                </td>
                <td>
                  {label(labels?.roles, card.role)}
                  <span className="muted"> · {label(labels?.templates, card.template)}</span>
                </td>
                <td>{card.intent}</td>
                <td>
                  <span className="chips">{chips(card.evidence)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="sources">
        <summary>원문 인용 {c.sources.length}개</summary>
        <ul>
          {c.sources.map((s) => (
            <li key={s.id}>
              <span className="chip">{s.id}</span> <span className="muted">{s.section}</span> “{s.quote}”
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ── 카드 확인
const COPY_KEY: Record<string, string> = { badge: '배지', title: '제목', subtitle: '부제', caption: '설명', body: '본문', items: '항목', note: '참고', image: '이미지' };
function CardReview({ detail, labels }: { detail: ProductDetail; labels?: Labels }) {
  const c = detail.cards!;
  const v = new Map(detail.pngs.map((x) => [x.file, x.v]));
  return (
    <ul className="card-review">
      {c.cards.map((card) => {
        const file = `card-${String(card.no).padStart(2, '0')}.png`;
        return (
          <li key={card.no} className="card-review-item">
            {v.has(file) ? (
              <a href={pngUrl(detail.id, file, v.get(file))} target="_blank" rel="noreferrer">
                <img src={pngUrl(detail.id, file, v.get(file))} alt={`${card.no}번 카드`} width={1080} height={1080} loading="lazy" />
              </a>
            ) : (
              <div className="card-missing">출력 없음</div>
            )}
            <div className="card-review-text">
              <p>
                <strong>{card.no}</strong> {label(labels?.roles, card.role)}
                <span className="muted"> · {label(labels?.templates, card.template)}</span>
              </p>
              {card.copy &&
                Object.entries(card.copy).map(([k, val]) => (
                  <p key={k} className="copy-line">
                    <span className="muted">{COPY_KEY[k] ?? k}</span> {Array.isArray(val) ? val.join(' / ') : String(val)}
                  </p>
                ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── 수정 요청
function RevisionForm({
  stage,
  revisionTypes,
  cardCount,
  busy,
  onSubmit,
}: {
  stage: 'plan' | 'final';
  revisionTypes: RevisionType[];
  cardCount: number;
  busy: boolean;
  onSubmit: (body: { stage: string; types: string[]; cards: number[]; memo: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [cards, setCards] = useState<number[]>([]);
  const [memo, setMemo] = useState('');
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ stage, types, cards, memo });
    setOpen(false);
    setTypes([]);
    setCards([]);
    setMemo('');
  };
  if (!open) {
    return (
      <div className="action-bar">
        <button className="btn" onClick={() => setOpen(true)}>
          {stage === 'plan' ? '구성안 수정 요청' : '카드 수정 요청'}
        </button>
      </div>
    );
  }
  return (
    <form className="panel revision-form" onSubmit={submit}>
      <h3 className="panel-title">{stage === 'plan' ? '구성안 수정 요청' : '카드 수정 요청'}</h3>
      {stage === 'final' && (
        <fieldset>
          <legend>고칠 카드 (안 고르면 전체)</legend>
          <div className="check-row">
            {Array.from({ length: cardCount }, (_, i) => i + 1).map((n) => (
              <label key={n} className="check">
                <input type="checkbox" checked={cards.includes(n)} onChange={() => setCards((c) => toggle(c, n))} />
                {n}번
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend>수정 유형 (하나 이상)</legend>
        <div className="check-row">
          {revisionTypes.map((t) => (
            <label key={t.code} className="check" title={t.example}>
              <input type="checkbox" checked={types.includes(t.code)} onChange={() => setTypes((x) => toggle(x, t.code))} />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span className="field-label">요청 내용</span>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={500} required placeholder="예: 3번 카드 제목을 더 짧게" />
        <span className="field-guide">원문에 없는 효능·수치를 넣어 달라는 요청은 반영되지 않아요.</span>
      </label>
      <div className="action-bar">
        <button type="submit" className="btn btn-primary" disabled={busy || !types.length || !memo.trim()}>
          수정 요청 보내기
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          취소
        </button>
      </div>
    </form>
  );
}

// ── 내보내기
function ExportPanel({ detail, busy, onExport }: { detail: ProductDetail; busy: boolean; onExport: () => void }) {
  const done = Boolean(detail.export.exported_at);
  return (
    <div className="panel export-panel">
      <h3 className="panel-title">결과 보기 웹에 내보내기</h3>
      <p className="muted">
        {done
          ? `내보냈어요 (${formatDateTime(detail.export.exported_at)}). 배포하려면 web/public/data/와 config/export.json을 커밋하세요.`
          : '최종 카드와 제작 과정을 결과 보기 웹 데이터(web/public/data/)로 만들어요.'}
      </p>
      <div className="action-bar">
        <button className="btn btn-primary" disabled={!detail.actions.can_export || busy} onClick={onExport}>
          {done ? '다시 내보내기' : '내보내기'}
        </button>
        {done && (
          <Link className="btn" to={`/projects/${detail.id}`}>
            결과 보기에서 열기
          </Link>
        )}
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
};
function EventLog({ events, labels }: { events: ProductDetail['events']; labels?: Labels }) {
  if (!events.length) return null;
  return (
    <details className="section event-log">
      <summary>제작 기록 {events.length}</summary>
      <ol>
        {[...events].reverse().map((e, i) => (
          <li key={i}>
            <span className="muted">{formatDateTime(e.ts)}</span> {EVENT_TEXT[e.event] ?? e.event}
            {e.kind ? ` · ${JOB_LABEL[e.kind]}` : ''}
            {e.check ? ` · ${e.check === 'layout' ? '레이아웃' : '데이터'}` : ''}
            {e.ok === false ? ` · 실패${e.error_code ? ` ${e.error_code}` : ''}${e.error_codes?.length ? ` ${e.error_codes.join(', ')}` : ''}` : e.ok ? ' · 통과' : ''}
            {e.types?.length ? ` · ${e.types.map((t) => label(labels?.revision_types, t)).join(', ')}` : ''}
            {e.memo ? ` · “${e.memo}”` : ''}
          </li>
        ))}
      </ol>
    </details>
  );
}
