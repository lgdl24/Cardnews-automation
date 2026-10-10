# 개발 인수인계

프로젝트 개발을 교대할 때 실제 파일·Git 상태와 함께 확인한다. 운영 규칙은 [project-context.md](project-context.md), 카드 제작 상태·승인은 해당 제품 데이터와 제작 로그가 기준이다.

## 최근 변경 (최신이 위, 최근 10개)

다음 도구가 모르면 틀리게 작업할 규칙·용어·파일 변경만 적는다. 자세한 내용은 커밋과 PR에서 본다.

| 날짜 | 도구 | 이슈·브랜치 | 바뀐 점 |
|---|---|---|---|
| 2026-10-10 | Claude | #1 · `docs/1-agent-handoff` | **용어 변경**: 카드 제작의 "개발 모드" → **"대화 모드"**. Skill의 `[개발]` 표시 → `[대화]`. "프로젝트 개발"은 코드·문서 작업을 뜻함 |
| 2026-10-10 | Claude | #1 · `docs/1-agent-handoff` | **작업 흐름**: 이슈 → `<종류>/<이슈번호>-<설명>` 브랜치 → 커밋 `(#번호)` → push → PR. `main` 직접 push 금지, 병합은 관리자 결정 (`CONTRIBUTING.md`) |
| 2026-10-10 | Claude | #1 · `docs/1-agent-handoff` | `CLAUDE.md` 맨 위에 '요청 종류' 표 추가. 서비스 실행용 작업 폴더에는 `AGENTS.md`·개발 문서를 복사하지 않음 (`docs/service-mode.md`) |
| 2026-10-10 | Codex | #1 · `docs/1-agent-handoff` | `AGENTS.md`, `docs/project-context.md`, `docs/handoff.md` 추가 (교대 개발 문서) |
| 2026-10-10 | Claude | `main` `92ea3de` (v0.5) | 원문 커버리지에서 지시문 형태 문장 제외(`coverage_detail.excluded`). 실행 기록 폴더 `products/*-r1` 추가 |
| 2026-10-10 | Claude | `main` `e3b8fdf` (v0.4) | 규격 원본: `schemas/cards.schema.json`, `config/input-form.json`, `config/input-safety.json`. 글자 수 기준에 한 줄·최대 줄 수 추가, `npm run calibrate` |
| 2026-10-10 | Claude | `main` `dd2e02f` (v0.3) | `npm test`·`npm run test:render`, `CONTRIBUTING.md`, 테스트는 `CARDNEWS_PRODUCTS_DIR` 임시 폴더 사용 |

## 현재 작업

- 확인일·작성 도구: 2026-10-10 · Claude (Codex 작업을 이어받아 정리).
- 이슈·PR: [#1](https://github.com/lgdl24/Cardnews-automation/issues/1) · PR은 이 브랜치 push 후 생성. **`main` 병합은 관리자 결정 대기.**
- 상태: 완료 (PR 검토 대기).
- 목표·완료 조건: 두 진입 지침(`CLAUDE.md`, `AGENTS.md`)이 같은 목표·인수인계를 가리키고, 카드 제작(대화·서비스 모드)과 프로젝트 개발의 규칙 범위가 겹치지 않으며, 다음 도구가 최근 변경을 보고 이어갈 수 있어야 함.
- 작업 브랜치: `docs/1-agent-handoff` · 기준 커밋 `92ea3de` (v0.5).
- 변경 파일: `AGENTS.md`, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `docs/project-context.md`, `docs/handoff.md`, `docs/service-mode.md`, `docs/event-log-spec.md`, `.claude/skills/*/SKILL.md`(용어만), `scripts/log.js`(주석만).
- 실행 중인 작업: 없음.

## 완료한 내용과 결정

- Codex 작성 원본을 첫 커밋으로 그대로 남기고, 다듬은 내용은 다음 커밋으로 분리함.
- 용어 충돌 해결: 카드 제작 방식은 "대화 모드", 저장소 작업은 "프로젝트 개발". 정의는 [project-context.md](project-context.md) '용어'.
- `CLAUDE.md` 추가 문단을 '요청 종류' 표로 줄이고 기존 문체(합니다체)로 맞춤. 서비스 실행마다 함께 읽히는 분량을 줄이기 위함.
- 한 단계 완료 기준을 [project-context.md](project-context.md) '개발 작업 규칙'에 둠: 작업 → 검증 → 인수인계 → 브랜치 커밋·push → PR → 노션.
- 규칙 버전은 v1 유지: Skill·`CLAUDE.md`는 용어와 안내만 바뀌고 제작 동작·기준은 그대로.

## 검증

- `npm test` 통과 여부와 문서 링크 확인 결과는 PR 본문에 적음.
- 서비스 실행이 개발 문서를 읽지 않는지는 실제 Agent SDK 실행 전이라 미검증 → `docs/service-mode.md` PoC 확인 항목에 추가함.

## 프로젝트 기준 상태 (2026-10-10)

- v0.5: 입력 확인·데이터/근거/글자 수 검증·HTML/PNG 출력·제작 기록·지표·자동 테스트가 있음. 가상 톤업 선크림으로 대화 모드 전체 흐름 확인(`products/toneup-sunscreen-r1`).
- 실제 제품 자료로 하는 첫 제작은 자료 대기. 가상 결과와 Figma 예시 수치를 성과로 일반화하지 않음.
- 서비스 `plan/copy/revise` 지시문과 `docs/service-mode.md`는 준비됨. SDK 의존성·실행 PoC·관리자 웹·DB·Docker 구현은 아직 없음.
- Mac 작업 폴더(`~/git/Cardnews-automation`)에는 `node_modules/`가 없을 수 있음. 테스트 전에 `npm install`.
- 노션·Figma는 2026-10-10 상태 기준. 노션 '설계 문서'에는 옛 용어 "개발 모드"가 남아 있을 수 있음.

## 남은 문제·미결정

- Agent SDK 옵션·규칙/Skill 로딩·권한 제한·토큰/비용 기록은 실동작 미검증. `docs/service-mode.md` 예시를 검증된 구현으로 취급하지 않음.
- 웹 세부 스택·배포·API 비용, 멘토 확인 사항은 [공통 맥락](project-context.md) 원본 링크 참고.

## 다음 행동

1. 관리자가 #1 PR을 검토해 `main` 병합 여부를 결정한다. 병합 전에는 다른 작업도 최신 `main`이 아니라 이 브랜치 기준인지 확인한다.
2. 다음 작업 후보: 5단계 Agent SDK PoC (규칙/Skill 로딩 → 구성안 생성·검증 → 승인 대기 종료·입력 누락 중단 확인). 시작할 때 새 이슈를 만들고 이 문서의 '현재 작업'을 교체한다.
3. 실제 톤업 선크림 자료를 받으면 대화 모드로 첫 제작(`npm run new-product`) 후 노션 '톤업 선크림 · 첫 제작' 행에 기록한다.
