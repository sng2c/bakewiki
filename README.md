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
| `patch <slug> [--slug ...] [--public ...] [--body ...] [--title ...]` | Partial update | Required |
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

### LLM commands

Same subcommands as `remote`, but output is optimized for LLMs. **`get` outputs Markdown with YAML frontmatter; all others output JSON.** → **[Full LLM CLI reference →](docs/cli-llm.md)**

```bash
bakewiki llm --key bk_xxx list        # → JSON array
bakewiki llm --key bk_xxx get index   # → Markdown + YAML frontmatter
bakewiki llm help                     # → JSON help schema
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
├── pages/              ← page directories (slug = path)
│   ├── index.md         ← homepage body
│   ├── meta.yml         ← homepage metadata
│   └── tech/web/HTTP/
│       ├── index.md     ← page body (markdown, no frontmatter)
│       ├── meta.yml     ← {public, updatedAt, title?}
│       └── photo.jpg    ← uploaded file
├── auth.json            ← users + tokens
└── config.yml           ← JWT secret (auto-generated)
```

### Page files

Each page is a directory containing:

- **`index.md`** — Page body (pure markdown, no frontmatter)
- **`meta.yml`** — Metadata (YAML):
  ```yaml
  public: true
  updatedAt: "2026-06-29T12:00:00.000Z"
  title: "Custom Title"    # optional override
  ```
- **Attachments** — Any other files in the directory (images, etc.)

- **`slug`** — Full page identifier: `path + "/" + title_segment` (e.g. `tech/web/HTTP`)
- **`path`** — Parent directory path (e.g. `tech/web`, empty string for root)
- **`title`** — Display title (e.g. `HTTP`)

Title resolution: `meta.yml title` → first `#` heading → slug last segment.

### Link resolution

- **Absolute links**: `/tech/web/HTTP` → `/pages/tech/web/HTTP`
- **Relative links**: Resolved against the parent directory of the current slug.
  - From `tech/web/HTTP`: `CSS` → `tech/web/CSS` (sibling)
  - From `tech/web/HTTP`: `../API` → `tech/API` (uncle)
  - From `tech/web/HTTP`: `./HTTP/HTTPS` → `tech/web/HTTP/HTTPS` (child)
- **Wiki-links**: `[[slug]]` → `/pages/slug` (absolute). `[[slug|display text]]` for custom link text.
- **Upload markers**: `@@filename` in content → resolved to `/pages/<current-slug>/filename` at render time. Renaming a page renames the entire directory (including uploads).

### Slug rules

- No leading/trailing `/`
- No `..` segments
- Unicode supported (e.g., `히히`, `파일들`)
- Slugs like `tech/web/HTTP` create a hierarchy
- The `index` slug is the home page (served at `/`)
- Renaming a slug does not create redirects; the old slug returns 404

## API

→ **[Full API reference →](docs/api.md)**

Quick reference:

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/pages` | Optional | List pages (public only without auth) |
| GET | `/api/pages/:slug` | Optional | Get page (404 for private without auth) |
| POST | `/api/pages/:slug` | Required | Create or update page |
| PATCH | `/api/pages/:slug` | Required | Partial update (slug, public, body, title) |
| DELETE | `/api/pages/:slug` | Required | Delete page |
| GET | `/api/search?q=` | Optional | Search pages |
| GET | `/api/sitemap` | Optional | Page tree |
| GET | `/api/health` | None | Health check |
| POST | `/api/upload` | Required | Upload file |
| GET | `/api/upload` | Required | List all uploads |
| GET | `/api/upload/by-slug/:slug` | Optional | List uploads for a page |
| DELETE | `/api/upload/:filename` | Required | Delete upload |

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