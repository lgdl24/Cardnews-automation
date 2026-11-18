# 개발 인수인계

프로젝트 개발을 교대할 때 실제 파일·Git 상태와 함께 확인한다. 운영 규칙은 [project-context.md](project-context.md), 카드 제작 상태·승인은 해당 제품 데이터와 제작 로그가 기준이다.

## 최근 변경 (최신이 위, 최근 10개)

다음 도구가 모르면 틀리게 작업할 규칙·용어·파일 변경만 적는다. 자세한 내용은 커밋과 PR에서 본다.

| 날짜 | 도구 | 이슈·브랜치 | 바뀐 점 |
|---|---|---|---|
| 2026-11-18 | Codex | #110 · `feat/110-instagram-publish-unified` · [PR #111](https://github.com/lgdl24/Cardnews-automation/pull/111) | 사용자 승인으로 #109를 main에 병합했어요. CLI·웹 게시 관리자/기록·프로세스 잠금·불분명 상태·예약을 통합했고 실제 게시 없이 265/31 검사·빌드를 통과했어요. 사용법은 `docs/instagram-publish.md`예요. |
| 2026-11-17 | Codex | #107 · `feat/107-instagram-caption` · [PR #109](https://github.com/lgdl24/Cardnews-automation/pull/109) | B 방식으로 승인 근거 기반의 새 게시 글 작성·별도 의미 검토를 추가했어요. 첫 줄 AI 활용·맥락별 태그, 카드/원문/규칙 변경 무효화, CLI·웹·점검 캡션 일치와 사람 재확인을 연결했어요. 편집 UI·실제 게시·예약은 실행하지 않았어요. 아래 #107 절을 확인해요. |
| 2026-11-17 | Claude | PR #91·#93·#95·#98·#99·#101·#103·#105 → `main` | **열린 PR 8개 main 병합 (이규동 결정)**: 이용석 #89·#92·#94·#97·#100, 작업실 개편 #102, 인스타 B1~B4·Unified Login(#96)·B5(#104). 입력 화면은 #92의 01 자료·브랜드 → 02 채운 내용 확인 → 03 제작 조건 구성 위에 #102의 단계별 진행·선택 항목 접기·오류 요약·임시 저장. AI 배경 패널은 #102 접기 구조 + #89 채팅 대체(요청문 복사·이미지 올리기). `render.js`는 AI 활용 메타데이터 + 브랜드 배치 둘 다, `brand.js` 배경 요청문 3종(Codex·채팅·합성) 모두 의료·약사·전문가·흰 가운 금지. 병합 뒤 main: `npm test` 245, `test:web` 30, `test:render` 17, 웹 빌드 통과 |
| 2026-11-17 | Claude | #104 · `feat/104-instagram-web-publish` (`fix/96` + #102 합침) | **작업실 인스타 수동·예약 게시(B5)**: `scripts/lib/ig-publisher.js`(상태 `products/<id>/output/instagram/ig-publish.json`, 버전 해시, 같은 버전 1회, 결과 불분명→조회 뒤 재시도, 재시작 복원, 예약 30초 확인·놓침 10분), `ig-publish-deps.js`(토큰·터널·JPEG·점검 프로세스), API `/instagram/account`·`/products/:id/instagram/*`, 화면 `PublishPanel.tsx`. 새 환경값 `IG_PUBLIC_BASE_URL`(고정 공개 주소, 나중 KT 서버)·`CARDNEWS_IG_SCHEDULE=off`(예약 확인 끔). 게시 전 점검은 작업실이 별도 프로세스로 실행(시험 폴더도 동작) |
| 2026-11-17 | Claude | #102 · `feat/102-web-studio-redesign` | **웹 UI 개편 2차**: 디자인 기준 `design-system/cardnews-studio/MASTER.md`(Pretendard 단일·포인트색 1개·상태색 6종 토큰, 기존 `--color-*`는 별칭). 작업실 목록 대표 카드·상태, 제작 진행 5단계·실제 진행/대기/실패 원인·다시 하기, 구성안·카드 검토 결정 막대, 입력 오류 요약·임시 저장(localStorage `cardnews-draft:*`, 이미지 제외). `GET /api/studio/products` 요약에 `thumb`·`png_count`·`card_count`·`last_job` 추가(읽기 전용). 새 검사 `tests/studio-flow-ui.test.js`. 인스타 웹 게시는 제안만 `docs/proposals/instagram-web-publish.md` |
| 2026-11-17 | Codex | #96 · `fix/96-instagram-unified-login` (`feat/instagram` 위), PR #99 | Unified Login·게시 권한·한도 확인 지원, Bearer 헤더와 오류 토큰 숨김. 이전 실험 이미지의 GPT 사용 표시도 검토에 반영. 게시 명령의 `check` 이름 충돌 수정, Cloudflare는 연결 등록을 기다린 뒤 DNS 전파 15초 대기. 사용자 승인 후 젤크림 5장 첫 실제 게시·캡션·순서 검증 완료. 아래 게시 링크와 기록 위치 참조 |
| 2026-11-17 | Claude | #94 · `feat/94-rules-v2` | **규칙 v2: 문제 제시 → 해결** (이용석, 11.11 멘토 피드백): `config/skill-version.json` v2. 1번 표지 제목은 원문 사용감·상황을 뒤집은 소비자 문제(뒤집은 근거 ID를 1번 `intent`·`evidence`에), 2번은 그 답, 마지막은 다시 묶음. 질환·기능성 단어를 문제로 쓰지 않고 해결 단정 금지(`docs/style-guide.md` '문제 제시 → 해결', `cardnews-content` Skill 2·3·4·5단계). 데이터 규격·검증·템플릿은 그대로라 v1과 같은 잣대로 비교. 테스트의 실행ID는 버전을 `config/skill-version.json`에서 읽음, 웹 데이터 예시 `index.json` 현재 버전 v2 |
| 2026-11-17 | Claude | #100 · `feat/100-brand-layouts` (#93·#97 위) | **브랜드 무드 배치** (이용석): `brand_mood.layout` = panel(기존 반투명 면)·editorial(면 없이 큰 영문 세리프 단어·가는 선)·immersive(어두운 장면·흰 글자 가운데). 레퍼런스마다 `layout_id`, 구성안에서 고른 레퍼런스의 배치로 출력(`templates/brand/<배치>/`). 배치별 제품 자리·배경 구도 `scripts/lib/brand.js` BRAND_LAYOUTS(panel 아니면 배경 key에 배치 포함). 새 문구 칸 `display`(영문 장식 단어, 근거 원문 단어의 영어만). 브랜드 묶음에 Pretendard Light(300) |
| 2026-11-17 | Claude | #97 · `feat/97-mood-references` | **템플릿 레퍼런스** (이용석): `config/mood-references.json` — 비슷한 무드의 뷰티 카드뉴스 템플릿 12개를 특징 글로(이미지 없음, 링크만). 사용자가 고르는 카테고리가 아님. 구성안 작업에서 브랜드 페이지 분위기와 `mood` 단어가 가까운 1~2개를 찾아 `brand_mood`의 장면·사진 연출·색 쓰는 법에 참고(색 값은 브랜드 페이지), evidence에 "레퍼런스 <id>". 설명 `docs/designs/mood-references.md`, 핀터레스트 조사 `docs/research/beauty-cardnews-pinterest.md`, 검사 `tests/mood-references.test.js` |
| 2026-11-13 | Claude | `feat/instagram` (`feat/ax-compliance` 위) | **인스타 연동 B1~B4 (실계정 시험 전)**: `npm run ig -- check`(토큰으로 계정·24시간 한도) · `prepare <id>`(캡션 `output/instagram/caption.txt` — 카드 문구만, 첫 줄 AI 활용·샘플 표시 / JPEG 변환, PNG의 AI 활용 XMP를 JPEG APP1로) · `publish <id> [--dry-run] [--base-url]`(게시 전 점검 '게시 가능'만 → 비밀 경로 파일 서버 + `cloudflared` 빠른 터널 → 카드별 컨테이너 → 캐러셀 → 게시 → `published.json`·`published` 이벤트) · `refresh-token`(.env의 토큰 줄만 교체). 토큰은 `.env`의 `IG_ACCESS_TOKEN`, 출력·오류 메시지에 안 나옴. 설정 `config/instagram.json`(API v27.0). 이벤트 규격 v0.4. 다음: 실계정 첫 게시 → 작업실 '게시' 패널(B5) → 성과 수집(C) |

## 현재 작업 — CLI·웹 게시 기록 통합 #110 (Codex, 2026-11-18)

- 사용자 승인으로 PR #109를 main에 병합했어요(`e27141d`). 인터넷 중단 후 원격 병합·작업 폴더를 대조했고 변경 유실은 없었어요. #107 캡션 개선은 main 반영 완료예요.
- 이슈는 [#110](https://github.com/lgdl24/Cardnews-automation/issues/110), 브랜치는 `feat/110-instagram-publish-unified`, 기준은 `origin/main`의 `e27141d`예요. 원래 실험 폴더는 수정하지 않았어요. [PR #111](https://github.com/lgdl24/Cardnews-automation/pull/111)을 main 대상으로 열었고 구현 커밋은 `92bdadb`예요.
- 완료한 변경은 `scripts/lib/ig-publish-lock.js`·`ig-cli-publisher.js`, 공통 `ig-publisher.js`, CLI 명령·웹 출처 표시예요. CLI도 `ig-publish.json`의 관리자·버전·사람 확인·예약·기록을 사용해요. PID 기반 참가 파일로 서로 다른 프로세스의 게시·상태 수정을 직렬화하고, 살아 있는 실행은 복구가 덮어쓰지 않아요.
- CLI는 먼저 `publish <제품ID> --dry-run`으로 캡션·점검·버전을 확인해요. 실제 게시는 `--version <버전> --confirm`으로 그 버전의 사람 확인을 명시해요. `verify <제품ID>`는 공통 기록의 불분명 결과·링크만 조회해요. CLI는 예약 타이머를 시작하지 않아요.
- 게시 요청 당시의 캡션 전체를 보존해 공통 AI 첫 줄만으로 다른 게시물을 고르지 않아요. 목록 지연·여러 후보 등으로 확정할 수 없으면 확인 필요를 유지해요. media_id가 있으면 링크 확인 중 종료돼도 게시 완료로 복구해요. 완료 기록과 제작 로그 사이의 중단은 같은 media_id 이벤트를 중복 없이 보완해요. 손상된 기록은 빈 기록으로 대체하지 않아요.
- 검사 결과는 `npm test` 265개·`npm run test:web` 31개·`npm --prefix web run build` 통과예요. CLI↔웹 양방향, 실제 별도 Node 프로세스 동시 실행·SIGKILL, 예약 경합, 이전 기록, dry-run, 제작 로그 중단·손상, 게시물 오인·누락 응답을 가짜 API·임시 제품으로 확인했어요.
- [공통 게시 사용법](instagram-publish.md)에 명령·복구·적용 범위를 적었어요. 같은 PC·같은 실제 제품 폴더를 쓰는 새 버전끼리 공유해요. 이전 버전의 게시가 끝난 뒤 기존 CLI·작업실을 모두 종료하고 새 버전으로 실행해야 해요.
- 실제 제품·인스타 게시·예약·토큰 갱신은 실행하지 않았어요. 시험 프로세스·브라우저는 종료했고 앱 서버는 열지 않았어요. KT 서버·성과 수집·캡션 편집 UI는 이번 범위 밖이에요.
- 커밋·push·main 대상 PR #111 등록을 마쳤어요. 다음은 사용자 리뷰·병합 결정이에요. 병합 후 CLI·웹을 모두 새 버전으로 다시 실행해요. 실제 계정 새 게시 1회는 별도 승인 뒤 진행해요. 노션 트래커의 최신 작업 동기화도 남아 있어요.

## 현재 작업 — 인스타 캡션 개선 #107 (Codex, 2026-11-17)

- PR은 [#109](https://github.com/lgdl24/Cardnews-automation/pull/109)이고 대상은 main이에요. 구현 커밋은 `54443eb`이며 브랜치는 `feat/107-instagram-caption`, 시작 기준은 `origin/main` `a080a36`이에요. 병합은 사용자가 결정해요.

- 사용자 결정은 **B 방식**이에요. 같은 정보를 나열하는 대신 승인 카드·원문 근거로 새 문장을 작성해요. 캡션 편집 UI는 다른 담당 영역이어서 만들지 않아요. AI 활용 표시는 첫 줄에 유지해요.
- 브랜치는 `feat/107-instagram-caption`이고 기준은 `origin/main`의 `a080a36`이에요. 기존 `fix/96`은 main 병합된 상태로 보존했어요. 원래 `/Users/lee/git/Cardnews-automation`의 실험 변경은 수정하지 않았어요. PR #109는 사용자 승인으로 main에 병합됐어요.
- 구현은 `scripts/lib/ig-caption-writer.js`·`ig-caption-draft.js`, `prompts/instagram-caption.md`예요. `npm run ig -- caption <제품ID> [--force]`와 `prepare`에서 작성해요. 최종 승인 자료만 받고 Claude 작성→구조/근거 ID/수치/주의 표현 검사→별도 Claude 의미 검토 뒤 `output/instagram/caption-draft.json`·`caption.txt`를 저장해요. 실패 시 기존 카드 나열 글로 대체하지 않아요.
- CLI·작업실·게시 전 점검이 같은 작성본을 읽어요. 웹 조회·실제 게시 순간에는 모델을 실행하지 않아요. 카드/원문/캡션 설정/작성 지시 변경은 작성본을 무효로 해요. 캡션 변경은 기존 게시 버전·점검·사람 확인을 다시 요구해요. 새 ‘게시 글 근거·말투 확인’은 사람이 확인해요. 카드 생성·평가 v2와 별도로 `caption-v1`을 관리해요.
- 실제 Claude 첫 호출은 OAuth 만료로 중단됐고 사용자가 재로그인했어요. 이후 젤크림·평가용 가상 제품의 임시 사본에서 작성·별도 의미 검토 성공을 확인했어요. 최종 작성 지시로 두 제품을 다시 작성·검토했고 실제 출력 전후 예시를 문서·픽스처에 기록했어요. 원래 제품 상태·로그·이미지는 보존했어요. 실제 게시·예약·토큰 갱신은 실행하지 않았어요.
- 검사 중 최신 main 의존성의 글꼴 누락·원래 폴더를 향한 글꼴 링크를 발견해 이 worktree의 루트·web에서 잠금 파일대로 `npm ci` 했어요. 이후 `npm test` 252개·`npm run test:web` 30개·웹 빌드가 통과했어요. 최종 작성 지시·실제 예시를 반영한 검사도 같은 결과로 통과했어요. 원문만 바뀐 뒤 동일한 캡션을 다시 생성해도 사람 확인 버전이 바뀌는 회귀 검사를 추가했어요.
- [사용법·전후 예시](instagram-caption.md)에 실제 모델 출력과 시험 자료의 출처를 적었어요. 추가 검사는 `tests/ig-caption.test.js`·`tests/ig-publisher.test.js`와 CLI·기존 표시 전용 게시 패널 검사예요. 실제 제품 대신 임시 사본·가짜 게시 API를 사용해요.
- 남은 범위는 새 버전 실제 게시 1회(사용자 승인 뒤), CLI publish·작업실 게시 기록 통합, KT 고정 주소·서버 예약, 노션 트래커 #102·#104·#107 행이에요. 이번 작업에서는 진행하지 않아요.
- 구현·검증·커밋·push·main 대상 PR 등록을 마쳤어요. 다음은 사용자가 #109를 리뷰·병합 결정한 뒤 승인된 범위만 이어가요. 실제 게시·예약은 이번에 실행하지 않았어요. 실행한 모델·검사 프로세스는 끝났고 이 작업에서 앱 서버·게시 대기는 시작하지 않았어요.

## 현재 작업 — 11.17 main 병합·정리 (Claude, 2026-11-17)

- 요청(이규동): 깃허브에 올라온 PR 중 병합할 수 있는 것은 병합, 필요 없는 파일 정리. 이 맥의 GitHub 계정 `lgdl24`가 저장소 관리자.
- 병합(모두 merge 커밋, 강제 push 없음): #93(→ #91 함께 반영) · #101(→ #98 함께 반영) · #95 · #103 · #105(→ #99 함께 반영). 쌓인 PR은 대상 브랜치를 `main`으로 바꾼 뒤 병합. #99는 초안 해제. 관련 이슈 #89·#92·#94·#96·#97·#100·#102·#104 닫힘. 열린 PR 0.
- 충돌 처리: `docs/handoff.md` 최근 변경 표는 양쪽 줄 유지(#95는 `feat/94-rules-v2`에 main을 합치는 커밋을 올림). #103은 입력 화면·작업실 상세에서 #92·#89와 겹쳐 두 변경을 합침(최근 변경 표 참고, `.btn.btn-small.file-btn` 작은 버튼 모양 추가, 자료로 채우기는 01 단계 안). #105는 `package.json`·`scripts/render.js`·`scripts/lib/brand.js`·`docs/style-guide.md` 충돌을 양쪽 기능 모두 남기게 해결.
- 정리: 병합된 작업 폴더 `cardnews-web-ui` 삭제, 이미 지워진 `/private/tmp/cardnews-ui-pr` 기록 정리. main에 이미 들어간 로컬 브랜치 37개 삭제(main에 없는 `feat/3-agent-sdk-poc`·`feat/claude-design-test`·`feat/web-ux-main`·`feat/web-ux-refresh`는 남김), 로컬 `main`을 `origin/main`으로 맞춤. 원격 `feat/102-web-studio-redesign`·`feat/104-instagram-web-publish`·`feat/instagram`·`feat/ax-compliance` 삭제(병합됨, PR 화면에서 복구 가능). 이용석 원격 브랜치와 `fix/96`(Codex 작업 폴더가 추적)·`fix/eval-run`(평가 폴더)은 그대로. 저장소 밖 캡처 폴더는 화면만 남김(`/Users/lee/git/cardnews-web-ui-captures/{before,after,e2e,e2e-ig,ig}`).
- 건드리지 않음: 원래 폴더 `/Users/lee/git/Cardnews-automation`(`experiment/gpt-all-cards`, 미커밋 변경), Codex 인스타 작업 폴더, `cardnews-ai`(평가 실행 결과), `cardnews-figma`, `~/git`의 `*.bundle`·`repository`(출처 확인 필요).
- 시험 서버: `/Users/lee/git/cardnews-ig-web`(main 기준)에서 `cd web && CARDNEWS_STUDIO_SANDBOX=/Users/lee/git/cardnews-studio-test ./node_modules/.bin/vite --port 5173 --strictPort --host 127.0.0.1` → http://127.0.0.1:5173/studio. 제품은 복사본(젤크림은 CLI로 이미 게시해 같은 버전 재게시 막힘 + PNG에 AI 활용 메타데이터 없음, 123은 문구 단계). `npm run studio -- --port …`는 npm이 옵션을 vite에 넘기지 못해 루트가 잘못 잡힘. 끄기 `lsof -ti tcp:5173 | xargs kill`. **11.17 Codex로 넘기며 서버는 종료함**(시험 폴더 `cardnews-studio-test`·작업 폴더 `cardnews-ig-web`은 실제 게시 시험용으로 남김, 다 쓰면 삭제 가능).
- 남은 일: ① 인스타 실제 게시 1회(새 버전 필요: 시험 폴더에서 다시 출력 → 최종 승인 → 게시, 사용자 승인 뒤) ② CLI `npm run ig -- publish`가 작업실 게시 기록(`ig-publish.json`)을 보게 통합 ③ KT 서버 고정 주소·서버 예약 실행 ④ 노션 작업 트래커 #102·#104 행(노션 쓰기 권한 필요).

## 현재 작업 — 작업실 인스타 수동·예약 게시 B5 (Claude, 2026-11-17)

- 이슈·브랜치·폴더: [#104](https://github.com/lgdl24/Cardnews-automation/issues/104), `feat/104-instagram-web-publish`, `/Users/lee/git/cardnews-ig-web`. 기반 `origin/fix/96-instagram-unified-login`(`2591330`) + `feat/102-web-studio-redesign` 합침(충돌: 작업실 상세 화면은 개편본 사용, 기존 게시 전 점검 패널은 새 게시 패널 안으로). PR [#105](https://github.com/lgdl24/Cardnews-automation/pull/105) — **11.17 main 병합**(대상을 `main`으로 바꾸고 main을 합친 뒤). 브랜치는 삭제, 폴더는 main 기준 시험 서버용으로 남김.
- 사용자 결정(11.17): 캡션 수정은 다른 담당(보여주기만) · 확인 창만 · 지금은 임시 터널, 다음에 KT 서버 · 수동+예약 게시 · 시험 계정 `@glowif_lab`.
- 구현: `scripts/lib/ig-publisher.js`, `scripts/lib/ig-publish-deps.js`, `scripts/lib/studio-api.js`(게시 관리자 연결·경로·목록 요약), `web/src/screens/studio/PublishPanel.tsx`, `web/src/studio/api.ts`, `studio.css`, 목록 타일 표시. CLI `npm run ig -- publish`는 그대로(같은 버전 잠금은 작업실 경로에만 있음 → CLI와 함께 쓰면 중복 가능. 통합은 다음 작업).
- 동작 기준: 최종 승인 + 점검에 고쳐야 함·아직 0 + '사람 확인' 체크(그 버전에만 유효) → 게시. 게시는 작업실 전체에서 하나씩. media_publish를 보낸 뒤 끊기면 '확인 필요' → '인스타에서 게시 여부 확인'(최근 게시물 캡션·시각 대조)으로 완료 또는 실패 처리. 링크만 못 받으면 게시 완료로 기록. 재시작 시 진행 중이던 게시는 이어 하지 않음. 예약은 30초마다 확인, 시각 뒤 10분 안이면 실행, 넘으면 '놓침'.
- 검증(11.17): `npm test` 236/236(+ `tests/ig-publisher.test.js` 9개: 지금 게시·동시 실행·같은 버전·사람 확인·버전 변경·링크 실패·연결 끊김 확인·재시작·예약 실행/취소/놓침/막힘·계정·API 경로·쓰기 헤더), `npm run test:web` 30/30(+ `tests/studio-publish-ui.test.js` 3개), `web:build` 통과. 실제 작업실 서버 + 가짜 Claude 시험 폴더로 승인까지 만든 뒤 게시 패널에서 실제 계정 조회(`@glowif_lab`, 한도 1/100)·점검 실행 확인 — 시험 카드는 AI 표시 메타데이터가 없어 게시가 막힘(정상). **실제 게시는 하지 않음.**
- `.env`: 이 폴더의 `.env`는 원래 폴더 `.env`로의 심볼릭 링크(git 제외). 값은 문서·로그에 넣지 않음.
- 남은 일: ① 사용자 승인 뒤 실제 게시 1회(이미 게시한 젤크림이 아닌 새 승인본, 또는 같은 제품 새 버전)로 터널·캐러셀·링크 확인 ② CLI `publish`도 게시 관리자를 쓰게 통합(중복 잠금 공유) ③ KT 서버 고정 주소로 옮길 때 파일 올리기 단계 추가, 서버에서 예약 실행 ④ 노션 작업 트래커에 #102·#104 행 추가(이 세션은 노션 쓰기 권한 거부).

## 현재 작업 — 웹 UI·UX 개편 2차 (Claude, 2026-11-17)

- 요청: UI/UX Pro Max로 작업실 디자인·UX 개선(젊은 산세리프, 밝게/어둡게, 카드 중심 검토, 간결한 입력·승인 동선, 실제 진행·대기·실패 표시) → 검증 → 인스타 웹 게시 후속 설계 제안. 지시: `docs/web-design-claude-brief.md`.
- 이슈·작업 폴더·브랜치: [#102](https://github.com/lgdl24/Cardnews-automation/issues/102), `/Users/lee/git/cardnews-web-ui`, `feat/102-web-studio-redesign`, 기준 `origin/main` `eaee2e4`. **11.17 PR #103 main 병합**, 작업 폴더·브랜치 삭제. PR 리뷰 이용석(`dldydtjr0450`), 병합은 이규동. 이 맥에는 `gh`를 brew로 설치했고 GitHub 로그인은 git 키체인 값을 `GH_TOKEN`으로 넘겨 씀(토큰에 `read:org`가 없어 `gh auth login`·일부 GraphQL은 실패 → `gh api` REST 사용). 이슈 생성 전 커밋이라 커밋 메시지에는 `#102`가 없음.
- 원래 폴더 `/Users/lee/git/Cardnews-automation`(`experiment/gpt-all-cards`)의 미커밋 변경은 건드리지 않음. 그 폴더의 로컬 준비 파일 중 `.claude/skills/ui-ux-pro-max/`, `docs/web-design-claude-brief.md`, `docs/prompts/claude-web-redesign.md`만 복사해 첫 커밋. 그 폴더의 11.17 Codex 인계 기록(인스타 첫 게시 등)은 원래 폴더 `docs/handoff.md`에만 있음.
- 커밋: `3f86bd4` 스킬·지시 / `7bcb342` 토큰·서체·틀 / `fac88f7` 작업실 화면·API 요약 / `f80b238` 검사 / `186a9aa` 진행 위치 이동·시간 표기 / 8e9764a 인계·제안 문서.
- 바뀐 파일: `web/src/styles/{global,workspace}.css`, `web/src/components/{components.css,Header,ThemeControl,Icon}.tsx`, `web/src/screens/studio/*`, 새 `web/src/studio/status.ts`, `web/src/studio/api.ts`(요약 타입·연결 끊김 5초 재시도), `scripts/lib/studio-api.js`(목록 요약 필드만), 라이브러리·가이드·비교·평가 화면의 영문 장식 라벨, `tests/{studio-flow-ui,workspace-ui,studio-api}.test.js`, `package.json` test:web.
- 완료: 위 1차 범위 전체. 카드 템플릿·`config/`·제작 규칙·평가 조건·규칙 버전은 바꾸지 않음. 퍼센트·예상 시간·실행 중 작업 취소 버튼 없음(대기 취소는 기존 API).
- 검증(11.17): `npm test` 209/209, `npm run web:build`(타입 포함) 통과, `npm run test:web` 27/27(새 8개: 목록 상태·진행·대기·실패 다시 하기·수정 요청 재전송·구성안 검토·카드 검토 키보드/전체 흐름·입력 오류 요약/임시 저장, 375/768/1024/1440 가로 넘침). 실제 작업실 API + 가짜 Claude(`tests/fixtures/fake-claude.js`, AI 카드·배경 off, 임시 sandbox)로 입력→구성안→구성안 수정→승인→카드 검토→카드 수정→최종 승인→내보내기를 브라우저로 끝까지 확인, 화면 오류 0. 실제 Claude·Codex·인스타 API·실제 `products/`는 쓰지 않음. 출력·calibrate는 템플릿 미변경이라 실행 안 함.
- 전후 화면: `/Users/lee/git/cardnews-web-ui-captures/{before,after,e2e}/`(저장소 밖). after는 `CARDNEWS_UI_CAPTURE_DIR=… npm run test:web`로 다시 만들 수 있음.
- 발견·수정: 모션 감소 설정에서 `transition-duration`만 줄이면 기본 `transition-property: all` 때문에 화면 폭이 순간 전환돼 넘침 검사가 실패 → 전환 자체를 끔. 스튜디오 CSS가 전역보다 먼저 번들되므로 공통 부품(예: `.spinner-xs`)은 `components.css`에 둘 것. `.detail-head`는 결과 보기 상세가 쓰므로 작업실은 `.studio-detail-head`.
- 미완료·확인 필요: 실제 Claude로 한 번 사용해 보며 문구·순서 의견 받기, 노션 작업 트래커 갱신, 공동 UI 파일이라 양쪽 화면 담당 리뷰. 평가 대시보드는 토큰만 따라가고 구조는 그대로.
- 실행 중 작업: 없음(검사용 임시 서버는 모두 종료).
- 다음: ① PR 리뷰 반영·노션 작업 트래커에 #102 행 추가(이번 세션에서 노션 쓰기 권한 거부됨) ② `docs/proposals/instagram-web-publish.md`의 결정 5가지 확인 ③ 결정 뒤 인스타 브랜치 통합(게시 전 점검 패널을 새 접기 패널 구조로)과 B5 서버 상태·중복 방지부터 구현.

## 현재 작업 — 인스타 Unified Login 연결 (Codex, 2026-11-17)

- PR [#99](https://github.com/lgdl24/Cardnews-automation/pull/99)는 11.17 #105와 함께 main에 병합됐다(기반이던 `feat/instagram`도 포함). 첫 실제 게시 검증을 완료했다. 메인 반영과 작업실 게시 패널(B5)·성과 수집(C)이 다음 작업이다.
- 이슈 #96, 기반 `feat/instagram`의 `0630788`, 작업 브랜치 `fix/96-instagram-unified-login`. 작업 폴더 `/Users/lee/.codex/.chatgpt-projects/g-p-6abb113ccf84819189f417d059c9233f/worktrees/cardnews-instagram`. 원래 `/Users/lee/git/Cardnews-automation`의 실험 변경은 별도 상태다.
- 사용자가 원래 폴더의 `.env`에 토큰·계정 ID를 입력했다. `IG_API_SETUP=unified`를 추가했고, 개발 폴더는 원래 `.env`를 참조한다. 값은 문서·로그·커밋에 넣지 않는다.
- 완료한 연결 확인은 `npm run ig -- check`의 `@cardnews_auto_lab` 계정 조회, 게시 권한 2개 승인, 한도 0/100건이다. 토큰과 계정 ID 일치도 확인했다. `prepare`·`publish`가 같은 계정 선택을 사용한다.
- 검증은 전체 `npm test` 227개, 그중 인스타·게시 전 점검 16개 통과. 실제 명령의 이름 충돌은 모의 API를 사용한 `publish` 전체 흐름 회귀 검사로 보강했다. 터널 주소 안내만으로 준비 완료로 판단하지 않고 연결 등록까지 기다리며, DNS 첫 조회 전 15초를 둔다. HTTP 확인에도 10초 제한을 둔다.
- 사용자가 준비한 젤크림 5장·캡션의 공개 테스트 게시를 승인했다. `https://www.instagram.com/p/Df024mWj53J/`, `media_id=17871458706663424`. Meta API에서 캐러셀 5장·캡션 일치·한도 1/100을 확인했고, 실제 게시 이미지와 준비 JPEG를 비교해 1→2→3→4→5 순서를 확인했다.
- 기존 PNG의 AI 활용 XMP 누락은 게시 준비 복사본에 보완했다. 원래 제품의 `cards.json`·PNG 5장 해시는 동일함을 확인했다. 실제 게시에 쓴 JPEG·캡션·`published.json`·`verification.json`은 `/Users/lee/git/Cardnews-automation/products/refreshing-gel-cream/output/instagram`에 저장했고, 원래 제품 `log.jsonl`에도 `published` 이벤트를 기록했다. AI 카드 보고서의 개별 검토 플래그는 별도 상태다.
- 작업 폴더는 `/Users/lee/.codex/.chatgpt-projects/g-p-6abb113ccf84819189f417d059c9233f/worktrees/cardnews-instagram`, 게시 준비 복사본은 `/private/tmp/cardnews-ig-dryrun-m3fqs6bj/products/refreshing-gel-cream/output/instagram`이다. 게시용 이미지 서버와 Cloudflare 터널은 종료했다. 다음 행동은 PR 검토·메인 통합, 작업실 게시 패널·중복 게시 방지·예약, 성과 수집이다. 노션 작업 트래커 갱신 필요.

## 이전 작업 — 브랜드 무드 (이용석, 2026-11-05)

- 목표: 카테고리·무드를 고르는 대신 브랜드 URL + 제품 자료만 넣으면 상세페이지 무드를 읽고 GPT가 카드 배경을 만드는 흐름 (A안: GPT는 배경만, 글자는 코드). 이용석·이규동 구두 합의, 제안 #87.
- 브랜치 `feat/89-brand-mood`: #85(`fix/84-studio-usability`, Windows claude·codex 찾기) 위에 쌓음. #85를 먼저 병합해야 Windows에서 AI 배경이 돌아감.
- 확인: npm test 203 · test:web 14 · test:render 17 · web:build 통과, `calibrate --design 브랜드 --check` 실패 0. 실제로 확인한 것: biodance.com 스냅샷(화면 4장·색·글꼴), 자료로 채우기(글 파일 → 원문 그대로, 지시문 경고), 구성안 작업의 brand_mood(아래), GPT 배경 1장(Windows codex) → 출력.
- 미확인·남은 일: GPT 사용량 한도로 배경 5장 중 4장은 못 만듦(한도 풀리면 `npm run ai-bg`). 배경 속 글자 섞임 자동 검사 없음(사람이 확인). 묶음 미리보기 PNG 없음. 노션 트래커 갱신.

## 현재 작업 — 웹 UI·UX 개편 (Codex, 2026-11-03)

- 사용자 요청: 디자인·색상·UX 흐름 개선, 필요한 페이지 구현, 다크모드 추가.
- 상태: 사용자 요청으로 PR 게시·병합 진행. 최신 `origin/main`에 UI 커밋을 적용해 피그마 연동·AI 카드·AI 작업 시간 변경을 보존. 별도 이슈 생성은 수행하지 않음.
- PR 브랜치: `feat/web-ux-main`, 최신 `origin/main`(`efe9be5`) 기반. 원래 폴더 `feat/web-ux-refresh`의 UI 커밋 `3818028`만 옮김. 별도 작업 폴더 `/private/tmp/cardnews-ui-pr`에서 통합·검증. 원래 폴더의 제품·스크립트 미저장 변경은 보존.
- 주요 변경: `web/src/components/Header.tsx`, 새 `ThemeControl.tsx`·`Icon.tsx`, `styles/global.css`·`workspace.css`, 라이브러리·작업실·입력·검토·평가·비교 화면, 새 `/guide`. `web/README.md`·`docs/web-ux.md`, `tests/workspace-ui.test.js`와 `package.json`의 `test:web` 등록.
- 검증: 최신 main 통합본에서 `npm test` 190개, `npm run test:web` 14개 모두 통과. `npm run web:build`(타입 검사 포함) 통과. 실제 제작/평가/API 저장은 호출하지 않고 모의 응답으로 검사. 320/390px·1440px, 밝게/어둡게 화면 확인.
- 시작 전부터 있던 미커밋 변경을 보존: `config/export.json`, `scripts/check-input.js`, `products/test-injection-r1/cards.json`·`log.jsonl`, `web/public/data/index.json` 및 새 제품·내보내기 폴더들. 이번 UI 변경으로 간주하거나 함께 커밋하지 말 것.
- 실행 중인 미리보기: `npm --prefix web run dev -- --port 5193`, http://127.0.0.1:5193/ (현재 도구 실행 세션 71330). 종료는 해당 실행에서 Ctrl+C. 실제 제작·승인 버튼은 점검 중 누르지 않음.
- 새 테마 선택은 브라우저 `cardnews-theme`에 저장(카드 PNG 색상에는 영향 없음). 입력 이탈 경고는 자료 자동 저장을 뜻하지 않음. 평가 숫자는 내보낸 평가 결과에 한정하며 전체 실행 성공률로 해석하지 않음.
- 다음: 검증된 통합본 PR 게시·병합(사용자 요청). 노션 작업 트래커 갱신 필요. 평가 집계의 추가 지표는 데이터 규격과 연결된 뒤 보완. 원래 미리보기는 이전 작업 브랜치 기반이며 최신 통합본과 구분.

## 현재 작업 (이용석, 2026-10-26)

- #69: #68 병합(main `2d90582`) 뒤 정리본을 main을 합치는 새 커밋으로 반영. force push 없음. 리뷰 이규동.
- 검증: npm test 157·test:render 10·test:web 8, calibrate --check 기본·프리미엄 통과. 예전·새 입력의 표지 HTML·카드 색 일치 테스트 포함.
- 확인 필요: 예전 '디자인' 입력 호환 방식(#68 댓글로 이규동에게 물음). 웹 Vite 7.3.6 설치 감사 high 1건은 이규동 쪽 별도 확인(이번 의존성 변경 없음).
- 다음: 퍼플 프리미엄 실제 제작(10.28 시연). 핵심 정보 포함률은 평가 실행기(`eval-runner.js`)에 이미 계산이 있어 남은 범위(제품 `quality.json` 추가 여부) 확인. #66은 이규동 답변 대기.

## 현재 작업 (이규동, 2026-10-26)

- 확인일·작성 도구: 2026-10-26 · Claude.
- 10.26 `main` 병합: #68(이규동, #67), #69·#71(이용석). 이슈 #67·#70 닫힘.
- 이슈·PR: [#72](https://github.com/lgdl24/Cardnews-automation/issues/72) 시연 백업 결과 웹 추가. 리뷰 이용석. **`main` 병합은 이규동.**
- 상태: export → web:build → check:web 오류 0. 10.28 멘토 시연 준비 중(노션 '시연 시나리오 (10.28)').
- 작업 브랜치: `feat/72-demo-backup` · 기준 `main`(`d908157`).
- 변경 파일: `config/export.json`, `products/demo-cleansing-oil/`(입력·사진·cards.json·log.jsonl), `web/public/data/`, 이 문서.
- 커밋 안 함(이 PC 로컬 시험): `products/213/`, `products/test-injection-r1/` 수정(작업실 수정 요청 시험), `products/toneup-web/`.
- 다음: 디자인 묶음 목록·자동 추천 설계(이슈 예정, #53 이용석 제안과 합침). GPT 디자인 시안 10종은 이규동이 뽑는 중(내부 참고용, 저장소에 안 올림).
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
