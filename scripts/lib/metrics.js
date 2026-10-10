// 품질 지표 계산 (데이터 분석 A2). 정의는 docs/event-log-spec.md '품질 지표'
const { normalize, countChars } = require('./common');

const round = (n, d = 3) => (n === null || Number.isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

// 원문 커버리지 대상: '주요 특징' 목록 항목 + '사용 방법' 문장
function coverageItems(input) {
  const features = (input.info['주요 특징'] || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => ({ section: '주요 특징', text: l.replace(/^[-*]\s+/, '') }));
  const usage = (input.info['사용 방법'] || '')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((l) => l.trim().replace(/^([-*]|\d+[.)])\s+/, ''))
    .filter(Boolean)
    .map((text) => ({ section: '사용 방법', text }));
  return [...features, ...usage];
}

// 주의 표현 찾기: 문구에 쓰인 목록 표현과, 같은 표현이 원문에도 있는지
function findCautions(data, sourceText, caution) {
  const found = [];
  for (const card of data.cards || []) {
    if (!card.copy || typeof card.copy !== 'object') continue;
    const texts = Object.values(card.copy).flat().filter((t) => typeof t === 'string');
    for (const group of caution.groups) {
      for (const term of group.terms) {
        if (texts.some((t) => t.includes(term))) {
          found.push({ card: card.no, term, category: group.category, in_source: sourceText.includes(term) });
        }
      }
    }
  }
  return found;
}

function computeQuality({ data, input, templates, caution }) {
  const cards = Array.isArray(data.cards) ? data.cards : [];
  const sourceText = normalize(input.productText);
  const quoteById = new Map((data.sources || []).map((s) => [s.id, normalize(s.quote || '')]));

  // 원문 커버리지: 카드 evidence가 가리키는 인용이 포함된 항목 비율
  const usedQuotes = new Set();
  for (const c of cards) for (const id of c.evidence || []) if (quoteById.get(id)) usedQuotes.add(quoteById.get(id));
  const items = coverageItems(input).map((it) => {
    const t = normalize(it.text);
    const covered = [...usedQuotes].some((q) => q && (t.includes(q) || q.includes(t)));
    return { ...it, covered };
  });
  const coveredCount = items.filter((i) => i.covered).length;

  // 근거 연결률
  const withEvidence = cards.filter((c) => Array.isArray(c.evidence) && c.evidence.length > 0).length;

  // 글자 수 활용률: 필드별 글자 수 ÷ 기준, 카드 평균 → 전체 평균 (문구가 있는 단계만)
  const needCopy = data.stage === 'copy' || data.stage === 'approved';
  let charUsage = null;
  let charUsageMax = null;
  if (needCopy) {
    const perCard = [];
    const all = [];
    for (const c of cards) {
      const tpl = templates[c.template];
      if (!tpl || !c.copy) continue;
      const ratios = [];
      for (const [field, rule] of Object.entries(tpl.fields)) {
        const v = c.copy[field];
        if (field === 'items' && Array.isArray(v)) {
          v.forEach((t) => typeof t === 'string' && ratios.push(countChars(t) / rule.maxCharsPerItem));
        } else if (typeof v === 'string' && v && rule.maxChars) {
          ratios.push(countChars(v) / rule.maxChars);
        }
      }
      if (ratios.length) perCard.push(mean(ratios));
      all.push(...ratios);
    }
    charUsage = mean(perCard);
    charUsageMax = all.length ? Math.max(...all) : null;
  }

  const cautions = needCopy ? findCautions(data, sourceText, caution) : [];

  return {
    stage: data.stage,
    card_count: cards.length,
    coverage: items.length ? round(coveredCount / items.length) : null,
    coverage_detail: { covered: coveredCount, total: items.length, missing: items.filter((i) => !i.covered) },
    evidence_rate: cards.length ? round(withEvidence / cards.length) : null,
    char_usage: round(charUsage),
    char_usage_max: round(charUsageMax),
    caution: needCopy
      ? {
        total: cautions.length,
        in_source: cautions.filter((c) => c.in_source).length,
        not_in_source: cautions.filter((c) => !c.in_source).length,
      }
      : null,
  };
}

const pct = (v) => (v === null || v === undefined ? '-' : `${Math.round(v * 100)}%`);

function formatQuality(q) {
  const lines = [
    `원문 커버리지 ${pct(q.coverage)} (${q.coverage_detail.covered}/${q.coverage_detail.total})`,
    `근거 연결률 ${pct(q.evidence_rate)}`,
  ];
  if (q.char_usage !== null) lines.push(`글자 수 활용률 평균 ${pct(q.char_usage)} · 최대 ${pct(q.char_usage_max)}`);
  if (q.caution) lines.push(`주의 표현 ${q.caution.total}건 (원문에 없음 ${q.caution.not_in_source}건)`);
  const out = [`\n== 품질 지표 ==`, ...lines.map((l) => `- ${l}`)];
  for (const m of q.coverage_detail.missing) {
    out.push(`[참고] 카드에 쓰이지 않은 원문 ${m.section}: "${m.text.slice(0, 40)}"`);
  }
  return out.join('\n');
}

module.exports = { computeQuality, formatQuality, findCautions, coverageItems, pct, round, mean };
