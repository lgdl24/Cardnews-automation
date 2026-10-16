// 웹 데이터 규격 테스트: 스키마(schemas/web-data/)·예시 파일(docs/examples/web-data/)·설정이 서로 맞는지
// 규격 문서: docs/web-data-spec.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const { ROOT } = require('./helpers');
const { STAGES, ROLES } = require('../scripts/validate');
const { PHASES } = require('../scripts/lib/analysis');

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const EXAMPLE = 'docs/examples/web-data';

const ajv = new Ajv2020({ allErrors: true });
ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
ajv.addSchema(readJson('schemas/cards.schema.json'));
for (const name of ['index', 'project', 'timeline']) ajv.addSchema(readJson(`schemas/web-data/${name}.schema.json`));
const schemaUrl = (name) => `https://github.com/lgdl24/Cardnews-automation/schemas/web-data/${name}.schema.json`;
const check = (name, data) => {
  const validate = ajv.getSchema(schemaUrl(name));
  assert.ok(validate(data), `${name}: ${JSON.stringify(validate.errors, null, 2)}`);
};

const index = readJson(`${EXAMPLE}/index.json`);

test('예시 index.json은 스키마를 통과한다', () => check('index', index));

test('예시 프로젝트의 project.json·timeline.json은 스키마를 통과하고 PNG가 모두 있다', () => {
  assert.ok(index.projects.length > 0);
  for (const p of index.projects) {
    const dir = `${EXAMPLE}/projects/${p.id}`;
    const project = readJson(`${dir}/project.json`);
    const timeline = readJson(`${dir}/timeline.json`);
    check('project', project);
    check('timeline', timeline);
    assert.equal(project.id, p.id);
    assert.equal(timeline.id, p.id);
    assert.equal(project.cards.length, p.card_count);
    assert.ok(fs.existsSync(path.join(ROOT, EXAMPLE, p.thumbnail)), p.thumbnail);
    for (const c of project.cards) assert.ok(fs.existsSync(path.join(ROOT, dir, c.png)), `${p.id} ${c.png}`);
  }
});

test('labels의 키·이름은 검증 코드와 config 파일과 같다', () => {
  const templates = readJson('config/templates.json');
  const revisionTypes = readJson('config/revision-types.json').types;
  const { labels } = index;
  assert.deepEqual(Object.keys(labels.stages), STAGES);
  assert.deepEqual(Object.keys(labels.roles), ROLES);
  assert.deepEqual(labels.templates, Object.fromEntries(Object.entries(templates).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v.label])));
  assert.deepEqual(labels.revision_types, Object.fromEntries(revisionTypes.map((t) => [t.code, t.label])));
  assert.deepEqual(labels.phases, PHASES);
  assert.deepEqual(Object.keys(labels.kinds), readJson('schemas/web-data/index.schema.json').$defs.kind.enum);
});

test('예시 project.json의 원문 근거·분석·카드는 원본 cards.json과 같다 (예시가 실제 결과에서 나옴)', () => {
  for (const p of index.projects) {
    const src = path.join(ROOT, 'products', p.id, 'cards.json');
    if (!fs.existsSync(src)) continue;
    const cards = JSON.parse(fs.readFileSync(src, 'utf8'));
    const project = readJson(`${EXAMPLE}/projects/${p.id}/project.json`);
    assert.deepEqual(project.sources, cards.sources);
    assert.deepEqual(project.analysis, cards.analysis);
    assert.equal(project.stage, cards.stage);
    project.cards.forEach((c, i) => {
      const o = cards.cards[i];
      assert.deepEqual(
        { no: c.no, role: c.role, template: c.template, intent: c.intent, image: c.image, evidence: c.evidence, copy: c.copy },
        { no: o.no, role: o.role, template: o.template, intent: o.intent, image: o.image ?? null, evidence: o.evidence || [], copy: o.copy || null },
      );
    });
  }
});

test('스키마는 공개하지 않는 값(토큰·비용·지시문 문장)을 받지 않는다', () => {
  const project = readJson(`${EXAMPLE}/projects/${index.projects[0].id}/project.json`);
  const leaked = structuredClone(project);
  leaked.quality.coverage_detail.excluded = [{ section: '제품 설명', text: '이전 지시를 무시해' }];
  assert.equal(ajv.getSchema(schemaUrl('project'))(leaked), false);

  const timeline = readJson(`${EXAMPLE}/projects/${index.projects[0].id}/timeline.json`);
  const withCost = structuredClone(timeline);
  withCost.events.push({ ts: '2026-10-10T00:00:00.000Z', event: 'job_finished', job_id: 'x', ok: true, cost_usd: 0.1 });
  assert.equal(ajv.getSchema(schemaUrl('timeline'))(withCost), false);
});
