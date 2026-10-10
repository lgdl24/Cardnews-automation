// 테스트 공통: 예시 제품을 임시 폴더에 복사하고, 입력·카드 데이터를 고쳐 오류 상황을 만든다.
// 실제 products/ 폴더와 제작 기록(log.jsonl)은 건드리지 않는다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SAMPLE_ID = 'toneup-sunscreen';
const SKIP = new Set(['output', 'log.jsonl', '.job.json']);

// 예시 제품을 임시 products 폴더에 복사. 반환된 ws로 파일을 읽고 고친다.
function makeWorkspace({ from = SAMPLE_ID, id = from } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-test-'));
  const src = path.join(ROOT, 'products', from);
  const dst = path.join(dir, id);
  fs.cpSync(src, dst, { recursive: true, filter: (p) => !SKIP.has(path.basename(p)) });

  const file = (...rest) => path.join(dst, ...rest);
  const ws = {
    dir,
    id,
    file,
    readInput: () => fs.readFileSync(file('input.md'), 'utf8'),
    writeInput: (text) => fs.writeFileSync(file('input.md'), text),
    editInput: (fn) => ws.writeInput(fn(ws.readInput())),
    readCards: () => JSON.parse(fs.readFileSync(file('cards.json'), 'utf8')),
    writeCards: (data) => fs.writeFileSync(file('cards.json'), JSON.stringify(data, null, 2)),
    editCards: (fn) => {
      const data = ws.readCards();
      fn(data);
      ws.writeCards(data);
    },
    // 이 작업 공간을 대상으로 함수 실행 (CARDNEWS_PRODUCTS_DIR를 잠시 바꿈)
    use: (fn) => withEnv({ CARDNEWS_PRODUCTS_DIR: dir, CARDNEWS_NO_LOG: '1' }, () => fn(id)),
    // 스크립트를 별도 프로세스로 실행 (npm run과 같은 방식)
    run: (script, args = [], env = {}) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), id, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, CARDNEWS_PRODUCTS_DIR: dir, CARDNEWS_MODE: '', CARDNEWS_JOB_ID: '', ...env },
    }),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
  return ws;
}

function withEnv(vars, fn) {
  const before = {};
  for (const [k, v] of Object.entries(vars)) {
    before[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// 입력 양식에서 '## 항목' 하나를 통째로 지운다
function removeSection(markdown, title) {
  return markdown.replace(new RegExp(`## ${title}\\n[\\s\\S]*?(?=\\n#{1,2} |$)`), '');
}

// 입력 양식에서 '## 항목'의 내용을 바꾼다
function replaceSection(markdown, title, body) {
  return markdown.replace(new RegExp(`(## ${title}\\n)[\\s\\S]*?(?=\\n#{1,2} |$)`), `$1${body}\n`);
}

const codes = (report) => [...new Set(report.errors.map((e) => e.code))].sort();

module.exports = { ROOT, SAMPLE_ID, makeWorkspace, withEnv, removeSection, replaceSection, codes };
