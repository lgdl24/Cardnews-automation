const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {makeWorkspace,ROOT}=require('./helpers');const {measure}=require('../scripts/calibrate');
const {launchBrowser,buildCardHtml,inspectPage}=require('../scripts/lib/card-html');const {readPixels}=require('../scripts/lib/color-mood');const {loadConfig}=require('../scripts/lib/common');
const {pathToFileURL}=require('node:url');const os=require('node:os');
test('프리미엄: 모든 문구 칸·이미지 유무에서 기준까지 채워도 넘침 없음',async()=>{
 const res=await measure({fullOnly:true,design:'프리미엄'});assert.equal(res.fontOk,true);assert.deepEqual(res.full.filter(x=>!x.ok),[]);
});
test('프리미엄 5장 역할·설명형 사진 출력, 기존 제품 파일 보존',async()=>{
 const ws=makeWorkspace();try{
 ws.writeInput(ws.readInput()+'\n## 무드\n프리미엄\n');ws.editCards(d=>{for(const c of d.cards){c.copy.title='짧은 제목';if(c.copy.subtitle)c.copy.subtitle='원문 안내';if(c.copy.caption)c.copy.caption='원문 설명';if(c.copy.items)c.copy.items=['주요 특징','사용 안내'];}d.cards[2].image='main.png';});
 ws.editCards(d=>{
  d.stage='approved'; // 임시 시험 자료만 웹 내보내기까지 검사
  d.cards[0].copy.title='여백이 전하는\n제품의 인상';d.cards[0].copy.subtitle='프리미엄 배치를 확인하는 시험 카드';
  d.cards[1].copy.title='사진과 문구의\n균형';d.cards[1].copy.caption='큰 제품 사진과\n간결한 설명으로\n배치를 확인해요';
  d.cards[2].copy.title='글과 사진을\n나란히';d.cards[2].copy.items=['사진 쪽은 옅은 제품 색','문구 쪽은 흰 바탕','가는 선으로 나눈 목록'];
  d.cards[3].image='main.png';d.cards[3].copy.title='이렇게 확인해요';d.cards[3].copy.items=['입력에서 무드 선택','제품 색 적용 결과 확인','문구와 사진 배치 점검'];
  d.cards[4].image='main.png';d.cards[4].copy.title='제품의 인상을\n남기다';d.cards[4].copy.subtitle='브랜드 무드를 확인하는 시험 카드';
 });
 if(process.env.CARDNEWS_TEST_IMAGE)fs.copyFileSync(process.env.CARDNEWS_TEST_IMAGE,ws.file('images/main.png'));
 const r=ws.run('render.js',['--no-log']);assert.equal(r.status,0,r.stdout+r.stderr);
 if(process.env.CARDNEWS_DESIGN_CAPTURE_DIR){fs.mkdirSync(process.env.CARDNEWS_DESIGN_CAPTURE_DIR,{recursive:true});for(let n=1;n<=5;n++)fs.copyFileSync(ws.file('output/png/card-0'+n+'.png'),path.join(process.env.CARDNEWS_DESIGN_CAPTURE_DIR,'card-0'+n+'.png'));}
 const report=JSON.parse(fs.readFileSync(ws.file('output/render-report.json'),'utf8'));assert.ok(report.results.every(r=>r.fontOk&&!r.issues.length&&!r.overlaps.length));
 assert.equal(report.colors.mode,'제품 색');assert.equal(report.colors.ok,true);
 if(process.env.CARDNEWS_DESIGN_CAPTURE_DIR)fs.writeFileSync(path.join(process.env.CARDNEWS_DESIGN_CAPTURE_DIR,'render-report.json'),JSON.stringify(report,null,2));
 const exported=ws.use(id=>require('../scripts/lib/web-data').buildProject(id));assert.equal(exported.ok,true,JSON.stringify(exported));
 assert.equal(exported.project.cards.find(c=>c.template==='description').chars.find(c=>c.field==='items').limit,loadConfig({cond:{무드:'프리미엄'}}).templates.description.fields.items.maxCharsPerItem);
 if(exported.project.spec_version==='0.3')assert.equal(exported.project.colors.mode,'제품 색');
 for(const c of ws.readCards().cards){const h=fs.readFileSync(ws.file('output/html/card-'+String(c.no).padStart(2,'0')+'.html'),'utf8');assert.ok(h.includes('role-'+c.role));}
 const browser=await launchBrowser();try{const page=await browser.newPage();for(const c of ws.readCards().cards){await page.goto(pathToFileURL(ws.file('output/html/card-'+String(c.no).padStart(2,'0')+'.html')).href);const images=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>i.offsetParent!==null).map(i=>{const r=i.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};}));assert.ok(images.every(r=>r.left>=0&&r.top>=0&&r.right<=1080&&r.bottom<=1080),JSON.stringify(images));if(c.role==='usage')assert.equal(images.length,1,'사용법도 사진이 있으면 보임');}}finally{await browser.close();}
 assert.ok(!fs.existsSync(ws.file('log.jsonl')));
 }finally{ws.cleanup();}
});

test('프리미엄은 흰 사진이면 기본 색으로 대체, 직접 지정한 기본 색과 사진 없는 표지도 지원',async()=>{
 const ws=makeWorkspace();const browser=await launchBrowser();
 try{
  const page=await browser.newPage();
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=100;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,100,100);return c.toDataURL().split(',')[1];});
  fs.writeFileSync(ws.file('images/main.png'),Buffer.from(png,'base64'));
  ws.writeInput(ws.readInput()+'\n## 무드\n프리미엄\n');
  ws.editCards(d=>{for(const c of d.cards){c.copy.title='짧은 제목';if(c.copy.subtitle)c.copy.subtitle='설명';if(c.copy.caption)c.copy.caption='설명';if(c.copy.items)c.copy.items=['첫 항목'];}d.cards[0].image=null;});
  let run=ws.run('render.js',['--no-log']);assert.equal(run.status,0,run.stdout+run.stderr);
  let report=JSON.parse(fs.readFileSync(ws.file('output/render-report.json'),'utf8'));
  assert.equal(report.colors.mode,'제품 색');assert.equal(report.colors.source,'theme');assert.match(report.colors.note,/색 있는 부분/);
  assert.ok(report.results.every(r=>!r.issues.length&&!r.overlaps.length));
  ws.writeInput(ws.readInput()+'\n## 카드 색\n기본\n');
  run=ws.run('render.js',['--no-log','--card','1']);assert.equal(run.status,0,run.stdout+run.stderr);
  report=JSON.parse(fs.readFileSync(ws.file('output/render-report-card-01.json'),'utf8'));
  assert.equal(report.colors.mode,'기본');assert.equal(report.colors.note,null);
 }finally{await browser.close();ws.cleanup();}
});
test('투명 여백은 alpha 경계 사용, 빈 투명 사진은 자르지 않음',async()=>{
 const browser=await launchBrowser();const page=await browser.newPage();const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cardnews-crop-'));
 try{
 assert.equal(await page.evaluate(()=>CSS.supports('object-view-box','inset(10% 10% 10% 10%)')),true);
 const bytes=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=100;const x=c.getContext('2d');x.fillStyle='#A080B0';x.fillRect(20,10,60,80);return c.toDataURL().split(',')[1];});
 const file=path.join(dir,'crop.png');fs.writeFileSync(file,Buffer.from(bytes,'base64'));const r=await readPixels(page,file,{withBounds:true});assert.deepEqual(r.bounds,{left:.2,top:.1,width:.6,height:.8});assert.equal((await readPixels(page,file)).length,40000);
 const blank=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=20;c.height=20;return c.toDataURL().split(',')[1];});fs.writeFileSync(file,Buffer.from(blank,'base64'));assert.equal((await readPixels(page,file,{withBounds:true})).bounds,null);
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
});
