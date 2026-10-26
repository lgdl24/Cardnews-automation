// 카드 글자 수 기준 안내: 입력의 '무드'(기본·프리미엄 등)에 맞는 기준을 사람이 읽는 줄로 만든다
// npm run check가 출력 → Claude가 1단계(입력 확인)에서 바로 보고 문구를 그 기준으로 씀 (#67)
// 기준 원본은 config/templates.json (무드 묶음은 _designs.<이름>이 기본 정의를 덮어씀)
const { loadConfig, designOf } = require('./common');
const { colorModeOf } = require('./color-mood');

const IMAGE_LABELS = { required: '사진 필수', optional: '사진 선택', none: '사진 없음' };
const ROLE_LABELS = { cover: '표지', feature: '특징', usage: '사용법', detail: '상세', closing: '마무리' };

function ruleText(rule) {
  const parts = [];
  if (rule.maxItems) parts.push(`항목 ${rule.minItems || 1}~${rule.maxItems}개`, `항목당 ${rule.maxCharsPerItem}자`);
  else parts.push(`전체 ${rule.maxChars}자`);
  if (rule.maxCharsPerLine) parts.push(`줄바꿈하면 한 줄 ${rule.maxCharsPerLine}자`);
  if (rule.maxLines) parts.push(`최대 ${rule.maxLines}줄`);
  parts.push(rule.required ? '필수' : '선택');
  return parts.join(' · ');
}

/** @returns {{ design: string, colorMode: string, lines: string[] }} */
// data(cards.json)가 있으면 구성안에서 고른 묶음 기준 (#74)
function limitLines(input, data = null) {
  const design = designOf(input, undefined, data);
  const { templates } = loadConfig(input, data);
  const colorRaw = ((input && input.cond && input.cond['카드 색']) || '').split('\n')[0].trim();
  const colorMode = colorModeOf(input, data);
  const lines = [];
  lines.push(design === '기본'
    ? '무드: 기본 — config/templates.json의 템플릿별 기준을 써요'
    : `무드: ${design} — config/templates.json의 _designs.${design} 기준을 써요 (기본 템플릿 기준과 달라요. 아래 숫자로 문구를 쓰세요)`);
  lines.push(`카드 색: ${colorMode}${colorRaw ? '' : ' (비어 있어서 무드 기본값)'}`);
  // 무드 묶음이 자동으로 붙이는 머리말 등 문구를 쓸 때 알아야 할 것 (_designs.<이름>._notes)
  for (const note of Array.isArray(templates._notes) ? templates._notes : []) lines.push(`※ ${note}`);
  for (const [key, tpl] of Object.entries(templates)) {
    if (key.startsWith('_') || !tpl || !tpl.fields) continue;
    const roles = tpl.roles ? ` · 역할 ${tpl.roles.map((r) => ROLE_LABELS[r] || r).join('·')}` : '';
    lines.push(`- ${key}(${tpl.label}) · ${IMAGE_LABELS[tpl.image] || tpl.image}${roles}`);
    for (const [field, rule] of Object.entries(tpl.fields)) lines.push(`    ${field}: ${ruleText(rule)}`);
  }
  return { design, colorMode, lines };
}

module.exports = { limitLines, ruleText };
