// 작업실 게시 관리자(ig-publisher.js)가 실제로 쓰는 연결: 토큰·인스타 API·JPEG 변환·공개 주소·게시 전 점검
// 테스트는 이 파일 대신 가짜 함수를 넣음
const path = require('path');
const { spawnSync } = require('child_process');
const { readEnvKeys } = require('./env-file');
const { createClient } = require('./instagram');

const CFG = require('../../config/instagram.json');
const KEYS = ['IG_ACCESS_TOKEN', 'IG_USER_ID', 'IG_API_SETUP'];

/** 토큰이 설정돼 있는지만 봄 (값은 꺼내지 않음) */
function configured() {
  const k = readEnvKeys(KEYS);
  if (!k.IG_ACCESS_TOKEN) return false;
  return k.IG_API_SETUP === 'unified' ? Boolean(k.IG_USER_ID) : true;
}
function client() {
  const k = readEnvKeys(KEYS);
  return createClient({ token: k.IG_ACCESS_TOKEN, userId: k.IG_USER_ID, apiSetup: k.IG_API_SETUP || 'instagram' });
}

async function toJpegs(outDir, pngFiles) {
  const { toJpegs: convert } = require('./ig-media');
  return (await convert(pngFiles, outDir, { quality: CFG.jpeg_quality })).map((r) => r.jpg);
}

/**
 * 인스타가 가져갈 공개 주소
 *  - IG_PUBLIC_BASE_URL(예: 나중의 KT 서버)이 있으면 그 주소 + 파일 이름 (파일을 그 서버에 올리는 일은 서버 쪽 작업)
 *  - 없으면 게시하는 동안만 이 컴퓨터에 작은 서버 + cloudflared 임시 터널을 열고 끝나면 닫음
 */
async function openPublicUrls(jpgs, { baseUrl = null } = {}) {
  const base = baseUrl || readEnvKeys(['IG_PUBLIC_BASE_URL']).IG_PUBLIC_BASE_URL;
  if (base) return { mode: 'base_url', urls: jpgs.map((f) => `${base.replace(/\/$/, '')}/${path.basename(f)}`), close: () => {} };
  const { startFileServer, openTunnel, waitReachable } = require('./public-url');
  const server = await startFileServer(jpgs);
  let tunnel;
  try {
    tunnel = await openTunnel(server.port);
    const urls = jpgs.map((f) => tunnel.url + server.pathOf(f));
    if (!(await waitReachable(urls[0]))) throw new Error('공개 주소에서 이미지가 열리지 않아요 (터널 확인)');
    return { mode: 'tunnel', urls, close: async () => { tunnel.close(); await server.close(); } };
  } catch (e) {
    tunnel?.close();
    await server.close();
    throw e;
  }
}

/** 게시 전 점검을 별도 프로세스로 (제품 폴더 위치를 환경변수로 넘김) */
function precheckIn(root, productsDir) {
  return (id) => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'precheck.js'), id, '--json'], {
      encoding: 'utf8',
      env: { ...process.env, CARDNEWS_PRODUCTS_DIR: productsDir, CARDNEWS_NO_LOG: '1' },
    });
    try {
      return JSON.parse(r.stdout);
    } catch {
      return null;
    }
  };
}

module.exports = { configured, client, toJpegs, openPublicUrls, precheckIn };
