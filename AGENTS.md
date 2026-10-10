# 카드뉴스 제작 자동화 — 에이전트 안내

Claude Code와 Codex는 같은 목표·완료 조건·인수인계 기록으로 작업한다. 사용자의 현재 요청으로 작업 종류를 먼저 판단한다.

## 작업 종류

- **서비스 실행**: 지시문이 `[서비스 모드]`로 시작하면 [CLAUDE.md](CLAUDE.md)의 서비스 규칙과 지정된 제작 Skill만 따른다. 개발용 공통 맥락·인수인계 문서를 읽거나 갱신하지 않는다.
- **프로젝트 개발**: 코드·웹·설정·문서를 구현하거나 고치는 요청은 [공통 맥락](docs/project-context.md)과 [인수인계](docs/handoff.md)를 먼저 읽는다. 이후 필요한 파일만 추가로 확인한다. 브랜치·검증·PR 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md)를 따른다.
- **카드뉴스 제작·수정**: 특정 제품의 카드를 만드는 요청은 [CLAUDE.md](CLAUDE.md)의 제작 절차를 따른다. 콘텐츠 작업은 [.claude/skills/cardnews-content/SKILL.md](.claude/skills/cardnews-content/SKILL.md), 출력 작업은 [.claude/skills/cardnews-render/SKILL.md](.claude/skills/cardnews-render/SKILL.md)를 해당 단계에서 읽는다. Codex에서도 이 파일의 절차를 참조하며 별도 사본을 만들지 않는다.

`CLAUDE.md`의 “개발 모드”는 팀원이 대화로 **카드를 제작하는 실행 방식**이다. 그 제작 중 쓰기·명령 제한을 프로젝트 코드 개발 전체에 적용하지 않는다. 반대로 서비스 실행의 제한을 개발 지침으로 완화하지 않는다.

## 교대

- 공통 운영 규칙은 `docs/project-context.md`, 현재 목표와 검증 상태는 `docs/handoff.md` 한 곳에서 관리한다.
- 프로젝트 개발을 시작할 때 실제 브랜치·파일 변경을 인수인계와 대조한다. 기존 변경을 보존한다.
- 작은 작업의 완료·중단 지점마다 인수인계를 갱신한다. 교대 전 편집·실행을 끝내고, 같은 체크아웃에서 두 도구가 동시에 수정하지 않는다.
- 카드 제작만 수행한 경우 제작 상태·승인은 `cards.json`과 제작 로그가 기준이다. 개발 인수인계를 대신 갱신하거나 승인 기록을 추정하지 않는다.
