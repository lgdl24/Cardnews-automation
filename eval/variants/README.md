# 평가 비교판 (A8)

규칙 일부를 바꾼 판으로 평가 세트를 돌려, 각 규칙이 어떤 오류를 줄이는지 봅니다. (`docs/eval-spec.md` '비교판')

```
eval/variants/<비교판 이름>/
├── variant.json     # { "description": "무엇을 뺐는지 한 줄", "changes": ["파일별 바꾼 점", ...] }
└── files/           # 바꾼 파일. 저장소와 같은 경로로 둠
    ├── CLAUDE.md
    ├── .claude/skills/cardnews-content/SKILL.md
    └── prompts/eval/copy.md
```

```bash
npm run eval -- --batch a8 --variant no-quote-rule --dry-run   # 실행 목록 확인
npm run eval -- --batch a8 --variant no-quote-rule             # 실행ID: <입력ID>--v1-no-quote-rule--r1
npm run compare -- --eval --batch a8                            # 기본 판과 묶음별로 비교하려면 기본 판도 같은 묶음으로 실행
```

- 비교판 이름은 영문 소문자·숫자·하이픈. 정의가 없는 이름으로 실행하면 시작 전에 멈춥니다(규칙이 그대로인데 이름만 다른 결과가 생기지 않게).
- 바꿀 수 있는 파일은 **Claude가 따르는 규칙**뿐입니다: `CLAUDE.md`, `.claude/skills/<Skill>/*.md`, `prompts/eval/plan.md`·`copy.md`.
  검증·출력 스크립트(`scripts/`)와 기준(`config/`, `schemas/`)은 바꾸지 않습니다. 결과를 같은 잣대로 재야 하므로.
- 실행할 때 작업 실행기가 규칙을 작업 폴더에 복사한 뒤 `files/`로 덮어씁니다. 저장소의 규칙 파일은 바뀌지 않습니다.
- `result.json`의 `variant`에 이름이, `notes`에 `description`과 바꾼 파일 목록이 남습니다.
- 규칙 버전(`config/skill-version.json`)은 바꾸지 않습니다. 비교판은 그 버전에서 일부를 뺀 판이라 실행ID가 `v1-<비교판>`이 됩니다.

비교판 내용(무엇을 뺄지)은 A8 실험 때 정합니다. 사용량이 부족하면 A8을 가장 먼저 뺍니다.
