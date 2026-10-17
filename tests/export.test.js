// npm run export 테스트: 내보낼 수 있는 제품만 내보내고, 결과가 웹 데이터 규격 예시와 같은지
// 출력 폴더(products/*/output/)는 git에 없으므로 규격 예시의 PNG·레이아웃으로 임시 출력 결과를 만든다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, makeWorkspace } = require('./helpers');
const { exportWebData } = require('../scripts/export');

const ID = 'toneup-sunscreen-r1';
const EXAMPLE = path.join(ROOT, 'docs/examples/web-data');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const exampleIndex = readJson(path.join(EXAMPLE, 'index.json'));
const exampleProject = readJson(path.join(EXAMPLE, 'projects', ID, 'project.json'));
const pad = (n) => String(n).padStart(2, '0');

// 예시 제품 + 제작 기록 + 출력 결과(PNG·출력 보고서)를 갖춘 작업 공간
function setup({ projects = [{ id: ID, kind: 'example', label: exampleIndex.projects[0].label }] } = {}) {
  const ws = makeWorkspace({ from: ID });
  fs.copyFileSync(path.join(ROOT, 'products', ID, 'log.jsonl'), ws.file('log.jsonl'));
  fs.mkdirSync(ws.file('output', 'png'), { recursive: true });
  for (const c of exampleProject.cards) {
    fs.copyFileSync(path.join(EXAMPLE, 'projects', ID, c.png), ws.file('output', 'png', `card-${pad(c.no)}.png`));
  }
  ws.writeReport = (name, renderedAt, results) =>
    fs.writeFileSync(ws.file('output', name), JSON.stringify({ product_id: ID, rendered_at: renderedAt, results }, null, 2));
  ws.writeReport('render-report.json', '2026-10-10T08:00:00.000Z', exampleProject.cards.map((c) => ({ no: c.no, ...c.layout })));
  ws.out = path.join(ws.dir, '_web');
  ws.config = path.join(ws.dir, '_export.json');
  ws.setProjects = (list) => fs.writeFileSync(ws.config, JSON.stringify({ out_dir: ws.out, projects: list }));
  ws.setProjects(projects);
  ws.export = (opts = {}) => ws.use(() => exportWebData({ config: ws.config, exportedAt: exampleIndex.exported_at, ...opts }));
  ws.read = (rel) => readJson(path.join(ws.out, rel));
  return ws;
}

test('내보낸 결과는 웹 데이터 규격 예시(docs/examples/web-data)와 같다', () => {
  const ws = setup();
  try {
    const r = ws.export();
    assert.deepEqual(r.schemaErrors, []);
    assert.deepEqual(r.excluded, []);
    assert.deepEqual(r.exported, [ID]);
    assert.deepEqual(ws.read('index.json'), exampleIndex);
    for (const f of ['project.json', 'timeline.json']) {
      assert.deepEqual(ws.read(`projects/${ID}/${f}`), readJson(path.join(EXAMPLE, 'projects', ID, f)), f);
    }
    for (const c of exampleProject.cards) assert.ok(fs.existsSync(path.join(ws.out, 'projects', ID, c.png)), c.png);
  } finally {
    ws.cleanup();
  }
});

test('공개하지 않는 값(입력 원문 전체·입력 이미지·토큰·비용)은 내보내지 않는다', () => {
  const ws = setup();
  try {
    ws.export();
    const dir = path.join(ws.out, 'projects', ID);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['png', 'project.json', 'timeline.json']);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'png')).sort(), exampleProject.cards.map((c) => `card-${pad(c.no)}.png`));
    const text = ['index.json', `projects/${ID}/project.json`, `projects/${ID}/timeline.json`]
      .map((f) => fs.readFileSync(path.join(ws.out, f), 'utf8')).join('\n');
    for (const key of ['cost_usd', 'tokens', 'input_tokens', 'productText']) assert.ok(!text.includes(`"${key}"`), key);
    assert.ok(!text.includes(ws.readInput()), 'input.md 전체가 들어가면 안 됨');
  } finally {
    ws.cleanup();
  }
});

test('승인 전(stage: copy)은 제외되고, 평가 실행(kind: eval)은 copy도 내보낸다', () => {
  const ws = setup();
  try {
    ws.editCards((d) => { d.stage = 'copy'; });
    let r = ws.export();
    assert.deepEqual(r.exported, []);
    assert.equal(r.excluded[0].reason, 'NOT_APPROVED');

    const evalInfo = { input_id: 'E01', run_id: 'run-01', repeat: 1, variant: 'v1' };
    ws.setProjects([{ id: ID, kind: 'eval', label: null, eval: evalInfo }]);
    r = ws.export();
    assert.deepEqual(r.schemaErrors, []);
    assert.deepEqual(r.exported, [ID]);
    const summary = ws.read('index.json').projects[0];
    assert.equal(summary.kind, 'eval');
    assert.equal(summary.stage, 'copy');
    assert.deepEqual(summary.eval, evalInfo);
  } finally {
    ws.cleanup();
  }
});

test('PNG가 없거나 출력 보고서가 없으면 제외한다', () => {
  const ws = setup();
  try {
    fs.rmSync(ws.file('output', 'png', 'card-02.png'));
    let r = ws.export();
    assert.equal(r.excluded[0].reason, 'PNG_MISSING');
    assert.match(r.excluded[0].detail, /2번 카드/);

    fs.copyFileSync(ws.file('output', 'png', 'card-01.png'), ws.file('output', 'png', 'card-02.png'));
    fs.rmSync(ws.file('output', 'render-report.json'));
    r = ws.export();
    assert.equal(r.excluded[0].reason, 'LAYOUT_ERROR');
  } finally {
    ws.cleanup();
  }
});

test('레이아웃 오류는 제외하고, 그 카드만 다시 출력해 고친 최신 보고서가 있으면 내보낸다', () => {
  const ws = setup();
  try {
    const results = exampleProject.cards.map((c) => ({ no: c.no, ...c.layout }));
    results[2] = { ...results[2], issues: [{ code: 'OVERFLOW', field: 'title' }] };
    ws.writeReport('render-report.json', '2026-10-10T08:00:00.000Z', results);
    let r = ws.export();
    assert.equal(r.excluded[0].reason, 'LAYOUT_ERROR');
    assert.match(r.excluded[0].detail, /3번 카드/);

    ws.writeReport('render-report-card-03.json', '2026-10-10T09:00:00.000Z', [{ no: 3, issues: [], overlaps: [] }]);
    r = ws.export();
    assert.deepEqual(r.exported, [ID]);
    assert.equal(ws.read(`projects/${ID}/project.json`).cards[2].layout.ok, true);
  } finally {
    ws.cleanup();
  }
});

test('검증 오류·없는 제품은 제외하고 나머지는 내보낸다', () => {
  const ws = setup({
    projects: [
      { id: 'no-such-product', kind: 'production', label: null },
      { id: ID, kind: 'example', label: null },
    ],
  });
  try {
    let r = ws.export();
    assert.deepEqual(r.exported, [ID]);
    assert.deepEqual(r.excluded.map((x) => [x.id, x.reason]), [['no-such-product', 'INPUT_MISSING']]);

    ws.editCards((d) => { d.cards[1].template = 'no-such-template'; });
    r = ws.export();
    assert.deepEqual(r.exported, []);
    assert.equal(r.excluded.find((x) => x.id === ID).reason, 'VALIDATE_ERROR');
    assert.deepEqual(ws.read('index.json').projects, []);
    assert.ok(!fs.existsSync(path.join(ws.out, 'projects', ID)), '제외된 제품의 이전 결과는 지움');
  } finally {
    ws.cleanup();
  }
});

test('평가 결과(eval/)는 지우지 않고, 스키마 검사에 실패하면 아무것도 쓰지 않는다', () => {
  const ws = setup();
  try {
    fs.mkdirSync(path.join(ws.out, 'eval'), { recursive: true });
    fs.writeFileSync(path.join(ws.out, 'eval', 'keep.json'), '{}');
    ws.export();
    assert.ok(fs.existsSync(path.join(ws.out, 'eval', 'keep.json')));

    const before = fs.readFileSync(path.join(ws.out, 'index.json'), 'utf8');
    ws.setProjects([{ id: ID, kind: 'example', label: 123 }]);
    const r = ws.export({ exportedAt: '2026-10-17T00:00:00.000Z' });
    assert.ok(r.schemaErrors.length > 0);
    assert.deepEqual(r.exported, []);
    assert.equal(fs.readFileSync(path.join(ws.out, 'index.json'), 'utf8'), before);
  } finally {
    ws.cleanup();
  }
});

test('설정이 잘못되면 실행 전에 멈춘다', () => {
  const ws = setup();
  try {
    ws.setProjects([{ id: ID, kind: 'wrong', label: null }]);
    assert.throws(() => ws.export(), /kind/);
    ws.setProjects([{ id: ID, kind: 'example' }, { id: ID, kind: 'example' }]);
    assert.throws(() => ws.export(), /두 번/);
    ws.setProjects([{ id: ID, kind: 'example' }]);
    assert.throws(() => ws.export({ only: 'other' }), /없어요/);
  } finally {
    ws.cleanup();
  }
});
