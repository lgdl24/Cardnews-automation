# KT 서버에서 팀 작업실을 운영해요

작업실 웹과 API는 팀원이 HTTPS로 접속해 사용해요. 인스타가 읽는 공개 경로에는 게시 중인 JPEG만 올려요. 카드 엔진이 만든 제품별 `cards.json`, `input.md`, `output/png/card-NN.png`와 제작·승인 기록을 그대로 넘겨받아요.

| 순서 | 작업 | 완료 기준 |
| --- | --- | --- |
| 1 | 게시용 고정 주소 | 승인 PNG를 JPEG로 변환하고, 한 요청의 이미지가 다른 요청과 섞이지 않아요. 공개 HTTPS 확인 실패 시 게시 요청을 시작하지 않아요. |
| 2 | 팀 작업실과 게시 프로세스 | 팀 로그인으로 웹과 API를 열어요. 캡션을 작성하고 확인할 수 있고, 별도 게시 서비스가 브라우저를 닫은 뒤에도 예약을 실행해요. |
| 3 | KT 서버에 시험 배포 | 도메인·HTTPS, 파일 권한, CLI 로그인, 외부에서 JPEG 조회, 토큰 계정 조회를 검증해요. 시험 중에는 예약 발행을 꺼요. |
| 4 | 실계정 시험 | 새 승인본과 캡션을 사람이 확인한 뒤, 승인받은 1회 게시로 순서·링크·기록을 검증해요. |

## 서버 구성

예시는 Linux의 systemd와 [Caddy 2.8 이상](https://caddyserver.com/docs/caddyfile/directives/basic_auth)을 기준으로 해요. `ops/kt/`에 서비스 파일과 Caddyfile이 있어요. 실제 서버에 맞춰 Node 실행 경로와 도메인을 확인해요.

- `/opt/cardnews/app`에는 배포할 커밋을 읽기 전용으로 두고, `npm ci`, `npm --prefix web ci`, `npm run web:build`를 배포 계정으로 실행해요. Playwright Chromium과 시스템 라이브러리를 설치하고, 양쪽 서비스가 읽을 수 있는 `/opt/cardnews/browsers`에 브라우저를 둬요.
- `cardnews-studio`는 팀 작업실과 Claude Code·Codex CLI를 실행해요. 이 계정으로 각 CLI에 공식 로그인 절차를 진행하고, 서비스에도 같은 홈 디렉터리가 적용되는지 확인해요. 기본 PATH에서 찾을 수 없다면 `studio.env`에 `CARDNEWS_CLAUDE_BIN`과 `CODEX_BIN`을 각 실행 파일의 절대 경로로 설정해요. 자동 제작·캡션을 다른 팀원도 실행할 경우에는 사용하는 계정의 권한과 구독 조건을 확인해요.
- `cardnews-publish`는 Meta 계정 조회·게시·예약을 실행해요. `/etc/cardnews/publish.env`에 `IG_API_SETUP=unified`, `IG_USER_ID`, `IG_ACCESS_TOKEN`, `IG_PUBLIC_BASE_URL=https://작업실도메인/ig-media`를 넣고 root만 읽도록 설정해요. 기존 개발기와 달리 배포 체크아웃에 공유 `.env`를 두지 않아요.
- `/etc/cardnews/studio.env`에는 `CARDNEWS_STUDIO_ORIGIN=https://작업실도메인`을 지정해요. Caddy 서비스에 `CARDNEWS_STUDIO_DOMAIN`을 설정하고, `caddy hash-password`로 각각 만든 팀 로그인 해시를 `/etc/cardnews/studio-users.caddy`에 `사용자명 해시` 형식으로 저장해요. Caddy는 HTTPS를 종료하고 인증이 끝난 요청만 작업실에 전달해요.

| 경로 또는 권한 | 설정 |
| --- | --- |
| `/var/lib/cardnews` | root 소유로 두고 각 서비스 계정이 지나갈 수 있도록 해요. |
| `/var/lib/cardnews/products` | `cardnews-studio:cardnews-data`, 모드 `2770`. 두 서비스가 같은 제품 파일·게시 기록을 사용해요. 처음 복사하는 제품 폴더와 파일도 그룹 쓰기가 가능해야 해요. |
| `/var/lib/cardnews/studio` | `cardnews-studio:cardnews-web`, 모드 `0700`. 제작 작업과 내보낸 웹 데이터를 보관해요. |
| `/var/lib/cardnews/ig-media` | `cardnews-publish:cardnews-media`, 모드 `2750`. Caddy에서 읽을 수 있어야 해요. 정상 종료 시 JPEG를 삭제해요. 강제 종료로 남은 요청 폴더는 작업이 없는 시점에 확인해 정리해요. |
| Caddy 계정 | `cardnews-web`·`cardnews-media` 그룹에 추가해요. 팀 웹 소켓과 게시 JPEG만 접근하게 해요. |

작업실과 게시 서비스는 각자의 Unix 소켓을 사용해요. 작업실은 Meta 토큰 없이 게시 서비스에 요청하고, 게시 서비스는 인스타 작업 경로만 받아요. 제품 폴더와 게시 명령은 내부에서 공유하므로 제작 작업실은 신뢰하는 팀원에게만 열어요. 로컬용 피그마 플러그인 연결 경로는 이 배포 구성에서 제외돼요.

## 고정 공인 IP로 먼저 열어요

도메인이 없으면 고정 공인 IP에 [Let's Encrypt의 IP 인증서](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)를 발급받아 사용할 수 있어요. IP 주소를 Caddy 사이트와 작업실 origin에 지정하고, 게시 공개 주소는 `https://<공인 IP>/ig-media`로 맞춰요. 외부 방화벽은 해당 Static NAT의 TCP 443만 열어요. HTTP 리디렉션과 ACME의 HTTP-01 검증을 끄고, 발급 프로필을 `shortlived`로 지정하면 Caddy가 TLS 연결로 인증서를 발급하고 갱신해요.

브라우저가 IP로 접속할 때 도메인 이름을 보내지 않아도 인증서를 내보내도록 Caddy 전역에 [`default_sni`](https://caddyserver.com/docs/caddyfile/options#default-sni)를 해당 공인 IP로 지정해요. 브라우저와 같은 검증으로 접속하고, 비로그인 요청이 401인지 확인해요.

외부 사이트는 팀원별 해시가 적힌 별도 파일만 사용해요. 기존 SSH 미리보기의 계정을 외부 사이트에 포함하지 않아요. 팀원 권한을 회수할 때는 해당 계정 한 줄만 제거하고, Caddy 설정을 검증한 뒤 게이트웨이에 적용해요.

공인 IP에서 도메인으로 옮길 때는 도메인의 A 레코드를 서버 IP에 연결하고, 기존 HTTPS 443에서 새 인증서를 발급해요. 새 주소를 팀 인증 뒤에 먼저 붙여 브라우저에서 확인한 뒤, 작업실 origin과 게시 이미지 기준 주소를 같이 바꿔요. 기존 IP와 SSH 미리보기를 함께 제공할 때는 게이트웨이가 해당 주소의 정확한 브라우저 origin만 새 origin으로 전달해요. 새 도메인에서 외부 JPEG 조회와 게시 계정의 HEAD 확인을 모두 검사해요.

## 설치 후 확인

1. 기존 서비스와 도메인 설정을 확인하고, 서비스 파일을 systemd에 등록해요. 시험할 때는 `publish.env`에 `CARDNEWS_IG_SCHEDULE=off`를 넣고 가상 제품 폴더를 사용해요. 사용자가 기존 서버를 운영 중이면 서비스 이름과 도메인이 겹치지 않게 해요.
2. Caddy 설정을 검증한 뒤 올려요. 외부에서 로그인 없이 `/studio`와 `/api/studio/status`를 열면 차단되고, 팀 계정으로 로그인하면 작업실과 PNG 미리보기가 열려야 해요. 게시용 공개 경로에는 개별 JPEG만 응답하며 폴더 목록과 그 밖의 파일은 차단해요.
3. 작업실에서 시험 제품을 골라 캡션을 작성하고 점검 결과와 인스타 연결 계정까지 확인해요. 실제 이미지 조회나 발행 검증을 하기 전에는 임시 시험 JPEG 또는 모의 인스타 API를 사용해요.
4. 운영 전환 때는 두 개인 PC의 자동 예약을 끄고, KT 게시 서비스 한 곳에서 예약이 실행되게 해요. 게시 기록을 함께 옮기고, 미처리 예약과 확인 필요 게시를 대조한 뒤 운영 예약을 켜요. 웹이 닫혀 있어도 서버의 게시 서비스는 계속 동작해요.

고정 주소 설정을 하지 않은 로컬 작업실에서는 기존 임시 터널을 사용할 수 있어요. 파일을 직접 올려 둔 외부 주소를 지정하는 CLI의 `--base-url`도 계속 지원해요.
