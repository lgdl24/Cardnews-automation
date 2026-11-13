// 인스타 캡션: 검증·승인된 카드 문구만으로 만든다(새 문구를 지어내지 않음). 첫 줄에 AI 활용 표시(AI 기본법), 샘플 표기
const oneLine = (s) => String(s || '').replace(/\s*\n\s*/g, ' ').trim();

function cardLines(card) {
  const c = card.copy || {};
  const lines = [];
  const title = oneLine(c.title);
  if (title) lines.push(`✔ ${title}`);
  if (c.caption) lines.push(oneLine(c.caption));
  if (c.subtitle) lines.push(oneLine(c.subtitle));
  for (const it of c.items || []) lines.push(`· ${oneLine(typeof it === 'string' ? it : it.text || it.title || '')}`);
  return lines.filter((l) => l && l !== '· ');
}

/**
 * @param {object} data cards.json
 * @param {object} cfg config/instagram.json 의 caption
 * @param {{ productName?: string }} [o]
 * @returns {{ text: string, chars: number, hashtags: string[] }}
 */
function buildCaption(data, cfg, { productName = null } = {}) {
  const cards = data.cards || [];
  const cover = cards[0];
  const body = cards.slice(1);
  const head = [cfg.disclosure, cfg.sample_note].filter(Boolean).join(' · ');
  const intro = cover ? [oneLine(cover.copy?.title), oneLine(cover.copy?.subtitle)].filter(Boolean) : [];
  const tags = [...(cfg.hashtags || [])];
  if (productName) tags.push(productName.replace(/\s*\(.*?\)\s*/g, '').replace(/[^0-9A-Za-z가-힣]/g, ''));
  const hashtags = [...new Set(tags.filter(Boolean))].slice(0, 30);
  const blocks = [head, intro.join('\n'), ...body.map((c) => cardLines(c).join('\n')), hashtags.map((t) => `#${t}`).join(' ')].filter((b) => b && b.trim());
  let text = blocks.join('\n\n');
  if (text.length > cfg.max_chars) text = `${text.slice(0, cfg.max_chars - 1)}…`;
  return { text, chars: text.length, hashtags };
}

module.exports = { buildCaption, cardLines };
