const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { createWebServer, createPublishServer } = require('../scripts/studio-server');
const { stageFixedMedia, fixedMediaConfig } = require('../scripts/lib/ig-fixed-media');
const { setup } = require('./ig-publisher-helpers');
const { seedCaption } = require('./caption-helpers');

const origin = 'https://studio.example.com';
const base = origin + '/ig-media';

function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-kt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function publicHead(directory) {
  return async (url, { method, redirect }) => {
    assert.equal(method, 'HEAD');
    assert.equal(redirect, 'error');
    const file = path.join(directory, new URL(url).pathname.slice('/ig-media/'.length));
    return new Response(null, { headers: { 'content-type': 'image/jpeg', 'content-length': fs.statSync(file).size } });
  };
}

test('고정 HTTPS에서 게시 요청마다 다른 JPEG를 제공하고 성공·실패 뒤에 정리해요', async (t) => {
  const root = scratch(t);
  const media = path.join(root, 'media');
  fs.mkdirSync(media);
  const jpg = path.join(root, 'card-01.jpg');
  fs.writeFileSync(jpg, '첫 게시 이미지');
  const cfg = { ...fixedMediaConfig(base, media), fetchFn: publicHead(media) };
  const first = await stageFixedMedia([jpg], cfg);
  fs.writeFileSync(jpg, '두 번째 게시 이미지');
  const second = await stageFixedMedia([jpg], cfg);
  const [firstPath, secondPath] = [first, second].map(({ urls }) => new URL(urls[0]).pathname.split('/').slice(-2).join('/'));
  assert.notEqual(firstPath, secondPath);
  assert.equal(fs.readFileSync(path.join(media, firstPath), 'utf8'), '첫 게시 이미지');
  assert.equal(fs.readFileSync(path.join(media, secondPath), 'utf8'), '두 번째 게시 이미지');
  await first.close();
  await second.close();
  await assert.rejects(stageFixedMedia([jpg], { ...cfg, fetchFn: async () => new Response(null, { status: 401 }) }), /고정 공개 주소/);
  assert.deepEqual(fs.readdirSync(media), []);
  assert.throws(() => fixedMediaConfig('http://studio.example.com', media), /HTTPS/);
});

async function listen(server, target) {
  server.listen(target);
  await once(server, 'listening');
}

function request(socketPath, route, { method = 'GET', host = 'studio.example.com', from = origin, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      socketPath, path: route, method,
      headers: { host, ...(method === 'GET' ? {} : { origin: from, 'x-studio': '1' }) },
    }, (res) => {
      const chunks = [];
      res.on('data', (data) => chunks.push(data));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, data: res.headers['content-type']?.includes('json') ? JSON.parse(text) : text });
      });
    });
    req.on('error', reject);
    req.end(body && JSON.stringify(body));
  });
}

test('배포 웹에서 캡션 작성·확인·캐러셀 게시를 별도 서버에 연결해요', async (t) => {
  const root = scratch(t);
  const dir = (name) => { const d = path.join(root, name); fs.mkdirSync(d); return d; };
  const dist = dir('dist');
  const dataDir = dir('data');
  const media = dir('media');
  fs.writeFileSync(path.join(dist, 'index.html'), '<main>작업실</main>');
  const publisherSocket = path.join(root, 'ig.sock');
  const webSocket = path.join(root, 'web.sock');
  const { ws, pub, ig, now } = setup({
    openPublicUrls: (files) => stageFixedMedia(files, { base, directory: media, fetchFn: publicHead(media) }),
  });
  fs.unlinkSync(ws.file('output', 'instagram', 'caption-draft.json'));
  const worker = createPublishServer({ productsDir: ws.dir, publisher: pub, igSchedule: false });
  const web = createWebServer({
    origin, publisherSocket, productsDir: ws.dir, dist, dataDir,
    captionFn: async ({ productDir }) => {
      assert.equal(productDir, ws.file());
      seedCaption(ws);
    },
  });
  t.after(async () => {
    await Promise.all([web, worker].map((s) => new Promise((r) => s.close(r))));
    ws.cleanup();
  });
  await listen(worker, publisherSocket);
  await listen(web, webSocket);
  const prefix = `/api/studio/products/${ws.id}/instagram`;
  const send = (suffix = '', options) => request(webSocket, prefix + suffix, options);
  assert.equal((await request(webSocket, '/studio')).data, '<main>작업실</main>');
  assert.equal((await request(webSocket, '/assets/missing.js')).status, 404);
  assert.equal((await request(webSocket, '/studio', { host: 'other.example.com' })).status, 403);
  assert.equal((await request(publisherSocket, '/api/studio/status', { host: 'localhost' })).status, 404);
  assert.equal((await send('/caption', { method: 'POST', from: 'https://other.example.com' })).status, 403);
  assert.equal((await send()).data.caption_needs_write, true);
  assert.equal((await send('/caption', { method: 'POST' })).status, 200);
  const initial = (await send()).data;
  assert.match(initial.caption, /^.*AI/);
  assert.equal(initial.caption_needs_write, false);
  const { version, check } = initial;
  const ids = check.checks.filter((c) => c.status === 'warn').map((c) => c.id);
  assert.equal((await send('/ack', { method: 'POST', body: { version, ids } })).data.can_publish, true);
  const at = new Date(now.t + 3 * 60_000).toISOString();
  const scheduled = await send('/schedule', { method: 'POST', body: { version, at } });
  assert.equal(scheduled.data.schedule.state, 'scheduled');
  now.t = Date.parse(at);
  // 예약 시각에는 브라우저 요청 없이 게시 프로세스가 작업해요.
  await pub.tick([ws.id]);
  const result = (await send()).data;
  assert.equal(result.current.state, 'published', JSON.stringify(result.current.error));
  assert.equal(result.published[0].permalink, 'https://www.instagram.com/p/glowif1/');
  const images = ig.calls.filter(({ params }) => params.image_url).map(({ params }) => new URL(params.image_url).pathname);
  assert.deepEqual(images.map((name) => name.split('/').at(-1)), ['card-01.jpg', 'card-02.jpg', 'card-03.jpg', 'card-04.jpg', 'card-05.jpg']);
  assert.deepEqual(fs.readdirSync(media), []);
  assert.equal((await send('/publish', { method: 'POST', body: { version } })).status, 409);
});
