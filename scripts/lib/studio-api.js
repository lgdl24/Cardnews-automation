// 로컬 제작 API (웹 모드): 웹 제작 화면이 부르는 HTTP API. 개발 서버(npm run studio = vite dev)에서만 켜짐
// 제품 만들기 → 입력 확인 → 구성안 작업 → 승인/수정 요청 → 문구·출력 작업 → 최종 승인/수정 요청 → 결과 보기 웹에 내보내기
// 실제 제작은 작업 실행기(job-runner.js)가 내 컴퓨터의 claude -p로 실행
//
// 보안: 이 컴퓨터(localhost)에서 온 요청만 받음 · 바꾸는 요청은 X-Studio 헤더 필수(다른 사이트의 폼 전송 차단)
//       제품ID·파일명 형식 검사 · 이미지 크기·형식 제한 · 작업은 한 번에 하나 (나머지는 대기열에서 차례로)
//       피그마 플러그인용 /api/studio/figma/* 는 다른 출처(피그마)에서 오므로 X-Studio 대신 '연결 코드'(서버를 켤 때마다 새로 만듦)로 막음
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const aiCards = require('./ai-cards');
const brand = require('./brand');
const { extractInput } = require('./extract-input');
const figmaPush = require('../figma-push');
const { ROOT, readJson, parseInput, resolveDesign, designCatalog, moodInputOf } = require('./common');
const { loadForm, renderInputMd } = require('./input-form');
const { summarize } = require('./analysis');
const jobRunner = require('./job-runner');
const { compact: compactCard } = require('../figma-export');

const API = '/api/studio';
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FILE_RE = /^[A-Za-z0-9가-힣._-]+\.(png|jpe?g)$/i;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = 40 * 1024 * 1024;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const FIGMA_API = `${API}/figma`;
const CARD_FILE_RE = /^card-\d{2}$/;
const UPLOAD_RE = /^[a-z0-9-]+__c\d{2}__L\d+$/;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, '요청이 너무 커요'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'JSON 형식이 아니에요'));
      }
    });
    req.on('error', reject);
  });
}

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

const readJsonSafe = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

function readEventsFrom(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean).sort((a, b) => a.ts.localeCompare(b.ts));
}

/**
 * @param {object} [o]
 * @param {string} [o.root]         저장소 루트 (규칙·스크립트)
 * @param {string} [o.productsDir]  제품 폴더들 (기본 <root>/products)
 * @param {string} [o.bin]          claude 실행 파일 (기본 jobRunner.defaultClaudeBin())
 * @param {Function} [o.runJob]     작업 실행 함수 (테스트용 교체)
 * @param {Function} [o.aiCardFn]   AI 디자인 카드 실행 함수 (테스트용 교체): (id, { card, onLine }) => Promise<{ ok, code }>
 */
function createStudio({
  root = ROOT,
  productsDir = path.join(root, 'products'),
  bin = jobRunner.defaultClaudeBin(),
  runJob = jobRunner.runJob,
  reportsDir = path.join(root, '.studio', 'jobs'),
  exportConfigFile = path.join(root, 'config', 'export.json'),
  webIndexFile = path.join(root, 'web', 'public', 'data', 'index.json'),
  exportFn,
  figmaExportFn,
  renderFn,
  aiCardFn,
  // 무드 '브랜드': 구성안 작업 전 브랜드 페이지 스냅샷, 문구·출력 작업 뒤 카드별 GPT 배경(A안, 글자는 코드). CARDNEWS_AI_BG=off 로 자동 배경 끔
  brandSnapshotFn,
  aiBgFn,
  aiBgAuto = process.env.CARDNEWS_AI_BG !== 'off',
  // 자료(PDF·이미지·글)로 입력 칸 채우기: claude -p가 자료만 읽고 입력 초안을 돌려줌 (사람이 확인한 뒤 저장)
  extractFn,
  // 문구·출력 작업이 끝나면 첫·마지막 카드를 GPT 이미지로 자동으로 만듦 (CARDNEWS_AI_CARD=off 로 끔)
  aiAuto = process.env.CARDNEWS_AI_CARD !== 'off',
  // '피그마에서 편집'을 누르면 로컬 Claude Code의 피그마 연결로 카드를 새 페이지에 바로 넣음 (CARDNEWS_FIGMA_PUSH=off 로 끔 → 플러그인으로 가져오기)
  figmaPushFn,
  figmaAutoPush = process.env.CARDNEWS_FIGMA_PUSH !== 'off',
  figmaCode = crypto.randomBytes(3).toString('hex').toUpperCase(),
  figmaConfigFile = path.join(root, 'config', 'figma.json'),
} = {}) {
  const productDir = (id) => path.join(productsDir, id);
  const logFile = (id) => path.join(productDir(id), 'log.jsonl');
  let current = null; // { product_id, kind, job_id, status: 'running'|'done', started_at, progress: [], summary }
  // 대기열: 작업 중에 다른 제품 작업을 누르면 거절하지 않고 차례를 기다림. 제품마다 하나만, 서버를 끄면 사라짐
  const queue = []; // { product_id, kind, revision, queued_at, beforeStart }
  const lastJobs = new Map(); // 제품ID → 마지막 작업 요약
  const figmaRuns = new Map(); // 제품ID → { running, page_name, page_id, ok, error, started_at, finished_at, lines }
  const aiRuns = new Map(); // 제품ID → { card, auto, started_at, finished_at, running, ok, lines: [] }
  const bgRuns = new Map(); // 제품ID → AI 배경 실행 상태 (aiRuns와 같은 모양)
  const isRunning = () => Boolean(current && current.status === 'running');
  const queueIndex = (id) => queue.findIndex((q) => q.product_id === id);
  // 이 제품의 작업 상태: 'running' | 'queued' | null
  const jobStateOf = (id) => (isRunning() && current.product_id === id ? 'running' : queueIndex(id) >= 0 ? 'queued' : null);
  const nameOf = (id) => {
    try {
      return (parseInput(fs.readFileSync(path.join(productDir(id), 'input.md'), 'utf8')).info['제품명'] || id).split('\n')[0];
    } catch {
      return id;
    }
  };
  let claudeInfo = null;

  // 스크립트(check·validate·export)는 이 제품 폴더를 보도록 경로를 넘겨 별도 프로세스로 실행
  const scriptEnv = (extra = {}) => ({ ...process.env, CARDNEWS_PRODUCTS_DIR: productsDir, ...extra });

  function requireId(id) {
    if (!ID_RE.test(id || '')) throw new HttpError(400, '제품ID는 영문 소문자·숫자·하이픈만 쓸 수 있어요');
    return id;
  }
  function requireProduct(id) {
    requireId(id);
    if (!fs.existsSync(path.join(productDir(id), 'input.md'))) throw new HttpError(404, `제품이 없어요: ${id}`);
    return id;
  }
  const appendEvent = (id, event, fields = {}) => {
    let version = null;
    try {
      version = readJson(path.join(root, 'config', 'skill-version.json')).version;
    } catch {
      /* 없음 */
    }
    const entry = { ts: new Date().toISOString(), event, project_id: id, job_id: null, skill_version: version, ...fields };
    fs.appendFileSync(logFile(id), JSON.stringify(entry) + '\n');
    return entry;
  };

  // 같은 파일이면 다시 검사하지 않음 (진행 중 화면이 자주 새로 고침)
  const cache = new Map();
  const stamp = (...files) => files.map((f) => {
    try {
      const st = fs.statSync(f);
      return st.isDirectory() ? fs.readdirSync(f).map((x) => `${x}:${fs.statSync(path.join(f, x)).mtimeMs}`).join(',') : st.mtimeMs;
    } catch {
      return 'none';
    }
  }).join('|');
  function cached(key, version, fn) {
    const hit = cache.get(key);
    if (hit && hit.version === version) return hit.value;
    const value = fn();
    cache.set(key, { version, value });
    return value;
  }

  // 입력 확인: check-input의 결과를 그대로
  function checkInput(id) {
    return cached(`check:${id}`, stamp(path.join(productDir(id), 'input.md'), path.join(productDir(id), 'images')), () => checkInputNow(id));
  }
  function checkInputNow(id) {
    const r = spawnSync(process.execPath, ['-e', `
      const { checkInput } = require(${JSON.stringify(path.join(root, 'scripts', 'check-input.js'))});
      const r = checkInput(${JSON.stringify(id)});
      process.stdout.write(JSON.stringify({ errors: r.errors, warnings: r.warnings, cautions: r.cautions }));
    `], { encoding: 'utf8', env: scriptEnv({ CARDNEWS_NO_LOG: '1' }) });
    return readJsonSafeStr(r.stdout) || { errors: [{ code: 'CHECK_FAILED', where: 'check', message: (r.stderr || '').slice(0, 300) }], warnings: [], cautions: [] };
  }
  function validateReport(id, { log = false } = {}) {
    if (log) return validateNow(id, { log });
    return cached(`validate:${id}`, stamp(path.join(productDir(id), 'cards.json'), path.join(productDir(id), 'input.md')), () => validateNow(id, {}));
  }
  function validateNow(id, { log = false } = {}) {
    const r = spawnSync(process.execPath, ['-e', `
      const { validate, quality } = require(${JSON.stringify(path.join(root, 'scripts', 'validate.js'))});
      const result = validate(${JSON.stringify(id)});
      const q = quality(result);
      process.stdout.write(JSON.stringify({ errors: result.report.errors, warnings: result.report.warnings, cautions: result.report.cautions, quality: q }));
    `], { encoding: 'utf8', env: scriptEnv({ CARDNEWS_NO_LOG: '1' }) });
    if (log) spawnSync(process.execPath, [path.join(root, 'scripts', 'validate.js'), id], { encoding: 'utf8', env: scriptEnv() });
    return readJsonSafeStr(r.stdout);
  }

  function claudeStatus() {
    if (claudeInfo) return claudeInfo;
    const v = spawnSync(...jobRunner.claudeCommand(bin, ['-v']), { encoding: 'utf8', timeout: 10000 });
    if (v.error || v.status !== 0) {
      claudeInfo = { installed: false, version: null, logged_in: null };
      return claudeInfo;
    }
    const a = spawnSync(...jobRunner.claudeCommand(bin, ['auth', 'status']), { encoding: 'utf8', timeout: 10000 });
    claudeInfo = { installed: true, version: (v.stdout || '').trim().split(/\s/)[0] || null, logged_in: a.error ? null : a.status === 0 };
    return claudeInfo;
  }

  function productSummary(id) {
    const dir = productDir(id);
    const input = parseInput(fs.readFileSync(path.join(dir, 'input.md'), 'utf8'));
    const cards = readJsonSafe(path.join(dir, 'cards.json'));
    const events = readEventsFrom(logFile(id));
    const last = events[events.length - 1];
    return {
      id,
      name: (input.info['제품명'] || id).split('\n')[0],
      brand: input.info['브랜드'] || null,
      stage: cards ? cards.stage : 'input',
      updated_at: last ? last.ts : fs.statSync(path.join(dir, 'input.md')).mtime.toISOString(),
      running: jobStateOf(id) === 'running',
      queued: jobStateOf(id) === 'queued',
      queue_position: queueIndex(id) >= 0 ? queueIndex(id) + 1 : null,
    };
  }

  // 디자인 묶음 (#74): 지금 쓰는 묶음과 정한 곳, 구성안에서 고른 것, 목록
  const templatesConfig = () => readJson(path.join(root, 'config', 'templates.json'));
  function designInfo(input, cards) {
    const config = templatesConfig();
    const used = resolveDesign({ input, data: cards, config });
    return {
      id: used.id,
      source: used.source,
      auto: moodInputOf(input).value === '자동 추천',
      selected: (cards && cards.design) || null,
      catalog: designCatalog(config).map(({ id, name, summary, fits, avoid, needs, version, colorMode }) => ({ id, name, summary, fits, avoid, needs, version, color_mode: colorMode })),
    };
  }

  // 지금 할 수 있는 다음 행동 (화면 버튼과 API 검사가 같은 기준을 씀)
  // running: 이 제품이 작업 중이거나 대기 중 (다른 제품 작업과는 상관없음 — 다른 제품이 돌면 누른 작업은 대기열로)
  function nextActions(id, { cards, events, check }) {
    const state = jobStateOf(id);
    const running = state !== null;
    const lastFinish = [...events].reverse().find((e) => e.event === 'job_finished');
    const stage = cards ? cards.stage : 'input';
    const planApproved = events.some((e) => e.event === 'plan_approved');
    const lastPlanApproval = [...events].reverse().find((e) => e.event === 'plan_approved');
    const lastPlanJob = [...events].reverse().find((e) => e.event === 'job_finished' && e.ok && (e.kind === 'plan' || (e.kind === 'revise' && stage === 'plan')));
    const approvedCurrentPlan = planApproved && lastPlanApproval && (!lastPlanJob || lastPlanApproval.ts > lastPlanJob.ts);
    const lastOk = lastFinish ? lastFinish.ok : null;
    // AI 디자인 카드를 만드는 중이면 최종 카드(1·마지막)가 아직 바뀌는 중 → 승인·내보내기·피그마는 기다림
    const aiBusy = Boolean((aiRuns.get(id) || {}).running) || Boolean((bgRuns.get(id) || {}).running);
    return {
      ai_busy: aiBusy,
      running,
      job_state: state,
      // 지금 작업을 누르면 앞에 기다릴 작업 수 (0이면 바로 시작)
      wait_ahead: state ? 0 : (isRunning() ? 1 : 0) + queue.length,
      last_job_ok: lastOk,
      can_edit_input: !running && !cards,
      can_plan: !running && !cards && check.errors.length === 0,
      can_approve_plan: !running && stage === 'plan' && !approvedCurrentPlan,
      can_revise_plan: !running && stage === 'plan' && !approvedCurrentPlan,
      can_select_design: !running && stage === 'plan' && !approvedCurrentPlan,
      can_copy: !running && stage === 'plan' && Boolean(approvedCurrentPlan),
      can_approve_final: !running && !aiBusy && stage === 'copy',
      can_revise_final: !running && !aiBusy && stage === 'copy',
      can_export: !running && !aiBusy && stage === 'approved',
      can_render: !running && (stage === 'copy' || stage === 'approved'),
      can_ai_card: !running && (stage === 'copy' || stage === 'approved') && !(aiRuns.get(id) || {}).running,
      can_ai_bg: !running && (stage === 'copy' || stage === 'approved') && !(bgRuns.get(id) || {}).running,
    };
  }

  function productDetail(id) {
    const dir = productDir(id);
    const raw = fs.readFileSync(path.join(dir, 'input.md'), 'utf8');
    const input = parseInput(raw);
    const cards = readJsonSafe(path.join(dir, 'cards.json'));
    const events = readEventsFrom(logFile(id));
    const check = checkInput(id);
    const validation = cards ? validateReport(id) : null;
    const pngDir = path.join(dir, 'output', 'png');
    const pngs = fs.existsSync(pngDir)
      ? fs.readdirSync(pngDir).filter((f) => /^card-\d{2}\.png$/.test(f)).sort().map((f) => ({ file: f, v: Math.round(fs.statSync(path.join(pngDir, f)).mtimeMs) }))
      : [];
    const exportCfg = readJsonSafe(exportConfigFile);
    const webIndex = readJsonSafe(webIndexFile);
    const qi = queueIndex(id);
    const job = qi >= 0
      ? publicQueued(queue[qi], qi)
      : current && current.product_id === id ? publicJob(current) : lastJobs.get(id) || lastReport(id);
    return {
      ...productSummary(id),
      input: { values: inputValues(input), images: input.images, card_count: input.cardCount },
      check,
      cards,
      validation,
      pngs,
      timeline: summarize(events, { cardCount: cards && cards.cards ? cards.cards.length : null }),
      events: events.map(({ ts, event, job_id, kind, ok, error_code, check: c, error_codes, cards_with_errors, stage, cards: cs, types, memo, approved_by, rendered_cards, design, from }) => ({
        ts, event, job_id, kind, ok, error_code, check: c, error_codes, cards_with_errors, stage, cards: cs, types, memo, approved_by, rendered_cards, design, from,
      })),
      design: designInfo(input, cards),
      job,
      export: {
        listed: Boolean(exportCfg && exportCfg.projects.some((p) => p.id === id)),
        exported_at: webIndex && webIndex.projects.some((p) => p.id === id) ? webIndex.exported_at : null,
      },
      actions: nextActions(id, { cards, events, check }),
      figma: figmaInfo(id),
      ai_card: isBrand(input, cards) ? null : aiCardInfo(id),
      ai_bg: isBrand(input, cards) ? aiBgInfo(id) : null,
      brand_page: brandInfo(input, dir),
    };
  }

  function inputValues(input) {
    const form = loadForm();
    const values = {};
    for (const g of form.groups) {
      const src = input.groups[g.title] || {};
      for (const f of g.fields) {
        if (f.type === 'images') continue;
        const v = src[f.key] || '';
        values[f.key] = f.type === 'list' ? v.split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean) : v;
      }
    }
    return values;
  }

  function lastReport(id) {
    if (!fs.existsSync(reportsDir)) return null;
    const files = fs.readdirSync(reportsDir).filter((f) => f.endsWith('.json')).sort().reverse();
    for (const f of files) {
      const r = readJsonSafe(path.join(reportsDir, f));
      if (r && r.product_id === id) return { ...publicSummary(r), status: 'done' };
    }
    return null;
  }

  const publicSummary = (s) => ({
    job_id: s.job_id, kind: s.kind, ok: s.ok, error_code: s.error_code, crash: s.crash, report: s.report, verify: s.verify,
    started_at: s.started_at, finished_at: s.finished_at, progress: (s.progress || []).slice(-80), result: s.result, revision: s.revision,
  });
  const publicJob = (j) => (j.status === 'done' && j.summary
    ? { ...publicSummary(j.summary), status: 'done', product_id: j.product_id }
    : { status: j.status, product_id: j.product_id, kind: j.kind, job_id: j.job_id, started_at: j.started_at, progress: j.progress.slice(-80), revision: j.revision });

  const publicQueued = (q, i) => ({
    status: 'queued', product_id: q.product_id, kind: q.kind, job_id: null, queued_at: q.queued_at, started_at: q.queued_at, progress: [], revision: q.revision,
    position: i + 1, ahead: current && current.status === 'running' ? { product_id: current.product_id, name: nameOf(current.product_id), kind: current.kind } : null,
  });
  // 작업실 전체 작업 (화면 위 '진행 중 작업' 띠)
  const jobsOverview = () => ({
    running: isRunning() ? { product_id: current.product_id, name: nameOf(current.product_id), kind: current.kind, started_at: current.started_at } : null,
    queue: queue.map((q, i) => ({ product_id: q.product_id, name: nameOf(q.product_id), kind: q.kind, queued_at: q.queued_at, position: i + 1 })),
  });

  // ── 작업 시작 (응답은 바로, 작업은 뒤에서). 다른 제품 작업이 돌고 있으면 대기열에 넣음
  //    beforeStart: 실제로 시작할 때 남길 기록 (수정 요청은 대기를 취소하면 기록하지 않음)
  function startJob(id, kind, revision = null, { beforeStart = null } = {}) {
    if (jobStateOf(id)) throw new HttpError(409, '이 제품은 이미 작업 중이거나 차례를 기다리고 있어요');
    const info = claudeStatus();
    if (!info.installed) throw new HttpError(503, 'Claude Code(claude)를 찾을 수 없어요. 설치하고 로그인한 뒤 다시 시도하세요');
    if (isRunning()) {
      const q = { product_id: id, kind, revision, queued_at: new Date().toISOString(), beforeStart };
      queue.push(q);
      return publicQueued(q, queue.length - 1);
    }
    return runNow(id, kind, revision, beforeStart);
  }

  function cancelQueued(id) {
    const i = queueIndex(id);
    if (i < 0) throw new HttpError(409, '대기 중인 작업이 없어요');
    queue.splice(i, 1);
  }

  // 앞 작업이 끝나면 대기열 맨 앞 작업 시작. 시작하다 실패하면 그 작업은 실패로 남기고 다음으로
  function startNext() {
    while (!isRunning() && queue.length) {
      const q = queue.shift();
      try {
        runNow(q.product_id, q.kind, q.revision, q.beforeStart);
      } catch (e) {
        lastJobs.set(q.product_id, { job_id: null, kind: q.kind, ok: false, error_code: 'RUN_ERROR', crash: e.message, report: null, verify: null, started_at: q.queued_at, finished_at: new Date().toISOString(), progress: [], revision: q.revision, status: 'done' });
      }
    }
  }

  function runNow(id, kind, revision, beforeStart) {
    if (beforeStart) beforeStart();
    const job = { status: 'running', product_id: id, kind, job_id: null, started_at: new Date().toISOString(), progress: [], revision };
    current = job;
    const note = (text) => job.progress.push({ ts: new Date().toISOString(), type: 'text', text });
    // 구성안 작업 전에 브랜드 페이지 스냅샷 (작업 실행기는 웹에 접속하지 않고 저장된 파일만 읽음)
    Promise.resolve(kind === 'plan' ? prepareBrand(id, note) : null).then(() => runJob({
      kind,
      productId: id,
      productDir: productDir(id),
      mode: 'web',
      revision,
      bin,
      root,
      reportsDir,
      onStart: (s) => {
        job.job_id = s.job_id;
      },
      onProgress: (p) => {
        job.progress.push(p);
      },
    }))
      .then((summary) => {
        job.status = 'done';
        job.summary = summary;
        lastJobs.set(id, { ...publicSummary(summary), status: 'done' });
        if (summary && summary.ok && (kind === 'copy' || kind === 'revise')) {
          if (isBrand(readInputOf(id), readJsonSafe(path.join(productDir(id), 'cards.json')))) autoAiBg(id);
          else autoAiCard(id);
        }
      })
      .catch((e) => {
        job.status = 'done';
        job.summary = { job_id: job.job_id, kind, ok: false, error_code: 'RUN_ERROR', crash: e.message, report: null, verify: null, progress: job.progress };
        lastJobs.set(id, { ...publicSummary(job.summary), status: 'done' });
      })
      .finally(startNext);
    return publicJob(job);
  }

  // ── 제품 만들기·입력 수정
  function writeInput(id, body, { create }) {
    const dir = productDir(id);
    const form = loadForm();
    const values = {};
    for (const g of form.groups) {
      for (const f of g.fields) {
        if (f.type === 'images') continue;
        const v = body.values ? body.values[f.key] : undefined;
        if (v === undefined || v === null) continue;
        if (f.type === 'list') values[f.key] = [].concat(v).map((x) => String(x).trim()).filter(Boolean);
        else values[f.key] = String(v).trim();
      }
    }
    const images = [].concat(body.images || []);
    const prepared = images.map((img) => {
      const file = String(img.file || '').trim();
      if (!FILE_RE.test(file)) throw new HttpError(400, `이미지 파일명은 영문·숫자·한글과 .png·.jpg만 쓸 수 있어요: ${file}`);
      let data = null;
      if (img.data) {
        data = Buffer.from(String(img.data).replace(/^data:[^,]*,/, ''), 'base64');
        if (data.length > MAX_IMAGE_BYTES) throw new HttpError(413, `이미지는 10MB 이하만 올릴 수 있어요: ${file}`);
        const isPng = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const isJpg = data[0] === 0xff && data[1] === 0xd8;
        if (!isPng && !isJpg) throw new HttpError(400, `PNG·JPG 이미지가 아니에요: ${file}`);
      } else if (!fs.existsSync(path.join(dir, 'images', file))) {
        throw new HttpError(400, `이미지 파일을 올려 주세요: ${file}`);
      }
      return { file, desc: String(img.desc || '').trim(), source: String(img.source || '').trim(), usage: String(img.usage || '').trim(), kind: String(img.kind || '제품').trim(), data };
    });
    if (create) fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
    for (const p of prepared) if (p.data) fs.writeFileSync(path.join(dir, 'images', p.file), p.data);
    values['이미지'] = prepared.map(({ file, desc, source, usage, kind }) => ({ file, desc, source, usage, kind }));
    fs.writeFileSync(path.join(dir, 'input.md'), renderInputMd(values, form));
  }

  // ── 내보내기 (결과 보기 웹 데이터)
  function exportProduct(id) {
    const cfgFile = exportConfigFile;
    const cfg = readJson(cfgFile);
    if (!cfg.projects.some((p) => p.id === id)) {
      cfg.projects.push({ id, kind: 'production', label: null });
      fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
    }
    if (exportFn) return exportFn(id);
    // 웹 데이터는 webIndexFile이 있는 폴더로 (시험 폴더 모드에서 저장소 web/public/data를 건드리지 않게)
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'export.js'), '--only', id, '--config', cfgFile, '--out', path.dirname(webIndexFile)], { encoding: 'utf8', env: scriptEnv({ CARDNEWS_NO_LOG: '1' }) });
    const excluded = (r.stdout.match(/^\[제외\].*$/gm) || []).map((l) => l.replace(/^\[제외\]\s*/, ''));
    return { ok: r.status === 0 && excluded.length === 0, output: (r.stdout || '').trim().split('\n').slice(-6), excluded };
  }


  // ── 피그마 (사람이 직접 고치기): 카드 레이어 준비 → 플러그인이 가져감 → 고친 카드를 플러그인이 돌려보냄
  const figmaDir = (id) => path.join(productDir(id), 'output', 'figma-export');
  const editedDir = (id) => path.join(productDir(id), 'output', 'figma-edited');
  const normText = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  function figmaLayers(id) {
    const data = readJsonSafe(path.join(figmaDir(id), 'layers.json'));
    if (!data || !Array.isArray(data.cards)) return null;
    return data;
  }
  function figmaInfo(id) {
    const layersFile = path.join(figmaDir(id), 'layers.json');
    const edited = readJsonSafe(path.join(editedDir(id), 'edited.json'));
    const cfg = readJsonSafe(figmaConfigFile) || {};
    const push = figmaRuns.get(id) || null;
    const fileKey = figmaPush.fileKeyOf(cfg.file_url);
    return {
      code: figmaCode,
      file_url: cfg.file_url || null,
      auto_push: Boolean(figmaAutoPush && fileKey),
      push: push
        ? {
            running: push.running, ok: push.ok, page_name: push.page_name, page_id: push.page_id, error: push.error,
            started_at: push.started_at, finished_at: push.finished_at, progress: push.lines.slice(-4),
            page_url: push.page_id && cfg.file_url ? `${cfg.file_url}?node-id=${push.page_id.replace(':', '-')}` : null,
          }
        : null,
      prepared_at: fs.existsSync(layersFile) ? fs.statSync(layersFile).mtime.toISOString() : null,
      edited: edited
        ? {
            received_at: edited.received_at,
            page: edited.page || null,
            cards: edited.cards.map((c) => {
              const f = path.join(editedDir(id), `${c.file}.png`);
              return { ...c, png: `${c.file}.png`, v: fs.existsSync(f) ? Math.round(fs.statSync(f).mtimeMs) : 0 };
            }),
          }
        : null,
    };
  }
  // AI 디자인 카드 (scripts/ai-card.js): 첫·마지막 카드를 GPT 이미지(로컬 Codex)로. 몇 분 걸려서 따로 돌리고 상태만 보여줌
  const aiDir = (id) => path.join(productDir(id), 'output', 'ai-card');
  function aiCardInfo(id) {
    const run = aiRuns.get(id) || null;
    const report = readJsonSafe(path.join(aiDir(id), 'ai-card.json'));
    const data = readJsonSafe(path.join(productDir(id), 'cards.json'));
    const list = (data && data.cards) || [];
    const applied = aiCards.appliedNumbers(productDir(id), list);
    const stale = aiCards.staleTargets(productDir(id), list);
    const fileV = (f) => (fs.existsSync(f) ? Math.round(fs.statSync(f).mtimeMs) : 0);
    return {
      auto: aiAuto,
      running: Boolean(run && run.running),
      run: run ? { card: run.card, auto: Boolean(run.auto), started_at: run.started_at, finished_at: run.finished_at, ok: run.ok, progress: run.lines.slice(-6) } : null,
      made_at: report ? report.made_at : null,
      targets: aiCards.aiTargets(list),
      applied,
      stale,
      cards: report && Array.isArray(report.cards)
        ? report.cards.map((c) => {
          const tpl = `template-card-${String(c.no).padStart(2, '0')}.png`;
          return { ...c, v: c.file ? fileV(path.join(aiDir(id), c.file)) : 0, applied: applied.includes(c.no), stale: stale.includes(c.no), template: fileV(path.join(aiDir(id), tpl)) ? { file: tpl, v: fileV(path.join(aiDir(id), tpl)) } : null };
        })
        : [],
    };
  }
  function startAiCard(id, card, { stale = false } = {}) {
    const run = { card: card || null, auto: stale, started_at: new Date().toISOString(), finished_at: null, running: true, ok: null, lines: [] };
    aiRuns.set(id, run);
    const onLine = (line) => { if (line.trim()) run.lines.push(line.trim()); if (run.lines.length > 50) run.lines.shift(); };
    const done = (r) => Object.assign(run, { running: false, ok: Boolean(r && r.ok), finished_at: new Date().toISOString() });
    const exec = aiCardFn || ((pid, { card: c, stale: st }) => new Promise((resolve) => {
      const args = [path.join(root, 'scripts', 'ai-card.js'), pid, ...(c ? ['--card', String(c)] : []), ...(st ? ['--stale'] : [])];
      const child = spawn(process.execPath, args, { env: scriptEnv() });
      let buf = '';
      const feed = (d) => { buf += d; const parts = buf.split('\n'); buf = parts.pop(); parts.forEach(onLine); };
      child.stdout.on('data', feed);
      child.stderr.on('data', feed);
      child.on('error', (e) => { onLine(`[오류] ${e.message}`); resolve({ ok: false }); });
      child.on('close', (code) => { if (buf) onLine(buf); resolve({ ok: code === 0, code }); });
    }));
    Promise.resolve(exec(id, { card, stale, onLine })).then(done, (e) => { onLine(`[오류] ${e.message}`); done({ ok: false }); });
  }
  // 문구·출력 작업이 성공하면: 아직 없거나 문구가 바뀐 첫·마지막 카드를 GPT로 (뒤에서). 문구가 그대로면 아무것도 안 함
  function autoAiCard(id) {
    if (!aiAuto || (aiRuns.get(id) || {}).running) return;
    const cards = readJsonSafe(path.join(productDir(id), 'cards.json'));
    if (!cards || cards.stage !== 'copy' || !Array.isArray(cards.cards)) return;
    if (!aiCards.staleTargets(productDir(id), cards.cards).length) return;
    startAiCard(id, null, { stale: true });
  }

  // ── 무드 '브랜드' (scripts/lib/brand.js)
  const isBrand = (input, cards) => resolveDesign({ input, data: cards, config: templatesConfig() }).id === brand.BRAND_DESIGN;
  function readInputOf(id) {
    try { return parseInput(fs.readFileSync(path.join(productDir(id), 'input.md'), 'utf8')); } catch { return null; }
  }
  // 브랜드 페이지 스냅샷 상태 (brand/snapshot.json)
  function brandInfo(input, dir) {
    const url = brand.brandUrlOf(input);
    if (!url) return null;
    const snap = readJsonSafe(path.join(brand.brandDir(dir), 'snapshot.json'));
    const fileV = (f) => { const p = path.join(brand.brandDir(dir), f); return fs.existsSync(p) ? Math.round(fs.statSync(p).mtimeMs) : 0; };
    return {
      url,
      url_ok: brand.checkBrandUrl(url).ok,
      snapshot: snap
        ? { ok: Boolean(snap.ok), fetched_at: snap.fetched_at, title: snap.title, error: snap.error, warnings: snap.warnings || [], colors: (snap.colors || []).slice(0, 6), shots: (snap.shots || []).map((f) => ({ file: f, v: fileV(f) })) }
        : null,
    };
  }
  // 구성안 작업 전: 브랜드 URL이 있고 아직 같은 주소로 찍은 스냅샷이 없으면 한 번 찍음. 실패해도 구성안 작업은 진행(제품 사진으로 무드)
  function prepareBrand(id, note) {
    const input = readInputOf(id);
    const url = brand.brandUrlOf(input);
    if (!url) return Promise.resolve(null);
    const checked = brand.checkBrandUrl(url);
    if (!checked.ok) { note(`브랜드 URL을 쓸 수 없어요: ${checked.error} (제품 사진으로 무드를 정해요)`); return Promise.resolve(null); }
    const snap = readJsonSafe(path.join(brand.brandDir(productDir(id)), 'snapshot.json'));
    if (snap && snap.ok && snap.url === checked.url) return Promise.resolve(snap);
    note('브랜드 상세페이지를 캡처하는 중… (30초~1분)');
    const exec = brandSnapshotFn || ((pid) => new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(root, 'scripts', 'brand-snapshot.js'), pid, '--force'], { env: scriptEnv() });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { out += d; });
      child.on('error', (e) => resolve({ ok: false, error: e.message }));
      child.on('close', (code) => resolve({ ok: code === 0, error: code === 0 ? null : out.trim().split('\n').slice(-2).join(' ') }));
    }));
    return Promise.resolve(exec(id)).then((r) => {
      note(r && r.ok ? '브랜드 페이지 캡처 완료' : `브랜드 페이지를 읽지 못했어요: ${(r && r.error) || '알 수 없는 오류'} (제품 사진으로 무드를 정해요)`);
      return r;
    }, (e) => { note(`브랜드 페이지를 읽지 못했어요: ${e.message}`); return null; });
  }
  // AI 배경 (scripts/ai-bg.js): 카드마다 글자·제품 없는 배경. 몇 분 걸려서 따로 돌리고 상태만 보여줌
  const bgDir = (id) => brand.aiBgDir(productDir(id));
  function aiBgInfo(id) {
    const run = bgRuns.get(id) || null;
    const report = brand.readBgReport(productDir(id));
    const data = readJsonSafe(path.join(productDir(id), 'cards.json'));
    const have = brand.bgFiles(productDir(id), data);
    const fileV = (f) => (fs.existsSync(f) ? Math.round(fs.statSync(f).mtimeMs) : 0);
    return {
      auto: aiBgAuto,
      // 이미지 만드는 곳 (scripts/ai-bg.js imageBackend): codex(로컬, 요금제 사용량) | openai(배포용 이미지 API)
      backend: process.env.CARDNEWS_IMAGE_BACKEND === 'openai' ? 'openai' : 'codex',
      running: Boolean(run && run.running),
      run: run ? { card: run.card, auto: Boolean(run.auto), started_at: run.started_at, finished_at: run.finished_at, ok: run.ok, progress: run.lines.slice(-6) } : null,
      made_at: report ? report.made_at : null,
      has_mood: Boolean(data && data.brand_mood),
      stale: brand.staleBg(productDir(id), data),
      cards: ((data && data.cards) || []).map((c) => {
        const r = report && (report.cards || []).find((x) => x.no === c.no);
        return {
          no: c.no, template: c.template, ok: Boolean(r && r.ok), current: have.has(c.no), source: (r && r.source) || (r ? 'codex' : null),
          file: r && r.file ? r.file : null, v: r && r.file ? fileV(path.join(bgDir(id), r.file)) : 0, tries: r ? r.tries : [],
          // ChatGPT 채팅창에 붙여 넣을 요청문 (Codex 사용량 한도일 때 사람이 만들어 올림)
          prompt: data && data.brand_mood ? brand.chatPrompt(data.brand_mood, c.template) : null,
        };
      }),
    };
  }
  function startAiBg(id, card, { stale = false, importFile = null } = {}) {
    const run = { card: card || null, auto: stale, started_at: new Date().toISOString(), finished_at: null, running: true, ok: null, lines: [] };
    bgRuns.set(id, run);
    const onLine = (line) => { if (line.trim()) run.lines.push(line.trim()); if (run.lines.length > 50) run.lines.shift(); };
    const done = (r) => Object.assign(run, { running: false, ok: Boolean(r && r.ok), finished_at: new Date().toISOString() });
    const exec = aiBgFn || ((pid, { card: c, stale: st, importFile: imp }) => new Promise((resolve) => {
      const args = imp
        ? [path.join(root, 'scripts', 'ai-bg.js'), pid, '--import', String(c), imp]
        : [path.join(root, 'scripts', 'ai-bg.js'), pid, ...(c ? ['--card', String(c)] : []), ...(st ? ['--stale'] : [])];
      const child = spawn(process.execPath, args, { env: scriptEnv() });
      let buf = '';
      const feed = (d) => { buf += d; const parts = buf.split('\n'); buf = parts.pop(); parts.forEach(onLine); };
      child.stdout.on('data', feed);
      child.stderr.on('data', feed);
      child.on('error', (e) => { onLine(`[오류] ${e.message}`); resolve({ ok: false }); });
      child.on('close', (code) => { if (buf) onLine(buf); resolve({ ok: code === 0, code }); });
    }));
    const cleanup = () => { if (importFile) fs.rmSync(importFile, { force: true }); };
    Promise.resolve(exec(id, { card, stale, importFile, onLine })).then((r) => { cleanup(); done(r); }, (e) => { cleanup(); onLine(`[오류] ${e.message}`); done({ ok: false }); });
  }
  // 문구·출력 작업이 성공하면: 아직 없거나 무드·템플릿이 바뀐 카드 배경만 GPT로 (뒤에서). 문구만 바뀌면 배경은 그대로
  function autoAiBg(id) {
    if (!aiBgAuto || (bgRuns.get(id) || {}).running) return;
    const cards = readJsonSafe(path.join(productDir(id), 'cards.json'));
    if (!cards || cards.stage !== 'copy' || !cards.brand_mood) return;
    if (!brand.staleBg(productDir(id), cards).length) return;
    startAiBg(id, null, { stale: true });
  }
  // 피그마 자동 보내기: claude -p 가 피그마 연결(MCP)로 새 페이지 → 이미지 올리기 → 카드 프레임 만들기 (scripts/figma-push.js 지시문)
  function startFigmaPush(id, pageName) {
    const cfg = readJsonSafe(figmaConfigFile) || {};
    const fileKey = figmaPush.fileKeyOf(cfg.file_url);
    const run = { running: true, ok: null, page_name: pageName, page_id: null, error: null, started_at: new Date().toISOString(), finished_at: null, lines: [] };
    figmaRuns.set(id, run);
    const done = (r) => Object.assign(run, { running: false, finished_at: new Date().toISOString(), ok: Boolean(r && r.ok), page_id: (r && r.pageId) || null, error: r && !r.ok ? r.error || '피그마에 넣지 못했어요' : null });
    const exec = figmaPushFn || ((pid) => new Promise((resolve) => {
      let info;
      try { info = figmaPush.exportInfo(pid); } catch (e) { resolve({ ok: false, error: `피그마용 카드가 없어요: ${e.message}` }); return; }
      const prompt = figmaPush.buildPushPrompt({ id: pid, fileKey, info });
      const tools = [...figmaPush.FIGMA_TOOLS, 'Read', 'Bash(node scripts/figma-push.js upload:*)'].join(',');
      const [cmd, args] = jobRunner.claudeCommand(bin, ['-p', prompt, '--output-format', 'json', '--max-turns', '30', '--allowedTools', tools]);
      const child = spawn(cmd, args, { cwd: root, env: scriptEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      run.lines.push('Claude가 피그마에 카드를 넣는 중… (1~3분)');
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
      const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60 * 1000);
      child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: `claude를 실행하지 못했어요: ${e.message}` }); });
      child.on('close', () => {
        clearTimeout(timer);
        let result = '';
        try { result = JSON.parse(out).result || ''; } catch { result = out; }
        const m = String(result).match(/\{[^{}]*"ok"[^{}]*\}/);
        let r = null;
        try { r = m ? JSON.parse(m[0]) : null; } catch { r = null; }
        resolve(r && typeof r.ok === 'boolean' ? r : { ok: false, error: (String(result || err).trim().split('\n').pop() || '결과를 알 수 없어요').slice(0, 300) });
      });
    }));
    Promise.resolve(exec(id, { pageName, fileKey })).then(done, (e) => done({ ok: false, error: e.message }));
  }
  const stampNow = () => {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    return `${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };
  function prepareFigma(id, pageName = null) {
    if (figmaExportFn) return figmaExportFn(id, pageName);
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'figma-export.js'), id, ...(pageName ? ['--page-name', pageName] : [])], { encoding: 'utf8', env: scriptEnv() });
    return { ok: r.status === 0, output: `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-4) };
  }
  // 고친 카드 받기: PNG 저장 + 글자 레이어 내용을 내보낼 때(승인 문구)와 비교
  function saveEdited(id, body) {
    const layers = figmaLayers(id);
    if (!layers) throw new HttpError(409, '먼저 작업실에서 "피그마에서 편집"을 눌러 카드를 준비해 주세요');
    const list = Array.isArray(body.cards) ? body.cards : [];
    if (!list.length || list.length > 30) throw new HttpError(400, '보낼 카드가 없어요');
    const out = [];
    const pngs = [];
    for (const c of list) {
      if (!CARD_FILE_RE.test(c.file || '')) throw new HttpError(400, `카드 이름이 이상해요: ${c.file}`);
      const png = Buffer.from(String(c.png || ''), 'base64');
      if (png.length < 8 || !png.subarray(0, 4).equals(PNG_SIG)) throw new HttpError(400, `${c.file}: PNG가 아니에요`);
      if (png.length > MAX_IMAGE_BYTES) throw new HttpError(413, `${c.file}: 이미지가 너무 커요`);
      const orig = layers.cards.find((x) => x.file === c.file);
      // 같은 이름 글자 레이어가 여럿(설명형 항목 등)이라 '이름 + 같은 이름 중 몇 번째'로 짝지음 (피그마 레이어 순서 = 내보낸 순서)
      const keyed = (list) => {
        const seen = {};
        return new Map(list.map(({ name, text }) => { seen[name] = (seen[name] || 0) + 1; return [`${name}#${seen[name]}`, { name, text }]; }));
      };
      const before = keyed((orig ? orig.layers : []).filter((l) => l.kind === 'text').map((l) => ({ name: l.name, text: l.text })));
      const after = keyed((Array.isArray(c.texts) ? c.texts : []).slice(0, 200).map((t) => ({ name: String(t.name || '').slice(0, 120), text: String(t.text || '').slice(0, 2000) })));
      const changed = [];
      for (const [key, a] of after) {
        const b = before.get(key);
        if (!b) changed.push({ name: a.name, before: null, after: a.text });
        else if (normText(b.text) !== normText(a.text)) changed.push({ name: a.name, before: b.text, after: a.text });
      }
      for (const [key, b] of before) if (!after.has(key)) changed.push({ name: b.name, before: b.text, after: null });
      out.push({ file: c.file, changed });
      pngs.push([c.file, png]);
    }
    const dir = editedDir(id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const [file, png] of pngs) fs.writeFileSync(path.join(dir, `${file}.png`), png);
    // 어느 피그마 페이지에서 보냈는지 (가져올 때마다 새 페이지가 생기므로 사람이 확인할 수 있게)
    const page = typeof body.page === 'string' ? body.page.replace(/[\u0000-\u001f]/g, '').slice(0, 120) || null : null;
    const record = { received_at: new Date().toISOString(), page, cards: out };
    fs.writeFileSync(path.join(dir, 'edited.json'), JSON.stringify(record, null, 2) + '\n');
    return record;
  }

  // 피그마 플러그인 API: 연결 코드 확인, 다른 출처 허용(읽기 응답·본문 text/plain → 미리 요청 없이 동작)
  async function routeFigma(req, res, url) {
    const parts = url.pathname.slice(FIGMA_API.length).split('/').filter(Boolean).map(decodeURIComponent);
    const given = String(req.headers['x-figma-code'] || url.searchParams.get('code') || '').trim().toUpperCase();
    if (!given || given.length !== figmaCode.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(figmaCode))) {
      throw new HttpError(403, '연결 코드가 맞지 않아요. 작업실의 "피그마에서 편집"에 나온 코드를 넣어 주세요 (작업실을 다시 켜면 코드가 바뀌어요)');
    }
    if (req.method === 'GET' && parts[0] === 'products' && parts.length === 1) {
      const ids = fs.existsSync(productsDir) ? fs.readdirSync(productsDir).filter((d) => ID_RE.test(d)) : [];
      const list = ids.map((id) => {
        const file = path.join(figmaDir(id), 'layers.json');
        if (!fs.existsSync(file)) return null;
        const data = figmaLayers(id);
        return data && { id, name: nameOf(id), cards: data.cards.length, prepared_at: fs.statSync(file).mtime.toISOString() };
      }).filter(Boolean).sort((a, b) => b.prepared_at.localeCompare(a.prepared_at));
      return send(res, 200, { products: list });
    }
    if (parts[0] === 'products' && parts[1]) {
      const id = requireProduct(parts[1]);
      if (req.method === 'GET' && parts[2] === 'layers' && parts.length === 3) {
        const data = figmaLayers(id);
        if (!data) throw new HttpError(404, '피그마용 카드가 아직 없어요. 작업실에서 "피그마에서 편집"을 눌러 주세요');
        return send(res, 200, { product_id: id, product: data.product, cards: data.cards.map(compactCard) });
      }
      if (req.method === 'GET' && parts[2] === 'images' && parts.length === 4) {
        const name = parts[3].replace(/\.png$/, '');
        if (!UPLOAD_RE.test(name)) throw new HttpError(404, '이미지가 없어요');
        const full = path.join(figmaDir(id), 'images', `${name}.png`);
        if (!fs.existsSync(full)) throw new HttpError(404, '이미지가 없어요');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store');
        return fs.createReadStream(full).pipe(res);
      }
      if (req.method === 'POST' && parts[2] === 'edited' && parts.length === 3) {
        const record = saveEdited(id, await readBody(req));
        return send(res, 200, record);
      }
    }
    throw new HttpError(404, '없는 API예요');
  }

  // ── 라우팅
  async function route(req, res, url) {
    const method = req.method;
    const parts = url.pathname.slice(API.length).split('/').filter(Boolean).map(decodeURIComponent);

    if (method === 'GET' && parts[0] === 'status' && parts.length === 1) {
      return send(res, 200, { ok: true, mode: 'web', claude: claudeStatus(), job: current ? publicJob(current) : null, jobs: jobsOverview(), form: loadForm(), revision_types: readJson(path.join(root, 'config', 'revision-types.json')).types.map(({ code, label, example }) => ({ code, label, example })) });
    }
    if (method === 'GET' && parts[0] === 'products' && parts.length === 1) {
      const ids = fs.existsSync(productsDir)
        ? fs.readdirSync(productsDir).filter((d) => ID_RE.test(d) && fs.existsSync(path.join(productDir(d), 'input.md')))
        : [];
      const list = ids.map(productSummary).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return send(res, 200, { products: list });
    }
    // 자료(PDF·이미지·글)로 입력 칸 채우기: 초안만 돌려주고 저장하지 않음 (사람이 확인한 뒤 제품 만들기)
    if (method === 'POST' && parts[0] === 'extract' && parts.length === 1) {
      const body = await readBody(req);
      try {
        const r = await (extractFn || extractInput)({ files: body.files, bin });
        return send(res, 200, r);
      } catch (e) {
        throw new HttpError(e.status || 422, e.message);
      }
    }
    if (method === 'POST' && parts[0] === 'products' && parts.length === 1) {
      const body = await readBody(req);
      const id = requireId(body.id);
      if (fs.existsSync(productDir(id))) throw new HttpError(409, `이미 있는 제품ID예요: ${id}`);
      try {
        writeInput(id, body, { create: true });
      } catch (e) {
        fs.rmSync(productDir(id), { recursive: true, force: true });
        throw e;
      }
      appendEvent(id, 'input_submitted');
      return send(res, 201, productDetail(id));
    }
    if (parts[0] === 'products' && parts[1]) {
      const id = requireProduct(parts[1]);
      if (method === 'GET' && parts.length === 2) return send(res, 200, productDetail(id));

      if (method === 'GET' && parts[2] === 'files' && parts.length === 5) {
        const [, , , folder, file] = parts;
        const base = folder === 'png' ? path.join(productDir(id), 'output', 'png')
          : folder === 'images' ? path.join(productDir(id), 'images')
          : folder === 'figma-edited' ? editedDir(id)
            : folder === 'ai-card' ? aiDir(id)
              : folder === 'ai-bg' ? bgDir(id)
                : folder === 'brand' ? brand.brandDir(productDir(id)) : null;
        if (!base || !FILE_RE.test(file)) throw new HttpError(404, '파일이 없어요');
        const full = path.join(base, file);
        if (!fs.existsSync(full)) throw new HttpError(404, '파일이 없어요');
        res.statusCode = 200;
        res.setHeader('Content-Type', /\.png$/i.test(file) ? 'image/png' : 'image/jpeg');
        res.setHeader('Cache-Control', 'no-store');
        return fs.createReadStream(full).pipe(res);
      }

      const detail = () => productDetail(id);
      if (method === 'PUT' && parts[2] === 'input' && parts.length === 3) {
        if (!detail().actions.can_edit_input) throw new HttpError(409, '구성안을 만든 뒤에는 입력을 고칠 수 없어요');
        const body = await readBody(req);
        writeInput(id, body, { create: false });
        return send(res, 200, detail());
      }
      // 구성안 확인 때 사람이 디자인 묶음을 바꿈 (#74). 입력에 무드를 직접 적었으면 입력이 우선이라 막음
      if (method === 'PUT' && parts[2] === 'design' && parts.length === 3) {
        if (!detail().actions.can_select_design) throw new HttpError(409, '구성안을 승인하기 전에만 디자인 묶음을 바꿀 수 있어요');
        const body = await readBody(req);
        const config = templatesConfig();
        const ids = designCatalog(config).map((d) => d.id);
        const to = String(body.id || '').trim();
        if (!ids.includes(to)) throw new HttpError(400, `묶음 목록에 없는 이름이에요: ${to}`);
        const input = parseInput(fs.readFileSync(path.join(productDir(id), 'input.md'), 'utf8'));
        if (resolveDesign({ input, data: null, config }).source === 'input') {
          throw new HttpError(409, '입력에 무드를 직접 적었어요. 입력의 무드가 우선이라 여기서는 바꿀 수 없어요');
        }
        const file = path.join(productDir(id), 'cards.json');
        const data = readJson(file);
        const from = data.design ? data.design.id : null;
        if (from === to) return send(res, 200, detail());
        const reason = String(body.reason || '').trim().slice(0, 200);
        data.design = { id: to, selected_by: 'human', reason: reason || `작업실에서 사람이 고름${from ? ` (구성안 추천: ${from})` : ''}` };
        fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
        appendEvent(id, 'design_selected', { design: to, from, by: 'human' });
        validateReport(id, { log: true });
        return send(res, 200, detail());
      }
      if (method === 'POST' && parts[2] === 'jobs' && parts.length === 3) {
        const body = await readBody(req);
        const a = detail().actions;
        if (body.kind === 'plan') {
          if (!a.can_plan) throw new HttpError(409, '입력 확인 오류를 먼저 고치거나, 이미 만든 구성안을 확인하세요');
        } else if (body.kind === 'copy') {
          if (!a.can_copy) throw new HttpError(409, '구성안을 승인한 뒤에 문구·출력을 시작할 수 있어요');
        } else throw new HttpError(400, '작업 종류는 plan 또는 copy예요 (수정은 revisions)');
        return send(res, 202, { job: startJob(id, body.kind) });
      }
      if (method === 'POST' && parts[2] === 'approve' && parts.length === 3) {
        const body = await readBody(req);
        const a = detail().actions;
        if (body.stage === 'plan') {
          if (!a.can_approve_plan) throw new HttpError(409, '승인할 구성안이 없어요');
          appendEvent(id, 'plan_approved', { approved_by: 'human' });
          // 승인하면 바로 문구·출력 작업 시작 (웹에서 버튼 한 번)
          const job = body.start_copy === false ? null : startJob(id, 'copy');
          return send(res, 200, { ...detail(), job: job || detail().job });
        }
        if (body.stage === 'final') {
          if (!a.can_approve_final) throw new HttpError(409, '최종 승인할 카드가 없어요');
          const file = path.join(productDir(id), 'cards.json');
          const data = readJson(file);
          data.stage = 'approved';
          fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
          validateReport(id, { log: true });
          appendEvent(id, 'final_approved', { approved_by: 'human' });
          return send(res, 200, detail());
        }
        throw new HttpError(400, 'stage는 plan 또는 final이에요');
      }
      if (method === 'POST' && parts[2] === 'revisions' && parts.length === 3) {
        const body = await readBody(req);
        const a = detail().actions;
        const stage = body.stage;
        if (stage === 'plan' ? !a.can_revise_plan : stage === 'final' ? !a.can_revise_final : true) {
          throw new HttpError(409, stage === 'plan' || stage === 'final' ? '지금은 이 단계의 수정 요청을 보낼 수 없어요' : 'stage는 plan 또는 final이에요');
        }
        const codes = readJson(path.join(root, 'config', 'revision-types.json')).types.map((t) => t.code);
        const types = [].concat(body.types || []).filter((t) => codes.includes(t));
        if (!types.length) throw new HttpError(400, '수정 유형을 하나 이상 골라 주세요');
        const memo = String(body.memo || '').trim();
        if (!memo) throw new HttpError(400, '수정 요청 내용을 적어 주세요');
        if (memo.length > 500) throw new HttpError(400, '수정 요청은 500자 이하로 적어 주세요');
        const count = (readJsonSafe(path.join(productDir(id), 'cards.json')) || { cards: [] }).cards.length;
        const cards = [...new Set([].concat(body.cards || []).map(Number))].filter((n) => Number.isInteger(n) && n >= 1 && n <= count).sort((x, y) => x - y);
        const fields = { stage, types, memo };
        if (cards.length) fields.cards = cards;
        const job = startJob(id, 'revise', { stage, cards, types, memo }, { beforeStart: () => appendEvent(id, 'revision_requested', fields) });
        return send(res, 202, { job });
      }
      if (method === 'DELETE' && parts[2] === 'queue' && parts.length === 3) {
        cancelQueued(id);
        return send(res, 200, detail());
      }
      // AI 디자인 카드 만들기: 첫·마지막 카드(또는 고른 카드 하나)를 GPT 이미지로. 바로 202를 주고 뒤에서 돌림 (화면이 상태를 다시 읽음)
      if (method === 'POST' && parts[2] === 'ai-card' && parts.length === 3) {
        const body = await readBody(req);
        if (!detail().actions.can_ai_card) throw new HttpError(409, (aiRuns.get(id) || {}).running ? 'AI 디자인 카드를 만드는 중이에요' : '문구를 만든 뒤, 작업이 없을 때 만들 수 있어요');
        const n = body && body.card != null ? Number(body.card) : null;
        const cards = (readJsonSafe(path.join(productDir(id), 'cards.json')) || {}).cards || [];
        const allowed = [cards[0], cards[cards.length - 1]].filter(Boolean).map((c) => c.no);
        if (n != null && !allowed.includes(n)) throw new HttpError(400, `AI 디자인 카드는 첫·마지막 카드(${allowed.join('·')}번)만 만들 수 있어요`);
        startAiCard(id, n);
        return send(res, 202, detail());
      }
      // AI 배경 올리기: ChatGPT 채팅에서 만든 이미지를 N번 배경으로 (1080px로 맞추고 다시 출력)
      if (method === 'POST' && parts[2] === 'ai-bg' && parts[3] === 'upload' && parts.length === 4) {
        const body = await readBody(req);
        if (!detail().ai_bg) throw new HttpError(409, "무드가 '브랜드'일 때만 배경을 넣어요");
        if (!detail().actions.can_ai_bg) throw new HttpError(409, (bgRuns.get(id) || {}).running ? 'AI 배경을 만드는 중이에요' : '문구를 만든 뒤, 작업이 없을 때 넣을 수 있어요');
        const n = Number(body && body.card);
        const cards = (readJsonSafe(path.join(productDir(id), 'cards.json')) || {}).cards || [];
        if (!cards.some((c) => c.no === n)) throw new HttpError(400, '카드 번호를 확인해 주세요');
        const data = Buffer.from(String((body && body.data) || '').replace(/^data:[^,]*,/, ''), 'base64');
        if (!data.length) throw new HttpError(400, '이미지를 올려 주세요');
        if (data.length > 20 * 1024 * 1024) throw new HttpError(413, '이미지는 20MB 이하만 올릴 수 있어요');
        const png = data.subarray(0, 4).equals(PNG_SIG);
        const jpg = data[0] === 0xff && data[1] === 0xd8;
        const webp = data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP';
        if (!png && !jpg && !webp) throw new HttpError(400, 'PNG·JPG·WEBP 이미지만 올릴 수 있어요');
        const tmp = path.join(require('os').tmpdir(), `cardnews-bg-${id}-${n}-${Date.now()}.${png ? 'png' : jpg ? 'jpg' : 'webp'}`);
        fs.writeFileSync(tmp, data);
        startAiBg(id, n, { importFile: tmp });
        return send(res, 202, detail());
      }
      // AI 배경 (무드 '브랜드'): 전체 또는 한 장 다시 만들기
      if (method === 'POST' && parts[2] === 'ai-bg' && parts.length === 3) {
        const body = await readBody(req);
        if (!detail().ai_bg) throw new HttpError(409, "무드가 '브랜드'일 때만 AI 배경을 만들어요");
        if (!detail().actions.can_ai_bg) throw new HttpError(409, (bgRuns.get(id) || {}).running ? 'AI 배경을 만드는 중이에요' : '문구를 만든 뒤, 작업이 없을 때 만들 수 있어요');
        if (!detail().ai_bg.has_mood) throw new HttpError(409, '구성안에서 정한 브랜드 무드(brand_mood)가 없어요');
        const n = body && body.card != null ? Number(body.card) : null;
        const cards = (readJsonSafe(path.join(productDir(id), 'cards.json')) || {}).cards || [];
        if (n != null && !cards.some((c) => c.no === n)) throw new HttpError(400, `${n}번 카드가 없어요`);
        // stale: 아직 없거나 무드가 바뀐 카드만 (위쪽 'N번 AI 배경 만들기' 버튼). 카드 번호도 stale도 없으면 전체
        startAiBg(id, n, { stale: n == null && Boolean(body && body.stale) });
        return send(res, 202, detail());
      }
      // 피그마에서 편집: 출력한 카드를 피그마 레이어 파일로 준비 (플러그인이 가져감)
      if (method === 'POST' && parts[2] === 'figma' && parts.length === 3) {
        if (!detail().pngs.length) throw new HttpError(409, '카드를 출력한 뒤에 피그마로 보낼 수 있어요');
        if (detail().actions.running) throw new HttpError(409, '작업이 끝난 뒤에 피그마로 보낼 수 있어요');
        if (detail().actions.ai_busy) throw new HttpError(409, 'AI 디자인 카드·배경을 만드는 중이에요. 끝난 뒤에 피그마로 보내요');
        if ((figmaRuns.get(id) || {}).running) throw new HttpError(409, '피그마에 카드를 넣는 중이에요');
        const cfg = readJsonSafe(figmaConfigFile) || {};
        const push = figmaAutoPush && figmaPush.fileKeyOf(cfg.file_url);
        // 자동 보내기면 '제품명 (ID) · 월.일 시:분' 새 페이지 (사람이 고친 이전 페이지를 덮어쓰지 않음)
        const pageName = push ? `${nameOf(id)} (${id}) · ${stampNow()}` : null;
        const result = prepareFigma(id, pageName);
        if (result.ok && push) startFigmaPush(id, pageName);
        return send(res, result.ok ? 200 : 422, { ...(result.ok ? {} : { error: `피그마용 카드를 만들지 못했어요: ${(result.output || []).slice(-1).join('') || '스크립트 오류'}` }), figma_export: result, product: detail() });
      }
      // 카드 이미지 다시 만들기: 승인된 문구 그대로 HTML·PNG만 다시 출력 (Claude 안 씀, 제작 기록에 안 남김). 새 폴더·다른 컴퓨터는 output/이 git에 없어 필요
      if (method === 'POST' && parts[2] === 'render' && parts.length === 3) {
        if (!detail().actions.can_render) throw new HttpError(409, '문구를 만든 뒤, 작업이 없을 때 다시 출력할 수 있어요');
        const result = renderFn ? renderFn(id) : (() => {
          const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'render.js'), id, '--no-log'], { encoding: 'utf8', env: scriptEnv() });
          return { ok: r.status === 0, output: `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-4) };
        })();
        return send(res, result.ok ? 200 : 422, { ...(result.ok ? {} : { error: `카드를 출력하지 못했어요: ${(result.output || []).slice(-1).join('') || '스크립트 오류'}` }), render: result, product: detail() });
      }
      if (method === 'POST' && parts[2] === 'export' && parts.length === 3) {
        if (!detail().actions.can_export) throw new HttpError(409, '최종 승인한 뒤에 내보낼 수 있어요');
        const result = exportProduct(id);
        // 실패 이유를 화면에 그대로 (예: PNG가 없음 → 카드 이미지 다시 만들기)
        const why = result.excluded && result.excluded.length
          ? result.excluded.map((x) => x.split('|').slice(1).map((t) => t.trim()).join(' — ')).join(' / ')
          : (result.output || []).slice(-1).join('');
        return send(res, result.ok ? 200 : 422, { ...(result.ok ? {} : { error: `내보내지 못했어요: ${why || '내보내기 스크립트 오류'}` }), export: result, product: detail() });
      }
    }
    if (method === 'GET' && parts[0] === 'job' && parts.length === 1) {
      return send(res, 200, { job: current ? publicJob(current) : null, jobs: jobsOverview() });
    }
    if (method === 'GET' && parts[0] === 'jobs' && parts.length === 1) {
      return send(res, 200, jobsOverview());
    }
    throw new HttpError(404, '없는 API예요');
  }

  /** connect·http 미들웨어: 처리하면 true */
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(API)) return false;
    try {
      const host = String(req.headers.host || '').replace(/:\d+$/, '');
      if (!LOCAL_HOSTS.has(host)) throw new HttpError(403, '이 컴퓨터에서만 쓸 수 있어요');
      if (url.pathname === FIGMA_API || url.pathname.startsWith(`${FIGMA_API}/`)) {
        // 피그마 플러그인(다른 출처)에서 오는 요청: 응답을 읽을 수 있게 열어 두고, 연결 코드로 막음
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'content-type, x-figma-code');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return true;
        }
        await routeFigma(req, res, url);
        return true;
      }
      if (req.method !== 'GET') {
        if (req.headers['x-studio'] !== '1') throw new HttpError(403, '웹 제작 화면에서만 요청할 수 있어요');
        const origin = req.headers.origin;
        if (origin) {
          const o = new URL(origin);
          if (!LOCAL_HOSTS.has(o.hostname) && o.hostname !== '::1') throw new HttpError(403, '다른 사이트에서 온 요청이에요');
        }
      }
      await route(req, res, url);
    } catch (e) {
      send(res, e.status || 500, { error: e.status ? e.message : `서버 오류: ${e.message}` });
    }
    return true;
  }

  return { handle, figmaCode, state: () => ({ current, queue: queue.map(({ beforeStart, ...q }) => q), claude: claudeInfo }) };
}

function readJsonSafeStr(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

module.exports = { createStudio, API };
