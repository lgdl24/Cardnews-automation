#!/bin/bash
# 피그마 내보내기 이미지 올리기 (scripts/figma-export.js 다음 단계)
# 사용: bash scripts/figma-upload.sh <이미지 폴더> <목록 파일> <페이지 ID>
#   목록 파일: 한 줄에 "파일이름.png 업로드주소ID" — 피그마 upload_assets가 준 submitUrl의 /upload/<ID>/submit 부분
#   페이지 ID: 이미지가 놓일 피그마 페이지 (예: 21:2). build-*.js가 같은 페이지에서 파일 이름으로 찾음
#   결과: <이미지 폴더>/upload-result.txt (파일마다 성공 여부, 끝에 ALLDONE)
#   주소는 한 번만 쓰이고 10분 뒤 만료 → 5개씩 동시에 올림
set -u
dir="$1"; list="$2"; page="${3//:/%3A}"
cd "$dir" || exit 1
: > upload-result.txt
while read -r f u; do
  [ -z "${f:-}" ] && continue
  ( r=$(curl -sS --max-time 240 -X POST -F "file=@${f};type=image/png" "https://mcp.figma.com/mcp/upload/${u}/submit?scaleMode=FILL&currentPageId=${page}" 2>&1); echo "$f $r" >> upload-result.txt ) &
  while [ "$(jobs -r | wc -l)" -ge 5 ]; do sleep 1; done
done < "$list"
wait
echo ALLDONE >> upload-result.txt
grep -c '"success":true' upload-result.txt | xargs echo "올림:"
