// 배포 전 점검(npm run check:web): 웹 데이터·빌드 결과에 비밀 값·불필요한 파일·사용 확인 안 된 이미지가 없는지
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT } = require('./helpers');
const { checkWebDeploy, parseArgs } = require('../scripts/check-web');

const SAMPLE = path.join(ROOT, 'docs', 'examples', 'web-data');
const ID = 'toneup-sunscreen-r1';
// 실제 키처럼 보이는 문자열은 저장소에 그대로 두지 않고 실행할 때 만듦
const fakeKey = () => ['sk', 'ant', 'api03', 'x'.repeat(24)].join('-');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-checkweb-'));
  const data = path.join(dir, 'data');
  fs.cpSync(SAMPLE, data, { recursive: true });
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
  fs.writeFileSync(path.join(dist, 'assets', 'index.js'), 'console.log("ok")');
  const editJson = (rel, fn) => {
    const file = path.join(data, rel);
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    fn(j);
    fs.writeFileSync(file, JSON.stringify(j, null, 2));
  };
  return { dir, data, dist, editJson, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const codes = (r) => r.errors.map((e) => e.code).sort();

test('인자', () => {
  const o = parseArgs(['--data', 'a', '--no-dist', '--json']);
  assert.equal(o.data, path.resolve('a'));
  assert.equal(o.dist, null);
  assert.equal(o.json, true);
  assert.throws(() => parseArgs(['--what']), /모르는 옵션/);
});

test('예시 웹 데이터와 깨끗한 빌드 결과는 통과', () => {
  const s = setup();
  try {
    const r = checkWebDeploy({ dataDir: s.data, distDir: s.dist });
    assert.deepEqual(r.errors, []);
    assert.equal(r.summary.projects, 1);
    assert.equal(r.summary.dist_checked, true);
  } finally {
    s.cleanup();
  }
});

test('규격에 없는 파일·목록에 없는 프로젝트 폴더·빠진 PNG는 DEPLOY_FILE', () => {
  const s = setup();
  try {
    fs.writeFileSync(path.join(s.data, 'projects', ID, 'input.md'), '# 원문');
    fs.mkdirSync(path.join(s.data, 'projects', 'old-project'));
    fs.writeFileSync(path.join(s.data, 'projects', 'old-project', 'project.json'), '{}');
    fs.rmSync(path.join(s.data, 'projects', ID, 'png', 'card-03.png'));
    const r = checkWebDeploy({ dataDir: s.data, distDir: null });
    const where = r.errors.filter((e) => e.code === 'DEPLOY_FILE').map((e) => e.where);
    assert.ok(where.includes(`projects/${ID}/input.md`), JSON.stringify(where));
    assert.ok(where.includes('projects/old-project'), JSON.stringify(where));
    assert.ok(where.some((w) => w.includes('3번 카드')), JSON.stringify(where));
  } finally {
    s.cleanup();
  }
});

test('사용 가능 여부가 "가능"이 아닌 이미지를 쓴 카드는 IMAGE_RIGHTS', () => {
  const s = setup();
  try {
    s.editJson(`projects/${ID}/project.json`, (j) => { j.images[0].usage = '확인 중'; });
    const r = checkWebDeploy({ dataDir: s.data, distDir: null });
    assert.deepEqual(codes(r), ['IMAGE_RIGHTS']);
    assert.match(r.errors[0].message, /확인 중/);
  } finally {
    s.cleanup();
  }
});

test('비밀 값 형태가 있으면 SECRET, 값 자체는 출력하지 않음', () => {
  const s = setup();
  try {
    const key = fakeKey();
    s.editJson(`projects/${ID}/project.json`, (j) => { j.label = `${j.label} ${key}`; });
    fs.writeFileSync(path.join(s.dist, 'assets', 'index.js'), `const k = "${key}";`);
    const r = checkWebDeploy({ dataDir: s.data, distDir: s.dist });
    const secret = r.errors.filter((e) => e.code === 'SECRET');
    assert.deepEqual(secret.map((e) => e.where).sort(), ['data/projects/toneup-sunscreen-r1/project.json', 'dist/assets/index.js']);
    assert.ok(!JSON.stringify(r.errors).includes(key), '오류 메시지에 키 값이 나오면 안 돼요');
  } finally {
    s.cleanup();
  }
});

test('빌드 결과에 .env·원본 파일이 있으면 오류, 소스 맵은 경고', () => {
  const s = setup();
  try {
    fs.writeFileSync(path.join(s.dist, '.env'), 'X=1');
    fs.writeFileSync(path.join(s.dist, 'assets', 'index.js.map'), '{}');
    fs.mkdirSync(path.join(s.dist, 'data', 'projects', ID), { recursive: true });
    fs.writeFileSync(path.join(s.dist, 'data', 'projects', ID, 'log.jsonl'), '');
    const r = checkWebDeploy({ dataDir: s.data, distDir: s.dist });
    assert.deepEqual(r.errors.map((e) => e.where).sort(), ['dist/.env', `dist/data/projects/${ID}/log.jsonl`]);
    assert.ok(r.warnings.some((w) => w.where === 'dist/assets/index.js.map'));
  } finally {
    s.cleanup();
  }
});

test('웹 데이터가 없으면 오류, 빌드 결과가 없으면 경고만', () => {
  const s = setup();
  try {
    const none = checkWebDeploy({ dataDir: path.join(s.dir, 'nothing'), distDir: null });
    assert.deepEqual(codes(none), ['DEPLOY_FILE']);
    const noDist = checkWebDeploy({ dataDir: s.data, distDir: path.join(s.dir, 'no-dist') });
    assert.deepEqual(noDist.errors, []);
    assert.ok(noDist.warnings.some((w) => w.where === 'dist'));
    // CLI 종료 코드
    const ok = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-web.js'), '--data', s.data, '--no-dist'], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /배포해도 돼요/);
    const bad = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-web.js'), '--data', path.join(s.dir, 'nothing'), '--no-dist'], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
  } finally {
    s.cleanup();
  }
});
