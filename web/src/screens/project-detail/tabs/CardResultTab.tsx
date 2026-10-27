// V2 카드 결과 — 담당 이규동
// 읽는 데이터: project.json cards[].png · layout, images, colors(v0.3)
// 노션 '웹 화면 설계' V2 · 카드 결과: 카드 미리보기, 크게 보기, PNG 개별 다운로드, 묶음(ZIP) 다운로드, 이미지 출처
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { projectFileUrl } from '../../../data/load';
import { label } from '../../../data/format';
import type { Card, CardColors, CardDesign, ColorKey, Labels, Project } from '../../../data/types';
import { cardFileName, downloadBlob } from '../../../lib/download';
import { buildZip } from '../../../lib/zip';
import { useProjectContext } from '../ProjectDetailPage';
import { CardViewer } from './CardViewer';
import './tabs.css';

/** 크게 보기 상태는 주소(?card=3)에 둬서 링크로 공유·뒤로 가기가 됨 */
function useOpenCard(cards: Card[]) {
  const [params, setParams] = useSearchParams();
  const no = Number(params.get('card'));
  const index = cards.findIndex((c) => c.no === no);
  const open = (n: number | null, replace = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (n === null) next.delete('card');
        else next.set('card', String(n));
        return next;
      },
      { replace, preventScrollReset: true },
    );
  return { index: index >= 0 ? index : null, open };
}

export function CardResultTab() {
  const { project, labels } = useProjectContext();
  const { index, open } = useOpenCard(project.cards);
  const warned = project.cards.filter((c) => c.layout.overlaps.length > 0).length;

  return (
    <>
      <div className="result-toolbar">
        <p className="result-summary">
          카드 {project.cards.length}장 · 1080×1080 PNG
          {warned > 0 && <span className="result-warn"> · 겹침 주의 {warned}장</span>}
        </p>
        <ZipButton project={project} />
      </div>

      <ul className="card-grid" aria-label="카드 목록">
        {project.cards.map((c) => (
          <li key={c.no}>
            <CardTile project={project} card={c} labels={labels} onOpen={() => open(c.no)} />
          </li>
        ))}
      </ul>

      <ImageSources project={project} labels={labels} />

      {project.design && <DesignUsed design={project.design} />}
      {project.colors && <ColorsUsed colors={project.colors} />}

      {index !== null && (
        <CardViewer
          project={project}
          labels={labels}
          index={index}
          onMove={(i) => open(project.cards[i]!.no, true)}
          onClose={() => open(null)}
        />
      )}
    </>
  );
}

function CardTile({ project, card, labels, onOpen }: { project: Project; card: Card; labels: Labels; onOpen: () => void }) {
  const src = projectFileUrl(project.id, card.png);
  const role = label(labels.roles, card.role);
  return (
    <figure className="card-tile">
      <button type="button" className="card-tile-image" onClick={onOpen} aria-label={`${card.no}번 카드 크게 보기`}>
        <img src={src} alt={`${card.no}번 카드 (${role})`} loading="lazy" width={1080} height={1080} />
      </button>
      <figcaption className="card-tile-caption">
        <span className="card-tile-title">
          <strong>{card.no}</strong> {role}
          <span className="muted"> · {label(labels.templates, card.template)}</span>
        </span>
        <a className="text-button" href={src} download={cardFileName(project.id, card.no)}>
          PNG 받기
        </a>
      </figcaption>
      {card.layout.overlaps.length > 0 && (
        <p className="card-tile-warn" title={card.layout.overlaps.map((o) => `${o.target} ${o.px}px`).join(', ')}>
          글자가 이미지와 겹쳐요 ({Math.max(...card.layout.overlaps.map((o) => o.px))}px)
        </p>
      )}
    </figure>
  );
}

function ZipButton({ project }: { project: Project }) {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  const run = async () => {
    setState('working');
    try {
      const blob = await buildZip(project.cards.map((c) => ({ name: cardFileName(project.id, c.no), url: projectFileUrl(project.id, c.png) })));
      downloadBlob(blob, `${project.id}-cards.zip`);
      setState('idle');
    } catch {
      setState('error');
    }
  };
  return (
    <div className="zip-action">
      <button type="button" className="button" onClick={run} disabled={state === 'working'}>
        {state === 'working' ? '묶는 중…' : `전체 받기 (ZIP, ${project.cards.length}장)`}
      </button>
      {state === 'error' && (
        <span className="zip-error" role="alert">
          묶음을 만들지 못했어요. 카드별로 받아 주세요.
        </span>
      )}
    </div>
  );
}

// 입력 이미지의 설명·출처·사용 가능 여부와 쓰인 카드 (이미지 원본 파일은 공개하지 않음)
function ImageSources({ project, labels }: { project: Project; labels: Labels }) {
  if (project.images.length === 0) return null;
  return (
    <section className="section" aria-labelledby="image-sources">
      <h2 className="section-title" id="image-sources">
        이미지 출처
      </h2>
      <div className="table-wrap">
        <table className="table table-sources">
          <thead>
            <tr>
              <th scope="col">파일</th>
              <th scope="col">설명</th>
              <th scope="col">출처</th>
              <th scope="col">사용</th>
              <th scope="col">쓰인 카드</th>
            </tr>
          </thead>
          <tbody>
            {project.images.map((img) => {
              const used = project.cards.filter((c) => c.image === img.file);
              return (
                <tr key={img.file}>
                  <td data-label="파일">
                    <code>{img.file}</code>
                  </td>
                  <td data-label="설명">{img.desc}</td>
                  <td data-label="출처">{img.source}</td>
                  <td data-label="사용">{img.usage}</td>
                  <td data-label="쓰인 카드">{used.length ? used.map((c) => `${c.no}번 ${label(labels.roles, c.role)}`).join(', ') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// 카드 색 (#38): 입력에서 고른 모드, 실제로 쓴 색, 기본 색으로 바뀐 이유, 글자 대비 때문에 바꾼 색
const COLOR_LABELS: Record<ColorKey, string> = {
  bg: '배경',
  surface: '상자',
  text: '글자',
  muted: '보조 글자',
  primary: '강조',
  accent: '보조 배경',
  'on-primary': '강조 위 글자',
};
const COLOR_ORDER: ColorKey[] = ['bg', 'accent', 'surface', 'primary', 'text', 'muted', 'on-primary'];

function Swatch({ hex }: { hex: string }) {
  return <span className="swatch" style={{ background: hex }} aria-hidden="true" />;
}

const DESIGN_FROM: Record<CardDesign['source'], string> = { input: '입력에서 고름', cards: '구성안에서 고름', default: '기본값' };
function DesignUsed({ design }: { design: CardDesign }) {
  const who = design.source === 'cards' ? (design.selected_by === 'human' ? ' · 사람이 바꿈' : ' · Claude 추천') : '';
  return (
    <section className="section" aria-labelledby="card-design">
      <h2 className="section-title" id="card-design">
        디자인 묶음
      </h2>
      <p className="colors-summary">
        <strong>{design.name}</strong>
        {design.version ? ` v${design.version}` : ''} · {DESIGN_FROM[design.source]}
        {who}
      </p>
      {design.reason && <p className="muted">이유: “{design.reason}”</p>}
    </section>
  );
}

function ColorsUsed({ colors }: { colors: CardColors }) {
  const fellBack = colors.mode === '제품 색' && colors.source === 'theme';
  return (
    <section className="section" aria-labelledby="card-colors">
      <h2 className="section-title" id="card-colors">
        카드 색
      </h2>
      <p className="colors-summary">
        {colors.source === 'product' ? (
          <>
            제품 색 · <code>{colors.image}</code>의 대표 색{' '}
            {colors.representative && (
              <span className="swatch-value">
                <Swatch hex={colors.representative} />
                {colors.representative}
              </span>
            )}
            으로 만들었어요
          </>
        ) : fellBack ? (
          <>제품 색을 골랐지만 기본 색을 썼어요</>
        ) : (
          <>기본 색 (config/theme.json)</>
        )}
      </p>
      {colors.note && <p className="colors-note">{colors.note}</p>}
      <ul className="swatch-list" aria-label="쓴 색">
        {COLOR_ORDER.map((k) => (
          <li key={k}>
            <Swatch hex={colors.color[k]} />
            <span className="swatch-text">
              <span className="swatch-name">{COLOR_LABELS[k]}</span>
              <code className="swatch-hex">{colors.color[k]}</code>
            </span>
          </li>
        ))}
      </ul>
      {colors.adjustments.length > 0 && (
        <p className="colors-adjust">
          글자 대비(4.5 이상)를 맞추려고 어둡게 한 색:{' '}
          {colors.adjustments.map((a, i) => (
            <span key={a.key}>
              {i > 0 && ', '}
              {COLOR_LABELS[a.key]} <code>{a.from}</code> → <code>{a.to}</code>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
