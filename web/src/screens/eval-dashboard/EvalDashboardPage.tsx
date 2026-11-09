// V3 평가 대시보드 — 평가 집계(eval/summary.json)의 모든 실행(중단 포함)을 보여준다
// 위에서 아래로: 요약 숫자 → 안전성(A7) → 핵심 정보(A2) → 품질 분포 → 처리 시간 → 오류 → 반복 일관성(A6) → 규칙 버전 비교(A5) → 실행 기록
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatDateTime, formatMinutes, formatPercent } from '../../data/format';
import {
  EXPECTED_LABELS,
  errorTotals,
  formatValue,
  headline,
  keyInfoMatrix,
  mean,
  repeatGroups,
  runsCsv,
  useEvalSummary,
  versionCompare,
  type EvalInput,
  type EvalRun,
} from '../../data/eval';
import { MetricCard, MetricGrid } from '../../components/MetricCard';
import { EmptyState, ErrorState, Loading } from '../../components/StateView';
import { downloadBlob } from '../../lib/download';
import { DataError } from '../../data/load';
import './eval-dashboard.css';

// ---- 공통: 마우스·키보드로 여는 설명 상자 ----
type TipState = { text: ReactNode; x: number; y: number } | null;
const TipContext = createContext<(el: HTMLElement | null, text?: ReactNode) => void>(() => {});
function useTip() {
  const show = useContext(TipContext);
  return (text: ReactNode) => ({
    tabIndex: 0,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(e.currentTarget, text),
    onFocus: (e: React.FocusEvent<HTMLElement>) => show(e.currentTarget, text),
    onMouseLeave: () => show(null),
    onBlur: () => show(null),
  });
}

const pct = formatPercent;
const minutes = (ms: number | null | undefined) => (ms === null || ms === undefined ? '—' : formatMinutes(ms / 60000));
const shortName = (inputs: EvalInput[], id: string) => {
  const name = inputs.find((i) => i.input_id === id)?.product_name;
  return name ? name.replace(/\s*\(평가용 가상 제품\)\s*$/, '') : id.replace(/^eval-/, '');
};
const runLabel = (r: EvalRun) => [r.skill_version, r.variant, r.repeat ? `r${r.repeat}` : null].filter(Boolean).join(' · ');

function Verdict({ pass }: { pass: boolean | null }) {
  if (pass === null) return <span className="verdict verdict-pending"><span aria-hidden>●</span> 판정 대기</span>;
  return pass ? <span className="verdict verdict-pass"><span aria-hidden>✓</span> 통과</span> : <span className="verdict verdict-fail"><span aria-hidden>✕</span> 미통과</span>;
}

// ---- 화면 ----
export function EvalDashboardPage() {
  const summary = useEvalSummary();
  const [params, setParams] = useSearchParams();
  const [tip, setTip] = useState<TipState>(null);
  const showTip = (el: HTMLElement | null, text?: ReactNode) => {
    if (!el) return setTip(null);
    const r = el.getBoundingClientRect();
    setTip({ text, x: Math.min(Math.max(r.left + r.width / 2, 120), innerWidth - 120), y: r.top });
  };

  if (summary.status === 'loading') return <div className="page"><Loading /></div>;
  if (summary.status === 'error') {
    if (summary.error instanceof DataError && summary.error.status === 404) return <div className="page"><Heading /><NoSummary /></div>;
    return <div className="page"><ErrorState error={summary.error} /></div>;
  }
  const { inputs, runs: all, generated_at } = summary.data;
  const filter = { batch: params.get('batch') ?? '', version: params.get('version') ?? '', model: params.get('model') ?? '' };
  const byModel = all.filter((r) => !filter.model || r.model === filter.model);
  const runs = byModel.filter((r) => (!filter.batch || r.batch === filter.batch) && (!filter.version || r.skill_version === filter.version));
  const set = (key: string, value: string) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (value) p.set(key, value);
      else p.delete(key);
      return p;
    });

  return (
    <TipContext.Provider value={showTip}>
      <div className="page eval-page">
        <Heading>
          <span className="results-count">집계 {formatDateTime(generated_at)} · 실행 {all.length}개</span>
        </Heading>
        {!all.length ? (
          <NoSummary />
        ) : (
          <>
            <Filters all={all} filter={filter} set={set} reset={() => setParams({})} />
            <MixedNotice runs={runs} />
            {!runs.length ? (
              <EmptyState title="조건에 맞는 평가 실행이 없어요"><button className="btn" onClick={() => setParams({})}>필터 초기화</button></EmptyState>
            ) : (
              <>
                <Kpis runs={runs} />
                <SafetySection inputs={inputs} runs={runs} />
                <KeyInfoSection inputs={inputs} runs={runs} />
                <QualitySection inputs={inputs} runs={runs} />
                <TimeSection inputs={inputs} runs={runs} />
                <ErrorSection runs={runs} />
                <RepeatSection inputs={inputs} runs={runs} />
                <VersionSection inputs={inputs} runs={byModel} />
                <RunsTable inputs={inputs} runs={runs} />
              </>
            )}
            <Caveats />
          </>
        )}
        {tip ? <div className="viz-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null}
      </div>
    </TipContext.Provider>
  );
}

function Heading({ children }: { children?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">QUALITY OVERVIEW</p>
        <h1 className="page-title">평가 대시보드</h1>
        <p className="page-desc">평가 입력을 같은 규칙으로 반복 제작한 결과예요. 중단된 실행과 경계 입력도 모두 포함해요. {children}</p>
      </div>
      <Link className="btn" to="/compare">결과 비교 →</Link>
    </div>
  );
}

function NoSummary() {
  return (
    <EmptyState title="아직 평가 집계가 없어요">
      <p>평가를 돌린 컴퓨터에서 <code>npm run export</code>를 실행하면 <code>eval/summary.json</code>이 만들어져요. 다른 폴더에서 돌렸다면 <code>npm run export -- --eval-runs &lt;그 폴더&gt;/eval/runs</code>.</p>
      <Link className="btn" to="/">제작 결과 살펴보기</Link>
    </EmptyState>
  );
}

function Filters({ all, filter, set, reset }: { all: EvalRun[]; filter: Record<'batch' | 'version' | 'model', string>; set: (k: string, v: string) => void; reset: () => void }) {
  const opts = (f: (r: EvalRun) => string | null) => [...new Set(all.map(f).filter((x): x is string => Boolean(x)))].sort();
  const active = filter.batch || filter.version || filter.model;
  return (
    <div className="toolbar eval-filters">
      <select aria-label="실행 묶음" value={filter.batch} onChange={(e) => set('batch', e.target.value)}>
        <option value="">모든 실행 묶음</option>
        {opts((r) => r.batch).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <select aria-label="규칙 버전" value={filter.version} onChange={(e) => set('version', e.target.value)}>
        <option value="">모든 규칙 버전</option>
        {opts((r) => r.skill_version).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <select aria-label="모델" value={filter.model} onChange={(e) => set('model', e.target.value)}>
        <option value="">모든 모델</option>
        {opts((r) => r.model).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      {active ? <button className="btn btn-ghost" onClick={reset}>필터 초기화</button> : null}
    </div>
  );
}

function MixedNotice({ runs }: { runs: EvalRun[] }) {
  const versions = new Set(runs.map((r) => r.skill_version));
  const models = new Set(runs.map((r) => r.model ?? '기록 없음'));
  if (versions.size < 2 && models.size < 2) return null;
  const parts = [versions.size > 1 ? `규칙 버전 ${versions.size}개` : null, models.size > 1 ? `모델 ${models.size}종` : null].filter(Boolean).join('·');
  return <p className="notice">지금 숫자에는 {parts}가 섞여 있어요. 조건을 하나로 고른 뒤 해석하고, 버전 차이는 아래 ‘규칙 버전 비교’에서 같은 입력끼리 보세요.</p>;
}

function Kpis({ runs }: { runs: EvalRun[] }) {
  const h = headline(runs);
  return (
    <MetricGrid>
      <MetricCard label="평가 실행" value={h.runs} hint={`완료 ${h.completed} · 중단 ${h.stopped} · 정상 입력 ${h.normal} · 경계 입력 ${h.boundary}`} />
      <MetricCard label="1회 통과율" value={pct(h.firstPass)} hint={`정상 입력 ${h.firstPassN}건 · 첫 검사에서 오류 0개`} />
      <MetricCard label="핵심 정보 포함률" value={pct(h.keyInfo)} hint={`정상 입력 ${h.keyInfoN}건 평균 · 체크리스트 기준`} />
      <MetricCard label="안전성 충족률" value={pct(h.safety)} hint={`경계 입력 ${h.safetyN}건 · 기대 동작을 모두 지킴`} />
      <MetricCard label="사람 판정 대기" value={h.pending} hint={h.pending ? '자동으로 판정할 수 없는 금지 항목이 있어요' : '모두 판정됨'} />
    </MetricGrid>
  );
}

function Section({ id, title, desc, children, aside }: { id: string; title: string; desc?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section eval-section" aria-labelledby={id}>
      <div className="eval-section-head">
        <div>
          <h2 className="section-title" id={id}>{title}</h2>
          {desc ? <p className="eval-section-desc">{desc}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ---- A7 안전성: 경계 입력의 기대 동작 (입력마다 카드 하나, 표는 가장 최근 실행) ----
const cleanWhere = (v: string) => v.replace(/^#+\s*/, '');
function ExpectedValue({ value }: { value: unknown }) {
  const tip = useTip();
  if (Array.isArray(value) && value.length > 2) {
    const items = value.map((x) => cleanWhere(String(x)));
    return <span className="has-tip" aria-label={items.join(', ')} {...tip(items.join(' · '))}>{items.length}곳</span>;
  }
  return <>{Array.isArray(value) ? formatValue(value.map((x) => cleanWhere(String(x)))) : formatValue(value)}</>;
}
function SafetySection({ inputs, runs }: { inputs: EvalInput[]; runs: EvalRun[] }) {
  const boundary = runs.filter((r) => r.input_type === 'boundary');
  const ids = [...new Set(boundary.map((r) => r.input_id))];
  return (
    <Section id="eval-safety" title="안전성 테스트 (경계 입력)" desc="입력 누락·지시문·과장된 원문·긴 원문에서 기대한 대로 멈추거나 걸러냈는지 봐요. 표는 그 입력의 가장 최근 실행이에요.">
      {!ids.length ? (
        <p className="muted">이 조건에는 경계 입력 실행이 없어요.</p>
      ) : (
        <div className="safety-grid">
          {ids.map((id) => {
            const rs = boundary.filter((r) => r.input_id === id);
            const r = rs[rs.length - 1]!;
            const input = inputs.find((i) => i.input_id === id);
            const forb = r.checks.forbidden;
            const count = (v: boolean | null) => rs.filter((x) => x.checks.pass === v).length;
            return (
              <article className="panel safety-card" key={id}>
                <header>
                  <div>
                    <h3>{shortName(inputs, id)}</h3>
                    <p className="muted">{input?.case.replace(/^경계 · /, '').replace(/\s*\(.*\)$/, '') ?? id}</p>
                  </div>
                  <Verdict pass={r.checks.pass} />
                </header>
                <p className="safety-runs">
                  실행 {rs.length}회 · 통과 {count(true)} · 미통과 {count(false)}{count(null) ? ` · 판정 대기 ${count(null)}` : ''}
                  <span className="muted"> · 표: {runLabel(r)}</span>
                </p>
                <table className="table table-compact">
                  <thead>
                    <tr><th>기대 동작</th><th>기대</th><th>실제</th><th><span className="sr-only">판정</span></th></tr>
                  </thead>
                  <tbody>
                    {r.checks.expected.map((e) => (
                      <tr key={e.name} className={e.pass ? '' : 'row-fail'}>
                        <td>{EXPECTED_LABELS[e.name] ?? e.name}</td>
                        <td><ExpectedValue value={e.expected} /></td>
                        <td><ExpectedValue value={e.actual} /></td>
                        <td>{e.pass ? <span className="ok-mark" aria-label="맞음">✓</span> : <span className="fail-mark" aria-label="다름">✕</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="safety-forbidden">
                  금지 항목 {forb.length}개 · 카드에 나옴 <strong>{forb.filter((f) => f.found === true).length}</strong> · 판정 대기 <strong>{forb.filter((f) => f.found === null).length}</strong>
                  {forb.some((f) => f.by_human) ? ` · 사람 판정 ${forb.filter((f) => f.by_human).length}` : ''}
                </p>
                {forb.some((f) => f.found !== false) ? (
                  <ul className="forbidden-list">
                    {forb.filter((f) => f.found !== false).map((f) => (
                      <li key={f.id}><Verdict pass={f.found === null ? null : false} /> {f.id} {input?.forbidden.find((x) => x.id === f.id)?.text}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ---- 핵심 정보: 입력 × K 히트맵 ----
function KeyInfoSection({ inputs, runs }: { inputs: EvalInput[]; runs: EvalRun[] }) {
  const rows = keyInfoMatrix(inputs, runs);
  const tip = useTip();
  const width = Math.max(1, ...rows.map((r) => r.cells.length));
  if (!rows.length) return null;
  return (
    <Section id="eval-keyinfo" title="핵심 정보 포함" desc="체크리스트의 핵심 정보가 카드 근거(원문 인용)에 쓰였는지, 같은 입력의 실행을 합쳐 비율로 보여줘요. 진할수록 자주 들어감.">
      <div className="heat-wrap">
        <div className="heat" style={{ gridTemplateColumns: `minmax(120px, 1.4fr) repeat(${width}, minmax(44px, 1fr))` }} role="table" aria-label="핵심 정보 포함 비율">
          <div className="heat-corner" role="columnheader">평가 입력</div>
          {Array.from({ length: width }, (_, i) => <div key={i} className="heat-col" role="columnheader">K{i + 1}</div>)}
          {rows.map((row) => (
            <div className="heat-row" role="row" key={row.input.input_id}>
              <div className="heat-label" role="rowheader">
                {shortName(inputs, row.input.input_id)}
                <span className="muted"> · {row.runs}회</span>
              </div>
              {Array.from({ length: width }, (_, i) => {
                const c = row.cells[i];
                if (!c) return <div key={i} className="heat-cell heat-none" role="cell" aria-label="항목 없음" />;
                const rate = c.total ? c.hits / c.total : 0;
                return (
                  <div
                    key={c.id}
                    role="cell"
                    className={`heat-cell${rate >= 0.6 ? ' heat-dark' : ''}${rate < 1 ? ' heat-missed' : ''}`}
                    style={{ ['--heat' as string]: `${Math.round(10 + rate * 80)}%` }}
                    aria-label={`${c.id} ${c.text}: ${c.total}회 중 ${c.hits}회 포함`}
                    {...tip(
                      <>
                        <strong>{c.id} · {c.text}</strong>
                        <br />근거에 포함 {c.hits}/{c.total}회{c.section ? ` · 원문 ‘${c.section}’` : ''}
                        {c.copyTotal ? <><br />카드 문구에 표기 그대로 {c.copyHits}/{c.copyTotal}회</> : null}
                      </>,
                    )}
                  >
                    {c.total === 1 ? (c.hits ? '✓' : '✕') : `${c.hits}/${c.total}`}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="heat-legend" aria-hidden>
          <span>0%</span>
          <span className="heat-scale" />
          <span>100%</span>
          <span className="muted">✕·점선 = 빠진 적 있음</span>
        </div>
      </div>
    </Section>
  );
}

// 값이 가까운 점은 위아래로 비켜 놓는다 (0, +1, -1, +2, -2 …번째 줄). 반환: 점마다 줄 번호
function swarm(values: number[], gap = 0.025) {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const placed = new Map<number, number[]>();
  const lanes = new Array<number>(values.length).fill(0);
  for (const [v, i] of order) {
    for (let k = 0; ; k++) {
      const lane = k === 0 ? 0 : k % 2 ? (k + 1) / 2 : -k / 2;
      const xs = placed.get(lane) ?? [];
      if (xs.every((x) => Math.abs(x - v) >= gap)) {
        placed.set(lane, [...xs, v]);
        lanes[i] = lane;
        break;
      }
    }
  }
  return lanes;
}

// ---- 품질 지표 분포: 지표마다 0~100% 위에 실행 점 ----
const QUALITY = [
  { key: 'key_info_rate', label: '핵심 정보 포함률' },
  { key: 'coverage', label: '원문 커버리지' },
  { key: 'evidence_rate', label: '근거 연결률' },
  { key: 'char_usage', label: '글자 수 활용률(평균)' },
  { key: 'char_usage_max', label: '글자 수 활용률(최대)' },
] as const;
function QualitySection({ inputs, runs }: { inputs: EvalInput[]; runs: EvalRun[] }) {
  const tip = useTip();
  const done = runs.filter((r) => r.outcome.result === '완료');
  if (!done.length) return null;
  return (
    <Section id="eval-quality" title="품질 지표 분포" desc="점 하나가 실행 하나예요. 가운데 세로줄은 평균. 경계 입력은 속이 빈 점이에요.">
      <div className="strips">
        {QUALITY.map((q) => {
          const pts = done.filter((r) => r.metrics[q.key] !== null);
          const avg = mean(pts.map((r) => r.metrics[q.key]));
          const lanes = swarm(pts.map((r) => r.metrics[q.key] as number));
          const spread = Math.max(0, ...lanes.map(Math.abs));
          return (
            <div className="strip" key={q.key}>
              <div className="strip-label">{q.label}</div>
              <div className="strip-track" role="list" aria-label={`${q.label} 실행별 값`} style={{ height: 34 + spread * 26 }}>
                {[0, 0.5, 1].map((g) => <span key={g} className="strip-grid" style={{ left: `${g * 100}%` }} />)}
                {avg !== null ? <span className="strip-mean" style={{ left: `${avg * 100}%` }} /> : null}
                {pts.map((r, i) => {
                  const v = Math.max(0, Math.min(1, r.metrics[q.key] as number));
                  return (
                    <span
                      key={r.run_id}
                      role="listitem"
                      className={`strip-dot${r.input_type === 'boundary' ? ' strip-dot-hollow' : ''}`}
                      style={{ left: `${v * 100}%`, top: `calc(50% + ${lanes[i]! * 13}px)` }}
                      aria-label={`${shortName(inputs, r.input_id)} ${runLabel(r)}: ${pct(v)}`}
                      {...tip(<><strong>{shortName(inputs, r.input_id)}</strong> · {runLabel(r)}<br />{q.label} {pct(v)}</>)}
                    />
                  );
                })}
              </div>
              <div className="strip-value">{pct(avg)}</div>
            </div>
          );
        })}
        <div className="strip strip-axis" aria-hidden>
          <div />
          <div className="strip-ticks"><span>0%</span><span>50%</span><span>100%</span></div>
          <div />
        </div>
      </div>
    </Section>
  );
}

// ---- 처리 시간: 실행마다 구성안 + 문구·출력 ----
function TimeSection({ inputs, runs }: { inputs: EvalInput[]; runs: EvalRun[] }) {
  const tip = useTip();
  const rows = runs
    .map((r) => ({ r, plan: r.jobs.find((j) => j.kind === 'plan')?.duration_ms ?? 0, copy: r.jobs.find((j) => j.kind === 'copy')?.duration_ms ?? 0 }))
    .filter((x) => x.plan + x.copy > 0)
    .sort((a, b) => b.plan + b.copy - (a.plan + a.copy));
  if (!rows.length) return null;
  const max = Math.max(...rows.map((x) => x.plan + x.copy));
  const avg = mean(rows.map((x) => x.plan + x.copy));
  return (
    <Section
      id="eval-time"
      title="AI 작업 시간"
      desc={<>사람 확인 대기는 빼고 <code>claude -p</code>가 일한 시간만이에요. 평균 {minutes(avg)}.</>}
      aside={<div className="legend"><span><i className="sw sw-1" />구성안</span><span><i className="sw sw-2" />문구·출력</span></div>}
    >
      <div className="bars">
        {rows.map(({ r, plan, copy }) => (
          <div className="bar-row" key={r.run_id}>
            <div className="bar-label">{shortName(inputs, r.input_id)} <span className="muted">{runLabel(r)}</span></div>
            <div className="bar-track">
              <span
                className="bar-seg bar-1"
                style={{ width: `${(plan / max) * 100}%` }}
                aria-label={`구성안 ${minutes(plan)}`}
                {...tip(<><strong>{shortName(inputs, r.input_id)}</strong> · {runLabel(r)}<br />구성안 {minutes(plan)}{r.jobs[0]?.num_turns ? ` · ${r.jobs[0].num_turns}턴` : ''}</>)}
              />
              {copy ? (
                <span
                  className="bar-seg bar-2"
                  style={{ width: `${(copy / max) * 100}%` }}
                  aria-label={`문구·출력 ${minutes(copy)}`}
                  {...tip(<><strong>{shortName(inputs, r.input_id)}</strong> · {runLabel(r)}<br />문구·출력 {minutes(copy)}{r.jobs[1]?.num_turns ? ` · ${r.jobs[1].num_turns}턴` : ''}</>)}
                />
              ) : null}
              <span className="bar-total">{minutes(plan + copy)}{r.outcome.result !== '완료' ? ' · 중단' : ''}</span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---- 오류 코드·자동 수정·중단 원인 ----
function ErrorSection({ runs }: { runs: EvalRun[] }) {
  const { codes, stops, autoFix } = errorTotals(runs);
  const max = Math.max(1, ...codes.map((c) => c.count));
  const tip = useTip();
  return (
    <Section id="eval-errors" title="검증 오류와 자동 수정" desc="자동 수정 전까지 포함한 검증 오류 수예요. 끝까지 남은 오류는 실행 기록의 ‘남은 오류’에서 봐요.">
      <div className="error-layout">
        <div className="error-stats">
          <div><span className="big">{codes.reduce((a, c) => a + c.count, 0)}</span><span className="muted">검증 오류</span></div>
          <div><span className="big">{autoFix}</span><span className="muted">자동 수정</span></div>
          <div><span className="big">{stops.reduce((a, s) => a + s.count, 0)}</span><span className="muted">중단</span></div>
        </div>
        <div>
          {!codes.length ? (
            <p className="muted">이 조건의 실행에서는 검증 오류가 한 번도 나지 않았어요.</p>
          ) : (
            <div className="bars">
              {codes.map((c) => (
                <div className="bar-row" key={c.code}>
                  <div className="bar-label"><code>{c.code}</code></div>
                  <div className="bar-track">
                    <span className="bar-seg bar-1" style={{ width: `${(c.count / max) * 100}%` }} aria-label={`${c.code} ${c.count}건`} {...tip(<><code>{c.code}</code> {c.count}건 · 실행 {c.runs}개에서</>)} />
                    <span className="bar-total">{c.count}건</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {stops.length ? <p className="eval-section-desc">중단 원인: {stops.map((s) => `${s.code} ${s.count}건`).join(' · ')}</p> : null}
        </div>
      </div>
    </Section>
  );
}

// ---- A6 반복 일관성 ----
function RepeatSection({ inputs, runs }: { inputs: EvalInput[]; runs: EvalRun[] }) {
  const groups = repeatGroups(runs);
  const range = (x: { min: number; max: number } | null) => (!x ? '—' : x.min === x.max ? pct(x.min) : `${pct(x.min)}~${pct(x.max)}`);
  return (
    <Section id="eval-repeat" title="반복 일관성" desc="같은 입력·규칙·모델로 여러 번 돌렸을 때 결과가 얼마나 흔들리는지 봐요. 범위가 좁을수록 안정적이에요.">
      {!groups.length ? (
        <p className="muted">같은 조건으로 반복한 실행이 아직 없어요. 계획은 입력 4개 × 3회(<code>--batch v1-repeat --repeat 3</code>)예요.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>평가 입력</th><th>규칙</th><th>실행</th><th>1회 통과</th><th>핵심 정보</th><th>커버리지</th><th>카드 수</th><th>디자인 묶음</th><th>판정 통과</th></tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={`${g.input_id}|${g.skill_version}|${g.variant}|${g.model}`}>
                  <td>{shortName(inputs, g.input_id)}</td>
                  <td>{[g.skill_version, g.variant].filter(Boolean).join(' · ')}</td>
                  <td>{g.runs}회 (완료 {g.completed})</td>
                  <td>{g.firstPass}/{g.runs}</td>
                  <td>{range(g.keyInfo)}</td>
                  <td>{range(g.coverage)}</td>
                  <td>{g.cardCounts.length ? g.cardCounts.join(' / ') : '—'}{g.cardCounts.length > 1 ? ' (달라짐)' : ''}</td>
                  <td>{g.designs.length ? `${g.designs.length}종` : '—'}</td>
                  <td>{g.checksPass}/{g.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ---- A5 규칙 버전 비교 ----
function VersionSection({ inputs, runs }: { inputs: EvalInput[]; runs: EvalRun[] }) {
  const { versions, rows, shared } = useMemo(() => versionCompare(runs), [runs]);
  return (
    <Section id="eval-version" title="규칙 버전 비교" desc="비교판이 아닌 실행 중, 모든 버전이 함께 돌린 입력만 골라 같은 기준으로 비교해요. 실행 묶음·버전 필터는 적용하지 않아요.">
      {versions.length < 2 ? (
        <p className="muted">규칙 버전이 {versions.length ? `${versions[0]} 하나` : '없어요'}예요. v2 평가를 돌리면 이곳에서 v1과 나란히 비교해요.</p>
      ) : !shared.length ? (
        <p className="muted">두 버전이 함께 돌린 평가 입력이 없어서 비교할 수 없어요.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>지표</th>{versions.map((v) => <th key={v}>{v}</th>)}<th>변화 ({versions[0]}→{versions[versions.length - 1]})</th></tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const first = m.values[0] ?? null;
                  const last = m.values[m.values.length - 1] ?? null;
                  const d = first !== null && last !== null ? Math.round((last - first) * 100) : null;
                  return (
                    <tr key={m.key}>
                      <td>{m.label}<span className="muted"> · {m.normalOnly ? '정상 입력' : '경계 입력'}</span></td>
                      {m.values.map((v, i) => <td key={versions[i]}>{pct(v)}</td>)}
                      <td>{d === null ? '—' : d === 0 ? '변화 없음' : <span className={d > 0 ? 'delta-up' : 'delta-down'}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}%p</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="eval-section-desc">비교한 입력 {shared.length}개: {shared.map((id) => shortName(inputs, id)).join(', ')}</p>
        </>
      )}
    </Section>
  );
}

// ---- 실행 기록 표 + CSV ----
function RunsTable({ inputs, runs }: { inputs: EvalInput[]; runs: EvalRun[] }) {
  const download = () => downloadBlob(new Blob(['﻿' + runsCsv(runs, inputs)], { type: 'text/csv;charset=utf-8' }), 'eval-runs.csv');
  return (
    <Section id="eval-runs" title="실행 기록" desc="실행 하나가 한 줄이에요. 완료된 실행은 카드 결과를 열어볼 수 있어요." aside={<button className="btn" onClick={download}>CSV 내려받기</button>}>
      <div className="table-wrap">
        <table className="table eval-runs">
          <thead>
            <tr><th>평가 입력</th><th>조건</th><th>결과</th><th>1회 통과</th><th>핵심 정보</th><th>커버리지</th><th>남은 오류</th><th>AI 시간</th><th>판정</th><th /></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.run_id}>
                <td>
                  {shortName(inputs, r.input_id)}
                  <br />
                  <span className="muted">{r.input_type === 'boundary' ? '경계' : '정상'} · {r.input_id}</span>
                </td>
                <td>{runLabel(r)}<br /><span className="muted">{r.batch ?? '—'} · {r.model ?? '모델 기록 없음'}</span></td>
                <td>{r.outcome.result === '완료' ? `완료 · ${r.outcome.card_count ?? '—'}장` : <span className="fail-text">중단 · {r.outcome.error_code ?? '원인 없음'}</span>}</td>
                <td>{r.metrics.first_pass === null ? '—' : r.metrics.first_pass ? '통과' : `수정 ${r.metrics.auto_fix_count ?? 0}회`}</td>
                <td>{pct(r.metrics.key_info_rate)}</td>
                <td>{pct(r.metrics.coverage)}</td>
                <td>{r.metrics.final_error_count ?? '—'}</td>
                <td>{minutes(r.metrics.duration_ms)}</td>
                <td><Verdict pass={r.checks.pass} /></td>
                <td>{r.project_id ? <Link to={`/projects/${r.project_id}`}>카드 보기 →</Link> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Caveats() {
  return (
    <section className="section">
      <h2 className="section-title">해석할 때 주의할 점</h2>
      <ul className="caveats">
        <li>핵심 정보 포함률·원문 커버리지는 <strong>글자 비교로 낸 근사치</strong>예요. 같은 뜻을 다르게 쓰면 놓칠 수 있어 사람 검토가 함께 필요해요.</li>
        <li>평가 입력은 대부분 <strong>가상 자료</strong>예요. 실제 제품 결과와 섞어 일반화하지 않아요.</li>
        <li>모델·날짜·규칙 버전이 다르면 같은 표에서 비교하지 않아요. 위의 필터로 조건을 하나로 맞춰 보세요.</li>
        <li>AI 작업 시간은 <code>claude -p</code> 실행 시간이에요. 사람이 확인하는 시간은 들어 있지 않아요.</li>
        <li>‘판정 대기’는 자동으로 판정할 수 없는 금지 항목이에요. 사람이 <code>eval/judgments.json</code>에 판정을 남기면 다시 집계돼요.</li>
      </ul>
    </section>
  );
}
