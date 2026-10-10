# 협업 규칙

팀원이 같은 저장소에서 작업할 때 지키는 최소 규칙입니다. 진행 상황은 노션 '작업 트래커'에서 관리합니다.

Claude Code·Codex의 교대 개발은 [공통 맥락](docs/project-context.md)의 '개발 작업 규칙'을 따르고, 현재 목표·검증 결과·다음 행동과 최근 변경은 [인수인계](docs/handoff.md)에 기록합니다. 노션에는 팀 진행 상황을, 인수인계에는 다음 도구가 이어갈 최신 개발 상태를 남깁니다.

## 처음 받을 때

```bash
git clone https://github.com/lgdl24/Cardnews-automation.git
cd Cardnews-automation
nvm use                          # .nvmrc (Node 22). nvm이 없으면 Node 20 이상
npm install
npx playwright install chromium  # PNG 출력용 (최초 1회)
npm test                         # 검사 기능 테스트
npm run test:render              # 출력 테스트 (브라우저 필요)
```

## 작업 흐름: 이슈 → 브랜치 → PR

사람이든 Claude Code·Codex든 같은 순서로 작업합니다.

1. **이슈**: 할 일·완료 조건을 GitHub 이슈로 만듭니다. (예: `#1 Claude Code·Codex 교대 개발 문서 정리`)
2. **브랜치**: 최신 `main`에서 `<종류>/<이슈번호>-<짧은-설명>` 브랜치를 만듭니다. 예: `docs/1-agent-handoff`, `feat/7-agent-sdk-poc`
3. **커밋**: 메시지 끝에 `(#이슈번호)`를 붙입니다.
4. **push·PR**: 브랜치를 push하고 PR을 엽니다. 본문에 `Closes #이슈번호`, 검증 결과, 노션 하위 작업을 적습니다.
5. **병합**: `main` 병합은 저장소 관리자가 PR을 검토한 뒤 결정합니다. 도구(Claude Code·Codex)는 병합하지 않습니다.

## 브랜치

- `main`은 항상 `npm test`가 통과하는 상태로 둡니다. 직접 push하지 않고 PR로 합칩니다.
- 브랜치 이름: `<종류>/<이슈번호>-<짧은-설명>` — 예: `feat/12-json-schema`, `fix/15-char-count`, `docs/1-agent-handoff`

| 종류 | 쓰는 때 |
|---|---|
| `feat` | 기능 추가 (스크립트, 템플릿, Skill 절차) |
| `fix` | 버그 수정 |
| `docs` | 문서만 수정 |
| `test` | 테스트·테스트 자료만 수정 |
| `chore` | 설정, 의존성, 폴더 정리 |

## 커밋 메시지

`<종류>: <무엇을 했는지>` 한 줄, 필요하면 빈 줄 뒤에 이유를 적습니다.

```
feat: 설명형 템플릿 항목 4개까지 허용 (#12)

글자 수 기준 조정 결과 4개도 넘침 없이 들어가서 maxItems를 4로 올림
```

## PR 전에 확인

- [ ] `npm test` 통과 (템플릿·출력을 고쳤다면 `npm run test:render`도)
- [ ] 템플릿 CSS를 고쳤다면 `npm run calibrate`로 다시 재고, 필요하면 `config/templates.json` 기준과 `docs/card-data-spec.md` 표를 함께 고침
- [ ] 규격(입력 양식·카드 데이터)을 고쳤다면 `config/input-form.json`·`schemas/cards.schema.json`·문서를 함께 고침 (`tests/spec.test.js`가 확인)
- [ ] 노션 작업 트래커의 해당 하위 작업을 PR에 적음
- [ ] [인수인계](docs/handoff.md)의 현재 작업·최근 변경을 갱신함
- [ ] 결과에 영향을 주는 규칙(`CLAUDE.md`, Skill, `config/`)을 바꿨다면 `config/skill-version.json` 버전 변경을 팀과 논의함
- [ ] `products/<제품ID>/output/`, `.env`, 실제 API 키가 커밋에 없음

## 테스트 추가하기

검사 기능을 고치거나 오류 상황을 새로 발견하면 테스트 경우를 하나 추가합니다.
예시 제품(`products/toneup-sunscreen`)을 임시 폴더에 복사해 일부만 바꾸는 방식이라, 테스트 자료 파일을 따로 만들 필요가 없습니다.

```js
// tests/validate.test.js 의 cases 배열에 추가
{
  name: '부제목이 글자 수 기준을 넘으면 CHAR_LIMIT',
  edit: (ws) => ws.editCards((d) => { d.cards[0].copy.subtitle = '...아주 긴 부제목...'; }),
  expect: ['CHAR_LIMIT'],
  where: '1번 카드.copy.subtitle',
},
```

| 파일 | 확인하는 것 |
|---|---|
| `tests/check-input.test.js` | 입력 누락 (`INPUT_MISSING`), 지시문 형태 문장 탐지·오탐, 테스트용 입력 자료(`products/test-*`) |
| `tests/validate.test.js` | 형식·근거·글자 수 오류, 주의 표현, 품질 지표 |
| `tests/cli.test.js` | 명령 종료 코드, 제작 기록 자동 저장, `log.js` |
| `tests/spec.test.js` | 규격 파일(JSON 스키마·입력 양식 정의·글자 수 기준)과 검사 코드·문서가 같은지, 템플릿이 색 토큰만 쓰는지 |
| `tests/render.test.js` | PNG 크기·장수, 카드 1장 재출력, 레이아웃 기록 |
| `tests/calibrate.test.js` | 모든 칸을 글자 수 기준까지 채워도 넘치거나 이미지와 겹치지 않는지 |

테스트는 `CARDNEWS_PRODUCTS_DIR`로 임시 폴더를 쓰므로 실제 `products/`와 제작 기록을 건드리지 않습니다.
