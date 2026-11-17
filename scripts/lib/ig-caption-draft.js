// 승인 카드·제품 원문으로 작성한 게시 글을 보관하고 CLI·작업실·점검이 함께 읽어요.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseInput, normalize } = require('./common');
const { findCautions } = require('./metrics');

const FILE = 'caption-draft.json';
const norm = (s) => normalize(String(s || ''));
const keyOf = (data, inputText, cfg) => crypto.createHash('sha256').update(JSON.stringify({ cards: data.cards, sources: data.sources, inputText, cfg, prompt: fs.readFileSync(path.join(__dirname, '../../prompts/instagram-caption.md'), 'utf8') })).digest('hex');
const numbers = (s) => [...String(s).matchAll(/\d+(?:[.,]\d+)?\s*(?:%|mL|ml|g|mg|시간|일|주|개월|배|회)?/g)].map((m) => m[0].replace(/\s/g, '').toLowerCase());

function contextOf(data, inputText) {
  const input = parseInput(inputText);
  const source = norm(input.productText);
  const used = new Set((data.cards || []).flatMap((c) => c.evidence || []));
  const sources = (data.sources || []).filter((s) => used.has(s.id) && norm(s.quote) && source.includes(norm(s.quote)));
  return { product: input.info, sourceText: source, sources, cards: (data.cards || []).map(({ no, copy, evidence }) => ({ no, copy, evidence })) };
}

function formatDraft(content, cfg) {
  const hashtags = [...new Set(content.hashtags.map((s) => s.replace(/^#/, '')))];
  const body = content.paragraphs.map((p) => p.text.trim()).join('\n\n');
  const text = [`${cfg.disclosure}\n${body}`, cfg.sample_note, hashtags.map((t) => `#${t}`).join(' ')].filter(Boolean).join('\n\n');
  return { text, chars: [...text].length, hashtags };
}

function inspectText(text, sourceText, caution) {
  const errors = [];
  if (!/AI/.test(text.split('\n')[0] || '')) errors.push('첫 줄에 AI 활용 표시가 필요해요');
  const supported = new Set(numbers(sourceText));
  if (numbers(text).some((n) => !supported.has(n))) errors.push('원문에 없는 수치가 있어요');
  const cautions = findCautions({ cards: [{ no: 0, copy: { caption: text } }] }, sourceText, caution);
  if (cautions.some((c) => !c.in_source)) errors.push('원문에 없는 주의 표현이 있어요');
  return { errors, cautions };
}

function validateDraft(content, context, cfg, caution) {
  const errors = [];
  if (!content || !Array.isArray(content.paragraphs) || content.paragraphs.length < 2 || content.paragraphs.length > 4 || !Array.isArray(content.hashtags)) return ['캡션 형식이 맞지 않아요'];
  const sourceIds = new Set(context.sources.map((s) => s.id));
  const seen = new Set();
  for (const p of content.paragraphs) {
    if (!p || typeof p !== 'object') { errors.push('문단 형식이 맞지 않아요'); continue; }
    if (typeof p.text !== 'string' || !p.text.trim() || !Array.isArray(p.source_ids) || !p.source_ids.length || p.source_ids.some((id) => !sourceIds.has(id))) errors.push('문장마다 카드와 원문에서 확인한 근거가 필요해요');
    if (typeof p.text !== 'string') continue;
    const t = norm(p.text);
    if (seen.has(t)) errors.push('같은 문단이 반복돼요');
    seen.add(t);
    if (/(^|\n)\s*(?:[✔·•]|[-*]\s)|#|AI\s*활용/.test(p.text)) errors.push('본문은 목록·해시태그·안내문 없이 문단으로 써 주세요');
  }
  if (content.hashtags.length < 5 || content.hashtags.length > 8 || content.hashtags.some((t) => typeof t !== 'string' || !/^#?[가-힣A-Za-z0-9_]+$/.test(t))) errors.push('관련 해시태그를 5~8개로 작성해 주세요');
  if (new Set(content.hashtags.map((t) => String(t).replace(/^#/, ''))).size !== content.hashtags.length) errors.push('해시태그가 중복돼요');
  if (errors.length) return [...new Set(errors)];
  const body = content.paragraphs.map((p) => p.text).join('\n');
  if ([...body].length > (cfg.body_max_chars || 450)) errors.push('본문이 너무 길어요');
  const result = formatDraft(content, cfg);
  if (result.chars > cfg.max_chars) errors.push('캡션 최대 길이를 넘었어요');
  errors.push(...inspectText(result.text, context.sourceText, caution).errors);
  return [...new Set(errors)];
}

function readCaption({ productDir, data, inputText, cfg, caution }) {
  const file = path.join(productDir, 'output', 'instagram', FILE);
  const context = contextOf(data, inputText);
  // 향후 편집 담당의 명시적 캡션이 있으면 우선해요. 게시 전 점검에서도 같은 글을 검사해요.
  if (typeof data.caption?.text === 'string') {
    const text = data.caption.text;
    return { text, chars: [...text].length, hashtags: [], authored: true, key: keyOf(data, inputText, cfg), errors: inspectText(text, context.sourceText, caution).errors };
  }
  if (!fs.existsSync(file)) return null;
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (record.input_key !== keyOf(data, inputText, cfg)) return { text: '', errors: ['카드·원문·설정이 바뀌었어요. 캡션을 다시 작성해 주세요'] };
    const errors = validateDraft(record.content, context, cfg, caution);
    const formatted = errors.length ? { text: '' } : formatDraft(record.content, cfg);
    const digest = crypto.createHash('sha256').update(JSON.stringify(record.content)).digest('hex');
    if (record.review?.ok !== true || record.review.content_hash !== digest) errors.push('작성 캡션의 근거 검토가 필요해요');
    return { ...formatted, authored: true, key: record.input_key, errors };
  } catch {
    return { text: '', errors: ['캡션 작성 파일을 읽지 못했어요. 다시 작성해 주세요'] };
  }
}

module.exports = { FILE, keyOf, contextOf, formatDraft, inspectText, validateDraft, readCaption };
