# 협업 규칙

팀원 3명이 같은 저장소에서 작업할 때 지키는 최소 규칙입니다. 진행 상황은 노션 '작업 트래커'에서 관리합니다.

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

## 브랜치

- `main`은 항상 `npm test`가 통과하는 상태로 둡니다. 직접 push하지 않고 PR로 합칩니다.
- 브랜치 이름: `<종류>/<짧은-설명>` — 예: `feat/json-schema`, `fix/char-count`, `docs/input-form`

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
feat: 설명형 템플릿 항목 4개까지 허용

글자 수 기준 조정 결과 4개도 넘침 없이 들어가서 maxItems를 4로 올림
```

## PR 전에 확인

- [ ] `npm test` 통과 (템플릿·출력을 고쳤다면 `npm run test:render`도)
- [ ] 노션 작업 트래커의 해당 하위 작업을 PR에 적음
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
| `tests/check-input.test.js` | 입력 누락 (`INPUT_MISSING`) |
| `tests/validate.test.js` | 형식·근거·글자 수 오류, 주의 표현, 품질 지표 |
| `tests/cli.test.js` | 명령 종료 코드, 제작 기록 자동 저장, `log.js` |
| `tests/render.test.js` | PNG 크기·장수, 카드 1장 재출력, 레이아웃 기록 |

테스트는 `CARDNEWS_PRODUCTS_DIR`로 임시 폴더를 쓰므로 실제 `products/`와 제작 기록을 건드리지 않습니다.
