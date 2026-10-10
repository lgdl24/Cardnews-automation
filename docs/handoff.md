# 개발 인수인계

프로젝트 개발을 교대할 때 실제 파일·Git 상태와 함께 확인한다. 운영 규칙은 [project-context.md](project-context.md), 카드 제작 상태·승인은 해당 제품 데이터와 제작 로그가 기준이다.

## 최근 변경 (최신이 위, 최근 10개)

다음 도구가 모르면 틀리게 작업할 규칙·용어·파일 변경만 적는다. 자세한 내용은 커밋과 PR에서 본다.

| 날짜 | 도구 | 이슈·브랜치 | 바뀐 점 |
|---|---|---|---|
| 2026-10-10 | Claude | #3 · `feat/3-agent-sdk-poc` | **서비스 실행기** `scripts/service/`(`job.js`·`run-job.js`·`poc.js`), 명령 `npm run job`·`npm run poc`. 의존성 `@anthropic-ai/claude-agent-sdk` 추가 → Mac에서 `npm install` 필요 |
| 2026-10-10 | Claude | #3 · `feat/3-agent-sdk-poc` | **API 키 없이 실행**: `npm run job -- <종류> <ID> --executor manual` → Claude Code 대화가 작업 폴더에서 작업 → `npm run job -- finish <작업ID> --report <파일>`. 기록에 `executor` 필드 추가 |
| 2026-10-10 | Claude | #3 · `feat/3-agent-sdk-poc` | 실행기 데이터는 `data/`(커밋 안 함). `.env`에 `DATA_DIR=/data`가 있으면 로컬 실행이 실패하므로 Docker 전용으로만 씀 |
| 2026-10-10 | Claude | #1 · `docs/1-agent-handoff` | **용어 변경**: 카드 제작의 "개발 모드" → **"대화 모드"**. Skill의 `[개발]` 표시 → `[대화]`. "프로젝트 개발"은 코드·문서 작업을 뜻함 |
| 2026-10-10 | Claude | #1 · `docs/1-agent-handoff` | **작업 흐름**: 이슈 → `<종류>/<이슈번호>-<설명>` 브랜치 → 커밋 `(#번호)` → push → PR. `main` 직접 push 금지, 병합은 관리자 결정 (`CONTRIBUTING.md`) |
| 2026-10-10 | Claude | #1 · `docs/1-agent-handoff` | `CLAUDE.md` 맨 위에 '요청 종류' 표 추가. 서비스 실행용 작업 폴더에는 `AGENTS.md`·개발 문서를 복사하지 않음 (`docs/service-mode.md`) |
| 2026-10-10 | Codex | #1 · `docs/1-agent-handoff` | `AGENTS.md`, `docs/project-context.md`, `docs/handoff.md` 추가 (교대 개발 문서) |
| 2026-10-10 | Claude | `main` `92ea3de` (v0.5) | 원문 커버리지에서 지시문 형태 문장 제외(`coverage_detail.excluded`). 실행 기록 폴더 `products/*-r1` 추가 |
| 2026-10-10 | Claude | `main` `e3b8fdf` (v0.4) | 규격 원본: `schemas/cards.schema.json`, `config/input-form.json`, `config/input-safety.json`. 글자 수 기준에 한 줄·최대 줄 수 추가, `npm run calibrate` |
| 2026-10-10 | Claude | `main` `dd2e02f` (v0.3) | `npm test`·`npm run test:render`, `CONTRIBUTING.md`, 테스트는 `CARDNEWS_PRODUCTS_DIR` 임시 폴더 사용 |

## 현재 작업

- 확인일·작성 도구: 2026-10-10 · Claude.
- 이슈·PR: [#3](https://github.com/lgdl24/Cardnews-automation/issues/3) · PR은 이 브랜치 push 후 생성. **`main` 병합은 관리자 결정 대기.**
- 상태: 완료 (PR 검토 대기). 실제 Agent SDK 실행 확인은 API 크레딧이 생기면 이어서 함.
- 목표·완료 조건: 서비스 모드 작업 하나를 작업 폴더 → 실행 → 서버 재검증 → 반영 → 기록 순서로 실행할 수 있고, 확인 결과가 `docs/service-mode.md` 'PoC에서 확인할 것'에 남아 있어야 함.
- 작업 브랜치: `feat/3-agent-sdk-poc` · 기준 커밋 `594f244` (PR #2 병합).
- 변경 파일: `scripts/service/*`, `tests/service.test.js`, `package.json`·`package-lock.json`, `docs/service-mode.md`, `docs/event-log-spec.md`, `docs/handoff.md`, `.env.example`, `README.md`.
- 실행 중인 작업: 없음.

## 완료한 내용과 결정

- 실행기는 `startJob`(작업 폴더·지시문·`job_started`) → 실행 → `finishJob`(재검증·반영·`job_finished`·보고서)로 나눔. SDK 실행(`runJob`)과 키 없는 실행(`manual`)이 마무리 코드를 같이 씀.
- SDK 코드는 주석 처리하지 않고 그대로 둠. `query()`는 SDK 실행 때만 불러오므로 키·크레딧이 없어도 테스트와 manual 실행에 영향 없음.
- 인증은 API 키만 씀. claude.ai 구독 로그인은 SDK 기반 제품에 쓸 수 없음 (`docs/service-mode.md`).
- manual 실행 결과(가상 톤업 선크림 구성안·문구·PNG, 입력 누락 중단, 지시문 무시)는 `data/`에만 있고 커밋하지 않음.
- 규칙 버전은 v1 유지: `CLAUDE.md`·Skill·`config/` 변경 없음.

## 검증

- `npm test` 87개 통과 (가짜 `query()`로 성공·재검증 실패·비용 상한·API 크레딧 오류·키 가리기·manual 마무리 확인).
- 실제 SDK 실행 1회: 크레딧 부족으로 모델 호출 전 종료. init 메시지로 옵션 적용(Skill 2개·도구 6개·dontAsk·API 키 인증) 확인, `API_CREDIT`으로 기록됨.
- manual 실행 4건: 톤업 구성안·문구(PNG 5장, 레이아웃 오류 0), 입력 누락 중단(반영 안 함), 지시문 자료(경고 4개, `cards.json`에 지시문 없음).

## 프로젝트 기준 상태 (2026-10-10)

- v0.5: 입력 확인·데이터/근거/글자 수 검증·HTML/PNG 출력·제작 기록·지표·자동 테스트가 있음. 가상 톤업 선크림으로 대화 모드 전체 흐름 확인(`products/toneup-sunscreen-r1`).
- 실제 제품 자료로 하는 첫 제작은 자료 대기. 가상 결과와 Figma 예시 수치를 성과로 일반화하지 않음.
- 서비스 `plan/copy/revise` 지시문, 실행기(`scripts/service/`), `docs/service-mode.md` 준비됨. 관리자 웹·DB·Docker 구현은 아직 없음.
- Mac 작업 폴더(`~/git/Cardnews-automation`)에는 `node_modules/`가 없을 수 있음. 테스트 전에 `npm install`.
- 노션·Figma는 2026-10-10 상태 기준. 노션 '설계 문서'에는 옛 용어 "개발 모드"가 남아 있을 수 있음.

## 남은 문제·미결정

- Agent SDK의 권한 제한(`dontAsk`·`allowedTools`)·비용 상한·토큰/비용 기록·실제 Skill 호출은 미검증 (API 크레딧 필요). 크레딧이 생기면 `npm run poc -- --model sonnet`(약 1~3달러) 결과로 `docs/service-mode.md` 표시를 갱신한다.
- 웹 세부 스택·배포·API 비용, 멘토 확인 사항은 [공통 맥락](project-context.md) 원본 링크 참고.

## 다음 행동

1. 관리자가 #3 PR을 검토해 `main` 병합 여부를 결정한다.
2. API 크레딧이 생기면 `npm run poc -- --model sonnet`으로 SDK 확인 항목(권한·비용·Skill 호출)을 채운다. 그 전에는 `--executor manual`로 흐름을 확인한다.
3. 다음 작업 후보: 6단계 관리자 웹 서버 뼈대(입력 폼 → 작업 등록 → 실행기 호출 → 확인 화면). 시작할 때 새 이슈를 만들고 이 문서의 '현재 작업'을 교체한다.
4. 실제 톤업 선크림 자료를 받으면 대화 모드로 첫 제작(`npm run new-product`) 후 노션 '톤업 선크림 · 첫 제작' 행에 기록한다.
