// 로컬 제작 API 테스트: 실제 HTTP 서버 + 작업 실행기 + 가짜 claude로 웹 제작 흐름 전체를 확인
// 입력 → 구성안 → 구성안 수정 요청 → 승인(→ 문구·출력) → 카드 수정 요청 → 최종 승인 → 내보내기
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { ROOT } = require('./helpers');
const { createStudio } = require('../scripts/lib/studio-api');

const SRC = 'toneup-sunscreen-r1';
const FAKE = path.join(__dirname, 'fixtures', 'fake-claude.js');
const PNG_DIR = path.join(ROOT, 'docs/examples/web-data/projects', SRC, 'png');

async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-studio-'));
  const productsDir = path.join(dir, 'products');
  fs.mkdirSync(productsDir);
  const exportConfigFile = path.join(dir, 'export.json');
  fs.writeFileSync(exportConfigFile, JSON.stringify({ out_dir: path.join(dir, 'web'), projects: [] }));
  const exported = [];
  process.env.FAKE_CLAUDE_SOURCE = path.join(ROOT, 'products', SRC, 'cards.json');
  process.env.FAKE_CLAUDE_PNG_DIR = PNG_DIR;
  const studio = createStudio({
    productsDir,
    bin: FAKE,
    reportsDir: path.join(dir, 'reports'),
    exportConfigFile,
    webIndexFile: path.join(dir, 'web', 'index.json'),
    exportFn: (id) => {
      exported.push(id);
      return { ok: true, output: [], excluded: [] };
    },
  });
  const server = http.createServer(async (req, res) => {
    if (!(await studio.handle(req, res))) {
      res.statusCode = 404;
      res.end('not studio');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/studio`;
  const call = async (method, p, body, headers = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: { 'content-type': 'application/json', ...(method === 'GET' ? {} : { 'x-studio': '1' }), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
  };
  const waitJob = async () => {
    for (let i = 0; i < 200; i++) {
      const r = await call('GET', '/job');
      if (r.body.job && r.body.job.status === 'done') return r.body.job;
      await new Promise((ok) => setTimeout(ok, 50));
    }
    throw new Error('작업이 끝나지 않았어요');
  };
  // Host 헤더를 직접 정해 보내기 (fetch는 Host를 바꿀 수 없음)
  const rawStatus = (host) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api/studio/status', headers: { host } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  const close = () => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { call, waitJob, close, rawStatus, productsDir, exportConfigFile, exported };
}

// toneup 입력을 웹 폼 값으로
function formValues() {
  return {
    values: {
      제품명: '데일리 글로우 톤업 선크림',
      브랜드: '샘플랩 (구조 확인용 가상 브랜드)',
      카테고리: '선케어',
      '제품 설명': '피부 톤을 자연스럽게 밝혀 주는 톤업 선크림이에요. 가벼운 로션 제형이라 끈적임 없이 펴 발리고, 메이크업 전 단계에 사용하기 좋아요.',
      '주요 특징': ['SPF50+ PA++++ 자외선 차단', '핑크 베이지 컬러로 피부 톤을 자연스럽게 보정', '가벼운 로션 제형으로 백탁 없이 밀착', '피부 결 정돈에 도움을 주는 판테놀 함유'],
      '사용 방법': '스킨케어 마지막 단계에서 적당량을 덜어 얼굴 전체에 결을 따라 펴 바릅니다. 외출 30분 전에 바르고, 땀을 흘린 뒤에는 덧발라 줍니다.',
      주의사항: '화장품 사용 시 또는 사용 후 직사광선에 의하여 사용 부위가 붉은 반점, 부어오름 또는 가려움증 등의 이상 증상이나 부작용이 있는 경우 전문의 등과 상담할 것',
      '콘텐츠 목적': '신제품 소개',
      '강조 정보': 'SPF50+ PA++++, 메이크업 전 사용',
      '카드 수': '5',
    },
    images: [{
      file: 'main.png', desc: '제품 단독 컷 (가상 일러스트)', source: '직접 제작', usage: '가능',
      data: fs.readFileSync(path.join(ROOT, 'products', SRC, 'images', 'main.png')).toString('base64'),
    }],
  };
}

test('웹 제작 흐름: 입력 → 구성안 → 수정 요청 → 승인·문구 → 카드 수정 → 최종 승인 → 내보내기', async () => {
  const s = await startServer();
  try {
    const status = await s.call('GET', '/status');
    assert.equal(status.status, 200);
    assert.equal(status.body.claude.installed, true);
    assert.ok(status.body.form.groups.length === 2 && status.body.revision_types.some((t) => t.code === 'LEN'));

    // 새 제작
    let r = await s.call('POST', '/products', { id: 'toneup-web', ...formValues() });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.check.errors, []);
    assert.equal(r.body.stage, 'input');
    assert.equal(r.body.actions.can_plan, true);
    assert.equal(r.body.input.values['제품명'], '데일리 글로우 톤업 선크림');
    assert.ok(fs.existsSync(path.join(s.productsDir, 'toneup-web', 'images', 'main.png')));

    // 구성안
    r = await s.call('POST', '/products/toneup-web/jobs', { kind: 'plan' });
    assert.equal(r.status, 202);
    assert.equal((await s.call('POST', '/products/toneup-web/jobs', { kind: 'plan' })).status, 409, '작업은 한 번에 하나');
    let job = await s.waitJob();
    assert.equal(job.ok, true, JSON.stringify(job));
    r = await s.call('GET', '/products/toneup-web');
    assert.equal(r.body.stage, 'plan');
    assert.equal(r.body.actions.can_approve_plan, true);
    assert.equal(r.body.actions.can_copy, false);
    assert.equal(r.body.actions.can_edit_input, false);

    // 구성안 수정 요청 → 수정 작업
    assert.equal((await s.call('POST', '/products/toneup-web/revisions', { stage: 'plan', types: [], memo: 'x' })).status, 400, '유형 필수');
    r = await s.call('POST', '/products/toneup-web/revisions', { stage: 'plan', types: ['ORDER'], memo: '1번 카드 담을 내용을 더 분명하게' });
    assert.equal(r.status, 202);
    job = await s.waitJob();
    assert.equal(job.ok, true, JSON.stringify(job));
    assert.equal(job.kind, 'revise');

    // 승인 → 문구·출력 자동 시작
    r = await s.call('POST', '/products/toneup-web/approve', { stage: 'plan' });
    assert.equal(r.status, 200);
    job = await s.waitJob();
    assert.equal(job.kind, 'copy');
    assert.equal(job.ok, true, JSON.stringify(job));
    r = await s.call('GET', '/products/toneup-web');
    assert.equal(r.body.stage, 'copy');
    assert.equal(r.body.pngs.length, 5);
    assert.equal(r.body.actions.can_approve_final, true);
    const png = await s.call('GET', '/products/toneup-web/files/png/card-01.png');
    assert.equal(png.status, 200);
    assert.ok(png.body.byteLength > 1000);

    // 카드 수정 요청 (3번 카드)
    r = await s.call('POST', '/products/toneup-web/revisions', { stage: 'final', cards: [3, 99], types: ['LEN'], memo: '3번 제목 짧게' });
    assert.equal(r.status, 202);
    job = await s.waitJob();
    assert.equal(job.ok, true, JSON.stringify(job));
    assert.deepEqual(job.revision.cards, [3], '없는 카드 번호는 빠짐');

    // 최종 승인 → 내보내기
    assert.equal((await s.call('POST', '/products/toneup-web/export')).status, 409, '승인 전에는 내보낼 수 없음');
    r = await s.call('POST', '/products/toneup-web/approve', { stage: 'final' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.stage, 'approved');
    assert.equal(r.body.actions.can_export, true);
    r = await s.call('POST', '/products/toneup-web/export');
    assert.equal(r.status, 200);
    assert.deepEqual(s.exported, ['toneup-web']);
    assert.ok(JSON.parse(fs.readFileSync(s.exportConfigFile, 'utf8')).projects.some((p) => p.id === 'toneup-web' && p.kind === 'production'));

    // 기록: 사람 승인으로 남음
    const events = r.body.product.events;
    const names = events.map((e) => e.event);
    for (const e of ['input_submitted', 'job_started', 'job_finished', 'validate_result', 'revision_requested', 'plan_approved', 'final_approved']) assert.ok(names.includes(e), e);
    assert.ok(events.filter((e) => e.event.endsWith('_approved')).every((e) => e.approved_by === 'human'));
    assert.equal(r.body.product.timeline.complete, true);

    // 목록
    const list = await s.call('GET', '/products');
    assert.deepEqual(list.body.products.map((p) => [p.id, p.stage]), [['toneup-web', 'approved']]);
  } finally {
    s.close();
  }
});

test('입력 확인 오류가 있으면 구성안 작업을 시작하지 않고, 입력을 고치면 시작할 수 있다', async () => {
  const s = await startServer();
  try {
    const body = formValues();
    delete body.values['사용 방법'];
    let r = await s.call('POST', '/products', { id: 'missing-usage', ...body });
    assert.equal(r.status, 201);
    assert.ok(r.body.check.errors.some((e) => e.code === 'INPUT_MISSING' && e.where === '## 사용 방법'));
    assert.equal(r.body.actions.can_plan, false);
    assert.equal((await s.call('POST', '/products/missing-usage/jobs', { kind: 'plan' })).status, 409);

    const fixed = formValues();
    delete fixed.images[0].data; // 이미 올린 이미지는 다시 보내지 않아도 됨
    r = await s.call('PUT', '/products/missing-usage/input', fixed);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.check.errors, []);
    assert.equal(r.body.actions.can_plan, true);
  } finally {
    s.close();
  }
});

test('보안: 다른 호스트·헤더 없는 쓰기·잘못된 ID·파일명·이미지는 거부한다', async () => {
  const s = await startServer();
  try {
    assert.equal(await s.rawStatus('evil.example.com'), 403, '다른 호스트 이름(DNS 리바인딩)');
    assert.equal(await s.rawStatus('localhost:5173'), 200);
    assert.equal((await s.call('POST', '/products', { id: 'x' }, { 'x-studio': '' })).status, 403, 'X-Studio 헤더 필요');
    assert.equal((await s.call('POST', '/products', { id: 'ok-id', ...formValues() }, { origin: 'https://evil.example.com' })).status, 403, '다른 사이트');
    assert.equal((await s.call('POST', '/products', { id: '../etc', ...formValues() })).status, 400);
    assert.equal((await s.call('POST', '/products', { id: 'Upper', ...formValues() })).status, 400);
    const badName = formValues();
    badName.images[0].file = '../../evil.png';
    assert.equal((await s.call('POST', '/products', { id: 'bad-name', ...badName })).status, 400);
    assert.ok(!fs.existsSync(path.join(s.productsDir, 'bad-name')), '실패하면 폴더를 남기지 않음');
    const notImage = formValues();
    notImage.images[0].data = Buffer.from('<script>alert(1)</script>').toString('base64');
    assert.equal((await s.call('POST', '/products', { id: 'not-image', ...notImage })).status, 400);
    assert.equal((await s.call('GET', '/products/nope')).status, 404);
    assert.equal((await s.call('GET', '/products/../../etc/passwd')).status, 404);
  } finally {
    s.close();
  }
});
