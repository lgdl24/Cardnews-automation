#!/bin/bash
# KT 자동 배포 (#120). systemd 타이머(cardnews-deploy.timer)가 5분마다 root로 실행해요.
#
#  1) 공개 저장소의 main을 가져와요(GitHub에 서버 접속 정보를 두지 않아요).
#  2) 새 커밋의 GitHub Actions 검사 "CI"가 성공일 때만 진행해요.
#  3) 제작 작업·인스타 게시가 진행 중이거나 30분 안에 예약 게시가 있으면 미뤄요(busy-check.py).
#  4) 권한 없는 빌드 계정이 /opt/cardnews/releases/.build-<커밋>에 설치·빌드해요.
#     저장소의 새 코드는 root로 실행하지 않아요. 빌드가 끝나면 root 소유·읽기 전용으로 바꿔요.
#  5) /opt/cardnews/app 연결을 새 릴리스로 바꾸고 게시·작업실 서비스를 다시 켜요.
#  6) 정상 응답을 확인하고, 실패하면 직전 릴리스로 되돌려요. 실패한 커밋은 다시 시도하지 않아요.
#  7) /opt/cardnews/DEPLOY.log와 상태 파일(작업실 하단 표시)에 남겨요.
#
# Caddy·fail2ban·/etc/cardnews 설정은 바꾸지 않아요. 직접 실행: sudo systemctl start cardnews-deploy
set -uo pipefail

REPO_URL=https://github.com/lgdl24/Cardnews-automation.git
API=https://api.github.com/repos/lgdl24/Cardnews-automation
BASE=/opt/cardnews
GIT_DIR=$BASE/repo.git
RELEASES=$BASE/releases
APP=$BASE/app
LOG=$BASE/DEPLOY.log
STATE=/var/lib/cardnews/deploy
STATUS=$STATE/status.json
BUSY_CHECK=$BASE/deploy/busy-check.py
BUILD_USER=cardnews-build
BUILD_HOME=/var/lib/cardnews-build
NODE_BIN=$BASE/runtime/node/bin
PRODUCTS=/var/lib/cardnews/products
STUDIO_SOCK=/run/cardnews-web/studio.sock
PUBLISH_SOCK=/run/cardnews-publish/publish.sock
SERVICES=(cardnews-publish cardnews-studio)
KEEP=3                 # 남길 릴리스 수 (현재·직전 포함)
GUARD_MINUTES=30       # 이 안에 예약 게시가 있으면 미룸
CHECK_NAME=CI

exec 9>/run/cardnews-deploy.lock
flock -n 9 || exit 0
install -d -o root -g cardnews-web -m 0750 "$STATE"

log() { echo "$(date -Is) [deploy] $*" >> "$LOG"; echo "$*"; }

# 상태 파일: deployed(지금 돌아가는 릴리스)와 last(마지막 시도). 작업실이 읽어요(그룹 cardnews-web)
write_status() { # result sha message
  python3 - "$STATUS" "$1" "$2" "$3" "$(basename "$(readlink -f "$APP")")" <<'PY'
import json, os, sys, datetime as dt
path, result, sha, message, current = sys.argv[1:6]
now = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
try:
    with open(path, encoding='utf-8') as f: s = json.load(f)
except (OSError, ValueError):
    s = {}
if result == 'ok':
    s['deployed'] = {'sha': sha, 'at': now}
s.setdefault('deployed', {'sha': current, 'at': None})
s['last'] = {'sha': sha, 'result': result, 'message': message, 'at': now}
tmp = path + '.tmp'
with open(tmp, 'w', encoding='utf-8') as f: json.dump(s, f, ensure_ascii=False, indent=2)
os.chmod(tmp, 0o640)
os.replace(tmp, path)
PY
  chgrp cardnews-web "$STATUS" 2>/dev/null || true
}

# 같은 이유로 기다리는 동안은 기록을 반복하지 않아요
wait_once() { # sha reason
  local key="$1 $2"
  if [ "$(cat "$STATE/last-wait" 2>/dev/null)" != "$key" ]; then
    echo "$key" > "$STATE/last-wait"
    log "대기 ${1:0:7}: $2"
    write_status waiting "$1" "$2"
  fi
}

as_build() {
  runuser -u "$BUILD_USER" -- env -i HOME="$BUILD_HOME" PATH="$NODE_BIN:/usr/bin:/bin" \
    PLAYWRIGHT_BROWSERS_PATH="$BASE/browsers" npm_config_update_notifier=false "$@"
}

studio_host() {
  python3 -c 'import sys,urllib.parse
for line in open("/etc/cardnews/studio.env"):
    k,_,v=line.strip().partition("=")
    if k=="CARDNEWS_STUDIO_ORIGIN": print(urllib.parse.urlparse(v.strip().strip("\"")).netloc)'
}

healthy() {
  local host; host=$(studio_host)
  for _ in $(seq 1 30); do
    sleep 2
    for s in "${SERVICES[@]}"; do systemctl is-active -q "$s" || continue 2; done
    local studio publish
    studio=$(curl -s -o /dev/null -m 5 -w '%{http_code}' --unix-socket "$STUDIO_SOCK" -H "Host: $host" http://localhost/api/studio/status)
    # 게시 서비스는 인스타 경로만 받아요. 다른 경로의 404 JSON이면 살아 있는 거예요
    publish=$(curl -s -o /dev/null -m 5 -w '%{http_code}' --unix-socket "$PUBLISH_SOCK" -H 'Host: localhost' http://localhost/health)
    [ "$studio" = 200 ] && [ "$publish" = 404 ] && return 0
  done
  return 1
}

restart_services() { systemctl restart "${SERVICES[@]}"; }

switch_to() { # release_dir
  ln -sfn "$1" "$APP.next" && mv -T "$APP.next" "$APP"
}

# 바쁘면 BUSY_REASON에 이유를 넣고 1을 돌려줘요
check_busy() {
  BUSY_REASON=""
  local studio_json args=()
  studio_json=$(mktemp)
  if systemctl is-active -q cardnews-studio; then
    if curl -fsS -m 10 --unix-socket "$STUDIO_SOCK" -H "Host: $(studio_host)" http://localhost/api/studio/status -o "$studio_json"; then
      args=(--studio-status "$studio_json")
    else
      rm -f "$studio_json"; BUSY_REASON="작업실 상태를 확인하지 못했어요"; return 1
    fi
  fi
  if pgrep -u cardnews-studio -f 'ai-cli/bin/(claude|codex)' >/dev/null; then
    rm -f "$studio_json"; BUSY_REASON="Claude·Codex 작업이 실행 중이에요"; return 1
  fi
  local out
  if ! out=$(python3 "$BUSY_CHECK" --products "$PRODUCTS" --guard-minutes "$GUARD_MINUTES" "${args[@]}"); then
    rm -f "$studio_json"; BUSY_REASON=$(echo "$out" | paste -sd ';'); return 1
  fi
  rm -f "$studio_json"
  return 0
}

# ── 0) 처음 한 번은 설치 절차(운영 안내 「자동 배포」)로 app을 연결로 바꿔 둬야 해요
if [ ! -L "$APP" ]; then
  log "중단: $APP 이 릴리스 연결(심볼릭 링크)이 아니에요. 운영 안내의 첫 설치 절차를 먼저 해요"
  exit 1
fi

# ── 되돌리기 훈련: 지금 버전을 복사해 일부러 고장 낸 뒤 전환 → 고장 감지 → 원래 버전으로 되돌리기를 확인해요
#    sudo /opt/cardnews/deploy/cardnews-deploy.sh --rollback-drill  (작업실이 1~2분 끊겨요)
if [ "${1:-}" = "--rollback-drill" ]; then
  if ! check_busy; then log "훈련 미룸: $BUSY_REASON"; exit 1; fi
  CURRENT=$(readlink -f "$APP")
  DRILL=$RELEASES/.drill-broken
  rm -rf "$DRILL" && cp -a "$CURRENT" "$DRILL"
  echo "process.exit(1); // 되돌리기 훈련용으로 일부러 고장 낸 버전" > "$DRILL/scripts/studio-server.js"
  log "훈련 시작: 고장 낸 버전으로 전환"
  switch_to "$DRILL"; restart_services
  RESULT=0
  if healthy; then log "훈련 실패: 고장 낸 버전이 정상으로 보였어요"; RESULT=1; else log "훈련: 고장을 감지했어요 → $(basename "$CURRENT")로 되돌림"; fi
  switch_to "$CURRENT"; restart_services
  if healthy; then log "훈련 완료: 되돌린 뒤 정상이에요"; else log "경고: 훈련 뒤 정상 응답이 없어요. 직접 확인이 필요해요"; RESULT=1; fi
  rm -rf "$DRILL"
  exit $RESULT
fi

# ── 1) main 가져오기
if ! as_build git --git-dir="$GIT_DIR" fetch -q "$REPO_URL" +refs/heads/main:refs/heads/main 2>>"$STATE/fetch.err"; then
  wait_once "-" "main을 가져오지 못했어요 (네트워크)"
  exit 0
fi
SHA=$(as_build git --git-dir="$GIT_DIR" rev-parse refs/heads/main)
CURRENT=$(readlink -f "$APP")
[ "$(basename "$CURRENT")" = "$SHA" ] && exit 0
[ -e "$STATE/failed-$SHA" ] && exit 0
SHORT=${SHA:0:7}

# ── 2) CI 결과
CI=$(curl -fsS -m 20 -H 'Accept: application/vnd.github+json' "$API/commits/$SHA/check-runs?check_name=$CHECK_NAME" 2>/dev/null \
  | python3 -c 'import json,sys
runs=json.load(sys.stdin).get("check_runs",[])
if not runs: print("none")
else:
    r=sorted(runs,key=lambda x:x.get("started_at") or "")[-1]
    print(r.get("conclusion") or r.get("status") or "unknown")' 2>/dev/null || echo "unreachable")
case "$CI" in
  success) ;;
  failure|cancelled|timed_out|action_required|startup_failure|stale)
    touch "$STATE/failed-$SHA"; log "건너뜀 $SHORT: CI 결과 $CI"; write_status skipped "$SHA" "CI 결과가 $CI 라 배포하지 않았어요"; exit 0 ;;
  none) wait_once "$SHA" "CI 결과가 아직 없어요"; exit 0 ;;
  *) wait_once "$SHA" "CI 확인 중 ($CI)"; exit 0 ;;
esac

# ── 3) 바쁜지 확인
if ! check_busy; then
  wait_once "$SHA" "$BUSY_REASON"; exit 0
fi

# ── 4) 빌드 (권한 없는 계정)
log "시작 $SHORT: 빌드"
write_status building "$SHA" "새 버전을 준비하고 있어요"
BUILD=$RELEASES/.build-$SHA
BUILD_LOG=$STATE/build-$SHORT.log
rm -rf "$BUILD"
install -d -o "$BUILD_USER" -g "$BUILD_USER" -m 0755 "$BUILD"
if ! as_build bash -c "set -euo pipefail
  git --git-dir='$GIT_DIR' archive '$SHA' | tar -x -C '$BUILD'
  cd '$BUILD'
  npm ci --include=dev --no-audit --no-fund
  npm --prefix web ci --include=dev --no-audit --no-fund
  npm run web:build
  npx playwright install chromium
  node -e \"require('./scripts/lib/studio-api'); require('./scripts/studio-server')\"" >"$BUILD_LOG" 2>&1; then
  rm -rf "$BUILD"
  touch "$STATE/failed-$SHA"
  log "실패 $SHORT: 빌드 오류 (기록 $BUILD_LOG)"
  write_status failed "$SHA" "빌드에 실패해서 이전 버전을 그대로 써요"
  exit 1
fi
chown -R root:root "$BUILD" && chmod -R go-w,a+rX "$BUILD"
rm -rf "${RELEASES:?}/$SHA"
mv -T "$BUILD" "$RELEASES/$SHA"

# ── 5) 전환
PREVIOUS=$CURRENT
switch_to "$RELEASES/$SHA"
restart_services

# ── 6) 확인과 되돌리기
if healthy; then
  log "완료 $SHORT (이전 $(basename "$PREVIOUS"))"
  write_status ok "$SHA" "배포했어요"
  rm -f "$STATE/last-wait"
else
  log "실패 $SHORT: 정상 응답 없음 → $(basename "$PREVIOUS")로 되돌림"
  switch_to "$PREVIOUS"
  restart_services
  touch "$STATE/failed-$SHA"
  if healthy; then
    write_status failed "$SHA" "새 버전이 정상 응답하지 않아 이전 버전으로 되돌렸어요"
  else
    log "경고: 되돌린 뒤에도 정상 응답이 없어요. 직접 확인이 필요해요"
    write_status failed "$SHA" "되돌린 뒤에도 정상 응답이 없어요. 직접 확인이 필요해요"
  fi
  exit 1
fi

# ── 7) 오래된 릴리스 정리 (현재·직전 포함 KEEP개)
KEEP_SET=("$(readlink -f "$APP")" "$PREVIOUS")
ls -1dt "$RELEASES"/* 2>/dev/null | while read -r dir; do
  for k in "${KEEP_SET[@]}"; do [ "$dir" = "$k" ] && continue 2; done
  echo "$dir"
done | tail -n +$((KEEP - 1)) | while read -r old; do rm -rf "$old"; log "정리: $(basename "$old")"; done
exit 0
