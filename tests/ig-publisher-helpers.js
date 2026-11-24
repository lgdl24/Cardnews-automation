// 실제 계정 대신 임시 제품·가짜 인스타 API를 만드는 공통 시험 도구예요.
const fs = require('node:fs');
const path = require('node:path');
const { createPublisher } = require('../scripts/lib/ig-publisher');
const { precheckIn } = require('../scripts/lib/ig-publish-deps');
const { stampProduct } = require('../scripts/lib/ai-disclosure');
const { ROOT, makeWorkspace } = require('./helpers');
const { seedCaption } = require('./caption-helpers');
const PNG_DIR = path.join(ROOT, 'docs/examples/web-data/projects/toneup-sunscreen-r1/png');
const T0 = Date.parse('2026-11-18T00:00:00Z');

// 최종 승인된 제품 폴더 (출력 PNG·레이아웃 기록·AI 표시 메타데이터·승인 기록)
function approvedWorkspace() {
  const ws = makeWorkspace({ from: 'toneup-sunscreen-r1' });
  const data = ws.readCards();
  data.stage = 'approved';
  ws.writeCards(data);
  fs.mkdirSync(ws.file('output', 'png'), { recursive: true });
  for (const c of data.cards) {
    const name = `card-${String(c.no).padStart(2, '0')}.png`;
    fs.copyFileSync(path.join(PNG_DIR, name), ws.file('output', 'png', name));
  }
  fs.writeFileSync(ws.file('output', 'render-report.json'), JSON.stringify({ results: data.cards.map((c) => ({ no: c.no, issues: [] })) }));
  stampProduct(ws.file(), { cards: data.cards });
  fs.appendFileSync(ws.file('log.jsonl'), JSON.stringify({ ts: '2026-11-17T09:00:00.000Z', event: 'final_approved', approved_by: 'human' }) + '\n');
  seedCaption(ws);
  return ws;
}

// 가짜 인스타 API: 단계별로 실패를 넣을 수 있음
function fakeIg({ failAt = null, recent = [] } = {}) {
  const calls = [];
  let n = 0;
  const ig = {
    apiSetup: 'unified',
    calls,
    me: async () => ({ user_id: '17841', username: 'glowif_lab' }),
    permissions: async () => ({ data: ['instagram_basic', 'instagram_content_publish'].map((permission) => ({ permission, status: 'granted' })) }),
    publishingLimit: async () => ({ data: [{ quota_usage: 1, config: { quota_total: 100 } }] }),
    call: async (method, p, params = {}) => {
      calls.push({ method, path: p, params });
      if (method === 'POST' && p === '17841/media') {
        if (failAt === 'upload' && !params.media_type) throw Object.assign(new Error('업로드 실패'), { code: 9004 });
        return { id: params.media_type === 'CAROUSEL' ? 'car-1' : `item-${++n}` };
      }
      if (method === 'POST' && p === '17841/media_publish') {
        if (failAt === 'publish') throw new Error('socket hang up');
        return { id: 'media-1' };
      }
      if (method === 'GET' && p === 'media-1') {
        if (failAt === 'permalink') throw new Error('timeout');
        return { permalink: 'https://www.instagram.com/p/glowif1/' };
      }
      if (method === 'GET' && p === '17841/media') return { data: recent };
      if (method === 'GET') {
        if (ig.nextVerificationStatus) { const status_code = ig.nextVerificationStatus; ig.nextVerificationStatus = null; return { status_code }; }
        return { status_code: 'FINISHED' };
      }
      throw new Error(`unexpected ${method} ${p}`);
    },
  };
  return ig;
}

function setup({ ig = fakeIg(), precheck = null, now = { t: T0 }, ...rest } = {}) {
  const ws = approvedWorkspace();
  const events = [];
  const opened = { count: 0, closed: 0 };
  const pub = createPublisher({
    productsDir: ws.dir,
    appendEvent: (id, event, fields) => events.push({ id, event, ...fields }),
    precheck: precheck || precheckIn(ROOT, ws.dir),
    client: () => ig,
    configured: () => true,
    toJpegs: async (outDir, files) => files.map((f) => {
      const out = path.join(outDir, path.basename(f).replace(/\.png$/, '.jpg'));
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(out, 'jpg');
      return out;
    }),
    openPublicUrls: async (jpgs) => {
      opened.count++;
      return { mode: 'tunnel', urls: jpgs.map((f) => `https://t.example/s/${path.basename(f)}`), close: () => { opened.closed++; } };
    },
    now: () => now.t,
    sleep: async () => {},
    ...rest,
  });
  // 기존 게시 상태 검사는 캡션을 사람이 확인한 뒤의 상황으로 시작해요.
  if (!precheck) {
    const st = pub.status(ws.id);
    pub.acknowledge(ws.id, { version: st.version, ids: ['caption_review'] });
  }
  return { ws, pub, events, ig, opened, now };
}

module.exports = { approvedWorkspace, fakeIg, setup, T0, PNG_DIR };
