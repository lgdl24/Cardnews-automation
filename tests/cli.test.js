// 명령 실행 테스트: npm run으로 쓰는 스크립트의 종료 코드와 제작 기록 자동 저장
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { makeWorkspace } = require('./helpers');

const readLog = (ws) => {
  const f = ws.file('log.jsonl');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
};

test('check: 정상이면 종료 코드 0, 입력 누락이면 1', () => {
  const ws = makeWorkspace();
  try {
    assert.equal(ws.run('check-input.js').status, 0);
    fs.rmSync(ws.file('images', 'main.png'));
    const r = ws.run('check-input.js');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /\[오류\] INPUT_MISSING/);
  } finally {
    ws.cleanup();
  }
});

test('validate: 결과를 log.jsonl에 validate_result로 남기고 quality.json을 만든다', () => {
  const ws = makeWorkspace();
  try {
    const r = ws.run('validate.js');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const events = readLog(ws);
    assert.equal(events.length, 1);
    const e = events[0];
    assert.equal(e.event, 'validate_result');
    assert.equal(e.check, 'data');
    assert.equal(e.ok, true);
    assert.equal(e.stage, 'copy');
    assert.ok(e.skill_version, 'skill_version이 비어 있어요');
    assert.equal(e.metrics.coverage, 1);
    assert.ok(fs.existsSync(ws.file('output', 'quality.json')));
  } finally {
    ws.cleanup();
  }
});

test('validate: 오류가 있으면 종료 코드 1, 기록에 오류 코드와 카드 번호가 남는다', () => {
  const ws = makeWorkspace();
  try {
    ws.editCards((d) => { d.cards[1].copy.title = '핑크 베이지 컬러로 피부 톤을 자연스럽게 보정해요'; });
    const r = ws.run('validate.js');
    assert.equal(r.status, 1);
    const [e] = readLog(ws);
    assert.equal(e.ok, false);
    assert.deepEqual(e.error_codes, ['CHAR_LIMIT']);
    assert.deepEqual(e.cards_with_errors, [2]);
  } finally {
    ws.cleanup();
  }
});

test('validate --no-log와 CARDNEWS_NO_LOG=1은 기록하지 않는다 (서버 재검증용)', () => {
  const ws = makeWorkspace();
  try {
    assert.equal(ws.run('validate.js', ['--no-log']).status, 0);
    assert.equal(ws.run('validate.js', [], { CARDNEWS_NO_LOG: '1' }).status, 0);
    assert.equal(readLog(ws).length, 0);
  } finally {
    ws.cleanup();
  }
});

test('log: 작업 시작~끝 기록이 같은 job_id로 묶이고 요약이 나온다', () => {
  const ws = makeWorkspace();
  try {
    assert.equal(ws.run('log.js', ['input_submitted']).status, 0);
    assert.equal(ws.run('log.js', ['job_started', '--kind', 'plan']).status, 0);
    assert.equal(ws.run('validate.js').status, 0);
    assert.equal(ws.run('log.js', ['job_finished', '--ok', 'true']).status, 0);
    const events = readLog(ws);
    assert.deepEqual(events.map((e) => e.event), ['input_submitted', 'job_started', 'validate_result', 'job_finished']);
    const jobId = events[1].job_id;
    assert.match(jobId, /^cli-/);
    assert.equal(events[2].job_id, jobId);
    assert.equal(events[3].job_id, jobId);
    assert.ok(!fs.existsSync(ws.file('.job.json')), '작업이 끝나면 .job.json이 지워져야 해요');

    const s = ws.run('log.js', ['--summary', '--json']);
    assert.equal(s.status, 0, s.stderr);
    assert.doesNotThrow(() => JSON.parse(s.stdout));
  } finally {
    ws.cleanup();
  }
});

test('log: 평가 모드에서는 기록하지 않는다 (평가 실행기가 기록)', () => {
  const ws = makeWorkspace();
  try {
    ws.run('log.js', ['input_submitted'], { CARDNEWS_MODE: 'eval' });
    assert.equal(readLog(ws).length, 0);
  } finally {
    ws.cleanup();
  }
});

test('log: 수정 요청은 정해진 유형 코드만 받는다', () => {
  const ws = makeWorkspace();
  try {
    const bad = ws.run('log.js', ['revision_requested', '--stage', 'final', '--types', 'WRONG', '--card', '3', '--memo', '테스트']);
    assert.notEqual(bad.status, 0);
    const ok = ws.run('log.js', ['revision_requested', '--stage', 'final', '--types', 'LEN', '--card', '3', '--memo', '제목 더 짧게']);
    assert.equal(ok.status, 0, ok.stderr);
    const [e] = readLog(ws);
    assert.deepEqual(e.types, ['LEN']);
    assert.deepEqual(e.cards, [3]);
  } finally {
    ws.cleanup();
  }
});

test('new-product: 빈 양식을 만들고, 이미 있는 제품ID는 거절한다', () => {
  const ws = makeWorkspace();
  try {
    const r = ws.run('new-product.js');
    assert.notEqual(r.status, 0, '이미 있는 폴더는 덮어쓰지 않아야 해요');
    const { spawnSync } = require('child_process');
    const path = require('path');
    const env = { ...process.env, CARDNEWS_PRODUCTS_DIR: ws.dir };
    const root = path.resolve(__dirname, '..');
    const made = spawnSync(process.execPath, [path.join(root, 'scripts', 'new-product.js'), 'brand-new'], { cwd: root, encoding: 'utf8', env });
    assert.equal(made.status, 0, made.stderr);
    assert.ok(fs.existsSync(path.join(ws.dir, 'brand-new', 'input.md')));
    assert.ok(fs.existsSync(path.join(ws.dir, 'brand-new', 'images')));
    const check = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-input.js'), 'brand-new'], { cwd: root, encoding: 'utf8', env });
    assert.equal(check.status, 1, '빈 양식은 입력 누락으로 멈춰야 해요');
  } finally {
    ws.cleanup();
  }
});
