# 카드 색 (제품 색 · 글자 대비)

- 이슈: #38 (제안 이용석 · 구현 이규동). 제안서: [proposals/mood-proposal.md](proposals/mood-proposal.md) 'B. 제품 색 무드'
- 코드: `scripts/lib/color-mood.js` (계산), `scripts/render.js` (적용·기록). 테스트: `tests/color-mood.test.js`, `tests/render.test.js`
- 템플릿 HTML·CSS는 그대로고, 카드 HTML에 넣는 `--color-*` 값만 바뀝니다.

## 고르는 법

입력 양식 `# 제작 조건 > ## 카드 색`에 `기본` 또는 `제품 색`을 씁니다. 비우면 `기본`입니다. 다른 값이면 `npm run check`가 경고하고 기본으로 만듭니다. 웹 입력 폼에서는 선택 칸입니다.

| 값 | 카드 색 |
|---|---|
| `기본` | `config/theme.json`의 색 |
| `제품 색` | 제품 사진의 대표 색으로 만든 색 7개. 대표 색을 못 찾으면 기본 색 + `[경고] 카드 색` |

어느 쪽이든 아래 '글자 대비'를 거쳐 출력합니다.

## 제품 색 만들기

1. **사진 고르기**: 카드에 쓴 첫 이미지 → 없으면 입력의 첫 이미지. 사용 가능 여부가 `불가`인 이미지와 없는 파일은 건너뜁니다.
2. **대표 색**: 사진을 200px 이하로 줄여 픽셀을 읽고(출력에 쓰는 Playwright 페이지의 canvas, 새 의존성 없음), 투명·흰색(밝기 92% 초과)·검정(8% 미만)·회색(채도 8% 미만) 픽셀을 뺀 뒤, 색상 10° 구간마다 채도로 가중해 모아 가장 큰 구간의 평균 색을 씁니다. 색 있는 픽셀이 불투명 픽셀의 2% 미만이면(흰 제품 등) 대표 색이 없다고 봅니다.
3. **색 7개** (대표 색의 색상 H, 채도 S)

| 이름 | 값 | 쓰는 곳 |
|---|---|---|
| `bg` | hsl(H, 25%, 97%) | 기본 배경 |
| `accent` | hsl(H, 25%, 90%) | 표지 배경, 설명형 번호 배경 |
| `primary` | hsl(H, S를 35~55%로, 50%) | 뱃지 배경, 강조 선, 설명형 번호 |
| `text` | hsl(H, 20%, 15%) | 본문 글자 |
| `muted` | hsl(H, 10%, 40%) | 페이지 번호·제품명 |
| `surface` | #FFFFFF | 설명형 항목 상자, 이미지 틀 |
| `on-primary` | #FFFFFF | 뱃지 글자 |

배경 쪽(`bg`·`accent`)은 채도를 고정해서 옅은 제품 색(예: 연보라 캡)도 분위기가 납니다.

## 글자 대비

템플릿에서 글자가 색 위에 놓이는 7곳을 WCAG 대비 **4.5 이상**으로 맞춥니다. 카드는 휴대폰 피드에서 1/3 크기로 보여서 큰 글자 기준(3.0)이 아니라 일반 글자 기준을 씁니다.

| 글자 / 배경 | 자리 |
|---|---|
| text / bg | 본문 글자 / 기본 배경 |
| text / accent | 표지 제목 / 표지 배경 |
| text / surface | 설명형 항목 글자 / 흰 상자 |
| muted / bg | 페이지 번호·제품명 / 기본 배경 |
| muted / accent | 페이지 번호·제품명 / 표지 배경 |
| on-primary / primary | 뱃지 글자 / 뱃지 배경 |
| primary / accent | 설명형 번호 / 번호 배경 |

- 미달이면 글자 쪽 색(`text`·`muted`·`primary`, 뱃지는 배경인 `primary`)의 밝기를 1%씩 낮춥니다. 배경 색은 바꾸지 않습니다.
- 밝기 12%까지 낮춰도 못 맞추면 `[경고] 카드 색 <자리>`를 남기고 그대로 출력합니다. (색상 36개 × 채도·밝기 5가지 시험에서는 모두 맞춰짐)
- 기본 테마(`config/theme.json`)는 7곳 모두 4.5 이상이라 출력할 때 바뀌지 않아요. 10.20까지의 값은 3곳이 미달이어서 조정된 값으로 맞췄어요(#60, 이규동·이용석 합의): `muted` #7A6E66 → #685F5A, `primary` #D9826B → #A2442A. Figma `color/*` 변수도 같은 값. `tests/color-mood.test.js`가 기본 테마의 대비를 확인해요.

## 기록

`output/render-report.json`(카드 1장 재출력이면 `render-report-card-NN.json`)의 `colors`:

```json
{
  "mode": "제품 색",
  "source": "product",
  "image": "main.png",
  "representative": "#46966E",
  "colored_ratio": 0.12,
  "color": { "bg": "…", "surface": "#FFFFFF", "text": "…", "muted": "…", "primary": "#337553", "accent": "…", "on-primary": "#FFFFFF" },
  "adjustments": [{ "key": "primary", "from": "#51AE80", "to": "#337553", "lightness_from": 0.5, "lightness_to": 0.33 }],
  "contrast": [{ "fg": "text", "bg": "bg", "where": "본문 글자 / 기본 배경", "ratio": 13.9, "ok": true }],
  "ok": true,
  "note": null
}
```

- `source`: `product`(제품 색을 씀) | `theme`(기본 색). `제품 색`을 골랐는데 `theme`이면 `note`에 이유가 있습니다.
- `render` 출력 첫 줄에도 `카드 색: …` 한 줄로 나옵니다.
- 결과 보기 웹에는 `project.json`의 `colors`(웹 데이터 v0.3)로 내보내고, V2 카드 결과의 '카드 색'에 고른 모드·쓴 색 7개·대비 조정·기본 색으로 바뀐 이유를 보여줘요. 대비 표(`contrast`)와 밝기 값은 내보내지 않아요.

## 규칙 버전

색은 문구 규칙과 별개라 규칙 버전(`skill_version`)은 올리지 않았습니다(제안서 기준). 버전 변경은 사람이 정합니다.
