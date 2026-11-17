// 게시 전 점검 (docs/proposals/ax-plan.md A4): 인스타 게시(B) 전에 사람이 확인할 것과 자동으로 확인한 것을 한 표로
// 판정: pass(통과) · warn(사람 확인) · fail(고쳐야 함) · todo(아직 안 한 단계). fail·todo가 없으면 ready
// 게시는 이 점검이 ready이고 사람이 최종 승인(stage approved)한 것만 — 점검 자체는 아무것도 고치지 않음
const fs = require('fs');
const path = require('path');
const { readDisclosure } = require('./ai-disclosure');
const { appliedNumbers, readReport } = require('./ai-cards');
const { bgFiles } = require('./brand');
const { findCautions } = require('./metrics');
const { FILE, readCaption, inspectText } = require('./ig-caption-draft');
const CAPTION_CFG = require('../../config/instagram.json').caption;

const pad = (n) => String(n).padStart(2, '0');
const readJsonIf = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

// 카드별 최신 출력 결과 (전체 출력 뒤 카드 하나만 다시 낸 경우 포함)
function latestRender(outDir) {
  const latest = new Map();
  if (!fs.existsSync(outDir)) return latest;
  for (const f of fs.readdirSync(outDir).filter((x) => /^render-report(-card-\d+)?\.json$/.test(x))) {
    const r = readJsonIf(path.join(outDir, f));
    if (!r) continue;
    const at = Date.parse(r.rendered_at || '') || fs.statSync(path.join(outDir, f)).mtimeMs;
    for (const x of r.results || []) {
      const prev = latest.get(x.no);
      if (!prev || at >= prev.at) latest.set(x.no, { at, issues: x.issues || [] });
    }
  }
  return latest;
}

/**
 * @param {object} o
 * @param {string} o.productDir
 * @param {object} o.data cards.json
 * @param {{ errors: object[] }} o.validation 검증 결과(report)
 * @param {object} o.caution config/caution-expressions.json
 * @param {string} o.sourceText 원문(input.md) 글
 */
function publishCheck({ productDir, data, validation, caution, sourceText = '' }) {
  // 게시 캡션: npm run ig -- prepare 가 만든 output/instagram/caption.txt (cards.json에 caption이 있으면 그것)
  const captionFile = path.join(productDir, 'output', 'instagram', 'caption.txt');
  let draft = null;
  const hasDraft = fs.existsSync(path.join(productDir, 'output', 'instagram', FILE));
  if (hasDraft) {
    try {
      draft = readCaption({ productDir, data, inputText: fs.readFileSync(path.join(productDir, 'input.md'), 'utf8'), cfg: CAPTION_CFG, caution });
    } catch { draft = { text: '', errors: ['캡션 근거 원문을 읽지 못했어요'] }; }
  }
  const captionText = draft ? draft.text : data.caption?.text ?? (fs.existsSync(captionFile) ? fs.readFileSync(captionFile, 'utf8') : null);
  const checks = [];
  const add = (id, label, status, detail, extra = {}) => checks.push({ id, label, status, detail, ...extra });
  const cards = data.cards || [];
  const outDir = path.join(productDir, 'output');
  const pngOf = (no) => path.join(outDir, 'png', `card-${pad(no)}.png`);

  // 1) 사람 최종 승인
  add('approved', '최종 승인', data.stage === 'approved' ? 'pass' : 'todo', data.stage === 'approved' ? '사람이 최종 승인했어요' : `지금 단계는 ${data.stage}예요. 최종 승인 뒤에 게시할 수 있어요`);

  // 2) 데이터 검증
  const errs = validation.errors || [];
  add('validate', '데이터 검증', errs.length ? 'fail' : 'pass', errs.length ? `오류 ${errs.length}개: ${errs.slice(0, 3).map((e) => e.code).join(', ')}` : '오류 0개');

  // 3) 출력·레이아웃
  const missing = cards.filter((c) => !fs.existsSync(pngOf(c.no))).map((c) => c.no);
  const render = latestRender(outDir);
  const bad = cards.filter((c) => (render.get(c.no)?.issues || []).length).map((c) => c.no);
  const notRendered = cards.filter((c) => !render.has(c.no)).map((c) => c.no);
  if (missing.length) add('render', '출력·레이아웃', 'fail', `PNG가 없어요: ${missing.join('·')}번`);
  else if (bad.length) add('render', '출력·레이아웃', 'fail', `레이아웃 오류: ${bad.join('·')}번`);
  else if (notRendered.length) add('render', '출력·레이아웃', 'warn', `출력 기록이 없어요: ${notRendered.join('·')}번`);
  else add('render', '출력·레이아웃', 'pass', `${cards.length}장 출력, 레이아웃 오류 0`);

  // 4) 광고 주의 표현 (원문에 없으면 고쳐야 함, 원문에 있어도 사람 판단)
  const found = findCautions(data, sourceText, caution);
  const notIn = found.filter((c) => !c.in_source);
  const list = (xs) => xs.map((c) => `${c.card}번 "${c.term}"(${c.category})`).join(', ');
  if (notIn.length) add('caution', '광고 주의 표현', 'fail', `원문에 없는 표현: ${list(notIn)}`, { items: found });
  else if (found.length) add('caution', '광고 주의 표현', 'warn', `원문에 있는 표현이라도 사람이 판단: ${list(found)}`, { items: found });
  else add('caution', '광고 주의 표현', 'pass', '주의 표현 0건 (개정 화장품법 가상 전문가 추천 포함)');

  // 5) AI 활용 표시 메타데이터 (AI 기본법 제31조)
  const available = cards.filter((c) => fs.existsSync(pngOf(c.no)));
  const disclosures = new Map(available.map((c) => [c.no, readDisclosure(fs.readFileSync(pngOf(c.no)))]));
  const unstamped = available.filter((c) => !disclosures.get(c.no)).map((c) => c.no);
  if (missing.length === cards.length) add('ai_label', 'AI 활용 표시', 'todo', '출력 뒤에 확인해요');
  else if (unstamped.length) add('ai_label', 'AI 활용 표시', 'fail', `메타데이터가 없어요: ${unstamped.join('·')}번 (npm run render로 다시 출력)`);
  else add('ai_label', 'AI 활용 표시', 'pass', '모든 카드에 AI 활용 메타데이터(IPTC DigitalSourceType)가 있어요');

  // 6) GPT 이미지가 들어간 카드: 그린 글자·사람 이미지 확인
  // 이전 실험의 생성 기록 키가 달라도 출력에 기록된 GPT 이미지 사용 여부는 유지한다.
  const metadataImages = cards.filter((c) => disclosures.get(c.no)?.parts.includes('image')).map((c) => c.no);
  const aiCards = [...new Set([...appliedNumbers(productDir, cards), ...metadataImages])].sort((a, b) => a - b);
  const bgCards = [...bgFiles(productDir, data).keys()];
  const report = readReport(productDir);
  const unchecked = aiCards.filter((no) => !(report?.cards || []).find((c) => c.no === no)?.text_checked);
  if (!aiCards.length && !bgCards.length) add('ai_image', 'GPT 이미지 확인', 'pass', 'GPT 이미지가 들어간 카드가 없어요');
  else
    add(
      'ai_image',
      'GPT 이미지 확인',
      'warn',
      [
        aiCards.length ? `AI 디자인 카드 ${aiCards.join('·')}번${unchecked.length ? `: GPT가 그린 글자가 문구와 같은지 확인 (${unchecked.join('·')}번 미확인)` : ''}` : null,
        `GPT 이미지 카드 ${[...new Set([...aiCards, ...bgCards])].sort((a, b) => a - b).join('·')}번에 사람·의료인·가운·병원이 없는지 확인(지시문에서 금지)`,
      ]
        .filter(Boolean)
        .join(' · '),
    );

  // 7) 게시 캡션 (B1에서 만듦)
  if (draft?.errors.length) add('caption', '게시 캡션', 'fail', draft.errors.join(' · '));
  else if (!captionText) add('caption', '게시 캡션', 'todo', '캡션이 아직 없어요 (npm run ig -- caption <제품ID>로 작성해 주세요)');
  else if (!/AI/.test(captionText.split('\n')[0] || '')) add('caption', '게시 캡션', 'fail', "캡션 첫 줄에 'AI 활용' 표시 문구가 없어요");
  else {
    const checked = inspectText(captionText, sourceText, caution);
    if (checked.errors.length) add('caption', '게시 캡션', 'fail', checked.errors.join(' · '));
    else add('caption', '게시 캡션', checked.cautions.length ? 'warn' : 'pass', `캡션 ${captionText.trim().length}자, 첫 줄에 AI 활용 표시${checked.cautions.length ? ' · 원문에 있는 주의 표현은 직접 확인해 주세요' : ''}`);
    if (draft || data.caption?.text) add('caption_review', '게시 글 근거·말투 확인', 'warn', '카드와 다른 문장으로 작성했어요. 문장·해시태그의 의미, 효능 단정과 가상 제품 안내를 직접 확인해 주세요');
  }

  const ready = !checks.some((c) => c.status === 'fail' || c.status === 'todo');
  return { ready, counts: Object.fromEntries(['pass', 'warn', 'fail', 'todo'].map((s) => [s, checks.filter((c) => c.status === s).length])), checks };
}

module.exports = { publishCheck, latestRender };
