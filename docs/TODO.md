# bakewiki 구현 TODO

> 우선순위 순서대로 구현. 각 단위는 GGON 사이클(분석 → 승인 → 최소 구현)을 따름.

## 구현 순서
1. **인증** (auth) — ✅ 완료
2. **편집** (edit) — ✅ 완료
3. **공개/비공개 설정** (visibility) — ✅ 완료 (pages.public으로 edit 단계에서 구현)
4. **CLI** (init/serve/import/export/version) — ✅ 완료
5. **마크다운 렌더링** (render) — 현재 단계 (마지막)

---

## 1. 인증 (auth) ✅ 완료

### 결정사항
- 관리되는 JWT (allowlist 패턴): JWT 포맷 + DB 토큰 관리(revoke)
- 단일 `tokens` 테이블로 세션/키 통합 (type: session|api)
- 쿠키 OR Bearer 헤더 동일 JWT 검증 → 웹/CLI/LLM 포맷 호환
- 비밀번호 변경 시 본인 토큰만 무효 (revokeAllUserTokens)

### 파일
- `src/db/schema.ts` — users, tokens
- `src/db/index.ts` — initDb
- `src/auth/password.ts` — hashPassword, verifyPassword (bcrypt)
- `src/auth/jwt.ts` — signToken, verifyToken (jose, HS256)
- `src/auth/token.ts` — issueSession, issueApiKey, touchToken, revokeToken, revokeAllUserTokens
- `src/auth/middleware.ts` — auth (선택적), requireAuth
- `src/auth/routes.ts` — /auth/login, /auth/logout, /auth/me
- `src/auth/seed.ts` — seedAdmin (임시), issueApiKeyForEmail

### 환경변수
- `BAKEWIKI_JWT_SECRET` — JWT 서명 비밀키 (필수)

---

## 2. 편집 (edit) ✅ 완료

### 파일
- `src/db/schema.ts` — pages 테이블 추가 (slug, title, content, public, createdAt, updatedAt)
- `src/pages/frontmatter.ts` — parseDocument, extractTitle, extractPublic
- `src/pages/store.ts` — getPage, listPages, createPage, updatePage, deletePage
- `src/pages/search.ts` — ensureFts (FTS5 + 트리거 + backfill), searchPages
- `src/pages/routes.ts` — GET /, GET /:slug{.+}, POST /:slug{.+}, DELETE /:slug{.+}
- `src/app.ts` — createApp (미들웨어 + 라우터 마운트, /api/search, /api/sitemap)
- `src/env.ts` — AppEnv (Hono Variables 타입)

### 결정사항
- content는 GFM 원문(frontmatter 포함) 그대로 저장 → import/export 동일 포맷
- slug는 슬래시 포함 계층 경로 → 라우트에 정규식 파라미터 `/:slug{.+}` 사용
- FTS5 자체 저장 (content='' 제거 → snippet 지원)
- 비공개 문서 미인증 시 404 (존재 은닉)

## 3. 공개/비공개 설정 (visibility) ✅ 완료
- pages.public 컬럼 + frontmatter.public 추출로 edit 단계에서 구현 완료

---

## 4. CLI ✅ 완료

### 파일
- `src/migrate.ts` — runMigrations (Drizzle migrator)
- `src/cli.ts` — 진입점 (bin), 서브커맨드 분기
- `src/cli/serve.ts` — serve (자동 마이그레이션 + @hono/node-server)
- `src/cli/init.ts` — init (TTY 인터랙티브 / non-TTY 환경변수 폴백)
- `src/cli/import.ts` — import <dir> (.md → DB upsert)
- `src/cli/export.ts` — export <dir> (DB → .md)

### 결정사항
- 마이그레이션: Drizzle Kit generate → migrator (옵션 A)
- init: TTY면 인터랙티브 프롬프트, non-TTY면 BAKEWIKI_ADMIN_EMAIL/PASSWORD 환경변수

### 검증 완료
- init/seed, login(쿠키), POST(슬래시 slug), GET(인증 분기), 비공개 404, Bearer API 키, search+snippet, sitemap

---

## 5. 마크다운 렌더링 (render) — 현재 단계
