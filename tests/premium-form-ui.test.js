// 입력 폼의 무드·색 선택. API를 가로채 실제 제품 저장·제작은 하지 않음.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');

test('웹 입력에서 프리미엄 선택, 색 비움·직접 지정과 안내', async () => {
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
    const design=page.getByRole('combobox',{name:/^디자인/});
    await design.selectOption('프리미엄');
    const color=page.getByRole('combobox',{name:/^카드 색/});
    assert.equal(await color.inputValue(),'');
    assert.equal(await color.locator('option:checked').innerText(),'선택 안 함');
    assert.ok(await page.getByText('기본 또는 제품 색. 비우면 디자인의 기본 색 선택을 사용해요',{exact:false}).isVisible());
    await color.selectOption('기본');assert.equal(await color.inputValue(),'기본');
    await color.selectOption('제품 색');assert.equal(await color.inputValue(),'제품 색');
    assert.equal(await design.locator('option',{hasText:'라일락'}).count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    if(process.env.CARDNEWS_UI_CAPTURE_DIR){fs.mkdirSync(process.env.CARDNEWS_UI_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.CARDNEWS_UI_CAPTURE_DIR,'premium-form-mobile.png'),fullPage:true});}
  } finally {
    await browser?.close(); await server.close();
    if(before===undefined)delete process.env.CARDNEWS_STUDIO;else process.env.CARDNEWS_STUDIO=before;
  }
});
