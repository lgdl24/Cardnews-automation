# 카드 구성 데이터(JSON) 규격 — 초안 v0.1

콘텐츠 생성 단계(팀원2)와 출력 단계(팀원1)를 잇는 공통 규격입니다.
이 규격을 바꿀 때는 두 사람이 함께 확인하고 버전을 올립니다.

파일 위치: `products/<제품ID>/cards.json`

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
| `stage` | O | `plan`(구성안) → `copy`(문구 생성 완료) → `approved`(최종 검토 완료). `approved`는 사람이 승인한 뒤에만 바꿈 (서비스 모드는 서버가 바꿈) |
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
| `image` | 템플릿별 | `images/` 안의 파일명. `image` 템플릿은 필수, `description`은 사용 안 함 |
| `evidence` | 역할별 | `feature` · `usage` · `detail`은 1개 이상 필수 |
| `copy` | `stage`가 `copy` 이후면 필수 | 템플릿별 필드는 아래 표 |

### 템플릿별 `copy` 필드

| 템플릿 | 필드 | 글자 수(공백 포함) |
|---|---|---|
| `cover` | `title`(필수), `subtitle`, `badge` | 22 / 34 / 12 |
| `image` | `title`(필수), `caption` | 18 / 40 |
| `description` | `title`(필수), `items`(필수, 1~3개 배열) | 18 / 항목당 30 |

- 줄바꿈이 필요하면 문자열 안에 `\n`을 넣습니다. 글자 수에는 포함되지 않습니다.
- 글자 수 기준의 원본은 `config/templates.json`이며, 이 표는 설명용입니다.

## 관련 파일

- 품질 지표(`output/quality.json`)와 제작 기록(`log.jsonl`) 형식: `docs/event-log-spec.md`
- 웹에서는 이 파일을 그대로 쓰고, 카드별 버전·수정 요청은 DB에 따로 저장합니다. (`docs/service-mode.md`)
