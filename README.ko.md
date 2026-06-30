# @sng2c/bakewiki

[![npm version](https://img.shields.io/npm/v/@sng2c/bakewiki?label=npm)](https://www.npmjs.com/package/@sng2c/bakewiki) [![AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](https://github.com/sng2c/bakewiki)

오픈소스 GFM 위키. 인간과 LLM 모두를 위한 지식 관리.

## 기능

- **GFM 마크다운** — GitHub Flavored Markdown + 코드 하이라이팅 + KaTeX 수식
- **클라이언트 사이드 렌더링** — 페이지 조회와 에디터 미리보기를 브라우저에서 렌더링 (markdown-it + highlight.js + KaTeX)
- **파일시스템 기반** — `.md` 파일로 저장, Git 버전 관리 가능
- **Title=Slug 모델** — 첫 `#` 헤딩이 페이지 제목이자 슬러그, 유니코드 지원
- **계층 슬러그** — 디렉토리 구조로 페이지 조직화, 표준 상대 링크 지원
- **위키링크** — `[[slug]]` 절대 슬러그 참조, `[[slug|표시 텍스트]]` 지원
- **이미지 업로드** — 디렉토리 기반 저장 + `@@` 콘텐츠 마커, rename 시 자동 이관
- **인증** — 관리자 로그인, 세션 쿠키 + 짧은 API 키 (`bk_` 접두사)
- **부분 업데이트** — PATCH API로 공개여부, 본문, 슬러그 개별 변경
- **LLM 친화적** — 구조화된 JSON API + API 키 인증, 배치 CLI 조회

## 빠른 시작

`npx` 사용 (설치 없이):

```bash
npx @sng2c/bakewiki init --data ./data
npx @sng2c/bakewiki admin create --data ./data
npx @sng2c/bakewiki serve --data ./data
```

또는 전역 설치:

```bash
npm i -g @sng2c/bakewiki
bakewiki init --data ./data
bakewiki admin create --data ./data
bakewiki serve --data ./data
```

http://127.0.0.1:3000 열기.

## CLI

```bash
bakewiki [options] <command> [command options]
```

### 글로벌 옵션

| 옵션 | 설명 | 환경변수 |
|------|------|----------|
| `--data <path>` | 데이터 디렉토리 (로컬 명령에 필수) | `BAKEWIKI_DATA_DIR` |
| `--version, -v` | 버전 출력 | |
| `--help, -h` | 도움말 | |

### 로컬 명령

| 명령 | 설명 |
|------|------|
| `init` | 데이터 디렉토리 초기화 |
| `admin create` | 관리자 계정 생성 |
| `serve` | HTTP 서버 시작 |
| `import <dir>` | 마크다운 폴더를 위키로 가져오기 |
| `export <dir>` | 위키를 마크다운 폴더로 내보내기 |

serve 옵션: `--host <addr>` (기본값: `127.0.0.1`), `--port <number>` (기본값: `3000`)

### 원격 명령

```bash
bakewiki remote [options] <command>
```

| 명령 | 설명 | 인증 |
|------|------|------|
| `list` | 문서 목록 | 필수 |
| `get <slug> [slug2 ...]` | 문서 조회 — 배치 지원 | 필수 |
| `create <slug> <file>` | 문서 생성/수정 | 필수 |
| `rename <old> <new>` | 문서 이름 변경 | 필수 |
| `patch <slug> [--slug ...] [--public ...] [--body ...]` | 부분 업데이트 | 필수 |
| `delete <slug>` | 문서 삭제 | 필수 |
| `search <query>` | 문서 검색 | 선택* |
| `sitemap` | 문서 트리 | 선택* |
| `health` | 상태 확인 | 없음 |

*인증 없이도 동작하지만, 비공개 문서 조회에는 인증 필요.

원격 옵션: `--url <url>` (기본값: `http://127.0.0.1:3000`), `--key <apikey>` (`BAKEWIKI_API_KEY`)

옵션은 서브커맨드 앞뒤 모두 가능:
```bash
bakewiki remote --key bk_xxx list
bakewiki remote list --key bk_xxx
bakewiki remote --url http://... --key bk_xxx get index
```

### 환경변수

`.env` 파일이 프로젝트 루트에 있으면 자동 로드. `.env.example` 참고.

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `BAKEWIKI_DATA_DIR` | 데이터 디렉토리 (`--data` 대체) | 필수 |
| `BAKEWIKI_HOST` | 바인드 주소 | `127.0.0.1` |
| `BAKEWIKI_PORT` | 포트 | `3000` |
| `BAKEWIKI_URL` | 서버 URL (원격 명령용) | `http://127.0.0.1:3000` |
| `BAKEWIKI_API_KEY` | API 키 (원격 명령용) | |
| `BAKEWIKI_ADMIN_EMAIL` | 비대화형 관리자 생성 이메일 | |
| `BAKEWIKI_ADMIN_PASSWORD` | 비대화형 관리자 생성 비밀번호 | |

## 데이터 구조

```
data/
├── pages/           ← .md 파일 (슬러그 = 디렉토리 + 타이틀)
│   ├── index.md
│   └── tech/
│       └── web/
│           └── HTTP.md
├── auth.json        ← 사용자 + 토큰
├── config.yml       ← JWT 시크릿 (자동 생성)
```

### 마크다운 형식

```yaml
---
public: true
---
# 페이지 제목

페이지 내용...
```

- **제목**: 본문 첫 `#` 헤딩. frontmatter `title` 필드 없음.
- **공개여부**: frontmatter `public`으로 제어 (기본값: `true`).
- **슬러그**: 디렉토리 + 첫 `#` 헤딩에서 자동 유도. 예: `# HTTP` → 슬러그 `HTTP`, 디렉토리 `tech/web/` → `tech/web/HTTP`.

### 링크 해석

- **절대 링크**: `/tech/web/HTTP` → `/pages/tech/web/HTTP`
- **상대 링크**: 현재 슬러그의 부모 디렉토리를 기준으로 해석 (표준 URL)
  - 슬러그 `tech/web/HTTP`에서 `CSS` → `tech/web/CSS` (형제)
  - 슬러그 `tech/web/HTTP`에서 `../API` → `tech/API` (삼촌)
  - 슬러그 `tech/web/HTTP`에서 `./HTTP/HTTPS` → `tech/web/HTTP/HTTPS` (자식)
- **위키링크**: `[[slug]]` → `/pages/slug` (절대). `[[slug|표시 텍스트]]`로 링크 텍스트 지정.
- **업로드 마커**: 본문의 `@@파일명` → 렌더링 시 `/uploads/<현재-slug>/파일명`으로 동적 변환. 페이지 rename 시 업로드 디렉토리만 rename, 본문은 그대로.

## API

모든 API 엔드포인트는 `/api` 하위. 인증은 `Authorization: Bearer <api-key>` 헤더 또는 세션 쿠키.

### 문서

#### 문서 목록

```
GET /api/pages
```

응답 `200`:
```json
{
  "pages": [
    { "slug": "index", "title": "홈", "isPublic": true, "updatedAt": "2026-06-29T12:00:00.000Z" },
    { "slug": "docs/api", "title": "API 문서", "isPublic": false, "updatedAt": "2026-06-28T09:00:00.000Z" }
  ]
}
```
미인증 요청은 공개 문서만 반환.

#### 문서 조회

```
GET /api/pages/:slug
```

응답 `200`:
```json
{
  "page": {
    "slug": "index",
    "title": "홈",
    "content": "---\npublic: true\n---\n# 홈\n\n환영합니다!",
    "isPublic": true,
    "updatedAt": "2026-06-29T12:00:00.000Z"
  }
}
```

응답 `404`: `{ "error": "Not found" }`

미인증 요청은 비공개 문서에 대해 404 반환.

#### 문서 생성/수정

```
POST /api/pages/:slug
Content-Type: application/json
Authorization: Bearer <api-key>

{ "content": "---\npublic: true\n---\n# 내 페이지\n\n안녕하세요" }
```

응답 `200`:
```json
{ "slug": "내-페이지", "title": "내 페이지", "public": true, "updatedAt": "2026-06-29T12:00:00.000Z" }
```

슬러그가 없으면 생성, 있으면 수정. `content`는 전체 문서 본문(frontmatter + markdown)이어야 함.

#### 부분 업데이트 (PATCH)

```
PATCH /api/pages/:slug
Content-Type: application/json
Authorization: Bearer <api-key>
```

공개여부만 변경:
```json
{ "public": false }
```

본문만 변경:
```json
{ "body": "# 수정된 제목\n\n새 내용" }
```

이름 변경:
```json
{ "slug": "new-slug" }
```

참고: 이름 변경 시 리다이렉트가 생성되지 않습니다. 이전 슬러그는 404를 반환합니다.

복합 변경:
```json
{ "slug": "new-name", "public": true, "body": "# 새 제목\n\n내용" }
```

응답 `200`:
```json
{ "slug": "new-name", "title": "새 제목", "public": true, "updatedAt": "2026-06-30T12:00:00.000Z" }
```

#### 문서 삭제

```
DELETE /api/pages/:slug
Authorization: Bearer <api-key>
```

응답 `200`: `{ "ok": true }`

응답 `404`: `{ "error": "Not found" }`

### 검색

```
GET /api/search?q=키워드
```

응답 `200`:
```json
{
  "results": [
    { "slug": "index", "title": "홈", "snippet": "환영합니다. <mark>위키</mark>에 오신 것을" }
  ]
}
```

`q`가 없으면 빈 결과 반환. 미인증 요청은 공개 문서만 검색.

### 사이트맵

```
GET /api/sitemap
```

응답 `200`:
```json
{
  "tree": [
    { "slug": "index", "title": "홈", "isPublic": true, "children": [
      { "slug": "docs/api", "title": "API 문서", "isPublic": false, "children": [] }
    ]}
  ]
}
```

모든 문서의 계층 트리 (title, isPublic 포함). 미인증 요청은 공개 문서만 포함.

### 상태 확인

```
GET /api/health
```

응답 `200`: `{ "ok": true }`

인증 불필요.

### 업로드

#### 파일 업로드

```
POST /api/upload
Content-Type: multipart/form-data
Authorization: Bearer <api-key>

file: <binary>
slug: <페이지-slug>
```

응답 `200`:
```json
{ "url": "/uploads/tech/web/HTTP/photo.jpg", "filename": "tech/web/HTTP/photo.jpg", "original": "photo.jpg", "ext": "jpg", "slug": "tech/web/HTTP", "size": 12345 }
```

파일은 `uploads/<slug>/<original>`에 저장. 본문에서 `@@<original>`로 참조 (렌더링 시 동적 변환).

#### 업로드 목록

```
GET /api/upload              — 전체 (인증 필요)
GET /api/upload/by-slug/:slug — 특정 페이지 (공개)
```

응답 `200`:
```json
{ "files": [{ "url": "/uploads/index/photo.jpg", "filename": "index/photo.jpg", "original": "photo.jpg", "ext": "jpg", "slug": "index", "size": 12345 }] }
```

#### 업로드 삭제

```
DELETE /api/upload/:filename
Authorization: Bearer <api-key>
```

`filename`은 `<slug>/<original>` (예: `index/photo.jpg`).

응답 `200`: `{ "ok": true }`

### 슬러그 규칙

- 앞뒤 `/` 금지
- `..` 세그먼트 금지
- 유니코드 지원 (예: `히히`, `파일들`)
- `tech/web/HTTP` 형태의 계층 슬러그
- `index` 슬러그는 홈페이지 (`/`에서 서빙)
- 슬러그 변경 시 기존 URL은 404 (리다이렉트 없음)

## 개발

```bash
npm install
npm run dev          # 개발 서버 (tsx --watch)
npm run build        # TypeScript 컴파일
npm run check         # 타입 체크
```

Node.js ≥ 22 필요.

## 마이그레이션

이전 형식(frontmatter `title` 필드)에서 새 형식(본문 첫 `#` 헤딩)으로 마이그레이션:

```bash
node scripts/migrate-title-slug.mjs --data ./data
```

`--dry-run`으로 변경 사항을 미리 확인.

## 라이선스

AGPL-3.0-or-later