# Remote CLI Reference

`bakewiki remote` lets you manage a running bakewiki server from the command line — list, read, create, rename, patch, delete pages, search, and manage uploads. Output is human-readable (use `bakewiki llm` for JSON/LLM-optimized output).

```bash
bakewiki remote [options] <command>
```

## Options

| Option | Description | Env |
|--------|-------------|-----|
| `--url <url>` | Server URL | `BAKEWIKI_URL` (default: `http://127.0.0.1:3000`) |
| `--key <apikey>` | API key | `BAKEWIKI_API_KEY` |

Options can go before or after the subcommand:
```bash
bakewiki remote --key bk_xxx list
bakewiki remote list --key bk_xxx
bakewiki remote --url http://... --key bk_xxx get index
```

## Subcommands

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
| `file upload <file\|-> [name] [--slug <slug>]` | Upload file | Required |
| `file download <url\|filename> [output\|-]` | Download file | None |
| `file delete <filename>` | Delete file | Required |

*Works without auth, but private pages require authentication.

### patch options

| Option | Description |
|--------|-------------|
| `--slug <new-slug>` | Rename slug |
| `--public <true\|false>` | Change visibility |
| `--body <file\|->` | Replace body (`-` for stdin) |

## Auth

API keys use the `bk_` prefix. Get one from the server's `/settings` page (admin login required). Pass it via `--key` or `BAKEWIKI_API_KEY`.

Public pages are readable without a key (`search`, `sitemap`, `health`, `file download`); private/protected pages require auth.

> **Note:** The `title` field in every response is always the slug's last segment (e.g. slug `docs/api` → title `api`). There is no separate title input. The page H1 is rendered from this title, so page bodies should not contain their own `#` heading.