# Claude 디자인 연결 시험 — 웹에서 쓸 수 있나

- 상태: **시험·기록** (2026-11-02, 이규동 요청 · Claude). 브랜치 `feat/claude-design-test` (`feat/figma-render-test` 위에서 이어감). 제작 규칙·템플릿·config·작업 실행기는 안 바꿈
- 시험 캔버스: Claude 디자인 '달바 퍼플 카드뉴스 — Claude 디자인 시험' (이규동 계정 아티팩트, 비공개). 원본 파일은 [claude-design-test/canvas/](claude-design-test/canvas/)
- 참고: [쌩초 블로그 — 클로드 디자인으로 상세페이지 만들기](https://m.blog.naver.com/PostView.naver?blogId=ssaengcho&logNo=224258959708) (2026-04-20), [Claude 디자인 도움말](https://support.claude.com/en/articles/14604416)

## 결론

| 질문 | 답 |
|---|---|
| 우리 웹이 Claude 디자인을 바로 부를 수 있나? | **아니요.** Claude 디자인에 외부 프로그램용 API는 없어요(도움말에 없음) |
| 그럼 웹에서 못 쓰나? | **로컬 Claude Code를 거치면 돼요.** 웹 제작 화면은 이미 내 컴퓨터의 `claude -p`로 작업을 돌리고, Claude Code는 Claude 디자인 캔버스를 만들고 고칠 수 있어요(`/design`, 디자인 캔버스 도구). 이번 시험이 그 작업을 그대로 해 본 것 |
| 캔버스 → 우리 템플릿 | Claude 디자인 내보내기의 **Handoff to Claude Code**(로컬 에이전트로 보내기) 또는 HTML·zip 내보내기. 캔버스 화면이 원래 HTML/CSS라 `templates/`로 옮기기 쉬움 |
| PNG 생산 | 지금처럼 `npm run render`. Claude 디자인은 디자인할 때 쓰는 도구 (내보내기는 PDF·PPTX·HTML·zip, PNG 대량 생산 기능 없음) |

```
웹 제작 화면 ──(작업 실행기, claude -p)──▶ 로컬 Claude Code ──▶ Claude 디자인 캔버스 (5장 시안)
     ▲                                                         │ 사람이 보고 고침·댓글
     │                                                         ▼
 npm run render ◀── templates/ ◀── Handoff to Claude Code (HTML → 템플릿, 문구 칸 data-field)
```

## 이번에 만든 것

### 1. 자료 묶음 `npm run design-pack -- <제품ID>`

블로그 방식(자료를 폴더 하나에 모아 지침 파일과 함께 넣기)을 우리 제품 폴더에서 자동으로 만든다. 결과는 `products/<제품ID>/output/design-pack/` (git 제외). 예시: [claude-design-test/pack-example/](claude-design-test/pack-example/)

| 파일 | 내용 |
|---|---|
| `brief.md` | 카드 수·크기, 카드별 승인 문구(그대로), 템플릿별 글자 수 기준, 카드 색·대비 기준, 내용 규칙(원문 밖 효능 금지), 사진 규칙(실제 사진만·생성 금지), 피할 것 |
| `prompt.md` | 처음 한 번에 넣을 요청문. 블로그 조언대로 한 번에 자세히 |
| `cards.json` | 디자인에 필요한 칸만 뽑은 문구 |
| `images/` | 제품 사진: 투명 여백 + **사진 아래 붙은 반투명 그림자(알파 200 이하)를 잘라냄** (표지 2차 수정에서 찾은 문제). 퍼플 500×500 → 157×351 |
| `fonts/` | Pretendard 400·600·800 |

이 폴더는 두 가지로 쓸 수 있다: ① 사람이 Claude 디자인 화면에 끌어다 놓기(블로그 방식), ② 로컬 Claude Code가 캔버스를 만들 때 자료로 읽기(웹 연결).

### 2. 캔버스 시험 (②를 직접 재현)

자료 묶음만 보고 Claude 디자인 캔버스에 5장을 만들었다. 방향은 표지 시안 B(에디토리얼) — 생성 이미지 없이 글자·도형만이라 템플릿으로 옮기기 가장 쉬움.

- 글꼴: Pretendard를 캔버스 자산으로 올려 `@font-face`로 씀 → **피그마에서 막혔던 Pretendard 문제 없음**. 영문 장식은 Google Fonts Playfair Display 이탤릭
- 줄바꿈: `word-break: keep-all` 그대로 → **피그마의 글자 단위 줄바꿈 문제 없음**
- 문구 칸에 `data-field="title"` 등 칸 이름 → 템플릿의 `{{title}}`로 바꾸기 쉬움
- 색은 속성 패널(Tweaks)에서 강조색 하나로 바꿔볼 수 있게 함
- 5장 구성: 표지(큰 'Tone-up' 위 제품) → Point 01(오른쪽 라일락 면 + 큰 '3') → Point 02(가는 선 목록 + 노랑·보라 겹친 원) → How to use(짙은 보라 바탕, 3단) → 마무리(아치 면 + 오른쪽 글)

## 웹 제작 화면에 붙이려면 (아직 안 함)

작업 실행기(`scripts/lib/job-runner.js`)는 지금 `--tools Read,Edit,Write,Glob,Grep,Bash,Skill` + `--strict-mcp-config`로 도구를 막는다. 디자인 시안 작업은 이 목록에 **Claude 디자인 캔버스 도구**가 있어야 한다. 그래서 순서는:

1. **이규동 Mac에서 확인** (사용량 조금 씀): 로그인된 Claude Code에서 캔버스 도구가 보이는지
   ```bash
   cd ~/git/Cardnews-automation
   claude -p "지금 쓸 수 있는 도구 중 Claude 디자인(디자인 캔버스·아티팩트) 도구의 정확한 이름만 한 줄로 답해. 없으면 '없음'."
   ```
2. 이름이 나오면: 작업 종류 `design`을 따로 두고(제작 작업 `plan`·`copy`·`revise`와 섞지 않음) 그 작업만 `TOOLS`에 캔버스 도구 추가, 쓰기는 `output/design-pack/` 읽기만 허용. 지시문은 [prompts/web/design.md](../../prompts/web/design.md)(초안)
3. 웹 제작 화면: 최종 승인한 제품에 '디자인 시안 만들기' 버튼 → 작업 끝나면 캔버스 링크 표시
4. 안 나오면: 웹에는 '디자인 자료 받기'(자료 묶음 zip)만 두고, 사람이 Claude 디자인에 끌어다 놓는 블로그 방식으로

## 주의

- 사용량: Claude 디자인은 Claude·Claude Code와 같은 사용량을 씀. 요청은 한 번에 자세히(`prompt.md`), 고칠 점은 모아서 한 번에
- 캔버스는 claude.ai 아티팩트라 기본 비공개. 이용석에게 보이려면 캔버스 Share에서 공유
- 캔버스 화면은 디자인 확인용. 그대로 `templates/`에 넣지 않고, 글자 수 기준까지 채운 문구로 넘침을 다시 재야 함(`npm run calibrate`)
- 제품 사진 원본이 작아(500px) 크게 키우면 흐림. 사진 품질이 디자인 품질의 상한
