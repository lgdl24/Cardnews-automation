// 입력 폼 (v1.5): 무드·카드 색 칸 없음, 01 자료·브랜드 → 02 채운 내용 확인 → 03 제작 조건. API를 가로채 실제 제품 저장·제작은 하지 않음.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');

test('웹 입력: 무드·카드 색 칸이 없고, 자료·브랜드 URL·사진이 먼저, 카드 수는 5로 채워짐', async () => {
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'web/node_modules/vite/dist/node/index.js')).href);
  const before = process.env.CARDNEWS_STUDIO;
  process.env.CARDNEWS_STUDIO = '0';
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const cacheDir=fs.mkdtempSync(path.join(os.tmpdir(),'cardnews-premium-form-cache-'));
  const server = await createServer({root:path.join(ROOT,'web'),cacheDir,logLevel:'error',server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[ROOT,fs.realpathSync(path.join(ROOT,'web/node_modules'))]}}});
  let browser;
  try {
    await server.listen();
    // CHROMIUM_PATH가 있으면 그 브라우저 (scripts/lib/card-html.js launchBrowser와 같음)
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({viewport:{width:390,height:900}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/studio/**',route=>{
      assert.equal(route.request().method(),'GET','실제 저장·제작 요청 금지');
      return route.fulfill({json:{ok:true,mode:'web',claude:{installed:true,version:null,logged_in:true},job:null,form:require('../config/input-form.json'),revision_types:[]}});
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/studio/new`,{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:/자료로 채우기/}).waitFor();
    assert.equal(await page.getByRole('combobox',{name:/^무드/}).count(),0,'무드 칸 없음');
    assert.equal(await page.getByRole('combobox',{name:/^카드 색/}).count(),0,'카드 색 칸 없음');
    // 01 자료·브랜드: 자료로 채우기·브랜드 URL·이미지
    const step1=page.locator('#step-source');
    assert.ok(await step1.getByText('자료 고르기',{exact:false}).isVisible());
    assert.equal(await step1.locator('input[type=url]').count(),1);
    assert.equal(await step1.locator('input[type=file][accept^=".png"]').count(),1);
    // 02 채운 내용 확인: 제품 정보 + 콘텐츠 목적·강조 정보, 03 제작 조건: 카드 수 5
    assert.ok(await page.locator('#step-review').getByText('콘텐츠 목적',{exact:false}).first().isVisible());
    assert.equal(await page.locator('#step-cond input[type=number]').inputValue(),'5');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    if(process.env.CARDNEWS_UI_CAPTURE_DIR){fs.mkdirSync(process.env.CARDNEWS_UI_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.CARDNEWS_UI_CAPTURE_DIR,'studio-form-steps-mobile.png'),fullPage:true});}
  } finally {
    await browser?.close(); await server.close();
    if(before===undefined)delete process.env.CARDNEWS_STUDIO;else process.env.CARDNEWS_STUDIO=before;
  }
});
