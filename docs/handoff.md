# 개발 인수인계

프로젝트 개발을 교대할 때 실제 파일·Git 상태와 함께 확인한다. 운영 규칙은 [project-context.md](project-context.md), 카드 제작 상태·승인은 해당 제품 데이터와 제작 로그가 기준이다.

## 최근 변경 (최신이 위, 최근 10개)

다음 도구가 모르면 틀리게 작업할 규칙·용어·파일 변경만 적는다. 자세한 내용은 커밋과 PR에서 본다.

| 날짜 | 도구 | 이슈·브랜치 | 바뀐 점 |
|---|---|---|---|
| 2026-10-27 | Claude | `feat/job-queue` | **작업실 대기열·작업 중 표시** (이규동: 한 제품 작업 중 다른 제품이 안 돌아감): 작업은 여전히 한 번에 하나지만 다른 제품 작업을 누르면 거절(409) 대신 대기열에 넣고 앞 작업이 끝나면 자동 시작. 제품마다 하나만, 대기 취소 `DELETE /api/studio/products/:id/queue`, 전체 현황 `GET /api/studio/jobs`(`/status`·`/job`에도 `jobs`). `actions.running`은 이제 이 제품이 작업·대기 중일 때만(다른 제품이 돌아도 버튼이 꺼지지 않음), `job_state`·`wait_ahead` 추가. 수정 요청 기록(`revision_requested`)은 작업이 실제로 시작할 때 남김(대기 취소하면 안 남음). 화면: 작업실 모든 화면 위 진행 띠(진행 중 작업·경과 시간·대기 목록), 제품 화면 대기 패널(순서·앞 작업·취소), 시작하면 기다릴 때 안내, 목록 '대기 N번째'. **버그 수정**: 제품 화면에서 다른 제품으로 넘어가면 새 데이터가 올 때까지 이전 제품 내용(지표 포함)이 남아 보이던 것(`key={id}`) — 이용석이 본 "세럼에 선크림 지표"의 후보 중 하나. 대기열은 서버 메모리라 `npm run studio`를 끄면 사라짐 |
| 2026-10-27 | Claude | #74 · `feat/74-new-designs` | **디자인 다듬기 — 기본 묶음 포함** (이규동 "못생겼어, 기존 것부터 이쁘게"; 실제 제품 사진인 달바 퍼플로 5묶음 출력해 보며 고침): **기본** 템플릿 다시 씀 — 화장품 진열장 아치 모양을 공통으로(표지: 오른쪽·아래로 이어지는 아치 + 받침 그림자 위 제품, 남는 높이만큼 제품이 커짐 / 이미지형: 위가 둥근 아치 창 / 설명형: 상자 대신 가는 선 줄 + 아치 모양 번호 칸), 기본 cover·image에 `trimImage`(투명 여백 자르기, 프리미엄과 같은 방식)·`role-*` 클래스. **글자 수 기준·문구 규칙은 그대로**(calibrate 전체 채움 통과), PNG만 달라짐 → 기본으로 낸 이전 평가 PNG와 모양이 다름. **타이포** 표지: 제목 아래 남는 높이 전부를 제품 자리로(짧은 제목이면 제품이 큼, 겹침 없음). **연출**: 표지 제품 크게, 제품 사진 없는 설명 카드는 장면 띠를 150px로 줄이고 글을 올림. **공통** `base.css` `[data-fit]`에 `text-wrap: balance`(자동 줄바꿈 때 끝에 한 단어만 남지 않게). 시안 배치 기준값은 바뀐 두 곳(타이포 표지 제품 칸·연출 표지 제품)만 갱신. `design-sets.test.js`의 "기본은 role·여백 자르기 안 씀" 확인을 새 동작으로 바꿈 |
| 2026-10-27 | Claude | #74 · `feat/74-new-designs` | **새 묶음 시안 충실도 재구성** (이규동 "시안이랑 너무 다르다 → 색뿐 아니라 디자인도 유지"): 시안 10·06·02를 1080px로 잘라 좌표·글자 크기·색을 재고 템플릿을 다시 씀. 같은 문구로 시안·출력을 나란히 비교하며 맞춤. **색**: 묶음 고유 팔레트 `_designs.<묶음>._theme`(color·font.files·contrast), 세 묶음 카드 색 기본값 `제품 색`→`기본`(고유색). 큰 글자 색 짝은 `_theme.contrast`로 대비 3.0 허용(`checkContrast`·`adjustContrast`·`decideColors` `pairMin`). 웹 데이터 색은 7개만 내보냄. **사진 자리**: 입력 이미지 5번째 칸 `용도`(제품·제형·배경, 비우면 제품; 양식·작업실 폼·check 경고), 템플릿 `{{texture}}`·`{{scene}}`(+`has-*` 클래스). 타이포·팝 특징 카드는 제형, 연출 띠 위쪽은 배경 사진(없으면 스튜디오 무대: 짙은 파랑 벽·바닥 경계·유리 받침, 흐림 없음 — 처음 넣은 빛 번짐·흐림 대체 화면은 어색하다는 의견으로 바꿈). 카드 색 대표 사진에서 제형·배경 제외, Skill에 "카드 image는 제품 용도만" 한 줄. **줄 맞춤**: 굵기 900 글꼴을 먼저 불러온 뒤 크기 맞춤(`waitForFit`), 칸 높이 넘으면 줄 일괄 축소, 최소 크기로도 안 들어가면 줄바꿈. **점검**: 이미지 겹침은 실제 글자 줄 상자로(오탐 줄임), 글자 칸끼리 겹침 경고·calibrate 실패 추가. `tests/design-fidelity.test.js` + `tests/fixtures/design-fidelity.json`(주요 요소 위치·크기·색 기준값, ±14px)으로 배치 고정, `tests/image-kinds.test.js`. 글자 수 기준·`_measured` 재측정(전체 채움 5묶음 모두 통과), 미리보기 다시 만듦. **Skill·config 바뀜 → 규칙 버전 결정 필요** |
| 2026-10-26 | Claude | #74 · `feat/74-new-designs` | **디자인 묶음 2단계 — 새 묶음 3개**: GPT 시안 10종(이규동, 내부 참고·저장소에 안 올림) 중 이규동이 고른 10·06·02를 `타이포`(큰 타이포, `templates/typo/`)·`팝`(팝 컬러블록, `templates/pop/`)·`연출`(위쪽 연출 띠, `templates/band/`)로 구현. `_designs`·`_catalog`(설명·fits·avoid·needs·version 1·`docs/designs/*/preview.png`), 입력 무드 선택지에 추가. 색은 카드 색 7개만 쓰고 보색은 CSS 상대 색(장식용, 글자 없음). 연출 띠는 배경 사진 대신 제품 색 짙은 띠. calibrate 전체 채움 통과(타이포 52·팝 64·연출 64), `tests/new-designs-render.test.js`(test:render). 기존 기본·프리미엄 그대로 |
| 2026-10-26 | Claude | #74 · `feat/74-design-records` | **디자인 묶음 4단계 — 기록에 남기기**: `designRecord()`(`common.js`: `id`·`name`·`version`·`source`·`selected_by`·`reason`). `render-report.json` `design` + 출력 첫 줄 '디자인 묶음: …'. 웹 데이터 `project.json` `design`(v0.3 선택 칸, 스키마·타입), V2 카드 결과 '디자인 묶음' 섹션. 평가 `result.json` `design`(선택 칸). A6 비교: `consistency.design_match`, 묶음별 `designs` 횟수, CLI 줄. 예시 웹 데이터(toneup-sunscreen-r1)에 `design` 추가. 결과(PNG·문구)는 같음 |
| 2026-10-26 | Claude | #74 · `feat/74-design-select` | **디자인 묶음 3단계 — 무드 자동 추천·구성안에서 고르기**: 입력 `무드`에 `자동 추천`(양식 v1.3). `cards.json` 최상위 `design` `{id, selected_by: claude\|human, reason}`(스키마·validate: 자동 추천인데 없으면·목록에 없는 이름·빈 이유면 `SCHEMA_ERROR`, 입력 무드와 다르면 경고). `npm run check`는 자동 추천이고 아직 안 골랐으면 글자 수 대신 묶음 목록, 고른 뒤엔 그 묶음 기준. `cardnews-content` Skill 3단계(자동 추천일 때만 고르고 이유)·5단계(design 있으면 check 다시). 작업실: `PUT /api/studio/products/:id/design`(구성안 승인 전·입력 무드 직접 지정 아님), 기록 `design_selected`(`design`·`from`·`by`), 구성안 확인·카드 확인에 '디자인 묶음' 패널. 웹 데이터 타임라인 이벤트에 `design_selected` 추가(버전 그대로). **자동 추천을 고를 때만 동작 → 기존 입력·평가 입력 결과 같음. Skill 문구가 바뀌어 규칙 버전 결정 필요** |
| 2026-10-26 | Claude | #74 · `feat/74-design-resolve` | **디자인 묶음 1단계 — 묶음 정하기 한 곳으로 + 목록 설명(출력 변화 없음)**: `resolveDesign({ input, data })`(`common.js`)가 입력 무드(직접 지정) → `cards.json` `design.id` → 기본 순서로 정함. `designOf(input, config, data)`·`loadConfig(input, data)`·`colorModeOf(input, data)`·`limitLines(input, data)`에 `data`(cards.json) 추가, validate·render·compare·web-data·check가 넘김. `config/templates.json` `_catalog`(기본·프리미엄: name·summary·fits·avoid·needs·version·preview), `designCatalog()`. 지금 `cards.json`에는 `design`이 없어 결과 같음(기존 제품 HTML 비교 동일). 규격 추가·자동 추천 규칙은 3단계 |
| 2026-10-26 | Claude · Codex | #53 · `fix/53-premium-review` (#69) | **#68 위로 #69 정리**: 글자 수 안내·`test:web`은 #68 것 사용, #69의 중복 안내·`test:ui` 제외. 입력 칸 이름 '디자인'→'무드'(#64), calibrate `--mood`(`--design`도 됨). 예전 입력은 '무드' 칸이 없을 때만 '디자인' 값을 읽음(`moodInputOf`), 두 칸이 있으면 빈 값이라도 무드 우선, 잘못된 값은 읽은 칸에 경고. 내부 `_designs`·`designOf`·결과 규격은 그대로 |
| 2026-10-22 | Claude | #67 · `fix/67-design-limits` | **디자인별 글자 수 기준 안내**: `npm run check` 끝에 이 제품의 디자인(기본·프리미엄)·카드 색과 템플릿별 글자 수 기준을 출력(`scripts/lib/limits.js`). 프리미엄이면 '_designs.프리미엄 기준을 쓰라'고 명시 → Claude가 1단계에서 보고 그 숫자로 문구를 씀. 규칙 문서·규칙 버전은 그대로. 웹 화면 테스트 2개(`plan-evidence-ui`·`premium-form-ui`)를 `npm run test:web`으로 등록, `CHROMIUM_PATH` 지원 |
| 2026-10-21 | Codex | #53 · `feat/53-lilac-design` | **라일락 → 프리미엄 첫 무드 프리셋**: `디자인` 기본·프리미엄, `templates/premium/` 3개. 색 비움은 제품 색, 직접 지정 우선. Point N·How to·STEP·분할 면·큰 제품·역할별 배치, 칸별 실측 7개·최대 문구 45경우 통과. 기본 템플릿·카드 스키마·규칙 버전 유지. 로컬 구현, 커밋 전 |
| 2026-10-21 | Claude | #61 · `feat/61-colors-export` | **웹 데이터 v0.3 — 쓴 카드 색**: `project.json` `colors`(`mode`·`source`·`image`·`representative`·`color` 7개·`adjustments[]`(`key`·`from`·`to`)·`note`), 가장 최근 출력 보고서의 값, 옛 출력이면 `null`. `spec_version` 0.3(스키마 3개·`web-data.js`·`types.ts`). V2 카드 결과에 '카드 색' 섹션(이름·값 같이 표시). 예시·`web/public/data`는 `toneup-sunscreen-r1`을 다시 출력(`--no-log`)해 다시 내보냄 → PNG 강조색이 진해짐 |
| 2026-10-21 | Claude | #60 · `feat/60-theme-contrast` | **기본 테마 = 실제 출력 색**: `config/theme.json` `muted` #7A6E66→#685F5A, `primary` #D9826B→#A2442A(대비 자동 조정 결과와 같은 값, #46 리뷰 이용석 의견). 기본 테마는 7곳 모두 4.5 이상이라 출력 때 조정 없음. Figma `color/*` 변수는 이미 같은 값. 출력 결과는 #46 이후와 같음. 결과 보기 웹 화면 색(`web/src/styles/global.css`)은 카드 색과 별개라 안 바꿈 |
| 2026-10-21 | Claude | #58 · `fix/58-eval-export-label` | **평가 내보내기 #43 리뷰 반영**: 평가 프로젝트 `label`이 `평가 · <묶음> · r<N>`(비교판이면 ` · <이름>`) — V3 목록에서 반복 구분. `exportWebData`를 `evalRuns` 없이 `only`로 부르면 이미 내보낸 평가 프로젝트를 `index.json`에 그대로 둠(전에는 빠짐). 웹 데이터 규격에 '평가 실행은 평가를 돌린 컴퓨터에서만 내보내짐(PNG가 git에 없음), 다른 컴퓨터는 `--no-eval`·`--only`' 안내 |

## 현재 작업 (이용석, 2026-10-26)

- #69: #68 병합(main `2d90582`) 뒤 정리본을 main을 합치는 새 커밋으로 반영. force push 없음. 리뷰 이규동.
- 검증: npm test 157·test:render 10·test:web 8, calibrate --check 기본·프리미엄 통과. 예전·새 입력의 표지 HTML·카드 색 일치 테스트 포함.
- 확인 필요: 예전 '디자인' 입력 호환 방식(#68 댓글로 이규동에게 물음). 웹 Vite 7.3.6 설치 감사 high 1건은 이규동 쪽 별도 확인(이번 의존성 변경 없음).
- 다음: 퍼플 프리미엄 실제 제작(10.28 시연). 핵심 정보 포함률은 평가 실행기(`eval-runner.js`)에 이미 계산이 있어 남은 범위(제품 `quality.json` 추가 여부) 확인. #66은 이규동 답변 대기.

## 현재 작업 (이규동, 2026-10-22)

- 확인일·작성 도구: 2026-10-22 · Claude.
- 10.22 `main` 병합: #59·#62·#63(이규동), #64·#65(이용석, #65는 이규동 결정으로 병합). 열린 PR은 이 작업만.
- 이슈·PR: [#67](https://github.com/lgdl24/Cardnews-automation/issues/67) · PR은 push 후 생성(기준 `main`). 리뷰 이용석. **`main` 병합은 이규동.**
- 상태: 구현·테스트 완료(`npm test` 154개, `test:render` 9개, `test:web` 8개). 실제 Claude로 프리미엄 제작은 아직 안 함(웹 제작 화면에서 확인 필요).
- 작업 브랜치: `fix/67-design-limits` · 기준 `main`(`c47dcc2`).
- 변경 파일: `scripts/lib/limits.js`(새로), `scripts/check-input.js`, `tests/check-input.test.js`, `tests/plan-evidence-ui.test.js`·`tests/premium-form-ui.test.js`(Chromium 경로), `package.json`(`test:web`), `README.md`, `docs/card-data-spec.md`, 이 문서.
- 실행 중인 작업: 없음.

## 도구 분담 (이용석 작업, Claude Code · Codex)

2026-10-20 이용석이 정함. 두 도구 모두 GitHub·노션·Figma를 직접 보므로 서로 '학습'시키지 않는다. 대신 **아직 어디에도 안 올라간 상태**(미커밋 변경, 진행 중 작업, 말로 정한 결정)는 이 문서에만 있으니 교대할 때마다 이 문서를 갱신한다. Claude 쪽 개인 메모리는 Codex가 못 본다.

**바꾸면 안 되는 것**: 카드 제작(대화·웹·평가 모드)과 평가 실행(`npm run eval`)은 **Claude Code로만** 한다. 이 프로젝트는 Claude Code(`claude -p`)가 `CLAUDE.md`·Skill을 따르는 과정 자체를 평가(A5 v1·v2 비교 등)하므로, Codex로 카드를 만들면 실험이 깨진다.

| 일 | 도구 | 이유 |
|---|---|---|
| 실제 카드 제작·수정·최종 승인 (퍼플 등) | Claude Code | 규칙·Skill이 Claude 기준 |
| `CLAUDE.md`·Skill v2(글 무드) 작성·시험 | Claude Code | Claude가 따를 규칙이라 Claude로 시험 |
| 평가 실행·결과 분석 | Claude Code | 실행이 `claude -p` |
| Figma(V2·무드 템플릿)·Canva 배경 | Claude Code | 이 PC에서 Figma 쓰기·Canva가 Claude에 연결됨 |
| 노션 정리·트래커, GitHub 이슈·PR 글(이규동 어투), 제안서 | Claude Code | 긴 맥락·어투 규칙·브라우저 작업 |
| V2 구성안·근거 화면 코드 다듬기·테스트 | Codex | 코드 구현 집중 |
| V3 평가 대시보드·V4 버전 비교 구현 | Codex | 화면 코드량 많음 |
| 평가 집계·핵심 정보 포함률 등 Node 스크립트 + 테스트 | Codex | 코드·테스트 반복 |
| 버그 원인 조사·테스트 보강·코드 정리 | Codex | 코드 분석 |
| PR 전 코드 검토 | 만든 쪽의 반대 도구 | 다른 모델이 보면 같은 실수를 덜 놓침. Claude Code에서는 `/codex:review` |
| 이규동 PR 리뷰 | Codex 코드 검토 → Claude 규격·문서 대조·리뷰 글 | 코드 판단과 소통 글을 나눔 |

규칙: ① 한 폴더는 한 도구만(동시에 쓰면 worktree를 나눔) ② 넘기기 전 커밋 + 이 문서 갱신 ③ 작업 하나 = 이슈 하나 ④ 커밋·push·PR·노션 수정·상대 PR 승인은 이용석 승인 후 ⑤ 공동 결정 사항(아래 '이규동 요청·피드백' 3번)은 임의로 확정하지 않음.

Codex에서 시작할 때: 이 문서의 '현재 작업'·'이규동 요청·피드백'·'다음 행동'을 먼저 읽고, 위 표에서 Codex 몫만 맡는다. Claude Code 몫(카드 제작·평가 실행·Figma·노션 쓰기)이 필요하면 하지 말고 이 문서에 '다음 행동'으로 남긴다.

## 이용석 인계 상세

### 작업 폴더 (모두 같은 저장소의 worktree)

| 절대 경로 | 브랜치 | 상태 | 비고 |
|---|---|---|---|
| `C:\Users\LG\OneDrive\Desktop\카드뉴스_자동화` | `docs/36-web-mode-review` | 깨끗(병합됨) | **OneDrive 폴더**: 10/20 `.git` 팩 인덱스 유실·추적 파일 25개 삭제가 있었음(git으로 복구, 손실 없음). `node_modules`에 `ajv` 없음 → 여기서 테스트하려면 `npm install`. 새 작업은 OneDrive 밖 폴더 권장 |
| `C:\Users\LG\cardnews-handoff` | `docs/44-handoff-codex`(이 문서, #44) | 기준 `origin/main` `54465ed` | 병합되면 지워도 됨 |
| `C:\Users\LG\cardnews-v2plan` | `feat/41-v2-plan-evidence` | 미커밋 3개 | 아래 '미커밋 변경' |
| `C:\Users\LG\cardnews-evalinputs` | `feat/34-eval-inputs-toneup` | 미추적 2개 | `node_modules`가 실제 설치본(다른 폴더는 여기로 junction) |
| `C:\Users\LG\cardnews-proposal`·`cardnews-webdata`·`cardnews-win` | 병합된 브랜치 | 깨끗 | 지워도 됨(junction `node_modules`는 `[IO.Directory]::Delete`로 링크만 지울 것) |

### 완료한 작업 (모두 `main` 병합, 병합은 이규동)

| 이슈 → PR | 내용 |
|---|---|
| #23 → #24 | 평가 결과·체크리스트 규격 `docs/eval-spec.md` v0.1 |
| #25 → #26 | Windows 작업 실행기(junction, `.js` 실행) — 이슈 #25는 아직 열려 있음 |
| #30 → #32 | 주의 표현 목록 v1(`config/caution-expressions.json`, 식약처 지침 기준) |
| #31 → #33 | 웹 데이터 v0.2(`cards[].cautions[].fields`) |
| #34 → #35 | 이용석 평가 입력 6개 + 달바 조사 + `products/dalba-toneup-purple` 입력 — 이슈 #34 열려 있음 |
| #36 → #37 | 웹 모드 규칙 문구 리뷰 — 이슈 #36 열려 있음 |
| #39 → #40 | 제안서 `docs/proposals/mood-proposal.md`(글 무드·제품 색 무드) — 이슈 #39는 결정 대기라 열어 둠 |
| (리뷰) #29 | 이규동 평가 실행기 승인 리뷰 |
| #38 | 제안 이슈(제품 색 + 대비 검사) → 이규동이 `feat/38-product-color`로 구현 중 |

### 미커밋 변경과 이유

| 폴더 | 파일 | 이유 |
|---|---|---|
| `cardnews-v2plan` | `web/src/screens/project-detail/tabs/PlanEvidenceTab.tsx`(자리표시 → 화면), `plan-evidence.css`(새로, 클래스 `pe-`), `docs/handoff.md`(한 줄) | V2 구성안·근거 화면 1차 구현. Figma V2 확정 전이라 PR 보류 |
| `cardnews-evalinputs` | `products/dalba-toneup-purple/cards.json`·`log.jsonl` | 첫 제작 결과(최종 승인 전). 병합된 브랜치에 있어 그대로 커밋하지 말 것 |
| `cardnews-handoff` | `docs/handoff.md` | 이 인계 정리 |

### 저장소 밖에 있는 것 (커밋 대상 아님)

- 템플릿 시제품: v3(장식형)·v4(에디토리얼, Noto Serif KR·Garamond) — 이용석은 v3 투박, v4도 아쉽다고 함. 원인은 사진 소재 부족으로 판단 → 무드별 AI 배경 장면 + 제품 색 보정 방향으로 진행 중. 파일은 Claude 세션 임시 폴더(scratchpad)라 **Codex에서는 안 보임**. 필요하면 다시 만듦.
- 무드 배경 장면 5종(프리미엄·더마·비건클린·데일리·선케어): Canva에서 생성(원본 1264px, 이용석 Canva 라이브러리). Figma AI는 팀 파일에서 꺼져 있어 실패. 원본은 이용석이 Canva에서 내려받아 폴더에 넣기로 함(미완료).
- Figma: '02 웹 와이어프레임'에 `V2 구성안·근거 (이용석)` 프레임 `68:403`(초안, 이용석이 고칠 곳 있다고 함·내용 미수령), 새 페이지 `06 무드별 카드 템플릿 (이용석 제안)` `75:2`(빈 페이지).
- 노션: 설계 문서 아래 '(제안) 글 무드 · 제품 색 무드 — 이용석'.

### 실행한 테스트와 결과 (2026-10-20)

- `origin/main`(`54465ed`) `npm test` 116개 통과(`C:\Users\LG\cardnews-handoff`).
- `feat/41-v2-plan-evidence`: `npm run web:build` 통과, `npm test` 106 통과(기준 `06df437`), 데스크톱 1280px·모바일 375px 가로 넘침 없음.
- 퍼플 첫 제작: `check` 오류 0(이미지 '확인 중' 경고 1), `validate` 오류 0, `render` PNG 5장·레이아웃 오류 0.
- 이 PC: Playwright Chromium 1248 설치함(이전 1243은 Windows 실행 오류).

### 남은 문제·미검증

- V2 화면은 `main` 기준으로 다시 빌드·테스트 안 함(기준 브랜치가 병합된 뒤 옮겨야 함).
- 퍼플 카드 최종 승인·수정 요청 내용 미정, 노션 '테스트·제작 기록' 미입력.
- 이용석 Claude Code CLI 로그인 안 됨(데스크톱 앱 번들 `claude.exe` 2.1.299, PATH 없음) → 실제 `npm run eval`·웹 모드는 아직 이 PC에서 못 돌림.
- 노션 트래커의 이용석 행 상태가 실제와 다름(아래 '이규동 요청·피드백' 1번).
- 확인 못 한 자료: Figma 댓글(읽기 도구 없음), 노션 페이지 댓글, 노션 트래커 새 행(카드 색·평가 내보내기)의 '리뷰' 칸, GitHub·노션 밖 대화(메신저 등).

## 이규동 요청·피드백 (2026-10-20 확인, 이용석 입장)

확인한 곳: GitHub 이슈·PR 본문·리뷰·댓글(#21~#43), `main`과 `feat/38-product-color`·`feat/42-eval-export`의 `docs/handoff.md`, 노션 작업 트래커·'이용석 작업 안내'. 노션 체크박스가 아니라 실제 병합 PR·코드와 대조함.

### 1. 이용석이 직접 구현·수정해야 하는 일

| 요청 (원문) | 할 일 | 완료 조건 | 우선 | 상태·선행 | 이규동에게 확인할 것 |
|---|---|---|---|---|---|
| V2 구성안·근거 화면 — 노션 트래커, 이규동 handoff '다음 행동 2', [#41](https://github.com/lgdl24/Cardnews-automation/issues/41) | `cardnews-v2plan`을 `origin/main` 위로 옮기고 Figma V2 수정 반영 → PR | `web:build`·`npm test` 통과, 리뷰 이규동 | 높음 (10.29~11.11) | 1차 구현 미커밋 / 선행: Figma V2 수정 내용(이용석) | 탭 틀·`?card=` 주소 공유 방식이 카드 결과 탭과 겹쳐도 되는지 |
| 대화 모드 첫 제작 — 이규동 handoff '다음 행동 2'(#38 리뷰 다음), 노션 트래커 | 카드 수정 요청 반영 → 최종 승인 → 노션 테스트·제작 기록 → 결과 커밋(새 이슈) | `stage: approved`, 기록 입력 | 높음 | 출력 완료·최종 승인 대기 / 선행: 이용석 수정 요청 | 제작 결과(`cards.json`·`log.jsonl`)를 저장소에 올릴지, 이미지 공개 범위(멘토) |
| 핵심 정보 포함률 지표 — 노션 트래커(10.29~) | 3번 결정 뒤 범위 확정 | — | 중간 | **#29가 `result.json`에서 이미 계산**(`key_info_rate`) → `quality.json`에 따로 넣을지 중복 확인 | 대화 모드 제작물에도 필요한지(체크리스트가 없음) |
| v1 평가 분석·v2 규칙, 평가 집계·V3 대시보드 — 이규동 handoff '다음 행동 2' | 순서대로 | — | 낮음(11.12~) | 선행: 평가 실제 실행(로그인), #43 | V3 근거: 노션은 W8 바탕이라 적혀 있으나 이용석이 W8 제외 → 화면 근거 다시 정하기 |
| 노션 트래커 상태 옮기기·PR 번호 메모 — 협업 규칙(노션 '이용석 작업 안내') | 끝난 5개 행 '완료'(또는 '검토 중'), 메모에 PR | 행 상태가 실제와 같음 | 중간 | 미착수(이용석 승인 필요) | — |
| 끝난 이슈 닫기 #25·#34·#36 | 이용석 이슈라 직접 닫기 | 닫힘 | 낮음 | 미착수 | — |
| Claude Code CLI 로그인 — 이규동 handoff '다음 행동 2' | 이용석이 직접 로그인 | `claude auth status` 로그인 | 중간 | 미완료 | — |

### 2. 이규동이 구현했고 이용석에게 검토·피드백을 요청한 일

| 요청 (원문) | 할 일 | 완료 조건 | 우선 | 상태·선행 | 확인할 것 |
|---|---|---|---|---|---|
| PR [#43](https://github.com/lgdl24/Cardnews-automation/pull/43) 평가 실행 웹 내보내기 — 본문 '리뷰 포인트 (이용석)' | V3·V4가 읽을 `label`·`eval` 값 확인, 평가 실행 기본 내보내기 여부 의견, 테스트 | 리뷰 남김(승인 여부는 이용석이 정함) | **높음**(#38보다 먼저 병합 예정) | 열림·리뷰어 미지정 | 기본 내보내기 vs `--eval` 옵션(3번) |
| 카드 색 #38 — `feat/38-product-color` handoff "리뷰 이용석(제안자)", "퍼플 등 4색 시제품 결과와 비교" | 이용석 시제품(퍼플 #7E50A5, 핑크 #915746, 블루 #376C81, 그린 #38753C, 대비 7곳 4.5↑)과 결과 비교, 기본 테마 색 변화 확인 | 리뷰 남김 | 높음 | PR [#46](https://github.com/lgdl24/Cardnews-automation/pull/46) 열림 / 선행 #43 | 아래 3번의 색 결정 |

### 3. 두 사람이 함께 결정해야 하는 사항 (임의 확정 금지)

| 사항 (원문) | 선택지 | 비고 |
|---|---|---|
| 근거 연결률 정의 — `main` handoff '남은 문제', #43에서 화면 설명만 계산에 맞춤 | ① 전체 카드 기준 유지 + 설명 고침 ② 지표 빼거나 바꿈 | 오래 미뤄짐. V2·V3 표시에 영향 |
| ~~기본 테마 색 조정 반영~~ | **정함(10.21)**: `theme.json`·Figma를 조정값(출력 색)으로 맞춤 → #60 | 출력 결과는 #46 이후와 같음 |
| ~~쓴 색을 웹 데이터로 내보낼지~~ | **정함(10.21)**: 내보냄 → 웹 데이터 v0.3 `colors`, V2 카드 결과 '카드 색'(#61) | |
| 평가 실행 기본 내보내기 — #43 리뷰 포인트 | 기본 포함 / `--eval`일 때만 | |
| 규칙 버전 v1 유지·변경 — #9·#30 기록, 제안서 #39 | v1 유지 / v2 | 글 무드(해요체 고정 해제)는 v2 후보 |
| 제안서 #39 '같이 정할 것' 6개 | 해요체, 무드 개수, 입력 양식 칸, `analysis` 필드, 색 적용 방식, 디자인 프리셋 | 색 적용 일부는 #38 구현으로 진행됨 |
| eval-spec 미결정 — `copy_terms` 띄어쓰기·대소문자, `eval/runs` 커밋 | | `eval/runs` png·html 제외는 #29로 적용됨 |
| 멘토 확인 — 노션 트래커 '멘토 확인'(공동, 10.28) | 이미지 공개 범위(달바 '확인 중'), 평가 기준 | |

### 4. 이미 처리돼 다시 할 필요 없는 일

- 웹 데이터 규격 리뷰(노션 10.21) → #33 병합. 노션 트래커는 아직 '시작 전'.
- eval-spec 초안(노션 10.24) → #24 병합. `main` handoff '남은 문제'의 "이규동 리뷰·승인 대기"는 지난 내용.
- 톤업 실제 자료(노션 10.24, 예시 이름 `toneup-sunscreen-real`) → 실제로는 `dalba-toneup-purple`로 #35 병합.
- 주의 표현 목록(노션 10.28) → #32 병합.
- 웹 모드 문구 리뷰(#21의 "'작업 결과 보고' 이용석 승인 필요") → #37 병합.
- PR #24·#26 리뷰 반영, #30·#31 리뷰 반영(`main` handoff '다음 행동'의 옛 항목) → 모두 병합.
- 평가 실행기 리뷰(#29) → 승인·병합. 이용석 평가 입력 6개 → #35 병합(노션은 '시작 전').

오래된 요청과 새 요청 차이: 노션 '이용석 작업 안내'(10.16 기준)의 순서·마감은 GitHub 병합으로 대부분 끝남. 이규동 최신 handoff(`feat/38`)의 이용석 순서는 "#38 리뷰 → 대화 모드 첫 제작 → V2 화면·포함률 → v2 규칙·V3"이고, #43 리뷰가 그 앞에 있음.

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
- 로컬 제작 API 보안: Host가 127.0.0.1/localhost일 때만, 쓰기는 `X-Studio: 1` 헤더 + 같은 출처, 제품ID·파일명 규칙, 이미지 시그니처 검사(PNG·JPG, 10MB), 작업은 한 번에 하나(다른 제품 작업은 대기열, 2026-10-27).
- 구성안 승인 버튼은 승인 기록(`plan_approved`, `approved_by: human`) 뒤 문구·출력 작업을 바로 시작. 최종 승인은 `stage: approved` + 검증 + `final_approved`.
- 차트 색은 dataviz 검증기(명도·채도·색약 구분·대비)를 통과한 값만 쓰고, 색만으로 구분하지 않게 글자(AI/사람)도 함께 적는다.

## 검증

- #67 디자인별 글자 수 기준 (2026-10-22, 클라우드): `npm test` 154개(기본·프리미엄 기준 출력, 카드 색 비움/직접 지정), `npm run test:render` 9개, `npm run test:web` 8개 통과.
- #61 웹 데이터 v0.3 (2026-10-21, 클라우드): `npm test` 145개(새 export 테스트 — 더 최근 카드별 보고서의 제품 색을 내보내고 대비 표·밝기는 뺌, 색 기록 없는 출력은 `null`·스키마 통과), `tests/plan-evidence-ui.test.js` 7개, `npm run web:build`, `npm run check:web` 통과. V2 카드 결과 '카드 색'을 1280px·375px에서 확인(가로 넘침 없음).
- #60 기본 테마 색 (2026-10-21, 클라우드): `npm test` 144개(기본 테마 대비 7곳 통과·조정 없음, 옛 값 조정 결과 = 새 값), `npm run test:render` 5개 통과. Figma `color/muted`·`color/primary`가 이미 #685F5A·#A2442A인 것 확인.
- #58 평가 내보내기 리뷰 반영 (2026-10-21, 클라우드): `tests/eval-runner.test.js` 9개 통과 — 이름표 `평가 · v1-base · r1`, 평가 폴더 없이 다른 프로젝트를 `--only`로 내보내도 평가 프로젝트가 목록·폴더에 남음(테스트는 git에 없는 `output/`을 쓰지 않고 웹 데이터 예시로 만듦).
- #51 배포 전 점검 (2026-10-20, 클라우드): `npm test` 143개 통과(새 `tests/check-web.test.js` 7개 — 예시 데이터 통과, 규격 밖 파일·잔여 폴더·빠진 PNG, `확인 중` 이미지, 키 형태(테스트에서 만든 가짜 값, 오류 메시지에 값 미포함), 빌드 결과 `.env`·`log.jsonl`·소스 맵, CLI 종료 코드). 현재 `web/public/data`·`web/dist` 통과.
- #49 평가 비교판 (2026-10-20, 클라우드): `npm test` 136개 통과(새 2개 — 정의 검사(description·files 필수, 스크립트 파일 거부), 지시문 덮어쓰기, 가짜 Claude 비교판 실행 시 작업 폴더 `CLAUDE.md`만 바뀌고 `scripts/validate.js`·저장소 `CLAUDE.md`는 그대로, `result.json` 스키마 통과·`notes`). 정의 없는 이름은 `npm run eval -- --variant nope --dry-run`에서 멈춤 확인.
- #47 반복 일관성 (2026-10-20, 클라우드): `npm test` 134개 통과(새 `tests/compare.test.js` 5개 — 인자, 계산, 제품 비교, 가짜 Claude로 정상 입력 2회·입력 누락 2회+다른 묶음 1회 실행 후 묶음·완료·중단 오류 코드·일치율·CLI·`--json` 확인). 리팩터링 전후 `compare toneup-sunscreen toneup-sunscreen-r1 --json` 출력이 같음.
- #38 카드 색 (2026-10-20, 클라우드·Mac): `npm test` 129개, `npm run test:render` 5개 통과(새 `tests/color-mood.test.js` 11개, render 2개, check-input 1개). 색상 36개 × 채도·밝기 5가지 대표 색이 모두 자동 조정 후 대비 7곳 4.5 이상. 기본 테마·가상 초록 제품·보라 캡 제품을 출력해 비교(보라 primary #7F4FA6, 이용석 시제품 #7E50A5).
- #42: `npm test` 117개 통과(새 테스트: 가짜 Claude로 정상·중단 평가 실행 → 완료된 실행만 `kind: eval`로 내보내고 `eval` 필드·PNG·`--only` 확인). `npm run web:build` 통과.
- 이용석 인계 정리 (2026-10-20, Windows): `origin/main` `54465ed`에서 `npm test` 116개 통과. 문서에 적힌 파일·`npm run` 명령이 실제로 있는지 대조(없는 것 0, 일반 파일 이름 언급 제외).
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
- 웹 데이터 규격 v0.2(`cautions[].fields`)는 #33으로 병합. ZIP 생성 위치(브라우저)는 확정 필요. 수정 요청·주의 표현이 있는 예시는 톤업 선크림 첫 제작 뒤 추가.
- 평가 결과·체크리스트 규격 v0.1(`docs/eval-spec.md`)은 #24로 병합. 미결정: `eval/runs/` 커밋 여부(#29가 png·html만 제외), `copy_terms` 비교에서 띄어쓰기·대소문자 무시 여부. 집계 결과 형식은 V3 때 v0.2로 추가.
- 근거 연결률(`evidence_rate`)은 '근거 있는 카드 ÷ 전체 카드'라서, 규칙상 근거가 없어도 되는 표지·마무리 카드 때문에 실제 웹 모드 결과가 60%로 나옴. 분모를 근거 필수 카드(특징·사용법·상세)로 바꾸면 스키마가 그 카드들에 근거를 강제하므로 **검증 통과 결과는 항상 100%**가 되어 의미가 없음. 정의를 다시 정해야 함(두 사람 결정): ① 전체 카드 기준 유지 + 화면 설명 고침, ② 지표를 빼거나 다른 것(예: 문구와 연결 인용의 글자 겹침)으로 바꿈. 지금 V2 제작 과정 화면 설명('특징·사용법 문구 중')과 계산이 다름.
- 배포처(Vercel 예정)와 공개 링크 접근 제한 여부는 미정. 배포 계정 연결은 사람이 한다(설정값은 `web/README.md` '배포').
- 작업 실행기의 `claude -p` 옵션은 Mac의 Claude Code 2.1.123에서 **인자 해석까지 확인**(모르는 옵션은 `unknown option`으로 거부되는데, 실행기 옵션 전체는 통과. `--max-turns`는 도움말에 없지만 받아들임). `--tools`의 `Skill`과 `Bash(npm run render -- <ID> --card:*)` 규칙이 실제로 허용·차단되는지는 첫 실제 실행에서 확인하고, 다르면 `claudeArgs`·`allowedTools`를 고친다.
- 평가 실행기: 작업 실행기(`runJob({mode:'eval'})`)를 그대로 쓰고, 평가 결과 파일 위치·형식만 `docs/eval-spec.md`를 따름. 평가 결과 파일 위치·형식과 평가 세트 형식(`input.md` + 체크리스트)은 `docs/eval-spec.md`를 따름.
- 디자인 레퍼런스 분석·무드 방향 3개·달바 퍼플 표지 시안 3개 (이용석 제안, 결정 아님): `docs/research/design-reference-review.md`. 방향 이름·표지 비교 시점·프리셋 구현 방식·데이터 규격은 '결정 대기'에 있음
- 무드 프리셋 (이용석 제안, 결정 아님): `docs/proposals/mood-presets.md`. 브랜드 무드 6개 · 제품 유형 6개 · 인증 배지를 따로 고름. '라일락' 구현(#53)은 `프리미엄` 무드의 첫 사례로 이름을 바꿀 예정

## 다음 행동

2026-10-20 기준. 자세한 근거는 위 '이규동 요청·피드백'.

1. 이규동: ~~기본 테마 색 맞추기~~(#60) → ~~쓴 색 내보내기~~(#61) → 근거 연결률 정의(이용석과) → 시연 준비. 배포는 맨 뒤.
2. 이용석: #58 리뷰 → V2 화면 테스트 `test:render` 등록·`CHROMIUM_PATH`(#56 리뷰) → 디자인 묶음(#53, 시연 뒤 구현 범위) → 핵심 정보 포함률 범위 → v1 평가 분석·v2 규칙(글 무드), 평가 집계·V3.
3. 공동: 근거 연결률, 기본 테마 색, 쓴 색 내보내기, 평가 기본 내보내기, 규칙 버전, 제안서 #39 결정 사항, 멘토 확인.
4. 작업을 시작할 때 새 이슈를 만들고 이 문서의 '현재 작업'을 교체한다. 노션 작업 트래커의 해당 행 상태도 바꾼다.
