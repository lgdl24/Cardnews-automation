// 입력 양식 정의(config/input-form.json) 읽기, 빈 양식·채운 양식 만들기, 지시문 형태 문장 찾기
const { paths, readJson } = require('./common');

const loadForm = () => readJson(paths.config('input-form.json'));
const loadSafety = () => readJson(paths.config('input-safety.json'));

// 필수 항목 목록: { '제품 정보': ['제품명', ...], '제작 조건': [...] }
function requiredFields(form = loadForm()) {
  const out = {};
  for (const g of form.groups) out[g.title] = g.fields.filter((f) => f.required).map((f) => f.key);
  return out;
}

const findField = (form, key) => form.groups.flatMap((g) => g.fields).find((f) => f.key === key);

// input.md 만들기. values가 비어 있는 항목은 '(필수)/(선택) 안내' 줄만 남김 (검사 프로그램은 안내 줄을 내용으로 보지 않음)
//   values: { '제품명': '...', '주요 특징': ['a', 'b'], '이미지': [{ file, desc, source, usage, kind }], '카드 수': 5 }
//   웹 입력 폼(W3)이 같은 함수로 input.md를 만들 수 있게 분리해 둠
function renderInputMd(values = {}, form = loadForm()) {
  const lines = [];
  for (const g of form.groups) {
    if (lines.length) lines.push('');
    lines.push(`# ${g.title}`);
    for (const f of g.fields) {
      lines.push('', `## ${f.key}`);
      const v = values[f.key];
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (empty) {
        const example = f.example ? ` · 예: ${f.example.map((e) => (f.type === 'list' || f.type === 'images' ? `- ${e}` : e)).join(' / ')}` : '';
        lines.push(`(${f.required ? '필수' : '선택'})${f.guide ? ` ${f.guide}` : ''}${example}`);
        continue;
      }
      if (f.type === 'list') lines.push(...[].concat(v).map((x) => `- ${String(x).trim()}`));
      else if (f.type === 'images') {
        lines.push(...[].concat(v).map((img) => (typeof img === 'string'
          ? `- ${img}`
          : `- ${[img.file, img.desc, img.source, img.usage, ...(img.kind && img.kind !== '제품' ? [img.kind] : [])].map((s) => String(s ?? '').trim()).join(' | ')}`)));
      } else lines.push(String(v).trim());
    }
  }
  return `${lines.join('\n')}\n`;
}

// 지시문 형태 문장 찾기: [{ pattern, excerpt }]
function findInstructionLike(text, safety = loadSafety()) {
  const found = [];
  for (const p of safety.patterns) {
    const re = new RegExp(p.regex, 'i');
    const m = re.exec(text);
    if (!m) continue;
    // 일치한 부분이 들어 있는 문장의 앞부분 (문장 시작 = 앞쪽의 줄바꿈 또는 '. ' 다음)
    const before = text.slice(0, m.index);
    const lineStart = before.lastIndexOf('\n') + 1;
    const sentenceBreak = before.search(/[.!?]\s[^.!?]*$/);
    const start = Math.max(lineStart, sentenceBreak === -1 ? 0 : sentenceBreak + 2);
    const rest = text.slice(start);
    const end = rest.search(/\n|[.!?](\s|$)/);
    const sentence = (end === -1 ? rest : rest.slice(0, end + 1)).trim().replace(/^[-*]\s+/, '');
    found.push({ pattern: p.id, index: start, excerpt: sentence.length > 40 ? `${sentence.slice(0, 40)}…` : sentence });
  }
  // 같은 줄이 여러 패턴에 걸리면 한 번만
  const seen = new Set();
  return found.filter((f) => (seen.has(f.excerpt) ? false : seen.add(f.excerpt)));
}

module.exports = { loadForm, requiredFields, findField, renderInputMd, findInstructionLike };
