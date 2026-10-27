// 로컬 제작 API (웹 모드): 웹 제작 화면이 부르는 HTTP API. 개발 서버(npm run studio = vite dev)에서만 켜짐
// 제품 만들기 → 입력 확인 → 구성안 작업 → 승인/수정 요청 → 문구·출력 작업 → 최종 승인/수정 요청 → 결과 보기 웹에 내보내기
// 실제 제작은 작업 실행기(job-runner.js)가 내 컴퓨터의 claude -p로 실행
//
// 보안: 이 컴퓨터(localhost)에서 온 요청만 받음 · 바꾸는 요청은 X-Studio 헤더 필수(다른 사이트의 폼 전송 차단)
//       제품ID·파일명 형식 검사 · 이미지 크기·형식 제한 · 작업은 한 번에 하나 (나머지는 대기열에서 차례로)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, readJson, parseInput, resolveDesign, designCatalog, moodInputOf } = require('./common');
const { loadForm, renderInputMd } = require('./input-form');
const { summarize } = require('./analysis');
const jobRunner = require('./job-runner');

const API = '/api/studio';
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FILE_RE = /^[A-Za-z0-9가-힣._-]+\.(png|jpe?g)$/i;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = 40 * 1024 * 1024;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

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
 * @param {string} [o.bin]          claude 실행 파일 (기본 CARDNEWS_CLAUDE_BIN 또는 claude)
 * @param {Function} [o.runJob]     작업 실행 함수 (테스트용 교체)
 */
function createStudio({
  root = ROOT,
  productsDir = path.join(root, 'products'),
  bin = process.env.CARDNEWS_CLAUDE_BIN || 'claude',
  runJob = jobRunner.runJob,
  reportsDir = path.join(root, '.studio', 'jobs'),
  exportConfigFile = path.join(root, 'config', 'export.json'),
  webIndexFile = path.join(root, 'web', 'public', 'data', 'index.json'),
  exportFn,
} = {}) {
  const productDir = (id) => path.join(productsDir, id);
  const logFile = (id) => path.join(productDir(id), 'log.jsonl');
  let current = null; // { product_id, kind, job_id, status: 'running'|'done', started_at, progress: [], summary }
  // 대기열: 작업 중에 다른 제품 작업을 누르면 거절하지 않고 차례를 기다림. 제품마다 하나만, 서버를 끄면 사라짐
  const queue = []; // { product_id, kind, revision, queued_at, beforeStart }
  const lastJobs = new Map(); // 제품ID → 마지막 작업 요약
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
    return {
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
      can_approve_final: !running && stage === 'copy',
      can_revise_final: !running && stage === 'copy',
      can_export: !running && stage === 'approved',
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
    runJob({
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
    })
      .then((summary) => {
        job.status = 'done';
        job.summary = summary;
        lastJobs.set(id, { ...publicSummary(summary), status: 'done' });
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
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'export.js'), '--only', id, '--config', cfgFile], { encoding: 'utf8', env: scriptEnv({ CARDNEWS_NO_LOG: '1' }) });
    const excluded = (r.stdout.match(/^\[제외\].*$/gm) || []).map((l) => l.replace(/^\[제외\]\s*/, ''));
    return { ok: r.status === 0 && excluded.length === 0, output: (r.stdout || '').trim().split('\n').slice(-6), excluded };
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
        const base = folder === 'png' ? path.join(productDir(id), 'output', 'png') : folder === 'images' ? path.join(productDir(id), 'images') : null;
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
      if (method === 'POST' && parts[2] === 'export' && parts.length === 3) {
        if (!detail().actions.can_export) throw new HttpError(409, '최종 승인한 뒤에 내보낼 수 있어요');
        const result = exportProduct(id);
        return send(res, result.ok ? 200 : 422, { export: result, product: detail() });
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

  return { handle, state: () => ({ current, queue: queue.map(({ beforeStart, ...q }) => q), claude: claudeInfo }) };
}

function readJsonSafeStr(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

module.exports = { createStudio, API };
