const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const CARD_JPEG = /^card-\d{2}\.jpg$/;

function fixedMediaConfig(base, directory) {
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('게시 이미지 주소는 인증이나 쿼리가 없는 HTTPS 주소여야 해요');
  }
  if (!path.isAbsolute(directory)) throw new Error('게시 이미지 폴더는 절대 경로로 지정해 주세요');
  return { base: url.href.replace(/\/$/, ''), directory };
}

// 요청마다 별도 경로를 써서 같은 카드 번호가 다른 게시물의 파일을 덮지 않게 해요.
async function stageFixedMedia(jpgs, { base, directory, fetchFn = fetch }) {
  const names = jpgs.map((file) => path.basename(file));
  if (!names.length || new Set(names).size !== names.length || names.some((name) => !CARD_JPEG.test(name))) {
    throw new Error('게시용 JPEG 이름과 카드 순서를 확인해 주세요');
  }
  const key = randomBytes(16).toString('hex');
  const target = path.join(directory, key);
  await fs.mkdir(target, { mode: 0o750 });
  const close = () => fs.rm(target, { recursive: true, force: true });
  const urls = names.map((name) => `${base}/${key}/${name}`);
  try {
    for (const [index, file] of jpgs.entries()) {
      const dest = path.join(target, names[index]);
      await fs.copyFile(file, dest);
      await fs.chmod(dest, 0o640);
    }
    for (const [index, url] of urls.entries()) {
      const result = await fetchFn(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(8000) });
      const size = (await fs.stat(path.join(target, names[index]))).size;
      if (result.status !== 200 || !/^image\/jpeg(?:;|$)/i.test(result.headers.get('content-type') || '')
          || Number(result.headers.get('content-length')) !== size) {
        throw new Error('게시 이미지 응답이 JPEG 파일과 일치하지 않아요');
      }
    }
    return { mode: 'base_url', urls, close };
  } catch {
    await close();
    throw new Error('고정 공개 주소에서 게시 이미지를 읽지 못했어요. HTTPS와 이미지 경로 설정을 확인해 주세요');
  }
}

module.exports = { fixedMediaConfig, stageFixedMedia };
