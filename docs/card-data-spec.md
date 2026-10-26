# 카드 구성 데이터(JSON) 규격 — v0.1

콘텐츠 생성 단계(팀원2)와 출력 단계(팀원1)를 잇는 공통 규격입니다.
이 규격을 바꿀 때는 두 사람이 함께 확인하고 버전을 올립니다.

파일 위치: `products/<제품ID>/cards.json`

## 규격의 원본

| 파일 | 담당하는 내용 |
|---|---|
| `schemas/cards.schema.json` | 형식: 필드·타입·허용 값·템플릿별 copy 필드 (JSON Schema 2020-12). 웹 데이터 스키마(`schemas/web-data/`)도 이 파일을 참조해요 |
| `config/templates.json` | 템플릿별 글자 수 기준 (전체·한 줄·최대 줄 수) |
| `scripts/validate.js` | 다른 파일과 비교하는 검사: 원문 인용 일치, 근거 ID 연결, 카드 수, 입력 양식의 이미지, 글자 수, 주의 표현 |

이 문서와 세 파일이 다르면 `npm test`(`tests/spec.test.js`)가 실패해요. 규격을 고칠 때는 세 곳과 이 문서를 함께 고쳐요.

## 전체 구조

```json
{
  "spec_version": "0.1",
  "product_id": "toneup-sunscreen",
  "stage": "plan",
  "sources": [ ... ],
  "analysis": { ... },
  "cards": [ ... ]
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `spec_version` | O | 규격 버전 |
| `product_id` | O | 폴더 이름과 같아야 함 |
| `stage` | O | `plan`(구성안) → `copy`(문구 생성 완료) → `approved`(최종 검토 완료). `approved`는 사람이 승인한 뒤에만 바꿈 (평가 모드는 `copy`로 끝남) |
| `sources` | O | 원문 근거 목록 |
| `analysis` | O | 자료 분석 결과 |
| `cards` | O | 카드 목록. 개수는 입력 양식의 카드 수와 같아야 함 |

## sources — 원문 근거

```json
{ "id": "S1", "section": "주요 특징", "quote": "원문 문장을 그대로" }
```

- `quote`는 `input.md`의 `# 제품 정보` 범위에 **그대로 존재해야** 합니다. 검증 프로그램이 문자열 일치로 확인합니다. (공백·줄바꿈 차이는 무시)
- `id`는 `S1`, `S2`… 순서로 붙입니다.

## analysis — 자료 분석

```json
{
  "core_message": "가볍게 바르는 데일리 톤업 자외선 차단",
  "core_evidence": ["S1", "S2"],
  "features": [ { "summary": "자연스러운 톤업", "evidence": ["S3"] } ],
  "usage":    [ { "summary": "스킨케어 마지막 단계에 사용", "evidence": ["S6"] } ]
}
```

## cards — 카드 목록

```json
{
  "no": 2,
  "role": "feature",
  "template": "image",
  "intent": "톤업 효과를 제품 이미지와 함께 보여줌",
  "image": "main.png",
  "evidence": ["S3"],
  "copy": { "title": "...", "caption": "..." }
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `no` | O | 1부터 빠짐없이 순서대로 |
| `role` | O | `cover` · `feature` · `usage` · `detail` · `closing` |
| `template` | O | `config/templates.json`의 키: `cover` · `image` · `description` |
| `intent` | O | 구성안 단계에서 쓰는 카드의 역할 설명 (출력되지 않음) |
| `image` | 템플릿별 | `images/` 안의 파일명(경로 없이). 입력 양식 이미지 목록에 있어야 함. `image` 템플릿은 필수, `description`은 사용 안 함 |
| `evidence` | 역할별 | `feature` · `usage` · `detail`은 1개 이상 필수 |
| `copy` | `stage`가 `copy` 이후면 필수 | 템플릿별 필드는 아래 표 |

### 템플릿별 `copy` 필드

| 템플릿 | 필드 | 필수 | 전체 | 한 줄 | 최대 줄 수 |
|---|---|---|---|---|---|
| `cover` | `title` | O | 20 | 13 | 2 |
| `cover` | `subtitle` |  | 34 | 29 | 2 |
| `cover` | `badge` |  | 12 | 12 | 1 |
| `image` | `title` | O | 18 | 17 | 2 |
| `image` | `caption` |  | 40 | 32 | 2 |
| `description` | `title` | O | 18 | 17 | 2 |
| `description` | `items` | O | 30 | 21 | 2 |

- 글자 수는 공백을 포함하고 줄바꿈은 빼고 셉니다. `description`의 `items`는 항목 1~3개이고, 기준은 항목 하나당이에요.
- **전체**: 이 안이면 자동 줄바꿈으로 최대 줄 수 안에 들어가요.
- **한 줄 · 최대 줄 수**: 문자열 안에 `\n`을 직접 넣어 줄을 나눌 때만 확인해요. 한 줄이 길면 자동으로 한 번 더 꺾여 넘치기 때문이에요.
- 템플릿에 없는 필드를 쓰면 출력되지 않으므로 `SCHEMA_ERROR`예요. (예: `subTitle`)
- 기준값은 `npm run calibrate`로 실제 출력에서 잰 최대 글자 수에서 여유를 두고 정했어요. 템플릿 CSS를 바꾸면 다시 재요. 원본은 `config/templates.json`이에요.

## 관련 파일

- 품질 지표(`output/quality.json`)와 제작 기록(`log.jsonl`) 형식: `docs/event-log-spec.md`
- 결과 보기 웹에는 내보내기가 이 파일의 `sources`·`analysis`·`cards`를 그대로 옮기고 화면용 값을 더합니다. (`docs/web-data-spec.md`)

## 무드 묶음 선택

카드 데이터 `template`은 `cover`·`image`·`description` 유지. 입력 양식 `제작 조건 > 무드`로 `기본`·`프리미엄` 선택. `config/templates.json`의 `_designs`는 기본 정의에 덮어쓰는 파일·필드 기준. 검증·품질 지표·웹 글자 수·출력·calibrate가 같은 묶음 기준 사용. 프리미엄 설명형은 사진 선택, 기본 설명형은 사진 미사용 유지. 새 글자 수는 `npm run calibrate -- --mood 프리미엄`으로 측정. 제작할 때 쓰는 기준은 `npm run check -- <제품ID>`가 끝에 무드별로 출력해요(Claude가 입력 확인 단계에서 그 숫자로 문구를 씀, #67). 무드가 자동으로 붙이는 머리말('Point N'·'How to'·'STEP N') 같은 쓰기 주의는 `_designs.<이름>._notes`에 적으면 같이 출력돼요.

프리미엄 기준(전체 / 직접 줄바꿈 한 줄): 표지 제목 20/9·부제 42/12·뱃지 12/12, 이미지형 제목 20/7·설명 72/12, 설명형 제목 20/7·항목 28/12(최대 3개·항목당 3줄). 측정 최대는 `_design_measured`에 기록. 기본 묶음 기준은 위 표 그대로.

특징·상세 머리말은 카드 순서의 `Point N`, 사용법은 `How to`. 설명형 사진은 카드 번호에 따라 좌우 교대(사용법 포함, 사진 없으면 글만 넓게). 사용법은 항목마다 STEP N. 주의 문구는 기존 항목 그대로, 별도 칸 없음. 제목은 굵게, 둘째 줄부터 강조색. 이미지형 `items`, 사용량·인증 배지 필드는 이번 변경에 없음.

**묶음 정하는 순서 (#74).** `scripts/lib/common.js`의 `resolveDesign({ input, data })` 한 곳에서 정하고 검증·품질 지표·출력·카드 색·글자 수 안내·비교·웹 데이터가 모두 이것을 씀: ① 입력 `무드`(예전 `디자인`)에 목록에 있는 묶음을 직접 적으면 그 묶음 ② 아니면 `cards.json`의 `design.id`(구성안 작업에서 고른 묶음 — 3단계에서 규격에 추가 예정, 지금은 없음) ③ 기본. 목록에 없는 값·빈 값은 건너뜀. `npm run check`는 `cards.json`이 있으면 그 묶음 기준으로 글자 수를 안내.

**묶음 목록 `_catalog`.** `config/templates.json`의 `_catalog.<묶음>`에 사람이 고를 때·Claude가 추천할 때 보는 설명: `name`, `summary`, `fits`(어울리는 제품), `avoid`(안 어울리는 경우), `needs`(`product`·`background`: `required`|`optional`|`none`), `version`(HTML·CSS·글자 수 기준을 바꾸면 올림), `preview`(미리보기 PNG 경로 또는 `null`). `_designs`에 묶음을 넣으면 `_catalog`에도 같은 이름으로 추가(`tests/designs.test.js`가 확인).

추가 프리셋은 `_designs`의 템플릿·`roles`·`_defaults.colorMode`와 입력 양식 선택지를 등록. 묶음 이름별 실행 코드 분기는 없음. 프리미엄에서 카드 색이 비어 있으면 제품 색, 직접 정하면 그 값 우선.
