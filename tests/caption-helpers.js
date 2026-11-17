// 실제 모델 호출 없이 근거 검토를 마친 캡션 시험 파일을 만들어요.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { keyOf, formatDraft, FILE } = require('../scripts/lib/ig-caption-draft');
const cfg = require('../config/instagram.json').caption;
const content = require('./fixtures/ig-caption-content.json');
function seedCaption(ws, draft = content) {
  const dir = ws.file('output', 'instagram');
  fs.mkdirSync(dir, { recursive: true });
  const record = { input_key: keyOf(ws.readCards(), ws.readInput(), cfg), content: draft, review: { ok: true, content_hash: crypto.createHash('sha256').update(JSON.stringify(draft)).digest('hex') } };
  fs.writeFileSync(path.join(dir, FILE), JSON.stringify(record));
  fs.writeFileSync(path.join(dir, 'caption.txt'), formatDraft(draft, cfg).text + '\n');
}
module.exports = { seedCaption, content };
