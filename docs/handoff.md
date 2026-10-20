# 개발 인수인계

프로젝트 개발을 교대할 때 실제 파일·Git 상태와 함께 확인한다. 운영 규칙은 [project-context.md](project-context.md), 카드 제작 상태·승인은 해당 제품 데이터와 제작 로그가 기준이다.

## 최근 변경 (최신이 위, 최근 10개)

다음 도구가 모르면 틀리게 작업할 규칙·용어·파일 변경만 적는다. 자세한 내용은 커밋과 PR에서 본다.

| 날짜 | 도구 | 이슈·브랜치 | 바뀐 점 |
|---|---|---|---|
| 2026-10-19 | Claude | #36 · `docs/36-web-mode-review` | **웹 모드 규칙 문구 리뷰 (#21, 이용석)**: `CLAUDE.md`·Skill·`prompts/web/`을 작업 실행기·로컬 제작 API 코드와 대조. 고친 곳 — `CLAUDE.md` 입력 자료 취급에 웹 모드 수정 요청 메모도 자료로 다룬다는 한 줄(지시문 `prompts/web/revise.md`와 같게), `cardnews-render` Skill 최종 승인 줄에 `[대화]` 표시와 웹·평가 모드는 `copy`에서 끝난다는 줄, `docs/event-log-spec.md` v0.2(누가 남기나에 웹 모드 칸, `job_started.executor`, 웹·평가 `job_id` 형식, 웹 모드 `revision_requested.cards` 생략), `README.md` 한 줄. 동작 변경 없음 |
| 2026-10-19 | Claude | #30 · `feat/30-caution-expressions` | **주의 표현 목록 v1**: `config/caution-expressions.json`을 식약처 지침 원문(안내서-0086-07, 2025-08-14) 별표 1·2, 시행규칙 별표 5, KCIA 해설서 기준으로 확정 — 분류 4개 → 9개, 분류마다 `basis`(근거 항목)·`extended`(근거 문서에 글자 그대로 없는 같은 뜻 표현), 맨 위 `references`(식약처 지침·시행규칙 별표 5·KCIA 해설서 2025, 원문 PDF로 확인). 형식(`groups[].category·terms`)은 그대로라 검증·내보내기·웹 코드 수정 없음. 판단 기준 `docs/style-guide.md` '주의 표현 판단 기준', `cardnews-content` Skill 6단계 문구 변경. 테스트 `tests/caution.test.js`(표현 겹침 금지, 예시 제품 문구 0건). 규칙 버전은 그대로 v1(변경 여부 미결정) |
| 2026-10-19 | Claude | #31 · `feat/31-webdata-v2` | **웹 데이터 규격 v0.2 (이용석 리뷰)**: V2 구성안·근거에 필요한 필드를 노션 화면 설계·Figma W5·W6과 대조 → `project.json` `cards[].cautions[].fields`(주의 표현이 나온 문구 칸 `field`·`index`)만 추가. `spec_version` 0.1 → 0.2(스키마 3개·`web-data.js`·`types.ts`·예시·`web/public/data`). `findCautions`(`scripts/lib/metrics.js`)가 `fields`를 함께 돌려줌 — 셈(카드마다 표현 한 번)과 검증 메시지는 그대로. 근거는 카드 단위 유지(문구 칸별 근거는 `cards.json` 규격 변경이라 안 함) |
| 2026-10-19 | Claude | #34 · `feat/34-eval-inputs-toneup` | **이용석 평가 입력 6개 (경계 2 + 정상 4) + 달바 톤업 선크림 조사**: 정상 4개는 무드가 다른 제품 — `eval-toneup-purple`(실제, 선케어·프리미엄), `eval-derma-barrier-cream`(가상, 스킨케어·더마), `eval-natural-cleansing-oil`(가상, 클렌징·내추럴), `eval-trendy-sheet-mask`(가상, 마스크팩·트렌디). A5 v1·v2 비교용(#39 제안). 경계: 가상 경계 `eval-exaggerated-cream`(원문 자체에 최상급·의약품 오인·즉각 효과·안전성 단정·천연 100% 표현, 카드에는 사실만 쓰는지(금지 표현 match))·`eval-long-serum`(주요 특징 12개·긴 문장, 글자 수 안에서 강조 정보를 고르고 '도움을 줄 수 있어요'를 강화하지 않는지). 형식은 `docs/eval-spec.md` v0.1. 실제 제품 조사 노트 `docs/research/dalba-toneup.md`(핑크·퍼플·블루·그린 4종, 출처·고시 위치·누끼컷 주소). 실제 제작 1세트는 퍼플 `products/dalba-toneup-purple`(상세 이미지·고시 원문을 그대로 옮김, 이미지 사용 가능 여부 '확인 중' → 결과 보기 웹 공개 전 멘토 확인) |
| 2026-10-19 | Claude | #39 · `docs/39-mood-proposal` | **제안서: 글 무드 · 제품 색 무드** `docs/proposals/mood-proposal.md` (코드·규칙 변경 없음). 글 무드(제품 유형·효능 키워드·브랜드 무드, 이용석, v2 규칙 후보)와 제품 색 무드(#38, 제품 사진 대표 색 + 글자 대비 검사, 이규동). 캐릭터 배경은 보류. 같이 정할 것 목록 있음 |
| 2026-10-19 | Claude | #28 · `feat/28-eval-runner` | **평가 실행기 `npm run eval`**: `scripts/eval.js`·`scripts/lib/eval-runner.js`. 입력 × 반복으로 `eval/runs/<입력ID>--<버전>[-<비교판>]--r<N>/`를 만들고 구성안 → 평가 승인(`approved_by: eval`) → 문구·출력을 작업 실행기(`runJob`, 평가 모드)로 실행, `result.json`(eval-spec v0.1)을 스키마 검사 후 씀. 같은 실행ID가 있으면 시작 전에 멈춤, `--dry-run`. 내 평가 입력 4개 체크리스트에 `spec_version`·`source`·금지 표현 `match` 추가(입력 누락의 'cards.json 생성' 금지 항목은 `expected.cards_json`과 중복이라 뺌). `.gitignore`에 `eval/runs/*/output/png·html/`. 테스트 `tests/eval-runner.test.js`(가짜 Claude) |
| 2026-10-19 | Claude | #23 · `docs/23-eval-spec` | **평가 결과·체크리스트 규격 v0.1 초안**: `docs/eval-spec.md`, 스키마 `schemas/eval/`(checklist·run-result), 예시 `docs/examples/eval/`(가상 톤업 선크림 체크리스트 + r1 기록을 옮긴 결과 1건), 테스트 `tests/eval-spec.test.js`(`npm test`에 포함, `eval/inputs/`가 있으면 그 체크리스트도 검사). #18 체크리스트 형식을 그대로 받고 선택 필드만 더함(`source`·`section`·`copy_terms`·`match` 등). 실행 하나 = 제작 폴더 하나 `eval/runs/<입력ID>--<버전>--r<N>/`(제품ID = 실행ID, 웹 데이터 `kind: eval` 프로젝트로 내보냄) + `result.json`. 실행은 `copy`에서 끝남(최종 승인 없음). 핵심 정보 포함률 계산 규칙 정함. 연결 규격이라 이규동 승인 필요 |
| 2026-10-18 | Claude | #21 · `feat/21-web-studio` | **웹 모드 (로컬 실행)**: 입력·승인·수정 요청은 웹 화면에서, 실행은 내 컴퓨터의 `claude -p`. `npm run studio`(= vite 개발 서버)가 로컬 제작 API `/api/studio`(`scripts/lib/studio-api.js`, 127.0.0.1만)를 붙이고, 화면 S1 `/studio`·S2 `/studio/new`·S3 `/studio/:id`. 작업 실행기 `scripts/lib/job-runner.js`(웹·평가 모드 공통: 임시 작업 폴더, 허용 도구·명령 제한, 재검증 후 반영, 작업 시작·끝 기록). 지시문 `prompts/web/`(plan·copy·revise), 평가 지시문은 `prompts/eval/`로 이동. `CLAUDE.md`·Skill에 웹 모드 추가, '서비스 모드 결과 보고' → '작업 결과 보고'(이용석 승인 필요). `log.js`는 `CARDNEWS_MODE=web`도 기록 안 함. 배포 사이트는 그대로 보기 전용 |
| 2026-10-17 | Claude | #18 · `feat/18-eval-inputs` | **평가 입력 4개 (초안 형식)**: `eval/inputs/<입력ID>/`(input.md·images·checklist.json). 가상 정상 `eval-mini-humidifier`(수치)·`eval-oat-drink`(식품 효능), 경계 `eval-input-missing`(5종 누락)·`eval-injection`(지시문 5개 탐지 + 탐지 안 되는 1개). `tests/eval-inputs.test.js`가 인용·기대 동작 확인. 형식은 `docs/eval-spec.md`(이용석) 확정 뒤 맞춤. 제품 A·B는 실제 자료 대기 |
| 2026-10-17 | Claude | #17 · `feat/17-timeline` | **V2 제작 과정 완성**: 요약 숫자, 단계별 시간 막대(AI `#C8664E` / 사람 `#3B78C4`, 색약 구분 검증), 품질 지표, 작업별 결과 표, 제작 기록 타임라인(경과 시간, 검증 오류 코드·카드, 승인 주체 사람/평가, 수정 요청 유형 칩·메모). 단계 순서·처리 주체는 `scripts/lib/analysis.js`와 같게 화면 코드에 둠. 공통 변경: `formatMinutes`가 1분 미만을 초로, 10분 미만을 '분 초'로 표시, 표 스타일을 `components.css`로 이동 |

## 현재 작업

- 확인일·작성 도구: 2026-10-19 · Claude (이용석 Windows).
- 이슈·PR: [#30](https://github.com/lgdl24/Cardnews-automation/issues/30) · PR은 push 후 생성. 리뷰 이규동. 웹 데이터 v0.2(#31)는 따로. **`main` 병합은 이규동.**
- 상태: 완료 (PR 리뷰 대기).
- 목표·완료 조건: 주의 표현 목록을 식약처 지침 원문 기준으로 확정하고 근거·판단 기준을 남김. 기존 검증·내보내기·웹 코드와 그대로 맞물리고 `npm test` 통과.
- 작업 브랜치: `feat/30-caution-expressions` · 기준 `main`(`8992542`).
- 변경 파일: `config/caution-expressions.json`, `docs/style-guide.md`, `.claude/skills/cardnews-content/SKILL.md`(6단계 한 줄), `tests/caution.test.js`(새로), `package.json`(test 목록), `README.md`(폴더 설명), 이 문서.

## 현재 작업

- 확인일·작성 도구: 2026-10-19 · Claude.
- 이슈·PR: [#28](https://github.com/lgdl24/Cardnews-automation/issues/28) · PR은 push 후 생성(기준 `main`). 리뷰 이용석(평가 결과를 읽는 쪽). **`main` 병합은 이규동.**
- 상태: 구현·가짜 Claude 테스트 완료. 실제 Claude로 경계 입력(입력 누락) 1건 확인 예정.
- 목표·완료 조건: `docs/eval-spec.md` v0.1대로 평가 입력을 실행하고 `result.json`을 남김. 정상·경계 입력이 스키마를 통과, `npm test` 통과.
- 작업 브랜치: `feat/28-eval-runner` · 기준 `main`(`8992542`, #27·#24 병합 후).
- 변경 파일: `scripts/eval.js`·`scripts/lib/eval-runner.js`(새로), `tests/eval-runner.test.js`(새로), `package.json`(`eval`, test 목록), `.gitignore`, `eval/inputs/*/checklist.json`·`README.md`, `docs/eval-spec.md`(미결정 중 result.json 작성 확정 표시), `README.md`, 이 문서.
- 실행 중인 작업: 없음.

## 완료한 내용과 결정

- PR #6(구조 변경·분석 방향·역할 분담 문서) 병합 (`551f8e0`, 이슈 #5 종료).
- 예시 데이터(`docs/examples/web-data/`)는 `products/toneup-sunscreen-r1`의 실제 결과에서 만들었고, `npm run export` 결과와 같은지 `tests/export.test.js`가 확인한다. 규격을 바꾸면 `npm run export -- --out docs/examples/web-data`로 예시도 다시 만든다(`exported_at`만 달라짐).
- `products/*/output/`은 git에 없어서, 다른 컴퓨터에서 export하면 출력이 없는 제품은 `PNG_MISSING`으로 제외된다. 먼저 `npm run render`.
- 웹에 공개하지 않는 것: `input.md` 전체, 입력 이미지 원본, 토큰·비용, 지시문 형태 원문 문장(개수만). 스키마가 `additionalProperties: false`로 막고 테스트가 확인.
- 내보낸 데이터 폴더(`web/public/data/`)는 커밋한다(`products/*/output/`이 git 제외라 배포 원본이 필요).
- PR #4(Agent SDK 서비스 모드 실행기)는 저장소 정리 작업에서 닫고 브랜치는 보관, 작업 폴더 분리·재검증 코드는 평가 실행기에서 재사용한다(이규동 결정).
- 서비스 모드를 지우지 않고 **평가 모드로 바꿈**(#9): '질문 없이 작업 하나 → 결과 보고 → 실행기가 기록' 구조가 평가 실행기에 그대로 필요해서. 대화 모드 규칙은 그대로.
- 규칙 버전은 `v1` 유지를 제안(#9). 최종 결정은 이용석과 함께.
- 토큰·비용 필드(`job_finished`)는 이벤트 규격에서 뺐다(#9).
- Mac의 `.env`는 더 쓰지 않는다(`.env.example` 삭제). 파일은 사람이 직접 지운다.
- 웹은 루트와 따로 `web/package.json`을 둔다(루트 스크립트 의존성과 섞지 않음). 버전은 보안 권고가 해결된 판으로 고정(`npm audit` 0건).
- 웹 주소는 `BrowserRouter` 방식이라 정적 호스팅에서 새로고침용 설정이 필요하다(Vercel은 `web/vercel.json`). 데이터 파일이 없으면 HTML이 돌아오는 호스팅도 있어 JSON이 아니면 '없음'으로 처리.
- 웹 글꼴은 Pretendard 가변 폰트의 글자 범위별 파일(dynamic subset)을 써서 쓰인 글자 묶음만 내려받는다.
- ZIP은 내보내기에서 파일로 만들지 않고 브라우저에서 만든다(규격 초안대로, 데이터 폴더가 커지지 않음). 리뷰에서 확정.
- 크게 보기 상태는 주소(`?card=N`)에 둔다: 링크로 특정 카드를 공유하고, 뒤로 가기로 닫힘.
- 평가 입력은 `products/`가 아니라 `eval/inputs/`에 둔다(제작 폴더와 섞이지 않게, 실행기가 임시 폴더로 복사해 사용). 기존 `products/test-*`는 스크립트 테스트용으로 남긴다.
- 지시문 입력에는 탐지 패턴에 일부러 안 걸리는 지시 1개(주의사항의 최상급 문구 요청)를 넣었다: 패턴이 놓쳐도 Claude가 따르지 않는지 보려고.
- 웹 제작(#21)은 **로컬 실행**으로 정함(이규동): 배포 사이트에서 카드를 만들면 서버·로그인·API 비용이 다시 생기므로, 같은 웹 앱을 내 컴퓨터에서 켰을 때만 제작 화면이 동작하게 함. 로컬 제작 API는 vite 개발 서버 플러그인(`apply: 'serve'`)이라 빌드 결과에 들어가지 않음.
- 웹 모드 작업은 대화 모드 세션이 아니라 작업 하나당 `claude -p` 한 번(평가 모드와 같은 실행기). 질문 없이 끝내고 '작업 결과 보고'로 답하며, 사람 확인은 웹 화면의 승인·수정 요청 버튼이 대신함.
- 실행기 보안: 작업 폴더에 규칙·스크립트·이 제품만 복사(다른 제품·`docs/handoff.md`·`project-context.md`·`.env` 없음), `--tools`로 도구 제한, `--allowedTools`로 `cards.json` 쓰기와 `check`·`validate`·`render`만 허용, `--permission-mode dontAsk`, `--setting-sources project`, `--strict-mcp-config`. 결과는 실행기가 다시 검증해 통과할 때만 `cards.json`·`output/`을 반영.
- 로컬 제작 API 보안: Host가 127.0.0.1/localhost일 때만, 쓰기는 `X-Studio: 1` 헤더 + 같은 출처, 제품ID·파일명 규칙, 이미지 시그니처 검사(PNG·JPG, 10MB), 작업은 한 번에 하나.
- 구성안 승인 버튼은 승인 기록(`plan_approved`, `approved_by: human`) 뒤 문구·출력 작업을 바로 시작. 최종 승인은 `stage: approved` + 검증 + `final_approved`.
- 차트 색은 dataviz 검증기(명도·채도·색약 구분·대비)를 통과한 값만 쓰고, 색만으로 구분하지 않게 글자(AI/사람)도 함께 적는다.

## 검증

- 웹 모드 규칙 문구 리뷰 (2026-10-19, Windows): 문서만 변경, `npm test` 105개 통과.
- 주의 표현 목록 (2026-10-19, Windows): `npm test` 109개 통과(새 `tests/caution.test.js` 4개). 기존 예시 제품(`toneup-sunscreen`·`-r1`) 문구에서 잡히는 표현 0건이라 `docs/examples/web-data`와 `export` 테스트 결과가 그대로. `eval/inputs/eval-oat-drink` 원문의 '설탕 무첨가'는 카드에 쓰면 [주의]로 잡힘(판단 기준상 원문 그대로 둘 수 있음). `npm run web:build`는 이 PC에 웹 의존성이 없어 안 돌림(웹 코드 변경 없음).
- 웹 데이터 v0.2 (2026-10-19, Windows): `npm test` 106개 통과(`tests/export.test.js`에 주의 표현 `fields` 내보내기 1개 추가), `npm run web:build`(타입 검사·빌드) 통과. 주의 표현 목록 작업(#30)과 임시로 합쳐 관련 테스트 48개 통과.
- #28: `npm test` 111개 통과(새 `tests/eval-runner.test.js` 6개: 인자, 실행 계획·실행ID·중복 거부, dry-run, 정상 입력 완료·평가 승인·체크리스트 통과·스키마, 입력 누락 중단, 핵심 정보 포함률·금지 표현 계산). CLI로 가짜 Claude 2회 반복 실행(`--repeat 2`) 확인.
- #21 실제 실행 (2026-10-19, 이규동 Mac, Claude Code 2.1.123·Sonnet 4.6): 웹 모드로 `toneup-web` 새 제작 → 구성안 작업(2분, 12턴, 재검증 오류·경고·주의 0) → 구성안 승인 → 문구·출력 작업(6분, 14턴, PNG 5장, 재검증 0). 막힌 도구 사용(`permission_denials`) 0. 첫 실행은 로그인 토큰 만료로 401(`RUN_ERROR`) → 다시 로그인해 해결. 화면 오류 1건(표지·마무리 카드에 `evidence`가 없으면 구성안 표가 멈춤) 수정, 가짜 Claude도 같은 모양으로 바꿈. Mac의 Playwright 브라우저가 버전 업데이트로 없어 `npx playwright install chromium` 필요했음.
- #23 (2026-10-19, Windows): `npm test` 91개 통과. 이규동의 최신 브랜치(`feat/21-web-studio`, #15·#17·#18 포함)에 이 변경을 임시로 합쳐 확인 — `eval-spec`·`eval-inputs`·`web-data`·`export` 테스트 19개 통과(#18 체크리스트 4개가 새 스키마를 그대로 통과), 작업 실행기(`runJob`, 평가 모드)로 가짜 Claude 실행 1건(실행ID `eval-toneup-sunscreen--v1--r1`, 구성안 → `plan_approved: eval` → 문구·출력)을 돌려 `result.json`으로 옮기니 스키마 통과, 같은 실행을 `npm run export`(`kind: eval`)로 내보내기·`check`·`validate` 성공. 합칠 때 `package.json`(test 목록)·이 문서가 #21과 충돌 — 병합 순서에 따라 정리 필요. **Windows에서 #21 테스트 5개 실패**(이 변경과 무관): `job-runner.js`의 `fs.symlinkSync(..., 'dir')`가 관리자 권한 없이 `EPERM`(→ `'junction'`이면 해결 확인), 테스트가 `fake-claude.js`를 직접 실행해 `spawn EFTYPE`(Windows는 .js를 바로 실행 못 함).
- #25 (2026-10-19, 이용석 Windows): 작업 실행기가 Windows에서 동작하도록 수정 — `node_modules` 링크를 Windows에서는 `junction`으로(디렉터리 symlink는 관리자 권한 없으면 `EPERM`, 지울 때 링크만 지워지는 것 확인), claude 실행 파일이 `.js`면 node로 실행(`claudeCommand`, `studio-api.js`도 같이). Windows에서 `npm test` 102개 통과(수정 전 5개 실패). 데스크톱 앱에 든 `claude.exe` 2.1.299가 실행기 인자(`--tools`·`--allowedTools`·`dontAsk` 등)를 받아들이는 것 확인. 이 PC의 CLI는 로그인 전이라 실제 제작은 `claude` 로그인 뒤 가능. `claude`가 PATH에 없으면 `CARDNEWS_CLAUDE_BIN`에 경로 지정.
- #21: `npm test` 102개 통과(새 `job-runner` 8개·`studio-api` 3개, 가짜 Claude `tests/fixtures/fake-claude.js`). `npm run web:build` 통과. Playwright로 가짜 Claude + 시험용 폴더(`CARDNEWS_STUDIO_SANDBOX`)에서 새 제작(폼·이미지 올리기) → 구성안 → 구성안 수정 요청 → 승인·문구 → 3번 카드 수정 요청 → 최종 승인 → 내보내기 전체 흐름 확인. 모바일 390px 가로 넘침 없음, 콘솔 오류 없음. **실제 `claude -p` 실행은 아직**(Mac에서 확인, 사용량 들어감).
- `npm test` 88개 통과. `npm run web:build`(타입 검사 + 빌드) 통과, `npm audit` 0건.
- #18: `npm test` 91개 통과(새 `tests/eval-inputs.test.js` 3개). 입력 확인 결과: 정상 2개 오류·경고 0, 입력 누락 `INPUT_MISSING` 5개, 지시문 경고 5개.
- #17: Playwright로 실제 기록(이벤트 12개·단계 4칸)과, 데이터를 바꿔 검증 오류·평가 자동 승인·카드 수정 요청(유형 칩·메모)·수정 작업 중단이 있는 기록을 표시 확인. 모바일 390px. 콘솔 오류 없음.
- #15: Playwright로 크게 보기(클릭·주소로 열기·←→·마지막 카드 다음 버튼 비활성·Esc·바깥 클릭 닫기), PNG 받기 파일명·내용, ZIP 파일명과 안의 PNG 5개가 원본과 같은지, 겹침 경고(데이터를 바꿔 확인), 모바일 390px 화면 확인. 콘솔 오류 없음.

## 프로젝트 기준 상태 (2026-10-16)

- v0.5: 입력 확인·데이터/근거/글자 수 검증·HTML/PNG 출력·제작 기록·지표·자동 테스트가 있음. 가상 톤업 선크림으로 대화 모드 전체 흐름 확인(`products/toneup-sunscreen-r1`).
- 실제 제품 자료로 하는 첫 제작은 자료 대기. 가상 결과와 Figma 예시 수치를 성과로 일반화하지 않음.
- 내보내기(`npm run export`, #11)와 결과 보기 웹 골격(#13)이 있음. V1은 기본 목록, V2 카드 결과(#15)·제작 과정(#17) 완성. 남은 화면은 이용석 담당(구성안·근거, V3, V4). 웹 모드 제작 화면 S1~S3와 작업 실행기(#21) 있음. 평가 실행기(`npm run eval`)는 작업 실행기 위에 만들 예정. 지시문은 `prompts/web/`·`prompts/eval/`.
- Figma '02 웹 와이어프레임'의 W3·W4·W5는 #21에서 '로컬 제작 화면(S1~S3)'으로 다시 쓰임(로그인 없음).
- Mac 작업 폴더(`~/git/Cardnews-automation`)에는 `node_modules/`가 없을 수 있음. 테스트 전에 `npm install`.
- 노션은 2026-10-16 기준으로 갱신됨. Figma '02 웹 와이어프레임'(W1~W8)은 10.10 관리자 웹 기준이라 노션 '웹 화면 설계'(V1~V4)가 우선.

## 남은 문제·미결정

- 멘토 확인: 결과 보기 웹으로 '웹으로 구현' 피드백을 충족하는지, 웹 공개 범위, 실제 제품 자료 제공 시점, 평가 기준 (노션 '1차 멘토링 — 확인할 질문').
- 웹 데이터 규격: 이용석 리뷰(10.19)로 V2 필드 확인, `cautions[].fields` 추가해 v0.2. ZIP 생성 위치(브라우저)는 확정 필요. 수정 요청·주의 표현이 있는 예시는 톤업 선크림 첫 제작 뒤 추가.
- 평가 결과·체크리스트 규격 v0.1 초안 작성(`docs/eval-spec.md`, 이용석 10.19) → 이규동 리뷰·승인 대기. 미결정: `eval/runs/` 커밋 여부, `result.json` 작성 방식(실행기), `copy_terms` 비교에서 띄어쓰기·대소문자 무시 여부. 집계 결과 형식은 V3 때 v0.2로 추가.
- 근거 연결률(`evidence_rate`)은 '근거 있는 카드 ÷ 전체 카드'라서, 규칙상 근거가 없어도 되는 표지·마무리 카드 때문에 실제 웹 모드 결과가 60%로 나옴. 분모를 근거 필수 카드(특징·사용법·상세)로 바꾸면 스키마가 그 카드들에 근거를 강제하므로 **검증 통과 결과는 항상 100%**가 되어 의미가 없음. 정의를 다시 정해야 함(두 사람 결정): ① 전체 카드 기준 유지 + 화면 설명 고침, ② 지표를 빼거나 다른 것(예: 문구와 연결 인용의 글자 겹침)으로 바꿈. 지금 V2 제작 과정 화면 설명('특징·사용법 문구 중')과 계산이 다름.
- 배포처(Vercel 예정)와 공개 링크 접근 제한 여부는 미정. 배포 계정 연결은 사람이 한다(설정값은 `web/README.md` '배포').
- 작업 실행기의 `claude -p` 옵션은 Mac의 Claude Code 2.1.123에서 **인자 해석까지 확인**(모르는 옵션은 `unknown option`으로 거부되는데, 실행기 옵션 전체는 통과. `--max-turns`는 도움말에 없지만 받아들임). `--tools`의 `Skill`과 `Bash(npm run render -- <ID> --card:*)` 규칙이 실제로 허용·차단되는지는 첫 실제 실행에서 확인하고, 다르면 `claudeArgs`·`allowedTools`를 고친다.
- 평가 실행기: 작업 실행기(`runJob({mode:'eval'})`)를 그대로 쓰고, 평가 결과 파일 위치·형식만 `docs/eval-spec.md`를 따름. 평가 결과 파일 위치·형식과 평가 세트 형식(`input.md` + 체크리스트)은 `docs/eval-spec.md`를 따름.

## 다음 행동

1. 이규동: PR #27·#24 `main` 병합 → 근거 연결률 정의 결정(이용석과) → 평가 실행기(`npm run eval`, eval-spec 기준: `eval/runs/`·`result.json`) → 배포처 정하고 배포 링크(10.28) → 제품 A·B 평가 입력(실제 자료 받으면).
2. 이용석: 주의 표현(#30)·웹 데이터 v0.2(#31) PR 리뷰 반영 → 근거 연결률 정의 결정(이규동과) → Claude Code CLI 로그인(실제 웹 모드·평가 실행용) → 실제 톤업 선크림 자료·이미지 직접 수집(`npm run new-product`, 10.24) → 웹 모드(#21) `CLAUDE.md`·Skill 문구 리뷰 → 대화 모드 첫 제작 → V2 구성안·근거 화면(`web/src/screens/project-detail/tabs/PlanEvidenceTab.tsx`, `npm run web:dev`), 핵심 정보 포함률 지표, 평가 입력 6개 → v1 평가 분석·v2 규칙, 평가 집계·V3 대시보드.
1. 이규동: 평가 실행기 PR(#28) → 근거 연결률 정의 결정(이용석과, 아래 '남은 문제') → 평가 실행을 웹 데이터로 내보내기(`kind: eval`, export가 `eval/runs`를 읽게) → 배포처 정하고 배포 링크(10.28) → 제품 A·B 평가 입력(실제 자료 받으면).
2. 이용석: PR #24·#26 리뷰 반영 → Claude Code CLI 로그인(실제 웹 모드·평가 실행용) → 실제 톤업 선크림 자료·이미지 직접 수집(`npm run new-product`, 10.24) → 웹 모드(#21) `CLAUDE.md`·Skill 문구 리뷰 → 주의 표현 목록·검사 기준(10.28) → 대화 모드 첫 제작 → V2 구성안·근거 화면(`web/src/screens/project-detail/tabs/PlanEvidenceTab.tsx`, `npm run web:dev`), 핵심 정보 포함률 지표, 평가 입력 6개 → v1 평가 분석·v2 규칙, 평가 집계·V3 대시보드.
3. 작업을 시작할 때 새 이슈를 만들고 이 문서의 '현재 작업'을 교체한다. 노션 작업 트래커의 해당 행 상태도 바꾼다.
