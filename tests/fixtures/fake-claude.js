#!/usr/bin/env node
// 테스트용 가짜 Claude Code: `claude -p --output-format stream-json`처럼 stdin으로 지시문을 받고 JSON 줄을 내보낸다.
// 작업 폴더(cwd)의 products/<제품ID>/cards.json을 시나리오대로 바꾸고, 진짜 검증 스크립트를 돌린다.
//   FAKE_CLAUDE_SCENARIO: ok(기본) | stopped(입력 누락으로 중단) | bad-stage(stage를 틀리게) | no-result(결과 없이 종료)
//   FAKE_CLAUDE_SOURCE: 승인된 cards.json 원본 경로 (문구·이미지가 채워진 예시)
//   FAKE_CLAUDE_PNG_DIR: 출력 PNG로 쓸 파일이 있는 폴더 (card-01.png …)
//   FAKE_CLAUDE_ARGS_OUT: 받은 인자를 저장할 파일 (인자 확인 테스트용)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');
// claude -v · claude auth status (로컬 제작 API의 설치·로그인 확인)
if (process.argv[2] === '-v') {
  process.stdout.write('9.9.9 (Fake Claude Code)\n');
  process.exit(0);
}
if (process.argv[2] === 'auth') process.exit(0);
const scenario = process.env.FAKE_CLAUDE_SCENARIO || 'ok';
if (process.env.FAKE_CLAUDE_ARGS_OUT) fs.writeFileSync(process.env.FAKE_CLAUDE_ARGS_OUT, JSON.stringify(process.argv.slice(2)));

let prompt = '';
process.stdin.on('data', (d) => (prompt += d));
process.stdin.on('end', () => {
  const id = (prompt.match(/제품ID:\s*([a-z0-9-]+)/) || [])[1];
  const kind = /구성안 작업/.test(prompt) ? 'plan' : /문구·출력 작업/.test(prompt) ? 'copy' : 'revise';
  const reviseStage = (prompt.match(/단계:\s*(plan|final)/) || [])[1];
  emit({ type: 'system', subtype: 'init', model: 'fake-model', env_mode: process.env.CARDNEWS_MODE });
  const product = path.join(process.cwd(), 'products', id);
  const cardsFile = path.join(product, 'cards.json');
  const tool = (command) => emit({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } });

  if (scenario === 'no-result') process.exit(1);
  if (scenario === 'stopped') {
    tool(`npm run check -- ${id}`);
    emit({ type: 'result', subtype: 'success', is_error: false, num_turns: 2, duration_ms: 1000, result: '결과: 중단\n단계: plan\n오류: INPUT_MISSING ## 제품 설명\n알림: 없음' });
    return;
  }

  const source = JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_SOURCE, 'utf8'));
  let data;
  if (kind === 'plan' || (kind === 'revise' && reviseStage === 'plan')) {
    data = { ...source, stage: 'plan', cards: source.cards.map(({ copy, ...c }) => c) };
    if (kind === 'revise') data.cards[0].intent += ' (수정됨)';
  } else {
    data = { ...source, stage: 'copy' };
    if (kind === 'revise') data.cards[2].copy.title = '가볍게, 자연스럽게!';
  }
  if ('product_id' in data) data.product_id = id;
  if (scenario === 'bad-stage') data.stage = 'approved';
  emit({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: `products/${id}/cards.json` } }] } });
  fs.writeFileSync(cardsFile, JSON.stringify(data, null, 2));

  tool(`npm run validate -- ${id}`);
  spawnSync(process.execPath, [path.join(process.cwd(), 'scripts', 'validate.js'), id], { cwd: process.cwd(), env: process.env });

  if (data.stage === 'copy' || data.stage === 'approved') {
    const out = path.join(product, 'output');
    fs.mkdirSync(path.join(out, 'png'), { recursive: true });
    const nos = kind === 'revise' ? [3] : data.cards.map((c) => c.no);
    for (const no of nos) {
      const name = `card-${String(no).padStart(2, '0')}.png`;
      fs.copyFileSync(path.join(process.env.FAKE_CLAUDE_PNG_DIR, name), path.join(out, 'png', name));
    }
    const report = { product_id: id, rendered_at: new Date().toISOString(), results: nos.map((no) => ({ no, issues: [], overlaps: [] })) };
    const file = kind === 'revise' ? 'render-report-card-03.json' : 'render-report.json';
    tool(`npm run render -- ${id}${kind === 'revise' ? ' --card 3' : ''}`);
    fs.writeFileSync(path.join(out, file), JSON.stringify(report, null, 2));
  }
  emit({ type: 'assistant', message: { content: [{ type: 'text', text: '작업을 마쳤어요.' }] } });
  emit({
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 4,
    duration_ms: 2000,
    result: `결과: 완료\n단계: ${data.stage === 'plan' ? 'plan' : 'copy'}\n오류: 없음\n알림: 없음`,
  });
});
