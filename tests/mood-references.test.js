// 템플릿 레퍼런스(config/mood-references.json): 형식, 배경 장면에 글자·제품·사람·의료가 없는지, 이미지 파일을 담지 않는지
const test = require('node:test');
const assert = require('node:assert/strict');
const refs = require('../config/mood-references.json');
const templates = require('../config/templates.json');
const { checkBrandMood } = require('../scripts/lib/brand');

// 단어 단위로 봄 (surface의 face처럼 단어 일부가 걸리지 않게)
const PEOPLE_MEDICAL = /\b(persons?|people|wom[ae]n|m[ae]n|faces?|hands?|models?|doctors?|nurses?|pharmac\w*|lab\w*|coats?|hospitals?|clinic\w*|microscopes?|pipettes?|syringes?|injections?|medical)\b/i;
const KEYS = ['id', 'title', 'source', 'mood', 'layout', 'type', 'color_usage', 'photo_style', 'scene', 'avoid', 'in_repo'];
const KINDS = ['pinterest', 'behance', 'template-site', 'in-house'];

test('레퍼런스마다 정해진 칸만 있고, 장면은 brand_mood 검사에 걸리지 않는다', () => {
  assert.ok(refs.references.length >= 1);
  const ids = new Set();
  for (const r of refs.references) {
    assert.deepEqual(Object.keys(r).sort(), [...KEYS].sort(), `${r.id}: 칸이 달라요 (이미지 경로 같은 칸은 두지 않음)`);
    assert.match(r.id, /^[a-z0-9-]+$/, r.id);
    assert.ok(!ids.has(r.id), `id 중복: ${r.id}`);
    ids.add(r.id);
    for (const k of ['title', 'layout', 'type', 'color_usage', 'photo_style', 'scene']) assert.ok(String(r[k] || '').trim(), `${r.id}.${k}`);
    assert.ok(KINDS.includes(r.source.kind), `${r.id}.source.kind`);
    assert.ok(r.source.url === null || /^https:\/\//.test(r.source.url), `${r.id}.source.url`);
    assert.ok(Array.isArray(r.mood) && r.mood.length >= 3, `${r.id}.mood는 분위기 단어 3개 이상`);
    assert.ok(Array.isArray(r.avoid) && r.avoid.length, `${r.id}.avoid`);
    const warns = [];
    checkBrandMood(
      { source: 'product_photo', summary: r.title, tone: r.type, photo_style: r.photo_style, scene: r.scene, evidence: [`레퍼런스 ${r.id}`],
        palette: { bg: '#FFFFFF', surface: '#FFFFFF', text: '#000000', muted: '#555555', primary: '#333333', accent: '#CCCCCC', 'on-primary': '#FFFFFF' } },
      { error: (c, where, msg) => warns.push(`${where} ${msg}`), warn: (where, msg) => warns.push(`${where} ${msg}`) },
    );
    assert.deepEqual(warns, [], r.id);
    assert.doesNotMatch(r.scene, PEOPLE_MEDICAL, `${r.id}.scene에 사람·의료 이야기가 있어요`);
  }
});

test('in_repo는 실제 디자인 묶음 이름이다', () => {
  const designs = Object.keys(templates._designs || {});
  for (const r of refs.references) {
    if (r.in_repo !== null) assert.ok(designs.includes(r.in_repo), `${r.id}.in_repo: ${r.in_repo}`);
  }
});
