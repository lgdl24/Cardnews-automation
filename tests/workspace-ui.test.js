// User flows use intercepted APIs; no real product saves or Claude jobs are run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const ROOT=path.resolve(__dirname,'..');
const index=JSON.parse(fs.readFileSync(path.join(ROOT,'web/public/data/index.json')));
const sample=JSON.parse(fs.readFileSync(path.join(ROOT,'web/public/data/projects/toneup-sunscreen-r1/project.json')));
let server,browser,origin;
test.before(async()=>{
 process.env.CARDNEWS_STUDIO='0';
 const {createServer}=await import(pathToFileURL(path.join(ROOT,'web/node_modules/vite/dist/node/index.js')).href);
 server=await createServer({root:path.join(ROOT,'web'),logLevel:'error',server:{host:'127.0.0.1',port:0,fs:{allow:[ROOT,fs.realpathSync(path.join(ROOT,'web/node_modules'))]}}});
 await server.listen(); origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
});
test.after(async()=>{await browser?.close();await server?.close();});
async function open(t,url='/',options={}){
 const context=await browser.newContext({viewport:{width:options.width??1440,height:1000},colorScheme:options.scheme??'light',reducedMotion:'reduce'});t.after(()=>context.close());
 const page=await context.newPage();page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 if(options.studio)await page.route('**/api/studio/**',options.studio);
 else await page.route('**/api/studio/**',r=>r.fulfill({status:404,json:{error:'Unavailable'}}));
 await page.goto(origin+url,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);return page;
}
async function capture(page,name){if(process.env.CARDNEWS_UI_CAPTURE_DIR){fs.mkdirSync(process.env.CARDNEWS_UI_CAPTURE_DIR,{recursive:true});await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});await page.screenshot({path:path.join(process.env.CARDNEWS_UI_CAPTURE_DIR,name+'.png'),fullPage:true});}}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
const summary=id=>({...index.projects[0],id,product_name:id==='alpha'?'Alpha serum':'Beta cream',thumbnail:index.projects[0].thumbnail});

test('theme follows system, can be overridden, and survives navigation and reload',async t=>{
 const page=await open(t,'/',{scheme:'dark'});assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await capture(page,'library-dark');await page.getByLabel('화면 테마').selectOption('light');
 await page.getByRole('link',{name:'이용 가이드',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 await page.reload();assert.equal(await page.getByLabel('화면 테마').inputValue(),'light');
 await page.getByLabel('화면 테마').selectOption('system');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
});
test('library search and kind filters survive reload; empty results can be reset',async t=>{
 const page=await open(t);
 await page.getByRole('searchbox',{name:'프로젝트 검색'}).fill('no-such-product');
 await page.getByText('검색 조건에 맞는 프로젝트가 없어요').waitFor();assert.equal(new URL(page.url()).searchParams.get('q'),'no-such-product');
 await page.reload();assert.equal(await page.getByRole('searchbox',{name:'프로젝트 검색'}).inputValue(),'no-such-product');
 await page.getByRole('button',{name:'검색·필터 초기화'}).click();await page.locator('.project-card').first().waitFor();assert.equal(await page.locator('.project-card').count(),index.projects.length);
 await capture(page,'library-light');await noOverflow(page);
});
test('comparison loads real project-relative PNG paths, detects same selection, and works on mobile',async t=>{
 const page=await open(t,'/compare',{width:390});
 await page.route('**/data/index.json',r=>r.fulfill({json:{...index,projects:[summary('alpha'),summary('beta')]}}));
 for(const id of ['alpha','beta'])await page.route(`**/data/projects/${id}/project.json`,r=>r.fulfill({json:{...sample,id}}));
 await page.reload();await page.getByLabel('비교할 첫 번째 결과').selectOption('alpha');await page.getByLabel('비교할 두 번째 결과').selectOption('beta');
 const img=page.getByAltText(`${sample.product.name} 1번 카드`).first();await img.waitFor();assert.ok((await img.getAttribute('src')).includes('/data/projects/alpha/png/'));
 await page.getByText('자유 비교입니다.',{exact:false}).waitFor();await noOverflow(page);await capture(page,'compare-mobile');
 await page.getByLabel('비교할 두 번째 결과').selectOption('alpha');await page.getByText('서로 다른 두 결과를 선택해주세요').waitFor();
});
test('guide, evaluation and project review routes work in dark mode at 320px',async t=>{
 const page=await open(t,'/guide',{width:320,scheme:'dark'});await noOverflow(page);
 for(const url of ['/eval','/studio','/projects/toneup-sunscreen-r1','/projects/toneup-sunscreen-r1/plan','/projects/toneup-sunscreen-r1/timeline']){
  await page.goto(origin+url,{waitUntil:'networkidle'});await noOverflow(page);assert.equal(await page.getByText('화면을 그리다 오류가 났어요').count(),0);
 }
 await page.goto(origin+'/',{waitUntil:'networkidle'});await capture(page,'library-mobile-dark');
});
const status={ok:true,mode:'web',claude:{installed:true,version:'test',logged_in:true},form:require('../config/input-form.json'),revision_types:[{code:'LEN',label:'길이',example:'짧게'}],job:null,jobs:{running:null,queue:[]}};
const product={id:'review',name:'검토 제품',brand:'Sample',stage:'copy',updated_at:'2026-11-03T00:00:00Z',running:false,input:{values:{},images:[],card_count:5},check:{errors:[],warnings:[],cautions:[]},cards:{...sample,stage:'copy'},validation:null,pngs:[],events:[],job:null,export:{listed:false,exported_at:null},actions:{running:false,can_revise_final:true,can_approve_final:true}};
async function studioMock(route){
 const url=new URL(route.request().url());
 assert.equal(route.request().method(),'GET');
 const json=url.pathname.endsWith('/status')?status:url.pathname.endsWith('/jobs')?status.jobs:url.pathname.endsWith('/products')?{products:[product]}:product;
 await route.fulfill({json});
}
test('studio filters reveal review work and selected cards expose evidence; failed revision keeps input',async t=>{
 const page=await open(t,'/studio',{studio:studioMock});await page.getByRole('button',{name:'검토 필요',exact:true}).click();
 await page.getByRole('link',{name:/검토 제품/}).click();await page.getByRole('button',{name:'2번 카드',exact:true}).click();
 await page.getByText('이 카드의 원문 근거',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'2번 카드',exact:true}).getAttribute('aria-pressed'),'true');
 await capture(page,'studio-review-light');
 await page.getByRole('button',{name:'카드 수정 요청',exact:true}).click();await page.getByLabel('길이',{exact:true}).check();
 await page.getByRole('textbox',{name:'요청 내용'}).fill('제목을 더 짧게');
 await page.route('**/api/studio/products/review/revisions',r=>r.fulfill({status:500,json:{error:'시험용 요청 실패'}}));
 await page.getByRole('button',{name:'수정 요청 보내기'}).click();await page.getByText('시험용 요청 실패',{exact:true}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'요청 내용'}).inputValue(),'제목을 더 짧게');
 await page.getByLabel('화면 테마').selectOption('dark');await page.setViewportSize({width:390,height:900});await noOverflow(page);await capture(page,'studio-review-mobile-dark');
});
test('form validates file sizes and required defaults, and protects unsaved input',async t=>{
 const page=await open(t,'/studio/new',{width:390,studio:studioMock});
 // All required choices shown on screen must have a non-empty value in React state.
 const required=page.locator('select[required]');for(let i=0;i<await required.count();i++)assert.ok(await required.nth(i).inputValue());
 await page.locator('input[type=file]').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('test')});await page.getByText('PNG 또는 JPG 이미지, 파일당 10MB 이하로 선택해주세요.').waitFor();
 await page.getByRole('link',{name:/제품 정보/}).click();await noOverflow(page);await capture(page,'studio-form-mobile');
 await page.getByRole('link',{name:'이용 가이드',exact:true}).click();await page.getByRole('dialog').waitFor();
 await page.getByRole('button',{name:'계속 입력하기'}).click();assert.ok(page.url().includes('/studio/new'));
 await page.getByRole('link',{name:'이용 가이드',exact:true}).click();await page.getByRole('button',{name:'저장하지 않고 나가기'}).click();await page.getByRole('heading',{name:'첫 카드뉴스, 이렇게 시작하세요.'}).waitFor();
});
