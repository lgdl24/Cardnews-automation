#!/usr/bin/env python3
"""KT 자동 배포 실패 메일 알림 (#123).

KT 서버는 SMTP(25·465·587)가 막혀 있어 HTTPS 메일 API(Resend)로 보내요.
설정 파일(기본 /etc/cardnews/notify.env, root만 읽기):
  RESEND_API_KEY=...        Resend에서 만든 '보내기 전용' 키
  NOTIFY_EMAIL=...          받는 주소 (무료 요금제는 Resend 가입 주소만 가능)
  NOTIFY_FROM=...           (선택) 보내는 이름·주소. 기본은 Resend 시험 주소

출력에는 결과만 적고 키 값은 절대 적지 않아요.
끝 코드: 0 보냄, 2 설정 없음(보내지 않음), 1 보내기 실패
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

DEFAULT_FROM = 'Cardnews 배포 <onboarding@resend.dev>'


def read_env(path):
    env = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            k, _, v = line.strip().partition('=')
            if k and not k.startswith('#'):
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def send(env, subject, body, url):
    key, to = env.get('RESEND_API_KEY'), env.get('NOTIFY_EMAIL')
    if not key or not to:
        return 2, '설정 없음'
    data = json.dumps({'from': env.get('NOTIFY_FROM') or DEFAULT_FROM, 'to': [to], 'subject': subject, 'text': body}).encode()
    req = urllib.request.Request(url, data=data, headers={
        'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'cardnews-deploy/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return 0, f'보냄 (HTTP {r.status})'
    except urllib.error.HTTPError as e:
        msg = ''
        try:
            msg = str(json.loads(e.read().decode()).get('message', ''))[:160]
        except Exception:
            pass
        return 1, f'실패 (HTTP {e.code}) {msg}'.strip()
    except Exception as e:  # 네트워크 등
        return 1, f'실패 ({type(e).__name__})'


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--env', default='/etc/cardnews/notify.env')
    p.add_argument('--subject', required=True)
    p.add_argument('--body', required=True)
    p.add_argument('--url', default='https://api.resend.com/emails')
    a = p.parse_args(argv)
    try:
        env = read_env(a.env)
    except OSError:
        print('설정 없음')
        return 2
    code, message = send(env, a.subject, a.body, a.url)
    # 키가 메시지에 섞여 돌아와도 출력하지 않아요
    key = env.get('RESEND_API_KEY')
    if key:
        message = message.replace(key, '***')
    print(message)
    return code


if __name__ == '__main__':
    sys.exit(main())
