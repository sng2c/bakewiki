# @sng2c/bakewiki

[![npm version](https://img.shields.io/npm/v/@sng2c/bakewiki?label=npm)](https://www.npmjs.com/package/@sng2c/bakewiki) [![AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](https://github.com/sng2c/bakewiki)

오픈소스 GFM 위키. 인간과 LLM 모두를 위한 지식 관리.

## 특징

- **GFM 마크다운** — GitHub Flavored Markdown, 코드 하이라이팅·수식(KaTeX) 지원
- **클라이언트 렌더링** — 페이지 조회와 에디터 프리뷰 모두 브라우저에서 렌더링
- **파일시스템 기반** — 페이지는 `.md` 파일, Git으로 버전 관리 가능
- **계층 슬러그** — `tech/web/http` 형태 경로, 상대 링크(`./hehe`, `../css`) 지원
- **인증** — 관리자 로그인, 세션 쿠키 + API 키 인증
- **리다이렉트** — 슬러그 변경 시 자동 리다이렉트 매핑
- **LLM 친화** — 구조화된 JSON API, API 키 인증

## 빠른 시작

```bash
npx @sng2c/bakewiki init --data ./data
npx @sng2c/bakewiki admin create --data ./data
npx @sng2c/bakewiki serve --data ./data
```

브라우저에서 http://127.0.0.1:3000 열기.

## CLI

```bash
bakewiki [options] <command> [command options]
```

### 글로벌 옵션

| 옵션 | 설명 | 환경변수 |
|------|------|----------|
| `--data <path>` | 데이터 디렉토리 (로컬 명령에 필수) | `BAKEWIKI_DATA_DIR` |
| `--version, -v` | 버전 출력 | |
| `--help, -h` | 도움말 출력 | |

### 로컬 명령

| 명령 | 설명 |
|------|------|
| `init` | 데이터 디렉토리 초기화 |
| `admin create` | 관리자 계정 생성 |
| `serve` | HTTP 서버 시작 |
| `import <dir>` | 마크다운 폴더 가져오기 |
| `export <dir>` | 위키를 마크다운 폴더로 내보내기 |

Serve 옵션: `--host <addr>` (기본값: `127.0.0.1`), `--port <number>` (기본값: `3000`)

### 원격 명령

```bash
bakewiki remote [--url <url>] [--key <key>] <command>
```

| 명령 | 설명 | 인증 |
|------|------|------|
| `list` | 문서 목록 | 필요 |
| `get <slug>` | 문서 조회 | 필요 |
| `create <slug> <file>` | 문서 생성/수정 | 필요 |
| `rename <old> <new>` | 문서 이름 변경 | 필요 |
| `delete <slug>` | 문서 삭제 | 필요 |
| `search <query>` | 검색 | 선택* |
| `sitemap` | 페이지 트리 | 선택* |
| `health` | 헬스체크 | 없음 |

*비인증도 동작하지만 비공개 문서는 인증 필요

원격 옵션: `--url <url>` (기본값: `http://127.0.0.1:3000`), `--key <apikey>` (`BAKEWIKI_API_KEY`)

```bash
# 옵션은 서브커맨드 앞뒤 모두 가능
bakewiki remote --key bk_xxx list
bakewiki remote list --key bk_xxx
bakewiki remote --url http://... --key bk_xxx get index
```

### 환경변수

프로젝트 루트에 `.env` 파일을 두면 `dotenv`가 자동 로드합니다. `.env.example`을 참고하세요.

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `BAKEWIKI_DATA_DIR` | 데이터 디렉토리 (`--data` 대체) | 필수 |
| `BAKEWIKI_HOST` | 바인드 주소 | `127.0.0.1` |
| `BAKEWIKI_PORT` | 포트 | `3000` |
| `BAKEWIKI_URL` | 원격 명령용 서버 URL | `http://127.0.0.1:3000` |
| `BAKEWIKI_API_KEY` | 원격 명령용 API 키 | |
| `BAKEWIKI_ADMIN_EMAIL` | 비대화형 관리자 생성 이메일 | |
| `BAKEWIKI_ADMIN_PASSWORD` | 비대화형 관리자 생성 비밀번호 | |

```bash
# .env 예시
BAKEWIKI_DATA_DIR=./data
BAKEWIKI_PORT=3000
BAKEWIKI_HOST=127.0.0.1
BAKEWIKI_URL=http://127.0.0.1:3000
BAKEWIKI_API_KEY=bk_xxx
```

## 데이터 구조

```
data/
├── pages/           ← .md 파일
│   ├── index.md
│   └── index/
│       └── hehe.md
├── auth.json        ← 사용자 + 토큰
├── config.yml       ← JWT 시크릿 (자동 생성)
└── redirects.json   ← 슬러그 변경 리다이렉트 매핑
```

### 마크다운 형식

```yaml
---
title: 문서 제목
public: true
---
본문 내용...
```

## API

모든 API 엔드포인트는 `/api` 하위에 있습니다. 인증은 `Authorization: Bearer <api-key>` 헤더 또는 세션 쿠키를 사용합니다.

### 문서

#### 문서 목록

```
GET /api/pages
```

응답 `200`:
```json
{
  "pages": [
    { "slug": "index", "title": "Home", "isPublic": true, "updatedAt": "2026-06-29T12:00:00.000Z" },
    { "slug": "docs/api", "title": "API 문서", "isPublic": false, "updatedAt": "2026-06-28T09:00:00.000Z" }
  ]
}
```
비인증 요청은 공개 문서만 반환합니다.

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
    "content": "---\ntitle: 홈\npublic: true\n---\n환영합니다!",
    "isPublic": true,
    "updatedAt": "2026-06-29T12:00:00.000Z"
  }
}
```

응답 `301` (리다이렉트):
```json
{ "redirect": "new-slug" }
```

응답 `404`: `{ "error": "Not found" }`

비인증 요청은 비공개 문서에 대해 404를 반환합니다.

#### 문서 생성/수정

```
POST /api/pages/:slug
Content-Type: application/json
Authorization: Bearer <api-key>

{ "content": "---\ntitle: 내 페이지\npublic: true\n---\n안녕하세요" }
```

응답 `200`:
```json
{ "slug": "my-page", "title": "내 페이지", "public": true, "updatedAt": "2026-06-29T12:00:00.000Z" }
```

슬러그가 없으면 생성, 있으면 수정합니다. `content`는 전체 문서 본문(frontmatter + 마크다운)이어야 합니다.

#### 문서 이름 변경

```
PATCH /api/pages/:slug
Content-Type: application/json
Authorization: Bearer <api-key>

{ "slug": "new-slug" }
```

응답 `200`:
```json
{ "slug": "new-slug", "title": "내 페이지", "public": true, "updatedAt": "2026-06-29T12:00:00.000Z" }
```

응답 `409`: `{ "error": "Not found or target slug already exists" }`

이전 슬러그에서 새 슬러그로 리다이렉트가 자동 생성됩니다.

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
    { "slug": "index", "title": "홈", "snippet": "<mark>위키</mark>에 오신 것을 환영합니다" }
  ]
}
```

`q`가 없으면 빈 결과를 반환합니다. 비인증 요청은 공개 문서만 검색합니다.

### 사이트맵

```
GET /api/sitemap
```

응답 `200`:
```json
{
  "tree": [
    { "slug": "index", "children": [] },
    { "slug": "docs", "children": [
      { "slug": "docs/api", "children": [] }
    ] }
  ]
}
```

모든 문서의 계층 트리입니다. 비인증 요청은 공개 문서만 포함합니다.

### 헬스체크

```
GET /api/health
```

응답 `200`: `{ "ok": true }`

인증 불필요.

### 슬러그 규칙

- 선행/후행 `/` 금지
- `..` 세그먼트 금지
- `tech/web/http` 형태로 계층 구조 생성
- 슬러그 변경 시 `redirects.json`에 리다이렉트 자동 추적

## 개발

```bash
npm install
npm run dev          # 개발 서버 (tsx --watch)
npm run build        # TypeScript 컴파일
npm run check        # 타입 체크
```

Node.js ≥ 22 필요.

## 라이선스

AGPL-3.0-or-later