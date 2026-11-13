// 인스타그램 연동 (docs/proposals/ax-plan.md B단계)
//   npm run ig -- check                     토큰으로 계정·게시 한도 확인 (토큰은 출력하지 않음)
//   npm run ig -- prepare <제품ID>          캡션(output/instagram/caption.txt) + JPEG(AI 활용 XMP 유지)
//   npm run ig -- publish <제품ID> [--dry-run] [--base-url <https 주소>]
//        게시 전 점검이 '게시 가능'인 것만. 공개 주소는 cloudflared 빠른 터널(기본) 또는 --base-url(이미 파일을 공개해 둔 서버)
//   npm run ig -- refresh-token             60일 토큰 갱신 → .env의 IG_ACCESS_TOKEN을 바꿈 (값은 출력하지 않음)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { paths, loadInput } = require('./lib/common');
const { readEnvKeys } = require('./lib/env-file');
const { createClient, explain, IgError } = require('./lib/instagram');
const { buildCaption } = require('./lib/ig-caption');
const { toJpegs } = require('./lib/ig-media');
const { startFileServer, openTunnel, waitReachable } = require('./lib/public-url');
const { appendEvent } = require('./lib/events');

const cfg = require('../config/instagram.json');
const igDir = (id) => paths.product(id, 'output', 'instagram');
const pad = (n) => String(n).padStart(2, '0');

function productName(id) {
  try {
    return loadInput(id)?.groups?.['제품 정보']?.['제품명'] || null;
  } catch {
    return null;
  }
}

function readCards(id) {
  return JSON.parse(fs.readFileSync(paths.product(id, 'cards.json'), 'utf8'));
}

// 게시물 키: 카드 PNG + 캡션이 같으면 같은 게시물 (다시 준비할지 판단)
function postKey(pngs, caption) {
  const h = crypto.createHash('sha1');
  for (const f of pngs) h.update(fs.readFileSync(f));
  h.update(caption);
  return h.digest('hex').slice(0, 16);
}

async function prepare(id, { log = console.log } = {}) {
  const data = readCards(id);
  const pngs = data.cards.map((c) => paths.product(id, 'output', 'png', `card-${pad(c.no)}.png`));
  const missing = pngs.filter((f) => !fs.existsSync(f));
  if (missing.length) throw new Error(`출력 PNG가 없어요: ${missing.map((f) => path.basename(f)).join(', ')} (npm run render 먼저)`);
  const caption = buildCaption(data, cfg.caption, { productName: productName(id) });
  const dir = igDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'caption.txt'), caption.text + '\n');
  const jpgs = await toJpegs(pngs, dir, { quality: cfg.jpeg_quality });
  const post = { product_id: id, prepared_at: new Date().toISOString(), key: postKey(pngs, caption.text), cards: jpgs.map((j) => ({ file: path.basename(j.jpg), bytes: j.bytes, ai_label: j.xmp })), caption_chars: caption.chars, hashtags: caption.hashtags };
  fs.writeFileSync(path.join(dir, 'post.json'), JSON.stringify(post, null, 2) + '\n');
  log(`준비 완료: JPEG ${jpgs.length}장 (AI 활용 표시 ${jpgs.filter((j) => j.xmp).length}장) · 캡션 ${caption.chars}자 → ${path.relative(paths.root || process.cwd(), dir)}`);
  return { data, post, caption: caption.text, jpgs: jpgs.map((j) => j.jpg) };
}

function client() {
  const { IG_ACCESS_TOKEN } = readEnvKeys(['IG_ACCESS_TOKEN']);
  return createClient({ token: IG_ACCESS_TOKEN });
}

async function check({ log = console.log } = {}) {
  const ig = client();
  const me = await ig.me();
  const limit = await ig.publishingLimit(me.user_id).catch(() => null);
  const used = limit?.data?.[0]?.quota_usage;
  const total = limit?.data?.[0]?.config?.quota_total;
  log(`연결됨: @${me.username} (${me.account_type || '계정 유형 알 수 없음'}) · 계정 ID ${me.user_id}`);
  if (used !== undefined) log(`24시간 게시 한도: ${used}/${total ?? '?'}건 사용`);
  return { me, used, total };
}

async function publish(id, { dryRun = false, baseUrl = null, log = console.log } = {}) {
  const { run: precheck } = require('./precheck');
  const prepared = await prepare(id, { log });
  const check = precheck(id);
  const names = prepared.jpgs.map((f) => path.basename(f));
  if (!check?.ready) {
    const blockers = (check?.checks || []).filter((c) => c.status === 'fail' || c.status === 'todo').map((c) => `${c.label}: ${c.detail}`);
    if (!dryRun) throw new Error(`게시 전 점검을 통과하지 못했어요\n- ${blockers.join('\n- ')}`);
    log(`[시험] 실제 게시라면 막혀요:\n- ${blockers.join('\n- ')}`);
  }
  if (dryRun) {
    log(`[시험] 게시하지 않아요. 카드 ${names.length}장(${names.join(', ')}) + 캡션 ${prepared.caption.length}자`);
    log('--- 캡션 ---\n' + prepared.caption);
    return { dryRun: true };
  }
  const ig = client();
  const me = await ig.me();
  let server = null;
  let tunnel = null;
  try {
    let urls;
    if (baseUrl) {
      urls = names.map((n) => `${baseUrl.replace(/\/$/, '')}/${n}`);
    } else {
      server = await startFileServer(prepared.jpgs);
      tunnel = await openTunnel(server.port);
      urls = prepared.jpgs.map((f) => tunnel.url + server.pathOf(f));
      log('공개 주소 확인 중…');
      if (!(await waitReachable(urls[0]))) throw new Error('공개 주소에서 이미지가 열리지 않아요 (터널 확인)');
    }
    log(`게시 중: @${me.username} · ${urls.length}장`);
    const r = await ig.publishImages(me.user_id, urls, prepared.caption);
    const record = { product_id: id, published_at: new Date().toISOString(), account: me.username, media_id: r.media_id, permalink: r.permalink, cards: names.length, key: prepared.post.key };
    fs.writeFileSync(path.join(igDir(id), 'published.json'), JSON.stringify(record, null, 2) + '\n');
    if (process.env.CARDNEWS_NO_LOG !== '1') appendEvent(id, 'published', { job_id: null, channel: 'instagram', media_id: r.media_id, permalink: r.permalink, cards: names.length });
    log(`게시 완료: ${r.permalink || r.media_id}`);
    return record;
  } finally {
    tunnel?.close();
    await server?.close();
  }
}

// .env의 IG_ACCESS_TOKEN 줄만 새 값으로 바꿈 (다른 줄은 그대로, 값은 출력하지 않음)
async function refreshToken({ envFile = path.resolve(__dirname, '..', '.env'), log = console.log } = {}) {
  const ig = client();
  const r = await ig.refreshToken();
  if (!r.access_token) throw new IgError('새 토큰을 받지 못했어요');
  const text = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const line = `IG_ACCESS_TOKEN=${r.access_token}`;
  const next = /^\s*(export\s+)?IG_ACCESS_TOKEN\s*=.*$/m.test(text) ? text.replace(/^\s*(export\s+)?IG_ACCESS_TOKEN\s*=.*$/m, line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
  fs.writeFileSync(envFile, next, { mode: 0o600 });
  log(`토큰 갱신 완료: 약 ${Math.round((r.expires_in || 0) / 86400)}일 유효`);
  return { expires_in: r.expires_in };
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const id = rest.find((a) => !a.startsWith('--'));
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : null;
  };
  if (cmd === 'check') return check();
  if (cmd === 'refresh-token') return refreshToken();
  if (!id || !/^[a-z0-9-]+$/.test(id)) throw new Error('사용법: npm run ig -- check | prepare <제품ID> | publish <제품ID> [--dry-run] [--base-url URL] | refresh-token');
  if (cmd === 'prepare') return prepare(id);
  if (cmd === 'publish') return publish(id, { dryRun: rest.includes('--dry-run'), baseUrl: opt('--base-url') });
  throw new Error(`알 수 없는 명령: ${cmd}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`✕ ${e instanceof IgError ? explain(e) : e.message}`);
    process.exit(1);
  });
}

module.exports = { prepare, publish, check, refreshToken, postKey, main };
