// 별도 프로세스의 CLI를 흉내 내요. 실제 API·터널·토큰을 사용하지 않아요.
const fs = require('fs');
const path = require('path');
const { createCliPublisher, publishWithManager } = require('../../scripts/lib/ig-cli-publisher');
const { fakeIg } = require('../ig-publisher-helpers');
const root = path.resolve(__dirname, '../..');
const [productsDir, id, mode] = process.argv.slice(2);
const ig = fakeIg();
const original = ig.call;
ig.call = async (...args) => {
  fs.appendFileSync(path.join(productsDir, 'calls.jsonl'), JSON.stringify({ method: args[0], path: args[1] }) + '\n');
  if (mode === 'hold' && args[0] === 'POST' && args[1].endsWith('media_publish')) {
    process.send({ event: 'publishing' });
    return new Promise(() => {});
  }
  return original(...args);
};
const pub = createCliPublisher({ root, productsDir, ig,
  toJpegs: async (dir, files) => files.map((f) => { fs.mkdirSync(dir, { recursive: true }); const dest = path.join(dir, path.basename(f).replace('.png', '.jpg')); fs.writeFileSync(dest, 'jpg'); return dest; }),
  openPublicUrls: async (files) => ({ urls: files.map((f) => `https://example.invalid/${path.basename(f)}`), mode: 'test', close() {} }),
  sleep: async () => {},
});
const keepAlive = setInterval(() => {}, 1000);
(async () => {
  const st = pub.status(id);
  await publishWithManager(id, { publisher: pub, version: st.version, confirm: true, log() {} });
  process.send({ event: 'done' });
})().catch((e) => process.send({ event: 'error', code: e.code, message: e.message })).finally(() => { clearInterval(keepAlive); process.disconnect(); });
