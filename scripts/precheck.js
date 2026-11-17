// 게시 전 점검: npm run precheck -- <제품ID> [--json]
// output/publish-check.json 에 저장. 아무것도 고치지 않음. 고쳐야 할 것(fail)이 있으면 종료 코드 1
const fs = require('fs');
const { paths, readJson, loadInput, normalize, requireProductId } = require('./lib/common');
const { validate } = require('./validate');
const { publishCheck } = require('./lib/publish-check');

const MARK = { pass: '✓', warn: '!', fail: '✕', todo: '…' };
const WORD = { pass: '통과', warn: '사람 확인', fail: '고쳐야 함', todo: '아직' };

function run(id) {
  const { report, data } = validate(id);
  if (!data) return null;
  const input = loadInput(id);
  const result = {
    product_id: id,
    checked_at: new Date().toISOString(),
    ...publishCheck({
      productDir: paths.product(id),
      data,
      validation: report,
      caution: readJson(paths.config('caution-expressions.json')),
      sourceText: input ? normalize(input.productText) : '',
    }),
  };
  fs.mkdirSync(paths.product(id, 'output'), { recursive: true });
  fs.writeFileSync(paths.product(id, 'output', 'publish-check.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const id = requireProductId(args);
  const r = run(id);
  if (!r) {
    console.error('cards.json이 없거나 읽을 수 없어요');
    process.exit(1);
  }
  if (args.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`== 게시 전 점검: ${id} ==`);
    for (const c of r.checks) console.log(`${MARK[c.status]} ${c.label} [${WORD[c.status]}] ${c.detail}`);
    console.log(`-- 통과 ${r.counts.pass} · 사람 확인 ${r.counts.warn} · 고쳐야 함 ${r.counts.fail} · 아직 ${r.counts.todo} → ${r.ready ? '게시 가능' : '아직 게시할 수 없어요'}`);
  }
  process.exit(r.counts.fail ? 1 : 0);
}

module.exports = { run };
