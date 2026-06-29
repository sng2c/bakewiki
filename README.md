# @sng2c/bakewiki

오픈소스 GFM 위키. 인간과 LLM 모두를 위한 지식 관리.

## 특징

- **GFM 마크다운** — GitHub Flavored Markdown으로 작성, 코드 하이라이팅·수식(KaTeX) 지원
- **파일시스템 기반** — 페이지는 `.md` 파일, Git으로 버전 관리 가능
- **계층 슬러그** — `tech/web/http` 형태의 경로, 상대 링크(`./hehe`, `../css`) 지원
- **인증** — 관리자 로그인, 세션 쿠키 + API 키 인증
- **실시간 미리보기** — 에디터에서 CodeMirror 기반 마크다운 하이라이팅 + 서버 렌더링 프리뷰
- **리다이렉트** — 슬러그 변경 시 자동 리다이렉트 매핑
- **LLM 친화** — 구조화된 JSON API, API 키 인증

## 빠른 시작

```bash
# 설치 없이 실행
npx @sng2c/bakewiki init --data ./data
npx @sng2c/bakewiki admin create --data ./data
npx @sng2c/bakewiki serve --data ./data
```

브라우저에서 http://127.0.0.1:3000 열기.

## CLI 명령

### 로컬 (서버 관리)

| 명령 | 설명 |
|------|------|
| `init --data <path>` | 데이터 디렉토리 초기화 |
| `admin create --data <path>` | 관리자 계정 생성 |
| `serve --data <path>` | HTTP 서버 시작 |
| `import <dir> --data <path>` | 마크다운 폴더 가져오기 |
| `export <dir> --data <path>` | 위키를 마크다운 폴더로 내보내기 |

### 원격 (API)

| 명령 | 설명 |
|------|------|
| `remote list --key <key>` | 문서 목록 |
| `remote get <slug> --key <key>` | 문서 조회 |
| `remote create <slug> <file> --key <key>` | 문서 생성/수정 |
| `remote rename <old> <new> --key <key>` | 문서 이름 변경 |
| `remote delete <slug> --key <key>` | 문서 삭제 |

원격 옵션:
- `--url <url>` — 서버 URL (기본값: `http://127.0.0.1:3000`, 환경변수: `BAKEWIKI_URL`)
- `--key <apikey>` — API 키 (환경변수: `BAKEWIKI_API_KEY`)

### 환경변수

| 변수 | 설명 |
|------|------|
| `BAKEWIKI_DATA_DIR` | 데이터 디렉토리 (`--data` 대체) |
| `BAKEWIKI_HOST` | 바인드 주소 (기본값: `127.0.0.1`) |
| `BAKEWIKI_PORT` | 포트 (기본값: `3000`) |
| `BAKEWIKI_URL` | 원격 명령용 서버 URL |
| `BAKEWIKI_API_KEY` | 원격 명령용 API 키 |
| `BAKEWIKI_ADMIN_EMAIL` | 비대화형 관리자 생성 이메일 |
| `BAKEWIKI_ADMIN_PASSWORD` | 비대화형 관리자 생성 비밀번호 |

## 데이터 구조

```
data/
├── pages/           ← .md 파일 (콘텐츠)
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
# 문서 제목

본문 내용...
```

`title`과 `public`은 프론트매터에서 분리되어 에디터의 별도 필드로 편집됩니다.

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/pages` | 문서 목록 |
| `GET` | `/api/pages/:slug` | 문서 조회 (리다이렉트 포함) |
| `POST` | `/api/pages/:slug` | 문서 생성/수정 |
| `PATCH` | `/api/pages/:slug` | 문서 이름 변경 |
| `DELETE` | `/api/pages/:slug` | 문서 삭제 |
| `POST` | `/api/render` | 마크다운 렌더링 (에디터 프리뷰) |
| `GET` | `/api/search?q=` | 검색 |
| `GET` | `/api/sitemap` | 사이트맵 |
| `POST` | `/api/pages/:slug` | 문서 생성/수정 (인증 필요) |

인증: `Authorization: Bearer <api-key>` 헤더 또는 세션 쿠키.

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