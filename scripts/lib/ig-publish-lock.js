// 같은 PC·제품 폴더를 쓰는 CLI와 웹의 게시·기록 수정을 직렬화해요.
// 각 실행이 먼저 고유한 참가 파일을 만든 뒤 다른 살아 있는 참가자가 없는지 확인해요.
// 동시에 진입하면 한쪽 또는 양쪽이 물러나요. 실행 중인 소유자를 시간만으로 지우지 않아요.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code !== 'ESRCH'; }
}

function createPublishLock(productsDir) {
  const dir = path.join(productsDir, '.ig-publish-locks');
  function participants() {
    if (!fs.existsSync(dir)) return [];
    const live = [];
    for (const name of fs.readdirSync(dir)) {
      const m = /^lock-(\d+)-[a-f0-9]{24}\.json$/.exec(name);
      if (!m) continue;
      const file = path.join(dir, name);
      if (alive(Number(m[1]))) live.push(file);
      else { try { fs.unlinkSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
    }
    return live;
  }
  function acquire({ id = null, operation = 'publish' } = {}) {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `lock-${process.pid}-${crypto.randomBytes(12).toString('hex')}.json`);
    // 소유자 정보가 쓰이는 도중에도 파일명의 PID로 살아 있는 참가자를 인식해요.
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, product_id: id, operation, at: new Date().toISOString() }), { flag: 'wx' });
    const release = () => { try { fs.unlinkSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; } };
    try {
      if (participants().some((p) => p !== file)) {
        const e = new Error('다른 터미널이나 작업실에서 게시·기록 처리가 진행 중이에요. 끝난 뒤 다시 시도해 주세요');
        e.status = 409;
        e.code = 'IG_PUBLISH_BUSY';
        throw e;
      }
      return release;
    } catch (e) { release(); throw e; }
  }
  function sync(operation, id, fn) {
    const release = acquire({ operation, id });
    try { return fn(); } finally { release(); }
  }
  async function asyncRun(operation, id, fn) {
    const release = acquire({ operation, id });
    try { return await fn(); } finally { release(); }
  }
  return { acquire, sync, asyncRun, participants };
}
module.exports = { createPublishLock };
