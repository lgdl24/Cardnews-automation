// 배포 전 점검: 결과 보기 웹에 올라갈 파일에 비밀 값·불필요한 파일·사용 확인 안 된 이미지가 없는지
// 사용법: node scripts/check-web.js [--data web/public/data] [--dist web/dist] [--no-dist] [--json]
//   --data : 내보낸 웹 데이터 폴더 (npm run export 결과)
//   --dist : 빌드 결과 폴더 (npm run web:build 결과). 없으면 건너뜀
// 오류가 있으면 종료 코드 1 → 배포하지 않음
const fs = require('fs');
const path = require('path');
const { paths, createReport, printReport } = require('./lib/common');
const { checkWebData } = require('./lib/web-schema');

// 데이터 폴더에 있어도 되는 파일 (docs/web-data-spec.md 폴더 구성)
const DATA_FILE_RE = /^(index\.json|projects\/[a-z0-9-]+\/(project\.json|timeline\.json|png\/card-\d{2}\.png))$/;

// 비밀 값 형태 (값 자체는 출력하지 않고 종류·위치만 알림)
const SECRET_PATTERNS = [
  ['Anthropic API 키', /sk-ant-[A-Za-z0-9_-]{10,}/],
  ['OpenAI 형식 키', /\bsk-[A-Za-z0-9]{32,}\b/],
  ['GitHub 토큰', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|github_pat_[A-Za-z0-9_]{30,}/],
  ['AWS 접근 키', /\bAKIA[0-9A-Z]{16}\b/],
  ['개인 키', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['환경 변수 대입', /\b(ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|GITHUB_TOKEN|OPENAI_API_KEY)\s*[=:]\s*['"]?[A-Za-z0-9_-]{8,}/],
];

// 빌드 결과에 있으면 안 되는 파일
const DIST_FORBIDDEN_RE = /(^|\/)(\.env(\..*)?|input\.md|log\.jsonl|cards\.json|result\.json|render-report[^/]*\.json|quality\.json)$/;
const TEXT_EXT = new Set(['.json', '.js', '.mjs', '.css', '.html', '.txt', '.map', '.svg', '.md']);

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

function scanSecrets(report, dir, files, label) {
  for (const f of files) {
    if (!TEXT_EXT.has(path.extname(f).toLowerCase()) && !/(^|\/)\.env/.test(f)) continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const [kind, re] of SECRET_PATTERNS) {
      if (re.test(text)) report.error('SECRET', `${label}/${f}`, `${kind}로 보이는 값이 있어요 (값은 출력하지 않음)`);
    }
  }
}

const readJsonSafe = (file) => {
  try {
    return { data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { error: e.message };
  }
};

/**
 * @param {object} o
 * @param {string} o.dataDir  내보낸 웹 데이터 폴더
 * @param {string|null} o.distDir  빌드 결과 폴더 (없으면 건너뜀)
 * @returns report (errors·warnings·cautions) + summary
 */
function checkWebDeploy({ dataDir, distDir = null }) {
  const report = createReport();
  const summary = { data_files: 0, data_bytes: 0, projects: 0, dist_files: 0, dist_checked: false };

  // ── 1) 데이터 폴더
  if (!fs.existsSync(path.join(dataDir, 'index.json'))) {
    report.error('DEPLOY_FILE', 'index.json', `웹 데이터가 없어요: ${dataDir} (npm run export)`);
    return Object.assign(report, { summary });
  }
  const files = listFiles(dataDir);
  summary.data_files = files.length;
  for (const f of files) {
    summary.data_bytes += fs.statSync(path.join(dataDir, f)).size;
    if (!DATA_FILE_RE.test(f)) report.error('DEPLOY_FILE', f, '웹 데이터 규격에 없는 파일이에요. 배포에서 빼 주세요');
  }
  scanSecrets(report, dataDir, files, 'data');

  const idx = readJsonSafe(path.join(dataDir, 'index.json'));
  if (idx.error) {
    report.error('SCHEMA_ERROR', 'index.json', `JSON을 읽을 수 없어요: ${idx.error}`);
    return Object.assign(report, { summary });
  }
  for (const e of checkWebData('index', idx.data)) report.error('SCHEMA_ERROR', 'index.json', e);
  const listed = (idx.data.projects || []).map((p) => p.id);
  summary.projects = listed.length;
  const folders = [...new Set(files.filter((f) => f.startsWith('projects/')).map((f) => f.split('/')[1]))];
  for (const id of folders.filter((d) => !listed.includes(d))) {
    report.error('DEPLOY_FILE', `projects/${id}`, 'index.json 목록에 없는 프로젝트 폴더예요 (지난 내보내기 잔여물). 지우고 다시 내보내 주세요');
  }

  for (const p of idx.data.projects || []) {
    const where = `projects/${p.id}`;
    if (p.thumbnail && !fs.existsSync(path.join(dataDir, p.thumbnail))) { // 데이터 폴더 기준 경로
      report.error('DEPLOY_FILE', `${where} 대표 카드`, `파일이 없어요: ${p.thumbnail}`);
    }
    for (const name of ['project', 'timeline']) {
      const file = path.join(dataDir, 'projects', p.id, `${name}.json`);
      if (!fs.existsSync(file)) {
        report.error('DEPLOY_FILE', `${where}/${name}.json`, '파일이 없어요');
        continue;
      }
      const j = readJsonSafe(file);
      if (j.error) {
        report.error('SCHEMA_ERROR', `${where}/${name}.json`, `JSON을 읽을 수 없어요: ${j.error}`);
        continue;
      }
      for (const e of checkWebData(name, j.data)) report.error('SCHEMA_ERROR', `${where}/${name}.json`, e);
      if (name !== 'project') continue;
      for (const c of j.data.cards || []) {
        if (c.png && !fs.existsSync(path.join(dataDir, 'projects', p.id, c.png))) {
          report.error('DEPLOY_FILE', `${where} ${c.no}번 카드`, `PNG가 없어요: ${c.png}`);
        }
      }
      // ── 2) 이미지 사용 권한: 카드 PNG에 제품 사진이 들어가므로 '가능'만 공개
      const used = new Set((j.data.cards || []).map((c) => c.image).filter(Boolean));
      for (const img of j.data.images || []) {
        if (!used.has(img.file)) continue;
        if (img.usage !== '가능') {
          report.error('IMAGE_RIGHTS', `${where} ${img.file}`, `사용 가능 여부가 "${img.usage || '미기재'}"예요 (출처: ${img.source || '미기재'}). '가능'으로 확인된 이미지만 공개해요. config/export.json에서 빼거나 이미지를 바꿔 주세요`);
        }
      }
    }
  }

  // ── 3) 빌드 결과
  if (distDir && fs.existsSync(distDir)) {
    summary.dist_checked = true;
    const dist = listFiles(distDir);
    summary.dist_files = dist.length;
    for (const f of dist.filter((x) => DIST_FORBIDDEN_RE.test(x))) {
      report.error('DEPLOY_FILE', `dist/${f}`, '빌드 결과에 있으면 안 되는 파일이에요');
    }
    for (const f of dist.filter((x) => x.endsWith('.map'))) {
      report.warn(`dist/${f}`, '소스 맵이 있어요. 원본 코드가 그대로 공개돼요 (문제는 아니지만 필요 없으면 빼요)');
    }
    scanSecrets(report, distDir, dist, 'dist');
  } else if (distDir) {
    report.warn('dist', `빌드 결과가 없어 건너뛰었어요: ${path.relative(paths.root, distDir) || distDir} (npm run web:build 후 다시)`);
  }
  return Object.assign(report, { summary });
}

function parseArgs(argv) {
  const o = { data: path.join(paths.root, 'web', 'public', 'data'), dist: path.join(paths.root, 'web', 'dist'), json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--data') o.data = path.resolve(argv[(i += 1)] || '');
    else if (a === '--dist') o.dist = path.resolve(argv[(i += 1)] || '');
    else if (a === '--no-dist') o.dist = null;
    else if (a === '--json') o.json = true;
    else throw new Error(`모르는 옵션이에요: ${a}`);
  }
  return o;
}

function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`${e.message}\n사용법: npm run check:web -- [--data <폴더>] [--dist <폴더>] [--no-dist] [--json]`);
    process.exit(2);
  }
  const r = checkWebDeploy({ dataDir: o.data, distDir: o.dist });
  if (o.json) {
    console.log(JSON.stringify({ errors: r.errors, warnings: r.warnings, summary: r.summary }, null, 2));
  } else {
    const s = r.summary;
    console.log(`웹 데이터 ${s.data_files}개 파일 · ${(s.data_bytes / 1024 / 1024).toFixed(1)}MB · 프로젝트 ${s.projects}개${s.dist_checked ? ` · 빌드 결과 ${s.dist_files}개 파일` : ''}`);
    printReport('배포 전 점검', r);
    if (!r.errors.length) console.log('배포해도 돼요.');
  }
  process.exit(r.errors.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { checkWebDeploy, parseArgs, SECRET_PATTERNS, DATA_FILE_RE };
