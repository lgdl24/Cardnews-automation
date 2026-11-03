// 피그마 플러그인 code.js 만들기: scripts/lib/figma-builder.js(프레임 만드는 함수) + figma-plugin/main.src.js
// 사용법: node scripts/build-figma-plugin.js [--check]
//   --check : code.js가 지금 소스와 같은지만 확인 (다르면 종료 코드 1). 테스트가 씀
// 피그마 플러그인은 파일 하나(code.js)만 읽으므로 합쳐서 저장함. code.js는 저장소에 같이 커밋 (피그마 데스크톱에서 manifest만 불러오면 바로 쓰게)
const fs = require('fs');
const path = require('path');
const { BUILDER_SOURCE, FONT_FALLBACK } = require('./lib/figma-builder');

const DIR = path.join(__dirname, '..', 'figma-plugin');

function buildPluginCode() {
  const main = fs.readFileSync(path.join(DIR, 'main.src.js'), 'utf8');
  return [
    '// 자동 생성 파일 — 고치지 말고 figma-plugin/main.src.js·scripts/lib/figma-builder.js를 고친 뒤 npm run figma-plugin',
    `const FONT_FALLBACK = ${JSON.stringify(FONT_FALLBACK)};`,
    BUILDER_SOURCE,
    main,
  ].join('\n') + '\n';
}

if (require.main === module) {
  const code = buildPluginCode();
  const file = path.join(DIR, 'code.js');
  if (process.argv.includes('--check')) {
    const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === code;
    console.log(same ? 'figma-plugin/code.js 최신' : 'figma-plugin/code.js가 소스와 달라요 → npm run figma-plugin');
    process.exit(same ? 0 : 1);
  }
  fs.writeFileSync(file, code);
  console.log(`figma-plugin/code.js 만들었어요 (${code.length}자)`);
}

module.exports = { buildPluginCode };
