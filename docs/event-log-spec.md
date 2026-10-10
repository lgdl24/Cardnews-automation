# 제작 기록(이벤트)·지표 규격 — v0.1

데이터 분석(A1~A7)의 원본 데이터 형식입니다. 개발 모드는 `products/<제품ID>/log.jsonl`에 한 줄씩,
서비스 모드는 같은 형식을 DB 이벤트 테이블(`EVENT.type`, `EVENT.payload_json`)에 저장합니다.
계산 코드: `scripts/lib/metrics.js`(품질 지표), `scripts/lib/analysis.js`(과정 지표).

## 공통 필드

| 필드 | 설명 |
|---|---|
| `ts` | 기록 시각 (ISO 8601, UTC) |
| `event` | 이벤트 이름 |
| `project_id` | 제품ID (서비스 모드는 프로젝트 ID) |
| `job_id` | 작업 ID. 작업 밖 이벤트는 `null`. 개발 모드는 `cli-YYYYMMDD-HHMMSS-xxx` |
| `skill_version` | `config/skill-version.json`의 `version` |

## 이벤트

| 이벤트 | 추가 필드 | 누가 남기나 (개발 / 서비스) |
|---|---|---|
| `input_submitted` | `form_started_at`(선택, 입력 폼을 연 시각) | Claude / 서버 |
| `job_started` | `kind`: `plan` · `copy` · `revise` | Claude / 서버 |
| `job_finished` | `kind`, `ok`, `error_code`, `input_tokens`, `output_tokens`, `cost_usd` | Claude (토큰·비용 없음) / 서버 (SDK 결과값) |
| `validate_result` | `check`: `data` · `layout`, `ok`, `error_codes`, `error_count`, `cards_with_errors`, `caution_count`, `stage`, `metrics`(data만), `rendered_cards`(layout만) | `validate`·`render` 스크립트 (두 모드 같음) |
| `plan_approved` | — | Claude / 서버 |
| `final_approved` | — | Claude / 서버 |
| `revision_requested` | `stage`: `plan` · `final`, `cards`(카드 번호 배열, 전체면 빈 배열), `types`(유형 코드 배열), `memo` | Claude / 서버 |

- 서비스 모드의 `validate_result`는 작업 폴더의 `log.jsonl`에 쌓이고, 작업이 끝나면 서버가 DB로 옮깁니다.
- `validate`·`render`에 `--no-log`를 붙이거나 `CARDNEWS_NO_LOG=1`이면 기록하지 않습니다. (서버의 재검증용)
- 유형 코드는 `config/revision-types.json`이 원본입니다.

예시:

```json
{"ts":"2026-10-10T03:00:31.745Z","event":"job_started","project_id":"toneup-sunscreen","job_id":"cli-20261010-030031-k3d","skill_version":"v1","kind":"plan"}
{"ts":"2026-10-10T03:12:05.120Z","event":"revision_requested","project_id":"toneup-sunscreen","job_id":null,"skill_version":"v1","stage":"final","cards":[3],"types":["LEN"],"memo":"제목 더 짧게"}
```

## 품질 지표 (`validate`가 계산 → `output/quality.json`, `validate_result.metrics`)

| 지표 | 키 | 계산 |
|---|---|---|
| 원문 커버리지 | `coverage` | '주요 특징' 목록 항목과 '사용 방법' 문장 중, 카드 `evidence`가 가리키는 인용을 포함하거나(또는 인용에 포함되는) 항목의 비율 |
| 근거 연결률 | `evidence_rate` | `evidence`가 1개 이상인 카드 ÷ 전체 카드 |
| 글자 수 활용률 | `char_usage`, `char_usage_max` | 필드별 글자 수 ÷ 기준을 카드별로 평균 → 전체 평균. 최대값은 넘침 위험 확인용 (문구 단계만) |
| 주의 표현 | `caution.total`, `in_source`, `not_in_source` | 주의 표현 목록과 일치한 건수, 원문에 같은 표현이 있는지 구분 (문구 단계만) |
| 빠진 원문 항목 수 | `missing_items` | 커버리지에서 빠진 항목 수. 목록은 `quality.json`의 `coverage_detail.missing` |

## 과정 지표 (`npm run log -- <제품ID> --summary [--json]`)

| 지표 | 계산 |
|---|---|
| 단계별 소요 시간 | 입력 = `input_submitted` − `form_started_at` / 구성안·문구·수정 작업 = `job_started`~`job_finished` / 구성안 확인·최종 검토 = 작업이 끝난 뒤 다음 승인·수정 요청·작업 시작까지 (구성안 승인 전이면 구성안 확인) |
| AI 처리 / 사람 검토 시간 | 작업 시간 합 / 입력·구성안 확인·최종 검토 시간 합 |
| 총 제작 시간 | 첫 기록(또는 `form_started_at`) ~ `final_approved` (승인 전이면 마지막 기록까지) |
| 구성안 수정 요청 / 카드 수정 요청 | `revision_requested`의 `stage`별 건수 |
| 수정 카드 비율 | 카드 수정 요청에 나온 카드 번호 수 ÷ 전체 카드 |
| 수정 유형 분포 | `types` 코드별 건수 |
| 1회 통과 | 첫 문구·출력 작업에서 첫 `data` 검사와 첫 `layout` 검사가 모두 오류 0개 |
| 자동 수정 횟수 | 작업 안에서 실패한 검사 뒤에 다시 검사가 있는 횟수의 합 |
| 토큰·비용 | `job_finished`의 값 합계 (서비스 모드만) |

## 실험 (A5·A6)

```
npm run new-run -- toneup-sunscreen toneup-sunscreen-v2     # 같은 입력으로 새 제작 폴더
npm run compare -- toneup-sunscreen toneup-sunscreen-v2      # 규칙 버전 비교
npm run compare -- toneup-sunscreen-r1 toneup-sunscreen-r2 toneup-sunscreen-r3   # 반복 일관성
```

`compare`는 제작별 품질·과정 지표를 나란히 보여주고, 일관성 지표(카드 역할·템플릿 순서 일치율, 사용한 원문 근거 겹침 = 교집합 ÷ 합집합, 지표 편차)를 계산합니다. 입력 원문이 다르면 경고합니다.

## 버전

- v0.1 (2026-10-10): 첫 정의. 이벤트·필드를 추가하면 부 버전, 의미를 바꾸면 주 버전을 올리고 노션 '데이터 분석 설계'도 함께 고칩니다.
