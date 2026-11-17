// 작업실 인스타 게시 관리자 (B5, docs/proposals/instagram-web-publish.md · 이슈 #104)
// 수동 게시와 예약 게시를 같은 흐름으로 실행하고, 상태를 제품 폴더에 저장해 새로고침·작업실 재시작 뒤에도 이어 보여줌
//   products/<id>/output/instagram/ig-publish.json  (출력 폴더라 git에 안 들어감, 토큰은 절대 넣지 않음)
//
// 지키는 것
// - 최종 승인 + 게시 전 점검 통과(고쳐야 함·아직 0) + '사람 확인' 항목을 사람이 확인한 것만 게시
// - 최종 승인 시각·카드 문구·PNG·캡션을 하나의 '버전'(해시)으로 묶음. 화면을 연 뒤 바뀌면 다시 점검
// - 같은 버전은 한 번만 게시. 게시는 한 번에 하나(작업실 전체). 게시 결과가 불분명하면 '확인 필요'로 두고
//   인스타에서 실제 게시 여부를 조회하기 전에는 다시 게시하지 않음
// - media_publish 성공 뒤 링크 조회만 실패하면 게시 완료로 기록 (다시 게시하면 중복)
// - 예약은 작업실이 켜져 있을 때 시각이 되면 실행. 꺼져 있어 놓친 예약은 자동 게시하지 않고 사람 확인을 받음
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseInput, readJson } = require('./common');
const { buildCaption } = require('./ig-caption');
const { explain, IgError } = require('./instagram');

const CFG = require('../../config/instagram.json');
const pad = (n) => String(n).padStart(2, '0');
const readJsonIf = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

// 진행 단계 (화면에 그대로 보여줌. 퍼센트·예상 시간은 만들지 않음)
const STEPS = [
  ['preparing', '게시용 이미지(JPEG)·캡션 준비'],
  ['opening_url', '이미지 공개 주소 열기'],
  ['uploading', '인스타에 이미지 올리기'],
  ['carousel', '캐러셀 묶기'],
  ['publishing', '게시'],
  ['confirming', '게시 링크 확인'],
];
const ACTIVE = new Set(['requested', ...STEPS.map(([k]) => k)]);
// media_publish를 보낸 뒤의 단계: 여기서 끊기면 실제로 게시됐을 수도 있음
const MAYBE_PUBLISHED = new Set(['publishing']);

/**
 * @param {object} o
 * @param {string} o.productsDir
 * @param {(id: string, event: string, fields: object) => void} o.appendEvent  제작 기록 (published 한 번만)
 * @param {(id: string) => object|null} o.precheck  게시 전 점검 결과 (scripts/lib/publish-check.js 형태)
 * @param {() => object} o.client  인스타 API 클라이언트 만들기 (scripts/lib/instagram.js createClient). 토큰은 여기 안에서만
 * @param {() => boolean} o.configured  토큰이 설정돼 있는지 (값은 보지 않음)
 * @param {(dir: string, files: string[]) => Promise<string[]>} o.toJpegs  PNG → JPEG (경로 목록 반환)
 * @param {(jpgs: string[], log: (s:string)=>void) => Promise<{ urls: string[], close: () => Promise<void>|void, mode: string }>} o.openPublicUrls
 */
function createPublisher({
  productsDir,
  appendEvent,
  precheck,
  client,
  configured = () => true,
  toJpegs,
  openPublicUrls,
  now = () => Date.now(),
  graceMs = 10 * 60 * 1000,
  minLeadMs = 2 * 60 * 1000,
  maxLeadMs = 30 * 24 * 60 * 60 * 1000,
  tickMs = 30 * 1000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  pollMs = CFG.status_poll.interval_ms,
  pollTimeoutMs = CFG.status_poll.timeout_ms,
}) {
  const dirOf = (id) => path.join(productsDir, id);
  const stateFile = (id) => path.join(dirOf(id), 'output', 'instagram', 'ig-publish.json');
  const iso = () => new Date(now()).toISOString();
  let running = null; // 지금 게시 중인 { id, request_id } (작업실 전체에서 하나)
  let accountCache = null; // { at, value }
  // 게시 전 점검은 검증 스크립트를 돌려 느림 → 같은 버전이면 다시 쓰고, 게시·예약·'다시 점검'에서는 새로
  const checkCache = new Map(); // id → { version, value }
  function checkOf(id, version, { refresh = false } = {}) {
    const hit = checkCache.get(id);
    if (!refresh && hit && hit.version === version) return hit.value;
    const value = precheck(id);
    checkCache.set(id, { version, value });
    return value;
  }

  const load = (id) => readJsonIf(stateFile(id)) || { current: null, published: [], history: [], schedule: null, acks: null };
  const save = (id, s) => writeJsonAtomic(stateFile(id), s);
  function patchCurrent(id, fn) {
    const s = load(id);
    if (!s.current) return s;
    fn(s.current, s);
    s.current.updated_at = iso();
    save(id, s);
    return s;
  }

  // ── 작업실 재시작: 진행 중이던 게시는 이어서 하지 않음 (게시를 보낸 뒤였으면 '확인 필요')
  function recover(ids) {
    for (const id of ids) {
      const s = readJsonIf(stateFile(id));
      if (!s) continue;
      let changed = false;
      if (s.current && ACTIVE.has(s.current.state)) {
        const maybe = MAYBE_PUBLISHED.has(s.current.state);
        s.current.state = maybe ? 'unknown' : 'failed';
        s.current.error = { message: maybe ? '게시 요청을 보낸 뒤 작업실이 꺼졌어요. 실제로 게시됐는지 확인이 필요해요' : '작업실이 꺼져 게시가 중단됐어요. 인스타에는 게시되지 않았어요' };
        s.current.finished_at = iso();
        changed = true;
      }
      if (s.schedule && s.schedule.state === 'running') {
        s.schedule.state = s.current && s.current.state === 'unknown' ? 'unknown' : 'failed';
        changed = true;
      }
      if (changed) save(id, s);
    }
  }

  // ── 버전: 최종 승인 시각 + 카드 문구 + PNG + 캡션
  function productName(id) {
    try {
      return (parseInput(fs.readFileSync(path.join(dirOf(id), 'input.md'), 'utf8')).info['제품명'] || '').split('\n')[0] || null;
    } catch {
      return null;
    }
  }
  function lastFinalApproval(id) {
    let ts = null;
    try {
      for (const line of fs.readFileSync(path.join(dirOf(id), 'log.jsonl'), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const e = JSON.parse(line);
        if (e.event === 'final_approved') ts = e.ts;
      }
    } catch {
      /* 기록 없음 */
    }
    return ts;
  }
  function snapshot(id) {
    const data = readJsonIf(path.join(dirOf(id), 'cards.json'));
    if (!data) return { ok: false, reason: '카드 데이터(cards.json)가 없어요' };
    const cards = (data.cards || []).map((c) => ({ no: c.no, file: `card-${pad(c.no)}.png`, path: path.join(dirOf(id), 'output', 'png', `card-${pad(c.no)}.png`) }));
    const missing = cards.filter((c) => !fs.existsSync(c.path)).map((c) => c.no);
    const caption = buildCaption(data, CFG.caption, { productName: productName(id) }).text;
    const approvedAt = data.stage === 'approved' ? lastFinalApproval(id) : null;
    const h = crypto.createHash('sha1');
    h.update(String(approvedAt));
    h.update(JSON.stringify(data.cards || []));
    for (const c of cards) if (!missing.includes(c.no)) h.update(fs.readFileSync(c.path));
    h.update(caption);
    return { ok: true, data, cards, missing, caption, approved: data.stage === 'approved', approvedAt, version: h.digest('hex').slice(0, 16), legacy: legacyOf(id, cards) };
  }
  // 터미널 명령(npm run ig -- publish)으로 게시한 기록 output/instagram/published.json
  // 그 뒤로 cards.json·카드 PNG가 바뀌지 않았으면 같은 콘텐츠로 보고 다시 게시하지 않음 (보수적으로 판단)
  function legacyOf(id, cards) {
    const rec = readJsonIf(path.join(dirOf(id), 'output', 'instagram', 'published.json'));
    if (!rec || !rec.published_at) return null;
    const at = Date.parse(rec.published_at);
    const files = [path.join(dirOf(id), 'cards.json'), ...cards.map((c) => c.path)];
    const unchanged = files.every((f) => {
      try {
        return fs.statSync(f).mtimeMs <= at;
      } catch {
        return true;
      }
    });
    return { media_id: rec.media_id, permalink: rec.permalink || null, account: rec.account || null, published_at: rec.published_at, same: unchanged };
  }
  // 게시 전 점검의 '게시 캡션' 항목은 caption.txt를 읽음 → 화면을 열 때 같은 캡션을 써 둠
  function writeCaption(id, caption) {
    const file = path.join(dirOf(id), 'output', 'instagram', 'caption.txt');
    const text = caption + '\n';
    if (readText(file) !== text) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
  }
  const readText = (f) => {
    try {
      return fs.readFileSync(f, 'utf8');
    } catch {
      return null;
    }
  };

  // ── 게시할 수 있는지 (막는 이유를 사람이 읽는 말로)
  function blockersOf(id, snap, check, s, { forSchedule = false } = {}) {
    const out = [];
    if (!configured()) out.push('인스타 연결 정보(.env의 IG_ACCESS_TOKEN·IG_USER_ID)가 없어요');
    if (!snap.approved) out.push('최종 승인한 뒤에 게시할 수 있어요');
    if (snap.missing.length) out.push(`카드 이미지가 없어요: ${snap.missing.join('·')}번`);
    if (!check) out.push('게시 전 점검을 하지 못했어요');
    else {
      const bad = check.checks.filter((c) => c.status === 'fail' || c.status === 'todo');
      if (bad.length) out.push(`게시 전 점검에서 고칠 것이 있어요: ${bad.map((c) => c.label).join(', ')}`);
      const warn = check.checks.filter((c) => c.status === 'warn').map((c) => c.id);
      const acked = s.acks && s.acks.version === snap.version ? s.acks.ids : [];
      const left = warn.filter((w) => !acked.includes(w));
      if (left.length) out.push(`'사람 확인' 항목을 확인해 주세요: ${check.checks.filter((c) => left.includes(c.id)).map((c) => c.label).join(', ')}`);
    }
    if (s.published.some((p) => p.version === snap.version)) out.push('이 버전은 이미 게시했어요. 카드를 고쳐 새 버전이 되어야 다시 게시할 수 있어요');
    else if (snap.legacy && snap.legacy.same) out.push(`이 카드는 이미 터미널 명령으로 게시했어요 (${snap.legacy.permalink || snap.legacy.media_id}). 카드를 고쳐 새 버전이 되어야 다시 게시할 수 있어요`);
    if (s.current && ACTIVE.has(s.current.state)) out.push('게시가 진행 중이에요');
    if (s.current && s.current.state === 'unknown') out.push('지난 게시가 실제로 됐는지 먼저 확인해야 해요 (게시 여부 확인)');
    if (running && running.id !== id) out.push('다른 제품을 게시하는 중이에요. 끝난 뒤에 해 주세요');
    if (!forSchedule && s.schedule && s.schedule.state === 'scheduled') out.push('예약이 있어요. 지금 게시하려면 예약을 먼저 취소해 주세요');
    return out;
  }

  function status(id, { refresh = false } = {}) {
    const snap = snapshot(id);
    const s = load(id);
    if (!snap.ok) return { configured: configured(), ready: false, blockers: [snap.reason], state: s };
    if (snap.approved) writeCaption(id, snap.caption);
    const check = snap.approved ? checkOf(id, snap.version, { refresh }) : null;
    const blockers = blockersOf(id, snap, check, s);
    const scheduleBlockers = blockersOf(id, snap, check, s, { forSchedule: true }).filter((b) => !b.startsWith('다른 제품을 게시하는 중'));
    return {
      configured: configured(),
      version: snap.version,
      approved: snap.approved,
      approved_at: snap.approvedAt,
      caption: snap.caption,
      cards: snap.cards.map(({ no, file }) => ({ no, file })),
      check,
      acks: s.acks && s.acks.version === snap.version ? s.acks.ids : [],
      current: s.current,
      published: [...s.published, ...(snap.legacy && !s.published.some((p) => p.media_id === snap.legacy.media_id) ? [{ version: snap.legacy.same ? snap.version : 'cli', media_id: snap.legacy.media_id, permalink: snap.legacy.permalink, account: snap.legacy.account, published_at: snap.legacy.published_at, trigger: 'cli' }] : [])],
      history: s.history.slice(0, 5),
      schedule: s.schedule,
      can_publish: blockers.length === 0,
      can_schedule: scheduleBlockers.length === 0 && !(s.schedule && s.schedule.state === 'scheduled'),
      blockers,
      schedule_blockers: scheduleBlockers,
      steps: STEPS.map(([key, label]) => ({ key, label })),
      limits: { schedule_min_minutes: Math.round(minLeadMs / 60000), schedule_max_days: Math.round(maxLeadMs / 86400000), grace_minutes: Math.round(graceMs / 60000) },
      public_url_mode: process.env.IG_PUBLIC_BASE_URL ? 'base_url' : 'tunnel',
    };
  }

  function acknowledge(id, { version, ids }) {
    const snap = snapshot(id);
    if (!snap.ok || snap.version !== version) throw httpError(409, '화면을 연 뒤 카드나 캡션이 바뀌었어요. 다시 점검해 주세요');
    const check = checkOf(id, snap.version);
    const warn = check ? check.checks.filter((c) => c.status === 'warn').map((c) => c.id) : [];
    const s = load(id);
    s.acks = { version, ids: [...new Set([].concat(ids || []).filter((x) => warn.includes(x)))], at: iso(), by: 'human' };
    save(id, s);
    return status(id);
  }

  // ── 계정 확인 (토큰은 보내지 않고 이름·한도만)
  async function account({ refresh = false } = {}) {
    if (!configured()) return { ok: false, error: '인스타 연결 정보(.env의 IG_ACCESS_TOKEN·IG_USER_ID)가 없어요' };
    if (!refresh && accountCache && now() - accountCache.at < 60000) return accountCache.value;
    let value;
    try {
      const ig = client();
      const me = await ig.me();
      let missing = [];
      if (ig.apiSetup === 'unified') {
        const granted = ((await ig.permissions()).data || []).filter((p) => p.status === 'granted').map((p) => p.permission);
        missing = ['instagram_basic', 'instagram_content_publish'].filter((p) => !granted.includes(p));
      }
      const limit = await ig.publishingLimit(me.user_id);
      value = {
        ok: missing.length === 0,
        username: me.username,
        login: ig.apiSetup === 'unified' ? 'Unified Login' : 'Instagram Login',
        used: limit?.data?.[0]?.quota_usage ?? null,
        total: limit?.data?.[0]?.config?.quota_total ?? null,
        ...(missing.length ? { error: `게시 권한이 부족해요: ${missing.join('·')}` } : {}),
        checked_at: iso(),
      };
    } catch (e) {
      value = { ok: false, error: e instanceof IgError ? explain(e) : e.message, checked_at: iso() };
    }
    accountCache = { at: now(), value };
    return value;
  }

  // ── 게시 실행
  function start(id, { version, trigger = 'manual', scheduleId = null }) {
    const snap = snapshot(id);
    if (!snap.ok) throw httpError(409, snap.reason);
    if (snap.version !== version) throw httpError(409, '화면을 연 뒤 카드나 캡션이 바뀌었어요. 다시 점검한 뒤 게시해 주세요');
    writeCaption(id, snap.caption);
    const check = checkOf(id, snap.version, { refresh: true });
    const s = load(id);
    const blockers = blockersOf(id, snap, check, s, { forSchedule: trigger === 'schedule' });
    if (running) blockers.push(running.id === id ? '게시가 진행 중이에요' : '다른 제품을 게시하는 중이에요');
    if (blockers.length) throw httpError(409, blockers[0]);
    const req = { request_id: crypto.randomBytes(6).toString('hex'), version, trigger, schedule_id: scheduleId, state: 'requested', requested_at: iso(), updated_at: iso(), steps: [], progress: null, account: null, containers: [], creation_id: null, media_id: null, permalink: null, error: null };
    if (s.current && !ACTIVE.has(s.current.state)) s.history = [s.current, ...s.history].slice(0, 10);
    s.current = req;
    save(id, s);
    running = { id, request_id: req.request_id };
    const done = run(id, snap).finally(() => {
      running = null;
    });
    return { request: req, done };
  }

  async function run(id, snap) {
    const mark = (state, extra = {}) => patchCurrent(id, (c) => {
      c.state = state;
      if (STEPS.some(([k]) => k === state)) c.steps.push({ key: state, at: iso() });
      Object.assign(c, extra);
    });
    let pub = null;
    let igId = null;
    let sentPublish = false;
    try {
      mark('preparing');
      const outDir = path.join(dirOf(id), 'output', 'instagram');
      const jpgs = await toJpegs(outDir, snap.cards.map((c) => c.path));
      fs.writeFileSync(path.join(outDir, 'caption.txt'), snap.caption + '\n');
      const ig = client();
      const me = await ig.me();
      igId = me.user_id;
      const limit = await ig.publishingLimit(igId).catch(() => null);
      const used = limit?.data?.[0]?.quota_usage;
      const total = limit?.data?.[0]?.config?.quota_total;
      if (Number.isFinite(used) && Number.isFinite(total) && used >= total) throw new IgError('게시 한도(24시간)에 도달했어요. 한도가 회복된 뒤 다시 시도해 주세요');
      mark('opening_url', { account: me.username });
      pub = await openPublicUrls(jpgs);
      mark('uploading', { progress: { done: 0, total: pub.urls.length }, public_url_mode: pub.mode });
      const containers = [];
      const single = pub.urls.length === 1;
      for (const u of pub.urls) {
        const c = await ig.call('POST', `${igId}/media`, single ? { image_url: u, caption: snap.caption } : { image_url: u, is_carousel_item: true });
        containers.push(c.id);
        mark('uploading', { containers: [...containers], progress: { done: containers.length, total: pub.urls.length } });
      }
      for (const cid of containers) await waitReady(ig, cid);
      let creationId = containers[0];
      if (!single) {
        mark('carousel');
        const car = await ig.call('POST', `${igId}/media`, { media_type: 'CAROUSEL', children: containers.join(','), caption: snap.caption });
        creationId = car.id;
        await waitReady(ig, creationId);
      }
      mark('publishing', { creation_id: creationId });
      sentPublish = true;
      const published = await ig.call('POST', `${igId}/media_publish`, { creation_id: creationId });
      // 여기부터는 실제로 게시됨: 링크 조회가 실패해도 게시 완료로 기록
      mark('confirming', { media_id: published.id });
      let permalink = null;
      try {
        permalink = (await ig.call('GET', published.id, { fields: 'permalink,timestamp' })).permalink || null;
      } catch {
        /* 링크는 나중에 '링크 다시 확인' */
      }
      finishPublished(id, { media_id: published.id, permalink, account: me.username });
    } catch (e) {
      const message = e instanceof IgError ? explain(e) : e.message;
      if (sentPublish) {
        mark('unknown', { error: { message: `게시 요청을 보냈지만 결과를 받지 못했어요 (${message}). 실제로 게시됐는지 확인이 필요해요`, code: e.code ?? null }, finished_at: iso() });
      } else {
        mark('failed', { error: { message, code: e.code ?? null }, finished_at: iso() });
      }
    } finally {
      try {
        await pub?.close();
      } catch {
        /* 이미 닫힘 */
      }
    }
    return load(id).current;
  }

  async function waitReady(ig, containerId) {
    const until = now() + pollTimeoutMs;
    for (;;) {
      const st = await ig.call('GET', containerId, { fields: 'status_code,status' });
      if (st.status_code === 'FINISHED' || st.status_code === 'PUBLISHED') return st;
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new IgError(`인스타가 이미지를 처리하지 못했어요 (${st.status_code}): ${st.status || ''}`);
      if (now() > until) throw new IgError('인스타가 이미지를 처리하는 데 너무 오래 걸려요');
      await sleep(pollMs);
    }
  }

  function finishPublished(id, { media_id, permalink, account: username }) {
    const s = load(id);
    const c = s.current;
    c.state = 'published';
    c.media_id = media_id;
    c.permalink = permalink;
    c.finished_at = iso();
    c.updated_at = c.finished_at;
    if (!s.published.some((p) => p.media_id === media_id)) {
      s.published.unshift({ version: c.version, media_id, permalink, account: username || c.account, published_at: c.finished_at, trigger: c.trigger });
      appendEvent(id, 'published', { job_id: null, channel: 'instagram', media_id, permalink, cards: c.progress?.total ?? null, trigger: c.trigger });
    }
    if (s.schedule && s.schedule.state === 'running' && s.schedule.id === c.schedule_id) s.schedule.state = 'done';
    save(id, s);
  }

  // ── 결과가 불분명할 때: 인스타에서 실제 게시 여부 조회 (조회 전에는 다시 게시 안 함)
  async function verify(id) {
    const s = load(id);
    const c = s.current;
    if (!c) throw httpError(409, '확인할 게시가 없어요');
    const ig = client();
    // 게시는 됐는데 링크만 없을 때
    if (c.state === 'published' && c.media_id && !c.permalink) {
      const info = await ig.call('GET', c.media_id, { fields: 'permalink' });
      patchCurrent(id, (cur, st) => {
        cur.permalink = info.permalink || null;
        const p = st.published.find((x) => x.media_id === cur.media_id);
        if (p) p.permalink = cur.permalink;
      });
      return status(id);
    }
    if (c.state !== 'unknown') throw httpError(409, '확인이 필요한 게시가 없어요');
    const me = await ig.me();
    let found = null;
    if (c.creation_id) {
      const st = await ig.call('GET', c.creation_id, { fields: 'status_code' }).catch(() => null);
      if (st && st.status_code === 'PUBLISHED') found = { id: null };
    }
    // 최근 게시물 중 요청 뒤에 올라온 같은 캡션
    const snapCaption = (load(id).current && snapshot(id).caption) || '';
    const head = snapCaption.split('\n')[0];
    const recent = await ig.call('GET', `${me.user_id}/media`, { fields: 'id,caption,permalink,timestamp', limit: 10 });
    const since = Date.parse(c.requested_at) - 60000;
    const match = (recent.data || []).find((m) => Date.parse(m.timestamp) >= since && String(m.caption || '').startsWith(head));
    if (match) found = { id: match.id, permalink: match.permalink || null };
    if (found && found.id) {
      finishPublished(id, { media_id: found.id, permalink: found.permalink, account: me.username });
    } else if (found) {
      patchCurrent(id, (cur) => {
        cur.error = { message: '인스타에는 게시된 것으로 보이지만 게시물을 찾지 못했어요. 인스타 앱에서 확인해 주세요' };
      });
    } else {
      patchCurrent(id, (cur, st) => {
        cur.state = 'failed';
        cur.error = { message: '인스타에서 게시물을 찾지 못했어요. 게시되지 않았으니 다시 게시할 수 있어요' };
        if (st.schedule && st.schedule.state === 'unknown') st.schedule.state = 'failed';
      });
    }
    return status(id);
  }

  // ── 예약
  function schedule(id, { version, at }) {
    const t = Date.parse(at);
    if (!Number.isFinite(t)) throw httpError(400, '예약 시각이 올바르지 않아요');
    if (t < now() + minLeadMs) throw httpError(400, `예약은 지금부터 ${Math.round(minLeadMs / 60000)}분 뒤 이후로 정해 주세요`);
    if (t > now() + maxLeadMs) throw httpError(400, `예약은 ${Math.round(maxLeadMs / 86400000)}일 안으로 정해 주세요`);
    const snap = snapshot(id);
    if (!snap.ok || snap.version !== version) throw httpError(409, '화면을 연 뒤 카드나 캡션이 바뀌었어요. 다시 점검해 주세요');
    const s = load(id);
    if (s.schedule && s.schedule.state === 'scheduled') throw httpError(409, '이미 예약이 있어요. 바꾸려면 예약을 취소한 뒤 다시 정해 주세요');
    writeCaption(id, snap.caption);
    const blockers = blockersOf(id, snap, checkOf(id, snap.version, { refresh: true }), s, { forSchedule: true }).filter((b) => !b.startsWith('다른 제품을 게시하는 중'));
    if (blockers.length) throw httpError(409, blockers[0]);
    s.schedule = { id: crypto.randomBytes(6).toString('hex'), at: new Date(t).toISOString(), version, state: 'scheduled', created_at: iso(), reason: null };
    save(id, s);
    return status(id);
  }
  function cancelSchedule(id) {
    const s = load(id);
    if (!s.schedule || !['scheduled', 'missed', 'blocked'].includes(s.schedule.state)) throw httpError(409, '취소할 예약이 없어요');
    s.schedule.state = 'canceled';
    s.schedule.canceled_at = iso();
    save(id, s);
    return status(id);
  }

  // 예약 확인: 시각이 된 예약을 실행. 너무 늦었으면(작업실이 꺼져 있었음) 놓침으로 두고 사람 확인
  async function tick(ids) {
    const started = [];
    for (const id of ids) {
      const s = readJsonIf(stateFile(id));
      const sc = s && s.schedule;
      if (!sc || sc.state !== 'scheduled') continue;
      const due = Date.parse(sc.at);
      if (now() < due) continue;
      const setSchedule = (patch) => {
        const st = load(id);
        if (st.schedule && st.schedule.id === sc.id) {
          Object.assign(st.schedule, patch);
          save(id, st);
        }
      };
      if (now() - due > graceMs) {
        setSchedule({ state: 'missed', reason: `예약 시각(${new Date(due).toLocaleString('ko-KR')})에 작업실이 꺼져 있었어요. 자동으로 게시하지 않았어요` });
        continue;
      }
      if (running) continue; // 다른 게시가 끝나면 다음 확인 때 실행 (유예 시간 안)
      try {
        setSchedule({ state: 'running', started_at: iso() });
        const { done } = start(id, { version: sc.version, trigger: 'schedule', scheduleId: sc.id });
        started.push(done.then((cur) => {
          if (cur && cur.state !== 'published') setSchedule({ state: cur.state === 'unknown' ? 'unknown' : 'failed', reason: cur.error?.message || null });
          return cur;
        }));
      } catch (e) {
        setSchedule({ state: 'blocked', reason: e.message });
      }
    }
    return Promise.all(started);
  }

  let timer = null;
  function startTimer(listIds) {
    if (timer) return;
    timer = setInterval(() => {
      tick(listIds()).catch(() => {});
    }, tickMs);
    if (timer.unref) timer.unref();
  }
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  /** 목록 화면용 요약 (파일만 읽음) */
  function summary(id) {
    const s = readJsonIf(stateFile(id));
    if (!s) return null;
    return {
      state: s.current ? s.current.state : null,
      published: s.published.length > 0,
      permalink: s.published[0]?.permalink || null,
      scheduled_at: s.schedule && s.schedule.state === 'scheduled' ? s.schedule.at : null,
      schedule_state: s.schedule ? s.schedule.state : null,
    };
  }

  return { status, acknowledge, account, start, verify, schedule, cancelSchedule, tick, recover, startTimer, stopTimer, summary, running: () => running, stateFile };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = { createPublisher, STEPS };
