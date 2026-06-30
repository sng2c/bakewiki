import { Hono } from "hono";
import path from "node:path";
import fs from "node:fs/promises";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { requireAuth } from "../auth/middleware.js";
import { uploadsDir } from "../data.js";

// Upload domain. Directory-based storage: one folder per slug.
// File: uploads/<slug>/<original-filename>
//   - slug "tech/web/http" → uploads/tech/web/http/photo.jpg (nested dirs mirror page hierarchy)
//   - original filename preserved (collision = overwrite within same slug)
//   - new page (no slug yet) → uploads/_/<original> (shared temp bucket, moved on save)
// /uploads/* served publicly by serveStatic in app.ts.
// Content uses @@<original> marker, resolved to /uploads/<slug>/<original> at render time.

const TEMP_BUCKET = "_";

// Slug → directory path relative to uploads root. Empty slug → temp bucket.
export function slugToUploadDir(slug: string): string {
	if (!slug) return TEMP_BUCKET;
	return slug.replace(/^\/+|\/+$/g, "");
}

// Reverse: directory path → slug. Temp bucket → "".
export function dirToSlug(dir: string): string {
	if (dir === TEMP_BUCKET) return "";
	return dir;
}

// Validate a slug for use as a directory path: forbid "..", "\", leading/trailing "/".
function isValidSlugDir(slugDir: string | undefined): slugDir is string {
	if (!slugDir) return false;
	if (slugDir.includes("..") || slugDir.includes("\\")) return false;
	if (slugDir.startsWith("/") || slugDir.endsWith("/")) return false;
	return true;
}

// Extract extension from a filename (lowercase), or "" if none.
function extractExt(filename: string): string {
	const m = filename.match(/\.([a-z0-9]+)$/i);
	return m ? m[1].toLowerCase() : "";
}

// Sanitize an original filename: strip directory components, forbid traversal.
function sanitizeOriginal(name: string): string {
	const base = path.basename(name);
	return base.replace(/[\\/]+/g, "");
}

// Validate an original filename: no path separators, no "..", must have extension.
function isValidOriginal(name: string): boolean {
	if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return false;
	if (!name.includes(".") || name.indexOf(".") === 0) return false;
	return true;
}

export function uploadRoutes(): Hono<{ Variables: { store: Store; user: AuthUser | null } }> {
	const app = new Hono<{ Variables: { store: Store; user: AuthUser | null } }>();

	// Single file upload. Admin only. Any extension allowed. Collision = overwrite.
	// multipart/form-data: file (File), slug (string, optional — temp bucket for new pages)
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
		if (!isValidOriginal(original)) {
			return c.json({ error: "Filename must have a name and extension" }, 400);
		}

		const slugDir = slugToUploadDir(slug);
		const store = c.get("store");
		const dir = path.join(uploadsDir(store.dataDir), slugDir);
		await fs.mkdir(dir, { recursive: true });
		const fullPath = path.join(dir, original);

		const buf = Buffer.from(await file.arrayBuffer());
		await fs.writeFile(fullPath, buf); // overwrite on collision

		const ext = extractExt(original);
		const url = `/uploads/${slugDir}/${original}`;
		return c.json({ url, filename: `${slugDir}/${original}`, original, ext, slug, size: file.size });
	});

	// All uploads list. Admin only.
	app.get("/", requireAuth, async (c) => {
		const store = c.get("store");
		const files = await listUploadsFor(store.dataDir, undefined);
		return c.json({ files });
	});

	// Uploads for a specific slug. Public-readable for the attachments section on read pages.
	app.get("/by-slug/:slug{.+}", async (c) => {
		const slug = c.req.param("slug");
		const store = c.get("store");
		const files = await listUploadsFor(store.dataDir, slug);
		return c.json({ files });
	});

	// Delete. Admin only. filename is <slugDir>/<original>.
	app.delete("/:filename{.+}", requireAuth, async (c) => {
		const filename = c.req.param("filename");
		// Validate: split into dir + original, both must be valid
		const lastSlash = filename ? filename.lastIndexOf("/") : -1;
		if (lastSlash < 0) {
			return c.json({ error: "Invalid filename" }, 400);
		}
		const slugDir = filename!.slice(0, lastSlash);
		const original = filename!.slice(lastSlash + 1);
		if (!isValidSlugDir(slugDir) || !isValidOriginal(original)) {
			return c.json({ error: "Invalid filename" }, 400);
		}
		const store = c.get("store");
		const fullPath = path.join(uploadsDir(store.dataDir), slugDir, original);
		try {
			await fs.unlink(fullPath);
		} catch {
			return c.json({ error: "Not found" }, 404);
		}
		return c.json({ ok: true });
	});

	return app;
}

// Build the full file URL from slug + original.
export function buildUploadUrl(slug: string, original: string): string {
	const slugDir = slugToUploadDir(slug);
	return `/uploads/${slugDir}/${original}`;
}

// List uploads, optionally filtered by slug.
async function listUploadsFor(
	dataDir: string,
	slug: string | undefined,
): Promise<Array<{ url: string; filename: string; original: string; ext: string; slug: string; size: number }>> {
	const uploadsRoot = uploadsDir(dataDir);
	const files: Array<{ url: string; filename: string; original: string; ext: string; slug: string; size: number }> = [];

	if (slug !== undefined) {
		// List files in a specific slug's directory
		const slugDir = slugToUploadDir(slug);
		const dir = path.join(uploadsRoot, slugDir);
		let entries: string[];
		try {
			entries = await fs.readdir(dir);
		} catch {
			return [];
		}
		for (const name of entries) {
			if (!isValidOriginal(name)) continue;
			try {
				const stat = await fs.stat(path.join(dir, name));
				files.push({
					url: `/uploads/${slugDir}/${name}`,
					filename: `${slugDir}/${name}`,
					original: name,
					ext: extractExt(name),
					slug,
					size: stat.size,
				});
			} catch {
				// skip
			}
		}
	} else {
		// List all: walk subdirectories
		let topEntries: import("node:fs").Dirent[];
		try {
			topEntries = await fs.readdir(uploadsRoot, { withFileTypes: true });
		} catch {
			return [];
		}
		for (const entry of topEntries) {
			if (!entry.isDirectory()) continue;
			const slugDir = entry.name;
			if (!isValidSlugDir(slugDir)) continue;
			const decodedSlug = dirToSlug(slugDir);
			const dir = path.join(uploadsRoot, slugDir);
			let entries: string[];
			try {
				entries = await fs.readdir(dir);
			} catch {
				continue;
			}
			for (const name of entries) {
				if (!isValidOriginal(name)) continue;
				try {
					const stat = await fs.stat(path.join(dir, name));
					files.push({
						url: `/uploads/${slugDir}/${name}`,
						filename: `${slugDir}/${name}`,
						original: name,
						ext: extractExt(name),
						slug: decodedSlug,
						size: stat.size,
					});
				} catch {
					// skip
				}
			}
		}
	}
	files.sort((a, b) => b.filename.localeCompare(a.filename));
	return files;
}