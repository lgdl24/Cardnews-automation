# 개발 인수인계

프로젝트 개발을 교대할 때 실제 파일·Git 상태와 함께 확인한다. 운영 규칙은 [project-context.md](project-context.md), 카드 제작 상태·승인은 해당 제품 데이터와 제작 로그가 기준이다.

## 최근 변경 (최신이 위, 최근 10개)

다음 도구가 모르면 틀리게 작업할 규칙·용어·파일 변경만 적는다. 자세한 내용은 커밋과 PR에서 본다.

| 날짜 | 도구 | 이슈·브랜치 | 바뀐 점 |
|---|---|---|---|
| 2026-10-16 | Claude | #9 · `chore/9-remove-service-mode` | **서비스 모드 → 평가 모드**: `[평가 모드]` 지시문으로 평가 실행기(`npm run eval`, `claude -p`)가 작업 하나씩 실행. 질문 없이 끝내고 결과 보고 형식으로 답함, `log.js`는 기록 안 함(`CARDNEWS_MODE=eval`), 구성안 승인은 실행기가 `approved_by: eval`로 기록. `docs/service-mode.md`·`.env.example`·`prompts/revise.md` 삭제. 관리자 웹·Agent SDK 서버는 규칙에서 없어짐 |
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
- 이슈·PR: [#9](https://github.com/lgdl24/Cardnews-automation/issues/9) · PR은 push 후 생성. 리뷰 이용석(`CLAUDE.md`·Skill 담당). **`main` 병합은 승인 후 이규동.** 같은 날 #7(웹 데이터 규격, PR #8)도 리뷰 대기 — 둘 다 이 문서를 고쳐 병합할 때 '최근 변경' 줄을 합친다.
- 상태: 완료 (PR 리뷰 대기, 마감 10.21).
- 목표·완료 조건: 저장소에 서비스 모드·관리자 웹 규칙이 남지 않고, 평가 실행기가 쓸 비대화 실행 규칙(평가 모드)이 `CLAUDE.md`에 정리됨. `npm test` 통과.
- 작업 브랜치: `chore/9-remove-service-mode` · 기준 커밋 `551f8e0` (`main`).
- 변경 파일: `CLAUDE.md`, `AGENTS.md`, `.claude/skills/*/SKILL.md`, `prompts/plan.md`·`copy.md`(revise 삭제), `scripts/lib/events.js`, `scripts/log.js`, `tests/cli.test.js`, `tests/check-input.test.js`, `docs/event-log-spec.md`, `docs/card-data-spec.md`, `docs/project-context.md`, `README.md`, 이 문서. 삭제: `docs/service-mode.md`, `.env.example`.
- 실행 중인 작업: 없음.

## 완료한 내용과 결정

- 서비스 모드를 지우지 않고 **평가 모드로 바꿈**: '질문 없이 작업 하나 → 결과 보고 → 실행기가 기록' 구조가 평가 실행기에 그대로 필요해서. 실행 주체(관리자 웹 → 평가 실행기)와 이름만 바뀌고, 대화 모드 규칙은 그대로다.
- 규칙 버전은 `v1` 유지를 제안: 대화 모드 결과에 영향이 없고 평가 실행 결과는 아직 없음. 최종 결정은 이용석과 함께 (PR에서 확인).
- 토큰·비용 필드(`job_finished`)는 이벤트 규격에서 뺐다. 분석 코드의 합계는 값이 없으면 `null`이라 그대로 둠.
- PR #4(Agent SDK 실행기)는 닫고 `feat/3-agent-sdk-poc` 브랜치는 보관. 작업 폴더 분리·재검증 코드는 평가 실행기 작업에서 참고한다.
- Mac의 `.env`는 더 쓰지 않는다(`.env.example` 삭제). 파일은 사람이 직접 지운다.

## 검증

- `npm test` 75개 통과, `git diff --check` 통과. 저장소에서 '서비스 모드'는 이 문서의 과거 기록과 README 초기 단계 표에만 남음.

## 프로젝트 기준 상태 (2026-10-16)

- v0.5: 입력 확인·데이터/근거/글자 수 검증·HTML/PNG 출력·제작 기록·지표·자동 테스트가 있음. 가상 톤업 선크림으로 대화 모드 전체 흐름 확인(`products/toneup-sunscreen-r1`).
- 실제 제품 자료로 하는 첫 제작은 자료 대기. 가상 결과와 Figma 예시 수치를 성과로 일반화하지 않음.
- 결과 보기 웹·내보내기(`npm run export`)·평가 실행기(`npm run eval`)는 아직 없음. `prompts/`는 평가 모드 지시문(plan·copy).
- Mac 작업 폴더(`~/git/Cardnews-automation`)에는 `node_modules/`가 없을 수 있음. 테스트 전에 `npm install`.
- 노션은 2026-10-16 기준으로 갱신됨. Figma '02 웹 와이어프레임'(W1~W8)은 10.10 관리자 웹 기준이라 노션 '웹 화면 설계'(V1~V4)가 우선.

## 남은 문제·미결정

- 멘토 확인: 결과 보기 웹으로 '웹으로 구현' 피드백을 충족하는지, 웹 공개 범위, 실제 제품 자료 제공 시점, 평가 기준 (노션 '1차 멘토링 — 확인할 질문').
- 웹 데이터 규격은 노션 데이터 명세의 초안만 있음. `docs/web-data-spec.md`로 10.21까지 초안(이규동) → 이용석 승인.
- 평가 결과·체크리스트 규격은 아직 없음. `docs/eval-spec.md`로 10.24까지 초안(이용석) → 이규동 승인.
- 배포처(Vercel 등)와 공개 링크 접근 제한 여부는 미정.
- 평가 실행기: `claude -p`의 허용 도구 제한·결과 형식(`--output-format json`)·실행 시간을 첫 구현 때 확인. 평가 결과 파일 위치·형식과 평가 세트 형식(`input.md` + 체크리스트)은 `docs/eval-spec.md`를 따름.

## 다음 행동

1. 이규동: PR #8(웹 데이터 규격)·#9 정리 PR 리뷰 반영 → `npm run export` → 웹 골격·공통 부품·배포 링크(10.28) → V1·V2 카드 결과 화면, 평가 실행기(`npm run eval`), 평가 입력 6개 → V2 제작 과정.
2. 이용석: 저장소 받아 `npm install`·`npm test`, 실제 톤업 선크림 자료·이미지(`npm run new-product`) → 주의 표현 목록·검사 기준 → 평가 결과·체크리스트 규격 초안(10.24) → 대화 모드 첫 제작 → V2 구성안·근거 화면, 핵심 정보 포함률 지표, 평가 입력 6개 → v1 평가 분석·v2 규칙, 평가 집계·V3 대시보드.
3. 작업을 시작할 때 새 이슈를 만들고 이 문서의 '현재 작업'을 교체한다. 노션 작업 트래커의 해당 행 상태도 바꾼다.
