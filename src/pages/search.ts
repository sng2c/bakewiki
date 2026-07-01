import path from "node:path";
import fs from "node:fs/promises";
import { pagesDir } from "../data.js";
import { parseDocument, extractTitle, readMeta } from "./frontmatter.js";

// ── 인메모리 검색 인덱스 ──
// 서버 시작 시 빌드, 페이지 CRUD 시 갱신.

export type SearchResult = {
	slug: string;
	path: string;
	title: string;
	snippet: string;
};

type IndexEntry = {
	title: string;
	content: string;
	isPublic: boolean;
	updatedAt: string;
};

const index = new Map<string, IndexEntry>();

// ── 인덱스 빌드 (서버 시작 시 1회) ──
export async function buildSearchIndex(dataDir: string): Promise<void> {
	index.clear();
	const root = pagesDir(dataDir);
	// 모든 페이지는 pages/<slug>/index.md 형태로 저장 (index도 pages/index/)
	await walkAndIndex(root, root);
}

// 디렉토리 순회: 하위 디렉토리의 index.md가 있으면 페이지로 인식.
async function walkAndIndex(root: string, dir: string): Promise<void> {
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const full = path.join(dir, entry.name);
		// 이 하위 디렉토리를 페이지로 인식 시도
		const subSlug = path.relative(root, full).replace(/\\/g, "/");
		const idxPath = path.join(full, "index.md");
		try {
			const stat = await fs.stat(idxPath);
			if (stat.isFile()) {
				const slug = subSlug;
				const content = await fs.readFile(idxPath, "utf-8");
				const meta = await readMeta(path.join(full, "meta.yml"));
				const doc = parseDocument(content);
				const title = meta.title ?? extractTitle(doc) ?? slug.split("/").pop()!;
				index.set(slug, { title, content: doc.body, isPublic: meta.public, updatedAt: meta.updatedAt });
			}
		} catch {
			// index.md 없음 — 페이지 아님
		}
		// 하위 디렉토리도 순회
		await walkAndIndex(root, full);
	}
}

// ── 인덱스 갱신 ──
export function upsertSearchIndex(slug: string, title: string, content: string, isPublic: boolean, updatedAt: string): void {
	index.set(slug, { title, content, isPublic, updatedAt });
}

export function removeFromSearchIndex(slug: string): void {
	index.delete(slug);
}

// 하위 페이지 slug까지 함께 갱신 (rename 시 사용)
export function renameSearchIndexPrefix(oldSlug: string, newSlug: string): void {
	const toRename: Array<{ oldKey: string; newKey: string; entry: IndexEntry }> = [];
	for (const [slug, entry] of index) {
		if (slug === oldSlug || slug.startsWith(oldSlug + "/")) {
			const newKey = slug === oldSlug ? newSlug : newSlug + slug.slice(oldSlug.length);
			toRename.push({ oldKey: slug, newKey, entry });
		}
	}
	for (const { oldKey, newKey, entry } of toRename) {
		index.delete(oldKey);
		index.set(newKey, entry);
	}
}

// ── 상속 private 여부 확인 ──
// 페이지 자체가 private → "private"
// 상위 문서 중 하나가 private → "inherited_private"
// 모두 public → "public"
export function effectiveVisibility(
	slug: string,
	isPublic: boolean,
	pageMap: Map<string, { isPublic: boolean }>,
): "public" | "private" | "inherited_private" {
	if (!isPublic) return "private";
	const parts = slug.split("/");
	for (let i = 1; i < parts.length; i++) {
		const ancestorSlug = parts.slice(0, i).join("/");
		const ancestor = pageMap.get(ancestorSlug);
		if (ancestor && !ancestor.isPublic) {
			return "inherited_private";
		}
	}
	return "public";
}

// ── 페이지 인덱스를 Map으로 반환 (상속 private 확인용) ──
export function getPageMap(): Map<string, { isPublic: boolean }> {
	const map = new Map<string, { isPublic: boolean }>();
	for (const [slug, entry] of index) {
		map.set(slug, { isPublic: entry.isPublic });
	}
	return map;
}

// ── 검색 ──
export function searchPages(query: string, includePrivate = false): SearchResult[] {
	const lower = query.toLowerCase();
	const pageMap = includePrivate ? null : getPageMap();
	const results: Array<{ slug: string; path: string; title: string; snippet: string; rank: number }> = [];
	for (const [slug, entry] of index) {
		if (!includePrivate && !entry.isPublic) continue;
		// 비인증 시 상속 private도 제외
		if (!includePrivate && pageMap) {
			const vis = effectiveVisibility(slug, entry.isPublic, pageMap);
			if (vis !== "public") continue;
		}
		const titleMatch = entry.title.toLowerCase().includes(lower);
		const contentLower = entry.content.toLowerCase();
		const contentMatch = contentLower.includes(lower);
		if (!titleMatch && !contentMatch) continue;

		// 스니펫: 검색어 주변 텍스트
		let snippet = "";
		const idx = contentLower.indexOf(lower);
		if (idx >= 0) {
			const start = Math.max(0, idx - 40);
			const end = Math.min(entry.content.length, idx + query.length + 40);
			snippet = (start > 0 ? "..." : "") + entry.content.slice(start, end) + (end < entry.content.length ? "..." : "");
			// 검색어 하이라이트
			const before = snippet.slice(0, snippet.toLowerCase().indexOf(lower, start > 0 ? 3 : 0));
			const match = snippet.slice(before.length, before.length + query.length);
			const after = snippet.slice(before.length + query.length);
			snippet = before + "<mark>" + match + "</mark>" + after;
		} else {
			snippet = entry.content.slice(0, 100);
		}

		const rank = titleMatch ? 2 : 1;
		const pathIdx = slug.lastIndexOf("/");
		results.push({ slug, path: pathIdx < 0 ? "" : slug.substring(0, pathIdx), title: entry.title, snippet, rank });
	}
	results.sort((a, b) => b.rank - a.rank);
	return results;
}

// ── 목록 (인덱스에서) ──
export type PageSummary = { slug: string; title: string; updatedAt: string; isPublic: boolean };

export function listPagesFromIndex(includePrivate = false): PageSummary[] {
	const results: PageSummary[] = [];
	const pageMap = includePrivate ? null : getPageMap();
	for (const [slug, entry] of index) {
		if (!includePrivate && !entry.isPublic) continue;
		// 비인증 시 상속 private도 제외
		if (!includePrivate && pageMap) {
			const vis = effectiveVisibility(slug, entry.isPublic, pageMap);
			if (vis !== "public") continue;
		}
		results.push({ slug, title: entry.title, updatedAt: entry.updatedAt, isPublic: entry.isPublic });
	}
	return results.sort((a, b) => a.slug.localeCompare(b.slug));
}