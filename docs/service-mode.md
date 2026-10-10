# 서비스 모드 연결 규격 — 초안 v0.1

관리자 웹 서버가 Agent SDK로 이 저장소의 `CLAUDE.md`·Skill·스크립트를 **그대로** 실행하기 위한 약속입니다.
웹 서버 코드는 아직 없고, 이 문서는 서버를 만들 때 지킬 규격입니다. 표시한 부분은 Agent SDK PoC에서 확인합니다.

## 작업 흐름

```
입력 폼 제출 → [서버] input.md·images/ 생성, input_submitted 기록
  → 구성안 작업(prompts/plan.md) → 관리자 구성안 확인
      ├ 승인 → plan_approved → 문구·출력 작업(prompts/copy.md) → 관리자 카드 검토
      │          ├ 승인 → [서버] stage를 approved로 바꿈, final_approved
      │          └ 수정 요청 → revision_requested → 수정 작업(prompts/revise.md, stage final)
      └ 수정 요청 → revision_requested → 수정 작업(prompts/revise.md, stage plan)
```

- 작업 하나 = `query()` 한 번. 승인 대기는 세션을 잇지 않고 다음 작업으로 나눕니다.
- 작업 지시문은 `prompts/*.md`의 `{{...}}`를 채워서 만듭니다. 규칙은 지시문에 다시 쓰지 않고 `CLAUDE.md`에 둡니다.

## 작업 폴더 (`/data/jobs/<job_id>/`)

작업마다 아래처럼 만들고, 이 폴더를 `cwd`로 실행합니다. 실패해도 프로젝트 폴더의 이전 결과는 그대로입니다.

| 경로 | 만드는 방법 |
|---|---|
| `CLAUDE.md`, `.claude/`, `config/`, `docs/`, `templates/`, `scripts/`, `package.json` | 앱 폴더에서 복사 (규칙 한 벌). 개발용 `AGENTS.md`, `docs/project-context.md`, `docs/handoff.md`는 빼고 복사 |
| `node_modules/` | 앱 폴더로 심볼릭 링크 (Playwright·Pretendard) |
| `products/<project_id>/` | `/data/projects/<project_id>/`에서 복사. 단, `log.jsonl`·`.job.json`은 빼고 복사 |

작업이 끝나면 서버가:

1. `npm run validate -- <project_id> --no-log`를 다시 실행해 결과를 판정합니다. (Claude의 답변만 믿지 않음)
2. 작업 폴더의 `products/<project_id>/log.jsonl`(검증 결과 기록)을 DB `EVENT`로 옮깁니다.
3. 성공이면 `cards.json`, `output/`(PNG, `quality.json`, `render-report*.json`)을 프로젝트 폴더에 반영하고, 카드 버전(`CARD_VERSION`)을 저장합니다.
4. `job_finished`에 토큰·비용을 기록하고 작업 폴더를 지웁니다.

## Agent SDK 실행 옵션

실제 구현은 `scripts/service/job.js`의 `buildQueryOptions()`예요. `@anthropic-ai/claude-agent-sdk` 0.3.296의 타입 정의로 확인했어요.

```js
const options = {
  cwd: jobDir,
  settingSources: ['project'],                          // 작업 폴더의 CLAUDE.md·.claude/만 (사용자 설정 제외). CLAUDE.md를 읽으려면 'project'가 있어야 함
  systemPrompt: { type: 'preset', preset: 'claude_code' },
  skills: ['cardnews-content', 'cardnews-render'],      // Skill 켜기. allowedTools에 'Skill'을 넣을 필요 없음
  tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],   // 모델이 쓸 수 있는 도구 자체를 제한
  allowedTools: [                                       // 묻지 않고 허용하는 것 (나머지는 dontAsk로 거부)
    'Read(./**)', 'Glob', 'Grep',
    `Edit(./products/${pid}/cards.json)`, `Write(./products/${pid}/cards.json)`,
    `Bash(npm run check -- ${pid})`, `Bash(npm run validate -- ${pid})`,
    `Bash(npm run render -- ${pid})`, `Bash(npm run render -- ${pid}:*)`,
  ],
  permissionMode: 'dontAsk',                            // 허용 목록 밖은 묻지 않고 거부 → result.permission_denials에 기록
  maxTurns: Number(process.env.AGENT_MAX_TURNS ?? 30),
  maxBudgetUsd: Number(process.env.AGENT_MAX_BUDGET_USD ?? 1),
  model: process.env.AGENT_MODEL,                       // 선택. 예: 'sonnet'
  env: {                                                // 지정하면 환경변수 전체를 대체함 → 필요한 값만
    PATH, ANTHROPIC_API_KEY,
    HOME: `${jobDir}/.home`,                            // 작업마다 따로. 프로젝트 .claude와 겹치지 않게 별도 폴더
    CARDNEWS_MODE: 'service', CARDNEWS_JOB_ID: jobId, CARDNEWS_JOB_KIND: kind,
    PLAYWRIGHT_BROWSERS_PATH,                           // HOME을 바꾸면 기본 브라우저 위치를 못 찾으므로 원래 위치를 넘김
  },
};
```

- 결과 메시지: `subtype`(`success` · `error_max_turns` · `error_max_budget_usd` · `error_during_execution`), `is_error`, `total_cost_usd`, `modelUsage`(모델별 토큰), `permission_denials`(거부된 도구 호출), `result`(마지막 답변).
- API 오류(예: 크레딧 부족)는 `subtype: 'success'`, `is_error: true`인 결과를 낸 뒤 예외가 나요. 실행기는 이 경우를 `API_CREDIT`·`error_during_execution`으로 기록하고 반영하지 않아요.
- 관리자 비밀번호 해시, 세션 비밀값 같은 웹 서버 환경변수는 `env`에 넘기지 않습니다.
- 인증은 API 키만 씁니다. Anthropic이 따로 승인하지 않으면 SDK로 만든 제품에 claude.ai 로그인·구독 사용량을 쓸 수 없어요. ([Agent SDK 개요](https://code.claude.com/docs/en/agent-sdk/overview))

## 실행해 보기 (PoC)

```bash
# 저장소 루트 .env에 ANTHROPIC_API_KEY (DATA_DIR 줄은 지우면 저장소의 data/ 사용)
npm run job -- plan poc-toneup --from toneup-sunscreen --model sonnet   # 작업 하나
npm run poc -- --model sonnet                                             # 확인 항목 전체 (약 1~3달러)
```

- 프로젝트 저장소는 `data/projects/<ID>`, 작업 폴더는 `data/jobs/<작업ID>`(끝나면 삭제, `--keep`이면 남김), 보고서는 `data/reports/<작업ID>.json`. `data/`는 커밋되지 않아요.
- 보고서에는 API 키가 섞여 들어와도 `[REDACTED]`로 가려요. 권한 점검(C5)은 실제 비밀이 아닌 가짜 파일만 노려요.

## 키 없이 실행해 보기 (`--executor manual`)

API 크레딧 없이 작업 폴더·지시문·서버 재검증·반영·기록 흐름을 확인하는 방법이에요. `query()` 대신 **사람이 연 Claude Code 대화가 작업 폴더에서 지시문대로 작업**하고, 마무리는 SDK 실행과 같은 코드(`finishJob`)가 해요.

```bash
npm run job -- plan poc-toneup --from toneup-sunscreen --executor manual
# → 작업 폴더(data/jobs/<작업ID>)와 지시문, 명령에 붙일 환경변수(CARDNEWS_MODE·CARDNEWS_JOB_ID·CARDNEWS_JOB_KIND)를 출력하고 끝남
# Claude Code: 작업 폴더를 작업 위치로 삼아 지시문대로 작업 → 마지막 결과 보고를 파일로 저장
npm run job -- finish <작업ID> --report <결과 보고 파일>
# → 서버 재검증 → 성공이면 cards.json·output/ 반영 → job_finished 기록 → 작업 폴더 삭제
```

- 결과 보고가 없으면 `NO_REPORT`, `결과: 중단`이면 재검증을 통과해도 반영하지 않아요 (SDK 실행도 같은 기준).
- 기록의 `job_started`·`job_finished`에 `executor: "manual"`이 붙고, 토큰·비용은 `null`이에요. 지표 비교에서 SDK 실행과 섞지 않아요.
- **확인할 수 없는 것**: `allowedTools`·`dontAsk` 권한 제한, `maxTurns`·`maxBudgetUsd`, 토큰·비용 기록, `skills` 옵션으로 Skill 불러오기. 대화의 Claude Code는 이 제한 없이 규칙을 지켜서 작업하므로, 이 항목들은 SDK 실행으로만 확인해요.
- SDK 코드는 그대로 둬요. API 키가 있을 때 `npm run job`(기본 `--executor sdk`)·`npm run poc`로 바로 실행할 수 있어요. 테스트는 가짜 `query()`를 써서 API를 부르지 않아요.
- 시스템 Chromium을 쓰는 환경(예: 클라우드 작업 공간)에서는 명령에 `CHROMIUM_PATH`를 붙여요.

## 환경변수

`.env.example` 참고. 작업마다 서버가 넣는 값(`CARDNEWS_MODE`, `CARDNEWS_JOB_ID`, `CARDNEWS_JOB_KIND`)은 `.env`에 쓰지 않습니다.

| 이름 | 쓰는 곳 |
|---|---|
| `CARDNEWS_MODE=service` | `log.js`가 기록하지 않음 (서버가 기록) |
| `CARDNEWS_JOB_ID`, `CARDNEWS_JOB_KIND` | 스크립트가 남기는 `validate_result`에 작업 ID를 붙임 |
| `CARDNEWS_NO_LOG=1` | 검증 결과를 기록하지 않음 (`--no-log`와 같음) |
| `CHROMIUM_PATH` | 시스템 Chromium을 쓸 때 실행 파일 경로 |
| `CARDNEWS_PRODUCTS_DIR` | 제품 폴더 위치 (기본 `products/`). 테스트가 임시 폴더를 쓸 때 사용 |

## PoC에서 확인할 것

상태: ✅ 확인 · 🟡 키 없이(manual) 흐름만 확인 · ⬜ 미확인 (API 크레딧 필요). 2026-10-10 기준.

- 🟡 `settingSources: ['project']`로 작업 폴더의 `CLAUDE.md`와 두 Skill이 불러와지고 Skill이 실제로 호출되는지
  - SDK: 크레딧 오류로 끝난 실행의 init 메시지에서 `skills`에 `cardnews-content`·`cardnews-render`, `tools` 6개, `permissionMode: dontAsk`, `apiKeySource: ANTHROPIC_API_KEY` 확인. 실제 Skill 호출은 미확인
  - init에 기본 Skill(deep-research 등)·플러그인 목록도 함께 나옴. 모델에 노출되는지는 미확인
- 🟡 서비스 실행이 개발 문서(`docs/project-context.md`, `docs/handoff.md`, `AGENTS.md`)를 읽지 않는지 → 작업 폴더에 복사하지 않음 (테스트·manual 실행으로 확인). SDK 실행의 도구 호출 기록은 미확인
- ⬜ `tools`에 `Skill`을 넣어야 하는지, `skills` 옵션만으로 되는지 (SDK 타입 정의상 `skills`만으로 됨)
- ⬜ `permissionMode: 'dontAsk'` + `allowedTools`로 허용 밖 명령(`ls`, `cat .env`, `curl` 등)이 막히는지 (`npm run poc -- --only C5`)
- ⬜ `Edit(./products/<pid>/cards.json)` 규칙이 작업 폴더 기준 경로로 동작하는지, 다른 파일 쓰기가 막히는지 (C5)
- ⬜ `maxTurns`·`maxBudgetUsd`에 걸렸을 때 결과 메시지와 작업 폴더 상태 (C6). 실행기 처리(반영 안 함, 실패 기록)는 가짜 `query()` 테스트로 확인
- ⬜ 결과 메시지의 `total_cost_usd`, `modelUsage`로 작업별 토큰·비용 기록. 기록 코드는 가짜 `query()` 테스트로 확인
- 🟡 제품 설명에 지시문을 넣은 테스트 자료로 '입력 자료 취급' 규칙 확인: manual 실행에서 지시문 4개 경고·무시, `cards.json`에 지시문 문장 없음. SDK 모델의 동작은 미확인 (C3)
- ✅ 작업 흐름 (manual 실행, 가상 톤업 선크림): 구성안 작업 → 반영 → 문구·출력 작업(PNG 5장, 레이아웃 오류 0) → 반영. 작업 폴더의 `node_modules` 링크로 렌더링 동작, 검증 기록에 작업 ID가 붙음
- ✅ 입력 누락 자료: `결과: 중단`·`INPUT_MISSING` 보고 → 반영 안 함, `job_finished`에 `ok: false`·`INPUT_MISSING` (manual 실행)
- ✅ API 오류(크레딧 부족): 반영하지 않고 `API_CREDIT`으로 기록 (실제 SDK 실행)
- ⬜ 동시 작업 1~2개일 때 메모리 사용량
