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
| `patch <slug> [--slug ...] [--public ...] [--body ...] [--title ...]` | 부분 업데이트 | 필수 |
| `delete <slug>` | 문서 삭제 | 필수 |
| `search <query>` | 문서 검색 | 선택* |
| `sitemap` | 문서 트리 | 선택* |
| `health` | 상태 확인 | 없음 |
| `file list [--slug <slug>]` | 업로드 목록 (페이지 필터 가능) | 필수 / 선택* |
| `file upload <file\|-> [name] [--slug <slug>]` | 파일 업로드 | 필수 |
| `file download <url\|filename> [output\|-]` | 파일 다운로드 | 없음 |
| `file delete <filename>` | 파일 삭제 | 필수 |

*인증 없이도 동작하지만, 비공개 문서 조회에는 인증 필요.

원격 옵션: `--url <url>` (기본값: `http://127.0.0.1:3000`), `--key <apikey>` (`BAKEWIKI_API_KEY`)

옵션은 서브커맨드 앞뒤 모두 가능:
```bash
bakewiki remote --key bk_xxx list
bakewiki remote list --key bk_xxx
bakewiki remote --url http://... --key bk_xxx get index
```

### LLM 명령

`remote`와 동일한 서브커맨드지만, 모든 출력이 stdout에 JSON (에러는 stderr). 스크립트 및 LLM 도구 사용에 적합. → **[LLM CLI 전체 참조 →](docs/cli-llm.md)**

```bash
bakewiki llm --key bk_xxx list        # → JSON 배열
bakewiki llm --key bk_xxx get index   # → JSON 객체
bakewiki llm help                     # → JSON 도움말 스키마
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
├── pages/              ← 페이지 디렉토리 (슬러그 = 경로)
│   ├── index.md         ← 홈페이지 본문
│   ├── meta.yml         ← 홈페이지 메타데이터
│   └── tech/web/HTTP/
│       ├── index.md     ← 페이지 본문 (순수 마크다운, frontmatter 없음)
│       ├── meta.yml     ← {public, updatedAt, title?}
│       └── photo.jpg    ← 업로드된 파일
├── auth.json            ← 사용자 + 토큰
└── config.yml           ← JWT 시크릿 (자동 생성)
```

### 페이지 파일

각 페이지는 디렉토리에 다음 파일들을 포함합니다:

- **`index.md`** — 페이지 본문 (순수 마크다운, frontmatter 없음)
- **`meta.yml`** — 메타데이터 (YAML):
  ```yaml
  public: true
  updatedAt: "2026-06-29T12:00:00.000Z"
  title: "커스텀 제목"    # 선택 오버라이드
  ```
- **첨부 파일** — 디렉토리 내의 다른 모든 파일 (이미지 등)

### 제목 해석

1. `meta.yml`의 `title` 필드 (명시적 오버라이드)
2. `index.md`의 첫 `#` 헤딩
3. 슬러그의 마지막 세그먼트 (예: `tech/web/HTTP` → `HTTP`)

### 링크 해석

- **절대 링크**: `/tech/web/HTTP` → `/pages/tech/web/HTTP`
- **상대 링크**: 현재 슬러그의 부모 디렉토리를 기준으로 해석 (표준 URL)
  - 슬러그 `tech/web/HTTP`에서 `CSS` → `tech/web/CSS` (형제)
  - 슬러그 `tech/web/HTTP`에서 `../API` → `tech/API` (삼촌)
  - 슬러그 `tech/web/HTTP`에서 `./HTTP/HTTPS` → `tech/web/HTTP/HTTPS` (자식)
- **위키링크**: `[[slug]]` → `/pages/slug` (절대). `[[slug|표시 텍스트]]`로 링크 텍스트 지정.
- **업로드 마커**: 본문의 `@@파일명` → 렌더링 시 `/pages/<현재-slug>/파일명`으로 동적 변환. 페이지 rename 시 전체 디렉토리(업로드 포함)가 이동.

### 슬러그 규칙

- 앞뒤 `/` 금지
- `..` 세그먼트 금지
- 유니코드 지원 (예: `히히`, `파일들`)
- `tech/web/HTTP` 형태의 계층 슬러그
- `index` 슬러그는 홈페이지 (`/`에서 서빙)
- 슬러그 변경 시 기존 URL은 404 (리다이렉트 없음)

## API

→ **[API 전체 참조 →](docs/api.md)** (영어)

간략 참조:

| Method | Endpoint | Auth | 설명 |
|--------|----------|------|------|
| GET | `/api/pages` | 선택 | 문서 목록 (미인증: 공개만) |
| GET | `/api/pages/:slug` | 선택 | 문서 조회 (비공개: 미인증 404) |
| POST | `/api/pages/:slug` | 필수 | 문서 생성/수정 |
| PATCH | `/api/pages/:slug` | 필수 | 부분 업데이트 (slug, public, body, title) |
| DELETE | `/api/pages/:slug` | 필수 | 문서 삭제 |
| GET | `/api/search?q=` | 선택 | 문서 검색 |
| GET | `/api/sitemap` | 선택 | 문서 트리 |
| GET | `/api/health` | 없음 | 상태 확인 |
| POST | `/api/upload` | 필수 | 파일 업로드 |
| GET | `/api/upload` | 필수 | 전체 업로드 목록 |
| GET | `/api/upload/by-slug/:slug` | 선택 | 특정 페이지 업로드 목록 |
| DELETE | `/api/upload/:filename` | 필수 | 업로드 삭제 |

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