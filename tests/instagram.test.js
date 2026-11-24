// 인스타그램 연동 (B단계): API 흐름(가짜 fetch), 토큰 숨김, 캡션, JPEG XMP, 공개 주소 서버, .env 읽기
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createClient, explain, IgError } = require('../scripts/lib/instagram');
const { buildCaption } = require('../scripts/lib/ig-caption');
const { withXmpJpeg, readXmpJpeg, buildXmp } = require('../scripts/lib/ai-disclosure');
const { startFileServer, openTunnel, waitReachable } = require('../scripts/lib/public-url');
const { readEnvKeys } = require('../scripts/lib/env-file');
const { ROOT, makeWorkspace } = require('./helpers');
const cfg = require('../config/instagram.json');
const { seedCaption } = require('./caption-helpers');

const TOKEN = 'IGAA-secret-token-123';

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : {};
    const params = { ...Object.fromEntries(u.searchParams), ...body };
    calls.push({ method: init.method || 'GET', host: u.host, path: u.pathname, params, authorization: init.headers?.Authorization });
    for (const [re, reply] of routes) {
      if (re.test(`${init.method || 'GET'} ${u.pathname}`)) {
        const out = typeof reply === 'function' ? reply(params, calls) : reply;
        return { ok: !out.error, status: out.error ? 400 : 200, json: async () => out };
      }
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'not found' } }) };
  };
  return { fn, calls };
}

test('캐러셀 게시: 카드별 컨테이너 → 처리 완료 대기 → 캐러셀 → 게시 → 링크, 토큰은 인증 헤더로만', async () => {
  let n = 0;
  const f = fakeFetch([
    [/^POST \/v27\.0\/17841\/media$/, (p) => ({ id: p.media_type === 'CAROUSEL' ? 'car-1' : `item-${++n}` })],
    [/^GET \/v27\.0\/(item-\d|car-1)$/, { status_code: 'FINISHED' }],
    [/^POST \/v27\.0\/17841\/media_publish$/, { id: 'media-9' }],
    [/^GET \/v27\.0\/media-9$/, { permalink: 'https://www.instagram.com/p/abc/', timestamp: '2026-11-13T00:00:00+0000' }],
  ]);
  const ig = createClient({ token: TOKEN, fetchFn: f.fn, sleep: async () => {} });
  const r = await ig.publishImages('17841', ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'], '🤖 AI를 활용해 제작했어요');
  assert.deepEqual(r, { media_id: 'media-9', permalink: 'https://www.instagram.com/p/abc/', timestamp: '2026-11-13T00:00:00+0000', containers: ['item-1', 'item-2', 'item-3'] });
  const posts = f.calls.filter((c) => c.method === 'POST');
  assert.deepEqual(posts.map((c) => c.params.is_carousel_item || c.params.media_type || c.params.creation_id), ['true', 'true', 'true', 'CAROUSEL', 'car-1']);
  assert.equal(posts[3].params.children, 'item-1,item-2,item-3');
  assert.equal(posts[3].params.caption, '🤖 AI를 활용해 제작했어요');
  assert.ok(f.calls.every((c) => c.authorization === `Bearer ${TOKEN}`));
  assert.ok(f.calls.every((c) => !Object.hasOwn(c.params, 'access_token')));
});

test('한 장이면 단일 게시, 11장 이상은 거절, 처리 실패·오류 메시지에 토큰이 남지 않음', async () => {
  const f = fakeFetch([
    [/^POST \/v27\.0\/1\/media$/, { id: 'one' }],
    [/^GET \/v27\.0\/one$/, { status_code: 'ERROR', status: 'image download failed' }],
  ]);
  const ig = createClient({ token: TOKEN, fetchFn: f.fn, sleep: async () => {} });
  await assert.rejects(ig.publishImages('1', ['https://x/1.jpg'], 'c'), /컨테이너 처리 실패 \(ERROR\)/);
  assert.equal(f.calls[0].params.caption, 'c', '한 장이면 캡션을 이미지 컨테이너에');
  await assert.rejects(ig.publishImages('1', Array(11).fill('u'), 'c'), /최대 10장/);
  const bad = createClient({ token: TOKEN, fetchFn: fakeFetch([[/GET \/v27\.0\/me/, { error: { message: `Invalid OAuth access token ${TOKEN}`, code: 190 } }]]).fn });
  const err = await bad.me().catch((e) => e);
  assert.ok(err instanceof IgError);
  assert.ok(!err.message.includes(TOKEN), '오류 메시지에 토큰이 없어야 함');
  assert.match(explain(err), /인스타 연결이 만료/);
  assert.match(explain(new IgError('(#100) Invalid parameter', { status: 400, code: 100 })), /^인스타가 요청을 받아 주지 않았어요.*\(인스타 응답: \(#100\) Invalid parameter\)$/, '영어 원문 앞에 할 일을 붙임');
  assert.equal(explain(new IgError('인스타 API에 연결하지 못했어요 (ETIMEDOUT)')), '인스타 API에 연결하지 못했어요 (ETIMEDOUT)', '우리말 안내는 그대로');
  assert.throws(() => createClient({ token: '' }), /IG_ACCESS_TOKEN이 없어요/);
});

test('Unified Login은 명시한 계정 ID와 Facebook API를 쓰고 기존 Instagram Login 계정 조회도 유지한다', async () => {
  const unified = fakeFetch([
    [/^GET \/v27\.0\/17841$/, { id: '17841', username: 'cardnews_test' }],
    [/^GET \/v27\.0\/me\/permissions$/, { data: [{ permission: 'instagram_content_publish', status: 'granted' }] }],
    [/^POST \/v27\.0\/17841\/media$/, { id: 'one' }],
    [/^GET \/v27\.0\/one$/, { status_code: 'FINISHED' }],
    [/^POST \/v27\.0\/17841\/media_publish$/, { id: 'published' }],
    [/^GET \/v27\.0\/published$/, { permalink: 'https://www.instagram.com/p/test/' }],
  ]);
  const ig = createClient({ token: TOKEN, apiSetup: 'unified', userId: '17841', fetchFn: unified.fn });
  assert.equal((await ig.me()).user_id, '17841');
  assert.equal((await ig.permissions()).data[0].permission, 'instagram_content_publish');
  await ig.publishImages('17841', ['https://images.example/card.jpg'], '승인한 문구');
  assert.ok(unified.calls.every((c) => c.host === 'graph.facebook.com'));
  assert.ok(!unified.calls.some((c) => c.path === '/v27.0/me'), '시스템 사용자를 인스타 계정으로 조회하면 안 됨');
  assert.ok(unified.calls.every((c) => c.authorization === `Bearer ${TOKEN}` && !Object.hasOwn(c.params, 'access_token')));

  const legacy = fakeFetch([[/^GET \/v27\.0\/me$/, { user_id: '17841', username: 'legacy', account_type: 'BUSINESS' }]]);
  const old = createClient({ token: TOKEN, fetchFn: legacy.fn });
  assert.equal((await old.me()).username, 'legacy');
  assert.equal(legacy.calls[0].host, 'graph.instagram.com');
  assert.match(legacy.calls[0].params.fields, /user_id/);
});

test('계정 ID 오류를 감지하고 Unified Login 토큰의 Instagram 갱신을 차단한다', async () => {
  const f = fakeFetch([[/^GET \/v27\.0\/me$/, { user_id: '2', username: 'other' }]]);
  const unified = createClient({ token: TOKEN, apiSetup: 'unified', fetchFn: f.fn });
  await assert.rejects(unified.me(), /IG_USER_ID가 필요/);
  await assert.rejects(unified.refreshToken(), /Unified Login 토큰/);
  assert.equal(f.calls.length, 0);
  const legacy = createClient({ token: TOKEN, userId: '1', fetchFn: f.fn });
  await assert.rejects(legacy.me(), /계정이 달라요/);
  assert.throws(() => createClient({ token: TOKEN, apiSetup: 'unknown' }), /IG_API_SETUP/);
  assert.throws(() => createClient({ token: TOKEN, userId: '../me' }), /숫자 ID/);
});

test('연결 검사는 Unified Login의 게시 권한과 한도를 확인하고 누락·조회 실패를 숨기지 않는다', async () => {
  const { check } = require('../scripts/instagram');
  const calls = [];
  const ig = {
    apiSetup: 'unified',
    me: async () => ({ user_id: '17841', username: 'cardnews_test' }),
    permissions: async () => ({ data: [
      { permission: 'instagram_basic', status: 'granted' },
      { permission: 'instagram_content_publish', status: 'granted' },
    ] }),
    publishingLimit: async (id) => {
      calls.push(id);
      return { data: [{ quota_usage: 0, config: { quota_total: 100 } }] };
    },
  };
  const messages = [];
  const result = await check({ ig, log: (message) => messages.push(message) });
  assert.equal(result.me.user_id, '17841');
  assert.deepEqual(calls, ['17841']);
  assert.equal(result.used, 0);
  assert.equal(result.total, 100);
  assert.ok(messages.some((message) => /게시 권한 확인/.test(message)));
  const missing = { ...ig, permissions: async () => ({ data: [{ permission: 'instagram_basic', status: 'granted' }, { permission: 'instagram_content_publish', status: 'declined' }] }) };
  await assert.rejects(check({ ig: missing, log: () => {} }), /게시 권한이 부족.*instagram_content_publish/);
  assert.equal(calls.length, 1, '권한이 없으면 게시 한도 확인까지 진행하지 않음');
  const failedLimit = { ...ig, publishingLimit: async () => { throw new IgError('한도 조회 실패'); } };
  await assert.rejects(check({ ig: failedLimit, log: () => {} }), /한도 조회 실패/);
});

test('통신·처리 오류에서도 토큰을 숨기고 로그인 방식에 맞는 권한을 안내한다', async () => {
  const network = createClient({ token: TOKEN, fetchFn: async () => { throw new Error(`connection failed: ${TOKEN}`); } });
  const networkError = await network.me().catch((error) => error);
  assert.ok(networkError instanceof IgError);
  assert.ok(!networkError.message.includes(TOKEN));
  const denied = createClient({ token: TOKEN, apiSetup: 'unified', userId: '17841', fetchFn: fakeFetch([[/GET/, { error: { message: 'permission denied', code: 200 } }]]).fn });
  const error = await denied.me().catch((failure) => failure);
  assert.match(explain(error), /instagram_content_publish/);
  assert.ok(!explain(error).includes('instagram_business_'));
});

test('publish 명령은 웹과 같은 기록·버전·사람 확인을 쓰고 승인 전에는 차단해요', async (t) => {
  const { publish } = require('../scripts/instagram');
  const { setup, fakeIg } = require('./ig-publisher-helpers');
  const { ws, pub, ig, events } = setup({ ig: fakeIg() });
  t.after(ws.cleanup);
  const st = pub.status(ws.id);
  const result = await publish(ws.id, { publisher: pub, version: st.version, confirm: true, log: () => {} });
  assert.equal(result.media_id, 'media-1');
  assert.equal(result.trigger, 'cli');
  const record = JSON.parse(fs.readFileSync(ws.file('output/instagram/ig-publish.json'), 'utf8'));
  assert.equal(record.published[0].permalink, result.permalink);
  assert.equal(fs.existsSync(ws.file('output/instagram/published.json')), false, '새 게시에 옛 형식 기록을 만들지 않아요');
  assert.equal(events.length, 1);
  assert.throws(() => pub.start(ws.id, { version: st.version }), /이미 게시/);
  ws.editCards((d) => { d.stage = 'copy'; });
  const changed = pub.status(ws.id);
  await assert.rejects(publish(ws.id, { publisher: pub, version: changed.version, confirm: true, log: () => {} }), /최종 승인/);
  assert.equal(ig.calls.filter((c) => c.path.endsWith('media_publish')).length, 1);
});

test('이전 조립 방식 비교: 안내·카드 목록·해시태그를 이어 붙여요', () => {
  const data = {
    cards: [
      { no: 1, copy: { title: '가볍게\n촉촉하게', subtitle: '수분 젤 크림' } },
      { no: 2, copy: { title: '이렇게 발라요', items: ['적당량을 덜어요', '펴 발라요'] } },
    ],
  };
  const c = buildCaption(data, cfg.caption, { productName: '오션 젤 크림 (평가용 가상 제품)' });
  const lines = c.text.split('\n');
  assert.match(lines[0], /AI 활용/);
  assert.match(lines[0], /샘플 콘텐츠/);
  assert.ok(c.text.includes('가볍게 촉촉하게\n수분 젤 크림'));
  assert.ok(c.text.includes('✔ 이렇게 발라요\n· 적당량을 덜어요\n· 펴 발라요'));
  assert.deepEqual(c.hashtags, ['뷰티', '스킨케어', '오션젤크림']);
  assert.ok(buildCaption(data, { ...cfg.caption, max_chars: 40 }).text.length <= 40);
});

test('JPEG에 AI 활용 XMP(APP1)를 JFIF 뒤에 넣고, 다시 넣으면 바꿔 끼움', () => {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8]), app0, Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9])]);
  const a = withXmpJpeg(jpg, buildXmp({ productId: 'p', card: 1, parts: ['text'] }));
  assert.equal(a.readUInt16BE(2 + app0.length), 0xffe1, 'APP0 바로 뒤');
  assert.match(readXmpJpeg(a), /compositeWithTrainedAlgorithmicMedia/);
  const b = withXmpJpeg(a, buildXmp({ productId: 'p', card: 1, parts: ['text', 'image'] }));
  assert.equal(b.toString('latin1').split('http://ns.adobe.com/xap/1.0/\0').length - 1, 1, 'APP1 XMP는 하나만');
  assert.match(readXmpJpeg(b), /aiParts="text,image"/);
  assert.ok(b.subarray(b.length - 8).equals(jpg.subarray(jpg.length - 8)), '이미지 데이터는 그대로');
  assert.equal(readXmpJpeg(jpg), null);
});

test('공개용 파일 서버는 비밀 경로의 지정 파일만 주고, 터널 주소를 읽는다', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-pub-'));
  const file = path.join(dir, 'card-01.jpg');
  fs.writeFileSync(file, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'x');
  const s = await startFileServer([file]);
  try {
    const base = `http://127.0.0.1:${s.port}`;
    const ok = await fetch(base + s.pathOf(file));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/jpeg');
    assert.equal((await fetch(`${base}/card-01.jpg`)).status, 404, '비밀 경로 없이는 안 됨');
    assert.equal((await fetch(base + s.pathOf(file).replace('card-01.jpg', 'secret.txt'))).status, 404);
  } finally {
    await s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => (child.killed = true);
  const p = openTunnel(1234, { spawnFn: () => child });
  let ready = false;
  p.then(() => { ready = true; });
  child.stderr.emit('data', 'INF | Your quick Tunnel has been created! Visit it at:\nINF | https://sky-blue-cat.trycloudflare.com\n');
  await Promise.resolve();
  assert.equal(ready, false, '주소 안내만으로 터널 준비 완료로 판단하지 않음');
  child.stderr.emit('data', 'INF Registered tunnel connection connIndex=0\n');
  const t = await p;
  assert.equal(t.url, 'https://sky-blue-cat.trycloudflare.com');
  t.close();
  assert.equal(child.killed, true);
  const missing = new EventEmitter();
  missing.stdout = new EventEmitter();
  missing.stderr = new EventEmitter();
  const q = openTunnel(1, { spawnFn: () => missing });
  missing.emit('error', Object.assign(new Error('spawn cloudflared ENOENT'), { code: 'ENOENT' }));
  await assert.rejects(q, /brew install cloudflared/);
});

test('공개 주소 확인은 일시적인 DNS 실패를 재시도하고 JPEG 응답을 확인한다', async () => {
  let calls = 0;
  const ready = await waitReachable('https://images.example/card.jpg', {
    initialDelayMs: 0,
    every: 1,
    fetchFn: async (url, options) => {
      calls++;
      assert.equal(options.method, 'HEAD');
      assert.ok(options.signal instanceof AbortSignal);
      if (calls === 1) throw Object.assign(new Error('DNS 대기'), { code: 'ENOTFOUND' });
      return { ok: true, headers: { get: () => 'image/jpeg' } };
    },
  });
  assert.equal(ready, true);
  assert.equal(calls, 2);
});

test('.env에서 필요한 키만 읽고, 환경변수가 먼저', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-env-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, '# 주석\nIG_ACCESS_TOKEN="abc"\nexport OTHER=1\nIG_USER_ID=\n');
  assert.deepEqual(readEnvKeys(['IG_ACCESS_TOKEN', 'IG_USER_ID'], { file, env: {} }), { IG_ACCESS_TOKEN: 'abc' });
  assert.deepEqual(readEnvKeys(['IG_ACCESS_TOKEN'], { file, env: { IG_ACCESS_TOKEN: 'env' } }), { IG_ACCESS_TOKEN: 'env' });
  assert.deepEqual(readEnvKeys(['IG_ACCESS_TOKEN'], { file: path.join(dir, 'none'), env: {} }), {});
  fs.rmSync(dir, { recursive: true, force: true });
});
