// 웹 데이터 만들기: 제품 폴더 → index.json · project.json · timeline.json (docs/web-data-spec.md)
// 웹에 공개해도 되는 값만 옮긴다: input.md 전체·입력 이미지 원본·토큰·비용·지시문 형태 원문 문장은 넣지 않음
const fs = require('fs');
const path = require('path');
const { paths, readJson, loadConfig, loadInput, normalize, countChars } = require('./common');
const { readEvents } = require('./events');
const { summarize, PHASES } = require('./analysis');
const { findCautions, round } = require('./metrics');
const { pad } = require('./card-html');

const SPEC_VERSION = '0.3';
const KINDS = { production: '실제 제작', example: '예시', eval: '평가 실행' };
const STAGE_LABELS = { plan: '구성안', copy: '문구', approved: '승인 완료' };
const ROLE_LABELS = { cover: '표지', feature: '특징', usage: '사용법', detail: '상세', closing: '마무리' };
// timeline.json에 옮기는 이벤트 필드 (나머지는 공개하지 않음)
const EVENT_FIELDS = ['ts', 'event', 'job_id', 'kind', 'ok', 'error_code', 'check', 'error_codes', 'cards_with_errors', 'stage', 'cards', 'types', 'memo', 'rendered_cards'];

// 화면 공통 이름표: 원본은 config/와 검증 코드
function buildLabels() {
  const { templates } = loadConfig();
  const revisionTypes = readJson(paths.config('revision-types.json')).types;
  return {
    kinds: KINDS,
    stages: STAGE_LABELS,
    roles: ROLE_LABELS,
    templates: Object.fromEntries(Object.entries(templates).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v.label])),
    revision_types: Object.fromEntries(revisionTypes.map((t) => [t.code, t.label])),
    phases: PHASES,
  };
}

// 카드별 최근 출력 보고서: 전체 출력 위에 더 최근의 카드별 재출력(render-report-card-NN.json)을 덮어씀
function latestLayout(id) {
  const dir = paths.product(id, 'output');
  if (!fs.existsSync(dir)) return new Map();
  const reports = fs.readdirSync(dir)
    .filter((f) => /^render-report(-card-\d+)?\.json$/.test(f))
    .map((f) => readJson(path.join(dir, f)))
    .sort((a, b) => String(a.rendered_at).localeCompare(String(b.rendered_at)));
  const byCard = new Map();
  for (const r of reports) {
    for (const c of r.results || []) {
      byCard.set(c.no, { ok: (c.issues || []).length === 0, issues: c.issues || [], overlaps: c.overlaps || [] });
    }
  }
  return byCard;
}

// 출력에 쓴 카드 색 (render-report.json의 colors, #38). 가장 최근 보고서의 값. 색 기록이 없는 옛 출력이면 null
function latestColors(id) {
  const dir = paths.product(id, 'output');
  if (!fs.existsSync(dir)) return null;
  const withColors = fs.readdirSync(dir)
    .filter((f) => /^render-report(-card-\d+)?\.json$/.test(f))
    .map((f) => readJson(path.join(dir, f)))
    .filter((r) => r.colors && r.colors.color)
    .sort((a, b) => String(a.rendered_at).localeCompare(String(b.rendered_at)));
  const c = withColors.length ? withColors[withColors.length - 1].colors : null;
  if (!c) return null;
  return {
    mode: c.mode,
    source: c.source,
    image: c.image ?? null,
    representative: c.representative ?? null,
    color: c.color,
    adjustments: (c.adjustments || []).map(({ key, from, to }) => ({ key, from, to })),
    note: c.note ?? null,
  };
}

function charRows(card, templates) {
  const tpl = templates[card.template];
  if (!tpl || !card.copy) return [];
  const rows = [];
  for (const [field, rule] of Object.entries(tpl.fields)) {
    const v = card.copy[field];
    if (field === 'items' && Array.isArray(v)) {
      v.forEach((t, i) => {
        if (typeof t !== 'string') return;
        rows.push({ field, index: i, chars: countChars(t), limit: rule.maxCharsPerItem, ratio: round(countChars(t) / rule.maxCharsPerItem) });
      });
    } else if (typeof v === 'string' && v && rule.maxChars) {
      rows.push({ field, index: null, chars: countChars(v), limit: rule.maxChars, ratio: round(countChars(v) / rule.maxChars) });
    }
  }
  return rows;
}

const revisionOf = (r) => ({ ts: r.ts, types: r.types || [], memo: r.memo || '' });

// 제품 하나를 내보낼 수 있는지 확인하고 웹 데이터를 만든다
// 반환: { ok: true, project, timeline, summary, pngs } 또는 { ok: false, reason, detail }
function buildProject(id, { kind = 'production', label = null, evalInfo = null } = {}) {
  // validate는 lib에서 불러오면 순환 참조가 생겨 여기서 require
  const { validate, quality } = require('../validate');
  if (!fs.existsSync(paths.product(id))) return { ok: false, reason: 'INPUT_MISSING', detail: '제품 폴더가 없어요' };

  const result = validate(id);
  const input = result.input || loadInput(id);
  if (!input) return { ok: false, reason: 'INPUT_MISSING', detail: 'input.md가 없어요' };
  if (!result.data) return { ok: false, reason: 'INPUT_MISSING', detail: result.report.errors.map((e) => e.message).join(' / ') };
  if (result.report.errors.length) {
    const codes = [...new Set(result.report.errors.map((e) => e.code))];
    return { ok: false, reason: 'VALIDATE_ERROR', detail: `검증 오류 ${result.report.errors.length}개 (${codes.join(', ')})` };
  }

  const data = result.data;
  const stageOk = kind === 'eval' ? data.stage === 'copy' || data.stage === 'approved' : data.stage === 'approved';
  if (!stageOk) return { ok: false, reason: 'NOT_APPROVED', detail: `stage가 ${data.stage}예요 (${kind === 'eval' ? 'copy 이상' : 'approved'} 필요)` };

  const pngs = data.cards.map((c) => ({ no: c.no, rel: `png/card-${pad(c.no)}.png`, src: paths.product(id, 'output', 'png', `card-${pad(c.no)}.png`) }));
  const missing = pngs.filter((p) => !fs.existsSync(p.src));
  if (missing.length) return { ok: false, reason: 'PNG_MISSING', detail: `PNG가 없어요: ${missing.map((p) => p.no).join(', ')}번 카드 (npm run render)` };

  const layout = latestLayout(id);
  const noReport = data.cards.filter((c) => !layout.has(c.no));
  if (noReport.length) return { ok: false, reason: 'LAYOUT_ERROR', detail: `출력 점검 기록이 없어요: ${noReport.map((c) => c.no).join(', ')}번 카드 (npm run render)` };
  const broken = data.cards.filter((c) => !layout.get(c.no).ok);
  if (broken.length) return { ok: false, reason: 'LAYOUT_ERROR', detail: `레이아웃 오류: ${broken.map((c) => c.no).join(', ')}번 카드` };

  const { templates, caution } = loadConfig();
  const q = quality(result);
  const events = readEvents(id);
  const cautions = findCautions(data, normalize(input.productText), caution);
  const revisions = events.filter((e) => e.event === 'revision_requested');

  const cards = data.cards.map((c, i) => ({
    no: c.no,
    role: c.role,
    template: c.template,
    intent: c.intent,
    image: c.image ?? null,
    evidence: c.evidence || [],
    copy: c.copy || null,
    png: pngs[i].rel,
    chars: charRows(c, templates),
    cautions: cautions.filter((x) => x.card === c.no).map(({ term, category, in_source, fields }) => ({ term, category, in_source, fields })),
    layout: layout.get(c.no),
    revisions: revisions.filter((r) => r.stage === 'final' && (r.cards || []).includes(c.no)).map(revisionOf),
  }));

  const skillVersion = [...events].reverse().find((e) => e.skill_version)?.skill_version || null;
  const updatedAt = events.length ? events[events.length - 1].ts : null;
  const { coverage_detail: detail, ...qualityRest } = q;
  const product = {
    name: (input.info['제품명'] || id).split('\n')[0],
    brand: input.info['브랜드'] || null,
    category: input.info['카테고리'] || null,
    purpose: input.cond['콘텐츠 목적'] || null,
    emphasis: input.cond['강조 정보'] || null,
    card_count: input.cardCount ?? data.cards.length,
  };

  const project = {
    spec_version: SPEC_VERSION,
    id,
    kind,
    label,
    stage: data.stage,
    skill_version: skillVersion,
    updated_at: updatedAt,
    product,
    images: input.images.map(({ file, desc, source, usage }) => ({ file, desc, source, usage })),
    sources: data.sources,
    analysis: data.analysis,
    cards,
    plan_revisions: revisions.filter((r) => r.stage === 'plan').map(revisionOf),
    colors: latestColors(id),
    quality: {
      ...qualityRest,
      coverage_detail: {
        covered: detail.covered,
        total: detail.total,
        missing: detail.missing.map(({ section, text }) => ({ section, text })),
        excluded_count: detail.excluded.length,
      },
    },
  };

  const s = summarize(events, { cardCount: data.cards.length });
  const timeline = {
    spec_version: SPEC_VERSION,
    id,
    summary: {
      complete: s.complete,
      total_minutes: s.total_minutes,
      ai_minutes: s.ai_minutes,
      human_minutes: s.human_minutes,
      phases: s.phases,
      plan_revisions: s.plan_revisions,
      revision_rounds: s.revision_rounds,
      revised_card_ratio: s.revised_card_ratio,
      revision_types: s.revision_types,
      first_pass: s.first_pass,
      auto_fix_total: s.auto_fix_total,
    },
    jobs: s.jobs.map(({ job_id, kind: k, ok, minutes, error_code, first_pass, auto_fix_count }) => ({
      job_id, kind: k ?? null, ok: ok ?? null, minutes, error_code, first_pass, auto_fix_count,
    })),
    events: events.map((e) => {
      const o = {};
      for (const k of EVENT_FIELDS) if (e[k] !== undefined) o[k] = e[k];
      if (e.event === 'job_finished' && o.error_code === undefined) o.error_code = null;
      if (e.event === 'plan_approved' || e.event === 'final_approved') o.approved_by = e.approved_by || 'human';
      return o;
    }),
  };

  const summary = {
    id,
    kind,
    label,
    product_name: product.name,
    brand: product.brand,
    category: product.category,
    stage: data.stage,
    skill_version: skillVersion,
    card_count: data.cards.length,
    updated_at: updatedAt,
    thumbnail: `projects/${id}/${pngs[0].rel}`,
    summary: {
      coverage: q.coverage,
      evidence_rate: q.evidence_rate,
      caution_total: q.caution ? q.caution.total : null,
      first_pass: s.first_pass,
      total_minutes: s.total_minutes,
      revision_rounds: s.revision_rounds,
    },
    eval: evalInfo,
  };

  return { ok: true, project, timeline, summary, pngs };
}

function buildIndex(summaries, { exportedAt = new Date().toISOString() } = {}) {
  return {
    spec_version: SPEC_VERSION,
    exported_at: exportedAt,
    skill_version: readJson(paths.config('skill-version.json')).version,
    labels: buildLabels(),
    projects: summaries,
  };
}

module.exports = { SPEC_VERSION, KINDS, STAGE_LABELS, ROLE_LABELS, buildLabels, buildProject, buildIndex, latestLayout, latestColors };
