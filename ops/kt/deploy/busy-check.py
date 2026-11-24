#!/usr/bin/env python3
"""KT 자동 배포 전 확인 (#120): 지금 작업실을 다시 켜도 되는지 봐요.

바쁘면 이유를 한 줄씩 출력하고 1로 끝나요. 한가하면 아무것도 출력하지 않고 0으로 끝나요.
저장소 코드를 실행하지 않고 파일만 읽어요(배포 스크립트가 root로 실행해요).

- 제작 작업: 작업실 상태(/api/studio/status 응답 파일)의 진행·대기 작업
- 터미널 제작 작업: products/<제품ID>/.job.json
- Glowif 초안 만들기: products/.glowif-<제품ID>.lock (#129)
- 인스타 게시: products/<제품ID>/output/instagram/ig-publish.json의 진행 단계, 실행 중 예약,
  --guard-minutes 안에 잡힌 예약(시각이 지났어도 아직 'scheduled'면 곧 실행될 수 있어 포함)
"""
import argparse
import datetime as dt
import glob
import json
import os
import sys

# scripts/lib/ig-publisher.js 의 ACTIVE와 같아야 해요
ACTIVE = {'requested', 'preparing', 'opening_url', 'uploading', 'carousel', 'publishing', 'confirming'}


def parse_time(value):
    return dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))


def reasons_for(products, studio_status=None, guard_minutes=30, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    out = []
    if studio_status is not None:
        job = studio_status.get('job') or None
        if job and job.get('status') in ('running', 'queued'):
            out.append(f"제작 작업 진행 중 ({job.get('product_id')})")
        queue = (studio_status.get('jobs') or {}).get('queue') or []
        if queue:
            out.append(f'대기 중인 제작 작업 {len(queue)}개')
    for f in sorted(glob.glob(os.path.join(products, '*', '.job.json'))):
        out.append(f"{os.path.basename(os.path.dirname(f))}: 터미널 제작 작업 진행 중")
    # Glowif 초안 만들기 (#129): scripts/glowif.js가 products/.glowif-<제품ID>.lock 폴더를 잡고 있는 동안
    for f in sorted(glob.glob(os.path.join(products, '.glowif-*.lock'))):
        out.append(f"{os.path.basename(f)[1:-5]}: Glowif 초안 만드는 중")
    for f in sorted(glob.glob(os.path.join(products, '*', 'output', 'instagram', 'ig-publish.json'))):
        pid = f.split(os.sep)[-4]
        try:
            with open(f, encoding='utf-8') as fh:
                s = json.load(fh)
        except (OSError, ValueError):
            out.append(f'{pid}: 게시 기록을 읽지 못했어요')
            continue
        cur = s.get('current') or {}
        if cur.get('state') in ACTIVE:
            out.append(f"{pid}: 인스타 게시 진행 중 ({cur.get('state')})")
        sch = s.get('schedule') or {}
        if sch.get('state') == 'running':
            out.append(f'{pid}: 예약 게시 실행 중')
        elif sch.get('state') == 'scheduled' and sch.get('at'):
            try:
                at = parse_time(sch['at'])
            except ValueError:
                out.append(f'{pid}: 예약 시각을 읽지 못했어요')
                continue
            if at - now <= dt.timedelta(minutes=guard_minutes):
                out.append(f'{pid}: {guard_minutes}분 안에 예약 게시가 있어요')
    return out


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--products', required=True, help='제품 폴더 (CARDNEWS_PRODUCTS_DIR)')
    p.add_argument('--studio-status', help='/api/studio/status 응답을 저장한 파일. 작업실이 꺼져 있으면 생략')
    p.add_argument('--guard-minutes', type=int, default=30)
    p.add_argument('--now', help='시험용 현재 시각 (ISO 8601)')
    a = p.parse_args(argv)
    studio = None
    if a.studio_status:
        try:
            with open(a.studio_status, encoding='utf-8') as fh:
                studio = json.load(fh)
        except (OSError, ValueError):
            print('작업실 상태를 읽지 못했어요')
            return 1
    reasons = reasons_for(a.products, studio, a.guard_minutes, parse_time(a.now) if a.now else None)
    for r in reasons:
        print(r)
    return 1 if reasons else 0


if __name__ == '__main__':
    sys.exit(main())
