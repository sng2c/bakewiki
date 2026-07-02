# LLM CLI Reference

`bakewiki llm` provides the same subcommands as `remote`, but output is optimized for LLM consumption. **`get` outputs Markdown with YAML frontmatter; all other commands output JSON on stdout** (errors on stderr). Designed for scripting and LLM tool use.

```bash
bakewiki llm [options] <command>
```

## Options

| Option | Description | Env |
|--------|-------------|-----|
| `--url <url>` | Server URL | `BAKEWIKI_URL` (default: `http://127.0.0.1:3000`) |
| `--key <apikey>` | API key | `BAKEWIKI_API_KEY` |

Options can go before or after the subcommand:
```bash
bakewiki llm --key bk_xxx list
bakewiki llm list --key bk_xxx
```

## Subcommands

> **Note:** The `title` field in every response is always the slug's last segment (e.g. slug `docs/api` → title `api`). There is no separate title input. The page H1 is rendered from this title, so page bodies should not contain their own `#` heading.

### list

List all pages.

```bash
bakewiki llm --key bk_xxx list
```

Output:
```json
[
  { "path": "", "slug": "index", "title": "index", "public": true, "updatedAt": "2026-06-29T12:00:00.000Z" },
  { "path": "docs", "slug": "docs/api", "title": "api", "public": false, "updatedAt": "2026-06-28T09:00:00.000Z" }
]
```

Auth: **required**

### get

Get a page by slug. **Single page outputs Markdown with YAML frontmatter**; multiple pages output JSON.

```bash
bakewiki llm --key bk_xxx get index
```

Single page output (Markdown):
```markdown
---
path: ""
slug: index
title: "index"
public: true
updatedAt: 2026-06-29T12:00:00.000Z
---

Welcome!
```

Multiple pages output (JSON):
```bash
bakewiki llm --key bk_xxx get index docs/api
```
```json
[
  { "path": "", "slug": "index", "title": "index", "content": "Welcome!", "public": true, "updatedAt": "2026-06-29T12:00:00.000Z" },
  { "path": "docs", "slug": "docs/api", "title": "api", "content": "...", "public": false, "updatedAt": "2026-06-28T09:00:00.000Z" }
]
```

Auth: **required**

### create

Create or update a page from a markdown file.

```bash
bakewiki llm --key bk_xxx create my-page ./content.md
```

Output:
```json
{ "path": "", "slug": "my-page", "title": "my-page" }
```

Auth: **required**

### rename

Rename a page slug.

```bash
bakewiki llm --key bk_xxx rename old-slug new-slug
```

Output:
```json
{ "path": "", "slug": "new-slug", "title": "new-slug" }
```

Auth: **required**

### patch

Partially update a page. Only the specified fields are changed.

```bash
bakewiki llm --key bk_xxx patch my-page --public false
bakewiki llm --key bk_xxx patch my-page --body ./updated.md
bakewiki llm --key bk_xxx patch my-page --slug new-name
bakewiki llm --key bk_xxx patch my-page --body -   # read body from stdin
```

| Option | Description |
|--------|-------------|
| `--slug <new-slug>` | Rename slug |
| `--public <true\|false>` | Change visibility |
| `--body <file\|->` | Replace body (`-` for stdin) |

Output:
```json
{ "path": "docs", "slug": "my-page", "title": "my-page", "public": false, "updatedAt": "2026-06-30T12:00:00.000Z" }
```

Auth: **required**

### delete

Delete a page.

```bash
bakewiki llm --key bk_xxx delete my-page
```

Output:
```json
{ "deleted": "my-page" }
```

Auth: **required**

### search

Search pages by keyword.

```bash
bakewiki llm search wiki
# No auth needed for public pages:
bakewiki llm search wiki --url http://...
```

Output:
```json
{
  "query": "wiki",
  "count": 1,
  "results": [
    { "path": "", "slug": "index", "title": "index", "snippet": "Welcome to the <mark>wiki</mark>" }
  ]
}
```

Auth: optional (private pages require auth)

### sitemap

Show page tree as JSON.

```bash
bakewiki llm sitemap
```

Output:
```json
{
  "tree": [
    {
      "path": "",
      "name": "index",
      "slug": "index",
      "title": "index",
      "public": true,
      "children": []
    }
  ]
}
```

Auth: optional (private pages require auth)

### health

Health check.

```bash
bakewiki llm health
```

Output:
```json
{ "ok": true }
```

Exits with code 1 if unhealthy. No auth required.

### help

Show structured help as JSON.

```bash
bakewiki llm help
```

Output: JSON object describing all subcommands, their arguments, and options.

Auth: none

## File subcommands

File operations are nested under `llm file <subcommand>`.

### file list

List uploaded files, optionally filtered by page slug.

```bash
bakewiki llm --key bk_xxx file list
bakewiki llm --key bk_xxx file list --slug my-page
```

Output:
```json
{
  "count": 2,
  "files": [
    { "url": "/pages/index/photo.jpg", "filename": "index/photo.jpg", "original": "photo.jpg", "ext": "jpg", "slug": "index", "size": 12345 }
  ]
}
```

Auth: **required** for full list; optional for `--slug` (public pages)

### file upload

Upload a file, optionally attached to a page.

```bash
bakewiki llm --key bk_xxx file upload photo.jpg
bakewiki llm --key bk_xxx file upload photo.jpg custom-name.jpg --slug my-page
bakewiki llm --key bk_xxx file upload - image.png --slug my-page   # from stdin
```

Output:
```json
{
  "url": "/pages/my-page/photo.jpg",
  "filename": "my-page/photo.jpg",
  "original": "photo.jpg",
  "ext": "jpg",
  "slug": "my-page",
  "size": 12345
}
```

Auth: **required**

### file download

Download a file by URL path or filename.

```bash
bakewiki llm --key bk_xxx file download my-page/photo.jpg
bakewiki llm --key bk_xxx file download /pages/my-page/photo.jpg
bakewiki llm --key bk_xxx file download my-page/photo.jpg ./local.jpg   # save to file
bakewiki llm --key bk_xxx file download my-page/photo.jpg -   # stdout
```

When saving to a file, output is JSON metadata:
```json
{ "downloaded": "/path/to/local.jpg", "size": 12345 }
```

When output is `-` or omitted, binary content is written to stdout.

Auth: none for public pages; **required** for private

### file delete

Delete an uploaded file.

```bash
bakewiki llm --key bk_xxx file delete my-page/photo.jpg
```

Output:
```json
{ "deleted": "my-page/photo.jpg" }
```

Auth: **required**

## Error format

All errors are JSON on stderr:
```json
{ "error": "Page not found: my-page" }
```

The process exits with code 1 on error. On success, only valid JSON is written to stdout, making it safe for pipelines.