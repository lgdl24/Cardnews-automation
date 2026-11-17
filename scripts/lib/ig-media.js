// 인스타 게시용 이미지: 출력 PNG → JPEG(인스타는 JPEG만) + PNG에 있던 AI 활용 XMP를 그대로 옮김
const fs = require('fs');
const path = require('path');
const { readXmp, withXmpJpeg } = require('./ai-disclosure');
const { launchBrowser } = require('./card-html');

/**
 * @param {string[]} pngFiles 카드 순서대로
 * @param {string} outDir
 * @returns {Promise<{ png: string, jpg: string, bytes: number, xmp: boolean }[]>}
 */
async function toJpegs(pngFiles, outDir, { quality = 92 } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await launchBrowser();
  const out = [];
  try {
    const page = await browser.newPage();
    for (const png of pngFiles) {
      const buf = fs.readFileSync(png);
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      await page.setViewportSize({ width: w, height: h });
      await page.setContent(`<html><body style="margin:0"><img id="i" style="display:block" src="data:image/png;base64,${buf.toString('base64')}"></body></html>`);
      await page.waitForFunction(() => document.getElementById('i').complete);
      let jpg = await page.screenshot({ type: 'jpeg', quality, clip: { x: 0, y: 0, width: w, height: h } });
      const xmp = readXmp(buf);
      if (xmp) jpg = withXmpJpeg(jpg, xmp);
      const file = path.join(outDir, path.basename(png).replace(/\.png$/i, '.jpg'));
      fs.writeFileSync(file, jpg);
      out.push({ png, jpg: file, bytes: jpg.length, xmp: Boolean(xmp) });
    }
  } finally {
    await browser.close();
  }
  return out;
}

module.exports = { toJpegs };
