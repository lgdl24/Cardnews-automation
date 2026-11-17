# 제안: 작업실 인스타 수동 게시 패널 (B5) — 후속 설계

작성 2026-11-17 · Claude Code · 상태: **결정 완료 → 구현 [#104](https://github.com/lgdl24/Cardnews-automation/issues/104)** (`feat/104-instagram-web-publish`). 실제 게시·프로필 변경·토큰 갱신·이미지 재생성은 하지 않았다.

## 0. 정한 것 (2026-11-17, 이규동)

| 항목 | 결정 | 구현 |
|---|---|---|
| 캡션 편집 | 다른 담당 영역 | 이번에는 자동 캡션을 보여주기만. 캡션이 바뀌면 버전이 바뀌므로 나중에 편집 기능이 들어와도 점검·확인을 다시 거침 |
| 게시 확인 | 확인 창만 | 지금 게시·예약 모두 확인 창(계정·장수·캡션 첫 줄·되돌릴 수 없음) |
| 공개 주소 | 지금은 임시 터널, 다음에 KT 서버 | 기본 cloudflared 임시 터널. `.env`의 `IG_PUBLIC_BASE_URL`이 있으면 그 고정 주소 사용(파일을 서버에 올리는 일은 KT 서버 작업) |
| 범위 | 수동 게시 + 예약 게시 | 둘 다 구현. 예약은 작업실 서버가 시각에 실행(인스타 API에 예약 기능 없음) → 그 시각에 맥·작업실이 켜져 있어야 함. 꺼져 있다가 10분 넘게 지나면 자동 게시하지 않고 사람 확인 |
| 시험 계정 | 현재 연결 계정 | `npm run ig -- check`로 `@glowif_lab`(Unified Login), 게시 권한 2개, 한도 1/100 확인(11.17, 읽기 전용) |

## 1. 지금 있는 것 (확인한 코드)

| 위치 | 상태 |
|---|---|
| `main` (`eaee2e4`) + 이번 웹 개편 | 게시 관련 코드 없음. 작업실은 최종 승인 → 결과 보기 웹 내보내기까지 |
| `fix/96-instagram-unified-login` (`2591330`, PR #99 Draft, 기반 `feat/ax-compliance → feat/instagram`) | A1~A4 게시 전 점검(`scripts/lib/publish-check.js`, `GET /api/studio/products/:id/precheck`, 작업실 점검 패널), B0~B4 `npm run ig -- check \| prepare \| publish [--dry-run]`: 캡션(`ig-caption.js`)·JPEG+AI XMP(`ig-media.js`)·임시 공개 주소(cloudflared, `public-url.js`)·캐러셀 게시·`published.json`·제작 로그 `published` |
| 실제 검증 | 11.17 젤크림 5장 첫 게시 성공(캐러셀 순서·캡션 일치). 게시는 터미널 명령. 웹 게시 버튼(B5)·예약·성과 수집(C)은 없음 |

현재 `publish()`의 한계(웹으로 옮기기 전에 보완 필요):
- 게시 요청·진행 상태가 **메모리·콘솔에만** 있고, 끝난 뒤 `published.json`만 남는다 → 새로고침·서버 재시작 때 진행 중 상태를 복원할 수 없다.
- 같은 콘텐츠의 **중복 게시 방지**가 없다. `post.json`의 `key`(PNG+캡션 해시)는 있지만 게시 전에 이전 게시와 비교하지 않는다.
- `media_publish` 성공 뒤 `permalink` 조회가 실패하면 전체가 예외로 끝나 **이미 게시된 것을 실패로 보고 다시 게시**할 위험이 있다.
- 점검(`publish-check.json`)과 게시가 **같은 버전인지** 묶여 있지 않다(점검 뒤 카드·캡션이 바뀌어도 알 수 없음).

## 2. 제안 흐름

```
최종 승인 ─▶ ① 게시 준비(미리보기) ─▶ ② 게시 전 점검 + 사람 확인 ─▶ ③ 공개 게시 버튼(명시적 확인) ─▶ ④ 실제 진행 상태 ─▶ ⑤ 게시 링크
               계정·5장·캡션            [주의]·GPT 이미지 확인 체크          대화상자에 계정·장수·첫 줄       컨테이너 n/5 · 캐러셀 · 게시      permalink·media_id
```

| 단계 | 화면(작업실 `/studio/:id`, 승인 완료 뒤 '게시' 접기 패널) | 서버 |
|---|---|---|
| ① 준비 | 연결 계정(@이름·한도 n/100), JPEG 5장 순서 미리보기, 캡션 전문 | `POST /products/:id/ig/prepare` → 기존 `prepare()`. 결과에 `version`(아래 4) |
| ② 점검 | 기존 점검표(pass/warn/fail/todo). warn 항목마다 "확인했어요" 체크(사람 확인), fail·todo가 있으면 게시 버튼 비활성 + 이유 | `GET /products/:id/precheck` + 확인 기록 `POST .../ig/ack` (누가·언제·어느 version) |
| ③ 게시 | 버튼 "인스타에 공개 게시"(주 행동 색, 승인 버튼과 다른 위치). 대화상자: 계정·장수·캡션 첫 줄·"되돌릴 수 없어요". 확인 입력 후 요청 | `POST /products/:id/ig/publish { version }` → 202 + 게시 요청 기록 |
| ④ 진행 | 실제 단계만: 공개 주소 준비 → 이미지 컨테이너 k/5 → 캐러셀 → 게시 → 링크 확인. 경과 시간·마지막 활동. 퍼센트·예상 시간·취소 없음 | 단계마다 `ig-publish.json` 갱신 |
| ⑤ 결과 | 성공: permalink·게시 시각·같은 버전 재게시 잠금. 실패: 원인 설명(토큰 만료 190, 권한 10/200, 한도, 이미지 가져오기 실패 2207052…)과 다시 하는 법 | `explain()` 재사용 |

## 3. 상태 저장·복원·중복 방지

`products/<id>/output/instagram/ig-publish.json` (제품 폴더, git 제외 출력):

```json
{ "request_id": "…", "version": "<hash>", "state": "requested|preparing_url|uploading|publishing|published|failed|unknown",
  "account": "cardnews_auto_lab", "containers": ["…"], "creation_id": "…", "media_id": "…", "permalink": "…",
  "error": { "code": 190, "message": "…" }, "updated_at": "…" }
```

- 작업실 서버 시작 시 `state`가 진행 중(`requested~publishing`)이면 **자동 재시작하지 않고 `unknown`으로 바꾼 뒤** "게시 여부 확인" 버튼만 보여준다.
- 같은 `version`이 `published`면 게시 버튼을 잠근다. 다른 버전을 다시 올리는 건 새 게시물이며 별도 확인을 받는다.
- 한 번에 하나: 기존 작업 대기열과 별개로 **제품당 게시 잠금**(파일 잠금 + 메모리). 버튼 연타·두 창 동시 요청은 409.
- 통신이 끊기거나 결과가 불분명하면(`media_publish` 응답 유실, permalink 조회 실패): `creation_id`/`media_id`로 상태를 **조회한 뒤** 게시됐으면 `published`, 아니면 `failed`. **조회 전에는 재시도 버튼을 열지 않는다.** `media_publish` 성공 뒤 permalink만 실패한 경우는 `published` + "링크 다시 확인".
- 제작 로그 `published` 이벤트는 `published`가 확정된 한 번만 남긴다(지금 CLI와 같음).

## 4. 버전·해시 묶기

`version = sha1(최종 승인 이벤트 ts + cards.json 문구 + PNG 5장 바이트 + JPEG 순서 + 캡션 텍스트)`.
- 점검 결과·사람 확인·게시 요청은 모두 이 `version`을 갖는다. 화면을 연 뒤 카드 재출력·캡션 수정·AI 카드 교체가 있으면 version이 달라져 **점검부터 다시** 하게 한다.
- 최종 승인 이후 카드가 바뀌면(재승인 필요) 게시 불가.

## 5. (참고) 처음 제안한 결정 항목

1. **캡션 편집 허용 여부** — (가) 자동 캡션 그대로만 게시 (나) 편집 허용: 편집본도 원문 근거·주의 표현 검사(`findCautions`)와 첫 줄 AI 표시 검사를 다시 통과해야 하고, 편집본이 version에 들어감. 권장: (나)지만 해시태그·문장 추가만, 첫 줄 표시 문구는 잠금.
2. **게시 확인 강도** — 대화상자 확인만 / 계정 이름 직접 입력. 권장: 첫 게시만 계정 이름 입력.
3. **공개 주소 방식** — 지금처럼 게시 동안만 cloudflared 임시 터널 / 고정 서버(`--base-url`). 웹에서 터널 프로세스를 띄우는 것을 허용할지.
4. **범위** — 이번 B5는 수동 게시만, 예약·여러 계정·성과 수집(C)은 후속으로 두는 것을 권장. 정적 배포 사이트에는 게시 기능을 넣지 않는다(로컬 작업실 `apply: 'serve'`만).
5. **브랜드 시안** — GLOWIF·@glowif.beauty는 시안. 게시 계정은 현재 연결된 `@cardnews_auto_lab`(개발 모드)로 시험할지.

## 6. 보안·제약

- 토큰은 로컬 서버의 `.env`에서만 읽고 브라우저 응답·로그·`ig-publish.json`에 넣지 않는다(지금 `redact()` 유지). 작업실 API는 기존처럼 127.0.0.1·`X-Studio` 헤더·같은 출처만.
- 게시 API는 정적 빌드에 포함되지 않는다. 화면 문구로 "배포 사이트에서 예약이 실행된다"고 안내하지 않는다.
- 첫 젤크림 게시는 실제 브랜드 이미지를 쓴 기술 검증이다. 앞으로의 가상 뷰티 콘셉트 게시물에서 가상 제품 효능을 실제 사실처럼 쓰지 않아요. #107에서는 첫 줄에 AI 활용, 본문에 가상 제품 맥락, 본문 뒤에 샘플·비판매 광고 안내를 유지해요. [캡션 작성 기준](../instagram-caption.md)을 확인해요.

## 7. 통합 순서 (제안)

1. 웹 개편 PR(`feat/web-studio-redesign`) 리뷰·병합 → main.
2. `feat/ax-compliance → feat/instagram → fix/96` 순서로 main 위에 다시 올리며 충돌 정리. **충돌 예상**: 인스타 브랜치가 `StudioProductPage.tsx`·`studio.css`·`api.ts`에 게시 전 점검 패널을 추가했다. 이번 개편 구조에서는 그 패널을 `fold` 접기 패널(`AiCardPanel`과 같은 형태)로 옮기면 된다.
3. B5: 위 2~4의 서버 상태 파일·잠금·version을 먼저 만들고 CLI `publish()`도 같은 코드를 쓰게 한 뒤, 화면을 붙인다. 모의 Graph API로 성공·permalink 실패·연결 끊김·중복 클릭·재시작 복원 테스트를 추가한다. 실제 게시 시험은 사용자 승인 뒤 한 번만.
