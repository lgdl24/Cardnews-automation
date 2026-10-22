// 제작 결과 비교 계산 (scripts/compare.js가 씀)
//   - 제작 폴더 여러 개를 나란히 비교: Skill 버전 비교(A5), 반복 실행 일관성(A6)
//   - 평가 실행(eval/runs)을 입력 × 규칙 버전 × 비교판으로 묶어 반복 일관성 계산(A6)
const fs = require('fs');
const path = require('path');
const { paths, readJson, loadConfig, loadInput, normalize } = require('./common');
const { computeQuality, round, mean } = require('./metrics');
const { readEvents } = require('./events');
const { summarize } = require('./analysis');

// 제작 폴더 하나 읽기 (지금 CARDNEWS_PRODUCTS_DIR 기준). 없으면 null
// config를 안 주면 제품 입력의 디자인 기준(프리미엄 등)으로 계산
function loadRun(id, config = null) {
  const file = paths.product(id, 'cards.json');
  const input = loadInput(id);
  if (!fs.existsSync(file) || !input) return null;
  const data = readJson(file);
  const quotes = new Map((data.sources || []).map((s) => [s.id, normalize(s.quote || '')]));
  const evidence = new Set(data.cards.flatMap((c) => (c.evidence || []).map((e) => quotes.get(e)).filter(Boolean)));
  return {
    id,
    input: normalize(input.productText),
    roles: data.cards.map((c) => c.role),
    templates: data.cards.map((c) => c.template),
    evidence,
    quality: (({ templates, caution }) => computeQuality({ data, input, templates, caution }))(config || loadConfig(input)),
    process: summarize(readEvents(id), { cardCount: data.cards.length }),
  };
}

// 같은 위치 같은 값의 비율 (길이가 다르면 긴 쪽 기준)
function seqMatch(a, b) {
  const n = Math.max(a.length, b.length);
  let same = 0;
  for (let k = 0; k < n; k += 1) if (a[k] === b[k]) same += 1;
  return n ? same / n : 1;
}
// 교집합 ÷ 합집합
function jaccard(a, b) {
  const union = new Set([...a, ...b]);
  const inter = [...a].filter((x) => b.has(x)).length;
  return union.size ? inter / union.size : 1;
}
// 모표준편차. 숫자가 2개 미만이면 null
function stdev(vals) {
  const xs = vals.filter((v) => typeof v === 'number');
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

function pairsOf(list) {
  const out = [];
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) out.push([list[i], list[j]]);
  return out;
}

// 일관성: 결과 쌍마다 계산해 평균. 결과가 2개 미만이면 순서·겹침은 null
function consistencyOf(runs) {
  const pairs = pairsOf(runs);
  const avg = (fn) => (pairs.length ? round(mean(pairs.map(([a, b]) => fn(a, b)))) : null);
  return {
    role_order_match: avg((a, b) => seqMatch(a.roles, b.roles)),
    template_order_match: avg((a, b) => seqMatch(a.templates, b.templates)),
    evidence_overlap: avg((a, b) => jaccard(a.evidence, b.evidence)),
    coverage_stdev: round(stdev(runs.map((r) => r.quality.coverage))),
    char_usage_stdev: round(stdev(runs.map((r) => r.quality.char_usage))),
  };
}

function rowOf(r) {
  return {
    product_id: r.id,
    skill_version: r.process.skill_versions.join(',') || '-',
    roles: r.roles.join('>'),
    coverage: r.quality.coverage,
    evidence_rate: r.quality.evidence_rate,
    char_usage: r.quality.char_usage,
    caution_not_in_source: r.quality.caution ? r.quality.caution.not_in_source : null,
    revisions: r.process.plan_revisions + r.process.revision_rounds,
    revision_types: r.process.revision_types,
    auto_fix: r.process.auto_fix_total,
    first_pass: r.process.first_pass,
    total_minutes: r.process.total_minutes,
  };
}

// 제작 폴더 비교 (기존 npm run compare -- <ID1> <ID2> ...)
function compareProducts(ids, config = null) {
  const runs = [];
  const missing = [];
  for (const id of ids) {
    const r = loadRun(id, config);
    if (r) runs.push(r);
    else missing.push(id);
  }
  return {
    missing,
    same_input: runs.every((r) => r.input === (runs[0] && runs[0].input)),
    runs: runs.map(rowOf),
    consistency: consistencyOf(runs),
  };
}

// 제품 폴더 위치를 잠시 바꿔 실행 (paths는 호출할 때 CARDNEWS_PRODUCTS_DIR를 읽음)
function inProductsDir(dir, fn) {
  const prev = process.env.CARDNEWS_PRODUCTS_DIR;
  process.env.CARDNEWS_PRODUCTS_DIR = dir;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.CARDNEWS_PRODUCTS_DIR;
    else process.env.CARDNEWS_PRODUCTS_DIR = prev;
  }
}

// 평가 실행 읽기: eval/runs/*/result.json (실행ID와 폴더 이름이 같은 것만)
function readEvalResults(runsDir, { batch = null } = {}) {
  if (!runsDir || !fs.existsSync(runsDir)) return [];
  const out = [];
  for (const id of fs.readdirSync(runsDir).sort()) {
    const file = path.join(runsDir, id, 'result.json');
    if (!fs.existsSync(file)) continue;
    let r;
    try {
      r = readJson(file);
    } catch {
      continue;
    }
    if (r.run_id !== id) continue;
    if (batch && r.batch !== batch) continue;
    out.push(r);
  }
  return out;
}

const groupKey = (r) => `${r.input_id}--${r.skill_version}${r.variant ? `-${r.variant}` : ''}`;

/**
 * 반복 일관성 (A6): 평가 실행을 입력 × 규칙 버전 × 비교판으로 묶고, 묶음마다
 *   - 실행 수·완료 수·체크리스트 통과 수·중단 오류 코드
 *   - 완료된 실행끼리 카드 구성 일치율·근거 겹침·지표 편차 (완료 2개 이상일 때)
 *   - 핵심 정보 포함률·처리 시간 평균과 편차 (result.json 값)
 */
function evalConsistency(runsDir, { batch = null, config = null } = {}) {
  const results = readEvalResults(runsDir, { batch });
  const groups = new Map();
  for (const r of results) {
    const k = groupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = [];
  for (const [key, list] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    list.sort((a, b) => a.repeat - b.repeat);
    const done = list.filter((r) => r.outcome && r.outcome.result === '완료');
    const stopped = list.filter((r) => !done.includes(r));
    const loaded = inProductsDir(runsDir, () => done.map((r) => loadRun(r.run_id, config)).filter(Boolean));
    const nums = (fn) => list.map(fn).filter((v) => typeof v === 'number');
    const keyInfo = nums((r) => r.metrics && r.metrics.key_info_rate);
    const duration = nums((r) => r.metrics && r.metrics.duration_ms);
    const errorCodes = {};
    for (const r of stopped) {
      const code = (r.outcome && r.outcome.error_code) || '기타';
      errorCodes[code] = (errorCodes[code] || 0) + 1;
    }
    out.push({
      group: key,
      input_id: list[0].input_id,
      skill_version: list[0].skill_version,
      variant: list[0].variant ?? null,
      batches: [...new Set(list.map((r) => r.batch))],
      runs: list.map((r) => r.run_id),
      run_count: list.length,
      completed: done.length,
      checks_passed: list.filter((r) => r.checks && r.checks.pass === true).length,
      first_pass: list.filter((r) => r.metrics && r.metrics.first_pass === true).length,
      stopped_error_codes: errorCodes,
      outcome_same: new Set(list.map((r) => `${r.outcome && r.outcome.result}|${r.outcome && r.outcome.error_code}`)).size === 1,
      consistency: loaded.length >= 2 ? consistencyOf(loaded) : null,
      key_info_rate_mean: keyInfo.length ? round(mean(keyInfo)) : null,
      key_info_rate_stdev: round(stdev(keyInfo)),
      duration_ms_mean: duration.length ? Math.round(mean(duration)) : null,
      duration_ms_stdev: duration.length >= 2 ? Math.round(stdev(duration)) : null,
    });
  }
  return { runs_dir: runsDir, batch, groups: out };
}

module.exports = {
  loadRun, seqMatch, jaccard, stdev, consistencyOf, rowOf, compareProducts, readEvalResults, evalConsistency, inProductsDir,
};
