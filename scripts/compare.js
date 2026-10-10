// 제작 결과 비교: Skill 버전 비교(A5), 반복 실행 일관성(A6)
// 사용법: node scripts/compare.js <제품ID1> <제품ID2> [...] [--json]
//   같은 입력으로 만든 제작 폴더들을 나란히 비교합니다. (폴더 준비: npm run new-run)
const fs = require('fs');
const { paths, readJson, loadConfig, loadInput, normalize } = require('./lib/common');
const { computeQuality, pct, round, mean } = require('./lib/metrics');
const { readEvents } = require('./lib/events');
const { summarize } = require('./lib/analysis');

const argv = process.argv.slice(2);
const ids = argv.filter((a) => !a.startsWith('--'));
if (ids.length < 2) {
  console.error('사용법: node scripts/compare.js <제품ID1> <제품ID2> [...] [--json]');
  process.exit(2);
}

const { templates, caution } = loadConfig();
const runs = ids.map((id) => {
  const file = paths.product(id, 'cards.json');
  const input = loadInput(id);
  if (!fs.existsSync(file) || !input) {
    console.error(`${id}: cards.json 또는 input.md가 없어요`);
    process.exit(1);
  }
  const data = readJson(file);
  const quotes = new Map((data.sources || []).map((s) => [s.id, normalize(s.quote || '')]));
  const evidence = new Set(data.cards.flatMap((c) => (c.evidence || []).map((e) => quotes.get(e)).filter(Boolean)));
  return {
    id,
    input: normalize(input.productText),
    roles: data.cards.map((c) => c.role),
    templates: data.cards.map((c) => c.template),
    evidence,
    quality: computeQuality({ data, input, templates, caution }),
    process: summarize(readEvents(id), { cardCount: data.cards.length }),
  };
});

const sameInput = runs.every((r) => r.input === runs[0].input);
const pairs = [];
for (let i = 0; i < runs.length; i += 1) for (let j = i + 1; j < runs.length; j += 1) pairs.push([runs[i], runs[j]]);
const seqMatch = (a, b) => {
  const n = Math.max(a.length, b.length);
  let same = 0;
  for (let k = 0; k < n; k += 1) if (a[k] === b[k]) same += 1;
  return n ? same / n : 1;
};
const jaccard = (a, b) => {
  const union = new Set([...a, ...b]);
  const inter = [...a].filter((x) => b.has(x)).length;
  return union.size ? inter / union.size : 1;
};
const stdev = (vals) => {
  const xs = vals.filter((v) => typeof v === 'number');
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
};

const consistency = {
  role_order_match: round(mean(pairs.map(([a, b]) => seqMatch(a.roles, b.roles)))),
  template_order_match: round(mean(pairs.map(([a, b]) => seqMatch(a.templates, b.templates)))),
  evidence_overlap: round(mean(pairs.map(([a, b]) => jaccard(a.evidence, b.evidence)))),
  coverage_stdev: round(stdev(runs.map((r) => r.quality.coverage))),
  char_usage_stdev: round(stdev(runs.map((r) => r.quality.char_usage))),
};

const rows = runs.map((r) => ({
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
}));

if (argv.includes('--json')) {
  console.log(JSON.stringify({ same_input: sameInput, runs: rows, consistency }, null, 2));
  process.exit(0);
}

if (!sameInput) console.log('[경고] 입력 원문이 서로 달라요. 같은 입력으로 만든 결과끼리 비교해야 해요.');
console.log('\n제작\t규칙\t카드 구성\t커버리지\t근거 연결\t글자 활용\t주의(원문 밖)\t수정\t자동 수정\t1회 통과\t시간(분)');
for (const r of rows) {
  const fp = r.first_pass === null ? '-' : r.first_pass ? 'O' : 'X';
  console.log([
    r.product_id, r.skill_version, r.roles, pct(r.coverage), pct(r.evidence_rate), pct(r.char_usage),
    r.caution_not_in_source ?? '-', r.revisions, r.auto_fix, fp, r.total_minutes ?? '-',
  ].join('\t'));
}
console.log('\n수정 유형');
for (const r of rows) {
  console.log(`${r.product_id}: ${Object.entries(r.revision_types).map(([k, n]) => `${k} ${n}`).join(', ') || '없음'}`);
}
console.log(`\n일관성 (${runs.length}개 결과, 쌍별 평균)`);
console.log(`- 카드 역할 순서 일치율 ${pct(consistency.role_order_match)}`);
console.log(`- 템플릿 순서 일치율 ${pct(consistency.template_order_match)}`);
console.log(`- 사용한 원문 근거 겹침(교집합÷합집합) ${pct(consistency.evidence_overlap)}`);
console.log(`- 원문 커버리지 편차 ${consistency.coverage_stdev ?? '-'} · 글자 수 활용률 편차 ${consistency.char_usage_stdev ?? '-'}`);
