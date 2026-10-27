# 카드뉴스 제작 자동화 (Claude Code)

제품 소개 자료를 넣으면 Claude가 자료 분석 → 구성안 → 카드별 문구를 만들고,
HTML/CSS 템플릿으로 1080×1080 카드뉴스 PNG를 출력하는 프로젝트입니다.
제작 과정은 기록으로 남아 시간·수정·품질 지표를 분석할 수 있습니다.

> 현재 버전: v0.5 (기본 틀 + 세 실행 방식 규칙(대화·웹·평가) + 제작 기록·품질 지표 + 자동 테스트 + 규격 파일·지시문 탐지 + 측정 기반 글자 수 기준). `products/toneup-sunscreen`은 구조 확인용 **가상 예시 제품**이에요.

## 실행 방식

카드 제작은 **내 컴퓨터의 Claude Code**가 합니다. 배포된 **결과 보기 웹**(정적 사이트, 배포 링크)은 결과를 보여주기만 해요. 계획과 역할은 노션 [개발 계획서](https://app.notion.com/p/3f56bcfa1f8a8188a029dfbab57ff761)를 보세요.

| | 대화 모드 | 웹 모드 | 평가 모드 |
|---|---|---|---|
| 쓰는 사람 | 팀원 (터미널) | 팀원 (로컬 웹 제작 화면) | 평가 실행기 (평가용 입력 세트 반복 실행) |
| 실행 | 터미널의 Claude Code와 대화 | `npm run studio`로 켠 웹 화면에서 입력·승인·수정 요청 → 작업 실행기가 `claude -p`로 작업 하나씩 실행, 지시문은 `prompts/web/` | `npm run eval`이 같은 작업 실행기로 실행, 지시문은 `prompts/eval/`, 결과는 `eval/runs/<실행ID>/result.json` |
| 사람 확인 | 구성안 승인·최종 검토를 대화에서 | 구성안 승인·수정 요청·최종 승인을 웹 화면에서 | 없음. 구성안 승인은 '평가'로 자동 기록 |
| 결과 보기 | 결과 보기 웹 (`npm run export`로 내보낸 데이터) | 같음. 웹 화면의 [내보내기] 버튼 | 같음 + 평가 대시보드 |

## 사용 방법 (평가 모드)

평가용 입력(`eval/inputs/`)을 반복 실행해 품질·일관성·안전성을 잽니다. 규격은 [`docs/eval-spec.md`](docs/eval-spec.md).

```bash
npm run eval -- --batch v1-base --dry-run                 # 실행 목록만 확인 (사용량 없음)
npm run eval -- --batch v1-base                           # eval/inputs/의 모든 입력을 1번씩
npm run eval -- eval-injection --batch v1-repeat --repeat 3   # 한 입력을 3번 (A6 일관성)
npm run eval -- eval-oat-drink --batch v1-base --export       # 끝나면 결과 보기 웹 데이터로 내보내기
npm run compare -- --eval --batch v1-repeat                # 반복 실행 일관성 (A6): 입력 × 규칙 버전별로 반복끼리 비교
npm run eval -- --batch a8 --variant no-quote-rule         # 비교판 (A8): eval/variants/<이름>/의 바꾼 규칙으로 실행
```

- 실행 하나 = 구성안 작업 → 평가 승인(`approved_by: eval`) → 문구·출력 작업. 작업이 실패하면 거기서 멈추고, 그것도 결과로 남겨요.
- 실행 폴더 `eval/runs/<입력ID>--<규칙 버전>--r<N>/`는 제품 폴더와 모양이 같아요(`CARDNEWS_PRODUCTS_DIR=eval/runs`로 `validate`·`log --summary` 사용 가능). 같은 실행ID가 있으면 시작 전에 멈추니 `--from`으로 반복 번호를 올려요.
- `result.json`은 쓰기 전에 `schemas/eval/run-result.schema.json`으로 검사해요. 체크리스트 판정(기대 동작·금지 표현)과 핵심 정보 포함률이 들어 있어요.
- `--variant <이름>`은 실행ID에 비교판 이름만 붙여요(A8). 규칙 일부를 뺀 판을 실제로 만드는 방법은 A8 작업에서 정해요.
- 사용량이 들어요. 실행마다 `claude -p` 작업 1~2번이라 정상 입력 하나에 몇 분 걸려요. 웹 모드 제작과 동시에 돌리지 마세요.

## 사용 방법 (웹 모드)

```bash
npm run web:install   # 최초 1회
claude                # Claude Code 로그인 확인 (최초 1회, 로그인돼 있으면 /exit)
npm run studio        # → http://127.0.0.1:5173/studio
```

1. **작업실**(`/studio`)에서 [+ 새 제작] → 입력 폼(`config/input-form.json`)을 채우고 이미지를 올리면 `products/<제품ID>/input.md`·`images/`가 만들어지고 입력 확인을 바로 해요.
2. [구성안 만들기] → 이 컴퓨터에서 `claude -p`가 구성안 작업을 해요. 진행 상황이 화면에 나와요.
3. 구성안을 보고 [구성안 승인하고 문구 만들기] 또는 [구성안 수정 요청](유형·내용 선택).
4. 카드 PNG를 보고 [최종 승인] 또는 [카드 수정 요청](카드 번호·유형·내용).
5. [내보내기] → 결과 보기 웹 데이터(`web/public/data/`)가 갱신돼요. 배포하려면 `web/public/data/`와 `config/export.json`을 커밋합니다.

- 작업 실행기(`scripts/lib/job-runner.js`)는 임시 작업 폴더에 규칙과 이 제품만 복사해 실행하고, 허용된 도구·명령(`cards.json` 쓰기, `check`·`validate`·`render`)만 쓰게 해요. 끝나면 결과를 다시 검증해 통과할 때만 반영해요.
- 작업은 한 번에 하나씩 돌아요. 다른 제품 작업 중에 시작하면 대기열에 들어가 차례로 자동 시작하고, 화면 위 띠에 진행 중·대기 작업이 보여요. 사용량은 로그인한 Claude 계정에서 나가요.
- 로컬 제작 API(`/api/studio`)는 개발 서버에만 있고 `127.0.0.1`에서만 열려요. 배포 사이트에는 들어가지 않아요.
- 화면 시험: `CARDNEWS_STUDIO_SANDBOX=<폴더> CARDNEWS_CLAUDE_BIN=tests/fixtures/fake-claude.js npm run studio` (가짜 Claude, 시험용 제품 폴더)

## 설치

```bash
npm install
npx playwright install chromium   # PNG 출력용 브라우저 (최초 1회)
npm test                          # 검사·규격 테스트 (입력 누락, 형식·근거·글자 수 오류, 지시문 탐지, 규격 일치)
npm run test:render               # 출력 테스트 (PNG 크기·장수, 카드 1장 재출력, 글자 수 기준을 꽉 채워도 넘치지 않는지)
npm run test:web                  # 웹 화면 테스트 (V2 구성안·근거, 입력 폼 무드 선택). npm run web:install 먼저
```

브랜치·커밋·PR 규칙과 테스트 추가 방법은 [`CONTRIBUTING.md`](CONTRIBUTING.md)를 봐 주세요.

## Claude Code · Codex로 교대 개발

두 도구 모두 이 저장소 폴더에서 작업합니다. 진입점은 Claude Code가 [CLAUDE.md](CLAUDE.md), Codex가 [AGENTS.md](AGENTS.md)이고, 둘 다 [공통 맥락](docs/project-context.md)과 [인수인계](docs/handoff.md)를 함께 봅니다.

- 작업은 이슈 → 브랜치 → PR 순서로 하고, `main` 병합은 관리자가 결정합니다. ([CONTRIBUTING.md](CONTRIBUTING.md))
- 작은 작업이 끝나거나 중단될 때마다 인수인계를 갱신합니다. 규칙·용어·파일이 바뀌면 '최근 변경'에 남겨 다음 도구가 알 수 있게 합니다.
- 교대 전에 편집·실행을 끝내고, 같은 폴더에서는 한 도구만 수정합니다.
- 카드 제작(대화 모드·웹 모드·평가 모드)의 승인 절차는 `CLAUDE.md`가 기준이며, 인수인계가 대신하지 않습니다.

새 세션에서 요청할 예시:

> 이 저장소의 지침과 docs/project-context.md, docs/handoff.md를 읽고 실제 브랜치·변경 상태를 대조해 이어서 작업해. 현재 목표와 완료 조건을 유지하고, 필요한 자료만 확인해. 완료하거나 중단할 때 인수인계를 갱신해.

## 사용 방법 (대화 모드)

Claude Code에서 이렇게 요청합니다.

```
toneup-sunscreen 카드뉴스 만들어줘
3번 카드 제목 더 짧게 수정해줘
```

Claude Code는 `CLAUDE.md`의 작업 단위(구성안 → 문구·출력 → 수정)와 두 Skill을 따라 아래 명령을 실행합니다. 직접 실행해도 됩니다.

| 명령 | 하는 일 |
|---|---|
| `npm run new-product -- <제품ID>` | 새 제품 폴더와 빈 입력 양식 만들기 |
| `npm run check -- <제품ID>` | 입력 양식 필수 항목, 이미지 파일·사용 가능 여부, 지시문 형태 문장 확인. 끝에 이 제품의 무드(기본·프리미엄)에 맞는 카드 글자 수 기준과 카드 색을 출력 |
| `npm run validate -- <제품ID>` | JSON 형식, 필수 필드, 카드 수, 원문 근거 일치, 글자 수(전체·한 줄·줄 수), 주의 표현 검사 + 품질 지표 |
| `npm run render -- <제품ID>` | HTML·PNG 출력 + 글자 넘침·이미지 로드 점검 |
| `npm run render -- <제품ID> --card 3` | 3번 카드만 재출력 |
| `npm run log -- <제품ID> <이벤트> ...` | 작업 시작·끝, 승인, 수정 요청 기록 |
| `npm run log -- <제품ID> --summary` | 단계별 시간, 수정 유형, 자동 수정, 1회 통과, 품질 지표 요약 (`--json` 가능) |
| `npm run new-run -- <원본ID> <새ID>` | 같은 입력으로 실험용 제작 폴더 만들기 |
| `npm run compare -- <ID1> <ID2> ...` | 제작 결과 비교: Skill 버전 비교, 반복 실행 일관성. `--eval [--batch <묶음>]`이면 평가 실행(`eval/runs/`)을 입력 × 규칙 버전 × 비교판으로 묶어 반복끼리 비교(완료·체크리스트 통과 수, 중단 오류 코드, 카드 구성 일치율, 근거 겹침, 지표 편차), `--json` |
| `npm run web:install` · `npm run web:dev` · `npm run web:build` | 결과 보기 웹 설치·개발 서버(http://127.0.0.1:5173)·빌드. 자세한 내용은 [`web/README.md`](web/README.md) |
| `npm run studio` | 웹 모드 제작 화면 켜기 (= `web:dev`, 로컬 제작 API 포함) |
| `npm run export` | 승인된 결과와 완료된 평가 실행(`eval/runs/`)을 결과 보기 웹 데이터(`web/public/data/`)로 내보내기. 대상은 `config/export.json` + 평가 실행, 제외되면 이유 출력 (`--only <제품ID>`, `--out <폴더>`, `--no-eval`) |
| `npm run check:web` | 배포 전 점검: 웹 데이터(`web/public/data/`)·빌드 결과(`web/dist/`)에 규격 밖 파일·비밀 값·사용 확인 안 된 이미지(`가능`이 아닌 것)가 없는지. 오류면 종료 코드 1 (`--data`·`--dist`·`--no-dist`·`--json`) |
| `npm run eval -- [입력ID...] --batch <이름>` | 평가 실행기: 평가 입력을 `claude -p`로 실행하고 `eval/runs/<실행ID>/result.json` 남김 (`--repeat`·`--from`·`--variant`·`--model`·`--dry-run`·`--export`) |
| `npm run calibrate` | 템플릿별 최대 글자 수 측정 (`--check`: 기준을 꽉 채워도 넘치지 않는지 확인). 템플릿 CSS를 바꾸면 실행 |

미리보기: `products/<제품ID>/output/html/index.html`을 브라우저로 열면 전체 카드를 한 번에 볼 수 있어요.

## 제작 기록과 분석

- `validate`·`render`는 결과를 `products/<제품ID>/log.jsonl`에 자동으로 남기고, 품질 지표를 `output/quality.json`에 저장합니다.
- 작업 시작·끝, 승인, 수정 요청(유형 코드 LEN·TONE·FACT 등)은 대화 모드에서 Claude가, 웹 모드에서 작업 실행기·웹 제작 화면이, 평가 모드에서 평가 실행기가 남깁니다.
- 모든 기록에 규칙 버전(`config/skill-version.json`)이 붙습니다. 규칙을 고치면 버전을 올려 v1·v2 결과를 비교합니다.
- **평가 방식 (2026-10-16)**: 실사용자가 없으므로, 평가용 입력 세트 12개(정상 8·경계 4)와 핵심 정보 체크리스트를 평가 실행기(`npm run eval`)로 반복 실행해 품질·일관성·안전성·규칙 버전 효과를 측정합니다. 자세한 내용은 [공통 맥락](docs/project-context.md) '평가와 미결정'.
- 형식과 지표 정의: `docs/event-log-spec.md`

실험 예시:

```bash
npm run new-run -- toneup-sunscreen toneup-sunscreen-v2      # v2 규칙으로 다시 제작할 폴더
npm run compare -- toneup-sunscreen toneup-sunscreen-v2
```

## 폴더 구조

```
├── CLAUDE.md                         # 공통 규칙 (실행 방식, 작업 단위, 입력 자료 취급, 내용 규칙, 오류 처리, 기록)
├── AGENTS.md                         # Codex 진입점 (규칙은 CLAUDE.md·공통 맥락을 가리킴)
├── .claude/skills/
│   ├── cardnews-content/SKILL.md     # 콘텐츠 생성 Skill: 입력 확인 ~ 데이터 검증, 수정 요청
│   └── cardnews-render/SKILL.md      # 카드 출력 Skill: 템플릿 적용 ~ 재출력
├── prompts/web/                      # 웹 모드 작업 지시문 (plan, copy, revise)
├── prompts/eval/                     # 평가 모드 작업 지시문 (plan, copy)
├── schemas/cards.schema.json         # 카드 구성 데이터 JSON 스키마 (형식 규격)
├── schemas/web-data/                 # 웹 데이터(결과 보기 웹) JSON 스키마: index·project·timeline
├── config/
│   ├── input-form.json               # 입력 양식 항목 정의 (검사·빈 양식·웹 입력 폼 공통)
│   ├── input-safety.json             # 입력 자료 속 지시문 탐지 패턴
│   ├── templates.json                # 템플릿별 필드·글자 수 기준 (측정값 기반)
│   ├── theme.json                    # 색상·폰트 공통 설정 (Figma color/* 변수와 같은 이름). 출력 때 글자 대비 4.5 이상으로 조정, 제품 색은 docs/card-color.md
│   ├── caution-expressions.json      # 주의 표현 목록 (식약처 지침 기준, 판단은 docs/style-guide.md)
│   ├── revision-types.json           # 수정 요청 유형 코드
│   ├── export.json                   # 웹에 내보낼 제품 목록·출력 폴더 (npm run export)
│   └── skill-version.json            # 규칙 버전
├── docs/
│   ├── input-form.md                 # 입력 양식
│   ├── card-data-spec.md             # 카드 구성 데이터(JSON) 규격
│   ├── style-guide.md                # 카드 구성·문체 기준
│   ├── event-log-spec.md             # 제작 기록·지표 규격
│   ├── web-data-spec.md              # 웹 데이터 규격 (내보내기 → 결과 보기 웹)
│   ├── examples/web-data/            # 웹 데이터 예시 (웹 화면 개발용)
│   ├── project-context.md            # 교대 개발 공통 맥락 (용어·설계 이유·개발 작업 규칙)
│   └── handoff.md                    # 개발 인수인계 (현재 작업·최근 변경·다음 행동)
├── templates/                        # base.css + 표지형·이미지 강조형·설명형
├── scripts/                          # check-input, validate, render, log, compare, new-run, export, lib/
│   └── lib/job-runner.js · studio-api.js · eval-runner.js  # 작업 실행기(웹·평가 모드 공통) · 로컬 제작 API · 평가 실행기
├── web/                              # 결과 보기 웹 + 로컬 제작 화면(/studio) (React·TS·Vite, 화면별 담당은 web/README.md)
│   └── public/data/                  # 내보낸 웹 데이터 (npm run export가 생성, 커밋함)
├── eval/inputs/                      # 평가 입력 세트 (input.md + 체크리스트, 형식: docs/eval-spec.md · eval/inputs/README.md)
├── eval/variants/                    # 평가 비교판 (A8): 바꾼 규칙 파일, 형식은 eval/variants/README.md
├── eval/runs/                        # 평가 실행 결과 (npm run eval이 생성, 실행ID 폴더마다 result.json)
├── tests/                            # 자동 테스트 (예시 제품을 임시 폴더에 복사해 오류 상황을 만듦, fixtures/fake-claude.js: 가짜 Claude Code)
├── CONTRIBUTING.md                   # 협업 규칙
└── products/<제품ID>/                # 제품별 입력·데이터·출력·제작 기록 (test-*: 입력 누락·지시문 테스트 자료, *-r1: 대화 모드 실행 기록)
```

## 담당 범위 (2026-10-16 개발 계획서 기준)

기능·화면 단위로 나눕니다. 각자 맡은 기능을 개발·테스트·문서까지 끝내고, PR은 상대가 리뷰합니다.

| 담당 | 웹 화면 | 프로그램·규칙 | 제작·평가 | 주요 파일 (예정 포함) |
|---|---|---|---|---|
| 이규동 | 웹 골격·공통 부품, V1 프로젝트 목록, V2 카드 결과, V2 제작 과정 | 내보내기(`npm run export`), 평가 실행기(`npm run eval`), 배포, 입력 확인·검증·출력·기록 스크립트, 템플릿 | 제품 A·B 자료, 평가 입력 6개(제품 A·B·입력 누락·지시문), A6 일관성, A8(권장) | `scripts/`, `templates/`, `config/theme.json`, `config/templates.json`, `docs/input-form.md`, `scripts/export.js`, `scripts/eval.js`, `web/` 골격·V1·V2 카드 결과·제작 과정 |
| 이용석 | V2 구성안·근거, V3 평가 대시보드, V4 버전 비교(권장) | 핵심 정보 포함률 지표, 평가 결과 집계, 주의 표현 검사 기준, `CLAUDE.md`·Skill(v2) | 톤업 선크림 제작, 평가 입력 6개(톤업·과장 원문·긴 원문), A5 규칙 버전 비교, A7 안전성 | `CLAUDE.md`, `.claude/skills/`, `docs/style-guide.md`, `config/caution-expressions.json`, `scripts/lib/` 핵심 정보·집계, `web/` V2 구성안·근거·V3·V4 |
| 공동 (둘 다 승인) | — | 연결 규격 3개, 규칙 버전 | 체크리스트 교차 검토, 통합 테스트, 리포트 | `docs/card-data-spec.md`, `docs/web-data-spec.md`, `docs/eval-spec.md`, `schemas/`, `docs/event-log-spec.md`, `config/skill-version.json`, `config/revision-types.json`, `evals/` |

## 원문 근거 검증 방식

`cards.json`의 `sources[].quote`는 `input.md` 원문에 글자 그대로 있어야 합니다.
검증 프로그램이 문자열 일치로 확인하므로, AI가 원문을 바꿔 인용하거나 없는 내용을 근거로 달면 `EVIDENCE_ERROR`가 납니다.
단, 문구(`copy`)가 근거의 의미를 넘어서는지는 자동으로 판단할 수 없어 최종 검토에서 사람이 확인합니다.

## 초기 작업 단계

| 단계 | 내용 | 상태 |
|---|---|---|
| 1. 기반 정비·자동 테스트 | 오류 코드별 테스트(`npm test`), 출력 테스트, 협업 규칙 파일 | 완료 (v0.3) |
| 2. 입력·데이터 규격 확정 | JSON 스키마, 입력 양식 정의 파일, 지시문 탐지, 입력 누락·지시문 테스트 자료, 규격 일치 테스트 | 완료 (v0.4) |
| 3. 템플릿 3종·디자인 반영 | Figma 토큰 ↔ `theme.json`, 글자 수 측정 도구(`calibrate`)로 기준 조정, 줄바꿈 기준, 이미지 겹침 점검 | 완료 (v0.4) |
| 4. 첫 실제 제작 (대화 모드) | 대화 모드 전체 흐름(구성안 → 승인 → 문구·출력 → 최종 승인 → 기록) 점검, 입력 누락·지시문 자료로 안전 규칙 확인 | 흐름 점검 완료 (v0.5, 가상 자료) · 실제 자료 제작은 자료 받은 뒤 |
| 5. Agent SDK PoC | 서비스 모드 작업 1개 실행, 권한·비용 확인 | 2026-10-16 범위 제외. 서비스 모드는 평가 모드로 바뀜(#9), 실행기 코드는 `feat/3-agent-sdk-poc` 브랜치에 보관 |

이후 일정과 담당별 작업은 노션 [개발 계획서](https://app.notion.com/p/3f56bcfa1f8a8188a029dfbab57ff761) 8장과 작업 트래커에서 관리합니다. 멘토 확인 사항(웹 범위·공개 범위·실제 자료·평가 기준)은 노션 회의·멘토링 기록에 있습니다.
