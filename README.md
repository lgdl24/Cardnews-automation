# 카드뉴스 제작 자동화 (Claude Code)

제품 소개 자료를 넣으면 Claude가 자료 분석 → 구성안 → 카드별 문구를 만들고,
HTML/CSS 템플릿으로 1080×1080 카드뉴스 PNG를 출력하는 프로젝트입니다.
제작 과정은 기록으로 남아 시간·수정·품질 지표를 분석할 수 있습니다.

> 현재 버전: v0.3 (기본 틀 + 두 실행 방식 규칙 + 제작 기록·품질 지표 + 자동 테스트). `products/toneup-sunscreen`은 구조 확인용 **가상 예시 제품**이에요.

## 두 가지 실행 방식

같은 `CLAUDE.md`·Skill·스크립트를 두 방식으로 실행합니다.

| | 개발 모드 | 서비스 모드 |
|---|---|---|
| 쓰는 사람 | 팀원 (개발·실험) | 기업 관리자 (관리자 웹) |
| 실행 | 터미널의 Claude Code | 웹 서버가 Agent SDK로 실행 (`docs/service-mode.md`) |
| 사람 확인 | 터미널 대화 | 웹 화면 (구성안 승인, 카드 검토) |
| 상태 | 사용 가능 | 웹 서버 구현 예정 (규격·작업 지시문 준비됨) |

## 설치

```bash
npm install
npx playwright install chromium   # PNG 출력용 브라우저 (최초 1회)
npm test                          # 검사 기능 테스트 (오류 코드별 경우 39개)
npm run test:render               # 출력 테스트 (PNG 크기·장수, 카드 1장 재출력)
```

브랜치·커밋·PR 규칙과 테스트 추가 방법은 [`CONTRIBUTING.md`](CONTRIBUTING.md)를 봐 주세요.

## 사용 방법 (개발 모드)

Claude Code에서 이렇게 요청합니다.

```
toneup-sunscreen 카드뉴스 만들어줘
3번 카드 제목 더 짧게 수정해줘
```

Claude Code는 `CLAUDE.md`의 작업 단위(구성안 → 문구·출력 → 수정)와 두 Skill을 따라 아래 명령을 실행합니다. 직접 실행해도 됩니다.

| 명령 | 하는 일 |
|---|---|
| `npm run check -- <제품ID>` | 입력 양식 필수 항목, 이미지 파일·사용 가능 여부 확인 |
| `npm run validate -- <제품ID>` | JSON 형식, 필수 필드, 카드 수, 원문 근거 일치, 글자 수, 주의 표현 검사 + 품질 지표 |
| `npm run render -- <제품ID>` | HTML·PNG 출력 + 글자 넘침·이미지 로드 점검 |
| `npm run render -- <제품ID> --card 3` | 3번 카드만 재출력 |
| `npm run log -- <제품ID> <이벤트> ...` | 작업 시작·끝, 승인, 수정 요청 기록 |
| `npm run log -- <제품ID> --summary` | 단계별 시간, 수정 유형, 자동 수정, 1회 통과, 품질 지표 요약 (`--json` 가능) |
| `npm run new-run -- <원본ID> <새ID>` | 같은 입력으로 실험용 제작 폴더 만들기 |
| `npm run compare -- <ID1> <ID2> ...` | 제작 결과 비교: Skill 버전 비교, 반복 실행 일관성 |

미리보기: `products/<제품ID>/output/html/index.html`을 브라우저로 열면 전체 카드를 한 번에 볼 수 있어요.

## 제작 기록과 분석

- `validate`·`render`는 결과를 `products/<제품ID>/log.jsonl`에 자동으로 남기고, 품질 지표를 `output/quality.json`에 저장합니다.
- 작업 시작·끝, 승인, 수정 요청(유형 코드 LEN·TONE·FACT 등)은 개발 모드에서 Claude가, 서비스 모드에서 서버가 남깁니다.
- 모든 기록에 규칙 버전(`config/skill-version.json`)이 붙습니다. 규칙을 고치면 버전을 올려 v1·v2 결과를 비교합니다.
- 형식과 지표 정의: `docs/event-log-spec.md`

실험 예시:

```bash
npm run new-run -- toneup-sunscreen toneup-sunscreen-v2      # v2 규칙으로 다시 제작할 폴더
npm run compare -- toneup-sunscreen toneup-sunscreen-v2
```

## 폴더 구조

```
├── CLAUDE.md                         # 공통 규칙 (실행 방식, 작업 단위, 입력 자료 취급, 내용 규칙, 오류 처리, 기록)
├── .claude/skills/
│   ├── cardnews-content/SKILL.md     # 콘텐츠 생성 Skill: 입력 확인 ~ 데이터 검증, 수정 요청
│   └── cardnews-render/SKILL.md      # 카드 출력 Skill: 템플릿 적용 ~ 재출력
├── prompts/                          # 서비스 모드 작업 지시문 (plan, copy, revise)
├── config/
│   ├── templates.json                # 템플릿별 필드·글자 수 기준
│   ├── theme.json                    # 색상·폰트 공통 설정
│   ├── caution-expressions.json      # 주의 표현 목록 (초안)
│   ├── revision-types.json           # 수정 요청 유형 코드
│   └── skill-version.json            # 규칙 버전
├── docs/
│   ├── input-form.md                 # 입력 양식
│   ├── card-data-spec.md             # 카드 구성 데이터(JSON) 규격
│   ├── style-guide.md                # 카드 구성·문체 기준
│   ├── event-log-spec.md             # 제작 기록·지표 규격
│   └── service-mode.md               # 웹 서버 ↔ Agent SDK 연결 규격
├── templates/                        # base.css + 표지형·이미지 강조형·설명형
├── scripts/                          # check-input, validate, render, log, compare, new-run, lib/
├── tests/                            # 자동 테스트 (예시 제품을 임시 폴더에 복사해 오류 상황을 만듦)
├── CONTRIBUTING.md                   # 협업 규칙
├── .env.example                      # 서비스 모드 환경변수 예시
└── products/<제품ID>/                # 제품별 입력·데이터·출력·제작 기록
```

## 담당 범위 (계획서 기준)

| 영역 | 주요 파일 |
|---|---|
| 템플릿·출력 | `templates/`, `config/theme.json`, `config/templates.json`, `scripts/render.js`, `cardnews-render` Skill |
| 콘텐츠·검증 | `docs/input-form.md`, `docs/card-data-spec.md`, `scripts/check-input.js`, `scripts/validate.js`, `cardnews-content` Skill |
| 기록·분석 | `docs/event-log-spec.md`, `scripts/log.js`, `scripts/compare.js`, `scripts/lib/metrics.js`, `scripts/lib/analysis.js` |
| 웹 연결 | `docs/service-mode.md`, `prompts/`, `.env.example` |
| 공동 | `CLAUDE.md`, `docs/style-guide.md`, `config/caution-expressions.json`, `config/revision-types.json` |

## 원문 근거 검증 방식

`cards.json`의 `sources[].quote`는 `input.md` 원문에 글자 그대로 있어야 합니다.
검증 프로그램이 문자열 일치로 확인하므로, AI가 원문을 바꿔 인용하거나 없는 내용을 근거로 달면 `EVIDENCE_ERROR`가 납니다.
단, 문구(`copy`)가 근거의 의미를 넘어서는지는 자동으로 판단할 수 없어 최종 검토에서 사람이 확인합니다.

## 초기 작업 단계

| 단계 | 내용 | 상태 |
|---|---|---|
| 1. 기반 정비·자동 테스트 | 오류 코드별 테스트(`npm test`), 출력 테스트, 협업 규칙 파일 | 완료 (v0.3) |
| 2. 입력·데이터 규격 확정 | JSON 규격 파일, 입력 양식 확정, 지시문 탐지, 입력 누락·지시문 테스트 자료 | 다음 |
| 3. 템플릿 3종·디자인 반영 | Figma 디자인 토큰 → `theme.json`, 템플릿 다듬기, 글자 수 기준 조정 | |
| 4. 첫 실제 제작 (개발 모드) | 실제 톤업 선크림 자료로 구성안~출력, 제작 기록 남기기 | |
| 5. Agent SDK PoC | 서비스 모드 작업 1개 실행, 권한·비용 확인 (`docs/service-mode.md`) | |

웹 화면·서버는 5단계 결과를 보고 따로 계획합니다. 멘토 확인 사항(평가 기준, API 비용, 배포 환경, Agent SDK 활용 인정 여부)은 노션 작업 트래커에서 관리합니다.
