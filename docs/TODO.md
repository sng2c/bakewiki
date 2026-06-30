# bakewiki TODO

> 각 단위는 GGON 사이클(분석 → 승인 → 최소 구현)을 따름.

## ✅ 완료

### v0.0.1 — 기초
- 파일시스템 기반 저장 (pages/*.md, auth.json, config.yml)
- 인증 (세션 쿠키 + API 키)
- GFM 마크다운 렌더링 (markdown-it + highlight.js + KaTeX)
- CLI (init, serve, admin create, import, export)
- Pico.css UI, breadcrumb, 에디터

### v0.0.2 — 클라이언트 렌더링
- 서버 렌더링 → 클라이언트 렌더링 (markdown-it, highlight.js, KaTeX CDN)
- CodeMirror 제거, plain textarea 복귀
- Save 버튼 1개만 유지
- 서버 의존성 제거 (markdown-it, highlight.js, katex, @vscode/markdown-it-katex)

### v0.0.3 — 에디터/렌더링 개선
- 클라이언트 사이드 GFM 렌더링 + 링크 해석 (normalizeLink)
- KaTeX auto-render (수식)
- CDN URL 수정 (highlight.js → cdn-release 레포)
- CDN 소스 상수화 (CDN 객체)
- `/api/render` 엔드포인트 제거

### v0.0.4 — CSR 전환
- 페이지 조회도 CSR로 전환 (JSON 데이터 → 클라이언트 렌더링)
- 서버 `renderMarkdown()` 제거, `src/render/markdown.ts` 삭제
- 서버 의존성 4개 제거 (markdown-it, highlight.js, katex, @vscode/markdown-it-katex)

### v0.0.5 — 원격 CLI
- `remote` 서브커맨드 (list, get, create, rename, delete, search, sitemap, health)
- `BakewikiClient` + `extractRemoteOpts()` + 서브커맨드 핸들러
- API 응답 필드 매핑 수정 (isPublic → public)
- sitemap 버그 수정 (문자열 덮어쓰기 → 트리 구조)

### v0.0.6 — CLI/구조 개선
- `--data` 글로벌 옵션 (서브커맨드 앞뒤 모두 가능)
- `--url`/`--key` 글로벌 옵션 (`remote --key xxx list` 또는 `remote list --key xxx`)
- `prepublishOnly`로 npm 배포 시 영문 README 교환
- 영문 `README.md` (기본) + 한국어 `README.ko.md`
- npm 배너 (shields.io)
- API 상세 문서 (요청/응답 예시 포함)
- 요청 로깅 미들웨어 추가 후 제거 (오버엔지니어링 판단)

### v0.0.7 — 버그 수정
- 순환 리다이렉트 방지 (A→B 후 B→A 시 기존 리다이렉트 정리)

### v0.0.8 — 이미지 업로드 + 클라이언트 JS 분리
- 이미지 업로드 API (`POST /api/upload`): 평면 저장 `uploads/<uuid>.<ext>`
- 업로드 목록/삭제 API (`GET /api/upload`, `DELETE /api/upload/:filename`)
- 정적 서빙 (`/uploads/*` via serveStatic)
- 에디터 업로드 UI: 드래그/붙여넣기/선택 → 리스트(썸네일+삽입/삭제 버튼)
- 클라이언트 JS 분리: 인라인 스크립트 → `public/page.js`, `public/editor.js` (`/static/*` 서빙)
- 빌드 단계에 `scripts/copy-public.mjs` 추가 (tsc 후 public/ → dist/public/)
- CLI `remote file` 서브커맨드 (list/upload/delete; stdin `-` 지원)
- normalizeLink `/uploads/` 예외 (절대경로 통과)
- `export` 시 `uploads/` 동반 복사

### v0.0.9 — Title=Slug 모델 + PATCH API

- **Title = 첫 `#` 헤딩**: frontmatter `title` 필드 제거, 본문 첫 `#` 헤딩을 페이지 제목으로 사용
- **Slug = 디렉토리 + 타이틀**: 새 문서 생성 시 디렉토리 + 첫 `#` 헤딩에서 슬러그 자동 유도 (예: `# HTTP` → 슬러그 `HTTP`, 디렉토리 `tech/web/` → `tech/web/HTTP`)
- **유니코드 슬러그**: 한글 등 유니코드 슬러그 지원 (예: `히히`, `파일들`)
- **표준 URL 상대경로 해석**: 상대 링크를 현재 슬러그의 부모 디렉토리를 기준으로 해석 (형제 링크 `CSS` → `tech/web/CSS`)
- **에디터 UI 변경**: Title 필드 제거, Directory 입력 추가, 슬러그 자동 유도
- **Breadcrumb 개선**: 마지막 세그먼트에 title 표시
- **PATCH API**: `PATCH /api/pages/:slug`로 부분 업데이트 지원 (`public`, `body`, `slug` 개별 또는 복합 변경)
- **CLI `remote patch`**: `bakewiki remote patch <slug> [--slug ...] [--public ...] [--body ...]`
- **마이그레이션 스크립트**: `scripts/migrate-title-slug.mjs` (기존 frontmatter title → 본문 `#` 헤딩, 슬러그 재유도)
- **`index` 특수 처리**: 홈페이지 슬러그 `index` 유지
- **이중 `<h1>` 제거**: 페이지 렌더링 시 본문 `#` 헤딩만 사용, 별도 title 렌더링 제거

---

- [ ] Milkdown WYSIWYG 에디터 (현재 textarea)
- [ ] llms.txt
- [ ] 백링크
- [ ] 버전 히스토리 / diff / rollback (Git 기반?)
- [ ] 청킹 메타데이터 (RAG용)
- [ ] 태그/카테고리
- [ ] 정적 사이트 빌드 (`bakewiki build`)
- [ ] 멀티테넌트 호스팅
- [x] 이미지 업로드
- [ ] 검색 API 고도화 (페이지네이션, 필터)
- [ ] 다크 모드 토글 (Pico CSS data-theme)
- [x] 빈 문서 생성 허용 (slug만으로 생성 가능, title/body 없어도 됨)
- [ ] 비공개 상속: 조상 중 하나라도 private이면 강제 private (dotfile 방식 검토했으나 역매핑 모호/트리 rename 비용으로 보류 — Option 2 전파 방식 또는 별도 매핑 필요)
- [ ] 페이지 목록을 슬러그 기반 디렉토리 트리로 표현 (웹 /pages + CLI remote list)