// 작업실 인스타 게시 관리자(B5, #104) — 가짜 인스타 API·JPEG·공개 주소로 검사. 실제 게시·토큰·터널은 쓰지 않음
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPublisher } = require('../scripts/lib/ig-publisher');
const { precheckIn } = require('../scripts/lib/ig-publish-deps');
const { stampProduct } = require('../scripts/lib/ai-disclosure');
const { ROOT, makeWorkspace } = require('./helpers');
const { seedCaption } = require('./caption-helpers');

const PNG_DIR = path.join(ROOT, 'docs/examples/web-data/projects/toneup-sunscreen-r1/png');
const T0 = Date.parse('2026-11-18T00:00:00Z');

// 최종 승인된 제품 폴더 (출력 PNG·레이아웃 기록·AI 표시 메타데이터·승인 기록)
function approvedWorkspace() {
  const ws = makeWorkspace({ from: 'toneup-sunscreen-r1' });
  const data = ws.readCards();
  data.stage = 'approved';
  ws.writeCards(data);
  fs.mkdirSync(ws.file('output', 'png'), { recursive: true });
  for (const c of data.cards) {
    const name = `card-${String(c.no).padStart(2, '0')}.png`;
    fs.copyFileSync(path.join(PNG_DIR, name), ws.file('output', 'png', name));
  }
  fs.writeFileSync(ws.file('output', 'render-report.json'), JSON.stringify({ results: data.cards.map((c) => ({ no: c.no, issues: [] })) }));
  stampProduct(ws.file(), { cards: data.cards });
  fs.appendFileSync(ws.file('log.jsonl'), JSON.stringify({ ts: '2026-11-17T09:00:00.000Z', event: 'final_approved', approved_by: 'human' }) + '\n');
  seedCaption(ws);
  return ws;
}

// 가짜 인스타 API: 단계별로 실패를 넣을 수 있음
function fakeIg({ failAt = null, recent = [] } = {}) {
  const calls = [];
  let n = 0;
  const ig = {
    apiSetup: 'unified',
    calls,
    me: async () => ({ user_id: '17841', username: 'glowif_lab' }),
    permissions: async () => ({ data: ['instagram_basic', 'instagram_content_publish'].map((permission) => ({ permission, status: 'granted' })) }),
    publishingLimit: async () => ({ data: [{ quota_usage: 1, config: { quota_total: 100 } }] }),
    call: async (method, p, params = {}) => {
      calls.push({ method, path: p, params });
      if (method === 'POST' && p === '17841/media') {
        if (failAt === 'upload' && !params.media_type) throw Object.assign(new Error('업로드 실패'), { code: 9004 });
        return { id: params.media_type === 'CAROUSEL' ? 'car-1' : `item-${++n}` };
      }
      if (method === 'POST' && p === '17841/media_publish') {
        if (failAt === 'publish') throw new Error('socket hang up');
        return { id: 'media-1' };
      }
      if (method === 'GET' && p === 'media-1') {
        if (failAt === 'permalink') throw new Error('timeout');
        return { permalink: 'https://www.instagram.com/p/glowif1/' };
      }
      if (method === 'GET' && p === '17841/media') return { data: recent };
      if (method === 'GET') return { status_code: 'FINISHED' };
      throw new Error(`unexpected ${method} ${p}`);
    },
  };
  return ig;
}

function setup({ ig = fakeIg(), precheck = null, now = { t: T0 }, ...rest } = {}) {
  const ws = approvedWorkspace();
  const events = [];
  const opened = { count: 0, closed: 0 };
  const pub = createPublisher({
    productsDir: ws.dir,
    appendEvent: (id, event, fields) => events.push({ id, event, ...fields }),
    precheck: precheck || precheckIn(ROOT, ws.dir),
    client: () => ig,
    configured: () => true,
    toJpegs: async (outDir, files) => files.map((f) => {
      const out = path.join(outDir, path.basename(f).replace(/\.png$/, '.jpg'));
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(out, 'jpg');
      return out;
    }),
    openPublicUrls: async (jpgs) => {
      opened.count++;
      return { mode: 'tunnel', urls: jpgs.map((f) => `https://t.example/s/${path.basename(f)}`), close: () => { opened.closed++; } };
    },
    now: () => now.t,
    sleep: async () => {},
    ...rest,
  });
  // 기존 게시 상태 검사는 캡션을 사람이 확인한 뒤의 상황으로 시작해요.
  if (!precheck) {
    const st = pub.status(ws.id);
    pub.acknowledge(ws.id, { version: st.version, ids: ['caption_review'] });
  }
  return { ws, pub, events, ig, opened, now };
}
const readState = (ws) => JSON.parse(fs.readFileSync(ws.file('output', 'instagram', 'ig-publish.json'), 'utf8'));

test('캡션이 바뀌면 버전·점검·사람 확인을 다시 받고 원문이 바뀌면 재작성을 안내해요', async (t) => {
  const { ws, pub, ig } = setup(); t.after(ws.cleanup);
  const first = pub.status(ws.id);
  assert.equal(first.can_publish, true);
  const draft = JSON.parse(JSON.stringify(require('./caption-helpers').content));
  draft.paragraphs[0].text = '메이크업 전에 바를 선크림을 살펴볼까요?';
  seedCaption(ws, draft);
  const changed = pub.status(ws.id);
  assert.notEqual(changed.version, first.version);
  assert.match(changed.caption, /살펴볼까요/);
  assert.equal(changed.can_publish, false);
  assert.deepEqual(changed.acks, []);
  assert.throws(() => pub.start(ws.id, { version: first.version }), /바뀌었어요/);
  assert.throws(() => pub.start(ws.id, { version: changed.version }), /사람 확인/);
  ws.writeInput(ws.readInput() + '\n원문 수정');
  const stale = pub.status(ws.id);
  assert.equal(stale.can_publish, false);
  assert.match(stale.blockers.join(' '), /캡션을 다시 작성/);
  seedCaption(ws, draft);
  const regenerated = pub.status(ws.id);
  assert.equal(regenerated.caption, changed.caption);
  assert.notEqual(regenerated.version, changed.version, '같은 문장으로 다시 써도 원문 버전이 바뀌면 재확인해요');
  assert.deepEqual(regenerated.acks, []);
  assert.equal(ig.calls.length, 0);
});

test('지금 게시: 점검 통과한 승인본을 단계별로 게시하고, 기록은 한 번, 같은 버전은 다시 게시하지 않음', async (t) => {
  const { ws, pub, events, ig, opened } = setup();
  t.after(() => ws.cleanup());
  const st = pub.status(ws.id);
  assert.equal(st.approved, true);
  assert.ok(st.check && st.check.ready, JSON.stringify(st.blockers));
  assert.equal(st.can_publish, true, st.blockers.join(' / '));
  assert.match(st.caption.split('\n')[0], /AI/);
  const { done } = pub.start(ws.id, { version: st.version });
  assert.throws(() => pub.start(ws.id, { version: st.version }), /진행 중/, '동시 실행 막음');
  const cur = await done;
  assert.equal(cur.state, 'published');
  assert.equal(cur.permalink, 'https://www.instagram.com/p/glowif1/');
  assert.deepEqual(cur.steps.map((s) => s.key).filter((k, i, a) => a.indexOf(k) === i), ['preparing', 'opening_url', 'uploading', 'carousel', 'publishing', 'confirming']);
  assert.deepEqual(cur.progress, { done: 5, total: 5 });
  assert.equal(cur.account, 'glowif_lab');
  // 캐러셀 순서 1→5, 캡션은 캐러셀에만
  const items = ig.calls.filter((c) => c.method === 'POST' && c.path === '17841/media' && c.params.is_carousel_item);
  assert.deepEqual(items.map((c) => c.params.image_url.split('/').pop()), ['card-01.jpg', 'card-02.jpg', 'card-03.jpg', 'card-04.jpg', 'card-05.jpg']);
  assert.equal(opened.closed, opened.count, '공개 주소는 끝나면 닫음');
  assert.equal(events.filter((e) => e.event === 'published').length, 1);
  assert.equal(events[0].media_id, 'media-1');
  const after = pub.status(ws.id);
  assert.equal(after.can_publish, false);
  assert.ok(after.blockers.some((b) => /이미 게시/.test(b)));
  assert.throws(() => pub.start(ws.id, { version: st.version }), /이미 게시/);
  assert.doesNotMatch(fs.readFileSync(ws.file('output', 'instagram', 'ig-publish.json'), 'utf8'), /token|IGAA/i);
});

test('승인 전·버전이 바뀐 요청·사람 확인 전은 게시하지 않음', async (t) => {
  const warnCheck = { ready: true, checks: [{ id: 'approved', label: '최종 승인', status: 'pass', detail: '' }, { id: 'ai_image', label: 'GPT 이미지 확인', status: 'warn', detail: '' }] };
  const { ws, pub } = setup({ precheck: () => warnCheck });
  t.after(() => ws.cleanup());
  let st = pub.status(ws.id);
  assert.equal(st.can_publish, false);
  assert.ok(st.blockers.some((b) => /사람 확인/.test(b)));
  assert.throws(() => pub.start(ws.id, { version: st.version }), /사람 확인/);
  st = pub.acknowledge(ws.id, { version: st.version, ids: ['ai_image', 'not-a-check'] });
  assert.deepEqual(st.acks, ['ai_image']);
  assert.equal(st.can_publish, true);
  // 카드 이미지가 바뀌면 새 버전 → 이전 버전 요청·확인은 무효
  fs.copyFileSync(path.join(PNG_DIR, 'card-02.png'), ws.file('output', 'png', 'card-01.png'));
  assert.throws(() => pub.start(ws.id, { version: st.version }), /바뀌었어요/);
  const st2 = pub.status(ws.id);
  assert.notEqual(st2.version, st.version);
  assert.equal(st2.can_publish, false, '새 버전은 다시 확인');
  // 승인 전
  ws.editCards((d) => { d.stage = 'copy'; });
  const st3 = pub.status(ws.id);
  assert.ok(st3.blockers.some((b) => /최종 승인/.test(b)));
});

test('게시 뒤 링크 조회만 실패하면 게시 완료로 두고, 링크는 나중에 다시 확인', async (t) => {
  const ig = fakeIg({ failAt: 'permalink' });
  const { ws, pub, events } = setup({ ig });
  t.after(() => ws.cleanup());
  const cur = await pub.start(ws.id, { version: pub.status(ws.id).version }).done;
  assert.equal(cur.state, 'published');
  assert.equal(cur.permalink, null);
  assert.equal(events.length, 1);
  ig.call = (orig => async (m, p, params) => (m === 'GET' && p === 'media-1' ? { permalink: 'https://www.instagram.com/p/later/' } : orig(m, p, params)))(ig.call);
  const st = await pub.verify(ws.id);
  assert.equal(st.current.permalink, 'https://www.instagram.com/p/later/');
  assert.equal(st.published[0].permalink, 'https://www.instagram.com/p/later/');
  assert.equal(events.length, 1, '확인해도 기록은 늘지 않음');
});

test('게시 요청 중 연결이 끊기면 확인 필요 → 조회 전에는 다시 게시 안 함 → 실제 게시됐으면 완료, 아니면 다시 게시 가능', async (t) => {
  const ig = fakeIg({ failAt: 'publish' });
  const { ws, pub, events } = setup({ ig });
  t.after(() => ws.cleanup());
  const version = pub.status(ws.id).version;
  const cur = await pub.start(ws.id, { version }).done;
  assert.equal(cur.state, 'unknown');
  assert.throws(() => pub.start(ws.id, { version }), /확인/);
  // 인스타에 없음 → 실패로 바꾸고 다시 게시 가능
  const st = await pub.verify(ws.id);
  assert.equal(st.current.state, 'failed');
  assert.equal(st.can_publish, true);
  assert.equal(events.length, 0);
  // 다시 끊김 → 이번엔 인스타에 실제로 올라가 있음
  await pub.start(ws.id, { version }).done;
  const caption = pub.status(ws.id).caption;
  ig.call = (orig => async (m, p, params) => (m === 'GET' && p === '17841/media'
    ? { data: [{ id: 'media-real', caption, permalink: 'https://www.instagram.com/p/real/', timestamp: new Date(T0 + 1000).toISOString() }] }
    : orig(m, p, params)))(ig.call);
  const st2 = await pub.verify(ws.id);
  assert.equal(st2.current.state, 'published');
  assert.equal(st2.current.media_id, 'media-real');
  assert.equal(events.filter((e) => e.event === 'published').length, 1);
  assert.equal(st2.can_publish, false);
});

test('게시 전 단계에서 실패하면 게시 안 됨으로 두고 원인을 남김', async (t) => {
  const { ws, pub, opened } = setup({ ig: fakeIg({ failAt: 'upload' }) });
  t.after(() => ws.cleanup());
  const cur = await pub.start(ws.id, { version: pub.status(ws.id).version }).done;
  assert.equal(cur.state, 'failed');
  assert.match(cur.error.message, /업로드 실패/);
  assert.equal(opened.closed, 1);
  assert.equal(pub.status(ws.id).can_publish, true, '실패면 다시 게시 가능');
});

test('작업실을 다시 켜면: 올리던 중이면 실패(게시 안 됨), 게시 요청 뒤였으면 확인 필요', (t) => {
  const { ws, pub } = setup();
  t.after(() => ws.cleanup());
  const file = ws.file('output', 'instagram', 'ig-publish.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const base = { published: [], history: [], acks: null };
  fs.writeFileSync(file, JSON.stringify({ ...base, current: { state: 'uploading', steps: [] }, schedule: null }));
  pub.recover([ws.id]);
  assert.equal(readState(ws).current.state, 'failed');
  fs.writeFileSync(file, JSON.stringify({ ...base, current: { state: 'publishing', steps: [] }, schedule: { id: 's', state: 'running' } }));
  pub.recover([ws.id]);
  assert.equal(readState(ws).current.state, 'unknown');
  assert.equal(readState(ws).schedule.state, 'unknown');
});

test('예약: 시각 확인 → 시각이 되면 같은 흐름으로 게시, 취소, 놓친 예약은 자동 게시 안 함, 바뀐 버전은 막음', async (t) => {
  const now = { t: T0 };
  const { ws, pub, events } = setup({ now });
  t.after(() => ws.cleanup());
  const version = pub.status(ws.id).version;
  const at = (min) => new Date(now.t + min * 60000).toISOString();
  assert.throws(() => pub.schedule(ws.id, { version, at: at(1) }), /분 뒤 이후/);
  assert.throws(() => pub.schedule(ws.id, { version: 'old', at: at(60) }), /바뀌었어요/);
  let st = pub.schedule(ws.id, { version, at: at(60) });
  assert.equal(st.schedule.state, 'scheduled');
  assert.equal(st.can_schedule, false, '예약은 하나만');
  assert.equal(st.can_publish, false, '예약이 있으면 지금 게시는 막음');
  assert.equal(pub.summary(ws.id).scheduled_at, st.schedule.at);
  await pub.tick([ws.id]);
  assert.equal(readState(ws).schedule.state, 'scheduled', '시각 전에는 그대로');
  now.t += 60 * 60000 + 5000;
  await pub.tick([ws.id]);
  assert.equal(readState(ws).current.state, 'published');
  assert.equal(readState(ws).current.trigger, 'schedule');
  assert.equal(readState(ws).schedule.state, 'done');
  assert.equal(events[0].trigger, 'schedule');

  // 취소
  const ws2 = setup({ now });
  t.after(() => ws2.ws.cleanup());
  const v2 = ws2.pub.status(ws2.ws.id).version;
  ws2.pub.schedule(ws2.ws.id, { version: v2, at: at(30) });
  assert.equal(ws2.pub.cancelSchedule(ws2.ws.id).schedule.state, 'canceled');
  assert.throws(() => ws2.pub.cancelSchedule(ws2.ws.id), /취소할 예약/);

  // 놓친 예약: 작업실이 꺼져 있다가 유예 시간(10분) 뒤에 켜짐
  ws2.pub.schedule(ws2.ws.id, { version: v2, at: at(30) });
  now.t += 45 * 60000;
  await ws2.pub.tick([ws2.ws.id]);
  assert.equal(readState(ws2.ws).schedule.state, 'missed');
  assert.equal(readState(ws2.ws).current, null, '놓친 예약은 게시하지 않음');
  assert.equal(ws2.events.length, 0);

  // 예약 뒤 카드가 바뀌면 시각이 돼도 막고 이유를 남김
  ws2.pub.cancelSchedule(ws2.ws.id);
  const v3 = ws2.pub.status(ws2.ws.id).version;
  ws2.pub.schedule(ws2.ws.id, { version: v3, at: at(10) });
  fs.copyFileSync(path.join(PNG_DIR, 'card-03.png'), ws2.ws.file('output', 'png', 'card-02.png'));
  now.t += 10 * 60000 + 1000;
  await ws2.pub.tick([ws2.ws.id]);
  assert.equal(readState(ws2.ws).schedule.state, 'blocked');
  assert.match(readState(ws2.ws).schedule.reason, /바뀌었어요/);
});

test('계정 확인: 이름·한도만 돌려주고, 연결 정보가 없으면 안내', async (t) => {
  const { ws, pub } = setup();
  t.after(() => ws.cleanup());
  const a = await pub.account();
  assert.deepEqual({ ok: a.ok, username: a.username, used: a.used, total: a.total }, { ok: true, username: 'glowif_lab', used: 1, total: 100 });
  const none = createPublisher({ productsDir: ws.dir, appendEvent() {}, precheck: () => null, client: () => { throw new Error('no'); }, configured: () => false, toJpegs: async () => [], openPublicUrls: async () => ({}) });
  assert.match((await none.account()).error, /IG_ACCESS_TOKEN/);
  assert.ok(none.status(ws.id).blockers.some((b) => /연결 정보/.test(b)));
});

test('작업실 API: 상태·계정·게시·예약 경로, 쓰기 요청은 작업실 화면 헤더가 있어야 함', async (t) => {
  const http = require('node:http');
  const { createStudio } = require('../scripts/lib/studio-api');
  const { ws, pub } = setup();
  t.after(() => ws.cleanup());
  const studio = createStudio({ productsDir: ws.dir, publisher: pub, igSchedule: false, reportsDir: path.join(ws.dir, '.reports') });
  const server = http.createServer(async (req, res) => { if (!(await studio.handle(req, res))) res.writeHead(404).end(); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/studio`;
  const call = async (method, p, body, headers = { 'x-studio': '1' }) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  let r = await call('GET', `/products/${ws.id}/instagram`);
  assert.equal(r.status, 200);
  assert.equal(r.body.can_publish, true, r.body.blockers.join(' / '));
  const version = r.body.version;
  assert.equal((await call('GET', '/instagram/account')).body.username, 'glowif_lab');
  assert.equal((await call('POST', `/products/${ws.id}/instagram/publish`, { version }, {})).status, 403, '헤더 없는 쓰기 요청 거절');
  assert.equal((await call('POST', `/products/${ws.id}/instagram/publish`, { version: 'stale' })).status, 409);
  r = await call('POST', `/products/${ws.id}/instagram/schedule`, { version, at: new Date(T0 + 3600e3).toISOString() });
  assert.equal(r.body.schedule.state, 'scheduled');
  const list = await call('GET', '/products');
  assert.equal(list.body.products[0].instagram.scheduled_at, r.body.schedule.at, '목록에 예약 표시');
  assert.equal((await call('DELETE', `/products/${ws.id}/instagram/schedule`)).body.schedule.state, 'canceled');
  r = await call('POST', `/products/${ws.id}/instagram/publish`, { version });
  assert.equal(r.status, 202);
  assert.equal(r.body.request.state, 'requested');
  for (let i = 0; i < 50 && pub.running(); i++) await new Promise((ok) => setTimeout(ok, 20));
  r = await call('GET', `/products/${ws.id}/instagram`);
  assert.equal(r.body.current.state, 'published');
  assert.equal((await call('POST', `/products/${ws.id}/instagram/publish`, { version })).status, 409, '같은 버전 다시 게시 거절');
  assert.equal((await call('GET', `/products/${ws.id}/instagram/nope`)).status, 404);
});

test('터미널 명령으로 이미 게시한 카드(published.json)는 바뀌지 않았으면 다시 게시하지 않음', (t) => {
  const { ws, pub } = setup();
  t.after(() => ws.cleanup());
  const file = ws.file('output', 'instagram', 'published.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ published_at: new Date(Date.now() + 60000).toISOString(), media_id: 'cli-1', permalink: 'https://www.instagram.com/p/cli/', account: 'cardnews_auto_lab' }));
  let st = pub.status(ws.id);
  assert.equal(st.can_publish, false);
  assert.ok(st.blockers.some((b) => /터미널 명령으로 게시/.test(b)));
  assert.equal(st.published[0].trigger, 'cli');
  assert.equal(st.published[0].version, st.version);
  assert.throws(() => pub.start(ws.id, { version: st.version }), /터미널 명령/);
  assert.throws(() => pub.schedule(ws.id, { version: st.version, at: new Date(T0 + 3600e3).toISOString() }), /터미널 명령/);
  // 게시 뒤에 카드를 다시 출력했으면 새 콘텐츠로 봄
  fs.writeFileSync(file, JSON.stringify({ published_at: '2020-01-01T00:00:00Z', media_id: 'cli-1', permalink: null }));
  st = pub.status(ws.id);
  assert.equal(st.can_publish, true, st.blockers.join(' / '));
  assert.equal(st.published[0].version, 'cli');
});
