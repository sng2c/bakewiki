import path from "node:path";
import fs from "node:fs/promises";
import { pagesDir } from "../data.js";
import { parseDocument, extractTitle, extractPublic } from "./frontmatter.js";

// ── 인메모리 검색 인덱스 ──
// 서버 시작 시 빌드, 페이지 CRUD 시 갱신.

export type SearchResult = {
	slug: string;
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
	await walkAndIndex(root, root);
}

async function walkAndIndex(root: string, dir: string): Promise<void> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await walkAndIndex(root, full);
		} else if (entry.isFile() && /\.md$/i.test(entry.name)) {
			const slug = path.relative(root, full).replace(/\.md$/i, "").replace(/\\/g, "/");
			try {
				const content = await fs.readFile(full, "utf-8");
				const stat = await fs.stat(full);
				const doc = parseDocument(content);
				const title = extractTitle(doc) ?? slug;
				const isPublic = extractPublic(doc);
				index.set(slug, { title, content, isPublic, updatedAt: stat.mtime.toISOString() });
			} catch {
				// 읽기 실패 시 스킵
			}
		}
	}
}

// ── 인덱스 갱신 ──
export function upsertSearchIndex(slug: string, title: string, content: string, isPublic: boolean, updatedAt: string): void {
	index.set(slug, { title, content, isPublic, updatedAt });
}

export function removeFromSearchIndex(slug: string): void {
	index.delete(slug);
}

// ── 검색 ──
export function searchPages(query: string, includePrivate = false): SearchResult[] {
	const lower = query.toLowerCase();
	const results: Array<{ slug: string; title: string; snippet: string; rank: number }> = [];
	for (const [slug, entry] of index) {
		if (!includePrivate && !entry.isPublic) continue;
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
		results.push({ slug, title: entry.title, snippet, rank });
	}
	results.sort((a, b) => b.rank - a.rank);
	return results;
}

// ── 목록 (인덱스에서) ──
export type PageSummary = { slug: string; title: string; updatedAt: string; isPublic: boolean };

export function listPagesFromIndex(includePrivate = false): PageSummary[] {
	const results: PageSummary[] = [];
	for (const [slug, entry] of index) {
		if (!includePrivate && !entry.isPublic) continue;
		results.push({ slug, title: entry.title, updatedAt: entry.updatedAt, isPublic: entry.isPublic });
	}
	return results.sort((a, b) => a.slug.localeCompare(b.slug));
}