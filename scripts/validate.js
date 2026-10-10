// 데이터 검증: JSON 형식, 필수 필드, 카드 수, 템플릿, 원문 근거, 글자 수, 주의 표현 + 품질 지표
// 사용법: node scripts/validate.js <제품ID> [--no-log]
//   결과는 products/<제품ID>/log.jsonl에 validate_result로 자동 기록되고,
//   품질 지표는 products/<제품ID>/output/quality.json에 저장됩니다.
const fs = require('fs');
const path = require('path');
const {
  paths, loadConfig, loadInput, normalize, countChars,
  createReport, printReport, requireProductId,
} = require('./lib/common');
const { computeQuality, formatQuality, findCautions } = require('./lib/metrics');
const { appendEvent, resultFields, shouldLog } = require('./lib/events');

const STAGES = ['plan', 'copy', 'approved'];
const ROLES = ['cover', 'feature', 'usage', 'detail', 'closing'];
const EVIDENCE_REQUIRED_ROLES = ['feature', 'usage', 'detail'];

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

function validate(productId) {
  const report = createReport();
  const { templates, caution } = loadConfig();
  const file = paths.product(productId, 'cards.json');

  if (!fs.existsSync(file)) {
    report.error('INPUT_MISSING', 'cards.json', '카드 구성 데이터 파일이 없어요');
    return { report, data: null };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    report.error('PARSE_ERROR', 'cards.json', `JSON을 읽을 수 없어요: ${e.message}`);
    return { report, data: null };
  }

  const input = loadInput(productId);
  if (!input) report.error('INPUT_MISSING', 'input.md', '원문 대조를 위한 input.md가 없어요');
  const sourceText = input ? normalize(input.productText) : '';

  // ── 최상위 필드
  if (data.product_id !== productId) {
    report.error('SCHEMA_ERROR', 'product_id', `폴더 이름(${productId})과 달라요: ${data.product_id}`);
  }
  if (!STAGES.includes(data.stage)) {
    report.error('SCHEMA_ERROR', 'stage', `${STAGES.join(' / ')} 중 하나여야 해요`);
  }
  const needCopy = data.stage === 'copy' || data.stage === 'approved';

  // ── sources: 원문 근거
  const sourceIds = new Set();
  if (!Array.isArray(data.sources) || data.sources.length === 0) {
    report.error('SCHEMA_ERROR', 'sources', '원문 근거가 1개 이상 필요해요');
  } else {
    for (const s of data.sources) {
      const where = `sources ${s.id || '(id 없음)'}`;
      if (!isNonEmptyString(s.id)) { report.error('SCHEMA_ERROR', where, 'id가 없어요'); continue; }
      if (sourceIds.has(s.id)) report.error('SCHEMA_ERROR', where, 'id가 중복돼요');
      sourceIds.add(s.id);
      if (!isNonEmptyString(s.quote)) { report.error('SCHEMA_ERROR', where, 'quote가 비어 있어요'); continue; }
      if (input && !sourceText.includes(normalize(s.quote))) {
        report.error('EVIDENCE_ERROR', where, `원문에 없는 인용이에요: "${s.quote}"`);
      }
    }
  }

  const checkEvidence = (ids, where, required) => {
    if (ids === undefined || ids === null) {
      if (required) report.error('SCHEMA_ERROR', where, '원문 근거(evidence)가 필요해요');
      return;
    }
    if (!Array.isArray(ids)) { report.error('SCHEMA_ERROR', where, 'evidence는 배열이어야 해요'); return; }
    if (required && ids.length === 0) report.error('SCHEMA_ERROR', where, '원문 근거(evidence)가 1개 이상 필요해요');
    for (const id of ids) {
      if (!sourceIds.has(id)) report.error('EVIDENCE_ERROR', where, `sources에 없는 근거 ID예요: ${id}`);
    }
  };

  // ── analysis
  const a = data.analysis;
  if (!a || typeof a !== 'object') {
    report.error('SCHEMA_ERROR', 'analysis', '자료 분석 결과가 없어요');
  } else {
    if (!isNonEmptyString(a.core_message)) report.error('SCHEMA_ERROR', 'analysis.core_message', '핵심 메시지가 비어 있어요');
    checkEvidence(a.core_evidence, 'analysis.core_evidence', true);
    for (const key of ['features', 'usage']) {
      if (!Array.isArray(a[key]) || a[key].length === 0) {
        report.error('SCHEMA_ERROR', `analysis.${key}`, '1개 이상 필요해요');
        continue;
      }
      a[key].forEach((item, i) => checkEvidence(item.evidence, `analysis.${key}[${i}]`, true));
    }
  }

  // ── cards
  if (!Array.isArray(data.cards) || data.cards.length === 0) {
    report.error('SCHEMA_ERROR', 'cards', '카드가 없어요');
    return { report, data };
  }
  if (input && input.cardCount !== null && data.cards.length !== input.cardCount) {
    report.error('SCHEMA_ERROR', 'cards', `카드 수가 제작 조건(${input.cardCount}장)과 달라요: ${data.cards.length}장`);
  }

  const imageFiles = new Set(input ? input.images.map((i) => i.file) : []);

  data.cards.forEach((card, idx) => {
    const where = `${idx + 1}번 카드`;
    if (card.no !== idx + 1) report.error('SCHEMA_ERROR', `${where}.no`, `번호가 ${idx + 1}이어야 해요 (현재: ${card.no})`);
    if (!ROLES.includes(card.role)) report.error('SCHEMA_ERROR', `${where}.role`, `${ROLES.join(' / ')} 중 하나여야 해요`);
    if (!isNonEmptyString(card.intent)) report.error('SCHEMA_ERROR', `${where}.intent`, '구성안 설명이 비어 있어요');

    const tpl = templates[card.template];
    if (!tpl || card.template.startsWith('_')) {
      report.error('SCHEMA_ERROR', `${where}.template`, `없는 템플릿이에요: ${card.template}`);
      return;
    }

    checkEvidence(card.evidence, `${where}.evidence`, EVIDENCE_REQUIRED_ROLES.includes(card.role));

    // 이미지
    if (tpl.image === 'required' && !card.image) {
      report.error('SCHEMA_ERROR', `${where}.image`, `${tpl.label} 템플릿은 이미지가 필요해요`);
    }
    if (tpl.image === 'none' && card.image) {
      report.warn(`${where}.image`, `${tpl.label} 템플릿은 이미지를 쓰지 않아요 (무시됨)`);
    }
    if (card.image && input && !imageFiles.has(card.image)) {
      report.error('SCHEMA_ERROR', `${where}.image`, `입력 양식에 없는 이미지예요: ${card.image}`);
    }

    // 문구
    if (!needCopy) return;
    const copy = card.copy;
    if (!copy || typeof copy !== 'object') {
      report.error('SCHEMA_ERROR', `${where}.copy`, '문구가 없어요');
      return;
    }
    for (const [field, rule] of Object.entries(tpl.fields)) {
      const v = copy[field];
      const fw = `${where}.copy.${field}`;
      if (field === 'items') {
        if (!Array.isArray(v) || v.length === 0) {
          if (rule.required) report.error('SCHEMA_ERROR', fw, '항목 배열이 필요해요');
          continue;
        }
        if (v.length > rule.maxItems) report.error('CHAR_LIMIT', fw, `항목은 최대 ${rule.maxItems}개예요 (현재 ${v.length}개)`);
        v.forEach((item, i) => {
          if (!isNonEmptyString(item)) report.error('SCHEMA_ERROR', `${fw}[${i}]`, '비어 있어요');
          else if (countChars(item) > rule.maxCharsPerItem) {
            report.error('CHAR_LIMIT', `${fw}[${i}]`, `${countChars(item)}자 / 기준 ${rule.maxCharsPerItem}자`);
          }
        });
        continue;
      }
      if (v === undefined || v === null || v === '') {
        if (rule.required) report.error('SCHEMA_ERROR', fw, '필수 문구가 비어 있어요');
        continue;
      }
      if (typeof v !== 'string') { report.error('SCHEMA_ERROR', fw, '문자열이어야 해요'); continue; }
      if (countChars(v) > rule.maxChars) report.error('CHAR_LIMIT', fw, `${countChars(v)}자 / 기준 ${rule.maxChars}자`);
    }
    for (const field of Object.keys(copy)) {
      if (!(field in tpl.fields)) report.warn(`${where}.copy.${field}`, `${tpl.label} 템플릿에 없는 필드예요 (출력되지 않음)`);
    }
  });

  // 주의 표현: 표시만 하고, 그대로 둘지는 원문과 대조해 판단
  if (needCopy) {
    for (const c of findCautions(data, sourceText, caution)) {
      report.caution(`${c.card}번 카드`, `"${c.term}" (${c.category}, ${c.in_source ? '원문에도 있음' : '원문에 없음'})`);
    }
  }

  return { report, data, input };
}

// 품질 지표: JSON을 읽을 수 있고 입력 자료가 있을 때만 계산
function quality({ data, input }) {
  if (!data || !input || !Array.isArray(data.cards)) return null;
  const { templates, caution } = loadConfig();
  return computeQuality({ data, input, templates, caution });
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const id = requireProductId(argv);
  const result = validate(id);
  const { report, data } = result;
  printReport(`데이터 검증: ${id}`, report);

  const q = quality(result);
  if (q) {
    console.log(formatQuality(q));
    const outDir = paths.product(id, 'output');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'quality.json'), JSON.stringify({ product_id: id, measured_at: new Date().toISOString(), ...q }, null, 2));
  }
  if (shouldLog(argv) && fs.existsSync(paths.product(id))) {
    const { coverage_detail, ...metrics } = q || {};
    appendEvent(id, 'validate_result', resultFields('data', report, {
      stage: data ? data.stage : null,
      metrics: q ? { ...metrics, missing_items: coverage_detail.missing.length } : null,
    }));
  }
  process.exit(report.errors.length ? 1 : 0);
}

module.exports = { validate, quality };
