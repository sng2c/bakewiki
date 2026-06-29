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

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/pages` | List pages | Optional |
| `GET` | `/api/pages/:slug` | Get page (follows redirects) | Optional |
| `POST` | `/api/pages/:slug` | Create/update page | Required |
| `PATCH` | `/api/pages/:slug` | Rename page | Required |
| `DELETE` | `/api/pages/:slug` | Delete page | Required |
| `GET` | `/api/search?q=` | Search pages | Optional |
| `GET` | `/api/sitemap` | Sitemap tree | Optional |
| `GET` | `/api/health` | Health check | None |

Auth: `Authorization: Bearer <api-key>` header or session cookie.

## Logging

The server prints request logs to stdout:

```
GET / 200 16ms
GET /pages 200 11ms
GET /nonexistent 404 0ms
```

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