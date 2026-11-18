// 인스타그램 연동 (docs/proposals/ax-plan.md B단계)
//   npm run ig -- check                     토큰으로 계정·게시 한도 확인 (토큰은 출력하지 않음)
//   npm run ig -- caption <제품ID> [--force] 게시 글 작성·근거 검토 (게시하지 않아요)
//   npm run ig -- prepare <제품ID>          캡션(output/instagram/caption.txt) + JPEG(AI 활용 XMP 유지)
//   npm run ig -- publish <제품ID> [--dry-run] [--version HASH --confirm] [--base-url <https 주소>]
//   npm run ig -- verify <제품ID>           공통 기록의 불분명한 게시·링크를 조회해요
//        게시 전 점검이 '게시 가능'인 것만. 공개 주소는 cloudflared 빠른 터널(기본) 또는 --base-url(이미 파일을 공개해 둔 서버)
//   npm run ig -- refresh-token             Instagram Login 토큰 갱신 → .env의 IG_ACCESS_TOKEN 교체
// .env의 IG_API_SETUP=unified는 Unified Login, 생략하면 기존 Instagram Login. Unified Login은 IG_USER_ID 필수.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { paths } = require('./lib/common');
const { readEnvKeys } = require('./lib/env-file');
const { createClient, explain, IgError } = require('./lib/instagram');
const { resolveCaption } = require('./lib/ig-caption');
const { generateCaption } = require('./lib/ig-caption-writer');
const { toJpegs } = require('./lib/ig-media');
const { createCliPublisher, publishWithManager } = require('./lib/ig-cli-publisher');

const cfg = require('../config/instagram.json');
const igDir = (id) => paths.product(id, 'output', 'instagram');
const pad = (n) => String(n).padStart(2, '0');

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

async function captionOf(id, { force = false, ask } = {}) {
  return generateCaption({ productDir: paths.product(id), data: readCards(id), inputText: fs.readFileSync(paths.product(id, 'input.md'), 'utf8'), cfg: cfg.caption, caution: require('../config/caution-expressions.json'), force, ask });
}

async function prepare(id, { log = console.log, generate = true, ask } = {}) {
  const data = readCards(id);
  const pngs = data.cards.map((c) => paths.product(id, 'output', 'png', `card-${pad(c.no)}.png`));
  const missing = pngs.filter((f) => !fs.existsSync(f));
  if (missing.length) throw new Error(`출력 PNG가 없어요: ${missing.map((f) => path.basename(f)).join(', ')} (npm run render 먼저)`);
  const caption = generate ? await captionOf(id, { ask }) : resolveCaption(data, cfg.caption, { productDir: paths.product(id), caution: require('../config/caution-expressions.json') });
  if (caption.errors.length) throw new Error(caption.errors.join(' · '));
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
  const { IG_ACCESS_TOKEN, IG_USER_ID, IG_API_SETUP } = readEnvKeys(['IG_ACCESS_TOKEN', 'IG_USER_ID', 'IG_API_SETUP']);
  return createClient({ token: IG_ACCESS_TOKEN, userId: IG_USER_ID, apiSetup: IG_API_SETUP || 'instagram' });
}

async function check({ log = console.log, ig = client() } = {}) {
  const me = await ig.me();
  let granted = null;
  if (ig.apiSetup === 'unified') {
    const result = await ig.permissions();
    granted = (result.data || []).filter((p) => p.status === 'granted').map((p) => p.permission);
    const missing = ['instagram_basic', 'instagram_content_publish'].filter((p) => !granted.includes(p));
    if (missing.length) throw new IgError(`게시 권한이 부족해요: ${missing.join('·')}. 앱에서 해당 권한을 승인하고 토큰을 다시 발급해 주세요`);
  }
  const limit = await ig.publishingLimit(me.user_id);
  const used = limit?.data?.[0]?.quota_usage;
  const total = limit?.data?.[0]?.config?.quota_total;
  log(`연결됨: @${me.username} (${ig.apiSetup === 'unified' ? 'Unified Login' : me.account_type || 'Instagram Login'}) · 계정 ID ${me.user_id}`);
  if (granted) log('게시 권한 확인: instagram_basic·instagram_content_publish');
  if (used !== undefined) log(`24시간 게시 한도: ${used}/${total ?? '?'}건 사용`);
  return { me, used, total, permissions: granted };
}

async function publish(id, { ig = null, baseUrl = null, publisher = null, ...options } = {}) {
  return publishWithManager(id, { ...options, publisher: publisher || createCliPublisher({ ig, baseUrl }) });
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
  if (!id || !/^[a-z0-9-]+$/.test(id)) throw new Error('사용법: npm run ig -- check | caption <제품ID> [--force] | prepare <제품ID> | publish <제품ID> [--dry-run] [--version HASH --confirm] [--base-url URL] | refresh-token');
  if (cmd === 'caption') {
    const result = await captionOf(id, { force: rest.includes('--force') });
    console.log(`게시 글을 작성했어요 (${result.chars}자). 게시 전에 내용을 확인해 주세요.\n\n${result.text}`);
    return result;
  }
  if (cmd === 'prepare') return prepare(id);
  if (cmd === 'publish') return publish(id, { dryRun: rest.includes('--dry-run'), baseUrl: opt('--base-url'), version: opt('--version'), confirm: rest.includes('--confirm') });
  if (cmd === 'verify') {
    const publisher = createCliPublisher();
    publisher.recover([id]);
    const result = await publisher.verify(id);
    console.log(JSON.stringify({ state: result.current?.state, permalink: result.current?.permalink, message: result.current?.error?.message || null }, null, 2));
    return result;
  }
  throw new Error(`알 수 없는 명령: ${cmd}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`✕ ${e instanceof IgError ? explain(e) : e.message}`);
    process.exit(1);
  });
}

module.exports = { prepare, captionOf, publish, check, refreshToken, postKey, main };
