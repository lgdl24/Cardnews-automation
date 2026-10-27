# 제작 기록(이벤트)·지표 규격 — v0.3

데이터 분석(A1~A8)의 원본 데이터 형식입니다. 대화 모드·웹 모드·평가 모드 모두 제품(평가 실행이면 실행별) 폴더의 `products/<제품ID>/log.jsonl`에 한 줄씩 저장합니다.
결과 보기 웹에는 내보내기(`npm run export`)가 공개해도 되는 필드만 옮깁니다(`docs/web-data-spec.md`).
계산 코드: `scripts/lib/metrics.js`(품질 지표), `scripts/lib/analysis.js`(과정 지표).

## 공통 필드

| 필드 | 설명 |
|---|---|
| `ts` | 기록 시각 (ISO 8601, UTC) |
| `event` | 이벤트 이름 |
| `project_id` | 제품ID |
| `job_id` | 작업 ID. 작업 밖 이벤트는 `null`. 대화 모드는 `cli-YYYYMMDD-HHMMSS-xxx`, 웹 모드·평가 모드는 작업 실행기가 정한 ID(`job-YYYYMMDD-HHMMSS-xxx`, `CARDNEWS_JOB_ID`) |
| `skill_version` | `config/skill-version.json`의 `version` |

## 이벤트

| 이벤트 | 추가 필드 | 누가 남기나 (대화 / 웹 / 평가) |
|---|---|---|
| `input_submitted` | `form_started_at`(선택, 입력 작성을 시작한 시각) | Claude / 웹 제작 화면 / 평가 실행기 |
| `job_started` | `kind`: `plan` · `copy` · `revise`, `executor`(웹·평가 모드: `claude-cli`) | Claude / 작업 실행기 / 작업 실행기 |
| `job_finished` | `kind`, `ok`, `error_code` | Claude / 작업 실행기 / 작업 실행기 |
| `validate_result` | `check`: `data` · `layout`, `ok`, `error_codes`, `error_count`, `cards_with_errors`, `caution_count`, `stage`, `metrics`(data만), `rendered_cards`(layout만) | `validate`·`render` 스크립트 (세 모드 같음) |
| `plan_approved` | `approved_by`(선택): `human`(기본) · `eval` | Claude / 웹 제작 화면(`human`) / 평가 실행기(`eval`) |
| `final_approved` | `approved_by`(선택): `human`(기본) · `eval` | Claude / 웹 제작 화면(`human`) / (평가 모드는 남기지 않음) |
| `design_selected` | `design`(고른 묶음), `from`(바꾸기 전 묶음, 없으면 `null`), `by`: `human` | (대화 모드는 cards.json을 직접 고침) / 웹 제작 화면 / (평가 모드에는 없음) — 구성안 확인 때 사람이 디자인 묶음을 바꿈 (#74) |
| `revision_requested` | `stage`: `plan` · `final`, `cards`(카드 번호 배열, 전체면 빈 배열 — 웹 모드는 전체면 `cards`를 남기지 않음), `types`(유형 코드 배열), `memo` | Claude / 웹 제작 화면 / (평가 모드에는 없음) |

- 웹 모드·평가 모드(`CARDNEWS_MODE=web|eval`)에서는 `log.js`가 기록하지 않습니다. 작업 시작·끝은 작업 실행기(`scripts/lib/job-runner.js`)가, 입력·승인·수정 요청은 웹 모드는 웹 제작 화면(로컬 제작 API `scripts/lib/studio-api.js`)이, 평가 모드는 평가 실행기가 남깁니다. `validate_result`는 세 모드 모두 스크립트가 남깁니다.
- 분석 코드(`scripts/lib/analysis.js`)는 `revision_requested`에 `cards`가 없으면 빈 배열(전체)로 읽습니다.
- `approved_by`가 없으면 사람이 승인한 것으로 봅니다. 평가 실행의 자동 승인은 `eval`로 남겨 실제 제작과 구분합니다.
- `validate`·`render`에 `--no-log`를 붙이거나 `CARDNEWS_NO_LOG=1`이면 기록하지 않습니다. (평가 실행기의 재검증용)
- 유형 코드는 `config/revision-types.json`이 원본입니다.

예시:

```json
{"ts":"2026-10-10T03:00:31.745Z","event":"job_started","project_id":"toneup-sunscreen","job_id":"cli-20261010-030031-k3d","skill_version":"v1","kind":"plan"}
{"ts":"2026-10-10T03:12:05.120Z","event":"revision_requested","project_id":"toneup-sunscreen","job_id":null,"skill_version":"v1","stage":"final","cards":[3],"types":["LEN"],"memo":"제목 더 짧게"}
```

## 품질 지표 (`validate`가 계산 → `output/quality.json`, `validate_result.metrics`)

| 지표 | 키 | 계산 |
|---|---|---|
| 원문 커버리지 | `coverage` | '주요 특징' 목록 항목과 '사용 방법' 문장 중, 카드 `evidence`가 가리키는 인용을 포함하거나(또는 인용에 포함되는) 항목의 비율. 지시문 형태 문장(`config/input-safety.json`)은 대상에서 빼고 `coverage_detail.excluded`에 남김 |
| 근거 연결률 | `evidence_rate` | `evidence`가 1개 이상인 카드 ÷ 전체 카드 |
| 글자 수 활용률 | `char_usage`, `char_usage_max` | 필드별 글자 수 ÷ 기준을 카드별로 평균 → 전체 평균. 최대값은 넘침 위험 확인용 (문구 단계만) |
| 주의 표현 | `caution.total`, `in_source`, `not_in_source` | 주의 표현 목록과 일치한 건수, 원문에 같은 표현이 있는지 구분 (문구 단계만) |
| 빠진 원문 항목 수 | `missing_items`, `excluded_items` | 커버리지에서 빠진 항목 수, 지시문 형태라 대상에서 뺀 항목 수. 목록은 `quality.json`의 `coverage_detail.missing`·`excluded` |

## 과정 지표 (`npm run log -- <제품ID> --summary [--json]`)

| 지표 | 계산 |
|---|---|
| 작업별 소요 시간 | 구성안·문구·수정 작업 = `job_started`~`job_finished` (작업 종류별 합) |
| 총 제작 시간 | AI 작업 시간 합 = 작업별 소요 시간의 합 (`total_minutes` = `ai_minutes`). 시간을 잰 작업이 없으면 비움 |

> 사람이 입력·확인·대기한 시간은 지표에 넣지 않습니다 (v0.3). 웹 제작 화면에서 여러 제품을 번갈아 다루면 다른 제품 작업·자리 비움 시간이 이 제품의 확인 시간으로 잡혀 제품끼리 비교할 수 없기 때문이에요. 기록(`form_started_at`, 승인·수정 요청 시각)은 그대로 남깁니다.
| 구성안 수정 요청 / 카드 수정 요청 | `revision_requested`의 `stage`별 건수 |
| 수정 카드 비율 | 카드 수정 요청에 나온 카드 번호 수 ÷ 전체 카드 |
| 수정 유형 분포 | `types` 코드별 건수 |
| 1회 통과 | 첫 문구·출력 작업에서 첫 `data` 검사와 첫 `layout` 검사가 모두 오류 0개 |
| 자동 수정 횟수 | 작업 안에서 실패한 검사 뒤에 다시 검사가 있는 횟수의 합 |

## 실험 (A5·A6)

```
npm run new-run -- toneup-sunscreen toneup-sunscreen-v2     # 같은 입력으로 새 제작 폴더
npm run compare -- toneup-sunscreen toneup-sunscreen-v2      # 규칙 버전 비교
npm run compare -- toneup-sunscreen-r1 toneup-sunscreen-r2 toneup-sunscreen-r3   # 반복 일관성
```

`compare`는 제작별 품질·과정 지표를 나란히 보여주고, 일관성 지표(카드 역할·템플릿 순서 일치율, 사용한 원문 근거 겹침 = 교집합 ÷ 합집합, 지표 편차)를 계산합니다. 입력 원문이 다르면 경고합니다.

## 버전

- v0.1 (2026-10-10): 첫 정의. 이벤트·필드를 추가하면 부 버전, 의미를 바꾸면 주 버전을 올리고 노션 '데이터 분석 설계'도 함께 고칩니다.
- v0.3 (2026-10-27): 과정 지표의 시간을 AI 작업 시간만으로 — 입력·구성안 확인·최종 검토(사람) 시간과 `human_minutes`를 없애고, 총 제작 시간 = AI 작업 시간 합. 이벤트 기록은 그대로
- v0.2 (2026-10-19, 이용석 리뷰): 웹 모드(#21) 반영 — 누가 남기나에 웹 모드 칸, `job_started.executor`, 웹·평가 모드 `job_id` 형식, 웹 모드의 `revision_requested.cards` 생략. 기록 내용은 바뀌지 않음(코드에 이미 있는 것을 문서에 맞춤)
