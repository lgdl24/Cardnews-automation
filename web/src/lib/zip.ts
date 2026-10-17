// 카드 PNG 묶음(ZIP)을 브라우저에서 만든다 — 웹 데이터 규격 '정할 것' 초안(브라우저에서 만듦)
// PNG는 이미 압축돼 있어 다시 압축하지 않고(level 0) 담기만 한다
import { zipSync, type Zippable } from 'fflate';

export interface ZipEntry {
  /** ZIP 안의 파일 이름 */
  name: string;
  url: string;
}

export async function buildZip(entries: ZipEntry[]): Promise<Blob> {
  const files: Zippable = {};
  const buffers = await Promise.all(
    entries.map(async (e) => {
      const res = await fetch(e.url);
      if (!res.ok) throw new Error(`${e.name}을(를) 받지 못했어요 (HTTP ${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    }),
  );
  entries.forEach((e, i) => {
    files[e.name] = [buffers[i]!, { level: 0 }];
  });
  const zipped = zipSync(files);
  return new Blob([zipped as BlobPart], { type: 'application/zip' });
}
