// 웹 데이터 내보내기: config/export.json의 제품과 완료된 평가 실행(eval/runs)을 결과 보기 웹이 읽는 정적 데이터로 만든다
// 사용: npm run export [-- --out <폴더>] [--only <제품ID>] [--no-eval]
// 규격: docs/web-data-spec.md — 내보낼 수 없는 제품은 이유와 함께 건너뛰고, 결과는 스키마로 검사한다
const fs = require('fs');
const path = require('path');
const { ROOT, paths, readJson } = require('./lib/common');
const { buildProject, buildIndex } = require('./lib/web-data');
const { checkWebData } = require('./lib/web-schema');

const KINDS = ['production', 'example', 'eval'];

function parseArgs(argv) {
  const opts = { out: null, only: null, config: null, evalRuns: path.join(ROOT, 'eval', 'runs') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--only') opts.only = argv[++i];
    else if (a === '--config') opts.config = argv[++i];
    else if (a === '--eval-runs') opts.evalRuns = path.resolve(argv[++i]);
    else if (a === '--no-eval') opts.evalRuns = null;
    else throw new Error(`알 수 없는 옵션: ${a}`);
  }
  return opts;
}

function loadExportConfig(file) {
  const cfg = readJson(file);
  if (!Array.isArray(cfg.projects)) throw new Error(`${file}: projects 목록이 없어요`);
  const seen = new Set();
  for (const p of cfg.projects) {
    if (!/^[a-z0-9-]+$/.test(p.id || '')) throw new Error(`${file}: 제품ID 형식이 아니에요: ${p.id}`);
    if (seen.has(p.id)) throw new Error(`${file}: 같은 제품ID가 두 번 있어요: ${p.id}`);
    if (!KINDS.includes(p.kind)) throw new Error(`${file}: ${p.id}의 kind는 ${KINDS.join('·')} 중 하나여야 해요`);
    seen.add(p.id);
  }
  return cfg;
}

// 평가 실행 목록 (docs/eval-spec.md '웹으로 내보낼 때'): eval/runs/*/result.json 중 outcome.result가 '완료'인 실행
// 실행 폴더는 제품 폴더와 모양이 같아서, 그 폴더를 제품 폴더 위치로 두고 그대로 내보냄
function evalTargets(runsDir) {
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
    if (!r.outcome || r.outcome.result !== '완료' || r.run_id !== id) continue;
    out.push({
      id,
      kind: 'eval',
      label: `평가 · ${r.batch}`,
      eval: { input_id: r.input_id, run_id: r.run_id, repeat: r.repeat, variant: r.variant ?? null },
      dir: runsDir,
    });
  }
  return out;
}

// 제품 폴더 위치를 잠시 바꿔 실행 (경로는 호출할 때 CARDNEWS_PRODUCTS_DIR를 읽음)
function inProductsDir(dir, fn) {
  if (!dir) return fn();
  const before = process.env.CARDNEWS_PRODUCTS_DIR;
  process.env.CARDNEWS_PRODUCTS_DIR = dir;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.CARDNEWS_PRODUCTS_DIR;
    else process.env.CARDNEWS_PRODUCTS_DIR = before;
  }
}

const writeJson = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
};

// evalRuns: 평가 실행 폴더(eval/runs). 주면 완료된 평가 실행도 kind: eval로 함께 내보냄 (CLI 기본값, 함수 기본값은 안 읽음)
// 반환: { outDir, exported: [id], excluded: [{ id, reason, detail }], schemaErrors: [문자열] }
function exportWebData({ out = null, only = null, config = null, exportedAt, evalRuns = null } = {}) {
  const cfgFile = config ? path.resolve(config) : paths.config('export.json');
  const cfg = loadExportConfig(cfgFile);
  const outDir = path.resolve(ROOT, out || cfg.out_dir || 'web/public/data');
  const configIds = new Set(cfg.projects.map((p) => p.id));
  const all = [...cfg.projects, ...evalTargets(evalRuns).filter((t) => !configIds.has(t.id))];
  const targets = only ? all.filter((p) => p.id === only) : all;
  if (only && !targets.length) throw new Error(`${path.relative(ROOT, cfgFile)}에도 완료된 평가 실행에도 ${only}가 없어요`);

  const built = [];
  const excluded = [];
  for (const t of targets) {
    const r = inProductsDir(t.dir, () => buildProject(t.id, { kind: t.kind, label: t.label ?? null, evalInfo: t.eval ?? null }));
    if (r.ok) built.push(r);
    else excluded.push({ id: t.id, reason: r.reason, detail: r.detail });
  }

  // --only면 기존 index.json의 다른 프로젝트 요약을 유지하고 그 프로젝트만 바꿈
  let summaries = built.map((b) => b.summary);
  const indexFile = path.join(outDir, 'index.json');
  if (only && fs.existsSync(indexFile)) {
    const prev = readJson(indexFile).projects || [];
    const order = all.map((p) => p.id);
    summaries = [...prev.filter((p) => p.id !== only && order.includes(p.id)), ...summaries]
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  const index = buildIndex(summaries, { exportedAt });

  // 쓰기 전에 전부 스키마 검사: 하나라도 틀리면 아무것도 쓰지 않음
  const schemaErrors = [
    ...checkWebData('index', index).map((e) => `index.json ${e}`),
    ...built.flatMap((b) => [
      ...checkWebData('project', b.project).map((e) => `${b.project.id}/project.json ${e}`),
      ...checkWebData('timeline', b.timeline).map((e) => `${b.project.id}/timeline.json ${e}`),
    ]),
  ];
  if (schemaErrors.length) return { outDir, exported: [], excluded, schemaErrors };

  // 평가 결과(eval/)는 평가 실행기가 관리하므로 지우지 않음
  const projectsDir = path.join(outDir, 'projects');
  if (only) fs.rmSync(path.join(projectsDir, only), { recursive: true, force: true });
  else fs.rmSync(projectsDir, { recursive: true, force: true });

  for (const b of built) {
    const dir = path.join(projectsDir, b.project.id);
    writeJson(path.join(dir, 'project.json'), b.project);
    writeJson(path.join(dir, 'timeline.json'), b.timeline);
    fs.mkdirSync(path.join(dir, 'png'), { recursive: true });
    for (const p of b.pngs) fs.copyFileSync(p.src, path.join(dir, p.rel));
  }
  writeJson(indexFile, index);
  return { outDir, exported: built.map((b) => b.project.id), excluded, schemaErrors };
}

if (require.main === module) {
  let result;
  try {
    result = exportWebData(parseArgs(process.argv.slice(2)));
  } catch (e) {
    console.error(`[오류] ${e.message}`);
    process.exit(2);
  }
  const { outDir, exported, excluded, schemaErrors } = result;
  console.log(`\n== 웹 데이터 내보내기 → ${path.relative(ROOT, outDir) || '.'} ==`);
  for (const id of exported) console.log(`[내보냄] ${id}`);
  for (const x of excluded) console.log(`[제외] ${x.id} | ${x.reason} | ${x.detail}`);
  for (const e of schemaErrors) console.log(`[오류] SCHEMA_ERROR | ${e}`);
  if (schemaErrors.length) console.log('-- 스키마 검사 실패: 아무 파일도 쓰지 않았어요');
  else console.log(`-- 내보냄 ${exported.length}개, 제외 ${excluded.length}개`);
  process.exit(schemaErrors.length ? 1 : 0);
}

module.exports = { exportWebData, loadExportConfig, parseArgs, evalTargets };
