# @sng2c/bakewiki

[![npm version](https://img.shields.io/npm/v/@sng2c/bakewiki?label=npm)](https://www.npmjs.com/package/@sng2c/bakewiki) [![AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](https://github.com/sng2c/bakewiki)

An open-source GFM wiki for humans and LLMs.

## Features

- **GFM Markdown** — GitHub Flavored Markdown with code highlighting and KaTeX math
- **Client-side rendering** — Page views and editor preview rendered in the browser (markdown-it + highlight.js + KaTeX)
- **Filesystem-based** — Pages stored as `.md` files, version-controllable with Git
- **Hierarchical slugs** — Paths like `tech/web/http`, relative links (`./hehe`, `../css`)
- **Auth** — Admin login, session cookies + API key authentication
- **Redirects** — Automatic redirect mapping when slugs are renamed
- **LLM-friendly** — Structured JSON API with API key auth

## Quick start

```bash
npx @sng2c/bakewiki init --data ./data
npx @sng2c/bakewiki admin create --data ./data
npx @sng2c/bakewiki serve --data ./data
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
| `get <slug>` | Get page content | Required |
| `create <slug> <file>` | Create/update page | Required |
| `rename <old> <new>` | Rename page | Required |
| `delete <slug>` | Delete page | Required |
| `search <query>` | Search pages | Optional* |
| `sitemap` | Show page tree | Optional* |
| `health` | Health check | None |

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
├── pages/           ← .md files
│   ├── index.md
│   └── index/
│       └── hehe.md
├── auth.json        ← users + tokens
├── config.yml       ← JWT secret (auto-generated)
└── redirects.json   ← slug rename redirect mapping
```

### Markdown format

```yaml
---
title: Page Title
public: true
---
Page content...
```

`title` and `public` are edited in separate form fields, not in the body.

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
    "content": "---\ntitle: Home\npublic: true\n---\nWelcome!",
    "isPublic": true,
    "updatedAt": "2026-06-29T12:00:00.000Z"
  }
}
```

Response `301` (redirect):
```json
{ "redirect": "new-slug" }
```

Response `404`: `{ "error": "Not found" }`

Unauthenticated requests return 404 for private pages.

#### Create or update page

```
POST /api/pages/:slug
Content-Type: application/json
Authorization: Bearer <api-key>

{ "content": "---\ntitle: My Page\npublic: true\n---\nHello world" }
```

Response `200`:
```json
{ "slug": "my-page", "title": "My Page", "public": true, "updatedAt": "2026-06-29T12:00:00.000Z" }
```

Creates if the slug doesn't exist, updates if it does. `content` must be a string containing the full page body (frontmatter + markdown).

#### Rename page

```
PATCH /api/pages/:slug
Content-Type: application/json
Authorization: Bearer <api-key>

{ "slug": "new-slug" }
```

Response `200`:
```json
{ "slug": "new-slug", "title": "My Page", "public": true, "updatedAt": "2026-06-29T12:00:00.000Z" }
```

Response `409`: `{ "error": "Not found or target slug already exists" }`

Creates a redirect from the old slug to the new one.

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
    { "slug": "index", "children": [] },
    { "slug": "docs", "children": [
      { "slug": "docs/api", "children": [] }
    ] }
  ]
}
```

Hierarchical tree of all pages. Unauthenticated requests only include public pages.

### Health

```
GET /api/health
```

Response `200`: `{ "ok": true }`

No authentication required.

### Slug rules

- No leading/trailing `/`
- No `..` segments
- Slugs like `tech/web/http` create a hierarchy
- Redirects are tracked in `redirects.json` when slugs are renamed

## Development

```bash
npm install
npm run dev          # Dev server (tsx --watch)
npm run build        # TypeScript compile
npm run check        # Type check
```

Requires Node.js ≥ 22.

## License

AGPL-3.0-or-later