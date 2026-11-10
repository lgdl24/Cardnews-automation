// AI 활용 표시 (AI 기본법 제31조: 밖으로 내보내는 생성형 AI 결과물은 메타데이터·워터마크로 식별 가능하게)
// 출력 PNG에 XMP(iTXt 'XML:com.adobe.xmp')를 넣는다. 화면에 보이는 글자는 바꾸지 않는다.
// - Iptc4xmpExt:DigitalSourceType = compositeWithTrainedAlgorithmicMedia (원본 제품 사진 + AI가 쓴 문구, 경우에 따라 GPT 이미지)
//   Meta(인스타그램)는 IPTC·C2PA의 'AI 생성' 정보를 읽어 라벨을 붙임
// - cardnews:aiParts = text | text,image (GPT 이미지가 들어간 카드인지), dc:description = 사람이 읽는 설명
// 같은 파일에 다시 넣으면 이전 XMP를 바꿔 끼움(멱등). 픽셀 데이터는 그대로라 stripXmp로 비교할 수 있음
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const XMP_KEY = 'XML:com.adobe.xmp';
const SOURCE_TYPE = 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia';
const NS = 'https://github.com/lgdl24/Cardnews-automation/ns/1.0/';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function describe(parts) {
  return parts.includes('image')
    ? 'AI 활용 제작: 문구는 Claude, 배경·디자인 이미지는 GPT 이미지 생성으로 만들었어요. 제품 사진은 원본이에요.'
    : 'AI 활용 제작: 문구는 Claude로 쓰고 템플릿으로 출력했어요. 제품 사진은 원본이에요.';
}

function buildXmp({ productId, card, parts, skillVersion = null, createdAt = new Date().toISOString() }) {
  const attrs = [
    `Iptc4xmpExt:DigitalSourceType="${SOURCE_TYPE}"`,
    `xmp:CreatorTool="cardnews-automation (Claude Code${parts.includes('image') ? ' + GPT image' : ''})"`,
    `xmp:CreateDate="${esc(createdAt)}"`,
    `cardnews:aiParts="${esc(parts.join(','))}"`,
    `cardnews:product="${esc(productId)}"`,
    `cardnews:card="${Number(card)}"`,
    skillVersion ? `cardnews:skillVersion="${esc(skillVersion)}"` : null,
  ].filter(Boolean);
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '  <rdf:Description rdf:about=""',
    '    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"',
    '    xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
    '    xmlns:dc="http://purl.org/dc/elements/1.1/"',
    `    xmlns:cardnews="${NS}"`,
    ...attrs.map((a) => `    ${a}`),
    '   >',
    `   <dc:description><rdf:Alt><rdf:li xml:lang="ko">${esc(describe(parts))}</rdf:li></rdf:Alt></dc:description>`,
    '  </rdf:Description>',
    ' </rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].join('\n');
}

// PNG 청크 목록: [{ type, data, start, end }]
function chunks(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('PNG가 아니에요');
  const out = [];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) throw new Error('PNG 청크가 잘렸어요');
    out.push({ type, data: buf.subarray(i + 8, i + 8 + len), start: i, end });
    i = end;
    if (type === 'IEND') break;
  }
  return out;
}

const isXmp = (c) => c.type === 'iTXt' && c.data.subarray(0, XMP_KEY.length + 1).equals(Buffer.from(`${XMP_KEY}\0`, 'latin1'));

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

// iTXt: keyword\0 compression(0) method(0) language\0 translated\0 text(UTF-8)
const xmpChunk = (xmp) => chunk('iTXt', Buffer.concat([Buffer.from(`${XMP_KEY}\0\0\0\0\0`, 'latin1'), Buffer.from(xmp, 'utf8')]));

/** 우리 XMP를 뺀 PNG (같은 그림인지 비교용) */
function stripXmp(buf) {
  const cs = chunks(buf);
  if (!cs.some(isXmp)) return buf;
  return Buffer.concat([PNG_SIG, ...cs.filter((c) => !isXmp(c)).map((c) => buf.subarray(c.start, c.end))]);
}

/** XMP를 넣은(바꿔 끼운) PNG. IHDR 바로 뒤, 이미지 데이터 앞에 둠 */
function withXmp(buf, xmp) {
  const cs = chunks(buf).filter((c) => !isXmp(c));
  const parts = [PNG_SIG];
  for (const c of cs) {
    parts.push(buf.subarray(c.start, c.end));
    if (c.type === 'IHDR') parts.push(xmpChunk(xmp));
  }
  return Buffer.concat(parts);
}

/** PNG의 XMP 문자열 (없으면 null) */
function readXmp(buf) {
  const c = chunks(buf).find(isXmp);
  if (!c) return null;
  // keyword\0 + 0 + 0 + language\0 + translated\0
  let i = XMP_KEY.length + 3;
  i = c.data.indexOf(0, i) + 1;
  i = c.data.indexOf(0, i) + 1;
  return c.data.subarray(i).toString('utf8');
}

/** 읽은 표시 정보: { sourceType, parts, product, card } 또는 null */
function readDisclosure(buf) {
  const xmp = readXmp(buf);
  if (!xmp) return null;
  const attr = (name) => (xmp.match(new RegExp(`${name}="([^"]*)"`)) || [])[1] ?? null;
  return { sourceType: attr('Iptc4xmpExt:DigitalSourceType'), parts: (attr('cardnews:aiParts') || '').split(',').filter(Boolean), product: attr('cardnews:product'), card: Number(attr('cardnews:card')) || null };
}

/** 같은 그림인지 (우리 XMP는 무시) */
function samePng(a, b) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
  const x = fs.readFileSync(a);
  const y = fs.readFileSync(b);
  if (x.equals(y)) return true;
  try {
    return stripXmp(x).equals(stripXmp(y));
  } catch {
    return false;
  }
}

/**
 * 제품의 output/png/card-NN.png 에 표시를 넣음. imageCards: GPT 이미지가 들어간 카드 번호
 * @returns {{ card: number, parts: string[] }[]}
 */
function stampProduct(productDir, { productId = path.basename(productDir), cards, imageCards = [], skillVersion = null, only = null }) {
  const pngDir = path.join(productDir, 'output', 'png');
  const done = [];
  for (const c of cards) {
    if (only && !only.includes(c.no)) continue;
    const file = path.join(pngDir, `card-${String(c.no).padStart(2, '0')}.png`);
    if (!fs.existsSync(file)) continue;
    const parts = imageCards.includes(c.no) ? ['text', 'image'] : ['text'];
    fs.writeFileSync(file, withXmp(fs.readFileSync(file), buildXmp({ productId, card: c.no, parts, skillVersion })));
    done.push({ card: c.no, parts });
  }
  return done;
}

module.exports = { SOURCE_TYPE, XMP_KEY, buildXmp, withXmp, stripXmp, readXmp, readDisclosure, samePng, stampProduct, describe };
