// 게시하는 동안만 JPEG를 공개 주소로 여는 도구 (배포 없이 시연: docs/proposals/ax-plan.md B3)
// 1) 이 컴퓨터에 정해진 파일만 주는 작은 서버(127.0.0.1, 추측하기 어려운 경로)
// 2) cloudflared 빠른 터널로 https 공개 주소 → 게시가 끝나면 둘 다 닫음
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

function startFileServer(files) {
  const secret = crypto.randomBytes(12).toString('hex');
  const byName = new Map(files.map((f) => [path.basename(f), f]));
  const server = http.createServer((req, res) => {
    const m = String(req.url || '').match(/^\/([0-9a-f]+)\/([\w.-]+\.jpe?g)$/);
    const file = m && m[1] === secret ? byName.get(m[2]) : null;
    if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404).end();
      return;
    }
    const buf = fs.readFileSync(file);
    res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': buf.length, 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        port: server.address().port,
        pathOf: (file) => `/${secret}/${path.basename(file)}`,
        close: () => new Promise((r) => server.close(() => r())),
      }),
    ),
  );
}

const TUNNEL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

/** cloudflared 빠른 터널. bin을 못 찾으면 설치 안내 */
function openTunnel(port, { bin = process.env.CLOUDFLARED_BIN || 'cloudflared', timeoutMs = 40000, spawnFn = spawn } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      reject(new Error(`cloudflared를 실행하지 못했어요 (${e.message}). Mac은 brew install cloudflared`));
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('공개 주소(터널)를 여는 데 실패했어요 (시간 초과)'));
    }, timeoutMs);
    const onData = (d) => {
      const m = String(d).match(TUNNEL_RE);
      if (m) {
        clearTimeout(timer);
        resolve({ url: m[0], close: () => child.kill() });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(e.code === 'ENOENT' ? 'cloudflared가 없어요. Mac은 brew install cloudflared 로 설치해 주세요' : `cloudflared 오류: ${e.message}`));
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`cloudflared가 종료됐어요 (코드 ${code})`));
    });
  });
}

/** 공개 주소로 실제 파일이 열리는지 (터널 주소는 몇 초 뒤에 열리기도 해서 재시도) */
async function waitReachable(url, { tries = 10, every = 2000, fetchFn = fetch } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchFn(url, { method: 'HEAD' });
      if (r.ok && /image\/jpeg/.test(r.headers.get('content-type') || '')) return true;
    } catch {
      /* 다시 */
    }
    await new Promise((r) => setTimeout(r, every));
  }
  return false;
}

module.exports = { startFileServer, openTunnel, waitReachable, TUNNEL_RE };
