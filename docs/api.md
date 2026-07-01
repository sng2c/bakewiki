# API Reference

All API endpoints are under `/api`. Authentication uses `Authorization: Bearer <api-key>` header or session cookie.

Unauthenticated requests can only access public pages and public search results.

## Pages

### List pages

```
GET /api/pages
```

Response `200`:
```json
{
  "pages": [
    { "slug": "index", "title": "Home", "public": true, "updatedAt": "2026-06-29T12:00:00.000Z" },
    { "slug": "docs/api", "title": "API Docs", "public": false, "updatedAt": "2026-06-28T09:00:00.000Z" }
  ]
}
```

Unauthenticated requests only return public pages.

### Get page

```
GET /api/pages/:slug
```

Response `200`:
```json
{
  "page": {
    "slug": "index",
    "title": "Home",
    "content": "# Home\n\nWelcome!",
    "public": true,
    "updatedAt": "2026-06-29T12:00:00.000Z"
  }
}
```

| Status | Condition |
|--------|-----------|
| `200` | Page found (and accessible) |
| `400` | Invalid slug |
| `404` | Page not found, or private page without auth |

### Create or update page

```
POST /api/pages/:slug
Content-Type: application/json
Authorization: Bearer <api-key>
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | Full page body (markdown) |
| `title` | string | No | Override title (stored in `meta.yml`) |

If `title` is omitted, it is extracted from the first `#` heading in `content`, or derived from the slug.

Response `200`:
```json
{ "slug": "my-page", "title": "My Page", "public": true, "updatedAt": "2026-06-29T12:00:00.000Z" }
```

| Status | Condition |
|--------|-----------|
| `200` | Created or updated |
| `400` | Invalid slug or missing content |
| `401` | No auth |

### Partial update (PATCH)

```
PATCH /api/pages/:slug
Content-Type: application/json
Authorization: Bearer <api-key>
```

| Field | Type | Description |
|-------|------|-------------|
| `slug` | string | Rename to a new slug (does not create redirects) |
| `public` | boolean | Change visibility |
| `body` | string | Replace page body (markdown content only; metadata preserved) |
| `title` | string | Override title (stored in `meta.yml`) |

All fields are optional; include only the ones you want to change.

Examples:

Change visibility:
```json
{ "public": false }
```

Change body:
```json
{ "body": "# Updated Title\n\nNew content" }
```

Rename:
```json
{ "slug": "new-slug" }
```

Combine fields:
```json
{ "slug": "new-name", "public": true, "body": "# New Title\n\nContent", "title": "Custom Title" }
```

Response `200`:
```json
{ "slug": "new-name", "title": "New Title", "public": true, "updatedAt": "2026-06-30T12:00:00.000Z" }
```

| Status | Condition |
|--------|-----------|
| `200` | Updated |
| `400` | No fields provided, or invalid slug |
| `401` | No auth |
| `404` | Page not found |
| `409` | Target slug already exists (on rename) |

### Delete page

```
DELETE /api/pages/:slug
Authorization: Bearer <api-key>
```

| Status | Condition |
|--------|-----------|
| `200` | Deleted — `{ "ok": true }` |
| `400` | Invalid slug |
| `401` | No auth |
| `404` | Page not found |

## Search

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

- Returns empty results if `q` is missing.
- Unauthenticated requests only search public pages.
- Results ranked by title match (higher) then content match.

## Sitemap

```
GET /api/sitemap
```

Response `200`:
```json
{
  "tree": [
    {
      "path": "",
      "name": "index",
      "slug": "index",
      "title": "Home",
      "public": true,
      "children": [
        {
          "path": "docs",
          "name": "api",
          "slug": "docs/api",
          "title": "API Docs",
          "public": false,
          "children": []
        }
      ]
    }
  ]
}
```

Each node in the tree:

| Field | Type | Description |
|-------|------|-------------|
| `path` | string | Parent directory path (empty string for top level) |
| `name` | string | Last segment of the slug |
| `slug` | string\|undefined | Full page slug (present when directory has an `index.md`) |
| `title` | string\|undefined | Page title (present when slug exists) |
| `public` | boolean\|undefined | Visibility flag (present for pages only) |
| `children` | array | Child nodes |

Unauthenticated requests only include public pages. Directories without pages still appear as structural nodes (without `slug`/`title`/`public`).

## Health

```
GET /api/health
```

Response `200`: `{ "ok": true }`

No authentication required.

## Uploads

### Upload file

```
POST /api/upload
Content-Type: multipart/form-data
Authorization: Bearer <api-key>
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Binary file to upload |
| `slug` | string | No | Page slug to attach to (omit for temp bucket) |

Response `200`:
```json
{
  "url": "/pages/tech/web/HTTP/photo.jpg",
  "filename": "tech/web/HTTP/photo.jpg",
  "original": "photo.jpg",
  "ext": "jpg",
  "slug": "tech/web/HTTP",
  "size": 12345
}
```

- Files are stored inside the page directory: `data/pages/<slug>/<original>`.
- Use `@@<original>` in page content to reference uploads (resolved at render time).
- Empty slug uploads to the temp bucket (`_`).
- Filename collisions overwrite the existing file.

| Status | Condition |
|--------|-----------|
| `200` | Uploaded |
| `400` | Missing file, empty file, or invalid filename |
| `401` | No auth |

### List uploads

```
GET /api/upload              — all uploads (auth required)
GET /api/upload/by-slug/:slug — uploads for a specific page (public)
```

Response `200`:
```json
{
  "files": [
    { "url": "/pages/index/photo.jpg", "filename": "index/photo.jpg", "original": "photo.jpg", "ext": "jpg", "slug": "index", "size": 12345 }
  ]
}
```

### Download file

Files are served at:

```
GET /pages/<slug>/<filename>
```

Public pages: accessible without auth. Private pages: auth required.

### Delete upload

```
DELETE /api/upload/:filename
Authorization: Bearer <api-key>
```

`filename` is `<slug>/<original>` (e.g. `index/photo.jpg`).

| Status | Condition |
|--------|-----------|
| `200` | Deleted — `{ "ok": true }` |
| `400` | Invalid filename format |
| `401` | No auth |
| `404` | File not found |

## Slug rules

- No leading/trailing `/`
- No `..` segments
- Unicode supported (e.g., `히히`, `파일들`)
- Slugs like `tech/web/HTTP` create a hierarchy
- The `index` slug is the home page (served at `/`)
- Renaming a slug does not create redirects; the old slug returns 404