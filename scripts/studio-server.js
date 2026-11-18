// KT 서버용 진입점. 웹과 인스타 게시는 다른 OS 계정의 Unix 소켓에서 실행해요.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pipeline } = require('node:stream');
const { ROOT } = require('./lib/common');
const { createStudio, API } = require('./lib/studio-api');
const { fixedMediaConfig } = require('./lib/ig-fixed-media');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

function jsonError(res, status, error) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error }));
}

function forwardPublisher(socketPath) {
  return (req, res, route, search) => {
    const upstream = http.request({
      socketPath,
      method: req.method,
      path: API + route + search,
      headers: { host: 'localhost', 'x-studio': '1', 'content-type': 'application/json' },
    }, (response) => {
      res.writeHead(response.statusCode, response.headers);
      pipeline(response, res, () => {});
    });
    upstream.setTimeout(60000, () => upstream.destroy());
    upstream.on('error', () => {
      if (res.headersSent) res.destroy();
      else jsonError(res, 503, '인스타 게시 서비스에 연결하지 못했어요');
    });
    res.once('close', () => upstream.destroy());
    req.pipe(upstream);
  };
}

function publisherRequest(method, pathname) {
  if (method === 'GET' && pathname === `${API}/instagram/account`) return true;
  const match = pathname.match(/^\/api\/studio\/products\/[a-z0-9]+(?:-[a-z0-9]+)*\/instagram(?:\/(ack|publish|schedule|verify))?$/);
  if (!match) return false;
  if (!match[1]) return method === 'GET';
  return method === 'POST' || (method === 'DELETE' && match[1] === 'schedule');
}

function createPublishServer(options) {
  const studio = createStudio(options);
  const server = http.createServer((req, res) => {
    const pathname = String(req.url).split('?')[0];
    if (!publisherRequest(req.method, pathname)) return jsonError(res, 404, '없는 게시 주소예요');
    studio.handle(req, res).catch(() => jsonError(res, 500, '게시 요청을 처리하지 못했어요'));
  });
  server.on('close', studio.publisher.stopTimer);
  return server;
}

function sendStatic(req, res, pathname, dist, dataDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return jsonError(res, 405, '파일을 읽을 수만 있어요');
  const data = pathname.startsWith('/data/');
  const relative = data ? pathname.slice(6) : pathname.slice(1);
  if (relative.split('/').some((segment) => segment.startsWith('.') || segment.includes('\\'))) {
    return jsonError(res, 404, '파일이 없어요');
  }
  const base = data ? dataDir : dist;
  const asset = Boolean(path.extname(relative));
  const file = path.join(base, data || asset ? relative : 'index.html');
  const type = CONTENT_TYPES[path.extname(file)];
  if (!type) return jsonError(res, 404, '파일이 없어요');
  let real;
  try {
    real = fs.realpathSync.native(file);
  } catch (e) {
    if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e;
    return jsonError(res, 404, '파일이 없어요');
  }
  const stat = real.startsWith(base + path.sep) && fs.statSync(real, { throwIfNoEntry: false });
  if (!stat?.isFile()) return jsonError(res, 404, '파일이 없어요');
  res.writeHead(200, {
    'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  pipeline(fs.createReadStream(real), res, () => {});
}

function createWebServer({ origin, publisherSocket, dataDir, dist = path.join(ROOT, 'web', 'dist'), ...options }) {
  dist = fs.realpathSync(dist);
  dataDir = fs.realpathSync(dataDir);
  const studio = createStudio({ ...options, studioOrigin: origin, forwardInstagram: forwardPublisher(publisherSocket) });
  const host = new URL(origin).host;
  return http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== host) return jsonError(res, 403, '허용한 작업실 주소로 접속해 주세요');
      const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
      if (pathname === `${API}/figma` || pathname.startsWith(`${API}/figma/`)) return jsonError(res, 404, '없는 API예요');
      if (await studio.handle(req, res)) return;
      sendStatic(req, res, pathname, dist, dataDir);
    } catch {
      if (res.headersSent) res.destroy();
      else jsonError(res, 500, '작업실 요청을 처리하지 못했어요');
    }
  });
}

function requiredPath(name) {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value)) throw new Error(`${name}에 절대 경로를 지정해 주세요`);
  return value;
}

function main(mode) {
  const productsDir = requiredPath('CARDNEWS_PRODUCTS_DIR');
  const publisherSocket = requiredPath('CARDNEWS_PUBLISH_SOCKET');
  let server;
  let socket;
  if (mode === 'publish') {
    fixedMediaConfig(process.env.IG_PUBLIC_BASE_URL, requiredPath('IG_PUBLIC_MEDIA_DIR'));
    server = createPublishServer({ productsDir });
    socket = publisherSocket;
  } else if (mode === 'web') {
    const origin = new URL(process.env.CARDNEWS_STUDIO_ORIGIN);
    if (origin.protocol !== 'https:' || origin.href !== origin.origin + '/') throw new Error('작업실 HTTPS 주소만 지정해 주세요');
    const state = requiredPath('CARDNEWS_STUDIO_STATE_DIR');
    const dataDir = path.join(state, 'web');
    const exportConfigFile = path.join(state, 'export.json');
    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(exportConfigFile)) fs.writeFileSync(exportConfigFile, '{"projects":[]}\n');
    server = createWebServer({
      origin: origin.origin, publisherSocket, productsDir, dataDir, exportConfigFile,
      reportsDir: path.join(state, 'jobs'), webIndexFile: path.join(dataDir, 'index.json'),
    });
    socket = requiredPath('CARDNEWS_STUDIO_SOCKET');
  } else {
    throw new Error('web 또는 publish 실행 모드를 지정해 주세요');
  }
  // 소켓에 접근할 수 있는 계정·그룹은 systemd 서비스와 상위 디렉터리에서 지정해요.
  server.listen(socket, () => fs.chmodSync(socket, 0o660));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close());
}

if (require.main === module) main(process.argv[2]);
module.exports = { createWebServer, createPublishServer };
