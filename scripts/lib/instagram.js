// Instagram API (Instagram 로그인 방식, graph.instagram.com) — 게시·조회에 필요한 것만
// 토큰은 요청 본문·쿼리로만 보내고, 오류 메시지·로그에는 절대 넣지 않는다
const DEFAULT_CFG = require('../../config/instagram.json');

class IgError extends Error {
  constructor(message, { status = null, code = null, subcode = null } = {}) {
    super(message);
    this.name = 'IgError';
    this.status = status;
    this.code = code;
    this.subcode = subcode;
  }
}

// 자주 나는 오류를 사람이 할 일로 바꿈
function explain(err) {
  if (err.code === 190) return '토큰이 만료됐거나 취소됐어요. 앱 대시보드에서 토큰을 다시 만들어 .env의 IG_ACCESS_TOKEN을 바꿔 주세요';
  if (err.code === 10 || err.code === 200) return '권한이 없어요. 토큰을 만들 때 instagram_business_content_publish·instagram_business_basic 권한을 허용했는지 확인해 주세요';
  if (err.code === 9 || err.code === 4 || err.subcode === 2207042) return '게시 한도(24시간)에 걸렸어요. 나중에 다시 시도해 주세요';
  if (err.subcode === 2207052 || err.subcode === 2207026) return '인스타가 이미지 주소에서 파일을 가져오지 못했어요. 공개 주소(터널)가 열려 있는지, JPEG인지 확인해 주세요';
  return err.message;
}

/**
 * @param {{ token: string, fetchFn?: typeof fetch, cfg?: object, sleep?: (ms:number)=>Promise<void> }} o
 */
function createClient({ token, fetchFn = fetch, cfg = DEFAULT_CFG, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!token) throw new IgError('IG_ACCESS_TOKEN이 없어요. 저장소 .env에 넣어 주세요');
  const base = `${cfg.api_base}/${cfg.api_version}`;

  async function call(method, path, params = {}, { versioned = true } = {}) {
    const url = new URL(`${versioned ? base : cfg.api_base}/${path.replace(/^\//, '')}`);
    const body = new URLSearchParams();
    const all = { ...params, access_token: token };
    for (const [k, v] of Object.entries(all)) {
      if (v === undefined || v === null) continue;
      if (method === 'GET') url.searchParams.set(k, String(v));
      else body.set(k, String(v));
    }
    let res;
    try {
      res = await fetchFn(url, method === 'GET' ? { method } : { method, body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    } catch (e) {
      throw new IgError(`인스타 API에 연결하지 못했어요 (${e.cause?.code || e.message})`);
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* 본문 없음 */
    }
    if (!res.ok || json?.error) {
      const e = json?.error || {};
      throw new IgError(`${e.message || `HTTP ${res.status}`}${e.error_user_msg ? ` — ${e.error_user_msg}` : ''}`.replaceAll(token, '***'), {
        status: res.status,
        code: e.code ?? null,
        subcode: e.error_subcode ?? null,
      });
    }
    return json;
  }

  const me = () => call('GET', 'me', { fields: 'user_id,username,account_type' });
  const publishingLimit = (igId) => call('GET', `${igId}/content_publishing_limit`, { fields: 'quota_usage,config' });

  async function waitReady(containerId) {
    const { interval_ms: every, timeout_ms: limit } = cfg.status_poll;
    const until = Date.now() + limit;
    for (;;) {
      const s = await call('GET', containerId, { fields: 'status_code,status' });
      if (s.status_code === 'FINISHED') return s;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new IgError(`컨테이너 처리 실패 (${s.status_code}): ${s.status || ''}`);
      if (Date.now() > until) throw new IgError('인스타가 이미지를 처리하는 데 너무 오래 걸려요');
      await sleep(every);
    }
  }

  /**
   * 사진 1장이면 단일 게시, 2~10장이면 캐러셀. 반환: { media_id, permalink, containers }
   * @param {string} igId @param {string[]} imageUrls 카드 순서 @param {string} caption
   */
  async function publishImages(igId, imageUrls, caption) {
    if (!imageUrls.length) throw new IgError('게시할 이미지가 없어요');
    if (imageUrls.length > cfg.carousel_max) throw new IgError(`캐러셀은 최대 ${cfg.carousel_max}장이에요`);
    let creationId;
    const containers = [];
    if (imageUrls.length === 1) {
      const c = await call('POST', `${igId}/media`, { image_url: imageUrls[0], caption });
      containers.push(c.id);
      creationId = c.id;
    } else {
      for (const u of imageUrls) {
        const c = await call('POST', `${igId}/media`, { image_url: u, is_carousel_item: true });
        containers.push(c.id);
      }
      for (const id of containers) await waitReady(id);
      const carousel = await call('POST', `${igId}/media`, { media_type: 'CAROUSEL', children: containers.join(','), caption });
      creationId = carousel.id;
    }
    await waitReady(creationId);
    const published = await call('POST', `${igId}/media_publish`, { creation_id: creationId });
    const info = await call('GET', published.id, { fields: 'permalink,timestamp' });
    return { media_id: published.id, permalink: info.permalink ?? null, timestamp: info.timestamp ?? null, containers };
  }

  // 60일 토큰 갱신 (발급 24시간 뒤부터, 만료 전만)
  const refreshToken = () => call('GET', 'refresh_access_token', { grant_type: 'ig_refresh_token' }, { versioned: false });

  return { call, me, publishingLimit, waitReady, publishImages, refreshToken };
}

module.exports = { createClient, IgError, explain };
