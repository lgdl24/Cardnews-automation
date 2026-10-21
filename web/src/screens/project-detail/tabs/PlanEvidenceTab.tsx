// V2 구성안·근거 — 담당 이용석
// 읽는 데이터: project.json analysis · sources · cards[](intent · evidence · copy · chars · cautions · revisions) · plan_revisions · quality
// 레이아웃: Figma 'V2 구성안·근거 (이용석)' 68:403, 노션 '웹 화면 설계' 'V2 구성안·근거 레이아웃'
//   위: 핵심 메시지 + 근거 칩, 카드 번호
//   가운데: 왼쪽 선택한 카드 PNG / 오른쪽 카드 구성 → 문구↔원문 → [주의]·글자 수 → 수정 요청 이력
//   아래: 구성안 전체 표, 구성안 수정 이력, [참고] 카드에 쓰이지 않은 원문
// 보기 전용: 승인·수정 요청은 로컬 제작 화면(S3)에서 함
import { Fragment, useId, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { projectFileUrl } from '../../../data/load';
import { formatDateTime, formatPercent, label } from '../../../data/format';
import type { Card, CharRow, Labels, Project, Revision, Source, SourceId } from '../../../data/types';
import { useProjectContext } from '../ProjectDetailPage';
import './plan-evidence.css';

type SourceMap = Map<SourceId, Source>;

const FIELD_NAMES: Record<string, string> = {
  title: '제목',
  subtitle: '부제',
  badge: '뱃지',
  caption: '설명',
  items: '항목',
};

const fieldName = (field: string, index: number | null) =>
  `${FIELD_NAMES[field] ?? field}${index === null ? '' : ` ${index + 1}`}`;

/** 선택한 카드는 주소(?card=2)에 둬서 링크로 공유됨 (카드 결과 탭과 같은 이름) */
function useSelectedCard(cards: Card[]) {
  const [params, setParams] = useSearchParams();
  const no = Number(params.get('card'));
  const card = cards.find((c) => c.no === no) ?? cards[0] ?? null;
  const select = (n: number) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('card', String(n));
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  return { card, select };
}

export function PlanEvidenceTab() {
  const { project, labels } = useProjectContext();
  const sources: SourceMap = new Map(project.sources.map((s) => [s.id, s]));
  const { card, select } = useSelectedCard(project.cards);
  const selectedArea = useRef<HTMLDivElement>(null);
  const selectFromTable = (no: number) => {
    select(no);
    selectedArea.current?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="pe">
      <CoreMessage project={project} sources={sources} />

      {card ? (
        <div ref={selectedArea} className="pe-selected">
          <CardPicker cards={project.cards} selected={card.no} onSelect={select} />
          <div className="pe-main">
            <CardPreview key={`${project.id}-${card.no}-${card.png}`} card={card} projectId={project.id} labels={labels} />

            <div className="pe-side">
              <CardPlan card={card} labels={labels} sources={sources} />
              <CopyEvidence card={card} sources={sources} />
              <CautionsAndChars card={card} />
              <RevisionList title="이 카드 수정 요청 이력" revisions={card.revisions} labels={labels} />
            </div>
          </div>
        </div>
      ) : (
        <p className="pe-empty">카드가 없어요.</p>
      )}

      <PlanTable project={project} labels={labels} sources={sources} selected={card?.no ?? null} onSelect={selectFromTable} />
      <section className="section">
        <RevisionList title="구성안 수정 요청 이력" revisions={project.plan_revisions} labels={labels} />
      </section>
      <Coverage project={project} />
    </div>
  );
}

function CardPreview({ card, projectId, labels }: { card: Card; projectId: string; labels: Labels }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <figure className="pe-preview panel">
      <figcaption className="pe-preview-head">
        <strong>{card.no}번 카드</strong>
        <span className="muted">
          {label(labels.roles, card.role)} · {label(labels.templates, card.template)}
        </span>
      </figcaption>
      {!card.copy ? (
        <p className="pe-empty pe-image-empty">아직 문구 단계 전이라 카드 이미지가 없어요.</p>
      ) : imageFailed ? (
        <div className="pe-empty pe-image-empty" role="status">
          <p>카드 이미지를 불러오지 못했어요.</p>
          <p>문구와 원문 근거는 계속 확인할 수 있어요.</p>
        </div>
      ) : (
        <img
          src={projectFileUrl(projectId, card.png)}
          alt={`${card.no}번 카드 (${label(labels.roles, card.role)})`}
          width={1080}
          height={1080}
          onError={() => setImageFailed(true)}
        />
      )}
    </figure>
  );
}

// ── 근거 칩: 터치·키보드로 원문 열기. 연결 범위는 카드 단위 그대로 유지.
function EvidenceChips({ ids, sources }: { ids: SourceId[]; sources: SourceMap }) {
  const [opened, setOpened] = useState<SourceId | null>(null);
  const detailId = useId();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const activeSource = opened && ids.includes(opened) ? sources.get(opened) : null;
  const close = () => {
    setOpened(null);
    trigger.current?.focus();
  };
  if (ids.length === 0) return <span className="muted">근거 없음</span>;
  return (
    <span className="pe-evidence" onKeyDown={(event) => {
      if (event.key === 'Escape' && opened) {
        event.stopPropagation();
        close();
      }
    }}>
      <span className="pe-chips">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            className="pe-chip pe-chip-button"
            aria-label={`${id} 원문 근거 보기`}
            aria-expanded={opened === id}
            aria-controls={detailId}
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setOpened(opened === id ? null : id);
            }}
          >
            {id}
          </button>
        ))}
      </span>
      {opened && ids.includes(opened) && (
        <span className="pe-source-detail" id={detailId} role="region" aria-label={`${opened} 원문 근거`}>
          <span className="pe-source-head">
            <strong>{opened} · {activeSource?.section ?? '근거 확인 필요'}</strong>
            <button type="button" className="pe-source-close" aria-label="원문 닫기" onClick={close}>닫기</button>
          </span>
          <q>{activeSource?.quote ?? '원문에서 찾을 수 없는 근거예요.'}</q>
        </span>
      )}
    </span>
  );
}

function QuoteList({ ids, sources }: { ids: SourceId[]; sources: SourceMap }) {
  return (
    <ul className="pe-quotes">
      {ids.map((id) => {
        const s = sources.get(id);
        return (
          <li key={id} className="pe-quote">
            <span className="pe-quote-head">
              <span className="pe-chip">{id}</span> {s?.section ?? '—'}
            </span>
            <q>{s?.quote ?? '원문에서 찾을 수 없는 근거예요'}</q>
          </li>
        );
      })}
    </ul>
  );
}

function CoreMessage({ project, sources }: { project: Project; sources: SourceMap }) {
  const { core_message, core_evidence } = project.analysis;
  return (
    <section className="pe-core panel" aria-labelledby="pe-core-title">
      <h2 className="pe-label" id="pe-core-title">
        핵심 메시지
      </h2>
      <p className="pe-core-message">
        {core_message} <EvidenceChips ids={core_evidence} sources={sources} />
      </p>
      <details className="pe-details">
        <summary>원문 근거 보기</summary>
        <QuoteList ids={core_evidence} sources={sources} />
      </details>
    </section>
  );
}

function CardPicker({ cards, selected, onSelect }: { cards: Card[]; selected: number; onSelect: (n: number) => void }) {
  return (
    <nav className="pe-picker" aria-label="카드 선택">
      {cards.map((c) => (
        <button
          key={c.no}
          type="button"
          className="pe-picker-button"
          aria-label={`${c.no}번 카드${c.cautions.length ? `, 주의 표현 ${c.cautions.length}건` : ''}`}
          aria-current={c.no === selected ? 'true' : undefined}
          onClick={() => onSelect(c.no)}
        >
          {c.no}
          {c.cautions.length > 0 && <span className="pe-picker-dot" aria-label="[주의] 있음" />}
        </button>
      ))}
    </nav>
  );
}

function CardPlan({ card, labels, sources }: { card: Card; labels: Labels; sources: SourceMap }) {
  return (
    <section className="pe-box panel" aria-label={`${card.no}번 카드 구성`}>
      <h3 className="pe-box-title">{card.no}번 카드 구성</h3>
      <p className="pe-meta">
        역할 {label(labels.roles, card.role)} · 템플릿 {label(labels.templates, card.template)}
      </p>
      <p className="pe-intent">{card.intent}</p>
      <EvidenceChips ids={card.evidence} sources={sources} />
    </section>
  );
}

/** 문구 칸 글자 (items는 항목 번호로) */
function fieldText(card: Card, row: Pick<CharRow, 'field' | 'index'>) {
  const v = card.copy?.[row.field];
  if (row.index === null) return typeof v === 'string' ? v : '';
  return Array.isArray(v) ? (v[row.index] ?? '') : '';
}

/** 글자 안의 [주의] 표현을 강조 */
function highlight(text: string, terms: string[]): ReactNode {
  const uniqueTerms = [...new Set(terms)].filter(Boolean).sort((a, b) => b.length - a.length);
  if (uniqueTerms.length === 0) return text;
  const pattern = new RegExp(`(${uniqueTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text.split(pattern).map((part, i) =>
    uniqueTerms.includes(part) ? (
      <mark key={i} className="pe-mark">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function CopyEvidence({ card, sources }: { card: Card; sources: SourceMap }) {
  return (
    <section className="pe-box panel" aria-labelledby={`pe-copy-${card.no}`}>
      <h3 className="pe-box-title" id={`pe-copy-${card.no}`}>
        문구 ↔ 원문 근거
      </h3>
      {card.chars.length === 0 ? (
        <p className="muted">아직 문구가 없어요 (구성안 단계).</p>
      ) : (
        <dl className="pe-fields">
          {card.chars.map((row) => {
            const terms = card.cautions
              .filter((c) => c.fields.some((f) => f.field === row.field && f.index === row.index))
              .map((c) => c.term);
            return (
              <div key={`${row.field}-${row.index}`} className="pe-field">
                <dt>
                  {fieldName(row.field, row.index)}{' '}
                  <span className={row.ratio > 1 ? 'pe-count pe-over' : 'pe-count'}>
                    ({row.chars} / {row.limit}자)
                  </span>
                  {terms.length > 0 && <span className="pe-caution-tag">[주의]</span>}
                </dt>
                <dd className="pe-copy">{highlight(fieldText(card, row), terms)}</dd>
              </div>
            );
          })}
        </dl>
      )}
      <h4 className="pe-sub">연결된 원문</h4>
      <p className="pe-note">아래 원문은 이 카드 전체에 연결된 근거예요.</p>
      {card.evidence.length ? (
        <QuoteList ids={card.evidence} sources={sources} />
      ) : (
        <p className="muted">{card.role === 'cover' || card.role === 'closing' ? '연결된 근거 없음 (표지·마무리 카드)' : '연결된 원문 근거가 없어요. 확인이 필요해요.'}</p>
      )}
    </section>
  );
}

function CautionsAndChars({ card }: { card: Card }) {
  return (
    <section className="pe-box panel" aria-labelledby={`pe-caution-${card.no}`}>
      <h3 className="pe-box-title" id={`pe-caution-${card.no}`}>
        [주의] 표현 {card.cautions.length}건 · 글자 수 활용률
      </h3>
      {card.cautions.length > 0 && (
        <ul className="pe-cautions">
          {card.cautions.map((c) => (
            <li key={c.term} className={c.in_source ? 'pe-caution' : 'pe-caution pe-caution-new'}>
              <span className="pe-caution-term">
                ‘{c.term}’ · {c.category}
              </span>
              <span>
                {c.fields.map((f) => fieldName(f.field, f.index)).join(', ') || '—'} ·{' '}
                {c.in_source ? '원문에 있음' : '원문에 없음 — 확인 필요'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {card.cautions.length === 0 && <p className="pe-note">표시된 주의 표현이 없어요.</p>}
      {card.chars.length > 0 && (
        <ul className="pe-bars">
          {card.chars.map((row) => (
            <li key={`${row.field}-${row.index}`} className="pe-bar-row">
              <span className="pe-bar-label">{fieldName(row.field, row.index)}</span>
              <span
                className="pe-bar"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.max(0, Math.min(row.ratio * 100, 100))}
                aria-valuetext={`${row.chars} / ${row.limit}자 · ${formatPercent(row.ratio)}${row.ratio > 1 ? ' · 기준 초과' : ''}`}
                aria-label={`${fieldName(row.field, row.index)} 글자 수`}
              >
                <span className={row.ratio > 1 ? 'pe-bar-fill pe-over-bg' : 'pe-bar-fill'} style={{ width: `${Math.min(row.ratio, 1) * 100}%` }} />
              </span>
              <span className="pe-bar-value">{formatPercent(row.ratio)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RevisionList({ title, revisions, labels }: { title: string; revisions: Revision[]; labels: Labels }) {
  return (
    <section className="pe-box panel" aria-label={title}>
      <h3 className="pe-box-title">{title}</h3>
      {revisions.length === 0 ? (
        <p className="muted">수정 요청 없음</p>
      ) : (
        <ol className="pe-revisions">
          {revisions.map((r, i) => (
            <li key={`${r.ts}-${i}`} className="pe-revision">
              <span className="pe-revision-head">
                {r.types.map((t) => (
                  <span key={t} className="pe-type" title={label(labels.revision_types, t)}>
                    {t}
                  </span>
                ))}
                <span className="muted">{formatDateTime(r.ts)}</span>
              </span>
              <span>{r.memo}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="pe-note">보기 전용 · 수정 요청은 로컬 제작 화면에서 해요</p>
    </section>
  );
}

function PlanTable({
  project,
  labels,
  sources,
  selected,
  onSelect,
}: {
  project: Project;
  labels: Labels;
  sources: SourceMap;
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  return (
    <section className="section" aria-labelledby="pe-plan-title">
      <h2 className="section-title" id="pe-plan-title">
        구성안 · 카드 {project.cards.length}장
      </h2>
      <div className="table-wrap">
        <table className="table pe-table">
          <thead>
            <tr>
              <th scope="col">번호</th>
              <th scope="col">역할</th>
              <th scope="col">템플릿</th>
              <th scope="col">담을 내용</th>
              <th scope="col">근거</th>
            </tr>
          </thead>
          <tbody>
            {project.cards.map((c) => (
              <tr key={c.no} className={c.no === selected ? 'pe-row-selected' : undefined}>
                <td data-label="번호">
                  <button type="button" className="pe-row-button" onClick={() => onSelect(c.no)} aria-label={`${c.no}번 카드 보기`}>
                    {c.no}
                  </button>
                </td>
                <td data-label="역할">{label(labels.roles, c.role)}</td>
                <td data-label="템플릿">{label(labels.templates, c.template)}</td>
                <td data-label="담을 내용">{c.intent}</td>
                <td data-label="근거">
                  <EvidenceChips ids={c.evidence} sources={sources} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Coverage({ project }: { project: Project }) {
  const q = project.quality;
  const missing = q.coverage_detail?.missing ?? [];
  return (
    <section className="section" aria-labelledby="pe-coverage-title">
      <h2 className="section-title" id="pe-coverage-title">
        원문 커버리지 {formatPercent(q.coverage)}
        {q.coverage_detail && (
          <span className="muted">
            {' '}
            ({q.coverage_detail.covered} / {q.coverage_detail.total})
          </span>
        )}
        <span className="muted"> · 근거 연결률 {formatPercent(q.evidence_rate)}</span>
      </h2>
      <p className="pe-note">근거 연결률은 전체 카드 중 원문 근거가 연결된 카드의 비율이에요. 수치와 함께 실제 문구·원문도 확인해 주세요.</p>
      {!q.coverage_detail ? (
        <p className="muted">원문 사용 내역이 없어 누락 항목을 확인할 수 없어요.</p>
      ) : q.coverage_detail.total === 0 ? (
        <p className="muted">비교할 주요 특징·사용 방법이 없어요.</p>
      ) : missing.length === 0 && q.coverage_detail.covered === q.coverage_detail.total ? (
        <p className="muted">주요 특징·사용 방법이 모두 카드 근거에 쓰였어요.</p>
      ) : missing.length === 0 ? (
        <p className="muted">카드에 쓰이지 않은 원문 목록이 없어요.</p>
      ) : (
        <div className="pe-box panel">
          <h3 className="pe-box-title">[참고] 카드에 쓰이지 않은 원문 {missing.length}개</h3>
          <ul className="pe-missing">
            {missing.map((m, i) => (
              <li key={i}>
                <span className="muted">{m.section}</span> {m.text}
              </li>
            ))}
          </ul>
          <p className="pe-note">오류가 아니에요. 빠진 핵심 정보가 있는지 확인용이에요.</p>
        </div>
      )}
    </section>
  );
}
