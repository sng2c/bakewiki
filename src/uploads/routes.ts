import { Hono } from "hono";
import path from "node:path";
import fs from "node:fs/promises";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { requireAuth } from "../auth/middleware.js";
import { uploadsDir } from "../data.js";

// Upload domain. Flat storage with slug-prefixed original filenames.
// File: uploads/<slug-encoded>@@<original-filename>
//   - slug "tech/web/http" → "tech__web__http" (/ → __ to keep flat, no subdir)
//   - "@@" separates the slug prefix from the original filename (slug may contain "-")
//   - original filename preserved (collision = overwrite)
//   - new page (no slug yet) → "_" temporary bucket, moved to real slug on save (web/edit.ts)
// /uploads/* served publicly by serveStatic in app.ts.

const SEPARATOR = "@@";

// Encode slug for use as a filename prefix. "/" → "__", strip leading/trailing "/".
export function encodeSlugPrefix(slug: string): string {
	if (!slug) return "_";
	const trimmed = slug.replace(/^\/+|\/+$/g, "");
	if (!trimmed) return "_";
	return trimmed.replace(/\//g, "__");
}

// Decode a slug-prefixed filename back to its slug. Returns "" if no prefix or for "_" bucket.
export function decodeSlugPrefix(filename: string): string {
	const idx = filename.indexOf(SEPARATOR);
	if (idx <= 0) return "";
	const prefix = filename.slice(0, idx);
	if (prefix === "_") return "";
	return prefix.replace(/__/g, "/");
}

// Extract the original filename (after the separator) from a stored filename.
export function extractOriginal(filename: string): string {
	const idx = filename.indexOf(SEPARATOR);
	return idx >= 0 ? filename.slice(idx + SEPARATOR.length) : filename;
}

// Validate a stored filename: must contain the separator and forbid path traversal.
// Original part may contain most chars but not "/" or "\" or ".." segments.
function isValidStoredName(name: string | undefined): name is string {
	if (!name) return false;
	if (name.includes("/") || name.includes("\\")) return false;
	if (name.includes("..")) return false;
	const sepIdx = name.indexOf(SEPARATOR);
	if (sepIdx <= 0) return false; // must have non-empty prefix before separator
	return true;
}

// Extract extension from a filename (lowercase), or "" if none.
function extractExt(filename: string): string {
	const m = filename.match(/\.([a-z0-9]+)$/i);
	return m ? m[1].toLowerCase() : "";
}

// Sanitize an original filename: strip directory components, forbid traversal.
function sanitizeOriginal(name: string): string {
	// take basename only
	const base = path.basename(name);
	// collapse any remaining path-like chars defensively
	return base.replace(/[\\/]+/g, "");
}

export function uploadRoutes(): Hono<{ Variables: { store: Store; user: AuthUser | null } }> {
	const app = new Hono<{ Variables: { store: Store; user: AuthUser | null } }>();

	// Single file upload. Admin only. Any extension allowed. Collision = overwrite.
	// multipart/form-data: file (File), slug (string, optional — "_" for new pages)
	app.post("/", requireAuth, async (c) => {
		const body = await c.req.parseBody();
		const file = body.file;

		if (!(file instanceof File)) {
			return c.json({ error: "file is required" }, 400);
		}
		if (file.size === 0) {
			return c.json({ error: "Empty file" }, 400);
		}

		const slug = typeof body.slug === "string" ? body.slug.trim() : "";
		const original = sanitizeOriginal(file.name);
		if (!original || !original.includes(".") || original.indexOf(".") === 0) {
			return c.json({ error: "Filename must have a name and extension" }, 400);
		}

		const prefix = encodeSlugPrefix(slug);
		const filename = `${prefix}${SEPARATOR}${original}`;
		const store = c.get("store");
		const dir = uploadsDir(store.dataDir);
		await fs.mkdir(dir, { recursive: true });
		const fullPath = path.join(dir, filename);

		const buf = Buffer.from(await file.arrayBuffer());
		await fs.writeFile(fullPath, buf); // overwrite on collision

		const ext = extractExt(filename);
		const url = `/uploads/${filename}`;
		return c.json({ url, filename, ext, slug, size: file.size });
	});

	// All uploads list. Admin only. (editor.js loads on start for the _ session bucket)
	app.get("/", requireAuth, async (c) => {
		const store = c.get("store");
		const files = await listUploadsFor(store.dataDir, undefined);
		return c.json({ files });
	});

	// Uploads for a specific slug. Public-readable for the attachments section on read pages.
	// Returns only files whose slug prefix decodes to :slug.
	app.get("/by-slug/:slug{.+}", async (c) => {
		const slug = c.req.param("slug");
		const store = c.get("store");
		const files = await listUploadsFor(store.dataDir, slug);
		return c.json({ files });
	});

	// Delete. Admin only.
	app.delete("/:filename{.+}", requireAuth, async (c) => {
		const filename = c.req.param("filename");
		if (!isValidStoredName(filename)) {
			return c.json({ error: "Invalid filename" }, 400);
		}
		const store = c.get("store");
		const fullPath = path.join(uploadsDir(store.dataDir), filename);
		try {
			await fs.unlink(fullPath);
		} catch {
			return c.json({ error: "Not found" }, 404);
		}
		return c.json({ ok: true });
	});

	return app;
}

// List uploads, optionally filtered by decoded slug.
// Filters by visibility: if not authed, private pages' uploads are still listed (uploads are public).
async function listUploadsFor(
	dataDir: string,
	slug: string | undefined,
): Promise<Array<{ url: string; filename: string; original: string; ext: string; slug: string; size: number }>> {
	const dir = uploadsDir(dataDir);
	let entries: string[];
	try {
		entries = await fs.readdir(dir);
	} catch {
		return [];
	}
	const targetPrefix = slug !== undefined ? encodeSlugPrefix(slug) : null;
	const files: Array<{ url: string; filename: string; original: string; ext: string; slug: string; size: number }> = [];
	for (const name of entries) {
		if (!isValidStoredName(name)) continue;
		const decodedSlug = decodeSlugPrefix(name);
		if (targetPrefix !== null) {
			const decodedPrefix = encodeSlugPrefix(decodedSlug);
			if (decodedPrefix !== targetPrefix) continue;
		}
		try {
			const stat = await fs.stat(path.join(dir, name));
			files.push({
				url: `/uploads/${name}`,
				filename: name,
				original: extractOriginal(name),
				ext: extractExt(name),
				slug: decodedSlug,
				size: stat.size,
			});
		} catch {
			// skip
		}
	}
	files.sort((a, b) => b.filename.localeCompare(a.filename));
	return files;
}
