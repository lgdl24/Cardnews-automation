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

## 보안 보강 (#116)

인증서가 공개 기록(Certificate Transparency)에 남아서 작업실 주소는 누구나 찾을 수 있어요. 팀 로그인 뒤에서 돌아가는 Claude가 외부 글을 읽기 때문에 아래 세 가지를 함께 켜 둬요.

### 서버 Claude는 작업 폴더 밖을 못 읽어요

- 제작 작업(`scripts/lib/job-runner.js`)과 자료로 채우기(`scripts/lib/extract-input.js`)는 `--settings`로 `permissions.blockReadsOutsideWorkingDirectories`·`blockWritesOutsideWorkingDirectories`를 켜요. 파일 도구는 작업 폴더 밖을 거부하고, 밖을 읽는 `cat` 같은 명령은 승인이 필요해져 `dontAsk` 모드에서 거부돼요. **Claude Code 2.1.257 이상**이 필요해요. 서버 CLI를 바꾸면 `claude --version`으로 확인해요.
- 로그인 정보·서버 설정 경로(`~/.claude/.credentials.json`, `~/.codex/**`, `~/.ssh/**`, `~/.config/**`, `/etc/cardnews/**`, `/proc/**`, `.env`)는 `--disallowedTools`의 `Read(...)` 규칙으로도 막아요.
- 경로 제한 없는 `Read`·`Glob`·`Grep` 허용은 없앴어요. 작업 폴더 안 읽기는 승인 없이 돼요.
- 확인 방법: 작업실 서비스 계정으로 임시 작업 폴더를 만들고, 홈과 `~/.codex/`에 가짜 파일을 둔 뒤 같은 인자로 `claude -p`에 네 가지(안쪽 Read, 홈 Read, `cat`, `.codex` Read)를 시켜요. 안쪽만 읽히면 정상이에요. 끝나면 가짜 파일을 지워요. 11.24 KT에서 고치기 전에는 홈·`.codex` 가짜 파일이 읽혔고, 고친 뒤에는 둘 다 거부됐어요.

### 접근 기록과 HTTPS 강제

- 공개 사이트마다 Caddy `log`(JSON, `/var/log/cardnews-gateway/access.log`, 10MiB·5개 순환)와 `Strict-Transport-Security: max-age=31536000`을 넣어요(`ops/kt/Caddyfile`). Caddy는 Authorization·Cookie 헤더 값을 기록에서 가려요.
- 기록 폴더는 게이트웨이 계정이 써요: `sudo install -d -o cardnews-gateway -g adm -m 0750 /var/log/cardnews-gateway`
- 적용 전 `caddy validate --config <새 파일> --adapter caddyfile`을 게이트웨이 계정과 같은 `XDG_*` 환경으로 실행하고, 통과할 때만 바꿔요. 관리 API를 끈 설정이라 적용은 `sudo systemctl restart cardnews-gateway`예요(몇 초 끊겨요).
- **기록된 IP가 실제 접속 IP인지 먼저 확인해요.** NAT 장비 주소만 찍히면 차단이 팀 전체를 막아요. 11.24 KT는 Static NAT 뒤에서도 접속한 공인 IP가 그대로 기록되는 것을 SSH 접속 IP와 대조해 확인했어요.

### 로그인 실패 반복 차단 (fail2ban)

`ops/kt/fail2ban/`의 필터·jail을 써요. 10분 안에 401이 10번 넘는 IP를 1시간 동안 443에서 막아요. 브라우저는 처음 접속할 때 로그인 창을 띄우려고 401을 한 번 받으므로 기준을 넉넉히 뒀어요. SSH(22)는 이 규칙으로 막지 않아요(Ubuntu 기본 `sshd` jail은 따로 켜져 있어요).

```bash
sudo apt-get install -y fail2ban
sudo install -m 0644 ops/kt/fail2ban/cardnews-studio-auth.conf /etc/fail2ban/filter.d/
sudo install -m 0644 ops/kt/fail2ban/cardnews-studio.local /etc/fail2ban/jail.d/
sudo fail2ban-regex /var/log/cardnews-gateway/access.log /etc/fail2ban/filter.d/cardnews-studio-auth.conf
sudo systemctl enable --now fail2ban
sudo fail2ban-client status cardnews-studio-auth
```

- 팀원이 잘못 막혔을 때: `sudo fail2ban-client set cardnews-studio-auth unbanip <IP>`
- 차단 동작 시험은 실제 팀 IP 대신 문서용 주소(`203.0.113.x`)로 `banip` → 방화벽 규칙 확인 → `unbanip` 해요.

### 서버 반영 기록

KT 앱 폴더는 Git이 아니에요. 파일을 바꿀 때는 `/opt/cardnews/backup-<날짜>-<이슈>/`에 원본을 두고, `/opt/cardnews/DEPLOY.log`에 날짜·이슈·바꾼 파일·기준 커밋을 한 줄 남겨요. 되돌릴 때는 백업 파일을 제자리에 복사하고 해당 서비스를 다시 켜요.

## 자동 배포 (#120)

main에 병합되면 KT가 스스로 가져가 배포해요. GitHub에는 서버 접속 정보를 두지 않아요.

| 단계 | 내용 |
| --- | --- |
| CI | `.github/workflows/ci.yml`이 PR·main push에서 `npm test`, 웹 빌드, `npm run test:web`을 돌려요. 검사 이름은 `CI`이고, main 보호 규칙의 필수 검사예요. |
| 확인 | `cardnews-deploy.timer`가 5분마다 `/opt/cardnews/deploy/cardnews-deploy.sh`를 root로 실행해요. 공개 저장소 main의 새 커밋을 가져오고, 그 커밋의 `CI`가 성공일 때만 진행해요(GitHub API, 인증 없음). |
| 미루기 | 작업실의 제작 작업 진행·대기, Claude·Codex 실행, 터미널 작업(`.job.json`), 인스타 게시 진행·예약 실행 중, 30분 안 예약이 있으면 다음 확인으로 미뤄요(`busy-check.py`). |
| 빌드 | 권한 없는 `cardnews-build` 계정이 `/opt/cardnews/releases/.build-<커밋>`에 `git archive` → `npm ci` → 웹 빌드 → Playwright Chromium 확인을 해요. 끝나면 root 소유·읽기 전용으로 바꿔 `/opt/cardnews/releases/<커밋>`에 둬요. 저장소의 새 코드를 root로 실행하지 않아요. |
| 전환 | `/opt/cardnews/app` 연결(심볼릭 링크)을 새 릴리스로 바꾸고 `cardnews-publish`·`cardnews-studio`를 다시 켜요. 게이트웨이(Caddy)는 그대로예요. |
| 확인·되돌리기 | 1분 안에 작업실 `/api/studio/status` 200과 게시 서비스 응답이 없으면 직전 릴리스로 되돌려요. 실패·CI 실패 커밋은 `/var/lib/cardnews/deploy/failed-<커밋>`으로 표시해 다시 시도하지 않아요. |
| 기록 | `/opt/cardnews/DEPLOY.log`, 빌드 출력 `/var/lib/cardnews/deploy/build-<짧은 커밋>.log`, 상태 `/var/lib/cardnews/deploy/status.json`(작업실 하단에 배포 버전·실패 표시). 릴리스는 현재·직전 포함 3개만 남겨요. |

자동 배포는 앱 코드만 바꿔요. `ops/kt/`의 Caddyfile·fail2ban·서비스 파일과 `/etc/cardnews/` 설정이 바뀌면 지금처럼 백업 후 직접 적용해요.

### 첫 설치 (한 번)

```bash
sudo useradd --system --home-dir /var/lib/cardnews-build --create-home --shell /usr/sbin/nologin cardnews-build
sudo install -d -o cardnews-build -g cardnews-build -m 0755 /opt/cardnews/repo.git
sudo runuser -u cardnews-build -- git init -q --bare /opt/cardnews/repo.git
sudo chown -R cardnews-build:cardnews-build /opt/cardnews/browsers     # Playwright 버전이 바뀌면 빌드 계정이 받아요
sudo install -d -o root -g root -m 0755 /opt/cardnews/releases /opt/cardnews/deploy
sudo install -m 0750 ops/kt/deploy/cardnews-deploy.sh ops/kt/deploy/busy-check.py /opt/cardnews/deploy/
sudo install -m 0644 ops/kt/deploy/cardnews-deploy.service ops/kt/deploy/cardnews-deploy.timer /etc/systemd/system/
# 기존 앱 폴더를 첫 릴리스로 옮기고 연결로 바꿔요 (작업·게시가 없을 때)
sudo mv /opt/cardnews/app /opt/cardnews/releases/legacy-<날짜>
sudo ln -s /opt/cardnews/releases/legacy-<날짜> /opt/cardnews/app
echo 'CARDNEWS_DEPLOY_STATUS_FILE=/var/lib/cardnews/deploy/status.json' | sudo tee -a /etc/cardnews/studio.env
sudo systemctl restart cardnews-publish cardnews-studio
sudo systemctl daemon-reload && sudo systemctl enable --now cardnews-deploy.timer
```

### 운영

- 지금 바로 확인: `sudo systemctl start cardnews-deploy` → `tail /opt/cardnews/DEPLOY.log`
- 다음 확인 시각: `systemctl list-timers cardnews-deploy.timer`
- 실패한 커밋을 다시 시도: 원인을 고친 새 커밋을 병합해요. 같은 커밋을 다시 하려면 `sudo rm /var/lib/cardnews/deploy/failed-<커밋>`
- 손으로 되돌리기: `ls -t /opt/cardnews/releases` → `sudo ln -sfn /opt/cardnews/releases/<이전> /opt/cardnews/app && sudo systemctl restart cardnews-publish cardnews-studio`
- 자동 배포 멈추기: `sudo systemctl disable --now cardnews-deploy.timer`
- 되돌리기 훈련: `sudo /opt/cardnews/deploy/cardnews-deploy.sh --rollback-drill` — 지금 버전을 복사해 일부러 고장 낸 버전으로 전환한 뒤, 고장 감지 → 원래 버전 복귀 → 정상 확인까지 해요. 작업실이 1~2분 끊기고, 작업·게시가 있으면 하지 않아요.
- 실제 인스타 게시 시험 중에는 게시가 진행·예약된 동안 자동으로 미뤄요. 그래도 그 시간에는 병합하지 않는 게 좋아요.

## 설치 후 확인

1. 기존 서비스와 도메인 설정을 확인하고, 서비스 파일을 systemd에 등록해요. 시험할 때는 `publish.env`에 `CARDNEWS_IG_SCHEDULE=off`를 넣고 가상 제품 폴더를 사용해요. 사용자가 기존 서버를 운영 중이면 서비스 이름과 도메인이 겹치지 않게 해요.
2. Caddy 설정을 검증한 뒤 올려요. 외부에서 로그인 없이 `/studio`와 `/api/studio/status`를 열면 차단되고, 팀 계정으로 로그인하면 작업실과 PNG 미리보기가 열려야 해요. 게시용 공개 경로에는 개별 JPEG만 응답하며 폴더 목록과 그 밖의 파일은 차단해요.
3. 작업실에서 시험 제품을 골라 캡션을 작성하고 점검 결과와 인스타 연결 계정까지 확인해요. 실제 이미지 조회나 발행 검증을 하기 전에는 임시 시험 JPEG 또는 모의 인스타 API를 사용해요.
4. 운영 전환 때는 두 개인 PC의 자동 예약을 끄고, KT 게시 서비스 한 곳에서 예약이 실행되게 해요. 게시 기록을 함께 옮기고, 미처리 예약과 확인 필요 게시를 대조한 뒤 운영 예약을 켜요. 웹이 닫혀 있어도 서버의 게시 서비스는 계속 동작해요.

고정 주소 설정을 하지 않은 로컬 작업실에서는 기존 임시 터널을 사용할 수 있어요. 파일을 직접 올려 둔 외부 주소를 지정하는 CLI의 `--base-url`도 계속 지원해요.
