// 제작 결과 비교: Skill 버전 비교(A5), 반복 실행 일관성(A6)
// 사용법:
//   node scripts/compare.js <제품ID1> <제품ID2> [...] [--json]
//     같은 입력으로 만든 제작 폴더들을 나란히 비교합니다. (폴더 준비: npm run new-run)
//   node scripts/compare.js --eval [--runs eval/runs] [--batch <묶음>] [--json]
//     평가 실행을 입력 × 규칙 버전 × 비교판으로 묶어 반복 실행 일관성을 계산합니다. (실행: npm run eval -- --repeat N)
const path = require('path');
const { paths } = require('./lib/common');
const { pct } = require('./lib/metrics');
const { compareProducts, evalConsistency } = require('./lib/compare');

function parseArgs(argv) {
  const opt = { ids: [], json: false, eval: false, runs: path.join(paths.root, 'eval', 'runs'), batch: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') opt.json = true;
    else if (a === '--eval') opt.eval = true;
    else if (a === '--runs') opt.runs = path.resolve(argv[(i += 1)] || '');
    else if (a === '--batch') opt.batch = argv[(i += 1)] || null;
    else if (a.startsWith('--')) throw new Error(`모르는 옵션이에요: ${a}`);
    else opt.ids.push(a);
  }
  if (!opt.eval && opt.ids.length < 2) throw new Error('비교할 제품ID를 2개 이상 주거나 --eval을 써주세요');
  if (opt.eval && opt.ids.length) throw new Error('--eval에는 제품ID를 함께 쓰지 않아요 (--batch로 묶음을 고름)');
  return opt;
}

const num = (v) => (v === null || v === undefined ? '-' : v);
const sec = (ms) => (typeof ms === 'number' ? `${Math.round(ms / 1000)}초` : '-');

function printConsistency(c, indent = '') {
  console.log(`${indent}- 카드 역할 순서 일치율 ${pct(c.role_order_match)}`);
  console.log(`${indent}- 템플릿 순서 일치율 ${pct(c.template_order_match)}`);
  console.log(`${indent}- 사용한 원문 근거 겹침(교집합÷합집합) ${pct(c.evidence_overlap)}`);
  console.log(`${indent}- 원문 커버리지 편차 ${num(c.coverage_stdev)} · 글자 수 활용률 편차 ${num(c.char_usage_stdev)}`);
}

function printProducts(res) {
  if (!res.same_input) console.log('[경고] 입력 원문이 서로 달라요. 같은 입력으로 만든 결과끼리 비교해야 해요.');
  console.log('\n제작\t규칙\t카드 구성\t커버리지\t근거 연결\t글자 활용\t주의(원문 밖)\t수정\t자동 수정\t1회 통과\t시간(분)');
  for (const r of res.runs) {
    const fp = r.first_pass === null ? '-' : r.first_pass ? 'O' : 'X';
    console.log([
      r.product_id, r.skill_version, r.roles, pct(r.coverage), pct(r.evidence_rate), pct(r.char_usage),
      r.caution_not_in_source ?? '-', r.revisions, r.auto_fix, fp, r.total_minutes ?? '-',
    ].join('\t'));
  }
  console.log('\n수정 유형');
  for (const r of res.runs) {
    console.log(`${r.product_id}: ${Object.entries(r.revision_types).map(([k, n]) => `${k} ${n}`).join(', ') || '없음'}`);
  }
  console.log(`\n일관성 (${res.runs.length}개 결과, 쌍별 평균)`);
  printConsistency(res.consistency);
}

function printEval(res) {
  console.log(`평가 실행 반복 일관성: ${path.relative(paths.root, res.runs_dir) || res.runs_dir}${res.batch ? ` · 묶음 ${res.batch}` : ''}`);
  if (!res.groups.length) {
    console.log('result.json이 있는 평가 실행이 없어요. npm run eval -- <입력ID> --batch <묶음> --repeat 3 으로 먼저 실행해 주세요.');
    return;
  }
  for (const g of res.groups) {
    console.log(`\n▶ ${g.group} (실행 ${g.run_count}개: ${g.runs.map((r) => r.split('--').pop()).join(', ')})`);
    const codes = Object.entries(g.stopped_error_codes).map(([k, n]) => `${k} ${n}`).join(', ');
    console.log(`- 완료 ${g.completed}/${g.run_count}${codes ? ` (중단: ${codes})` : ''} · 체크리스트 통과 ${g.checks_passed}/${g.run_count} · 1회 통과 ${g.first_pass}/${g.run_count} · 결과 같음 ${g.outcome_same ? 'O' : 'X'}`);
    console.log(`- 핵심 정보 포함률 평균 ${pct(g.key_info_rate_mean)} · 편차 ${num(g.key_info_rate_stdev)}`);
    console.log(`- 처리 시간 평균 ${sec(g.duration_ms_mean)} · 편차 ${sec(g.duration_ms_stdev)}`);
    if (g.consistency) printConsistency(g.consistency);
    else console.log('- 카드 구성 비교: 완료된 실행이 2개 이상일 때 계산해요');
  }
}

function main() {
  let opt;
  try {
    opt = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`${e.message}\n사용법: npm run compare -- <제품ID1> <제품ID2> [...] [--json]\n       npm run compare -- --eval [--runs eval/runs] [--batch <묶음>] [--json]`);
    process.exit(2);
  }
  const res = opt.eval ? evalConsistency(opt.runs, { batch: opt.batch }) : compareProducts(opt.ids);
  if (!opt.eval && res.missing.length) {
    console.error(`${res.missing.join(', ')}: cards.json 또는 input.md가 없어요`);
    process.exit(1);
  }
  if (opt.json) {
    const { missing, ...rest } = res;
    console.log(JSON.stringify(rest, null, 2));
    return;
  }
  if (opt.eval) printEval(res);
  else printProducts(res);
}

if (require.main === module) main();

module.exports = { parseArgs };
