// 피그마 자동 보내기 (작업실 '피그마에서 편집'): 로컬 Claude Code의 피그마 연결로 카드 1~5번을 새 페이지에 넣음
// 플러그인 없이 동작. 작업실이 figma-export(--page-name) 뒤에 claude -p를 돌리고, Claude는 아래 순서만 따름
//   1) 새 페이지 만들기(use_figma)  2) upload_assets로 주소 받기  3) 이 스크립트 upload로 이미지 올리기  4) build-*.js를 use_figma로 실행
// 사용법: node scripts/figma-push.js upload <제품ID> <페이지ID> <submitUrl...>
//   output/figma-export/images/*.png (이름순)를 받은 주소에 하나씩 올림. 파일 이름이 피그마 레이어 이름이 되고 build-*.js가 그 이름으로 찾음
const fs = require('fs');
const path = require('path');
const { paths, requireProductId } = require('./lib/common');

const UPLOAD_RE = /^https:\/\/mcp\.figma\.com\/mcp\/upload\/[0-9a-f-]{36}\/submit(\?[^\s]*)?$/;
const FIGMA_TOOLS = ['create_session', 'use_figma', 'upload_assets'].map((t) => `mcp__claude_ai_Figma__${t}`);

function exportInfo(id) {
  const dir = paths.product(id, 'output', 'figma-export');
  const layers = JSON.parse(fs.readFileSync(path.join(dir, 'layers.json'), 'utf8'));
  const images = fs.readdirSync(path.join(dir, 'images')).filter((f) => f.endsWith('.png')).sort();
  const builds = fs.readdirSync(dir).filter((f) => /^build-\d+\.js$/.test(f)).sort((a, b) => parseInt(a.slice(6), 10) - parseInt(b.slice(6), 10));
  return { dir, page: layers.cards[0].page, images, builds: builds.map((f) => path.relative(paths.root, path.join(dir, f))) };
}

function fileKeyOf(url) {
  const m = String(url || '').match(/figma\.com\/(?:design|file)\/([0-9a-zA-Z]{22,128})/);
  return m ? m[1] : null;
}

// claude -p 에 줄 지시문 (피그마 넣기만. 카드 제작 규칙과 무관)
function buildPushPrompt({ id, fileKey, info }) {
  const pageCode = `const name = ${JSON.stringify(info.page)};\nlet page = figma.root.children.find((p) => p.name === name);\nif (!page) { page = figma.createPage(); page.name = name; }\nawait figma.setCurrentPageAsync(page);\nreturn page.id;`;
  return `피그마 보내기 작업이에요. 아래 순서만 그대로 하고, 다른 파일을 읽거나 다른 명령을 실행하지 마세요. 카드 문구·디자인을 고치지 마세요.

피그마 fileKey: ${fileKey}

1. ${FIGMA_TOOLS[0]} 를 fileKey로 한 번 호출해요 (description: "카드뉴스 ${id} 카드 넣기"). 받은 sessionId를 이후 피그마 호출에 넣어요.
2. ${FIGMA_TOOLS[1]} 를 아래 code 그대로 호출해 페이지 ID를 받아요.
\`\`\`js
${pageCode}
\`\`\`
3. ${FIGMA_TOOLS[2]} 를 count=${info.images.length}, currentPageId=<2번의 페이지 ID> 로 호출해요.
4. Bash로 이 명령 하나만 실행해요. 받은 submitUrl ${info.images.length}개를 받은 순서대로 뒤에 붙여요:
   node scripts/figma-push.js upload ${id} <페이지 ID> <submitUrl 1> <submitUrl 2> ...
5. 다음 파일을 차례로 Read 해서, 파일 내용 전체를 고치지 말고 그대로 ${FIGMA_TOOLS[1]} 의 code로 넘겨요:
${info.builds.map((b) => `   - ${b}`).join('\n')}
6. 마지막 답변은 이 한 줄만 써요: {"ok": true, "pageId": "<페이지 ID>"} (중간에 실패하면 {"ok": false, "error": "<이유>"})`;
}

async function upload(id, pageId, urls) {
  const info = exportInfo(id);
  if (!/^\d+:\d+$/.test(pageId || '')) throw new Error(`페이지 ID 형식이 아니에요: ${pageId}`);
  if (urls.length !== info.images.length) throw new Error(`주소 ${urls.length}개, 이미지 ${info.images.length}개 — 개수가 같아야 해요`);
  const bad = urls.find((u) => !UPLOAD_RE.test(u));
  if (bad) throw new Error(`피그마 업로드 주소가 아니에요: ${bad}`);
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      const file = info.images[i];
      const form = new FormData();
      form.append('file', new Blob([fs.readFileSync(path.join(info.dir, 'images', file))], { type: 'image/png' }), file);
      const url = new URL(urls[i]);
      url.searchParams.set('currentPageId', pageId);
      try {
        const res = await fetch(url, { method: 'POST', body: form });
        const text = await res.text();
        results[i] = { file, ok: res.ok && /"success"\s*:\s*true/.test(text), status: res.status };
      } catch (e) {
        results[i] = { file, ok: false, error: e.message };
      }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  return results;
}

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd !== 'upload') { console.error('사용법: node scripts/figma-push.js upload <제품ID> <페이지ID> <submitUrl...>'); process.exit(2); }
  const id = requireProductId(rest);
  upload(id, rest[1], rest.slice(2))
    .then((r) => {
      const failed = r.filter((x) => !x.ok);
      console.log(JSON.stringify({ uploaded: r.length - failed.length, failed }));
      process.exit(failed.length ? 1 : 0);
    })
    .catch((e) => { console.error(`[오류] ${e.message}`); process.exit(2); });
}

module.exports = { exportInfo, fileKeyOf, buildPushPrompt, upload, FIGMA_TOOLS, UPLOAD_RE };
