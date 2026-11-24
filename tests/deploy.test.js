// KT 자동 배포 (#120): 바쁨 확인(busy-check.py), 작업실 상태의 배포 정보, 배포 스크립트·CI 설정이 서로 맞는지
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const { ROOT } = require('./helpers');
const { createStudio } = require('../scripts/lib/studio-api');

const BUSY = path.join(ROOT, 'ops', 'kt', 'deploy', 'busy-check.py');
const DEPLOY = path.join(ROOT, 'ops', 'kt', 'deploy', 'cardnews-deploy.sh');
const NOW = '2026-11-24T06:00:00Z';

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-deploy-'));
  const products = path.join(dir, 'products');
  fs.mkdirSync(products);
  const write = (rel, data) => {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data));
    return f;
  };
  const check = (extra = []) => {
    const r = spawnSync('python3', [BUSY, '--products', products, '--now', NOW, ...extra], { encoding: 'utf8' });
    return { busy: r.status === 1, ok: r.status === 0, lines: r.stdout.trim().split('\n').filter(Boolean), stderr: r.stderr };
  };
  return { dir, products, write, check };
}
const igState = (id, s) => path.join('products', id, 'output', 'instagram', 'ig-publish.json');

test('바쁨 확인: 아무 일도 없으면 배포해도 돼요', () => {
  const w = workspace();
  w.write(igState('a'), { current: { state: 'published' }, published: [], history: [], schedule: { state: 'done', at: '2026-11-24T06:10:00Z' } });
  const idle = w.write('studio.json', { job: { status: 'done', product_id: 'a' }, jobs: { running: null, queue: [] } });
  const r = w.check(['--studio-status', idle]);
  assert.ok(r.ok, r.lines.join(' / ') + r.stderr);
  assert.deepEqual(r.lines, []);
});

test('바쁨 확인: 제작 작업 진행·대기, 터미널 작업이 있으면 미뤄요', () => {
  const w = workspace();
  const running = w.write('running.json', { job: { status: 'running', product_id: 'a' }, jobs: { queue: [] } });
  assert.ok(w.check(['--studio-status', running]).busy);
  const queued = w.write('queued.json', { job: null, jobs: { queue: [{ product_id: 'b' }] } });
  assert.match(w.check(['--studio-status', queued]).lines.join(), /대기 중인 제작 작업 1개/);
  w.write(path.join('products', 'c', '.job.json'), { kind: 'plan' });
  assert.match(w.check().lines.join(), /c: 터미널 제작 작업/);
  const broken = w.write('broken.json', '{');
  assert.ok(w.check(['--studio-status', broken]).busy, '상태를 못 읽으면 안전하게 미룸');
});

test('바쁨 확인: 인스타 게시 진행·예약 실행 중·30분 안 예약이면 미루고, 먼 예약은 괜찮아요', () => {
  const w = workspace();
  w.write(igState('up'), { current: { state: 'uploading' } });
  assert.match(w.check().lines.join(), /up: 인스타 게시 진행 중 \(uploading\)/);
  const w2 = workspace();
  w2.write(igState('soon'), { current: null, schedule: { state: 'scheduled', at: '2026-11-24T06:20:00Z' } });
  assert.match(w2.check().lines.join(), /soon: 30분 안에 예약 게시/);
  assert.ok(w2.check(['--guard-minutes', '10']).ok, '기준을 줄이면 20분 뒤 예약은 괜찮음');
  const w3 = workspace();
  w3.write(igState('late'), { current: null, schedule: { state: 'scheduled', at: '2026-11-24T09:00:00Z' } });
  w3.write(igState('missed'), { current: null, schedule: { state: 'missed', at: '2026-11-24T05:00:00Z' } });
  assert.ok(w3.check().ok, '3시간 뒤 예약·놓친 예약은 배포를 막지 않음');
  const w4 = workspace();
  w4.write(igState('run'), { current: null, schedule: { state: 'running', at: '2026-11-24T05:59:00Z' } });
  assert.match(w4.check().lines.join(), /run: 예약 게시 실행 중/);
});

test('바쁨 확인의 게시 진행 단계는 게시 관리자(ig-publisher.js)와 같아요', () => {
  const js = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'ig-publisher.js'), 'utf8');
  const steps = [...js.slice(js.indexOf('const STEPS = ['), js.indexOf('];', js.indexOf('const STEPS = ['))).matchAll(/\['([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(steps.length >= 5);
  const py = fs.readFileSync(BUSY, 'utf8');
  const active = new Set([...py.match(/ACTIVE = \{([^}]*)\}/)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...active].sort(), ['requested', ...steps].sort());
});

test('배포 스크립트·CI: 문법이 맞고, 검사 이름이 같고, CI는 읽기 권한만 써요', () => {
  const r = spawnSync('bash', ['-n', DEPLOY], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const sh = fs.readFileSync(DEPLOY, 'utf8');
  const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const checkName = sh.match(/^CHECK_NAME=(\S+)/m)[1];
  assert.match(ci, new RegExp(`^\\s+name: ${checkName}$`, 'm'), 'CI 작업 이름 = 배포 스크립트가 확인하는 검사 이름');
  assert.match(ci, /^permissions:\n\s+contents: read$/m);
  assert.doesNotMatch(ci, /secrets\./, 'CI는 비밀값을 쓰지 않음');
  assert.match(sh, /runuser -u "\$BUILD_USER"/, '빌드는 권한 없는 계정으로');
  assert.match(sh, /failed-\$SHA/, '실패한 커밋은 다시 시도하지 않음');
});

test('작업실 상태: 배포 상태 파일이 있으면 짧은 커밋·결과만 보여주고, 없으면 null', async () => {
  const w = workspace();
  const statusFile = w.write('deploy/status.json', {
    deployed: { sha: 'a'.repeat(40), at: '2026-11-24T06:00:00+00:00' },
    last: { sha: 'b'.repeat(40), result: 'failed', message: '새 버전이 정상 응답하지 않아 이전 버전으로 되돌렸어요', at: '2026-11-24T06:05:00+00:00', log: '/etc/secret' },
  });
  const make = (deployStatusFile) => createStudio({
    productsDir: w.products, bin: path.join(__dirname, 'fixtures', 'fake-claude.js'), reportsDir: path.join(w.dir, 'reports'),
    exportConfigFile: w.write('export.json', { out_dir: path.join(w.dir, 'web'), projects: [] }), webIndexFile: path.join(w.dir, 'web', 'index.json'),
    aiAuto: false, igSchedule: false, deployStatusFile,
  });
  const get = async (studio) => {
    const server = http.createServer(async (req, res) => { if (!(await studio.handle(req, res))) { res.statusCode = 404; res.end(); } });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/studio/status`);
      return res.json();
    } finally { server.close(); studio.publisher.stopTimer(); }
  };
  const withFile = await get(make(statusFile));
  assert.deepEqual(withFile.deploy.deployed, { sha: 'aaaaaaa', at: '2026-11-24T06:00:00+00:00' });
  assert.equal(withFile.deploy.last.sha, 'bbbbbbb');
  assert.equal(withFile.deploy.last.result, 'failed');
  assert.ok(!JSON.stringify(withFile.deploy).includes('/etc/secret'), '정해진 칸만 보냄');
  const without = await get(make(null));
  assert.equal(without.deploy, null);
});
