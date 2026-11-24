// Instagram Login·Unified Login의 계정 조회와 게시를 지원한다.
// 토큰은 Authorization 헤더로 보내고 오류 메시지에서도 숨긴다.
const DEFAULT_CFG = require('../../config/instagram.json');

class IgError extends Error {
  constructor(message, { status = null, code = null, subcode = null, apiSetup = 'instagram' } = {}) {
    super(message);
    this.name = 'IgError';
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.apiSetup = apiSetup;
  }
}

// 자주 나는 오류를 사람이 할 일로 바꿈. 작업실 화면에서도 그대로 보여서, 누가 무엇을 하면 되는지 먼저 쓰고
// 관리자용 단서(토큰·권한 이름·인스타 원문)는 괄호 안에 둠 (#125)
function explain(err) {
  if (err.code === 190) return '인스타 연결이 만료됐거나 끊겼어요. 관리자에게 인스타 연결을 다시 해 달라고 알려 주세요 (토큰 다시 발급 후 IG_ACCESS_TOKEN 교체)';
  if (err.code === 10 || err.code === 200) {
    const permissions = err.apiSetup === 'unified' ? 'instagram_content_publish·instagram_basic' : 'instagram_business_content_publish·instagram_business_basic';
    return `인스타 게시 권한이 없어요. 관리자에게 알려 주세요 (토큰을 만들 때 ${permissions} 권한 허용 확인)`;
  }
  if (err.code === 9 || err.code === 4 || err.subcode === 2207042) return '인스타 게시 한도(24시간)에 걸렸어요. 하루 안에 다시 시도해 주세요';
  if (err.subcode === 2207052 || err.subcode === 2207026) return '인스타가 카드 이미지를 가져가지 못했어요. 잠시 뒤 다시 게시해 보고, 반복되면 관리자에게 알려 주세요 (이미지 공개 주소가 열려 있는지, JPEG인지 확인)';
  // 인스타가 돌려준 영어 원문은 그대로 두지 않고 할 일을 앞에 붙임
  if (err.status && !/[가-힣]/.test(err.message)) return `인스타가 요청을 받아 주지 않았어요. 잠시 뒤 다시 시도하고, 반복되면 관리자에게 알려 주세요 (인스타 응답: ${err.message})`;
  return err.message;
}

/**
 * @param {{ token: string, apiSetup?: 'instagram'|'unified', userId?: string, fetchFn?: typeof fetch, cfg?: object, sleep?: (ms:number)=>Promise<void> }} o
 */
function createClient({ token, apiSetup = 'instagram', userId = null, fetchFn = fetch, cfg = DEFAULT_CFG, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!token) throw new IgError('인스타 연결 설정이 아직 없어요. 관리자에게 알려 주세요 (IG_ACCESS_TOKEN이 없어요 — 개인 PC는 .env, 서버는 게시 서비스 설정)');
  if (!['instagram', 'unified'].includes(apiSetup)) throw new IgError('IG_API_SETUP은 instagram 또는 unified로 설정해 주세요');
  if (userId && !/^\d+$/.test(String(userId))) throw new IgError('IG_USER_ID에 Instagram 계정의 숫자 ID를 넣어 주세요');
  const apiBase = apiSetup === 'unified' ? 'https://graph.facebook.com' : cfg.api_base || 'https://graph.instagram.com';
  const base = `${apiBase}/${cfg.api_version}`;
  const redact = (message) => String(message).replaceAll(token, '***').replaceAll(encodeURIComponent(token), '***');

  async function call(method, path, params = {}, { versioned = true } = {}) {
    const url = new URL(`${versioned ? base : apiBase}/${path.replace(/^\//, '')}`);
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (method === 'GET') url.searchParams.set(k, String(v));
      else body.set(k, String(v));
    }
    let res;
    const headers = { Authorization: `Bearer ${token}` };
    if (method !== 'GET') headers['content-type'] = 'application/x-www-form-urlencoded';
    try {
      res = await fetchFn(url, {
        method,
        headers,
        ...(method === 'GET' ? {} : { body }),
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      throw new IgError(redact(`인스타 API에 연결하지 못했어요 (${e.cause?.code || e.message})`), { apiSetup });
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* 본문 없음 */
    }
    if (!res.ok || json?.error) {
      const e = json?.error || {};
      throw new IgError(redact(`${e.message || `HTTP ${res.status}`}${e.error_user_msg ? ` — ${e.error_user_msg}` : ''}`), {
        status: res.status,
        code: e.code ?? null,
        subcode: e.error_subcode ?? null,
        apiSetup,
      });
    }
    return json;
  }

  async function me() {
    if (apiSetup === 'unified' && !userId) throw new IgError('Unified Login은 IG_USER_ID가 필요해요. 앱에 표시된 Instagram 계정 ID를 .env에 넣어 주세요');
    const data = apiSetup === 'unified'
      ? await call('GET', String(userId), { fields: 'id,username' })
      : await call('GET', 'me', { fields: 'user_id,username,account_type' });
    const accountId = String(data.user_id || data.id || '');
    if (!accountId || !data.username) throw new IgError('토큰에서 Instagram 계정을 확인하지 못했어요');
    if (userId && accountId !== String(userId)) throw new IgError('IG_USER_ID와 토큰에 연결된 Instagram 계정이 달라요');
    return { ...data, user_id: accountId };
  }
  const permissions = () => call('GET', 'me/permissions');
  const publishingLimit = (igId) => call('GET', `${igId}/content_publishing_limit`, { fields: 'quota_usage,config' });

  async function waitReady(containerId) {
    const { interval_ms: every, timeout_ms: limit } = cfg.status_poll;
    const until = Date.now() + limit;
    for (;;) {
      const s = await call('GET', containerId, { fields: 'status_code,status' });
      if (s.status_code === 'FINISHED') return s;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new IgError(redact(`컨테이너 처리 실패 (${s.status_code}): ${s.status || ''}`));
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
  async function refreshToken() {
    if (apiSetup === 'unified') throw new IgError('Unified Login 토큰은 앱 대시보드에서 다시 발급해 .env의 IG_ACCESS_TOKEN을 갱신해 주세요. 비즈니스 토큰 관리 API를 통한 갱신은 별도 설정이 필요해요');
    return call('GET', 'refresh_access_token', { grant_type: 'ig_refresh_token' }, { versioned: false });
  }

  return { apiSetup, call, me, permissions, publishingLimit, waitReady, publishImages, refreshToken };
}

module.exports = { createClient, IgError, explain };
