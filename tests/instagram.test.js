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
const { startFileServer, openTunnel } = require('../scripts/lib/public-url');
const { readEnvKeys } = require('../scripts/lib/env-file');
const cfg = require('../config/instagram.json');

const TOKEN = 'IGAA-secret-token-123';

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : {};
    const params = { ...Object.fromEntries(u.searchParams), ...body };
    calls.push({ method: init.method || 'GET', path: u.pathname, params });
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

test('캐러셀 게시: 카드별 컨테이너 → 처리 완료 대기 → 캐러셀 → 게시 → 링크, 토큰은 본문으로만', async () => {
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
  assert.ok(f.calls.every((c) => c.params.access_token === TOKEN));
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
  assert.match(explain(err), /토큰이 만료/);
  assert.throws(() => createClient({ token: '' }), /IG_ACCESS_TOKEN이 없어요/);
});

test('캡션: 첫 줄 AI 활용·샘플 표시, 카드 문구만 사용, 해시태그', () => {
  const data = {
    cards: [
      { no: 1, copy: { title: '가볍게\n촉촉하게', subtitle: '수분 젤 크림' } },
      { no: 2, copy: { title: '이렇게 발라요', items: ['적당량을 덜어요', '펴 발라요'] } },
    ],
  };
  const c = buildCaption(data, cfg.caption, { productName: '오션 젤 크림 (평가용 가상 제품)' });
  const lines = c.text.split('\n');
  assert.match(lines[0], /AI를 활용해 제작/);
  assert.match(lines[0], /샘플 게시물/);
  assert.ok(c.text.includes('가볍게 촉촉하게\n수분 젤 크림'));
  assert.ok(c.text.includes('✔ 이렇게 발라요\n· 적당량을 덜어요\n· 펴 발라요'));
  assert.deepEqual(c.hashtags, ['AI활용', '카드뉴스', '오션젤크림']);
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
  child.stderr.emit('data', 'INF | Your quick Tunnel has been created! Visit it at:\nINF | https://sky-blue-cat.trycloudflare.com\n');
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

test('.env에서 필요한 키만 읽고, 환경변수가 먼저', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-env-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, '# 주석\nIG_ACCESS_TOKEN="abc"\nexport OTHER=1\nIG_USER_ID=\n');
  assert.deepEqual(readEnvKeys(['IG_ACCESS_TOKEN', 'IG_USER_ID'], { file, env: {} }), { IG_ACCESS_TOKEN: 'abc' });
  assert.deepEqual(readEnvKeys(['IG_ACCESS_TOKEN'], { file, env: { IG_ACCESS_TOKEN: 'env' } }), { IG_ACCESS_TOKEN: 'env' });
  assert.deepEqual(readEnvKeys(['IG_ACCESS_TOKEN'], { file: path.join(dir, 'none'), env: {} }), {});
  fs.rmSync(dir, { recursive: true, force: true });
});
