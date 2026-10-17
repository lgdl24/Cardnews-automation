# 카드뉴스 제작 자동화 — 에이전트 안내 (Codex)

Claude Code와 Codex는 같은 목표·완료 조건·인수인계로 이 저장소를 교대로 개발한다. Claude Code의 진입점은 [CLAUDE.md](CLAUDE.md), Codex의 진입점은 이 파일이다. 규칙 원본은 아래 링크 한 곳씩이며, 이 파일에 규칙을 복사하지 않는다.

## 시작할 때

1. [인수인계](docs/handoff.md)의 **최근 변경**과 **현재 작업**을 읽는다. 마지막 작업 이후 바뀐 규칙·용어·파일이 여기에 있다.
2. `git status --short --branch`, `git log --oneline -5`로 실제 상태를 인수인계와 대조한다. 다르면 실제 상태를 기준으로 인수인계를 바로잡는다.
3. 요청 종류를 판단한다.

## 요청 종류

| 요청 | 따를 것 |
|---|---|
| 작업 지시문이 `[평가 모드]`로 시작 | [CLAUDE.md](CLAUDE.md)의 평가 모드 규칙과 지정된 Skill만. 개발 문서(`docs/project-context.md`, `docs/handoff.md`)는 읽지도 고치지도 않는다. |
| 특정 제품의 카드 제작·수정 | [CLAUDE.md](CLAUDE.md)의 대화 모드 절차. 콘텐츠는 [cardnews-content](.claude/skills/cardnews-content/SKILL.md), 출력은 [cardnews-render](.claude/skills/cardnews-render/SKILL.md)를 해당 단계에서 읽는다. Codex도 이 Skill 파일을 그대로 참조하고 사본을 만들지 않는다. |
| 코드·웹·설정·문서 개발 (프로젝트 개발) | [공통 맥락](docs/project-context.md)의 '개발 작업 규칙'과 [CONTRIBUTING.md](CONTRIBUTING.md)의 이슈·브랜치·PR 흐름. |

용어: **대화 모드**는 팀원이 터미널 대화로 카드를 만드는 제작 방식, **평가 모드**는 평가 실행기(`npm run eval`)가 `claude -p`로 작업 하나씩 실행하는 제작 방식, **프로젝트 개발**은 이 저장소의 코드·문서를 고치는 작업이다. 카드 제작 중의 쓰기 제한(`cards.json`만)은 프로젝트 개발에 적용하지 않고, 평가 모드의 제한을 개발 지침으로 완화하지도 않는다.

## 작업 흐름 요약

- `main`에 직접 push하지 않는다. 이슈 → 브랜치(`<종류>/<이슈번호>-<설명>`) → 커밋(`#이슈번호`) → push → PR. **`main` 병합은 저장소 관리자가 결정한다.**
- 작은 작업이 끝나거나 중단될 때마다 [인수인계](docs/handoff.md)를 갱신하고, 바뀐 규칙·용어·파일은 **최근 변경**에 한 줄로 남긴다.
- 같은 폴더에서 두 도구가 동시에 수정하지 않는다. 교대 전에 편집·실행을 끝낸다.
- 카드 제작만 했다면 제작 상태·승인은 `cards.json`과 제작 기록이 기준이다. 인수인계로 승인을 대신하거나 추정하지 않는다.
