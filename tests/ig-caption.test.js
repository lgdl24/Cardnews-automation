// 캡션 작성·근거 검토·버전 연결을 시험해요. 실제 Claude·인스타는 호출하지 않아요.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeWorkspace } = require('./helpers');
const { content, seedCaption } = require('./caption-helpers');
const { generateCaption, askClaude } = require('../scripts/lib/ig-caption-writer');
const { readCaption, FILE, inspectText } = require('../scripts/lib/ig-caption-draft');
const { resolveCaption } = require('../scripts/lib/ig-caption');
const { publishCheck } = require('../scripts/lib/publish-check');
const cfg = require('../config/instagram.json').caption;
const caution = require('../config/caution-expressions.json');
const options = (ws) => ({ productDir: ws.file(), data: ws.readCards(), inputText: ws.readInput(), cfg, caution });
const copy = (x) => JSON.parse(JSON.stringify(x));

test('새 문장으로 작성·의미 검토한 캡션만 저장하고 같은 자료는 재호출하지 않아요', async (t) => {
  const ws = makeWorkspace({ from: 'toneup-sunscreen-r1' }); t.after(ws.cleanup);
  const before = fs.readFileSync(ws.file('cards.json'), 'utf8');
  const prompts = [];
  const ask = async (prompt) => { prompts.push(prompt); return prompts.length === 1 ? content : { ok: true, issues: [] }; };
  const result = await generateCaption({ ...options(ws), ask });
  assert.equal(result.text.split('\n')[0], 'AI 활용');
  assert.match(result.text, /메이크업 전에는 어떤 선크림을 바르세요/);
  assert.equal(result.hashtags.length, 5);
  assert.match(result.text, /실제 판매 광고가 아니에요/);
  assert.doesNotMatch(result.text, /✔|^·/m);
  assert.match(prompts[1], /의미를 강화하거나 반대로 바꾸면 거절/);
  assert.equal(fs.readFileSync(ws.file('cards.json'), 'utf8'), before);
  assert.deepEqual((await generateCaption({ ...options(ws), ask })).text, result.text);
  assert.equal(prompts.length, 2);
  assert.equal(resolveCaption(ws.readCards(), cfg, { productDir: ws.file(), caution }).text, result.text);
});

test('잘못된 근거·새 수치·주의 표현은 저장 전에 막아요', async (t) => {
  const ws = makeWorkspace({ from: 'toneup-sunscreen-r1' }); t.after(ws.cleanup);
  for (const mutate of [
    (d) => { d.paragraphs[0].source_ids = ['S999']; },
    (d) => { d.paragraphs[0].text = '수분이 999% 늘어요.'; },
    (d) => { d.hashtags[0] = '약사추천'; d.paragraphs[0].text = '약사 추천 제품이에요.'; },
    (d) => { d.hashtags[1] = d.hashtags[0]; },
  ]) {
    const bad = copy(content); mutate(bad);
    await assert.rejects(generateCaption({ ...options(ws), ask: async () => bad }), /저장하지 않았어요/);
    assert.equal(fs.existsSync(ws.file('output', 'instagram', FILE)), false);
  }
  const strengthened = copy(content); strengthened.paragraphs[0].text = '다른 제품보다 더 좋아요.';
  let calls = 0;
  await assert.rejects(generateCaption({ ...options(ws), ask: async () => ++calls === 1 ? strengthened : { ok: false, issues: ['비교 근거가 없어요'] } }), /검토를 통과하지 못했어요/);
  assert.equal(fs.existsSync(ws.file('output', 'instagram', FILE)), false);
});

test('원문·카드·설정 변경, 작성 중 수정, 검토 뒤 글 변경은 이전 캡션을 무효로 해요', async (t) => {
  const ws = makeWorkspace({ from: 'toneup-sunscreen-r1' }); t.after(ws.cleanup);
  seedCaption(ws);
  const opts = options(ws);
  assert.deepEqual(readCaption(opts).errors, []);
  assert.match(readCaption({ ...opts, inputText: opts.inputText + '\n수정' }).errors[0], /바뀌었어요/);
  assert.match(readCaption({ ...opts, cfg: { ...cfg, writer_version: 'caption-v2' } }).errors[0], /바뀌었어요/);
  const file = ws.file('output', 'instagram', FILE);
  const record = JSON.parse(fs.readFileSync(file)); record.content.paragraphs[0].text = '다른 문장이에요.';
  fs.writeFileSync(file, JSON.stringify(record));
  assert.match(readCaption(opts).errors.join(' '), /근거 검토/);
  let calls = 0;
  await assert.rejects(generateCaption({ ...opts, force: true, ask: async () => {
    if (++calls === 1) return content;
    ws.editCards((d) => { d.cards[0].copy.title += ' 수정'; });
    return { ok: true, issues: [] };
  } }), /작성 중 카드나 원문이 바뀌었어요/);
  ws.editCards((d) => { d.stage = 'copy'; });
  await assert.rejects(generateCaption({ ...options(ws), ask: () => assert.fail('승인 전에 모델을 호출하면 안 돼요') }), /최종 승인/);
});

test('게시 전 점검도 같은 글을 읽고 새 문장의 사람 확인·수치·주의 표현을 검사해요', (t) => {
  const ws = makeWorkspace({ from: 'toneup-sunscreen-r1' }); t.after(ws.cleanup);
  seedCaption(ws);
  const check = (data = ws.readCards()) => publishCheck({ productDir: ws.file(), data, sourceText: require('../scripts/lib/common').parseInput(ws.readInput()).productText, validation: { errors: [] }, caution });
  assert.equal(check().checks.find((x) => x.id === 'caption').status, 'pass');
  assert.equal(check().checks.find((x) => x.id === 'caption_review').status, 'warn');
  // 명시적 편집 캡션이 기존 작성 파일보다 우선하고 원문 밖 주의 표현도 막아요.
  const data = ws.readCards(); data.caption = { text: 'AI 활용\n약사 추천으로 999% 좋아져요' };
  assert.equal(check(data).checks.find((x) => x.id === 'caption').status, 'fail');
  assert.ok(inspectText('본문\n#AI활용', '', caution).errors.length);
  ws.writeInput(ws.readInput() + '\n다른 내용');
  assert.equal(check().checks.find((x) => x.id === 'caption').status, 'fail');
});

test('Claude 실행은 도구 없는 격리 폴더·구조화 응답을 사용하고 오류 출력을 숨겨요', async (t) => {
  const ws = makeWorkspace({ from: 'toneup-sunscreen-r1' }); t.after(ws.cleanup);
  const bin = ws.file('fake-caption.cjs');
  fs.writeFileSync(bin, `const a=process.argv; if(a[a.indexOf('--tools')+1] !== '' || !a.includes('--strict-mcp-config')) process.exit(2); process.stdin.resume(); process.stdin.on('end',()=>console.log(JSON.stringify({subtype:'success',structured_output:{ok:true,issues:[]}})));`);
  assert.deepEqual(await askClaude('시험 자료예요', { type: 'object' }, { bin }), { ok: true, issues: [] });
  fs.writeFileSync(bin, `console.error('IGAA-fake-private'); process.exit(1);`);
  await assert.rejects(askClaude('자료', {}, { bin }), (e) => !e.message.includes('IGAA') && /끝나지 않았어요/.test(e.message));
});

test('젤크림·평가용 가상 제품의 기대 예시는 원문 근거·수치·주의 표현 검사에 맞아요', () => {
  const { contextOf, validateDraft, formatDraft } = require('../scripts/lib/ig-caption-draft');
  for (const example of require('./fixtures/instagram-caption-examples.json')) {
    const context = contextOf(example.data, example.input);
    assert.deepEqual(validateDraft(example.content, context, cfg, caution), [], example.id);
    const after = formatDraft(example.content, cfg).text;
    assert.equal(after.split('\n')[0], 'AI 활용');
    assert.ok(after.split('\n')[1].trim(), '인스타 미리보기의 둘째 줄에 도입을 보여줘요');
    assert.match(after, /상상|가상/);
    assert.ok(inspectText(after, context.sourceText, caution).cautions.every((c) => c.in_source), '주의 표현이 있다면 원문 근거와 사람 확인을 유지해요');
  }
});
