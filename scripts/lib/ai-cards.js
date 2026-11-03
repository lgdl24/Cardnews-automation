// AI 디자인 카드(첫·마지막 카드)를 최종 카드에 넣고 빼는 공통 규칙 (브라우저 없이)
//   - 대상: 첫 카드와 마지막 카드 (aiTargets)
//   - 신선도: 카드 문구·사진·템플릿으로 만든 key가 AI 카드를 만들 때와 같아야 씀 (문구를 고치면 다시 만들어야 함)
//   - 적용: output/png/card-NN.png 를 AI 카드로 바꾸고, 템플릿 출력은 output/ai-card/template-card-NN.png 로 보관
//   render.js(다시 출력해도 AI 카드 유지), ai-card.js(만든 뒤 바로 적용), 작업실·피그마 내보내기가 같이 씀
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const pad = (n) => String(n).padStart(2, '0');

function aiTargets(cards) {
  const list = cards || [];
  const first = list[0];
  const last = list[list.length - 1];
  return [first, last].filter((c, i, arr) => c && arr.indexOf(c) === i).map((c) => c.no);
}

function cardKey(card) {
  const body = JSON.stringify({ copy: card.copy || {}, image: card.image || null, template: card.template || null });
  return crypto.createHash('sha1').update(body).digest('hex').slice(0, 12);
}

const aiDirOf = (productDir) => path.join(productDir, 'output', 'ai-card');

function readReport(productDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(aiDirOf(productDir), 'ai-card.json'), 'utf8'));
  } catch {
    return null;
  }
}

// 지금 문구와 맞는 AI 카드 기록 (없으면 null)
function freshRecord(productDir, card, report = readReport(productDir)) {
  if (!report || !Array.isArray(report.cards)) return null;
  const r = report.cards.find((c) => c.no === card.no);
  if (!r || !r.ok || !r.file || r.key !== cardKey(card)) return null;
  return fs.existsSync(path.join(aiDirOf(productDir), r.file)) ? r : null;
}

// 아직 AI 카드가 없거나 문구가 바뀐 대상 카드 번호
function staleTargets(productDir, cards) {
  const report = readReport(productDir);
  return aiTargets(cards).filter((no) => !freshRecord(productDir, cards.find((c) => c.no === no), report));
}

const sameFile = (a, b) => fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));

// output/png 에 AI 카드 넣기. only: 이 번호들만 (render.js --card N)
function applyAiCards(productDir, cards, { only = null } = {}) {
  const pngDir = path.join(productDir, 'output', 'png');
  const dir = aiDirOf(productDir);
  const report = readReport(productDir);
  const applied = [];
  const stale = [];
  for (const no of aiTargets(cards)) {
    if (only && !only.includes(no)) continue;
    const card = cards.find((c) => c.no === no);
    const rec = freshRecord(productDir, card, report);
    if (!rec) { stale.push(no); continue; }
    const target = path.join(pngDir, `card-${pad(no)}.png`);
    const ai = path.join(dir, rec.file);
    if (!fs.existsSync(target)) continue; // 템플릿 출력이 먼저 있어야 함 (비교·되돌리기용)
    if (!sameFile(target, ai)) {
      fs.copyFileSync(target, path.join(dir, `template-card-${pad(no)}.png`));
      fs.copyFileSync(ai, target);
    }
    applied.push(no);
  }
  return { applied, stale };
}

// output/png 에 지금 AI 카드가 들어가 있는 번호 (피그마 내보내기·화면 표시)
function appliedNumbers(productDir, cards) {
  const report = readReport(productDir);
  return aiTargets(cards).filter((no) => {
    const rec = freshRecord(productDir, cards.find((c) => c.no === no), report);
    return rec && sameFile(path.join(productDir, 'output', 'png', `card-${pad(no)}.png`), path.join(aiDirOf(productDir), rec.file));
  });
}

module.exports = { aiTargets, cardKey, readReport, freshRecord, staleTargets, applyAiCards, appliedNumbers };
