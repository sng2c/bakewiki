# bakewiki 구현 TODO

> 각 단위는 GGON 사이클(분석 → 승인 → 최소 구현)을 따름.
> MVP 5단계 전부 완료. 이후 수정/고도화 이력 포함.

## 구현 순서 (전부 완료)
1. ✅ 인증 (auth)
2. ✅ 편집 (edit)
3. ✅ 공개/비공개 설정 (visibility)
4. ✅ CLI (init/serve/import/export/version)
5. ✅ 마크다운 렌더링 (render)

---

## 1. 인증 (auth) ✅

### 결정사항
- 관리되는 JWT (allowlist 패턴): JWT 포맷 + auth.json 토큰 관리(revoke)
- 단일 `tokens` 배열로 세션/키 통합 (type: session|api)
- 쿠키 OR Bearer 헤더 동일 JWT 검증 → 웹/CLI/LLM 포맷 호환
- 비밀번호 변경 시 본인 토큰만 무효 (revokeAllUserTokens)

### 파일
- `src/data.ts` — resolveDataDir, initDataDir, readAuth, writeAuth, AuthData 타입
- `src/auth/password.ts` — hashPassword, verifyPassword (bcrypt)
- `src/auth/jwt.ts` — signToken, verifyToken (jose, HS256)
- `src/auth/token.ts` — issueSession, issueApiKey, touchToken, revokeToken, revokeAllUserTokens
- `src/auth/middleware.ts` — auth (선택적), requireAuth
- `src/auth/routes.ts` — /auth/login, /auth/logout, /auth/me
- `src/auth/seed.ts` — seedAdmin, issueApiKeyForEmail

### 환경변수
- `BAKEWIKI_JWT_SECRET` — JWT 서명 비밀키 (필수)

---

## 2. 편집 (edit) ✅

### 파일
- `src/pages/frontmatter.ts` — parseDocument, extractTitle, extractPublic
- `src/pages/store.ts` — getPage, listPages, createPage, updatePage, deletePage (파일시스템 기반)
- `src/pages/search.ts` — buildSearchIndex, searchPages, listPagesFromIndex (인메모리)
- `src/pages/routes.ts` — GET /, GET /:slug{.+}, POST /:slug{.+}, DELETE /:slug{.+}
- `src/app.ts` — createApp
- `src/env.ts` — Store, AppEnv (Hono Variables 타입)

### 결정사항
- content는 .md 파일 자체 → frontmatter 포함 GFM 원문
- slug는 슬래시 포함 계층 경로 → 파일 경로에 1:1 매핑
- 검색: 인메모리 인덱스 (서버 시작 시 빌드, CRUD 시 갱신)
- 비공개 문서 미인증 시 404 (존재 은닉)

---

## 3. 공개/비공개 설정 (visibility) ✅
- frontmatter.public 추출로 edit 단계에서 구현

---

## 4. CLI ✅

### 파일
- `src/cli.ts` — 진입점 (bin), 서브커맨드 분기, dotenv 자동 로드, --host/--port 파싱
- `src/cli/serve.ts` — serve (데이터 디렉토리 초기화 + 검색 인덱스 빌드 + @hono/node-server)
- `src/cli/init.ts` — init (TTY 인터랙티브 / non-TTY 환경변수 폴백)
- `src/cli/import.ts` — import <dir> (.md → pages 디렉토리 복사)
- `src/cli/export.ts` — export <dir> (pages 디렉토리 → .md 복사)

### 결정사항
- init: TTY면 인터랙티브, non-TTY면 BAKEWIKI_ADMIN_EMAIL/PASSWORD 환경변수
- `.env` 자동 로드 (dotenv/config)
- serve: --host/--port CLI 플래그 지원 (환경변수 BAKEWIKI_HOST/BAKEWIKI_PORT 오버라이드)

---

## 5. 마크다운 렌더링 (render) ✅

### 파일
- `src/render/markdown.ts` — markdown-it(GFM) + highlight.js + @vscode/markdown-it-katex
- `src/render/hbs.ts` — Handlebars + 레이아웃 + 템플릿 + 미니멀 CSS
- `src/web/read.ts` — 홈, 목록, 검색, 문서 조회 SSR
- `src/web/auth.ts` — 로그인/로그아웃 (폼 기반)
- `src/web/edit.ts` — 에디터(새 문서/편집/삭제), textarea

### 결정사항
- 정적 자산(CSS): highlight.js, KaTeX CDN
- Milkdown: MVP는 textarea, CDN 업그레이드 예정
- 관리자 신뢰 → html: true (Sanitize 생략)

### 웹 라우트
- `/` → `/index` 페이지 (없으면 notFound)
- `/pages` → 전체 목록
- `/search?q=` → 검색
- `/page/:slug` → 문서 조회 (없으면 notFound)
- `/login`, `/logout` → 인증
- `/edit`, `/edit/:slug` → 에디터
- `/delete/:slug` → 삭제

---

## 6. 수정/고도화 이력 (MVP 이후)

### 버그 수정
- **UI 진입점 추가**: nav에 Login/Logout/New/Pages/Edit 버튼 추가. user 플래그를 body data에도 전달(page 템플릿 Edit 버튼).
- **위키 동작**: 빈 페이지를 바로 edit로 리다이렉트 → 로그인 타이밍 없이 403 무한 루프. notFound 페이지 표시 + "Create this page" 버튼(인증 시) / "Login" 유유도(미인증 시)로 변경.

### 기능 추가
- **127.0.0.1 기본 바인드**: `BAKEWIKI_HOST` 기본값 127.0.0.1 (로컬 전용). `--host`/`--port` CLI 플래그 추가.
- **위키 라우팅**: `/` = `/index` 슬러그. `/pages`로 전체 목록 이동.

### 아키텍처 변경
- **SQLite → 파일시스템 전환**: DB 의존성(better-sqlite3, drizzle-orm) 제거. 문서는 `~/.bakewiki/pages/<slug>.md`에 저장. 인증 데이터는 `~/.bakewiki/auth.json`에 저장. 검색은 인메모리 인덱스로 대체(FTS5 제거). 마이그레이션 시스템 제거.

---

## 7. 환경변수 정리

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `BAKEWIKI_JWT_SECRET` | JWT 서명 비밀키 (필수) | - |
| `BAKEWIKI_PORT` | 서버 포트 | 3000 |
| `BAKEWIKI_HOST` | 바인드 호스트 | 127.0.0.1 |
| `BAKEWIKI_DATA_DIR` | 데이터 디렉토리 (pages/, auth.json) | ~/.bakewiki |
| `BAKEWIKI_ADMIN_EMAIL` | init non-TTY용 | - |
| `BAKEWIKI_ADMIN_PASSWORD` | init non-TTY용 | - |

---

## 8. 데이터 디렉토리 구조

```
~/.bakewiki/
├── pages/
│   ├── index.md              ← slug = "index"
│   ├── tech/
│   │   └── web/
│   │       └── http.md       ← slug = "tech/web/http"
│   └── ...
└── auth.json                 ← 사용자 + 토큰 (JSON)
```

---

## 9. 향후 검토 (미구현)
- [ ] Milkdown WYSIWYG 에디터 (현재 textarea)
- [ ] llms.txt
- [ ] 백링크
- [ ] 버전 히스트리 / diff / rollback
- [ ] 청킹 메타데이터 (RAG용)
- [ ] 태그/카테고리
- [ ] npm 배포 (`npx bakewiki`)
- [ ] 멀티테넌트 호스팅
- [ ] 정적 사이트 빌드 (`build`)