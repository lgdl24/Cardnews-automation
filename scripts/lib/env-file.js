// 저장소의 .env에서 필요한 키만 읽음 (이미 환경변수에 있으면 그 값). 값은 출력하지 않는다
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function readEnvKeys(keys, { file = path.join(ROOT, '.env'), env = process.env } = {}) {
  const out = {};
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    /* .env 없음 */
  }
  const fromFile = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) fromFile[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  for (const k of keys) {
    const v = env[k] ?? fromFile[k];
    if (v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

module.exports = { readEnvKeys };
