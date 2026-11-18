// CLI도 웹과 같은 게시 관리자·기록·잠금을 사용해요. 타이머는 시작하지 않아요.
const fs = require('fs');
const path = require('path');
const { paths } = require('./common');
const { createPublisher } = require('./ig-publisher');
const deps = require('./ig-publish-deps');

function createCliPublisher({ productsDir = paths.products(), root = paths.root, ig = null, baseUrl = null, ...overrides } = {}) {
  return createPublisher({
    productsDir,
    appendEvent: (id, event, fields) => {
      if (process.env.CARDNEWS_NO_LOG === '1') return;
      const version = JSON.parse(fs.readFileSync(path.join(root, 'config', 'skill-version.json'), 'utf8')).version;
      fs.appendFileSync(path.join(productsDir, id, 'log.jsonl'), JSON.stringify({ ts: new Date().toISOString(), event, project_id: id, job_id: null, skill_version: version, ...fields }) + '\n');
    },
    precheck: deps.precheckIn(root, productsDir),
    client: ig ? () => ig : deps.client,
    configured: ig ? () => true : deps.configured,
    toJpegs: deps.toJpegs,
    openPublicUrls: (files) => deps.openPublicUrls(files, { baseUrl }),
    ...overrides,
  });
}

async function publishWithManager(id, { publisher = createCliPublisher(), dryRun = false, version = null, confirm = false, log = console.log } = {}) {
  // dry-run은 복구·사람 확인·게시 상태를 저장하지 않고 점검·미리보기만 해요.
  if (!dryRun) publisher.recover([id]);
  const st = publisher.status(id, { refresh: true, recoverState: !dryRun });
  if (dryRun) {
    log(`[시험] 인스타에 게시하지 않아요. 버전: ${st.version || '없음'}`);
    log(st.caption || '먼저 게시 캡션을 작성해 주세요');
    for (const c of st.check?.checks || []) if (c.status !== 'pass') log(`${c.label}: ${c.detail}`);
    for (const reason of st.blockers || []) log(`- ${reason}`);
    return { dryRun: true, ...st };
  }
  if (!version) throw new Error('먼저 publish --dry-run으로 내용을 확인하고 --version <버전>을 지정해 주세요');
  if (st.version !== version) throw new Error('카드나 캡션 버전이 바뀌었어요. 다시 점검해 주세요');
  if (confirm) publisher.acknowledge(id, { version, ids: (st.check?.checks || []).filter((c) => c.status === 'warn').map((c) => c.id) });
  const { done } = publisher.start(id, { version, trigger: 'cli' });
  log('공통 게시 기록에 요청했어요. 준비·업로드·게시 확인을 진행해요');
  const result = await done;
  if (result.state !== 'published') throw new Error(result.error?.message || '게시 결과를 확인해 주세요');
  log(`게시를 완료했어요: ${result.permalink || result.media_id}`);
  return result;
}

module.exports = { createCliPublisher, publishWithManager };
