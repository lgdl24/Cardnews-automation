// S3 제작 진행 (웹 모드) — 담당 이규동
// 입력 확인 → 구성안 작업 → 구성안 확인(승인/수정 요청) → 문구·출력 작업 → 카드 확인(최종 승인/수정 요청) → 결과 보기 웹에 내보내기
// 작업이 도는 동안 2초마다 상태를 다시 불러옴. 실행은 이 컴퓨터의 Claude Code
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  JOB_LABEL, STAGE_LABEL, aiBgUrl, aiCardUrl, brandShotUrl, describeProgress, figmaEditedUrl, pngUrl, studioFetch, usePolling, useStudioStatus,
  type ProductDetail, type Report, type RevisionType, type StudioJob,
} from '../../studio/api';
import { useIndex } from '../../data/load';
import { buildZip } from '../../lib/zip';
import { downloadBlob } from '../../lib/download';
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
  const { data, error, refresh, setData } = usePolling(() => studioFetch<ProductDetail>(`/products/${id}`), [id], (d) => (d && (d.actions.running || d.ai_card?.running || d.ai_bg?.running || d.figma?.push?.running) ? 2000 : null));
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
      return true;
    } catch (e) {
      setActionError((e as Error).message);
      return false;
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
      <div className="next-step"><div><p className="eyebrow">NEXT STEP</p><strong>{a.running ? (a.job_state === 'queued' ? '작업 순서를 기다리고 있어요' : '카드뉴스를 만들고 있어요') : p.stage === 'input' ? '입력 자료를 확인하고 구성안을 만들어주세요' : p.stage === 'plan' ? '구성과 원문 근거를 검토해주세요' : p.stage === 'copy' ? '카드를 살펴보고 최종 승인해주세요' : '완성된 결과를 라이브러리에 내보내세요'}</strong><p>{a.running ? '작업은 계속됩니다. 작업실에서 다른 제품을 확인해도 괜찮아요.' : p.stage === 'approved' ? '내보낸 뒤 개별 PNG와 ZIP 파일을 내려받을 수 있어요.' : '수정이 필요하면 아래에서 요청할 수 있어요. 승인 전에는 다음 단계로 넘어가지 않아요.'}</p></div><a className="btn" href="#current-review">{a.running ? '작업 현황 보기' : '검토 영역으로 이동'} ↓</a></div>
      <div id="current-review" style={{ scrollMarginTop: 90 }} />
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
          {(p.brand_page || p.cards?.brand_mood) && <BrandPanel detail={p} />}
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
          {(p.brand_page || p.cards?.brand_mood) && <BrandPanel detail={p} />}
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
          {p.pngs.length === 0 && (
            <div className="notice notice-warn" role="status">
              <p>카드 이미지(PNG)가 이 컴퓨터에 없어요. 카드 이미지는 git에 올라가지 않아서 새 폴더나 다른 컴퓨터에서는 다시 만들어야 해요. 문구는 그대로 두고 이미지만 다시 만들어요.</p>
              <div className="action-bar">
                <button className="btn btn-primary" disabled={busy || !a.can_render} onClick={() => act(`/products/${id}/render`)}>
                  카드 이미지 다시 만들기
                </button>
              </div>
            </div>
          )}
          {p.ai_bg && (
            <AiBgPanel detail={p} busy={busy || a.running} onMake={(card) => act(`/products/${id}/ai-bg`, card ? { card } : {})} onUpload={(card, data) => act(`/products/${id}/ai-bg/upload`, { card, data })} />
          )}
          {p.ai_card && (
            <AiCardPanel detail={p} busy={busy || a.running} onMake={(card) => act(`/products/${id}/ai-card`, card ? { card } : {})} />
          )}
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
  const [selected, setSelected] = useState(c.cards[0]?.no ?? 1);
  const card = c.cards.find(x => x.no === selected) ?? c.cards[0];
  if (!card) return <p className="muted">검토할 카드가 없어요.</p>;
  const file = `card-${String(card.no).padStart(2, '0')}.png`;
  const png = detail.pngs.find(x => x.file === file);
  const evidence = c.sources.filter(s => card.evidence?.includes(s.id));
  return <div>
    <div className="review-tabs" aria-label="검토할 카드">{c.cards.map(x => <button type="button" key={x.no} aria-pressed={card.no === x.no} onClick={() => setSelected(x.no)}>{x.no}번 카드</button>)}</div>
    <div className="review-focus">
      {png ? <a href={pngUrl(detail.id, file, png.v)} target="_blank" rel="noreferrer" aria-label={`${card.no}번 카드 원본 새 창에서 보기`}><img src={pngUrl(detail.id, file, png.v)} alt={`${card.no}번 카드 미리보기`} width={1080} height={1080} /></a> : <div className="card-missing">아직 출력된 이미지가 없어요</div>}
      <div className="review-copy"><p className="eyebrow">CARD {String(card.no).padStart(2, '0')} / {String(c.cards.length).padStart(2, '0')}</p><h3>{label(labels?.roles, card.role)} <span className="muted">· {label(labels?.templates, card.template)}</span></h3>
        {card.copy && Object.entries(card.copy).filter(([k]) => k !== 'image').map(([k, val]) => <p className="copy-line" key={k}><span className="muted">{COPY_KEY[k] ?? k}</span>{Array.isArray(val) ? val.join(' / ') : String(val)}</p>)}
        <div className="review-evidence"><strong>이 카드의 원문 근거</strong>{evidence.length ? evidence.map(s => <p key={s.id}><span className="chip">{s.id}</span> {s.quote}</p>) : <p className="muted">이 카드에 연결된 원문 인용이 없어요. 내용과 제품 정보를 함께 확인해주세요.</p>}</div></div>
    </div>
  </div>;
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
  onSubmit: (body: { stage: string; types: string[]; cards: number[]; memo: string }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [cards, setCards] = useState<number[]>([]);
  const [memo, setMemo] = useState('');
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await onSubmit({ stage, types, cards, memo });
    if (!ok) return;
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

// ── 브랜드 무드: 상세페이지 스냅샷(구성안 작업 전 자동)과 구성안 작업이 정한 brand_mood(색·분위기·배경 장면·근거)
function BrandPanel({ detail }: { detail: ProductDetail }) {
  const b = detail.brand_page;
  const snap = b?.snapshot;
  const mood = detail.cards?.brand_mood;
  return (
    <div className="panel brand-panel">
      <h3 className="panel-title">브랜드 무드</h3>
      {b && (
        <p className="muted">
          브랜드 페이지: <a href={b.url} target="_blank" rel="noreferrer noopener">{b.url}</a>
          {!b.url_ok && ' · 쓸 수 없는 주소라 제품 사진으로 무드를 정해요'}
          {b.url_ok && !snap && ' · 구성안 작업을 시작하면 페이지를 한 번 캡처해요'}
          {snap && (snap.ok ? ` · ${new Date(snap.fetched_at).toLocaleString('ko-KR')} 캡처` : ` · 캡처 실패: ${snap.error ?? ''} (제품 사진으로 무드)`)}
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
          <div className="brand-swatches" aria-label="브랜드 색">
            {Object.entries(mood.palette).map(([k, hex]) => (
              <span key={k} className="brand-swatch"><i style={{ background: hex }} aria-hidden="true" />{k} {hex}</span>
            ))}
          </div>
          <p>{mood.summary}</p>
          <p className="muted">말투 {mood.tone} · 사진 {mood.photo_style} · {mood.source === 'snapshot' ? '브랜드 페이지를 보고 정함' : '제품 사진을 보고 정함'}</p>
          <p className="muted">배경 장면(GPT에 보냄, 글자·제품 없음): {mood.scene}</p>
          <details><summary>근거 {mood.evidence.length}개</summary><ul>{mood.evidence.map((e) => <li key={e}>{e}</li>)}</ul></details>
        </>
      ) : (
        <p className="muted">구성안 작업에서 Claude가 브랜드 색·분위기·배경 장면을 정해요.</p>
      )}
    </div>
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
  return (
    <div className="panel ai-card-panel">
      <h3 className="panel-title">AI 배경 · 카드 {bg.cards.length}장</h3>
      <p className="muted">
        문구·출력 작업이 끝나면 카드마다 GPT 이미지(내 컴퓨터의 Codex)가 브랜드 무드에 맞는 <strong>배경만</strong> 만들어요. 카드 글자와 제품 사진은 그 위에 코드가 얹어서, 문구 검증을 그대로 거쳐요. 무드가 그대로면 문구를 고쳐도 배경은 다시 만들지 않아요.
      </p>
      <p className="muted">
        자동 생성이 사용량 한도에 걸리면: 카드마다 <strong>요청문 복사</strong> → <a href="https://chatgpt.com/" target="_blank" rel="noreferrer noopener">ChatGPT 채팅</a>에 붙여 넣기 → 받은 이미지를 <strong>이미지 올리기</strong>로 넣으면 같은 방식으로 카드에 들어가요.
      </p>
      {bg.running && <p className="notice" role="status">AI 배경을 만드는 중이에요 ({bg.run?.card ? `${bg.run.card}번` : '전체'}, 한 장에 1~2분). 끝나면 카드를 다시 출력해요.</p>}
      {bg.run && (bg.running || bg.run.ok === false) && bg.run.progress.length > 0 && (
        <pre className={`ai-card-log${bg.run.ok === false ? ' is-error' : ''}`}>{bg.run.progress.join('\n')}</pre>
      )}
      {!bg.running && bg.stale.length > 0 && (
        <div className="action-bar">
          <button className="btn btn-primary" disabled={!can} onClick={() => onMake()}>{bg.stale.join('·')}번 AI 배경 만들기</button>
          <span className="muted">{bg.has_mood ? '아직 없거나 무드가 바뀐 카드예요.' : '구성안에서 정한 브랜드 무드가 없어요.'}</span>
        </div>
      )}
      {bg.cards.some((c) => c.ok) && <p className="notice notice-warn" role="status">[참고] 배경에 글자·로고가 섞였는지 눈으로 확인해 주세요. 섞였으면 그 카드만 다시 만들어요.</p>}
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
                {c.ok && <span className="muted">{c.source === 'chat' ? 'ChatGPT 채팅' : 'Codex 자동'}</span>}
                <button className="btn btn-small" disabled={!can} onClick={() => onMake(c.no)}>이 배경 다시 만들기</button>
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
  );
}

// ── 피그마에서 편집 (사람이 직접 고치기)
// AI 디자인 카드: 문구·출력 작업이 끝나면 첫·마지막 카드를 GPT 이미지로 자동으로 만들어 최종 카드에 넣음 (제품은 원본 사진 잠금)
function AiCardPanel({ detail, busy, onMake }: { detail: ProductDetail; busy: boolean; onMake: (card?: number) => void }) {
  const ai = detail.ai_card!;
  const can = Boolean(detail.actions.can_ai_card) && !busy;
  const nos = ai.targets;
  const missing = nos.filter((n) => !ai.applied.includes(n));
  return (
    <div className="panel ai-card-panel">
      <h3 className="panel-title">AI 디자인 카드 · {nos.join('·')}번</h3>
      <p className="muted">
        문구·출력 작업이 끝나면 첫 카드와 마지막 카드를 GPT 이미지(내 컴퓨터의 Codex)로 자동으로 만들어 최종 카드에 넣어요. 제품은 원본 사진 그대로예요. 문구를 고치면 그 카드만 다시 만들어요.
      </p>
      {ai.running && (
        <p className="notice" role="status">
          AI 디자인 카드를 만드는 중이에요 ({ai.run?.card ? `${ai.run.card}번` : `${nos.join('·')}번`}, 한 장에 1~2분). 끝날 때까지 최종 승인·내보내기·피그마는 잠시 기다려요.
        </p>
      )}
      {ai.run && (ai.running || ai.run.ok === false) && ai.run.progress.length > 0 && (
        <pre className={`ai-card-log${ai.run.ok === false ? ' is-error' : ''}`}>{ai.run.progress.join('\n')}</pre>
      )}
      {!ai.running && missing.length > 0 && (
        <div className="action-bar">
          <button className="btn btn-primary" disabled={!can} onClick={() => onMake()}>
            {missing.join('·')}번 AI 디자인 카드 만들기
          </button>
          <span className="muted">{ai.cards.length ? '문구가 바뀌었거나 만들지 못한 카드예요.' : '이 제품은 아직 AI 디자인 카드가 없어요.'}</span>
        </div>
      )}
      {ai.cards.length > 0 && (
        <>
          {ai.applied.length > 0 && (
            <div className="notice notice-warn" role="status">
              <p>[주의] {ai.applied.join('·')}번 최종 카드는 AI가 그린 문구예요. 승인 문구와 같은지 확인해 주세요.</p>
            </div>
          )}
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
                      <figcaption>AI 디자인{r?.applied ? ' · 최종 카드에 사용 중' : r?.stale ? ' · 문구가 바뀜' : ''}</figcaption>
                    </figure>
                  </div>
                  <div className="ai-card-meta">
                    <strong>{no}번</strong>
                    {r && (
                      <span className="muted">
                        시도 {r.tries.length}번{last?.diff != null ? ` · 제품 차이 ${last.diff}` : ''}
                        {last?.error ? ` · ${last.error}` : ''}
                      </span>
                    )}
                    <button className="btn btn-small" disabled={!can} onClick={() => onMake(no)}>
                      이 카드 다시 만들기
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

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
    <div className="panel figma-panel">
      <h3 className="panel-title">피그마에서 편집</h3>
      <p className="muted">
        {f.auto_push
          ? '누르면 최종 카드 1~5번을 피그마 파일의 새 페이지(제품명 · 날짜 시각)에 바로 넣어요. 2~4번은 글자·도형·사진 레이어, AI 디자인 카드는 완성 이미지로 들어가요. 1~3분 걸려요.'
          : '카드를 피그마 레이어(글자·도형·사진)로 보내 직접 고칠 수 있어요. 고친 카드는 피그마 플러그인에서 다시 이 화면으로 보내요.'}
      </p>
      <div className="action-bar">
        <button className="btn btn-primary" disabled={busy || Boolean(f.push?.running)} onClick={onPrepare}>
          {f.push?.running ? '피그마에 넣는 중…' : f.prepared_at ? '피그마에 다시 넣기 (새 페이지)' : '피그마에서 편집'}
        </button>
        {f.push?.ok && f.push.page_url && (
          <a className="btn" href={f.push.page_url} target="_blank" rel="noreferrer">
            넣은 페이지 열기
          </a>
        )}
        {f.file_url && (
          <a className="btn" href={f.file_url} target="_blank" rel="noreferrer">
            피그마 파일 열기
          </a>
        )}
      </div>
      {f.push && (
        <div className={`notice${f.push.ok === false ? ' notice-error' : ''}`} role="status">
          {f.push.running && <p>피그마에 카드를 넣는 중이에요 · 페이지 '{f.push.page_name}' (1~3분). 피그마 파일을 열어 두면 카드가 생기는 걸 바로 볼 수 있어요.</p>}
          {f.push.ok && <p>피그마에 넣었어요 · 페이지 '{f.push.page_name}' · {formatDateTime(f.push.finished_at ?? f.push.started_at)}</p>}
          {f.push.ok === false && <p>피그마에 넣지 못했어요: {f.push.error} — 다시 누르거나, 아래 플러그인으로 가져올 수 있어요.</p>}
        </div>
      )}
      {f.prepared_at && f.auto_push && (
        <details className="figma-manual">
          <summary>플러그인으로 직접 가져오기·고친 카드 보내기 (피그마 데스크톱)</summary>
          <ol className="figma-steps">
            <li>플러그인 › 개발 › 카드뉴스 작업실 연결 실행 (처음 한 번은 <code>figma-plugin/manifest.json</code> 등록)</li>
            <li>
              연결 코드{' '}
              <button type="button" className="figma-code" onClick={copy} title="눌러서 복사">
                {f.code}
              </button>
              {copied && <span className="muted"> 복사했어요</span>} → 연결 → <strong>{detail.name}</strong> → 가져오기 또는 고친 카드를 웹으로 보내기
            </li>
          </ol>
        </details>
      )}
      {f.prepared_at && !f.auto_push && (
        <ol className="figma-steps">
          <li>
            피그마 데스크톱에서 <strong>플러그인 › 개발 › 카드뉴스 작업실 연결</strong>을 실행해요 (처음 한 번은 <code>figma-plugin/manifest.json</code>을 불러와 등록).
          </li>
          <li>
            연결 코드{' '}
            <button type="button" className="figma-code" onClick={copy} title="눌러서 복사">
              {f.code}
            </button>
            {copied && <span className="muted"> 복사했어요</span>}를 넣고 연결 → <strong>{detail.name}</strong> 고르고 <strong>피그마로 가져오기</strong>. 가져올 때마다 날짜·시각이 붙은 새 페이지가 생겨서 이전에 고친 페이지는 그대로 남아요.
          </li>
          <li>
            다 고쳤으면 그 페이지를 연 채로 플러그인의 <strong>고친 카드를 웹으로 보내기</strong>를 누르면 아래에 나와요 (다른 페이지를 보고 있으면 이 제품의 가장 최근 페이지를 보내요).
          </li>
        </ol>
      )}
      {f.prepared_at && !f.auto_push && <p className="muted">준비한 시각 {formatDateTime(f.prepared_at)} · 작업실을 다시 켜면 연결 코드가 바뀌어요.</p>}
      {edited && (
        <div className="figma-edited">
          <h4 className="panel-subtitle">
            피그마에서 고친 카드 · {formatDateTime(edited.received_at)}
            {edited.page && <span className="muted"> · 페이지 '{edited.page}'</span>}
          </h4>
          {changedCards.length > 0 ? (
            <div className="notice notice-warn" role="status">
              <p>[주의] 피그마에서 문구가 바뀐 카드가 있어요. 이 문구는 원문 근거 검증을 거치지 않았어요. 문구를 바꾸려면 작업실의 수정 요청으로 고치는 게 원칙이에요 (근거 검증을 거침).</p>
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
            <button className="btn" disabled={zipping} onClick={downloadEdited}>
              {zipping ? 'ZIP 만드는 중…' : '고친 카드 ZIP 받기'}
            </button>
          </div>
        </div>
      )}
    </div>
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
