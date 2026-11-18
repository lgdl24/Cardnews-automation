const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fork, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { setup, approvedWorkspace, fakeIg, T0 } = require('./ig-publisher-helpers');
const { createCliPublisher, publishWithManager } = require('../scripts/lib/ig-cli-publisher');
const { ROOT } = require('./helpers');

function peer(ws, ig = fakeIg(), more = {}) {
  return createCliPublisher({ productsDir: ws.dir, root: ROOT, ig,
    toJpegs: async (_dir, files) => files.map((f) => f.replace('.png', '.jpg')),
    openPublicUrls: async (files) => ({ urls: files.map((f) => `https://example.invalid/${path.basename(f)}`), close() {}, mode: 'test' }),
    sleep: async () => {}, ...more });
}
function worker(t, ws, mode) {
  const child = fork(path.join(__dirname, 'fixtures/ig-publisher-worker.cjs'), [ws.dir, ws.id, mode], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  child.stderr.resume();
  const messages = [];
  child.on('message', (m) => messages.push(m));
  const closed = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await closed; });
  return { child, closed, async wait(event) {
    for (let i = 0; i < 200; i++) {
      const message = messages.find((m) => m.event === event || m.event === 'error');
      if (message) return message;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('시험 프로세스 응답이 없어요');
  } };
}

test('CLI→웹, 웹→CLI 모두 같은 기록을 보고 같은 버전을 다시 게시하지 않아요', async (t) => {
  for (const first of ['cli', 'web']) {
    const { ws, pub: web } = setup(); t.after(ws.cleanup);
    const cli = peer(ws);
    const st = cli.status(ws.id);
    if (first === 'cli') await publishWithManager(ws.id, { publisher: cli, version: st.version, confirm: true, log() {} });
    else await web.start(ws.id, { version: st.version }).done;
    const other = first === 'cli' ? web : cli;
    const result = other.status(ws.id);
    assert.equal(result.current.state, 'published');
    assert.equal(result.published.length, 1);
    assert.equal(result.current.trigger, first === 'cli' ? 'cli' : 'manual');
    assert.throws(() => other.start(ws.id, { version: result.version }), /이미 게시/);
  }
});

test('별도 CLI 프로세스가 실행 중이면 웹·다른 CLI의 시작과 복구가 기록을 덮어쓰지 않아요', async (t) => {
  const ws = approvedWorkspace();
  const child = worker(t, ws, 'hold');
  t.after(() => ws.cleanup());
  assert.equal((await child.wait('publishing')).event, 'publishing');
  const web = peer(ws);
  web.recover([ws.id]);
  const st = web.status(ws.id);
  assert.equal(st.current.state, 'publishing');
  assert.throws(() => web.start(ws.id, { version: st.version }), /다른 터미널/);
  const contender = worker(t, ws, 'complete');
  assert.equal((await contender.wait('error')).code, 'IG_PUBLISH_BUSY');
  child.child.kill('SIGKILL'); await child.closed;
  assert.equal(web.status(ws.id).current.state, 'unknown', '종료된 소유자만 복구해요');
  assert.throws(() => web.start(ws.id, { version: st.version }), /실제로 됐는지/);
  const calls = fs.readFileSync(path.join(ws.dir, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(calls.filter((c) => c.path.endsWith('media_publish')).length, 1);
});

test('다른 프로세스가 완료한 CLI 게시를 웹에서 보며 제작 로그도 한 번만 남겨요', async (t) => {
  const ws = approvedWorkspace(); const child = worker(t, ws, 'complete');
  t.after(ws.cleanup);
  assert.equal((await child.wait('done')).event, 'done'); await child.closed;
  const web = peer(ws);
  web.recover([ws.id]); web.recover([ws.id]);
  assert.equal(web.status(ws.id).current.trigger, 'cli');
  assert.equal(web.summary(ws.id).published, true);
  const events = fs.readFileSync(ws.file('log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.filter((e) => e.event === 'published').length, 1);
});

test('dry-run은 API·게시 기록·예약 실행 없이 확인할 버전을 보여줘요', async (t) => {
  const { ws } = setup(); t.after(ws.cleanup);
  const before = fs.readFileSync(ws.file('output/instagram/ig-publish.json'), 'utf8');
  const pub = peer(ws, { me() { assert.fail('인스타를 호출하면 안 돼요'); } });
  const result = await publishWithManager(ws.id, { publisher: pub, dryRun: true, log() {} });
  assert.ok(result.version);
  assert.equal(result.dryRun, true);
  assert.equal(fs.readFileSync(ws.file('output/instagram/ig-publish.json'), 'utf8'), before);
  await assert.rejects(publishWithManager(ws.id, { publisher: pub, version: 'old', confirm: true, log() {} }), /바뀌었어요/);
});

test('실제 CLI 인자 처리의 dry-run도 네트워크 없이 끝나고 공통 기록을 보존해요', (t) => {
  const { ws } = setup(); t.after(ws.cleanup);
  const file = ws.file('output/instagram/ig-publish.json');
  const before = fs.readFileSync(file, 'utf8');
  const script = `global.fetch=()=>{throw new Error('실제 API를 호출하면 안 돼요')}; require('./scripts/instagram').main(['publish',${JSON.stringify(ws.id)},'--dry-run']).catch(e=>{console.error(e.message);process.exitCode=1});`;
  const stdout = execFileSync(process.execPath, ['-e', script], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CARDNEWS_PRODUCTS_DIR: ws.dir, IG_ACCESS_TOKEN: 'unit-test-only', IG_USER_ID: '17841', IG_API_SETUP: 'unified' } });
  assert.match(stdout, /인스타에 게시하지 않아요.*버전/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('같은 AI 첫 줄의 다른 글을 고르지 않고 목록 지연이면 확인 필요를 유지해요', async (t) => {
  const ig = fakeIg({ failAt: 'publish' }); const { ws, pub } = setup({ ig }); t.after(ws.cleanup);
  const st = pub.status(ws.id);
  await pub.start(ws.id, { version: st.version }).done;
  const orig = ig.call;
  ig.call = async (m, p, params) => p === '17841/media' && m === 'GET'
    ? { data: [{ id: 'wrong', caption: 'AI 활용\n다른 게시물이에요', timestamp: new Date(T0 + 1000).toISOString() }] }
    : orig(m, p, params);
  assert.equal((await pub.verify(ws.id)).current.state, 'unknown');
  assert.throws(() => pub.start(ws.id, { version: st.version }), /실제로 됐는지/);
  ig.call = async (m, p, params) => p === '17841/media' && m === 'GET'
    ? { data: [{ id: 'correct', caption: st.caption, timestamp: new Date(T0 + 1000).toISOString(), permalink: 'https://example.invalid/correct' }] }
    : orig(m, p, params);
  assert.equal((await pub.verify(ws.id)).current.media_id, 'correct');
});

test('링크 확인 도중 종료됐어도 media_id가 있으면 게시 완료로 복구해요', (t) => {
  const { ws, pub, events } = setup(); t.after(ws.cleanup);
  const file = pub.stateFile(ws.id);
  const s = JSON.parse(fs.readFileSync(file));
  s.current = { state: 'confirming', media_id: 'known', version: pub.status(ws.id).version, account: 'test', trigger: 'cli', progress: { total: 5 } };
  fs.writeFileSync(file, JSON.stringify(s));
  pub.recover([ws.id]); pub.recover([ws.id]);
  assert.equal(pub.status(ws.id).current.state, 'published');
  assert.equal(events.length, 1);
});

test('손상된 게시 기록은 빈 기록으로 덮어쓰거나 다시 게시하지 않아요', (t) => {
  const { ws, pub } = setup(); t.after(ws.cleanup);
  fs.writeFileSync(pub.stateFile(ws.id), '{broken');
  assert.throws(() => pub.status(ws.id), /게시 기록을 읽지 못했어요/);
});

test('두 실행기의 예약 확인이 겹쳐도 한 번만 시작하고 수동 게시도 같은 예약을 봐요', async (t) => {
  const { ws, pub, now, ig } = setup(); t.after(ws.cleanup);
  const cli = peer(ws, ig, { now: () => now.t });
  const st = pub.status(ws.id);
  pub.schedule(ws.id, { version: st.version, at: new Date(now.t + 120000).toISOString() });
  await assert.rejects(publishWithManager(ws.id, { publisher: cli, version: st.version, confirm: true, log() {} }), /예약/);
  now.t += 120000;
  await Promise.all([pub.tick([ws.id]), cli.tick([ws.id])]);
  assert.equal(cli.status(ws.id).schedule.state, 'done');
  assert.equal(ig.calls.filter((c) => c.path.endsWith('media_publish')).length, 1);
});

test('로그를 쓴 직후 실패했어도 완료 기록을 보존하고 같은 이벤트를 다시 쓰지 않아요', async (t) => {
  let productDir;
  let calls = 0;
  const { ws, pub } = setup({ appendEvent: (_id, event, fields) => {
    calls++;
    fs.appendFileSync(path.join(productDir, 'log.jsonl'), JSON.stringify({ event, ...fields }) + '\n');
    throw new Error('시험용 기록 후 중단이에요');
  } });
  productDir = ws.file(); t.after(ws.cleanup);
  const st = pub.status(ws.id);
  assert.equal((await pub.start(ws.id, { version: st.version }).done).state, 'published');
  pub.recover([ws.id]); pub.recover([ws.id]);
  assert.equal(pub.status(ws.id).current.state, 'published');
  assert.equal(calls, 1);
});

test('CLI도 이전 published.json을 인식해 같은 카드의 게시를 막아요', async (t) => {
  const { ws } = setup(); t.after(ws.cleanup);
  fs.writeFileSync(ws.file('output/instagram/published.json'), JSON.stringify({ media_id: 'legacy', permalink: 'https://example.invalid/old', account: 'test', published_at: new Date(Date.now() + 60000).toISOString() }));
  const cli = peer(ws);
  const st = cli.status(ws.id);
  assert.ok(st.published.some((p) => p.media_id === 'legacy'));
  await assert.rejects(publishWithManager(ws.id, { publisher: cli, version: st.version, confirm: true, log() {} }), /이미 터미널/);
});

test('권한·한도를 확인하지 못하면 공개 주소나 업로드를 시작하지 않아요', async (t) => {
  for (const kind of ['permissions', 'publishingLimit']) {
    const ig = fakeIg(); ig[kind] = async () => { throw new Error('시험용 연결 실패예요'); };
    const { ws, pub, opened } = setup({ ig }); t.after(ws.cleanup);
    const st = pub.status(ws.id);
    assert.equal((await pub.start(ws.id, { version: st.version }).done).state, 'failed');
    assert.equal(opened.count, 0);
    assert.equal(ig.calls.length, 0);
  }
});

test('게시 응답에 ID가 없으면 완료로 단정하지 않고 확인 필요로 남겨요', async (t) => {
  const ig = fakeIg(); const original = ig.call;
  ig.call = (m, p, params) => p.endsWith('media_publish') ? Promise.resolve({}) : original(m, p, params);
  const { ws, pub } = setup({ ig }); t.after(ws.cleanup);
  const st = pub.status(ws.id);
  assert.equal((await pub.start(ws.id, { version: st.version }).done).state, 'unknown');
  assert.equal(pub.status(ws.id).published.length, 0);
});
