import { Hono } from "hono";
import path from "node:path";
import fs from "node:fs/promises";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { effectiveVisibility, getPageMap } from "./search.js";
import { requireAuth } from "../auth/middleware.js";
import { pageDir } from "../data.js";

// Upload domain. Files are stored inside the page directory.
// File: pages/<slug>/<original-filename>
//   - slug "tech/web/http" → pages/tech/web/http/photo.jpg
//   - original filename preserved (collision = overwrite within same page)
//   - new page (no slug yet) → uploads/_/<original> (shared temp bucket, moved on save)
// API endpoints remain /api/upload/* for backward compatibility.
// File serving is via /pages/<slug>/<filename> URL pattern (handled in app.ts).

const TEMP_BUCKET = "_";

// 예약 파일명 (페이지 메타데이터)
const RESERVED_FILES = new Set(["index.md", "meta.yml"]);

// Slug → path relative to uploads root. Empty slug → temp bucket.
export function slugToUploadDir(slug: string): string {
	if (!slug) return TEMP_BUCKET;
	return slug.replace(/^\/+|\/+$/g, "");
}

// Reverse: path → slug. Temp bucket → "".
export function dirToSlug(dir: string): string {
	if (dir === TEMP_BUCKET) return "";
	return dir;
}

// Validate an original filename: no path separators, no "..", must have extension, not reserved.
function isValidOriginal(name: string): boolean {
	if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return false;
	if (RESERVED_FILES.has(name)) return false;
	if (!name.includes(".") || name.indexOf(".") === 0) return false;
	return true;
}

// Sanitize an original filename: strip directory components, forbid traversal.
function sanitizeOriginal(name: string): string {
	const base = path.basename(name);
	return base.replace(/[\\/]+/g, "");
}

// Extract extension from a filename (lowercase), or "" if none.
function extractExt(filename: string): string {
	const m = filename.match(/\.([a-z0-9]+)$/i);
	return m ? m[1].toLowerCase() : "";
}

// slug에서 부모 경로 추출
function parentPath(slug: string): string {
	const idx = slug.lastIndexOf("/");
	return idx < 0 ? "" : slug.substring(0, idx);
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

		const store = c.get("store");
		const dir = slug
			? pageDir(store.dataDir, slug)
			: path.join(store.dataDir, "uploads", TEMP_BUCKET);

		await fs.mkdir(dir, { recursive: true });
		const fullPath = path.join(dir, original);

		const buf = Buffer.from(await file.arrayBuffer());
		await fs.writeFile(fullPath, buf); // overwrite on collision

		const ext = extractExt(original);
		const slugDir = slugToUploadDir(slug);
		const url = slug ? `/pages/${slug}/${original}` : `/uploads/${TEMP_BUCKET}/${original}`;
		return c.json({ url, filename: `${slugDir}/${original}`, original, ext, path: parentPath(slug) || "", slug: slug || "", size: file.size });
	});

	// All uploads list. Admin only.
	app.get("/", requireAuth, async (c) => {
		const store = c.get("store");
		const files = await listUploadsFor(store.dataDir, undefined);
		return c.json({ files });
	});

	// Uploads for a specific slug. 비인증 시 public이고 상속 private가 아닌 페이지만.
	app.get("/by-slug/:slug{.+}", async (c) => {
		const slug = c.req.param("slug");
		const user = c.get("user");
		const store = c.get("store");

		// 비인증: 페이지가 존재하면 상속 private 검사
		if (!user) {
			const pageMap = getPageMap();
			const pageEntry = pageMap.get(slug);
			if (pageEntry) {
				const vis = effectiveVisibility(slug, pageEntry.isPublic, pageMap);
				if (vis !== "public") {
					return c.json({ files: [] });
				}
			}
		}

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
		if (!slugDir || !isValidOriginal(original)) {
			return c.json({ error: "Invalid filename" }, 400);
		}
		const store = c.get("store");
		// 파일은 페이지 디렉토리 내에 있음
		const dir = slugDir === TEMP_BUCKET
			? path.join(store.dataDir, "uploads", TEMP_BUCKET)
			: pageDir(store.dataDir, slugDir);
		const fullPath = path.join(dir, original);
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
	return `/pages/${slugDir}/${original}`;
}

type UploadEntry = { url: string; filename: string; original: string; ext: string; path: string; slug: string; size: number };

// List uploads, optionally filtered by slug.
async function listUploadsFor(
	dataDir: string,
	slug: string | undefined,
): Promise<UploadEntry[]> {
	const files: UploadEntry[] = [];

	if (slug !== undefined) {
		// List files in a specific page's directory
		const dir = pageDir(dataDir, slug);
		let entries: string[];
		try {
			entries = await fs.readdir(dir);
		} catch {
			return [];
		}
		for (const name of entries) {
			if (RESERVED_FILES.has(name)) continue;
			if (!isValidOriginal(name)) continue;
			try {
				const stat = await fs.stat(path.join(dir, name));
				files.push({
					url: `/pages/${slug}/${name}`,
					filename: `${slug}/${name}`,
					original: name,
					ext: extractExt(name),
					path: parentPath(slug),
					slug,
					size: stat.size,
				});
			} catch {
				// skip
			}
		}
	} else {
		// List all: walk page directories
		const pagesRoot = pagesDir(dataDir);
		await walkForUploads(pagesRoot, pagesRoot, files);

		// Also list temp bucket
		const tempDir = path.join(dataDir, "uploads", TEMP_BUCKET);
		let tempEntries: string[];
		try {
			tempEntries = await fs.readdir(tempDir);
		} catch {
			tempEntries = [];
		}
		for (const name of tempEntries) {
			if (RESERVED_FILES.has(name)) continue;
			if (!isValidOriginal(name)) continue;
			try {
				const stat = await fs.stat(path.join(tempDir, name));
				files.push({
					url: `/uploads/${TEMP_BUCKET}/${name}`,
					filename: `${TEMP_BUCKET}/${name}`,
					original: name,
					ext: extractExt(name),
					path: "",
					slug: "",
					size: stat.size,
				});
			} catch {
				// skip
			}
		}
	}
	files.sort((a, b) => b.filename.localeCompare(a.filename));
	return files;
}

// 페이지 디렉토리를 순회하며 첨부 파일(예약 파일 제외)을 수집.
async function walkForUploads(
	pagesRoot: string,
	dir: string,
	files: UploadEntry[],
): Promise<void> {
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const full = path.join(dir, entry.name);
		const idxPath = path.join(full, "index.md");
		let isPage = false;
		try {
			const stat = await fs.stat(idxPath);
			isPage = stat.isFile();
		} catch {
			// index.md 없음 — 페이지 아님
		}

		if (isPage) {
			const slug = path.relative(pagesRoot, full).replace(/\\/g, "/");
			// 이 페이지의 첨부 파일 수집
			let pageEntries: string[];
			try {
				pageEntries = await fs.readdir(full);
			} catch {
				pageEntries = [];
			}
			for (const name of pageEntries) {
				if (RESERVED_FILES.has(name)) continue;
				if (!isValidOriginal(name)) continue;
				try {
					const stat = await fs.stat(path.join(full, name));
					files.push({
						url: `/pages/${slug}/${name}`,
						filename: `${slug}/${name}`,
						original: name,
						ext: extractExt(name),
						path: parentPath(slug),
						slug,
						size: stat.size,
					});
				} catch {
					// skip
				}
			}
		}

		// 하위 디렉토리도 순회
		await walkForUploads(pagesRoot, full, files);
	}
}

// pagesDir 임포트 (walkForUploads에서 사용)
import { pagesDir } from "../data.js";