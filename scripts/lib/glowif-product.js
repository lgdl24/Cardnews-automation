const fs = require('node:fs');
const path = require('node:path');
const { topics } = require('../../config/glowif.json');

const MARKER = 'glowif.json';
const roles = ['cover', 'feature', 'detail', 'usage', 'closing'];

function glowifInfo(dir) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf8'));
    const topic = topics.find((entry) => entry.id === data.topic);
    if (data.source !== 'aihub-71603' || !topic || path.basename(dir) !== `glowif-${topic.slug}`) return null;
    if (![data.reviews, data.products].every((n) => Number.isSafeInteger(n) && n > 0)) return null;
    const date = (s) => /^\d{8}$/.test(s) ? s : null;
    return { source: data.source, topic: topic.id, label: topic.label, reviews: data.reviews, products: data.products, from: date(data.from), to: date(data.to) };
  } catch {
    return null;
  }
}

function glowifPlan(topic) {
  const features = [
    `‘${topic.situation}’를 다루는 가상 제품이에요.`,
    `${topic.feature}이에요.`,
    `${topic.detail}이에요.`,
    `용기 디자인은 ${topic.package} 조합이에요.`,
    'AI로 만든 가상 제품이에요.',
  ];
  const usage = topic.steps.map((s) => `${s}.`).join('\n');
  const sources = [
    ...features.map((quote, i) => ({ id: `S${i + 1}`, section: '주요 특징', quote })),
    { id: 'S6', section: '사용 방법', quote: usage },
  ];
  const productId = `glowif-${topic.slug}`;
  const copy = [
    { title: topic.situation, subtitle: `${topic.name} · ${topic.feature}`, badge: 'AI로 만든 가상 제품' },
    { title: topic.feature, caption: `GLOWIF ${topic.name}` },
    { title: topic.detail, items: [topic.package] },
    { title: '이렇게 발라요', items: topic.steps },
    { title: topic.closing, subtitle: topic.closingAnswer, badge: 'AI로 만든 가상 제품' },
  ];
  const intents = [
    `문제 제시: ${topic.situation} ← S1. 부제는 ${copy[0].subtitle}. 제품 일부를 보여줄 수 있어요.`,
    `1장의 답 ‘${topic.feature}’를 소개하고 같은 제품 전체를 보여줘요.`,
    `제형과 용기 특징을 소개해요. 제품 용기를 반복해서 크게 배치하기보다 질감이나 그래픽을 써요.`,
    '손에 덜고 펴 바르는 두 단계를 읽기 쉽게 나눠요.',
    `첫 장의 상황과 제품의 답을 다시 묶어요. ${copy[4].title} / ${copy[4].subtitle}.`,
  ];
  const evidence = [['S1', 'S2', 'S5'], ['S1', 'S2', 'S4'], ['S3', 'S4'], ['S6'], ['S1', 'S2', 'S5', 'S6']];
  const templates = ['cover', 'image', 'description', 'description', 'cover'];
  const cards = {
    spec_version: '0.1',
    product_id: productId,
    stage: 'plan',
    sources,
    analysis: {
      core_message: topic.feature,
      core_evidence: ['S1', 'S2'],
      features: features.slice(1, 4).map((summary, i) => ({ summary, evidence: [`S${i + 2}`] })),
      usage: [{ summary: usage, evidence: ['S6'] }],
    },
    cards: roles.map((role, i) => ({
      no: i + 1, role, template: templates[i], intent: intents[i], evidence: evidence[i],
      ...(i < 2 ? { image: 'main.png' } : {}),
    })),
  };
  const input = `# 제품 정보

## 제품명
GLOWIF ${topic.name}

## 주요 특징
${features.map((line) => `- ${line}`).join('\n')}

## 사용 방법
${usage}

## 이미지
- main.png | 제품 단독 누끼 | GPT로 만든 GLOWIF 가상 제품 이미지 | 가능 | 제품

# 제작 조건

## 콘텐츠 목적
리뷰에서 반복된 사용 상황을 바탕으로 Glowif 가상 제품을 소개해요.

## 카드 수
5

## 무드
프리미엄
`;
  return { cards, input, copy };
}

function glowifRules(report, data, info) {
  const list = data.cards;
  if (!Array.isArray(list)) return;
  const add = (where, message) => report.error('SCHEMA_ERROR', where, message);
  if (list.length !== 5 || list.some((card, i) => card.role !== roles[i])) {
    add('cards', 'Glowif는 상황·핵심 특징·상세 특징·사용법·마무리 순서로 5장을 만들어요');
    return;
  }
  const [first, answer, , , last] = list;
  const shared = first.evidence?.filter?.((id) => answer.evidence?.includes?.(id) && last.evidence?.includes?.(id));
  if (!shared?.length) add('cards.evidence', '1·2·5장은 문제와 답의 공통 원문 근거를 연결해 주세요');
  if (list.some((card) => card.image && card.image !== 'main.png') || answer.image !== 'main.png') {
    add('cards.image', 'Glowif 제품이 등장하는 카드는 생성된 동일한 제품 누끼(main.png)를 써요');
  }
  if (data.stage === 'plan') return;
  const topic = topics.find((entry) => entry.id === info.topic);
  const subtitle = String(first.copy?.subtitle ?? '');
  if (!subtitle.includes(topic.name) || !/[가-힣]/.test(subtitle.replace(topic.name, ''))) {
    add('1번 카드.copy.subtitle', '부제에 제품 이름과 1장 상황에 대한 답을 넣어 주세요');
  }
  if (first.copy?.badge !== 'AI로 만든 가상 제품' || last.copy?.badge !== 'AI로 만든 가상 제품') {
    add('1·5번 카드.copy.badge', '첫 장과 마지막 장에 ‘AI로 만든 가상 제품’을 표시해 주세요');
  }
  if (!last.copy?.subtitle || /[?？]/.test(`${last.copy?.title ?? ''} ${last.copy?.subtitle ?? ''}`)) {
    add('5번 카드.copy', '마지막 장은 1장 상황과 제품의 답을 한 줄로 다시 묶어 주세요');
  }
}

module.exports = { MARKER, glowifInfo, glowifPlan, glowifRules };
