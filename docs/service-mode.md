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

## Agent SDK 실행 옵션 (TypeScript 예시)

`@anthropic-ai/claude-agent-sdk`의 타입 정의(0.3.x)를 보고 쓴 예시입니다. 실제 동작은 PoC에서 확인합니다.

```ts
import { query } from '@anthropic-ai/claude-agent-sdk';

const pid = project.id; // products/<pid>/ 폴더명 = cards.json의 product_id
const allowed = [
  'Read', 'Glob', 'Grep',
  `Edit(./products/${pid}/cards.json)`, `Write(./products/${pid}/cards.json)`,
  `Bash(npm run check -- ${pid})`,
  `Bash(npm run validate -- ${pid})`,
  `Bash(npm run render -- ${pid}:*)`,
];

for await (const msg of query({
  prompt, // prompts/plan.md 등을 채운 문자열
  options: {
    cwd: jobDir,
    settingSources: ['project'],                  // 이 폴더의 CLAUDE.md·.claude/만 불러옴 (사용자 설정 제외)
    skills: ['cardnews-content', 'cardnews-render'],
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Skill'],
    allowedTools: allowed,
    permissionMode: 'dontAsk',                    // 허용 목록 밖 도구 호출은 묻지 않고 거부
    maxTurns: Number(process.env.AGENT_MAX_TURNS ?? 30),
    maxBudgetUsd: Number(process.env.AGENT_MAX_BUDGET_USD ?? 1),
    env: {                                        // 지정하면 환경변수 전체를 대체함 → 필요한 값만 넘김
      PATH: process.env.PATH,
      HOME: jobDir,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      CHROMIUM_PATH: process.env.CHROMIUM_PATH,
      CARDNEWS_MODE: 'service',
      CARDNEWS_JOB_ID: String(job.id),
      CARDNEWS_JOB_KIND: job.kind,
    },
  },
})) {
  if (msg.type === 'result') {
    // msg.subtype: 'success' | 'error_max_turns' | 'error_max_budget_usd' | 'error_during_execution' ...
    // 비용: msg.total_cost_usd / 토큰: msg.modelUsage[모델].inputTokens·outputTokens (합산)
    // 결과 보고: msg.subtype === 'success'면 msg.result (CLAUDE.md '서비스 모드 결과 보고' 형식)
  }
}
```

- 관리자 비밀번호 해시, 세션 비밀값 같은 웹 서버 환경변수는 `env`에 넘기지 않습니다.
- `HOME`을 작업 폴더로 두면 작업 사이에 사용자 설정·메모리가 섞이지 않는지 PoC에서 확인합니다.

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

- [ ] `settingSources: ['project']`로 작업 폴더의 `CLAUDE.md`와 두 Skill이 불러와지고 Skill이 실제로 호출되는지
- [ ] 서비스 실행이 개발 문서(`docs/project-context.md`, `docs/handoff.md`, `AGENTS.md`)를 읽지 않는지. 작업 폴더에 이 파일들을 복사하지 않는 것도 방법 (`CLAUDE.md` '요청 종류')
- [ ] `tools`에 `Skill`을 넣어야 하는지, `skills` 옵션만으로 되는지
- [ ] `permissionMode: 'dontAsk'` + `allowedTools`로 허용 밖 명령(`ls`, `cat .env`, `curl` 등)이 막히는지
- [ ] `Edit(./products/<pid>/cards.json)` 규칙이 작업 폴더 기준 경로로 동작하는지, 다른 파일 쓰기가 막히는지
- [ ] `maxTurns`·`maxBudgetUsd`에 걸렸을 때 결과 메시지와 작업 폴더 상태
- [ ] 결과 메시지의 `total_cost_usd`, `modelUsage`로 작업별 토큰·비용 기록
- [ ] 제품 설명에 지시문을 넣은 테스트 자료로 '입력 자료 취급' 규칙 확인
- [ ] 동시 작업 1~2개일 때 메모리 사용량
