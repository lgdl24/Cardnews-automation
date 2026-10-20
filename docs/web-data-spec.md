# 웹 데이터 규격 — v0.2

로컬 제작 결과를 **결과 보기 웹**에 보여주기 위한 파일 형식입니다. 내보내기(`npm run export`)가 이 형식으로 쓰고, 웹 화면(V1 목록·V2 프로젝트 상세·V4 버전 비교)이 읽습니다.
두 사람의 기능을 잇는 **연결 규격**이라 바꿀 때는 두 사람 모두 승인합니다. (초안 이규동 · 확인 이용석)

| 원본 | 내용 |
|---|---|
| `schemas/web-data/index.schema.json` | `index.json` 형식 |
| `schemas/web-data/project.schema.json` | `project.json` 형식 (원문 근거·분석은 `schemas/cards.schema.json`을 그대로 참조) |
| `schemas/web-data/timeline.schema.json` | `timeline.json` 형식 |
| `docs/examples/web-data/` | 예시 데이터. 가상 예시 제품 `toneup-sunscreen-r1`의 실제 결과에서 만듦. 웹 화면은 실제 제작 전에 이 예시로 먼저 개발 |

이 문서와 스키마·예시가 다르면 `npm test`(`tests/web-data.test.js`)가 실패합니다. 규격을 고칠 때는 세 곳을 함께 고칩니다.

## 원칙

- 웹은 **이 폴더의 파일만** 읽습니다. 서버·DB·로그인이 없습니다.
- 파일 안의 경로는 모두 **데이터 폴더 기준 상대 경로**입니다. (`project.json` 안의 카드 `png`만 그 프로젝트 폴더 기준)
- **검증을 통과한 결과만** 내보냅니다. 조건은 아래 '내보내기 대상'.
- 공개 링크로 누구나 볼 수 있으므로 아래 '공개하지 않는 것'은 넣지 않습니다.

| 공개하는 것 | 공개하지 않는 것 |
|---|---|
| 카드 PNG, 카드 구성 데이터(원문 인용 `sources`·분석·카드·문구), 제품명·브랜드·카테고리·콘텐츠 목적·강조 정보, 이미지 파일명·설명·출처·사용 가능 여부 | `input.md` 전체, 입력 이미지 원본 파일 |
| 품질 지표, 카드에 쓰이지 않은 원문 항목(`coverage_detail.missing`) | 지시문 형태라 뺀 원문 문장(개수만 공개) |
| 제작 기록의 작업·검증·승인·수정 요청(유형·메모) | 토큰·비용, 품질 지표 원본 기록(`validate_result.metrics`), 환경 변수·설정 파일 |

## 폴더 구조

```
<데이터 폴더>/                 내보내기 기본 위치: web/public/data/ (웹에서는 /data/)
├── index.json                프로젝트 목록 + 화면 공통 이름표 (V1)
├── projects/<제품ID>/
│   ├── project.json          카드 결과·구성안·근거·품질 지표 (V2, V4)
│   ├── timeline.json         제작 과정 (V2 제작 과정)
│   └── png/card-01.png …     카드 이미지 (1080×1080)
└── eval/                     평가 결과 (V3). 형식은 docs/eval-spec.md (이용석)
```

- `products/*/output/`은 git에서 빠지므로, **내보낸 데이터 폴더는 커밋합니다.** 배포는 커밋된 데이터로 합니다. 내보낸 뒤 `git diff`로 바뀐 프로젝트를 확인합니다.

## 내보내기 대상

`npm run export`가 아래 조건을 모두 만족하는 제품만 내보내고, 나머지는 `[제외] <제품ID> | <이유 코드> | <설명>`으로 출력합니다. 제외된 제품이 있어도 나머지는 내보냅니다.

```
npm run export                         # config/export.json의 제품 전체 → web/public/data/
npm run export -- --only <제품ID>      # 그 제품만 다시 내보냄 (index.json의 다른 프로젝트는 유지)
npm run export -- --out <폴더>         # 다른 폴더로 (확인용)
npm run export -- --no-eval            # 평가 실행은 빼고 config/export.json의 제품만
```

- 평가 실행: `eval/runs/*/result.json` 중 `outcome.result`가 `완료`인 실행을 `kind: "eval"` 프로젝트로 함께 내보냅니다. `eval` 필드(`input_id`·`run_id`·`repeat`·`variant`)는 `result.json`에서, `label`은 `평가 · <실행 묶음>`. `config/export.json`에 적지 않아도 됩니다. 평가가 끝난 직후 그 실행만 내보내려면 `npm run eval -- ... --export` (#42)

| 조건 | 안 될 때 이유 코드 |
|---|---|
| 내보낼 목록(`config/export.json`)에 있음. 평가 실행은 `eval/runs/`에서 완료된 실행을 찾음(`docs/eval-spec.md` '웹으로 내보낼 때') | — |
| `input.md`·`cards.json`이 있고 `validate` 오류 0개 | `INPUT_MISSING`, `VALIDATE_ERROR` |
| `stage`가 `approved` (평가 실행은 `copy` 이상 — 사람의 최종 승인이 없음) | `NOT_APPROVED` |
| 모든 카드의 PNG가 있음 | `PNG_MISSING` |
| 가장 최근 출력 보고서에 레이아웃 오류(`OVERFLOW`·이미지 로드 실패)가 없음 | `LAYOUT_ERROR` |

- 이미지 사용 가능 여부가 '불가'인 제품은 입력 확인(`check`)에서 이미 막히므로 따로 보지 않습니다.
- 카드별 재출력 보고서(`render-report-card-NN.json`)가 전체 출력 보고서보다 최근이면 그 카드는 재출력 결과를 씁니다. 출력 보고서가 없는 카드도 `LAYOUT_ERROR`입니다.
- 품질 지표는 `quality.json`을 읽지 않고 내보낼 때 다시 계산합니다(규칙이 바뀌어도 웹 수치가 최신).
- 쓰기 전에 만든 파일을 모두 스키마(`schemas/web-data/`)로 검사하고, 하나라도 틀리면 **아무 파일도 쓰지 않고** `SCHEMA_ERROR`로 끝냅니다(종료 코드 1).
- 내보낼 때 `projects/`와 `index.json`만 새로 씁니다. 평가 결과(`eval/`)는 평가 실행기가 관리하므로 지우지 않습니다.

`config/export.json` 형식:

```json
{
  "out_dir": "web/public/data",
  "projects": [
    { "id": "toneup-sunscreen-r1", "kind": "example", "label": "가상 예시 · 대화 모드 흐름 점검" }
  ]
}
```

| 필드 | 설명 |
|---|---|
| `id` | 제품ID (`products/<id>/`). 중복 불가 |
| `kind` | `production`·`example`·`eval` |
| `label` | 목록에 보이는 짧은 설명 (없으면 생략·`null`) |
| `eval` | `kind: "eval"`일 때 `{input_id, run_id, repeat, variant}` (아래 '4. 평가 결과와의 경계') |

## 1. `index.json` — 프로젝트 목록 (V1)

| 필드 | 설명 |
|---|---|
| `spec_version` | `"0.1"` |
| `exported_at` | 내보낸 시각 (ISO 8601). 화면 아래 '마지막 내보내기' |
| `skill_version` | 내보낼 때의 현재 규칙 버전 (`config/skill-version.json`) |
| `labels` | 화면에 쓸 이름표. `kinds`(제작 종류), `stages`(단계 배지), `roles`(카드 역할), `templates`, `revision_types`(수정 유형 코드), `phases`(제작 단계). 원본은 `config/`·검증 코드이고 테스트가 같은지 확인 |
| `projects[]` | 프로젝트 요약. 아래 표 |

`projects[]`

| 필드 | 설명 |
|---|---|
| `id` | 제품ID (= 폴더 이름) |
| `kind` | `production`(실제 제작) · `example`(가상 예시) · `eval`(평가 실행). 목록에서 실제 제작과 평가 결과를 나눌 때 사용 |
| `label` | 목록에 덧붙일 짧은 설명 (없으면 `null`) |
| `product_name` · `brand` · `category` | 입력 양식 값 (브랜드·카테고리는 없으면 `null`) |
| `stage` | `plan` · `copy` · `approved` |
| `skill_version` | 이 제작에 쓴 규칙 버전 (제작 기록의 마지막 값) |
| `card_count` | 카드 수 |
| `updated_at` | 제작 기록의 마지막 시각 (기록이 없으면 `null`) |
| `thumbnail` | 대표 카드(1번) PNG 경로 |
| `summary` | 목록에 보여줄 숫자: `coverage`(원문 커버리지) · `evidence_rate`(근거 연결률) · `caution_total`(주의 표현 건수) · `first_pass`(1회 통과) · `total_minutes`(총 제작 시간) · `revision_rounds`(카드 수정 요청 횟수) |
| `eval` | 평가 실행일 때만: `input_id`(평가 입력 ID) · `run_id`(실행 ID) · `repeat`(반복 번호) · `variant`(A8 비교판 이름, 기본 규칙이면 `null`). 이름은 `docs/eval-spec.md`와 맞춤. 그 외는 `null` |

비율 값(`coverage` 등)은 0~1입니다. 화면에서 %로 바꿉니다.

## 2. `project.json` — 카드 결과·구성안·근거 (V2 · V4)

`cards.json`의 `sources`·`analysis`·`cards`를 **이름 그대로** 담고, 화면에 필요한 값을 더합니다.

| 필드 | 설명 |
|---|---|
| `spec_version` · `id` · `kind` · `label` · `stage` · `skill_version` · `updated_at` | `index.json`과 같은 뜻 |
| `product` | `name` · `brand` · `category` · `purpose`(콘텐츠 목적) · `emphasis`(강조 정보) · `card_count`(요청한 카드 수) |
| `images[]` | 입력 양식의 이미지 목록: `file` · `desc` · `source` · `usage`. 카드 결과 화면의 '이미지 출처' |
| `sources[]` | 원문 근거 S1, S2… (`cards.json` 그대로) |
| `analysis` | 핵심 메시지·근거·특징·사용법 (`cards.json` 그대로) |
| `cards[]` | 카드. 아래 표 |
| `plan_revisions[]` | 구성안 수정 요청: `ts` · `types`(유형 코드) · `memo` |
| `quality` | 품질 지표 (`output/quality.json`): `coverage` · `coverage_detail`(`covered` · `total` · `missing[]` · `excluded_count`) · `evidence_rate` · `char_usage` · `char_usage_max` · `caution`(`total` · `in_source` · `not_in_source`) 등. 핵심 정보 포함률처럼 지표가 늘면 필드가 추가됨 |

`cards[]` — `cards.json`의 카드 필드(`no` · `role` · `template` · `intent` · `image` · `evidence` · `copy`)에 더해:

| 필드 | 설명 | 쓰는 화면 |
|---|---|---|
| `png` | 카드 이미지 경로 (`png/card-NN.png`, 이 폴더 기준) | V2 카드 결과·구성안·근거 |
| `chars[]` | 문구 필드별 글자 수: `field` · `index`(`items`의 몇 번째 항목, 그 외 `null`) · `chars` · `limit` · `ratio` | V2 구성안·근거 '글자 수 활용률' |
| `cautions[]` | 이 카드 문구에서 찾은 주의 표현: `term` · `category` · `in_source`(원문에도 있는지) · `fields`(나온 문구 칸: `field` · `index`, v0.2). 표현 하나는 카드마다 한 번 | V2 구성안·근거 '[주의]' 강조 |
| `layout` | 출력 점검: `ok` · `issues`(넘침·이미지 로드 실패) · `overlaps`(글자-이미지 겹침 경고) | V2 카드 결과 |
| `revisions[]` | 이 카드의 수정 요청: `ts` · `types` · `memo` | V2 구성안·근거 '수정 요청 이력' |

- `image`·`copy`는 값이 없으면 `null`, `evidence`는 없으면 빈 배열로 맞춥니다.
- 지금 예시에는 수정 요청·주의 표현이 0건이라 배열이 비어 있습니다. 모양은 아래와 같고, 톤업 선크림 첫 제작 뒤 예시를 추가합니다.

```json
"cautions": [{ "term": "최고", "category": "절대·최상급 표현", "in_source": false, "fields": [{ "field": "badge", "index": null }] }],
"revisions": [{ "ts": "2026-10-10T03:12:05.120Z", "types": ["LEN"], "memo": "제목 더 짧게" }]
```

## 3. `timeline.json` — 제작 과정 (V2 제작 과정)

| 필드 | 설명 |
|---|---|
| `spec_version` · `id` | |
| `summary` | `npm run log -- <제품ID> --summary`와 같은 계산(`scripts/lib/analysis.js`): `complete`(최종 승인 여부) · `total_minutes` · `ai_minutes` · `human_minutes` · `phases`(단계별 분: `input` · `plan_job` · `plan_review` · `copy_job` · `final_review` · `revise_job`) · `plan_revisions` · `revision_rounds` · `revised_card_ratio` · `revision_types`(코드별 건수) · `first_pass` · `auto_fix_total` |
| `jobs[]` | 작업별: `job_id` · `kind`(`plan` · `copy` · `revise`) · `ok` · `minutes` · `error_code` · `first_pass` · `auto_fix_count` |
| `events[]` | 제작 기록을 시간순으로. 공통 `ts` · `event` · `job_id`, 이벤트별로 `kind` · `ok` · `error_code` · `check` · `error_codes` · `cards_with_errors` · `rendered_cards` · `stage` · `cards` · `types` · `memo` · `approved_by` 중 있는 것만 |

- 이벤트 이름과 뜻은 `docs/event-log-spec.md`와 같습니다.
- `approved_by`: `plan_approved`·`final_approved`에만 붙고 `human`(사람) 또는 `eval`(평가 실행의 자동 승인). 기록에 없으면 `human`입니다. 평가 실행기가 `eval`을 남기도록 `docs/event-log-spec.md`에 추가할 예정입니다.

## 4. 평가 결과 (V3)와의 경계

- 평가 실행의 **제작 폴더 하나하나**는 위 형식 그대로 `projects/<제품ID>/`로 내보내고, `index.json`에서 `kind: "eval"`과 `eval` 필드를 채웁니다. V4 버전 비교는 `eval.input_id`·`repeat`이 같고 `skill_version`이 다른 두 프로젝트를 나란히 보여줍니다.
- 입력 × 규칙 버전 × 반복으로 **모은 표**(V3 대시보드)는 `eval/` 아래에 두고, 형식은 `docs/eval-spec.md`가 정합니다. 이 규격은 위치와 `eval` 필드 이름만 정합니다.

## 화면별로 읽는 파일

| 화면 | 담당 | 읽는 파일·필드 |
|---|---|---|
| V1 프로젝트 목록 | 이규동 | `index.json` (`projects[]`, `labels`, `exported_at`) |
| V2 카드 결과 | 이규동 | `project.json` `cards[].png` · `layout`, `images` |
| V2 구성안·근거 | 이용석 | `project.json` `analysis` · `sources` · `cards[]`(`intent` · `evidence` · `copy` · `chars` · `cautions` · `revisions`) · `plan_revisions` · `quality` |
| V2 제작 과정 | 이규동 | `timeline.json` |
| V3 평가 대시보드 | 이용석 | `eval/` (`docs/eval-spec.md`), `index.json`의 `kind: "eval"` 프로젝트 |
| V4 버전 비교 | 이용석 | 같은 평가 입력의 `project.json` 두 개 |

웹에서는 `fetch('/data/index.json')` → `fetch('/data/projects/<id>/project.json')` 순서로 읽고, 카드 이미지는 `/data/projects/<id>/` + `cards[].png`입니다. TypeScript 타입은 `web/src/data/types.ts`(#13)이고, 스키마를 바꾸면 같은 PR에서 함께 고칩니다.

## 정할 것 (리뷰에서)

- [x] V2 구성안·근거 화면에 더 필요한 필드가 있는지 (이용석, 10.19 리뷰) — 노션 '웹 화면 설계' V2 레이아웃·Figma W5·W6과 대조. 핵심 메시지·근거 칩, 카드 탭, PNG, 역할·템플릿·담을 내용, 문구, 원문 인용, 글자 수, 수정 요청 이력, 품질 지표는 지금 필드로 충분. 빠진 것은 **[주의] 표현이 나온 문구 칸** 하나라 `cautions[].fields`를 더함(v0.2)
    - 근거(`evidence`)는 카드 단위로 둠. Figma W6처럼 문구 칸마다 인용을 따로 붙이려면 카드 구성 데이터(`cards.json`) 규격과 Skill을 바꿔야 해서, 화면은 카드의 인용 목록을 문구 아래 한 번에 보여줌
    - 근거 연결률(`evidence_rate`) 정의는 '남은 문제'에서 따로 결정 (V2 품질 지표에 그대로 나옴)
- [ ] PNG 묶음(ZIP)을 브라우저에서 만들지, 내보내기에서 파일로 만들지 — 초안대로 브라우저에서 만들도록 구현함(#15, `web/src/lib/zip.ts`). 리뷰에서 확정
- [x] `config/export.json`의 형식 → '내보내기 대상' (#11)

## 버전

- v0.1 (2026-10-16): 초안. 필드를 추가하면 부 버전(0.2), 지우거나 뜻을 바꾸면 주 버전(1.0)을 올리고 두 사람이 함께 확인합니다.
- v0.2 (2026-10-19, 이용석 리뷰): `project.json` `cards[].cautions[].fields` 추가 (V2 구성안·근거에서 [주의] 표현이 나온 칸을 강조). 다른 필드는 그대로
