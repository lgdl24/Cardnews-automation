# 개발 인수인계

프로젝트 개발을 교대할 때 실제 파일·Git 상태와 함께 확인한다. 운영 규칙은 [project-context.md](project-context.md), 카드 제작 상태·승인은 해당 제품 데이터와 제작 로그가 기준이다.

## 최근 변경 (최신이 위, 최근 10개)

다음 도구가 모르면 틀리게 작업할 규칙·용어·파일 변경만 적는다. 자세한 내용은 커밋과 PR에서 본다.

| 날짜 | 도구 | 이슈·브랜치 | 바뀐 점 |
|---|---|---|---|
| 2026-10-16 | Claude | #7 · `feat/7-web-data-spec` | **웹 데이터 규격 v0.1 초안**: `docs/web-data-spec.md`, 스키마 `schemas/web-data/`(index·project·timeline), 예시 `docs/examples/web-data/`(toneup-sunscreen-r1 실제 결과에서 생성), 테스트 `tests/web-data.test.js`(`npm test`에 포함). 웹 화면은 이 예시로 먼저 개발. 연결 규격이라 이용석 승인 필요 |
| 2026-10-16 | Claude | #5 · `docs/5-local-web-viewer` | **분석 방향 변경**: 실사용자가 없어 사용 데이터 분석·블라인드 평가는 제외. **평가용 입력 세트 12개**(정상 8·경계 4) + **핵심 정보 체크리스트**를 **평가 실행기**(`npm run eval`, 예정, `claude -p` 사용)로 반복 실행해 품질·일관성·안전성·규칙 v1/v2를 비교. 구성안 승인은 '평가' 자동 승인으로 기록. 직접 제작 시간 비교는 사례로만. 상세: `project-context.md` '평가와 미결정', 노션 [데이터 분석 설계](https://app.notion.com/p/3f56bcfa1f8a81f68cc3ee29a152453f) |
| 2026-10-16 | Claude | #5 · `docs/5-local-web-viewer` | **구조 변경**: 카드 제작은 **로컬 Claude Code(대화 모드)만**, 웹은 **결과 보기 전용 정적 사이트**(React·TypeScript, 배포 링크). Agent SDK 서버 실행·관리자 로그인·DB·Docker·API 비용·토큰/비용 지표(A3)는 범위 제외. `CLAUDE.md`·Skill·`docs/service-mode.md`·`prompts/`의 서비스 모드 내용은 아직 남아 있으나 **새 작업의 근거로 쓰지 않는다** (정리 작업 예정) |
| 2026-10-16 | Claude | #5 · `docs/5-local-web-viewer` | **역할 분담 (기능·화면 단위)**: 이규동 = 웹 골격·V1·V2 카드 결과·V2 제작 과정, `export`·`eval`·배포·스크립트·템플릿 / 이용석 = V2 구성안·근거·V3·V4, 핵심 정보 포함률·평가 집계·주의 표현, `CLAUDE.md`·Skill. 평가 입력은 6개씩. 연결 규격 3개(카드 데이터·웹 데이터·평가 결과)로만 연결. PR 리뷰어는 상대(트래커 '리뷰'), 병합은 이규동 (`CONTRIBUTING.md`). 담당 표: `README.md`, 노션 [개발 계획서](https://app.notion.com/p/3f56bcfa1f8a8188a029dfbab57ff761) 7장 |
| 2026-10-10 | Claude | #1 · `docs/1-agent-handoff` | **용어 변경**: 카드 제작의 "개발 모드" → **"대화 모드"**. Skill의 `[개발]` 표시 → `[대화]`. "프로젝트 개발"은 코드·문서 작업을 뜻함 |
| 2026-10-10 | Claude | #1 · `docs/1-agent-handoff` | **작업 흐름**: 이슈 → `<종류>/<이슈번호>-<설명>` 브랜치 → 커밋 `(#번호)` → push → PR. `main` 직접 push 금지, 병합은 관리자 결정 (`CONTRIBUTING.md`) |
| 2026-10-10 | Claude | #1 · `docs/1-agent-handoff` | `CLAUDE.md` 맨 위에 '요청 종류' 표 추가. 서비스 실행용 작업 폴더에는 `AGENTS.md`·개발 문서를 복사하지 않음 (`docs/service-mode.md`) |
| 2026-10-10 | Codex | #1 · `docs/1-agent-handoff` | `AGENTS.md`, `docs/project-context.md`, `docs/handoff.md` 추가 (교대 개발 문서) |
| 2026-10-10 | Claude | `main` `92ea3de` (v0.5) | 원문 커버리지에서 지시문 형태 문장 제외(`coverage_detail.excluded`). 실행 기록 폴더 `products/*-r1` 추가 |
| 2026-10-10 | Claude | `main` `e3b8fdf` (v0.4) | 규격 원본: `schemas/cards.schema.json`, `config/input-form.json`, `config/input-safety.json`. 글자 수 기준에 한 줄·최대 줄 수 추가, `npm run calibrate` |

## 현재 작업

- 확인일·작성 도구: 2026-10-16 · Claude.
- 이슈·PR: [#7](https://github.com/lgdl24/Cardnews-automation/issues/7) · PR은 push 후 생성. 리뷰 이용석. **`main` 병합은 승인 후 이규동.**
- 상태: 완료 (PR 리뷰 대기, 마감 10.21).
- 목표·완료 조건: 결과 보기 웹이 읽을 데이터 형식(연결 규격)을 정하고, 예시 데이터가 스키마 검사를 통과.
- 작업 브랜치: `feat/7-web-data-spec` · 기준 커밋 `551f8e0` (`main`, PR #6 병합).
- 변경 파일: `docs/web-data-spec.md`, `schemas/web-data/*.schema.json`, `docs/examples/web-data/`, `tests/web-data.test.js`, `package.json`(test 목록), `README.md`, `docs/handoff.md`.
- 실행 중인 작업: 없음.

## 완료한 내용과 결정

- PR #6(구조 변경·분석 방향·역할 분담 문서) 병합 (`551f8e0`, 이슈 #5 종료).
- 예시 데이터는 임시 생성 스크립트로 `products/toneup-sunscreen-r1`의 실제 결과(`cards.json`·`log.jsonl`·`quality.json`·출력 보고서·PNG)에서 만들었다. `npm run export`가 생기면 그 명령으로 다시 만든다.
- 웹에 공개하지 않는 것: `input.md` 전체, 입력 이미지 원본, 토큰·비용, 지시문 형태 원문 문장(개수만). 스키마가 `additionalProperties: false`로 막고 테스트가 확인.
- 내보낸 데이터 폴더(`web/public/data/`)는 커밋한다(`products/*/output/`이 git 제외라 배포 원본이 필요).
- PR #4(Agent SDK 서비스 모드 실행기)는 저장소 정리 작업에서 닫고 브랜치는 보관, 작업 폴더 분리·재검증 코드는 평가 실행기에서 재사용한다(이규동 결정).

## 검증

- `npm test` 통과 (새 `tests/web-data.test.js` 5개 포함). `git diff --check` 통과.

## 프로젝트 기준 상태 (2026-10-16)

- v0.5: 입력 확인·데이터/근거/글자 수 검증·HTML/PNG 출력·제작 기록·지표·자동 테스트가 있음. 가상 톤업 선크림으로 대화 모드 전체 흐름 확인(`products/toneup-sunscreen-r1`).
- 실제 제품 자료로 하는 첫 제작은 자료 대기. 가상 결과와 Figma 예시 수치를 성과로 일반화하지 않음.
- 결과 보기 웹·내보내기(`npm run export`)는 아직 없음. 서비스 모드 관련 파일(`docs/service-mode.md`, `prompts/`)은 10.16 이후 사용하지 않음.
- Mac 작업 폴더(`~/git/Cardnews-automation`)에는 `node_modules/`가 없을 수 있음. 테스트 전에 `npm install`.
- 노션은 2026-10-16 기준으로 갱신됨. Figma '02 웹 와이어프레임'(W1~W8)은 10.10 관리자 웹 기준이라 노션 '웹 화면 설계'(V1~V4)가 우선.

## 남은 문제·미결정

- 멘토 확인: 결과 보기 웹으로 '웹으로 구현' 피드백을 충족하는지, 웹 공개 범위, 실제 제품 자료 제공 시점, 평가 기준 (노션 '1차 멘토링 — 확인할 질문').
- 웹 데이터 규격 v0.1 초안 작성됨(#7). 이용석 리뷰에서 V2 구성안·근거에 더 필요한 필드, ZIP 생성 위치를 정함. 수정 요청·주의 표현이 있는 예시는 톤업 선크림 첫 제작 뒤 추가.
- 평가 결과·체크리스트 규격은 아직 없음. `docs/eval-spec.md`로 10.24까지 초안(이용석) → 이규동 승인.
- 배포처(Vercel 등)와 공개 링크 접근 제한 여부는 미정.
- 평가 실행기: `claude -p`의 허용 도구 제한·결과 형식(`--output-format json`)·실행 시간을 첫 구현 때 확인. 평가 결과 파일 위치·형식과 평가 세트 형식(`input.md` + 체크리스트)은 `docs/eval-spec.md`를 따름.

## 다음 행동

1. 이규동: 웹 데이터 규격 PR(#7) 리뷰 반영 → '저장소 구조 정리'(PR #4 닫기 포함) → `npm run export` → 웹 골격·공통 부품·배포 링크(10.28) → V1·V2 카드 결과 화면, 평가 실행기(`npm run eval`), 평가 입력 6개 → V2 제작 과정.
2. 이용석: 저장소 받아 `npm install`·`npm test`, 실제 톤업 선크림 자료·이미지(`npm run new-product`) → 주의 표현 목록·검사 기준 → 평가 결과·체크리스트 규격 초안(10.24) → 대화 모드 첫 제작 → V2 구성안·근거 화면, 핵심 정보 포함률 지표, 평가 입력 6개 → v1 평가 분석·v2 규칙, 평가 집계·V3 대시보드.
3. 작업을 시작할 때 새 이슈를 만들고 이 문서의 '현재 작업'을 교체한다. 노션 작업 트래커의 해당 행 상태도 바꾼다.
