// 카드 글자 수 기준 안내: 입력의 '무드'(기본·프리미엄 등)에 맞는 기준을 사람이 읽는 줄로 만든다
// npm run check가 출력 → Claude가 1단계(입력 확인)에서 바로 보고 문구를 그 기준으로 씀 (#67)
// 기준 원본은 config/templates.json (무드 묶음은 _designs.<이름>이 기본 정의를 덮어씀)
const { loadConfig, resolveDesign, moodInputOf, designCatalog } = require('./common');
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

const NEEDS_LABELS = { required: '필수', optional: '있으면 좋음', none: '안 씀' };
const AUTO_DESIGN = '자동 추천';

// 디자인 묶음 목록 (config/templates.json _catalog) — 무드가 자동 추천일 때 구성안 작업에서 고르는 기준 (#74)
function catalogLines() {
  const lines = ['== 디자인 묶음 목록 (무드 자동 추천) =='];
  for (const d of designCatalog()) {
    lines.push(`- ${d.id} (v${d.version}): ${d.summary}`);
    lines.push(`    어울림: ${(d.fits || []).join(' / ')}`);
    if (d.avoid && d.avoid.length) lines.push(`    피함: ${d.avoid.join(' / ')}`);
    lines.push(`    필요한 사진: 제품 ${NEEDS_LABELS[d.needs?.product] || '-'} · 배경 장면 ${NEEDS_LABELS[d.needs?.background] || '-'} · 카드 색 기본값 ${d.colorMode}`);
  }
  return lines;
}

/**
 * 무드 자동 추천이고 아직 안 골랐으면 글자 수 대신 묶음 목록을 돌려줌 (design: null)
 * @returns {{ design: string|null, source: string, colorMode: string|null, lines: string[] }}
 */
function limitLines(input, data = null) {
  const { id: design, source } = resolveDesign({ input, data });
  const auto = moodInputOf(input).value === AUTO_DESIGN;
  if (auto && source !== 'cards') {
    return {
      design: null,
      source,
      colorMode: null,
      lines: [
        `무드: ${AUTO_DESIGN} — 아직 묶음을 고르지 않았어요. 구성안 작업에서 아래 목록 중 제품 자료·사진·콘텐츠 목적에 가장 맞는 묶음 하나를 골라 cards.json에 "design": { "id", "selected_by": "claude", "reason" }으로 적어요. '필요한 사진'이 필수인데 입력 사진이 못 채우면 그 묶음은 고르지 않아요. 고른 뒤 npm run check를 다시 실행하면 그 묶음의 글자 수 기준이 나와요`,
        ...catalogLines(),
      ],
    };
  }
  const { templates } = loadConfig(input, data);
  const colorRaw = ((input && input.cond && input.cond['카드 색']) || '').split('\n')[0].trim();
  const colorMode = colorModeOf(input, data);
  const lines = [];
  const how = design === '기본'
    ? 'config/templates.json의 템플릿별 기준을 써요'
    : `config/templates.json의 _designs.${design} 기준을 써요 (기본 템플릿 기준과 달라요. 아래 숫자로 문구를 쓰세요)`;
  if (source === 'cards') {
    const by = data.design.selected_by === 'human' ? '사람이 고름' : 'Claude가 고름';
    lines.push(`무드: ${design} (구성안에서 ${by}: ${data.design.reason}) — ${how}`);
  } else {
    lines.push(`무드: ${design} — ${how}`);
  }
  lines.push(`카드 색: ${colorMode}${colorRaw ? '' : ' (비어 있어서 무드 기본값)'}`);
  // 무드 묶음이 자동으로 붙이는 머리말 등 문구를 쓸 때 알아야 할 것 (_designs.<이름>._notes)
  for (const note of Array.isArray(templates._notes) ? templates._notes : []) lines.push(`※ ${note}`);
  for (const [key, tpl] of Object.entries(templates)) {
    if (key.startsWith('_') || !tpl || !tpl.fields) continue;
    const roles = tpl.roles ? ` · 역할 ${tpl.roles.map((r) => ROLE_LABELS[r] || r).join('·')}` : '';
    lines.push(`- ${key}(${tpl.label}) · ${IMAGE_LABELS[tpl.image] || tpl.image}${roles}`);
    for (const [field, rule] of Object.entries(tpl.fields)) lines.push(`    ${field}: ${ruleText(rule)}`);
  }
  return { design, source, colorMode, lines };
}

module.exports = { limitLines, ruleText, catalogLines };
