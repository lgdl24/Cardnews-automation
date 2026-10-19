// V2 카드 결과 — 크게 보기 (담당 이규동)
// <dialog>로 열어 포커스 가두기·Esc 닫기는 브라우저가 처리. ←·→로 앞뒤 카드
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { projectFileUrl } from '../../../data/load';
import { label } from '../../../data/format';
import type { Labels, Project } from '../../../data/types';
import { cardFileName } from '../../../lib/download';

export function CardViewer({
  project,
  labels,
  index,
  onMove,
  onClose,
}: {
  project: Project;
  labels: Labels;
  index: number;
  onMove: (index: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cards = project.cards;
  const card = cards[index]!;
  const src = projectFileUrl(project.id, card.png);
  const hasPrev = index > 0;
  const hasNext = index < cards.length - 1;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // 앞뒤 카드 이미지를 미리 받아 넘길 때 바로 보이게
  useEffect(() => {
    for (const i of [index - 1, index + 1]) {
      const c = cards[i];
      if (c) new Image().src = projectFileUrl(project.id, c.png);
    }
  }, [index, cards, project.id]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && hasPrev) {
      e.preventDefault();
      onMove(index - 1);
    } else if (e.key === 'ArrowRight' && hasNext) {
      e.preventDefault();
      onMove(index + 1);
    }
  };

  const role = label(labels.roles, card.role);
  return (
    <dialog
      ref={ref}
      className="viewer"
      aria-labelledby="viewer-title"
      onClose={onClose}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        // 어두운 바깥을 누르면 닫기
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      <div className="viewer-body">
        <header className="viewer-head">
          <h2 id="viewer-title" className="viewer-title">
            {card.no}번 카드 · {role}
            <span className="muted"> · {label(labels.templates, card.template)}</span>
          </h2>
          <span className="viewer-count" aria-live="polite">
            {index + 1} / {cards.length}
          </span>
          <button type="button" className="icon-button" onClick={() => ref.current?.close()} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="viewer-stage">
          <button type="button" className="viewer-nav viewer-prev" onClick={() => onMove(index - 1)} disabled={!hasPrev} aria-label="이전 카드">
            ‹
          </button>
          <img key={card.no} src={src} alt={`${card.no}번 카드 (${role})`} width={1080} height={1080} />
          <button type="button" className="viewer-nav viewer-next" onClick={() => onMove(index + 1)} disabled={!hasNext} aria-label="다음 카드">
            ›
          </button>
        </div>

        <footer className="viewer-foot">
          <p className="viewer-intent">{card.intent}</p>
          {card.layout.overlaps.length > 0 && (
            <p className="card-tile-warn">
              글자가 이미지와 겹쳐요: {card.layout.overlaps.map((o) => `${o.target} ${o.px}px`).join(', ')}
            </p>
          )}
          <a className="button" href={src} download={cardFileName(project.id, card.no)}>
            이 카드 PNG 받기
          </a>
        </footer>
      </div>
    </dialog>
  );
}
