const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {ROOT,makeWorkspace}=require('./helpers');
const {loadConfig,designOf,parseInput}=require('../scripts/lib/common');
const {checkInput}=require('../scripts/check-input');
const {validate,quality}=require('../scripts/validate');
const {buildCardHtml}=require('../scripts/lib/card-html');
const base=require('../config/templates.json');
const {colorModeOf,decideColors}=require('../scripts/lib/color-mood');

test('무드 선택은 기본·프리미엄, 빈 값과 잘못된 값은 기본',()=>{
 assert.equal(designOf(null),'기본'); assert.equal(designOf({cond:{무드:'프리미엄'}}),'프리미엄');
 assert.equal(designOf({cond:{무드:'잘못된 값'}}),'기본');
 const ws=makeWorkspace();try{ws.writeInput(ws.readInput()+'\n## 무드\n없는 묶음\n');const r=ws.use(checkInput);assert.ok(r.warnings.some(x=>x.where==='## 무드'));}finally{ws.cleanup();}
});
test('기본 정의 보존, 프리미엄만 파일·사진·글자 수 변경',()=>{
 const d=loadConfig().templates,l=loadConfig({cond:{무드:'프리미엄'}}).templates;
 for(const key of ['cover','image','description']){assert.deepEqual(d[key],base[key]);assert.equal(l[key].file,'templates/premium/'+key+'.html');}
 assert.equal(d.description.image,'none'); assert.equal(l.description.image,'optional');
 assert.deepEqual(Object.keys(l).filter(k=>!k.startsWith('_')),['cover','image','description']);
});
test('프리미엄 설명형 사진과 글자 수 검증·품질 지표가 같은 묶음 사용',()=>{
 const ws=makeWorkspace();try{
 ws.writeInput(ws.readInput()+'\n## 무드\n프리미엄\n');
 ws.editCards(d=>{for(const c of d.cards){c.copy.title='짧은 제목'; if(c.copy.subtitle)c.copy.subtitle='설명';if(c.copy.caption)c.copy.caption='설명';if(c.copy.items)c.copy.items=['주요 특징'];}const c=d.cards.find(c=>c.template==='description');c.image='main.png';});
 const r=ws.use(validate);assert.deepEqual(r.report.errors,[]);assert.ok(!r.report.warnings.some(x=>/이미지를 쓰지/.test(x.message)));
 assert.ok(ws.use(id=>quality(validate(id))).char_usage!==null);
 ws.editCards(d=>{d.cards[0].copy.title='가'.repeat(base._designs['프리미엄'].cover.fields.title.maxChars+1);});assert.ok(ws.use(validate).report.errors.some(x=>x.code==='CHAR_LIMIT'));
 }finally{ws.cleanup();}
});
test('role·투명 여백 스타일은 새 템플릿에서만 사용',()=>{
 const theme=loadConfig().theme,l=loadConfig({cond:{무드:'프리미엄'}}).templates;
 const args={total:5,product:'테스트',theme,htmlDir:path.join(ROOT,'tmp'),imageDir:path.join(ROOT,'products/toneup-sunscreen/images'),imageCrop:{left:.2,top:.1,width:.6,height:.8}};
 const card={no:1,role:'closing',template:'cover',image:'main.png',copy:{title:'안내'}};
 const html=buildCardHtml({...args,card,tpl:l.cover});assert.match(html,/role-closing/);assert.match(html,/object-view-box: inset/);
 const plain=buildCardHtml({...args,card,tpl:base.cover});assert.ok(!plain.includes('object-view-box: inset'));assert.ok(!plain.includes('role-closing'));
});

test('묶음 이름은 설정에서 찾고, 프리미엄만 제품 색을 기본으로 사용',()=>{
 const config={_designs:{'새 무드':{}}};
 assert.equal(designOf({cond:{무드:'새 무드'}},config),'새 무드');
 assert.equal(designOf({cond:{무드:'toString'}},config),'기본');
 assert.equal(colorModeOf({cond:{무드:'프리미엄'}}),'제품 색');
 assert.equal(colorModeOf({cond:{무드:'프리미엄','카드 색':'기본'}}),'기본');
 assert.equal(colorModeOf({cond:{무드:'프리미엄','카드 색':'제품 색'}}),'제품 색');
 assert.equal(colorModeOf({cond:{무드:'프리미엄','카드 색':'없는 색'}}),'기본');
 assert.equal(colorModeOf({cond:{무드:'없는 묶음'}}),'기본');
 for(const pixels of [null,[255,255,255,255]]){
  const r=decideColors({mode:colorModeOf({cond:{무드:'프리미엄'}}),baseColor:loadConfig().theme.color,pixels});
  assert.equal(r.source,'theme');assert.equal(r.ok,true);assert.ok(r.note);
 }
});

test('프리미엄 머리말은 특징 순서·사용법 역할에서 만들고 카드 구조는 유지',()=>{
 const tpl=loadConfig({cond:{무드:'프리미엄'}}).templates;
 const cards=[{no:1,role:'cover'},{no:2,role:'feature'},{no:3,role:'feature'},{no:4,role:'usage'}];
 const args={cards,total:5,product:'테스트',theme:loadConfig().theme,htmlDir:path.join(ROOT,'tmp'),imageDir:ROOT};
 for(const no of [2,3,4]){
  const card={...cards[no-1],template:'description',image:'main.png',copy:{title:'안내',items:['첫 항목']}};
  const html=buildCardHtml({...args,card,tpl:tpl.description});
  assert.ok(html.includes(no===4?'How to':'Point '+(no-1)));
  assert.ok(html.includes(no%2===0?'photo-left':'photo-right'));
  assert.ok(!/PRODUCT NOTES|PRODUCT DETAIL|PRODUCT GUIDE/.test(html));
 }
 const ws=makeWorkspace();try{ws.editCards(d=>{d.cards.find(c=>c.template==='image').copy.items=['허용 안 됨'];});assert.ok(ws.use(validate).report.errors.some(x=>x.code==='SCHEMA_ERROR'));}finally{ws.cleanup();}
});

test('check: 기본이 아닌 무드면 그 무드의 템플릿별 글자 수 기준을 같이 보여준다', () => {
  const { moodLimitLines } = require('../scripts/check-input');
  assert.deepEqual(moodLimitLines({ cond: {} }), []);
  const lines = moodLimitLines({ cond: { 무드: '프리미엄' } });
  assert.match(lines[0], /_designs\.프리미엄/);
  const tpl = loadConfig({ cond: { 무드: '프리미엄' } }).templates;
  const items = tpl.description.fields.items;
  assert.ok(lines.some((l) => l.includes(`items 최대 ${items.maxItems}개·항목당 ${items.maxCharsPerItem}자·한 줄 ${items.maxCharsPerLine}자·${items.maxLines}줄`)));
  const ws = makeWorkspace();
  try {
    ws.writeInput(`${ws.readInput()}\n## 무드\n프리미엄\n`);
    const r = ws.run('check-input.js');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /무드: 프리미엄 — 글자 수 기준은 config\/templates\.json _designs\.프리미엄/);
  } finally {
    ws.cleanup();
  }
});
