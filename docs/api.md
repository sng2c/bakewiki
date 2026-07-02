# API Reference

All API endpoints are under `/api`. Authentication uses `Authorization: Bearer <api-key>` header or session cookie.

Unauthenticated requests can only access public pages (including children of public pages). Pages under a private ancestor are not accessible without auth.

## Visibility model

Each page has a `public` flag (`true`/`false`). The **effective visibility** is determined by the page itself AND all ancestors:

| State | Condition |
|-------|-----------|
| `public` | Page is public and all ancestors are public |
| `private` | Page itself is `public: false` |
| `protected` (inherited private) | Page is `public: true` but an ancestor is private |

Unauthenticated users cannot see, search, list, or access `private` or `protected` pages — including their attachments.

The `inheritedPrivate` field is included in API responses when a page is protected.

## Pages

### List pages

```
GET /api/pages
```

Response `200`:
```json
{
  "pages": [
    { "path": "", "slug": "home", "title": "home", "public": true, "updatedAt": "2026-06-29T12:00:00.000Z" },
    { "path": "docs", "slug": "docs/api", "title": "api", "public": false, "updatedAt": "2026-06-28T09:00:00.000Z" },
    { "path": "docs", "slug": "docs/public-child", "title": "public-child", "public": true, "inheritedPrivate": true, "updatedAt": "2026-06-28T10:00:00.000Z" }
  ]
}
```

`path` is the parent directory (empty string for root-level pages). `slug` is the full identifier.

`inheritedPrivate` is `true` when the page is public but an ancestor is private (protected). Omitted when not applicable.

Unauthenticated requests only return `public` pages (private and protected are excluded).

### Get page

```
GET /api/pages/:slug
```

Response `200`:
```json
{
  "page": {
    "path": "",
    "slug": "home",
    "title": "home",
    "content": "Welcome!",
    "public": true,
    "updatedAt": "2026-06-29T12:00:00.000Z"
  }
}
```

| Status | Condition |
|--------|-----------|
| `200` | Page found and accessible (public, or authed) |
| `400` | Invalid slug |
| `404` | Page not found, or private/protected page without auth |

### Create or update page

```
POST /api/pages/:slug
Content-Type: application/json
Authorization: Bearer <api-key>
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | Full page body (markdown) |

The page title is always derived from the slug's last segment (rendered as the H1). Do not include a `#` heading in `content`.

Response `200`:
```json
{ "path": "", "slug": "my-page", "title": "my-page", "public": true, "updatedAt": "2026-07-02T12:00:00.000Z" }
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

All fields are optional; include only the ones you want to change. The title is always the slug's last segment.

Response `200`:
```json
{ "path": "docs", "slug": "docs/new-name", "title": "new-name", "public": true, "updatedAt": "2026-06-30T12:00:00.000Z" }
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

Deletes the page directory and all contents (including attachments).

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
    { "path": "", "slug": "home", "title": "home", "snippet": "Welcome to the <mark>wiki</mark>" }
  ]
}
```

- Returns empty results if `q` is missing.
- Unauthenticated requests only search public pages (private and protected excluded).
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
      "name": "home",
      "slug": "home",
      "title": "home",
      "public": true,
      "children": [
        {
          "path": "docs",
          "name": "api",
          "slug": "docs/api",
          "title": "api",
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
| `path` | string | Parent directory path (empty string for root-level) |
| `name` | string | Last segment of the slug |
| `slug` | string\|undefined | Full page slug (present when directory has an `index.md`) |
| `title` | string\|undefined | Page title (present when slug exists) |
| `public` | boolean\|undefined | Visibility flag (present for pages only) |
| `children` | array | Child nodes |

Unauthenticated requests only include public pages. Private/protected pages and their children are excluded. Directories without pages still appear as structural nodes (without `slug`/`title`/`public`).

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
  "path": "tech/web",
  "slug": "tech/web/HTTP",
  "size": 12345
}
```

- Files are stored inside the page directory: `data/pages/<slug>/<original>`.
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
GET /api/upload/by-slug/:slug — uploads for a specific page
```

Response `200`:
```json
{
  "files": [
    { "url": "/pages/home/photo.jpg", "filename": "home/photo.jpg", "original": "photo.jpg", "ext": "jpg", "path": "", "slug": "home", "size": 12345 }
  ]
}
```

Unauthenticated requests get an empty file list for private/protected pages.

### Download file

Files are served at:

```
GET /pages/<slug>/<filename>
```

Public pages: accessible without auth. Private and protected pages: auth required (404 without auth).

### Delete upload

```
DELETE /api/upload/:filename
Authorization: Bearer <api-key>
```

`filename` is `<slug>/<original>` (e.g. `home/photo.jpg`).

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
- The home page slug is configurable in Settings (default: `home`), served at `/`
- Renaming a slug does not create redirects; the old slug returns 404