# @sng2c/bakewiki

[![npm version](https://img.shields.io/npm/v/@sng2c/bakewiki?label=npm)](https://www.npmjs.com/package/@sng2c/bakewiki) [![AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](https://github.com/sng2c/bakewiki)

An open-source GFM wiki for humans and LLMs.

## Features

- **GFM Markdown** — GitHub Flavored Markdown with code highlighting and KaTeX math
- **Client-side rendering** — Page views and editor preview rendered in the browser (markdown-it + highlight.js + KaTeX)
- **Filesystem-based** — Pages stored as `.md` files, version-controllable with Git
- **Title-as-slug** — Page title (first `#` heading) determines the slug; Unicode supported
- **Hierarchical slugs** — Directory structure for organization, standard relative links
- **Wiki-links** — `[[slug]]` syntax for absolute slug references, `[[slug|display]]` for custom text
- **Image uploads** — Directory-based storage with `@@` content markers, auto-migrated on rename
- **Auth** — Admin login, session cookies + short API keys (`bk_` prefix)
- **Partial updates** — PATCH API to change public flag, body, or slug individually
- **LLM-friendly** — Structured JSON API with API key auth, batch CLI queries

## Quick start

Using `npx` (no install):

```bash
npx @sng2c/bakewiki init --data ./data
npx @sng2c/bakewiki admin create --data ./data
npx @sng2c/bakewiki serve --data ./data
```

Or install globally:

```bash
npm i -g @sng2c/bakewiki
bakewiki init --data ./data
bakewiki admin create --data ./data
bakewiki serve --data ./data
```

Open http://127.0.0.1:3000 in your browser.

## CLI

```bash
bakewiki [options] <command> [command options]
```

### Global options

| Option | Description | Env |
|--------|-------------|-----|
| `--data <path>` | Data directory (required for local commands) | `BAKEWIKI_DATA_DIR` |
| `--version, -v` | Show version | |
| `--help, -h` | Show help | |

### Local commands

| Command | Description |
|---------|-------------|
| `init` | Initialize data directory |
| `admin create` | Create admin account |
| `serve` | Start HTTP server |
| `import <dir>` | Import markdown folder into wiki |
| `export <dir>` | Export wiki to markdown folder |

Serve options: `--host <addr>` (default: `127.0.0.1`), `--port <number>` (default: `3000`)

### Remote commands

```bash
bakewiki remote [options] <command>
```

| Command | Description | Auth |
|---------|-------------|------|
| `list` | List pages | Required |
| `get <slug> [slug2 ...]` | Get page(s) — batch supported | Required |
| `create <slug> <file>` | Create/update page | Required |
| `rename <old> <new>` | Rename page | Required |
| `patch <slug> [--slug ...] [--public ...] [--body ...]` | Partial update | Required |
| `delete <slug>` | Delete page | Required |
| `search <query>` | Search pages | Optional* |
| `sitemap` | Show page tree | Optional* |
| `health` | Health check | None |
| `file list [--slug <slug>]` | List uploads (optional page filter) | Required / Optional* |
| `file upload <file|-> [name] [--slug <slug>]` | Upload file | Required |
| `file download <url|filename> [output|-]` | Download file | None |
| `file delete <filename>` | Delete file | Required |

*Works without auth, but private pages require authentication.

Remote options: `--url <url>` (default: `http://127.0.0.1:3000`), `--key <apikey>` (`BAKEWIKI_API_KEY`)

Options can go before or after the subcommand:
```bash
bakewiki remote --key bk_xxx list
bakewiki remote list --key bk_xxx
bakewiki remote --url http://... --key bk_xxx get index
```

### Environment variables

A `.env` file in the project root is auto-loaded. See `.env.example` for reference.

| Variable | Description | Default |
|----------|-------------|---------|
| `BAKEWIKI_DATA_DIR` | Data directory (`--data` alternative) | Required |
| `BAKEWIKI_HOST` | Bind address | `127.0.0.1` |
| `BAKEWIKI_PORT` | Port | `3000` |
| `BAKEWIKI_URL` | Server URL for remote commands | `http://127.0.0.1:3000` |
| `BAKEWIKI_API_KEY` | API key for remote commands | |
| `BAKEWIKI_ADMIN_EMAIL` | Non-interactive admin creation email | |
| `BAKEWIKI_ADMIN_PASSWORD` | Non-interactive admin creation password | |

## Data structure

```
data/
├── pages/           ← .md files (slug = directory + title)
│   ├── index.md
│   └── tech/
│       └── web/
│           └── HTTP.md
├── auth.json        ← users + tokens
├── config.yml       ← JWT secret (auto-generated)
```

### Markdown format

```yaml
---
public: true
---
# Page Title

Page content...
```

- **Title**: First `#` heading in the body. No `title` field in frontmatter.
- **Public**: Controlled via `public` in frontmatter (default: `true`).
- **Slug**: Derived from directory + title. E.g., `# HTTP` in `tech/web/` → slug `tech/web/HTTP`.

### Link resolution

- **Absolute links**: `/tech/web/HTTP` → `/pages/tech/web/HTTP`
- **Relative links**: Resolved against the parent directory of the current slug.
  - From `tech/web/HTTP`: `CSS` → `tech/web/CSS` (sibling)
  - From `tech/web/HTTP`: `../API` → `tech/API` (uncle)
  - From `tech/web/HTTP`: `./HTTP/HTTPS` → `tech/web/HTTP/HTTPS` (child)
- **Wiki-links**: `[[slug]]` → `/pages/slug` (absolute). `[[slug|display text]]` for custom link text.
- **Upload markers**: `@@filename` in content → resolved to `/uploads/<current-slug>/filename` at render time. Renaming a page only renames the upload directory, content stays untouched.

## API

All API endpoints are under `/api`. Authentication uses `Authorization: Bearer <api-key>` header or session cookie.

### Pages

#### List pages

```
GET /api/pages
```

Response `200`:
```json
{
  "pages": [
    { "slug": "index", "title": "Home", "isPublic": true, "updatedAt": "2026-06-29T12:00:00.000Z" },
    { "slug": "docs/api", "title": "API Docs", "isPublic": false, "updatedAt": "2026-06-28T09:00:00.000Z" }
  ]
}
```
Unauthenticated requests only return public pages.

#### Get page

```
GET /api/pages/:slug
```

Response `200`:
```json
{
  "page": {
    "slug": "index",
    "title": "Home",
    "content": "---\npublic: true\n---\n# Home\n\nWelcome!",
    "isPublic": true,
    "updatedAt": "2026-06-29T12:00:00.000Z"
  }
}
```

Response `404`: `{ "error": "Not found" }`

Unauthenticated requests return 404 for private pages.

#### Create or update page

```
POST /api/pages/:slug
Content-Type: application/json
Authorization: Bearer <api-key>

{ "content": "---\npublic: true\n---\n# My Page\n\nHello world" }
```

Response `200`:
```json
{ "slug": "my-page", "title": "My Page", "public": true, "updatedAt": "2026-06-29T12:00:00.000Z" }
```

Creates if the slug doesn't exist, updates if it does. `content` must be a string containing the full page body (frontmatter + markdown).

#### Partial update (PATCH)

```
PATCH /api/pages/:slug
Content-Type: application/json
Authorization: Bearer <api-key>
```

Change public flag only:
```json
{ "public": false }
```

Change body only:
```json
{ "body": "# Updated Title\n\nNew content" }
```

Rename:
```json
{ "slug": "new-slug" }
```

Note: renaming does not create redirects. The old slug will return 404.

Combine fields:
```json
{ "slug": "new-name", "public": true, "body": "# New Title\n\nContent" }
```

Response `200`:
```json
{ "slug": "new-name", "title": "New Title", "public": true, "updatedAt": "2026-06-30T12:00:00.000Z" }
```

#### Delete page

```
DELETE /api/pages/:slug
Authorization: Bearer <api-key>
```

Response `200`: `{ "ok": true }`

Response `404`: `{ "error": "Not found" }`

### Search

```
GET /api/search?q=keyword
```

Response `200`:
```json
{
  "results": [
    { "slug": "index", "title": "Home", "snippet": "Welcome to the <mark>wiki</mark>" }
  ]
}
```

Returns empty results if `q` is missing. Unauthenticated requests only search public pages.

### Sitemap

```
GET /api/sitemap
```

Response `200`:
```json
{
  "tree": [
    { "slug": "index", "title": "Home", "isPublic": true, "children": [
      { "slug": "docs/api", "title": "API Docs", "isPublic": false, "children": [] }
    ]}
  ]
}
```

Hierarchical tree of all pages with title and visibility. Unauthenticated requests only include public pages.

### Health

```
GET /api/health
```

Response `200`: `{ "ok": true }`

No authentication required.

### Uploads

#### Upload file

```
POST /api/upload
Content-Type: multipart/form-data
Authorization: Bearer <api-key>

file: <binary>
slug: <page-slug>
```

Response `200`:
```json
{ "url": "/uploads/tech/web/HTTP/photo.jpg", "filename": "tech/web/HTTP/photo.jpg", "original": "photo.jpg", "ext": "jpg", "slug": "tech/web/HTTP", "size": 12345 }
```

Files are stored in `uploads/<slug>/<original>`. Use `@@<original>` in page content to reference uploads (resolved at render time).

#### List uploads

```
GET /api/upload              — all uploads (auth required)
GET /api/upload/by-slug/:slug — uploads for a specific page (public)
```

Response `200`:
```json
{ "files": [{ "url": "/uploads/index/photo.jpg", "filename": "index/photo.jpg", "original": "photo.jpg", "ext": "jpg", "slug": "index", "size": 12345 }] }
```

#### Delete upload

```
DELETE /api/upload/:filename
Authorization: Bearer <api-key>
```

`filename` is `<slug>/<original>` (e.g. `index/photo.jpg`).

Response `200`: `{ "ok": true }`

### Slug rules

- No leading/trailing `/`
- No `..` segments
- Unicode supported (e.g., `히히`, `파일들`)
- Slugs like `tech/web/HTTP` create a hierarchy
- The `index` slug is the home page (served at `/`)

## Development

```bash
npm install
npm run dev          # Dev server (tsx --watch)
npm run build        # TypeScript compile
npm run check        # Type check
```

Requires Node.js ≥ 22.

## Migration

To migrate from the old format (frontmatter `title` field) to the new format (title from first `#` heading):

```bash
node scripts/migrate-title-slug.mjs --data ./data
```

Use `--dry-run` to preview changes without modifying files.

## License

AGPL-3.0-or-later