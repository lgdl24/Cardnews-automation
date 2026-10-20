# 결과 보기 웹 + 로컬 제작 화면

로컬 Claude Code로 만든 카드뉴스 결과와 제작 과정을 보여주는 **정적 사이트**입니다. 배포된 사이트에는 서버·로그인·입력 기능이 없고, 내보낸 웹 데이터(`public/data/`)만 읽습니다.

같은 앱을 내 컴퓨터에서 `npm run studio`(= 개발 서버)로 켜면 **로컬 제작 화면**(`/studio`, 웹 모드)이 함께 열립니다. 개발 서버에 붙는 로컬 제작 API(`/api/studio`, `scripts/lib/studio-api.js`)가 입력을 저장하고 이 컴퓨터의 `claude -p`로 작업을 실행합니다. 빌드 결과(`dist/`)에는 API가 들어가지 않아서 배포 사이트에서 `/studio`를 열면 "내 컴퓨터에서 켰을 때만" 안내가 나옵니다.

- 화면 설계: 노션 [웹 화면 설계](https://app.notion.com/p/3f56bcfa1f8a81b7870fce97265e2ef3) (V1~V4)
- 데이터 규격: [`docs/web-data-spec.md`](../docs/web-data-spec.md), 스키마 `schemas/web-data/`
- 기술: React 19 · TypeScript · Vite 7 · React Router 7, 글꼴 Pretendard

## 실행

저장소 루트에서:

```bash
npm run web:install      # 처음 한 번 (web/node_modules)
npm run export           # 제작 결과 → web/public/data/ (데이터를 바꿨을 때)
npm run web:dev          # 개발 서버 http://127.0.0.1:5173 (= npm run studio, 제작 화면 포함)
npm run web:build        # 타입 검사 + 빌드 → web/dist/
```

`web/` 안에서는 `npm run dev`·`npm run build`·`npm run typecheck`도 됩니다.

## 화면과 담당

| 주소 | 화면 | 담당 | 코드 |
|---|---|---|---|
| `/` | V1 프로젝트 목록 | 이규동 | `src/screens/project-list/` |
| `/projects/:id` | V2 프로젝트 상세 (탭 틀) | 이규동 | `src/screens/project-detail/ProjectDetailPage.tsx` |
| `/projects/:id` (첫 탭) | V2 카드 결과 | 이규동 | `src/screens/project-detail/tabs/CardResultTab.tsx` |
| `/projects/:id/plan` | V2 구성안·근거 | 이용석 | `src/screens/project-detail/tabs/PlanEvidenceTab.tsx` |
| `/projects/:id/timeline` | V2 제작 과정 | 이규동 | `src/screens/project-detail/tabs/TimelineTab.tsx` |
| `/eval` | V3 평가 대시보드 | 이용석 | `src/screens/eval-dashboard/` |
| `/compare?a=<id>&b=<id>` | V4 버전 비교 (권장) | 이용석 | `src/screens/version-compare/` |
| `/studio` | S1 작업실: 제품 목록·Claude Code 상태 (로컬만) | 이규동 | `src/screens/studio/StudioHomePage.tsx` |
| `/studio/new` · `/studio/:id/edit` | S2 새 제작·입력 고치기 (로컬만) | 이규동 | `src/screens/studio/ProductFormPage.tsx` |
| `/studio/:id` | S3 제작 진행: 작업 진행·구성안 확인·카드 확인·승인·수정 요청·내보내기 (로컬만) | 이규동 | `src/screens/studio/StudioProductPage.tsx` |

V2 카드 결과(#15)는 크게 보기(`?card=3`으로 공유, ←·→·Esc), PNG 개별·ZIP 묶음 다운로드(브라우저에서 만듦, `src/lib/zip.ts`), 이미지 출처 표, 글자-이미지 겹침 경고까지 있습니다. V2 제작 과정(#17)은 요약 숫자, 단계별 시간 막대(AI 처리/사람 검토), 품질 지표, 작업별 결과, 제작 기록 타임라인(검증 오류·승인 주체·수정 요청 유형·메모)을 보여줍니다.

S1~S3(#21)은 `src/studio/api.ts`로 로컬 제작 API를 부릅니다. 쓰기 요청에는 `X-Studio: 1` 헤더가 붙고, 서버는 `127.0.0.1`·같은 출처 요청만 받습니다. 작업이 도는 동안 2초마다 상태를 다시 불러옵니다.

아직 만들지 않은 화면은 `ScreenPlaceholder`(담당·읽는 데이터·할 일)가 자리를 잡고 있습니다. 담당자가 자기 파일에서 이 부분을 실제 화면으로 바꿉니다.

## 폴더

```
web/
├── public/data/        # npm run export 결과 (커밋함, 직접 고치지 않음)
├── src/
│   ├── App.tsx         # 화면 이동 (주소 ↔ 화면)
│   ├── data/           # [공통] 웹 데이터 타입·불러오기·표시 형식
│   ├── components/     # [공통] 헤더·하단·배지·지표 카드·탭·상태 표시
│   ├── styles/         # [공통] 색상·글꼴·페이지 틀
│   ├── lib/            # [공통] 내려받기·ZIP 만들기
│   ├── studio/         # 로컬 제작 API 호출·타입 (S1~S3)
│   └── screens/        # 화면별 폴더 (담당자가 자기 폴더만 고침)
├── vite.config.ts      # 개발 서버에만 로컬 제작 API를 붙임 (CARDNEWS_STUDIO=0이면 끔)
└── vercel.json         # 정적 배포 설정 (주소 새로고침 시 index.html)
```

- **[공통] 파일**(`data/`, `components/`, `styles/`, `lib/`, `App.tsx`)을 바꿀 때는 PR에 적고 두 사람이 함께 리뷰합니다. 화면 폴더는 담당자가 고치고 상대가 리뷰합니다.
- 화면 전용 스타일은 화면 폴더의 `.css`에 둡니다. 색상은 `styles/global.css`의 변수(`--color-*`, `--stage-*`)를 씁니다.
- 탭 화면은 `useProjectContext()`로 `project`(project.json)와 `labels`(index.json의 이름표)를 받습니다. `timeline.json`은 `useTimeline(id)`로 따로 불러옵니다.
- 화면에 보이는 이름(단계·역할·템플릿·수정 유형·단계 이름)은 코드에 적지 않고 `labels`에서 꺼냅니다(`label(labels.roles, card.role)`).

## 데이터 타입

`src/data/types.ts`는 `schemas/web-data/*.schema.json`과 같은 모양입니다. 스키마를 바꾸면 이 파일도 같은 PR에서 고칩니다.

## 배포

정적 사이트라 `web/`을 빌드한 `dist/`만 올리면 됩니다. 배포처는 아직 정하지 않았습니다(Vercel 예정).

- Vercel: 프로젝트 Root Directory `web`, Build Command `npm run build`, Output Directory `dist`. `vercel.json`이 `/projects/...` 같은 주소를 새로고침해도 화면이 열리게 합니다.
- 데이터는 커밋된 `web/public/data/`로 배포되므로, 새 결과를 보이려면 `npm run export` → `npm run web:build` → **`npm run check:web`** → 커밋 → 배포 순서입니다.
- `npm run check:web`(배포 전 점검)은 오류가 있으면 종료 코드 1이에요. 웹 데이터 규격에 없는 파일·목록에 없는 프로젝트 폴더·빠진 PNG(`DEPLOY_FILE`), 스키마(`SCHEMA_ERROR`), 비밀 값 형태(`SECRET`, 값은 출력 안 함), 카드에 쓴 이미지의 사용 가능 여부가 '가능'이 아님(`IMAGE_RIGHTS`), 빌드 결과의 `.env`·`input.md`·`log.jsonl` 등을 봐요. 소스 맵은 경고만.
