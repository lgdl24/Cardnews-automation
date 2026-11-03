# AI 디자인 카드 (첫·마지막 카드를 GPT 이미지로) + 피그마 자동 넣기

- 상태: **구현·실제 확인** (2026-11-03, 이규동 요청 · Claude). 브랜치 `feat/ai-card` (`feat/figma-link` 위)
- 제작 규칙(문구·근거 검증)·템플릿은 그대로. 첫·마지막 카드의 **그림만** GPT가 만들고, 문구는 `cards.json` 승인 문구만 넣음

## 흐름

```
문구·출력 작업 성공 (웹 모드 copy·revise)
  └▶ 작업실이 자동으로 node scripts/ai-card.js <ID> --stale  (버튼 없음, 첫·마지막 카드 중 없거나 문구가 바뀐 것만)
        1) 제품 사진 누끼를 정해진 자리에 놓은 바탕(base.png) + 요청문
        2) 로컬 Codex CLI(GPT 이미지, ChatGPT 로그인 사용량): codex exec -i base.png ($imagegen) → 배경·문구만 만들게 함
        3) 제품 잠금 검사: AI 결과의 제품 자리 vs 원본 (색 차이 ≤ 18, 이동 ≤ 4px). 어긋나면 다시 (3번까지)
        4) 원본 제품 픽셀을 같은 자리에 다시 덮음 → 최종본의 제품은 항상 원본 사진
        5) output/png/card-NN.png 에 넣고 템플릿 출력은 output/ai-card/template-card-NN.png 로 보관
  └▶ 작업실 '피그마에서 편집'
        figma-export --page-name '제품명 (ID) · 월.일 시:분' (AI 카드는 완성 이미지 한 장, 2~4번은 글자·도형·사진 레이어)
        → 로컬 claude -p 가 피그마 연결(MCP)로 새 페이지 → upload_assets → scripts/figma-push.js upload → build-*.js 실행
        → 1~3분 뒤 작업실에 '넣은 페이지 열기'
```

- 만드는 동안 최종 승인·내보내기·피그마 보내기는 기다림 (`actions.ai_busy`)
- 수정 요청으로 1·마지막 카드 문구가 바뀌면 그 카드만 다시 만듦 (`ai-card.json`의 카드별 `key` = 문구·사진·템플릿 해시). `npm run render`로 다시 출력해도 문구가 그대로면 AI 카드 유지
- 실패하면(Codex 없음·사용량 초과·제품 어긋남) 템플릿 카드가 그대로 최종 카드
- 끄기: `CARDNEWS_AI_CARD=off`(AI 카드), `CARDNEWS_FIGMA_PUSH=off`(피그마 자동 넣기 → 플러그인 방식)

## 필요한 것 (작업실을 켜는 컴퓨터)

- Codex CLI: `npm install -g @openai/codex` → `codex login`(ChatGPT Plus 이상)
- Claude Code에 피그마 연결 (claude.ai 커넥터 'Figma'가 `claude mcp list`에 Connected)
- `config/figma.json` `file_url` = 넣을 피그마 파일

## 시험 결과

| 확인 | 결과 |
|---|---|
| 인터넷 화장품 5종 + 퍼플, 1·5번 12장 (제품 잠금) | 문구 12/12 정확, 제품 유지 12/12 (차이 4~13, 이동 ≤ 2px). 장당 약 1.5분 |
| Codex가 지시를 어기고 스크립트로 글자·제품을 얹은 경우 | 잠금 점수가 잡음(28점) → 요청문에 '스크립트 금지' 추가 후 정상 |
| `npm run ai-card` 실제 실행 (퍼플·젤크림) | 1·5번 첫 시도 통과, 두 장 2분 반 |
| 피그마 자동 넣기 (젤크림, 작업실과 같은 코드) | 110초, 새 페이지에 1~5번 |
| 자동 테스트 | `tests/ai-card.test.js`(요청문·상자·잠금 점수·API·최종 반영), `tests/figma-plugin.test.js`(자동 넣기) |

아직 못 한 것: 새 제품을 웹에서 처음부터 만들어 문구·출력 직후 자동 생성이 도는 것의 실제 확인 (테스트로만 확인). AI가 그린 문구의 자동 확인(지금은 화면에 [주의]로 사람이 확인).
